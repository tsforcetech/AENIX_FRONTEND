import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Badge } from '@/shared/ui/Badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DocRef, Money } from '@/shared/ui/Money';
import { formatDate, formatMoney, formatMoneyCompact } from '@/shared/utils/format';
import type { JobProfitRow, OccupancyRow, VendorPerformanceRow } from './analytics';
import type { ReportsData } from './api';
import { ChartTable } from './charts';
import { Meter, StackedBars } from './StackedBars';

type NewTab = 'profit' | 'vendors' | 'occupancy' | 'pdc';

/** FLOW-003 reports: job profitability (X8), vendor performance (T10), occupancy, PDC maturity (A15). */
export function NewReports({ tab, data }: { tab: NewTab; data: ReportsData }) {
  if (tab === 'profit') return <Profitability data={data.profitability} />;
  if (tab === 'vendors') return <VendorPerformance rows={data.vendorPerformance} />;
  if (tab === 'occupancy') return <Occupancy rows={data.occupancy} />;
  return <PdcMaturity data={data.pdc} />;
}

const thClass = 'px-4 py-2.5 text-caption font-medium uppercase tracking-wide text-fg-muted';
const pctText = (n: number) => `${n}%`;

// ---------- (a) Job profitability ----------
const jobColumns: Column<JobProfitRow>[] = [
  {
    key: 'job',
    header: 'Job',
    cell: (j) => (
      <div>
        <Link to="/work-orders/$id" params={{ id: j.id }} className="hover:underline">
          <DocRef>{j.number}</DocRef>
        </Link>
        <p className="text-caption text-fg-muted">{j.customerName}</p>
      </div>
    ),
  },
  {
    key: 'revenue',
    header: 'Revenue',
    align: 'right',
    cell: (j) => (
      <div>
        <Money amount={j.revenue} />
        <p className="text-caption text-fg-muted">
          {j.revenueSource === 'Invoiced' ? 'Invoiced' : 'From job lines'}
        </p>
      </div>
    ),
  },
  { key: 'vendor', header: 'Vendor PO cost', align: 'right', cell: (j) => <Money amount={j.vendorCost} /> },
  {
    key: 'internal',
    header: 'Internal cost',
    align: 'right',
    hideOnMobile: true,
    cell: (j) => <Money amount={j.internalCost} muted={j.internalCost === 0} />,
  },
  {
    key: 'gp',
    header: 'Gross profit',
    align: 'right',
    cell: (j) => (
      <span className={clsx('font-medium', j.grossProfit < 0 && 'text-danger')}>
        {formatMoney(j.grossProfit)}
        {j.grossProfit < 0 ? <span className="block text-caption">Loss</span> : null}
      </span>
    ),
  },
  {
    key: 'margin',
    header: 'Margin',
    align: 'right',
    cell: (j) => (
      <span className={clsx('tabular-nums', j.marginPct < 15 && 'font-medium text-warning')}>
        {pctText(j.marginPct)}
      </span>
    ),
  },
];

function Profitability({ data }: { data: ReportsData['profitability'] }) {
  const top = [...data.customers].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const total = data.jobs.reduce((s, j) => ({ revenue: s.revenue + j.revenue, gp: s.gp + j.grossProfit }), {
    revenue: 0,
    gp: 0,
  });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Gross profit by customer"
          description={`Revenue split into vendor cost, internal cost and gross profit · ${formatMoneyCompact(total.gp)} gross profit on ${formatMoneyCompact(total.revenue)} · AED`}
        />
        <CardBody>
          <StackedBars
            series={['Vendor PO cost', 'Internal cost', 'Gross profit']}
            rows={top.map((c) => {
              const vendor = data.jobs
                .filter((j) => j.customerId === c.customerId)
                .reduce((s, j) => s + j.vendorCost, 0);
              return {
                label: c.customerName,
                sub: `${c.jobs} job${c.jobs === 1 ? '' : 's'} · revenue ${formatMoneyCompact(c.revenue)}`,
                values: [vendor, c.cost - vendor, c.grossProfit],
                note: `${formatMoneyCompact(c.grossProfit)} · ${pctText(c.marginPct)}`,
              };
            })}
          />
          <ChartTable
            headers={['Customer', 'Jobs', 'Revenue', 'Cost', 'Gross profit', 'Margin']}
            rows={data.customers.map((c) => [
              c.customerName,
              c.jobs,
              formatMoney(c.revenue),
              formatMoney(c.cost),
              formatMoney(c.grossProfit),
              pctText(c.marginPct),
            ])}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Profit by job"
          description="Revenue from posted invoices (job lines until invoiced), minus vendor purchase orders and internal costs such as own-fleet trips. Excludes VAT and disbursements."
        />
        <div className="mt-3">
          <DataTable
            caption="Job profitability"
            columns={jobColumns}
            rows={data.jobs}
            rowKey={(j) => j.id}
            emptyTitle="No jobs yet"
          />
        </div>
      </Card>
    </div>
  );
}

