import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatMoney } from '@/shared/utils/format';
import { useApplyAdvance, useOpenInvoices, type CollectionRow } from './api';

/** Moves a sales-order advance onto an open invoice of the same customer (Dr 2300 / Cr AR). */
export function ApplyAdvanceDialog({ receipt, onClose }: { receipt: CollectionRow; onClose: () => void }) {
  const toast = useToast();
  const open = useOpenInvoices(receipt.customerId);
  const apply = useApplyAdvance();
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | undefined>();
  const inv = open.data?.find((i) => i.id === invoiceId);
  const max = Math.min(receipt.advanceAmount, inv?.outstanding ?? receipt.advanceAmount);

  const submit = () => {
    setError(undefined);
    const amt = Number(amount);
    if (!invoiceId) return setError('Choose the invoice.');
    if (!(amt > 0) || amt > max + 0.005) return setError(`Enter an amount up to ${formatMoney(max)}.`);
    apply.mutate(
      { id: receipt.id, invoiceId, amount: amt },
      {
        onSuccess: () => {
          toast({
            title: `Advance applied to ${inv?.number}`,
            body: `${formatMoney(amt)} from ${receipt.number}`,
          });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Could not apply the advance.'),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Apply advance ${receipt.number}`}
      description={`${receipt.customerName} · advance held ${formatMoney(receipt.advanceAmount)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={apply.isPending} onClick={submit}>
            Apply to invoice
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {open.data && open.data.length === 0 ? (
          <StatusMessage
            kind="empty"
            title="No open invoices"
            description="Invoice the sales order first, then apply the advance."
          />
        ) : (
          <>
            <SelectField
              label="Open invoice"
              required
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const next = open.data?.find((i) => i.id === e.target.value);
                if (next) setAmount(String(Math.min(receipt.advanceAmount, next.outstanding)));
              }}
              placeholder={open.isLoading ? 'Loading…' : 'Select invoice'}
              options={(open.data ?? []).map((i) => ({
                value: i.id,
                label: `${i.number} · ${i.salesOrders.map((x) => x.number).join(', ') || i.sourceLabel} · outstanding ${formatMoney(i.outstanding)}`,
              }))}
            />
            <TextField
              label="Amount to apply (AED)"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={amount}
              hint={
                <>
                  Up to <Money amount={max} />
                </>
              }
              onChange={(e) => setAmount(e.target.value)}
            />
          </>
        )}
        {error ? (
          <p role="alert" className="text-caption font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
