/**
 * FLOW-003 W4/W5/W8 — warehouse floor maths (prototype display logic; the backend WMS is the authority).
 * Pure functions: bin occupancy, put-away suggestion, expiry alerts and count differences.
 */
import { daysUntil } from '@/domain/controls';
import type { IsoDate, StockItem, WarehouseLocation } from '@/domain/types';

export interface LocationOccupancy {
  location: WarehouseLocation;
  used: number;
  free: number;
  /** 0–100 (can exceed 100 when a bin is over-filled). */
  pct: number;
  lots: number;
}

/** True when this stock lot sits in this bin (lot-level stock uses `locationId`; older stock only the code). */
export function isInLocation(
  lot: Pick<StockItem, 'locationId' | 'location'>,
  loc: WarehouseLocation,
): boolean {
  return lot.locationId ? lot.locationId === loc.id : lot.location.toUpperCase() === loc.code.toUpperCase();
}

/** Pallets used vs capacity per bin (only lots with stock on hand take space). */
export function occupancy(
  locations: readonly WarehouseLocation[],
  stock: readonly StockItem[],
  extra?: ReadonlyMap<string, number>,
): LocationOccupancy[] {
  return locations.map((location) => {
    const lots = stock.filter((s) => s.qtyOnHand > 0 && isInLocation(s, location));
    const used = lots.reduce((s, l) => s + l.pallets, 0) + (extra?.get(location.id) ?? 0);
    return {
      location,
      used,
      free: Math.max(0, location.capacityPallets - used),
      pct: location.capacityPallets > 0 ? Math.round((used / location.capacityPallets) * 100) : 0,
      lots: lots.length,
    };
  });
}

/**
 * Put-away suggestion for one received line:
 * - returns (and damaged goods) go to a Quarantine bin;
 * - otherwise the bin already holding the same SKU for the same customer, if it has space;
 * - otherwise the first Ambient bin with space (by code), then any Bulk floor bin with space.
 * `planned` holds pallets already assigned earlier in the same put-away (so lines do not overfill a bin).
 */
export function suggestPutaway(
  line: { sku: string; customerId: string; pallets: number; quarantine?: boolean },
  locations: readonly WarehouseLocation[],
  stock: readonly StockItem[],
  planned?: ReadonlyMap<string, number>,
): WarehouseLocation | undefined {
  const occ = occupancy(
    locations.filter((l) => l.active),
    stock,
    planned,
  ).sort((a, b) => a.location.code.localeCompare(b.location.code));
  const fits = (o: LocationOccupancy) => o.free >= line.pallets;
  if (line.quarantine) {
    const q = occ.filter((o) => o.location.zone === 'Quarantine');
    return (q.find(fits) ?? q[0])?.location;
  }
  const sku = line.sku.trim().toUpperCase();
  const same = occ.find(
    (o) =>
      o.location.zone !== 'Quarantine' &&
      o.location.zone !== 'Dispatch' &&
      stock.some(
        (s) =>
          s.qtyOnHand > 0 &&
          s.sku.toUpperCase() === sku &&
          s.customerId === line.customerId &&
          isInLocation(s, o.location),
      ) &&
      fits(o),
  );
  if (same) return same.location;
  return (
    occ.find((o) => o.location.zone === 'Ambient' && fits(o)) ??
    occ.find((o) => o.location.zone === 'Bulk floor' && fits(o))
  )?.location;
}

/** Default pallet estimate for a received quantity when the GRN does not say. */
export const DEFAULT_UNITS_PER_PALLET = 50;
export function estimatePallets(qty: number, unitsPerPallet = DEFAULT_UNITS_PER_PALLET): number {
  return qty > 0 ? Math.max(1, Math.ceil(qty / unitsPerPallet)) : 0;
}

export type ExpiryState = 'Expired' | 'Expiring' | 'OK' | 'No expiry';
export const EXPIRY_WINDOW_DAYS = 30;

/** Expired (date passed), Expiring (within 30 days), OK, or No expiry. */
export function expiryState(expiry: IsoDate | undefined, today: IsoDate, windowDays = EXPIRY_WINDOW_DAYS) {
  if (!expiry) return 'No expiry' as ExpiryState;
  const days = daysUntil(expiry, today);
  return (days < 0 ? 'Expired' : days <= windowDays ? 'Expiring' : 'OK') as ExpiryState;
}

/** Counted − system for a cycle-count line (undefined while not counted). */
export function countDifference(line: { systemQty: number; countedQty?: number }): number | undefined {
  return line.countedQty === undefined ? undefined : line.countedQty - line.systemQty;
}

/** Largest absolute difference on a count — compared with the 'Stock adjustment (qty)' threshold. */
export function maxCountDifference(lines: readonly { systemQty: number; countedQty?: number }[]): number {
  return lines.reduce((m, l) => Math.max(m, Math.abs(countDifference(l) ?? 0)), 0);
}
