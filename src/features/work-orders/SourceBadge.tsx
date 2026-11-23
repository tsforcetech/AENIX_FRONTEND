import type { WorkOrder } from '@/domain/types';
import { Badge } from '@/shared/ui/Badge';

const tone = { 'Sales order': 'info', Quotation: 'info', Contract: 'dark', Direct: 'brand' } as const;

export function SourceBadge({ type, refLabel }: { type: WorkOrder['source']['type']; refLabel?: string }) {
  return (
    <Badge tone={tone[type]} dot={false}>
      {type === 'Direct' ? 'Direct' : refLabel ? refLabel : `From ${type.toLowerCase()}`}
    </Badge>
  );
}
