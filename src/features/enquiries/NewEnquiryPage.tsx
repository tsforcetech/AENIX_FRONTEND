import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ModePicker, serviceFitsType, ServiceTypePicker } from '@/features/sales-orders/commercial-ui';
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
    serviceCategory: z.enum(['Transport', 'Warehouse', 'Service']),
    mode: z.enum(['Road', 'Sea', 'Air']),
    origin: z.string().trim().min(2, 'Enter a location').max(80),
    destination: z.string().trim().max(80),
    storagePeriod: z.string().trim().max(60).optional(),
    requiredBy: z.string().min(1, 'Choose a date'),
    serviceIds: z.array(z.string()).min(1, 'Select at least one service'),
    description: z.string().trim().min(2, 'Describe the goods or the service').max(160),
    packages: z.coerce.number().int().min(0, 'Cannot be negative'),
    weightKg: z.coerce.number().min(0, 'Cannot be negative'),
    volumeCbm: z.coerce.number().min(0, 'Cannot be negative'),
    equipment: z.string().max(60).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.serviceCategory === 'Transport' && v.destination.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Enter the destination' });
    }
    if (v.serviceCategory !== 'Service') {
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

const originLabel = {
  Transport: 'Origin',
  Warehouse: 'Warehouse / site',
  Service: 'Service location',
} as const;
const originPlaceholder = {
  Transport: 'e.g. Jebel Ali',
  Warehouse: 'e.g. JAFZA WH-1',
  Service: 'e.g. DXB Cargo Village',
} as const;

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
      serviceCategory: 'Transport',
      mode: 'Road',
      serviceIds: [],
      requiredBy: '2026-12-05',
      destination: '',
    },
  });
  const category = useController({ control, name: 'serviceCategory' });
  const mode = useController({ control, name: 'mode' });
  const svc = useController({ control, name: 'serviceIds' });
  const type = category.field.value;
  const serviceChoices = (services.data ?? []).filter((s) => serviceFitsType(s.mode, type, mode.field.value));

  const onSubmit = handleSubmit(async (v) => {
    const notes = [v.storagePeriod ? `Expected storage period: ${v.storagePeriod}` : '', v.notes ?? '']
      .filter(Boolean)
      .join('\n');
    const created = await create.mutateAsync({
      customerId: v.customerId,
      serviceCategory: v.serviceCategory,
      mode: v.serviceCategory === 'Transport' ? v.mode : undefined,
      origin: v.origin,
      destination: v.serviceCategory === 'Transport' ? v.destination : '',
      requiredBy: v.requiredBy,
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
      body: 'Prepare a quotation, or confirm a sales order directly.',
    });
    void navigate({ to: '/enquiries/$id', params: { id: created.id } });
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New enquiry"
        crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: 'New' }]}
        description="Capture what the customer needs: transport, warehousing or a direct service. Pricing happens on the quotation or sales order."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & service" />
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
              <ServiceTypePicker
                name={category.field.name}
                value={type}
                onChange={(c) => {
                  category.field.onChange(c);
                  svc.field.onChange([]);
                }}
              />
            </div>
            {type === 'Transport' ? (
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
            ) : null}
            <TextField
              label={originLabel[type]}
              required
              placeholder={originPlaceholder[type]}
              error={errors.origin?.message}
              {...register('origin')}
            />
            {type === 'Transport' ? (
              <TextField
                label="Destination"
                required
                placeholder="e.g. Riyadh"
                error={errors.destination?.message}
                {...register('destination')}
              />
            ) : type === 'Warehouse' ? (
              <TextField
                label="Expected storage period"
                placeholder="e.g. 3 months"
                error={errors.storagePeriod?.message}
                {...register('storagePeriod')}
              />
            ) : (
              <div aria-hidden="true" className="hidden sm:block" />
            )}
            <TextField
              label="Required by"
              type="date"
              required
              error={errors.requiredBy?.message}
              {...register('requiredBy')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Services requested"
            description={
              type === 'Transport'
                ? `${mode.field.value} services plus customs and insurance`
                : type === 'Warehouse'
                  ? 'Warehouse services'
                  : 'Direct services (no transport leg)'
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
            title={type === 'Service' ? 'Service details' : 'Goods'}
            description={type === 'Service' ? 'Quantities are optional for a direct service.' : undefined}
          />
          <CardBody className="grid gap-5 sm:grid-cols-4">
            <TextField
              label="Description"
              required
              className="sm:col-span-4"
              placeholder={
                type === 'Service'
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
              required={type !== 'Service'}
              error={errors.packages?.message}
              {...register('packages')}
            />
            <TextField
              label="Weight (kg)"
              type="number"
              inputMode="decimal"
              required={type !== 'Service'}
              error={errors.weightKg?.message}
              {...register('weightKg')}
            />
            <TextField
              label="Volume (cbm)"
              type="number"
              inputMode="decimal"
              step="0.1"
              required={type !== 'Service'}
              error={errors.volumeCbm?.message}
              {...register('volumeCbm')}
            />
            <TextField
              label={type === 'Warehouse' ? 'Handling unit' : 'Equipment'}
              placeholder={type === 'Warehouse' ? 'e.g. 18 pallets' : 'e.g. 40ft trailer'}
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
