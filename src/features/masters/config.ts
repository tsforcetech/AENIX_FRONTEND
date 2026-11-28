import type {
  ReasonKind,
  ServiceCategory,
  ServiceMode,
  UnitOfMeasure,
  VendorCategory,
  Place,
  TaxCode,
  Emirate,
} from '@/domain/types';
import { PROTO_TODAY } from '@/prototype/seed';
import type { ProtoDb } from '@/prototype/store';
import {
  describeRefs,
  maskNumber,
  sameText,
  scanRefs,
  tooManyDigits,
  type MasterField,
  type MasterRow,
  type Option,
  type ValidateCtx,
  type Values,
} from './logic';
import type { MasterKey } from './lookups';

/**
 * One configuration per master: list columns, form fields with validation, where-used check.
 * The generic list page (/masters/$key) is driven entirely by these. PROTOTYPE view-models.
 */
export type ConfigKey = MasterKey | 'numberSeries';

export interface MasterConfig {
  key: ConfigKey;
  title: string;
  singular: string;
  purpose: string;
  /** Field that identifies the entry (upsert key). */
  codeKey: string;
  nameKey: string;
  hasActive: boolean;
  canAdd: boolean;
  canDelete: boolean;
  idPrefix: string;
  fields: MasterField[];
  /** Columns shown in the list (field keys); code and name always come first. */
  listFields: string[];
  /** Field other records use to point at this entry; locked while the entry is in use. */
  refField?: string;
  validate?: (values: Values, ctx: ValidateCtx) => Record<string, string | undefined>;
  usage: (db: ProtoDb, row: MasterRow) => string[];
  /** Reason this row cannot be deactivated (beyond usage). */
  keepActive?: (row: MasterRow) => string | null;
  /** Optional list filter (e.g. reason kind). */
  filter?: { key: string; label: string; options: Option[] };
  note?: string;
}

const opts = (xs: readonly string[]): Option[] => xs.map((x) => ({ value: x, label: x }));
const stat = (xs: readonly string[]) => () => opts(xs);

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = ['Transport', 'Warehouse', 'Service'];
const MODES_BY_CATEGORY: Record<ServiceCategory, ServiceMode[]> = {
  Transport: ['Road', 'Sea', 'Air'],
  Warehouse: ['Warehouse'],
  Service: ['Customs'],
};
export const VENDOR_BEHAVIOURS: readonly VendorCategory[] = [
  'Transporter',
  'Shipping line',
  'Airline',
  'Customs broker',
  'Warehouse',
];
export const UOM_KINDS: readonly UnitOfMeasure['kind'][] = [
  'Count',
  'Weight',
  'Volume',
  'Area',
  'Time',
  'Trip',
  'Container',
];
export const PLACE_KINDS: readonly Place['kind'][] = [
  'City',
  'Port',
  'Airport',
  'Free zone',
  'Border crossing',
];
export const EMIRATES: readonly Emirate[] = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
];
export const TAX_TREATMENTS: readonly TaxCode['treatment'][] = [
  'Standard',
  'Zero-rated',
  'Exempt',
  'Out of scope',
];
export const REASON_KINDS: readonly ReasonKind[] = [
  'Lost enquiry',
  'Variance',
  'Stock adjustment',
  'Cancellation',
  'Credit note',
  'Write-off',
];

const ledgerOptions = (db: ProtoDb, groups: string[]): Option[] =>
  db.ledgerAccounts
    .filter((a) => a.kind === 'Ledger' && a.active && !a.party && groups.includes(a.group))
    .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));

const code = (over: Partial<MasterField> = {}): MasterField => ({
  key: 'code',
  label: 'Code',
  type: 'code',
  required: true,
  maxLength: 16,
  importAliases: ['code', 'short code', 'id'],
  lockedWhen: () => 'The code cannot change after the entry is created.',
  ...over,
});
const name = (over: Partial<MasterField> = {}): MasterField => ({
  key: 'name',
  label: 'Name',
  type: 'text',
  required: true,
  maxLength: 60,
  unique: true,
  importAliases: ['name', 'description', 'title'],
  ...over,
});

/** Lock a name-referenced field while other records use the entry. */
const lockWhileUsed =
  (db: () => ProtoDb, cfgKey: () => MasterConfig, what: string) =>
  (row: MasterRow): string | null => {
    const used = cfgKey().usage(db(), row);
    return used.length
      ? `In use (${used.join(', ')}): the ${what} cannot change. Add a new entry instead.`
      : null;
  };

