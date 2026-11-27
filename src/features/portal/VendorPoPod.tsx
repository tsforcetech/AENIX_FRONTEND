import { CheckCircle2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import {
  useAcceptPurchaseOrder,
  useUploadPod,
  useVendorPurchaseOrders,
  useVendorRequests,
  type VendorPoRow,
  type VendorRequestRow,
} from './api';

/** The vendor's purchase orders from AENIX (issued when they were assigned to a job). */
export function VendorPurchaseOrdersCard({ partyId }: { partyId: string }) {
  const { data, isLoading } = useVendorPurchaseOrders(partyId);
  const accept = useAcceptPurchaseOrder(partyId);
  const toast = useToast();
  const columns: Column<VendorPoRow>[] = [
    {
      key: 'po',
      header: 'Purchase order',
      cell: (p) => (
        <div>
          <DocRef>{p.number}</DocRef>
          <p className="text-caption text-fg-muted">{p.description}</p>
        </div>
      ),
    },
    {
      key: 'job',
      header: 'Job',
      hideOnMobile: true,
      cell: (p) => (
        <span>
          <span className="font-mono text-[13px]">{p.jobRef}</span>
          <span className="block text-caption text-fg-muted">{p.location}</span>
        </span>
      ),
    },
    {
      key: 'issued',
      header: 'Issued',
      hideOnMobile: true,
      cell: (p) => <span className="whitespace-nowrap">{formatDate(p.issuedAt)}</span>,
    },
    { key: 'total', header: 'Total incl. VAT', align: 'right', cell: (p) => <Money amount={p.total} /> },
    {
      key: 'invoice',
      header: 'Your invoice',
      hideOnMobile: true,
      cell: (p) =>
        p.billNumber ? (
          <span className="font-mono text-[13px]">{p.billNumber}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      align: 'right',
      cell: (p) =>
        p.status === 'Issued' ? (
          <Button
            size="sm"
            icon={<CheckCircle2 aria-hidden="true" />}
            busy={accept.isPending && accept.variables === p.id}
            onClick={() =>
              accept.mutate(p.id, {
                onSuccess: () => toast({ title: `${p.number} accepted`, body: 'AENIX has been notified.' }),
                onError: (e) => toast({ title: 'Could not accept', body: e.message }),
              })
            }
          >
            Accept PO
          </Button>
        ) : (
          <span className="text-caption text-fg-muted">—</span>
        ),
    },
  ];
  return (
    <Card>
      <CardHeader
        title="Purchase orders"
        description="Issued to you when AENIX assigned you to a job. Invoice against the PO number."
      />
      <div className="mt-3">
        <DataTable
          caption="Your purchase orders"
          columns={columns}
          rows={data}
          rowKey={(p) => p.id}
          loading={isLoading}
          emptyTitle="No purchase orders yet"
        />
      </div>
    </Card>
  );
}

/** Customer delivery / out-bond requests on the vendor's jobs; the vendor uploads the POD after delivery. */
export function VendorDeliveryRequestsCard({ partyId }: { partyId: string }) {
  const { data, isLoading } = useVendorRequests(partyId);
  const [req, setReq] = useState<VendorRequestRow | null>(null);
  const columns: Column<VendorRequestRow>[] = [
    {
      key: 'req',
      header: 'Request',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="text-caption text-fg-muted">Job {r.jobRef}</p>
        </div>
      ),
    },
    { key: 'to', header: 'Deliver to', cell: (r) => <span className="text-body-s">{r.deliverTo}</span> },
    {
      key: 'by',
      header: 'Required by',
      hideOnMobile: true,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.requiredBy)}</span>,
    },
    {
      key: 'qty',
      header: 'Qty',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => r.lines.reduce((s, l) => s + l.quantity, 0),
    },
    {
      key: 'pod',
      header: 'POD',
      cell: (r) =>
        r.podNumber ? (
          <span className="font-mono text-[13px]">{r.podNumber}</span>
        ) : (
          <span className="text-caption text-fg-muted">Not uploaded</span>
        ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      align: 'right',
      cell: (r) =>
        r.canUploadPod ? (
          <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => setReq(r)}>
            Upload POD
          </Button>
        ) : (
          <span className="text-caption text-fg-muted">—</span>
        ),
    },
  ];
  return (
    <Card>
      <CardHeader
        title="Delivery requests"
        description="Customer out / delivery requests on your jobs. Upload the signed POD after delivery — AENIX checks it against the request."
      />
      <div className="mt-3">
        <DataTable
          caption="Delivery requests"
          columns={columns}
          rows={data}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle="No delivery requests on your jobs"
          emptyDescription="When a customer asks for goods to be delivered on a job you are assigned to, it appears here."
        />
      </div>
      {req ? <PodDialog partyId={partyId} req={req} onClose={() => setReq(null)} /> : null}
    </Card>
  );
}

