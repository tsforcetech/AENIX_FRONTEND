import type { ApprovalRule, CompanyProfile } from '@/domain/types';
import {
  describeRule,
  exampleNumber,
  ruleChanges,
  systemChanges,
  thresholdUnit,
  validateRules,
} from './system';

const rule = (over: Partial<ApprovalRule> = {}): ApprovalRule => ({
  id: 'r1',
  docType: 'Payment voucher',
  threshold: 20000,
  approverRole: 'Finance manager',
  active: true,
  ...over,
});

describe('approval matrix editor', () => {
  it('picks the threshold unit from the document type', () => {
    expect(thresholdUnit('Quotation discount %')).toBe('%');
    expect(thresholdUnit('Quotation margin % below')).toBe('%');
    expect(thresholdUnit('Stock adjustment (qty)')).toBe('qty');
    expect(thresholdUnit('Payment voucher')).toBe('AED');
  });

  it('describes rules in plain English', () => {
    expect(describeRule(rule())).toBe('Payment voucher: at AED 20,000 or more → Finance manager');
    expect(describeRule(rule({ docType: 'Write-off', threshold: 0, approverRole: 'General manager' }))).toBe(
      'Write-off: always → General manager',
    );
    expect(describeRule(rule({ docType: 'Quotation margin % below', threshold: 12 }))).toMatch(
      /when margin is below 12%/,
    );
  });

  it('validates thresholds per unit and duplicates', () => {
    expect(validateRules([rule()])).toEqual({});
    expect(validateRules([rule({ threshold: -1 })]).r1).toMatch(/0 or more/);
    expect(validateRules([rule({ docType: 'Quotation discount %', threshold: 120 })]).r1).toMatch(/100/);
    expect(validateRules([rule({ docType: 'Stock adjustment (qty)', threshold: 2.5 })]).r1).toMatch(/whole/);
    expect(validateRules([rule(), rule({ id: 'r2' })]).r2).toMatch(/twice/);
  });

  it('lists added, changed, toggled and removed rules', () => {
    const before = [rule(), rule({ id: 'r2', docType: 'Expense', threshold: 5000 })];
    const after = [rule({ threshold: 25000, active: false }), rule({ id: 'r3', docType: 'Credit note' })];
    expect(ruleChanges(before, after).map((c) => c.field)).toEqual([
      'Rule changed',
      'Rule active (Payment voucher)',
      'Rule added',
      'Rule removed',
    ]);
  });
});

describe('numbering example (X4)', () => {
  const nums = ['AEN077', 'AEN078', 'AEN-2026-004'];
  it('continues the running sequence', () => {
    expect(exampleNumber('AEN', false, 2026, nums)).toBe('AEN079');
  });
  it('restarts per year', () => {
    expect(exampleNumber('AEN', true, 2026, nums)).toBe('AEN-2026-005');
    expect(exampleNumber('AEN', true, 2027, nums)).toBe('AEN-2027-001');
  });
});

describe('systemChanges', () => {
  it('lists switch and channel changes', () => {
    const base = {
      numberingResetYearly: false,
      modules: { ownFleet: true, ownWarehouseFloor: true, multiCurrency: false },
      notificationChannels: { 'GRN ready': { email: true, whatsapp: false, inApp: true } },
    } as unknown as CompanyProfile;
    const next = {
      ...base,
      numberingResetYearly: true,
      modules: { ...base.modules!, ownFleet: false },
      notificationChannels: { 'GRN ready': { email: true, whatsapp: true, inApp: true } },
    } as CompanyProfile;
    expect(systemChanges(base, next)).toEqual([
      { field: 'Restart numbers every year', from: 'No', to: 'Yes' },
      { field: 'Module: Own fleet', from: 'Yes', to: 'No' },
      { field: 'Notify "GRN ready" by WhatsApp', from: 'No', to: 'Yes' },
    ]);
  });
});
