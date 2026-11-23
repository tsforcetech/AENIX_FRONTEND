import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoiceTotals, workOrderFinancials } from '@/domain/calc';
import type { Customer } from '@/domain/types';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, newId, protoDb } from '@/prototype/store';
import { buildStatement, openInvoiceStats } from './statement';

/**
 * Customers data source. PROTOTYPE ADAPTER — swap the bodies of `customersApi` for the generated
 * OpenAPI client when the Masters (Phase 2) contract is published. Screens use the hooks only.
 */
export interface CustomerRow extends Customer {
  outstanding: number;
  creditUsedPct: number;
}

export interface CustomerInput {
  name: string;
  industry: string;
  city: string;
  country: string;
  trn: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  creditLimit: number;
  paymentTermsDays: number;
}

function toRow(c: Customer): CustomerRow {
  const { outstanding } = openInvoiceStats(protoDb.get().invoices.filter((i) => i.customerId === c.id));
  return {
    ...c,
    outstanding,
    creditUsedPct: c.creditLimit ? Math.min(100, Math.round((outstanding / c.creditLimit) * 100)) : 0,
  };
}

function maskTrn(trn: string) {
  const digits = trn.replace(/\D/g, '');
  return digits.length > 7 ? `${digits.slice(0, 4)}•••••••${digits.slice(-3)}` : '—';
}

export const customersApi = {
  list(params: ListParams): Promise<Page<CustomerRow>> {
    const rows = protoDb.get().customers.map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.code} ${r.name} ${r.industry} ${r.city} ${r.contactName}`,
        status: (r) => r.status,
      }),
    );
  },
  get(id: string) {
    const db = protoDb.get();
    const c = db.customers.find((x) => x.id === id);
    if (!c) return Promise.reject(new Error('Not found'));
    const invoices = db.invoices.filter((i) => i.customerId === id);
    const collections = db.collections.filter((x) => x.customerId === id);
    const workOrders = db.workOrders.filter((w) => w.customerId === id);
    const stats = openInvoiceStats(invoices);
    return latency({
      customer: toRow(c),
      kpis: {
        outstanding: stats.outstanding,
        overdue: stats.overdue,
        jobsThisYear: workOrders.filter((w) => w.createdAt.startsWith('2026')).length,
        revenue: invoices
          .filter((i) => i.status !== 'Draft' && i.status !== 'Cancelled')
          .reduce((s, i) => s + invoiceTotals(i).subtotal, 0),
      },
      enquiries: db.enquiries
        .filter((e) => e.customerId === id)
        .map((e) => ({
          id: e.id,
          number: e.number,
          route: `${e.origin} → ${e.destination}`,
          date: e.createdAt,
          status: e.status,
        })),
      quotations: db.quotations
        .filter((q) => q.customerId === id)
        .map((q) => ({
          id: q.id,
          number: q.number,
          version: q.version,
          route: `${q.origin} → ${q.destination}`,
          date: q.createdAt,
          status: q.status,
        })),
      workOrders: workOrders.map((w) => ({
        id: w.id,
        number: w.number,
        route: `${w.origin} → ${w.destination}`,
        date: w.createdAt,
        status: w.status,
        revenue: workOrderFinancials(w).revenue,
      })),
      statement: buildStatement(invoices, collections),
    });
  },
  create(input: CustomerInput): Promise<Customer> {
    const db = protoDb.get();
    const next = Math.max(...db.customers.map((c) => Number(c.code.split('-')[1]))) + 1;
    const customer: Customer = {
      id: newId('cus'),
      code: `CUS-${String(next).padStart(4, '0')}`,
      name: input.name,
      industry: input.industry,
      city: input.city,
      country: input.country,
      trnMasked: maskTrn(input.trn),
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      creditLimit: input.creditLimit,
      paymentTermsDays: input.paymentTermsDays,
      status: 'Active',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    protoDb.update((s) => ({ ...s, customers: [customer, ...s.customers] }));
    return latency(customer, 300);
  },
};

export type CustomerDetail = Awaited<ReturnType<typeof customersApi.get>>;

export function useCustomers(params: ListParams) {
  return useQuery({
    queryKey: ['customers', 'list', params],
    queryFn: () => customersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useCustomer(id: string) {
  return useQuery({ queryKey: ['customers', 'detail', id], queryFn: () => customersApi.get(id) });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['lookups', 'customers'] });
    },
  });
}
