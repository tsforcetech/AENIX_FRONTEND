import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Currency, CustomerRate, Service, VendorRate } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import type { ImportedRow } from '@/shared/ui/SpreadsheetImport';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import {
  expiredValidTo,
  matchByCodeOrName,
  parseSheetDate,
  rateRowProblems,
  rateStatus,
  type RateStatus,
} from './rates';

/** FLOW-003 S5/S6/T8: billing flags on a service. */
export interface ServiceFlagsInput {
  isDisbursement: boolean;
  isSurcharge: boolean;
  /** AED per order line; 0 = none. */
  minimumCharge: number;
}

/**
 * Services catalogue, buying (vendor) rates and selling rates (customer rates + standard price
 * list). PROTOTYPE ADAPTER — replace with the generated OpenAPI client when the Masters contract
 * (API-DEP-47) is published. Screens use the hooks only.
 */
export const RATES_TODAY = PROTO_TODAY;

export interface ServiceRow extends Service {
  serviceTypeName: string;
  taxCodeName: string;
  incomeAccountLabel: string;
  costAccountLabel: string;
  isActive: boolean;
}

export interface RateRow extends VendorRate {
  vendorName: string;
  serviceName: string;
  status: RateStatus;
}

export interface SellingRateRow extends CustomerRate {
  customerName: string;
  serviceName: string;
  status: RateStatus;
}

export interface RateFilter {
  serviceId?: string;
  vendorId?: string;
}

export interface SellingRateFilter {
  serviceId?: string;
  /** '' / undefined = all · 'list' = standard price list only · otherwise a customer id. */
  customerId?: string;
}

export type RateInput = Omit<VendorRate, 'id'>;
export type SellingRateInput = Omit<CustomerRate, 'id' | 'active'>;

export interface ServiceInput {
  code: string;
  name: string;
  serviceTypeId: string;
  unit: string;
  taxCodeId?: string;
  incomeAccountId?: string;
  costAccountId?: string;
  description: string;
  isDisbursement: boolean;
  isSurcharge: boolean;
  minimumCharge: number;
}

