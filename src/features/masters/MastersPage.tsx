import { Link } from '@tanstack/react-router';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SearchInput } from '@/shared/ui/SearchInput';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useMasterHub } from './api';
import { filterHub, HUB_GROUPS, type HubCard } from './hub';

const cardClass =
  'group flex h-full flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-4 shadow-card transition-colors hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus';

/** FLOW-003 M1 — Masters hub: every master in one place, grouped by area. */
export function MastersPage() {
  const [q, setQ] = useState('');
  const hub = useMasterHub();
  const groups = filterHub(HUB_GROUPS, q);
  return (
    <div>
      <PageHeader
        title="All masters"
        description="Lists every screen chooses from. Add an entry here and it appears everywhere at once."
      />
      <SearchInput
        value={q}
        onChange={setQ}
        label="Search masters"
        placeholder="Search masters…"
        className="mb-6 w-full sm:max-w-sm"
      />
      {hub.error ? (
        <StatusMessage kind="error" title="Could not load the masters" description="Please retry." />
      ) : null}
      {groups.length === 0 ? (
        <StatusMessage kind="empty" title="No master matches" description="Try another word." />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label} aria-labelledby={`hub-${g.label}`}>
              <h2 id={`hub-${g.label}`} className="mb-3 text-[15px] font-semibold text-fg">
                {g.label}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.cards.map((c) => (
                  <li key={c.title}>
                    <HubLink card={c}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-fg">{c.title}</span>
                        {c.master ? (
                          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                        ) : (
                          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                        )}
                      </div>
                      <p className="text-body-s text-fg-muted">{c.purpose}</p>
                      <p className="mt-auto text-caption font-medium tabular-nums text-fg-secondary">
                        {hub.data ? `${hub.data[c.countKey] ?? 0} active` : 'Counting…'}
                      </p>
                    </HubLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function HubLink({ card, children }: { card: HubCard; children: ReactNode }) {
  if (card.master === 'warehouses')
    return (
      <Link to="/masters/warehouses" className={cardClass}>
        {children}
      </Link>
    );
  if (card.master)
    return (
      <Link to="/masters/$key" params={{ key: card.master }} className={cardClass}>
        {children}
      </Link>
    );
  return (
    <Link to={card.to} search={card.search as never} className={cardClass}>
      {children}
    </Link>
  );
}
