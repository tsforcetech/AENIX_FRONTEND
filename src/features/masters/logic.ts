import type { ProtoDb } from '@/prototype/store';

/**
 * Pure logic for the Masters area (no React, no store access): field parsing and validation,
 * the "where is this entry used" scan, the Excel upsert merge and the number-series example.
 * PROTOTYPE ONLY — the backend re-validates everything (API-DEP-47).
 */

export interface Option {
  value: string;
  label: string;
}

export type MasterRow = { id: string } & Record<string, unknown>;
/** Form state: text inputs as strings, check boxes as booleans. */
export type Draft = Record<string, string | boolean>;
export type Values = Record<string, string | number | boolean | undefined>;

export interface FieldCtx {
  db: ProtoDb;
  draft: Draft;
  row?: MasterRow;
}

export type FieldType = 'text' | 'code' | 'number' | 'select' | 'date' | 'checkbox';

export interface MasterField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  options?: (ctx: FieldCtx) => Option[];
  min?: number;
  max?: number;
  integer?: boolean;
  /** Shown as a percent, stored as a fraction (tax rate 5 → 0.05). */
  percentOfOne?: boolean;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  upper?: boolean;
  /** Clean up typed text before validation (e.g. turn "4410" into "•••• 4410"). */
  normalize?: (v: string) => string;
  /** Value must be unique in the master (case-insensitive). */
  unique?: boolean;
  /** Return a reason when the field cannot be changed on this existing row. */
  lockedWhen?: (row: MasterRow) => string | null;
  /** Default for a new entry. */
  initial?: (db: ProtoDb) => string | boolean;
  /** Excel column aliases (lower-case); false = not imported. */
  importAliases?: string[] | false;
  /** Hidden in the form (e.g. derived or fixed). */
  hidden?: boolean;
  /** Placeholder for empty select. */
  placeholder?: string;
}

export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,15}$/;

// ---------- Draft ↔ values ----------