// ---------- (b) Vendor performance ----------
const vendorColumns: Column<VendorPerformanceRow>[] = [
  {
    key: 'vendor',
    header: 'Vendor',
    cell: (v) => (
      <Link to="/vendors/$id" params={{ id: v.vendorId }} className="font-medium hover:underline">
        {v.vendorName}
      </Link>
    ),
  },
  { key: 'jobs', header: 'Jobs', align: 'right', cell: (v) => v.jobs },
  {
    key: 'ontime',
    header: 'On time',
    align: 'right',
    cell: (v) => (
      <span className="whitespace-nowrap tabular-nums">
        {v.onTime} of {v.delivered} delivered
      </span>
    ),
  },
  {
    key: 'pct',
    header: 'On-time %',
    align: 'right',
    cell: (v) =>
      v.onTimePct === null ? (
        <span className="text-fg-muted">No deliveries yet</span>
      ) : (
        <Meter value={v.onTimePct} label={`${v.vendorName} on-time rate`} />
      ),
  },
  {
    key: 'var',
    header: 'Variances',
    align: 'right',
    cell: (v) =>
      v.variances ? <Badge tone="warning">{v.variances}</Badge> : <span className="text-fg-muted">0</span>,
  },
];

function VendorPerformance({ rows }: { rows: VendorPerformanceRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Vendor performance"
        description="On time = delivered (vendor POD, delivery stop or final milestone) on or before the job ETA. Variances raised against the vendor from GRN, POD or counts."
      />
      <div className="mt-3">
        <DataTable
          caption="Vendor performance"
          columns={vendorColumns}
          rows={rows}
          rowKey={(v) => v.vendorId}
          emptyTitle="No vendor assignments yet"
        />
      </div>
    </Card>
  );
}

