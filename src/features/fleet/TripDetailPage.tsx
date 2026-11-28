import { getRouteApi, Link } from '@tanstack/react-router';
import { CheckCircle2, Flag, Play, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { TripExpenseType } from '@/domain/types';
import { tripCostTotals } from '@/domain/workflow';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import {
  TRIP_ACCOUNTS,
  TRIP_EXPENSE_TYPES,
  useTrip,
  useTripAction,
  type PaidFrom,
  type TripDetail,
} from './api';
import { ExpiryAlerts, FleetStatus } from './FleetPage';

const route = getRouteApi('/_app/fleet/trips/$id');

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

export function TripDetailPage() {
  const { id } = route.useParams();
  const { data: trip, isLoading, error } = useTrip(id);
  const action = useTripAction();
  const toast = useToast();
  const [dialog, setDialog] = useState<'start' | 'expense' | 'complete' | 'cancel' | null>(null);

  if (error)
    return <StatusMessage kind="error" title="Trip not found" description="It may have been removed." />;
  if (isLoading || !trip) return <StatusMessage kind="loading" title="Loading trip…" />;

  const open = trip.status === 'Planned' || trip.status === 'Started';
  const byType = tripCostTotals(trip.expenses).byType;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Fleet and trips', to: '/fleet' }, { label: trip.number }]}
        title={trip.number}
        meta={<FleetStatus status={trip.status} />}
        description={`${trip.vehiclePlate} · ${trip.driverName} · ${formatDate(trip.date)}`}
        actions={
          <>
            {open ? (
              <Button
                variant="ghost"
                icon={<XCircle aria-hidden="true" />}
                onClick={() => setDialog('cancel')}
              >
                Cancel trip
              </Button>
            ) : null}
            {trip.status === 'Planned' ? (
              <Button icon={<Play aria-hidden="true" />} onClick={() => setDialog('start')}>
                Start trip
              </Button>
            ) : null}
            {trip.status === 'Started' ? (
              <Button icon={<Flag aria-hidden="true" />} onClick={() => setDialog('complete')}>
                Complete trip
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Trip" />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Job',
                    value: (
                      <Link
                        to="/work-orders/$id"
                        params={{ id: trip.workOrderId }}
                        className="font-mono font-medium text-brand hover:underline"
                      >
                        {trip.jobNumber}
                      </Link>
                    ),
                  },
                  { label: 'Customer', value: trip.customerName },
                  { label: 'Date', value: formatDate(trip.date) },
                  {
                    label: 'Start km',
                    value: trip.startKm !== undefined ? formatNumber(trip.startKm) : '—',
                  },
                  { label: 'End km', value: trip.endKm !== undefined ? formatNumber(trip.endKm) : '—' },
                  {
                    label: 'Distance',
                    value: trip.distanceKm !== undefined ? `${formatNumber(trip.distanceKm)} km` : '—',
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Expenses"
              description="Charged to the job as internal cost when the trip is completed"
              actions={
                open ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus aria-hidden="true" />}
                    onClick={() => setDialog('expense')}
                  >
                    Add expense
                  </Button>
                ) : null
              }
            />
            <CardBody>
              {trip.expenses.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
                  No expense yet — add fuel, Salik, driver allowance or parking.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {trip.expenses.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="font-medium">{e.type}</p>
                        {e.reference ? (
                          <p className="text-caption text-fg-muted">Ref. {e.reference}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Money amount={e.amount} className="font-medium" />
                        {open ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${e.type} ${e.amount}`}
                            icon={<Trash2 aria-hidden="true" />}
                            onClick={() =>
                              action.mutate(
                                { kind: 'removeExpense', id: trip.id, expenseId: e.id },
                                { onError: (err) => toast({ title: 'Not removed', body: errText(err) }) },
                              )
                            }
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                  <li className="flex justify-between py-2.5 font-semibold">
                    <span>Total</span>
                    <Money amount={trip.total} />
                  </li>
                </ul>
              )}
            </CardBody>
          </Card>

          {trip.journal ? (
            <Card>
              <CardHeader
                title="Journal"
                description={`${trip.journal.number} · ${formatDate(trip.journal.date)} · source Trip`}
              />
              <CardBody>
                <table className="w-full text-left text-body-s">
                  <caption className="sr-only">Journal lines</caption>
                  <thead>
                    <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="py-2 font-medium">
                        Account
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Debit
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Credit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trip.journal.lines.map((l) => (
                      <tr key={l.account} className="border-b border-border-subtle last:border-0">
                        <td className="py-2">{l.account}</td>
                        <td className="py-2 text-right">{l.debit ? <Money amount={l.debit} /> : '—'}</td>
                        <td className="py-2 text-right">{l.credit ? <Money amount={l.credit} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Vehicle" />
            <CardBody className="space-y-2 text-body-s">
              <p className="font-mono font-medium">{trip.vehiclePlate}</p>
              {trip.vehicle ? (
                <>
                  <p className="text-fg-muted">
                    {trip.vehicle.type} · odometer {formatNumber(trip.vehicle.odometerKm)} km
                  </p>
                  <FleetStatus status={trip.vehicle.status} />
                  <ExpiryAlerts alerts={trip.vehicle.alerts} />
                </>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Driver" />
            <CardBody className="space-y-2 text-body-s">
              <p className="font-medium">{trip.driverName}</p>
              {trip.driver ? (
                <>
                  <p className="text-fg-muted">
                    Licence <span className="font-mono">{trip.driver.licenceNo}</span> · {trip.driver.phone}
                  </p>
                  <FleetStatus status={trip.driver.status} />
                  <ExpiryAlerts alerts={trip.driver.alerts} />
                </>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cost by type" />
            <CardBody>
              {Object.keys(byType).length ? (
                <dl className="space-y-2 text-body-s">
                  {Object.entries(byType).map(([type, amount]) => (
                    <div key={type} className="flex justify-between">
                      <dt className="text-fg-muted">{type}</dt>
                      <dd>
                        <Money amount={amount} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-body-s text-fg-muted">No cost yet.</p>
              )}
              {trip.status === 'Completed' ? (
                <p className="mt-3 flex items-center gap-1.5 text-caption text-success">
                  <CheckCircle2 aria-hidden="true" className="size-3.5" /> Charged to {trip.jobNumber}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {dialog === 'start' ? <StartDialog trip={trip} onClose={() => setDialog(null)} /> : null}
      {dialog === 'expense' ? <ExpenseDialog trip={trip} onClose={() => setDialog(null)} /> : null}
      {dialog === 'complete' ? <CompleteDialog trip={trip} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? (
        <Dialog
          open
          onClose={() => setDialog(null)}
          title={`Cancel ${trip.number}?`}
          description="The vehicle and driver become available again. No cost is charged to the job."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Keep trip
              </Button>
              <Button
                variant="danger"
                busy={action.isPending}
                onClick={() =>
                  action.mutate(
                    { kind: 'cancel', id: trip.id },
                    {
                      onSuccess: () => {
                        toast({ title: `${trip.number} cancelled` });
                        setDialog(null);
                      },
                      onError: (e) => toast({ title: 'Not cancelled', body: errText(e) }),
                    },
                  )
                }
              >
                Cancel trip
              </Button>
            </>
          }
        >
          <p className="text-body-s text-fg-muted">
            {trip.expenses.length
              ? 'Recorded expenses stay on the trip but are not posted.'
              : 'Nothing recorded yet.'}
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}

function ErrorLine({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
      {error}
    </p>
  ) : null;
}

function StartDialog({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const action = useTripAction();
  const toast = useToast();
  const [km, setKm] = useState(String(trip.vehicle?.odometerKm ?? 0));
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Start ${trip.number}`}
      description="The vehicle and driver show as On trip until the trip ends."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={action.isPending}
            onClick={() =>
              action.mutate(
                { kind: 'start', id: trip.id, startKm: Number(km) },
                {
                  onSuccess: () => {
                    toast({ title: `${trip.number} started` });
                    onClose();
                  },
                  onError: (e) => setError(errText(e)),
                },
              )
            }
          >
            Start trip
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorLine error={error} />
        <TextField
          label="Start km (odometer)"
          type="number"
          min={0}
          required
          value={km}
          onChange={(e) => setKm(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

function ExpenseDialog({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const action = useTripAction();
  const toast = useToast();
  const [type, setType] = useState<TripExpenseType>('Fuel');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add trip expense"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={action.isPending}
            onClick={() =>
              action.mutate(
                { kind: 'expense', id: trip.id, type, amount: Number(amount), reference },
                {
                  onSuccess: () => {
                    toast({ title: `${type} added` });
                    onClose();
                  },
                  onError: (e) => setError(errText(e)),
                },
              )
            }
          >
            Add expense
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorLine error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as TripExpenseType)}
            options={TRIP_EXPENSE_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <TextField
            label="Amount (AED)"
            type="number"
            min={0}
            step="any"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <TextField
          label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. fuel receipt no."
        />
      </div>
    </Dialog>
  );
}

function CompleteDialog({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const action = useTripAction();
  const toast = useToast();
  const [km, setKm] = useState(String(trip.startKm ?? 0));
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('Petty cash');
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Complete ${trip.number}`}
      description="Expenses are charged to the job and posted to the ledger. The vehicle and driver become available."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not yet
          </Button>
          <Button
            busy={action.isPending}
            icon={<CheckCircle2 aria-hidden="true" />}
            onClick={() =>
              action.mutate(
                { kind: 'complete', id: trip.id, endKm: Number(km), paidFrom },
                {
                  onSuccess: () => {
                    toast({
                      title: `${trip.number} completed`,
                      body: trip.total ? `Cost charged to ${trip.jobNumber} and journal posted.` : undefined,
                    });
                    onClose();
                  },
                  onError: (e) => setError(errText(e)),
                },
              )
            }
          >
            Complete trip
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorLine error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="End km (odometer)"
            type="number"
            min={0}
            required
            value={km}
            onChange={(e) => setKm(e.target.value)}
            hint={`Start km ${trip.startKm ?? 0}`}
          />
          <SelectField
            label="Expenses paid from"
            value={paidFrom}
            onChange={(e) => setPaidFrom(e.target.value as PaidFrom)}
            options={[
              { value: 'Petty cash', label: TRIP_ACCOUNTS.pettyCash },
              { value: 'Bank', label: TRIP_ACCOUNTS.bank },
            ]}
          />
        </div>
        <div className="rounded-lg bg-canvas p-3 text-body-s">
          <p className="font-medium">Journal to post ({formatDate(trip.date)})</p>
          {trip.total ? (
            <ul className="mt-1 space-y-0.5 text-fg-secondary">
              <li>
                Dr {TRIP_ACCOUNTS.cost} <Money amount={trip.total} />
              </li>
              <li>
                Cr {paidFrom === 'Bank' ? TRIP_ACCOUNTS.bank : TRIP_ACCOUNTS.pettyCash}{' '}
                <Money amount={trip.total} />
              </li>
            </ul>
          ) : (
            <p className="mt-1 text-fg-muted">No expenses — nothing is posted.</p>
          )}
          <p className="mt-2 text-caption text-fg-muted">
            Account codes are illustrative and pending accountant sign-off. <DocRef>{trip.number}</DocRef>
          </p>
        </div>
      </div>
    </Dialog>
  );
}
