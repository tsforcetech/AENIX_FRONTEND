import { useSyncExternalStore } from 'react';
import type { SessionPrincipal } from '@/shared/auth/session';
import { PROTOTYPE_MODE } from './config';
import * as seed from '@/prototype/seed';

/**
 * In-memory prototype database. Lives only in the browser tab and resets on reload.
 * Only `prototype/` and feature `api.ts` mock adapters may touch it — screens never do.
 */
function initialState() {
  return {
    customers: structuredClone(seed.customers),
    vendors: structuredClone(seed.vendors),
    services: structuredClone(seed.services),
    vendorRates: structuredClone(seed.vendorRates),
    enquiries: structuredClone(seed.enquiries),
    quotations: structuredClone(seed.quotations),
    salesOrders: structuredClone(seed.salesOrders),
    purchaseOrders: structuredClone(seed.purchaseOrders),
    vendorPayments: structuredClone(seed.vendorPayments),
    ledgerAccounts: structuredClone(seed.ledgerAccounts),
    /** Remembered Excel column mappings, keyed `${docType}:${partyId}` (prototype; backend later). */
    importTemplates: {} as Record<string, Record<string, string>>,
    company: structuredClone(seed.company),
    contracts: structuredClone(seed.contracts),
    workOrders: structuredClone(seed.workOrders),
    stockItems: structuredClone(seed.stockItems),
    stockMovements: structuredClone(seed.stockMovements),
    storageRuns: structuredClone(seed.storageRuns),
    invoices: structuredClone(seed.invoices),
    vendorBills: structuredClone(seed.vendorBills),
    collections: structuredClone(seed.collections),
    journals: structuredClone(seed.journals),
    activity: structuredClone(seed.activity),
    notifications: structuredClone(seed.notifications),
    session: null as SessionPrincipal | null,
  };
}

export type ProtoDb = ReturnType<typeof initialState>;

/**
 * Prototype persistence: the sample database (incl. the demo persona, which is NOT a credential)
 * is kept in this tab's sessionStorage so a reload does not lose the demo. Never used outside
 * prototype mode; real sessions follow ADR-004 and never touch web storage.
 */
const STORAGE_KEY = 'aenix-prototype-db-v5'; // bump when the sample schema changes

function load(): ProtoDb {
  if (!PROTOTYPE_MODE) return initialState();
  try {
    // eslint-disable-next-line no-restricted-syntax -- prototype sample data only (see above)
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...initialState(), ...(JSON.parse(raw) as Partial<ProtoDb>) } : initialState();
  } catch {
    return initialState();
  }
}

function persist(db: ProtoDb) {
  if (!PROTOTYPE_MODE) return;
  try {
    // eslint-disable-next-line no-restricted-syntax -- prototype sample data only (see above)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable: demo still works in memory */
  }
}

let state: ProtoDb = load();
const listeners = new Set<() => void>();

export const protoDb = {
  get: (): ProtoDb => state,
  /** Immutable update: return the next state. */
  update(fn: (current: ProtoDb) => ProtoDb): void {
    state = fn(state);
    persist(state);
    listeners.forEach((l) => l());
  },
  reset(): void {
    state = initialState();
    persist(state);
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useProtoDb<T>(selector: (db: ProtoDb) => T): T {
  return useSyncExternalStore(protoDb.subscribe, () => selector(protoDb.get()));
}

/** Simulated network latency so loading states are visible in the prototype. */
export function latency<T>(value: T, ms = 160): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

let idSeq = 1000;
export function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}${idSeq}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function logActivity(event: Omit<ProtoDb['activity'][number], 'id' | 'at' | 'actor'>): void {
  const actor = state.session?.displayName ?? 'Prototype user';
  protoDb.update((db) => ({
    ...db,
    activity: [{ id: newId('ev'), at: nowIso(), actor, ...event }, ...db.activity],
  }));
}
