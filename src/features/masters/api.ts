import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WarehouseSite } from '@/domain/types';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb, type ProtoDb } from '@/prototype/store';
import { PROPOSED_ROLES } from '@/shared/permissions/roles';
import {
  setSiteActive,
  siteStock,
  sitesApi,
  updateSite,
  type NewWarehouseInput,
  type WarehouseUpdate,
} from '@/features/warehouse/sites';
import { buildConfigs, MASTER_KEYS, type ConfigKey, type MasterConfig } from './config';
import {
  diffChanges,
  display,
  draftOf,
  mergeImport,
  parseDraft,
  seriesExample,
  validateValues,
  type Draft,
  type FieldChange,
  type MasterField,
  type MasterRow,
  type Option,
} from './logic';

/**
 * Masters mock adapter (PROTOTYPE ADAPTER — backend contract API-DEP-47 pending).
 * Screens use the hooks below; only this file reads or writes `protoDb` for the Masters area.
 * Every change is written to the audit log with the field changes (old → new).
 */
export const MASTER_CONFIGS = buildConfigs(() => protoDb.get());
export const getConfig = (key: ConfigKey): MasterConfig => MASTER_CONFIGS[key];

const YEAR = Number(PROTO_TODAY.slice(0, 4));

/** Thrown when a form has field errors; the dialog shows each message next to its field. */
export class FieldErrors extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super(Object.values(errors)[0] ?? 'Check the form');
  }
}

const rowsOf = (db: ProtoDb, key: ConfigKey) => db[key] as unknown as MasterRow[];
const setRows = (key: ConfigKey, rows: MasterRow[]) =>
  protoDb.update((db) => ({ ...db, [key]: rows }) as ProtoDb);

export interface MasterListRow {
  row: MasterRow;
  /** Where the entry is used (empty = free to delete). */
  usage: string[];
  /** Field → reason it cannot be changed on this row. */
  locked: Record<string, string>;
  /** Display text per list field. */
  cells: Record<string, string>;
  /** Next number example (document numbering only). */
  example?: string;
}

function lockedFields(cfg: MasterConfig, row: MasterRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of cfg.fields) {
    const why = f.lockedWhen?.(row);
    if (why) out[f.key] = why;
  }
  return out;
}

function listRows(key: ConfigKey): MasterListRow[] {
  const cfg = getConfig(key);
  const db = protoDb.get();
  return rowsOf(db, key).map((row) => {
    const cells: Record<string, string> = {};
    for (const f of cfg.fields) cells[f.key] = display(f, row[f.key], db, draftOf(cfg.fields, row, db));
    return {
      row,
      usage: cfg.usage(db, row),
      locked: lockedFields(cfg, row),
      cells,
      example:
        key === 'numberSeries'
          ? seriesExample(row as unknown as Parameters<typeof seriesExample>[0], YEAR)
          : undefined,
    };
  });
}

/** Options for a select field, given the current form values (e.g. modes of the chosen category). */
export function fieldOptions(field: MasterField, draft: Draft, row?: MasterRow): Option[] {
  return field.options?.({ db: protoDb.get(), draft, row }) ?? [];
}

/** Starting form values for a new entry or an existing row. */
export function initialDraft(key: ConfigKey, row?: MasterRow): Draft {
  return draftOf(getConfig(key).fields, row, protoDb.get());
}

/** Live example of the next number while editing a series. */
export function previewSeries(draft: Draft): string {
  const v = parseDraft(getConfig('numberSeries').fields, draft);
  return seriesExample(
    {
      prefix: String(v.prefix ?? ''),
      digits: Number(v.digits) || 1,
      nextNumber: Number(v.nextNumber) || 1,
      resetYearly: !!v.resetYearly,
    },
    YEAR,
  );
}

const refOf = (cfg: MasterConfig, row: MasterRow) =>
  cfg.codeKey === cfg.nameKey
    ? `${cfg.title}: ${String(row[cfg.codeKey])}`
    : `${cfg.title}: ${String(row[cfg.codeKey])} · ${String(row[cfg.nameKey])}`;

