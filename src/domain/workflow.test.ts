import { describe, expect, it } from 'vitest';
import type { JobStop, PriceLine } from './types';
import {
  completionProof,
  deliveryStopsDone,
  documentChecklist,
  expiryAlerts,
  expiryAlertText,
  expiryLevel,
  jobProfit,
  milestoneOrderError,
  missingDocuments,
  requiredDocuments,
  tripCostTotals,
} from './workflow';

const line = (over: Partial<PriceLine>): PriceLine => ({
  id: 'l',
  serviceId: 'svc-1',
  description: 'x',
  quantity: 1,
  unit: 'Trip',
  unitPrice: 0,
  unitCost: 0,
  ...over,
});

describe('requiredDocuments (T3)', () => {
  it('lists the sea set for sea transport', () => {
    expect(requiredDocuments(['Transport'], 'Sea')).toEqual([
      'Bill of lading',
      'Delivery order',
      'BOE',
      'Commercial invoice',
      'Packing list',
    ]);
  });

  it('defaults transport to road', () => {
    expect(requiredDocuments(['Transport'])).toEqual(['CMR / waybill', 'Delivery note']);
  });

  it('merges air + customs + warehouse without duplicates', () => {
    expect(requiredDocuments(['Transport', 'Warehouse'], 'Air', ['Air', 'Customs'])).toEqual([
      'Airway bill',
      'BOE',
      'Commercial invoice',
      'Certificate of origin',
      'Packing list / ASN',
      'GRN',
    ]);
  });

  it('needs nothing for a plain direct service', () => {
    expect(requiredDocuments(['Service'], undefined, ['Warehouse'])).toEqual([]);
  });
});

describe('document checklist and missing count (T3)', () => {
  it('adds template items and counts only required, unreceived ones', () => {
    const list = documentChecklist(
      [
        { id: 'd1', name: 'CMR / waybill', required: true, number: 'CMR-1' },
        { id: 'd2', name: 'Photos', required: false },
      ],
      ['CMR / waybill', 'Delivery note'],
    );
    expect(list.map((d) => d.name)).toEqual(['CMR / waybill', 'Photos', 'Delivery note']);
    expect(missingDocuments(list)).toEqual(['Delivery note']);
  });

  it('treats a stored item marked optional as not missing', () => {
    const list = documentChecklist([{ id: 'd1', name: 'Delivery note', required: false }], ['Delivery note']);
    expect(missingDocuments(list)).toHaveLength(0);
  });
});

describe('deliveryStopsDone (T4)', () => {
  const stop = (type: JobStop['type'], status: JobStop['status']): JobStop => ({
    id: `${type}${status}`,
    seq: 1,
    type,
    address: 'A',
    plannedAt: '2026-11-23T08:00',
    status,
  });
  it('is true without stops (existing behaviour)', () => {
    expect(deliveryStopsDone(undefined)).toBe(true);
  });
  it('ignores pickups and needs every delivery done', () => {
    expect(deliveryStopsDone([stop('Pickup', 'Planned'), stop('Delivery', 'Done')])).toBe(true);
    expect(deliveryStopsDone([stop('Delivery', 'Done'), stop('Delivery', 'Failed')])).toBe(false);
  });
});

describe('jobProfit (S4)', () => {
  it('revenue − PO costs − internal costs', () => {
    const p = jobProfit({
      lines: [line({ quantity: 2, unitPrice: 1000 })],
      poCosts: [800, 200],
      internalCosts: [{ quantity: 4, rate: 50 }],
    });
    expect(p).toMatchObject({ revenue: 2000, vendorCost: 1000, internalCost: 200, grossProfit: 800 });
    expect(p.marginPct).toBe(40);
  });

  it('leaves out unapproved surcharges and disbursements', () => {
    const p = jobProfit({
      lines: [
        line({ unitPrice: 1000 }),
        line({ serviceId: 'svc-13', unitPrice: 300 }),
        line({ serviceId: 'svc-15', unitPrice: 100, customerApproved: true }),
        line({ serviceId: 'svc-17', unitPrice: 500 }),
      ],
      poCosts: [],
      isSurcharge: (id) => id === 'svc-13' || id === 'svc-15',
      isDisbursement: (id) => id === 'svc-17',
    });
    expect(p.revenue).toBe(1100);
    expect(p.pendingSurcharges).toBe(300);
  });

  it('margin is 0 with no revenue', () => {
    expect(jobProfit({ lines: [], poCosts: [100] }).marginPct).toBe(0);
  });
});

describe('expiry alerts (T6)', () => {
  const today = '2026-11-23';
  it('classifies expired / expiring / ok', () => {
    expect(expiryLevel('2026-11-20', today)).toEqual({ level: 'Expired', days: -3 });
    expect(expiryLevel('2026-12-23', today)).toEqual({ level: 'Expiring', days: 30 });
    expect(expiryLevel('2026-12-24', today).level).toBe('OK');
  });

  it('lists only the documents that need attention, with readable text', () => {
    const alerts = expiryAlerts({ registrationExpiry: '2027-06-30', insuranceExpiry: '2026-11-22' }, today);
    expect(alerts).toHaveLength(1);
    expect(expiryAlertText(alerts[0]!)).toBe('Insurance expired 1 day ago');
    const lic = expiryAlerts({ licenceExpiry: '2026-12-05' }, today);
    expect(expiryAlertText(lic[0]!)).toBe('Licence expires in 12 days');
  });
});

describe('tripCostTotals (T7)', () => {
  it('sums by type and overall', () => {
    const t = tripCostTotals([
      { type: 'Fuel', amount: 120.5 },
      { type: 'Fuel', amount: 80 },
      { type: 'Salik / tolls', amount: 12 },
    ]);
    expect(t.total).toBe(212.5);
    expect(t.byType).toEqual({ Fuel: 200.5, 'Salik / tolls': 12 });
  });
});

describe('milestoneOrderError (T2)', () => {
  it('accepts times in order and skips empty ones', () => {
    expect(
      milestoneOrderError([
        { label: 'A', at: '2026-11-20T08:00:00+04:00' },
        { label: 'B' },
        { label: 'C', at: '2026-11-21T08:00:00+04:00' },
      ]),
    ).toBeUndefined();
  });
  it('names the first milestone out of order', () => {
    expect(
      milestoneOrderError([
        { label: 'Loaded', at: '2026-11-21T08:00:00+04:00' },
        { label: 'In transit', at: '2026-11-20T08:00:00+04:00' },
      ]),
    ).toBe('“In transit” cannot be earlier than “Loaded”');
  });
});

describe('completionProof (S3)', () => {
  it('returns signed notes as ok and filters by PO', () => {
    const job = {
      completionNotes: [
        {
          id: 'n1',
          number: 'SCN-001',
          serviceId: 'svc-6',
          purchaseOrderId: 'po-1',
          date: '2026-11-23',
          quantity: 1,
          unit: 'Declaration',
          description: 'Import declaration',
          customerSignedBy: 'Store keeper',
          status: 'Signed' as const,
        },
        {
          id: 'n2',
          number: 'SCN-002',
          serviceId: 'svc-19',
          date: '2026-11-23',
          quantity: 4,
          unit: 'Hour',
          description: 'Repacking',
          status: 'Draft' as const,
        },
      ],
    };
    expect(completionProof(job).map((p) => p.ok)).toEqual([true, false]);
    expect(completionProof(job, 'po-1')).toEqual([
      { kind: 'Completion note', label: 'SCN-001 · 1 Declaration · signed by Store keeper', ok: true },
    ]);
  });
});
