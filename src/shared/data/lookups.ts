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
