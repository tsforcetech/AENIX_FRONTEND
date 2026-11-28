/**
 * FLOW-003 WP-A C5 — inputs for the shared `creditCheck` (src/domain/controls.ts).
 * Prototype display maths only; the backend is the authority.
 */
import type { CustomerBalance } from '@/domain/balances';
import { daysBetween, invoiceTotals } from '@/domain/calc';
import type { Invoice, IsoDate } from '@/domain/types';

const OPEN: Invoice['status'][] = ['Posted', 'Partially paid', 'Overdue'];

export interface CreditInputs {
  /** Net balance the customer owes now (AED, incl. VAT); advances do not create credit. */
  openBalance: number;
  /** Confirmed / in-progress sales orders not yet invoiced (AED, incl. VAT), except `excludeOrderId`. */
  uninvoicedOrders: number;
  /** Days past due of the oldest unpaid invoice (0 when none is overdue). */
  oldestOverdueDays: number;
}

export function creditInputs(input: {
  balance: Pick<CustomerBalance, 'balance' | 'salesOrders'>;
  invoices: readonly Invoice[];
  customerId: string;
  today: IsoDate;
  excludeOrderId?: string;
}): CreditInputs {
  const uninvoiced = input.balance.salesOrders
    .filter(
      (o) =>
        o.salesOrderId !== input.excludeOrderId && (o.status === 'Confirmed' || o.status === 'In progress'),
    )
    .reduce((s, o) => s + o.notInvoiced, 0);
  const oldestOverdueDays = input.invoices
    .filter(
      (i) =>
        i.customerId === input.customerId &&
        OPEN.includes(i.status) &&
        i.dueDate < input.today &&
        invoiceTotals(i).outstanding > 0.005,
    )
    .reduce((m, i) => Math.max(m, daysBetween(i.dueDate, input.today)), 0);
  return {
    openBalance: Math.max(0, input.balance.balance),
    uninvoicedOrders: Math.round(uninvoiced * 100) / 100,
    oldestOverdueDays,
  };
}
