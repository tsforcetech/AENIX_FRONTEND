import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Service } from '@/domain/types';
import { useServiceOptions, useVendorOptions } from '@/shared/data/lookups';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { useAddRate, useRates, useServices, type RateRow } from './api';

const serviceColumns: Column<Service>[] = [
  { key: 'code', header: 'Code', cell: (s) => <DocRef>{s.code}</DocRef> },
  { key: 'name', header: 'Service', cell: (s) => <span className="font-medium">{s.name}</span> },
  {
    key: 'mode',
    header: 'Mode',
    cell: (s) => (
      <Badge tone="neutral" dot={false}>
        {s.mode}
      </Badge>
    ),
  },
  { key: 'unit', header: 'Unit', cell: (s) => s.unit },
  {
    key: 'desc',
    header: 'Description',
    hideOnMobile: true,
    cell: (s) => <span className="text-fg-muted">{s.description}</span>,
  },
];

const rateColumns: Column<RateRow>[] = [
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
];

export function ServicesPage() {
  const services = useServices();
  const serviceOptions = useServiceOptions();
  const vendorOptions = useVendorOptions();
  const [serviceId, setServiceId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const rates = useRates({ serviceId: serviceId || undefined, vendorId: vendorId || undefined });
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services & rates"
        description="What AENIX sells, and what each vendor charges for it. Buy rates feed job costing and quotation margins."
        actions={
          <Button icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add rate
          </Button>
        }
      />
      <Card>
        <CardHeader title="Service catalogue" description={`${services.data?.length ?? 0} services`} />
        <div className="mt-3">
          <DataTable
            caption="Service catalogue"
            columns={serviceColumns}
            rows={services.data}
            rowKey={(s) => s.id}
            loading={services.isLoading}
            error={services.error}
          />
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Vendor rates"
          description={`${rates.data?.length ?? 0} rates`}
          actions={
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="rate-service-filter">
                Filter by service
              </label>
              <div className="w-full sm:w-52">
                <select
                  id="rate-service-filter"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className={`${inputClasses} h-9`}
                >
                  <option value="">All services</option>
                  {(serviceOptions.data ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
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
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
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
          }
        />
        <div className="mt-3">
          <DataTable
            caption="Vendor rates"
            columns={rateColumns}
            rows={rates.data}
            rowKey={(r) => r.id}
            loading={rates.isLoading || rates.isFetching}
            error={rates.error}
            emptyTitle="No rates for this filter"
          />
        </div>
      </Card>
      <AddRateDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

const rateSchema = z
  .object({
    vendorId: z.string().min(1, 'Choose a vendor'),
    serviceId: z.string().min(1, 'Choose a service'),
    origin: z.string().trim().min(2, 'Enter origin').max(60),
    destination: z.string().trim().min(2, 'Enter destination').max(60),
    unit: z.string().trim().min(1, 'Enter unit').max(30),
    rate: z.coerce.number().positive('Must be more than 0'),
    validFrom: z.string().min(1, 'Required'),
    validTo: z.string().min(1, 'Required'),
  })
  .refine((v) => v.validTo >= v.validFrom, {
    path: ['validTo'],
    message: 'Must be on or after the start date',
  });
type RateFormIn = z.input<typeof rateSchema>;
type RateFormOut = z.output<typeof rateSchema>;

function AddRateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vendors = useVendorOptions();
  const services = useServiceOptions();
  const add = useAddRate();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<RateFormIn, unknown, RateFormOut>({
    resolver: zodResolver(rateSchema),
    defaultValues: { validFrom: '2027-01-01', validTo: '2027-12-31' },
  });

  const close = () => {
    reset();
    onClose();
  };
  const onSubmit = handleSubmit(async (v) => {
    await add.mutateAsync(v);
    toast({ title: 'Rate added', body: `${v.origin} → ${v.destination}` });
    close();
  });
  const serviceField = register('serviceId');

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add vendor rate"
      description="Buy rate for a vendor, service and lane."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="add-rate-form" busy={add.isPending}>
            Save rate
          </Button>
        </>
      }
    >
      <form id="add-rate-form" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Vendor"
          required
          placeholder="Select vendor"
          options={vendors.data ?? []}
          error={errors.vendorId?.message}
          {...register('vendorId')}
        />
        <SelectField
          label="Service"
          required
          placeholder="Select service"
          options={services.data ?? []}
          error={errors.serviceId?.message}
          {...serviceField}
          onChange={(e) => {
            void serviceField.onChange(e);
            const unit = services.data?.find((s) => s.value === e.target.value)?.unit;
            if (unit) setValue('unit', unit);
          }}
        />
        <TextField label="Origin" required error={errors.origin?.message} {...register('origin')} />
        <TextField
          label="Destination"
          required
          error={errors.destination?.message}
          {...register('destination')}
        />
        <TextField label="Unit" required error={errors.unit?.message} {...register('unit')} />
        <TextField
          label="Buy rate (AED)"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          error={errors.rate?.message}
          {...register('rate')}
        />
        <TextField
          label="Valid from"
          type="date"
          required
          error={errors.validFrom?.message}
          {...register('validFrom')}
        />
        <TextField
          label="Valid to"
          type="date"
          required
          error={errors.validTo?.message}
          {...register('validTo')}
        />
      </form>
    </Dialog>
  );
}
