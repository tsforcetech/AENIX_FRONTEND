import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Fuel, Info } from 'lucide-react';
import { useState } from 'react';
import { useController, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Currency } from '@/domain/types';
import { totals } from '@/features/quotations/api';
import { QuotationTotals } from '@/features/quotations/QuotationTotals';
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
import { TextareaField, TextField } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { useCreateSalesOrder, useSalesOrderPrefill, type SalesOrderPrefill } from './api';
import { categoriesFromLines, serviceCategoryLabel } from '@/domain/workflow';
import { suggestLine, useCommercialSettings, useServiceMeta } from './commercial-api';
import { locationLabel, ModePicker, serviceFitsTypes, ServiceTypesPicker } from './commercial-ui';
import { ConfirmationFilePicker, type PickedFile } from './ConfirmationFilePicker';
import { CurrencyFields, rateError } from './CurrencyFields';
import { PlaceField } from './master-fields';
import { fuelSurchargeAmount } from './pricing';

const route = getRouteApi('/_app/sales-orders/new');

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
    customerPoRef: z.string().trim().min(2, 'Enter the customer’s PO / reference').max(40),
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
  const customerCombo = useCustomerComboOptions();
  const serviceCombo = useServiceComboOptions();
  if (
    prefill.isLoading ||
    customers.isLoading ||
    services.isLoading ||
    customerCombo.isLoading ||
    serviceCombo.isLoading ||
    !prefill.data
  )
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
  const services = useServiceOptions();
  const customerCombo = useCustomerComboOptions();
  const serviceCombo = useServiceComboOptions();
  const create = useCreateSalesOrder();
  const [confirmMode, setConfirmMode] = useState(false);
  const priced = prefill.source === 'quotation' || prefill.source === 'contract';
  const settings = useCommercialSettings();
  const serviceMeta = useServiceMeta();
  const multiCurrency = !!settings.data?.multiCurrency || !!(prefill.currency && prefill.currency !== 'AED');
  const [fx, setFx] = useState<{ currency: Currency; rate: string }>({
    currency: prefill.currency ?? 'AED',
    rate: String(prefill.exchangeRate ?? 1),
  });
  const [fxTouched, setFxTouched] = useState(false);
  const fxError = fxTouched ? rateError(fx.currency, fx.rate) : undefined;
  const fxRate = fx.currency === 'AED' ? 1 : Number(fx.rate) || 1;
  const [file, setFile] = useState<PickedFile | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();

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
  const customer = useController({ control, name: 'customerId' });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  // MASTERS M2: where each line's suggested price came from, by line key.
  const [priceSources, setPriceSources] = useState<Record<string, string | undefined>>({});
  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];
  const selected = cats.field.value;
  // Types found on the price lines are always included (one order can mix services).
  const lineTypes = categoriesFromLines(
    watchedLines.map((l) => ({ serviceId: l?.serviceId ?? '' })),
    (id) => services.data?.find((s) => s.value === id)?.mode,
  );
  const transport = selected.includes('Transport') || lineTypes.includes('Transport');
  const locationKind = transport ? 'Transport' : selected.includes('Warehouse') ? 'Warehouse' : 'Service';
  const numericLines = watchedLines.map((l) => ({
    serviceId: l?.serviceId ?? '',
    quantity: Number(l?.quantity) || 0,
    unitPrice: Number(l?.unitPrice) || 0,
    unitCost: Number(l?.unitCost) || 0,
    minimumCharge: l?.minimumCharge,
  }));
  // C6: contract fuel surcharge on the transport subtotal (added as a line on save).
  const fuelPct = prefill.fuelSurchargePct ?? 0;
  const fuel = fuelSurchargeAmount(numericLines, fuelPct, (id) => {
    const m = services.data?.find((s) => s.value === id)?.mode;
    return m === 'Road' || m === 'Sea' || m === 'Air';
  });
  const t = totals(
    fuel > 0 ? [...numericLines, { quantity: 1, unitPrice: fuel, unitCost: 0 }] : numericLines,
  );
  const serviceChoices = (services.data ?? []).filter(
    (s) =>
      serviceFitsTypes(s.mode, selected, mode.field.value) ||
      watchedLines.some((l) => l?.serviceId === s.value),
  );

  const allowed = new Set(serviceChoices.map((c) => c.value));
  const serviceOptions = (serviceCombo.data ?? []).filter((o) => allowed.has(o.value));
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

  const save = (confirm: boolean) => async (v: FormOutput) => {
    setConfirmMode(confirm);
    setFxTouched(true);
    if (rateError(fx.currency, fx.rate)) return;
    if (confirm && !file) {
      setFileError('Attach the customer’s confirmation to confirm — or save as draft.');
      return;
    }
    try {
      const res = await create.mutateAsync({
        ...v,
        mode: transport ? v.mode : undefined,
        destination: transport ? v.destination : '',
        enquiryId: prefill.enquiryId,
        quotationId: prefill.quotationId,
        contractId: prefill.contractId,
        confirm,
        confirmationFile: file,
        ...(fx.currency !== 'AED' ? { currency: fx.currency, exchangeRate: fxRate } : {}),
      });
      const so = res.salesOrder;
      toast(
        res.confirmed
          ? { title: `${so.number} confirmed`, body: 'Create the job (work order) to start the work.' }
          : confirm
            ? {
                title: `${so.number} saved as draft — credit check`,
                body: `${res.credit?.reasons.join('; ') ?? 'Credit check failed'}. Request a credit override on the order.`,
              }
            : { title: `${so.number} saved as draft` },
      );
      void navigate({ to: '/sales-orders/$id', params: { id: so.id } });
    } catch (e) {
      toast({ title: 'Could not save the sales order', body: (e as Error).message });
    }
  };

  const onSaveDraft = handleSubmit(save(false));
  const onConfirm = () => void handleSubmit(save(true))();
  useFormShortcuts({
    onSave: () => void onSaveDraft(),
    onPrimary: onConfirm,
    onAddLine: () => append(emptyLine),
  });

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
      <form onSubmit={onSaveDraft} noValidate className="space-y-6">
        <Card>
          <CardHeader title="Customer & order" />
          <CardBody className="grid gap-5 sm:grid-cols-2">
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
            <div className="sm:col-span-2">
              <ConfirmationFilePicker
                value={file}
                error={fileError}
                onChange={(f) => {
                  setFile(f);
                  setFileError(undefined);
                }}
              />
            </div>
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Price lines"
            description={`Type to find a service — the price comes from the customer’s rates, then the price list, then cost + 20%. Unit cost and margin are internal and never printed.${fx.currency !== 'AED' ? ` Amounts in ${fx.currency}.` : ''}`}
          />
          <CardBody>
            <PriceLinesGrid
              caption="Sales order price lines"
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
              services={serviceOptions}
              onPatch={patchLine}
              onAdd={() => append(emptyLine)}
              onRemove={remove}
              suggest={suggest}
              serviceMeta={serviceMeta}
              currency={fx.currency}
            />
            {fuelPct > 0 ? (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-body-s text-fg-secondary">
                <Fuel aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                Fuel surcharge {fuelPct}% on the transport subtotal (contract clause):{' '}
                <strong className="tabular-nums">
                  {fx.currency === 'AED' ? formatMoney(fuel) : `${fx.currency} ${fuel.toFixed(2)}`}
                </strong>{' '}
                — added as a line when you save.
              </p>
            ) : null}
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
                <Kbd>{MOD}</Kbd>+<Kbd>S</Kbd> draft · <Kbd>{MOD}</Kbd>+<Kbd>Enter</Kbd> confirm
              </span>
            </p>
          }
        >
          <ShortcutsButton shortcuts={ENTRY_SHORTCUTS} />
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
            onClick={onConfirm}
          >
            Confirm sales order
          </Button>
        </StickyActionBar>
      </form>
    </div>
  );
}
