import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment, DocLine, Grn, Pod } from '@/domain/types';
import { workOrdersApi } from '@/features/work-orders/api';
import { latency, protoDb } from '@/prototype/store';
import { siteName, siteOfJob } from './sites';

/** Jobs and open documents a bulk upload can attach to (PROTOTYPE ADAPTER over work orders). */
export interface UploadJob {
  id: string;
  number: string;
  label: string;
  inboundsAwaitingGrn: { id: string; label: string }[];
  requestsAwaitingPod: { id: string; label: string }[];
}

export function uploadTargets(customerId: string, siteId?: string): UploadJob[] {
  const db = protoDb.get();
  return db.workOrders
    .filter(
      (w) =>
        w.customerId === customerId &&
        (w.hasWarehouse || w.serviceCategories.includes('Warehouse')) &&
        w.status !== 'Cancelled' &&
        w.status !== 'Completed' &&
        (!siteId || siteOfJob(w, db) === siteId),
    )
    .map((w) => ({
      id: w.id,
      number: w.number,
      label: `${w.number} · ${siteName(siteOfJob(w, db))} · ${w.inbounds.length} inbound(s), ${w.customerRequests.length} release(s)`,
      inboundsAwaitingGrn: w.inbounds
        .filter((ib) => !ib.grn && ib.packingList.status === 'Sent to warehouse')
        .map((ib) => ({
          id: ib.id,
          label: `${ib.number} · ${ib.packingList.number} · ${ib.reference || 'no reference'} · expected ${ib.expectedAt}`,
        })),
      requestsAwaitingPod: w.customerRequests
        .filter((r) => !r.pod && (r.status === 'Open' || r.status === 'Sent to vendor'))
        .map((r) => ({ id: r.id, label: `${r.number} · ${r.deliverTo} · needed by ${r.requiredBy}` })),
    }));
}

export function useUploadTargets(customerId: string, siteId?: string) {
  return useQuery({
    queryKey: ['warehouse', 'upload-targets', customerId, siteId],
    queryFn: () => latency(uploadTargets(customerId, siteId), 60),
    enabled: !!customerId,
  });
}

export type BulkSave =
  | {
      kind: 'PL';
      jobId: string;
      reference: string;
      expectedAt: string;
      lines: DocLine[];
      attachment: Attachment;
      send: boolean;
    }
  | { kind: 'GRN'; jobId: string; inboundId: string; grn: Omit<Grn, 'status'> }
  | { kind: 'REQUEST'; jobId: string; deliverTo: string; requiredBy: string; lines: DocLine[] }
  | { kind: 'POD'; jobId: string; requestId: string; pod: Pod };

/** Saves the uploaded document through the same job rules as the job page (stock never negative). */
export function saveBulk(a: BulkSave): Promise<string> {
  switch (a.kind) {
    case 'PL':
      return workOrdersApi
        .addInbound(a.jobId, {
          reference: a.reference,
          expectedAt: a.expectedAt,
          lines: a.lines,
          attachment: a.attachment,
          source: 'Excel import',
          send: a.send,
        })
        .then((ib) => `${ib.number} created with ${ib.packingList.lines.length} product lines`);
    case 'GRN':
      return workOrdersApi.uploadGrn(a.jobId, a.inboundId, a.grn).then(() => `${a.grn.number} uploaded`);
    case 'REQUEST':
      return workOrdersApi
        .createRequest(a.jobId, { deliverTo: a.deliverTo, requiredBy: a.requiredBy, lines: a.lines })
        .then((r) => `${r.number} created with ${r.lines.length} lines`);
    case 'POD':
      return workOrdersApi.uploadPod(a.jobId, a.requestId, a.pod).then(() => `${a.pod.number} uploaded`);
  }
}

export function useSaveBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveBulk,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse'] });
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
