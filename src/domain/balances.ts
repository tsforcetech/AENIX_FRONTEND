import { invoiceTotals, linesRevenue, VAT_RATE } from './calc';
import type { Collection, Invoice, SalesOrder } from './types';

/**
 * Customer balance — display maths for the prototype; the backend ledger is the authority.
 *
 * Sign convention: positive = the customer owes us.
 *   outstanding = Σ posted invoice totals − Σ amounts received against invoices
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
  balance: number; // invoiced − received (what is currently due on this order)
}

export interface CustomerBalance {
  invoiced: number;
  received: number;
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

export function customerBalance(
  customerId: string,
  data: { salesOrders: SalesOrder[]; invoices: Invoice[]; collections: Collection[] },
): CustomerBalance {
  const invoices = data.invoices.filter((i) => i.customerId === customerId && BILLED.includes(i.status));
  const collections = data.collections.filter((c) => c.customerId === customerId && c.status !== 'Bounced');
  const orders = data.salesOrders.filter((s) => s.customerId === customerId && s.status !== 'Cancelled');

  const invoiced = r2(invoices.reduce((s, i) => s + invoiceTotals(i).total, 0));
  const receivedOnInvoices = r2(invoices.reduce((s, i) => s + i.paid, 0));
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
    const orderValue = r2(linesRevenue(so.lines) * (1 + VAT_RATE));
    let soInvoiced = 0;
    let soReceived = 0;
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
      soInvoiced += soShare;
      soReceived += inv.paid * (soShare / total); // receipts apportioned to the orders an invoice bills
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
      received: r2(soReceived + advance),
      advance,
      balance: r2(soInvoiced - soReceived - advance),
    };
  });

  const outstanding = r2(invoiced - receivedOnInvoices);
  return {
    invoiced,
    received: r2(receivedOnInvoices + advances + unallocated),
    outstanding,
    advances,
    unallocated,
    pdcPending,
    balance: r2(outstanding - advances - unallocated),
    notYetInvoiced: r2(salesOrders.reduce((s, o) => s + o.notInvoiced, 0)),
    salesOrders,
  };
}
