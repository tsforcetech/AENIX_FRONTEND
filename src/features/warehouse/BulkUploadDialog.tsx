import { Link } from '@tanstack/react-router';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import type { Attachment } from '@/domain/types';
import { useCustomerOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import {
  GRN_FIELDS,
  PL_FIELDS,
  POD_FIELDS,
  REQUEST_FIELDS,
  SpreadsheetImport,
  type ImportedRow,
} from '@/shared/ui/SpreadsheetImport';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { PROTO_TODAY } from '@/prototype/seed';
import { rowsToDocLines, rowsToGrnLines, rowsToPodLines, totalUnits, type BulkDocType } from './bulk';
import { useSaveBulk, useUploadTargets } from './bulk-api';

const DOC_TYPES: { value: BulkDocType; label: string; hint: string }[] = [
  {
    value: 'PL',
    label: 'Product list / ASN — goods coming in',
    hint: "The customer's packing list. Creates a new inbound on the job and sends it to the warehouse.",
  },
  {
    value: 'GRN',
    label: 'GRN — goods received by the warehouse',
    hint: 'The warehouse’s received-goods report for an inbound. It is checked against the product list.',
  },
  {
    value: 'REQUEST',
    label: 'Release request — goods going out',
    hint: 'The customer’s out / delivery request. Quantities are checked against available stock.',
  },
  {
    value: 'POD',
    label: 'POD — goods delivered',
    hint: 'Proof of delivery for a release request. It is checked against the request.',
  },
];

const FIELDS = { PL: PL_FIELDS, GRN: GRN_FIELDS, REQUEST: REQUEST_FIELDS, POD: POD_FIELDS };
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

/**
 * Bulk Excel / CSV upload from the warehouse screen: pick what you are uploading, the customer and
 * job, then the file. Columns are mapped once per customer / warehouse and remembered.
 */
export function BulkUploadDialog({
  open,
  onClose,
  siteId,
}: {
  open: boolean;
  onClose: () => void;
  siteId?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Upload Excel"
      description="Upload a whole file at once: product list, GRN, release request or POD. No line-by-line typing."
    >
      {open ? <BulkUploadForm siteId={siteId} onDone={onClose} /> : null}
    </Dialog>
  );
}

function BulkUploadForm({ siteId, onDone }: { siteId?: string; onDone: () => void }) {
  const toast = useToast();
  const customers = useCustomerOptions();
  const save = useSaveBulk();
  const [docType, setDocType] = useState<BulkDocType>('PL');
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [inboundId, setInboundId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [reference, setReference] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [deliverTo, setDeliverTo] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [send, setSend] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [rows, setRows] = useState<ImportedRow[] | null>(null);
  const [file, setFile] = useState<{ name: string; sizeKb: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string[]>([]);

  const targets = useUploadTargets(customerId, siteId);
  const job = targets.data?.find((j) => j.id === jobId);
  const customerName = customers.data?.find((c) => c.value === customerId)?.label ?? 'customer';
  const meta = DOC_TYPES.find((d) => d.value === docType)!;

  const lines =
    rows === null
      ? []
      : docType === 'GRN'
        ? rowsToGrnLines(rows)
        : docType === 'POD'
          ? rowsToPodLines(rows)
          : rowsToDocLines(rows);

  const resetFile = () => {
    setRows(null);
    setFile(null);
    setDocNumber('');
    setReference('');
  };

  const attachment = (): Attachment => ({
    fileName: file?.name ?? 'upload.xlsx',
    sizeKb: file?.sizeKb ?? 1,
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Warehouse upload',
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customer = 'Choose the customer';
    if (!jobId) e.job = 'Choose the warehouse job';
    if (docType === 'PL' && !reference.trim()) e.reference = 'Enter the container, ASN or truck reference';
    if (docType === 'GRN' && !inboundId) e.inbound = 'Choose the inbound this GRN belongs to';
    if ((docType === 'GRN' || docType === 'POD') && !docNumber.trim()) e.number = 'Enter the document number';
    if (docType === 'REQUEST' && !deliverTo.trim()) e.deliverTo = 'Enter where the goods go';
    if (docType === 'POD' && !requestId) e.request = 'Choose the release request this POD closes';
    if (docType === 'POD' && !receivedBy.trim()) e.receivedBy = 'Enter who received the goods';
    if (!lines.length) e.file = 'Choose an Excel or CSV file with at least one valid line';
    setErrors(e);
    if (Object.keys(e).length) return;
    const at = `${date}T12:00:00.000Z`;
    save.mutate(
      docType === 'PL'
        ? {
            kind: 'PL',
            jobId,
            reference: reference.trim(),
            expectedAt: date,
            lines: rowsToDocLines(rows!),
            attachment: attachment(),
            send,
          }
        : docType === 'GRN'
          ? {
              kind: 'GRN',
              jobId,
              inboundId,
              grn: {
                number: docNumber.trim(),
                receivedAt: at,
                attachment: attachment(),
                lines: rowsToGrnLines(rows!),
              },
            }
          : docType === 'REQUEST'
            ? {
                kind: 'REQUEST',
                jobId,
                deliverTo: deliverTo.trim(),
                requiredBy: date,
                lines: rowsToDocLines(rows!),
              }
            : {
                kind: 'POD',
                jobId,
                requestId,
                pod: {
                  number: docNumber.trim(),
                  deliveredAt: at,
                  receivedBy: receivedBy.trim(),
                  attachment: attachment(),
                  lines: rowsToPodLines(rows!),
                },
              },
      {
        onSuccess: (msg) => {
          toast({ title: 'Upload saved', body: `${msg} for ${customerName}.` });
          setSaved((s) => [`${msg} — ${file?.name ?? ''}`, ...s]);
          resetFile();
          setInboundId('');
          setRequestId('');
        },
      },
    );
  };

  const templateKey =
    docType === 'PL' || docType === 'REQUEST'
      ? `${docType === 'PL' ? 'PL' : 'REQ'}:${customerId}`
      : `${docType}:${siteId ?? 'all'}`;

  return (
    <div className="space-y-5">
      {saved.length ? (
        <div role="status" className="rounded-xl bg-success-subtle px-4 py-3 text-body-s text-success">
          <p className="font-medium">
            {saved.length} file{saved.length > 1 ? 's' : ''} uploaded in this session
          </p>
          <ul className="mt-1 list-disc pl-5">
            {saved.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <SelectField
        label="What are you uploading?"
        required
        options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))}
        value={docType}
        hint={meta.hint}
        onChange={(e) => {
          setDocType(e.target.value as BulkDocType);
          resetFile();
          setErrors({});
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Customer"
          required
          placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
          options={customers.data ?? []}
          value={customerId}
          error={errors.customer}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setJobId('');
            setInboundId('');
            setRequestId('');
          }}
        />
        <SelectField
          label="Warehouse job"
          required
          placeholder={
            !customerId ? 'Choose the customer first' : targets.isLoading ? 'Loading…' : 'Select job'
          }
          options={(targets.data ?? []).map((j) => ({ value: j.id, label: j.label }))}
          value={jobId}
          error={errors.job}
          disabled={!customerId}
          onChange={(e) => {
            setJobId(e.target.value);
            setInboundId('');
            setRequestId('');
          }}
        />
      </div>
      {customerId && targets.data && !targets.data.length ? (
        <StatusMessage
          kind="empty"
          title="No open warehouse job for this customer in this warehouse"
          description={
            <span>
              Storage runs on a job (work order). Create one from the customer’s{' '}
              <Link to="/sales-orders" className="font-medium text-brand hover:underline">
                sales order
              </Link>
              , then upload here.
            </span>
          }
        />
      ) : null}

      {docType === 'PL' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Container / ASN / truck reference"
            required
            value={reference}
            error={errors.reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. TGHU 551023-7"
          />
          <TextField
            label="Expected arrival"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label className="flex items-center gap-2 text-body-s sm:col-span-2">
            <input
              type="checkbox"
              checked={send}
              onChange={(e) => setSend(e.target.checked)}
              className="size-4"
            />
            Send the product list to the warehouse now
          </label>
        </div>
      ) : null}
      {docType === 'GRN' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Inbound (product list sent, waiting for GRN)"
            required
            className="sm:col-span-2"
            placeholder={
              job
                ? job.inboundsAwaitingGrn.length
                  ? 'Select inbound'
                  : 'No inbound is waiting for a GRN'
                : 'Choose the job first'
            }
            options={(job?.inboundsAwaitingGrn ?? []).map((i) => ({ value: i.id, label: i.label }))}
            value={inboundId}
            error={errors.inbound}
            disabled={!job}
            onChange={(e) => setInboundId(e.target.value)}
          />
          <TextField
            label="Warehouse GRN number"
            required
            value={docNumber}
            error={errors.number}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="e.g. GRN-5531"
          />
          <TextField
            label="Received on"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      ) : null}
      {docType === 'REQUEST' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Deliver to"
            required
            value={deliverTo}
            error={errors.deliverTo}
            onChange={(e) => setDeliverTo(e.target.value)}
            placeholder="e.g. Mall of the Emirates store"
          />
          <TextField
            label="Needed by"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      ) : null}
      {docType === 'POD' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Release request this POD closes"
            required
            className="sm:col-span-2"
            placeholder={
              job
                ? job.requestsAwaitingPod.length
                  ? 'Select request'
                  : 'No request is waiting for a POD'
                : 'Choose the job first'
            }
            options={(job?.requestsAwaitingPod ?? []).map((r) => ({ value: r.id, label: r.label }))}
            value={requestId}
            error={errors.request}
            disabled={!job}
            onChange={(e) => setRequestId(e.target.value)}
          />
          <TextField
            label="POD number"
            required
            value={docNumber}
            error={errors.number}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="e.g. POD-88130"
          />
          <TextField
            label="Received by"
            required
            value={receivedBy}
            error={errors.receivedBy}
            onChange={(e) => setReceivedBy(e.target.value)}
          />
          <TextField
            label="Delivered on"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-border-strong bg-canvas px-4 py-4">
        {file && rows ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-body-s">
              <FileSpreadsheet aria-hidden="true" className="size-5 text-success" />
              <span>
                <span className="font-medium">{file.name}</span> · {lines.length} line
                {lines.length === 1 ? '' : 's'} · {totalUnits(lines).toLocaleString('en-AE')} units
              </span>
            </p>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              Change file
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-s text-fg-muted">
              Excel (.xlsx) or CSV. You match the columns once; it is remembered for this{' '}
              {docType === 'PL' || docType === 'REQUEST' ? 'customer' : 'warehouse'}.
            </p>
            <Button
              icon={<Upload aria-hidden="true" />}
              disabled={!customerId}
              onClick={() => setImportOpen(true)}
            >
              Choose file
            </Button>
          </div>
        )}
        {errors.file ? <p className="mt-2 text-caption text-danger">{errors.file}</p> : null}
      </div>
      {lines.length ? (
        <div
          tabIndex={0}
          role="region"
          aria-label="Uploaded lines preview"
          className="max-h-56 overflow-auto rounded-xl border border-border-subtle"
        >
          <table className="w-full text-body-s">
            <caption className="sr-only">First lines from the file</caption>
            <thead className="bg-canvas text-left text-caption text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  SKU
                </th>
                <th scope="col" className="px-3 py-2">
                  Detail
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {lines.slice(0, 50).map((l, i) => (
                <tr key={`${l.sku}-${i}`}>
                  <td className="px-3 py-1.5 font-mono text-[13px]">{l.sku}</td>
                  <td className="px-3 py-1.5 text-fg-muted">
                    {'description' in l
                      ? l.description
                      : 'damagedQty' in l && l.damagedQty
                        ? `${l.damagedQty} damaged`
                        : ''}
                    {'batch' in l && l.batch ? ` · batch ${l.batch}` : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {'quantity' in l ? l.quantity : 'receivedQty' in l ? l.receivedQty : l.deliveredQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {save.error ? <StatusMessage kind="error" title="Not saved" description={errText(save.error)} /> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onDone}>
          {saved.length ? 'Done' : 'Cancel'}
        </Button>
        <Button busy={save.isPending} onClick={submit}>
          Save upload
        </Button>
      </div>

      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={`Import ${meta.label.split(' — ')[0]}`}
        fields={FIELDS[docType]}
        templateKey={templateKey}
        partyName={docType === 'PL' || docType === 'REQUEST' ? customerName : 'this warehouse'}
        onImport={(data, f) => {
          setRows(data);
          setFile(f);
          setErrors((er) => ({ ...er, file: '' }));
        }}
      />
    </div>
  );
}
