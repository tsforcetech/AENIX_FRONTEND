import { billTotals, invoiceTotals, linesRevenue, VAT_RATE } from './calc';
import { toAed } from './controls';
import type { Collection, DebitNote, Invoice, SalesOrder, VendorBill } from './types';

/**
 * Customer balance — display maths for the prototype; the backend ledger is the authority.
 * All figures are in AED: invoices in another currency are converted with `toAed` (C10).
 *
 * Sign convention: positive = the customer owes us.
 *   An invoice's `paid` is everything that settled it: cash receipts, credit notes (`credited`, A2)
 *   and bad-debt write-offs (`writtenOff`, A16). Cash received = paid − credited − writtenOff.
 *   outstanding = Σ posted invoice totals − Σ settled
 *   advances    = Σ receipts held against sales orders (or unallocated), not yet applied to an invoice
 *   balance     = outstanding − advances  (net position)
 */
export interface SalesOrderBalance {
  salesOrderId: string;
  number: string;
  status: SalesOrder['status'];
  orderValue: number; // incl. VAT
  invoiced: number; // incl. VAT, posted invoices
  notInvoiced: number;
  received: number; // receipts applied via invoices + advances on this SO
  advance: number; // part of `received` held as advance (not yet applied to an invoice)
  balance: number; // invoiced − settled (what is currently due on this order)
}

export interface CustomerBalance {
  invoiced: number;
  received: number;
  /** Credit notes issued (incl. VAT). */
  credited: number;
  /** Bad debts written off. */
  writtenOff: number;
  outstanding: number;
  advances: number;
  unallocated: number;
  pdcPending: number;
  balance: number;
  notYetInvoiced: number;
  salesOrders: SalesOrderBalance[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const BILLED: Invoice['status'][] = ['Posted', 'Partially paid', 'Paid', 'Overdue'];

/** Converts an amount in the invoice's currency to AED. */
export function invoiceAed(inv: Pick<Invoice, 'currency' | 'exchangeRate'>, amount: number): number {
  return toAed(amount, inv.currency ?? 'AED', inv.exchangeRate);
}

/** Settlement split of one invoice, in the invoice currency. */
export function invoiceSettlement(inv: Pick<Invoice, 'lines' | 'paid' | 'credited' | 'writtenOff'>) {
  const { total, outstanding } = invoiceTotals(inv);
  const credited = r2(inv.credited ?? 0);
  const writtenOff = r2(inv.writtenOff ?? 0);
  return { total, credited, writtenOff, cash: r2(inv.paid - credited - writtenOff), outstanding };
}

export function customerBalance(
  customerId: string,
  data: { salesOrders: SalesOrder[]; invoices: Invoice[]; collections: Collection[] },
): CustomerBalance {
  const invoices = data.invoices.filter((i) => i.customerId === customerId && BILLED.includes(i.status));
  const collections = data.collections.filter((c) => c.customerId === customerId && c.status !== 'Bounced');
  const orders = data.salesOrders.filter((s) => s.customerId === customerId && s.status !== 'Cancelled');

  let invoiced = 0;
  let cash = 0;
  let credited = 0;
  let writtenOff = 0;
  for (const inv of invoices) {
    const s = invoiceSettlement(inv);
    invoiced += invoiceAed(inv, s.total);
    cash += invoiceAed(inv, s.cash);
    credited += invoiceAed(inv, s.credited);
    writtenOff += invoiceAed(inv, s.writtenOff);
  }
  const advances = r2(
    collections
      .filter((c) => c.status !== 'PDC pending')
      .flatMap((c) => c.allocations)
      .filter((a) => a.salesOrderId && !a.invoiceId)
      .reduce((s, a) => s + a.amount, 0),
  );
  const unallocated = r2(
    collections
      .filter((c) => c.status === 'Unallocated')
      .reduce((s, c) => s + c.amount - c.allocations.reduce((t, a) => t + a.amount, 0), 0),
  );
  const pdcPending = r2(
    collections.filter((c) => c.status === 'PDC pending').reduce((s, c) => s + c.amount, 0),
  );

  const salesOrders: SalesOrderBalance[] = orders.map((so) => {
    const orderValue = r2(
      toAed(linesRevenue(so.lines) * (1 + VAT_RATE), so.currency ?? 'AED', so.exchangeRate),
    );
    let soInvoiced = 0;
    let soSettled = 0;
    let soCash = 0;
    for (const inv of invoices) {
      const { total } = invoiceTotals(inv);
      if (total <= 0) continue;
      const soShare = inv.lines
        .filter(
          (l) =>
            l.salesOrderId === so.id ||
            (!l.salesOrderId && inv.salesOrderIds?.length === 1 && inv.salesOrderIds[0] === so.id),
        )
        .reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate), 0);
      if (soShare <= 0) continue;
      const ratio = soShare / total; // settlements apportioned to the orders an invoice bills
      soInvoiced += invoiceAed(inv, soShare);
      soSettled += invoiceAed(inv, inv.paid * ratio);
      soCash += invoiceAed(inv, invoiceSettlement(inv).cash * ratio);
    }
    const advance = r2(
      collections
        .filter((c) => c.status !== 'PDC pending')
        .flatMap((c) => c.allocations)
        .filter((a) => a.salesOrderId === so.id && !a.invoiceId)
        .reduce((s, a) => s + a.amount, 0),
    );
    return {
      salesOrderId: so.id,
      number: so.number,
      status: so.status,
      orderValue,
      invoiced: r2(soInvoiced),
      notInvoiced: r2(Math.max(0, orderValue - soInvoiced)),
      received: r2(soCash + advance),
      advance,
      balance: r2(soInvoiced - soSettled - advance),
    };
  });

