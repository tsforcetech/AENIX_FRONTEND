import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { CalendarClock, CheckCheck, Hourglass, PhoneCall } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { formatDate, formatMoney } from '@/shared/utils/format';
import type { HomeOverview } from './api';

/** FLOW-003 cross-cutting cards: approvals, expiries, follow-ups, PDCs. */
export function TodayCards({ data }: { data: HomeOverview }) {
  return (
    <section aria-label="Today" className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <SmallCard
        title="Approvals waiting"
        icon={<CheckCheck aria-hidden="true" className="size-4" />}
        count={data.approvals.count}
        link={
          <Link to="/approvals" className="mt-auto text-body-s font-medium text-brand hover:underline">
            Open approvals
          </Link>
        }
        empty="Nothing waiting for approval."
      >
        {data.approvals.items.map((a) => (
          <li key={a.id}>
            <span className="block truncate text-body-s font-medium">
              <span className="font-mono text-[13px] text-brand">{a.ref}</span> · {a.docType}
            </span>
            <span className="block truncate text-caption text-fg-muted">
              {a.summary} · {a.role}
            </span>
          </li>
        ))}
      </SmallCard>
      <SmallCard
        title="Expiring soon"
        icon={<Hourglass aria-hidden="true" className="size-4" />}
        count={data.expiring.length}
        hint="Next 30 days"
        empty="Nothing expires in the next 30 days."
      >
        {data.expiring.slice(0, 4).map((e) => (
          <li key={e.id}>
            <Link to={e.to} className="group block">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-body-s font-medium group-hover:underline">{e.label}</span>
                <Badge tone={e.daysLeft < 0 ? 'danger' : e.daysLeft <= 7 ? 'warning' : 'neutral'} dot={false}>
                  {e.daysLeft < 0 ? 'Expired' : e.daysLeft === 0 ? 'Today' : `${e.daysLeft} d`}
                </Badge>
              </span>
              <span className="block truncate text-caption text-fg-muted">
                {e.kind} · {formatDate(e.date)}
              </span>
            </Link>
          </li>
        ))}
      </SmallCard>
      <SmallCard
        title="Follow-ups due today"
        icon={<PhoneCall aria-hidden="true" className="size-4" />}
        count={data.followUps.length}
        link={
          <Link to="/enquiries" className="mt-auto text-body-s font-medium text-brand hover:underline">
            Open enquiries
          </Link>
        }
        empty="No follow-ups due."
      >
        {data.followUps.slice(0, 4).map((f) => (
          <li key={f.id}>
            <Link to="/enquiries/$id" params={{ id: f.id }} className="group block">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-body-s font-medium group-hover:underline">
                  <span className="font-mono text-[13px] text-brand">{f.number}</span> · {f.customer}
                </span>
                {f.overdue ? (
                  <Badge tone="danger" dot={false}>
                    Overdue
                  </Badge>
                ) : null}
              </span>
              <span className="block text-caption text-fg-muted">Follow up {formatDate(f.date)}</span>
            </Link>
          </li>
        ))}
      </SmallCard>
      <SmallCard
        title="PDCs maturing this week"
        icon={<CalendarClock aria-hidden="true" className="size-4" />}
        count={data.pdcsThisWeek.length}
        link={
          <Link
            to="/reports"
            search={{ tab: 'pdc' }}
            className="mt-auto text-body-s font-medium text-brand hover:underline"
          >
            PDC report
          </Link>
        }
        empty="No post-dated cheques due this week."
      >
        {data.pdcsThisWeek.slice(0, 4).map((p) => (
          <li key={p.id}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-body-s font-medium">
                <span className="font-mono text-[13px] text-brand">{p.number}</span> · {p.party}
              </span>
              <span className="whitespace-nowrap text-body-s tabular-nums">{formatMoney(p.amount)}</span>
            </span>
            <span className="block text-caption text-fg-muted">
              {p.direction === 'Received' ? 'From customer' : 'To vendor'} · {formatDate(p.date)}
            </span>
          </li>
        ))}
      </SmallCard>
    </section>
  );
}

function SmallCard({
  title,
  icon,
  count,
  hint,
  link,
  empty,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  hint?: string;
  link?: ReactNode;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-canvas text-fg-secondary">
              {icon}
            </span>
            {title}
          </span>
        }
        description={hint}
        actions={
          <span
            className={clsx(
              'text-[22px] font-semibold tabular-nums leading-none',
              count === 0 && 'text-fg-muted',
            )}
          >
            {count}
            <span className="sr-only"> items</span>
          </span>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-3 pt-3">
        {count === 0 ? (
          <p className="text-body-s text-fg-muted">{empty}</p>
        ) : (
          <ul className="space-y-2.5">{children}</ul>
        )}
        {link}
      </CardBody>
    </Card>
  );
}
