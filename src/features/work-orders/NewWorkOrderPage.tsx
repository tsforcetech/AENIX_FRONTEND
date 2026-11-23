import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Info, Plus, Trash2 } from 'lucide-react';
import { useController, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { ServiceCategory, TransportMode } from '@/domain/types';
import { SERVICE_CATEGORIES, serviceCategoryLabel } from '@/domain/workflow';
import { useCustomerOptions, useServiceOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { JobKindIcon, modeIcons } from '@/shared/ui/ModeIcon';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { useCreateWorkOrder, useWorkOrderPrefill, type WorkOrderPrefill } from './api';

const route = getRouteApi('/_app/work-orders/new');
const MODES: TransportMode[] = ['Road', 'Sea', 'Air'];

const lineSchema = z.object({
  serviceId: z.string().min(1, 'Choose a service'),
  description: z.string().trim().min(2, 'Describe the line').max(120),
  quantity: z.coerce.number().positive('> 0'),
  unit: z.string().trim().min(1, 'Unit').max(20),
  unitPrice: z.coerce.number().min(0, '≥ 0'),
  unitCost: z.coerce.number().min(0, '≥ 0'),
});

const plLineSchema = z.object({
  sku: z.string().trim().min(1, 'SKU').max(40),
  description: z.string().trim().min(1, 'Description').max(120),
  quantity: z.coerce.number().int().positive('> 0'),
  uom: z.string().trim().min(1, 'UoM').max(12),
});

const CATEGORY_HINT: Record<ServiceCategory, string> = {
  Transport: 'Move goods by road, sea or air.',
  Warehouse: 'Receive against a product list, store, and release on customer request.',
  Service: 'A direct service with no transport leg, e.g. customs clearance or labour.',
};

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    serviceCategory: z.enum(['Transport', 'Warehouse', 'Service']),
    mode: z.enum(['Road', 'Sea', 'Air']),
    origin: z.string().trim().min(2, 'Enter the location').max(80),
    destination: z.string().trim().max(80),
    eta: z.string().min(1, 'Choose a date'),
    priority: z.enum(['Normal', 'High', 'Urgent']),
    hasWarehouse: z.boolean(),
    description: z.string().trim().min(2, 'Describe the goods or scope').max(160),
    packages: z.coerce.number().int().min(0, 'Cannot be negative'),
    weightKg: z.coerce.number().min(0, 'Cannot be negative'),
    volumeCbm: z.coerce.number().min(0, 'Cannot be negative'),
    equipment: z.string().max(60).optional(),
    lines: z.array(lineSchema).min(1, 'Add at least one price line'),
    plLines: z.array(plLineSchema),
  })
  .superRefine((v, ctx) => {
    if (v.serviceCategory !== 'Transport') return;
    if (v.destination.length < 2)
      ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Enter the destination' });
    if (v.packages <= 0) ctx.addIssue({ code: 'custom', path: ['packages'], message: 'Must be more than 0' });
    if (v.weightKg <= 0) ctx.addIssue({ code: 'custom', path: ['weightKg'], message: 'Must be more than 0' });
    if (v.volumeCbm <= 0)
      ctx.addIssue({ code: 'custom', path: ['volumeCbm'], message: 'Must be more than 0' });
  });
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function NewWorkOrderPage() {
  const search = route.useSearch();
  const prefill = useWorkOrderPrefill(search);
  // Select options must exist before the form mounts, or prefilled select values are dropped.
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  if (prefill.error) return <StatusMessage kind="error" title="Could not load the source document" />;
  if (!prefill.data || !customers.data || !services.data)
    return <StatusMessage kind="loading" title="Preparing work order…" />;
  return <WorkOrderForm prefill={prefill.data} />;
}

