import { CalendarX, FileSpreadsheet, PencilLine, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Currency } from '@/domain/types';
import { formatInCurrency } from '@/features/sales-orders/commercial-api';
import { PlaceField } from '@/features/sales-orders/master-fields';
import { activeCurrencies } from '@/shared/data/currency';
import { useCustomerOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { SpreadsheetImport, type ImportField } from '@/shared/ui/SpreadsheetImport';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import {
  RATES_TODAY,
  useExpireSellingRate,
  useImportSellingRates,
  useSaveSellingRate,
  useSellingRates,
  useServices,
  type ImportResult,
  type SellingRateRow,
} from './api';
import { ImportResultNote, RateStatusBadge, UnitSelect } from './rate-ui';

export const SELLING_RATE_FIELDS: ImportField[] = [
  {
    key: 'customer',
    label: 'Customer (code or name — empty = price list)',
    aliases: ['customer', 'client', 'account'],
  },
  { key: 'service', label: 'Service (code or name)', required: true, aliases: ['service', 'service code'] },
  { key: 'origin', label: 'Origin', aliases: ['origin', 'from', 'pol'] },
  { key: 'destination', label: 'Destination', aliases: ['destination', 'to', 'pod'] },
  { key: 'unit', label: 'Unit', aliases: ['unit', 'uom'] },
  { key: 'price', label: 'Price', required: true, type: 'number', aliases: ['price', 'rate', 'sell rate'] },
  { key: 'currency', label: 'Currency (default AED)', aliases: ['currency', 'ccy'] },
  { key: 'validFrom', label: 'Valid from', required: true, aliases: ['valid from', 'from date', 'start'] },
  { key: 'validTo', label: 'Valid to', required: true, aliases: ['valid to', 'to date', 'end', 'expiry'] },
];

const laneOf = (r: { origin?: string; destination?: string }) =>
  r.origin || r.destination ? `${r.origin || 'Any'} → ${r.destination || 'Any'}` : 'Any lane';

const columns = (
  onEdit: (r: SellingRateRow) => void,
  onExpire: (r: SellingRateRow) => void,
  busyId?: string,
): Column<SellingRateRow>[] => [
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) =>
      r.customerId ? (
        <span className="font-medium">{r.customerName}</span>
      ) : (
        <span className="text-fg-secondary">Standard price list</span>
      ),
  },
  { key: 'service', header: 'Service', cell: (r) => r.serviceName },
  { key: 'lane', header: 'Lane', cell: (r) => <span className="whitespace-nowrap">{laneOf(r)}</span> },
  { key: 'unit', header: 'Unit', hideOnMobile: true, cell: (r) => r.unit },
  {
    key: 'price',
    header: 'Selling price',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{formatInCurrency(r.price, r.currency)}</span>,
  },
  {
    key: 'valid',
    header: 'Validity',
    hideOnMobile: true,
    cell: (r) => (
      <span className="whitespace-nowrap text-caption text-fg-muted">{`${formatDate(r.validFrom)} – ${formatDate(r.validTo)}`}</span>
    ),
  },
  { key: 'status', header: 'Status', cell: (r) => <RateStatusBadge status={r.status} /> },
  {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    align: 'right',
    cell: (r) => (
      <span className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={<PencilLine aria-hidden="true" />}
          aria-label={`Edit selling rate of ${r.customerName} for ${r.serviceName}`}
          onClick={() => onEdit(r)}
        >
          Edit
        </Button>
        {r.status !== 'Expired' ? (
          <Button
            variant="ghost"
            size="sm"
            busy={busyId === r.id}
            icon={<CalendarX aria-hidden="true" />}
            aria-label={`Expire selling rate of ${r.customerName} for ${r.serviceName}`}
            onClick={() => onExpire(r)}
          >
            Expire
          </Button>
        ) : null}
      </span>
    ),
  },
];

