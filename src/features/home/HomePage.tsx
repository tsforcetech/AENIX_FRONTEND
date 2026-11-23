import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  Info,
  Plane,
  Plus,
  Receipt,
  Ship,
  Truck,
  Wallet,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { jobKindLabel } from '@/domain/workflow';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { useSession } from '@/shared/auth/session';
import { ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { KpiCard } from '@/shared/ui/KpiCard';
import { StatusBadge } from '@/shared/ui/Badge';
import { Avatar } from '@/shared/ui/Avatar';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatRelative,
} from '@/shared/utils/format';
import { JOB_KINDS, useHomeOverview, type HomeOverview, type JobKind } from './api';

/** Categorical slots 1–5 in fixed order (validated); labels and counts always shown (slots 3–5 < 3:1). */
const kindColor: Record<JobKind, string> = {
  Road: '#2a78d6',
  Sea: '#eb6834',
  Air: '#1baf7a',
  Warehouse: '#eda100',
  Service: '#e87ba4',
};
const kindLabel: Record<JobKind, string> = {
  Road: 'Road transport',
  Sea: 'Sea freight',
  Air: 'Air freight',
  Warehouse: 'Warehouse',
  Service: 'Direct service',
};
const kindIcon: Record<JobKind, typeof Truck> = {
  Road: Truck,
  Sea: Ship,
  Air: Plane,
  Warehouse,
  Service: Wrench,
};

function greeting(hour: number) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { principal } = useSession();
  const { data, isLoading, error } = useHomeOverview();
  const firstName = principal?.displayName.split(' ')[0] ?? '';
  const hour = Number(
    new Intl.DateTimeFormat('en-AE', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dubai' }).format(
      new Date(),
    ),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-body-s text-fg-muted">
            {data
              ? new Intl.DateTimeFormat('en-AE', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(new Date(`${data.today}T12:00:00+04:00`))
              : ' '}
          </p>
          <h1 className="mt-1 text-[30px] font-semibold leading-9 tracking-tight">
            {greeting(hour)}, {firstName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/enquiries/new" variant="secondary" icon={<Plus aria-hidden="true" />}>
            New enquiry
          </ButtonLink>
          <ButtonLink to="/work-orders/new" variant="primary" icon={<Plus aria-hidden="true" />}>
            New work order
          </ButtonLink>
        </div>
      </header>

      {error ? <StatusMessage kind="error" title="Could not load the overview" /> : null}
      {isLoading || !data ? <HomeSkeleton /> : <HomeContent data={data} />}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={clsx('h-32 animate-pulse rounded-xl bg-surface', i > 3 && 'sm:col-span-2')} />
      ))}
    </div>
  );
}

function HomeContent({ data }: { data: HomeOverview }) {
  const k = data.kpis;
  return (
    <>
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Jobs running"
          value={formatNumber(k.activeWorkOrders)}
          icon={<Truck />}
          delta={12}
          deltaLabel="vs last week"
        />
        <KpiCard
          label="Revenue · November"
          value={formatMoneyCompact(k.revenueMonth)}
          icon={<CircleDollarSign />}
          delta={k.revenueDeltaPct}
          trend={k.revenueTrend}
        />
        <KpiCard
          label="Receivables open"
          value={formatMoneyCompact(k.receivables)}
          icon={<Receipt />}
          footnote={
            k.overdueCount ? (
              <span className="font-medium text-danger">
                {k.overdueCount} overdue · {formatMoneyCompact(k.overdueAmount)}
              </span>
            ) : (
              <span className="text-success">Nothing overdue</span>
            )
          }
        />
        <KpiCard
          label="Collected · November"
          value={formatMoneyCompact(k.collectedMonth)}
          icon={<Wallet />}
          delta={8.4}
          trend={k.collectedTrend}
        />
      </section>

      <Pipeline stages={data.pipeline} />

      <div className="grid gap-6 xl:grid-cols-3">
        <RevenueChart data={data.revenueByMonth} className="xl:col-span-2" />
        <Attention items={data.attention} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ActiveShipments items={data.activeShipments} className="xl:col-span-2" />
        <div className="space-y-6">
          <KindMix mix={data.kindMix} />
          <WarehouseCard w={data.warehouse} />
        </div>
      </div>

      <Activity items={data.activity} today={data.today} />
    </>
  );
}

