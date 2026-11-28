// ---- FLOW-003 WP-C ----
// Job-side transport, direct-service and costing features: document checklist (T3), stops (T4),
// surcharges (T8), service completion notes (S3), internal costs and profit (S4), milestone times (T2).
// PROTOTYPE ADAPTER — replace with the Jobs contract when Antigravity publishes it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nextDocNumber } from '@/domain/numbering';
import type {
  Attachment,
  InternalCost,
  JobDocument,
  JobStop,
  Milestone,
  ServiceCompletionNote,
  WorkOrder,
} from '@/domain/types';
import {
  categoryOfServiceMode,
  completionProof,
  deliveryStopsDone,
  documentChecklist,
  jobProfit,
  milestoneOrderError,
  missingDocuments,
  requiredDocuments,
  resequence,
  tripCostTotals,
  type JobProfit,
  type ProofItem,
} from '@/domain/workflow';
import { lookupName, suggestServiceRate } from '@/shared/data/lookups';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';
import { advanceIfCurrent, statusForProgress } from './api';

const RUNNING = ['Confirmed', 'In progress', 'In transit', 'Delivered'];

export interface JobTripRef {
  id: string;
  number: string;
  date: string;
  status: string;
  vehiclePlate: string;
  driverName: string;
  total: number;
}

export interface JobExtras {
  checklist: JobDocument[];
  missingDocuments: string[];
  profit: JobProfit;
  surchargeServiceIds: string[];
  surchargeServices: { id: string; name: string; unit: string; unitPrice?: number }[];
  /** Job lines that need a completion note (direct services such as customs, labour). */
  serviceLines: { id: string; serviceId: string; label: string; quantity: number; unit: string }[];
  purchaseOrders: { id: string; number: string; serviceId: string; vendorId: string; vendorName: string }[];
  completionNotes: (ServiceCompletionNote & {
    serviceName: string;
    vendorName?: string;
    poNumber?: string;
  })[];
  completionProof: ProofItem[];
  trips: JobTripRef[];
  fleetEnabled: boolean;
  canEdit: boolean;
}

function fail<T>(message: string): Promise<T> {
  return Promise.reject(new Error(message));
}

function findJob(id: string): WorkOrder {
  const wo = protoDb.get().workOrders.find((w) => w.id === id);
  if (!wo) throw new Error('Job not found');
  return wo;
}

function patchJob(id: string, fn: (wo: WorkOrder) => WorkOrder): WorkOrder {
  protoDb.update((s) => ({ ...s, workOrders: s.workOrders.map((w) => (w.id === id ? fn(w) : w)) }));
  return findJob(id);
}

function serviceOf(serviceId: string) {
  return protoDb.get().services.find((s) => s.id === serviceId);
}

function serviceModesOf(wo: WorkOrder): string[] {
  return wo.lines.map((l) => serviceOf(l.serviceId)?.mode).filter((m): m is NonNullable<typeof m> => !!m);
}

function isOpen(wo: WorkOrder) {
  return wo.status !== 'Cancelled' && wo.status !== 'Completed';
}

/** After a stop changes: close the "Delivered" milestone when every delivery stop is done, and re-derive status. */
function syncDelivery(w: WorkOrder): WorkOrder {
  if (!RUNNING.includes(w.status)) return w;
  let next = w;
  if ((w.stops ?? []).some((s) => s.type === 'Delivery') && deliveryStopsDone(w.stops)) {
    next = advanceIfCurrent(advanceIfCurrent(next, 'Delivered'), 'Delivered to warehouse');
  }
  const done = next.milestones.filter((m) => m.status === 'Done').length;
  return {
    ...next,
    status: statusForProgress(done, next.milestones.length, next.serviceCategory, next.stops),
  };
}

