// ---- FLOW-003 WP-C ---- T7: own vehicle on a transport job (alternative to a vendor PO).
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Ban, Truck } from 'lucide-react';
import { useState } from 'react';
import { useAssignOwnVehicle, useFleetOptions } from '@/features/fleet/api';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY, type WorkOrderDetail } from './api';
import type { JobExtras } from './transport-api';
import { errorText } from './wpc-fields';

export function OwnVehicleCard({ wo, extras }: { wo: WorkOrderDetail; extras: JobExtras }) {
  const [open, setOpen] = useState(false);
  const canAssign = extras.fleetEnabled && ['Confirmed', 'In progress', 'In transit'].includes(wo.status);
  return (
    <Card>
      <CardHeader
        title="Own vehicle"
        description="Use your own truck and driver instead of a transporter PO"
        actions={
          canAssign ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Truck aria-hidden="true" />}
              onClick={() => setOpen(true)}
            >
              Assign own vehicle
            </Button>
          ) : null
        }
      />
      <CardBody>
        {!extras.fleetEnabled ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-body-s text-fg-muted">
            Own fleet module is off — enable it in{' '}
            <Link to="/settings" className="font-medium text-brand hover:underline">
              Settings
            </Link>
            .
          </p>
        ) : extras.trips.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
            No trip on this job. {wo.status === 'Draft' ? 'Confirm the job to assign a vehicle.' : null}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {extras.trips.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    to="/fleet/trips/$id"
                    params={{ id: t.id }}
                    className="font-mono font-medium text-brand hover:underline"
                  >
                    {t.number}
                  </Link>
                  <p className="text-caption text-fg-muted">
                    {formatDate(t.date)} · {t.vehiclePlate} · {t.driverName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Money amount={t.total} className="font-medium" />
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {open ? <AssignVehicleDialog wo={wo} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function AssignVehicleDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const [date, setDate] = useState(wo.eta >= PROTO_TODAY ? wo.eta : PROTO_TODAY);
  const { data } = useFleetOptions(date);
  const assign = useAssignOwnVehicle();
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [error, setError] = useState<string>();
  const vehicle = data?.vehicles.find((v) => v.value === vehicleId);
  const driver = data?.drivers.find((d) => d.value === driverId);
  const blocked = vehicle?.blockedReason ?? driver?.blockedReason;
  const save = () =>
    assign.mutate(
      { workOrderId: wo.id, vehicleId, driverId, date },
      {
        onSuccess: (t) => {
          toast({
            title: `${t.number} planned`,
            body: 'Start the trip from the fleet screen when it leaves.',
          });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  const label = (o: { label: string; blockedReason?: string }) =>
    o.blockedReason ? `${o.label} — cannot use: ${o.blockedReason}` : o.label;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Assign own vehicle to ${wo.number}`}
      description="Creates a planned trip. Fuel, Salik and allowances are charged to the job when the trip is completed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={assign.isPending} disabled={!!blocked} onClick={save}>
            Create trip
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
        <TextField
          label="Trip date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <SelectField
          label="Vehicle"
          required
          value={vehicleId}
          placeholder="Choose a vehicle"
          onChange={(e) => {
            setVehicleId(e.target.value);
            setError(undefined);
          }}
          options={(data?.vehicles ?? []).map((v) => ({ value: v.value, label: label(v) }))}
        />
        <SelectField
          label="Driver"
          required
          value={driverId}
          placeholder="Choose a driver"
          onChange={(e) => {
            setDriverId(e.target.value);
            setError(undefined);
          }}
          options={(data?.drivers ?? []).map((d) => ({ value: d.value, label: label(d) }))}
        />
        {blocked ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger"
          >
            <Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {blocked} — choose another {vehicle?.blockedReason ? 'vehicle' : 'driver'}.
          </p>
        ) : null}
        {[vehicle?.warning, driver?.warning].filter(Boolean).map((w) => (
          <p
            key={w}
            className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-body-s text-warning"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {w}
          </p>
        ))}
      </div>
    </Dialog>
  );
}