// ---------- (c) Warehouse occupancy ----------
function Occupancy({ rows }: { rows: OccupancyRow[] }) {
  const binned = rows.filter((r) => r.pct !== null);
  const cap = binned.reduce((s, r) => s + r.capacity, 0);
  const used = binned.reduce((s, r) => s + r.used, 0);
  return (
    <Card>
      <CardHeader
        title="Warehouse occupancy"
        description={`Pallets in use against bin capacity, by zone · ${used} of ${cap} pallet positions`}
      />
      <div
        className="mt-3 overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Warehouse occupancy by zone"
      >
        <table className="w-full border-collapse text-left text-body-s">
          <caption className="sr-only">Warehouse occupancy by zone</caption>
          <thead>
            <tr className="border-y border-border-subtle bg-canvas/60">
              <th scope="col" className={clsx(thClass, 'pl-5')}>
                Zone
              </th>
              <th scope="col" className={clsx(thClass, 'text-right')}>
                Bins
              </th>
              <th scope="col" className={clsx(thClass, 'text-right')}>
                Capacity (pallets)
              </th>
              <th scope="col" className={clsx(thClass, 'text-right')}>
                Used (pallets)
              </th>
              <th scope="col" className={clsx(thClass, 'pr-5 text-right')}>
                Occupancy
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.zone} className="border-b border-border-subtle">
                <th scope="row" className="px-4 py-3 pl-5 font-medium">
                  {r.zone}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{r.locations || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.capacity || '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.used}</td>
                <td className="px-4 py-3 pr-5 text-right">
                  {r.pct === null ? (
                    <span className="text-caption text-warning">Assign to a bin</span>
                  ) : (
                    <Meter value={r.pct} label={`${r.zone} occupancy`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-canvas/60 font-semibold">
              <th scope="row" className="px-4 py-3 pl-5">
                Total
              </th>
              <td className="px-4 py-3 text-right tabular-nums">
                {binned.reduce((s, r) => s + r.locations, 0)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{cap}</td>
              <td className="px-4 py-3 text-right tabular-nums">{used}</td>
              <td className="px-4 py-3 pr-5 text-right">
                <Meter value={cap ? (used / cap) * 100 : 0} label="Total occupancy" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-body-s text-fg-muted">No bin locations set up.</p>
      ) : null}
    </Card>
  );
}

// ---------- (d) PDC maturity ----------
type PdcItem = ReportsData['pdc']['items'][number];
const pdcColumns: Column<PdcItem>[] = [
  { key: 'no', header: 'Document', cell: (p) => <DocRef>{p.number}</DocRef> },
  {
    key: 'dir',
    header: 'Type',
    cell: (p) => (p.direction === 'Received' ? 'Received (customer)' : 'Issued (vendor)'),
  },
  { key: 'party', header: 'Party', cell: (p) => p.partyName },
  {
    key: 'date',
    header: 'Cheque date',
    cell: (p) => (
      <span className="whitespace-nowrap">
        {formatDate(p.chequeDate)}
        <span
          className={clsx('block text-caption', p.daysLeft < 0 ? 'font-medium text-danger' : 'text-fg-muted')}
        >
          {p.daysLeft < 0 ? `${-p.daysLeft} days past` : p.daysLeft === 0 ? 'Today' : `In ${p.daysLeft} days`}
        </span>
      </span>
    ),
  },
  { key: 'amt', header: 'Amount', align: 'right', cell: (p) => <Money amount={p.amount} /> },
];

function PdcMaturity({ data }: { data: ReportsData['pdc'] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="PDC maturity"
          description="Post-dated cheques not yet cleared: received from customers vs issued to vendors, by cheque date · AED"
        />
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="PDC maturity by period">
          <table className="w-full border-collapse text-left text-body-s">
            <caption className="sr-only">PDC maturity by period</caption>
            <thead>
              <tr className="border-y border-border-subtle bg-canvas/60">
                <th scope="col" className={clsx(thClass, 'pl-5')}>
                  Cheque date
                </th>
                <th scope="col" className={clsx(thClass, 'text-right')}>
                  Received
                </th>
                <th scope="col" className={clsx(thClass, 'text-right')}>
                  Issued
                </th>
                <th scope="col" className={clsx(thClass, 'pr-5 text-right')}>
                  Net cash in
                </th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((b) => (
                <tr key={b.bucket} className="border-b border-border-subtle last:border-0">
                  <th scope="row" className="px-4 py-3 pl-5 font-medium">
                    {b.bucket}
                  </th>
                  <td className="px-4 py-3 text-right">
                    <Money amount={b.received} muted={!b.receivedCount} />
                    <span className="block text-caption text-fg-muted">
                      {b.receivedCount} cheque{b.receivedCount === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money amount={b.issued} muted={!b.issuedCount} />
                    <span className="block text-caption text-fg-muted">
                      {b.issuedCount} cheque{b.issuedCount === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="px-4 py-3 pr-5 text-right font-medium">
                    <Money amount={Math.round((b.received - b.issued) * 100) / 100} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader title="Open post-dated cheques" description="Earliest cheque date first" />
        <div className="mt-3">
          <DataTable
            caption="Open post-dated cheques"
            columns={pdcColumns}
            rows={data.items}
            rowKey={(p) => p.id}
            emptyTitle="No open PDCs"
          />
        </div>
      </Card>
    </div>
  );
}