export const transportApi = {
  extras(id: string): Promise<JobExtras> {
    const db = protoDb.get();
    const wo = db.workOrders.find((w) => w.id === id);
    if (!wo) return fail('Job not found');
    const checklist = documentChecklist(
      wo.documents,
      requiredDocuments(wo.serviceCategories, wo.mode, serviceModesOf(wo)),
    );
    const surcharge = (sid: string) => !!serviceOf(sid)?.isSurcharge;
    const pos = db.purchaseOrders.filter((p) => p.workOrderId === id);
    const directLines = wo.lines.filter((l) => {
      const mode = serviceOf(l.serviceId)?.mode;
      return !!mode && categoryOfServiceMode(mode) === 'Service' && !serviceOf(l.serviceId)?.isDisbursement;
    });
    const labourLines = wo.lines.filter((l) => /labour|forklift/i.test(serviceOf(l.serviceId)?.name ?? ''));
    return latency({
      checklist,
      missingDocuments: missingDocuments(checklist),
      profit: jobProfit({
        lines: wo.lines,
        poCosts: pos.filter((p) => p.status !== 'Cancelled').map((p) => p.amount),
        internalCosts: wo.internalCosts,
        isSurcharge: surcharge,
        isDisbursement: (sid) => !!serviceOf(sid)?.isDisbursement,
      }),
      surchargeServiceIds: db.services.filter((s) => s.isSurcharge).map((s) => s.id),
      surchargeServices: db.services
        .filter((s) => s.isSurcharge)
        .map((s) => ({
          id: s.id,
          name: s.name,
          unit: s.unit,
          unitPrice: suggestServiceRate(s.id, wo).unitPrice,
        })),
      serviceLines: [...directLines, ...labourLines].map((l) => ({
        id: l.id,
        serviceId: l.serviceId,
        label: `${l.description} (${l.quantity} ${l.unit})`,
        quantity: l.quantity,
        unit: l.unit,
      })),
      purchaseOrders: pos
        .filter((p) => p.status !== 'Cancelled')
        .map((p) => ({
          id: p.id,
          number: p.number,
          serviceId: p.serviceId,
          vendorId: p.vendorId,
          vendorName: lookupName.vendor(p.vendorId),
        })),
      completionNotes: (wo.completionNotes ?? []).map((n) => ({
        ...n,
        serviceName: lookupName.service(n.serviceId),
        vendorName: n.vendorId ? lookupName.vendor(n.vendorId) : undefined,
        poNumber: n.purchaseOrderId ? pos.find((p) => p.id === n.purchaseOrderId)?.number : undefined,
      })),
      completionProof: completionProof(wo),
      trips: db.trips
        .filter((t) => t.workOrderId === id)
        .map((t) => ({
          id: t.id,
          number: t.number,
          date: t.date,
          status: t.status,
          vehiclePlate: db.vehicles.find((v) => v.id === t.vehicleId)?.plate ?? '—',
          driverName: db.drivers.find((d) => d.id === t.driverId)?.name ?? '—',
          total: tripCostTotals(t.expenses).total,
        })),
      fleetEnabled: db.company.modules?.ownFleet ?? false,
      canEdit: isOpen(wo),
    });
  },

  // ---------- T3: documents ----------
  saveDocument(
    id: string,
    input: {
      docId?: string;
      name: string;
      required: boolean;
      number?: string;
      receivedAt?: string;
      attachment?: Attachment;
    },
  ): Promise<WorkOrder> {
    const wo = findJob(id);
    const name = input.name.trim();
    if (!name) return fail('Enter the document name');
    const stored = wo.documents ?? [];
    const existing = stored.find((d) => (input.docId && d.id === input.docId) || d.name === name);
    if (!existing && input.docId && !input.docId.startsWith('tpl:')) return fail('Document not found');
    const doc: JobDocument = {
      id: existing?.id ?? newId('doc'),
      name,
      required: input.required,
      number: input.number?.trim() || undefined,
      receivedAt: input.receivedAt || undefined,
      attachment: input.attachment ?? existing?.attachment,
    };
    const updated = patchJob(id, (w) => ({
      ...w,
      documents: existing
        ? (w.documents ?? []).map((d) => (d.id === existing.id ? doc : d))
        : [...(w.documents ?? []), doc],
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: doc.receivedAt || doc.attachment ? `recorded document “${name}”` : `updated document “${name}”`,
    });
    return latency(updated, 150);
  },

  removeDocument(id: string, docId: string): Promise<WorkOrder> {
    const wo = findJob(id);
    const doc = wo.documents?.find((d) => d.id === docId);
    if (!doc) return fail('Document not found');
    const updated = patchJob(id, (w) => ({
      ...w,
      documents: (w.documents ?? []).filter((d) => d.id !== docId),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `removed document “${doc.name}”`,
    });
    return latency(updated, 150);
  },

  // ---------- T4: stops ----------
  saveStop(
    id: string,
    input: { stopId?: string; type: JobStop['type']; address: string; contact?: string; plannedAt: string },
  ): Promise<WorkOrder> {
    const wo = findJob(id);
    if (!isOpen(wo)) return fail('Stops cannot be changed on a closed job');
    if (!input.address.trim()) return fail('Enter the stop address');
    if (!input.plannedAt) return fail('Enter the planned time');
    if (!input.stopId && wo.status === 'Delivered' && input.type === 'Delivery')
      return fail('The job is already delivered — add the extra drop as a new job or surcharge.');
    const updated = patchJob(id, (w) => {
      const stops = w.stops ?? [];
      const next = input.stopId
        ? stops.map((s) =>
            s.id === input.stopId
              ? {
                  ...s,
                  type: input.type,
                  address: input.address.trim(),
                  contact: input.contact?.trim() || undefined,
                  plannedAt: input.plannedAt,
                }
              : s,
          )
        : [
            ...stops,
            {
              id: newId('stop'),
              seq: stops.length + 1,
              type: input.type,
              address: input.address.trim(),
              contact: input.contact?.trim() || undefined,
              plannedAt: input.plannedAt,
              status: 'Planned' as const,
            },
          ];
      return syncDelivery({ ...w, stops: resequence(next) });
    });
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: input.stopId
        ? `updated a ${input.type.toLowerCase()} stop`
        : `added a ${input.type.toLowerCase()} stop`,
    });
    return latency(updated, 150);
  },

  moveStop(id: string, stopId: string, dir: -1 | 1): Promise<WorkOrder> {
    const wo = findJob(id);
    const stops = [...(wo.stops ?? [])];
    const i = stops.findIndex((s) => s.id === stopId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stops.length) return latency(wo, 50);
    [stops[i], stops[j]] = [stops[j]!, stops[i]!];
    return latency(
      patchJob(id, (w) => ({ ...w, stops: resequence(stops) })),
      100,
    );
  },

  removeStop(id: string, stopId: string): Promise<WorkOrder> {
    const wo = findJob(id);
    const stop = wo.stops?.find((s) => s.id === stopId);
    if (!stop) return fail('Stop not found');
    if (stop.status === 'Done') return fail('A completed stop cannot be removed');
    const updated = patchJob(id, (w) =>
      syncDelivery({ ...w, stops: resequence((w.stops ?? []).filter((s) => s.id !== stopId)) }),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `removed stop ${stop.seq}`,
    });
    return latency(updated, 150);
  },

  setStopStatus(
    id: string,
    stopId: string,
    status: Exclude<JobStop['status'], 'Planned'>,
    pod?: { receivedBy: string; at: string; exceptions?: string; attachment?: Attachment },
  ): Promise<WorkOrder> {
    const wo = findJob(id);
    if (!['Confirmed', 'In progress', 'In transit', 'Delivered'].includes(wo.status))
      return fail('Stops are updated on confirmed, running jobs only');
    const stop = wo.stops?.find((s) => s.id === stopId);
    if (!stop) return fail('Stop not found');
    if (status === 'Done' && stop.type === 'Delivery' && !pod?.receivedBy.trim())
      return fail('Record who received the goods (POD) to close a delivery stop');
    if (status === 'Failed' && !pod?.exceptions?.trim()) return fail('Give the reason the stop failed');
    const updated = patchJob(id, (w) =>
      syncDelivery({
        ...w,
        stops: (w.stops ?? []).map((s) =>
          s.id === stopId
            ? {
                ...s,
                status,
                actualAt: pod?.at || s.actualAt || nowIso(),
                pod:
                  pod && (pod.receivedBy.trim() || pod.exceptions?.trim())
                    ? { ...pod, receivedBy: pod.receivedBy.trim() }
                    : s.pod,
              }
            : s,
        ),
      }),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `marked stop ${stop.seq} (${stop.address}) ${status.toLowerCase()}`,
    });
    return latency(updated, 150);
  },

  // ---------- T8: surcharges ----------
  addSurcharge(
    id: string,
    input: {
      serviceId: string;
      quantity: number;
      unitPrice: number;
      customerApproved: boolean;
      note?: string;
    },
  ): Promise<WorkOrder> {
    const wo = findJob(id);
    if (!isOpen(wo)) return fail('Surcharges cannot be added to a closed job');
    if (wo.invoiceId) return fail('The job is already invoiced');
    const svc = serviceOf(input.serviceId);
    if (!svc?.isSurcharge) return fail('Choose a surcharge');
    if (!(input.quantity > 0)) return fail('Enter a quantity above zero');
    if (!(input.unitPrice >= 0)) return fail('Enter the unit price');
    const updated = patchJob(id, (w) => ({
      ...w,
      lines: [
        ...w.lines,
        {
          id: newId('ln'),
          serviceId: svc.id,
          description: input.note?.trim() ? `${svc.name} — ${input.note.trim()}` : svc.name,
          quantity: input.quantity,
          unit: svc.unit,
          unitPrice: input.unitPrice,
          unitCost: 0,
          customerApproved: input.customerApproved,
        },
      ],
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `added surcharge “${svc.name}” (${input.customerApproved ? 'customer approved' : 'awaiting customer approval'})`,
    });
    return latency(updated, 150);
  },

  setLineApproval(id: string, lineId: string, approved: boolean): Promise<WorkOrder> {
    const wo = findJob(id);
    if (wo.invoiceId) return fail('The job is already invoiced');
    const line = wo.lines.find((l) => l.id === lineId);
    if (!line) return fail('Line not found');
    const updated = patchJob(id, (w) => ({
      ...w,
      lines: w.lines.map((l) => (l.id === lineId ? { ...l, customerApproved: approved } : l)),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `${approved ? 'recorded customer approval for' : 'removed customer approval from'} “${line.description}”`,
      changes: [
        {
          field: 'Customer approved',
          from: line.customerApproved ? 'Yes' : 'No',
          to: approved ? 'Yes' : 'No',
        },
      ],
    });
    return latency(updated, 150);
  },

  // ---------- S4: internal costs ----------
  addInternalCost(id: string, input: Omit<InternalCost, 'id' | 'tripId'>): Promise<WorkOrder> {
    const wo = findJob(id);
    if (wo.status === 'Cancelled') return fail('The job is cancelled');
    if (!input.description.trim()) return fail('Enter a description');
    if (!(input.quantity > 0)) return fail('Enter a quantity above zero');
    if (!(input.rate >= 0)) return fail('Enter the rate');
    const updated = patchJob(id, (w) => ({
      ...w,
      internalCosts: [
        ...(w.internalCosts ?? []),
        { ...input, description: input.description.trim(), id: newId('ic') },
      ],
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `added internal cost “${input.description.trim()}” (${input.kind})`,
    });
    return latency(updated, 150);
  },

  removeInternalCost(id: string, costId: string): Promise<WorkOrder> {
    const wo = findJob(id);
    const cost = wo.internalCosts?.find((c) => c.id === costId);
    if (!cost) return fail('Cost not found');
    if (cost.tripId) return fail('Trip costs come from the completed trip and cannot be removed here');
    const updated = patchJob(id, (w) => ({
      ...w,
      internalCosts: (w.internalCosts ?? []).filter((c) => c.id !== costId),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `removed internal cost “${cost.description}”`,
    });
    return latency(updated, 150);
  },

  // ---------- S3: service completion notes ----------
  recordCompletion(
    id: string,
    input: Omit<ServiceCompletionNote, 'id' | 'number' | 'status' | 'vendorId'>,
  ): Promise<ServiceCompletionNote> {
    const db = protoDb.get();
    const wo = findJob(id);
    if (wo.status === 'Cancelled' || wo.status === 'Draft')
      return fail('Record completion on a confirmed job');
    if (!serviceOf(input.serviceId)) return fail('Choose the service');
    if (!(input.quantity > 0)) return fail('Enter the quantity completed');
    if (!input.description.trim()) return fail('Describe the work done');
    const po = input.purchaseOrderId
      ? db.purchaseOrders.find((p) => p.id === input.purchaseOrderId)
      : undefined;
    const note: ServiceCompletionNote = {
      ...input,
      id: newId('scn'),
      number: nextDocNumber(
        db.workOrders.flatMap((w) => (w.completionNotes ?? []).map((n) => n.number)),
        'SCN-',
        3,
      ),
      vendorId: po?.vendorId,
      description: input.description.trim(),
      customerSignedBy: input.customerSignedBy?.trim() || undefined,
      status: input.customerSignedBy?.trim() ? 'Signed' : 'Draft',
    };
    patchJob(id, (w) => ({ ...w, completionNotes: [...(w.completionNotes ?? []), note] }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `recorded completion note ${note.number}${note.status === 'Signed' ? ` signed by ${note.customerSignedBy}` : ''}`,
    });
    return latency(note, 150);
  },

  signCompletion(id: string, noteId: string, signedBy: string, attachment?: Attachment): Promise<WorkOrder> {
    const wo = findJob(id);
    const note = wo.completionNotes?.find((n) => n.id === noteId);
    if (!note) return fail('Completion note not found');
    if (!signedBy.trim()) return fail('Enter who signed for the customer');
    const updated = patchJob(id, (w) => ({
      ...w,
      completionNotes: (w.completionNotes ?? []).map((n) =>
        n.id === noteId
          ? {
              ...n,
              customerSignedBy: signedBy.trim(),
              attachment: attachment ?? n.attachment,
              status: 'Signed' as const,
            }
          : n,
      ),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `${note.number} signed by ${signedBy.trim()}`,
    });
    return latency(updated, 150);
  },

  // ---------- T2: milestone times ----------
  setMilestoneTimes(id: string, times: Record<string, string>): Promise<WorkOrder> {
    const wo = findJob(id);
    const milestones: Milestone[] = wo.milestones.map((m) =>
      m.status === 'Done' && times[m.id] ? { ...m, at: times[m.id] } : m,
    );
    const err = milestoneOrderError(milestones);
    if (err) return fail(err);
    const changes = wo.milestones
      .map((m, i) => ({ m, n: milestones[i]! }))
      .filter(({ m, n }) => m.at !== n.at)
      .map(({ m, n }) => ({ field: m.label, from: m.at ?? '—', to: n.at ?? '—' }));
    const updated = patchJob(id, (w) => ({ ...w, milestones }));
    if (changes.length)
      logActivity({
        entity: 'Work order',
        entityId: id,
        entityRef: wo.number,
        action: `corrected ${changes.length} milestone time${changes.length === 1 ? '' : 's'}`,
        changes,
      });
    return latency(updated, 150);
  },
};

// ---------- hooks ----------
export function useJobExtras(id: string) {
  return useQuery({ queryKey: ['work-orders', 'extras', id], queryFn: () => transportApi.extras(id) });
}

function useInvalidateJob() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
    void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    void qc.invalidateQueries({ queryKey: ['fleet'] });
  };
}

export type JobAction =
  | ({ op: 'saveDocument'; id: string } & Parameters<typeof transportApi.saveDocument>[1])
  | { op: 'removeDocument'; id: string; docId: string }
  | ({ op: 'saveStop'; id: string } & Parameters<typeof transportApi.saveStop>[1])
  | { op: 'moveStop'; id: string; stopId: string; dir: -1 | 1 }
  | { op: 'removeStop'; id: string; stopId: string }
  | {
      op: 'stopStatus';
      id: string;
      stopId: string;
      status: Exclude<JobStop['status'], 'Planned'>;
      pod?: Parameters<typeof transportApi.setStopStatus>[3];
    }
  | ({ op: 'addSurcharge'; id: string } & Parameters<typeof transportApi.addSurcharge>[1])
  | { op: 'lineApproval'; id: string; lineId: string; approved: boolean }
  | ({ op: 'addInternalCost'; id: string } & Parameters<typeof transportApi.addInternalCost>[1])
  | { op: 'removeInternalCost'; id: string; costId: string }
  | { op: 'signCompletion'; id: string; noteId: string; signedBy: string; attachment?: Attachment }
  | { op: 'milestoneTimes'; id: string; times: Record<string, string> };

export function useJobAction() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: (a: JobAction): Promise<WorkOrder> => {
      switch (a.op) {
        case 'saveDocument':
          return transportApi.saveDocument(a.id, body(a));
        case 'removeDocument':
          return transportApi.removeDocument(a.id, a.docId);
        case 'saveStop':
          return transportApi.saveStop(a.id, body(a));
        case 'moveStop':
          return transportApi.moveStop(a.id, a.stopId, a.dir);
        case 'removeStop':
          return transportApi.removeStop(a.id, a.stopId);
        case 'stopStatus':
          return transportApi.setStopStatus(a.id, a.stopId, a.status, a.pod);
        case 'addSurcharge':
          return transportApi.addSurcharge(a.id, body(a));
        case 'lineApproval':
          return transportApi.setLineApproval(a.id, a.lineId, a.approved);
        case 'addInternalCost':
          return transportApi.addInternalCost(a.id, body(a));
        case 'removeInternalCost':
          return transportApi.removeInternalCost(a.id, a.costId);
        case 'signCompletion':
          return transportApi.signCompletion(a.id, a.noteId, a.signedBy, a.attachment);
        case 'milestoneTimes':
          return transportApi.setMilestoneTimes(a.id, a.times);
      }
    },
    onSuccess: invalidate,
  });
}

export function useRecordCompletion() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof transportApi.recordCompletion>[1]) =>
      transportApi.recordCompletion(id, input),
    onSuccess: invalidate,
  });
}

function body<T extends { op: string; id: string }>(a: T): Omit<T, 'op' | 'id'> {
  const { op, id, ...rest } = a;
  void op;
  void id;
  return rest;
}

/** Dubai has no daylight saving: convert between `datetime-local` values and ISO (+04:00). */
export function localToIso(v: string): string {
  return v ? `${v.length === 16 ? `${v}:00` : v}+04:00` : '';
}

export function isoToLocal(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + 4 * 3_600_000).toISOString().slice(0, 16);
}