function log(cfg: MasterConfig, row: MasterRow, action: string, changes?: FieldChange[]) {
  logActivity({
    entity: 'Settings',
    entityId: row.id,
    entityRef: refOf(cfg, row),
    action,
    changes: changes?.length ? changes : undefined,
  });
}

/** Number series → company prefixes used by invoices and GRNs. */
const COMPANY_PREFIX: Record<string, 'invoicePrefix' | 'grnPrefix'> = {
  'Tax invoice': 'invoicePrefix',
  'Customer GRN': 'grnPrefix',
};

function syncCompanyPrefix(row: MasterRow, changes: FieldChange[]) {
  const field = COMPANY_PREFIX[String(row.docType)];
  if (!field) return;
  const prefix = String(row.prefix);
  const before = protoDb.get().company[field];
  if (before === prefix) return;
  protoDb.update((db) => ({ ...db, company: { ...db.company, [field]: prefix } }));
  changes.push({
    field: field === 'invoicePrefix' ? 'Company invoice prefix' : 'Company GRN prefix',
    from: before,
    to: prefix,
  });
}

export const mastersApi = {
  list: (key: ConfigKey) => latency(listRows(key), 80),

  save(key: ConfigKey, draft: Draft, editingId?: string): Promise<MasterRow> {
    const cfg = getConfig(key);
    const db = protoDb.get();
    const rows = rowsOf(db, key);
    const editing = editingId ? rows.find((r) => r.id === editingId) : undefined;
    if (editingId && !editing) return Promise.reject(new Error('This entry no longer exists'));
    if (!editing && !cfg.canAdd)
      return Promise.reject(new Error(`New ${cfg.singular} entries cannot be added`));
    // Locked fields keep their stored value whatever the form sent.
    const d: Draft = { ...draft };
    if (editing) {
      const keep = draftOf(cfg.fields, editing, db);
      for (const k of Object.keys(lockedFields(cfg, editing))) d[k] = keep[k]!;
    }
    const values = parseDraft(cfg.fields, d);
    const errors = validateValues(cfg.fields, values, { db, rows, editing, draft: d }, cfg.validate);
    if (Object.keys(errors).length) return Promise.reject(new FieldErrors(errors));
    if (editing) {
      const after: MasterRow = { ...editing, ...values };
      const changes = diffChanges(cfg.fields, editing, after, db);
      if (!changes.length) return latency(after);
      setRows(
        key,
        rows.map((r) => (r.id === editing.id ? after : r)),
      );
      if (key === 'numberSeries') syncCompanyPrefix(after, changes);
      log(cfg, after, `updated ${cfg.singular}`, changes);
      return latency(after);
    }
    const row: MasterRow = { id: newId(cfg.idPrefix), ...(cfg.hasActive ? { active: true } : {}), ...values };
    setRows(key, [...rows, row]);
    log(
      cfg,
      row,
      `added ${cfg.singular}`,
      diffChanges(cfg.fields, {}, row, db).filter((c) => c.to !== '—'),
    );
    return latency(row);
  },

  setActive(key: ConfigKey, id: string, active: boolean): Promise<MasterRow> {
    const cfg = getConfig(key);
    const rows = rowsOf(protoDb.get(), key);
    const row = rows.find((r) => r.id === id);
    if (!row) return Promise.reject(new Error('This entry no longer exists'));
    if (!cfg.hasActive) return Promise.reject(new Error('This list has no inactive entries'));
    if (!active) {
      const why = cfg.keepActive?.(row);
      if (why) return Promise.reject(new Error(why));
    }
    const after = { ...row, active };
    setRows(
      key,
      rows.map((r) => (r.id === id ? after : r)),
    );
    log(cfg, after, active ? `reactivated ${cfg.singular}` : `deactivated ${cfg.singular}`, [
      { field: 'Status', from: row.active ? 'Active' : 'Inactive', to: active ? 'Active' : 'Inactive' },
    ]);
    return latency(after);
  },

  remove(key: ConfigKey, id: string): Promise<void> {
    const cfg = getConfig(key);
    const db = protoDb.get();
    const rows = rowsOf(db, key);
    const row = rows.find((r) => r.id === id);
    if (!row) return Promise.reject(new Error('This entry no longer exists'));
    if (!cfg.canDelete || row.system)
      return Promise.reject(new Error('System entries are used by the workflow and cannot be deleted.'));
    const used = cfg.usage(db, row);
    if (used.length) return Promise.reject(new Error(`In use by ${used.join(', ')}. Deactivate it instead.`));
    setRows(
      key,
      rows.filter((r) => r.id !== id),
    );
    log(cfg, row, `deleted ${cfg.singular}`);
    return latency(undefined);
  },

  importRows(key: ConfigKey, imported: Record<string, string | number>[], fileName: string) {
    const cfg = getConfig(key);
    const db = protoDb.get();
    const res = mergeImport(rowsOf(db, key), imported, {
      fields: cfg.fields,
      codeKey: cfg.codeKey,
      db,
      canAdd: cfg.canAdd,
      newId: () => newId(cfg.idPrefix),
      defaults: cfg.hasActive ? { active: true } : {},
      extraValidate: cfg.validate,
    });
    if (res.added.length || res.updated.length) {
      setRows(key, res.rows);
      if (key === 'numberSeries') for (const u of res.updated) syncCompanyPrefix(u.after, u.changes);
      for (const r of res.added) log(cfg, r, `added ${cfg.singular} (Excel import ${fileName})`);
      for (const u of res.updated)
        log(cfg, u.after, `updated ${cfg.singular} (Excel import ${fileName})`, u.changes);
    }
    return latency({ added: res.added.length, updated: res.updated.length, skipped: res.skipped }, 200);
  },

  /** Update several currency rates at once (AED base is never re-rated). */
  updateRates(rates: { id: string; rate: number }[], date: string): Promise<number> {
    const db = protoDb.get();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.reject(new Error('Enter the rate date'));
    if (date > PROTO_TODAY) return Promise.reject(new Error('Rate date cannot be in the future'));
    const bad = rates.find((r) => !(r.rate > 0) || r.rate > 100000);
    if (bad) {
      const c = db.currencies.find((x) => x.id === bad.id);
      return Promise.reject(new Error(`Enter a rate above 0 for ${c?.code ?? 'each currency'}`));
    }
    const cfg = getConfig('currencies');
    let count = 0;
    const next = db.currencies.map((c) => {
      const u = rates.find((r) => r.id === c.id);
      if (!u || c.base || (c.rateToAed === u.rate && c.rateDate === date)) return c;
      count++;
      const after = { ...c, rateToAed: u.rate, rateDate: date };
      log(
        cfg,
        after as unknown as MasterRow,
        'updated the rate',
        diffChanges(
          cfg.fields.filter((f) => f.key === 'rateToAed' || f.key === 'rateDate'),
          c as unknown as MasterRow,
          after as unknown as MasterRow,
        ),
      );
      return after;
    });
    if (count) protoDb.update((s) => ({ ...s, currencies: next }));
    return latency(count);
  },
};

