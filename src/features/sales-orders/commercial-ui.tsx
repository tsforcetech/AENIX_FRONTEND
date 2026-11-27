import clsx from 'clsx';
import type { ServiceCategory, TransportMode } from '@/domain/types';
import { jobKindLabel, SERVICE_CATEGORIES, serviceCategoryLabel } from '@/domain/workflow';
import { validateListSearch, type ListSearch } from '@/app/routes-base';
import { inputClasses } from '@/shared/ui/Field';
import { JobKindIcon, modeIcons } from '@/shared/ui/ModeIcon';

/**
 * Commercial-flow UI helpers shared by Enquiries, Quotations, Sales orders and Contracts
 * (all owned by the same feature group).
 */
export const TRANSPORT_MODES: TransportMode[] = ['Road', 'Sea', 'Air'];

export const serviceCategoryHint: Record<ServiceCategory, string> = {
  Transport: 'Move goods by road, sea or air',
  Warehouse: 'Receive, store and release goods',
  Service: 'Customs, labour, packing — no transport leg',
};

export interface TypedListSearch extends ListSearch {
  type?: ServiceCategory;
}

export function validateTypedListSearch(search: Record<string, unknown>): TypedListSearch {
  const type = search.type;
  return {
    ...validateListSearch(search),
    type: type === 'Transport' || type === 'Warehouse' || type === 'Service' ? type : undefined,
  };
}

export function locationLabel(category: ServiceCategory): string {
  return category === 'Transport'
    ? 'Route'
    : category === 'Warehouse'
      ? 'Warehouse / site'
      : 'Service location';
}

/** Service-type filter for list toolbars (bound to `?type=`). */
export function ServiceTypeFilter({
  value,
  onChange,
}: {
  value?: ServiceCategory;
  onChange: (v: ServiceCategory | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-body-s text-fg-muted">
      <span className="whitespace-nowrap">Service type</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as ServiceCategory | undefined)}
        className={clsx(inputClasses, 'h-10 w-44 pr-8')}
      >
        <option value="">All types</option>
        {SERVICE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {serviceCategoryLabel[c]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Road / Sea / Air segmented picker (transport only). */
export function ModePicker({
  value,
  onChange,
  name,
}: {
  value: TransportMode;
  onChange: (v: TransportMode) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-body-s font-medium">
        Transport mode <span className="text-brand">*</span>
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {TRANSPORT_MODES.map((m) => {
          const Icon = modeIcons[m];
          const checked = value === m;
          return (
            <label
              key={m}
              className={clsx(
                'flex cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-body-s font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                checked
                  ? 'border-fg bg-surface-inverse text-fg-inverse'
                  : 'border-border bg-surface hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={m}
                checked={checked}
                onChange={() => onChange(m)}
              />
              <Icon aria-hidden="true" className="size-4" />
              {m}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Which catalogue services fit a service type (and transport mode). */
export function serviceFitsType(
  serviceMode: string,
  category: ServiceCategory,
  mode: TransportMode | undefined,
): boolean {
  if (category === 'Transport') return serviceMode === (mode ?? 'Road') || serviceMode === 'Customs';
  if (category === 'Warehouse') return serviceMode === 'Warehouse';
  return serviceMode === 'Customs';
}

// ---------- Multi-service (FLOW-002): one record can mix transport, warehouse and direct services ----------

/** Does a catalogue service fit ANY of the selected types (transport uses the chosen mode)? */
export function serviceFitsTypes(
  serviceMode: string,
  categories: ServiceCategory[],
  mode: TransportMode | undefined,
): boolean {
  return categories.some((c) => serviceFitsType(serviceMode, c, mode));
}

/** "Jebel Ali → Riyadh" when transport is included, otherwise the site / location. */
export function locationTextMulti(
  categories: ServiceCategory[],
  origin: string,
  destination: string,
): string {
  if (categories.includes('Transport')) return destination ? `${origin} → ${destination}` : origin || '—';
  return origin || '—';
}

/** Extra site lines (warehouse site / service location) are kept in notes when a route is also present. */
export const SITE_PREFIX = {
  Warehouse: 'Warehouse / site: ',
  Service: 'Service location: ',
} as const;

export function siteFromNotes(notes: string, kind: keyof typeof SITE_PREFIX): string | undefined {
  const line = notes.split('\n').find((l) => l.startsWith(SITE_PREFIX[kind]));
  return line ? line.slice(SITE_PREFIX[kind].length).trim() || undefined : undefined;
}

export function withoutSiteLines(notes: string): string {
  return notes
    .split('\n')
    .filter((l) => !l.startsWith(SITE_PREFIX.Warehouse) && !l.startsWith(SITE_PREFIX.Service))
    .join('\n')
    .trim();
}

/** Icons for every included type (stacked), for list cells and headers. */
export function ServiceIcons({
  categories,
  mode,
  className = 'size-4',
}: {
  categories: ServiceCategory[];
  mode?: TransportMode;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-fg-muted">
      {categories.map((c) => (
        <JobKindIcon key={c} category={c} mode={mode} className={className} />
      ))}
    </span>
  );
}

/** Table cell for multi-service records: icons + route/location + "Road transport + Warehouse". */
export function ServicesCell({
  categories,
  mode,
  origin,
  destination,
}: {
  categories: ServiceCategory[];
  mode?: TransportMode;
  origin: string;
  destination: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">
        <ServiceIcons categories={categories} mode={mode} />
      </span>
      <div className="min-w-0">
        <p className="whitespace-nowrap">{locationTextMulti(categories, origin, destination)}</p>
        <p className="text-caption text-fg-muted">
          {categories.map((c) => jobKindLabel(c, mode)).join(' + ')}
        </p>
      </div>
    </div>
  );
}

/** Small pills listing every included type. */
export function ServiceTypePills({
  categories,
  mode,
}: {
  categories: ServiceCategory[];
  mode?: TransportMode;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {categories.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-2.5 py-0.5 text-caption font-medium text-fg-secondary"
        >
          <JobKindIcon category={c} mode={mode} className="size-3.5" />
          {jobKindLabel(c, mode)}
        </span>
      ))}
    </span>
  );
}

/** Multi-select toggle cards: Transport / Warehouse / Direct service (at least one). */
export function ServiceTypesPicker({
  value,
  onChange,
  error,
}: {
  value: ServiceCategory[];
  onChange: (v: ServiceCategory[]) => void;
  error?: string;
}) {
  return (
    <fieldset aria-describedby={error ? 'svc-types-err' : undefined}>
      <legend className="mb-1.5 text-body-s font-medium">
        Services included <span className="text-brand">*</span>
        <span className="ml-2 font-normal text-fg-muted">Select one or more — an order can mix them.</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {SERVICE_CATEGORIES.map((c) => {
          const checked = value.includes(c);
          return (
            <label
              key={c}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                checked ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-canvas',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                value={c}
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? value.filter((x) => x !== c)
                      : SERVICE_CATEGORIES.filter((x) => x === c || value.includes(x)),
                  )
                }
              />
              <span
                className={clsx(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  checked ? 'bg-brand text-brand-fg' : 'bg-canvas text-fg-secondary',
                )}
              >
                <JobKindIcon category={c} className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-s font-semibold">{serviceCategoryLabel[c]}</span>
                <span className="block text-caption text-fg-muted">{serviceCategoryHint[c]}</span>
              </span>
              <span
                aria-hidden="true"
                className={clsx(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px]',
                  checked ? 'border-brand bg-brand text-brand-fg' : 'border-border-strong',
                )}
              >
                {checked ? '✓' : ''}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id="svc-types-err" role="alert" className="mt-2 text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
