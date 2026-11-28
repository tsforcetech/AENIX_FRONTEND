import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { StockItem, StockMovement, WarehouseSite, WorkOrder } from '@/domain/types';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';

/**
 * Warehouses (sites): the company's own warehouse(s) and sites run by warehouse vendors.
 * PROTOTYPE ADAPTER — backend contract API-DEP-46 pending.
 */
type Db = ReturnType<typeof protoDb.get>;

function ownSite(db: Db): WarehouseSite | undefined {
  return db.warehouses.find((w) => w.type === 'Own' && w.active) ?? db.warehouses[0];
}

/** A job's site: the site run by its (non-cancelled) warehouse vendor, else the own warehouse. */
export function siteOfJob(
  wo: Pick<WorkOrder, 'vendorAssignments'>,
  db: Db = protoDb.get(),
): string | undefined {
  const vendorIds = wo.vendorAssignments.map((a) => a.vendorId);
  return db.warehouses.find((w) => w.vendorId && vendorIds.includes(w.vendorId))?.id ?? ownSite(db)?.id;
}

/** Site of a stock lot or movement, by warehouse name (unknown names count as the own warehouse). */
export function siteOfName(name: string, db: Db = protoDb.get()): string | undefined {
  return db.warehouses.find((w) => w.name === name)?.id ?? ownSite(db)?.id;
}

export const inSite = (siteId: string | undefined, item: Pick<StockItem | StockMovement, 'warehouse'>) =>
  !siteId || siteOfName(item.warehouse) === siteId;

/** Warehouse name to write on new stock / movements for a site (default: own warehouse). */
export function siteName(siteId?: string): string {
  const db = protoDb.get();
  return (siteId ? db.warehouses.find((w) => w.id === siteId) : ownSite(db))?.name ?? 'Warehouse';
}

/** Selected warehouse on the warehouse screens (undefined = all warehouses). */
export const WarehouseScope = createContext<string | undefined>(undefined);
export const useWarehouseScope = () => useContext(WarehouseScope);

export interface NewWarehouseInput {
  name: string;
  type: WarehouseSite['type'];
  vendorId?: string;
  city: string;
  palletCapacity: number;
}

export const sitesApi = {
  list: () => latency(protoDb.get().warehouses, 60),
  create(input: NewWarehouseInput): Promise<WarehouseSite> {
    const name = input.name.trim();
    if (name.length < 2) return Promise.reject(new Error('Enter the warehouse name'));
    if (protoDb.get().warehouses.some((w) => w.name.toLowerCase() === name.toLowerCase()))
      return Promise.reject(new Error(`${name} already exists`));
    if (input.type === 'Vendor' && !input.vendorId)
      return Promise.reject(new Error('Choose the warehouse vendor that runs this site'));
    if (!(input.palletCapacity > 0)) return Promise.reject(new Error('Capacity must be above 0 pallets'));
    const site: WarehouseSite = {
      id: newId('wh'),
      code: name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .slice(0, 12),
      name,
      type: input.type,
      vendorId: input.type === 'Vendor' ? input.vendorId : undefined,
      city: input.city.trim(),
      palletCapacity: Math.round(input.palletCapacity),
      active: true,
    };
    protoDb.update((s) => ({ ...s, warehouses: [...s.warehouses, site] }));
    logActivity({
      entity: 'Warehouse',
      entityId: site.id,
      entityRef: site.name,
      action: 'added a warehouse',
    });
    return latency(site);
  },
};

export function useWarehouses() {
  return useQuery({ queryKey: ['warehouse', 'sites'], queryFn: sitesApi.list });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sitesApi.create,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['warehouse'] }),
  });
}

// ---------- FLOW-003 M1: edit / deactivate a warehouse (Masters → Warehouses) ----------

export interface WarehouseUpdate {
  name: string;
  city: string;
  palletCapacity: number;
  /** Warehouse vendor that runs the site (vendor-run sites only). */
  vendorId?: string;
}

