import type { WorkOrder } from '@/domain/types';
import { Badge } from '@/shared/ui/Badge';

const tone = { Quotation: 'info', Contract: 'dark', Direct: 'brand' } as const;

export function SourceBadge({ type }: { type: WorkOrder['source']['type'] }) {
  return (
    <Badge tone={tone[type]} dot={false}>
      {type === 'Direct' ? 'Direct' : `From ${type.toLowerCase()}`}
    </Badge>
  );
}
