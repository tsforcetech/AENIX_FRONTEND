import { getRouteApi } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate } from '@/shared/utils/format';
import { useJournal } from './api';

const route = getRouteApi('/_app/accounting/$id');

export function JournalDetailPage() {
  const { id } = route.useParams();
  const { data: j, isLoading, error } = useJournal(id);

  if (error) return <StatusMessage kind="error" title="Journal not found" />;
  if (isLoading || !j) return <StatusMessage kind="loading" title="Loading journal…" />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        crumbs={[{ label: 'Accounting', to: '/accounting' }, { label: j.number }]}
        title={j.number}
        meta={<StatusBadge status={j.status} />}
        description={j.memo}
      />
      <div className="space-y-6">
        <Card>
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Date', value: formatDate(j.date) },
                { label: 'Source', value: j.source },
                { label: 'Reference', value: <span className="font-mono">{j.reference}</span> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Lines"
            actions={
              j.balanced ? (
                <span className="flex items-center gap-1.5 text-body-s font-medium text-success">
                  <CheckCircle2 aria-hidden="true" className="size-4" /> Balanced
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-body-s font-medium text-danger">
                  <AlertTriangle aria-hidden="true" className="size-4" /> Out of balance
                </span>
              )
            }
          />
          <CardBody className="pt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-body-s">
                <caption className="sr-only">Journal lines</caption>
                <thead>
                  <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">
                      Account
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Debit
                    </th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {j.lines.map((l, i) => (
                    <tr key={`${l.account}-${i}`} className="border-b border-border-subtle">
                      <td className={l.credit > 0 ? 'py-3 pl-6 pr-3' : 'py-3 pr-3'}>{l.account}</td>
                      <td className="px-3 py-3 text-right">
                        {l.debit ? <Money amount={l.debit} className="whitespace-nowrap" /> : null}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {l.credit ? <Money amount={l.credit} className="whitespace-nowrap" /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <th scope="row" className="py-3 pr-3 text-left">
                      Total
                    </th>
                    <td className="px-3 py-3 text-right">
                      <Money amount={j.totalDebit} className="whitespace-nowrap" />
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <Money amount={j.totalCredit} className="whitespace-nowrap" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-4 flex items-start gap-2 text-caption text-fg-muted">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Posted journals are immutable. Corrections are made with a reversing journal (backend-owned).
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
