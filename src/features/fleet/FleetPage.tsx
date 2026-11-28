import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, CheckCircle2, OctagonAlert, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Driver, Vehicle } from '@/domain/types';
import { expiryAlertText, type ExpiryAlert } from '@/domain/workflow';
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import {
  useFleet,
  useSaveDriver,
  useSaveVehicle,
  VEHICLE_TYPES,
  type DriverRow,
  type TripRow,
  type VehicleRow,
} from './api';

export type FleetTab = 'vehicles' | 'drivers' | 'trips';

const route = getRouteApi('/_app/fleet');

const fleetTone: Record<string, Tone> = {
  Available: 'success',
  'On trip': 'brand',
  Maintenance: 'warning',
  'Off duty': 'neutral',
  Planned: 'info',
  Started: 'brand',
};

export function FleetStatus({ status }: { status: string }) {
  return fleetTone[status] ? (
    <Badge tone={fleetTone[status]}>{status}</Badge>
  ) : (
    <StatusBadge status={status} />
  );
}

/** Expiry alerts with icon + text (never colour alone). */
export function ExpiryAlerts({ alerts }: { alerts: ExpiryAlert[] }) {
  if (!alerts.length)
    return (
      <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
        <CheckCircle2 aria-hidden="true" className="size-3.5 text-success" /> Valid
      </span>
    );
  return (
    <ul className="space-y-0.5">
      {alerts.map((a) => (
        <li
          key={a.document}
          className={`inline-flex items-center gap-1 text-caption font-medium ${a.level === 'Expired' ? 'text-danger' : 'text-warning'}`}
        >
          {a.level === 'Expired' ? (
            <OctagonAlert aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {expiryAlertText(a)}
        </li>
      ))}
    </ul>
  );
}

export function FleetPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/fleet' });
  const tab: FleetTab = search.tab ?? 'vehicles';
  const { data, isLoading, error } = useFleet();
  const [vehicle, setVehicle] = useState<VehicleRow | 'new' | null>(null);
  const [driver, setDriver] = useState<DriverRow | 'new' | null>(null);

  const header = (
    <PageHeader
      title="Fleet and trips"
      description="Own vehicles, drivers and trips. Fuel, Salik and allowances are charged to the job when a trip is completed."
      actions={
        data?.enabled ? (
          tab === 'drivers' ? (
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setDriver('new')}>
              Add driver
            </Button>
          ) : tab === 'vehicles' ? (
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setVehicle('new')}>
              Add vehicle
            </Button>
          ) : null
        ) : null
      }
    />
  );

  if (error)
    return (
      <div>
        {header}
        <StatusMessage kind="error" title="Could not load the fleet" description="Please retry." />
      </div>
    );
  if (isLoading || !data)
    return (
      <div>
        {header}
        <StatusMessage kind="loading" title="Loading fleet…" />
      </div>
    );
  if (!data.enabled)
    return (
      <div>
        {header}
        <StatusMessage
          kind="empty"
          title="Own fleet module is off — enable it in Settings"
          description="Turn on “Own fleet” in Settings to manage vehicles, drivers and trips. Until then, transport is done by vendors with purchase orders."
          action={
            <ButtonLink to="/settings" variant="secondary">
              Open Settings
            </ButtonLink>
          }
        />
      </div>
    );

  const alerts = [
    ...data.vehicles.flatMap((v) => v.alerts.map((a) => ({ who: v.plate, a }))),
    ...data.drivers.flatMap((d) => d.alerts.map((a) => ({ who: d.name, a }))),
  ].sort((x, y) => x.a.days - y.a.days);

  const vehicleCols: Column<VehicleRow>[] = [
    { key: 'plate', header: 'Plate', cell: (v) => <span className="font-mono font-medium">{v.plate}</span> },
    { key: 'type', header: 'Type', cell: (v) => v.type },
    {
      key: 'cap',
      header: 'Capacity',
      align: 'right',
      hideOnMobile: true,
      cell: (v) => `${formatNumber(v.capacityKg)} kg`,
    },
    {
      key: 'odo',
      header: 'Odometer',
      align: 'right',
      hideOnMobile: true,
      cell: (v) => `${formatNumber(v.odometerKm)} km`,
    },
    { key: 'reg', header: 'Registration', hideOnMobile: true, cell: (v) => formatDate(v.registrationExpiry) },
    { key: 'ins', header: 'Insurance', hideOnMobile: true, cell: (v) => formatDate(v.insuranceExpiry) },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => (
        <div className="space-y-1">
          <FleetStatus status={v.status} />
          {v.currentTrip ? <p className="text-caption text-fg-muted">{v.currentTrip}</p> : null}
        </div>
      ),
    },
    { key: 'alerts', header: 'Documents', cell: (v) => <ExpiryAlerts alerts={v.alerts} /> },
    {
      key: 'edit',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (v) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Edit ${v.plate}`}
          icon={<Pencil aria-hidden="true" />}
          onClick={() => setVehicle(v)}
        />
      ),
    },
  ];

  const driverCols: Column<DriverRow>[] = [
    { key: 'name', header: 'Driver', cell: (d) => <span className="font-medium">{d.name}</span> },
    { key: 'lic', header: 'Licence no.', cell: (d) => <span className="font-mono">{d.licenceNo}</span> },
    { key: 'exp', header: 'Licence expiry', hideOnMobile: true, cell: (d) => formatDate(d.licenceExpiry) },
    { key: 'phone', header: 'Phone', hideOnMobile: true, cell: (d) => d.phone },
    {
      key: 'status',
      header: 'Status',
      cell: (d) => (
        <div className="space-y-1">
          <FleetStatus status={d.status} />
          {d.currentTrip ? <p className="text-caption text-fg-muted">{d.currentTrip}</p> : null}
        </div>
      ),
    },
    { key: 'alerts', header: 'Licence', cell: (d) => <ExpiryAlerts alerts={d.alerts} /> },
    {
      key: 'edit',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (d) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Edit ${d.name}`}
          icon={<Pencil aria-hidden="true" />}
          onClick={() => setDriver(d)}
        />
      ),
    },
  ];

  const tripCols: Column<TripRow>[] = [
    {
      key: 'no',
      header: 'Trip',
      cell: (t) => (
        <Link
          to="/fleet/trips/$id"
          params={{ id: t.id }}
          className="font-mono font-medium text-brand hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {t.number}
        </Link>
      ),
    },
    { key: 'date', header: 'Date', cell: (t) => formatDate(t.date) },
    {
      key: 'job',
      header: 'Job',
      cell: (t) => (
        <div>
          <span className="font-mono">{t.jobNumber}</span>
          <p className="text-caption text-fg-muted">{t.customerName}</p>
        </div>
      ),
    },
    {
      key: 'veh',
      header: 'Vehicle / driver',
      hideOnMobile: true,
      cell: (t) => (
        <div>
          <span className="font-mono">{t.vehiclePlate}</span>
          <p className="text-caption text-fg-muted">{t.driverName}</p>
        </div>
      ),
    },
    {
      key: 'km',
      header: 'Distance',
      align: 'right',
      hideOnMobile: true,
      cell: (t) => (t.distanceKm !== undefined ? `${formatNumber(t.distanceKm)} km` : '—'),
    },
    { key: 'cost', header: 'Expenses', align: 'right', cell: (t) => <Money amount={t.total} /> },
    { key: 'status', header: 'Status', cell: (t) => <FleetStatus status={t.status} /> },
  ];

  return (
    <div>
      {header}
      {alerts.length ? (
        <div
          role="status"
          className="mb-6 rounded-xl border border-warning/30 bg-warning-subtle p-4 text-warning"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {alerts.length} document{alerts.length === 1 ? '' : 's'} expired or expiring within 30 days
          </p>
          <ul className="mt-2 grid gap-1 text-body-s sm:grid-cols-2">
            {alerts.map(({ who, a }) => (
              <li key={`${who}-${a.document}`}>
                <span className="font-medium">{who}</span>: {expiryAlertText(a)}{' '}
                {a.level === 'Expired' ? '(blocked for trips)' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            label="Fleet sections"
            value={tab}
            onChange={(v) => void navigate({ search: (p) => ({ ...p, tab: v as FleetTab }) })}
            items={[
              { value: 'vehicles', label: 'Vehicles', count: data.vehicles.length },
              { value: 'drivers', label: 'Drivers', count: data.drivers.length },
              { value: 'trips', label: 'Trips', count: data.trips.length },
            ]}
          />
        </div>
        {tab === 'vehicles' ? (
          <DataTable caption="Vehicles" columns={vehicleCols} rows={data.vehicles} rowKey={(v) => v.id} />
        ) : tab === 'drivers' ? (
          <DataTable caption="Drivers" columns={driverCols} rows={data.drivers} rowKey={(d) => d.id} />
        ) : (
          <DataTable
            caption="Trips"
            columns={tripCols}
            rows={data.trips}
            rowKey={(t) => t.id}
            onRowClick={(t) => void navigate({ to: '/fleet/trips/$id', params: { id: t.id } })}
            emptyTitle="No trips yet"
            emptyDescription="Assign an own vehicle from a transport job to create a trip."
          />
        )}
      </Card>
      {tab === 'trips' && data.trips.length ? (
        <p className="mt-2 text-caption text-fg-muted">Select a trip to open it.</p>
      ) : null}

      {vehicle ? (
        <VehicleDialog vehicle={vehicle === 'new' ? undefined : vehicle} onClose={() => setVehicle(null)} />
      ) : null}
      {driver ? (
        <DriverDialog driver={driver === 'new' ? undefined : driver} onClose={() => setDriver(null)} />
      ) : null}
    </div>
  );
}

function VehicleDialog({ vehicle, onClose }: { vehicle?: VehicleRow; onClose: () => void }) {
  const save = useSaveVehicle();
  const toast = useToast();
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [type, setType] = useState<Vehicle['type']>(vehicle?.type ?? '3-ton truck');
  const [capacityKg, setCapacityKg] = useState(String(vehicle?.capacityKg ?? 3000));
  const [odometerKm, setOdometerKm] = useState(String(vehicle?.odometerKm ?? 0));
  const [registrationExpiry, setRegistrationExpiry] = useState(vehicle?.registrationExpiry ?? '');
  const [insuranceExpiry, setInsuranceExpiry] = useState(vehicle?.insuranceExpiry ?? '');
  const [status, setStatus] = useState<Vehicle['status']>(vehicle?.status ?? 'Available');
  const [error, setError] = useState<string>();
  const submit = () => {
    if (!registrationExpiry || !insuranceExpiry) {
      setError('Enter the registration and insurance expiry dates');
      return;
    }
    save.mutate(
      {
        id: vehicle?.id,
        plate,
        type,
        capacityKg: Number(capacityKg) || 0,
        odometerKm: Number(odometerKm) || 0,
        registrationExpiry,
        insuranceExpiry,
        status,
      },
      {
        onSuccess: (v) => {
          toast({ title: vehicle ? `${v.plate} updated` : `${v.plate} added` });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Please try again.'),
      },
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.plate}` : 'Add vehicle'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Save vehicle
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Plate number"
            required
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="e.g. DXB K 12345"
          />
          <SelectField
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as Vehicle['type'])}
            options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <TextField
            label="Capacity (kg)"
            type="number"
            min={0}
            value={capacityKg}
            onChange={(e) => setCapacityKg(e.target.value)}
          />
          <TextField
            label="Odometer (km)"
            type="number"
            min={0}
            value={odometerKm}
            onChange={(e) => setOdometerKm(e.target.value)}
          />
          <TextField
            label="Registration expiry"
            type="date"
            required
            value={registrationExpiry}
            onChange={(e) => setRegistrationExpiry(e.target.value)}
          />
          <TextField
            label="Insurance expiry"
            type="date"
            required
            value={insuranceExpiry}
            onChange={(e) => setInsuranceExpiry(e.target.value)}
          />
          <SelectField
            label="Status"
            value={status}
            disabled={!!vehicle?.currentTrip}
            hint={vehicle?.currentTrip ? 'Follows the trip — changes when the trip ends.' : undefined}
            onChange={(e) => setStatus(e.target.value as Vehicle['status'])}
            options={[
              ...(vehicle?.status === 'On trip' ? (['On trip'] as const) : []),
              ...(vehicle?.currentTrip ? [] : (['Available', 'Maintenance', 'Inactive'] as const)),
            ].map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>
    </Dialog>
  );
}

function DriverDialog({ driver, onClose }: { driver?: DriverRow; onClose: () => void }) {
  const save = useSaveDriver();
  const toast = useToast();
  const [name, setName] = useState(driver?.name ?? '');
  const [licenceNo, setLicenceNo] = useState(driver?.licenceNo ?? '');
  const [licenceExpiry, setLicenceExpiry] = useState(driver?.licenceExpiry ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [status, setStatus] = useState<Driver['status']>(driver?.status ?? 'Available');
  const [error, setError] = useState<string>();
  const submit = () => {
    if (!licenceExpiry) {
      setError('Enter the licence expiry date');
      return;
    }
    save.mutate(
      { id: driver?.id, name, licenceNo, licenceExpiry, phone, status },
      {
        onSuccess: (d) => {
          toast({ title: driver ? `${d.name} updated` : `${d.name} added` });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Please try again.'),
      },
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={driver ? `Edit ${driver.name}` : 'Add driver'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={submit}>
            Save driver
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField
            label="Licence number"
            required
            value={licenceNo}
            onChange={(e) => setLicenceNo(e.target.value)}
          />
          <TextField
            label="Licence expiry"
            type="date"
            required
            value={licenceExpiry}
            onChange={(e) => setLicenceExpiry(e.target.value)}
          />
          <SelectField
            label="Status"
            value={status}
            disabled={!!driver?.currentTrip}
            hint={driver?.currentTrip ? 'Follows the trip — changes when the trip ends.' : undefined}
            onChange={(e) => setStatus(e.target.value as Driver['status'])}
            options={[
              ...(driver?.status === 'On trip' ? (['On trip'] as const) : []),
              ...(driver?.currentTrip ? [] : (['Available', 'Off duty'] as const)),
            ].map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>
    </Dialog>
  );
}
