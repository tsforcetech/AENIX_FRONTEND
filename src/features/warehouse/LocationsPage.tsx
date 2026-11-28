import clsx from 'clsx';
import { MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import type { WarehouseLocation } from '@/domain/types';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { KpiCard } from '@/shared/ui/KpiCard';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatNumber } from '@/shared/utils/format';
import {
  LOCATION_ZONES,
  useFloorAction,
  useLocations,
  useWarehouseFloorEnabled,
  type LocationRow,
} from './api';

const crumbs = [{ label: 'Warehouse', to: '/warehouse' }, { label: 'Locations' }];

/** FLOW-003 W4 — bin locations with occupancy (pallets used vs capacity). */
export function LocationsPage() {
  const enabled = useWarehouseFloorEnabled();
  const { data, isLoading, error } = useLocations();
  const action = useFloorAction();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string>();
  const [newOpen, setNewOpen] = useState(false);

  if (!enabled)
    return (
      <div>
        <PageHeader crumbs={crumbs} title="Bin locations" />
        <StatusMessage
          kind="empty"
          title="Own warehouse floor is switched off"
          description="Bin locations, put-away, picking and cycle counts are used only when the company runs its own warehouse floor (Settings → modules)."
        />
      </div>
    );

  const active = data?.filter((l) => l.location.active) ?? [];
  const capacity = active.reduce((s, l) => s + l.location.capacityPallets, 0);
  const used = active.reduce((s, l) => s + l.used, 0);

  const columns: Column<LocationRow>[] = [
    {
      key: 'code',
      header: 'Location',
      cell: (r) => (
        <div>
          <span className="font-mono text-[13px] font-medium">{r.location.code}</span>
          <p className="text-caption text-fg-muted">{r.location.warehouse}</p>
        </div>
      ),
    },
    { key: 'zone', header: 'Zone', cell: (r) => r.location.zone },
    {
      key: 'occupancy',
      header: 'Occupancy',
      cell: (r) => (
        <div className="min-w-40">
          <p className="text-body-s tabular-nums">
            {formatNumber(r.used)} / {formatNumber(r.location.capacityPallets)} pallets
            <span className="ml-1 text-caption text-fg-muted">({r.pct}%)</span>
          </p>
          <div aria-hidden="true" className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={clsx(
                'h-full rounded-full',
                r.pct >= 100 ? 'bg-danger' : r.pct >= 85 ? 'bg-warning' : 'bg-brand',
              )}
              style={{ width: `${Math.min(100, r.pct)}%` }}
            />
          </div>
        </div>
      ),
    },
    { key: 'lots', header: 'Lots', align: 'right', hideOnMobile: true, cell: (r) => r.lots },
    {
      key: 'free',
      header: 'Free',
      align: 'right',
      cell: (r) =>
        r.pct >= 100 ? <Badge tone="danger">Full</Badge> : <span className="tabular-nums">{r.free}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.location.active ? 'Active' : 'Inactive'} />
          <Button
            size="sm"
            variant="ghost"
            busy={action.isPending && busyId === r.id}
            aria-label={`${r.location.active ? 'Deactivate' : 'Reactivate'} ${r.location.code}`}
            onClick={() => {
              setBusyId(r.id);
              action.mutate(
                { kind: 'setActive', id: r.id, active: !r.location.active },
                {
                  onSuccess: () =>
                    toast({
                      title: `${r.location.code} ${r.location.active ? 'deactivated' : 'reactivated'}`,
                    }),
                  onError: (e) =>
                    toast({
                      title: 'Not changed',
                      body: e instanceof Error ? e.message : 'Please try again.',
                    }),
                },
              );
            }}
          >
            {r.location.active ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title="Bin locations"
        description="Aisle-rack-level bins, their zone and pallet capacity. Put-away suggests bins with space."
        actions={
          <Button icon={<Plus aria-hidden="true" />} onClick={() => setNewOpen(true)}>
            New location
          </Button>
        }
      />
      <section aria-label="Occupancy figures" className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Pallets used"
          value={data ? `${formatNumber(used)} / ${formatNumber(capacity)}` : '—'}
          icon={<MapPin />}
          footnote={
            <span className="text-fg-muted">
              {capacity ? Math.round((used / capacity) * 100) : 0}% of active capacity
            </span>
          }
        />
        <KpiCard
          label="Active bins"
          value={data ? formatNumber(active.length) : '—'}
          icon={<MapPin />}
          footnote={<span className="text-fg-muted">{(data?.length ?? 0) - active.length} inactive</span>}
        />
        <KpiCard
          label="Full bins"
          value={data ? formatNumber(active.filter((l) => l.pct >= 100).length) : '—'}
          icon={<MapPin />}
          footnote={<span className="text-fg-muted">no space left</span>}
        />
      </section>
      <Card>
        <DataTable
          caption="Bin locations"
          columns={columns}
          rows={data}
          rowKey={(r) => r.id}
          loading={isLoading}
          error={error}
          emptyTitle="No locations yet"
        />
      </Card>
      {newOpen ? <NewLocationDialog onClose={() => setNewOpen(false)} /> : null}
    </div>
  );
}

function NewLocationDialog({ onClose }: { onClose: () => void }) {
  const action = useFloorAction();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [zone, setZone] = useState<WarehouseLocation['zone']>('Ambient');
  const [capacity, setCapacity] = useState('30');
  const submit = () =>
    action.mutate(
      { kind: 'createLocation', code, zone, capacityPallets: Number(capacity) },
      {
        onSuccess: () => {
          toast({ title: `Location ${code.trim().toUpperCase()} created` });
          onClose();
        },
      },
    );
  useFormShortcuts({ onPrimary: submit });
  return (
    <Dialog
      open
      onClose={onClose}
      title="New bin location"
      description="Use the aisle-rack-level code printed on the rack label."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={submit}>
            Create location
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Code"
          required
          placeholder="e.g. A-03-01"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <SelectField
          label="Zone"
          required
          options={LOCATION_ZONES.map((z) => ({ value: z, label: z }))}
          value={zone}
          onChange={(e) => setZone(e.target.value as WarehouseLocation['zone'])}
        />
        <TextField
          label="Capacity (pallets)"
          type="number"
          min={1}
          required
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        {action.error ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {action.error instanceof Error ? action.error.message : 'Not created.'}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
