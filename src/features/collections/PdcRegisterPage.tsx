import { useState } from 'react';
import type { PdcStatus } from '@/domain/types';
import { Badge, type Tone } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import {
  useChequeAction,
  usePdcRegister,
  type ChequeAction,
  type IssuedCheque,
  type ReceivedCheque,
} from './api';

const TONE: Record<PdcStatus, Tone> = {
  Pending: 'warning',
  Deposited: 'info',
  Cleared: 'success',
  Bounced: 'danger',
};

export function PdcStatusBadge({ status }: { status: PdcStatus }) {
  return <Badge tone={TONE[status]}>{status}</Badge>;
}

/** A5 PDC register: received cheques by maturity (Pending → Deposited → Cleared / Bounced) and issued cheques. */
export function PdcRegisterPage() {
  const { data, isLoading, error } = usePdcRegister();
  const action = useChequeAction();
  const toast = useToast();
  const [tab, setTab] = useState<'received' | 'issued'>('received');
  const [bounce, setBounce] = useState<ReceivedCheque | null>(null);
  const [reason, setReason] = useState('');
  const [charge, setCharge] = useState('');
  const [formError, setFormError] = useState<string>();

  const run = (a: ChequeAction, title: string) =>
    action.mutate(a, {
      onSuccess: () => toast({ title }),
      onError: (e) =>
        toast({ title: 'Not done', body: e instanceof Error ? e.message : 'Please try again.' }),
    });

  const maturityCell = (maturity: string, status: PdcStatus) => (
    <div className="whitespace-nowrap">
      <p>{formatDate(maturity)}</p>
      {status !== 'Cleared' && status !== 'Bounced' && maturity <= PROTO_TODAY ? (
        <p className="text-caption font-medium text-warning">Due now</p>
      ) : null}
    </div>
  );

  const received: Column<ReceivedCheque>[] = [
    { key: 'maturity', header: 'Maturity', cell: (r) => maturityCell(r.maturity, r.pdcStatus) },
    {
      key: 'cheque',
      header: 'Cheque',
      cell: (r) => (
        <div>
          <p className="font-mono text-[13px]">{r.chequeNo}</p>
          <p className="text-caption text-fg-muted">
            {r.bankName} · {r.isPostDated ? 'PDC' : 'Current-dated'}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.customerName}</p>
          <DocRef>{r.number}</DocRef>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => <Money amount={r.amount} className="font-medium" />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div>
          <PdcStatusBadge status={r.pdcStatus} />
          {r.bounceReason ? <p className="mt-1 text-caption text-fg-muted">{r.bounceReason}</p> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.pdcStatus === 'Pending' || r.pdcStatus === 'Deposited' ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {r.pdcStatus === 'Pending' && r.isPostDated ? (
              <Button
                size="sm"
                variant="secondary"
                busy={action.isPending}
                onClick={() => run({ kind: 'deposit', id: r.id }, `${r.number} deposited`)}
              >
                Deposit
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              busy={action.isPending}
              onClick={() => run({ kind: 'clear', id: r.id }, `${r.number} cleared`)}
            >
              Cleared
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setBounce(r);
                setReason('');
                setCharge('');
                setFormError(undefined);
              }}
            >
              Bounced
            </Button>
          </div>
        ) : null,
    },
  ];

  const issued: Column<IssuedCheque>[] = [
    { key: 'maturity', header: 'Maturity', cell: (r) => maturityCell(r.maturity, r.pdcStatus) },
    {
      key: 'cheque',
      header: 'Cheque',
      cell: (r) => (
        <div>
          <p className="font-mono text-[13px]">{r.chequeNo}</p>
          <DocRef>{r.number}</DocRef>
        </div>
      ),
    },
    { key: 'vendor', header: 'Vendor', cell: (r) => <p className="min-w-40 font-medium">{r.vendorName}</p> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => <Money amount={r.amount} className="font-medium" />,
    },
    { key: 'status', header: 'Status', cell: (r) => <PdcStatusBadge status={r.pdcStatus} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === 'PDC issued' ? (
          <Button
            size="sm"
            variant="secondary"
            busy={action.isPending}
            onClick={() => run({ kind: 'clear-issued', id: r.id }, `${r.number} cleared from the bank`)}
          >
            Cleared
          </Button>
        ) : null,
    },
  ];

  const pendingReceived = data?.received.filter(
    (r) => r.pdcStatus === 'Pending' || r.pdcStatus === 'Deposited',
  );
  const pendingIssued = data?.issued.filter((r) => r.pdcStatus === 'Pending');

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Receipts', to: '/collections' }, { label: 'PDC register' }]}
        title="PDC register"
        description="Cheques received from customers and issued to vendors, by maturity date."
      />
      <p className="mb-4 text-caption text-fg-muted">
        Postings are illustrative and pending accountant sign-off.
      </p>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-body-s text-fg-muted">Received cheques not yet cleared</p>
          <p className="mt-1 text-[22px] font-semibold">
            <Money amount={(pendingReceived ?? []).reduce((s, r) => s + r.amount, 0)} />
          </p>
          <p className="text-caption text-fg-muted">{pendingReceived?.length ?? 0} cheque(s)</p>
        </Card>
        <Card className="p-5">
          <p className="text-body-s text-fg-muted">Issued cheques not yet presented</p>
          <p className="mt-1 text-[22px] font-semibold">
            <Money amount={(pendingIssued ?? []).reduce((s, r) => s + r.amount, 0)} />
          </p>
          <p className="text-caption text-fg-muted">{pendingIssued?.length ?? 0} cheque(s)</p>
        </Card>
      </div>
      <Card>
        <div className="px-5 pt-4">
          <Tabs
            label="Cheque register"
            value={tab}
            onChange={(v) => setTab(v as 'received' | 'issued')}
            items={[
              { value: 'received', label: 'Received', count: data?.received.length },
              { value: 'issued', label: 'Issued', count: data?.issued.length },
            ]}
          />
        </div>
        {tab === 'received' ? (
          <DataTable
            caption="Received cheques"
            columns={received}
            rows={data?.received}
            rowKey={(r) => r.id}
            loading={isLoading}
            error={error}
            emptyTitle="No cheques received"
          />
        ) : (
          <DataTable
            caption="Issued cheques"
            columns={issued}
            rows={data?.issued}
            rowKey={(r) => r.id}
            loading={isLoading}
            error={error}
            emptyTitle="No cheques issued"
          />
        )}
      </Card>

      <Dialog
        open={!!bounce}
        onClose={() => setBounce(null)}
        title={bounce ? `Cheque ${bounce.chequeNo} bounced` : 'Cheque bounced'}
        description="If the cheque was already posted, the receipt is reversed and its invoices become unpaid again. Staff are notified."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBounce(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={action.isPending}
              onClick={() => {
                if (!bounce) return;
                if (reason.trim().length < 3) return setFormError('Give the bounce reason');
                const c = Number(charge) || 0;
                if (c < 0) return setFormError('The charge cannot be negative');
                action.mutate(
                  { kind: 'bounce', id: bounce.id, reason: reason.trim(), charge: c },
                  {
                    onSuccess: (r) => {
                      toast({
                        title: `${bounce.number} marked bounced`,
                        body: r.chargeInvoice ? `Bounce charge drafted on ${r.chargeInvoice}` : undefined,
                      });
                      setBounce(null);
                    },
                    onError: (e) => setFormError(e instanceof Error ? e.message : 'Please try again.'),
                  },
                );
              }}
            >
              Mark bounced
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {bounce ? (
            <p className="text-body-s text-fg-secondary">
              {bounce.customerName} · <Money amount={bounce.amount} className="font-semibold" />
            </p>
          ) : null}
          <TextareaField
            label="Bounce reason"
            required
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setFormError(undefined);
            }}
            placeholder="e.g. Insufficient funds"
          />
          <TextField
            label="Bounce charge to the customer (AED, optional)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={charge}
            hint="Drafted as a customer invoice line for review."
            onChange={(e) => setCharge(e.target.value)}
          />
          {formError ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