/** Build every config. `getDb` is read lazily so the same config works for screens and tests. */
export function buildConfigs(getDb: () => ProtoDb): Record<ConfigKey, MasterConfig> {
  const C = {} as Record<ConfigKey, MasterConfig>;
  const nameLocked = (key: ConfigKey) => lockWhileUsed(getDb, () => C[key], 'name');

  C.serviceTypes = {
    key: 'serviceTypes',
    title: 'Service types',
    singular: 'service type',
    purpose: 'Group services and set the income and cost accounts they post to.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'st',
    refField: 'id',
    fields: [
      code(),
      name(),
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: stat(SERVICE_CATEGORIES),
        placeholder: 'Choose category',
        importAliases: ['category', 'type'],
      },
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        required: true,
        placeholder: 'Choose mode',
        options: ({ draft }) =>
          opts(
            MODES_BY_CATEGORY[draft.category as ServiceCategory] ?? Object.values(MODES_BY_CATEGORY).flat(),
          ),
        hint: 'Road, Sea and Air apply only to transport.',
        importAliases: ['mode'],
      },
      {
        key: 'incomeAccountId',
        label: 'Income account',
        type: 'select',
        required: true,
        placeholder: 'Choose income account',
        options: ({ db }) => ledgerOptions(db, ['Income']),
        importAliases: ['income account', 'revenue account', 'income'],
      },
      {
        key: 'costAccountId',
        label: 'Cost account',
        type: 'select',
        required: true,
        placeholder: 'Choose cost account',
        options: ({ db }) => ledgerOptions(db, ['Expenses']),
        importAliases: ['cost account', 'expense account', 'cost'],
      },
    ],
    listFields: ['category', 'mode', 'incomeAccountId', 'costAccountId'],
    validate: (v) => {
      const cat = v.category as ServiceCategory | undefined;
      if (cat && v.mode && !MODES_BY_CATEGORY[cat]?.includes(v.mode as ServiceMode))
        return { mode: `${cat} uses ${MODES_BY_CATEGORY[cat].join(', ')}` };
      return {};
    },
    usage: (db, row) => {
      const byId = scanRefs(db, ['serviceTypeId'], sameText(row.id));
      // Services point at a type through their mode until they carry a type id.
      const sameMode = db.serviceTypes.filter((t) => t.active && t.mode === row.mode && t.id !== row.id);
      const byMode = sameMode.length
        ? {}
        : scanRefs(db, ['mode'], sameText(row.mode as string), ['services']);
      return describeRefs(byId, byMode);
    },
  };

  C.unitsOfMeasure = {
    key: 'unitsOfMeasure',
    title: 'Units of measure',
    singular: 'unit',
    purpose: 'Units used to price and count: truck, pallet-day, CBM, kg.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'uom',
    refField: 'name',
    fields: [
      code(),
      name({ lockedWhen: nameLocked('unitsOfMeasure') }),
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: stat(UOM_KINDS),
        placeholder: 'Choose kind',
        importAliases: ['kind', 'type'],
      },
    ],
    listFields: ['kind'],
    usage: (db, row) =>
      describeRefs(scanRefs(db, ['unit', 'uom'], sameText(row.name as string, row.code as string))),
  };

  C.customerCategories = {
    key: 'customerCategories',
    title: 'Customer categories',
    singular: 'customer category',
    purpose: 'Industry groups used to segment customers and reports.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'cc',
    refField: 'name',
    fields: [code(), name({ lockedWhen: nameLocked('customerCategories') })],
    listFields: [],
    usage: (db, row) =>
      describeRefs(
        scanRefs(db, ['industry', 'customerCategory'], sameText(row.name as string)),
        scanRefs(db, ['customerCategoryId'], sameText(row.id)),
      ),
  };

  C.vendorCategories = {
    key: 'vendorCategories',
    title: 'Vendor categories',
    singular: 'vendor category',
    purpose: 'Vendor groups; each follows a system behaviour (transport, sea, air, customs, warehouse).',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'vc',
    refField: 'id',
    fields: [
      code(),
      name(),
      {
        key: 'behaves',
        label: 'Works like',
        type: 'select',
        required: true,
        options: stat(VENDOR_BEHAVIOURS),
        placeholder: 'Choose system behaviour',
        hint: 'Decides purchase orders, warehouse sites and transport for vendors in this category.',
        lockedWhen: (row) => (row.system ? 'System category: the behaviour is fixed.' : null),
        importAliases: ['works like', 'behaves', 'behaviour', 'behavior', 'system type'],
      },
    ],
    listFields: ['behaves'],
    usage: (db, row) =>
      describeRefs(
        scanRefs(
          db,
          ['category', 'categoryName', 'vendorCategory'],
          sameText(row.name as string, row.system ? (row.behaves as string) : undefined),
          ['vendors'],
        ),
        scanRefs(db, ['vendorCategoryId'], sameText(row.id)),
      ),
  };

  C.places = {
    key: 'places',
    title: 'Places and ports',
    singular: 'place',
    purpose: 'Cities, ports, airports, free zones and borders for routes and rates.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'pl',
    refField: 'name',
    fields: [
      code({ hint: 'UN/LOCODE where one exists, e.g. AEJEA.' }),
      name({ lockedWhen: nameLocked('places') }),
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: stat(PLACE_KINDS),
        placeholder: 'Choose kind',
        importAliases: ['kind', 'type'],
      },
      {
        key: 'country',
        label: 'Country',
        type: 'text',
        required: true,
        maxLength: 40,
        initial: () => 'UAE',
        importAliases: ['country'],
      },
      {
        key: 'emirate',
        label: 'Emirate',
        type: 'select',
        options: stat(EMIRATES),
        placeholder: 'Not in the UAE',
        importAliases: ['emirate'],
      },
    ],
    listFields: ['kind', 'country', 'emirate'],
    validate: (v) => {
      const uae = /^(uae|united arab emirates)$/i.test(String(v.country ?? ''));
      if (uae && !v.emirate) return { emirate: 'Choose the emirate for a UAE place' };
      if (!uae && v.emirate) return { emirate: 'Emirate applies only to UAE places' };
      return {};
    },
    usage: (db, row) =>
      describeRefs(
        scanRefs(
          db,
          ['origin', 'destination', 'pickup', 'delivery', 'location', 'port'],
          sameText(row.name as string, row.code as string),
        ),
      ),
  };

  C.currencies = {
    key: 'currencies',
    title: 'Currencies and rates',
    singular: 'currency',
    purpose: 'Currencies for quotes and invoices, with the rate to AED.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'cur',
    refField: 'code',
    fields: [
      code({
        label: 'ISO code',
        pattern: /^[A-Z]{3}$/,
        patternMessage: 'Use the 3-letter ISO code, e.g. USD',
        maxLength: 3,
        importAliases: ['code', 'iso code', 'currency', 'currency code'],
      }),
      name(),
      {
        key: 'symbol',
        label: 'Symbol',
        type: 'text',
        maxLength: 5,
        required: true,
        importAliases: ['symbol'],
      },
      {
        key: 'rateToAed',
        label: 'Rate to AED',
        type: 'number',
        required: true,
        min: 0.000001,
        max: 100000,
        hint: 'AED for 1 unit of this currency.',
        lockedWhen: (row) => (row.base ? 'AED is the base currency: its rate is always 1.' : null),
        importAliases: ['rate to aed', 'rate', 'aed rate', 'exchange rate'],
      },
      {
        key: 'rateDate',
        label: 'Rate date',
        type: 'date',
        required: true,
        initial: () => PROTO_TODAY,
        lockedWhen: (row) => (row.base ? 'AED is the base currency.' : null),
        importAliases: ['rate date', 'date', 'as of'],
      },
    ],
    listFields: ['symbol', 'rateToAed', 'rateDate'],
    validate: (v) => {
      if (v.rateToAed !== undefined && !((v.rateToAed as number) > 0))
        return { rateToAed: 'Rate to AED must be above 0' };
      if (v.rateDate && String(v.rateDate) > PROTO_TODAY)
        return { rateDate: 'Rate date cannot be in the future' };
      return {};
    },
    keepActive: (row) => (row.base ? 'AED is the base currency and stays active.' : null),
    usage: (db, row) => {
      const m = sameText(row.code as string);
      return describeRefs(scanRefs(db, ['currency'], m), scanRefs(db, ['currency'], m, ['bankAccounts']));
    },
  };

  C.taxCodes = {
    key: 'taxCodes',
    title: 'Tax codes',
    singular: 'tax code',
    purpose: 'UAE VAT treatments and rates used on invoices and bills.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'tax',
    refField: 'code',
    note: 'VAT rules need accountant sign-off before use.',
    fields: [
      code(),
      name(),
      {
        key: 'rate',
        label: 'Rate %',
        type: 'number',
        required: true,
        percentOfOne: true,
        min: 0,
        max: 100,
        importAliases: ['rate %', 'rate', 'vat %', 'vat rate'],
      },
      {
        key: 'treatment',
        label: 'Treatment',
        type: 'select',
        required: true,
        options: stat(TAX_TREATMENTS),
        placeholder: 'Choose treatment',
        lockedWhen: (row) => (row.system ? 'System tax code: the treatment is fixed.' : null),
        importAliases: ['treatment', 'vat treatment'],
      },
    ],
    listFields: ['rate', 'treatment'],
    validate: (v) =>
      v.treatment && v.treatment !== 'Standard' && (v.rate as number) > 0
        ? { rate: `${String(v.treatment)} must have a 0% rate` }
        : {},
    usage: (db, row) =>
      describeRefs(scanRefs(db, ['taxCode', 'taxCodeId', 'vatCode'], sameText(row.code as string, row.id))),
  };

  C.paymentTerms = {
    key: 'paymentTerms',
    title: 'Payment terms',
    singular: 'payment term',
    purpose: 'Credit days offered to customers and agreed with vendors.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'pt',
    refField: 'days',
    fields: [
      code(),
      name(),
      {
        key: 'days',
        label: 'Days',
        type: 'number',
        required: true,
        integer: true,
        min: 0,
        max: 365,
        lockedWhen: lockWhileUsed(getDb, () => C.paymentTerms, 'days'),
        importAliases: ['days', 'credit days', 'term days'],
      },
    ],
    listFields: ['days'],
    usage: (db, row) => describeRefs(scanRefs(db, ['paymentTermsDays'], (v) => v === row.days)),
  };

  C.bankAccounts = {
    key: 'bankAccounts',
    title: 'Bank accounts',
    singular: 'bank account',
    purpose: 'Company bank accounts for receipts and payments (masked numbers only).',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'bank',
    refField: 'id',
    note: 'Only the last 4 digits are kept here. The real account number and IBAN are stored by the backend, never in the browser.',
    fields: [
      code(),
      name(),
      {
        key: 'bankName',
        label: 'Bank',
        type: 'text',
        required: true,
        maxLength: 60,
        importAliases: ['bank', 'bank name'],
      },
      {
        key: 'accountNoMasked',
        label: 'Account number (masked)',
        type: 'text',
        required: true,
        maxLength: 30,
        normalize: (v) => maskNumber(v),
        hint: 'Type the last 4 digits only, e.g. 4410.',
        importAliases: ['account number', 'account no', 'account'],
      },
      {
        key: 'ibanMasked',
        label: 'IBAN (masked)',
        type: 'text',
        required: true,
        maxLength: 34,
        normalize: (v) => maskNumber(v, 'AE•• •••• •••• ••••'),
        hint: 'Type the last 4 digits only.',
        importAliases: ['iban'],
      },
      {
        key: 'currency',
        label: 'Currency',
        type: 'select',
        required: true,
        initial: () => 'AED',
        options: ({ db }) =>
          db.currencies
            .filter((c) => c.active)
            .map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })),
        importAliases: ['currency'],
      },
      {
        key: 'ledgerAccountId',
        label: 'Ledger account',
        type: 'select',
        placeholder: 'Not linked yet',
        options: ({ db }) => ledgerOptions(db, ['Assets']),
        importAliases: false,
      },
    ],
    listFields: ['bankName', 'accountNoMasked', 'currency'],
    validate: (v) => {
      const e: Record<string, string> = {};
      if (v.accountNoMasked && tooManyDigits(String(v.accountNoMasked)))
        e.accountNoMasked = 'Show at most the last 4 digits. The full number is kept by the backend.';
      if (v.ibanMasked && tooManyDigits(String(v.ibanMasked)))
        e.ibanMasked = 'Show at most the last 4 digits. The full IBAN is kept by the backend.';
      return e;
    },
    usage: (db, row) => {
      const ledger = db.ledgerAccounts.find((a) => a.id === row.ledgerAccountId);
      return describeRefs(
        scanRefs(
          db,
          ['bankAccount', 'bankAccountId'],
          sameText(
            row.id,
            row.code as string,
            row.name as string,
            ledger ? `${ledger.code} ${ledger.name}` : undefined,
          ),
        ),
      );
    },
  };

  C.assetCategories = {
    key: 'assetCategories',
    title: 'Asset categories',
    singular: 'asset category',
    purpose: 'Fixed asset groups with default useful life and residual value.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'ac',
    refField: 'name',
    note: 'Depreciation rules need accountant sign-off.',
    fields: [
      code(),
      name({ lockedWhen: nameLocked('assetCategories') }),
      {
        key: 'usefulLifeMonths',
        label: 'Useful life (months)',
        type: 'number',
        required: true,
        integer: true,
        min: 1,
        max: 600,
        importAliases: ['useful life (months)', 'useful life', 'life months', 'months'],
      },
      {
        key: 'residualPct',
        label: 'Residual value %',
        type: 'number',
        required: true,
        min: 0,
        max: 100,
        initial: () => '0',
        importAliases: ['residual value %', 'residual %', 'residual'],
      },
    ],
    listFields: ['usefulLifeMonths', 'residualPct'],
    usage: (db, row) =>
      describeRefs(scanRefs(db, ['category'], sameText(row.name as string), ['fixedAssets'])),
  };

  C.reasonCodes = {
    key: 'reasonCodes',
    title: 'Reasons',
    singular: 'reason',
    purpose: 'Reasons for lost enquiries, variances, adjustments, cancellations, credit notes, write-offs.',
    codeKey: 'code',
    nameKey: 'name',
    hasActive: true,
    canAdd: true,
    canDelete: true,
    idPrefix: 'rsn',
    refField: 'name',
    filter: { key: 'kind', label: 'Reason for', options: opts(REASON_KINDS) },
    fields: [
      code(),
      name({ lockedWhen: nameLocked('reasonCodes') }),
      {
        key: 'kind',
        label: 'Used for',
        type: 'select',
        required: true,
        options: stat(REASON_KINDS),
        placeholder: 'Choose where it is used',
        importAliases: ['used for', 'kind', 'type'],
      },
    ],
    listFields: ['kind'],
    usage: (db, row) =>
      describeRefs(
        scanRefs(db, ['reason', 'lostReason', 'cancelReason', 'bounceReason'], sameText(row.name as string)),
      ),
  };

  C.numberSeries = {
    key: 'numberSeries',
    title: 'Document numbering',
    singular: 'number series',
    purpose: 'Prefix and next number for each document type.',
    codeKey: 'docType',
    nameKey: 'docType',
    hasActive: false,
    canAdd: false,
    canDelete: false,
    idPrefix: 'ns',
    note: 'Numbers already issued never change. The backend assigns the final number when a document is saved.',
    fields: [
      {
        key: 'docType',
        label: 'Document',
        type: 'text',
        required: true,
        importAliases: ['document', 'document type', 'doc type', 'type'],
        lockedWhen: () => 'The document type is fixed.',
      },
      {
        key: 'prefix',
        label: 'Prefix',
        type: 'text',
        required: true,
        upper: true,
        maxLength: 8,
        pattern: /^[A-Z0-9][A-Z0-9/-]{0,7}$/,
        patternMessage: 'Prefix: capital letters, digits, dash or slash (max 8)',
        importAliases: ['prefix'],
      },
      {
        key: 'digits',
        label: 'Digits',
        type: 'number',
        required: true,
        integer: true,
        min: 1,
        max: 8,
        importAliases: ['digits', 'length'],
      },
      {
        key: 'nextNumber',
        label: 'Next number',
        type: 'number',
        required: true,
        integer: true,
        min: 1,
        importAliases: ['next number', 'next', 'next no'],
      },
      {
        key: 'resetYearly',
        label: 'Restart every year',
        type: 'checkbox',
        importAliases: ['restart every year', 'reset yearly', 'yearly reset'],
      },
    ],
    listFields: ['prefix', 'digits', 'nextNumber', 'resetYearly'],
    validate: (v, ctx) => {
      const issued = ctx.editing?.nextNumber as number | undefined;
      if (issued !== undefined && (v.nextNumber as number) < issued)
        return { nextNumber: `Next number cannot go back below ${issued} (numbers already issued)` };
      return {};
    },
    usage: () => [],
  };

  return C;
}

/** Order and grouping of the configurable masters (used by the hub search and tests). */
export const MASTER_KEYS: ConfigKey[] = [
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
];

export const isConfigKey = (k: string): k is ConfigKey => (MASTER_KEYS as string[]).includes(k);