/** Stock the site still holds (lots with quantity on hand). */
export function siteStock(siteId: string, db: Db = protoDb.get()) {
  const lots = db.stockItems.filter((s) => s.qtyOnHand > 0 && siteOfName(s.warehouse, db) === siteId);
  return {
    lots: lots.length,
    qty: lots.reduce((n, s) => n + s.qtyOnHand, 0),
    pallets: lots.reduce((n, s) => n + s.pallets, 0),
  };
}

const capacityText = (n: number) => `${n} pallets`;

/**
 * Edit a site. A new name is carried to its stock, movements, bin locations and cycle counts
 * (they refer to the site by name in the prototype).
 */
export function updateSite(
  id: string,
  input: WarehouseUpdate,
): Promise<{ site: WarehouseSite; changes: { field: string; from: string; to: string }[] }> {
  const db = protoDb.get();
  const before = db.warehouses.find((w) => w.id === id);
  if (!before) return Promise.reject(new Error('Warehouse not found'));
  const name = input.name.trim();
  if (name.length < 2) return Promise.reject(new Error('Enter the warehouse name'));
  if (db.warehouses.some((w) => w.id !== id && w.name.toLowerCase() === name.toLowerCase()))
    return Promise.reject(new Error(`${name} already exists`));
  if (!(input.palletCapacity > 0)) return Promise.reject(new Error('Capacity must be above 0 pallets'));
  if (before.type === 'Vendor' && !input.vendorId)
    return Promise.reject(new Error('Choose the warehouse vendor that runs this site'));
  const after: WarehouseSite = {
    ...before,
    name,
    city: input.city.trim(),
    palletCapacity: Math.round(input.palletCapacity),
    vendorId: before.type === 'Vendor' ? input.vendorId : undefined,
  };
  const vendorName = (vid?: string) => db.vendors.find((v) => v.id === vid)?.name ?? '—';
  const changes = (
    [
      ['Name', before.name, after.name],
      ['City / area', before.city || '—', after.city || '—'],
      ['Capacity', capacityText(before.palletCapacity), capacityText(after.palletCapacity)],
      ['Run by vendor', vendorName(before.vendorId), vendorName(after.vendorId)],
    ] as const
  )
    .filter(([, from, to]) => from !== to)
    .map(([field, from, to]) => ({ field, from, to }));
  if (!changes.length) return latency({ site: after, changes });
  const rename = <T extends { warehouse: string }>(xs: T[]) =>
    before.name === name ? xs : xs.map((x) => (x.warehouse === before.name ? { ...x, warehouse: name } : x));
  protoDb.update((s) => ({
    ...s,
    warehouses: s.warehouses.map((w) => (w.id === id ? after : w)),
    stockItems: rename(s.stockItems),
    stockMovements: rename(s.stockMovements),
    warehouseLocations: rename(s.warehouseLocations),
    cycleCounts: rename(s.cycleCounts),
  }));
  logActivity({
    entity: 'Warehouse',
    entityId: id,
    entityRef: after.name,
    action: 'updated a warehouse',
    changes,
  });
  return latency({ site: after, changes });
}

/** Deactivate / reactivate a site. A site that still holds stock cannot be deactivated. */
export function setSiteActive(id: string, active: boolean): Promise<WarehouseSite> {
  const db = protoDb.get();
  const site = db.warehouses.find((w) => w.id === id);
  if (!site) return Promise.reject(new Error('Warehouse not found'));
  if (!active) {
    const stock = siteStock(id, db);
    if (stock.lots)
      return Promise.reject(
        new Error(
          `${site.name} still holds stock (${stock.lots} lot${stock.lots === 1 ? '' : 's'}, ${stock.qty} units). Move or dispatch it first.`,
        ),
      );
  }
  const after = { ...site, active };
  protoDb.update((s) => ({ ...s, warehouses: s.warehouses.map((w) => (w.id === id ? after : w)) }));
  logActivity({
    entity: 'Warehouse',
    entityId: id,
    entityRef: site.name,
    action: active ? 'reactivated a warehouse' : 'deactivated a warehouse',
    changes: [
      { field: 'Status', from: site.active ? 'Active' : 'Inactive', to: active ? 'Active' : 'Inactive' },
    ],
  });
  return latency(after);
}
