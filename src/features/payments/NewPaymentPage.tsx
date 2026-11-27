import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Info, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PaymentMethod } from '@/domain/types';
import { useVendorOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoney } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import { paymentsApi, useCreatePayment, useVendorOpenBills } from './api';

const route = getRouteApi('/_app/payments/new');
const METHODS: PaymentMethod[] = ['Bank transfer', 'Cheque', 'PDC', 'Cash', 'Card'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Payment voucher: pay one or more approved purchase invoices of a vendor. */
export function NewPaymentPage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const toast = useToast();
  const vendors = useVendorOptions();
  const preset = useMemo(
    () => search.vendorId ?? (search.billId ? paymentsApi.billVendor(search.billId) : undefined) ?? '',
    [search.vendorId, search.billId],
  );
  const [vendorId, setVendorId] = useState(preset);
  const bills = useVendorOpenBills(vendorId || undefined);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [date, setDate] = useState(PROTO_TODAY);
  const [method, setMethod] = useState<PaymentMethod>('Bank transfer');
  const [reference, setReference] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [error, setError] = useState<string | undefined>();
  const create = useCreatePayment();

  const amountFor = (billId: string, outstanding: number) =>
    alloc[billId] !== undefined ? Number(alloc[billId]) || 0 : billId === search.billId ? outstanding : 0;
  const rows = (bills.data ?? []).map((b) => ({ ...b, pay: amountFor(b.id, b.outstanding) }));
  const total = r2(rows.reduce((s, b) => s + b.pay, 0));
  const isCheque = method === 'PDC' || method === 'Cheque';

  const autoAllocate = () => {
    const pool = rows.reduce((s, b) => s + b.outstanding, 0);
    const next: Record<string, string> = {};
    let left = pool;
    rows.forEach((b) => {
      const amt = r2(Math.min(left, b.outstanding));
      next[b.id] = String(amt);
      left = r2(left - amt);
    });
    setAlloc(next);
  };

  const submit = async () => {
    setError(undefined);
    if (!vendorId) return setError('Choose a vendor.');
    if (rows.some((b) => b.pay < 0 || b.pay > b.outstanding + 0.005))
      return setError('A payment line is negative or more than the bill outstanding.');
    if (total <= 0) return setError('Enter an amount against at least one bill.');
    if (reference.trim().length < 2) return setError('Enter the bank or cheque reference.');
    if (isCheque && !chequeDate) return setError('Enter the cheque date.');
    try {
      const pv = await create.mutateAsync({
        vendorId,
        date,
        method,
        reference: reference.trim(),
        chequeDate: isCheque ? chequeDate : undefined,
        amount: total,
        allocations: rows.filter((b) => b.pay > 0).map((b) => ({ billId: b.id, amount: b.pay })),
      });
      toast({
        title: `${pv.number} saved`,
        body: `${formatMoney(pv.amount)} to ${vendors.data?.find((v) => v.value === vendorId)?.label ?? 'vendor'}`,
      });
      void navigate({ to: '/payments' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the payment.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New payment"
        crumbs={[{ label: 'Payments', to: '/payments' }, { label: 'New' }]}
        description="Pay a vendor against approved purchase invoices. The voucher amount is the total allocated."
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Payment voucher" />
          <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Vendor"
              required
              className="sm:col-span-2 lg:col-span-3"
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                setAlloc({});
              }}
              placeholder={vendors.isLoading ? 'Loading…' : 'Select vendor'}
              options={vendors.data ?? []}
            />
            <TextField
              label="Payment date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <SelectField
              label="Method"
              required
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={METHODS.map((m) => ({ value: m, label: m }))}
            />
            <TextField
              label={isCheque ? 'Cheque no. & bank' : 'Bank reference'}
              required
              value={reference}
              placeholder={isCheque ? 'e.g. CHQ 118204 — Mashreq' : 'e.g. TT771230'}
              onChange={(e) => setReference(e.target.value)}
            />
            {isCheque ? (
              <TextField
                label="Cheque date"
                type="date"
                required
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
              />
            ) : null}
            {method === 'PDC' ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-caption text-warning sm:col-span-2 lg:col-span-3">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Post-dated cheque: the bills are settled now against “PDC issued”; the bank is only debited
                when you mark the cheque presented.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Bills to pay"
            description={
              vendorId
                ? 'Approved purchase invoices with an open balance, oldest due first'
                : 'Choose a vendor'
            }
            actions={
              rows.length ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Wand2 aria-hidden="true" />}
                  onClick={autoAllocate}
                >
                  Pay all oldest first
                </Button>
              ) : null
            }
          />
          <CardBody className="pt-3">
            {vendorId && bills.data?.length === 0 ? (
              <StatusMessage
                kind="empty"
                title="Nothing to pay"
                description="This vendor has no approved purchase invoices with an open balance."
              />
            ) : null}
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-s">
                  <caption className="sr-only">Bills to pay</caption>
                  <thead>
                    <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="py-2 pr-3 text-left font-medium">
                        Purchase invoice
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        Due
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Outstanding
                      </th>
                      <th scope="col" className="py-2 pl-3 text-right font-medium">
                        Pay (AED)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b) => {
                      const bad = b.pay < 0 || b.pay > b.outstanding + 0.005;
                      return (
                        <tr key={b.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-3 pr-3">
                            <DocRef>{b.number}</DocRef>
                            <p className="text-caption text-fg-muted">
                              {b.vendorRef || '—'}
                              {b.workOrderNumber ? ` · ${b.workOrderNumber}` : ''}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {formatDate(b.dueDate)}
                            {b.status === 'Overdue' ? (
                              <span className="block text-caption font-medium text-danger">Overdue</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Money amount={b.outstanding} className="whitespace-nowrap" />
                          </td>
                          <td className="w-44 py-3 pl-3">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min={0}
                              aria-label={`Pay against ${b.number}`}
                              aria-invalid={bad || undefined}
                              value={alloc[b.id] ?? (b.id === search.billId ? String(b.outstanding) : '0')}
                              onChange={(e) => setAlloc((a) => ({ ...a, [b.id]: e.target.value }))}
                              className={clsx(inputClasses, 'h-9 text-right tabular-nums')}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="ml-auto mt-4 flex w-full max-w-sm justify-between rounded-xl bg-canvas p-4 text-[15px] font-semibold">
              <span>Payment total</span>
              <Money amount={total} />
            </div>
          </CardBody>
        </Card>

        {error ? <StatusMessage kind="error" title="Cannot save the payment" description={error} /> : null}

        <div className="flex justify-end gap-2">
          <ButtonLink to="/payments" variant="secondary">
            Cancel
          </ButtonLink>
          <Button busy={create.isPending} onClick={() => void submit()}>
            Save payment
          </Button>
        </div>
      </div>
    </div>
  );
}
