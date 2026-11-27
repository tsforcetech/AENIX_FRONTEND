import type { CustomerRequest, DocLine, Inbound } from './types';

/**
 * Running stock for a warehouse job (prototype display maths; the backend stock ledger is the authority).
 * received  = Σ good quantity on uploaded GRNs (received − damaged)
 * delivered = Σ delivered quantity on PODs
 * reserved  = Σ requested quantity on open requests (not yet delivered)
 * onHand    = received − delivered;  available = onHand − reserved  (never below 0 for a new request)
 */
export interface StockLine {
  sku: string;
  description: string;
  uom: string;
  received: number;
  damaged: number;
  delivered: number;
  reserved: number;
  onHand: number;
  available: number;
}

const key = (sku: string) => sku.trim().toUpperCase();

export function jobStock(
  job: { inbounds: Inbound[]; customerRequests: CustomerRequest[] },
  excludeRequestId?: string,
): StockLine[] {
  const map = new Map<string, StockLine>();
  const get = (l: Pick<DocLine, 'sku'> & Partial<DocLine>) => {
    const k = key(l.sku);
    let row = map.get(k);
    if (!row) {
      row = {
        sku: k,
        description: l.description ?? '—',
        uom: l.uom ?? '',
        received: 0,
        damaged: 0,
        delivered: 0,
        reserved: 0,
        onHand: 0,
        available: 0,
      };
      map.set(k, row);
    }
    if (row.description === '—' && l.description) row.description = l.description;
    if (!row.uom && l.uom) row.uom = l.uom;
    return row;
  };
  for (const ib of job.inbounds) {
    for (const l of ib.packingList.lines) get(l); // known SKUs appear even before receipt
    for (const g of ib.grn?.lines ?? []) {
      const pl = ib.packingList.lines.find((x) => key(x.sku) === key(g.sku));
      const row = get({ sku: g.sku, description: pl?.description, uom: pl?.uom });
      row.received += g.receivedQty - g.damagedQty;
      row.damaged += g.damagedQty;
    }
  }
  for (const r of job.customerRequests) {
    if (r.id === excludeRequestId) continue;
    if (r.pod) {
      for (const p of r.pod.lines) get({ sku: p.sku }).delivered += p.deliveredQty;
    } else if (r.status !== 'Closed') {
      for (const l of r.lines) get(l).reserved += l.quantity;
    }
  }
  return [...map.values()].map((s) => {
    const onHand = s.received - s.delivered;
    return { ...s, onHand, available: onHand - s.reserved };
  });
}
