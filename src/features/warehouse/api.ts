import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MovementType, StockItem, StockMovement } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';

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
}

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
    const rows = [...protoDb.get().stockItems]
      .sort((a, b) => a.location.localeCompare(b.location))
      .map((s) => ({ ...s, customerName: lookupName.customer(s.customerId) }));
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.sku} ${r.description} ${r.customerName} ${r.location}`,
      }),
    );
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
