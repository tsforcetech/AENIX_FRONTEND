import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VendorRate } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { latency, newId, protoDb } from '@/prototype/store';

/**
 * Services catalogue + vendor (buy) rates. PROTOTYPE ADAPTER — replace with the generated OpenAPI
 * client when the Masters (Phase 2) contract is published.
 */
export interface RateRow extends VendorRate {
  vendorName: string;
  serviceName: string;
}

export interface RateFilter {
  serviceId?: string;
  vendorId?: string;
}

export type RateInput = Omit<VendorRate, 'id'>;

export const servicesApi = {
  services() {
    return latency(protoDb.get().services);
  },
  rates(filter: RateFilter): Promise<RateRow[]> {
    const rows = protoDb
      .get()
      .vendorRates.filter(
        (r) =>
          (!filter.serviceId || r.serviceId === filter.serviceId) &&
          (!filter.vendorId || r.vendorId === filter.vendorId),
      )
      .map((r) => ({
        ...r,
        vendorName: lookupName.vendor(r.vendorId),
        serviceName: lookupName.service(r.serviceId),
      }));
    return latency(rows);
  },
  addRate(input: RateInput): Promise<VendorRate> {
    const rate: VendorRate = { id: newId('rate'), ...input };
    protoDb.update((s) => ({ ...s, vendorRates: [rate, ...s.vendorRates] }));
    return latency(rate, 250);
  },
};

export function useServices() {
  return useQuery({ queryKey: ['services', 'catalogue'], queryFn: servicesApi.services });
}

export function useRates(filter: RateFilter) {
  return useQuery({
    queryKey: ['services', 'rates', filter],
    queryFn: () => servicesApi.rates(filter),
    placeholderData: (prev) => prev,
  });
}

export function useAddRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: servicesApi.addRate,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services', 'rates'] });
      void qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}