function PodDialog({
  partyId,
  req,
  onClose,
}: {
  partyId: string;
  req: VendorRequestRow;
  onClose: () => void;
}) {
  const upload = useUploadPod(partyId);
  const toast = useToast();
  const fileId = useId();
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [podNumber, setPodNumber] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(req.lines.map((l) => [l.sku, l.quantity])),
  );
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!file) return setError('Attach the signed POD.');
    if (!podNumber.trim()) return setError('Enter the POD number.');
    if (!receivedBy.trim()) return setError('Enter who received the goods.');
    if (req.lines.some((l) => !(Number.isFinite(qty[l.sku]) && (qty[l.sku] ?? -1) >= 0)))
      return setError('Delivered quantities must be 0 or more.');
    try {
      const r = await upload.mutateAsync({
        workOrderId: req.workOrderId,
        requestId: req.id,
        file,
        podNumber: podNumber.trim(),
        receivedBy: receivedBy.trim(),
        lines: req.lines.map((l) => ({
          sku: l.sku,
          deliveredQty: qty[l.sku] ?? 0,
          remarks: remarks[l.sku]?.trim() || undefined,
        })),
      });
      toast({
        title: `POD uploaded for ${req.number}`,
        body: r.ok
          ? 'Delivered quantities match the request.'
          : `${r.mismatches} line(s) differ — AENIX will review.`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Upload POD — ${req.number}`}
      description={`Deliver to ${req.deliverTo} · job ${req.jobRef}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={upload.isPending} onClick={() => void submit()}>
            Upload POD
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor={fileId} className="text-body-s font-medium">
            Signed POD <span className="text-brand">*</span>
          </label>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ? { name: f.name, size: f.size } : null);
            }}
            className="block w-full text-body-s file:mr-3 file:rounded-lg file:border-0 file:bg-surface-inverse file:px-3 file:py-2 file:text-caption file:font-medium file:text-fg-inverse"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="POD number"
            required
            value={podNumber}
            onChange={(e) => setPodNumber(e.target.value)}
          />
          <TextField
            label="Received by"
            required
            value={receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-body-s font-medium">Delivered quantities</legend>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-left text-body-s">
              <thead>
                <tr className="border-b border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    SKU
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Requested
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Delivered
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {req.lines.map((l) => (
                  <tr key={l.sku} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2">
                      <span className="block font-mono text-[13px]">{l.sku}</span>
                      <span className="block text-caption text-fg-muted">{l.description}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.quantity} <span className="text-caption text-fg-muted">{l.uom}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        aria-label={`Delivered quantity for ${l.sku}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={qty[l.sku] ?? 0}
                        onChange={(e) => setQty((q) => ({ ...q, [l.sku]: Number(e.target.value) }))}
                        className={`${inputClasses} h-9 w-24 text-right`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Remarks for ${l.sku}`}
                        value={remarks[l.sku] ?? ''}
                        onChange={(e) => setRemarks((rm) => ({ ...rm, [l.sku]: e.target.value }))}
                        placeholder="e.g. 2 refused, damaged"
                        className={`${inputClasses} h-9`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
