import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Plus, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useController, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { categoriesFromLines, serviceCategoryLabel } from '@/domain/workflow';
import { locationLabel, ServiceTypesPicker } from '@/features/sales-orders/commercial-ui';
import { useCustomerOptions, useServiceOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { inputClasses, SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { totals, useCreateQuotation, useQuotationPrefill, type QuotationDraftPrefill } from './api';
import { QuotationTotals } from './QuotationTotals';

const route = getRouteApi('/_app/quotations/new');

const lineSchema = z.object({
  serviceId: z.string().min(1, 'Choose a service'),
  description: z.string().trim().min(2, 'Describe the line').max(160),
  quantity: z.coerce.number().positive('> 0'),
  unit: z.string().trim().min(1, 'Unit').max(30),
  unitPrice: z.coerce.number().min(0, '≥ 0'),
  unitCost: z.coerce.number().min(0, '≥ 0'),
});

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    serviceCategories: z
      .array(z.enum(['Transport', 'Warehouse', 'Service']))
      .min(1, 'Select at least one service type'),
    mode: z.enum(['Road', 'Sea', 'Air']),
    origin: z.string().trim().min(2, 'Enter a location').max(80),
    destination: z.string().trim().max(80),
    agreement: z.enum(['One-time', 'Long-term']),
    validUntil: z.string().min(1, 'Choose a date'),
    terms: z.string().max(2000),
    lines: z.array(lineSchema).min(1, 'Add at least one price line'),
  })
  .superRefine((v, ctx) => {
    if (v.serviceCategories.includes('Transport') && v.destination.length < 2)
      ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Enter the destination' });
  });
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const DEFAULT_TERMS = 'Rates exclude duties and taxes unless stated. VAT 5% applies. Validity as shown.';

export function NewQuotationPage() {
  const { enquiryId } = route.useSearch();
  const prefill = useQuotationPrefill(enquiryId);
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  // Wait for option lists so the selects show their prefilled values on first render.
  if ((enquiryId && prefill.isLoading) || customers.isLoading || services.isLoading)
    return (
      <StatusMessage kind="loading" title={enquiryId ? 'Preparing quotation from enquiry…' : 'Loading…'} />
    );
  return <QuotationForm enquiryId={prefill.data ? enquiryId : undefined} prefill={prefill.data ?? null} />;
}

