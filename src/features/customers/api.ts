import { servicesLabel } from '@/domain/workflow';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoiceTotals, workOrderFinancials } from '@/domain/calc';
import { customerBalance } from '@/domain/balances';
import { creditCheck } from '@/domain/controls';
import { creditInputs } from '@/features/sales-orders/credit';
import { PROTO_TODAY } from '@/prototype/seed';
import type { Customer, LedgerAccount } from '@/domain/types';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { buildStatement, openInvoiceStats } from './statement';

/**
 * Customers data source. PROTOTYPE ADAPTER — swap the bodies of `customersApi` for the generated
 * OpenAPI client when the Masters (Phase 2) contract is published. Screens use the hooks only.
 */
export interface CustomerRow extends Customer {
  outstanding: number;
  netBalance: number;
  creditUsedPct: number;
  ledgerCode: string;
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

/** MASTERS M2: editable customer fields (TRN empty = keep the stored one). */
export interface CustomerEditInput {
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  postalAddress: string;
  trn: string;
  creditLimit: number;
  paymentTermsDays: number;
  status: Customer['status'];
  holdReason?: string;
}

function balanceOf(customerId: string) {
  const db = protoDb.get();
  return customerBalance(customerId, {
    salesOrders: db.salesOrders,
    invoices: db.invoices,
    collections: db.collections,
  });
}

function ledgerCodeOf(ledgerAccountId: string) {
  return protoDb.get().ledgerAccounts.find((a) => a.id === ledgerAccountId)?.code ?? '—';
}

function toRow(c: Customer): CustomerRow {
  const { outstanding } = openInvoiceStats(protoDb.get().invoices.filter((i) => i.customerId === c.id));
  return {
    ...c,
    outstanding,
    netBalance: balanceOf(c.id).balance,
    ledgerCode: ledgerCodeOf(c.ledgerAccountId),
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
          route: `${servicesLabel(e.serviceCategories, e.mode)} · ${e.destination ? `${e.origin} → ${e.destination}` : e.origin}`,
          date: e.createdAt,
          status: e.status,
        })),
      quotations: db.quotations
        .filter((q) => q.customerId === id)
        .map((q) => ({
          id: q.id,
          number: q.number,
          version: q.version,
          route: `${servicesLabel(q.serviceCategories, q.mode)} · ${q.destination ? `${q.origin} → ${q.destination}` : q.origin}`,
          date: q.createdAt,
          status: q.status,
        })),
      salesOrders: db.salesOrders
        .filter((o) => o.customerId === id)
        .map((o) => ({
          id: o.id,
          number: o.number,
          route: `${servicesLabel(o.serviceCategories, o.mode)} · PO ${o.customerPoRef}`,
          date: o.orderDate,
          status: o.status,
          value: o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
        })),
      workOrders: workOrders.map((w) => ({
        id: w.id,
        number: w.number,
        route: `${servicesLabel(w.serviceCategories, w.mode)} · ${w.destination ? `${w.origin} → ${w.destination}` : w.origin}`,
        date: w.createdAt,
        status: w.status,
        revenue: workOrderFinancials(w).revenue,
      })),
      statement: buildStatement(invoices, collections, db.salesOrders),
      statementDate: PROTO_TODAY,
      company: {
        legalName: db.company.legalName,
        officeAddress: db.company.officeAddress,
        trn: db.company.trn,
        phone: db.company.phone,
        email: db.company.email,
      },
      // MASTERS M2: the customer's own selling rates (read-only here; edited in Services › Selling rates).
      sellingRates: db.customerRates
        .filter((r) => r.customerId === id)
        .map((r) => ({
          ...r,
          serviceName: db.services.find((x) => x.id === r.serviceId)?.name ?? '—',
          status: (!r.active || r.validTo < PROTO_TODAY
            ? 'Expired'
            : r.validFrom > PROTO_TODAY
              ? 'Future'
              : 'Current') as 'Current' | 'Future' | 'Expired',
        })),
      balance: balanceOf(id),
      credit: (() => {
        // C5: credit position (AED incl. VAT) — open balance + confirmed orders not yet invoiced.
        const inputs = creditInputs({
          balance: balanceOf(id),
          invoices: db.invoices,
          customerId: id,
          today: PROTO_TODAY,
        });
        return {
          ...creditCheck({ customer: c, ...inputs, orderValue: 0 }),
          ...inputs,
          creditLimit: c.creditLimit,
          customerStatus: c.status,
        };
      })(),
    });
  },
  create(input: CustomerInput): Promise<{ customer: Customer; ledgerCode: string }> {
    const db = protoDb.get();
    const next = Math.max(...db.customers.map((c) => Number(c.code.split('-')[1]))) + 1;
    const id = newId('cus');
    // Every customer gets its own sub-ledger under Accounts receivable (1200), created automatically.
    const arCodes = db.ledgerAccounts
      .filter((a) => a.parentId === 'g-ar')
      .map((a) => Number(a.code.split('-')[1]))
      .filter((n) => Number.isFinite(n));
    const ledger: LedgerAccount = {
      id: newId('la-cus'),
      code: `1200-${String((arCodes.length ? Math.max(...arCodes) : 0) + 1).padStart(3, '0')}`,
      name: input.name,
      group: 'Assets',
      kind: 'Ledger',
      parentId: 'g-ar',
      party: { type: 'Customer', id },
      system: true,
      active: true,
    };
    const customer: Customer = {
      id,
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
      ledgerAccountId: ledger.id,
    };
    protoDb.update((s) => ({
      ...s,
      customers: [customer, ...s.customers],
      ledgerAccounts: [...s.ledgerAccounts, ledger],
    }));
    logActivity({
      entity: 'Ledger',
      entityId: ledger.id,
      entityRef: ledger.code,
      action: `opened receivable ledger for ${customer.name}`,
    });
    return latency({ customer, ledgerCode: ledger.code }, 300);
  },
};

