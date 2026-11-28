import { useQuery } from '@tanstack/react-query';
import { jobStock } from '@/domain/stock';
import type { CustomerRequest, Grn, PackingList } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { grnResult, inboundStage, podResult } from '@/features/work-orders/api';
import { latency, protoDb } from '@/prototype/store';
import { siteOfJob } from './sites';

/** Cross-job document views for the warehouse team (prototype adapter over work orders). */
export interface InboundRow {
  id: string;
  workOrderId: string;
  jobNumber: string;
  customerName: string;
  inboundNumber: string;
  reference: string;
  expectedAt: string;
  /** FLOW-003 W1 / W12 / W4 */
  expectedTime?: string;
  kind: 'Receipt' | 'Return';
  putawayDone: boolean;
  pl: PackingList;
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

const stageMap: Record<ReturnType<typeof inboundStage>, InboundRow['stage']> = {
  'Draft PL': 'PL draft',
  Expected: 'Awaiting GRN',
  'GRN uploaded': 'GRN to check',
  'Variance raised': 'Variance raised',
  Verified: 'Verified',
};

/** Every inbound receipt across all jobs — goods arrive many times per storage job. */
function inbound(siteId?: string): InboundRow[] {
  return protoDb
    .get()
    .workOrders.filter((w) => !siteId || siteOfJob(w) === siteId)
    .flatMap((w) =>
      w.inbounds.map((ib) => {
        const r = grnResult(ib);
        return {
          id: ib.id,
          workOrderId: w.id,
          jobNumber: w.number,
          customerName: lookupName.customer(w.customerId),
          inboundNumber: ib.number,
          reference: ib.reference,
          expectedAt: ib.expectedAt,
          expectedTime: ib.expectedTime,
          kind: ib.kind ?? 'Receipt',
          putawayDone: !!ib.putawayDone,
          pl: ib.packingList,
          grn: ib.grn,
          expected: ib.packingList.lines.reduce((s, l) => s + l.quantity, 0),
          received: ib.grn?.lines.reduce((s, l) => s + l.receivedQty, 0) ?? 0,
          mismatches: r?.mismatches ?? 0,
          stage: stageMap[inboundStage(ib)],
        };
      }),
    )
    .sort((a, b) => {
      const open = (x: InboundRow) => (x.stage === 'Verified' ? 1 : 0);
      return open(a) - open(b) || b.expectedAt.localeCompare(a.expectedAt);
    });
}

export interface CustomerStockRow {
  id: string;
  workOrderId: string;
  jobNumber: string;
  customerName: string;
  skus: number;
  received: number;
  damaged: number;
  delivered: number;
  reserved: number;
  onHand: number;
  available: number;
  inbounds: number;
  releases: number;
}

/** Running stock per customer job (from every GRN and POD). */
function customerStock(siteId?: string): CustomerStockRow[] {
  return protoDb
    .get()
    .workOrders.filter((w) => w.inbounds.length > 0 && (!siteId || siteOfJob(w) === siteId))
    .map((w) => {
      const st = jobStock(w);
      const sum = (k: 'received' | 'damaged' | 'delivered' | 'reserved' | 'onHand' | 'available') =>
        st.reduce((s, x) => s + x[k], 0);
      return {
        id: w.id,
        workOrderId: w.id,
        jobNumber: w.number,
        customerName: lookupName.customer(w.customerId),
        skus: st.filter((x) => x.onHand > 0).length,
        received: sum('received'),
        damaged: sum('damaged'),
        delivered: sum('delivered'),
        reserved: sum('reserved'),
        onHand: sum('onHand'),
        available: sum('available'),
        inbounds: w.inbounds.length,
        releases: w.customerRequests.length,
      };
    })
    .sort((a, b) => b.onHand - a.onHand);
}

function outbound(siteId?: string): OutboundRow[] {
  return protoDb
    .get()
    .workOrders.filter((w) => !siteId || siteOfJob(w) === siteId)
    .flatMap((w) =>
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

/** FLOW-003 W1: consignments expected in the next 7 days (no GRN yet), by date and time. */
export const ARRIVALS_TODAY = '2026-11-23';
function arrivals(): InboundRow[] {
  const end = new Date(Date.parse(`${ARRIVALS_TODAY}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return inbound()
    .filter((r) => !r.grn && r.expectedAt >= ARRIVALS_TODAY && r.expectedAt <= end)
    .sort(
      (a, b) =>
        a.expectedAt.localeCompare(b.expectedAt) ||
        (a.expectedTime ?? '99:99').localeCompare(b.expectedTime ?? '99:99'),
    );
}

export function useArrivals(siteId?: string) {
  return useQuery({
    queryKey: ['warehouse', 'arrivals', siteId],
    queryFn: () => latency(arrivals().filter((r) => !siteId || inbound(siteId).some((i) => i.id === r.id))),
  });
}

export function useInbound(siteId?: string) {
  return useQuery({ queryKey: ['warehouse', 'inbound', siteId], queryFn: () => latency(inbound(siteId)) });
}

export function useOutbound(siteId?: string) {
  return useQuery({ queryKey: ['warehouse', 'outbound', siteId], queryFn: () => latency(outbound(siteId)) });
}

export function useCustomerStock(siteId?: string) {
  return useQuery({
    queryKey: ['warehouse', 'customer-stock', siteId],
    queryFn: () => latency(customerStock(siteId)),
  });
}
