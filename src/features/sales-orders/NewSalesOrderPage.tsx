import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Info, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useController, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { totals } from '@/features/quotations/api';
import { QuotationTotals } from '@/features/quotations/QuotationTotals';
import { useCustomerOptions, useServiceOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { inputClasses, SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { useCreateSalesOrder, useSalesOrderPrefill, type SalesOrderPrefill } from './api';
import { categoriesFromLines, serviceCategoryLabel } from '@/domain/workflow';
import { locationLabel, ModePicker, serviceFitsTypes, ServiceTypesPicker } from './commercial-ui';

const route = getRouteApi('/_app/sales-orders/new');

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
    customerPoRef: z.string().trim().min(2, 'Enter the customer’s PO reference').max(40),
    orderDate: z.string().min(1, 'Choose a date'),
    notes: z.string().max(1000),
    lines: z.array(lineSchema).min(1, 'Add at least one price line'),
  })
  .superRefine((v, ctx) => {
    if (v.serviceCategories.includes('Transport') && v.destination.length < 2)
      ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Enter the destination' });
  });
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const emptyLine = { serviceId: '', description: '', quantity: 1, unit: '', unitPrice: 0, unitCost: 0 };

export function NewSalesOrderPage() {
  const search = route.useSearch();
  const prefill = useSalesOrderPrefill(search);
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  if (prefill.isLoading || customers.isLoading || services.isLoading || !prefill.data)
    return <StatusMessage kind="loading" title="Preparing sales order…" />;
  return <SalesOrderForm prefill={prefill.data} />;
}

const sourceLabel: Record<SalesOrderPrefill['source'], string> = {
  quotation: 'quotation',
  contract: 'contract',
  enquiry: 'enquiry',
  direct: '',
};

function SalesOrderForm({ prefill }: { prefill: SalesOrderPrefill }) {
  const navigate = useNavigate();
  const toast = useToast();
  const customers = useCustomerOptions();
  const services = useServiceOptions();
  const create = useCreateSalesOrder();
  const [confirmMode, setConfirmMode] = useState(false);
  const priced = prefill.source === 'quotation' || prefill.source === 'contract';

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
      customerId: prefill.customerId,
      serviceCategories: prefill.serviceCategories,
      mode: prefill.mode ?? 'Road',
      origin: prefill.origin,
      destination: prefill.destination,
      customerPoRef: '',
      orderDate: '2026-11-23',
      notes: prefill.notes ?? '',
      lines: prefill.lines.length ? prefill.lines : [emptyLine],
    },
  });
  const cats = useController({ control, name: 'serviceCategories' });
  const mode = useController({ control, name: 'mode' });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];
  const selected = cats.field.value;
  // Types found on the price lines are always included (one order can mix services).
  const lineTypes = categoriesFromLines(
    watchedLines.map((l) => ({ serviceId: l?.serviceId ?? '' })),
    (id) => services.data?.find((s) => s.value === id)?.mode,
  );
  const transport = selected.includes('Transport') || lineTypes.includes('Transport');
  const locationKind = transport ? 'Transport' : selected.includes('Warehouse') ? 'Warehouse' : 'Service';
  const t = totals(
    watchedLines.map((l) => ({
      quantity: Number(l?.quantity) || 0,
      unitPrice: Number(l?.unitPrice) || 0,
      unitCost: Number(l?.unitCost) || 0,
    })),
  );
  const serviceChoices = (services.data ?? []).filter(
    (s) =>
      serviceFitsTypes(s.mode, selected, mode.field.value) ||
      watchedLines.some((l) => l?.serviceId === s.value),
  );

  const onServiceChange = (index: number, serviceId: string) => {
    const svc = services.data?.find((s) => s.value === serviceId);
    if (!svc) return;
    setValue(`lines.${index}.unit`, svc.unit);
    if (!getValues(`lines.${index}.description`)) setValue(`lines.${index}.description`, svc.label);
  };

  const save = (confirm: boolean) => async (v: FormOutput) => {
    setConfirmMode(confirm);
    const so = await create.mutateAsync({
      ...v,
      mode: transport ? v.mode : undefined,
      destination: transport ? v.destination : '',
      enquiryId: prefill.enquiryId,
      quotationId: prefill.quotationId,
      contractId: prefill.contractId,
      confirm,
    });
    toast({
      title: `${so.number} ${confirm ? 'confirmed' : 'saved as draft'}`,
      body: confirm ? 'Create the job (work order) to start the work.' : undefined,
    });
    void navigate({ to: '/sales-orders/$id', params: { id: so.id } });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New sales order"
        crumbs={[{ label: 'Sales orders', to: '/sales-orders' }, { label: 'New' }]}
        description={
          prefill.source === 'direct'
            ? 'Record the customer’s confirmed order. One sales order can run as one or more work orders.'
            : `Prefilled from ${sourceLabel[prefill.source]} ${prefill.sourceNumber ?? ''}.`
        }
      />
      {!priced ? (
        <div
          role="note"
          className="mb-6 flex items-start gap-2 rounded-lg bg-warning-subtle px-4 py-3 text-body-s text-warning"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Direct sales order</strong> — price must follow authorised rate
            rules (no quotation or contract).
          </span>
        </div>
      ) : null}
      <form onSubmit={handleSubmit(save(false))} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & order" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Customer"
              required
              className="sm:col-span-2"
              placeholder="Select customer"
              options={customers.data ?? []}
              error={errors.customerId?.message}
              {...register('customerId')}
            />
            <TextField
              label="Customer PO reference"
              required
              placeholder="e.g. PO-44821"
              error={errors.customerPoRef?.message}
              {...register('customerPoRef')}
            />
            <TextField
              label="Order date"
              type="date"
              required
              error={errors.orderDate?.message}
              {...register('orderDate')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Services"
            description="One sales order can combine transport, warehouse and other services."
          />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
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
                  — saved with the order.
                </p>
              ) : null}
            </div>
            {transport ? (
              <div className="sm:col-span-2">
                <ModePicker name={mode.field.name} value={mode.field.value} onChange={mode.field.onChange} />
              </div>
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
                onClick={() => append(emptyLine)}
              >
                Add line
              </Button>
            }
          />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-body-s">
                <caption className="sr-only">Sales order price lines</caption>
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
                            {serviceChoices.map((s) => (
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
          <CardHeader title="Notes" />
          <CardBody>
            <TextareaField label="Internal notes" rows={3} {...register('notes')} />
            {prefill.quotationId ? (
              <p className="mt-3 text-caption text-fg-muted">
                Source quotation:{' '}
                <Link to="/quotations/$id" params={{ id: prefill.quotationId }} className="hover:underline">
                  <DocRef>{prefill.sourceNumber ?? ''}</DocRef>
                </Link>
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink to="/sales-orders" variant="secondary">
            Cancel
          </ButtonLink>
          <Button
            type="submit"
            variant="secondary"
            busy={create.isPending && !confirmMode}
            disabled={create.isPending}
          >
            Save draft
          </Button>
          <Button
            type="button"
            icon={<CheckCircle2 aria-hidden="true" />}
            busy={create.isPending && confirmMode}
            disabled={create.isPending}
            onClick={() => void handleSubmit(save(true))()}
          >
            Confirm sales order
          </Button>
        </div>
      </form>
    </div>
  );
}
