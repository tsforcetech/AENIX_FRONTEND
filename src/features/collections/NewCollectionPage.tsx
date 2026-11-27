import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Info, Wand2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { PaymentMethod } from '@/domain/types';
import { useCustomerOptions } from '@/shared/data/lookups';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoney } from '@/shared/utils/format';
import { collectionsApi, useCreateCollection, useCustomerBalance, useOpenInvoices } from './api';
import { BalanceSummary } from './BalanceSummary';

const route = getRouteApi('/_app/collections/new');
const METHODS: PaymentMethod[] = ['Bank transfer', 'Cheque', 'PDC', 'Cash', 'Card'];
const round2 = (n: number) => Math.round(n * 100) / 100;

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    date: z.string().min(1, 'Choose the receipt date'),
    method: z.enum(['Bank transfer', 'Cheque', 'PDC', 'Cash', 'Card']),
    reference: z.string().trim().min(2, 'Enter the bank / cheque reference').max(80),
    chequeDate: z.string().optional(),
    amount: z.coerce.number({ error: 'Enter an amount' }).positive('Amount must be more than 0'),
    allocations: z.array(
      z.object({
        invoiceId: z.string(),
        outstanding: z.number(),
        amount: z.coerce.number({ error: 'Enter a number' }).min(0, 'Cannot be negative'),
      }),
    ),
    advanceSalesOrderId: z.string().optional(),
    advanceAmount: z.coerce.number({ error: 'Enter a number' }).min(0, 'Cannot be negative'),
  })
  .superRefine((v, ctx) => {
    if ((v.method === 'PDC' || v.method === 'Cheque') && !v.chequeDate) {
      ctx.addIssue({ code: 'custom', path: ['chequeDate'], message: 'Enter the cheque date' });
    }
    v.allocations.forEach((a, i) => {
      if (a.amount > a.outstanding + 0.005) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations', i, 'amount'],
          message: `Max ${formatMoney(a.outstanding)}`,
        });
      }
    });
    if (v.advanceAmount > 0 && !v.advanceSalesOrderId) {
      ctx.addIssue({ code: 'custom', path: ['advanceSalesOrderId'], message: 'Choose the sales order' });
    }
    const total = round2(v.allocations.reduce((s, a) => s + a.amount, 0) + (v.advanceAmount || 0));
    if (total > v.amount + 0.005) {
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: `Allocated ${formatMoney(total)} exceeds the receipt amount ${formatMoney(v.amount)}`,
      });
    }
  });

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function NewCollectionPage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const toast = useToast();
  const customers = useCustomerOptions();
  const create = useCreateCollection();
  const presetCustomer = useMemo(
    () =>
      (search.invoiceId ? collectionsApi.invoiceCustomer(search.invoiceId) : undefined) ??
      (search.salesOrderId ? collectionsApi.salesOrderCustomer(search.salesOrderId) : undefined) ??
      search.customerId ??
      '',
    [search.invoiceId, search.salesOrderId, search.customerId],
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: presetCustomer,
      date: '2026-11-23',
      method: 'Bank transfer',
      reference: '',
      amount: '',
      allocations: [],
      advanceSalesOrderId: search.salesOrderId ?? '',
      advanceAmount: '',
    },
  });
  const { fields, replace } = useFieldArray({ control, name: 'allocations' });
  const customerId = useWatch({ control, name: 'customerId' });
  const method = useWatch({ control, name: 'method' });
  const amount = Number(useWatch({ control, name: 'amount' })) || 0;
  const allocs = useWatch({ control, name: 'allocations' });
  const advanceAmount = Number(useWatch({ control, name: 'advanceAmount' })) || 0;
  const allocated = round2((allocs ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0) + advanceAmount);
  const open = useOpenInvoices(customerId || undefined);
  const balance = useCustomerBalance(customerId || undefined);
  const advanceOrders = (balance.data?.salesOrders ?? []).filter((o) => o.status !== 'Cancelled');

  // Re-apply the preset customer once the async option list has rendered (native <select>).
  useEffect(() => {
    if (customers.data) setValue('customerId', getValues('customerId'));
  }, [customers.data, setValue, getValues]);

  // Rebuild the allocation grid whenever the customer's open invoices load.
  useEffect(() => {
    if (!open.data) return;
    replace(
      open.data.map((inv) => ({
        invoiceId: inv.id,
        outstanding: inv.outstanding,
        amount: inv.id === search.invoiceId ? inv.outstanding : 0,
      })),
    );
    const preset = open.data.find((i) => i.id === search.invoiceId);
    if (preset && !getValues('amount')) setValue('amount', preset.outstanding);
  }, [open.data, replace, search.invoiceId, setValue, getValues]);

  const autoAllocate = () => {
    let left = amount;
    (open.data ?? []).forEach((inv, i) => {
      const amt = round2(Math.max(0, Math.min(left, inv.outstanding)));
      setValue(`allocations.${i}.amount`, amt, { shouldValidate: true });
      left = round2(left - amt);
    });
  };

  const onSubmit = handleSubmit(async (v) => {
    const col = await create.mutateAsync({
      customerId: v.customerId,
      date: v.date,
      method: v.method,
      reference: v.reference,
      chequeDate: v.method === 'PDC' || v.method === 'Cheque' ? v.chequeDate : undefined,
      amount: v.amount,
      allocations: [
        ...v.allocations
          .filter((a) => a.amount > 0)
          .map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) })),
        ...(v.advanceAmount > 0 && v.advanceSalesOrderId
          ? [{ salesOrderId: v.advanceSalesOrderId, amount: round2(v.advanceAmount) }]
          : []),
      ],
    });
    toast({
      title: `${col.number} recorded`,
      body:
        col.status === 'PDC pending'
          ? 'PDC held until it clears — invoices not yet updated.'
          : col.status === 'Advance'
            ? `${formatMoney(col.amount)} held as a sales-order advance`
            : `${formatMoney(col.amount)} received`,
    });
    void navigate({ to: '/collections' });
  });

  const isPdc = method === 'PDC';
  const remaining = round2(amount - allocated);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New receipt"
        crumbs={[{ label: 'Receipts', to: '/collections' }, { label: 'New' }]}
        description="Record money received from a customer. Allocate it to open invoices, or hold it as an advance against a sales order."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {customerId ? <BalanceSummary balance={balance.data} loading={balance.isLoading} /> : null}
        <Card>
          <CardHeader title="Receipt" />
          <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Customer"
              required
              className="sm:col-span-2 lg:col-span-3"
              placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
              options={customers.data ?? []}
              error={errors.customerId?.message}
              {...register('customerId')}
            />
            <TextField
              label="Receipt date"
              type="date"
              required
              error={errors.date?.message}
              {...register('date')}
            />
            <SelectField
              label="Method"
              required
              options={METHODS.map((m) => ({ value: m, label: m }))}
              error={errors.method?.message}
              {...register('method')}
            />
            <TextField
              label="Amount (AED)"
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              error={errors.amount?.message}
              {...register('amount')}
            />
            <TextField
              label={
                method === 'Bank transfer'
                  ? 'Bank reference'
                  : method === 'Cheque' || isPdc
                    ? 'Cheque no. & bank'
                    : 'Reference'
              }
              required
              className="lg:col-span-2"
              placeholder={isPdc || method === 'Cheque' ? 'e.g. CHQ 004512 — Emirates NBD' : 'e.g. TRX990341'}
              error={errors.reference?.message}
              {...register('reference')}
            />
            {isPdc || method === 'Cheque' ? (
              <TextField
                label="Cheque date"
                type="date"
                required
                error={errors.chequeDate?.message}
                {...register('chequeDate')}
              />
            ) : null}
            {isPdc ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-caption text-warning sm:col-span-2 lg:col-span-3">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Post-dated cheque: the receipt is held as “PDC pending”. Invoices and the bank are only
                updated when you mark it cleared.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Allocate to invoices"
            description={
              customerId
                ? 'Open invoices for this customer, oldest due first'
                : 'Choose a customer to see open invoices'
            }
            actions={
              fields.length ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Wand2 aria-hidden="true" />}
                  onClick={autoAllocate}
                  disabled={!amount}
                >
                  Auto-allocate oldest first
                </Button>
              ) : null
            }
          />
          <CardBody className="pt-3">
            {customerId && open.data?.length === 0 ? (
              <p className="py-6 text-center text-body-s text-fg-muted">
                This customer has no open invoices. The receipt will be recorded as unallocated.
              </p>
            ) : null}
            {fields.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-s">
                  <caption className="sr-only">Invoice allocations</caption>
                  <thead>
                    <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="py-2 pr-3 text-left font-medium">
                        Invoice
                      </th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        Due
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Outstanding
                      </th>
                      <th scope="col" className="py-2 pl-3 text-right font-medium">
                        Allocate (AED)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, i) => {
                      const inv = open.data?.find((x) => x.id === f.invoiceId);
                      const err = errors.allocations?.[i]?.amount?.message;
                      return (
                        <tr key={f.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-3 pr-3">
                            <DocRef>{inv?.number ?? f.invoiceId}</DocRef>
                            <p className="text-caption text-fg-muted">{inv?.sourceLabel}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            {inv ? formatDate(inv.dueDate) : '—'}
                            {inv?.status === 'Overdue' ? (
                              <span className="block text-caption font-medium text-danger">Overdue</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Money amount={f.outstanding} className="whitespace-nowrap" />
                          </td>
                          <td className="w-44 py-3 pl-3">
                            <label className="sr-only" htmlFor={`alloc-${i}`}>
                              Allocate to {inv?.number}
                            </label>
                            <input
                              id={`alloc-${i}`}
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min={0}
                              aria-invalid={!!err || undefined}
                              aria-describedby={err ? `alloc-err-${i}` : undefined}
                              className={clsx(inputClasses, 'h-9 text-right tabular-nums')}
                              {...register(`allocations.${i}.amount`)}
                            />
                            {err ? (
                              <p
                                id={`alloc-err-${i}`}
                                role="alert"
                                className="mt-1 text-right text-caption font-medium text-danger"
                              >
                                {err}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <dl className="ml-auto mt-4 w-full max-w-sm space-y-1.5 rounded-xl bg-canvas p-4 text-body-s">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Receipt amount</dt>
                <dd>
                  <Money amount={amount} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Allocated (incl. advance)</dt>
                <dd>
                  <Money amount={allocated} />
                </dd>
              </div>
              <div
                className={clsx(
                  'flex justify-between border-t border-border-subtle pt-1.5 font-semibold',
                  remaining < 0 ? 'text-danger' : remaining > 0 ? 'text-warning' : 'text-success',
                )}
              >
                <dt>{remaining < 0 ? 'Over-allocated' : 'Unallocated'}</dt>
                <dd>
                  <Money amount={Math.abs(remaining)} />
                </dd>
              </div>
            </dl>
            {errors.allocations?.message || errors.allocations?.root?.message ? (
              <p role="alert" className="mt-2 text-right text-caption font-medium text-danger">
                {errors.allocations.message ?? errors.allocations.root?.message}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Advance against a sales order"
            description="For money received before the order is invoiced. It is applied to the invoice later."
          />
          <CardBody className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SelectField
              label="Sales order"
              placeholder={customerId ? 'No advance' : 'Choose a customer first'}
              disabled={!customerId}
              options={advanceOrders.map((o) => ({
                value: o.salesOrderId,
                label: `${o.number} · order ${formatMoney(o.orderValue)} · not invoiced ${formatMoney(o.notInvoiced)}${o.advance ? ` · advance held ${formatMoney(o.advance)}` : ''}`,
              }))}
              error={errors.advanceSalesOrderId?.message}
              {...register('advanceSalesOrderId')}
            />
            <TextField
              label="Advance amount (AED)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              disabled={!customerId}
              error={errors.advanceAmount?.message}
              {...register('advanceAmount')}
            />
          </CardBody>
        </Card>

        <div className="flex justify-end gap-2">
          <ButtonLink to="/collections" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" busy={create.isPending}>
            Save receipt
          </Button>
        </div>
      </form>
    </div>
  );
}
