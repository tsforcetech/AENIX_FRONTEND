import { nextDocNumber, seqOf } from '@/domain/numbering';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { daysBetween, invoiceTotals } from '@/domain/calc';
import { customerBalance } from '@/domain/balances';
import type { Collection, Customer, Invoice, InvoiceLine, SalesOrder, WorkOrderStatus } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { ACCOUNTS, postJournal } from '@/features/accounting/ledger';

/**
 * Invoices data source. PROTOTYPE ADAPTER — replace `invoicesApi` bodies with the generated
 * OpenAPI client once the Billing (Phase 7) contract is published. Totals here are display
 * maths only; the backend is the calculation authority.
 */
export interface InvoiceRow extends Invoice {
  customerName: string;
  subtotal: number;
  vat: number;
  total: number;
  outstanding: number;
  daysOverdue: number;
  sourceLabel: string;
  sourceType: 'Job' | 'Storage' | 'Manual' | 'Sales orders';
  /** Sales orders billed by this invoice (one invoice may bill several). */
  salesOrders: { id: string; number: string }[];
}

export interface InvoiceDetail extends InvoiceRow {
  customer: Pick<
    Customer,
    | 'id'
    | 'name'
    | 'code'
    | 'city'
    | 'country'
    | 'trnMasked'
    | 'contactName'
    | 'contactEmail'
    | 'contactPhone'
    | 'postalAddress'
    | 'paymentTermsDays'
  >;
  payments: (Pick<Collection, 'id' | 'number' | 'date' | 'method' | 'reference'> & { amount: number })[];
}

export interface InvoiceKpis {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  dueNext7: number;
  collectedMonth: number;
}

export const OPEN_STATUSES: Invoice['status'][] = ['Posted', 'Partially paid', 'Overdue'];

function toRow(inv: Invoice): InvoiceRow {
  const t = invoiceTotals(inv);
  const db = protoDb.get();
  const wo = inv.workOrderId ? db.workOrders.find((w) => w.id === inv.workOrderId) : undefined;
  const run = inv.storageRunId ? db.storageRuns.find((r) => r.id === inv.storageRunId) : undefined;
  const soIds = [
    ...new Set([
      ...(inv.salesOrderIds ?? []),
      ...inv.lines.flatMap((l) => (l.salesOrderId ? [l.salesOrderId] : [])),
    ]),
  ];
  const salesOrders = soIds.map((id) => ({
    id,
    number: db.salesOrders.find((x) => x.id === id)?.number ?? id,
  }));
  return {
    ...inv,
    customerName: lookupName.customer(inv.customerId),
    ...t,
    daysOverdue: inv.status === 'Overdue' ? Math.max(0, daysBetween(inv.dueDate, PROTO_TODAY)) : 0,
    sourceLabel: wo
      ? wo.number
      : run
        ? run.number
        : salesOrders.length
          ? salesOrders.map((x) => x.number).join(', ')
          : 'Manual',
    sourceType: wo ? 'Job' : run ? 'Storage' : salesOrders.length ? 'Sales orders' : 'Manual',
    salesOrders,
  };
}

function statusAfterPayment(inv: Invoice, paid: number): Invoice['status'] {
  const { total } = invoiceTotals({ ...inv, paid });
  if (paid >= total - 0.005) return 'Paid';
  if (inv.dueDate < PROTO_TODAY) return 'Overdue';
  return paid > 0 ? 'Partially paid' : 'Posted';
}

