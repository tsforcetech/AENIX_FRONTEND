import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { ClipboardList, Plus, Save, Send, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import type { WarehouseLocation } from '@/domain/types';
import { useVarianceAction } from '@/features/variances/api';
import { useCustomerOptions } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { countDifference } from './floor';
import {
  LOCATION_ZONES,
  useCycleCount,
  useCycleCounts,
  useFloorAction,
  useWarehouseFloorEnabled,
  type CycleCountRow,
} from './api';

const listRoute = getRouteApi('/_app/warehouse/cycle-counts');
const detailRoute = getRouteApi('/_app/warehouse/cycle-counts/$id');
const STATUSES = ['Open', 'Counted', 'Pending approval', 'Posted'] as const;
const TODAY = '2026-11-23';

/** FLOW-003 W8 — cycle counts by zone / customer. */
export function CycleCountsPage() {
  const search = listRoute.useSearch();
  const navigate = useNavigate({ from: '/warehouse/cycle-counts' });
  const enabled = useWarehouseFloorEnabled();
  const [newOpen, setNewOpen] = useState(false);
  const { data, isLoading, isFetching, error } = useCycleCounts({
    page: search.page,
    status: search.status,
    search: search.q,
  });

  const columns: Column<CycleCountRow>[] = [
    {
      key: 'number',
      header: 'Count',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      cell: (r) => (
        <div>
          <p>{r.zone ?? 'All zones'}</p>
          <p className="text-caption text-fg-muted">{r.customerName ?? 'All customers'}</p>
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Counted',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums">
          {r.counted} / {r.lines.length}
        </span>
      ),
    },
    {
      key: 'diff',
      header: 'Differences',
      align: 'right',
      cell: (r) =>
        r.differences ? (
          <span className="font-medium text-danger">
            {r.differences} line{r.differences === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-fg-muted">None</span>
        ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Warehouse', to: '/warehouse' }, { label: 'Cycle counts' }]}
        title="Cycle counts"
        description="Count a zone or a customer’s lots, post the differences as stock adjustments (approval above the threshold)."
        actions={
          enabled ? (
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setNewOpen(true)}>
              New count
            </Button>
          ) : null
        }
      />
      {!enabled ? (
        <StatusMessage
          kind="empty"
          title="Own warehouse floor is switched off"
          description="Cycle counts are used only when the company runs its own warehouse floor."
        />
      ) : (
        <Card>
          <ListToolbar
            tabs={statusTabs(STATUSES, data?.counts)}
            status={search.status}
            onStatus={(s) =>
              void navigate({
                search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }),
              })
            }
            search={search.q ?? ''}
            onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
            searchPlaceholder="Search count, zone, customer…"
          />
          <DataTable
            caption="Cycle counts"
            columns={columns}
            rows={data?.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => void navigate({ to: '/warehouse/cycle-counts/$id', params: { id: r.id } })}
            loading={isLoading || isFetching}
            error={error}
            emptyTitle="No cycle counts yet"
            emptyDescription="Create one for a zone or a customer."
            footer={
              data ? (
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPageChange={(page) => void navigate({ search: (p) => ({ ...p, page }) })}
                />
              ) : null
            }
          />
        </Card>
      )}
      {newOpen ? <NewCountDialog onClose={() => setNewOpen(false)} /> : null}
    </div>
  );
}

function NewCountDialog({ onClose }: { onClose: () => void }) {
  const customers = useCustomerOptions();
  const action = useFloorAction();
  const navigate = useNavigate();
  const toast = useToast();
  const [zone, setZone] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(TODAY);
  const submit = () =>
    action.mutate(
      {
        kind: 'createCount',
        zone: (zone || undefined) as WarehouseLocation['zone'] | undefined,
        customerId: customerId || undefined,
        date,
      },
      {
        onSuccess: (cc) => {
          toast({ title: `${cc.number ?? 'Count'} created`, body: 'Enter the counted quantities.' });
          onClose();
          void navigate({ to: '/warehouse/cycle-counts/$id', params: { id: cc.id } });
        },
      },
    );
  useFormShortcuts({ onPrimary: submit });
  return (
    <Dialog
      open
      onClose={onClose}
      title="New cycle count"
      description="Lines are created from the lots with stock in this zone / for this customer (system quantity frozen now)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={submit}>
            Create count
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Zone"
          placeholder="All zones"
          options={LOCATION_ZONES.map((z) => ({ value: z, label: z }))}
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        />
        <SelectField
          label="Customer"
          placeholder="All customers"
          options={customers.data ?? []}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        />
        <TextField
          label="Count date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
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

export function CycleCountDetailPage() {
  const { id } = detailRoute.useParams();
  const { data: cc, isLoading, error } = useCycleCount(id);
  if (error) return <StatusMessage kind="error" title="Cycle count not found" />;
  if (isLoading || !cc) return <StatusMessage kind="loading" title="Loading cycle count…" />;
  return <CountSheet key={`${cc.id}-${cc.status}`} cc={cc} />;
}

function CountSheet({ cc }: { cc: CycleCountRow }) {
  const action = useFloorAction();
  const variance = useVarianceAction();
  const navigate = useNavigate();
  const toast = useToast();
  const editable = cc.status === 'Open' || cc.status === 'Counted';
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(cc.lines.map((l) => [l.stockItemId, l.countedQty?.toString() ?? ''])),
  );
  const [formError, setFormError] = useState<string>();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const parsed = () =>
    Object.fromEntries(
      Object.entries(counted).map(([k, v]) => [k, v.trim() === '' ? undefined : Number(v)]),
    ) as Record<string, number | undefined>;

  const save = (submit: boolean) => {
    setFormError(undefined);
    action.mutate(
      { kind: 'saveCounts', id: cc.id, counted: parsed(), submit },
      {
        onSuccess: (res) =>
          toast({
            title: !submit
              ? `${cc.number} saved`
              : res.status === 'Pending approval'
                ? `${cc.number} sent for approval`
                : `${cc.number} posted`,
            body: !submit
              ? undefined
              : res.status === 'Pending approval'
                ? 'The difference is above the stock adjustment threshold.'
                : 'Lot quantities adjusted.',
          }),
        onError: (e) => setFormError(e instanceof Error ? e.message : 'Not saved.'),
      },
    );
  };
  useFormShortcuts(editable ? { onSave: () => save(false), onPrimary: () => save(true) } : {});

  const lines = cc.lines.map((l) => {
    const raw = counted[l.stockItemId] ?? '';
    const countedQty = raw.trim() === '' ? undefined : Number(raw);
    return { ...l, countedQty, diff: countDifference({ systemQty: l.systemQty, countedQty }) };
  });
  const diffs = lines.filter((l) => l.diff);

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: 'Warehouse', to: '/warehouse' },
          { label: 'Cycle counts', to: '/warehouse/cycle-counts' },
          { label: cc.number },
        ]}
        title={`Cycle count ${cc.number}`}
        meta={<StatusBadge status={cc.status} />}
        description={`${cc.zone ?? 'All zones'} · ${cc.customerName ?? 'All customers'} · ${formatDate(cc.date)}`}
        actions={
          editable ? (
            <>
              <Button
                variant="secondary"
                icon={<Save aria-hidden="true" />}
                busy={action.isPending}
                onClick={() => save(false)}
              >
                Save counts
              </Button>
              <Button icon={<Send aria-hidden="true" />} busy={action.isPending} onClick={() => save(true)}>
                Submit count
              </Button>
            </>
          ) : diffs.length ? (
            <Button
              variant="secondary"
              icon={<TriangleAlert aria-hidden="true" />}
              busy={variance.isPending}
              onClick={() =>
                variance.mutate(
                  { kind: 'fromCount', countId: cc.id },
                  {
                    onSuccess: (v) => void navigate({ to: '/variances/$id', params: { id: v.id } }),
                    onError: (e) =>
                      toast({
                        title: 'Variance not raised',
                        body: e instanceof Error ? e.message : 'Please try again.',
                      }),
                  },
                )
              }
            >
              Raise variance
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title="Count sheet"
            description={
              editable
                ? 'Type the counted quantity; Enter moves to the next line. Ctrl+S saves, Ctrl+Enter submits.'
                : 'Counted quantities as submitted.'
            }
          />
          <CardBody>
            <div
              className="overflow-x-auto rounded-lg border border-border-subtle"
              tabIndex={0}
              role="region"
              aria-label="Count sheet lines"
            >
              <table className="w-full min-w-[560px] text-left text-body-s">
                <caption className="sr-only">Count lines for {cc.number}</caption>
                <thead>
                  <tr className="border-b border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="px-3 py-2 font-medium">
                      Location
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      SKU
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      System
                    </th>
                    <th scope="col" className="w-32 px-3 py-2 font-medium">
                      Counted
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.stockItemId} className="border-b border-border-subtle last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[13px]">
                        {l.locationCode}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[13px]">{l.sku}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{l.systemQty}</td>
                      <td className="px-3 py-1.5">
                        {editable ? (
                          <input
                            ref={(el) => {
                              inputs.current[i] = el;
                            }}
                            type="number"
                            min={0}
                            inputMode="numeric"
                            aria-label={`${l.sku} at ${l.locationCode} counted quantity`}
                            value={counted[l.stockItemId] ?? ''}
                            onChange={(e) => setCounted((c) => ({ ...c, [l.stockItemId]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                                e.preventDefault();
                                inputs.current[i + 1]?.focus();
                              }
                            }}
                            className={clsx(inputClasses, 'h-9 text-right')}
                          />
                        ) : (
                          <span className="tabular-nums">{l.countedQty ?? '—'}</span>
                        )}
                      </td>
                      <td
                        className={clsx(
                          'px-3 py-1.5 text-right tabular-nums',
                          l.diff ? 'font-semibold text-danger' : 'text-fg-muted',
                        )}
                      >
                        {l.diff === undefined ? '—' : l.diff > 0 ? `+${l.diff}` : l.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {formError ? (
              <p role="alert" className="mt-3 text-caption font-medium text-danger">
                {formError}
              </p>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Summary" />
          <CardBody>
            <DescriptionList
              items={[
                { label: 'Warehouse', value: cc.warehouse },
                {
                  label: 'Lines',
                  value: `${lines.filter((l) => l.countedQty !== undefined).length} / ${lines.length} counted`,
                },
                {
                  label: 'Differences',
                  value: diffs.length
                    ? `${diffs.length} line(s), largest ${Math.max(...diffs.map((d) => Math.abs(d.diff ?? 0)))}`
                    : 'None',
                },
                { label: 'Counted by', value: cc.countedBy ?? '—' },
                {
                  label: 'Approval',
                  value: cc.approval
                    ? `${cc.approval.status} — ${cc.approval.approverRole}${cc.approval.decidedAt ? ` (${formatDateTime(cc.approval.decidedAt)})` : ''}`
                    : 'Not needed yet',
                },
              ]}
            />
            {cc.status === 'Pending approval' ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-body-s text-warning">
                <ClipboardList aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Waiting for approval in the approvals inbox. Stock is adjusted when approved.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
