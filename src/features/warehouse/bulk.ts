/**
 * Bulk Excel upload from the warehouse screen: converts imported rows into document lines.
 * Rows with the same SKU (and batch) are added together; rows without a SKU or quantity are skipped.
 */
import type { DocLine, Grn, Pod } from '@/domain/types';
import type { ImportedRow } from '@/shared/ui/SpreadsheetImport';

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const optional = (v: unknown) => text(v) || undefined;

export type BulkDocType = 'PL' | 'GRN' | 'REQUEST' | 'POD';

export function rowsToDocLines(rows: readonly ImportedRow[]): DocLine[] {
  const map = new Map<string, DocLine>();
  for (const r of rows) {
    const sku = text(r.sku).toUpperCase();
    const qty = num(r.quantity);
    if (!sku || qty <= 0) continue;
    const key = `${sku}|${text(r.batch)}`;
    const prev = map.get(key);
    const cbm = num(r.cbm);
    map.set(key, {
      sku,
      description: prev?.description || text(r.description) || sku,
      quantity: (prev?.quantity ?? 0) + qty,
      uom: prev?.uom || text(r.uom) || 'Pcs',
      barcode: prev?.barcode ?? optional(r.barcode),
      batch: prev?.batch ?? optional(r.batch),
      productionDate: prev?.productionDate ?? optional(r.productionDate),
      expiryDate: prev?.expiryDate ?? optional(r.expiryDate),
      cbm: cbm || prev?.cbm ? Math.round(((prev?.cbm ?? 0) + cbm) * 1000) / 1000 : undefined,
    });
  }
  return [...map.values()];
}

export function rowsToGrnLines(rows: readonly ImportedRow[]): Grn['lines'] {
  const map = new Map<string, Grn['lines'][number]>();
  for (const r of rows) {
    const sku = text(r.sku).toUpperCase();
    if (!sku) continue;
    const received = num(r.receivedQty);
    const damaged = num(r.damagedQty);
    if (received <= 0 && damaged <= 0) continue;
    const key = `${sku}|${text(r.batch)}`;
    const prev = map.get(key);
    map.set(key, {
      sku,
      receivedQty: (prev?.receivedQty ?? 0) + received,
      damagedQty: (prev?.damagedQty ?? 0) + damaged,
      remarks: [prev?.remarks, optional(r.remarks)].filter(Boolean).join('; ') || undefined,
      batch: prev?.batch ?? optional(r.batch),
      productionDate: prev?.productionDate ?? optional(r.productionDate),
      expiryDate: prev?.expiryDate ?? optional(r.expiryDate),
      cbm: num(r.cbm) || prev?.cbm ? Math.round(((prev?.cbm ?? 0) + num(r.cbm)) * 1000) / 1000 : undefined,
    });
  }
  return [...map.values()];
}

export function rowsToPodLines(rows: readonly ImportedRow[]): Pod['lines'] {
  const map = new Map<string, Pod['lines'][number]>();
  for (const r of rows) {
    const sku = text(r.sku).toUpperCase();
    const qty = num(r.deliveredQty);
    if (!sku || qty < 0) continue;
    const prev = map.get(sku);
    map.set(sku, {
      sku,
      deliveredQty: (prev?.deliveredQty ?? 0) + qty,
      remarks: [prev?.remarks, optional(r.remarks)].filter(Boolean).join('; ') || undefined,
    });
  }
  return [...map.values()];
}

export function totalUnits(
  lines: readonly { quantity?: number; receivedQty?: number; deliveredQty?: number }[],
) {
  return lines.reduce((s, l) => s + (l.quantity ?? l.receivedQty ?? l.deliveredQty ?? 0), 0);
}
