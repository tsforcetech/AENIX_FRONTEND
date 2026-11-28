import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';

/** FLOW-003 placeholder — replaced by the module implementation. */
export function ExpensesPage() {
  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Overheads outside jobs: rent, salaries, utilities and petty cash."
      />
      <StatusMessage kind="empty" title="Coming in FLOW-003" description="This screen is being built." />
    </div>
  );
}
