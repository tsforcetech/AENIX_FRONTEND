import { Plane, Ship, Truck } from 'lucide-react';
import type { TransportMode } from '@/domain/types';

export const modeIcons: Record<TransportMode, typeof Truck> = { Road: Truck, Sea: Ship, Air: Plane };

export function ModeIcon({ mode, className = 'size-4' }: { mode: TransportMode; className?: string }) {
  const Icon = modeIcons[mode];
  return <Icon aria-label={`${mode} freight`} className={className} />;
}