function WorkOrderForm({ prefill }: { prefill: WorkOrderPrefill }) {
  const navigate = useNavigate();
  const toast = useToast();
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  const create = useCreateWorkOrder();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: prefill.customerId ?? '',
      serviceCategory: prefill.serviceCategory ?? 'Transport',
      mode: prefill.mode ?? 'Road',
      origin: prefill.origin ?? '',
      destination: prefill.destination ?? '',
      eta: '2026-11-30',
      priority: 'Normal',
      hasWarehouse: false,
      description: prefill.cargo?.description ?? '',
      packages: prefill.cargo?.packages || '',
      weightKg: prefill.cargo?.weightKg || '',
      volumeCbm: prefill.cargo?.volumeCbm || '',
      equipment: prefill.cargo?.equipment ?? '',
      lines: prefill.lines.length
        ? prefill.lines
        : [{ serviceId: '', description: '', quantity: 1, unit: '', unitPrice: 0, unitCost: 0 }],
      plLines: [],
    },
  });
  const mode = useController({ control, name: 'mode' });
  const category = useController({ control, name: 'serviceCategory' });
  const plLines = useFieldArray({ control, name: 'plLines' });
  const isTransport = category.field.value === 'Transport';
  const isWarehouse = category.field.value === 'Warehouse';
  const lines = useFieldArray({ control, name: 'lines' });
  const watchedLines = useWatch({ control, name: 'lines' });
  const totals = (watchedLines ?? []).reduce(
    (acc, l) => {
      const q = Number(l?.quantity) || 0;
      acc.revenue += q * (Number(l?.unitPrice) || 0);
      acc.cost += q * (Number(l?.unitCost) || 0);
      return acc;
    },
    { revenue: 0, cost: 0 },
  );
  const margin = totals.revenue - totals.cost;
  const marginPct = totals.revenue > 0 ? Math.round((margin / totals.revenue) * 1000) / 10 : 0;

  const submit = (status: 'Draft' | 'Confirmed') =>
    handleSubmit(async (v) => {
      const wo = await create.mutateAsync({
        customerId: v.customerId,
        source: prefill.source,
        salesOrderId: prefill.salesOrderId,
        serviceCategory: v.serviceCategory,
        mode: v.serviceCategory === 'Transport' ? v.mode : undefined,
        packingLines: v.serviceCategory === 'Warehouse' && v.plLines.length ? v.plLines : undefined,
        origin: v.origin,
        destination: v.serviceCategory === 'Transport' ? v.destination : '',
        eta: v.eta,
        priority: v.priority,
        hasWarehouse: v.hasWarehouse,
        cargo: {
          description: v.description,
          packages: v.packages,
          weightKg: v.weightKg,
          volumeCbm: v.volumeCbm,
          equipment: v.equipment,
        },
        lines: v.lines,
        status,
      });
      toast({
        title: `${wo.number} ${status === 'Confirmed' ? 'confirmed' : 'saved as draft'}`,
        body: 'Assign vendors and track milestones from the job page.',
      });
      void navigate({ to: '/work-orders/$id', params: { id: wo.id } });
    });

  const sourceType = prefill.source.type;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New work order"
        crumbs={[{ label: 'Work orders', to: '/work-orders' }, { label: 'New' }]}
        description="The work order is the job — transport, warehouse or a direct service. It carries scope, price and every milestone through to completion and invoicing."
      />

      <div
        className={clsx(
          'mb-6 flex items-start gap-3 rounded-xl border p-4 text-body-s',
          sourceType === 'Direct' ? 'border-brand/25 bg-brand-subtle' : 'border-info/20 bg-info-subtle',
        )}
      >
        <Info
          aria-hidden="true"
          className={clsx('mt-0.5 size-4 shrink-0', sourceType === 'Direct' ? 'text-brand' : 'text-info')}
        />
        {sourceType === 'Direct' ? (
          <p>
            <strong className="font-semibold">Direct work order</strong> — no enquiry, quotation or contract.
            Pricing must follow the authorised rate rules; prices outside them need approval before the job is
            confirmed.
          </p>
        ) : (
          <p>
            Prefilled from {sourceType.toLowerCase()}{' '}
            {prefill.source.refId ? (
              sourceType === 'Sales order' ? (
                <span className="font-mono font-medium text-brand">{prefill.sourceRef}</span>
              ) : sourceType === 'Quotation' ? (
                <Link
                  to="/quotations/$id"
                  params={{ id: prefill.source.refId }}
                  className="font-mono font-medium text-brand hover:underline"
                >
                  {prefill.sourceRef}
                </Link>
              ) : (
                <Link
                  to="/contracts/$id"
                  params={{ id: prefill.source.refId }}
                  className="font-mono font-medium text-brand hover:underline"
                >
                  {prefill.sourceRef}
                </Link>
              )
            ) : null}
            . Agreed prices are carried over; review quantities before confirming.
          </p>
        )}
      </div>

      <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & scope" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-body-s font-medium">Service type</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {SERVICE_CATEGORIES.map((c) => {
                  const checked = category.field.value === c;
                  return (
                    <label
                      key={c}
                      className={clsx(
                        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                        checked ? 'border-brand bg-brand-subtle' : 'border-border bg-surface hover:bg-canvas',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={category.field.name}
                        value={c}
                        checked={checked}
                        onChange={() => category.field.onChange(c)}
                      />
                      <span
                        className={clsx(
                          'grid size-9 shrink-0 place-items-center rounded-lg',
                          checked ? 'bg-brand text-brand-fg' : 'bg-surface-muted text-fg-secondary',
                        )}
                      >
                        <JobKindIcon category={c} className="size-4" />
                      </span>
                      <span>
                        <span className="block text-body-s font-semibold">{serviceCategoryLabel[c]}</span>
                        <span className="block text-caption text-fg-muted">{CATEGORY_HINT[c]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <SelectField
              label="Customer"
              required
              placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
              options={customers.data ?? []}
              error={errors.customerId?.message}
              hint={
                sourceType !== 'Direct'
                  ? `Taken from ${prefill.sourceRef ?? 'the source document'}`
                  : undefined
              }
              className="sm:col-span-2"
              {...register('customerId')}
            />
            {isTransport ? (
              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-body-s font-medium">Transport mode</legend>
                <div className="grid grid-cols-3 gap-2">
                  {MODES.map((m) => {
                    const Icon = modeIcons[m];
                    const checked = mode.field.value === m;
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
                          name={mode.field.name}
                          value={m}
                          checked={checked}
                          onChange={() => mode.field.onChange(m)}
                        />
                        <Icon aria-hidden="true" className="size-4" />
                        {m}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            <TextField
              label={isTransport ? 'Origin' : isWarehouse ? 'Warehouse / site' : 'Service location'}
              required
              placeholder={
                isTransport ? 'e.g. Jebel Ali' : isWarehouse ? 'e.g. JAFZA WH-1' : 'e.g. DXB Cargo Village'
              }
              error={errors.origin?.message}
              className={isTransport ? undefined : 'sm:col-span-2'}
              {...register('origin')}
            />
            {isTransport ? (
              <TextField
                label="Destination"
                required
                placeholder="e.g. Riyadh"
                error={errors.destination?.message}
                {...register('destination')}
              />
            ) : null}
            <TextField
              label={isTransport ? 'ETA' : 'Target completion'}
              type="date"
              required
              error={errors.eta?.message}
              {...register('eta')}
            />
            <SelectField
              label="Priority"
              options={[
                { value: 'Normal', label: 'Normal' },
                { value: 'High', label: 'High' },
                { value: 'Urgent', label: 'Urgent' },
              ]}
              {...register('priority')}
            />
            {isTransport ? (
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-body-s sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                  {...register('hasWarehouse')}
                />
                <span>
                  <span className="font-medium">Includes warehouse handling</span>
                  <span className="block text-caption text-fg-muted">
                    Receipt, storage or dispatch at JAFZA WH-1 will be linked to this job.
                  </span>
                </span>
              </label>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={isTransport ? 'Cargo' : isWarehouse ? 'Goods' : 'Scope'}
            description={isTransport ? undefined : 'Quantities are optional for warehouse and service jobs.'}
          />
          <CardBody className="grid gap-5 sm:grid-cols-4">
            <TextField
              label={isTransport || isWarehouse ? 'Description' : 'Scope of service'}
              required
              className="sm:col-span-4"
              error={errors.description?.message}
              {...register('description')}
            />
            <TextField
              label="Packages"
              type="number"
              inputMode="numeric"
              required={isTransport}
              error={errors.packages?.message}
              {...register('packages')}
            />
            <TextField
              label="Weight (kg)"
              type="number"
              inputMode="decimal"
              required={isTransport}
              error={errors.weightKg?.message}
              {...register('weightKg')}
            />
            <TextField
              label="Volume (cbm)"
              type="number"
              inputMode="decimal"
              step="0.1"
              required={isTransport}
              error={errors.volumeCbm?.message}
              {...register('volumeCbm')}
            />
            <TextField label="Equipment" placeholder="e.g. 40ft trailer" {...register('equipment')} />
          </CardBody>
        </Card>

        {isWarehouse ? (
          <Card>
            <CardHeader
              title="Product list (PL)"
              description="Optional now — what the warehouse team should expect to receive. You can also add it from the job page."
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus aria-hidden="true" />}
                  onClick={() => plLines.append({ sku: '', description: '', quantity: 1, uom: 'Ctn' })}
                >
                  Add product
                </Button>
              }
            />
            <CardBody>
              {plLines.fields.length === 0 ? (
                <p className="text-body-s text-fg-muted">No products yet.</p>
              ) : (
                <div className="space-y-2 overflow-x-auto">
                  {plLines.fields.map((f, i) => {
                    const le = errors.plLines?.[i];
                    return (
                      <div key={f.id} className="grid min-w-[560px] grid-cols-[1fr_2fr_90px_90px_40px] gap-2">
                        <input
                          aria-label={`Product ${i + 1} SKU`}
                          aria-invalid={!!le?.sku || undefined}
                          placeholder="SKU"
                          className={clsx(inputClasses, 'h-10 font-mono')}
                          {...register(`plLines.${i}.sku`)}
                        />
                        <input
                          aria-label={`Product ${i + 1} description`}
                          aria-invalid={!!le?.description || undefined}
                          placeholder="Description"
                          className={clsx(inputClasses, 'h-10')}
                          {...register(`plLines.${i}.description`)}
                        />
                        <input
                          type="number"
                          aria-label={`Product ${i + 1} quantity`}
                          aria-invalid={!!le?.quantity || undefined}
                          className={clsx(inputClasses, 'h-10')}
                          {...register(`plLines.${i}.quantity`)}
                        />
                        <input
                          aria-label={`Product ${i + 1} unit of measure`}
                          aria-invalid={!!le?.uom || undefined}
                          className={clsx(inputClasses, 'h-10')}
                          {...register(`plLines.${i}.uom`)}
                        />
                        <button
                          type="button"
                          aria-label={`Remove product ${i + 1}`}
                          onClick={() => plLines.remove(i)}
                          className="grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-danger-subtle hover:text-danger"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {errors.plLines ? (
                <p role="alert" className="mt-2 text-caption font-medium text-danger">
                  Check the highlighted product fields.
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Price lines"
            description="Revenue and expected cost per line (AED, excluding VAT)"
            actions={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus aria-hidden="true" />}
                onClick={() =>
                  lines.append({
                    serviceId: '',
                    description: '',
                    quantity: 1,
                    unit: '',
                    unitPrice: 0,
                    unitCost: 0,
                  })
                }
              >
                Add line
              </Button>
            }
          />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-body-s">
                <caption className="sr-only">Price lines</caption>
                <thead>
                  <tr className="text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="pb-2 font-medium">
                      Service
                    </th>
                    <th scope="col" className="pb-2 pl-2 font-medium">
                      Description
                    </th>
                    <th scope="col" className="w-20 pb-2 pl-2 font-medium">
                      Qty
                    </th>
                    <th scope="col" className="w-24 pb-2 pl-2 font-medium">
                      Unit
                    </th>
                    <th scope="col" className="w-28 pb-2 pl-2 font-medium">
                      Unit price
                    </th>
                    <th scope="col" className="w-28 pb-2 pl-2 font-medium">
                      Unit cost
                    </th>
                    <th scope="col" className="w-10 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.fields.map((f, i) => {
                    const le = errors.lines?.[i];
                    return (
                      <tr key={f.id} className="align-top">
                        <td className="py-1.5">
                          <select
                            aria-label={`Line ${i + 1} service`}
                            aria-invalid={!!le?.serviceId || undefined}
                            className={clsx(inputClasses, 'h-10 min-w-44')}
                            {...register(`lines.${i}.serviceId`, {
                              onChange: (e: { target: { value: string } }) => {
                                const svc = services.data?.find((s) => s.value === e.target.value);
                                if (svc) {
                                  setValue(`lines.${i}.unit`, svc.unit);
                                  setValue(`lines.${i}.description`, svc.label);
                                }
                              },
                            })}
                          >
                            <option value="">Select…</option>
                            {(services.data ?? []).map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            aria-label={`Line ${i + 1} description`}
                            aria-invalid={!!le?.description || undefined}
                            className={clsx(inputClasses, 'h-10')}
                            {...register(`lines.${i}.description`)}
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            type="number"
                            aria-label={`Line ${i + 1} quantity`}
                            aria-invalid={!!le?.quantity || undefined}
                            className={clsx(inputClasses, 'h-10')}
                            {...register(`lines.${i}.quantity`)}
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            aria-label={`Line ${i + 1} unit`}
                            aria-invalid={!!le?.unit || undefined}
                            className={clsx(inputClasses, 'h-10')}
                            {...register(`lines.${i}.unit`)}
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            type="number"
                            step="0.01"
                            aria-label={`Line ${i + 1} unit price`}
                            aria-invalid={!!le?.unitPrice || undefined}
                            className={clsx(inputClasses, 'h-10')}
                            {...register(`lines.${i}.unitPrice`)}
                          />
                        </td>
                        <td className="py-1.5 pl-2">
                          <input
                            type="number"
                            step="0.01"
                            aria-label={`Line ${i + 1} unit cost`}
                            aria-invalid={!!le?.unitCost || undefined}
                            className={clsx(inputClasses, 'h-10')}
                            {...register(`lines.${i}.unitCost`)}
                          />
                        </td>
                        <td className="py-1.5 pl-1">
                          <button
                            type="button"
                            aria-label={`Remove line ${i + 1}`}
                            disabled={lines.fields.length === 1}
                            onClick={() => lines.remove(i)}
                            className="grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-danger-subtle hover:text-danger disabled:opacity-30"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {errors.lines ? (
              <p role="alert" className="mt-2 text-caption font-medium text-danger">
                {errors.lines.message ?? errors.lines.root?.message ?? 'Check the highlighted line fields.'}
              </p>
            ) : null}
            <dl className="mt-5 ml-auto grid max-w-sm grid-cols-2 gap-y-1.5 border-t border-border-subtle pt-4 text-body-s">
              <dt className="text-fg-muted">Revenue</dt>
              <dd className="text-right font-medium">
                <Money amount={totals.revenue} />
              </dd>
              <dt className="text-fg-muted">Expected cost</dt>
              <dd className="text-right">
                <Money amount={totals.cost} />
              </dd>
              <dt className="font-semibold">Margin</dt>
              <dd
                className={clsx('text-right font-semibold', marginPct < 15 ? 'text-warning' : 'text-success')}
              >
                <Money amount={margin} /> · {marginPct}%
              </dd>
            </dl>
          </CardBody>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink to="/work-orders" variant="secondary">
            Cancel
          </ButtonLink>
          <Button variant="secondary" busy={create.isPending} onClick={submit('Draft')}>
            Save as draft
          </Button>
          <Button busy={create.isPending} onClick={submit('Confirmed')}>
            Create & confirm
          </Button>
        </div>
      </form>
    </div>
  );
}
