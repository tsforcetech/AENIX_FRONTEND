import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { daysBetween, workOrderFinancials } from '@/domain/calc';
import type { Contract, WorkOrder } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, protoDb } from '@/prototype/store';

/** C6 / W13: commercial terms editable on the contract. */
export interface ContractTermsInput {
  fuelSurchargePct: number;
  minimumMonthlyStorage: number;
  storageFreeDays: number;
}

/** Returns field → message for invalid terms (empty when valid). */
export function validateContractTerms(t: ContractTermsInput): Partial<Record<keyof ContractTermsInput, string>> {
  const e: Partial<Record<keyof ContractTermsInput, string>> = {};
  if (!Number.isFinite(t.fuelSurchargePct) || t.fuelSurchargePct < 0 || t.fuelSurchargePct > 50)
    e.fuelSurchargePct = 'Enter 0 to 50 %';
  if (!Number.isFinite(t.minimumMonthlyStorage) || t.minimumMonthlyStorage < 0)
    e.minimumMonthlyStorage = 'Enter 0 or more';
  if (!Number.isInteger(t.storageFreeDays) || t.storageFreeDays < 0 || t.storageFreeDays > 365)
    e.storageFreeDays = 'Enter whole days, 0 to 365';
  return e;
}

/**
 * Contracts / rate agreements data source. PROTOTYPE ADAPTER — replace the bodies of
 * `contractsApi` with the generated OpenAPI client once the Commercial (Phase 3) contract exists.
 */
export interface ContractRow extends Contract {
  customerName: string;
  daysRemaining: number;
  elapsedPct: number;
}

export interface ContractDetail extends ContractRow {
  quotationNumber?: string;
  workOrders: (Pick<
    WorkOrder,
    'id' | 'number' | 'status' | 'origin' | 'destination' | 'createdAt' | 'serviceCategory' | 'serviceCategories'
  > & {
    revenue: number;
  })[];
}

const toRow = (c: Contract): ContractRow => {
  const total = Math.max(1, daysBetween(c.startDate, c.endDate));
  const elapsed = Math.min(total, Math.max(0, daysBetween(c.startDate, PROTO_TODAY)));
  return {
    ...c,
    customerName: lookupName.customer(c.customerId),
    daysRemaining: daysBetween(PROTO_TODAY, c.endDate),
    elapsedPct: Math.round((elapsed / total) * 100),
  };
};

export const contractsApi = {
  list(params: ListParams): Promise<Page<ContractRow>> {
    const rows = [...protoDb.get().contracts].sort((a, b) => a.endDate.localeCompare(b.endDate)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.title} ${r.customerName}`,
        status: (r) => r.status,
      }),
    );
  },
  get(id: string): Promise<ContractDetail> {
    const db = protoDb.get();
    const c = db.contracts.find((x) => x.id === id);
    if (!c) return Promise.reject(new Error('Not found'));
    return latency({
      ...toRow(c),
      quotationNumber: db.quotations.find((q) => q.id === c.quotationId)?.number,
      workOrders: db.workOrders
        .filter((w) => {
          const so = w.salesOrderId ? db.salesOrders.find((x) => x.id === w.salesOrderId) : undefined;
          return so?.contractId === id || (w.source.type === 'Contract' && w.source.refId === id);
        })
        .map((w) => ({
          id: w.id,
          number: w.number,
          status: w.status,
          origin: w.origin,
          destination: w.destination,
          serviceCategory: w.serviceCategory,
          serviceCategories: w.serviceCategories,
          createdAt: w.createdAt,
          revenue: workOrderFinancials(w).revenue,
        })),
    });
  },
};

export const contractTermsApi = {
  update(id: string, input: ContractTermsInput): Promise<Contract> {
    const c = protoDb.get().contracts.find((x) => x.id === id);
    if (!c) return Promise.reject(new Error('Not found'));
    const errors = validateContractTerms(input);
    if (Object.keys(errors).length) return Promise.reject(new Error(Object.values(errors).join('; ')));
    const next: Contract = {
      ...c,
      fuelSurchargePct: input.fuelSurchargePct || undefined,
      minimumMonthlyStorage: input.minimumMonthlyStorage || undefined,
      storageFreeDays: input.storageFreeDays || undefined,
    };
    protoDb.update((s) => ({ ...s, contracts: s.contracts.map((x) => (x.id === id ? next : x)) }));
    const show = (n?: number) => (n ? String(n) : '0');
    logActivity({
      entity: 'Contract',
      entityId: id,
      entityRef: c.number,
      action: 'updated the contract terms',
      changes: [
        { field: 'Fuel surcharge %', from: show(c.fuelSurchargePct), to: show(next.fuelSurchargePct) },
        {
          field: 'Minimum monthly storage (AED)',
          from: show(c.minimumMonthlyStorage),
          to: show(next.minimumMonthlyStorage),
        },
        { field: 'Storage free days', from: show(c.storageFreeDays), to: show(next.storageFreeDays) },
      ],
    });
    return latency(next, 250);
  },
};

export function useUpdateContractTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ContractTermsInput & { id: string }) => contractTermsApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contracts'] });
      void qc.invalidateQueries({ queryKey: ['sales-orders', 'prefill'] });
    },
  });
}

export function useContracts(params: ListParams) {
  return useQuery({
    queryKey: ['contracts', 'list', params],
    queryFn: () => contractsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useContract(id: string) {
  return useQuery({ queryKey: ['contracts', 'detail', id], queryFn: () => contractsApi.get(id) });
}
