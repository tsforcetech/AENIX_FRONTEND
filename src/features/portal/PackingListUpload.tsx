import { FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import type { DocLine } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, TextField } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { PL_FIELDS, SpreadsheetImport, type ImportedRow } from '@/shared/ui/SpreadsheetImport';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { useUploadPackingList, type CustomerOverview } from './api';

type Job = CustomerOverview['warehouseJobs'][number];

const blankLine = (): DocLine => ({ sku: '', description: '', quantity: 1, uom: 'Ctn' });

/**
 * Customer-side inbound announcements for warehouse jobs. Goods arrive many times on a storage job:
 * each consignment gets its own packing list (imported from the customer's Excel), and the warehouse
 * GRN is checked against it. Stock is shown read-only.
 */
export function PackingListsCard({ partyId, jobs }: { partyId: string; jobs: Job[] }) {
  const [job, setJob] = useState<Job | null>(null);
  return (
    <Card>
      <CardHeader
        title="Warehouse: inbound packing lists & stock"
        description="Announce each consignment with its packing list (Excel import supported). The warehouse GRN is checked against it."
      />
      <CardBody className="space-y-6 pt-3">
        {jobs.length === 0 ? (
          <p className="rounded-lg bg-canvas px-4 py-6 text-center text-body-s text-fg-muted">
            You have no open warehouse jobs. When a job with warehouse handling is opened for you, you can
            announce inbound consignments and upload their packing lists here.
          </p>
        ) : (
          jobs.map((j) => (
            <section key={j.id} aria-label={`${j.number} warehouse`} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <DocRef>{j.number}</DocRef>
                  <span className="block truncate text-caption text-fg-muted">{j.location}</span>
                </span>
                {j.canUploadPl ? (
                  <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => setJob(j)}>
                    New inbound (upload PL)
                  </Button>
                ) : null}
              </div>
              {j.inbounds.length === 0 ? (
                <p className="text-caption text-fg-muted">No inbound announced yet.</p>
              ) : (
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {j.inbounds.map((ib) => (
                    <li
                      key={ib.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-caption"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-[13px] font-medium">{ib.number}</span>
                        <span className="block truncate text-fg-muted">
                          {ib.reference || '—'} · expected {formatDate(ib.expectedAt)} · {ib.plLines} lines
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{ib.plNumber}</span>
                        <StatusBadge status={ib.plStatus} />
                        {ib.grnNumber ? (
                          <>
                            <span className="font-mono">{ib.grnNumber}</span>
                            <StatusBadge status={ib.grnStatus ?? 'Uploaded'} />
                          </>
                        ) : (
                          <span className="text-fg-muted">GRN pending</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {j.stock.length ? (
                <details className="rounded-lg border border-border-subtle">
                  <summary className="cursor-pointer px-3 py-2 text-body-s font-medium">
                    Stock in the warehouse · {j.stock.reduce((s, x) => s + x.onHand, 0)} units on hand
                  </summary>
                  <div
                    className="overflow-x-auto"
                    tabIndex={0}
                    role="region"
                    aria-label={`${j.number} stock`}
                  >
                    <table className="w-full min-w-[480px] text-left text-caption">
                      <thead>
                        <tr className="border-y border-border-subtle bg-canvas text-fg-muted">
                          <th scope="col" className="px-3 py-1.5 font-medium">
                            SKU
                          </th>
                          <th scope="col" className="px-3 py-1.5 font-medium">
                            Description
                          </th>
                          <th scope="col" className="px-3 py-1.5 text-right font-medium">
                            Received
                          </th>
                          <th scope="col" className="px-3 py-1.5 text-right font-medium">
                            Delivered
                          </th>
                          <th scope="col" className="px-3 py-1.5 text-right font-medium">
                            On hand
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {j.stock.map((s) => (
                          <tr key={s.sku} className="border-b border-border-subtle last:border-0">
                            <td className="px-3 py-1.5 font-mono">{s.sku}</td>
                            <td className="px-3 py-1.5">{s.description}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{s.received}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{s.delivered}</td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{s.onHand}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </section>
          ))
        )}
      </CardBody>
      {job ? <UploadDialog partyId={partyId} job={job} onClose={() => setJob(null)} /> : null}
    </Card>
  );
}

function UploadDialog({ partyId, job, onClose }: { partyId: string; job: Job; onClose: () => void }) {
  const upload = useUploadPackingList(partyId);
  const toast = useToast();
  const fileId = useId();
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('2026-11-30');
  const [lines, setLines] = useState<DocLine[]>([blankLine()]);
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<DocLine>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const applyImport = (rows: ImportedRow[], f: { name: string; sizeKb: number }) => {
    const map = new Map<string, DocLine>();
    for (const r of rows) {
      const sku = String(r.sku ?? '')
        .trim()
        .toUpperCase();
      if (!sku) continue;
      const prev = map.get(sku);
      map.set(sku, {
        sku,
        description: prev?.description || String(r.description ?? sku),
        quantity: (prev?.quantity ?? 0) + (Number(r.quantity) || 0),
        uom: prev?.uom || String(r.uom ?? 'Pcs'),
      });
    }
    setLines([...map.values()]);
    setImported(true);
    if (!file) setFile({ name: f.name, size: f.sizeKb * 1024 });
  };

  const submit = async () => {
    setError(null);
    if (reference.trim().length < 2)
      return setError('Enter your reference (ASN, container, AWB or truck number).');
    if (!file) return setError('Attach the packing list file, or import it from Excel.');
    const clean = lines.filter((l) => l.sku.trim() || l.description.trim());
    if (clean.length === 0) return setError('Add at least one line.');
    if (clean.some((l) => !l.sku.trim() || !(l.quantity > 0)))
      return setError('Every line needs a SKU and a quantity above 0.');
    const skus = clean.map((l) => l.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) return setError('Each SKU can appear only once.');
    try {
      const r = await upload.mutateAsync({
        workOrderId: job.id,
        file,
        lines: clean,
        reference: reference.trim(),
        expectedAt,
        imported,
      });
      toast({
        title: `${r.inboundNumber} sent to the warehouse`,
        body: `${r.number} · ${clean.length} lines · ${file.name}`,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title={`New inbound — ${job.number}`}
        description="Announce a consignment and upload its packing list. Import your Excel file — the columns are mapped once and remembered."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={upload.isPending} onClick={() => void submit()}>
              Send to warehouse
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Your reference"
              required
              placeholder="ASN / container / AWB / truck no."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <TextField
              label="Expected on"
              type="date"
              required
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={fileId} className="text-body-s font-medium">
              Packing list file <span className="text-brand">*</span>
            </label>
            <input
              id={fileId}
              type="file"
              accept=".pdf,.xlsx,.csv,.jpg,.jpeg,.png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFile(f ? { name: f.name, size: f.size } : null);
              }}
              className="block w-full text-body-s file:mr-3 file:rounded-lg file:border-0 file:bg-surface-inverse file:px-3 file:py-2 file:text-caption file:font-medium file:text-fg-inverse"
            />
            <p className="text-caption text-fg-muted">
              {file ? `${file.name}` : 'PDF, Excel, CSV or image. Stored securely by AENIX.'}
            </p>
          </div>
          <fieldset>
            <legend className="sr-only">Packing list lines</legend>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p aria-hidden="true" className="text-body-s font-medium">
                Lines <span className="font-normal text-fg-muted">· {lines.length} SKUs</span>
              </p>
              <Button
                size="sm"
                variant="secondary"
                icon={<FileSpreadsheet aria-hidden="true" />}
                onClick={() => setImportOpen(true)}
              >
                Import from Excel
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_1.6fr_5rem_5rem_auto] items-center gap-2">
                  <input
                    aria-label={`Line ${i + 1} SKU`}
                    placeholder="SKU"
                    value={l.sku}
                    onChange={(e) => setLine(i, { sku: e.target.value })}
                    className={`${inputClasses} h-9 font-mono`}
                  />
                  <input
                    aria-label={`Line ${i + 1} description`}
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    className={`${inputClasses} h-9`}
                  />
                  <input
                    aria-label={`Line ${i + 1} quantity`}
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })}
                    className={`${inputClasses} h-9 text-right`}
                  />
                  <input
                    aria-label={`Line ${i + 1} unit`}
                    value={l.uom}
                    onChange={(e) => setLine(i, { uom: e.target.value })}
                    className={`${inputClasses} h-9`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                    className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setLines((ls) => [...ls, blankLine()])}
            >
              Add line
            </Button>
          </fieldset>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import packing list"
        fields={PL_FIELDS}
        templateKey={`PL:${partyId}`}
        partyName="your company"
        onImport={applyImport}
      />
    </>
  );
}
