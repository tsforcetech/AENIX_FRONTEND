import { FileSpreadsheet, Link2, Unlink, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { BookItem } from '@/domain/reconcile';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { KpiCard } from '@/shared/ui/KpiCard';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SpreadsheetImport, type ImportField } from '@/shared/ui/SpreadsheetImport';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { useBankRec, useBankRecAction, vendorOrCustomer, type BankRecLine } from './closing';

const STATEMENT_FIELDS: ImportField[] = [
  {
    key: 'date',
    label: 'Date',
    required: true,
    aliases: ['date', 'value date', 'transaction date', 'posting date'],
  },
  {
    key: 'description',
    label: 'Description',
    aliases: ['description', 'details', 'narration', 'particulars'],
  },
  { key: 'reference', label: 'Reference', aliases: ['reference', 'ref', 'cheque no', 'cheque', 'ref no'] },
  {
    key: 'amount',
    label: 'Amount (+ in / − out)',
    required: true,
    type: 'number',
    aliases: ['amount', 'net amount'],
  },
];

/** Accepts YYYY-MM-DD or DD/MM/YYYY. */
function isoDate(v: string): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : s;
}

/** A13 bank reconciliation: statement lines vs receipts, payments and expenses in the books. */
export function BankReconciliationPage() {
  const { data, isLoading, error } = useBankRec();
  const action = useBankRecAction();
  const toast = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [matchLine, setMatchLine] = useState<BankRecLine | null>(null);

  const run = (a: Parameters<typeof action.mutate>[0]) =>
    action.mutate(a, {
      onSuccess: (msg) => toast({ title: msg }),
      onError: (e) =>
        toast({ title: 'Not done', body: e instanceof Error ? e.message : 'Please try again.' }),
    });

  const columns: Column<BankRecLine>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span>,
    },
    {
      key: 'desc',
      header: 'Description',
      cell: (r) => (
        <div className="min-w-40">
          <p>{r.description}</p>
          <p className="font-mono text-caption text-fg-muted">{r.reference}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => (
        <span className={r.amount < 0 ? 'whitespace-nowrap text-danger' : 'whitespace-nowrap'}>
          <Money amount={r.amount} />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Match',
      cell: (r) =>
        r.matched ? (
          <div>
            <Badge tone="success">Matched</Badge>
            <p className="mt-1 text-caption text-fg-muted">
              {r.matched.kind} · <span className="font-mono">{r.matched.ref}</span>
            </p>
          </div>
        ) : (
          <div>
            <Badge tone="warning">Not matched</Badge>
            {r.suggestedCharge ? (
              <p className="mt-1 text-caption text-fg-muted">Looks like a bank charge</p>
            ) : null}
          </div>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.matched ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Unlink aria-hidden="true" />}
            onClick={() => run({ kind: 'unmatch', lineId: r.id })}
          >
            Unmatch
          </Button>
        ) : (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              icon={<Link2 aria-hidden="true" />}
              onClick={() => setMatchLine(r)}
            >
              Match
            </Button>
            {r.amount < 0 ? (
              <Button size="sm" variant="secondary" onClick={() => run({ kind: 'charge', lineId: r.id })}>
                Book as bank charge
              </Button>
            ) : null}
          </div>
        ),
    },
  ];

  const candidates = (data?.openItems ?? []).filter(
    (i) => matchLine && Math.abs(i.amount - matchLine.amount) < 0.005,
  );

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Accounting', to: '/accounting' }, { label: 'Bank reconciliation' }]}
        title="Bank reconciliation"
        description={`Statement lines for ${data?.bankAccount ?? 'the bank account'} matched to receipts, payments and expenses.`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet aria-hidden="true" />}
              onClick={() => setImportOpen(true)}
            >
              Import statement
            </Button>
            <Button
              icon={<Wand2 aria-hidden="true" />}
              busy={action.isPending}
              onClick={() => run({ kind: 'auto' })}
            >
              Auto-match
            </Button>
          </>
        }
      />
      <p className="mb-4 text-caption text-fg-muted">
        Illustrative — pending accountant sign-off. Opening balances are assumed zero in the prototype.
      </p>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Book balance (bank ledger)" value={<Money amount={data?.bookBalance ?? 0} />} />
        <KpiCard label="Bank statement balance" value={<Money amount={data?.bankBalance ?? 0} />} />
        <KpiCard
          label="Difference"
          value={<Money amount={data?.difference ?? 0} />}
          footnote={<span className="text-fg-muted">Explained by items not yet on the statement</span>}
        />
        <KpiCard label="Statement lines not matched" value={data?.unmatched ?? '…'} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <DataTable
            caption="Bank statement lines"
            columns={columns}
            rows={data?.lines}
            rowKey={(r) => r.id}
            loading={isLoading}
            error={error}
            emptyTitle="No statement lines"
            emptyDescription="Import the bank statement (CSV or Excel)."
          />
        </Card>
        <Card className="self-start">
          <CardHeader
            title="In the books, not on the statement"
            description="Unreconciled receipts, payments and expenses"
          />
          <CardBody>
            {data?.openItems.length ? (
              <ul className="divide-y divide-border-subtle">
                {data.openItems.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-body-s">
                    <div className="min-w-0">
                      <p className="font-mono text-[13px] font-medium text-brand">{i.ref}</p>
                      <p className="truncate text-caption text-fg-muted">
                        {i.kind} · {formatDate(i.date)} · {vendorOrCustomer(i)}
                      </p>
                    </div>
                    <Money amount={i.amount} className="whitespace-nowrap" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-fg-muted">Everything in the books is reconciled.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={!!matchLine}
        onClose={() => setMatchLine(null)}
        title="Match statement line"
        description={
          matchLine
            ? `${matchLine.description} · ${matchLine.reference} · ${formatDate(matchLine.date)}`
            : undefined
        }
      >
        {candidates.length === 0 ? (
          <p className="text-body-s text-fg-muted">
            No unreconciled book item has exactly this amount. Record the receipt, payment or expense first
            {matchLine && matchLine.amount < 0 ? ', or book it as a bank charge.' : '.'}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {candidates.map((i: BookItem) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-body-s">
                <div>
                  <p className="font-mono font-medium">{i.ref}</p>
                  <p className="text-caption text-fg-muted">
                    {i.kind} · {formatDate(i.date)} · {vendorOrCustomer(i)}
                  </p>
                </div>
                <Button
                  size="sm"
                  busy={action.isPending}
                  onClick={() => {
                    if (!matchLine) return;
                    run({ kind: 'match', lineId: matchLine.id, itemId: i.id });
                    setMatchLine(null);
                  }}
                >
                  Match {i.ref}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import bank statement"
        description="Date, description, reference and amount (+ money in, − money out)."
        fields={STATEMENT_FIELDS}
        templateKey="BANK:1110"
        partyName="Bank — current account"
        onImport={(rows) =>
          run({
            kind: 'import',
            rows: rows.map((r) => ({
              date: isoDate(String(r.date ?? '')),
              description: String(r.description ?? ''),
              reference: String(r.reference ?? ''),
              amount: Number(r.amount),
            })),
          })
        }
      />
    </div>
  );
}
