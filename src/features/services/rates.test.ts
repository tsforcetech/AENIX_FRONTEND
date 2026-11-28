import { describe, expect, it } from 'vitest';
import {
  dayBefore,
  expiredValidTo,
  matchByCodeOrName,
  parseSheetDate,
  rateRowProblems,
  rateStatus,
} from './rates';

describe('rate helpers (MASTERS M2)', () => {
  it('gives the rate status on a date', () => {
    expect(rateStatus('2026-01-01', '2026-12-31', '2026-11-23')).toBe('Current');
    expect(rateStatus('2027-01-01', '2027-12-31', '2026-11-23')).toBe('Future');
    expect(rateStatus('2025-01-01', '2025-12-31', '2026-11-23')).toBe('Expired');
    expect(rateStatus('2026-01-01', '2026-11-23', '2026-11-23')).toBe('Current');
  });

  it('expires today, or before the start for a future rate', () => {
    expect(expiredValidTo('2026-01-01', '2026-11-23')).toBe('2026-11-23');
    expect(expiredValidTo('2027-01-01', '2026-11-23')).toBe('2026-12-31');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });

  it('reads spreadsheet dates', () => {
    expect(parseSheetDate('2027-01-31')).toBe('2027-01-31');
    expect(parseSheetDate('31/01/2027')).toBe('2027-01-31');
    expect(parseSheetDate('1.2.2027')).toBe('2027-02-01');
    expect(parseSheetDate(46388)).toBe('2027-01-01');
    expect(parseSheetDate('31/02/2027')).toBeNull();
    expect(parseSheetDate('next week')).toBeNull();
    expect(parseSheetDate(undefined)).toBeNull();
  });

  it('matches by code or name, ignoring case and spaces', () => {
    const list = [
      { id: '1', code: 'VEN-0001', name: 'Desert Haulage LLC' },
      { id: '2', code: 'VEN-0002', name: 'Gulf Line' },
    ];
    expect(matchByCodeOrName(list, 'ven-0002')?.id).toBe('2');
    expect(matchByCodeOrName(list, ' desert  haulage llc ')?.id).toBe('1');
    expect(matchByCodeOrName(list, 'Unknown')).toBeUndefined();
    expect(matchByCodeOrName(list, '')).toBeUndefined();
  });

  it('lists the problems of an imported row', () => {
    expect(rateRowProblems({ validFrom: '2027-01-01', validTo: '2027-12-31', amount: 10 })).toEqual([]);
    expect(rateRowProblems({ validFrom: '2027-01-01', validTo: '2026-12-31', amount: 0 })).toEqual([
      'rate must be more than 0',
      'valid to is before valid from',
    ]);
    expect(rateRowProblems({ validFrom: null, validTo: null, amount: null })).toHaveLength(3);
  });
});
