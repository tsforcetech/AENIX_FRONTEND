import type { StorageBasis } from '@/domain/types';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { CalendarPlus, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useCustomerOptions } from '@/shared/data/lookups';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoney, formatNumber } from '@/shared/utils/format';
import {
  basisUom,
  daysInMonth,
  monthLabel,
  storageBillingApi,
  useGenerateRun,
  useInvoiceRun,
  useStorageRuns,
  type StorageRunRow,
} from './api';
import { storageCharge } from './charge';

const route = getRouteApi('/_app/storage-billing');
const STATUSES = ['Draft', 'Invoiced'] as const;

export function StorageBillingPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/storage-billing' });
  const toast = useToast();
  const invoiceRun = useInvoiceRun();
  const [invoicingId, setInvoicingId] = useState<string>();
  const [generateOpen, setGenerateOpen] = useState(false);
  const { data, isLoading, isFetching, error } = useStorageRuns({
    page: search.page,
    status: search.status,
    search: search.q,
  });

  const columns: Column<StorageRunRow>[] = [
    { key: 'number', header: 'Run', cell: (r) => <DocRef>{r.number}</DocRef> },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => <span className="font-medium">{r.customerName}</span>,
    },
    {
      key: 'period',
      header: 'Period',
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p>{monthLabel(r.periodFrom.slice(0, 7))}</p>
          <p className="text-caption text-fg-muted">
            {formatDate(r.periodFrom)} – {formatDate(r.periodTo)}
          </p>
        </div>
      ),
    },
    {
      key: 'pd',
      header: 'Quantity',
      align: 'right',
      cell: (r) => (
        <span className="whitespace-nowrap">
          {formatNumber(r.palletDays)}{' '}
          <span className="text-caption text-fg-muted">{basisUom[r.basis ?? 'Pallet-day']}</span>
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => <Money amount={r.ratePerPalletDay} muted />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => (
        <div className="flex flex-col items-end gap-1">
          <Money amount={r.amount} className="font-medium" />
          {r.minimumApplied ? <Badge tone="info">Minimum applied</Badge> : null}
          {r.freeDays ? <span className="text-caption text-fg-muted">{r.freeDays} free days</span> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.status === 'Invoiced' && r.invoiceId ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="Invoiced" />
            <Link
              to="/invoices/$id"
              params={{ id: r.invoiceId }}
              className="font-mono text-[13px] font-medium text-brand hover:underline"
            >
              {r.invoiceNumber}
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="Draft" />
            <Button
              size="sm"
              variant="secondary"
              icon={<Receipt aria-hidden="true" />}
              busy={invoiceRun.isPending && invoicingId === r.id}
              onClick={() => {
                setInvoicingId(r.id);
                invoiceRun.mutate(r.id, {
                  onSuccess: (inv) => {
                    toast({ title: `${inv.number} drafted`, body: `Storage invoice for ${r.customerName}.` });
                    void navigate({ to: '/invoices/$id', params: { id: inv.id } });
                  },
                  onError: (e) =>
                    toast({
                      title: 'Not invoiced',
                      body: e instanceof Error ? e.message : 'Please try again.',
                    }),
                });
              }}
            >
              Create invoice
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Storage billing"
        description="Periodic storage charges — by floor area (sq.ft), pallet-days or CBM-days — billed separately from transport jobs."
        actions={
          <Button icon={<CalendarPlus aria-hidden="true" />} onClick={() => setGenerateOpen(true)}>
            Generate run
          </Button>
        }
      />
      <Card>
        <ListToolbar
          tabs={statusTabs(STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search run or customer…"
        />
        <DataTable
          caption="Storage billing runs"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          emptyTitle="No storage runs match"
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
      <Dialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate storage run"
        description="One run per customer per month. Choose how storage is charged; pallet-days are suggested from current stock."
      >
        {generateOpen ? <GenerateRunForm onDone={() => setGenerateOpen(false)} /> : null}
      </Dialog>
    </div>
  );
}

function GenerateRunForm({ onDone }: { onDone: () => void }) {
  const customers = useCustomerOptions();
  const generate = useGenerateRun();
  const toast = useToast();
  const [customerId, setCustomerId] = useState('');
  const [month, setMonth] = useState('2026-11');
  const [rate, setRate] = useState('3.5');
  const [palletDays, setPalletDays] = useState('');
  const [basis, setBasis] = useState<StorageBasis>('Pallet-day');
  // FLOW-003 W13: free days and minimum charge (defaults from the customer's active contract).
  const [freeDays, setFreeDays] = useState('');
  const [minimum, setMinimum] = useState('');
  const terms = customerId ? storageBillingApi.storageTerms(customerId) : {};
  const unit = basisUom[basis];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggested =
    customerId && /^\d{4}-\d{2}$/.test(month)
      ? storageBillingApi.suggestPalletDays(customerId, month)
      : undefined;
  // Only pallet-days can be suggested from stock; area and CBM are entered.
  const effectivePd =
    palletDays === '' ? (basis === 'Pallet-day' ? (suggested ?? 0) : 0) : Number(palletDays);
  const charge = storageCharge({
    basis,
    quantity: effectivePd,
    rate: Number(rate) || 0,
    daysInPeriod: /^\d{4}-\d{2}$/.test(month) ? daysInMonth(month) : 30,
    freeDays: Number(freeDays) || 0,
    minimumCharge: Number(minimum) || 0,
  });
  const amount = charge.amount;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = 'Choose a customer';
    if (!/^\d{4}-\d{2}$/.test(month)) e.month = 'Choose a month';
    if (!(Number(rate) > 0)) e.rate = 'Enter a rate above 0';
    if (!(effectivePd > 0)) e.palletDays = `Enter the ${unit.toLowerCase()} quantity (above 0)`;
    if (Number(freeDays) < 0) e.freeDays = 'Free days cannot be negative';
    if (Number(minimum) < 0) e.minimum = 'The minimum cannot be negative';
    setErrors(e);
    if (Object.keys(e).length) return;
    generate.mutate(
      {
        customerId,
        month,
        basis,
        ratePerPalletDay: Number(rate),
        palletDays: Math.round(effectivePd * 100) / 100,
        freeDays: Number(freeDays) || undefined,
        minimumCharge: Number(minimum) || undefined,
      },
      {
        onSuccess: (run) => {
          toast({ title: `${run.number} generated`, body: 'Create the invoice when the period is closed.' });
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <SelectField
        label="Customer"
        required
        placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
        options={customers.data ?? []}
        value={customerId}
        error={errors.customerId}
        onChange={(e) => {
          setCustomerId(e.target.value);
          setPalletDays('');
          const t = e.target.value ? storageBillingApi.storageTerms(e.target.value) : {};
          setFreeDays(t.freeDays !== undefined ? String(t.freeDays) : '');
          setMinimum(t.minimumCharge !== undefined ? String(t.minimumCharge) : '');
        }}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Billing month"
          type="month"
          required
          value={month}
          error={errors.month}
          hint={/^\d{4}-\d{2}$/.test(month) ? `${daysInMonth(month)} days` : undefined}
          onChange={(e) => {
            setMonth(e.target.value);
            setPalletDays('');
          }}
        />
        <SelectField
          label="Charging basis"
          required
          options={(['Sq.ft per period', 'Pallet-day', 'CBM-day'] as StorageBasis[]).map((b) => ({
            value: b,
            label: b,
          }))}
          value={basis}
          hint={basis === 'Sq.ft per period' ? 'Dry storage by floor area for the whole period' : undefined}
          onChange={(e) => {
            setBasis(e.target.value as StorageBasis);
            setPalletDays('');
          }}
        />
        <TextField
          label={`Rate per ${unit.toLowerCase()} (AED)`}
          type="number"
          step="0.01"
          required
          value={rate}
          error={errors.rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      <TextField
        label={
          basis === 'Sq.ft per period' ? 'Area (sq.ft)' : basis === 'CBM-day' ? 'CBM-days' : 'Pallet-days'
        }
        type="number"
        required
        value={palletDays}
        placeholder={
          basis === 'Pallet-day' && suggested !== undefined
            ? String(suggested)
            : `e.g. ${basis === 'Sq.ft per period' ? '2600' : '120'}`
        }
        error={errors.palletDays}
        hint={
          basis === 'Pallet-day' && suggested !== undefined
            ? `Suggested ${formatNumber(suggested)} from current pallets × days. Leave empty to use it.`
            : undefined
        }
        onChange={(e) => setPalletDays(e.target.value)}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Free days"
          type="number"
          min={0}
          value={freeDays}
          error={errors.freeDays}
          disabled={basis === 'Sq.ft per period'}
          hint={
            basis === 'Sq.ft per period'
              ? 'Not used for area billing'
              : terms.contractNumber && terms.freeDays !== undefined
                ? `From contract ${terms.contractNumber}`
                : 'Days at the start of the period not charged'
          }
          onChange={(e) => setFreeDays(e.target.value)}
        />
        <TextField
          label="Minimum charge (AED)"
          type="number"
          min={0}
          step="0.01"
          value={minimum}
          error={errors.minimum}
          hint={
            terms.contractNumber && terms.minimumCharge !== undefined
              ? `Minimum monthly storage from contract ${terms.contractNumber}`
              : 'Billed when the computed amount is lower'
          }
          onChange={(e) => setMinimum(e.target.value)}
        />
      </div>
      <div className="space-y-1 rounded-xl bg-canvas px-4 py-3 text-body-s">
        <div className="flex items-center justify-between">
          <span className="text-fg-muted">Run amount (excl. VAT)</span>
          <span className="text-[18px] font-semibold tabular-nums">{formatMoney(amount)}</span>
        </div>
        {charge.chargeableQty !== effectivePd ? (
          <p className="text-caption text-fg-muted">
            Charged quantity {formatNumber(charge.chargeableQty)} {unit.toLowerCase()} after free days.
          </p>
        ) : null}
        {charge.minimumApplied ? (
          <p className="text-caption font-medium text-info">
            Minimum applied: computed {formatMoney(charge.computed)} is below the minimum.
          </p>
        ) : null}
      </div>
      {generate.error ? (
        <StatusMessage
          kind="error"
          title="Run not generated"
          description={generate.error instanceof Error ? generate.error.message : undefined}
        />
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button busy={generate.isPending} onClick={submit}>
          Generate run
        </Button>
      </div>
    </div>
  );
}
