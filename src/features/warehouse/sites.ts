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
