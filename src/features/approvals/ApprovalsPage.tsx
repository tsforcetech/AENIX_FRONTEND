import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';

/** FLOW-003 placeholder — replaced by the module implementation. */
export function ApprovalsPage() {
  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Everything waiting for your decision, from the approval matrix."
      />
      <StatusMessage kind="empty" title="Coming in FLOW-003" description="This screen is being built." />
    </div>
  );
}
