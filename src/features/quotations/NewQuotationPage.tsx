import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useController, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Currency } from '@/domain/types';
import { categoriesFromLines, serviceCategoryLabel } from '@/domain/workflow';
import { locationLabel, ServiceTypesPicker } from '@/features/sales-orders/commercial-ui';
import { suggestLine, useCommercialSettings, useServiceMeta } from '@/features/sales-orders/commercial-api';
import { CurrencyFields, rateError } from '@/features/sales-orders/CurrencyFields';
import { PlaceField } from '@/features/sales-orders/master-fields';
import {
  useCustomerComboOptions,
  useCustomerOptions,
  useServiceComboOptions,
  useServiceOptions,
} from '@/shared/data/lookups';
import { ComboboxField } from '@/shared/ui/Combobox';
import { PriceLinesGrid, type GridLine } from '@/shared/ui/PriceLinesGrid';
import {
  ENTRY_SHORTCUTS,
  Kbd,
  MOD,
  ShortcutsButton,
  StickyActionBar,
  useFormShortcuts,
} from '@/shared/ui/shortcuts';
import { formatMoney } from '@/shared/utils/format';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
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
  minimumCharge: z.number().optional(),
  customerApproved: z.boolean().optional(),
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
  const customerCombo = useCustomerComboOptions();
  const serviceCombo = useServiceComboOptions();
  // Wait for option lists so the selects show their prefilled values on first render.
  if (
    (enquiryId && prefill.isLoading) ||
    customers.isLoading ||
    services.isLoading ||
    customerCombo.isLoading ||
    serviceCombo.isLoading
  )
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
  const services = useServiceOptions();
  const customerCombo = useCustomerComboOptions();
  const serviceCombo = useServiceComboOptions();
  const create = useCreateQuotation();
  const [submitMode, setSubmitMode] = useState<'draft' | 'submit'>('draft');
  const settings = useCommercialSettings();
  const serviceMeta = useServiceMeta();
  const multiCurrency = !!settings.data?.multiCurrency;
  const [fx, setFx] = useState<{ currency: Currency; rate: string }>({ currency: 'AED', rate: '1' });
  const [fxTouched, setFxTouched] = useState(false);
  const fxError = fxTouched ? rateError(fx.currency, fx.rate) : undefined;
  const fxRate = fx.currency === 'AED' ? 1 : Number(fx.rate) || 1;

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
  // MASTERS M2: where each line's suggested price came from, by line key.
  const [priceSources, setPriceSources] = useState<Record<string, string | undefined>>({});
  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];
  const cats = useController({ control, name: 'serviceCategories' });
  const customer = useController({ control, name: 'customerId' });
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
      minimumCharge: l?.minimumCharge,
    })),
  );

  const emptyLine = { serviceId: '', description: '', quantity: 1, unit: '', unitPrice: 0, unitCost: 0 };
  const gridLines: GridLine[] = watchedLines.map((l, idx) => ({
    serviceId: l?.serviceId ?? '',
    description: l?.description ?? '',
    quantity: String(l?.quantity ?? ''),
    unit: l?.unit ?? '',
    unitPrice: String(l?.unitPrice ?? ''),
    unitCost: String(l?.unitCost ?? ''),
    minimumCharge: l?.minimumCharge,
    customerApproved: l?.customerApproved,
    priceSource: priceSources[fields[idx]?.id ?? ''],
  }));
  const patchLine = (i: number, p: Partial<GridLine>) => {
    const o = { shouldDirty: true };
    if (p.serviceId !== undefined) setValue(`lines.${i}.serviceId`, p.serviceId, o);
    if (p.description !== undefined) setValue(`lines.${i}.description`, p.description, o);
    if (p.quantity !== undefined) setValue(`lines.${i}.quantity`, p.quantity, o);
    if (p.unit !== undefined) setValue(`lines.${i}.unit`, p.unit, o);
    if (p.unitPrice !== undefined) setValue(`lines.${i}.unitPrice`, p.unitPrice, o);
    if (p.unitCost !== undefined) setValue(`lines.${i}.unitCost`, p.unitCost, o);
    if ('minimumCharge' in p) setValue(`lines.${i}.minimumCharge`, p.minimumCharge, o);
    if (p.customerApproved !== undefined) setValue(`lines.${i}.customerApproved`, p.customerApproved, o);
    if ('priceSource' in p) {
      const key = fields[i]?.id;
      if (key) setPriceSources((m) => ({ ...m, [key]: p.priceSource }));
    }
  };
  const suggest = (serviceId: string) =>
    suggestLine(serviceId, { origin: getValues('origin'), destination: getValues('destination') }, fxRate, {
      customerId: getValues('customerId'),
      currency: fx.currency,
    });

  const save = (submit: boolean) => async (v: FormOutput) => {
    setSubmitMode(submit ? 'submit' : 'draft');
    setFxTouched(true);
    if (rateError(fx.currency, fx.rate)) return;
    const res = await create.mutateAsync({
      ...v,
      mode: transport ? v.mode : undefined,
      destination: transport ? v.destination : '',
      enquiryId,
      submit,
      ...(fx.currency !== 'AED' ? { currency: fx.currency, exchangeRate: fxRate } : {}),
    });
    const q = res.quotation;
    toast(
      !submit
        ? { title: `${q.number} saved as draft` }
        : res.status === 'Pending approval'
          ? {
              title: `${q.number} sent for approval`,
              body: `${res.reasons.join('; ')}. Waiting for the ${res.approverRole ?? 'approver'}.`,
            }
          : {
              title: `${q.number} sent to the customer`,
              body: 'No approval needed — discount and margin are inside the approval matrix limits.',
            },
    );
    void navigate({ to: '/quotations/$id', params: { id: q.id } });
  };
  const onSubmit = handleSubmit(save(false));
  const onSubmitForApproval = () => void handleSubmit(save(true))();
  useFormShortcuts({
    onSave: () => void onSubmit(),
    onPrimary: onSubmitForApproval,
    onAddLine: () => append(emptyLine),
  });

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
            <ComboboxField
              label="Customer"
              required
              className="sm:col-span-2"
              placeholder="Type name, code or city…"
              options={customerCombo.data ?? []}
              value={customer.field.value}
              onChange={customer.field.onChange}
              error={errors.customerId?.message}
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
            <PlaceField
              label={transport ? 'Origin' : locationLabel(locationKind)}
              required
              error={errors.origin?.message}
              {...register('origin')}
            />
            {transport ? (
              <PlaceField
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
            {multiCurrency ? (
              <CurrencyFields
                currency={fx.currency}
                rate={fx.rate}
                rateError={fxError}
                onChange={(next) => {
                  setFxTouched(true);
                  setFx(next);
                }}
              />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Price lines"
            description={`Type to find a service — the price comes from the customer’s rates, then the price list, then cost + 20%. Unit cost and margin are internal and never printed.${fx.currency !== 'AED' ? ` Amounts in ${fx.currency}.` : ''}`}
          />
          <CardBody>
            <PriceLinesGrid
              caption="Quotation price lines"
              lines={gridLines}
              keys={fields.map((f) => f.id)}
              errors={
                errors.lines
                  ? fields.map((_, i) => {
                      const le = errors.lines?.[i];
                      return le
                        ? {
                            serviceId: le.serviceId?.message,
                            description: le.description?.message,
                            quantity: le.quantity?.message,
                            unit: le.unit?.message,
                            unitPrice: le.unitPrice?.message,
                            unitCost: le.unitCost?.message,
                          }
                        : undefined;
                    })
                  : undefined
              }
              services={serviceCombo.data ?? []}
              onPatch={patchLine}
              onAdd={() => append(emptyLine)}
              onRemove={remove}
              suggest={suggest}
              serviceMeta={serviceMeta}
              currency={fx.currency}
            />
            {errors.lines ? (
              <p role="alert" className="mt-2 text-caption font-medium text-danger">
                {errors.lines.message ?? errors.lines.root?.message ?? 'Check the highlighted line fields.'}
              </p>
            ) : null}
            <div className="mt-6 border-t border-border-subtle pt-5">
              <QuotationTotals t={t} currency={fx.currency} rate={fxRate} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Terms" />
          <CardBody>
            <TextareaField label="Terms shown to the customer" rows={3} {...register('terms')} />
          </CardBody>
        </Card>

        <StickyActionBar
          summary={
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-body-s">
              <span>
                Total{' '}
                <strong className="tabular-nums">
                  {fx.currency === 'AED' ? formatMoney(t.total) : `${fx.currency} ${t.total.toFixed(2)}`}
                </strong>
              </span>
              <span className="text-fg-muted">
                margin <span className="tabular-nums">{formatMoney(t.margin)}</span> ({t.marginPct}%)
              </span>
              <span className="hidden items-center gap-1 text-caption text-fg-muted md:flex">
                <Kbd>{MOD}</Kbd>+<Kbd>S</Kbd> draft · <Kbd>{MOD}</Kbd>+<Kbd>Enter</Kbd> submit
              </span>
            </p>
          }
        >
          <ShortcutsButton shortcuts={ENTRY_SHORTCUTS} />
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
            onClick={onSubmitForApproval}
          >
            Submit for approval
          </Button>
        </StickyActionBar>
      </form>
    </div>
  );
}