export const invoicesApi = {
  list(params: ListParams): Promise<Page<InvoiceRow>> {
    const rows = [...protoDb.get().invoices].sort((a, b) => b.number.localeCompare(a.number)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.sourceLabel} ${r.salesOrders.map((x) => x.number).join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },
  kpis(): Promise<InvoiceKpis> {
    const db = protoDb.get();
    const open = db.invoices.filter((i) => OPEN_STATUSES.includes(i.status)).map(toRow);
    const in7 = new Date(Date.parse(PROTO_TODAY) + 7 * 86_400_000).toISOString().slice(0, 10);
    const overdue = open.filter((i) => i.status === 'Overdue');
    return latency({
      outstanding: open.reduce((s, i) => s + i.outstanding, 0),
      overdue: overdue.reduce((s, i) => s + i.outstanding, 0),
      overdueCount: overdue.length,
      dueNext7: open
        .filter((i) => i.status !== 'Overdue' && i.dueDate >= PROTO_TODAY && i.dueDate <= in7)
        .reduce((s, i) => s + i.outstanding, 0),
      collectedMonth: db.collections
        .filter(
          (c) =>
            c.date.startsWith(PROTO_TODAY.slice(0, 7)) &&
            (c.status === 'Allocated' || c.status === 'Unallocated'),
        )
        .reduce((s, c) => s + c.amount, 0),
    });
  },
  get(id: string): Promise<InvoiceDetail> {
    const db = protoDb.get();
    const inv = db.invoices.find((i) => i.id === id);
    const c = inv ? db.customers.find((x) => x.id === inv.customerId) : undefined;
    if (!inv || !c) return Promise.reject(new Error('Not found'));
    const payments = db.collections.flatMap((col) =>
      col.allocations
        .filter((a) => a.invoiceId === id)
        .map((a) => ({
          id: col.id,
          number: col.number,
          date: col.date,
          method: col.method,
          reference: col.reference,
          amount: a.amount,
        })),
    );
    return latency({
      ...toRow(inv),
      customer: {
        id: c.id,
        name: c.name,
        code: c.code,
        city: c.city,
        country: c.country,
        trnMasked: c.trnMasked,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        postalAddress: c.postalAddress,
        paymentTermsDays: c.paymentTermsDays,
      },
      payments,
    });
  },
  /** Sales orders of a customer that still have something to invoice (drafts count as billed). */
  invoiceableSalesOrders(customerId: string): Promise<InvoiceableSalesOrder[]> {
    return latency(invoiceableSalesOrders(customerId), 80);
  },
  /** One invoice can bill several sales orders of the same customer. */
  create(input: NewInvoiceInput): Promise<Invoice> {
    const db = protoDb.get();
    const lines = input.lines.filter((l) => l.quantity > 0);
    if (!lines.length) return Promise.reject(new Error('Select at least one line to invoice'));
    const soIds = [...new Set(lines.map((l) => l.salesOrderId))];
    const sos = soIds.map((id) => db.salesOrders.find((x) => x.id === id));
    if (sos.some((x) => !x || x.customerId !== input.customerId))
      return Promise.reject(new Error('All sales orders must belong to the selected customer'));
    const jobs = db.workOrders.filter((w) => w.salesOrderId && soIds.includes(w.salesOrderId));
    const inv: Invoice = {
      id: newId('inv'),
      number: nextDocNumber(
        db.invoices.map((i) => i.number),
        db.company.invoicePrefix,
      ),
      customerId: input.customerId,
      workOrderId: jobs.length === 1 ? jobs[0]!.id : undefined,
      salesOrderIds: soIds,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      lines: lines.map((l): InvoiceLine => ({
        id: newId('il'),
        salesOrderId: l.salesOrderId,
        uom: l.uom,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: 0.05,
      })),
      paid: 0,
      status: 'Draft',
    };
    protoDb.update((s) => ({
      ...s,
      invoices: [inv, ...s.invoices],
      workOrders: s.workOrders.map((w) =>
        w.id === inv.workOrderId && !w.invoiceId ? { ...w, invoiceId: inv.id } : w,
      ),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: inv.id,
      entityRef: inv.number,
      action: `drafted an invoice for ${sos.map((x) => x!.number).join(', ')}`,
    });
    return latency(inv, 250);
  },
  /** Draft → Posted: the invoice becomes read-only and posts AR / revenue / VAT. */
  post(id: string): Promise<void> {
    const inv = protoDb.get().invoices.find((i) => i.id === id);
    if (!inv || inv.status !== 'Draft') return Promise.reject(new Error('Only draft invoices can be posted'));
    const t = invoiceTotals(inv);
    protoDb.update((s) => ({
      ...s,
      invoices: s.invoices.map((i) =>
        i.id === id ? { ...i, status: 'Posted' as const, issueDate: PROTO_TODAY } : i,
      ),
    }));
    postJournal({
      date: PROTO_TODAY,
      source: inv.storageRunId ? 'Storage billing' : 'Invoice',
      reference: inv.number,
      memo: `Customer invoice ${inv.number}`,
      lines: [
        { account: ACCOUNTS.ar, debit: t.total, credit: 0 },
        {
          account: inv.storageRunId ? ACCOUNTS.storageRevenue : ACCOUNTS.freightRevenue,
          debit: 0,
          credit: t.subtotal,
        },
        { account: ACCOUNTS.vatOut, debit: 0, credit: t.vat },
      ],
    });
    logActivity({ entity: 'Invoice', entityId: id, entityRef: inv.number, action: 'posted the invoice' });
    return latency(undefined, 300);
  },
  deleteDraft(id: string): Promise<void> {
    const inv = protoDb.get().invoices.find((i) => i.id === id);
    if (!inv || inv.status !== 'Draft') return Promise.reject(new Error('Only drafts can be deleted'));
    protoDb.update((s) => ({
      ...s,
      invoices: s.invoices.filter((i) => i.id !== id),
      workOrders: s.workOrders.map((w) => (w.invoiceId === id ? { ...w, invoiceId: undefined } : w)),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: id,
      entityRef: inv.number,
      action: 'deleted the draft invoice',
    });
    return latency(undefined, 250);
  },
  /** Credit note for the open balance. The posted invoice itself is never edited. */
  creditNote(id: string, reason: string): Promise<string> {
    const inv = protoDb.get().invoices.find((i) => i.id === id);
    if (!inv || !OPEN_STATUSES.includes(inv.status))
      return Promise.reject(new Error('Only open posted invoices can be credited'));
    const { outstanding } = invoiceTotals(inv);
    const net = Math.round((outstanding / 1.05) * 100) / 100;
    const vat = Math.round((outstanding - net) * 100) / 100;
    const cnNo = `CN${String(seqOf(inv.number)).padStart(3, '0')}`;
    postJournal({
      date: PROTO_TODAY,
      source: 'Manual',
      reference: cnNo,
      memo: `Credit note against ${inv.number} — ${reason}`,
      lines: [
        {
          account: inv.storageRunId ? ACCOUNTS.storageRevenue : ACCOUNTS.freightRevenue,
          debit: net,
          credit: 0,
        },
        { account: ACCOUNTS.vatOut, debit: vat, credit: 0 },
        { account: ACCOUNTS.ar, debit: 0, credit: outstanding },
      ],
    });
    // Nothing paid → fully credited (Cancelled). Part-paid → remaining balance credited, closes as Paid.
    protoDb.update((s) => ({
      ...s,
      invoices: s.invoices.map((i) =>
        i.id === id ? { ...i, status: inv.paid > 0 ? ('Paid' as const) : ('Cancelled' as const) } : i,
      ),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: id,
      entityRef: inv.number,
      action: `issued credit note ${cnNo}`,
    });
    return latency(cnNo, 300);
  },
};

/** Used by Collections when cash is allocated to an invoice. */
export function applyPaymentToInvoice(invoiceId: string, amount: number): void {
  protoDb.update((s) => ({
    ...s,
    invoices: s.invoices.map((i) => {
      if (i.id !== invoiceId) return i;
      const paid = Math.round((i.paid + amount) * 100) / 100;
      return { ...i, paid, status: statusAfterPayment(i, paid) };
    }),
  }));
}

export function openInvoicesForCustomer(customerId: string): InvoiceRow[] {
  return protoDb
    .get()
    .invoices.filter((i) => i.customerId === customerId && OPEN_STATUSES.includes(i.status))
    .map(toRow)
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface InvoiceableLine {
  key: string;
  salesOrderId: string;
  description: string;
  unit: string;
  unitPrice: number;
  /** Quantity still to bill (order quantity minus what earlier invoices already billed). */
  quantity: number;
}

export interface InvoiceableSalesOrder {
  id: string;
  number: string;
  customerPoRef: string;
  status: SalesOrder['status'];
  orderDate: string;
  orderValue: number;
  invoiced: number;
  notInvoiced: number;
  jobs: { id: string; number: string; status: WorkOrderStatus }[];
  lines: InvoiceableLine[];
}

export interface NewInvoiceInput {
  customerId: string;
  issueDate: string;
  dueDate: string;
  lines: { salesOrderId: string; description: string; quantity: number; unitPrice: number; uom?: string }[];
}

/**
 * Remaining billable lines per sales order. Every non-cancelled invoice (drafts included) counts,
 * so a line is never billed twice. Matching is by sales order + description (prototype rule).
 */
export function invoiceableSalesOrders(customerId: string): InvoiceableSalesOrder[] {
  const db = protoDb.get();
  const balance = customerBalance(customerId, db);
  const billedQty = new Map<string, number>();
  for (const inv of db.invoices) {
    if (inv.customerId !== customerId || inv.status === 'Cancelled') continue;
    for (const l of inv.lines) {
      const soId = l.salesOrderId ?? (inv.salesOrderIds?.length === 1 ? inv.salesOrderIds[0] : undefined);
      if (!soId) continue;
      const k = `${soId}|${l.description}`;
      billedQty.set(k, (billedQty.get(k) ?? 0) + l.quantity);
    }
  }
  return db.salesOrders
    .filter((so) => so.customerId === customerId && so.status !== 'Cancelled' && so.status !== 'Draft')
    .map((so) => {
      const lines = so.lines
        .map((l) => {
          const k = `${so.id}|${l.description}`;
          const left = Math.max(0, l.quantity - (billedQty.get(k) ?? 0));
          billedQty.set(k, Math.max(0, (billedQty.get(k) ?? 0) - l.quantity));
          return {
            key: `${so.id}|${l.id}`,
            salesOrderId: so.id,
            description: l.description,
            unit: l.unit,
            unitPrice: l.unitPrice,
            quantity: left,
          };
        })
        .filter((l) => l.quantity > 0);
      const b = balance.salesOrders.find((x) => x.salesOrderId === so.id);
      return {
        id: so.id,
        number: so.number,
        customerPoRef: so.customerPoRef,
        status: so.status,
        orderDate: so.orderDate,
        orderValue: b?.orderValue ?? 0,
        invoiced: b?.invoiced ?? 0,
        notInvoiced: Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice * 1.05, 0) * 100) / 100,
        jobs: db.workOrders
          .filter((w) => w.salesOrderId === so.id)
          .map((w) => ({ id: w.id, number: w.number, status: w.status })),
        lines,
      };
    })
    .filter((so) => so.lines.length > 0);
}

export function useInvoiceableSalesOrders(customerId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'invoiceable', customerId],
    queryFn: () => invoicesApi.invoiceableSalesOrders(customerId!),
    enabled: !!customerId,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, post }: { input: NewInvoiceInput; post: boolean }) => {
      const inv = await invoicesApi.create(input);
      if (post) await invoicesApi.post(inv.id);
      return inv;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function invalidateFinance(qc: QueryClient) {
  for (const key of [
    'invoices',
    'vendor-bills',
    'collections',
    'payments',
    'purchase-orders',
    'accounting',
    'home',
  ])
    void qc.invalidateQueries({ queryKey: [key] });
}

export function useInvoices(params: ListParams) {
  return useQuery({
    queryKey: ['invoices', 'list', params],
    queryFn: () => invoicesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useInvoiceKpis() {
  return useQuery({ queryKey: ['invoices', 'kpis'], queryFn: () => invoicesApi.kpis() });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: ['invoices', 'detail', id], queryFn: () => invoicesApi.get(id) });
}

export function usePostInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: invoicesApi.post, onSuccess: () => invalidateFinance(qc) });
}

export function useDeleteDraftInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: invoicesApi.deleteDraft, onSuccess: () => invalidateFinance(qc) });
}

export function useCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => invoicesApi.creditNote(id, reason),
    onSuccess: () => invalidateFinance(qc),
  });
}
