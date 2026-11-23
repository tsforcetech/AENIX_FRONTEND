import { useQuery } from '@tanstack/react-query';
import { daysBetween, workOrderFinancials } from '@/domain/calc';
import type { Contract, WorkOrder } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, protoDb } from '@/prototype/store';

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
    'id' | 'number' | 'status' | 'origin' | 'destination' | 'createdAt' | 'serviceCategory'
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
          createdAt: w.createdAt,
          revenue: workOrderFinancials(w).revenue,
        })),
    });
  },
};

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
