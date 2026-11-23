import { Plane, Ship, Truck, Warehouse, Wrench } from 'lucide-react';
import type { ServiceCategory, TransportMode } from '@/domain/types';
import { jobKindLabel } from '@/domain/workflow';

export const modeIcons: Record<TransportMode, typeof Truck> = { Road: Truck, Sea: Ship, Air: Plane };

export function ModeIcon({ mode, className = 'size-4' }: { mode: TransportMode; className?: string }) {
  const Icon = modeIcons[mode];
  return <Icon aria-label={`${mode} freight`} className={className} />;
}

/** Icon for any job/order: transport by mode, otherwise warehouse or direct service. */
export function jobKindIcon(category: ServiceCategory, mode?: TransportMode): typeof Truck {
  if (category === 'Warehouse') return Warehouse;
  if (category === 'Service') return Wrench;
  return modeIcons[mode ?? 'Road'];
}

export function JobKindIcon({
  category,
  mode,
  className = 'size-4',
}: {
  category: ServiceCategory;
  mode?: TransportMode;
  className?: string;
}) {
  const label = jobKindLabel(category, mode);
  if (category === 'Warehouse') return <Warehouse aria-label={label} className={className} />;
  if (category === 'Service') return <Wrench aria-label={label} className={className} />;
  if (mode === 'Sea') return <Ship aria-label={label} className={className} />;
  if (mode === 'Air') return <Plane aria-label={label} className={className} />;
  return <Truck aria-label={label} className={className} />;
}
