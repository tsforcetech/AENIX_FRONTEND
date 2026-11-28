import type { Driver, Enquiry, IsoDate, StockItem, Vehicle } from '@/domain/types';

const daysFrom = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export interface ExpiringItem {
  id: string;
  kind: 'Vehicle registration' | 'Vehicle insurance' | 'Driver licence' | 'Stock lot';
  label: string;
  detail: string;
  date: IsoDate;
  /** Negative = already expired. */
  daysLeft: number;
  to: string;
}

/** Documents and lots expiring within `withinDays` (or already expired), soonest first. */
export function expiringSoon(
  input: {
    vehicles: readonly Vehicle[];
    drivers: readonly Driver[];
    stockItems: readonly StockItem[];
    customerName: (id: string) => string;
  },
  today: IsoDate,
  withinDays = 30,
): ExpiringItem[] {
  const out: ExpiringItem[] = [];
  const add = (item: Omit<ExpiringItem, 'daysLeft'>) => {
    const daysLeft = daysFrom(today, item.date);
    if (daysLeft <= withinDays) out.push({ ...item, daysLeft });
  };
  for (const v of input.vehicles) {
    if (v.status === 'Inactive') continue;
    add({
      id: `${v.id}-reg`,
      kind: 'Vehicle registration',
      label: v.plate,
      detail: v.type,
      date: v.registrationExpiry,
      to: '/fleet',
    });
    add({
      id: `${v.id}-ins`,
      kind: 'Vehicle insurance',
      label: v.plate,
      detail: v.type,
      date: v.insuranceExpiry,
      to: '/fleet',
    });
  }
  for (const d of input.drivers)
    add({
      id: `${d.id}-lic`,
      kind: 'Driver licence',
      label: d.name,
      detail: d.licenceNo,
      date: d.licenceExpiry,
      to: '/fleet',
    });
  for (const s of input.stockItems) {
    if (!s.expiryDate || s.qtyOnHand <= 0) continue;
    add({
      id: `${s.id}-exp`,
      kind: 'Stock lot',
      label: `${s.sku}${s.batch ? ` · batch ${s.batch}` : ''}`,
      detail: `${input.customerName(s.customerId)} · ${s.qtyOnHand} ${s.uom}`,
      date: s.expiryDate,
      to: '/warehouse',
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Open enquiries whose next follow-up is today or overdue. */
export function followUpsDue(enquiries: readonly Enquiry[], today: IsoDate): Enquiry[] {
  return enquiries
    .filter((e) => !!e.nextFollowUp && e.nextFollowUp <= today && e.status !== 'Won' && e.status !== 'Lost')
    .sort((a, b) => a.nextFollowUp!.localeCompare(b.nextFollowUp!));
}
