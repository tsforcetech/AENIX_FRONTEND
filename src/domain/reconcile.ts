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

// ---------- A13: bank reconciliation auto-match ----------
export interface BankLineLike {
  id: string;
  date: string;
  reference: string;
  description: string;
  /** + money in, − money out. */
  amount: number;
}

export interface BookItem {
  kind: 'Receipt' | 'Payment' | 'Expense';
  id: string;
  ref: string;
  /** Other references that may appear on the statement (bank / cheque reference). */
  refs: string[];
  date: string;
  /** Signed like the statement: + receipts, − payments / expenses. */
  amount: number;
}

export interface BankMatch {
  lineId: string;
  item: BookItem;
  rule: 'Amount + reference' | 'Amount + date';
}

const normRef = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

function refsOverlap(line: BankLineLike, item: BookItem): boolean {
  const hay = normRef(`${line.reference} ${line.description}`);
  const lineRef = normRef(line.reference);
  return [item.ref, ...item.refs]
    .map(normRef)
    .filter((r) => r.length >= 4)
    .some((r) => hay.includes(r) || (lineRef.length >= 4 && r.includes(lineRef)));
}

/**
 * Auto-match statement lines to book items. Pass 1: same amount and a shared reference.
 * Pass 2: same amount, the only candidate with that amount, dated within `days` days.
 * Each line and each book item is used at most once.
 */
export function autoMatchBank(
  lines: readonly BankLineLike[],
  items: readonly BookItem[],
  days = 5,
): BankMatch[] {
  const used = new Set<string>();
  const matched = new Set<string>();
  const out: BankMatch[] = [];
  const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
  for (const line of lines) {
    const hit = items.find((it) => !used.has(it.id) && same(it.amount, line.amount) && refsOverlap(line, it));
    if (hit) {
      used.add(hit.id);
      matched.add(line.id);
      out.push({ lineId: line.id, item: hit, rule: 'Amount + reference' });
    }
  }
  for (const line of lines) {
    if (matched.has(line.id)) continue;
    const cands = items.filter((it) => !used.has(it.id) && same(it.amount, line.amount));
    const near = cands.filter(
      (it) => Math.abs(Date.parse(it.date) - Date.parse(line.date)) <= days * 86_400_000,
    );
    if (cands.length === 1 && near.length === 1) {
      used.add(near[0]!.id);
      matched.add(line.id);
      out.push({ lineId: line.id, item: near[0]!, rule: 'Amount + date' });
    }
  }
  return out;
}
