import { servicesLabel } from '@/domain/workflow';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals } from '@/domain/calc';
import type { LedgerAccount, Vendor, VendorCategory } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';

/**
 * Vendors data source. PROTOTYPE ADAPTER — replace with the generated OpenAPI client when the
 * Masters (Phase 2) contract is published.
 */
export interface VendorRow extends Vendor {
  openBills: number;
  outstanding: number;
  ledgerCode: string;
}

export interface VendorBalance {
  /** Approved / posted purchase invoices incl. VAT (drafts excluded). */
  billed: number;
  paid: number;
  /** What we owe the vendor now: billed − paid. */
  payable: number;
  /** Committed on purchase orders not yet invoiced by the vendor (incl. VAT). */
  openPoValue: number;
  openPoCount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function vendorBalance(vendorId: string): VendorBalance {
  const db = protoDb.get();
  const bills = db.vendorBills.filter((b) => b.vendorId === vendorId && b.status !== 'Draft');
  const billed = bills.reduce((s, b) => s + billTotals(b).total, 0);
  const paid = bills.reduce((s, b) => s + b.paid, 0);
  const openPos = db.purchaseOrders.filter(
    (p) => p.vendorId === vendorId && !p.vendorBillId && p.status !== 'Billed' && p.status !== 'Cancelled',
  );
  return {
    billed: r2(billed),
    paid: r2(paid),
    payable: r2(billed - paid),
    openPoValue: r2(openPos.reduce((s, p) => s + p.amount * (1 + p.vatRate), 0)),
    openPoCount: openPos.length,
  };
}

function toRow(v: Vendor): VendorRow {
  const db = protoDb.get();
  const open = db.vendorBills.filter((b) => b.vendorId === v.id && b.status !== 'Paid');
  const outstanding = open.reduce((s, b) => s + billTotals(b).outstanding, 0);
  return {
    ...v,
    openBills: open.length,
    outstanding: r2(outstanding),
    ledgerCode: db.ledgerAccounts.find((a) => a.id === v.ledgerAccountId)?.code ?? '—',
  };
}

export interface VendorInput {
  name: string;
  category: VendorCategory;
  city: string;
  country: string;
  contactName: string;
  contactEmail: string;
  paymentTermsDays: number;
}

export const vendorsApi = {
  list(params: ListParams): Promise<Page<VendorRow>> {
    const rows = protoDb.get().vendors.map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.code} ${r.name} ${r.category} ${r.city}`,
        status: (r) => r.category,
      }),
    );
  },
  get(id: string) {
    const db = protoDb.get();
    const v = db.vendors.find((x) => x.id === id);
    if (!v) return Promise.reject(new Error('Not found'));
    const assignments = db.workOrders.flatMap((wo) =>
      wo.vendorAssignments
        .filter((a) => a.vendorId === id)
        .map((a) => ({
          id: a.id,
          workOrderId: wo.id,
          workOrderNumber: wo.number,
          lane: `${servicesLabel(wo.serviceCategories, wo.mode)} · ${wo.destination ? `${wo.origin} → ${wo.destination}` : wo.origin}`,
          service: lookupName.service(a.serviceId),
          agreedCost: a.agreedCost,
          status: a.status,
        })),
    );
    return latency({
      vendor: toRow(v),
      rates: db.vendorRates
        .filter((r) => r.vendorId === id)
        .map((r) => ({ ...r, serviceName: lookupName.service(r.serviceId) })),
      assignments,
      bills: db.vendorBills
        .filter((b) => b.vendorId === id)
        .map((b) => ({
          ...b,
          ...billTotals(b),
          workOrderNumber: db.workOrders.find((w) => w.id === b.workOrderId)?.number,
        })),
      purchaseOrders: db.purchaseOrders
        .filter((p) => p.vendorId === id)
        .map((p) => ({
          ...p,
          total: r2(p.amount * (1 + p.vatRate)),
          workOrderNumber: db.workOrders.find((w) => w.id === p.workOrderId)?.number ?? '—',
          billNumber: db.vendorBills.find((b) => b.id === p.vendorBillId)?.number,
        })),
      payments: db.vendorPayments
        .filter((p) => p.vendorId === id)
        .map((p) => ({
          ...p,
          bills: p.allocations
            .map((a) => db.vendorBills.find((b) => b.id === a.billId)?.number)
            .filter((n): n is string => !!n),
        })),
      balance: vendorBalance(id),
    });
  },
  create(input: VendorInput): Promise<{ vendor: Vendor; ledgerCode: string }> {
    const db = protoDb.get();
    const next = Math.max(...db.vendors.map((v) => Number(v.code.split('-')[1]))) + 1;
    const id = newId('ven');
    // Every vendor gets its own sub-ledger under Accounts payable (2100), created automatically.
    const apCodes = db.ledgerAccounts
      .filter((a) => a.parentId === 'g-ap')
      .map((a) => Number(a.code.split('-')[1]))
      .filter((n) => Number.isFinite(n));
    const ledger: LedgerAccount = {
      id: newId('la-ven'),
      code: `2100-${String((apCodes.length ? Math.max(...apCodes) : 0) + 1).padStart(3, '0')}`,
      name: input.name,
      group: 'Liabilities',
      kind: 'Ledger',
      parentId: 'g-ap',
      party: { type: 'Vendor', id },
      system: true,
      active: true,
    };
    const vendor: Vendor = {
      id,
      code: `VEN-${String(next).padStart(4, '0')}`,
      name: input.name,
      category: input.category,
      city: input.city,
      country: input.country,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      rating: 3,
      paymentTermsDays: input.paymentTermsDays,
      status: 'Active',
      ledgerAccountId: ledger.id,
    };
    protoDb.update((s) => ({
      ...s,
      vendors: [vendor, ...s.vendors],
      ledgerAccounts: [...s.ledgerAccounts, ledger],
    }));
    logActivity({
      entity: 'Ledger',
      entityId: ledger.id,
      entityRef: ledger.code,
      action: `opened payable ledger for ${vendor.name}`,
    });
    return latency({ vendor, ledgerCode: ledger.code }, 300);
  },
};

export type VendorDetail = Awaited<ReturnType<typeof vendorsApi.get>>;

export function useVendors(params: ListParams) {
  return useQuery({
    queryKey: ['vendors', 'list', params],
    queryFn: () => vendorsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useVendor(id: string) {
  return useQuery({ queryKey: ['vendors', 'detail', id], queryFn: () => vendorsApi.get(id) });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vendorsApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      void qc.invalidateQueries({ queryKey: ['lookups', 'vendors'] });
      void qc.invalidateQueries({ queryKey: ['ledger'] });
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}
