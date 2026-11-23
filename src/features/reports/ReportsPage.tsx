import { useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { Tabs } from '@/shared/ui/Tabs';
import { formatMoney, formatMoneyCompact } from '@/shared/utils/format';
import { useReports, type ReportsData } from './api';
import { AgeingBar, ChartTable, HorizontalBars, MarginLine, MonthlyBars } from './charts';

type Tab = 'revenue' | 'customers' | 'lanes' | 'ageing';

export function ReportsPage() {
  const { data, isLoading, error } = useReports();
  const [tab, setTab] = useState<Tab>('revenue');
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Sample data · illustrative analytics until Phase 10 report specifications are approved."
      />
      <div className="mb-6">
        <Tabs
          label="Reports"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: 'revenue', label: 'Revenue & margin' },
            { value: 'customers', label: 'Top customers' },
            { value: 'lanes', label: 'Jobs by type & lanes' },
            { value: 'ageing', label: 'Receivables ageing' },
          ]}
        />
      </div>
      {error ? <StatusMessage kind="error" title="Could not load reports" /> : null}
      {isLoading || !data ? (
        <StatusMessage kind="loading" title="Loading reports…" />
      ) : (
        <TabContent tab={tab} data={data} />
      )}
    </div>
  );
}

const laneColumns: Column<ReportsData['lanes'][number]>[] = [
  { key: 'lane', header: 'Lane / site', cell: (l) => <span className="font-medium">{l.lane}</span> },
  { key: 'kind', header: 'Type', cell: (l) => l.kind },
  { key: 'jobs', header: 'Jobs', align: 'right', cell: (l) => l.jobs },
  { key: 'revenue', header: 'Revenue', align: 'right', cell: (l) => <Money amount={l.revenue} /> },
  {
    key: 'margin',
    header: 'Avg margin',
    align: 'right',
    cell: (l) => <span className={l.marginPct < 15 ? 'font-medium text-warning' : ''}>{l.marginPct}%</span>,
  },
];

function TabContent({ tab, data }: { tab: Tab; data: ReportsData }) {
  if (tab === 'revenue') {
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Monthly revenue" description="AED, last six months · sample data" />
          <CardBody>
            <MonthlyBars data={data.revenueByMonth} />
            <ChartTable
              headers={['Month', 'Revenue', 'Cost', 'Margin']}
              rows={data.revenueByMonth.map((m) => [
                m.month,
                formatMoney(m.revenue),
                formatMoney(m.cost),
                `${m.marginPct}%`,
              ])}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Gross margin" description="% of revenue · hover a month" />
          <CardBody>
            <MarginLine data={data.revenueByMonth} />
            <ChartTable
              headers={['Month', 'Margin']}
              rows={data.revenueByMonth.map((m) => [m.month, `${m.marginPct}%`])}
            />
          </CardBody>
        </Card>
      </div>
    );
  }
  if (tab === 'customers') {
    return (
      <Card>
        <CardHeader
          title="Top customers by job revenue"
          description="All work orders excl. cancelled · sample data"
        />
        <CardBody>
          <HorizontalBars
            items={data.topCustomers.map((c) => ({
              label: c.name,
              value: c.revenue,
              sub: `${c.jobs} job${c.jobs === 1 ? '' : 's'}`,
            }))}
          />
          <ChartTable
            headers={['Customer', 'Jobs', 'Revenue']}
            rows={data.topCustomers.map((c) => [c.name, c.jobs, formatMoney(c.revenue)])}
          />
        </CardBody>
      </Card>
    );
  }
  if (tab === 'lanes') {
    const groups = [
      {
        group: 'Transport' as const,
        title: 'Transport lanes',
        description: 'Road, sea and air jobs per lane',
      },
      { group: 'Warehouse' as const, title: 'Warehouse sites', description: 'Warehouse jobs per site' },
      {
        group: 'Service' as const,
        title: 'Direct service locations',
        description: 'Service-only jobs (e.g. customs) per location',
      },
    ];
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Revenue by job type"
            description="Transport by mode, warehouse and direct service · sample data"
          />
          <CardBody>
            <HorizontalBars
              items={data.jobsByType.map((t) => ({
                label: t.kind,
                value: t.revenue,
                sub: `${t.jobs} job${t.jobs === 1 ? '' : 's'} · margin ${t.marginPct}%`,
              }))}
            />
            <ChartTable
              headers={['Type', 'Jobs', 'Revenue', 'Avg margin']}
              rows={data.jobsByType.map((t) => [t.kind, t.jobs, formatMoney(t.revenue), `${t.marginPct}%`])}
            />
          </CardBody>
        </Card>
        {groups.map((g) => {
          const rows = data.lanes.filter((l) => l.group === g.group);
          if (rows.length === 0) return null;
          return (
            <Card key={g.group}>
              <CardHeader title={g.title} description={`${g.description} · sample data`} />
              <div className="mt-3">
                <DataTable
                  caption={g.title}
                  columns={laneColumns}
                  rows={rows}
                  rowKey={(l) => `${l.kind}|${l.lane}`}
                />
              </div>
            </Card>
          );
        })}
      </div>
    );
  }
  const total = data.ageing.reduce((s, b) => s + b.amount, 0);
  return (
    <Card>
      <CardHeader
        title="Receivables ageing"
        description={`${formatMoneyCompact(total)} open · days past due date · sample data`}
      />
      <CardBody>
        <AgeingBar buckets={data.ageing} />
        <ChartTable
          headers={['Bucket', 'Invoices', 'Outstanding']}
          rows={data.ageing.map((b) => [b.bucket, b.count, formatMoney(b.amount)])}
        />
      </CardBody>
    </Card>
  );
}
