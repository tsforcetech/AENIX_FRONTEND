import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { DebitNote } from '@/domain/types';
import { Badge, type Tone } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import {
  useCreateDebitNote,
  useDebitNotes,
  useDebitNoteTargets,
  usePostDebitNote,
  useVendorBalance,
  type DebitNoteRow,
} from './api';

const route = getRouteApi('/_app/vendor-bills/debit-notes');
const STATUSES: DebitNote['status'][] = ['Draft', 'Posted', 'Adjusted'];
const TONE: Record<DebitNote['status'], Tone> = { Draft: 'neutral', Posted: 'info', Adjusted: 'success' };

/** A10 debit notes to vendors: from variances (drafted by the warehouse) or raised manually. */
export function DebitNotesPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/vendor-bills/debit-notes' });
  const toast = useToast();
  const { data, isLoading, isFetching, error } = useDebitNotes({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  const post = usePostDebitNote();
  const [open, setOpen] = useState(false);

  const columns: Column<DebitNoteRow>[] = [
    {
      key: 'number',
      header: 'Debit note',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.vendorName}</p>
          <p className="font-mono text-caption text-fg-muted">
            {[r.billNumber, r.poNumber, r.varianceNumber].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideOnMobile: true,
      cell: (r) => <p className="min-w-48">{r.reason}</p>,
    },
    {
      key: 'total',
      header: 'Total incl. VAT',
      align: 'right',
      cell: (r) => <Money amount={r.total} className="whitespace-nowrap font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div>
          <Badge tone={TONE[r.status]}>{r.status}</Badge>
          {r.status === 'Adjusted' ? <p className="text-caption text-fg-muted">Set off on the bill</p> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === 'Draft' ? (
          <Button
            size="sm"
            variant="secondary"
            busy={post.isPending}
            onClick={() =>
              post.mutate(r.id, {
                onSuccess: (d) =>
                  toast({
                    title: `${r.number} posted`,
                    body:
                      d.status === 'Adjusted'
                        ? 'Vendor payable reduced on the bill'
                        : 'Vendor payable reduced',
                  }),
                onError: (e) =>
                  toast({ title: 'Not posted', body: e instanceof Error ? e.message : 'Try again.' }),
              })
            }
          >
            Post
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Purchase invoices', to: '/vendor-bills' }, { label: 'Debit notes' }]}
        title="Debit notes"
        description="Claims against vendors (shortage, damage, overcharge). Posting reduces what we owe the vendor."
        actions={
          <Button icon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>
            New debit note
          </Button>
        }
      />
      <p className="mb-4 text-caption text-fg-muted">
        Postings are illustrative and pending accountant sign-off: Dr vendor payable / Cr 5100 job cost (6600
        for shortage / damage) and VAT input.
      </p>
      <Card>
        <ListToolbar
          tabs={statusTabs(STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search debit note, vendor, bill, PO…"
        />
        <DataTable
          caption="Debit notes"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          emptyTitle="No debit notes"
          emptyDescription="Drafts appear here when a variance is resolved as a vendor debit note."
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
      {open ? <NewDebitNoteDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function NewDebitNoteDialog({ onClose }: { onClose: () => void }) {
  const targets = useDebitNoteTargets(true);
  const create = useCreateDebitNote();
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState('0.05');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [error, setError] = useState<string>();
  const chosen = targets.data?.find((t) => t.value === target);
  const balance = useVendorBalance(chosen?.vendorId);

  const submit = (post: boolean) => {
    setError(undefined);
    if (!chosen) return setError('Choose the purchase invoice or PO.');
    const n = Number(amount);
    if (!(n > 0)) return setError('Enter the amount before VAT.');
    if (reason.trim().length < 5) return setError('Give a reason of at least 5 characters.');
    const [kind, id] = target.split(':') as ['bill' | 'po', string];
    create.mutate(
      {
        post,
        input: {
          vendorBillId: kind === 'bill' ? id : undefined,
          purchaseOrderId: kind === 'po' ? id : undefined,
          amount: n,
          vatRate: Number(vatRate),
          reason: reason.trim(),
          date,
        },
      },
      {
        onSuccess: (dn) => {
          toast({ title: `${dn.number} ${post ? 'posted' : 'saved as draft'}` });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Please try again.'),
      },
    );
  };
  useFormShortcuts({ onSave: () => submit(false), onPrimary: () => submit(true) });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="New debit note"
      description="Raise against an open purchase invoice (set off on the bill) or a PO not billed yet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" busy={create.isPending} onClick={() => submit(false)}>
            Save draft
          </Button>
          <Button busy={create.isPending} onClick={() => submit(true)}>
            Post
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Against"
          required
          className="sm:col-span-2"
          value={target}
          placeholder={targets.isLoading ? 'Loading…' : 'Select purchase invoice or PO'}
          options={(targets.data ?? []).map((t) => ({ value: t.value, label: t.label }))}
          onChange={(e) => {
            setTarget(e.target.value);
            const t = targets.data?.find((x) => x.value === e.target.value);
            if (t) setVatRate(String(t.vatRate));
          }}
        />
        <TextField
          label="Amount before VAT (AED)"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <SelectField
          label="VAT"
          value={vatRate}
          onChange={(e) => setVatRate(e.target.value)}
          options={[
            { value: '0.05', label: '5%' },
            { value: '0', label: '0%' },
          ]}
        />
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextareaField
          label="Reason"
          required
          className="sm:col-span-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. 3 cartons short on delivery, agreed with the vendor"
        />
        {balance.data ? (
          <dl className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-3 text-body-s sm:col-span-2">
            <dt className="text-fg-muted">Vendor billed</dt>
            <dd className="text-right">
              <Money amount={balance.data.billed} />
            </dd>
            <dt className="text-fg-muted">Paid (cash)</dt>
            <dd className="text-right">
              <Money amount={balance.data.paidCash} />
            </dd>
            <dt className="text-fg-muted">Debit notes</dt>
            <dd className="text-right">
              <Money amount={balance.data.debitNotes + balance.data.unappliedDebitNotes} />
            </dd>
            <dt className="font-medium">We owe now</dt>
            <dd className="text-right font-semibold">
              <Money amount={balance.data.outstanding} />
            </dd>
          </dl>
        ) : null}
        {error ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
