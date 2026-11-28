import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertOpenPeriod } from '@/domain/controls';
import { nextDocNumber } from '@/domain/numbering';
import type { CycleCount, MovementType, StockItem, StockMovement, WarehouseLocation } from '@/domain/types';
import { approvalNeeded, onApprovalDecided, requestApproval } from '@/shared/data/approvals';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb, useProtoDb } from '@/prototype/store';
import {
  expiryState,
  isInLocation,
  maxCountDifference,
  occupancy,
  type ExpiryState,
  type LocationOccupancy,
} from './floor';

/**
 * Warehouse (3PL) data source. PROTOTYPE ADAPTER — replace with the generated OpenAPI client
 * when the Warehouse (Phase 5) contract is published. Stock invariants (no negative physical
 * stock, posted movements immutable) are enforced by the backend; mirrored here for the demo.
 */
export const WAREHOUSE = 'JAFZA WH-1';
export const PALLET_CAPACITY = 180;
const TODAY = '2026-11-23';
const WEEK_START = '2026-11-16';

export interface StockRow extends StockItem {
  customerName: string;
  /** FLOW-003 W5 */
  expiry: ExpiryState;
  status: NonNullable<StockItem['stockStatus']>;
  jobNumber?: string;
}

/** Stock screen filters (W5): stock status or expiry alert. */
export const STOCK_FILTERS = ['Available', 'Quarantine', 'Damaged', 'Expiring', 'Expired'] as const;

export interface MovementRow extends StockMovement {
  customerName: string;
  workOrderNumber?: string;
  units: number;
  lineSummary: string;
}

export interface WarehouseKpis {
  palletsUsed: number;
  palletsCapacity: number;
  skus: number;
  receiptsThisWeek: number;
  dispatchesThisWeek: number;
  draftMovements: number;
}

export interface NewSkuInput {
  sku: string;
  description: string;
  uom: string;
  location: string;
}

export interface MovementLineInput {
  stockItemId?: string;
  newSku?: NewSkuInput;
  quantity: number;
  pallets?: number;
}

export interface MovementInput {
  type: Exclude<MovementType, 'Transfer'>;
  customerId: string;
  workOrderId?: string;
  reference: string;
  reason?: string;
  lines: MovementLineInput[];
  post: boolean;
}

const prefix: Record<MovementType, string> = {
  Receipt: 'GRN',
  Dispatch: 'DSP',
  Adjustment: 'ADJ',
  Transfer: 'TRF',
};

function signed(type: MovementType, qty: number): number {
  if (type === 'Receipt') return Math.abs(qty);
  if (type === 'Dispatch') return -Math.abs(qty);
  if (type === 'Adjustment') return qty;
  return 0;
}

function toMovementRow(m: StockMovement): MovementRow {
  const db = protoDb.get();
  const items = m.lines.map((l) => db.stockItems.find((s) => s.id === l.stockItemId));
  return {
    ...m,
    customerName: lookupName.customer(m.customerId),
    workOrderNumber: m.workOrderId ? db.workOrders.find((w) => w.id === m.workOrderId)?.number : undefined,
    units: m.lines.reduce((s, l) => s + Math.abs(l.quantity), 0),
    lineSummary: items
      .map((it, i) => `${it?.sku ?? '—'} × ${m.lines[i]!.quantity}`)
      .slice(0, 2)
      .join(', ')
      .concat(m.lines.length > 2 ? ` +${m.lines.length - 2}` : ''),
  };
}

/** Apply a movement to stock; throws if any line would take physical stock below zero. */
function applyToStock(stock: StockItem[], m: StockMovement): StockItem[] {
  const next = stock.map((s) => ({ ...s }));
  for (const line of m.lines) {
    const item = next.find((s) => s.id === line.stockItemId);
    if (!item) throw new Error('Unknown stock item on movement');
    const delta = signed(m.type, line.quantity);
    const qty = item.qtyOnHand + delta;
    if (qty < 0)
      throw new Error(
        `${item.sku}: only ${item.qtyOnHand} ${item.uom.toLowerCase()} on hand — cannot remove ${Math.abs(delta)}.`,
      );
    const perPallet = item.qtyOnHand > 0 && item.pallets > 0 ? item.qtyOnHand / item.pallets : 0;
    item.pallets = qty === 0 ? 0 : perPallet > 0 ? Math.max(1, Math.round(qty / perPallet)) : item.pallets;
    item.qtyOnHand = qty;
  }
  return next;
}

