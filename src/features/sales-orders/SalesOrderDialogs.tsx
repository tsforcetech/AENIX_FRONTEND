import { useState } from 'react';
import { valueChange } from './pricing';
import { useServiceComboOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField, TextField } from '@/shared/ui/Field';
import { PriceLinesGrid, type GridLine, type GridLineErrors } from '@/shared/ui/PriceLinesGrid';
import { useToast } from '@/shared/ui/Toast';
import { formatMoney } from '@/shared/utils/format';
import {
  useAmendSalesOrder,
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useRequestCreditOverride,
  type SalesOrderCredit,
  type SalesOrderDetail,
} from './api';
import { suggestLine, useServiceMeta } from './commercial-api';
import { ConfirmationFilePicker, type PickedFile } from './ConfirmationFilePicker';
import { CreditPanel } from './CreditPanel';

/** C5: credit block explanation + "Request credit override" (reason required). */
export function CreditOverrideForm({
  so,
  credit,
  onDone,
}: {
  so: SalesOrderDetail;
  credit: SalesOrderCredit;
  onDone: () => void;
}) {
  const request = useRequestCreditOverride();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const pending = so.creditOverride?.status === 'Pending';
  const error = touched && reason.trim().length < 3 ? 'Give the reason for the override' : undefined;
  return (
    <div className="space-y-4">
      <CreditPanel credit={credit} override={so.creditOverride} />
      {pending ? (
        <p className="text-body-s text-fg-secondary">
          An override is waiting for the {so.creditOverride?.approverRole}. When it is approved the order is
          confirmed automatically.
        </p>
      ) : (
        <>
          <TextareaField
            label="Reason for the credit override"
            required
            placeholder="e.g. Customer paid today — remittance received, bank credit expected tomorrow"
            value={reason}
            error={error}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            busy={request.isPending}
            onClick={() => {
              setTouched(true);
              if (reason.trim().length < 3) return;
              request.mutate(
                { id: so.id, reason: reason.trim() },
                {
                  onSuccess: (rec) => {
                    toast({
                      title: 'Credit override requested',
                      body: `Waiting for the ${rec.approverRole}. The order proceeds when it is approved.`,
                    });
                    onDone();
                  },
                  onError: (e) => toast({ title: 'Could not request the override', body: e.message }),
                },
              );
            }}
          >
            Request credit override
          </Button>
        </>
      )}
    </div>
  );
}

