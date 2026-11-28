import { describe, expect, it } from 'vitest';
import type { ProtoDb } from '@/prototype/store';
import { buildConfigs } from './config';
import { filterHub, HUB_GROUPS } from './hub';
import {
  draftOf,
  mergeImport,
  parseDraft,
  scanRefs,
  seriesExample,
  validateValues,
  type MasterRow,
} from './logic';

const fakeDb = {
  ledgerAccounts: [
    {
      id: 'la-4100',
      code: '4100',
      name: 'Freight revenue',
      group: 'Income',
      kind: 'Ledger',
      active: true,
      system: true,
    },
    {
      id: 'la-5100',
      code: '5100',
      name: 'Job costs',
      group: 'Expenses',
      kind: 'Ledger',
      active: true,
      system: true,
    },
    {
      id: 'la-1110',
      code: '1110',
      name: 'Bank',
      group: 'Assets',
      kind: 'Ledger',
      active: true,
      system: true,
    },
  ],
  services: [{ id: 'svc-1', code: 'S1', name: 'FTL', mode: 'Road', unit: 'Truck' }],
  customers: [{ id: 'cus-1', name: 'A', industry: 'Retail', paymentTermsDays: 30 }],
  vendors: [{ id: 'ven-1', name: 'V', category: 'Transporter', paymentTermsDays: 45 }],
  quotations: [{ id: 'q-1', currency: 'USD', lines: [{ unit: 'Pallet', origin: 'Jebel Ali' }] }],
  fixedAssets: [],
  serviceTypes: [
    {
      id: 'st-1',
      code: 'ROAD',
      name: 'Road freight',
      category: 'Transport',
      mode: 'Road',
      active: true,
      system: true,
    },
  ],
  unitsOfMeasure: [
    { id: 'uom-1', code: 'TRUCK', name: 'Truck', kind: 'Trip', active: true },
    { id: 'uom-2', code: 'PLT', name: 'Pallet', kind: 'Count', active: true },
    { id: 'uom-3', code: 'KG', name: 'Kg', kind: 'Weight', active: true },
  ],
  customerCategories: [
    { id: 'cc-1', code: 'RET', name: 'Retail', active: true },
    { id: 'cc-2', code: 'IND', name: 'Industrial', active: true },
  ],
  vendorCategories: [
    { id: 'vc-1', code: 'TRN', name: 'Transporter', behaves: 'Transporter', active: true, system: true },
  ],
  currencies: [
    {
      id: 'cur-1',
      code: 'AED',
      name: 'UAE dirham',
      symbol: 'AED',
      rateToAed: 1,
      rateDate: '2026-11-23',
      base: true,
      system: true,
      active: true,
    },
    {
      id: 'cur-2',
      code: 'USD',
      name: 'US dollar',
      symbol: '$',
      rateToAed: 3.6725,
      rateDate: '2026-11-23',
      active: true,
    },
    {
      id: 'cur-3',
      code: 'GBP',
      name: 'Pound',
      symbol: '£',
      rateToAed: 4.65,
      rateDate: '2026-11-23',
      active: true,
    },
  ],
  paymentTerms: [{ id: 'pt-1', code: 'N30', name: '30 days', days: 30, active: true }],
  bankAccounts: [],
  activity: [{ id: 'ev', currency: 'GBP' }],
} as unknown as ProtoDb;

const C = buildConfigs(() => fakeDb);
const rows = (k: keyof typeof C) => fakeDb[k as keyof ProtoDb] as unknown as MasterRow[];

function check(key: keyof typeof C, draft: Record<string, string | boolean>, editing?: MasterRow) {
  const cfg = C[key];
  const values = parseDraft(cfg.fields, draft);
  return validateValues(cfg.fields, values, { db: fakeDb, rows: rows(key), editing, draft }, cfg.validate);
}

