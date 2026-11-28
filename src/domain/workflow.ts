import type {
  InternalCost,
  JobDocument,
  JobStop,
  PriceLine,
  ServiceCategory,
  ServiceCompletionNote,
  ServiceMode,
  TransportMode,
  TripExpenseType,
} from './types';

/** Job milestone templates per service type (transport varies by mode). Prototype defaults. */
export const MILESTONE_TEMPLATES = {
  Road: [
    'Booking confirmed',
    'Vehicle assigned',
    'Loaded at origin',
    'In transit',
    'Border / customs cleared',
    'Delivered',
  ],
  Sea: [
    'Booking confirmed',
    'Container loaded',
    'Vessel departed',
    'Arrived at port',
    'Customs cleared',
    'Delivered to warehouse',
  ],
  Air: [
    'Booking confirmed',
    'Cargo received at origin',
    'Flight departed',
    'Arrived at DXB',
    'Customs cleared',
    'Delivered',
  ],
  Warehouse: [
    'Order confirmed',
    'PL sent to warehouse',
    'GRN received',
    'Goods stored',
    'Out request received',
    'Dispatched',
    'POD received',
  ],
  Service: ['Order confirmed', 'Documents received', 'Service in progress', 'Service completed'],
} as const;

export function milestoneLabels(category: ServiceCategory, mode?: TransportMode): readonly string[] {
  if (category === 'Transport') return MILESTONE_TEMPLATES[mode ?? 'Road'];
  return MILESTONE_TEMPLATES[category];
}

export const SERVICE_CATEGORIES: ServiceCategory[] = ['Transport', 'Warehouse', 'Service'];

export const serviceCategoryLabel: Record<ServiceCategory, string> = {
  Transport: 'Transport',
  Warehouse: 'Warehouse',
  Service: 'Direct service',
};

/** Human label for what a job/order is, e.g. "Road transport", "Warehouse", "Direct service". */
export function jobKindLabel(category: ServiceCategory, mode?: TransportMode): string {
  return category === 'Transport' ? `${mode ?? 'Road'} transport` : serviceCategoryLabel[category];
}

/** Service master mode → service type: Road/Sea/Air are transport, Warehouse is warehouse, anything else is a direct service. */
export function categoryOfServiceMode(mode: string): ServiceCategory {
  if (mode === 'Road' || mode === 'Sea' || mode === 'Air') return 'Transport';
  if (mode === 'Warehouse') return 'Warehouse';
  return 'Service';
}

/**
 * Every service type a multi-service order/job contains, in a stable order.
 * `serviceModeOf` maps a serviceId to the service master's mode.
 */
export function categoriesFromLines(
  lines: { serviceId: string }[],
  serviceModeOf: (serviceId: string) => string | undefined,
  extra: ServiceCategory[] = [],
): ServiceCategory[] {
  const set = new Set<ServiceCategory>(extra);
  for (const l of lines) {
    const m = serviceModeOf(l.serviceId);
    if (m) set.add(categoryOfServiceMode(m));
  }
  return SERVICE_CATEGORIES.filter((c) => set.has(c));
}

/** Primary type for icons/labels: transport if included, else warehouse, else direct service. */
export function primaryCategory(categories: ServiceCategory[]): ServiceCategory {
  return SERVICE_CATEGORIES.find((c) => categories.includes(c)) ?? 'Service';
}

/** e.g. "Sea transport + Warehouse + Direct service". */
export function servicesLabel(categories: ServiceCategory[], mode?: TransportMode): string {
  return categories.map((c) => jobKindLabel(c, mode)).join(' + ');
}

// ===================== FLOW-003 WP-C: transport, direct services, own fleet =====================

const round2 = (n: number) => Math.round(n * 100) / 100;

/** T3: standard document sets (prototype defaults — operations to confirm). */
export const DOCUMENT_SETS = {
  Sea: ['Bill of lading', 'Delivery order', 'BOE', 'Commercial invoice', 'Packing list'],
  Air: ['Airway bill', 'BOE', 'Commercial invoice'],
  Road: ['CMR / waybill', 'Delivery note'],
  Customs: ['BOE', 'Commercial invoice', 'Certificate of origin'],
  Warehouse: ['Packing list / ASN', 'GRN'],
} as const;

