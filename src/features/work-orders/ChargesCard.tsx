// ---- FLOW-003 WP-C ---- Job charges (price lines) with T8 surcharges and customer approval.
import { AlertTriangle, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { useToast } from '@/shared/ui/Toast';
import { formatNumber } from '@/shared/utils/format';
import type { WorkOrderDetail } from './api';
import { useJobAction, type JobExtras } from './transport-api';
import { CheckboxField, errorText } from './wpc-fields';

export function ChargesCard({ wo, extras }: { wo: WorkOrderDetail; extras: JobExtras }) {
  const [adding, setAdding] = useState(false);
  const action = useJobAction();
  const toast = useToast();
  const isSurcharge = (serviceId: string) => extras.surchargeServiceIds.includes(serviceId);
  const editable = extras.canEdit && !wo.invoiceId;
  return (
    <Card>
      <CardHeader
        title="Price lines"
        description="Customer charges for this job (AED, excl. VAT)"
        actions={
          editable ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setAdding(true)}
            >
              Add surcharge
            </Button>
          ) : null
        }
      />
      <CardBody className="pt-3">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Price lines">
          <table className="w-full min-w-[560px] text-left text-body-s">
            <caption className="sr-only">Price lines</caption>
            <thead>
              <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-2 font-medium">
                  Description
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Unit price
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {wo.lines.map((l) => {
                const surcharge = isSurcharge(l.serviceId);
                return (
                  <tr key={l.id} className="border-b border-border-subtle align-top last:border-0">
                    <td className="py-2.5">
                      <p>{l.description}</p>
                      {surcharge ? (
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <Badge tone="info" dot={false}>
                            Surcharge
                          </Badge>
                          {l.customerApproved ? (
                            <span className="text-caption text-success">Customer approved — billable</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-caption font-medium text-warning">
                              <AlertTriangle aria-hidden="true" className="size-3.5" />
                              Needs customer approval — not billable yet
                            </span>
                          )}
                          {editable ? (
                            <label className="inline-flex items-center gap-1.5 text-caption">
                              <input
                                type="checkbox"
                                checked={!!l.customerApproved}
                                onChange={(e) =>
                                  action.mutate(
                                    {
                                      op: 'lineApproval',
                                      id: wo.id,
                                      lineId: l.id,
                                      approved: e.target.checked,
                                    },
                                    { onError: (err) => toast({ title: 'Not saved', body: errorText(err) }) },
                                  )
                                }
                                className="size-4 accent-[var(--color-brand)]"
                              />
                              Customer approved<span className="sr-only"> — {l.description}</span>
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatNumber(l.quantity)} <span className="text-caption text-fg-muted">{l.unit}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      <Money amount={l.unitPrice} />
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      <Money amount={l.quantity * l.unitPrice} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {extras.profit.pendingSurcharges > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 text-caption text-warning">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            <span>
              <Money amount={extras.profit.pendingSurcharges} /> of surcharges wait for the customer’s
              approval and are left out of revenue.
            </span>
          </p>
        ) : null}
      </CardBody>
      {adding ? <SurchargeDialog wo={wo} extras={extras} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}

function SurchargeDialog({
  wo,
  extras,
  onClose,
}: {
  wo: WorkOrderDetail;
  extras: JobExtras;
  onClose: () => void;
}) {
  const action = useJobAction();
  const toast = useToast();
  const first = extras.surchargeServices[0];
  const [serviceId, setServiceId] = useState(first?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState(first?.unitPrice !== undefined ? String(first.unitPrice) : '');
  const [note, setNote] = useState('');
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string>();
  const svc = extras.surchargeServices.find((s) => s.id === serviceId);
  const save = () =>
    action.mutate(
      {
        op: 'addSurcharge',
        id: wo.id,
        serviceId,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        customerApproved: approved,
        note,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Surcharge added',
            body: approved ? 'Billable on the next invoice.' : 'Not billable until the customer approves it.',
          });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add surcharge"
      description="Waiting, demurrage, extra drop or after-hours charges. The customer must approve before it is invoiced."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={save}>
            Add surcharge
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
        <SelectField
          label="Surcharge"
          required
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            const next = extras.surchargeServices.find((s) => s.id === e.target.value);
            if (next?.unitPrice !== undefined) setUnitPrice(String(next.unitPrice));
          }}
          options={extras.surchargeServices.map((s) => ({
            value: s.id,
            label: `${s.name} (per ${s.unit.toLowerCase()})`,
          }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={`Quantity${svc ? ` (${svc.unit})` : ''}`}
            type="number"
            min={0}
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <TextField
            label="Unit price (AED)"
            type="number"
            min={0}
            step="any"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <TextField
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. 3 hours waiting at consignee"
        />
        <CheckboxField
          label="Customer approved"
          checked={approved}
          onChange={setApproved}
          hint="Tick only when the customer has accepted the charge (email, signed note)."
        />
        {Number(quantity) > 0 && Number(unitPrice) >= 0 ? (
          <p className="text-body-s text-fg-muted">
            Amount: <Money amount={Number(quantity) * Number(unitPrice)} className="font-medium text-fg" />
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
