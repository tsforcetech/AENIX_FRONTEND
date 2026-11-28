import { CalendarCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { nextMonth } from '@/domain/fixedAssets';
import type { AssetCategory } from '@/domain/types';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { KpiCard } from '@/shared/ui/KpiCard';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoney } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import {
  previewDepreciation,
  useAssetRegister,
  useCreateAsset,
  useDisposeAsset,
  useRunDepreciation,
  useAssetCategoryOptions,
  type AssetRow,
} from './api';
import { categoryPrefill, residualFromPct } from './asset-defaults';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/** Fixed asset register: owner decision 2026-11-28 (payroll stays outside AENIX). */
export function FixedAssetsPage() {
  const { data, isLoading, error } = useAssetRegister();
  const [newOpen, setNewOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [disposing, setDisposing] = useState<AssetRow>();

  const columns: Column<AssetRow>[] = [
    {
      key: 'asset',
      header: 'Asset',
      cell: (r) => (
        <div className="min-w-48">
          <DocRef>{r.number}</DocRef>
          <p className="font-medium">{r.name}</p>
          <p className="text-caption text-fg-muted">
            {r.category}
            {r.vehiclePlate ? ` · fleet vehicle ${r.vehiclePlate}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'acq',
      header: 'Acquired',
      hideOnMobile: true,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p>{formatDate(r.acquisitionDate)}</p>
          <p className="text-caption text-fg-muted">{r.usefulLifeMonths} months life</p>
        </div>
      ),
    },
    { key: 'cost', header: 'Cost', align: 'right', cell: (r) => <Money amount={r.cost} /> },
    {
      key: 'acc',
      header: 'Depreciation to date',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => (
        <div>
          <Money amount={r.accumulatedDepreciation} muted />
          <p className="text-caption text-fg-muted">{formatMoney(r.monthly)} / month</p>
        </div>
      ),
    },
    {
      key: 'nbv',
      header: 'Book value',
      align: 'right',
      cell: (r) => <Money amount={r.bookValue} className="font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div>
          <StatusBadge status={r.status} />
          {r.disposal ? (
            <p className="mt-1 text-caption text-fg-muted">
              {formatDate(r.disposal.date)} · {r.disposal.gainLoss >= 0 ? 'gain' : 'loss'}{' '}
              {formatMoney(Math.abs(r.disposal.gainLoss))}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === 'Active' ? (
          <Button size="sm" variant="secondary" onClick={() => setDisposing(r)}>
            Dispose
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Fixed assets"
        description="Vehicles, forklifts, racking and equipment: cost, monthly depreciation and book value."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<CalendarCheck aria-hidden="true" />}
              onClick={() => setRunOpen(true)}
            >
              Run depreciation
            </Button>
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setNewOpen(true)}>
              Add asset
            </Button>
          </>
        }
      />
      <p className="mb-4 text-caption text-fg-muted">
        Straight-line depreciation, monthly. Method, useful lives and postings are illustrative and pending
        accountant sign-off. Payroll stays outside AENIX: post the monthly salary journal from the payroll
        provider.
      </p>
      {error ? (
        <StatusMessage kind="error" title="Could not load the asset register" description={errText(error)} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Active assets" value={data?.totals.active ?? '…'} />
            <KpiCard label="Cost" value={<Money amount={data?.totals.cost ?? 0} />} />
            <KpiCard label="Depreciation to date" value={<Money amount={data?.totals.accumulated ?? 0} />} />
            <KpiCard
              label="Book value"
              value={<Money amount={data?.totals.bookValue ?? 0} />}
              footnote={<span className="text-fg-muted">Posted up to {data?.lastPosted ?? '—'}</span>}
            />
          </div>
          <Card>
            <DataTable
              caption="Fixed asset register"
              columns={columns}
              rows={data?.rows}
              rowKey={(r) => r.id}
              loading={isLoading}
              emptyTitle="No assets yet"
              emptyDescription="Add the company's vehicles, equipment and racking."
            />
          </Card>
          {data?.runs.length ? (
            <Card className="mt-6">
              <CardBody>
                <h2 className="mb-3 text-[15px] font-semibold text-fg">Depreciation runs</h2>
                <ul className="divide-y divide-border-subtle">
                  {data.runs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <DocRef>{r.number}</DocRef> · {r.period} · {r.lines.length} assets
                      </span>
                      <Money amount={r.total} className="font-medium" />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
      <Dialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Add asset"
        description="Capitalises the asset and posts its cost."
      >
        {newOpen ? <NewAssetForm vehicles={data?.vehicles ?? []} onDone={() => setNewOpen(false)} /> : null}
      </Dialog>
      <Dialog
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run depreciation"
        description="Posts one journal for the month: Dr 6700 Depreciation, Cr 1590 Accumulated depreciation."
      >
        {runOpen ? (
          <RunForm
            defaultPeriod={data?.lastPosted ? nextMonth(data.lastPosted) : PROTO_TODAY.slice(0, 7)}
            onDone={() => setRunOpen(false)}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={!!disposing}
        onClose={() => setDisposing(undefined)}
        title={disposing ? `Dispose ${disposing.number}` : 'Dispose asset'}
        description="Removes the asset from the register and posts the gain or loss."
      >
        {disposing ? <DisposeForm asset={disposing} onDone={() => setDisposing(undefined)} /> : null}
      </Dialog>
    </div>
  );
}

function NewAssetForm({
  vehicles,
  onDone,
}: {
  vehicles: { value: string; label: string }[];
  onDone: () => void;
}) {
  const create = useCreateAsset();
  const toast = useToast();
  const categories = useAssetCategoryOptions();
  // Residual % of the chosen category; cleared once the residual value is typed by hand.
  const [residualPct, setResidualPct] = useState<number | null>(null);
  const [f, setF] = useState({
    name: '',
    category: '' as AssetCategory,
    acquisitionDate: PROTO_TODAY,
    cost: '',
    residualValue: '0',
    usefulLifeMonths: '',
    location: '',
    supplier: '',
    vehicleId: '',
    paidFrom: 'Bank' as 'Bank' | 'Vendor credit',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const categoryOptions = categories.data ?? [];
  const chooseCategory = (e: { target: { value: string } }) => {
    const c = categoryOptions.find((x) => x.value === e.target.value);
    setResidualPct(c ? c.residualPct : null);
    setF((p) => ({ ...p, category: e.target.value, ...(c ? categoryPrefill(c, p.cost) : {}) }));
  };
  const chosen = categoryOptions.find((x) => x.value === f.category);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            ...f,
            cost: Number(f.cost),
            residualValue: Number(f.residualValue),
            usefulLifeMonths: Number(f.usefulLifeMonths),
          },
          {
            onSuccess: (a) => {
              toast({ title: `${a.number} added`, body: a.name });
              onDone();
            },
          },
        );
      }}
    >
      <TextField
        label="Asset name"
        required
        value={f.name}
        onChange={set('name')}
        placeholder="e.g. 10-ton truck DXB M 12345"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Category"
          required
          placeholder="Select category"
          hint={
            chosen
              ? `Default ${chosen.usefulLifeMonths} months, residual ${chosen.residualPct}% of cost`
              : 'From the Asset categories master'
          }
          options={categoryOptions.map(({ value, label }) => ({ value, label }))}
          value={f.category}
          onChange={chooseCategory}
        />
        <TextField
          label="Acquisition date"
          type="date"
          required
          value={f.acquisitionDate}
          onChange={set('acquisitionDate')}
        />
        <TextField
          label="Cost (AED, excl. VAT)"
          type="number"
          step="0.01"
          required
          value={f.cost}
          onChange={(e) => {
            const cost = e.target.value;
            setF((p) => ({
              ...p,
              cost,
              ...(residualPct !== null
                ? { residualValue: String(residualFromPct(Number(cost), residualPct)) }
                : {}),
            }));
          }}
        />
        <TextField
          label="Residual value (AED)"
          type="number"
          step="0.01"
          value={f.residualValue}
          onChange={(e) => {
            setResidualPct(null);
            set('residualValue')(e);
          }}
        />
        <TextField
          label="Useful life (months)"
          type="number"
          required
          value={f.usefulLifeMonths}
          onChange={set('usefulLifeMonths')}
        />
        <TextField
          label="Location"
          value={f.location}
          onChange={set('location')}
          placeholder="e.g. JAFZA WH-1"
        />
        {f.category === 'Vehicles' ? (
          <SelectField
            label="Fleet vehicle"
            placeholder="Not linked"
            options={vehicles}
            value={f.vehicleId}
            onChange={set('vehicleId')}
          />
        ) : null}
        <SelectField
          label="Paid"
          options={[
            { value: 'Bank', label: 'From bank' },
            { value: 'Vendor credit', label: 'On credit (accounts payable)' },
          ]}
          value={f.paidFrom}
          onChange={set('paidFrom')}
        />
      </div>
      {create.error ? (
        <StatusMessage kind="error" title="Asset not added" description={errText(create.error)} />
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" busy={create.isPending}>
          Add asset
        </Button>
      </div>
    </form>
  );
}

function RunForm({ defaultPeriod, onDone }: { defaultPeriod: string; onDone: () => void }) {
  const run = useRunDepreciation();
  const toast = useToast();
  const [period, setPeriod] = useState(defaultPeriod);
  const valid = /^\d{4}-\d{2}$/.test(period);
  const preview = valid ? previewDepreciation(period) : { lines: [], total: 0 };
  return (
    <div className="space-y-4">
      <TextField
        label="Month"
        type="month"
        required
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      />
      {preview.lines.length ? (
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {preview.lines.map((l) => (
            <li key={l.asset.id} className="flex items-center justify-between gap-3 px-3 py-2 text-body-s">
              <span>
                {l.asset.number} · {l.asset.name}
              </span>
              <Money amount={l.amount} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-fg-muted">
          Nothing due for this month (already posted, or no active assets).
        </p>
      )}
      <div className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-body-s">
        <span className="text-fg-muted">Total depreciation</span>
        <Badge tone="info">{formatMoney(preview.total)}</Badge>
      </div>
      {run.error ? <StatusMessage kind="error" title="Not posted" description={errText(run.error)} /> : null}
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button
          busy={run.isPending}
          disabled={!preview.lines.length}
          onClick={() =>
            run.mutate(period, {
              onSuccess: (r) => {
                toast({
                  title: `${r.number} posted`,
                  body: `Depreciation ${r.period}: ${formatMoney(r.total)}`,
                });
                onDone();
              },
            })
          }
        >
          Post depreciation
        </Button>
      </div>
    </div>
  );
}

function DisposeForm({ asset, onDone }: { asset: AssetRow; onDone: () => void }) {
  const dispose = useDisposeAsset();
  const toast = useToast();
  const [date, setDate] = useState(PROTO_TODAY);
  const [proceeds, setProceeds] = useState('0');
  const [reason, setReason] = useState('');
  const result = Math.round((Number(proceeds || 0) - asset.bookValue) * 100) / 100;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        dispose.mutate(
          { id: asset.id, date, proceeds: Number(proceeds || 0), reason },
          {
            onSuccess: () => {
              toast({ title: `${asset.number} disposed` });
              onDone();
            },
          },
        );
      }}
    >
      <p className="text-body-s">
        Book value today: <Money amount={asset.bookValue} className="font-medium" />
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Disposal date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label="Sale proceeds (AED)"
          type="number"
          step="0.01"
          value={proceeds}
          onChange={(e) => setProceeds(e.target.value)}
        />
      </div>
      <TextField
        label="Reason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Sold, scrapped, written off after accident"
      />
      <p className="text-body-s">
        {result >= 0 ? 'Gain' : 'Loss'} on disposal: <strong>{formatMoney(Math.abs(result))}</strong>
      </p>
      {dispose.error ? (
        <StatusMessage kind="error" title="Not disposed" description={errText(dispose.error)} />
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" busy={dispose.isPending}>
          Dispose asset
        </Button>
      </div>
    </form>
  );
}
