import { linesRevenue } from '@/domain/calc';
import { toAed } from '@/domain/controls';
import type { AccrualRun, Invoice, PurchaseOrder, SalesOrder, WorkOrder } from '@/domain/types';

/**
 * A7 month-end accruals (prototype maths; posting rules pending accountant sign-off).
 * Unbilled revenue: confirmed / in-progress / completed sales orders, and jobs without a sales order
 * that are under way or done, whose value is not yet on a posted invoice dated by the period end.
 * Accrued cost: purchase orders the vendor accepted or completed with no vendor invoice yet.
 */
export type AccrualLine = AccrualRun['lines'][number];

const r2 = (n: number) => Math.round(n * 100) / 100;
const SO_OPEN: SalesOrder['status'][] = ['Confirmed', 'In progress', 'Completed'];
const JOB_WORKING: WorkOrder['status'][] = ['In progress', 'In transit', 'Delivered', 'Completed'];
const POSTED: Invoice['status'][] = ['Posted', 'Partially paid', 'Paid', 'Overdue'];

export function computeAccruals(input: {
  periodEnd: string;
  salesOrders: readonly SalesOrder[];
  workOrders: readonly WorkOrder[];
  invoices: readonly Invoice[];
  purchaseOrders: readonly PurchaseOrder[];
}): AccrualLine[] {
  const { periodEnd } = input;
  const invoices = input.invoices.filter((i) => POSTED.includes(i.status) && i.issueDate <= periodEnd);
  const lines: AccrualLine[] = [];

  for (const so of input.salesOrders) {
    if (!SO_OPEN.includes(so.status) || so.orderDate > periodEnd) continue;
    const value = toAed(linesRevenue(so.lines), so.currency ?? 'AED', so.exchangeRate);
    let billed = 0;
    for (const inv of invoices) {
      const net = inv.lines
        .filter(
          (l) =>
            l.salesOrderId === so.id ||
            (!l.salesOrderId && inv.salesOrderIds?.length === 1 && inv.salesOrderIds[0] === so.id),
        )
        .reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      billed += toAed(net, inv.currency ?? 'AED', inv.exchangeRate);
    }
    const amount = r2(value - billed);
    if (amount > 0.01) {
      const job = input.workOrders.find((w) => w.salesOrderId === so.id);
      lines.push({
        kind: 'Unbilled revenue',
        workOrderId: job?.id,
        reference: job ? `${so.number} · ${job.number}` : so.number,
        amount,
      });
    }
  }

  for (const wo of input.workOrders) {
    if (wo.salesOrderId || !JOB_WORKING.includes(wo.status) || wo.createdAt.slice(0, 10) > periodEnd)
      continue;
    if (wo.invoiceId && invoices.some((i) => i.id === wo.invoiceId)) continue;
    const amount = linesRevenue(wo.lines);
    if (amount > 0.01)
      lines.push({ kind: 'Unbilled revenue', workOrderId: wo.id, reference: wo.number, amount });
  }

  for (const po of input.purchaseOrders) {
    if (po.vendorBillId || !(po.status === 'Completed' || po.status === 'Accepted')) continue;
    if (po.issuedAt.slice(0, 10) > periodEnd || po.amount <= 0) continue;
    const job = input.workOrders.find((w) => w.id === po.workOrderId);
    lines.push({
      kind: 'Accrued cost',
      purchaseOrderId: po.id,
      workOrderId: po.workOrderId,
      reference: job ? `${po.number} · ${job.number}` : po.number,
      amount: r2(po.amount),
    });
  }
  return lines;
}

export function accrualTotals(lines: readonly AccrualLine[]) {
  const revenue = r2(lines.filter((l) => l.kind === 'Unbilled revenue').reduce((s, l) => s + l.amount, 0));
  const cost = r2(lines.filter((l) => l.kind === 'Accrued cost').reduce((s, l) => s + l.amount, 0));
  return { revenue, cost };
}

/** Last day of the month of `date` (YYYY-MM-DD). */
export function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Day after `date` (the reversal date of a month-end accrual). */
export function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