export function SellingRatesTab({
  customerId,
  onCustomerChange,
}: {
  customerId?: string;
  onCustomerChange: (customerId: string) => void;
}) {
  const services = useServices();
  const customers = useCustomerOptions();
  const [serviceId, setServiceId] = useState('');
  const rates = useSellingRates({ serviceId: serviceId || undefined, customerId: customerId || undefined });
  const [editing, setEditing] = useState<SellingRateRow | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const expire = useExpireSellingRate();
  const importRates = useImportSellingRates();
  const toast = useToast();

  const onExpire = (r: SellingRateRow) =>
    expire.mutate(r.id, {
      onSuccess: (n) =>
        toast({
          title: 'Selling rate expired',
          body: `Valid until ${formatDate(n.validTo)} — no longer suggested on new quotations and orders.`,
        }),
      onError: (e) => toast({ title: 'Could not expire', body: e.message }),
    });

  return (
    <Card>
      <CardHeader
        title="Selling rates"
        description={`Customer prices and the standard price list. New quotations and orders use the customer’s rate first, then the price list, then cost + 20%. ${rates.data?.length ?? 0} rates.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<FileSpreadsheet aria-hidden="true" />}
              onClick={() => setImportOpen(true)}
            >
              Import from Excel
            </Button>
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setEditing('new')}>
              Add selling rate
            </Button>
          </div>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="selling-customer-filter">
          Filter by customer
        </label>
        <div className="w-full sm:w-64">
          <select
            id="selling-customer-filter"
            value={customerId ?? ''}
            onChange={(e) => onCustomerChange(e.target.value)}
            className={`${inputClasses} h-9`}
          >
            <option value="">All customers and price list</option>
            <option value="list">Standard price list only</option>
            {(customers.data ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label className="sr-only" htmlFor="selling-service-filter">
          Filter by service
        </label>
        <div className="w-full sm:w-56">
          <select
            id="selling-service-filter"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className={`${inputClasses} h-9`}
          >
            <option value="">All services</option>
            {(services.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {result ? <ImportResultNote result={result} onDismiss={() => setResult(null)} /> : null}
      <div className="mt-3">
        <DataTable
          caption="Selling rates"
          columns={columns(setEditing, onExpire, expire.isPending ? expire.variables : undefined)}
          rows={rates.data}
          rowKey={(r) => r.id}
          loading={rates.isLoading || rates.isFetching}
          error={rates.error}
          emptyTitle="No selling rates for this filter"
        />
      </div>
      {editing ? (
        <SellingRateDialog
          rate={editing === 'new' ? null : editing}
          defaultCustomerId={customerId && customerId !== 'list' ? customerId : ''}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import selling rates"
        description="One row per customer, service and lane. Leave the customer empty for the standard price list. Customers and services are matched by code or name."
        fields={SELLING_RATE_FIELDS}
        templateKey="RATES:selling"
        partyName="selling rates"
        onImport={(rows, file) =>
          importRates.mutate(
            { rows, fileName: file.name },
            {
              onSuccess: (r) => {
                setResult(r);
                toast({
                  title: `${r.added} selling rate(s) imported`,
                  body: r.skipped.length ? `${r.skipped.length} row(s) skipped — see the list.` : undefined,
                });
              },
              onError: (e) => toast({ title: 'Import failed', body: e.message }),
            },
          )
        }
      />
    </Card>
  );
}

type Form = {
  customerId: string;
  serviceId: string;
  origin: string;
  destination: string;
  unit: string;
  price: string;
  currency: Currency;
  validFrom: string;
  validTo: string;
};

function SellingRateDialog({
  rate,
  defaultCustomerId,
  onClose,
}: {
  rate: SellingRateRow | null;
  defaultCustomerId: string;
  onClose: () => void;
}) {
  const customers = useCustomerOptions();
  const services = useServices();
  const save = useSaveSellingRate();
  const toast = useToast();
  const [v, setV] = useState<Form>({
    customerId: rate ? (rate.customerId ?? '') : defaultCustomerId,
    serviceId: rate?.serviceId ?? '',
    origin: rate?.origin ?? '',
    destination: rate?.destination ?? '',
    unit: rate?.unit ?? '',
    price: rate ? String(rate.price) : '',
    currency: rate?.currency ?? 'AED',
    validFrom: rate?.validFrom ?? RATES_TODAY,
    validTo: rate?.validTo ?? `${RATES_TODAY.slice(0, 4)}-12-31`,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({});
  const set = (k: keyof Form, val: string) => setV((p) => ({ ...p, [k]: val }));
  const serviceOptions = (services.data ?? [])
    .filter((s) => s.isActive || s.id === rate?.serviceId)
    .map((s) => ({ value: s.id, label: s.name }));
  const currencies = activeCurrencies();
  const currencyOptions = (currencies.includes(v.currency) ? currencies : [...currencies, v.currency]).map(
    (c) => ({ value: c, label: c }),
  );
  const customerOptions = [
    { value: '', label: 'Standard price list (all customers)' },
    ...(customers.data ?? []),
  ];

  const submit = () => {
    const price = Number(v.price);
    const e: typeof errors = {};
    if (!v.serviceId) e.serviceId = 'Choose a service';
    if (!v.unit) e.unit = 'Choose a unit';
    if (!Number.isFinite(price) || price <= 0) e.price = 'Must be more than 0';
    if (!v.validFrom) e.validFrom = 'Required';
    if (!v.validTo) e.validTo = 'Required';
    else if (v.validFrom && v.validTo < v.validFrom) e.validTo = 'Must be on or after the start date';
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      {
        id: rate?.id,
        input: {
          customerId: v.customerId || undefined,
          serviceId: v.serviceId,
          origin: v.origin,
          destination: v.destination,
          unit: v.unit,
          price,
          currency: v.currency,
          validFrom: v.validFrom,
          validTo: v.validTo,
        },
      },
      {
        onSuccess: () => {
          toast({ title: rate ? 'Selling rate updated' : 'Selling rate added' });
          onClose();
        },
        onError: (err) => setErrors({ form: err.message }),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={rate ? 'Edit selling rate' : 'Add selling rate'}
      description="A customer’s own price, or a standard price-list price when no customer is chosen. Leave the lane empty for any lane."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Save rate
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Customer"
          options={customerOptions}
          value={v.customerId}
          onChange={(e) => set('customerId', e.target.value)}
        />
        <SelectField
          label="Service"
          required
          placeholder="Select service"
          options={serviceOptions}
          value={v.serviceId}
          error={errors.serviceId}
          onChange={(e) => {
            const unit = services.data?.find((s) => s.id === e.target.value)?.unit;
            setV((p) => ({ ...p, serviceId: e.target.value, unit: p.unit || unit || '' }));
          }}
        />
        <PlaceField
          label="Origin"
          hint="Optional"
          value={v.origin}
          onChange={(e) => set('origin', e.target.value)}
        />
        <PlaceField
          label="Destination"
          hint="Optional"
          value={v.destination}
          onChange={(e) => set('destination', e.target.value)}
        />
        <UnitSelect value={v.unit} error={errors.unit} onChange={(u) => set('unit', u)} />
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <TextField
            label="Price"
            inputMode="decimal"
            required
            value={v.price}
            error={errors.price}
            onChange={(e) => set('price', e.target.value)}
          />
          <SelectField
            label="Currency"
            options={currencyOptions}
            value={v.currency}
            onChange={(e) => set('currency', e.target.value)}
          />
        </div>
        <TextField
          label="Valid from"
          type="date"
          required
          value={v.validFrom}
          error={errors.validFrom}
          onChange={(e) => set('validFrom', e.target.value)}
        />
        <TextField
          label="Valid to"
          type="date"
          required
          value={v.validTo}
          error={errors.validTo}
          onChange={(e) => set('validTo', e.target.value)}
        />
        {errors.form ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {errors.form}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
