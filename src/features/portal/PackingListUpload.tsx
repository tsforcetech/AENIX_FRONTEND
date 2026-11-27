import { Plus, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import type { DocLine } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { useToast } from '@/shared/ui/Toast';
import { useUploadPackingList, type CustomerOverview } from './api';

type Job = CustomerOverview['warehouseJobs'][number];

const blankLine = (): DocLine => ({ sku: '', description: '', quantity: 1, uom: 'Ctn' });

/** Customer-side PL upload for warehouse jobs. The warehouse/vendor GRN is later checked against it. */
export function PackingListsCard({ partyId, jobs }: { partyId: string; jobs: Job[] }) {
  const [job, setJob] = useState<Job | null>(null);
  return (
    <Card>
      <CardHeader
        title="Packing lists (PL)"
        description="Tell the warehouse what is coming. The goods received note (GRN) is checked against your packing list."
      />
      <CardBody className="pt-3">
        {jobs.length === 0 ? (
          <p className="rounded-lg bg-canvas px-4 py-6 text-center text-body-s text-fg-muted">
            You have no open warehouse jobs. When a job with warehouse handling is opened for you, you can
            upload its packing list here.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1">
                  <DocRef>{j.number}</DocRef>
                  <span className="block truncate text-caption text-fg-muted">{j.location}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-caption">
                  {j.plNumber ? (
                    <>
                      <span className="font-mono">{j.plNumber}</span>
                      <StatusBadge status={j.plStatus ?? 'Draft'} />
                    </>
                  ) : (
                    <span className="text-fg-muted">No packing list yet</span>
                  )}
                  {j.grnNumber ? (
                    <>
                      <span className="font-mono">{j.grnNumber}</span>
                      <StatusBadge status={j.grnStatus ?? 'Uploaded'} />
                    </>
                  ) : null}
                </span>
                {j.canUploadPl ? (
                  <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => setJob(j)}>
                    Upload PL
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
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
  const [lines, setLines] = useState<DocLine[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<DocLine>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setError(null);
    if (!file) return setError('Attach the packing list file.');
    const clean = lines.filter((l) => l.sku.trim() || l.description.trim());
    if (clean.length === 0) return setError('Add at least one line.');
    if (clean.some((l) => !l.sku.trim() || !(l.quantity > 0)))
      return setError('Every line needs a SKU and a quantity above 0.');
    const skus = clean.map((l) => l.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) return setError('Each SKU can appear only once.');
    try {
      const r = await upload.mutateAsync({ workOrderId: job.id, file, lines: clean });
      toast({ title: `${r.number} sent to the warehouse`, body: `${clean.length} lines · ${file.name}` });
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
      title={`Upload packing list — ${job.number}`}
      description="Attach your packing list and enter its lines so the warehouse GRN can be checked against it."
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
        <div className="space-y-1.5">
          <label htmlFor={fileId} className="text-body-s font-medium">
            Packing list file <span className="text-brand">*</span>
          </label>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ? { name: f.name, size: f.size } : null);
            }}
            className="block w-full text-body-s file:mr-3 file:rounded-lg file:border-0 file:bg-surface-inverse file:px-3 file:py-2 file:text-caption file:font-medium file:text-fg-inverse"
          />
          <p className="text-caption text-fg-muted">PDF, Excel, CSV or image. Stored securely by AENIX.</p>
        </div>
        <fieldset>
          <legend className="mb-2 text-body-s font-medium">Lines</legend>
          <div className="space-y-2">
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
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
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
  );
}