/** C4 + C5: confirm a draft — PO / reference and confirmation document are required. */
export function ConfirmDialog({
  so,
  open,
  onClose,
}: {
  so: SalesOrderDetail;
  open: boolean;
  onClose: () => void;
}) {
  const confirm = useConfirmSalesOrder();
  const toast = useToast();
  const [po, setPo] = useState(so.customerPoRef);
  const [file, setFile] = useState<PickedFile | undefined>();
  const [errors, setErrors] = useState<{ po?: string; file?: string }>({});
  const [blocked, setBlocked] = useState<SalesOrderCredit | undefined>();

  const submit = () => {
    const next = {
      po: po.trim().length < 2 ? 'Enter the customer’s PO / reference' : undefined,
      file:
        !file && !so.confirmationAttachment
          ? 'Attach the customer’s confirmation (signed quote, PO or email)'
          : undefined,
    };
    setErrors(next);
    if (next.po || next.file) return;
    confirm.mutate(
      { id: so.id, customerPoRef: po, confirmationFile: file },
      {
        onSuccess: (res) => {
          if (res.confirmed) {
            toast({
              title: `${so.number} confirmed`,
              body: 'Create the job (work order) to start the work.',
            });
            onClose();
          } else setBlocked(res.credit);
        },
        onError: (e) => toast({ title: 'Could not confirm', body: e.message }),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={blocked ? `${so.number} is held by the credit check` : `Confirm ${so.number}`}
      description={
        blocked
          ? 'The order stays a draft. Ask for a credit override, or collect payment first.'
          : 'A confirmed order needs the customer’s PO / reference and their confirmation document.'
      }
      footer={
        blocked ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={confirm.isPending} onClick={submit}>
              Confirm sales order
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <CreditOverrideForm so={so} credit={blocked} onDone={onClose} />
      ) : (
        <div className="space-y-4">
          <TextField
            label="Customer PO / reference"
            required
            value={po}
            error={errors.po}
            onChange={(e) => setPo(e.target.value)}
          />
          {so.confirmationAttachment && !file ? (
            <p className="text-caption text-fg-muted">
              On file: {so.confirmationAttachment.fileName} ({so.confirmationAttachment.sizeKb} KB). Choose a
              file to replace it.
            </p>
          ) : null}
          <ConfirmationFilePicker
            value={file}
            required={!so.confirmationAttachment}
            error={errors.file}
            onChange={(f) => {
              setFile(f);
              setErrors((e) => ({ ...e, file: undefined }));
            }}
          />
        </div>
      )}
    </Dialog>
  );
}

const toGrid = (l: SalesOrderDetail['lines'][number]): GridLine => ({
  serviceId: l.serviceId,
  description: l.description,
  quantity: String(l.quantity),
  unit: l.unit,
  unitPrice: String(l.unitPrice),
  unitCost: String(l.unitCost),
  minimumCharge: l.minimumCharge,
  customerApproved: l.customerApproved,
});

/** C8: amend a confirmed order — new version, note required, approval above the threshold. */
export function AmendDialog({
  so,
  open,
  onClose,
}: {
  so: SalesOrderDetail;
  open: boolean;
  onClose: () => void;
}) {
  const amend = useAmendSalesOrder();
  const toast = useToast();
  const serviceCombo = useServiceComboOptions();
  const serviceMeta = useServiceMeta();
  const [lines, setLines] = useState<GridLine[]>(() => so.lines.map(toGrid));
  const [keys, setKeys] = useState<string[]>(() => so.lines.map((l) => l.id));
  const [notes, setNotes] = useState(so.notes);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const num = (v: number | string) => Number(v);
  const lineErrors: GridLineErrors[] = lines.map((l) => {
    const e: NonNullable<GridLineErrors> = {};
    if (!l.serviceId) e.serviceId = 'Choose a service';
    if (l.description.trim().length < 2) e.description = 'Describe the line';
    if (!(num(l.quantity) > 0)) e.quantity = '> 0';
    if (!l.unit.trim()) e.unit = 'Unit';
    if (!(num(l.unitPrice) >= 0)) e.unitPrice = '≥ 0';
    if (!(num(l.unitCost) >= 0)) e.unitCost = '≥ 0';
    return Object.keys(e).length ? e : undefined;
  });
  const invalid = lineErrors.some(Boolean);
  const noteError = touched && note.trim().length < 3 ? 'Say what changed and why' : undefined;
  const parsed = lines.map((l) => ({
    serviceId: l.serviceId,
    description: l.description.trim(),
    quantity: num(l.quantity) || 0,
    unit: l.unit.trim(),
    unitPrice: num(l.unitPrice) || 0,
    unitCost: num(l.unitCost) || 0,
    ...(l.minimumCharge ? { minimumCharge: l.minimumCharge } : {}),
    ...(l.customerApproved !== undefined ? { customerApproved: l.customerApproved } : {}),
  }));
  const change = valueChange(so.lines, parsed);
  const fx = so.currency && so.currency !== 'AED' ? (so.exchangeRate ?? 1) : 1;
  const needsApproval =
    so.changeApprovalThreshold !== undefined && Math.abs(change * fx) >= so.changeApprovalThreshold;

  const submit = () => {
    setTouched(true);
    if (invalid || note.trim().length < 3) return;
    amend.mutate(
      { id: so.id, lines: parsed, notes, note: note.trim() },
      {
        onSuccess: (res) => {
          toast(
            res.applied
              ? { title: `${so.number} amended`, body: `Now version ${(so.version ?? 1) + 1}.` }
              : {
                  title: 'Change sent for approval',
                  body: `The value change needs the ${res.approverRole}. The order keeps its current lines until then.`,
                },
          );
          onClose();
        },
        onError: (e) => toast({ title: 'Could not amend', body: e.message }),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Amend ${so.number}`}
      description={`Current version v${so.version ?? 1}. Every change is recorded in the order history.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={amend.isPending} onClick={submit}>
            {needsApproval ? 'Send change for approval' : 'Save new version'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PriceLinesGrid
          caption="Amended price lines"
          lines={lines}
          keys={keys}
          errors={touched ? lineErrors : undefined}
          services={serviceCombo.data ?? []}
          serviceMeta={serviceMeta}
          currency={so.currency}
          suggest={(serviceId) =>
            suggestLine(serviceId, { origin: so.origin, destination: so.destination }, fx)
          }
          onPatch={(i, p) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))}
          onAdd={() => {
            setLines((ls) => [
              ...ls,
              { serviceId: '', description: '', quantity: '1', unit: '', unitPrice: '0', unitCost: '0' },
            ]);
            setKeys((k) => [...k, `new-${k.length}-${Date.now()}`]);
          }}
          onRemove={(i) => {
            setLines((ls) => ls.filter((_, j) => j !== i));
            setKeys((k) => k.filter((_, j) => j !== i));
          }}
        />
        <p className="text-body-s" aria-live="polite">
          Value change:{' '}
          <strong className="tabular-nums">
            {change >= 0 ? '+' : ''}
            {so.currency && so.currency !== 'AED'
              ? `${so.currency} ${change.toFixed(2)}`
              : formatMoney(change)}
          </strong>{' '}
          excl. VAT
          {needsApproval
            ? ` — needs approval (threshold ${formatMoney(so.changeApprovalThreshold ?? 0)}).`
            : '.'}
        </p>
        <TextareaField
          label="Order notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <TextareaField
          label="Change note"
          required
          placeholder="e.g. Customer added a second truck — email of 27 Nov"
          value={note}
          error={noteError}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

/** C9: cancel with a reason (required) and an optional billable cancellation fee. */
export function CancelDialog({
  so,
  open,
  onClose,
}: {
  so: SalesOrderDetail;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useCancelSalesOrder();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('');
  const [touched, setTouched] = useState(false);
  const feeNum = fee.trim() === '' ? undefined : Number(fee);
  const reasonError = touched && reason.trim().length < 3 ? 'Give the reason for cancelling' : undefined;
  const feeError =
    touched && feeNum !== undefined && (!Number.isFinite(feeNum) || feeNum < 0)
      ? 'Enter an amount of 0 or more'
      : undefined;
  const submit = () => {
    setTouched(true);
    if (reason.trim().length < 3 || (feeNum !== undefined && (!Number.isFinite(feeNum) || feeNum < 0)))
      return;
    cancel.mutate(
      { id: so.id, reason: reason.trim(), fee: feeNum },
      {
        onSuccess: () => {
          toast({
            title: `${so.number} cancelled`,
            body: feeNum ? `Cancellation fee ${formatMoney(feeNum)} is ready to invoice.` : undefined,
          });
          onClose();
        },
        onError: (e) => toast({ title: 'Could not cancel', body: e.message }),
      },
    );
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Cancel ${so.number}`}
      description="Cancelling is final. Invoiced orders cannot be cancelled — raise a credit note instead."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" busy={cancel.isPending} onClick={submit}>
            Cancel order
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextareaField
          label="Reason"
          required
          placeholder="e.g. Customer postponed the shipment to next quarter"
          value={reason}
          error={reasonError}
          onChange={(e) => setReason(e.target.value)}
        />
        <TextField
          label="Cancellation fee (AED, optional)"
          inputMode="decimal"
          hint="Billable to the customer — the invoice module picks it up."
          value={fee}
          error={feeError}
          onChange={(e) => setFee(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
