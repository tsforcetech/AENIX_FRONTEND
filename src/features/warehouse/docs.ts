import { useQuery } from '@tanstack/react-query';
import type { CustomerRequest, Grn, PackingList } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { grnResult, podResult } from '@/features/work-orders/api';
import { latency, protoDb } from '@/prototype/store';

/** Cross-job document views for the warehouse team (prototype adapter over work orders). */
export interface InboundRow {
  id: string;
  workOrderId: string;
  jobNumber: string;
  customerName: string;
  pl?: PackingList;
  grn?: Grn;
  expected: number;
  received: number;
  mismatches: number;
  stage: 'PL draft' | 'Awaiting GRN' | 'GRN to check' | 'Variance raised' | 'Verified';
}

export interface OutboundRow {
  id: string;
  workOrderId: string;
  jobNumber: string;
  customerName: string;
  request: CustomerRequest;
  requested: number;
  delivered?: number;
  mismatches: number;
}

function inbound(): InboundRow[] {
  return protoDb
    .get()
    .workOrders.filter((w) => w.packingList)
    .map((w) => {
      const r = grnResult(w);
      const pl = w.packingList!;
      const stage: InboundRow['stage'] =
        pl.status === 'Draft'
          ? 'PL draft'
          : !w.grn
            ? 'Awaiting GRN'
            : w.grn.status === 'Verified'
              ? 'Verified'
              : w.grn.status === 'Variance raised'
                ? 'Variance raised'
                : 'GRN to check';
      return {
        id: `${w.id}-in`,
        workOrderId: w.id,
        jobNumber: w.number,
        customerName: lookupName.customer(w.customerId),
        pl,
        grn: w.grn,
        expected: pl.lines.reduce((s, l) => s + l.quantity, 0),
        received: w.grn?.lines.reduce((s, l) => s + l.receivedQty, 0) ?? 0,
        mismatches: r?.mismatches ?? 0,
        stage,
      };
    })
    .sort((a, b) => (b.pl?.sentAt ?? '9').localeCompare(a.pl?.sentAt ?? '9'));
}

function outbound(): OutboundRow[] {
  return protoDb
    .get()
    .workOrders.flatMap((w) =>
      w.customerRequests.map((req) => {
        const r = podResult(req);
        return {
          id: req.id,
          workOrderId: w.id,
          jobNumber: w.number,
          customerName: lookupName.customer(w.customerId),
          request: req,
          requested: req.lines.reduce((s, l) => s + l.quantity, 0),
          delivered: req.pod?.lines.reduce((s, l) => s + l.deliveredQty, 0),
          mismatches: r?.mismatches ?? 0,
        };
      }),
    )
    .sort((a, b) => b.request.requestedAt.localeCompare(a.request.requestedAt));
}

export function useInbound() {
  return useQuery({ queryKey: ['warehouse', 'inbound'], queryFn: () => latency(inbound()) });
}

export function useOutbound() {
  return useQuery({ queryKey: ['warehouse', 'outbound'], queryFn: () => latency(outbound()) });
}
