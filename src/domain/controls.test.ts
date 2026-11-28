import { describe, expect, it } from 'vitest';
import { approvalRuleFor, assertOpenPeriod, creditCheck, lineAmount, suggestPicks, toAed } from './controls';
import type { ApprovalRule, StockItem } from './types';

describe('creditCheck', () => {
  const customer = { name: 'Acme', creditLimit: 100_000, status: 'Active' as const };
  it('passes inside the limit', () => {
    expect(
      creditCheck({ customer, openBalance: 40_000, uninvoicedOrders: 20_000, orderValue: 30_000 }).blocked,
    ).toBe(false);
  });
  it('blocks over the limit and on hold', () => {
    const r = creditCheck({
      customer: { ...customer, status: 'On hold' },
      openBalance: 90_000,
      uninvoicedOrders: 0,
      orderValue: 20_000,
    });
    expect(r.blocked).toBe(true);
    expect(r.reasons).toHaveLength(2);
    expect(r.available).toBe(-10_000);
  });
  it('blocks long-overdue customers', () => {
    expect(
      creditCheck({ customer, openBalance: 0, uninvoicedOrders: 0, orderValue: 1, oldestOverdueDays: 45 })
        .blocked,
    ).toBe(true);
  });
});

describe('approvalRuleFor', () => {
  const rules: ApprovalRule[] = [
    { id: '1', docType: 'Payment voucher', threshold: 20_000, approverRole: 'Finance manager', active: true },
    {
      id: '2',
      docType: 'Quotation margin % below',
      threshold: 12,
      approverRole: 'Sales manager',
      active: true,
    },
    { id: '3', docType: 'Write-off', threshold: 0, approverRole: 'General manager', active: false },
  ];
  it('matches thresholds', () => {
    expect(approvalRuleFor(rules, 'Payment voucher', 19_999)).toBeUndefined();
    expect(approvalRuleFor(rules, 'Payment voucher', 20_000)?.approverRole).toBe('Finance manager');
    expect(approvalRuleFor(rules, 'Quotation margin % below', 8)).toBeDefined();
    expect(approvalRuleFor(rules, 'Quotation margin % below', 15)).toBeUndefined();
    expect(approvalRuleFor(rules, 'Write-off', 100)).toBeUndefined();
  });
});

describe('period lock, currency, minimum charge', () => {
  it('rejects postings in a closed period', () => {
    expect(() => assertOpenPeriod({ lockedUntil: '2026-09-30' }, '2026-09-30')).toThrow(/closed/);
    expect(() => assertOpenPeriod({ lockedUntil: '2026-09-30' }, '2026-10-01')).not.toThrow();
  });
  it('converts to AED', () => {
    expect(toAed(100, 'USD', 3.6725)).toBe(367.25);
    expect(toAed(100)).toBe(100);
  });
  it('applies the minimum charge', () => {
    expect(lineAmount(1, 150, 200)).toBe(200);
    expect(lineAmount(3, 150, 200)).toBe(450);
  });
});

describe('suggestPicks (FEFO)', () => {
  const lot = (id: string, qty: number, expiry?: string, status?: StockItem['stockStatus']): StockItem => ({
    id,
    sku: 'X',
    customerId: 'c',
    description: '',
    warehouse: 'W',
    location: id,
    qtyOnHand: qty,
    uom: 'Unit',
    pallets: 1,
    receivedAt: '2026-01-01',
    expiryDate: expiry,
    stockStatus: status,
  });
  it('picks the earliest expiry first and skips quarantine', () => {
    const r = suggestPicks(
      [
        lot('a', 10, '2027-05-01'),
        lot('b', 5, '2026-12-01'),
        lot('q', 50, '2026-01-01', 'Quarantine'),
        lot('c', 10),
      ],
      'X',
      12,
    );
    expect(r.picks.map((p) => [p.lot.id, p.qty])).toEqual([
      ['b', 5],
      ['a', 7],
    ]);
    expect(r.short).toBe(0);
  });
  it('reports a shortage', () => {
    expect(suggestPicks([lot('a', 3)], 'X', 5).short).toBe(2);
  });
});