describe('code validation and uniqueness', () => {
  it('upper-cases codes and rejects duplicates case-insensitively', () => {
    const e = check('unitsOfMeasure', { code: 'plt', name: 'Pallet 2', kind: 'Count' });
    expect(e.code).toMatch(/already used/);
    expect(check('unitsOfMeasure', { code: 'cbm', name: 'CBM', kind: 'Volume' })).toEqual({});
  });

  it('rejects a duplicate name and an invalid code', () => {
    const e = check('unitsOfMeasure', { code: 'A B', name: 'kg', kind: 'Weight' });
    expect(e.code).toBeTruthy();
    expect(e.name).toMatch(/already used/);
  });

  it('lets an entry keep its own code when edited', () => {
    const plt = rows('unitsOfMeasure')[1]!;
    expect(check('unitsOfMeasure', { code: 'PLT', name: 'Pallet', kind: 'Count' }, plt)).toEqual({});
  });

  it('requires required fields and limits selects to their options', () => {
    const e = check('unitsOfMeasure', { code: 'X1', name: '', kind: 'Gallon' });
    expect(e.name).toBeTruthy();
    expect(e.kind).toMatch(/from the list/);
  });

  it('checks currency code, rate above 0 and rate date', () => {
    const e = check('currencies', {
      code: 'us',
      name: 'x',
      symbol: 'x',
      rateToAed: '0',
      rateDate: '2026-11-23',
    });
    expect(e.code).toMatch(/3-letter/);
    expect(e.rateToAed).toBeTruthy();
    expect(
      check('currencies', {
        code: 'eur',
        name: 'Euro',
        symbol: '€',
        rateToAed: '3.98',
        rateDate: '2026-11-20',
      }),
    ).toEqual({});
  });

  it('limits service type modes to the chosen category and accounts to income / expense ledgers', () => {
    const e = check('serviceTypes', {
      code: 'WH2',
      name: 'Cold storage',
      category: 'Warehouse',
      mode: 'Road',
      incomeAccountId: 'la-1110',
      costAccountId: 'la-5100',
    });
    expect(e.mode).toBeTruthy();
    expect(e.incomeAccountId).toBeTruthy();
    expect(e.costAccountId).toBeUndefined();
  });

  it('stores a tax rate typed as a percent as a fraction', () => {
    const v = parseDraft(C.taxCodes.fields, { code: 'SR2', name: 'x', rate: '5', treatment: 'Standard' });
    expect(v.rate).toBe(0.05);
    expect(draftOf(C.taxCodes.fields, { id: 't', rate: 0.05 } as MasterRow, fakeDb).rate).toBe('5');
  });

  it('keeps bank numbers masked', () => {
    const e = check('bankAccounts', {
      code: 'B1',
      name: 'Main',
      bankName: 'Bank',
      accountNoMasked: '1234567890',
      ibanMasked: '4410',
      currency: 'AED',
    });
    expect(e.accountNoMasked).toMatch(/last 4/);
    expect(e.ibanMasked).toBeUndefined();
    expect(parseDraft(C.bankAccounts.fields, { accountNoMasked: '4410' }).accountNoMasked).toBe('•••• 4410');
  });
});

describe('where used', () => {
  it('finds units, categories and currencies on records and document lines', () => {
    expect(C.unitsOfMeasure.usage(fakeDb, rows('unitsOfMeasure')[1]!)).toEqual(['1 quotation']);
    expect(C.unitsOfMeasure.usage(fakeDb, rows('unitsOfMeasure')[0]!)).toEqual(['1 service']);
    expect(C.unitsOfMeasure.usage(fakeDb, rows('unitsOfMeasure')[2]!)).toEqual([]);
    expect(C.customerCategories.usage(fakeDb, rows('customerCategories')[0]!)).toEqual(['1 customer']);
    expect(C.customerCategories.usage(fakeDb, rows('customerCategories')[1]!)).toEqual([]);
    expect(C.currencies.usage(fakeDb, rows('currencies')[1]!)).toEqual(['1 quotation']);
    expect(C.paymentTerms.usage(fakeDb, rows('paymentTerms')[0]!)).toEqual(['1 customer']);
  });

  it('ignores the audit log and the masters themselves', () => {
    expect(C.currencies.usage(fakeDb, rows('currencies')[2]!)).toEqual([]);
    expect(scanRefs(fakeDb, ['code'], (v) => v === 'GBP')).toEqual({});
  });

  it('locks the name of a used, name-referenced entry', () => {
    const name = C.customerCategories.fields.find((f) => f.key === 'name')!;
    expect(name.lockedWhen?.(rows('customerCategories')[0]!)).toMatch(/In use/);
    expect(name.lockedWhen?.(rows('customerCategories')[1]!)).toBeNull();
  });
});

