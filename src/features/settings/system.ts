import type { ApprovalDocType, ApprovalRule, CompanyProfile } from '@/domain/types';
import { seqOf } from '@/domain/numbering';

// ---------- Settings tabs (URL `?tab=`) ----------
export const SETTINGS_TABS = ['users', 'roles', 'approvals', 'company'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

// ---------- X2: approval matrix editor ----------
export type ThresholdUnit = 'AED' | '%' | 'qty';

export function thresholdUnit(docType: ApprovalDocType): ThresholdUnit {
  if (docType === 'Quotation discount %' || docType === 'Quotation margin % below') return '%';
  if (docType === 'Stock adjustment (qty)') return 'qty';
  return 'AED';
}

/** Plain-English reading of a rule, e.g. "Payment voucher of AED 20,000 or more → Finance manager". */
export function describeRule(r: Pick<ApprovalRule, 'docType' | 'threshold' | 'approverRole'>): string {
  const unit = thresholdUnit(r.docType);
  const v = r.threshold.toLocaleString('en-US');
  const amount = unit === 'AED' ? `AED ${v}` : unit === '%' ? `${v}%` : `${v} units`;
  const when =
    r.threshold === 0 && r.docType !== 'Quotation margin % below'
      ? 'always'
      : r.docType === 'Quotation margin % below'
        ? `when margin is below ${amount}`
        : `at ${amount} or more`;
  return `${r.docType}: ${when} → ${r.approverRole}`;
}

/** Returns an error per rule id (empty object = valid). */
export function validateRules(rules: readonly ApprovalRule[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const r of rules) {
    const unit = thresholdUnit(r.docType);
    if (!Number.isFinite(r.threshold) || r.threshold < 0) errors[r.id] = 'Threshold must be 0 or more.';
    else if (unit === '%' && r.threshold > 100) errors[r.id] = 'A percentage cannot be more than 100.';
    else if (unit === 'qty' && !Number.isInteger(r.threshold))
      errors[r.id] = 'Quantity must be a whole number.';
    const key = `${r.docType}|${r.threshold}|${r.approverRole}`;
    if (r.active && seen.has(key)) errors[r.id] = 'Same rule appears twice.';
    if (r.active) seen.add(key);
  }
  return errors;
}

// ---------- X4: numbering ----------
/** Example of the next invoice number under the chosen numbering scheme. */
export function exampleNumber(
  prefix: string,
  resetYearly: boolean,
  year: number,
  existingNumbers: readonly string[],
): string {
  if (resetYearly) {
    const thisYear = existingNumbers
      .filter((n) => n.startsWith(`${prefix}-${year}-`))
      .map(seqOf)
      .reduce((m, s) => Math.max(m, s), 0);
    return `${prefix}-${year}-${String(thisYear + 1).padStart(3, '0')}`;
  }
  const max = existingNumbers
    .filter((n) => n.startsWith(prefix) && !/^\D+-\d{4}-/.test(n))
    .map(seqOf)
    .reduce((m, s) => Math.max(m, s), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ---------- X3: change list for the audit log ----------
type Change = { field: string; from: string; to: string };
const yesNo = (b: boolean | undefined) => (b ? 'Yes' : 'No');

export const MODULE_LABELS: Record<keyof NonNullable<CompanyProfile['modules']>, string> = {
  ownFleet: 'Own fleet',
  ownWarehouseFloor: 'Own warehouse floor',
  multiCurrency: 'Multi-currency',
};

export const CHANNEL_LABELS = { email: 'Email', whatsapp: 'WhatsApp', inApp: 'In-app' } as const;

export function systemChanges(before: CompanyProfile, after: CompanyProfile): Change[] {
  const out: Change[] = [];
  if (!!before.numberingResetYearly !== !!after.numberingResetYearly)
    out.push({
      field: 'Restart numbers every year',
      from: yesNo(before.numberingResetYearly),
      to: yesNo(after.numberingResetYearly),
    });
  for (const key of Object.keys(MODULE_LABELS) as (keyof typeof MODULE_LABELS)[]) {
    const a = before.modules?.[key];
    const b = after.modules?.[key];
    if (!!a !== !!b) out.push({ field: `Module: ${MODULE_LABELS[key]}`, from: yesNo(a), to: yesNo(b) });
  }
  const events = new Set([
    ...Object.keys(before.notificationChannels ?? {}),
    ...Object.keys(after.notificationChannels ?? {}),
  ]);
  for (const ev of events) {
    for (const ch of Object.keys(CHANNEL_LABELS) as (keyof typeof CHANNEL_LABELS)[]) {
      const a = before.notificationChannels?.[ev]?.[ch];
      const b = after.notificationChannels?.[ev]?.[ch];
      if (!!a !== !!b)
        out.push({ field: `Notify "${ev}" by ${CHANNEL_LABELS[ch]}`, from: yesNo(a), to: yesNo(b) });
    }
  }
  return out;
}

export function ruleChanges(before: readonly ApprovalRule[], after: readonly ApprovalRule[]): Change[] {
  const out: Change[] = [];
  const prev = new Map(before.map((r) => [r.id, r]));
  const next = new Map(after.map((r) => [r.id, r]));
  for (const r of after) {
    const p = prev.get(r.id);
    if (!p) {
      out.push({ field: 'Rule added', from: '', to: describeRule(r) });
      continue;
    }
    if (p.docType !== r.docType || p.threshold !== r.threshold || p.approverRole !== r.approverRole)
      out.push({ field: 'Rule changed', from: describeRule(p), to: describeRule(r) });
    if (p.active !== r.active)
      out.push({ field: `Rule active (${r.docType})`, from: yesNo(p.active), to: yesNo(r.active) });
  }
  for (const p of before)
    if (!next.has(p.id)) out.push({ field: 'Rule removed', from: describeRule(p), to: '' });
  return out;
}
