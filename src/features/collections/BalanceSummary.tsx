import type { CustomerBalance } from '@/domain/balances';
import { Card, CardBody } from '@/shared/ui/Card';
import { Money } from '@/shared/ui/Money';

/** Exact customer position shown before money is allocated (prototype maths; the ledger is the authority). */
export function BalanceSummary({ balance, loading }: { balance?: CustomerBalance; loading?: boolean }) {
  const items: { label: string; value?: number; tone?: string; hint?: string }[] = [
    { label: 'Invoiced', value: balance?.invoiced },
    { label: 'Received', value: balance?.received },
    {
      label: 'Advances held',
      value: balance ? balance.advances + balance.unallocated : undefined,
      hint: 'Not yet applied to an invoice',
    },
    {
      label: 'Outstanding on invoices',
      value: balance?.outstanding,
      tone: balance && balance.outstanding > 0 ? 'text-danger' : undefined,
    },
    {
      label: 'Net balance',
      value: balance?.balance,
      tone: balance ? (balance.balance > 0 ? 'text-danger' : 'text-success') : undefined,
      hint: balance && balance.balance < 0 ? 'Customer is in credit' : 'Customer owes us',
    },
  ];
  return (
    <Card aria-busy={loading || undefined}>
      <CardBody className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-wide text-fg-muted">{it.label}</p>
            <p className={`mt-1 text-[17px] font-semibold tabular-nums ${it.tone ?? 'text-fg'}`}>
              {it.value === undefined ? '…' : <Money amount={it.value} />}
            </p>
            {it.hint ? <p className="text-caption text-fg-muted">{it.hint}</p> : null}
          </div>
        ))}
        {balance && (balance.credited > 0 || balance.writtenOff > 0) ? (
          <p className="text-caption text-fg-muted sm:col-span-3 lg:col-span-5">
            {balance.credited > 0 ? (
              <>
                Credit notes: <Money amount={balance.credited} />.{' '}
              </>
            ) : null}
            {balance.writtenOff > 0 ? (
              <>
                Written off: <Money amount={balance.writtenOff} />.
              </>
            ) : null}
          </p>
        ) : null}
        {balance && (balance.pdcPending > 0 || balance.notYetInvoiced > 0) ? (
          <p className="text-caption text-fg-muted sm:col-span-3 lg:col-span-5">
            {balance.pdcPending > 0 ? (
              <>
                PDCs pending: <Money amount={balance.pdcPending} />.{' '}
              </>
            ) : null}
            {balance.notYetInvoiced > 0 ? (
              <>
                Confirmed sales orders not yet invoiced: <Money amount={balance.notYetInvoiced} />.
              </>
            ) : null}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