export function draftOf(fields: MasterField[], row: MasterRow | undefined, db: ProtoDb): Draft {
  const d: Draft = {};
  for (const f of fields) {
    const v = row?.[f.key];
    if (f.type === 'checkbox') d[f.key] = row ? !!v : ((f.initial?.(db) as boolean | undefined) ?? false);
    else if (row === undefined) d[f.key] = (f.initial?.(db) as string | undefined) ?? '';
    else if (v === undefined || v === null) d[f.key] = '';
    else if (f.type === 'number' && f.percentOfOne) d[f.key] = String(round(Number(v) * 100, 4));
    else d[f.key] = String(v);
  }
  return d;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export function parseDraft(fields: MasterField[], draft: Draft): Values {
  const out: Values = {};
  for (const f of fields) {
    const raw = draft[f.key];
    if (f.type === 'checkbox') {
      out[f.key] = raw === true || (typeof raw === 'string' && /^(yes|y|true|1)$/i.test(raw.trim()));
      continue;
    }
    let s = typeof raw === 'string' ? raw.trim() : '';
    if (f.normalize && s) s = f.normalize(s);
    if (f.upper || f.type === 'code') s = s.toUpperCase();
    if (f.type === 'number') {
      if (s === '') out[f.key] = undefined;
      else {
        const n = Number(s.replace(/,/g, ''));
        out[f.key] = Number.isFinite(n) ? (f.percentOfOne ? round(n / 100, 6) : n) : Number.NaN;
      }
    } else out[f.key] = s === '' ? undefined : s;
  }
  return out;
}

/** Is `value` one of the options (by value or label, case-insensitive)? Returns the option value. */
export function matchOption(options: Option[], value: string): string | undefined {
  const v = value.trim().toLowerCase();
  return options.find((o) => o.value.toLowerCase() === v || o.label.toLowerCase() === v)?.value;
}

// ---------- Validation ----------

export interface ValidateCtx {
  db: ProtoDb;
  /** Other rows of the same master (uniqueness check). */
  rows: MasterRow[];
  /** Row being edited (undefined = new). */
  editing?: MasterRow;
  draft: Draft;
}

export function validateValues(
  fields: MasterField[],
  values: Values,
  ctx: ValidateCtx,
  extra?: (values: Values, ctx: ValidateCtx) => Record<string, string | undefined>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.hidden) continue;
    const v = values[f.key];
    if (f.type === 'checkbox') continue;
    if (v === undefined) {
      if (f.required) errors[f.key] = `Enter the ${f.label.toLowerCase()}`;
      continue;
    }
    if (f.type === 'number') {
      const n = v as number;
      const shown = f.percentOfOne ? n * 100 : n;
      if (Number.isNaN(n)) errors[f.key] = `${f.label} must be a number`;
      else if (f.integer && !Number.isInteger(shown)) errors[f.key] = `${f.label} must be a whole number`;
      else if (f.min !== undefined && shown < f.min) errors[f.key] = `${f.label} must be at least ${f.min}`;
      else if (f.max !== undefined && shown > f.max) errors[f.key] = `${f.label} must be ${f.max} or less`;
      continue;
    }
    const s = String(v);
    if (f.maxLength && s.length > f.maxLength) {
      errors[f.key] = `${f.label} can have up to ${f.maxLength} characters`;
      continue;
    }
    const pattern = f.pattern ?? (f.type === 'code' ? CODE_PATTERN : undefined);
    if (pattern && !pattern.test(s)) {
      errors[f.key] =
        f.patternMessage ?? `${f.label}: use capital letters, digits, dot, dash or underscore (max 16)`;
      continue;
    }
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      errors[f.key] = `${f.label} must be a date (YYYY-MM-DD)`;
      continue;
    }
    if (f.type === 'select' && f.options) {
      const opts = f.options({ db: ctx.db, draft: ctx.draft, row: ctx.editing });
      if (!opts.some((o) => o.value === s)) {
        errors[f.key] = `Choose a ${f.label.toLowerCase()} from the list`;
        continue;
      }
    }
    if (f.type === 'code' || f.unique) {
      const clash = ctx.rows.find(
        (r) => r.id !== ctx.editing?.id && String(r[f.key] ?? '').toLowerCase() === s.toLowerCase(),
      );
      if (clash) errors[f.key] = `${f.label} ${s} is already used`;
    }
  }
  if (extra) for (const [k, msg] of Object.entries(extra(values, ctx))) if (msg) errors[k] ??= msg;
  return errors;
}

// ---------- Changes (audit) ----------

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export function display(f: MasterField, v: unknown, db?: ProtoDb, draft: Draft = {}): string {
  if (v === undefined || v === null || v === '') return '—';
  if (f.type === 'checkbox') return v ? 'Yes' : 'No';
  if (f.type === 'number' && f.percentOfOne) return `${round(Number(v) * 100, 4)}%`;
  if (f.type === 'select' && f.options && db) {
    const label = f.options({ db, draft }).find((o) => o.value === String(v))?.label;
    if (label) return label;
  }
  return String(v);
}

export function diffChanges(
  fields: MasterField[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  db?: ProtoDb,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) {
    const a = before[f.key];
    const b = after[f.key];
    const same = f.type === 'checkbox' ? !!a === !!b : (a ?? '') === (b ?? '');
    if (!same) out.push({ field: f.label, from: display(f, a, db), to: display(f, b, db) });
  }
  return out;
}

// ---------- Where used ----------

const NOT_SCANNED = new Set([
  'serviceTypes',
  'unitsOfMeasure',
  'customerCategories',
  'vendorCategories',
  'places',
  'currencies',
  'taxCodes',
  'paymentTerms',
  'bankAccounts',
  'assetCategories',
  'reasonCodes',
  'numberSeries',
  'activity',
  'notifications',
  'approvalRequests',
]);

