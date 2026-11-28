/**
 * FLOW-003 W14 — handling charges proposed from warehouse activity on a job
 * (verified GRNs = handling in, closed PODs = handling out). Pure display / proposal logic;
 * the backend billing engine is the authority.
 */
import type { Cargo, PriceLine, WorkOrder } from '@/domain/types';

export const HANDLING_SERVICE_ID = 'svc-8';

export interface HandlingDoc {
  ref: string;
  direction: 'In' | 'Out';
  date: string;
  units: number;
  uom: string;
}

export interface HandlingRate {
  unitPrice: number;
  unitCost: number;
  unit: string;
}

export interface HandlingProposal extends HandlingDoc {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitCost: number;
  amount: number;
  /** True when pallets were estimated from the job's cargo (units per pallet). */
  estimated: boolean;
  /** Pallet-rated handling but pallets are unknown: quantity is in units — check before adding. */
  checkQuantity: boolean;
}

/** Units per pallet from the job cargo, e.g. 300 packages on "12 pallets" → 25. */
export function unitsPerPalletFromCargo(cargo: Pick<Cargo, 'packages' | 'equipment'>): number | undefined {
  const m = /(\d+)\s*pallet/i.exec(cargo.equipment ?? '');
  const pallets = m ? Number(m[1]) : 0;
  return pallets > 0 && cargo.packages > 0 ? cargo.packages / pallets : undefined;
}

/** Verified GRNs (in) and closed PODs (out) on a job. */
export function handlingDocs(wo: Pick<WorkOrder, 'inbounds' | 'customerRequests'>): HandlingDoc[] {
  const docs: HandlingDoc[] = [];
  for (const ib of wo.inbounds) {
    if (ib.grn?.status !== 'Verified') continue;
    docs.push({
      ref: ib.grn.number,
      direction: 'In',
      date: ib.grn.receivedAt,
      units: ib.grn.lines.reduce((s, l) => s + Math.max(0, l.receivedQty - l.damagedQty), 0),
      uom: ib.packingList.lines[0]?.uom ?? 'Unit',
    });
  }
  for (const r of wo.customerRequests) {
    if (r.status !== 'Closed' || !r.pod) continue;
    docs.push({
      ref: r.pod.number,
      direction: 'Out',
      date: r.pod.deliveredAt,
      units: r.pod.lines.reduce((s, l) => s + l.deliveredQty, 0),
      uom: r.lines[0]?.uom ?? 'Unit',
    });
  }
  return docs;
}

const isPallet = (unit: string) => /pallet/i.test(unit);

/**
 * One proposed charge line per document not billed yet. A document counts as billed when an
 * existing job line's description contains its number. Pallet-rated handling uses pallets
 * (estimated from the cargo's units per pallet); otherwise the document's units.
 */
export function proposeHandlingCharges(
  docs: readonly HandlingDoc[],
  existing: readonly Pick<PriceLine, 'description'>[],
  rate: HandlingRate,
  unitsPerPallet?: number,
): HandlingProposal[] {
  return docs
    .filter((d) => d.units > 0 && !existing.some((l) => l.description.includes(d.ref)))
    .map((d) => {
      const byPallet = isPallet(rate.unit) && !!unitsPerPallet;
      const quantity = byPallet ? Math.max(1, Math.ceil(d.units / unitsPerPallet!)) : d.units;
      return {
        ...d,
        description: `Handling ${d.direction === 'In' ? 'in' : 'out'} — ${d.ref}`,
        quantity,
        unit: rate.unit,
        unitPrice: rate.unitPrice,
        unitCost: rate.unitCost,
        amount: Math.round(quantity * rate.unitPrice * 100) / 100,
        estimated: byPallet,
        checkQuantity: isPallet(rate.unit) && !byPallet,
      };
    });
}