/**
 * T3: required documents for a job, without duplicates, in a stable order.
 * Transport uses its mode (Road by default); warehouse adds PL/ASN + GRN; customs documents are
 * added when the job has a customs service line (`serviceModes` includes 'Customs').
 */
export function requiredDocuments(
  categories: readonly ServiceCategory[],
  mode?: TransportMode,
  serviceModes: readonly (ServiceMode | string)[] = [],
): string[] {
  const names: string[] = [];
  const add = (list: readonly string[]) => {
    for (const n of list) if (!names.includes(n)) names.push(n);
  };
  if (categories.includes('Transport')) add(DOCUMENT_SETS[mode ?? 'Road']);
  if (serviceModes.includes('Customs')) add(DOCUMENT_SETS.Customs);
  if (categories.includes('Warehouse')) add(DOCUMENT_SETS.Warehouse);
  return names;
}

/** A checklist item counts as received once it has a received date, a number or a file. */
export function isDocumentReceived(d: Pick<JobDocument, 'receivedAt' | 'number' | 'attachment'>): boolean {
  return !!(d.receivedAt || d.attachment || d.number?.trim());
}

/**
 * T3: the job's checklist — stored documents plus any required template document not stored yet
 * (template items get id `tpl:<name>`). Stored items keep their own required / optional flag.
 */
export function documentChecklist(
  stored: readonly JobDocument[] | undefined,
  required: readonly string[],
): JobDocument[] {
  const list = [...(stored ?? [])];
  for (const name of required) {
    if (!list.some((d) => d.name === name)) list.push({ id: `tpl:${name}`, name, required: true });
  }
  return list;
}

/** T3: names of required documents not received yet. */
export function missingDocuments(checklist: readonly JobDocument[]): string[] {
  return checklist.filter((d) => d.required && !isDocumentReceived(d)).map((d) => d.name);
}

/** T4: a job with delivery stops is delivered only when every delivery stop is Done. */
export function deliveryStopsDone(stops: readonly JobStop[] | undefined): boolean {
  return (stops ?? []).filter((s) => s.type === 'Delivery').every((s) => s.status === 'Done');
}

/** T4: renumber stops 1..n in the given order. */
export function resequence(stops: readonly JobStop[]): JobStop[] {
  return stops.map((s, i) => ({ ...s, seq: i + 1 }));
}

/** T8: a surcharge line can be invoiced only after the customer approved it. */
export function isBillableLine(line: Pick<PriceLine, 'customerApproved'>, isSurcharge: boolean): boolean {
  return !isSurcharge || line.customerApproved === true;
}

export function internalCostTotal(
  costs: readonly Pick<InternalCost, 'quantity' | 'rate'>[] | undefined,
): number {
  return round2((costs ?? []).reduce((s, c) => s + c.quantity * c.rate, 0));
}

export interface JobProfit {
  revenue: number;
  vendorCost: number;
  internalCost: number;
  grossProfit: number;
  /** Gross profit ÷ revenue, one decimal (0 when there is no revenue). */
  marginPct: number;
  /** Surcharge amount left out of revenue until the customer approves it. */
  pendingSurcharges: number;
}

/**
 * S4: gross profit = revenue (billable job lines) − vendor PO costs − internal costs.
 * `isSurcharge(serviceId)` marks surcharge lines (left out until approved);
 * `isDisbursement(serviceId)` marks costs rebilled at cost (not revenue).
 */
export function jobProfit(input: {
  lines: readonly PriceLine[];
  poCosts: readonly number[];
  internalCosts?: readonly Pick<InternalCost, 'quantity' | 'rate'>[];
  isSurcharge?: (serviceId: string) => boolean;
  isDisbursement?: (serviceId: string) => boolean;
}): JobProfit {
  let revenue = 0;
  let pending = 0;
  for (const l of input.lines) {
    if (input.isDisbursement?.(l.serviceId)) continue;
    const amount = l.quantity * l.unitPrice;
    if (isBillableLine(l, input.isSurcharge?.(l.serviceId) ?? false)) revenue += amount;
    else pending += amount;
  }
  revenue = round2(revenue);
  const vendorCost = round2(input.poCosts.reduce((s, c) => s + c, 0));
  const internalCost = internalCostTotal(input.internalCosts);
  const grossProfit = round2(revenue - vendorCost - internalCost);
  return {
    revenue,
    vendorCost,
    internalCost,
    grossProfit,
    marginPct: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    pendingSurcharges: round2(pending),
  };
}

