import { Badge } from '@/shared/ui/Badge';
import type { DocFlags } from './api';

/** Compact document-status chips: PL → GRN and request → POD. */
export function DocFlagChips({ flags }: { flags: DocFlags }) {
  const chips: { label: string; tone: 'danger' | 'warning' | 'info' }[] = [];
  if (flags.grnVariance) chips.push({ label: 'GRN variance', tone: 'danger' });
  else if (flags.awaitingGrn) chips.push({ label: 'Awaiting GRN', tone: 'info' });
  if (flags.podVariance)
    chips.push({
      label: `POD variance${flags.podVariance > 1 ? ` ×${flags.podVariance}` : ''}`,
      tone: 'danger',
    });
  if (flags.awaitingPod)
    chips.push({
      label: `Awaiting POD${flags.awaitingPod > 1 ? ` ×${flags.awaitingPod}` : ''}`,
      tone: 'warning',
    });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <Badge key={c.label} tone={c.tone}>
          {c.label}
        </Badge>
      ))}
    </div>
  );
}