  const outstanding = r2(invoiced - cash - credited - writtenOff);
  return {
    invoiced: r2(invoiced),
    received: r2(cash + advances + unallocated),
    credited: r2(credited),
    writtenOff: r2(writtenOff),
    outstanding,
    advances,
    unallocated,
    pdcPending,
    balance: r2(outstanding - advances - unallocated),
    notYetInvoiced: r2(salesOrders.reduce((s, o) => s + o.notInvoiced, 0)),
    salesOrders,
  };
}

/**
 * Vendor position (AED). A posted debit note (A10) set off against a bill is recorded in the bill's
 * `paid`, so `paid` = cash paid + debit notes; cash paid is shown separately.
 */
export interface VendorBalance {
  billed: number;
  paidCash: number;
  debitNotes: number;
  /** Posted debit notes not yet set off against a bill (reduce what we owe). */
  unappliedDebitNotes: number;
  outstanding: number;
}

const OPEN_BILL: VendorBill['status'][] = ['Approved', 'Partially paid', 'Paid', 'Overdue'];

export function debitNoteTotal(dn: Pick<DebitNote, 'amount' | 'vatRate'>): number {
  return r2(dn.amount * (1 + dn.vatRate));
}

export function vendorBalance(
  vendorId: string,
  data: { vendorBills: VendorBill[]; debitNotes: DebitNote[] },
): VendorBalance {
  const bills = data.vendorBills.filter((b) => b.vendorId === vendorId && OPEN_BILL.includes(b.status));
  const posted = data.debitNotes.filter((d) => d.vendorId === vendorId && d.status !== 'Draft');
  const applied = posted.filter((d) => d.vendorBillId && bills.some((b) => b.id === d.vendorBillId));
  const unapplied = posted.filter((d) => !applied.includes(d));
  const billed = r2(bills.reduce((s, b) => s + billTotals(b).total, 0));
  const paid = r2(bills.reduce((s, b) => s + b.paid, 0));
  const debitNotes = r2(applied.reduce((s, d) => s + debitNoteTotal(d), 0));
  const unappliedDebitNotes = r2(unapplied.reduce((s, d) => s + debitNoteTotal(d), 0));
  return {
    billed,
    paidCash: r2(paid - debitNotes),
    debitNotes,
    unappliedDebitNotes,
    outstanding: r2(billed - paid - unappliedDebitNotes),
  };
}
