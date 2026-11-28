/**
 * MASTERS M2 — pure helpers for buying (vendor) and selling (customer / price list) rates.
 * Prototype display logic; the backend re-validates every saved or imported rate.
 */
import type { IsoDate } from '@/domain/types';

export type RateStatus = 'Current' | 'Future' | 'Expired';

export function rateStatus(validFrom: IsoDate, validTo: IsoDate, today: IsoDate): RateStatus {
  if (validTo < today) return 'Expired';
  if (validFrom > today) return 'Future';
  return 'Current';
}

/** Day before `date` (YYYY-MM-DD). */
export function dayBefore(date: IsoDate): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * New "valid to" when a rate is expired: today. A rate that has not started yet ends the day
 * before it starts, so it is never used.
 */
export function expiredValidTo(validFrom: IsoDate, today: IsoDate): IsoDate {
  return validFrom > today ? dayBefore(validFrom) : today;
}

/**
 * Date from a spreadsheet cell: ISO (2027-01-31), day-first (31/01/2027, 31-01-2027, 31.01.2027)
 * or an Excel serial day number. Returns null when it cannot be read.
 */
export function parseSheetDate(v: string | number | undefined): IsoDate | null {
  if (v === undefined || v === null) return null;
  const valid = (y: number, m: number, d: number): IsoDate | null => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };
  const text = String(v).trim();
  if (/^\d{4,6}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial < 20000 || serial > 80000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return dt.toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Finds a party / service by code or name (case and spacing ignored). */
export function matchByCodeOrName<T extends { id: string; code: string; name: string }>(
  list: readonly T[],
  text: string | number | undefined,
): T | undefined {
  const key = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!key) return undefined;
  return (
    list.find((x) => x.code.toLowerCase() === key) ??
    list.find((x) => x.name.toLowerCase().replace(/\s+/g, ' ') === key)
  );
}

export interface RateRowCheck {
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
  amount: number | null;
}

/** Common checks for an imported rate row; returns the problems found (empty = OK). */
export function rateRowProblems(r: RateRowCheck): string[] {
  const out: string[] = [];
  if (r.amount === null || !Number.isFinite(r.amount) || r.amount <= 0) out.push('rate must be more than 0');
  if (!r.validFrom) out.push('valid from is not a date');
  if (!r.validTo) out.push('valid to is not a date');
  if (r.validFrom && r.validTo && r.validTo < r.validFrom) out.push('valid to is before valid from');
  return out;
}