/** Order-to-cash flow: chevron stages echo the AENIX mark. */
function Pipeline({ stages }: { stages: HomeOverview['pipeline'] }) {
  return (
    <Card>
      <CardHeader
        title="Order to cash"
        description="Where every customer request is right now — enquiry through to collected cash."
      />
      <CardBody>
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
          {stages.map((s, i) => (
            <li key={s.key}>
              <Link
                to={s.to}
                className={clsx(
                  'group relative block h-full rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover',
                  i === stages.length - 1
                    ? 'border-transparent bg-surface-inverse text-fg-inverse'
                    : 'border-border-subtle bg-canvas hover:bg-surface',
                )}
              >
                <span
                  className={clsx(
                    'font-mono text-[11px] font-medium',
                    i === stages.length - 1 ? 'text-white/60' : 'text-fg-muted',
                  )}
                >
                  0{i + 1}
                </span>
                <span className="mt-1 block text-body-s font-medium">{s.label}</span>
                <span className="mt-3 block text-[28px] font-semibold leading-none tabular-nums tracking-tight">
                  {s.count}
                </span>
                <span
                  className={clsx(
                    'mt-2 block text-caption tabular-nums',
                    i === stages.length - 1 ? 'text-white/70' : 'text-fg-muted',
                  )}
                >
                  {s.value ? formatMoneyCompact(s.value) : 'Awaiting price'}
                </span>
                {i < stages.length - 1 ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 24"
                    className="absolute -right-[9px] top-1/2 z-10 hidden h-6 w-3 -translate-y-1/2 xl:block"
                  >
                    <path
                      d="M2 2 L10 12 L2 22"
                      fill="none"
                      stroke="var(--color-brand)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function RevenueChart({ data, className }: { data: HomeOverview['revenueByMonth']; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Nice axis: round the top up to a whole 100K and split into four equal steps; bars use the same scale.
  const max = Math.max(100_000, Math.ceil(Math.max(...data.map((d) => d.revenue)) / 100_000) * 100_000);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const active = hover ?? data.length - 1;
  const cur = data[active]!;
  return (
    <Card className={className}>
      <CardHeader
        title="Monthly revenue"
        description="Last six months, AED (sample data)"
        actions={
          <div className="text-right">
            <p className="text-[22px] font-semibold tabular-nums tracking-tight">
              {formatMoneyCompact(cur.revenue)}
            </p>
            <p className="text-caption text-fg-muted">
              {cur.month} · margin {Math.round(((cur.revenue - cur.cost) / cur.revenue) * 100)}%
            </p>
          </div>
        }
      />
      <CardBody>
        <div className="relative flex h-56 gap-3 pl-12" onMouseLeave={() => setHover(null)}>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 right-0 flex flex-col-reverse justify-between pb-6"
          >
            {ticks.map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span className="w-10 text-right text-[11px] tabular-nums text-fg-muted">
                  {t ? `${Math.round(t / 1000)}K` : '0'}
                </span>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>
            ))}
          </div>
          {data.map((d, i) => {
            const isActive = i === active;
            return (
              <button
                key={d.month}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-label={`${d.month}: revenue ${formatMoney(d.revenue)}, cost ${formatMoney(d.cost)}`}
                className="relative z-10 flex flex-1 flex-col items-center justify-end gap-2 pb-0 focus-visible:outline-offset-4"
              >
                <span className="flex h-[calc(100%-24px)] w-full max-w-14 items-end">
                  <span
                    className={clsx(
                      'w-full rounded-t-[4px] transition-colors',
                      isActive ? 'bg-brand' : 'bg-brand/25 group-hover:bg-brand/40',
                    )}
                    style={{ height: `${(d.revenue / max) * 100}%` }}
                  />
                </span>
                <span
                  className={clsx('h-4 text-caption', isActive ? 'font-semibold text-fg' : 'text-fg-muted')}
                >
                  {d.month}
                </span>
              </button>
            );
          })}
        </div>
        <details className="mt-3 text-caption text-fg-muted">
          <summary className="cursor-pointer select-none hover:text-fg">View as table</summary>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr>
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">Revenue</th>
                <th className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t border-border-subtle">
                  <td className="py-1">{d.month}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(d.revenue)}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(d.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardBody>
    </Card>
  );
}

const attentionIcon = { danger: AlertTriangle, warning: Clock3, info: Info };
const attentionTone = {
  danger: 'bg-danger-subtle text-danger',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
};

function Attention({ items }: { items: HomeOverview['attention'] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Needs your attention"
        description={`${items.length} items across sales, operations and finance`}
      />
      <CardBody className="flex-1">
        {items.length === 0 ? (
          <p className="py-8 text-center text-body-s text-fg-muted">You’re all caught up.</p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {items.slice(0, 6).map((a) => {
              const Icon = attentionIcon[a.tone];
              return (
                <li key={a.id}>
                  <Link
                    to={a.to}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas"
                  >
                    <span
                      className={clsx(
                        'grid size-8 shrink-0 place-items-center rounded-lg',
                        attentionTone[a.tone],
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-s font-medium">{a.title}</span>
                      <span className="block truncate text-caption text-fg-muted">{a.detail}</span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ActiveShipments({
  items,
  className,
}: {
  items: HomeOverview['activeShipments'];
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        title="Active jobs"
        description="Work orders currently moving"
        actions={
          <Link to="/work-orders" className="text-body-s font-medium text-brand hover:underline">
            View all
          </Link>
        }
      />
      <CardBody className="pt-3">
        <ul className="divide-y divide-border-subtle">
          {items.map((s) => {
            return (
              <li key={s.id}>
                <Link
                  to="/work-orders/$id"
                  params={{ id: s.id }}
                  className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3.5 hover:bg-canvas"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-fg-secondary">
                    <JobKindIcon category={s.serviceCategory} mode={s.mode} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-medium text-brand">{s.number}</span>
                      <StatusBadge status={s.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-body-s font-medium">
                      {s.destination ? `${s.origin} → ${s.destination}` : s.origin}
                    </span>
                    <span className="block truncate text-caption text-fg-muted">
                      {jobKindLabel(s.serviceCategory, s.mode)} · {s.customer}
                    </span>
                  </span>
                  <span className="w-full sm:w-56">
                    <span className="flex justify-between gap-2 whitespace-nowrap text-caption text-fg-muted">
                      <span className="truncate">{s.currentMilestone}</span>
                      <span className="tabular-nums">ETA {formatDate(s.eta).replace(/ \d{4}$/, '')}</span>
                    </span>
                    <span
                      className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted"
                      role="progressbar"
                      aria-valuenow={s.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${s.number} progress`}
                    >
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(s.progress, 4)}%` }}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function KindMix({ mix }: { mix: Record<JobKind, number> }) {
  const total = JOB_KINDS.reduce((s, k) => s + mix[k], 0) || 1;
  return (
    <Card>
      <CardHeader
        title="Jobs by type"
        description={`${total} work orders · transport, warehouse and direct service`}
      />
      <CardBody>
        <div
          className="flex h-3 gap-[2px] overflow-hidden rounded-full"
          role="img"
          aria-label={JOB_KINDS.map((k) => `${kindLabel[k]} ${mix[k]}`).join(', ')}
        >
          {JOB_KINDS.filter((k) => mix[k] > 0).map((k) => (
            <span
              key={k}
              style={{ width: `${(mix[k] / total) * 100}%`, background: kindColor[k] }}
              className="first:rounded-l-full last:rounded-r-full"
            />
          ))}
        </div>
        <ul className="mt-4 space-y-2.5">
          {JOB_KINDS.map((k) => {
            const Icon = kindIcon[k];
            return (
              <li key={k} className="flex items-center gap-2.5 text-body-s">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{ background: kindColor[k] }}
                />
                <Icon aria-hidden="true" className="size-4 text-fg-muted" />
                <span className="flex-1">{kindLabel[k]}</span>
                <span className="tabular-nums text-fg-muted">{Math.round((mix[k] / total) * 100)}%</span>
                <span className="w-6 text-right font-medium tabular-nums">{mix[k]}</span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function WarehouseCard({ w }: { w: HomeOverview['warehouse'] }) {
  const pct = Math.round((w.palletsUsed / w.palletsCapacity) * 100);
  return (
    <Card>
      <CardHeader
        title="JAFZA WH-1"
        description="Pallet positions in use"
        actions={
          <Link to="/warehouse" className="text-body-s font-medium text-brand hover:underline">
            Open
          </Link>
        }
      />
      <CardBody>
        <p className="flex items-baseline gap-2">
          <span className="text-[28px] font-semibold tabular-nums tracking-tight">{pct}%</span>
          <span className="text-caption text-fg-muted">
            {w.palletsUsed} of {w.palletsCapacity} pallets
          </span>
        </p>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"
          role="meter"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Warehouse utilisation"
        >
          <div className="h-full rounded-full bg-surface-inverse" style={{ width: `${pct}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-caption">
          <div className="rounded-lg bg-canvas p-3">
            <dt className="text-fg-muted">Active SKUs</dt>
            <dd className="mt-0.5 text-body-s font-semibold tabular-nums">{w.skus}</dd>
          </div>
          <div className="rounded-lg bg-canvas p-3">
            <dt className="text-fg-muted">Movements this week</dt>
            <dd className="mt-0.5 text-body-s font-semibold tabular-nums">{w.movementsThisWeek}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

function Activity({ items, today }: { items: HomeOverview['activity']; today: string }) {
  return (
    <Card>
      <CardHeader title="Recent activity" description="Latest changes across the team" />
      <CardBody className="pt-3">
        <ul className="grid gap-x-8 md:grid-cols-2">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-0 md:[&:nth-last-child(2)]:border-0"
            >
              <Avatar name={e.actor} size="sm" />
              <p className="min-w-0 flex-1 text-body-s">
                <span className="font-medium">{e.actor}</span>{' '}
                <span className="text-fg-muted">{e.action}</span>{' '}
                <span className="font-mono text-[13px] font-medium text-brand">{e.entityRef}</span>
              </p>
              <span className="shrink-0 text-caption text-fg-muted">
                {formatRelative(e.at, `${today}T18:00:00+04:00`)}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
