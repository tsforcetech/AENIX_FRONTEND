import type { ServiceCategory, TransportMode } from './types';

/** Job milestone templates per service type (transport varies by mode). Prototype defaults. */
export const MILESTONE_TEMPLATES = {
  Road: [
    'Booking confirmed',
    'Vehicle assigned',
    'Loaded at origin',
    'In transit',
    'Border / customs cleared',
    'Delivered',
  ],
  Sea: [
    'Booking confirmed',
    'Container loaded',
    'Vessel departed',
    'Arrived at port',
    'Customs cleared',
    'Delivered to warehouse',
  ],
  Air: [
    'Booking confirmed',
    'Cargo received at origin',
    'Flight departed',
    'Arrived at DXB',
    'Customs cleared',
    'Delivered',
  ],
  Warehouse: [
    'Order confirmed',
    'PL sent to warehouse',
    'GRN received',
    'Goods stored',
    'Out request received',
    'Dispatched',
    'POD received',
  ],
  Service: ['Order confirmed', 'Documents received', 'Service in progress', 'Service completed'],
} as const;

export function milestoneLabels(category: ServiceCategory, mode?: TransportMode): readonly string[] {
  if (category === 'Transport') return MILESTONE_TEMPLATES[mode ?? 'Road'];
  return MILESTONE_TEMPLATES[category];
}

export const SERVICE_CATEGORIES: ServiceCategory[] = ['Transport', 'Warehouse', 'Service'];

export const serviceCategoryLabel: Record<ServiceCategory, string> = {
  Transport: 'Transport',
  Warehouse: 'Warehouse',
  Service: 'Direct service',
};

/** Human label for what a job/order is, e.g. "Road transport", "Warehouse", "Direct service". */
export function jobKindLabel(category: ServiceCategory, mode?: TransportMode): string {
  return category === 'Transport' ? `${mode ?? 'Road'} transport` : serviceCategoryLabel[category];
}

/** Service master mode → service type: Road/Sea/Air are transport, Warehouse is warehouse, anything else is a direct service. */
export function categoryOfServiceMode(mode: string): ServiceCategory {
  if (mode === 'Road' || mode === 'Sea' || mode === 'Air') return 'Transport';
  if (mode === 'Warehouse') return 'Warehouse';
  return 'Service';
}

/**
 * Every service type a multi-service order/job contains, in a stable order.
 * `serviceModeOf` maps a serviceId to the service master's mode.
 */
export function categoriesFromLines(
  lines: { serviceId: string }[],
  serviceModeOf: (serviceId: string) => string | undefined,
  extra: ServiceCategory[] = [],
): ServiceCategory[] {
  const set = new Set<ServiceCategory>(extra);
  for (const l of lines) {
    const m = serviceModeOf(l.serviceId);
    if (m) set.add(categoryOfServiceMode(m));
  }
  return SERVICE_CATEGORIES.filter((c) => set.has(c));
}

/** Primary type for icons/labels: transport if included, else warehouse, else direct service. */
export function primaryCategory(categories: ServiceCategory[]): ServiceCategory {
  return SERVICE_CATEGORIES.find((c) => categories.includes(c)) ?? 'Service';
}

/** e.g. "Sea transport + Warehouse + Direct service". */
export function servicesLabel(categories: ServiceCategory[], mode?: TransportMode): string {
  return categories.map((c) => jobKindLabel(c, mode)).join(' + ');
}
