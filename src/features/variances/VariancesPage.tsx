import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';

/** FLOW-003 placeholder — replaced by the module implementation. */
export function VariancesPage() {
  return (
    <div>
      <PageHeader
        title="Variances and claims"
        description="GRN and POD shortages, excess and damage: outcome, approval, claims and debit notes."
      />
      <StatusMessage kind="empty" title="Coming in FLOW-003" description="This screen is being built." />
    </div>
  );
}