export const warehouseApi = {
  kpis(): Promise<WarehouseKpis> {
    const db = protoDb.get();
    const recent = db.stockMovements.filter((m) => m.date >= WEEK_START);
    return latency({
      palletsUsed: db.stockItems.reduce((s, i) => s + i.pallets, 0),
      palletsCapacity: PALLET_CAPACITY,
      skus: db.stockItems.filter((s) => s.qtyOnHand > 0).length,
      receiptsThisWeek: recent.filter((m) => m.type === 'Receipt').length,
      dispatchesThisWeek: recent.filter((m) => m.type === 'Dispatch').length,
      draftMovements: db.stockMovements.filter((m) => m.status === 'Draft').length,
    });
  },

  stock(params: ListParams): Promise<Page<StockRow>> {
    const db = protoDb.get();
    const all: StockRow[] = [...db.stockItems]
      .sort(
        (a, b) =>
          a.location.localeCompare(b.location) || (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''),
      )
      .map((s) => ({
        ...s,
        customerName: lookupName.customer(s.customerId),
        expiry: s.qtyOnHand > 0 ? expiryState(s.expiryDate, TODAY) : 'No expiry',
        status: s.stockStatus ?? 'Available',
        jobNumber: s.workOrderId ? db.workOrders.find((w) => w.id === s.workOrderId)?.number : undefined,
      }));
    const q = params.search?.trim().toLowerCase();
    const searched = q
      ? all.filter((r) =>
          `${r.sku} ${r.description} ${r.customerName} ${r.location} ${r.batch ?? ''} ${r.jobNumber ?? ''}`
            .toLowerCase()
            .includes(q),
        )
      : all;
    const matches = (r: StockRow, f: string) =>
      f === 'Expiring' || f === 'Expired' ? r.expiry === f : r.status === f && r.qtyOnHand > 0;
    const counts: Record<string, number> = { All: searched.length };
    for (const f of STOCK_FILTERS) counts[f] = searched.filter((r) => matches(r, f)).length;
    const filtered = params.status ? searched.filter((r) => matches(r, params.status!)) : searched;
    const page = paginate(
      filtered,
      { ...params, search: undefined, status: undefined },
      { searchText: () => '' },
    );
    return latency({ ...page, counts });
  },

  movements(params: ListParams): Promise<Page<MovementRow>> {
    const rows = [...protoDb.get().stockMovements]
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .map(toMovementRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.reference} ${r.workOrderNumber ?? ''} ${r.lineSummary}`,
        status: (r) => r.type,
      }),
    );
  },

  stockForCustomer(customerId: string): Promise<StockItem[]> {
    return latency(
      protoDb.get().stockItems.filter((s) => s.customerId === customerId),
      60,
    );
  },

  jobsForCustomer(customerId: string): Promise<{ value: string; label: string }[]> {
    return latency(
      protoDb
        .get()
        .workOrders.filter((w) => w.customerId === customerId && w.status !== 'Cancelled')
        .map((w) => ({ value: w.id, label: `${w.number} · ${w.origin} → ${w.destination}` })),
      60,
    );
  },

  create(input: MovementInput): Promise<StockMovement> {
    const db = protoDb.get();
    if (input.type === 'Adjustment' && !input.reason?.trim())
      return Promise.reject(new Error('Adjustments require a reason'));
    const newItems: StockItem[] = [];
    const lines = input.lines.map((l) => {
      if (l.newSku) {
        const item: StockItem = {
          id: newId('stk'),
          sku: l.newSku.sku.toUpperCase(),
          customerId: input.customerId,
          description: l.newSku.description,
          warehouse: WAREHOUSE,
          location: l.newSku.location.toUpperCase(),
          qtyOnHand: 0,
          uom: l.newSku.uom,
          pallets: 0,
          receivedAt: TODAY,
        };
        newItems.push(item);
        return { stockItemId: item.id, quantity: l.quantity, pallets: l.pallets };
      }
      return { stockItemId: l.stockItemId!, quantity: l.quantity, pallets: l.pallets };
    });
    const lastNo = Math.max(
      0,
      ...db.stockMovements
        .filter((m) => m.type === input.type)
        .map((m) => Number(m.number.split('-')[1]) || 0),
    );
    const movement: StockMovement = {
      id: newId('mv'),
      number: `${prefix[input.type]}-${String(lastNo + 1).padStart(4, '0')}`,
      type: input.type,
      customerId: input.customerId,
      workOrderId: input.workOrderId || undefined,
      date: TODAY,
      warehouse: WAREHOUSE,
      lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })),
      status: 'Draft',
      reference: input.type === 'Adjustment' ? `${input.reference} — ${input.reason}` : input.reference,
    };
    let stock = [...db.stockItems, ...newItems];
    if (input.post) {
      stock = applyToStock(stock, movement); // throws on negative stock → nothing saved
      // New SKUs on a receipt take the pallet count entered on the line.
      stock = stock.map((s) => {
        const ln = lines.find((l) => l.stockItemId === s.id);
        return newItems.some((n) => n.id === s.id) && ln?.pallets ? { ...s, pallets: ln.pallets } : s;
      });
      movement.status = 'Posted';
    }
    protoDb.update((s) => ({ ...s, stockItems: stock, stockMovements: [movement, ...s.stockMovements] }));
    logActivity({
      entity: 'Warehouse',
      entityId: movement.id,
      entityRef: movement.number,
      action: `${input.post ? 'posted' : 'prepared'} a ${input.type.toLowerCase()}`,
    });
    return latency(movement, 250);
  },

  post(id: string): Promise<StockMovement> {
    const db = protoDb.get();
    const m = db.stockMovements.find((x) => x.id === id);
    if (!m) return Promise.reject(new Error('Movement not found'));
    if (m.status === 'Posted')
      return Promise.reject(new Error('Already posted — posted movements cannot change'));
    let stock: StockItem[];
    try {
      stock = applyToStock(db.stockItems, m);
    } catch (e) {
      return Promise.reject(e);
    }
    const posted = { ...m, status: 'Posted' as const };
    protoDb.update((s) => ({
      ...s,
      stockItems: stock,
      stockMovements: s.stockMovements.map((x) => (x.id === id ? posted : x)),
    }));
    logActivity({
      entity: 'Warehouse',
      entityId: id,
      entityRef: m.number,
      action: `posted the ${m.type.toLowerCase()}`,
    });
    return latency(posted, 200);
  },
};

export function useWarehouseKpis() {
  return useQuery({ queryKey: ['warehouse', 'kpis'], queryFn: warehouseApi.kpis });
}

export function useStock(params: ListParams) {
  return useQuery({
    queryKey: ['warehouse', 'stock', params],
    queryFn: () => warehouseApi.stock(params),
    placeholderData: (p) => p,
  });
}

export function useMovements(params: ListParams) {
  return useQuery({
    queryKey: ['warehouse', 'movements', params],
    queryFn: () => warehouseApi.movements(params),
    placeholderData: (p) => p,
  });
}

export function useCustomerStock(customerId: string) {
  return useQuery({
    queryKey: ['warehouse', 'customer-stock', customerId],
    queryFn: () => warehouseApi.stockForCustomer(customerId),
    enabled: !!customerId,
  });
}

export function useCustomerJobs(customerId: string) {
  return useQuery({
    queryKey: ['warehouse', 'customer-jobs', customerId],
    queryFn: () => warehouseApi.jobsForCustomer(customerId),
    enabled: !!customerId,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['warehouse'] });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
    void qc.invalidateQueries({ queryKey: ['storage-billing'] });
  };
}

export function useCreateMovement() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: warehouseApi.create, onSuccess: invalidate });
}

export function usePostMovement() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: warehouseApi.post, onSuccess: invalidate });
}

// =============================================================================================
// FLOW-003 WP-B — warehouse floor: bin locations (W4), lot inspection (W12), cycle counts (W8),
// stock statement (W15). PROTOTYPE ADAPTER (contracts pending). Optional module: own warehouse floor.
// =============================================================================================

export const LOCATION_ZONES: WarehouseLocation['zone'][] = [
  'Ambient',
  'Chilled',
  'Bulk floor',
  'Quarantine',
  'Dispatch',
];

export interface LocationRow extends LocationOccupancy {
  id: string;
}

export interface CycleCountRow extends CycleCount {
  customerName?: string;
  counted: number;
  differences: number;
  maxDifference: number;
}

export interface StockStatementRow {
  sku: string;
  description: string;
  batch: string;
  expiry: string;
  location: string;
  qty: number;
  uom: string;
  status: string;
}

/** Is the optional "own warehouse floor" module switched on (bins, put-away, picking, counts)? */
export function useWarehouseFloorEnabled(): boolean {
  return useProtoDb((db) => !!db.company.modules?.ownWarehouseFloor);
}

function toCountRow(c: CycleCount): CycleCountRow {
  const counted = c.lines.filter((l) => l.countedQty !== undefined);
  return {
    ...c,
    customerName: c.customerId ? lookupName.customer(c.customerId) : undefined,
    counted: counted.length,
    differences: counted.filter((l) => l.countedQty !== l.systemQty).length,
    maxDifference: maxCountDifference(c.lines),
  };
}

function zoneOf(lot: StockItem, locations: WarehouseLocation[]): WarehouseLocation | undefined {
  return locations.find((l) => isInLocation(lot, l));
}

/** Post a counted cycle count: lot quantities become the counted quantity (never below 0). */
function postCount(id: string): CycleCount {
  const db = protoDb.get();
  const cc = db.cycleCounts.find((c) => c.id === id);
  if (!cc) throw new Error('Cycle count not found');
  if (cc.status === 'Posted') throw new Error('This count is already posted');
  assertOpenPeriod(db.company, cc.date);
  const diffs = cc.lines.filter((l) => l.countedQty !== undefined && l.countedQty !== l.systemQty);
  const stock = db.stockItems.map((s) => ({ ...s }));
  for (const l of diffs) {
    const lot = stock.find((s) => s.id === l.stockItemId);
    if (!lot) throw new Error(`Lot for ${l.sku} no longer exists`);
    const next = lot.qtyOnHand + (l.countedQty! - l.systemQty);
    if (next < 0) throw new Error(`${l.sku}: the adjustment would take stock below zero`);
    const perPallet = lot.qtyOnHand > 0 && lot.pallets > 0 ? lot.qtyOnHand / lot.pallets : 0;
    lot.pallets = next === 0 ? 0 : perPallet > 0 ? Math.max(1, Math.round(next / perPallet)) : lot.pallets;
    lot.qtyOnHand = next;
  }
  const movements: StockMovement[] = [];
  if (diffs.length) {
    const byCustomer = new Map<string, typeof diffs>();
    for (const l of diffs) {
      const c = stock.find((s) => s.id === l.stockItemId)!.customerId;
      byCustomer.set(c, [...(byCustomer.get(c) ?? []), l]);
    }
    let lastNo = Math.max(
      0,
      ...db.stockMovements
        .filter((m) => m.type === 'Adjustment')
        .map((m) => Number(m.number.split('-')[1]) || 0),
    );
    for (const [customerId, lines] of byCustomer) {
      lastNo += 1;
      movements.push({
        id: newId('mv'),
        number: `ADJ-${String(lastNo).padStart(4, '0')}`,
        type: 'Adjustment',
        customerId,
        date: cc.date,
        warehouse: cc.warehouse,
        lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.countedQty! - l.systemQty })),
        status: 'Posted',
        reference: `Cycle count ${cc.number}`,
      });
    }
  }
  const posted: CycleCount = { ...cc, status: 'Posted' };
  protoDb.update((s) => ({
    ...s,
    stockItems: stock,
    stockMovements: [...movements, ...s.stockMovements],
    cycleCounts: s.cycleCounts.map((c) => (c.id === id ? posted : c)),
  }));
  logActivity({
    entity: 'Warehouse',
    entityId: id,
    entityRef: cc.number,
    action: `posted the cycle count (${diffs.length} adjustment line${diffs.length === 1 ? '' : 's'})`,
  });
  return posted;
}

onApprovalDecided('Stock adjustment (qty)', (req) => {
  const cc = protoDb.get().cycleCounts.find((c) => c.id === req.entityId);
  if (!cc) return;
  protoDb.update((s) => ({
    ...s,
    cycleCounts: s.cycleCounts.map((c) =>
      c.id === cc.id
        ? { ...c, approval: req.record, status: req.record.status === 'Approved' ? c.status : 'Counted' }
        : c,
    ),
  }));
  if (req.record.status === 'Approved') {
    try {
      postCount(cc.id);
    } catch (e) {
      logActivity({
        entity: 'Warehouse',
        entityId: cc.id,
        entityRef: cc.number,
        action: `approved but not posted: ${e instanceof Error ? e.message : 'error'}`,
      });
    }
  }
});

export const floorApi = {
  locations(): Promise<LocationRow[]> {
    const db = protoDb.get();
    return latency(
      occupancy(db.warehouseLocations, db.stockItems)
        .map((o) => ({ ...o, id: o.location.id }))
        .sort((a, b) => a.location.code.localeCompare(b.location.code)),
    );
  },

  createLocation(input: {
    code: string;
    zone: WarehouseLocation['zone'];
    capacityPallets: number;
  }): Promise<WarehouseLocation> {
    const code = input.code.trim().toUpperCase();
    if (code.length < 2) return Promise.reject(new Error('Enter a location code, e.g. A-01-02'));
    if (!(input.capacityPallets > 0)) return Promise.reject(new Error('Capacity must be above 0 pallets'));
    if (protoDb.get().warehouseLocations.some((l) => l.code.toUpperCase() === code))
      return Promise.reject(new Error(`Location ${code} already exists`));
    const loc: WarehouseLocation = {
      id: newId('loc'),
      warehouse: WAREHOUSE,
      code,
      zone: input.zone,
      capacityPallets: Math.round(input.capacityPallets),
      active: true,
    };
    protoDb.update((s) => ({ ...s, warehouseLocations: [...s.warehouseLocations, loc] }));
    logActivity({ entity: 'Warehouse', entityId: loc.id, entityRef: code, action: 'created a bin location' });
    return latency(loc, 150);
  },

  setLocationActive(id: string, active: boolean): Promise<WarehouseLocation> {
    const db = protoDb.get();
    const loc = db.warehouseLocations.find((l) => l.id === id);
    if (!loc) return Promise.reject(new Error('Location not found'));
    if (!active && db.stockItems.some((s) => s.qtyOnHand > 0 && isInLocation(s, loc)))
      return Promise.reject(new Error(`${loc.code} still holds stock — move it before deactivating`));
    const next = { ...loc, active };
    protoDb.update((s) => ({
      ...s,
      warehouseLocations: s.warehouseLocations.map((l) => (l.id === id ? next : l)),
    }));
    logActivity({
      entity: 'Warehouse',
      entityId: id,
      entityRef: loc.code,
      action: active ? 'reactivated the bin location' : 'deactivated the bin location',
    });
    return latency(next, 120);
  },

  /** W12: inspect a quarantined lot — release it to a storage bin or mark it damaged. */
  inspectLot(lotId: string, result: 'Available' | 'Damaged', locationId?: string): Promise<StockItem> {
    const db = protoDb.get();
    const lot = db.stockItems.find((s) => s.id === lotId);
    if (!lot) return Promise.reject(new Error('Lot not found'));
    if ((lot.stockStatus ?? 'Available') !== 'Quarantine')
      return Promise.reject(new Error('Only quarantined lots are inspected'));
    let next: StockItem = { ...lot, stockStatus: result };
    if (result === 'Available') {
      const loc = db.warehouseLocations.find((l) => l.id === locationId);
      if (!loc || !loc.active) return Promise.reject(new Error('Choose an active bin to release the lot to'));
      if (loc.zone === 'Quarantine') return Promise.reject(new Error('Choose a storage bin, not quarantine'));
      const occ = occupancy([loc], db.stockItems)[0]!;
      if (occ.free < lot.pallets)
        return Promise.reject(new Error(`${loc.code} has space for ${occ.free} pallet(s) only`));
      next = { ...next, locationId: loc.id, location: loc.code };
    }
    protoDb.update((s) => ({ ...s, stockItems: s.stockItems.map((x) => (x.id === lotId ? next : x)) }));
    logActivity({
      entity: 'Warehouse',
      entityId: lotId,
      entityRef: `${lot.sku}${lot.batch ? ` / ${lot.batch}` : ''}`,
      action:
        result === 'Available' ? `inspected and released to ${next.location}` : 'inspected — marked damaged',
    });
    return latency(next, 150);
  },

  cycleCounts(params: ListParams): Promise<Page<CycleCountRow>> {
    const rows = [...protoDb.get().cycleCounts]
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .map(toCountRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.zone ?? ''} ${r.customerName ?? ''}`,
        status: (r) => r.status,
      }),
    );
  },

  cycleCount(id: string): Promise<CycleCountRow> {
    const c = protoDb.get().cycleCounts.find((x) => x.id === id);
    return c ? latency(toCountRow(c)) : Promise.reject(new Error('Cycle count not found'));
  },

  createCycleCount(input: {
    zone?: WarehouseLocation['zone'];
    customerId?: string;
    date: string;
  }): Promise<CycleCount> {
    const db = protoDb.get();
    const lots = db.stockItems.filter(
      (s) =>
        s.qtyOnHand > 0 &&
        (!input.customerId || s.customerId === input.customerId) &&
        (!input.zone || zoneOf(s, db.warehouseLocations)?.zone === input.zone),
    );
    if (!lots.length) return Promise.reject(new Error('No stock to count for this zone / customer'));
    const cc: CycleCount = {
      id: newId('cc'),
      number: nextDocNumber(
        db.cycleCounts.map((c) => c.number),
        'CC-',
      ),
      warehouse: WAREHOUSE,
      customerId: input.customerId || undefined,
      zone: input.zone,
      date: input.date,
      lines: lots
        .sort((a, b) => a.location.localeCompare(b.location) || a.sku.localeCompare(b.sku))
        .map((s) => ({ stockItemId: s.id, sku: s.sku, locationCode: s.location, systemQty: s.qtyOnHand })),
      status: 'Open',
    };
    protoDb.update((s) => ({ ...s, cycleCounts: [cc, ...s.cycleCounts] }));
    logActivity({
      entity: 'Warehouse',
      entityId: cc.id,
      entityRef: cc.number,
      action: `created a cycle count (${cc.lines.length} lots)`,
    });
    return latency(cc, 150);
  },

  /** Save counted quantities; `submit` closes counting and posts (or asks for approval). */
  saveCounts(id: string, counted: Record<string, number | undefined>, submit: boolean): Promise<CycleCount> {
    const db = protoDb.get();
    const cc = db.cycleCounts.find((c) => c.id === id);
    if (!cc) return Promise.reject(new Error('Cycle count not found'));
    if (cc.status !== 'Open' && cc.status !== 'Counted')
      return Promise.reject(new Error('This count can no longer be changed'));
    if (Object.values(counted).some((q) => q !== undefined && (q < 0 || !Number.isFinite(q))))
      return Promise.reject(new Error('Counted quantities cannot be negative'));
    const lines = cc.lines.map((l) =>
      l.stockItemId in counted ? { ...l, countedQty: counted[l.stockItemId] } : l,
    );
    if (submit && lines.some((l) => l.countedQty === undefined))
      return Promise.reject(new Error('Enter a counted quantity on every line before submitting'));
    let next: CycleCount = {
      ...cc,
      lines,
      status: submit ? 'Counted' : cc.status,
      countedBy: submit ? (db.session?.displayName ?? 'Prototype user') : cc.countedBy,
    };
    protoDb.update((s) => ({ ...s, cycleCounts: s.cycleCounts.map((c) => (c.id === id ? next : c)) }));
    if (!submit) return latency(next, 120);
    const maxDiff = maxCountDifference(lines);
    const rule = maxDiff > 0 ? approvalNeeded('Stock adjustment (qty)', maxDiff) : undefined;
    try {
      if (rule) {
        const approval = requestApproval({
          docType: 'Stock adjustment (qty)',
          rule,
          entity: 'Warehouse',
          entityId: cc.id,
          entityRef: cc.number,
          summary: `Cycle count difference up to ${maxDiff} units (${lines.filter((l) => l.countedQty !== l.systemQty).length} lines)`,
          amount: maxDiff,
          href: `/warehouse/cycle-counts/${cc.id}`,
        });
        next = { ...next, approval, status: 'Pending approval' };
        protoDb.update((s) => ({ ...s, cycleCounts: s.cycleCounts.map((c) => (c.id === id ? next : c)) }));
        return latency(next, 150);
      }
      return latency(postCount(id), 150);
    } catch (e) {
      return Promise.reject(e);
    }
  },
};

