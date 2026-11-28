import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Service, VendorRate } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';

/** FLOW-003 S5/S6/T8: billing flags on a service. */
export interface ServiceFlagsInput {
  isDisbursement: boolean;
  isSurcharge: boolean;
  /** AED per order line; 0 = none. */
  minimumCharge: number;
}

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
      minimumCharge: input.minimumCharge > 0 ? Math.round(input.minimumCharge * 100) / 100 : undefined,
    };
    protoDb.update((s) => ({ ...s, services: s.services.map((x) => (x.id === id ? next : x)) }));
    const yn = (b?: boolean) => (b ? 'Yes' : 'No');
    logActivity({
      entity: 'Settings',
      entityId: id,
      entityRef: svc.code,
      action: `updated the billing flags of ${svc.name}`,
      changes: [
        { field: 'Disbursement', from: yn(svc.isDisbursement), to: yn(next.isDisbursement) },
        { field: 'Surcharge', from: yn(svc.isSurcharge), to: yn(next.isSurcharge) },
        {
          field: 'Minimum charge',
          from: String(svc.minimumCharge ?? 0),
          to: String(next.minimumCharge ?? 0),
        },
      ],
    });
    return latency(next, 250);
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

export function useUpdateServiceFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ServiceFlagsInput & { id: string }) => servicesApi.updateFlags(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services'] });
      void qc.invalidateQueries({ queryKey: ['lookups', 'services'] });
    },
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
