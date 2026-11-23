import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Cargo,
  Enquiry,
  EnquiryStatus,
  Quotation,
  SalesOrder,
  ServiceCategory,
  TransportMode,
} from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/**
 * Enquiries data source. PROTOTYPE ADAPTER — replace the bodies of `enquiriesApi` with calls
 * to the generated OpenAPI client when the Commercial (Phase 3) contract is published.
 * Screens only use the hooks below, so they do not change.
 */
export interface EnquiryRow extends Enquiry {
  customerName: string;
}

export interface EnquiryInput {
  customerId: string;
  serviceCategory: ServiceCategory;
  mode?: TransportMode;
  origin: string;
  destination: string;
  serviceIds: string[];
  cargo: Cargo;
  requiredBy: string;
  notes: string;
}

const toRow = (e: Enquiry): EnquiryRow => ({ ...e, customerName: lookupName.customer(e.customerId) });

export const enquiriesApi = {
  list(params: ListParams): Promise<Page<EnquiryRow>> {
    const rows = [...protoDb.get().enquiries]
      .filter((e) => !params.type || e.serviceCategory === params.type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.origin} ${r.destination} ${r.cargo.description}`,
        status: (r) => r.status,
      }),
    );
  },
  get(id: string): Promise<
    EnquiryRow & {
      quotations: Pick<Quotation, 'id' | 'number' | 'version' | 'status'>[];
      salesOrders: Pick<SalesOrder, 'id' | 'number' | 'status'>[];
    }
  > {
    const e = protoDb.get().enquiries.find((x) => x.id === id);
    if (!e) return Promise.reject(new Error('Not found'));
    const quotations = protoDb
      .get()
      .quotations.filter((q) => q.enquiryId === id)
      .map((q) => ({ id: q.id, number: q.number, version: q.version, status: q.status }));
    const salesOrders = protoDb
      .get()
      .salesOrders.filter((so) => so.enquiryId === id)
      .map((so) => ({ id: so.id, number: so.number, status: so.status }));
    return latency({ ...toRow(e), quotations, salesOrders });
  },
  create(input: EnquiryInput): Promise<Enquiry> {
    const db = protoDb.get();
    const next = Math.max(...db.enquiries.map((e) => Number(e.number.split('-')[1]))) + 1;
    const enquiry: Enquiry = {
      id: newId('enq'),
      number: `ENQ-${next}`,
      status: 'New',
      owner: db.session?.displayName ?? 'Prototype user',
      createdAt: nowIso(),
      ...input,
    };
    protoDb.update((s) => ({ ...s, enquiries: [enquiry, ...s.enquiries] }));
    logActivity({
      entity: 'Enquiry',
      entityId: enquiry.id,
      entityRef: enquiry.number,
      action: 'logged a new enquiry',
    });
    return latency(enquiry, 300);
  },
  setStatus(id: string, status: EnquiryStatus): Promise<void> {
    protoDb.update((s) => ({
      ...s,
      enquiries: s.enquiries.map((e) => (e.id === id ? { ...e, status } : e)),
    }));
    const e = protoDb.get().enquiries.find((x) => x.id === id);
    if (e)
      logActivity({
        entity: 'Enquiry',
        entityId: id,
        entityRef: e.number,
        action: `marked the enquiry ${status.toLowerCase()}`,
      });
    return latency(undefined, 200);
  },
};

export function useEnquiries(params: ListParams) {
  return useQuery({
    queryKey: ['enquiries', 'list', params],
    queryFn: () => enquiriesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useEnquiry(id: string) {
  return useQuery({ queryKey: ['enquiries', 'detail', id], queryFn: () => enquiriesApi.get(id) });
}

export function useCreateEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enquiriesApi.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['enquiries'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useSetEnquiryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EnquiryStatus }) => enquiriesApi.setStatus(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['enquiries'] }),
  });
}
