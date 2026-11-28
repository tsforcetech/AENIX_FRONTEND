import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';

/** Placeholder — replaced by the Masters hub. */
export function MastersPage() {
  return (
    <div>
      <PageHeader title="Masters" description="All master data in one place." />
      <StatusMessage kind="empty" title="Coming in FLOW-003" description="This screen is being built." />
    </div>
  );
}
