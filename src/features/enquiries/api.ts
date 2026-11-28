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
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/** Prototype "today" for follow-up reminders (C1). */
export const FOLLOW_UP_TODAY = PROTO_TODAY;

/**
 * Enquiries data source. PROTOTYPE ADAPTER — replace the bodies of `enquiriesApi` with calls
 * to the generated OpenAPI client when the Commercial (Phase 3) contract is published.
 * Screens only use the hooks below, so they do not change.
 */
export interface EnquiryRow extends Enquiry {
  customerName: string;
  /** C1: open enquiry with a follow-up on or before today. */
  followUpDue: boolean;
  /** C1: open enquiry whose follow-up date has passed. */
  followUpOverdue: boolean;
}

export interface EnquiryInput {
  customerId: string;
  serviceCategory: ServiceCategory;
  serviceCategories: ServiceCategory[];
  mode?: TransportMode;
  origin: string;
  destination: string;
  serviceIds: string[];
  cargo: Cargo;
  requiredBy: string;
  notes: string;
  nextFollowUp?: string;
}

const OPEN: EnquiryStatus[] = ['New', 'Quoting', 'Quoted'];

const toRow = (e: Enquiry): EnquiryRow => {
  const open = OPEN.includes(e.status) && !!e.nextFollowUp;
  return {
    ...e,
    customerName: lookupName.customer(e.customerId),
    followUpDue: open && e.nextFollowUp! <= FOLLOW_UP_TODAY,
    followUpOverdue: open && e.nextFollowUp! < FOLLOW_UP_TODAY,
  };
};

/** `?followUp=due` keeps only enquiries with a follow-up due today or overdue. */
const followUpFilter = (params: ListParams) => (r: EnquiryRow) => params.followUp !== 'due' || r.followUpDue;

export const enquiriesApi = {
  list(params: ListParams): Promise<Page<EnquiryRow>> {
    const rows = [...protoDb.get().enquiries]
      .filter((e) => !params.type || e.serviceCategories.includes(params.type as ServiceCategory))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toRow)
      .filter(followUpFilter(params));
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
  setStatus(id: string, status: EnquiryStatus, lostReason?: string): Promise<void> {
    // Lost always needs a reason (kept for win/loss reporting).
    if (status === 'Lost' && (lostReason ?? '').trim().length < 3)
      return Promise.reject(new Error('Give the reason the enquiry was lost.'));
    protoDb.update((s) => ({
      ...s,
      enquiries: s.enquiries.map((e) =>
        e.id === id
          ? {
              ...e,
              status,
              ...(status === 'Lost' ? { lostReason: lostReason!.trim() } : {}),
            }
          : e,
      ),
    }));
    const e = protoDb.get().enquiries.find((x) => x.id === id);
    if (e)
      logActivity({
        entity: 'Enquiry',
        entityId: id,
        entityRef: e.number,
        action: `marked the enquiry ${status.toLowerCase()}${status === 'Lost' ? ` — ${lostReason!.trim()}` : ''}`,
      });
    return latency(undefined, 200);
  },
  /** C1: set or clear the next follow-up date. */
  setFollowUp(id: string, date: string | undefined): Promise<void> {
    const e = protoDb.get().enquiries.find((x) => x.id === id);
    if (!e) return Promise.reject(new Error('Not found'));
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.reject(new Error('Choose a valid date.'));
    protoDb.update((s) => ({
      ...s,
      enquiries: s.enquiries.map((x) => (x.id === id ? { ...x, nextFollowUp: date || undefined } : x)),
    }));
    logActivity({
      entity: 'Enquiry',
      entityId: id,
      entityRef: e.number,
      action: date ? `set the next follow-up to ${date}` : 'cleared the follow-up',
      changes: [{ field: 'Next follow-up', from: e.nextFollowUp ?? '—', to: date || '—' }],
    });
    return latency(undefined, 200);
  },
};

/** Card row for the Kanban board: enquiry + its latest quotation and whether a sales order exists. */
export interface EnquiryBoardRow extends EnquiryRow {
  latestQuotation?: Pick<Quotation, 'id' | 'number' | 'status'>;
  hasAcceptedQuotation: boolean;
  hasSalesOrder: boolean;
}

/** Board query: bounded to the first 100 matches (search + type), grouped client-side. */
export function boardList(params: ListParams): Promise<EnquiryBoardRow[]> {
  const db = protoDb.get();
  const page = paginate(
    [...db.enquiries]
      .filter((e) => !params.type || e.serviceCategories.includes(params.type as ServiceCategory))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toRow)
      .filter(followUpFilter(params)),
    { ...params, page: 1, pageSize: 100, status: undefined },
    {
      searchText: (r) => `${r.number} ${r.customerName} ${r.origin} ${r.destination} ${r.cargo.description}`,
    },
  );
  const rows = page.items.map((r): EnquiryBoardRow => {
    const qs = db.quotations
      .filter((q) => q.enquiryId === r.id)
      .sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt));
    const latest = qs[0];
    return {
      ...r,
      latestQuotation: latest ? { id: latest.id, number: latest.number, status: latest.status } : undefined,
      hasAcceptedQuotation: qs.some((q) => q.status === 'Accepted'),
      hasSalesOrder: db.salesOrders.some((so) => so.enquiryId === r.id && so.status !== 'Cancelled'),
    };
  });
  return latency(rows);
}

export function useEnquiryBoard(params: ListParams) {
  return useQuery({
    queryKey: ['enquiries', 'board', params],
    queryFn: () => boardList(params),
    placeholderData: (prev) => prev,
  });
}

/** Move a card: optimistic update of every cached board, rolled back on error. */
export function useMoveEnquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, lostReason }: { id: string; status: EnquiryStatus; lostReason?: string }) =>
      enquiriesApi.setStatus(id, status, lostReason),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['enquiries', 'board'] });
      const snapshots = qc.getQueriesData<EnquiryBoardRow[]>({ queryKey: ['enquiries', 'board'] });
      qc.setQueriesData<EnquiryBoardRow[]>({ queryKey: ['enquiries', 'board'] }, (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, status } : r)),
      );
      return { snapshots };
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['enquiries'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

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
    mutationFn: ({ id, status, lostReason }: { id: string; status: EnquiryStatus; lostReason?: string }) =>
      enquiriesApi.setStatus(id, status, lostReason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['enquiries'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useSetFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string | undefined }) =>
      enquiriesApi.setFollowUp(id, date),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['enquiries'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