/** W15: customer stock statement rows (lot level) — used by the customer portal download. */
export function stockStatement(customerId: string): StockStatementRow[] {
  return protoDb
    .get()
    .stockItems.filter((s) => s.customerId === customerId && s.qtyOnHand > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku) || (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
    .map((s) => ({
      sku: s.sku,
      description: s.description,
      batch: s.batch ?? '',
      expiry: s.expiryDate ?? '',
      location: s.location,
      qty: s.qtyOnHand,
      uom: s.uom,
      status: s.stockStatus ?? 'Available',
    }));
}

export function useLocations() {
  return useQuery({ queryKey: ['warehouse', 'locations'], queryFn: floorApi.locations });
}

export function useCycleCounts(params: ListParams) {
  return useQuery({
    queryKey: ['warehouse', 'cycle-counts', params],
    queryFn: () => floorApi.cycleCounts(params),
    placeholderData: (p) => p,
  });
}

export function useCycleCount(id: string) {
  return useQuery({ queryKey: ['warehouse', 'cycle-count', id], queryFn: () => floorApi.cycleCount(id) });
}

export type FloorAction =
  | { kind: 'createLocation'; code: string; zone: WarehouseLocation['zone']; capacityPallets: number }
  | { kind: 'setActive'; id: string; active: boolean }
  | { kind: 'inspect'; lotId: string; result: 'Available' | 'Damaged'; locationId?: string }
  | { kind: 'createCount'; zone?: WarehouseLocation['zone']; customerId?: string; date: string }
  | { kind: 'saveCounts'; id: string; counted: Record<string, number | undefined>; submit: boolean };

export function useFloorAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: FloorAction): Promise<{ id: string; number?: string; status?: string }> => {
      switch (a.kind) {
        case 'createLocation':
          return floorApi.createLocation(a);
        case 'setActive':
          return floorApi.setLocationActive(a.id, a.active);
        case 'inspect':
          return floorApi.inspectLot(a.lotId, a.result, a.locationId);
        case 'createCount':
          return floorApi.createCycleCount(a);
        case 'saveCounts':
          return floorApi.saveCounts(a.id, a.counted, a.submit);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse'] });
      void qc.invalidateQueries({ queryKey: ['variances'] });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