const LABELS: Record<string, [string, string]> = {
  workOrders: ['job', 'jobs'],
  customerRates: ['selling rate', 'selling rates'],
  vendorRates: ['buying rate', 'buying rates'],
  stockItems: ['stock lot', 'stock lots'],
  stockMovements: ['stock movement', 'stock movements'],
  salesOrders: ['sales order', 'sales orders'],
  purchaseOrders: ['purchase order', 'purchase orders'],
  vendorBills: ['vendor bill', 'vendor bills'],
  vendorPayments: ['vendor payment', 'vendor payments'],
  creditNotes: ['credit note', 'credit notes'],
  debitNotes: ['debit note', 'debit notes'],
  fixedAssets: ['fixed asset', 'fixed assets'],
  bankStatementLines: ['bank statement line', 'bank statement lines'],
  bankAccounts: ['bank account', 'bank accounts'],
  collections: ['receipt', 'receipts'],
  cycleCounts: ['cycle count', 'cycle counts'],
  warehouseLocations: ['bin location', 'bin locations'],
  ledgerAccounts: ['ledger account', 'ledger accounts'],
  stockAdjustments: ['stock adjustment', 'stock adjustments'],
  approvalRules: ['approval rule', 'approval rules'],
  accrualRuns: ['accrual run', 'accrual runs'],
  depreciationRuns: ['depreciation run', 'depreciation runs'],
};

export function collectionLabel(key: string, n: number): string {
  const l = LABELS[key];
  if (l) return n === 1 ? l[0] : l[1];
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return n === 1 && words.endsWith('s') ? words.slice(0, -1) : words;
}

function hasRef(
  o: unknown,
  fields: readonly string[],
  match: (v: unknown) => boolean,
  depth: number,
): boolean {
  if (depth > 5 || o === null || typeof o !== 'object') return false;
  if (Array.isArray(o)) return o.some((x) => hasRef(x, fields, match, depth + 1));
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (fields.includes(k) && match(v)) return true;
    if (v !== null && typeof v === 'object' && hasRef(v, fields, match, depth + 1)) return true;
  }
  return false;
}

/**
 * Count records (per collection) that reference a value in one of the given fields, at any depth
 * (document lines included). `only` limits the scan to named collections (masters included).
 */
export function scanRefs(
  db: ProtoDb,
  fields: readonly string[],
  match: (v: unknown) => boolean,
  only?: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, list] of Object.entries(db as unknown as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    if (only ? !only.includes(k) : NOT_SCANNED.has(k)) continue;
    const n = list.filter((rec) => hasRef(rec, fields, match, 0)).length;
    if (n) out[k] = n;
  }
  return out;
}

export function describeRefs(...counts: Record<string, number>[]): string[] {
  const merged: Record<string, number> = {};
  for (const c of counts) for (const [k, n] of Object.entries(c)) merged[k] = (merged[k] ?? 0) + n;
  return Object.entries(merged).map(([k, n]) => `${n} ${collectionLabel(k, n)}`);
}

/** Case-insensitive text match helper for `scanRefs`. */
export const sameText =
  (...targets: (string | number | undefined)[]) =>
  (v: unknown) =>
    (typeof v === 'string' || typeof v === 'number') &&
    targets.some((t) => t !== undefined && String(t).toLowerCase() === String(v).toLowerCase());

// ---------- Excel import (upsert by code) ----------

export interface ImportResult {
  rows: MasterRow[];
  added: MasterRow[];
  updated: { before: MasterRow; after: MasterRow; changes: FieldChange[] }[];
  skipped: { line: number; code: string; reason: string }[];
}

export interface MergeOptions {
  fields: MasterField[];
  codeKey: string;
  db: ProtoDb;
  /** New entries allowed (false: only existing codes are updated). */
  canAdd: boolean;
  newId: () => string;
  /** Extra defaults for a new row (e.g. active: true). */
  defaults: Record<string, unknown>;
  extraValidate?: (values: Values, ctx: ValidateCtx) => Record<string, string | undefined>;
  /** Called with each merged row before validation (e.g. keep a base currency's rate). */
  fix?: (next: MasterRow, before: MasterRow | undefined) => MasterRow;
}

