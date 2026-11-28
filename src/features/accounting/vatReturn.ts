import { toAed } from '@/domain/controls';
import type { CreditNote, Customer, Emirate, Expense, Invoice, VendorBill } from '@/domain/types';

/**
 * A12 VAT return — UAE FTA Form 201 style DRAFT summary (prototype maths; the accountant files).
 * Supplies are classified per invoice line:
 *  - disbursement lines → out of scope (paid on the customer's behalf);
 *  - customer outside the UAE → zero-rated;
 *  - VAT charged → Box 1 standard-rated, by the emirate of the invoice / customer;
 *  - 0% VAT → zero-rated.
 * Box 9: standard-rated expenses = approved vendor bills + posted overhead expenses with VAT.
 */
export const EMIRATES: readonly Emirate[] = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
];

const CITY_HINTS: [RegExp, Emirate][] = [
  [/abu dhabi|al ain|mussafah|khalifa/i, 'Abu Dhabi'],
  [/sharjah|saif zone/i, 'Sharjah'],
  [/ajman/i, 'Ajman'],
  [/umm al quwain|uaq/i, 'Umm Al Quwain'],
  [/ras al khaimah|rak\b/i, 'Ras Al Khaimah'],
  [/fujairah/i, 'Fujairah'],
  [/dubai|jebel ali|jafza|deira|al quoz|dxb/i, 'Dubai'],
];

/** Emirate of a customer from its city; undefined = outside the UAE. */
export function emirateFor(c: Pick<Customer, 'city' | 'country'>): Emirate | undefined {
  const inUae = /^(uae|united arab emirates)$/i.test(c.country.trim());
  for (const [re, em] of CITY_HINTS) if (re.test(c.city)) return em;
  return inUae ? 'Dubai' : undefined;
}

export interface VatReturnInput {
  from: string;
  to: string;
  invoices: readonly Invoice[];
  customers: readonly Pick<Customer, 'id' | 'city' | 'country'>[];
  creditNotes: readonly CreditNote[];
  vendorBills: readonly VendorBill[];
  expenses: readonly Expense[];
}

export interface VatReturn {
  box1: { emirate: Emirate; amount: number; vat: number }[];
  standardTotal: { amount: number; vat: number };
  zeroRated: number;
  exempt: number;
  outOfScope: number;
  /** Output VAT reduced by credit notes in the period (included in box1). */
  creditNoteAdjustment: { amount: number; vat: number };
  box9: { amount: number; vat: number; bills: number; expenses: number };
  netVatDue: number;
  invoiceCount: number;
  warnings: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const POSTED: Invoice['status'][] = ['Posted', 'Partially paid', 'Paid', 'Overdue'];
const BILLS: VendorBill['status'][] = ['Approved', 'Partially paid', 'Paid', 'Overdue'];

export function computeVatReturn(input: VatReturnInput): VatReturn {
  const inRange = (d: string) => d >= input.from && d <= input.to;
  const box1 = new Map<Emirate, { amount: number; vat: number }>(
    EMIRATES.map((e) => [e, { amount: 0, vat: 0 }]),
  );
  let zeroRated = 0;
  let outOfScope = 0;
  const warnings: string[] = [];
  const invoices = input.invoices.filter((i) => POSTED.includes(i.status) && inRange(i.issueDate));
  const emirateOf = (inv: Invoice): Emirate | undefined => {
    if (inv.emirate) return inv.emirate;
    const c = input.customers.find((x) => x.id === inv.customerId);
    return c ? emirateFor(c) : 'Dubai';
  };
  for (const inv of invoices) {
    const em = emirateOf(inv);
    const aed = (n: number) => toAed(n, inv.currency ?? 'AED', inv.exchangeRate);
    for (const l of inv.lines) {
      const net = aed(l.quantity * l.unitPrice);
      const vat = aed(l.quantity * l.unitPrice * l.vatRate);
      if (l.isDisbursement) outOfScope += net;
      else if (!em) {
        zeroRated += net;
        if (vat > 0)
          warnings.push(`${inv.number}: VAT charged to a customer outside the UAE — accountant to review.`);
      } else if (l.vatRate > 0) {
        const b = box1.get(em)!;
        b.amount += net;
        b.vat += vat;
      } else zeroRated += net;
    }
  }
  const cnAdj = { amount: 0, vat: 0 };
  for (const cn of input.creditNotes) {
    if (!inRange(cn.date)) continue;
    const inv = input.invoices.find((i) => i.id === cn.invoiceId);
    const em = inv ? emirateOf(inv) : 'Dubai';
    const aed = (n: number) => (inv ? toAed(n, inv.currency ?? 'AED', inv.exchangeRate) : n);
    const net = aed(cn.amount);
    const vat = aed(cn.amount * cn.vatRate);
    if (em && cn.vatRate > 0) {
      const b = box1.get(em)!;
      b.amount -= net;
      b.vat -= vat;
      cnAdj.amount += net;
      cnAdj.vat += vat;
    } else zeroRated -= net;
  }
  const bills = input.vendorBills.filter((b) => BILLS.includes(b.status) && inRange(b.billDate) && b.vat > 0);
  const exps = input.expenses.filter((e) => e.status === 'Posted' && inRange(e.date) && e.vatRate > 0);
  const billAmount = bills.reduce((s, b) => s + b.amount, 0);
  const billVat = bills.reduce((s, b) => s + b.vat, 0);
  const expAmount = exps.reduce((s, e) => s + e.amount, 0);
  const expVat = exps.reduce((s, e) => s + e.amount * e.vatRate, 0);
  const rows = EMIRATES.map((e) => ({
    emirate: e,
    amount: r2(box1.get(e)!.amount),
    vat: r2(box1.get(e)!.vat),
  }));
  const standardTotal = {
    amount: r2(rows.reduce((s, r) => s + r.amount, 0)),
    vat: r2(rows.reduce((s, r) => s + r.vat, 0)),
  };
  const box9 = {
    amount: r2(billAmount + expAmount),
    vat: r2(billVat + expVat),
    bills: bills.length,
    expenses: exps.length,
  };
  return {
    box1: rows,
    standardTotal,
    zeroRated: r2(zeroRated),
    exempt: 0,
    outOfScope: r2(outOfScope),
    creditNoteAdjustment: { amount: r2(cnAdj.amount), vat: r2(cnAdj.vat) },
    box9,
    netVatDue: r2(standardTotal.vat - box9.vat),
    invoiceCount: invoices.length,
    warnings: [...new Set(warnings)],
  };
}

/** Calendar quarters of a year: Q1 = Jan–Mar … (the FTA may assign a different tax period). */
export function quarterRange(year: number, q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startMonth = (q - 1) * 3;
  const from = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10);
  return { from, to };
}
