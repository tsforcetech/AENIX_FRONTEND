import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCustomerOptions } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import { protoDb } from '@/prototype/store';
import { useCreateInvoice, useInvoiceableSalesOrders, type InvoiceableSalesOrder } from './api';

const route = getRouteApi('/_app/invoices/new');
const r2 = (n: number) => Math.round(n * 100) / 100;

function addDays(iso: string, days: number) {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

interface LineState {
  include: boolean;
  quantity: number;
}

/**
 * Customer invoice across one or more sales orders of the same customer (FLOW-002).
 * Only lines not yet billed (drafts included) are offered, so nothing is invoiced twice.
 */
export function NewInvoicePage() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const toast = useToast();
  const customers = useCustomerOptions();
  const prefillCustomer = useMemo(() => {
    if (search.customerId) return search.customerId;
    if (search.salesOrderId)
      return protoDb.get().salesOrders.find((x) => x.id === search.salesOrderId)?.customerId;
    return undefined;
  }, [search.customerId, search.salesOrderId]);
  const [customerId, setCustomerId] = useState(prefillCustomer ?? '');
  const orders = useInvoiceableSalesOrders(customerId || undefined);
  const [selected, setSelected] = useState<string[]>(search.salesOrderId ? [search.salesOrderId] : []);
  const [lineState, setLineState] = useState<Record<string, LineState>>({});
  const terms = protoDb.get().customers.find((c) => c.id === customerId)?.paymentTermsDays ?? 30;
  const [issueDate, setIssueDate] = useState(PROTO_TODAY);
  const [dueOverride, setDueOverride] = useState<string | undefined>();
  const dueDate = dueOverride ?? addDays(issueDate, terms);
  const create = useCreateInvoice();
  const [error, setError] = useState<string | undefined>();

  const chosen: InvoiceableSalesOrder[] = (orders.data ?? []).filter((o) => selected.includes(o.id));
  const lines = chosen.flatMap((o) =>
    o.lines.map((l) => {
      const st = lineState[l.key] ?? { include: true, quantity: l.quantity };
      return { ...l, soNumber: o.number, max: l.quantity, include: st.include, quantity: st.quantity };
    }),
  );
  const billed = lines.filter((l) => l.include && l.quantity > 0);
  const subtotal = r2(billed.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const vat = r2(subtotal * 0.05);
  const invalidQty = lines.some((l) => l.include && (l.quantity <= 0 || l.quantity > l.max));

  const toggleOrder = (id: string) =>
    setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const setLine = (key: string, patch: Partial<LineState>, max: number) =>
    setLineState((s) => ({ ...s, [key]: { include: true, quantity: max, ...s[key], ...patch } }));

  const submit = async (post: boolean) => {
    setError(undefined);
    if (!customerId) return setError('Choose a customer.');
    if (!billed.length) return setError('Select at least one sales order line to invoice.');
    if (invalidQty) return setError('A quantity is zero or more than is left to bill.');
    try {
      const inv = await create.mutateAsync({
        post,
        input: {
          customerId,
          issueDate,
          dueDate,
          lines: billed.map((l) => ({
            salesOrderId: l.salesOrderId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        },
      });
      toast({
        title: `${inv.number} ${post ? 'posted' : 'saved as draft'}`,
        body: `Bills ${chosen.map((o) => o.number).join(', ')}`,
      });
      void navigate({ to: '/invoices/$id', params: { id: inv.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the invoice.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New customer invoice"
        crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: 'New' }]}
        description="Pick a customer, then one or more of their sales orders. Lines already billed are not offered again."
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Customer & dates" />
          <CardBody className="grid gap-5 sm:grid-cols-3">
            <SelectField
              label="Customer"
              required
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setSelected([]);
                setLineState({});
                setDueOverride(undefined);
              }}
              placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
              options={customers.data ?? []}
            />
            <TextField
              label="Issue date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <TextField
              label="Due date"
              type="date"
              value={dueDate}
              hint={`Customer terms: ${terms} days`}
              onChange={(e) => setDueOverride(e.target.value)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Sales orders to bill"
            description="Select one or several. Each line on the invoice keeps its sales order."
          />
          <CardBody>
            {!customerId ? (
              <p className="text-body-s text-fg-muted">Choose a customer to see their sales orders.</p>
            ) : orders.isLoading ? (
              <StatusMessage kind="loading" title="Loading sales orders…" />
            ) : !orders.data?.length ? (
              <StatusMessage
                kind="empty"
                title="Nothing left to invoice"
                description="All confirmed sales orders for this customer are already billed (or still in draft)."
              />
            ) : (
              <fieldset>
                <legend className="sr-only">Sales orders</legend>
                <ul className="space-y-2">
                  {orders.data.map((o) => {
                    const on = selected.includes(o.id);
                    return (
                      <li key={o.id}>
                        <label
                          className={clsx(
                            'flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 transition-colors',
                            on ? 'border-brand bg-brand-subtle' : 'border-border hover:bg-canvas',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleOrder(o.id)}
                            className="size-4 accent-[var(--color-brand)]"
                          />
                          <span className="min-w-40 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <DocRef>{o.number}</DocRef>
                              <StatusBadge status={o.status} />
                            </span>
                            <span className="block text-caption text-fg-muted">
                              PO {o.customerPoRef} · ordered {formatDate(o.orderDate)}
                            </span>
                          </span>
                          <span className="flex flex-wrap gap-1.5 text-caption">
                            {o.jobs.length ? (
                              o.jobs.map((j) => (
                                <span key={j.id} className="inline-flex items-center gap-1">
                                  <span className="font-mono">{j.number}</span>
                                  <StatusBadge status={j.status} />
                                </span>
                              ))
                            ) : (
                              <span className="text-fg-muted">No job yet</span>
                            )}
                          </span>
                          <span className="w-40 text-right text-caption text-fg-muted">
                            <span className="block text-body-s font-semibold text-fg">
                              <Money amount={o.notInvoiced} />
                            </span>
                            left to bill of <Money amount={o.orderValue} />
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {chosen.some((o) =>
                  o.jobs.some((j) => j.status !== 'Completed' && j.status !== 'Delivered'),
                ) ? (
                  <p className="mt-3 flex items-start gap-2 text-caption text-warning">
                    <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    Some selected orders have jobs that are not delivered yet. Bill them only if the contract
                    allows advance or milestone billing.
                  </p>
                ) : null}
              </fieldset>
            )}
          </CardBody>
        </Card>

        {chosen.length ? (
          <Card>
            <CardHeader
              title="Invoice lines"
              description="Untick a line to leave it for a later invoice, or reduce its quantity."
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-s">
                <caption className="sr-only">Invoice lines</caption>
                <thead>
                  <tr className="border-y border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="w-10 px-5 py-2">
                      <span className="sr-only">Include</span>
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Sales order
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Description
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Unit price
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr
                      key={l.key}
                      className={clsx(
                        'border-b border-border-subtle last:border-0',
                        !l.include && 'opacity-50',
                      )}
                    >
                      <td className="px-5 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Include ${l.description} (${l.soNumber})`}
                          checked={l.include}
                          onChange={(e) => setLine(l.key, { include: e.target.checked }, l.max)}
                          className="size-4 accent-[var(--color-brand)]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <DocRef>{l.soNumber}</DocRef>
                      </td>
                      <td className="px-3 py-2.5">{l.description}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={l.max}
                          step="any"
                          aria-label={`Quantity for ${l.description}`}
                          aria-invalid={
                            l.include && (l.quantity <= 0 || l.quantity > l.max) ? true : undefined
                          }
                          disabled={!l.include}
                          value={l.quantity}
                          onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) }, l.max)}
                          className={clsx(inputClasses, 'h-9 w-24 text-right tabular-nums')}
                        />
                        <span className="mt-0.5 block text-caption text-fg-muted">
                          of {l.max} {l.unit}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money amount={l.unitPrice} />
                      </td>
                      <td className="px-5 py-2.5 text-right font-medium">
                        <Money amount={l.include ? r2(l.quantity * l.unitPrice) : 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardBody>
              <dl className="ml-auto w-full max-w-xs space-y-1.5 text-body-s">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Subtotal</dt>
                  <dd>
                    <Money amount={subtotal} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">VAT 5%</dt>
                  <dd>
                    <Money amount={vat} />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border-subtle pt-1.5 text-[15px] font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money amount={r2(subtotal + vat)} />
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        ) : null}

        {error ? <StatusMessage kind="error" title="Cannot create the invoice" description={error} /> : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-caption text-fg-muted">
            Posting makes the invoice read-only. Corrections use a credit note.
          </p>
          <ButtonLink to="/invoices" variant="secondary">
            Cancel
          </ButtonLink>
          <Button variant="secondary" busy={create.isPending} onClick={() => void submit(false)}>
            Save draft
          </Button>
          <Button busy={create.isPending} onClick={() => void submit(true)}>
            Post invoice
          </Button>
        </div>
      </div>
    </div>
  );
}
