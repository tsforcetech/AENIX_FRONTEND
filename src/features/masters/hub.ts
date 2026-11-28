import type { ConfigKey } from './config';

/** Cards on the Masters hub (/masters). `countKey` reads the hub counts from the adapter. */
export interface HubCard {
  title: string;
  purpose: string;
  countKey: string;
  /** Generic master page (/masters/$key). */
  master?: ConfigKey | 'warehouses';
  /** Screen owned by another module. */
  to?: string;
  search?: Record<string, string>;
}

export interface HubGroup {
  label: string;
  cards: HubCard[];
}

export const HUB_GROUPS: HubGroup[] = [
  {
    label: 'Sales',
    cards: [
      {
        title: 'Customers',
        purpose: 'Customer accounts, credit limits and contacts.',
        countKey: 'customers',
        to: '/customers',
      },
      {
        title: 'Customer categories',
        purpose: 'Industry groups used to segment customers and reports.',
        countKey: 'customerCategories',
        master: 'customerCategories',
      },
      {
        title: 'Selling rates',
        purpose: 'Standard price list and customer-specific prices.',
        countKey: 'sellingRates',
        to: '/services',
        search: { tab: 'selling' },
      },
      {
        title: 'Payment terms',
        purpose: 'Credit days offered to customers and agreed with vendors.',
        countKey: 'paymentTerms',
        master: 'paymentTerms',
      },
    ],
  },
  {
    label: 'Services',
    cards: [
      {
        title: 'Services',
        purpose: 'Everything we sell: transport, storage, customs and more.',
        countKey: 'services',
        to: '/services',
      },
      {
        title: 'Service types',
        purpose: 'Group services and set the income and cost accounts they post to.',
        countKey: 'serviceTypes',
        master: 'serviceTypes',
      },
      {
        title: 'Units of measure',
        purpose: 'Units used to price and count: truck, pallet-day, CBM, kg.',
        countKey: 'unitsOfMeasure',
        master: 'unitsOfMeasure',
      },
      {
        title: 'Tax codes',
        purpose: 'UAE VAT treatments and rates used on invoices and bills.',
        countKey: 'taxCodes',
        master: 'taxCodes',
      },
    ],
  },
  {
    label: 'Vendors',
    cards: [
      {
        title: 'Vendors',
        purpose: 'Transporters, shipping lines, brokers and warehouse vendors.',
        countKey: 'vendors',
        to: '/vendors',
      },
      {
        title: 'Vendor categories',
        purpose: 'Vendor groups and the system behaviour each one follows.',
        countKey: 'vendorCategories',
        master: 'vendorCategories',
      },
      {
        title: 'Buying rates',
        purpose: 'Agreed vendor rates per service and route.',
        countKey: 'buyingRates',
        to: '/services',
      },
    ],
  },
  {
    label: 'Operations',
    cards: [
      {
        title: 'Warehouses',
        purpose: 'Own warehouses and sites run by warehouse vendors.',
        countKey: 'warehouses',
        master: 'warehouses',
      },
      {
        title: 'Bin locations',
        purpose: 'Aisle-rack-level locations and their pallet capacity.',
        countKey: 'binLocations',
        to: '/warehouse/locations',
      },
      {
        title: 'Places and ports',
        purpose: 'Cities, ports, airports, free zones and borders for routes.',
        countKey: 'places',
        master: 'places',
      },
      {
        title: 'Vehicles and drivers',
        purpose: 'Own fleet: trucks, trailers and drivers.',
        countKey: 'fleet',
        to: '/fleet',
      },
      {
        title: 'Reasons',
        purpose: 'Reasons for lost enquiries, variances, adjustments and credit notes.',
        countKey: 'reasonCodes',
        master: 'reasonCodes',
      },
    ],
  },
  {
    label: 'Finance',
    cards: [
      {
        title: 'Currencies and rates',
        purpose: 'Currencies for quotes and invoices, with the rate to AED.',
        countKey: 'currencies',
        master: 'currencies',
      },
      {
        title: 'Bank accounts',
        purpose: 'Company bank accounts for receipts and payments.',
        countKey: 'bankAccounts',
        master: 'bankAccounts',
      },
      {
        title: 'Chart of accounts',
        purpose: 'Ledger accounts used for posting and reports.',
        countKey: 'accounts',
        to: '/accounting',
        search: { view: 'accounts' },
      },
      {
        title: 'Asset categories',
        purpose: 'Fixed asset groups with useful life and residual value.',
        countKey: 'assetCategories',
        master: 'assetCategories',
      },
      {
        title: 'Document numbering',
        purpose: 'Prefix and next number for each document type.',
        countKey: 'numberSeries',
        master: 'numberSeries',
      },
    ],
  },
  {
    label: 'System',
    cards: [
      {
        title: 'Approval rules',
        purpose: 'Which documents need approval, above what value, and by whom.',
        countKey: 'approvalRules',
        to: '/settings',
        search: { tab: 'approvals' },
      },
      {
        title: 'Roles',
        purpose: 'Proposed roles and what each one can see and do.',
        countKey: 'roles',
        to: '/settings',
        search: { tab: 'roles' },
      },
    ],
  },
];

/** Filter the hub by text (title, purpose or group name). Empty groups are dropped. */
export function filterHub(groups: HubGroup[], q: string): HubGroup[] {
  const t = q.trim().toLowerCase();
  if (!t) return groups;
  return groups
    .map((g) => ({
      ...g,
      cards: g.label.toLowerCase().includes(t)
        ? g.cards
        : g.cards.filter((c) => `${c.title} ${c.purpose}`.toLowerCase().includes(t)),
    }))
    .filter((g) => g.cards.length);
}
