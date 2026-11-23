import type { DocLine } from './types';

/**
 * Line-by-line comparison used for PL vs GRN (inbound) and customer request vs POD (outbound).
 * Matching is by SKU. Display logic only; the backend will own the authoritative reconciliation.
 */
export type ReconStatus = 'Match' | 'Short' | 'Excess' | 'Not received' | 'Not expected';

export interface ReconRow {
  sku: string;
  description: string;
  uom: string;
  expected: number;
  actual: number;
  damaged: number;
  variance: number;
  status: ReconStatus;
  remarks?: string;
}

export interface ReconResult {
  rows: ReconRow[];
  expectedTotal: number;
  actualTotal: number;
  mismatches: number;
  ok: boolean;
}

export function reconcile(
  expected: DocLine[],
  actual: { sku: string; qty: number; damaged?: number; remarks?: string }[],
): ReconResult {
  const actualBySku = new Map<string, { qty: number; damaged: number; remarks?: string }>();
  for (const a of actual) {
    const prev = actualBySku.get(a.sku);
    actualBySku.set(a.sku, {
      qty: (prev?.qty ?? 0) + a.qty,
      damaged: (prev?.damaged ?? 0) + (a.damaged ?? 0),
      remarks: a.remarks ?? prev?.remarks,
    });
  }
  const rows: ReconRow[] = expected.map((e) => {
    const a = actualBySku.get(e.sku);
    actualBySku.delete(e.sku);
    const got = a?.qty ?? 0;
    const variance = got - e.quantity;
    const status: ReconStatus = !a
      ? 'Not received'
      : variance === 0
        ? 'Match'
        : variance < 0
          ? 'Short'
          : 'Excess';
    return {
      sku: e.sku,
      description: e.description,
      uom: e.uom,
      expected: e.quantity,
      actual: got,
      damaged: a?.damaged ?? 0,
      variance,
      status,
      remarks: a?.remarks,
    };
  });
  for (const [sku, a] of actualBySku) {
    rows.push({
      sku,
      description: '—',
      uom: '',
      expected: 0,
      actual: a.qty,
      damaged: a.damaged,
      variance: a.qty,
      status: 'Not expected',
      remarks: a.remarks,
    });
  }
  const mismatches = rows.filter((r) => r.status !== 'Match' || r.damaged > 0).length;
  return {
    rows,
    expectedTotal: rows.reduce((s, r) => s + r.expected, 0),
    actualTotal: rows.reduce((s, r) => s + r.actual, 0),
    mismatches,
    ok: mismatches === 0,
  };
}
