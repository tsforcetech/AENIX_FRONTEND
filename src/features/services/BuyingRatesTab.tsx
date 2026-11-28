import { CalendarX, FileSpreadsheet, PencilLine, Plus } from 'lucide-react';
import { useState } from 'react';
import { PlaceField } from '@/features/sales-orders/master-fields';
import { useVendorOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { SpreadsheetImport, type ImportField } from '@/shared/ui/SpreadsheetImport';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import {
  RATES_TODAY,
  useExpireRate,
  useImportRates,
  useRates,
  useSaveRate,
  useServices,
  type ImportResult,
  type RateInput,
  type RateRow,
} from './api';
import { ImportResultNote, RateStatusBadge, UnitSelect } from './rate-ui';

export const BUYING_RATE_FIELDS: ImportField[] = [
  {
    key: 'vendor',
    label: 'Vendor (code or name)',
    required: true,
    aliases: ['vendor', 'supplier', 'carrier'],
  },
  { key: 'service', label: 'Service (code or name)', required: true, aliases: ['service', 'service code'] },
  { key: 'origin', label: 'Origin', required: true, aliases: ['origin', 'from', 'pol'] },
  { key: 'destination', label: 'Destination', required: true, aliases: ['destination', 'to', 'pod'] },
  { key: 'unit', label: 'Unit', aliases: ['unit', 'uom'] },
  { key: 'rate', label: 'Rate (AED)', required: true, type: 'number', aliases: ['rate', 'cost', 'buy rate'] },
  { key: 'validFrom', label: 'Valid from', required: true, aliases: ['valid from', 'from date', 'start'] },
  { key: 'validTo', label: 'Valid to', required: true, aliases: ['valid to', 'to date', 'end', 'expiry'] },
];

const columns = (
  onEdit: (r: RateRow) => void,
  onExpire: (r: RateRow) => void,
  busyId?: string,
): Column<RateRow>[] => [
  { key: 'vendor', header: 'Vendor', cell: (r) => <span className="font-medium">{r.vendorName}</span> },
  { key: 'service', header: 'Service', cell: (r) => r.serviceName },
  {
    key: 'lane',
    header: 'Lane',
    cell: (r) => <span className="whitespace-nowrap">{`${r.origin} → ${r.destination}`}</span>,
  },
  { key: 'unit', header: 'Unit', hideOnMobile: true, cell: (r) => r.unit },
  { key: 'rate', header: 'Buy rate', align: 'right', cell: (r) => <Money amount={r.rate} /> },
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
          aria-label={`Edit rate of ${r.vendorName} for ${r.serviceName}`}
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
            aria-label={`Expire rate of ${r.vendorName} for ${r.serviceName}`}
            onClick={() => onExpire(r)}
          >
            Expire
          </Button>
        ) : null}
      </span>
    ),
  },
];