describe('Excel upsert merge', () => {
  let seq = 0;
  const opts = {
    fields: C.unitsOfMeasure.fields,
    codeKey: 'code',
    db: fakeDb,
    canAdd: true,
    newId: () => `new-${++seq}`,
    defaults: { active: true },
  };

  it('adds new codes, updates changed ones and skips unchanged or invalid lines', () => {
    const res = mergeImport(
      rows('unitsOfMeasure'),
      [
        { code: 'cbm', name: 'CBM', kind: 'volume' },
        { code: 'KG', name: 'Kg', kind: 'Weight' },
        { code: 'kg', kind: 'Count' },
        { code: 'X', name: 'Bad', kind: 'Nope' },
        { name: 'No code' },
      ],
      opts,
    );
    expect(res.added.map((r) => r.code)).toEqual(['CBM']);
    expect(res.added[0]).toMatchObject({ kind: 'Volume', active: true });
    expect(res.updated).toHaveLength(1);
    expect(res.updated[0]!.changes).toEqual([{ field: 'Kind', from: 'Weight', to: 'Count' }]);
    expect(res.skipped.map((s) => s.reason)).toEqual([
      'No change',
      expect.stringMatching(/from the list/),
      'No code',
    ]);
    expect(res.rows).toHaveLength(4);
    expect(res.rows.find((r) => r.code === 'KG')!.name).toBe('Kg');
  });

  it('keeps locked fields (base currency rate) and only updates when adding is not allowed', () => {
    const res = mergeImport(
      rows('currencies'),
      [
        { code: 'AED', rateToAed: 2 },
        { code: 'USD', rateToAed: 3.7 },
      ],
      { ...opts, fields: C.currencies.fields, canAdd: false, extraValidate: C.currencies.validate },
    );
    expect(res.skipped).toEqual([{ line: 2, code: 'AED', reason: 'No change' }]);
    expect(res.updated[0]!.after.rateToAed).toBe(3.7);
    const onlyUpdates = mergeImport(rows('currencies'), [{ code: 'JPY', name: 'Yen' }], {
      ...opts,
      fields: C.currencies.fields,
      canAdd: false,
    });
    expect(onlyUpdates.skipped[0]!.reason).toMatch(/only updates/);
  });
});

describe('number series example', () => {
  it('pads the next number and adds the year when numbering restarts yearly', () => {
    expect(seriesExample({ prefix: 'QT-', digits: 4, nextNumber: 1090, resetYearly: false }, 2026)).toBe(
      'QT-1090',
    );
    expect(seriesExample({ prefix: 'AEN', digits: 3, nextNumber: 79, resetYearly: false }, 2026)).toBe(
      'AEN079',
    );
    expect(seriesExample({ prefix: 'AEN', digits: 3, nextNumber: 7, resetYearly: true }, 2027)).toBe(
      'AEN-2027-007',
    );
    expect(seriesExample({ prefix: 'CN-', digits: 3, nextNumber: 1, resetYearly: true }, 2026)).toBe(
      'CN-2026-001',
    );
  });

  it('does not let the next number go back', () => {
    const series = {
      id: 'ns-1',
      docType: 'Quotation',
      prefix: 'QT-',
      digits: 4,
      nextNumber: 1090,
      resetYearly: false,
    };
    const cfg = C.numberSeries;
    const draft = {
      docType: 'Quotation',
      prefix: 'QT-',
      digits: '4',
      nextNumber: '1000',
      resetYearly: false,
    };
    const e = validateValues(
      cfg.fields,
      parseDraft(cfg.fields, draft),
      { db: fakeDb, rows: [series], editing: series, draft },
      cfg.validate,
    );
    expect(e.nextNumber).toMatch(/cannot go back/);
  });
});

describe('hub search', () => {
  it('filters cards by title, purpose or group', () => {
    expect(filterHub(HUB_GROUPS, 'vat').flatMap((g) => g.cards.map((c) => c.title))).toEqual(['Tax codes']);
    expect(filterHub(HUB_GROUPS, 'finance')[0]!.cards).toHaveLength(5);
    expect(filterHub(HUB_GROUPS, 'zzz')).toEqual([]);
  });
});
