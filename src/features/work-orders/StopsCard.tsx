// ---- FLOW-003 WP-C ---- T4: multi-pickup / multi-drop stops, each closed by its own POD.
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Attachment, JobStop } from '@/domain/types';
import { AttachmentChip } from '@/shared/ui/Attachment';
import { Badge, type Tone } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils/format';
import type { WorkOrderDetail } from './api';
import { isoToLocal, localToIso, useJobAction } from './transport-api';
import { errorText, FileField } from './wpc-fields';

const stopTone: Record<JobStop['status'], Tone> = {
  Planned: 'neutral',
  Arrived: 'info',
  Done: 'success',
  Failed: 'danger',
};

const RUNNING = ['Confirmed', 'In progress', 'In transit', 'Delivered'];

export function StopsCard({ wo }: { wo: WorkOrderDetail }) {
  const stops = [...(wo.stops ?? [])].sort((a, b) => a.seq - b.seq);
  const [editing, setEditing] = useState<JobStop | 'new' | null>(null);
  const [closing, setClosing] = useState<{ stop: JobStop; status: 'Done' | 'Failed' } | null>(null);
  const action = useJobAction();
  const toast = useToast();
  const open = wo.status !== 'Cancelled' && wo.status !== 'Completed';
  const running = RUNNING.includes(wo.status);
  const deliveries = stops.filter((s) => s.type === 'Delivery');
  const doneDeliveries = deliveries.filter((s) => s.status === 'Done').length;
  const onError = (e: unknown) => toast({ title: 'Action not allowed', body: errorText(e) });

  return (
    <Card>
      <CardHeader
        title="Stops"
        description={
          deliveries.length
            ? `${doneDeliveries} of ${deliveries.length} deliveries done — the job is delivered when every delivery stop is done`
            : 'Add pickup and delivery stops for multi-drop or multi-leg trips'
        }
        actions={
          open ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setEditing('new')}
            >
              Add stop
            </Button>
          ) : null
        }
      />
      <CardBody>
        {stops.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
            Single pickup and delivery: {wo.origin} → {wo.destination || '—'}.
          </p>
        ) : (
          <ol className="divide-y divide-border-subtle">
            {stops.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-caption font-semibold tabular-nums">
                    {s.seq}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <Badge tone={s.type === 'Pickup' ? 'info' : 'brand'} dot={false}>
                        {s.type}
                      </Badge>
                      {s.address}
                      <Badge tone={stopTone[s.status]}>{s.status}</Badge>
                    </p>
                    <p className="text-caption text-fg-muted">
                      Planned {formatDateTime(s.plannedAt)}
                      {s.actualAt ? ` · actual ${formatDateTime(s.actualAt)}` : ''}
                      {s.contact ? ` · ${s.contact}` : ''}
                    </p>
                    {s.pod ? (
                      <div className="text-caption text-fg-secondary">
                        {s.pod.receivedBy ? <p>Received by {s.pod.receivedBy}</p> : null}
                        {s.pod.exceptions ? (
                          <p className="text-warning">Exceptions: {s.pod.exceptions}</p>
                        ) : null}
                        {s.pod.attachment ? (
                          <div className="mt-1">
                            <AttachmentChip file={s.pod.attachment} />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                {open ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {running && (s.status === 'Planned' || s.status === 'Arrived') ? (
                      <>
                        {s.status === 'Planned' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            busy={action.isPending}
                            onClick={() =>
                              action.mutate(
                                { op: 'stopStatus', id: wo.id, stopId: s.id, status: 'Arrived' },
                                { onError },
                              )
                            }
                          >
                            Arrived<span className="sr-only"> at stop {s.seq}</span>
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => setClosing({ stop: s, status: 'Done' })}>
                          Done<span className="sr-only"> stop {s.seq}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setClosing({ stop: s, status: 'Failed' })}
                        >
                          Failed<span className="sr-only"> stop {s.seq}</span>
                        </Button>
                      </>
                    ) : null}
                    {running && s.status === 'Failed' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setClosing({ stop: s, status: 'Done' })}
                      >
                        Done on retry<span className="sr-only"> stop {s.seq}</span>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move stop ${s.seq} up`}
                      disabled={i === 0}
                      icon={<ArrowUp aria-hidden="true" />}
                      onClick={() =>
                        action.mutate({ op: 'moveStop', id: wo.id, stopId: s.id, dir: -1 }, { onError })
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move stop ${s.seq} down`}
                      disabled={i === stops.length - 1}
                      icon={<ArrowDown aria-hidden="true" />}
                      onClick={() =>
                        action.mutate({ op: 'moveStop', id: wo.id, stopId: s.id, dir: 1 }, { onError })
                      }
                    />
                    {s.status !== 'Done' ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Edit stop ${s.seq}`}
                          icon={<Pencil aria-hidden="true" />}
                          onClick={() => setEditing(s)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove stop ${s.seq}`}
                          icon={<Trash2 aria-hidden="true" />}
                          onClick={() =>
                            action.mutate({ op: 'removeStop', id: wo.id, stopId: s.id }, { onError })
                          }
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
      {editing ? (
        <StopDialog wo={wo} stop={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
      {closing ? (
        <CloseStopDialog
          wo={wo}
          stop={closing.stop}
          status={closing.status}
          onClose={() => setClosing(null)}
        />
      ) : null}
    </Card>
  );
}

function StopDialog({ wo, stop, onClose }: { wo: WorkOrderDetail; stop?: JobStop; onClose: () => void }) {
  const action = useJobAction();
  const toast = useToast();
  const [type, setType] = useState<JobStop['type']>(stop?.type ?? 'Delivery');
  const [address, setAddress] = useState(stop?.address ?? '');
  const [contact, setContact] = useState(stop?.contact ?? '');
  const [plannedAt, setPlannedAt] = useState(isoToLocal(stop?.plannedAt) || `${wo.eta}T09:00`);
  const [error, setError] = useState<string>();
  const save = () =>
    action.mutate(
      {
        op: 'saveStop',
        id: wo.id,
        stopId: stop?.id,
        type,
        address,
        contact,
        plannedAt: localToIso(plannedAt),
      },
      {
        onSuccess: () => {
          toast({ title: stop ? 'Stop updated' : 'Stop added' });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={stop ? `Edit stop ${stop.seq}` : 'Add stop'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={save}>
            Save stop
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
          label="Stop type"
          value={type}
          onChange={(e) => setType(e.target.value as JobStop['type'])}
          options={[
            { value: 'Pickup', label: 'Pickup' },
            { value: 'Delivery', label: 'Delivery' },
          ]}
        />
        <TextField
          label="Address"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Warehouse 4, Al Quoz Industrial 3, Dubai"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Contact (name / phone)"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <TextField
            label="Planned time"
            type="datetime-local"
            required
            value={plannedAt}
            onChange={(e) => setPlannedAt(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function CloseStopDialog({
  wo,
  stop,
  status,
  onClose,
}: {
  wo: WorkOrderDetail;
  stop: JobStop;
  status: 'Done' | 'Failed';
  onClose: () => void;
}) {
  const action = useJobAction();
  const toast = useToast();
  const nowLocal = isoToLocal(new Date().toISOString());
  const [receivedBy, setReceivedBy] = useState('');
  const [at, setAt] = useState(nowLocal);
  const [exceptions, setExceptions] = useState('');
  const [attachment, setAttachment] = useState<Attachment>();
  const [error, setError] = useState<string>();
  const needsPod = status === 'Done' && stop.type === 'Delivery';
  const save = () =>
    action.mutate(
      {
        op: 'stopStatus',
        id: wo.id,
        stopId: stop.id,
        status,
        pod: { receivedBy, at: localToIso(at), exceptions: exceptions.trim() || undefined, attachment },
      },
      {
        onSuccess: (w) => {
          toast({
            title: `Stop ${stop.seq} ${status.toLowerCase()}`,
            body: w.status === 'Delivered' ? `${w.number} is now delivered.` : undefined,
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
      title={status === 'Done' ? `Close stop ${stop.seq}` : `Stop ${stop.seq} failed`}
      description={`${stop.type} · ${stop.address}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={status === 'Failed' ? 'danger' : 'primary'} busy={action.isPending} onClick={save}>
            {status === 'Done' ? (needsPod ? 'Save POD and close stop' : 'Mark done') : 'Mark failed'}
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
        <div className="grid gap-4 sm:grid-cols-2">
          {status === 'Done' ? (
            <TextField
              label={needsPod ? 'Received by' : 'Handed over by'}
              required={needsPod}
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Name and designation"
            />
          ) : null}
          <TextField label="Time" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        <TextareaField
          label={status === 'Failed' ? 'Reason' : 'Exceptions (shortage, damage, remarks)'}
          required={status === 'Failed'}
          value={exceptions}
          onChange={(e) => setExceptions(e.target.value)}
          placeholder={
            status === 'Failed' ? 'e.g. Receiver closed, rescheduled for tomorrow' : 'e.g. 1 carton damaged'
          }
        />
        <FileField
          label={status === 'Done' ? 'Signed POD' : 'Photo / note'}
          file={attachment}
          onFile={setAttachment}
        />
      </div>
    </Dialog>
  );
}