export interface ImportResult {
  added: number;
  skipped: { row: number; reason: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const accountLabel = (id?: string) => {
  const a = id ? protoDb.get().ledgerAccounts.find((x) => x.id === id) : undefined;
  return a ? `${a.code} ${a.name}` : '—';
};

/** Service type for a service: its own, else the first type with the same mode. */
function serviceTypeOf(s: Service) {
  const types = protoDb.get().serviceTypes;
  return types.find((t) => t.id === s.serviceTypeId) ?? types.find((t) => t.mode === s.mode);
}

function toServiceRow(s: Service): ServiceRow {
  const db = protoDb.get();
  const st = serviceTypeOf(s);
  return {
    ...s,
    serviceTypeName: st?.name ?? s.mode,
    taxCodeName: db.taxCodes.find((t) => t.id === s.taxCodeId)?.name ?? '—',
    incomeAccountLabel: accountLabel(s.incomeAccountId ?? st?.incomeAccountId),
    costAccountLabel: accountLabel(s.costAccountId ?? st?.costAccountId),
    isActive: s.active !== false,
  };
}

const yn = (b?: boolean) => (b ? 'Yes' : 'No');

function validateService(input: ServiceInput, id?: string): string | null {
  const db = protoDb.get();
  const code = input.code.trim().toUpperCase();
  if (!code) return 'Enter a code.';
  if (db.services.some((s) => s.id !== id && s.code.toUpperCase() === code))
    return `Code ${code} is already used by another service.`;
  if (!db.serviceTypes.some((t) => t.id === input.serviceTypeId)) return 'Choose a service type.';
  if (!Number.isFinite(input.minimumCharge) || input.minimumCharge < 0)
    return 'Minimum charge must be 0 or more.';
  if (input.isDisbursement && input.isSurcharge)
    return 'A service is either a disbursement or a surcharge, not both.';
  return null;
}

function buildService(input: ServiceInput, base: Pick<Service, 'id'> & Partial<Service>): Service {
  const st = protoDb.get().serviceTypes.find((t) => t.id === input.serviceTypeId);
  return {
    ...base,
    id: base.id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    mode: st?.mode ?? base.mode ?? 'Customs',
    serviceTypeId: input.serviceTypeId,
    unit: input.unit,
    description: input.description.trim(),
    taxCodeId: input.taxCodeId || undefined,
    incomeAccountId: input.incomeAccountId || undefined,
    costAccountId: input.costAccountId || undefined,
    isDisbursement: input.isDisbursement || undefined,
    isSurcharge: input.isSurcharge || undefined,
    minimumCharge: input.minimumCharge > 0 ? r2(input.minimumCharge) : undefined,
  };
}

function serviceChanges(a: Service, b: Service) {
  const db = protoDb.get();
  const st = (id?: string) => db.serviceTypes.find((t) => t.id === id)?.name ?? '—';
  const tax = (id?: string) => db.taxCodes.find((t) => t.id === id)?.name ?? '—';
  const fields: [string, string, string][] = [
    ['Code', a.code, b.code],
    ['Name', a.name, b.name],
    ['Service type', st(serviceTypeOf(a)?.id), st(b.serviceTypeId)],
    ['Unit', a.unit, b.unit],
    ['Tax code', tax(a.taxCodeId), tax(b.taxCodeId)],
    ['Income ledger', accountLabel(a.incomeAccountId), accountLabel(b.incomeAccountId)],
    ['Cost ledger', accountLabel(a.costAccountId), accountLabel(b.costAccountId)],
    ['Description', a.description, b.description],
    ['Disbursement', yn(a.isDisbursement), yn(b.isDisbursement)],
    ['Surcharge', yn(a.isSurcharge), yn(b.isSurcharge)],
    ['Minimum charge', String(a.minimumCharge ?? 0), String(b.minimumCharge ?? 0)],
  ];
  return fields.filter(([, f, t]) => f !== t).map(([field, from, to]) => ({ field, from, to }));
}

function toRateRow(r: VendorRate): RateRow {
  return {
    ...r,
    vendorName: lookupName.vendor(r.vendorId),
    serviceName: lookupName.service(r.serviceId),
    status: rateStatus(r.validFrom, r.validTo, RATES_TODAY),
  };
}

function toSellingRow(r: CustomerRate): SellingRateRow {
  return {
    ...r,
    customerName: r.customerId ? lookupName.customer(r.customerId) : 'Standard price list',
    serviceName: lookupName.service(r.serviceId),
    status: r.active ? rateStatus(r.validFrom, r.validTo, RATES_TODAY) : 'Expired',
  };
}

const laneText = (o?: string, d?: string) => (o || d ? `${o || 'any'} → ${d || 'any'}` : 'any lane');

function checkRateDates(validFrom: string, validTo: string, amount: number): string | null {
  const p = rateRowProblems({ validFrom, validTo, amount });
  return p.length ? `Check the rate: ${p.join(', ')}.` : null;
}

const text = (v: string | number | undefined) => String(v ?? '').trim();

export const servicesApi = {
  services(): Promise<ServiceRow[]> {
    return latency(protoDb.get().services.map(toServiceRow));
  },
  /** Form reference data: active service types (with mode and default ledgers) and ledgers. */
  serviceFormData() {
    const db = protoDb.get();
    const ledgers = (group: 'Income' | 'Expenses') =>
      db.ledgerAccounts
        .filter((a) => a.kind === 'Ledger' && a.group === group && a.active && !a.party)
        .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
    return latency(
      {
        serviceTypes: db.serviceTypes
          .filter((t) => t.active)
          .map((t) => ({
            value: t.id,
            label: t.name,
            mode: t.mode,
            incomeAccountId: t.incomeAccountId,
            costAccountId: t.costAccountId,
          })),
        incomeAccounts: ledgers('Income'),
        costAccounts: ledgers('Expenses'),
      },
      40,
    );
  },
  createService(input: ServiceInput): Promise<Service> {
    const err = validateService(input);
    if (err) return Promise.reject(new Error(err));
    const svc = buildService(input, { id: newId('svc'), active: true });
    protoDb.update((s) => ({ ...s, services: [...s.services, svc] }));
    logActivity({
      entity: 'Settings',
      entityId: svc.id,
      entityRef: svc.code,
      action: `added service ${svc.name}`,
    });
    return latency(svc, 250);
  },
  updateService(id: string, input: ServiceInput): Promise<Service> {
    const old = protoDb.get().services.find((s) => s.id === id);
    if (!old) return Promise.reject(new Error('Service not found.'));
    const err = validateService(input, id);
    if (err) return Promise.reject(new Error(err));
    const next = buildService(input, old);
    protoDb.update((s) => ({ ...s, services: s.services.map((x) => (x.id === id ? next : x)) }));
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: next.code,
      action: `edited service ${next.name}`,
      changes: serviceChanges(old, next),
    });
    return latency(next, 250);
  },
  setServiceActive(id: string, active: boolean): Promise<Service> {
    const old = protoDb.get().services.find((s) => s.id === id);
    if (!old) return Promise.reject(new Error('Service not found.'));
    const next: Service = { ...old, active };
    protoDb.update((s) => ({ ...s, services: s.services.map((x) => (x.id === id ? next : x)) }));
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: old.code,
      action: `${active ? 'reactivated' : 'deactivated'} service ${old.name}`,
      changes: [
        {
          field: 'Status',
          from: old.active === false ? 'Inactive' : 'Active',
          to: active ? 'Active' : 'Inactive',
        },
      ],
    });
    return latency(next, 200);
  },
  updateFlags(id: string, input: ServiceFlagsInput): Promise<Service> {
    const svc = protoDb.get().services.find((s) => s.id === id);
    if (!svc) return Promise.reject(new Error('Not found'));
    if (!Number.isFinite(input.minimumCharge) || input.minimumCharge < 0)
      return Promise.reject(new Error('Minimum charge must be 0 or more.'));
    if (input.isDisbursement && input.isSurcharge)
      return Promise.reject(new Error('A service is either a disbursement or a surcharge, not both.'));
    const next: Service = {
      ...svc,
      isDisbursement: input.isDisbursement || undefined,
      isSurcharge: input.isSurcharge || undefined,
      minimumCharge: input.minimumCharge > 0 ? r2(input.minimumCharge) : undefined,
    };
    protoDb.update((s) => ({ ...s, services: s.services.map((x) => (x.id === id ? next : x)) }));
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: svc.code,
      action: `updated the billing flags of ${svc.name}`,
      changes: serviceChanges(svc, next),
    });
    return latency(next, 250);
  },

  // ---------- Buying rates (vendor rates) ----------
  rates(filter: RateFilter): Promise<RateRow[]> {
    const rows = protoDb
      .get()
      .vendorRates.filter(
        (r) =>
          (!filter.serviceId || r.serviceId === filter.serviceId) &&
          (!filter.vendorId || r.vendorId === filter.vendorId),
      )
      .map(toRateRow);
    return latency(rows);
  },
  addRate(input: RateInput): Promise<VendorRate> {
    const err = checkRateDates(input.validFrom, input.validTo, input.rate);
    if (err) return Promise.reject(new Error(err));
    const rate: VendorRate = { id: newId('rate'), ...input };
    protoDb.update((s) => ({ ...s, vendorRates: [rate, ...s.vendorRates] }));
    logActivity({
      entity: 'Settings',
      entityId: rate.id,
      entityRef: lookupName.vendor(rate.vendorId),
      action: `added a buying rate for ${lookupName.service(rate.serviceId)} (${laneText(rate.origin, rate.destination)})`,
    });
    return latency(rate, 250);
  },
  updateRate(id: string, input: RateInput): Promise<VendorRate> {
    const old = protoDb.get().vendorRates.find((r) => r.id === id);
    if (!old) return Promise.reject(new Error('Rate not found.'));
    const err = checkRateDates(input.validFrom, input.validTo, input.rate);
    if (err) return Promise.reject(new Error(err));
    const next: VendorRate = { ...old, ...input };
    protoDb.update((s) => ({ ...s, vendorRates: s.vendorRates.map((r) => (r.id === id ? next : r)) }));
    const fields: [string, string, string][] = [
      ['Vendor', lookupName.vendor(old.vendorId), lookupName.vendor(next.vendorId)],
      ['Service', lookupName.service(old.serviceId), lookupName.service(next.serviceId)],
      ['Lane', laneText(old.origin, old.destination), laneText(next.origin, next.destination)],
      ['Unit', old.unit, next.unit],
      ['Rate', String(old.rate), String(next.rate)],
      ['Valid from', old.validFrom, next.validFrom],
      ['Valid to', old.validTo, next.validTo],
    ];
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: lookupName.vendor(next.vendorId),
      action: `edited a buying rate for ${lookupName.service(next.serviceId)}`,
      changes: fields.filter(([, a, b]) => a !== b).map(([field, from, to]) => ({ field, from, to })),
    });
    return latency(next, 250);
  },
  expireRate(id: string): Promise<VendorRate> {
    const old = protoDb.get().vendorRates.find((r) => r.id === id);
    if (!old) return Promise.reject(new Error('Rate not found.'));
    const next: VendorRate = { ...old, validTo: expiredValidTo(old.validFrom, RATES_TODAY) };
    protoDb.update((s) => ({ ...s, vendorRates: s.vendorRates.map((r) => (r.id === id ? next : r)) }));
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: lookupName.vendor(old.vendorId),
      action: `expired a buying rate for ${lookupName.service(old.serviceId)}`,
      changes: [{ field: 'Valid to', from: old.validTo, to: next.validTo }],
    });
    return latency(next, 200);
  },
  importRates(rows: ImportedRow[], fileName: string): Promise<ImportResult> {
    const db = protoDb.get();
    const added: VendorRate[] = [];
    const skipped: ImportResult['skipped'] = [];
    rows.forEach((row, i) => {
      const vendor = matchByCodeOrName(db.vendors, row.vendor);
      const service = matchByCodeOrName(db.services, row.service);
      const validFrom = parseSheetDate(row.validFrom);
      const validTo = parseSheetDate(row.validTo);
      const amount = Number(row.rate);
      const problems = [
        ...(vendor ? [] : [`vendor “${text(row.vendor)}” not found`]),
        ...(service ? [] : [`service “${text(row.service)}” not found`]),
        ...(text(row.origin) && text(row.destination) ? [] : ['origin and destination are required']),
        ...rateRowProblems({ validFrom, validTo, amount: Number.isFinite(amount) ? amount : null }),
      ];
      if (problems.length || !vendor || !service || !validFrom || !validTo) {
        skipped.push({ row: i + 1, reason: problems.join('; ') });
        return;
      }
      added.push({
        id: newId('rate'),
        vendorId: vendor.id,
        serviceId: service.id,
        origin: text(row.origin),
        destination: text(row.destination),
        unit: text(row.unit) || service.unit,
        rate: r2(amount),
        validFrom,
        validTo,
      });
    });
    if (added.length) {
      protoDb.update((s) => ({ ...s, vendorRates: [...added, ...s.vendorRates] }));
      logActivity({
        entity: 'Settings',
        entityId: 'vendor-rates',
        entityRef: fileName,
        action: `imported ${added.length} buying rate(s) from Excel`,
      });
    }
    return latency({ added: added.length, skipped }, 300);
  },

  // ---------- Selling rates (customer rates + standard price list) ----------
  sellingRates(filter: SellingRateFilter): Promise<SellingRateRow[]> {
    const rows = protoDb
      .get()
      .customerRates.filter(
        (r) =>
          (!filter.serviceId || r.serviceId === filter.serviceId) &&
          (!filter.customerId ||
            (filter.customerId === 'list' ? !r.customerId : r.customerId === filter.customerId)),
      )
      .map(toSellingRow);
    return latency(rows);
  },
  addSellingRate(input: SellingRateInput): Promise<CustomerRate> {
    const err = checkRateDates(input.validFrom, input.validTo, input.price);
    if (err) return Promise.reject(new Error(err));
    const rate: CustomerRate = { id: newId('cr'), ...cleanSelling(input), active: true };
    protoDb.update((s) => ({ ...s, customerRates: [rate, ...s.customerRates] }));
    logActivity({
      entity: 'Settings',
      entityId: rate.id,
      entityRef: rate.customerId ? lookupName.customer(rate.customerId) : 'Price list',
      action: `added a selling rate for ${lookupName.service(rate.serviceId)} (${laneText(rate.origin, rate.destination)})`,
    });
    return latency(rate, 250);
  },
  updateSellingRate(id: string, input: SellingRateInput): Promise<CustomerRate> {
    const old = protoDb.get().customerRates.find((r) => r.id === id);
    if (!old) return Promise.reject(new Error('Rate not found.'));
    const err = checkRateDates(input.validFrom, input.validTo, input.price);
    if (err) return Promise.reject(new Error(err));
    const next: CustomerRate = { ...old, ...cleanSelling(input) };
    if (!input.customerId) delete next.customerId;
    protoDb.update((s) => ({
      ...s,
      customerRates: s.customerRates.map((r) => (r.id === id ? next : r)),
    }));
    const who = (c?: string) => (c ? lookupName.customer(c) : 'Standard price list');
    const fields: [string, string, string][] = [
      ['Customer', who(old.customerId), who(next.customerId)],
      ['Service', lookupName.service(old.serviceId), lookupName.service(next.serviceId)],
      ['Lane', laneText(old.origin, old.destination), laneText(next.origin, next.destination)],
      ['Unit', old.unit, next.unit],
      ['Price', `${old.currency} ${old.price}`, `${next.currency} ${next.price}`],
      ['Valid from', old.validFrom, next.validFrom],
      ['Valid to', old.validTo, next.validTo],
    ];
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: who(next.customerId),
      action: `edited a selling rate for ${lookupName.service(next.serviceId)}`,
      changes: fields.filter(([, a, b]) => a !== b).map(([field, from, to]) => ({ field, from, to })),
    });
    return latency(next, 250);
  },
  expireSellingRate(id: string): Promise<CustomerRate> {
    const old = protoDb.get().customerRates.find((r) => r.id === id);
    if (!old) return Promise.reject(new Error('Rate not found.'));
    const next: CustomerRate = { ...old, validTo: expiredValidTo(old.validFrom, RATES_TODAY) };
    protoDb.update((s) => ({
      ...s,
      customerRates: s.customerRates.map((r) => (r.id === id ? next : r)),
    }));
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: old.customerId ? lookupName.customer(old.customerId) : 'Price list',
      action: `expired a selling rate for ${lookupName.service(old.serviceId)}`,
      changes: [{ field: 'Valid to', from: old.validTo, to: next.validTo }],
    });
    return latency(next, 200);
  },
  importSellingRates(rows: ImportedRow[], fileName: string): Promise<ImportResult> {
    const db = protoDb.get();
    const currencies = db.currencies.filter((c) => c.active).map((c) => c.code);
    const added: CustomerRate[] = [];
    const skipped: ImportResult['skipped'] = [];
    rows.forEach((row, i) => {
      const customerText = text(row.customer);
      const customer = customerText ? matchByCodeOrName(db.customers, customerText) : undefined;
      const service = matchByCodeOrName(db.services, row.service);
      const validFrom = parseSheetDate(row.validFrom);
      const validTo = parseSheetDate(row.validTo);
      const amount = Number(row.price);
      const currency = (text(row.currency) || 'AED').toUpperCase();
      const problems = [
        ...(customerText && !customer ? [`customer “${customerText}” not found`] : []),
        ...(service ? [] : [`service “${text(row.service)}” not found`]),
        ...(currencies.includes(currency) || currency === 'AED'
          ? []
          : [`currency ${currency} is not in the Currencies master`]),
        ...rateRowProblems({ validFrom, validTo, amount: Number.isFinite(amount) ? amount : null }),
      ];
      if (problems.length || !service || !validFrom || !validTo) {
        skipped.push({ row: i + 1, reason: problems.join('; ') });
        return;
      }
      added.push({
        id: newId('cr'),
        ...(customer ? { customerId: customer.id } : {}),
        serviceId: service.id,
        ...(text(row.origin) ? { origin: text(row.origin) } : {}),
        ...(text(row.destination) ? { destination: text(row.destination) } : {}),
        unit: text(row.unit) || service.unit,
        price: r2(amount),
        currency,
        validFrom,
        validTo,
        active: true,
      });
    });
    if (added.length) {
      protoDb.update((s) => ({ ...s, customerRates: [...added, ...s.customerRates] }));
      logActivity({
        entity: 'Settings',
        entityId: 'customer-rates',
        entityRef: fileName,
        action: `imported ${added.length} selling rate(s) from Excel`,
      });
    }
    return latency({ added: added.length, skipped }, 300);
  },
};

