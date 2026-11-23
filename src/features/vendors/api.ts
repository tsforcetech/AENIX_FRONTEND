import { jobKindLabel } from '@/domain/workflow';
import { useQuery } from '@tanstack/react-query';
import { billTotals } from '@/domain/calc';
import type { Vendor } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, protoDb } from '@/prototype/store';

/**
 * Vendors data source. PROTOTYPE ADAPTER — replace with the generated OpenAPI client when the
 * Masters (Phase 2) contract is published.
 */
export interface VendorRow extends Vendor {
  openBills: number;
  outstanding: number;
}

function toRow(v: Vendor): VendorRow {
  const open = protoDb.get().vendorBills.filter((b) => b.vendorId === v.id && b.status !== 'Paid');
  const outstanding = open.reduce((s, b) => s + billTotals(b).outstanding, 0);
  return { ...v, openBills: open.length, outstanding: Math.round(outstanding * 100) / 100 };
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
          lane: `${jobKindLabel(wo.serviceCategory, wo.mode)} · ${wo.destination ? `${wo.origin} → ${wo.destination}` : wo.origin}`,
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
    });
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
