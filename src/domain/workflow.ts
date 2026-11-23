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
