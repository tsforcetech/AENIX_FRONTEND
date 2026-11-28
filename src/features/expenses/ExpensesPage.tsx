import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { Expense } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { KpiCard } from '@/shared/ui/KpiCard';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import {
  useCreateExpense,
  useExpenses,
  useExpenseSummary,
  usePostExpense,
  useTopUpPettyCash,
  type ExpenseRow,
} from './api';

const route = getRouteApi('/_app/expenses');
const STATUSES: Expense['status'][] = ['Draft', 'Pending approval', 'Posted'];
const PAID_FROM: Expense['paidFrom'][] = ['Bank', 'Petty cash', 'Credit card'];
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/** A18 overheads outside jobs: rent, salaries, utilities, petty cash. */
export function ExpensesPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/expenses' });
  const toast = useToast();
  const { data, isLoading, isFetching, error } = useExpenses({
    page: search.page,
    status: search.status,
    search: search.q,
    paidFrom: search.paidFrom,
    accountId: search.accountId,
  });
  const summary = useExpenseSummary();
  const post = usePostExpense();
  const [newOpen, setNewOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const columns: Column<ExpenseRow>[] = [
    {
      key: 'number',
      header: 'Expense',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
        </div>
      ),
    },
    {
      key: 'desc',
      header: 'Description',
      cell: (r) => (
        <div className="min-w-48">
          <p className="font-medium">{r.description}</p>
          <p className="text-caption text-fg-muted">
            {r.payee}
            {r.reference ? ` · ${r.reference}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'account',
      header: 'Account',
      hideOnMobile: true,
      cell: (r) => <span className="whitespace-nowrap">{r.accountLabel}</span>,
    },
    { key: 'paid', header: 'Paid from', hideOnMobile: true, cell: (r) => r.paidFrom },
    {
      key: 'total',
      header: 'Total incl. VAT',
      align: 'right',
      cell: (r) => <Money amount={r.total} className="whitespace-nowrap font-medium" />,
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
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
                onSuccess: (e) =>
                  toast({
                    title: e.status === 'Posted' ? `${r.number} posted` : `${r.number} sent for approval`,
                  }),
                onError: (e) => toast({ title: 'Not posted', body: errText(e) }),
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
        title="Expenses"
        description="Overheads outside jobs: rent, salaries, utilities and petty cash. Job costs go on purchase orders."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Wallet aria-hidden="true" />}
              onClick={() => setTopUpOpen(true)}
            >
              Top up petty cash
            </Button>
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setNewOpen(true)}>
              New expense
            </Button>
          </>
        }
      />
      <p className="mb-1 text-caption text-fg-muted">
        Postings are illustrative and pending accountant sign-off.
      </p>
      <p className="mb-4 text-caption text-fg-muted">
        Payroll and fixed assets stay outside AENIX until the owner decides.
      </p>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Petty cash balance"
          value={<Money amount={summary.data?.pettyCashBalance ?? 0} />}
          footnote={
            <span className="text-fg-muted">
              Spent this month: <Money amount={summary.data?.pettyCashSpentMonth ?? 0} />
            </span>
          }
        />
        <KpiCard label="Posted this month" value={<Money amount={summary.data?.postedMonth ?? 0} />} />
        <KpiCard label="Waiting for approval" value={summary.data?.pendingApproval ?? '…'} />
      </div>
      <Card>
        <CardBody className="grid gap-4 border-b border-border-subtle sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Paid from"
            value={search.paidFrom ?? ''}
            placeholder="All"
            options={PAID_FROM.map((p) => ({ value: p, label: p }))}
            onChange={(e) =>
              void navigate({
                search: (p) => ({
                  ...p,
                  paidFrom: (e.target.value || undefined) as Expense['paidFrom'] | undefined,
                  page: undefined,
                }),
              })
            }
          />
          <SelectField
            label="Account"
            value={search.accountId ?? ''}
            placeholder="All accounts"
            options={summary.data?.accounts ?? []}
            onChange={(e) =>
              void navigate({
                search: (p) => ({ ...p, accountId: e.target.value || undefined, page: undefined }),
              })
            }
          />
        </CardBody>
        <ListToolbar
          tabs={statusTabs(STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search expense, payee, account…"
        />
        <DataTable
          caption="Expenses"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          emptyTitle="No expenses match"
          emptyDescription="Try another filter."
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
      {newOpen ? (
        <NewExpenseDialog accounts={summary.data?.accounts ?? []} onClose={() => setNewOpen(false)} />
      ) : null}
      {topUpOpen ? <TopUpDialog onClose={() => setTopUpOpen(false)} /> : null}
    </div>
  );
}

function NewExpenseDialog({
  accounts,
  onClose,
}: {
  accounts: { value: string; label: string }[];
  onClose: () => void;
}) {
  const create = useCreateExpense();
  const toast = useToast();
  const [date, setDate] = useState(PROTO_TODAY);
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [payee, setPayee] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState('0.05');
  const [paidFrom, setPaidFrom] = useState<Expense['paidFrom']>('Bank');
  const [error, setError] = useState<string>();
  const net = Number(amount) || 0;
  const vat = Math.round(net * Number(vatRate) * 100) / 100;

  const submit = (post: boolean) => {
    setError(undefined);
    if (!accountId) return setError('Choose the expense account.');
    if (!(net > 0)) return setError('Enter the amount before VAT.');
    create.mutate(
      {
        post,
        input: {
          date,
          accountId,
          description,
          payee,
          reference,
          amount: net,
          vatRate: Number(vatRate),
          paidFrom,
        },
      },
      {
        onSuccess: (e) => {
          toast({
            title:
              e.status === 'Posted'
                ? `${e.number} posted`
                : e.status === 'Pending approval'
                  ? `${e.number} sent for approval`
                  : `${e.number} saved as draft`,
          });
          onClose();
        },
        onError: (e) => setError(errText(e)),
      },
    );
  };
  useFormShortcuts({ onSave: () => submit(false), onPrimary: () => submit(true) });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="New expense"
      description="Overheads only. Expenses at or above the approval limit wait for the Finance manager."
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
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField
          label="Expense account"
          required
          value={accountId}
          placeholder="Select account"
          options={accounts}
          onChange={(e) => setAccountId(e.target.value)}
        />
        <TextField
          label="Description"
          required
          className="sm:col-span-2"
          value={description}
          placeholder="e.g. DEWA — November"
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField label="Payee" required value={payee} onChange={(e) => setPayee(e.target.value)} />
        <TextField label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
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
            { value: '0.05', label: '5% (recoverable)' },
            { value: '0', label: '0% / no VAT' },
          ]}
        />
        <SelectField
          label="Paid from"
          value={paidFrom}
          onChange={(e) => setPaidFrom(e.target.value as Expense['paidFrom'])}
          options={PAID_FROM.map((p) => ({ value: p, label: p }))}
        />
        <div className="self-end rounded-lg bg-canvas p-3 text-body-s">
          Total <Money amount={net + vat} className="font-semibold" /> (VAT <Money amount={vat} />)
        </div>
        {error ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function TopUpDialog({ onClose }: { onClose: () => void }) {
  const topUp = useTopUpPettyCash();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Top up petty cash"
      description="Cash withdrawn from the bank for the petty cash box (Dr 1120 / Cr 1110)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={topUp.isPending}
            onClick={() =>
              topUp.mutate(
                { amount: Number(amount), date: PROTO_TODAY },
                {
                  onSuccess: () => {
                    toast({ title: 'Petty cash topped up' });
                    onClose();
                  },
                  onError: (e) => setError(errText(e)),
                },
              )
            }
          >
            Top up
          </Button>
        </>
      }
    >
      <TextField
        label="Amount (AED)"
        type="number"
        inputMode="decimal"
        step="0.01"
        required
        value={amount}
        error={error}
        onChange={(e) => {
          setAmount(e.target.value);
          setError(undefined);
        }}
      />
    </Dialog>
  );
}
