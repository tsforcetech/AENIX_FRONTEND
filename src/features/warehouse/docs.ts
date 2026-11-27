import { useQuery } from '@tanstack/react-query';
import { jobStock } from '@/domain/stock';
import type { CustomerRequest, Grn, PackingList } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { grnResult, inboundStage, podResult } from '@/features/work-orders/api';
import { latency, protoDb } from '@/prototype/store';

/** Cross-job document views for the warehouse team (prototype adapter over work orders). */
export interface InboundRow {
  id: string;
  workOrderId: string;
  jobNumber: string;
  customerName: string;
  inboundNumber: string;
  reference: string;
  expectedAt: string;
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
function inbound(): InboundRow[] {
  return protoDb
    .get()
    .workOrders.flatMap((w) =>
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
function customerStock(): CustomerStockRow[] {
  return protoDb
    .get()
    .workOrders.filter((w) => w.inbounds.length > 0)
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

export function useCustomerStock() {
  return useQuery({ queryKey: ['warehouse', 'customer-stock'], queryFn: () => latency(customerStock()) });
}