/** T7: trip expense totals by type and overall. */
export function tripCostTotals(expenses: readonly { type: TripExpenseType; amount: number }[]): {
  total: number;
  byType: Partial<Record<TripExpenseType, number>>;
} {
  const byType: Partial<Record<TripExpenseType, number>> = {};
  for (const e of expenses) byType[e.type] = round2((byType[e.type] ?? 0) + e.amount);
  return { total: round2(expenses.reduce((s, e) => s + e.amount, 0)), byType };
}

export type ExpiryLevel = 'Expired' | 'Expiring' | 'OK';

/** T6: Expired when the date has passed, Expiring within `withinDays` (default 30), else OK. */
export function expiryLevel(
  date: string,
  today: string,
  withinDays = 30,
): { level: ExpiryLevel; days: number } {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  return { level: days < 0 ? 'Expired' : days <= withinDays ? 'Expiring' : 'OK', days };
}

export interface ExpiryAlert {
  document: 'Registration' | 'Insurance' | 'Licence';
  date: string;
  level: Exclude<ExpiryLevel, 'OK'>;
  days: number;
}

/** T6: alerts for a vehicle (registration, insurance) or a driver (licence) — Expired / Expiring only. */
export function expiryAlerts(
  dates: { registrationExpiry?: string; insuranceExpiry?: string; licenceExpiry?: string },
  today: string,
  withinDays = 30,
): ExpiryAlert[] {
  const out: ExpiryAlert[] = [];
  const check = (document: ExpiryAlert['document'], date?: string) => {
    if (!date) return;
    const r = expiryLevel(date, today, withinDays);
    if (r.level !== 'OK') out.push({ document, date, level: r.level, days: r.days });
  };
  check('Registration', dates.registrationExpiry);
  check('Insurance', dates.insuranceExpiry);
  check('Licence', dates.licenceExpiry);
  return out;
}

const dayText = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** e.g. "Insurance expired 3 days ago" / "Licence expires in 12 days". */
export function expiryAlertText(a: ExpiryAlert): string {
  if (a.level === 'Expired') return `${a.document} expired ${dayText(-a.days)} ago`;
  if (a.days === 0) return `${a.document} expires today`;
  return `${a.document} expires in ${dayText(a.days)}`;
}

/**
 * T2: milestone timestamps must follow the milestone order. Returns an error message naming the
 * first pair out of order, or undefined when the order is fine. Milestones without a time are skipped.
 */
export function milestoneOrderError(
  milestones: readonly { label: string; at?: string }[],
): string | undefined {
  let prev: { label: string; t: number } | undefined;
  for (const m of milestones) {
    if (!m.at) continue;
    const t = Date.parse(m.at);
    if (Number.isNaN(t)) return `${m.label}: enter a valid date and time`;
    if (prev && t < prev.t) return `“${m.label}” cannot be earlier than “${prev.label}”`;
    prev = { label: m.label, t };
  }
  return undefined;
}

export interface ProofItem {
  kind: 'Completion note';
  label: string;
  ok: boolean;
}

/**
 * S3: completion proof for services without GRN/POD, for the PO 3-way match.
 * Pass a purchase order id to get only the notes recorded against that PO.
 */
export function completionProof(
  job: { completionNotes?: readonly ServiceCompletionNote[] },
  purchaseOrderId?: string,
): ProofItem[] {
  return (job.completionNotes ?? [])
    .filter((n) => !purchaseOrderId || n.purchaseOrderId === purchaseOrderId)
    .map((n) => ({
      kind: 'Completion note' as const,
      label: `${n.number} · ${n.quantity} ${n.unit}${n.customerSignedBy ? ` · signed by ${n.customerSignedBy}` : ' · not signed yet'}`,
      ok: n.status === 'Signed',
    }));
}