export type CustomerDetail = Awaited<ReturnType<typeof customersApi.get>>;

/** MASTERS M2: edit a customer — every change is logged old → new. */
export function updateCustomer(id: string, input: CustomerEditInput): Promise<Customer> {
  const db = protoDb.get();
  const old = db.customers.find((c) => c.id === id);
  if (!old) return Promise.reject(new Error('Customer not found.'));
  if (input.status === 'On hold' && old.status !== 'On hold' && (input.holdReason ?? '').trim().length < 3)
    return Promise.reject(new Error('Give the reason for putting the customer on hold.'));
  const next: Customer = {
    ...old,
    name: input.name.trim(),
    industry: input.industry,
    contactName: input.contactName.trim(),
    contactEmail: input.contactEmail.trim(),
    contactPhone: input.contactPhone.trim(),
    postalAddress: input.postalAddress.trim() || undefined,
    trnMasked: input.trn.trim() ? maskTrn(input.trn) : old.trnMasked,
    creditLimit: input.creditLimit,
    paymentTermsDays: input.paymentTermsDays,
    status: input.status,
  };
  const fields: [string, string, string][] = [
    ['Name', old.name, next.name],
    ['Category', old.industry, next.industry],
    ['Contact', old.contactName, next.contactName],
    ['Email', old.contactEmail, next.contactEmail],
    ['Phone', old.contactPhone, next.contactPhone],
    ['Postal address', old.postalAddress ?? '—', next.postalAddress ?? '—'],
    ['TRN', old.trnMasked, next.trnMasked],
    ['Credit limit', String(old.creditLimit), String(next.creditLimit)],
    ['Payment terms (days)', String(old.paymentTermsDays), String(next.paymentTermsDays)],
    ['Status', old.status, next.status],
  ];
  const changes = fields.filter(([, a, b]) => a !== b).map(([field, from, to]) => ({ field, from, to }));
  if (input.status === 'On hold' && old.status !== 'On hold')
    changes.push({ field: 'Hold reason', from: '—', to: (input.holdReason ?? '').trim() });
  if (!changes.length) return latency(old, 150);
  protoDb.update((s) => ({
    ...s,
    customers: s.customers.map((c) => (c.id === id ? next : c)),
    // Keep the receivable sub-ledger name in step with the customer name.
    ledgerAccounts:
      next.name !== old.name
        ? s.ledgerAccounts.map((a) => (a.id === old.ledgerAccountId ? { ...a, name: next.name } : a))
        : s.ledgerAccounts,
  }));
  logActivity({
    entity: 'Settings',
    entityId: id,
    entityRef: old.code,
    action:
      input.status === 'On hold' && old.status !== 'On hold'
        ? `put customer ${next.name} on hold: ${(input.holdReason ?? '').trim()}`
        : `edited customer ${next.name}`,
    changes,
  });
  return latency(next, 250);
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CustomerEditInput }) => updateCustomer(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['lookups', 'customers'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}

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
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}