// ---------- Hub ----------

export type HubCounts = Record<string, number>;

function hubCounts(): HubCounts {
  const db = protoDb.get();
  const out: HubCounts = {};
  for (const k of MASTER_KEYS) {
    const rows = rowsOf(db, k);
    out[k] = getConfig(k).hasActive ? rows.filter((r) => r.active).length : rows.length;
  }
  return {
    ...out,
    customers: db.customers.filter((c) => c.status === 'Active').length,
    vendors: db.vendors.filter((v) => v.status === 'Active').length,
    services: db.services.length,
    sellingRates: db.customerRates.filter((r) => r.active).length,
    buyingRates: db.vendorRates.length,
    warehouses: db.warehouses.filter((w) => w.active).length,
    binLocations: db.warehouseLocations.filter((l) => l.active).length,
    fleet: db.vehicles.filter((v) => v.status !== 'Inactive').length + db.drivers.length,
    accounts: db.ledgerAccounts.filter((a) => a.active && !a.party).length,
    approvalRules: db.approvalRules.filter((r) => r.active).length,
    roles: PROPOSED_ROLES.length,
  };
}

export function useMasterHub() {
  return useQuery({ queryKey: ['masters', 'hub'], queryFn: () => latency(hubCounts(), 80) });
}

// ---------- Hooks ----------

