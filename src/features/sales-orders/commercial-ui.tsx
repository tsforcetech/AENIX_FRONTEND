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

/** "Jebel Ali → Riyadh" for transport, the site/location otherwise. */
export function locationText(category: ServiceCategory, origin: string, destination: string): string {
  if (category === 'Transport') return `${origin} → ${destination}`;
  return origin || '—';
}

export function locationLabel(category: ServiceCategory): string {
  return category === 'Transport'
    ? 'Route'
    : category === 'Warehouse'
      ? 'Warehouse / site'
      : 'Service location';
}

/** Table cell: icon + route/location + kind label. */
export function ServiceTypeCell({
  category,
  mode,
  origin,
  destination,
}: {
  category: ServiceCategory;
  mode?: TransportMode;
  origin: string;
  destination: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <JobKindIcon category={category} mode={mode} className="mt-0.5 size-4 shrink-0 text-fg-muted" />
      <div className="min-w-0">
        <p className="whitespace-nowrap">{locationText(category, origin, destination)}</p>
        <p className="text-caption text-fg-muted">{jobKindLabel(category, mode)}</p>
      </div>
    </div>
  );
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

/** Three radio cards: Transport / Warehouse / Direct service. */
export function ServiceTypePicker({
  value,
  onChange,
  name,
}: {
  value: ServiceCategory;
  onChange: (v: ServiceCategory) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-body-s font-medium">
        Service type <span className="text-brand">*</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {SERVICE_CATEGORIES.map((c) => {
          const checked = value === c;
          return (
            <label
              key={c}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                checked ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-canvas',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={c}
                checked={checked}
                onChange={() => onChange(c)}
              />
              <span
                className={clsx(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  checked ? 'bg-brand text-brand-fg' : 'bg-canvas text-fg-secondary',
                )}
              >
                <JobKindIcon category={c} className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-body-s font-semibold">{serviceCategoryLabel[c]}</span>
                <span className="block text-caption text-fg-muted">{serviceCategoryHint[c]}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
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
