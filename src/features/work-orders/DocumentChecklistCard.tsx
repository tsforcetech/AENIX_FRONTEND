// ---- FLOW-003 WP-C ---- T3: transport / customs document checklist per job.
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Attachment, JobDocument } from '@/domain/types';
import { isDocumentReceived } from '@/domain/workflow';
import { AttachmentChip } from '@/shared/ui/Attachment';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import type { WorkOrderDetail } from './api';
import { PROTO_TODAY } from './api';
import { useJobAction, type JobExtras } from './transport-api';
import { CheckboxField, errorText, FileField } from './wpc-fields';

export function DocumentChecklistCard({ wo, extras }: { wo: WorkOrderDetail; extras: JobExtras }) {
  const [editing, setEditing] = useState<JobDocument | 'new' | null>(null);
  const action = useJobAction();
  const toast = useToast();
  const missing = extras.missingDocuments.length;
  return (
    <Card>
      <CardHeader
        title="Documents"
        description={
          missing ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-warning">
              <AlertTriangle aria-hidden="true" className="size-4" />
              {missing} required document{missing === 1 ? '' : 's'} missing
            </span>
          ) : extras.checklist.length ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" /> All required documents received
            </span>
          ) : (
            'No standard documents for this job type. Add any document you need to track.'
          )
        }
        actions={
          wo.status !== 'Cancelled' ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setEditing('new')}
            >
              Add document
            </Button>
          ) : null
        }
      />
      <CardBody>
        {extras.checklist.length ? (
          <ul className="divide-y divide-border-subtle">
            {extras.checklist.map((d) => {
              const received = isDocumentReceived(d);
              const custom = !d.id.startsWith('tpl:') && !d.required;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {d.name}
                      <Badge tone={d.required ? 'info' : 'neutral'} dot={false}>
                        {d.required ? 'Required' : 'Optional'}
                      </Badge>
                      {received ? (
                        <Badge tone="success">Received</Badge>
                      ) : d.required ? (
                        <Badge tone="warning">Missing</Badge>
                      ) : (
                        <Badge tone="neutral">Not received</Badge>
                      )}
                    </p>
                    <p className="text-caption text-fg-muted">
                      {d.number ? (
                        <>
                          No. <span className="font-mono text-fg-secondary">{d.number}</span>
                        </>
                      ) : (
                        'No number yet'
                      )}
                      {d.receivedAt ? ` · received ${formatDate(d.receivedAt)}` : ''}
                    </p>
                    {d.attachment ? <AttachmentChip file={d.attachment} /> : null}
                  </div>
                  {wo.status !== 'Cancelled' ? (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                        {received ? 'Edit' : 'Record'}
                        <span className="sr-only"> {d.name}</span>
                      </Button>
                      {custom ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${d.name}`}
                          icon={<Trash2 aria-hidden="true" />}
                          onClick={() =>
                            action.mutate(
                              { op: 'removeDocument', id: wo.id, docId: d.id },
                              { onError: (e) => toast({ title: 'Not removed', body: errorText(e) }) },
                            )
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
            No documents tracked yet.
          </p>
        )}
      </CardBody>
      {editing ? (
        <DocumentDialog
          wo={wo}
          doc={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function DocumentDialog({
  wo,
  doc,
  onClose,
}: {
  wo: WorkOrderDetail;
  doc?: JobDocument;
  onClose: () => void;
}) {
  const action = useJobAction();
  const toast = useToast();
  const [name, setName] = useState(doc?.name ?? '');
  const [required, setRequired] = useState(doc?.required ?? false);
  const [number, setNumber] = useState(doc?.number ?? '');
  const [receivedAt, setReceivedAt] = useState(doc?.receivedAt?.slice(0, 10) ?? '');
  const [attachment, setAttachment] = useState<Attachment | undefined>(doc?.attachment);
  const [error, setError] = useState<string>();
  const save = () =>
    action.mutate(
      {
        op: 'saveDocument',
        id: wo.id,
        docId: doc?.id,
        name,
        required,
        number,
        receivedAt: receivedAt || (attachment && !doc?.attachment ? PROTO_TODAY : undefined),
        attachment,
      },
      {
        onSuccess: () => {
          toast({ title: `${name.trim()} saved` });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={doc ? `Record ${doc.name}` : 'Add document'}
      description="Number, received date and the scanned copy."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={save}>
            Save document
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
        <TextField
          label="Document"
          required
          value={name}
          disabled={!!doc}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Insurance certificate"
        />
        <CheckboxField
          label="Required for this job"
          checked={required}
          onChange={setRequired}
          hint="Missing required documents are shown on the job header."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Document number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="e.g. MSKU1234567"
          />
          <TextField
            label="Received on"
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </div>
        <FileField label="Scanned copy" file={attachment} onFile={setAttachment} />
      </div>
    </Dialog>
  );
}