export function useMasterRows(key: ConfigKey) {
  return useQuery({ queryKey: ['masters', 'rows', key], queryFn: () => mastersApi.list(key) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (key?: ConfigKey) => {
    void qc.invalidateQueries({ queryKey: ['masters'] });
    void qc.invalidateQueries({ queryKey: ['lookups'] });
    if (key === 'numberSeries') void qc.invalidateQueries({ queryKey: ['settings'] });
  };
}

export function useSaveMaster(key: ConfigKey) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { draft: Draft; id?: string }) => mastersApi.save(key, v.draft, v.id),
    onSuccess: () => inv(key),
  });
}

export function useSetMasterActive(key: ConfigKey) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; active: boolean }) => mastersApi.setActive(key, v.id, v.active),
    onSuccess: () => inv(key),
  });
}

export function useDeleteMaster(key: ConfigKey) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => mastersApi.remove(key, id),
    onSuccess: () => inv(key),
  });
}

export function useImportMaster(key: ConfigKey) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { rows: Record<string, string | number>[]; fileName: string }) =>
      mastersApi.importRows(key, v.rows, v.fileName),
    onSuccess: () => inv(key),
  });
}

export function useUpdateRates() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { rates: { id: string; rate: number }[]; date: string }) =>
      mastersApi.updateRates(v.rates, v.date),
    onSuccess: () => inv('currencies'),
  });
}

export const RATE_DATE_DEFAULT = PROTO_TODAY;

// ---------- Warehouses ----------

export interface WarehouseRow {
  site: WarehouseSite;
  vendorName?: string;
  stock: { lots: number; qty: number; pallets: number };
}

function warehouseRows(): WarehouseRow[] {
  const db = protoDb.get();
  return db.warehouses.map((site) => ({
    site,
    vendorName: db.vendors.find((v) => v.id === site.vendorId)?.name,
    stock: siteStock(site.id, db),
  }));
}

export function useWarehouseMaster() {
  return useQuery({ queryKey: ['masters', 'warehouses'], queryFn: () => latency(warehouseRows(), 80) });
}

/** Warehouse vendors (vendors whose category works like "Warehouse"). */
export function useWarehouseVendorOptions() {
  return useQuery({
    queryKey: ['masters', 'options', 'warehouseVendors'],
    queryFn: () =>
      latency(
        protoDb
          .get()
          .vendors.filter((v) => v.category === 'Warehouse' && v.status !== 'Inactive')
          .map((v) => ({ value: v.id, label: v.name })),
        40,
      ),
  });
}

function useInvalidateWarehouses() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['masters'] });
    void qc.invalidateQueries({ queryKey: ['warehouse'] });
  };
}

export function useAddWarehouse() {
  const inv = useInvalidateWarehouses();
  return useMutation({ mutationFn: (v: NewWarehouseInput) => sitesApi.create(v), onSuccess: inv });
}

export function useEditWarehouse() {
  const inv = useInvalidateWarehouses();
  return useMutation({
    mutationFn: (v: { id: string; input: WarehouseUpdate }) => updateSite(v.id, v.input),
    onSuccess: inv,
  });
}

export function useSetWarehouseActive() {
  const inv = useInvalidateWarehouses();
  return useMutation({
    mutationFn: (v: { id: string; active: boolean }) => setSiteActive(v.id, v.active),
    onSuccess: inv,
  });
}
