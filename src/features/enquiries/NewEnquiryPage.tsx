import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { TransportMode } from '@/domain/types';
import { useCustomerOptions, useServiceOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { modeIcons } from '@/shared/ui/ModeIcon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { useCreateEnquiry } from './api';

const MODES: TransportMode[] = ['Road', 'Sea', 'Air'];

const schema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  mode: z.enum(['Road', 'Sea', 'Air']),
  origin: z.string().trim().min(2, 'Enter the origin').max(80),
  destination: z.string().trim().min(2, 'Enter the destination').max(80),
  requiredBy: z.string().min(1, 'Choose a date'),
  serviceIds: z.array(z.string()).min(1, 'Select at least one service'),
  description: z.string().trim().min(2, 'Describe the cargo').max(160),
  packages: z.coerce.number().int().positive('Must be more than 0'),
  weightKg: z.coerce.number().positive('Must be more than 0'),
  volumeCbm: z.coerce.number().positive('Must be more than 0'),
  equipment: z.string().max(60).optional(),
  notes: z.string().max(1000).optional(),
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
    defaultValues: { mode: 'Road', serviceIds: [], requiredBy: '2026-12-05' },
  });
  const mode = useController({ control, name: 'mode' });
  const svc = useController({ control, name: 'serviceIds' });
  const selectedMode = mode.field.value;
  const serviceChoices = (services.data ?? []).filter(
    (s) => s.mode === selectedMode || s.mode === 'Customs' || s.mode === 'Warehouse',
  );

  const onSubmit = handleSubmit(async (v) => {
    const created = await create.mutateAsync({
      customerId: v.customerId,
      mode: v.mode,
      origin: v.origin,
      destination: v.destination,
      requiredBy: v.requiredBy,
      serviceIds: v.serviceIds,
      notes: v.notes ?? '',
      cargo: {
        description: v.description,
        packages: v.packages,
        weightKg: v.weightKg,
        volumeCbm: v.volumeCbm,
        equipment: v.equipment,
      },
    });
    toast({ title: `${created.number} created`, body: 'You can now prepare a quotation.' });
    void navigate({ to: '/enquiries/$id', params: { id: created.id } });
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New enquiry"
        crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: 'New' }]}
        description="Capture what the customer needs. Pricing happens on the quotation."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & route" />
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
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-body-s font-medium">Mode</legend>
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
                        onChange={() => {
                          mode.field.onChange(m);
                          svc.field.onChange([]);
                        }}
                      />
                      <Icon aria-hidden="true" className="size-4" />
                      {m}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <TextField
              label="Origin"
              required
              placeholder="e.g. Jebel Ali"
              error={errors.origin?.message}
              {...register('origin')}
            />
            <TextField
              label="Destination"
              required
              placeholder="e.g. Riyadh"
              error={errors.destination?.message}
              {...register('destination')}
            />
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
          <CardHeader title="Services requested" description="Filtered by the selected mode" />
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
          <CardHeader title="Cargo" />
          <CardBody className="grid gap-5 sm:grid-cols-4">
            <TextField
              label="Description"
              required
              className="sm:col-span-4"
              placeholder="e.g. Palletised ceramic tiles"
              error={errors.description?.message}
              {...register('description')}
            />
            <TextField
              label="Packages"
              type="number"
              inputMode="numeric"
              required
              error={errors.packages?.message}
              {...register('packages')}
            />
            <TextField
              label="Weight (kg)"
              type="number"
              inputMode="decimal"
              required
              error={errors.weightKg?.message}
              {...register('weightKg')}
            />
            <TextField
              label="Volume (cbm)"
              type="number"
              inputMode="decimal"
              step="0.1"
              required
              error={errors.volumeCbm?.message}
              {...register('volumeCbm')}
            />
            <TextField
              label="Equipment"
              placeholder="e.g. 40ft trailer"
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