function cleanSelling(input: SellingRateInput): SellingRateInput {
  return {
    ...input,
    customerId: input.customerId || undefined,
    origin: input.origin?.trim() || undefined,
    destination: input.destination?.trim() || undefined,
    price: r2(input.price),
    currency: (input.currency || 'AED') as Currency,
  };
}

// ---------- Hooks ----------
const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['services'] });
  void qc.invalidateQueries({ queryKey: ['lookups', 'services'] });
  void qc.invalidateQueries({ queryKey: ['vendors'] });
  void qc.invalidateQueries({ queryKey: ['customers'] });
};

export function useServices() {
  return useQuery({ queryKey: ['services', 'catalogue'], queryFn: servicesApi.services });
}

export function useServiceFormData() {
  return useQuery({ queryKey: ['services', 'form-data'], queryFn: servicesApi.serviceFormData });
}

export function useRates(filter: RateFilter) {
  return useQuery({
    queryKey: ['services', 'rates', filter],
    queryFn: () => servicesApi.rates(filter),
    placeholderData: (prev) => prev,
  });
}

export function useSellingRates(filter: SellingRateFilter) {
  return useQuery({
    queryKey: ['services', 'selling-rates', filter],
    queryFn: () => servicesApi.sellingRates(filter),
    placeholderData: (prev) => prev,
  });
}

export function useSaveService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ServiceInput }) =>
      id ? servicesApi.updateService(id, input) : servicesApi.createService(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetServiceActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => servicesApi.setServiceActive(id, active),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateServiceFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ServiceFlagsInput & { id: string }) => servicesApi.updateFlags(id, input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSaveRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RateInput }) =>
      id ? servicesApi.updateRate(id, input) : servicesApi.addRate(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useExpireRate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: servicesApi.expireRate, onSuccess: () => invalidateAll(qc) });
}

export function useImportRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, fileName }: { rows: ImportedRow[]; fileName: string }) =>
      servicesApi.importRates(rows, fileName),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSaveSellingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SellingRateInput }) =>
      id ? servicesApi.updateSellingRate(id, input) : servicesApi.addSellingRate(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useExpireSellingRate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: servicesApi.expireSellingRate, onSuccess: () => invalidateAll(qc) });
}

export function useImportSellingRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, fileName }: { rows: ImportedRow[]; fileName: string }) =>
      servicesApi.importSellingRates(rows, fileName),
    onSuccess: () => invalidateAll(qc),
  });
}
