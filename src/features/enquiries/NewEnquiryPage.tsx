import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ServiceCategory } from '@/domain/types';
import { primaryCategory } from '@/domain/workflow';
import {
  ModePicker,
  serviceFitsTypes,
  ServiceTypesPicker,
  SITE_PREFIX,
} from '@/features/sales-orders/commercial-ui';
import { useCustomerOptions, useServiceOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { useCreateEnquiry } from './api';

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    serviceCategories: z
      .array(z.enum(['Transport', 'Warehouse', 'Service']))
      .min(1, 'Select at least one service type'),
    mode: z.enum(['Road', 'Sea', 'Air']),
    origin: z.string().trim().max(80),
    destination: z.string().trim().max(80),
    warehouseSite: z.string().trim().max(80),
    serviceLocation: z.string().trim().max(80),
    storagePeriod: z.string().trim().max(60).optional(),
    requiredBy: z.string().min(1, 'Choose a date'),
    nextFollowUp: z.string().optional(),
    serviceIds: z.array(z.string()).min(1, 'Select at least one service'),
    description: z.string().trim().min(2, 'Describe the goods or the service').max(160),
    packages: z.coerce.number().int().min(0, 'Cannot be negative'),
    weightKg: z.coerce.number().min(0, 'Cannot be negative'),
    volumeCbm: z.coerce.number().min(0, 'Cannot be negative'),
    equipment: z.string().max(60).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    const has = (c: ServiceCategory) => v.serviceCategories.includes(c);
    if (has('Transport')) {
      if (v.origin.length < 2)
        ctx.addIssue({ code: 'custom', path: ['origin'], message: 'Enter the origin' });
      if (v.destination.length < 2)
        ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Enter the destination' });
    }
    if (has('Warehouse') && v.warehouseSite.length < 2)
      ctx.addIssue({ code: 'custom', path: ['warehouseSite'], message: 'Enter the warehouse / site' });
    if (has('Service') && !has('Transport') && !has('Warehouse') && v.serviceLocation.length < 2)
      ctx.addIssue({ code: 'custom', path: ['serviceLocation'], message: 'Enter the service location' });
    const goods = has('Transport') || has('Warehouse');
    if (goods) {
      if (v.packages <= 0)
        ctx.addIssue({ code: 'custom', path: ['packages'], message: 'Must be more than 0' });
      if (v.weightKg <= 0)
        ctx.addIssue({ code: 'custom', path: ['weightKg'], message: 'Must be more than 0' });
      if (v.volumeCbm <= 0)
        ctx.addIssue({ code: 'custom', path: ['volumeCbm'], message: 'Must be more than 0' });
    }
  });
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function NewEnquiryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  const create = useCreateEnquiry();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      serviceCategories: ['Transport'],
      mode: 'Road',
      serviceIds: [],
      requiredBy: '2026-12-05',
      origin: '',
      destination: '',
      warehouseSite: '',
      serviceLocation: '',
    },
  });
  const cats = useController({ control, name: 'serviceCategories' });
  const mode = useController({ control, name: 'mode' });
  const svc = useController({ control, name: 'serviceIds' });
  const types = cats.field.value;
  const has = (c: ServiceCategory) => types.includes(c);
  const onlyService = has('Service') && !has('Transport') && !has('Warehouse');
  const serviceChoices = (services.data ?? []).filter((s) =>
    serviceFitsTypes(s.mode, types, mode.field.value),
  );

  const onSubmit = handleSubmit(async (v) => {
    const t = v.serviceCategories;
    const transport = t.includes('Transport');
    const warehouse = t.includes('Warehouse');
    // Primary location: the route when transport is included, else the warehouse site, else the service location.
    const origin = transport ? v.origin : warehouse ? v.warehouseSite : v.serviceLocation;
    const destination = transport ? v.destination : '';
    const notes = [
      transport && warehouse ? `${SITE_PREFIX.Warehouse}${v.warehouseSite}` : '',
      t.includes('Service') && !onlyService && v.serviceLocation
        ? `${SITE_PREFIX.Service}${v.serviceLocation}`
        : '',
      warehouse && v.storagePeriod ? `Expected storage period: ${v.storagePeriod}` : '',
      v.notes ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    const created = await create.mutateAsync({
      customerId: v.customerId,
      serviceCategory: primaryCategory(t),
      serviceCategories: t,
      mode: transport ? v.mode : undefined,
      origin,
      destination,
      requiredBy: v.requiredBy,
      nextFollowUp: v.nextFollowUp || undefined,
      serviceIds: v.serviceIds,
      notes,
      cargo: {
        description: v.description,
        packages: v.packages,
        weightKg: v.weightKg,
        volumeCbm: v.volumeCbm,
        equipment: v.equipment,
      },
    });
    toast({
      title: `${created.number} created`,
      body: 'Prepare a quotation, or create a sales order directly.',
    });
    void navigate({ to: '/enquiries/$id', params: { id: created.id } });
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New enquiry"
        crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: 'New' }]}
        description="Capture what the customer needs. One enquiry can combine transport, warehousing and other services. Pricing happens on the quotation or sales order."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & services" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Customer"
              required
              placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
              options={customers.data ?? []}
              error={errors.customerId?.message}
              className="sm:col-span-2"
              {...register('customerId')}
            />
            <div className="sm:col-span-2">
              <ServiceTypesPicker
                value={types}
                error={errors.serviceCategories?.message}
                onChange={(next) => {
                  cats.field.onChange(next);
                  svc.field.onChange([]);
                }}
              />
            </div>
            {has('Transport') ? (
              <>
                <div className="sm:col-span-2">
                  <ModePicker
                    name={mode.field.name}
                    value={mode.field.value}
                    onChange={(m) => {
                      mode.field.onChange(m);
                      svc.field.onChange([]);
                    }}
                  />
                </div>
                <TextField
                  label="Origin"
                  required
                  placeholder="e.g. Shanghai"
                  error={errors.origin?.message}
                  {...register('origin')}
                />
                <TextField
                  label="Destination"
                  required
                  placeholder="e.g. Jebel Ali"
                  error={errors.destination?.message}
                  {...register('destination')}
                />
              </>
            ) : null}
            {has('Warehouse') ? (
              <>
                <TextField
                  label="Warehouse / site"
                  required
                  placeholder="e.g. JAFZA WH-1"
                  error={errors.warehouseSite?.message}
                  {...register('warehouseSite')}
                />
                <TextField
                  label="Expected storage period"
                  placeholder="e.g. 3 months"
                  error={errors.storagePeriod?.message}
                  {...register('storagePeriod')}
                />
              </>
            ) : null}
            {has('Service') ? (
              <TextField
                label="Service location"
                required={onlyService}
                placeholder="e.g. DXB Cargo Village"
                hint={onlyService ? undefined : 'Optional when a route or warehouse is given'}
                error={errors.serviceLocation?.message}
                {...register('serviceLocation')}
              />
            ) : null}
            <TextField
              label="Required by"
              type="date"
              required
              error={errors.requiredBy?.message}
              {...register('requiredBy')}
            />
            <TextField
              label="Next follow-up"
              type="date"
              hint="When to call the customer back — overdue follow-ups are flagged on the board"
              error={errors.nextFollowUp?.message}
              {...register('nextFollowUp')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Services requested"
            description={
              types.length
                ? `Catalogue services for ${types
                    .map((t) =>
                      t === 'Transport'
                        ? `${mode.field.value} transport`
                        : t === 'Service'
                          ? 'direct services'
                          : 'warehouse',
                    )
                    .join(', ')}`
                : 'Select a service type first'
            }
          />
          <CardBody>
            <fieldset aria-describedby={errors.serviceIds ? 'svc-err' : undefined}>
              <legend className="sr-only">Services requested</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {serviceChoices.map((s) => {
                  const checked = svc.field.value.includes(s.value);
                  return (
                    <label
                      key={s.value}
                      className={clsx(
                        'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-body-s transition-colors',
                        checked ? 'border-brand bg-brand-subtle' : 'border-border hover:bg-canvas',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          svc.field.onChange(
                            checked
                              ? svc.field.value.filter((x) => x !== s.value)
                              : [...svc.field.value, s.value],
                          )
                        }
                        className="size-4 accent-[var(--color-brand)]"
                      />
                      <span className="flex-1">{s.label}</span>
                      <span className="text-caption text-fg-muted">per {s.unit.toLowerCase()}</span>
                    </label>
                  );
                })}
              </div>
              {errors.serviceIds ? (
                <p id="svc-err" role="alert" className="mt-2 text-caption font-medium text-danger">
                  {errors.serviceIds.message}
                </p>
              ) : null}
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={onlyService ? 'Service details' : 'Goods'}
            description={onlyService ? 'Quantities are optional for a direct service.' : undefined}
          />
          <CardBody className="grid gap-5 sm:grid-cols-4">
            <TextField
              label="Description"
              required
              className="sm:col-span-4"
              placeholder={
                onlyService
                  ? 'e.g. Import declaration for diagnostic equipment'
                  : 'e.g. Palletised ceramic tiles'
              }
              error={errors.description?.message}
              {...register('description')}
            />
            <TextField
              label="Packages"
              type="number"
              inputMode="numeric"
              required={!onlyService}
              error={errors.packages?.message}
              {...register('packages')}
            />
            <TextField
              label="Weight (kg)"
              type="number"
              inputMode="decimal"
              required={!onlyService}
              error={errors.weightKg?.message}
              {...register('weightKg')}
            />
            <TextField
              label="Volume (cbm)"
              type="number"
              inputMode="decimal"
              step="0.1"
              required={!onlyService}
              error={errors.volumeCbm?.message}
              {...register('volumeCbm')}
            />
            <TextField
              label={has('Transport') ? 'Equipment' : 'Handling unit'}
              placeholder={has('Transport') ? 'e.g. 40ft trailer' : 'e.g. 18 pallets'}
              error={errors.equipment?.message}
              {...register('equipment')}
            />
            <TextareaField
              label="Notes"
              className="sm:col-span-4"
              placeholder="Handling instructions, special requirements…"
              {...register('notes')}
            />
          </CardBody>
        </Card>

        <div className="flex justify-end gap-2">
          <ButtonLink to="/enquiries" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" busy={create.isPending}>
            Create enquiry
          </Button>
        </div>
      </form>
    </div>
  );
}
