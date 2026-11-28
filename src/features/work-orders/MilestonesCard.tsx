// ---- FLOW-003 WP-C ---- T2: staff milestone updates with editable timestamps (kept in order).
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { milestoneOrderError } from '@/domain/workflow';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/Field';
import { MilestoneTimeline } from '@/shared/ui/Timeline';
import { useToast } from '@/shared/ui/Toast';
import { useWorkOrderAction, type WorkOrderDetail } from './api';
import { isoToLocal, localToIso, useJobAction } from './transport-api';
import { errorText } from './wpc-fields';

export function MilestonesCard({ wo }: { wo: WorkOrderDetail }) {
  const action = useWorkOrderAction();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const running = ['Confirmed', 'In progress', 'In transit'].includes(wo.status);
  const hasDone = wo.milestones.some((m) => m.status === 'Done');
  const waitingStops =
    wo.milestones.every((m) => m.status === 'Done') &&
    (wo.stops ?? []).some((s) => s.type === 'Delivery' && s.status !== 'Done');
  return (
    <Card>
      <CardHeader
        title="Milestones"
        description={`${wo.progress}% complete`}
        actions={
          <>
            {hasDone && wo.status !== 'Cancelled' ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil aria-hidden="true" />}
                onClick={() => setEditing(true)}
              >
                Edit times
              </Button>
            ) : null}
            {running && wo.milestones.some((m) => m.status === 'Current') ? (
              <Button
                size="sm"
                busy={action.isPending}
                onClick={() =>
                  action.mutate(
                    { id: wo.id, kind: 'advance' },
                    {
                      onSuccess: (w) =>
                        toast({
                          title: 'Milestone completed',
                          body: `${w.number} is now ${w.status.toLowerCase()}.`,
                        }),
                      onError: (e) => toast({ title: 'Action not allowed', body: errorText(e) }),
                    },
                  )
                }
              >
                Mark next done
              </Button>
            ) : null}
          </>
        }
      />
      <CardBody>
        {wo.status === 'Draft' ? (
          <p className="mb-4 rounded-lg bg-warning-subtle px-3 py-2 text-caption text-warning">
            Confirm the job to start tracking milestones.
          </p>
        ) : null}
        {wo.status === 'Cancelled' ? (
          <p className="mb-4 rounded-lg bg-surface-muted px-3 py-2 text-caption text-fg-muted">
            This job was cancelled{wo.cancelReason ? `: ${wo.cancelReason}` : '.'}
          </p>
        ) : null}
        {waitingStops ? (
          <p className="mb-4 rounded-lg bg-warning-subtle px-3 py-2 text-caption text-warning">
            Waiting for every delivery stop to be done before the job is delivered.
          </p>
        ) : null}
        <MilestoneTimeline milestones={wo.milestones} />
      </CardBody>
      {editing ? <MilestoneTimesDialog wo={wo} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function MilestoneTimesDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const action = useJobAction();
  const toast = useToast();
  const done = wo.milestones.filter((m) => m.status === 'Done');
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(done.map((m) => [m.id, isoToLocal(m.at)])),
  );
  const [error, setError] = useState<string>();
  const save = () => {
    const times = Object.fromEntries(
      Object.entries(values)
        .filter(([, v]) => !!v)
        .map(([k, v]) => [k, localToIso(v)]),
    );
    const err = milestoneOrderError(done.map((m) => ({ label: m.label, at: times[m.id] ?? m.at })));
    if (err) {
      setError(err);
      return;
    }
    action.mutate(
      { op: 'milestoneTimes', id: wo.id, times },
      {
        onSuccess: () => {
          toast({ title: 'Milestone times saved' });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit milestone times"
      description="Correct when each step really happened (Dubai time). Times must follow the milestone order."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={save}>
            Save times
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
        {done.map((m, i) => (
          <TextField
            key={m.id}
            label={`${i + 1}. ${m.label}`}
            type="datetime-local"
            value={values[m.id] ?? ''}
            onChange={(e) => {
              setValues((v) => ({ ...v, [m.id]: e.target.value }));
              setError(undefined);
            }}
          />
        ))}
      </div>
    </Dialog>
  );
}
