import { Plus } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { ListToolbar } from '@/shared/ui/ListToolbar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatNumber } from '@/shared/utils/format';
import {
  useAddWarehouse,
  useEditWarehouse,
  useSetWarehouseActive,
  useWarehouseMaster,
  useWarehouseVendorOptions,
  type WarehouseRow,
} from './api';

const crumbs = [{ label: 'All masters', to: '/masters' }, { label: 'Warehouses' }];

/** FLOW-003 M1 — warehouses (sites) master: own warehouses and sites run by warehouse vendors. */
export function WarehousesMasterPage() {
  const { data, isLoading, error } = useWarehouseMaster();
  const setActive = useSetWarehouseActive();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Active');
  const [form, setForm] = useState<{ row?: WarehouseRow } | null>(null);
  const [confirm, setConfirm] = useState<WarehouseRow | null>(null);
  const [actionError, setActionError] = useState<string>();

  const text = q.trim().toLowerCase();
  const activeCount = data?.filter((r) => r.site.active).length ?? 0;
  const rows = data?.filter(
    (r) =>
      (status === 'Active') === r.site.active &&
      (!text ||
        `${r.site.code} ${r.site.name} ${r.site.city} ${r.vendorName ?? ''}`.toLowerCase().includes(text)),
  );

  const toggle = (r: WarehouseRow, active: boolean) => {
    setActionError(undefined);
    setActive.mutate(
      { id: r.site.id, active },
      {
        onSuccess: () => {
          toast({ title: `${r.site.name} ${active ? 'reactivated' : 'deactivated'}` });
          setConfirm(null);
        },
        onError: (e) => {
          setActionError(e instanceof Error ? e.message : 'Not changed');
          setConfirm(null);
        },
      },
    );
  };

  const columns: Column<WarehouseRow>[] = [
    {
      key: 'name',
      header: 'Code · name',
      cell: (r) => (
        <div>
          <span className="font-mono text-[13px] font-medium">{r.site.code}</span>
          <p className="text-body-s text-fg-secondary">{r.site.name}</p>
        </div>
      ),
    },
    {
      key: 'run',
      header: 'Run by',
      cell: (r) => (r.site.type === 'Own' ? 'Own warehouse' : (r.vendorName ?? 'Warehouse vendor')),
    },
    { key: 'city', header: 'City / area', hideOnMobile: true, cell: (r) => r.site.city || '—' },
    {
      key: 'capacity',
      header: 'Capacity',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => `${formatNumber(r.site.palletCapacity)} pallets`,
    },
    {
      key: 'stock',
      header: 'Stock held',
      align: 'right',
      cell: (r) =>
        r.stock.lots
          ? `${formatNumber(r.stock.lots)} lots · ${formatNumber(r.stock.pallets)} pallets`
          : 'None',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.site.active ? 'Active' : 'Inactive'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5 whitespace-nowrap">
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Edit ${r.site.name}`}
            onClick={() => setForm({ row: r })}
          >
            Edit
          </Button>
          {r.site.active ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Deactivate ${r.site.name}`}
              onClick={() => setConfirm(r)}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Reactivate ${r.site.name}`}
              busy={setActive.isPending && setActive.variables?.id === r.site.id}
              onClick={() => toggle(r, true)}
            >
              Reactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title="Warehouses"
        description="Own warehouses and sites run by warehouse vendors. Stock, movements and documents use the warehouse name."
        actions={
          <Button icon={<Plus aria-hidden="true" />} onClick={() => setForm({})}>
            Add warehouse
          </Button>
        }
      />
      {actionError ? (
        <div className="mb-4">
          <StatusMessage kind="error" title="Not changed" description={actionError} />
        </div>
      ) : null}
      <Card>
        <ListToolbar
          search={q}
          onSearch={setQ}
          searchPlaceholder="Search warehouses…"
          tabs={[
            { value: 'Active', label: 'Active', count: data ? activeCount : undefined },
            { value: 'Inactive', label: 'Inactive', count: data ? data.length - activeCount : undefined },
          ]}
          status={status}
          onStatus={setStatus}
        />
        <DataTable
          caption="Warehouses"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.site.id}
          loading={isLoading}
          error={error}
          emptyTitle={
            text
              ? 'No warehouse matches'
              : status === 'Inactive'
                ? 'No inactive warehouses'
                : 'No warehouses yet'
          }
        />
      </Card>

      {form ? <WarehouseForm row={form.row} onClose={() => setForm(null)} /> : null}

      {confirm ? (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title={`Deactivate ${confirm.site.name}?`}
          description="It is no longer offered for new stock, jobs or documents. You can reactivate it later."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                {confirm.stock.lots ? 'Close' : 'Cancel'}
              </Button>
              {confirm.stock.lots ? null : (
                <Button busy={setActive.isPending} onClick={() => toggle(confirm, false)}>
                  Deactivate
                </Button>
              )}
            </>
          }
        >
          {confirm.stock.lots ? (
            <StatusMessage
              kind="denied"
              title="This warehouse still holds stock"
              description={`${formatNumber(confirm.stock.lots)} lots (${formatNumber(confirm.stock.qty)} units) are still in ${confirm.site.name}. Move or dispatch the stock first.`}
            />
          ) : (
            <p className="text-body-s">No stock is held here.</p>
          )}
        </Dialog>
      ) : null}
    </div>
  );
}

function WarehouseForm({ row, onClose }: { row?: WarehouseRow; onClose: () => void }) {
  const add = useAddWarehouse();
  const edit = useEditWarehouse();
  const vendors = useWarehouseVendorOptions();
  const toast = useToast();
  const site = row?.site;
  const [name, setName] = useState(site?.name ?? '');
  const [type, setType] = useState<'Own' | 'Vendor'>(site?.type ?? 'Own');
  const [vendorId, setVendorId] = useState(site?.vendorId ?? '');
  const [city, setCity] = useState(site?.city ?? '');
  const [capacity, setCapacity] = useState(String(site?.palletCapacity ?? 200));
  const pending = add.isPending || edit.isPending;
  const err = add.error ?? edit.error;

  const submit = () => {
    const common = { name, city, palletCapacity: Number(capacity), vendorId: vendorId || undefined };
    if (site)
      edit.mutate(
        { id: site.id, input: common },
        {
          onSuccess: (r) => {
            toast({ title: r.changes.length ? `${r.site.name} saved` : 'No change' });
            onClose();
          },
        },
      );
    else
      add.mutate(
        { ...common, type },
        {
          onSuccess: (w) => {
            toast({ title: `${w.name} added` });
            onClose();
          },
        },
      );
  };
  useFormShortcuts({ onPrimary: submit });

  return (
    <Dialog
      open
      onClose={onClose}
      title={site ? `Edit ${site.name}` : 'Add warehouse'}
      description="Jobs with a warehouse vendor use that vendor's site; other jobs use the own warehouse."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="warehouse-form" busy={pending}>
            {site ? 'Save changes' : 'Add warehouse'}
          </Button>
        </>
      }
    >
      <form
        id="warehouse-form"
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Warehouse name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. DIC WH-2"
          hint={
            site && site.name !== name.trim()
              ? 'Stock, movements and bin locations move to the new name.'
              : undefined
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Run by"
            options={[
              { value: 'Own', label: 'Own warehouse' },
              { value: 'Vendor', label: 'A warehouse vendor' },
            ]}
            value={type}
            disabled={!!site}
            hint={site ? 'Fixed after the warehouse is created.' : undefined}
            onChange={(e) => setType(e.target.value as 'Own' | 'Vendor')}
          />
          {type === 'Vendor' ? (
            <SelectField
              label="Warehouse vendor"
              required
              placeholder="Select vendor"
              options={vendors.data ?? []}
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            />
          ) : null}
          <TextField label="City / area" value={city} onChange={(e) => setCity(e.target.value)} />
          <TextField
            label="Pallet positions"
            type="number"
            min={1}
            step={1}
            required
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        {err ? (
          <StatusMessage
            kind="error"
            title="Not saved"
            description={err instanceof Error ? err.message : undefined}
          />
        ) : null}
      </form>
    </Dialog>
  );
}
