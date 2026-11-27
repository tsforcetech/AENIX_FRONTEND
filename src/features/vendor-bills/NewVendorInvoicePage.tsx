import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { TextareaField, TextField } from '@/shared/ui/Field';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusBadge } from '@/shared/ui/Badge';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { PROTO_TODAY } from '@/prototype/seed';
import { threeWayMatch, useCreateVendorInvoice, usePurchaseOrderForBilling } from './api';
import { MatchPanel } from './MatchPanel';

const route = getRouteApi('/_app/vendor-bills/new');

/** Record the vendor's invoice against a purchase order, with a 3-way match before saving. */
export function NewVendorInvoicePage() {
  const { purchaseOrderId } = route.useSearch();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: po, isLoading, error } = usePurchaseOrderForBilling(purchaseOrderId);
  const create = useCreateVendorInvoice();
  const [vendorRef, setVendorRef] = useState('');
  const [billDate, setBillDate] = useState(PROTO_TODAY);
  const [amount, setAmount] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | undefined>();

  if (!purchaseOrderId)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Record vendor invoice"
          crumbs={[{ label: 'Purchase invoices', to: '/vendor-bills' }, { label: 'New' }]}
        />
        <StatusMessage
          kind="empty"
          title="Start from a purchase order"
          description={
            <>
              Vendor invoices are recorded against the PO issued when the vendor was assigned.{' '}
              <Link to="/purchase-orders" className="font-medium text-brand hover:underline">
                Open purchase orders
              </Link>
            </>
          }
        />
      </div>
    );
  if (error) return <StatusMessage kind="error" title="Purchase order not found" />;
  if (isLoading || !po) return <StatusMessage kind="loading" title="Loading purchase order…" />;

  const billed = po.status === 'Billed' || !!po.vendorBillId || po.status === 'Cancelled';
  const net = amount === undefined ? po.amount : Number(amount) || 0;
  const match = threeWayMatch(po.amount, Math.round(net * 100) / 100, undefined);
  const fullMatch = {
    ...match,
    proof: po.proof,
    proofOk: po.proof.every((p) => p.ok),
    ok: match.amountOk && po.proof.every((p) => p.ok),
  };

  const submit = async () => {
    setFormError(undefined);
    if (vendorRef.trim().length < 2) return setFormError("Enter the vendor's invoice number.");
    if (!(net > 0)) return setFormError('Enter the invoice amount before VAT.');
    if (!fullMatch.ok && reason.trim().length < 5)
      return setFormError(
        'The invoice does not match the PO or proof of work. Give a reason to save it as a draft.',
      );
    try {
      const bill = await create.mutateAsync({
        purchaseOrderId: po.id,
        vendorRef,
        billDate,
        amount: net,
        fileName,
        reason: fullMatch.ok ? undefined : reason,
      });
      toast({
        title: `${bill.number} recorded`,
        body: `Against ${po.number} — approve it to recognise the cost.`,
      });
      void navigate({ to: '/vendor-bills/$id', params: { id: bill.id } });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save the purchase invoice.');
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Record vendor invoice"
        crumbs={[{ label: 'Purchase invoices', to: '/vendor-bills' }, { label: po.number }]}
        description={`${po.vendorName} · ${po.description}${po.jobNumber ? ` · job ${po.jobNumber}` : ''}`}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Purchase order" actions={<StatusBadge status={po.status} />} />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'PO', value: <DocRef>{po.number}</DocRef> },
                { label: 'Vendor', value: po.vendorName },
                { label: 'Job', value: po.jobNumber ?? '—' },
                { label: 'Service', value: po.description },
                { label: 'Agreed (net)', value: <Money amount={po.amount} /> },
                { label: 'Payment terms', value: `${po.paymentTermsDays} days` },
              ]}
            />
          </CardBody>
        </Card>

        {billed ? (
          <StatusMessage
            kind="denied"
            title="Already billed"
            description="This purchase order already has a vendor invoice, or it was cancelled."
          />
        ) : (
          <>
            <Card>
              <CardHeader title="Vendor's invoice" />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Vendor invoice no."
                  required
                  value={vendorRef}
                  placeholder="e.g. SHT-INV-8812"
                  onChange={(e) => setVendorRef(e.target.value)}
                />
                <TextField
                  label="Invoice date"
                  type="date"
                  required
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
                <TextField
                  label="Amount before VAT (AED)"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  value={amount ?? String(po.amount)}
                  hint={
                    <>
                      VAT {Math.round(po.vatRate * 100)}%:{' '}
                      <Money amount={Math.round(net * po.vatRate * 100) / 100} />
                    </>
                  }
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="space-y-1.5">
                  <label htmlFor="vi-file" className="text-body-s font-medium">
                    Invoice copy (optional)
                  </label>
                  <input
                    id="vi-file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name)}
                    className="block w-full text-body-s file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-body-s"
                  />
                  <p className="text-caption text-fg-muted">
                    The file is stored by the backend; the prototype keeps its name only.
                  </p>
                </div>
              </CardBody>
            </Card>

            <MatchPanel match={fullMatch} poNumber={po.number} />

            {!fullMatch.ok ? (
              <Card>
                <CardBody>
                  <TextareaField
                    label="Reason for saving with a mismatch"
                    required
                    value={reason}
                    placeholder="e.g. Waiting time charged by vendor — confirmed with operations"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </CardBody>
              </Card>
            ) : null}

            {formError ? <StatusMessage kind="error" title="Cannot save" description={formError} /> : null}

            <div className="flex justify-end gap-2">
              <ButtonLink to="/vendor-bills" variant="secondary">
                Cancel
              </ButtonLink>
              <Button busy={create.isPending} onClick={() => void submit()}>
                Save as draft
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