export function BuyingRatesTab({
  vendorId,
  onVendorChange,
}: {
  vendorId?: string;
  onVendorChange: (vendorId: string) => void;
}) {
  const services = useServices();
  const vendorOptions = useVendorOptions();
  const [serviceId, setServiceId] = useState('');
  const rates = useRates({ serviceId: serviceId || undefined, vendorId: vendorId || undefined });
  const [editing, setEditing] = useState<RateRow | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const expire = useExpireRate();
  const importRates = useImportRates();
  const toast = useToast();

  const onExpire = (r: RateRow) =>
    expire.mutate(r.id, {
      onSuccess: (n) =>
        toast({
          title: 'Rate expired',
          body: `Valid until ${formatDate(n.validTo)} — no longer used for new costs.`,
        }),
      onError: (e) => toast({ title: 'Could not expire', body: e.message }),
    });

  return (
    <Card>
      <CardHeader
        title="Buying rates"
        description={`What vendors charge us — used for job costs and the cost + 20% price. ${rates.data?.length ?? 0} rates.`}
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
              Add buying rate
            </Button>
          </div>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="rate-service-filter">
          Filter by service
        </label>
        <div className="w-full sm:w-56">
          <select
            id="rate-service-filter"
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
        <label className="sr-only" htmlFor="rate-vendor-filter">
          Filter by vendor
        </label>
        <div className="w-full sm:w-64">
          <select
            id="rate-vendor-filter"
            value={vendorId ?? ''}
            onChange={(e) => onVendorChange(e.target.value)}
            className={`${inputClasses} h-9`}
          >
            <option value="">All vendors</option>
            {(vendorOptions.data ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {result ? <ImportResultNote result={result} onDismiss={() => setResult(null)} /> : null}
      <div className="mt-3">
        <DataTable
          caption="Buying rates"
          columns={columns(setEditing, onExpire, expire.isPending ? expire.variables : undefined)}
          rows={rates.data}
          rowKey={(r) => r.id}
          loading={rates.isLoading || rates.isFetching}
          error={rates.error}
          emptyTitle="No rates for this filter"
        />
      </div>
      {editing ? (
        <BuyingRateDialog
          rate={editing === 'new' ? null : editing}
          defaultVendorId={vendorId}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import buying rates"
        description="One row per vendor, service and lane. Vendors and services are matched by code or name. Dates as YYYY-MM-DD or DD/MM/YYYY."
        fields={BUYING_RATE_FIELDS}
        templateKey="RATES:buying"
        partyName="buying rates"
        onImport={(rows, file) =>
          importRates.mutate(
            { rows, fileName: file.name },
            {
              onSuccess: (r) => {
                setResult(r);
                toast({
                  title: `${r.added} buying rate(s) imported`,
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

type Errors = Partial<Record<keyof RateInput | 'form', string>>;

function BuyingRateDialog({
  rate,
  defaultVendorId,
  onClose,
}: {
  rate: RateRow | null;
  defaultVendorId?: string;
  onClose: () => void;
}) {
  const vendors = useVendorOptions();
  const services = useServices();
  const save = useSaveRate();
  const toast = useToast();
  const [v, setV] = useState({
    vendorId: rate?.vendorId ?? defaultVendorId ?? '',
    serviceId: rate?.serviceId ?? '',
    origin: rate?.origin ?? '',
    destination: rate?.destination ?? '',
    unit: rate?.unit ?? '',
    rate: rate ? String(rate.rate) : '',
    validFrom: rate?.validFrom ?? RATES_TODAY,
    validTo: rate?.validTo ?? `${RATES_TODAY.slice(0, 4)}-12-31`,
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const serviceOptions = (services.data ?? [])
    .filter((s) => s.isActive || s.id === rate?.serviceId)
    .map((s) => ({ value: s.id, label: s.name }));

  const submit = () => {
    const amount = Number(v.rate);
    const e: Errors = {};
    if (!v.vendorId) e.vendorId = 'Choose a vendor';
    if (!v.serviceId) e.serviceId = 'Choose a service';
    if (v.origin.trim().length < 2) e.origin = 'Enter origin';
    if (v.destination.trim().length < 2) e.destination = 'Enter destination';
    if (!v.unit) e.unit = 'Choose a unit';
    if (!Number.isFinite(amount) || amount <= 0) e.rate = 'Must be more than 0';
    if (!v.validFrom) e.validFrom = 'Required';
    if (!v.validTo) e.validTo = 'Required';
    else if (v.validFrom && v.validTo < v.validFrom) e.validTo = 'Must be on or after the start date';
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      {
        id: rate?.id,
        input: {
          vendorId: v.vendorId,
          serviceId: v.serviceId,
          origin: v.origin.trim(),
          destination: v.destination.trim(),
          unit: v.unit,
          rate: amount,
          validFrom: v.validFrom,
          validTo: v.validTo,
        },
      },
      {
        onSuccess: () => {
          toast({ title: rate ? 'Rate updated' : 'Rate added', body: `${v.origin} → ${v.destination}` });
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
      title={rate ? 'Edit buying rate' : 'Add buying rate'}
      description="What a vendor charges us for a service on a lane."
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
          label="Vendor"
          required
          placeholder="Select vendor"
          options={vendors.data ?? []}
          value={v.vendorId}
          error={errors.vendorId}
          onChange={(e) => set('vendorId', e.target.value)}
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
          required
          value={v.origin}
          error={errors.origin}
          onChange={(e) => set('origin', e.target.value)}
        />
        <PlaceField
          label="Destination"
          required
          value={v.destination}
          error={errors.destination}
          onChange={(e) => set('destination', e.target.value)}
        />
        <UnitSelect value={v.unit} error={errors.unit} onChange={(u) => set('unit', u)} />
        <TextField
          label="Buy rate (AED)"
          inputMode="decimal"
          required
          value={v.rate}
          error={errors.rate}
          onChange={(e) => set('rate', e.target.value)}
        />
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
