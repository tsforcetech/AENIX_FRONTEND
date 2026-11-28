import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';

/** FLOW-003 placeholder — replaced by the module implementation. */
export function FleetPage() {
  return (
    <div>
      <PageHeader
        title="Fleet and trips"
        description="Own vehicles, drivers and trips with fuel, Salik and allowance costs charged to jobs."
      />
      <StatusMessage kind="empty" title="Coming in FLOW-003" description="This screen is being built." />
    </div>
  );
}