function QuotationForm({
  enquiryId,
  prefill,
}: {
  enquiryId?: string;
  prefill: QuotationDraftPrefill | null;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  const create = useCreateQuotation();
  const [submitMode, setSubmitMode] = useState<'draft' | 'submit'>('draft');

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: prefill?.customerId ?? '',
      serviceCategories: prefill?.serviceCategories ?? ['Transport'],
      mode: prefill?.mode ?? 'Road',
      origin: prefill?.origin ?? '',
      destination: prefill?.destination ?? '',
      agreement: 'One-time',
      validUntil: '2026-12-31',
      terms: DEFAULT_TERMS,
      lines: prefill?.lines ?? [
        { serviceId: '', description: '', quantity: 1, unit: '', unitPrice: 0, unitCost: 0 },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];
  const cats = useController({ control, name: 'serviceCategories' });
  // Types found on the price lines are always included (one quote can mix services).
  const lineTypes = categoriesFromLines(
    watchedLines.map((l) => ({ serviceId: l?.serviceId ?? '' })),
    (id) => services.data?.find((s) => s.value === id)?.mode,
  );
  const selected = cats.field.value;
  const transport = selected.includes('Transport') || lineTypes.includes('Transport');
  const locationKind = transport ? 'Transport' : selected.includes('Warehouse') ? 'Warehouse' : 'Service';
  const t = totals(
    watchedLines.map((l) => ({
      quantity: Number(l?.quantity) || 0,
      unitPrice: Number(l?.unitPrice) || 0,
      unitCost: Number(l?.unitCost) || 0,
    })),
  );

  const onServiceChange = (index: number, serviceId: string) => {
    const svc = services.data?.find((s) => s.value === serviceId);
    if (!svc) return;
    setValue(`lines.${index}.unit`, svc.unit);
    if (!getValues(`lines.${index}.description`)) setValue(`lines.${index}.description`, svc.label);
  };

  const save = (submit: boolean) => async (v: FormOutput) => {
    setSubmitMode(submit ? 'submit' : 'draft');
    const q = await create.mutateAsync({
      ...v,
      mode: transport ? v.mode : undefined,
      destination: transport ? v.destination : '',
      enquiryId,
      submit,
    });
    toast({
      title: `${q.number} ${submit ? 'submitted for approval' : 'saved as draft'}`,
      body: q.status === 'Pending approval' ? 'An approver can now review the price and margin.' : undefined,
    });
    void navigate({ to: '/quotations/$id', params: { id: q.id } });
  };
  const onSubmit = handleSubmit(save(false));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New quotation"
        crumbs={[{ label: 'Quotations', to: '/quotations' }, { label: 'New' }]}
        description={
          prefill ? (
            <>
              Prefilled from enquiry{' '}
              <Link to="/enquiries/$id" params={{ id: enquiryId! }} className="hover:underline">
                <DocRef>{prefill.enquiryNumber}</DocRef>
              </Link>
              . Costs come from vendor rates; prices suggest a 20% markup.
            </>
          ) : (
            'Price a customer request. Submit for approval before sending.'
          )
        }
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & service" />
          <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Customer"
              required
              className="sm:col-span-2"
              placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
              options={customers.data ?? []}
              error={errors.customerId?.message}
              {...register('customerId')}
            />
            <div className="sm:col-span-2 lg:col-span-4">
              <ServiceTypesPicker
                value={selected}
                error={errors.serviceCategories?.message}
                onChange={cats.field.onChange}
              />
              {lineTypes.some((c) => !selected.includes(c)) ? (
                <p className="mt-2 text-caption text-fg-muted">
                  Price lines also include{' '}
                  {lineTypes
                    .filter((c) => !selected.includes(c))
                    .map((c) => serviceCategoryLabel[c])
                    .join(', ')}{' '}
                  — saved with the quotation.
                </p>
              ) : null}
            </div>
            <SelectField
              label="Agreement"
              required
              hint="Long-term can become a contract"
              options={[
                { value: 'One-time', label: 'One-time' },
                { value: 'Long-term', label: 'Long-term' },
              ]}
              {...register('agreement')}
            />
            {transport ? (
              <SelectField
                label="Transport mode"
                required
                options={['Road', 'Sea', 'Air'].map((m) => ({ value: m, label: `${m} freight` }))}
                {...register('mode')}
              />
            ) : null}
            <TextField
              label={transport ? 'Origin' : locationLabel(locationKind)}
              required
              error={errors.origin?.message}
              {...register('origin')}
            />
            {transport ? (
              <TextField
                label="Destination"
                required
                error={errors.destination?.message}
                {...register('destination')}
              />
            ) : null}
            <TextField
              label="Valid until"
              type="date"
              required
              error={errors.validUntil?.message}
              {...register('validUntil')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Price lines"
            description="Unit cost is internal and never shown to the customer."
            actions={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus aria-hidden="true" />}
                onClick={() =>
                  append({ serviceId: '', description: '', quantity: 1, unit: '', unitPrice: 0, unitCost: 0 })
                }
              >
                Add line
              </Button>
            }
          />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-body-s">
                <caption className="sr-only">Quotation price lines</caption>
                <thead>
                  <tr className="text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="w-48 pb-2 pr-2 font-medium">
                      Service
                    </th>
                    <th scope="col" className="pb-2 pr-2 font-medium">
                      Description
                    </th>
                    <th scope="col" className="w-20 pb-2 pr-2 font-medium">
                      Qty
                    </th>
                    <th scope="col" className="w-28 pb-2 pr-2 font-medium">
                      Unit
                    </th>
                    <th scope="col" className="w-28 pb-2 pr-2 text-right font-medium">
                      Unit price
                    </th>
                    <th scope="col" className="w-28 pb-2 pr-2 text-right font-medium">
                      Unit cost
                    </th>
                    <th scope="col" className="w-28 pb-2 pr-2 text-right font-medium">
                      Amount
                    </th>
                    <th scope="col" className="w-10 pb-2">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => {
                    const le = errors.lines?.[i];
                    const wl = watchedLines[i];
                    const amount = (Number(wl?.quantity) || 0) * (Number(wl?.unitPrice) || 0);
                    const reg = register(`lines.${i}.serviceId`);
                    return (
                      <tr key={f.id} className="align-top">
                        <td className="py-1.5 pr-2">
                          <select
                            aria-label={`Line ${i + 1} service`}
                            aria-invalid={!!le?.serviceId || undefined}
                            className={`${inputClasses} h-9`}
                            {...reg}
                            onChange={(e) => {
                              void reg.onChange(e);
                              onServiceChange(i, e.target.value);
                            }}
                          >
                            <option value="">Select…</option>
                            {(services.data ?? []).map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Line ${i + 1} description`}
                            aria-invalid={!!le?.description || undefined}
                            className={`${inputClasses} h-9`}
                            {...register(`lines.${i}.description`)}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Line ${i + 1} quantity`}
                            type="number"
                            step="any"
                            inputMode="decimal"
                            aria-invalid={!!le?.quantity || undefined}
                            className={`${inputClasses} h-9 text-right`}
                            {...register(`lines.${i}.quantity`)}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Line ${i + 1} unit`}
                            aria-invalid={!!le?.unit || undefined}
                            className={`${inputClasses} h-9`}
                            {...register(`lines.${i}.unit`)}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Line ${i + 1} unit price`}
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            aria-invalid={!!le?.unitPrice || undefined}
                            className={`${inputClasses} h-9 text-right`}
                            {...register(`lines.${i}.unitPrice`)}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Line ${i + 1} unit cost`}
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            aria-invalid={!!le?.unitCost || undefined}
                            className={`${inputClasses} h-9 text-right`}
                            {...register(`lines.${i}.unitCost`)}
                          />
                        </td>
                        <td className="py-3 pr-2 text-right font-medium tabular-nums">
                          {amount.toLocaleString('en-AE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-1.5">
                          <button
                            type="button"
                            onClick={() => remove(i)}
                            disabled={fields.length === 1}
                            aria-label={`Remove line ${i + 1}`}
                            className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-danger-subtle hover:text-danger disabled:opacity-30"
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
            <div className="mt-6 border-t border-border-subtle pt-5">
              <QuotationTotals t={t} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Terms" />
          <CardBody>
            <TextareaField label="Terms shown to the customer" rows={3} {...register('terms')} />
          </CardBody>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink to="/quotations" variant="secondary">
            Cancel
          </ButtonLink>
          <Button
            type="submit"
            variant="secondary"
            busy={create.isPending && submitMode === 'draft'}
            disabled={create.isPending}
          >
            Save draft
          </Button>
          <Button
            type="button"
            icon={<Send aria-hidden="true" />}
            busy={create.isPending && submitMode === 'submit'}
            disabled={create.isPending}
            onClick={() => void handleSubmit(save(true))()}
          >
            Submit for approval
          </Button>
        </div>
      </form>
    </div>
  );
}