/**
 * Merge imported spreadsheet rows into a master: match on code (case-insensitive); existing
 * entries take only the columns present in the file (locked fields keep their value); new codes
 * are added. Invalid or unchanged lines are skipped with the reason.
 */
export function mergeImport(
  current: MasterRow[],
  imported: Record<string, string | number>[],
  o: MergeOptions,
): ImportResult {
  let rows = [...current];
  const res: ImportResult = { rows, added: [], updated: [], skipped: [] };
  imported.forEach((line, i) => {
    const lineNo = i + 2;
    const code = String(line[o.codeKey] ?? '')
      .trim()
      .toUpperCase();
    if (!code) return res.skipped.push({ line: lineNo, code: '—', reason: 'No code' });
    const existing = rows.find((r) => String(r[o.codeKey]).toUpperCase() === code);
    if (!existing && !o.canAdd)
      return res.skipped.push({ line: lineNo, code, reason: 'Not in the list (only updates allowed)' });
    const draft = draftOf(o.fields, existing, o.db);
    for (const f of o.fields) {
      if (!(f.key in line) || f.importAliases === false) continue;
      if (existing && f.key === o.codeKey) continue;
      if (existing && f.lockedWhen?.(existing)) continue;
      const raw = String(line[f.key]).trim();
      if (f.type === 'select' && f.options) {
        const opt = matchOption(f.options({ db: o.db, draft, row: existing }), raw);
        draft[f.key] = opt ?? raw;
      } else if (f.type === 'checkbox') draft[f.key] = /^(yes|y|true|1)$/i.test(raw);
      else draft[f.key] = raw;
    }
    draft[o.codeKey] = existing ? String(existing[o.codeKey]) : code;
    const values = parseDraft(o.fields, draft);
    const errors = validateValues(
      o.fields,
      values,
      { db: o.db, rows, editing: existing, draft },
      o.extraValidate,
    );
    const firstError = Object.values(errors)[0];
    if (firstError) return res.skipped.push({ line: lineNo, code, reason: firstError });
    let next: MasterRow = existing ? { ...existing, ...values } : { id: o.newId(), ...o.defaults, ...values };
    if (o.fix) next = o.fix(next, existing);
    if (existing) {
      const changes = diffChanges(o.fields, existing, next, o.db);
      if (!changes.length) return res.skipped.push({ line: lineNo, code, reason: 'No change' });
      rows = rows.map((r) => (r.id === existing.id ? next : r));
      res.updated.push({ before: existing, after: next, changes });
    } else {
      rows = [...rows, next];
      res.added.push(next);
    }
  });
  res.rows = rows;
  return res;
}

// ---------- Number series ----------

/** Next document number shown as an example, e.g. "INV-2026-0012" or "QT-1090". */
export function seriesExample(
  s: { prefix: string; digits: number; nextNumber: number; resetYearly: boolean },
  year: number,
): string {
  const n = String(Math.max(1, Math.floor(s.nextNumber))).padStart(Math.max(1, s.digits), '0');
  if (!s.resetYearly) return `${s.prefix}${n}`;
  const sep = /[-/]$/.test(s.prefix) || s.prefix === '' ? '' : '-';
  return `${s.prefix}${sep}${year}-${n}`;
}

/** Masked bank number: a bare "1234" becomes "•••• 1234"; anything else is kept as typed. */
export function maskNumber(v: string, lead = '••••'): string {
  const t = v.trim();
  if (/^\d{4}$/.test(t)) return `${lead} ${t}`;
  return t;
}

export const tooManyDigits = (v: string) => (v.match(/\d/g)?.length ?? 0) > 4;
