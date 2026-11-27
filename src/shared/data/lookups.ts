import { useQuery } from '@tanstack/react-query';
import { latency, protoDb } from '@/prototype/store';

/**
 * Reference lookups (REQUESTED contract API-DEP-12). Cached longer than transactional data.
 * Prototype adapter reads the in-memory store.
 */
export interface Option {
  value: string;
  label: string;
}

const STALE = 5 * 60_000;

export function useCustomerOptions() {
  return useQuery({
    queryKey: ['lookups', 'customers'],
    staleTime: STALE,
    queryFn: () =>
      latency(
        protoDb
          .get()
          .customers.filter((c) => c.status !== 'Inactive')
          .map((c) => ({ value: c.id, label: c.name })),
        60,
      ),
  });
}

export function useVendorOptions() {
  return useQuery({
    queryKey: ['lookups', 'vendors'],
    staleTime: STALE,
    queryFn: () =>
      latency(
        protoDb.get().vendors.map((v) => ({ value: v.id, label: `${v.name} · ${v.category}` })),
        60,
      ),
  });
}

export function useServiceOptions() {
  return useQuery({
    queryKey: ['lookups', 'services'],
    staleTime: STALE,
    queryFn: () =>
      latency(
        protoDb.get().services.map((s) => ({ value: s.id, label: s.name, unit: s.unit, mode: s.mode })),
        60,
      ),
  });
}

/** Display-name helpers for joined list rows (prototype adapters only). */
export const lookupName = {
  customer: (id: string) => protoDb.get().customers.find((c) => c.id === id)?.name ?? '—',
  vendor: (id: string) => protoDb.get().vendors.find((v) => v.id === id)?.name ?? '—',
  service: (id: string) => protoDb.get().services.find((s) => s.id === id)?.name ?? '—',
};

/**
 * Rate-card suggestion for a price line (prototype adapter; backend rate engine later).
 * Cost = the cheapest valid vendor rate for the service (lane match preferred); price = cost + 20%.
 */
export function suggestServiceRate(
  serviceId: string,
  lane?: { origin?: string; destination?: string },
): { unit?: string; description?: string; unitCost?: number; unitPrice?: number } {
  const db = protoDb.get();
  const svc = db.services.find((s) => s.id === serviceId);
  if (!svc) return {};
  const rates = db.vendorRates.filter((r) => r.serviceId === serviceId);
  const norm = (v?: string) => (v ?? '').trim().toLowerCase();
  const laneMatch = rates.filter(
    (r) => lane && norm(r.origin) === norm(lane.origin) && norm(r.destination) === norm(lane.destination),
  );
  const pool = laneMatch.length ? laneMatch : rates;
  const cost = pool.length ? Math.min(...pool.map((r) => r.rate)) : undefined;
  return {
    unit: svc.unit,
    description: svc.name,
    unitCost: cost,
    unitPrice: cost !== undefined ? Math.round(cost * 1.2 * 100) / 100 : undefined,
  };
}

/** Rich options for type-ahead pickers (search by name, code, city; hint shows terms). */
export function useCustomerComboOptions() {
  return useQuery({
    queryKey: ['lookups', 'customers', 'combo'],
    staleTime: STALE,
    queryFn: () =>
      latency(
        protoDb
          .get()
          .customers.filter((c) => c.status !== 'Inactive')
          .map((c) => ({
            value: c.id,
            label: c.name,
            hint: `${c.code} · ${c.city} · ${c.paymentTermsDays} days${c.status === 'On hold' ? ' · ON HOLD' : ''}`,
            keywords: `${c.code} ${c.industry} ${c.contactName}`,
          })),
        60,
      ),
  });
}

export function useServiceComboOptions() {
  return useQuery({
    queryKey: ['lookups', 'services', 'combo'],
    staleTime: STALE,
    queryFn: () =>
      latency(
        protoDb.get().services.map((s) => ({
          value: s.id,
          label: s.name,
          hint: `${s.code} · ${s.mode === 'Customs' ? 'Direct service' : s.mode} · per ${s.unit.toLowerCase()}`,
          keywords: `${s.code} ${s.mode} ${s.description}`,
          mode: s.mode,
          unit: s.unit,
        })),
        60,
      ),
  });
}
