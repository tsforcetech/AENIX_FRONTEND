/**
 * PROTOTYPE SAMPLE DATA — fictional companies, people and amounts.
 * Never use as production seed, demo data on a live system, or test fixtures for finance sign-off.
 */
import type {
  ActivityEvent,
  AppNotification,
  Collection,
  Contract,
  Customer,
  Enquiry,
  Invoice,
  JournalEntry,
  PriceLine,
  Quotation,
  Service,
  StockItem,
  StockMovement,
  StorageBillingRun,
  TransportMode,
  Vendor,
  VendorBill,
  VendorRate,
  WorkOrder,
  WorkOrderStatus,
  LedgerAccount,
  PurchaseOrder,
  VendorPayment,
  Milestone,
  SalesOrder,
  CompanyProfile,
  ServiceCategory,
} from '@/domain/types';
import { categoriesFromLines, milestoneLabels, primaryCategory } from '@/domain/workflow';
import { invoiceTotals } from '@/domain/calc';

/** Fixed "today" so the prototype looks the same for every reviewer. */
export const PROTO_TODAY: string = '2026-11-23';

export const customers: Customer[] = [
  c(
    1,
    'Sandstone Building Supplies',
    'Construction',
    'Dammam',
    'Saudi Arabia',
    'Faisal Al-Harbi',
    250000,
    45,
  ),
  c(2, 'Coral Bay Trading LLC', 'General trading', 'Dubai', 'UAE', 'Priya Menon', 400000, 30),
  c(3, 'Horizon Retail Group', 'Retail', 'Dubai', 'UAE', 'Daniel Brooks', 600000, 60),
  c(4, 'Crescent Medical Supplies', 'Healthcare', 'Abu Dhabi', 'UAE', 'Dr. Leila Haddad', 300000, 30),
  c(5, 'Palm Valley Foods', 'Food & beverage', 'Sharjah', 'UAE', 'Omar Siddiqui', 200000, 30),
  c(6, 'Gulfline Industrial Supplies', 'Industrial', 'Abu Dhabi', 'UAE', 'Ravi Kumar', 350000, 45),
  c(7, 'Skyline Electronics FZE', 'Electronics', 'Jebel Ali Free Zone', 'UAE', 'Mei Lin', 500000, 30),
  c(8, 'Amber Dune Cosmetics', 'Consumer goods', 'Dubai', 'UAE', 'Sara Al-Mansouri', 150000, 30, 'On hold'),
];

function c(
  n: number,
  name: string,
  industry: string,
  city: string,
  country: string,
  contactName: string,
  creditLimit: number,
  paymentTermsDays: number,
  status: Customer['status'] = 'Active',
): Customer {
  const slug = name.toLowerCase().split(' ')[0];
  return {
    id: `cus-${n}`,
    code: `CUS-${String(n).padStart(4, '0')}`,
    name,
    industry,
    city,
    country,
    trnMasked: `1000•••••••${String(100 + n * 7).slice(-3)}`,
    postalAddress: `P.O. Box ${30000 + n * 1117}, ${city}, ${country}`,
    contactName,
    contactEmail: `${contactName.split(' ').slice(-1)[0]!.toLowerCase()}@${slug}.example`,
    contactPhone: `+971 5• ••• ${String(1000 + n * 37).slice(-4)}`,
    creditLimit,
    paymentTermsDays,
    status,
    createdAt: `2026-0${(n % 9) + 1}-1${n % 9}`,
    ledgerAccountId: `la-cus-${n}`,
  };
}

export const vendors: Vendor[] = [
  v(1, 'Swift Haul Transport LLC', 'Transporter', 'Dubai', 'UAE', 'Imran Shaikh', 5),
  v(2, 'Dune Line Trucking', 'Transporter', 'Sharjah', 'UAE', 'Ahmed Rashid', 4),
  v(3, 'BlueWave Shipping Lines', 'Shipping line', 'Jebel Ali', 'UAE', 'Grace Tan', 4),
  v(4, 'Pearl Ocean Container Line', 'Shipping line', 'Singapore', 'Singapore', 'Kenji Watanabe', 3),
  v(5, 'AeroCargo Express', 'Airline', 'Dubai', 'UAE', 'Lucas Martin', 4),
  v(6, 'ClearPath Customs Brokers', 'Customs broker', 'Dubai', 'UAE', 'Nadia Farouk', 5),
  v(7, 'Harbor Gate Warehousing', 'Warehouse', 'Jebel Ali Free Zone', 'UAE', 'Thomas Reid', 4),
  v(8, 'Oryx Desert Freight', 'Transporter', 'Riyadh', 'Saudi Arabia', 'Khalid Al-Otaibi', 3),
];

function v(
  n: number,
  name: string,
  category: Vendor['category'],
  city: string,
  country: string,
  contactName: string,
  rating: Vendor['rating'],
): Vendor {
  return {
    id: `ven-${n}`,
    code: `VEN-${String(n).padStart(4, '0')}`,
    name,
    category,
    city,
    country,
    contactName,
    contactEmail: `ops@${name.toLowerCase().split(' ')[0]}.example`,
    rating,
    paymentTermsDays: 30,
    status: 'Active',
    ledgerAccountId: `la-ven-${n}`,
  };
}

export const services: Service[] = [
  s(1, 'Road freight — FTL', 'Road', 'Truck', 'Full truck load, door to door'),
  s(2, 'Road freight — LTL', 'Road', 'Pallet', 'Shared load per pallet'),
  s(3, 'Sea freight — 20ft FCL', 'Sea', 'Container', 'Full container load, port to port'),
  s(4, 'Sea freight — 40ft FCL', 'Sea', 'Container', 'Full container load, port to port'),
  s(5, 'Air freight', 'Air', 'Kg', 'Chargeable weight, airport to airport'),
  s(6, 'Customs clearance', 'Customs', 'Declaration', 'Import/export declaration and duty handling'),
  s(7, 'Warehouse storage', 'Warehouse', 'Pallet-day', 'Ambient racked storage'),
  s(8, 'Handling in / out', 'Warehouse', 'Pallet', 'Receiving, put-away and dispatch handling'),
  s(9, 'Last-mile delivery', 'Road', 'Drop', 'Urban delivery within emirate'),
  s(10, 'Cargo insurance', 'Customs', 'Shipment', 'All-risk cover on declared value'),
  s(11, 'Dry storage', 'Warehouse', 'Sq.ft', 'Dry storage charged by floor area per period'),
  s(12, '3 Ton forklift / handling', 'Warehouse', 'Hour', 'Forklift and labour charged by the hour'),
];

function s(n: number, name: string, mode: Service['mode'], unit: string, description: string): Service {
  return { id: `svc-${n}`, code: `SVC-${String(n).padStart(3, '0')}`, name, mode, unit, description };
}

export const vendorRates: VendorRate[] = [
  r(1, 'ven-1', 'svc-1', 'Jebel Ali', 'Al Quoz', 'Truck', 650),
  r(2, 'ven-1', 'svc-1', 'Dubai', 'Abu Dhabi', 'Truck', 900),
  r(3, 'ven-2', 'svc-2', 'Sharjah', 'Dubai', 'Pallet', 45),
  r(4, 'ven-8', 'svc-1', 'Dubai', 'Riyadh', 'Truck', 5200),
  r(5, 'ven-8', 'svc-1', 'Dammam', 'Dubai', 'Truck', 3900),
  r(6, 'ven-3', 'svc-4', 'Shanghai', 'Jebel Ali', 'Container', 7400),
  r(7, 'ven-4', 'svc-3', 'Mumbai', 'Jebel Ali', 'Container', 2100),
  r(8, 'ven-5', 'svc-5', 'Frankfurt', 'DXB', 'Kg', 11.5),
  r(9, 'ven-6', 'svc-6', 'UAE', 'UAE', 'Declaration', 350),
  r(10, 'ven-7', 'svc-7', 'JAFZA', 'JAFZA', 'Pallet-day', 2.2),
  r(11, 'ven-7', 'svc-8', 'JAFZA', 'JAFZA', 'Pallet', 12),
  r(12, 'ven-2', 'svc-9', 'Dubai', 'Dubai', 'Drop', 85),
  r(13, 'ven-7', 'svc-11', 'JAFZA', 'JAFZA', 'Sq.ft', 4.2),
  r(14, 'ven-7', 'svc-12', 'JAFZA', 'JAFZA', 'Hour', 75),
];

function r(
  n: number,
  vendorId: string,
  serviceId: string,
  origin: string,
  destination: string,
  unit: string,
  rate: number,
): VendorRate {
  return {
    id: `rate-${n}`,
    vendorId,
    serviceId,
    origin,
    destination,
    unit,
    rate,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
  };
}

// ---------- Commercial ----------
let lineSeq = 0;
function line(
  serviceId: string,
  description: string,
  quantity: number,
  unit: string,
  unitPrice: number,
  unitCost: number,
): PriceLine {
  lineSeq += 1;
  return { id: `ln-${lineSeq}`, serviceId, description, quantity, unit, unitPrice, unitCost };
}

interface Lane {
  mode: TransportMode;
  origin: string;
  destination: string;
  equipment: string;
  lines: () => PriceLine[];
}

const lanes: Record<string, Lane> = {
  jaToQuoz: {
    mode: 'Road',
    origin: 'Jebel Ali',
    destination: 'Al Quoz',
    equipment: '40ft trailer',
    lines: () => [
      line('svc-1', 'FTL Jebel Ali → Al Quoz', 2, 'Truck', 950, 650),
      line('svc-6', 'Import customs clearance', 1, 'Declaration', 550, 350),
    ],
  },
  dxbToRiyadh: {
    mode: 'Road',
    origin: 'Dubai',
    destination: 'Riyadh',
    equipment: '40ft trailer',
    lines: () => [
      line('svc-1', 'FTL Dubai → Riyadh', 3, 'Truck', 6300, 5200),
      line('svc-6', 'Export + KSA border clearance', 1, 'Declaration', 1200, 800),
    ],
  },
  dammamToDxb: {
    mode: 'Road',
    origin: 'Dammam',
    destination: 'Dubai',
    equipment: 'Flatbed',
    lines: () => [
      line('svc-1', 'FTL Dammam → Dubai', 4, 'Truck', 4800, 3900),
      line('svc-6', 'Import customs clearance', 1, 'Declaration', 600, 350),
    ],
  },
  shaToJa: {
    mode: 'Sea',
    origin: 'Shanghai',
    destination: 'Jebel Ali',
    equipment: '40ft FCL',
    lines: () => [
      line('svc-4', 'Ocean freight Shanghai → Jebel Ali', 2, 'Container', 9200, 7400),
      line('svc-6', 'Import customs clearance', 2, 'Declaration', 550, 350),
      line('svc-1', 'Port to warehouse haulage', 2, 'Truck', 900, 650),
    ],
  },
  bomToJa: {
    mode: 'Sea',
    origin: 'Mumbai',
    destination: 'Jebel Ali',
    equipment: '20ft FCL',
    lines: () => [
      line('svc-3', 'Ocean freight Mumbai → Jebel Ali', 3, 'Container', 2900, 2100),
      line('svc-6', 'Import customs clearance', 1, 'Declaration', 550, 350),
    ],
  },
  fraToDxb: {
    mode: 'Air',
    origin: 'Frankfurt',
    destination: 'DXB',
    equipment: 'ULD',
    lines: () => [
      line('svc-5', 'Air freight FRA → DXB', 1200, 'Kg', 14.5, 11.5),
      line('svc-6', 'Import customs clearance', 1, 'Declaration', 650, 350),
      line('svc-10', 'Cargo insurance', 1, 'Shipment', 400, 250),
    ],
  },
  shjToDoha: {
    mode: 'Road',
    origin: 'Sharjah',
    destination: 'Doha',
    equipment: '3-ton truck',
    lines: () => [
      line('svc-1', 'FTL Sharjah → Doha', 1, 'Truck', 4200, 3300),
      line('svc-6', 'Export clearance', 1, 'Declaration', 600, 350),
    ],
  },
  dxbLastMile: {
    mode: 'Road',
    origin: 'JAFZA',
    destination: 'Dubai (multi-drop)',
    equipment: '1-ton van',
    lines: () => [
      line('svc-9', 'Last-mile multi-drop', 24, 'Drop', 120, 85),
      line('svc-8', 'Handling out', 18, 'Pallet', 18, 12),
    ],
  },
};

const cargo = (
  description: string,
  packages: number,
  weightKg: number,
  volumeCbm: number,
  equipment: string,
) => ({
  description,
  packages,
  weightKg,
  volumeCbm,
  equipment,
});

const owners = ['Aisha Khan', 'Rahul Nair', 'Mohammed Saleh', 'Elena Petrova'];

interface FlowSpec {
  n: number;
  customer: number;
  lane: keyof typeof lanes;
  cargo: ReturnType<typeof cargo>;
  enquiryStatus: Enquiry['status'];
  quote?: { status: Quotation['status']; agreement?: Quotation['agreement'] };
  wo?: { status: WorkOrderStatus; priority?: WorkOrder['priority']; warehouse?: boolean };
  inv?: { status: 'Draft' | 'Posted' | 'Partially paid' | 'Paid' | 'Overdue'; paidRatio?: number };
  day: number; // day offset in November 2026 for creation
}

const flows: FlowSpec[] = [
  {
    n: 1084,
    customer: 1,
    lane: 'dammamToDxb',
    cargo: cargo('Ceramic tiles on pallets', 48, 21000, 38, 'Flatbed'),
    enquiryStatus: 'Quoting',
    quote: { status: 'Draft' },
    day: 21,
  },
  {
    n: 1083,
    customer: 2,
    lane: 'dxbToRiyadh',
    cargo: cargo('Packaged household goods', 66, 18500, 72, '40ft trailer'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted', agreement: 'Long-term' },
    wo: { status: 'In transit' },
    inv: { status: 'Partially paid', paidRatio: 0.5 },
    day: 3,
  },
  {
    n: 1082,
    customer: 3,
    lane: 'shaToJa',
    cargo: cargo('Apparel cartons', 1240, 16800, 128, '40ft FCL'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted' },
    wo: { status: 'In progress', warehouse: true },
    inv: { status: 'Partially paid', paidRatio: 0.5 },
    day: 2,
  },
  {
    n: 1081,
    customer: 4,
    lane: 'fraToDxb',
    cargo: cargo('Temperature-controlled medical devices', 32, 1200, 7.5, 'ULD'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted' },
    wo: { status: 'Delivered', priority: 'Urgent' },
    inv: { status: 'Partially paid', paidRatio: 0.5 },
    day: 4,
  },
  {
    n: 1080,
    customer: 5,
    lane: 'shjToDoha',
    cargo: cargo('Packaged snacks', 22, 6400, 24, '3-ton truck'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted' },
    wo: { status: 'In transit' },
    inv: { status: 'Posted' },
    day: 6,
  },
  {
    n: 1079,
    customer: 6,
    lane: 'bomToJa',
    cargo: cargo('Steel fittings', 90, 41000, 60, '20ft FCL'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted' },
    wo: { status: 'Completed', warehouse: true },
    inv: { status: 'Paid' },
    day: 1,
  },
  {
    n: 1078,
    customer: 7,
    lane: 'jaToQuoz',
    cargo: cargo('Consumer electronics', 340, 9800, 55, '40ft trailer'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted' },
    wo: { status: 'Completed' },
    inv: { status: 'Overdue' },
    day: 1,
  },
  {
    n: 1077,
    customer: 3,
    lane: 'dxbLastMile',
    cargo: cargo('Retail store replenishment', 18, 4200, 22, '1-ton van'),
    enquiryStatus: 'Won',
    quote: { status: 'Accepted', agreement: 'Long-term' },
    wo: { status: 'Confirmed', warehouse: true },
    day: 18,
  },
  {
    n: 1076,
    customer: 2,
    lane: 'jaToQuoz',
    cargo: cargo('Kitchen appliances', 120, 8800, 46, '40ft trailer'),
    enquiryStatus: 'Quoted',
    quote: { status: 'Sent' },
    day: 17,
  },
  {
    n: 1075,
    customer: 4,
    lane: 'fraToDxb',
    cargo: cargo('Diagnostic reagents', 14, 600, 3.1, 'ULD'),
    enquiryStatus: 'Quoted',
    quote: { status: 'Pending approval' },
    day: 19,
  },
  {
    n: 1074,
    customer: 8,
    lane: 'bomToJa',
    cargo: cargo('Cosmetics raw materials', 40, 12500, 26, '20ft FCL'),
    enquiryStatus: 'Lost',
    quote: { status: 'Rejected' },
    day: 8,
  },
  {
    n: 1073,
    customer: 6,
    lane: 'dxbToRiyadh',
    cargo: cargo('Industrial valves', 30, 14200, 40, '40ft trailer'),
    enquiryStatus: 'New',
    day: 22,
  },
  {
    n: 1072,
    customer: 7,
    lane: 'shaToJa',
    cargo: cargo('Laptops and accessories', 820, 11300, 110, '40ft FCL'),
    enquiryStatus: 'New',
    day: 23,
  },
  {
    n: 1071,
    customer: 5,
    lane: 'dammamToDxb',
    cargo: cargo('Bottled water', 60, 24000, 50, 'Flatbed'),
    enquiryStatus: 'Quoted',
    quote: { status: 'Expired' },
    day: 5,
  },
];

const dt = (day: number, hh = 9) =>
  `2026-11-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:15:00+04:00`;
const d = (day: number, month = 11) =>
  `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

export const enquiries: Enquiry[] = [];
export const quotations: Quotation[] = [];
export const workOrders: WorkOrder[] = [];
export const salesOrders: SalesOrder[] = [];
let soSeq = 5100;
export const invoices: Invoice[] = [];

const progressByStatus: Record<WorkOrderStatus, number> = {
  Draft: 0,
  Confirmed: 1,
  'In progress': 3,
  'In transit': 4,
  Delivered: 6,
  Completed: 6,
  Cancelled: 0,
};

function milestones(
  mode: TransportMode | undefined,
  status: WorkOrderStatus,
  day: number,
  category: ServiceCategory = 'Transport',
  doneOverride?: number,
): Milestone[] {
  const labels = milestoneLabels(category, mode);
  const done = doneOverride ?? Math.round((progressByStatus[status] / 6) * labels.length);
  return labels.map((label, i) => ({
    id: `ms-${category}-${mode ?? 'x'}-${i}`,
    label,
    status: i < done ? 'Done' : i === done ? 'Current' : 'Pending',
    at: i < done ? dt(Math.min(day + i, 23), 8 + (i % 9)) : undefined,
  }));
}

const vendorForService: Record<string, string> = {
  'svc-1': 'ven-1',
  'svc-3': 'ven-4',
  'svc-4': 'ven-3',
  'svc-5': 'ven-5',
  'svc-6': 'ven-6',
  'svc-8': 'ven-7',
  'svc-9': 'ven-2',
  'svc-10': 'ven-6',
};

let invSeq = 3030;
let woSeq = 2050;

for (const f of flows) {
  const lane = lanes[f.lane]!;
  const enquiryId = `enq-${f.n}`;
  const owner = owners[f.n % owners.length]!;
  enquiries.push({
    id: enquiryId,
    number: `ENQ-${f.n}`,
    customerId: `cus-${f.customer}`,
    serviceCategory: 'Transport',
    serviceCategories: ['Transport'],
    mode: lane.mode,
    serviceIds: [...new Set(lane.lines().map((l) => l.serviceId))],
    origin: lane.origin,
    destination: lane.destination,
    cargo: f.cargo,
    requiredBy: d(Math.min(f.day + 10, 30)),
    status: f.enquiryStatus,
    owner,
    notes: '',
    createdAt: dt(f.day),
  });
  if (!f.quote) continue;
  const qLines = lane.lines();
  const quotationId = `qt-${f.n}`;
  quotations.push({
    id: quotationId,
    number: `QT-${f.n}`,
    version: f.quote.status === 'Accepted' && f.n % 2 === 0 ? 2 : 1,
    enquiryId,
    customerId: `cus-${f.customer}`,
    serviceCategory: 'Transport',
    serviceCategories: ['Transport'],
    mode: lane.mode,
    origin: lane.origin,
    destination: lane.destination,
    agreement: f.quote.agreement ?? 'One-time',
    status: f.quote.status,
    validUntil: f.quote.status === 'Expired' ? d(20) : d(30, 12),
    lines: qLines,
    terms: 'Rates exclude duties and taxes unless stated. VAT 5% applies. Validity as shown.',
    createdAt: dt(f.day, 11),
    owner,
  });
  if (!f.wo) continue;
  woSeq -= 1;
  const woId = `wo-${woSeq}`;
  const woLines = qLines.map((l) => ({ ...l, id: `${l.id}-wo` }));
  soSeq += 1;
  const soId = `so-${soSeq}`;
  salesOrders.push({
    id: soId,
    number: `SO-${soSeq}`,
    customerId: `cus-${f.customer}`,
    serviceCategory: 'Transport',
    serviceCategories: ['Transport'],
    mode: lane.mode,
    enquiryId,
    quotationId,
    customerPoRef: `PO-${f.customer}${String(f.n).slice(-3)}`,
    orderDate: d(f.day + 1),
    origin: lane.origin,
    destination: lane.destination,
    lines: qLines.map((l) => ({ ...l, id: `${l.id}-so` })),
    status:
      f.wo.status === 'Completed' ? 'Completed' : f.wo.status === 'Confirmed' ? 'Confirmed' : 'In progress',
    owner,
    notes: '',
  });
  const wo: WorkOrder = {
    id: woId,
    number: `JOB-${woSeq}`,
    customerId: `cus-${f.customer}`,
    serviceCategory: 'Transport',
    serviceCategories: ['Transport'],
    salesOrderId: soId,
    source: { type: 'Sales order', refId: soId },
    mode: lane.mode,
    origin: lane.origin,
    destination: lane.destination,
    cargo: f.cargo,
    status: f.wo.status,
    priority: f.wo.priority ?? 'Normal',
    milestones: milestones(lane.mode, f.wo.status, f.day + 1),
    vendorAssignments: woLines.map((l, i) => ({
      id: `va-${woSeq}-${i}`,
      vendorId: vendorForService[l.serviceId] ?? 'ven-1',
      serviceId: l.serviceId,
      agreedCost: Math.round(l.quantity * l.unitCost),
      status: f.wo!.status === 'Completed' || f.wo!.status === 'Delivered' ? 'Completed' : 'Accepted',
    })),
    lines: woLines,
    hasWarehouse: !!f.wo.warehouse,
    inbounds: [],
    customerRequests: [],
    createdAt: dt(f.day + 1),
    eta: ['Completed', 'Delivered'].includes(f.wo.status)
      ? d(Math.min(f.day + 9, 22))
      : d(Math.min(Math.max(f.day + 9, 24), 30)),
    owner,
  };
  if (f.inv) {
    invSeq -= 1;
    const invId = `inv-${invSeq}`;
    wo.invoiceId = invId;
    const inv: Invoice = {
      id: invId,
      number: `AEN0${String(invSeq).slice(-2)}`,
      customerId: wo.customerId,
      workOrderId: woId,
      salesOrderIds: [soId],
      issueDate: d(Math.min(f.day + 2, 23)),
      dueDate: f.inv.status === 'Overdue' ? d(15) : addDays(d(Math.min(f.day + 2, 23)), 30),
      lines: woLines.map((l) => ({
        id: `${l.id}-inv`,
        salesOrderId: soId,
        uom: l.unit,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: 0.05,
      })),
      paid: 0,
      status: f.inv.status,
    };
    const { total } = invoiceTotals(inv);
    inv.paid = f.inv.status === 'Paid' ? total : Math.round(total * (f.inv.paidRatio ?? 0) * 100) / 100;
    invoices.push(inv);
  }
  workOrders.push(wo);
}

// A direct work order (no enquiry / quotation / contract) — authorized direct-job path.
workOrders.push({
  id: 'wo-2051',
  number: 'JOB-2051',
  customerId: 'cus-7',
  source: { type: 'Direct' },
  mode: 'Road',
  origin: 'JAFZA',
  destination: 'Dubai Silicon Oasis',
  cargo: cargo('Server racks', 6, 2400, 12, '3-ton truck'),
  status: 'Draft',
  priority: 'High',
  serviceCategory: 'Transport',
  serviceCategories: ['Transport'],
  milestones: milestones('Road', 'Draft', 23),
  vendorAssignments: [],
  lines: [line('svc-1', 'FTL JAFZA → Dubai Silicon Oasis', 1, 'Truck', 1100, 700)],
  hasWarehouse: true,
  inbounds: [],
  customerRequests: [],
  createdAt: dt(23, 10),
  eta: d(26),
  owner: 'Aisha Khan',
});

// ---------- Warehouse & direct-service flows (owner flow update 2026-11-23) ----------
const att = (fileName: string, day: number, hh: number, by: string, sizeKb = 220) => ({
  fileName,
  sizeKb,
  uploadedAt: dt(day, hh),
  uploadedBy: by,
});

enquiries.push(
  {
    id: 'enq-1085',
    number: 'ENQ-1085',
    customerId: 'cus-5',
    serviceCategory: 'Warehouse',
    serviceCategories: ['Warehouse'],
    serviceIds: ['svc-7', 'svc-8'],
    origin: 'JAFZA WH-1',
    destination: '',
    cargo: cargo('Ambient packaged food — seasonal stock', 40, 16000, 60, 'Pallets'),
    requiredBy: d(1, 12),
    status: 'New',
    owner: 'Rahul Nair',
    notes: 'Storage for ~3 months, weekly releases to retail DCs.',
    createdAt: dt(23, 11),
  },
  {
    id: 'enq-1086',
    number: 'ENQ-1086',
    customerId: 'cus-6',
    serviceCategory: 'Service',
    serviceCategories: ['Service'],
    serviceIds: ['svc-6'],
    origin: 'Jebel Ali Port',
    destination: '',
    cargo: cargo('Import declaration — industrial valves', 1, 0, 0, '—'),
    requiredBy: d(26),
    status: 'Quoting',
    owner: 'Elena Petrova',
    notes: 'Customs clearance only; customer arranges own trucking.',
    createdAt: dt(22, 15),
  },
);

// Warehouse job 1 — inbound PL vs GRN has a shortage + damage; first out-request awaiting POD.
salesOrders.push({
  id: 'so-5110',
  number: 'SO-5110',
  customerId: 'cus-3',
  serviceCategory: 'Warehouse',
  serviceCategories: ['Warehouse'],
  customerPoRef: 'HRG-PO-77812',
  orderDate: d(15),
  origin: 'JAFZA WH-1',
  destination: '',
  lines: [
    line('svc-8', 'Handling in — palletised cartons', 18, 'Pallet', 18, 12),
    line('svc-7', 'Ambient storage (est. 30 days)', 540, 'Pallet-day', 3.5, 2.2),
    line('svc-8', 'Handling out', 18, 'Pallet', 18, 12),
  ],
  status: 'In progress',
  owner: 'Aisha Khan',
  notes: 'Winter collection — store and release to stores on request.',
});
workOrders.push({
  id: 'wo-2052',
  number: 'JOB-2052',
  customerId: 'cus-3',
  serviceCategory: 'Warehouse',
  serviceCategories: ['Warehouse'],
  salesOrderId: 'so-5110',
  source: { type: 'Sales order', refId: 'so-5110' },
  origin: 'JAFZA WH-1',
  destination: 'Horizon stores (Dubai)',
  cargo: cargo('Winter collection apparel', 640, 7400, 52, '18 pallets'),
  status: 'In progress',
  priority: 'Normal',
  milestones: milestones(undefined, 'In progress', 16, 'Warehouse', 4),
  vendorAssignments: [
    { id: 'va-2052-0', vendorId: 'ven-7', serviceId: 'svc-8', agreedCost: 432, status: 'Accepted' },
    { id: 'va-2052-1', vendorId: 'ven-2', serviceId: 'svc-9', agreedCost: 1020, status: 'Requested' },
  ],
  lines: [
    line('svc-8', 'Handling in — palletised cartons', 18, 'Pallet', 18, 12),
    line('svc-7', 'Ambient storage (est. 30 days)', 540, 'Pallet-day', 3.5, 2.2),
    line('svc-8', 'Handling out', 18, 'Pallet', 18, 12),
  ],
  hasWarehouse: true,
  inbounds: [
    {
      id: 'ib-2052-1',
      number: 'IN-2052-01',
      reference: 'ASN / container — first consignment',
      expectedAt: d(16),
      packingList: {
        number: 'PL-2052',
        status: 'Sent to warehouse',
        sentAt: dt(16, 10),
        lines: [
          { sku: 'HRG-COAT-M', description: 'Winter coats — M', quantity: 160, uom: 'Pcs' },
          { sku: 'HRG-COAT-L', description: 'Winter coats — L', quantity: 140, uom: 'Pcs' },
          { sku: 'HRG-SCRF-01', description: 'Wool scarves', quantity: 220, uom: 'Pcs' },
          { sku: 'HRG-BOOT-42', description: 'Boots size 42', quantity: 120, uom: 'Pairs' },
        ],
      },
      grn: {
        number: 'GRN-5530',
        receivedAt: dt(18, 14),
        attachment: att('GRN-5530_signed.pdf', 18, 15, 'Thomas Reid'),
        lines: [
          { sku: 'HRG-COAT-M', receivedQty: 160, damagedQty: 0 },
          { sku: 'HRG-COAT-L', receivedQty: 132, damagedQty: 0, remarks: '8 pcs missing from carton 14' },
          { sku: 'HRG-SCRF-01', receivedQty: 220, damagedQty: 6, remarks: 'Water damage on 6 pcs' },
          { sku: 'HRG-BOOT-42', receivedQty: 120, damagedQty: 0 },
        ],
        status: 'Variance raised',
      },
    },
    {
      id: 'ib-2052-2',
      number: 'IN-2052-02',
      reference: 'Container TGHU 551023-7 — second consignment',
      expectedAt: d(28),
      packingList: {
        number: 'PL-2052-02',
        status: 'Sent to warehouse',
        sentAt: dt(23, 11),
        source: 'Customer portal',
        attachment: att('Horizon_ASN_Nov-W4.xlsx', 23, 11, 'Customer portal — Daniel Brooks', 34),
        lines: [
          { sku: 'HRG-COAT-M', description: 'Winter coats — M', quantity: 80, uom: 'Pcs' },
          { sku: 'HRG-GLOV-01', description: 'Leather gloves', quantity: 300, uom: 'Pairs' },
          { sku: 'HRG-BOOT-42', description: 'Boots size 42', quantity: 60, uom: 'Pairs' },
        ],
      },
    },
  ],
  customerRequests: [
    {
      id: 'cr-0301',
      number: 'CR-0301',
      requestedAt: dt(21, 9),
      requiredBy: d(24),
      deliverTo: 'Horizon — Mall of the Emirates store',
      lines: [
        { sku: 'HRG-COAT-M', description: 'Winter coats — M', quantity: 60, uom: 'Pcs' },
        { sku: 'HRG-SCRF-01', description: 'Wool scarves', quantity: 80, uom: 'Pcs' },
      ],
      status: 'Sent to vendor',
    },
  ],
  createdAt: dt(15, 10),
  eta: d(30),
  owner: 'Aisha Khan',
});

// Warehouse job 2 — completed; GRN matched, but POD came back short → variance on the request.
salesOrders.push({
  id: 'so-5111',
  number: 'SO-5111',
  customerId: 'cus-7',
  serviceCategory: 'Warehouse',
  serviceCategories: ['Warehouse'],
  customerPoRef: 'SKE-4471',
  orderDate: d(9),
  origin: 'JAFZA WH-1',
  destination: '',
  lines: [
    line('svc-8', 'Handling in/out', 12, 'Pallet', 18, 12),
    line('svc-9', 'Last-mile delivery', 4, 'Drop', 120, 85),
  ],
  status: 'Completed',
  owner: 'Rahul Nair',
  notes: '',
});
workOrders.push({
  id: 'wo-2053',
  number: 'JOB-2053',
  customerId: 'cus-7',
  serviceCategory: 'Warehouse',
  serviceCategories: ['Warehouse'],
  salesOrderId: 'so-5111',
  source: { type: 'Sales order', refId: 'so-5111' },
  origin: 'JAFZA WH-1',
  destination: 'Skyline showrooms',
  cargo: cargo('Monitors and accessories', 300, 3100, 22, '12 pallets'),
  status: 'Completed',
  priority: 'Normal',
  milestones: milestones(undefined, 'Completed', 9, 'Warehouse', 7),
  vendorAssignments: [
    { id: 'va-2053-0', vendorId: 'ven-7', serviceId: 'svc-8', agreedCost: 288, status: 'Completed' },
    { id: 'va-2053-1', vendorId: 'ven-2', serviceId: 'svc-9', agreedCost: 340, status: 'Completed' },
  ],
  lines: [
    line('svc-8', 'Handling in/out', 12, 'Pallet', 18, 12),
    line('svc-9', 'Last-mile delivery', 4, 'Drop', 120, 85),
  ],
  hasWarehouse: true,
  inbounds: [
    {
      id: 'ib-2053-1',
      number: 'IN-2053-01',
      reference: 'ASN / container — first consignment',
      expectedAt: d(10),
      packingList: {
        number: 'PL-2053',
        status: 'Sent to warehouse',
        sentAt: dt(9, 11),
        lines: [
          { sku: 'SKE-MON-24', description: 'Monitors 24"', quantity: 120, uom: 'Unit' },
          { sku: 'SKE-DOCK-01', description: 'Docking stations', quantity: 180, uom: 'Unit' },
        ],
      },
      grn: {
        number: 'GRN-5524',
        receivedAt: dt(10, 12),
        attachment: att('GRN-5524.pdf', 10, 13, 'Thomas Reid', 180),
        lines: [
          { sku: 'SKE-MON-24', receivedQty: 120, damagedQty: 0 },
          { sku: 'SKE-DOCK-01', receivedQty: 180, damagedQty: 0 },
        ],
        status: 'Verified',
      },
    },
  ],
  customerRequests: [
    {
      id: 'cr-0297',
      number: 'CR-0297',
      requestedAt: dt(14, 9),
      requiredBy: d(16),
      deliverTo: 'Skyline showroom — Dubai Hills',
      lines: [
        { sku: 'SKE-MON-24', description: 'Monitors 24"', quantity: 40, uom: 'Unit' },
        { sku: 'SKE-DOCK-01', description: 'Docking stations', quantity: 60, uom: 'Unit' },
      ],
      status: 'Variance raised',
      pod: {
        number: 'POD-88123',
        vendorId: 'ven-2',
        deliveredAt: dt(16, 16),
        receivedBy: 'Store manager — J. Fernandes',
        attachment: att('POD-88123_signed.jpg', 16, 18, 'Imran Shaikh', 640),
        lines: [
          { sku: 'SKE-MON-24', deliveredQty: 38, remarks: '2 units refused — screen cracked' },
          { sku: 'SKE-DOCK-01', deliveredQty: 60 },
        ],
      },
    },
    {
      id: 'cr-0298',
      number: 'CR-0298',
      requestedAt: dt(15, 10),
      requiredBy: d(17),
      deliverTo: 'Skyline showroom — Al Barsha',
      lines: [{ sku: 'SKE-DOCK-01', description: 'Docking stations', quantity: 40, uom: 'Unit' }],
      status: 'Closed',
      pod: {
        number: 'POD-88124',
        vendorId: 'ven-2',
        deliveredAt: dt(17, 12),
        receivedBy: 'Showroom lead — K. Rao',
        attachment: att('POD-88124.pdf', 17, 13, 'Imran Shaikh', 150),
        lines: [{ sku: 'SKE-DOCK-01', deliveredQty: 40 }],
      },
    },
  ],
  purchaseInvoiceIds: ['bill-2053-0', 'bill-2053-1'],
  completedAt: dt(17, 17),
  createdAt: dt(9, 10),
  eta: d(17),
  owner: 'Rahul Nair',
});

// Direct service job — customs clearance only, no transport mode.
salesOrders.push({
  id: 'so-5112',
  number: 'SO-5112',
  customerId: 'cus-4',
  serviceCategory: 'Service',
  serviceCategories: ['Service'],
  customerPoRef: 'CMS-PO-2290',
  orderDate: d(19),
  origin: 'DXB Cargo Village',
  destination: '',
  lines: [line('svc-6', 'Import customs clearance — medical devices', 1, 'Declaration', 650, 350)],
  status: 'Completed',
  owner: 'Elena Petrova',
  notes: 'Direct service: no quotation (authorised standard rate).',
});
workOrders.push({
  id: 'wo-2054',
  number: 'JOB-2054',
  customerId: 'cus-4',
  serviceCategory: 'Service',
  serviceCategories: ['Service'],
  salesOrderId: 'so-5112',
  source: { type: 'Sales order', refId: 'so-5112' },
  origin: 'DXB Cargo Village',
  destination: '',
  cargo: cargo('Import declaration — diagnostic equipment', 1, 0, 0, '—'),
  status: 'Completed',
  priority: 'High',
  milestones: milestones(undefined, 'Completed', 19, 'Service', 4),
  vendorAssignments: [
    { id: 'va-2054-0', vendorId: 'ven-6', serviceId: 'svc-6', agreedCost: 350, status: 'Completed' },
  ],
  lines: [line('svc-6', 'Import customs clearance — medical devices', 1, 'Declaration', 650, 350)],
  hasWarehouse: false,
  inbounds: [],
  customerRequests: [],
  purchaseInvoiceIds: ['bill-2054-0'],
  completedAt: dt(21, 12),
  createdAt: dt(19, 9),
  eta: d(21),
  owner: 'Elena Petrova',
});

// A transport job delivered against a customer request; POD matches.
{
  const wo = workOrders.find((w) => w.id === 'wo-2047');
  if (wo) {
    wo.customerRequests.push({
      id: 'cr-0290',
      number: 'CR-0290',
      requestedAt: dt(5, 9),
      requiredBy: d(12),
      deliverTo: 'Crescent Medical — Abu Dhabi central store',
      lines: [{ sku: 'CMS-DEV-TC', description: 'Temperature-controlled devices', quantity: 32, uom: 'Pkg' }],
      status: 'Closed',
      pod: {
        number: 'POD-77810',
        vendorId: 'ven-5',
        deliveredAt: dt(12, 11),
        receivedBy: 'Pharmacist on duty — S. Nair',
        attachment: att('POD-77810.pdf', 12, 12, 'Lucas Martin', 120),
        lines: [{ sku: 'CMS-DEV-TC', deliveredQty: 32 }],
      },
    });
  }
}

export const contracts: Contract[] = [
  {
    id: 'ctr-1',
    number: 'CTR-2026-014',
    customerId: 'cus-2',
    quotationId: 'qt-1083',
    title: 'GCC road distribution — annual rates',
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    status: 'Active',
    lines: [
      line('svc-1', 'FTL Dubai → Riyadh', 1, 'Truck', 6100, 5200),
      line('svc-1', 'FTL Dubai → Abu Dhabi', 1, 'Truck', 1150, 900),
    ],
    billingCycle: 'Per job',
  },
  {
    id: 'ctr-2',
    number: 'CTR-2026-011',
    customerId: 'cus-3',
    quotationId: 'qt-1077',
    title: 'JAFZA storage & last-mile replenishment',
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    status: 'Active',
    lines: [
      line('svc-7', 'Ambient storage', 1, 'Pallet-day', 3.5, 2.2),
      line('svc-8', 'Handling in / out', 1, 'Pallet', 18, 12),
      line('svc-9', 'Last-mile drop', 1, 'Drop', 120, 85),
    ],
    billingCycle: 'Monthly',
  },
  {
    id: 'ctr-3',
    number: 'CTR-2025-032',
    customerId: 'cus-6',
    title: 'Import consolidation — India lanes',
    startDate: '2025-12-01',
    endDate: '2026-11-30',
    status: 'Expiring',
    lines: [line('svc-3', 'Ocean freight Mumbai → Jebel Ali', 1, 'Container', 2800, 2100)],
    billingCycle: 'Per job',
  },
];

// ---------- Warehouse ----------
export const stockItems: StockItem[] = [
  st(1, 'HRG-APP-001', 3, 'Apparel cartons — winter range', 'A-01-03', 620, 'Carton', 26),
  st(2, 'HRG-APP-002', 3, 'Apparel cartons — accessories', 'A-01-04', 410, 'Carton', 14),
  st(3, 'HRG-HOM-010', 3, 'Home décor assorted', 'A-02-01', 180, 'Carton', 9),
  st(4, 'GIS-STL-100', 6, 'Steel pipe fittings 2"', 'B-04-02', 1800, 'Piece', 22),
  st(5, 'GIS-VAL-220', 6, 'Industrial gate valves', 'B-04-05', 96, 'Piece', 8),
  st(6, 'SKE-LAP-014', 7, 'Laptops 14" (boxed)', 'C-01-01', 540, 'Unit', 18),
  st(7, 'SKE-MON-027', 7, 'Monitors 27"', 'C-01-02', 260, 'Unit', 13),
  st(8, 'SKE-ACC-100', 7, 'Keyboard & mouse sets', 'C-01-06', 1200, 'Unit', 6),
  st(9, 'CMS-GLV-001', 4, 'Nitrile gloves (cases)', 'D-03-01', 300, 'Case', 10),
  st(10, 'PVF-SNK-050', 5, 'Packaged snacks', 'E-01-02', 0, 'Carton', 0),
];

function st(
  n: number,
  sku: string,
  customer: number,
  description: string,
  location: string,
  qtyOnHand: number,
  uom: string,
  pallets: number,
): StockItem {
  return {
    id: `stk-${n}`,
    sku,
    customerId: `cus-${customer}`,
    description,
    warehouse: 'JAFZA WH-1',
    location,
    qtyOnHand,
    uom,
    pallets,
    receivedAt: d(1 + (n % 20)),
  };
}

export const stockMovements: StockMovement[] = [
  mv(
    1,
    'GRN-5521',
    'Receipt',
    3,
    'wo-2048',
    12,
    [
      ['stk-1', 620],
      ['stk-2', 410],
    ],
    'Posted',
    'Container MSKU 418220-4',
  ),
  mv(
    2,
    'GRN-5522',
    'Receipt',
    6,
    'wo-2045',
    9,
    [
      ['stk-4', 1800],
      ['stk-5', 96],
    ],
    'Posted',
    'Container TGHU 772031-0',
  ),
  mv(3, 'DSP-3310', 'Dispatch', 3, 'wo-2043', 20, [['stk-3', 40]], 'Draft', 'Store replenishment wave 47'),
  mv(
    4,
    'GRN-5523',
    'Receipt',
    7,
    undefined,
    16,
    [
      ['stk-6', 540],
      ['stk-7', 260],
      ['stk-8', 1200],
    ],
    'Posted',
    'Customer delivery — no transport job',
  ),
  mv(5, 'DSP-3309', 'Dispatch', 5, undefined, 14, [['stk-10', 220]], 'Posted', 'Customer collection'),
  mv(
    6,
    'ADJ-0042',
    'Adjustment',
    4,
    undefined,
    18,
    [['stk-9', -4]],
    'Posted',
    'Damaged in handling — approved',
  ),
  mv(7, 'TRF-0107', 'Transfer', 7, undefined, 21, [['stk-8', 200]], 'Posted', 'C-01-05 → C-01-06'),
];

function mv(
  n: number,
  number: string,
  type: StockMovement['type'],
  customer: number,
  workOrderId: string | undefined,
  day: number,
  lines: [string, number][],
  status: StockMovement['status'],
  reference: string,
): StockMovement {
  return {
    id: `mv-${n}`,
    number,
    type,
    customerId: `cus-${customer}`,
    workOrderId,
    date: d(day),
    warehouse: 'JAFZA WH-1',
    lines: lines.map(([stockItemId, quantity]) => ({ stockItemId, quantity })),
    status,
    reference,
  };
}

export const storageRuns: StorageBillingRun[] = [
  {
    id: 'sbr-1',
    number: 'SBR-2026-10-03',
    customerId: 'cus-3',
    periodFrom: '2026-10-01',
    periodTo: '2026-10-31',
    palletDays: 1426,
    ratePerPalletDay: 3.5,
    status: 'Invoiced',
    invoiceId: 'inv-3021',
  },
  {
    id: 'sbr-2',
    number: 'SBR-2026-10-06',
    customerId: 'cus-6',
    periodFrom: '2026-10-01',
    periodTo: '2026-10-31',
    palletDays: 682,
    ratePerPalletDay: 3.2,
    status: 'Invoiced',
    invoiceId: 'inv-3020',
  },
  {
    id: 'sbr-3',
    number: 'SBR-2026-11-03',
    customerId: 'cus-3',
    periodFrom: '2026-11-01',
    periodTo: '2026-11-30',
    palletDays: 1281,
    ratePerPalletDay: 3.5,
    status: 'Draft',
  },
  {
    id: 'sbr-5',
    number: 'SBR-2026-11-06',
    customerId: 'cus-6',
    periodFrom: '2026-11-01',
    periodTo: '2026-11-30',
    basis: 'Sq.ft per period',
    palletDays: 2600,
    ratePerPalletDay: 5.5,
    status: 'Draft',
  },
  {
    id: 'sbr-4',
    number: 'SBR-2026-11-07',
    customerId: 'cus-7',
    periodFrom: '2026-11-01',
    periodTo: '2026-11-30',
    palletDays: 296,
    ratePerPalletDay: 3.5,
    status: 'Draft',
  },
];

invoices.push(
  {
    id: 'inv-3021',
    number: 'AEN021',
    customerId: 'cus-3',
    storageRunId: 'sbr-1',
    issueDate: '2026-11-01',
    dueDate: '2026-12-31',
    lines: [
      {
        id: 'il-s1',
        uom: 'Pallet-day',
        description: 'Storage (1-Oct-26 to 31-Oct-26) — pallet-days',
        quantity: 1426,
        unitPrice: 3.5,
        vatRate: 0.05,
      },
    ],
    paid: 0,
    status: 'Posted',
  },
  {
    id: 'inv-3020',
    number: 'AEN020',
    customerId: 'cus-6',
    storageRunId: 'sbr-2',
    issueDate: '2026-11-01',
    dueDate: '2026-12-16',
    lines: [
      {
        id: 'il-s2',
        uom: 'Pallet-day',
        description: 'Storage (1-Oct-26 to 31-Oct-26) — pallet-days',
        quantity: 682,
        unitPrice: 3.2,
        vatRate: 0.05,
      },
    ],
    paid: 2291.52,
    status: 'Paid',
  },
);

// ---------- Vendor bills ----------
export const vendorBills: VendorBill[] = workOrders
  .filter(
    (wo) =>
      wo.serviceCategory === 'Transport' &&
      (wo.status === 'Completed' || wo.status === 'Delivered' || wo.status === 'In transit'),
  )
  .flatMap((wo, i) =>
    wo.vendorAssignments.slice(0, 2).map((va, j) => {
      const paid = wo.status === 'Completed' && j === 0;
      return {
        id: `bill-${i}-${j}`,
        number: `PI-${7700 + i * 2 + j}`,
        vendorRef: `${vendors.find((x) => x.id === va.vendorId)!.code.replace('VEN', 'SI')}-${880 + i * 3 + j}`,
        vendorId: va.vendorId,
        workOrderId: wo.id,
        billDate: d(10 + i),
        dueDate: addDays(d(10 + i), 30),
        amount: va.agreedCost,
        vat: Math.round(va.agreedCost * 0.05 * 100) / 100,
        paid: paid ? Math.round(va.agreedCost * 1.05 * 100) / 100 : 0,
        status: paid ? ('Paid' as const) : j === 1 && i === 0 ? ('Draft' as const) : ('Approved' as const),
      };
    }),
  );

// Purchase invoices drafted automatically when warehouse / service jobs were completed.
vendorBills.push(
  {
    id: 'bill-2053-0',
    number: 'PI-7801',
    vendorRef: 'HGW-INV-3310',
    vendorId: 'ven-7',
    workOrderId: 'wo-2053',
    billDate: d(17),
    dueDate: addDays(d(17), 30),
    amount: 288,
    vat: 14.4,
    paid: 0,
    status: 'Draft',
  },
  {
    id: 'bill-2053-1',
    number: 'PI-7802',
    vendorRef: 'DLT-1187',
    vendorId: 'ven-2',
    workOrderId: 'wo-2053',
    billDate: d(17),
    dueDate: addDays(d(17), 30),
    amount: 340,
    vat: 17,
    paid: 0,
    status: 'Draft',
  },
  {
    id: 'bill-2054-0',
    number: 'PI-7803',
    vendorRef: 'CPC-5521',
    vendorId: 'ven-6',
    workOrderId: 'wo-2054',
    billDate: d(21),
    dueDate: addDays(d(21), 30),
    amount: 350,
    vat: 17.5,
    paid: 0,
    status: 'Draft',
  },
);

// ---------- Collections ----------
export const collections: Collection[] = invoices
  .filter((inv) => inv.paid > 0)
  .map((inv, i) => ({
    id: `rc-${i + 1}`,
    number: `RCPT-${4410 + i}`,
    customerId: inv.customerId,
    date: d(12 + i),
    method: (['Bank transfer', 'Cheque', 'Bank transfer', 'Card', 'Bank transfer'] as const)[i % 5]!,
    amount: inv.paid,
    reference: `TRX${880120 + i * 17}`,
    allocations: [{ invoiceId: inv.id, amount: inv.paid }],
    status: 'Allocated' as const,
  }));

collections.push(
  {
    id: 'rc-pdc-1',
    number: 'RCPT-4420',
    customerId: 'cus-7',
    date: '2026-11-20',
    method: 'PDC',
    amount: 15000,
    reference: 'CHQ 004512 — Emirates NBD',
    chequeDate: '2026-12-20',
    allocations: [],
    status: 'PDC pending',
  },
  {
    id: 'rc-un-1',
    number: 'RCPT-4421',
    customerId: 'cus-2',
    date: '2026-11-22',
    method: 'Bank transfer',
    amount: 5000,
    reference: 'TRX990341',
    allocations: [],
    status: 'Unallocated',
  },
);

// ---------- Journals (derived, illustrative) ----------
export const journals: JournalEntry[] = [
  ...invoices
    .filter((i) => i.status !== 'Draft')
    .map((inv, k) => {
      const t = invoiceTotals(inv);
      return {
        id: `jv-inv-${k}`,
        number: `JV-${9100 + k}`,
        date: inv.issueDate,
        source: (inv.storageRunId ? 'Storage billing' : 'Invoice') as JournalEntry['source'],
        reference: inv.number,
        memo: `Customer invoice ${inv.number}`,
        lines: [
          { account: '1200 Accounts receivable', debit: t.total, credit: 0 },
          {
            account: inv.storageRunId ? '4200 Storage revenue' : '4100 Freight revenue',
            debit: 0,
            credit: t.subtotal,
          },
          { account: '2200 VAT output payable', debit: 0, credit: t.vat },
        ],
        status: 'Posted' as const,
      };
    }),
  ...collections
    .filter((c) => c.status === 'Allocated')
    .map((rc, k) => ({
      id: `jv-rc-${k}`,
      number: `JV-${9200 + k}`,
      date: rc.date,
      source: 'Collection' as const,
      reference: rc.number,
      memo: `Receipt ${rc.number}`,
      lines: [
        { account: '1100 Bank — current account', debit: rc.amount, credit: 0 },
        { account: '1200 Accounts receivable', debit: 0, credit: rc.amount },
      ],
      status: 'Posted' as const,
    })),
];

// ---------- Activity & notifications ----------
export const activity: ActivityEvent[] = [
  ev(23, 10, 'Aisha Khan', 'Work order', 'wo-2051', 'JOB-2051', 'created a direct work order'),
  ev(23, 9, 'Rahul Nair', 'Enquiry', 'enq-1072', 'ENQ-1072', 'logged a new enquiry'),
  ev(22, 16, 'Mohammed Saleh', 'Collection', 'rc-un-1', 'RCPT-4421', 'recorded a receipt (unallocated)'),
  ev(22, 11, 'Elena Petrova', 'Enquiry', 'enq-1073', 'ENQ-1073', 'logged a new enquiry'),
  ev(21, 15, 'Aisha Khan', 'Quotation', 'qt-1084', 'QT-1084', 'started a draft quotation'),
  ev(20, 14, 'Mohammed Saleh', 'Collection', 'rc-pdc-1', 'RCPT-4420', 'received a PDC dated 20 Dec'),
  ev(20, 10, 'Rahul Nair', 'Warehouse', 'mv-3', 'DSP-3310', 'prepared a dispatch'),
  ev(19, 12, 'Elena Petrova', 'Quotation', 'qt-1075', 'QT-1075', 'submitted for approval'),
  ev(18, 9, 'Aisha Khan', 'Work order', 'wo-2043', 'JOB-2043', 'confirmed the work order'),
];

function ev(
  day: number,
  hh: number,
  actor: string,
  entity: ActivityEvent['entity'],
  entityId: string,
  entityRef: string,
  action: string,
): ActivityEvent {
  return { id: `ev-${entityId}-${day}${hh}`, at: dt(day, hh), actor, entity, entityId, entityRef, action };
}

export const notifications: AppNotification[] = [
  {
    id: 'n1',
    at: dt(23, 9),
    title: 'Quotation awaiting your approval',
    body: 'QT-1075 · Crescent Medical Supplies',
    read: false,
    href: '/quotations/qt-1075',
  },
  {
    id: 'n2',
    at: dt(22, 17),
    title: 'Invoice overdue',
    body: 'AEN024 · Skyline Electronics FZE is 8 days overdue',
    read: false,
    href: '/invoices/inv-3024',
  },
  {
    id: 'n3',
    at: dt(22, 8),
    title: 'Milestone reached',
    body: 'JOB-2047 arrived at DXB',
    read: false,
    href: '/work-orders/wo-2047',
  },
  {
    id: 'n4',
    at: dt(20, 14),
    title: 'PDC received',
    body: 'RCPT-4420 · cheque dated 20 Dec 2026',
    read: true,
    href: '/collections',
  },
  {
    id: 'n5',
    at: dt(18, 11),
    title: 'Contract expiring',
    body: 'CTR-2025-032 ends on 30 Nov 2026',
    read: true,
    href: '/contracts',
  },
];

/** Monthly series for dashboard/report charts (AED, fictional). */
export const monthlyRevenue = [
  { month: 'Jun', revenue: 312000, cost: 241000 },
  { month: 'Jul', revenue: 348000, cost: 262000 },
  { month: 'Aug', revenue: 331000, cost: 255000 },
  { month: 'Sep', revenue: 389000, cost: 292000 },
  { month: 'Oct', revenue: 412000, cost: 305000 },
  { month: 'Nov', revenue: 436000, cost: 318000 },
];

/** Sample staff users for the illustrative Settings screen (Identity module arrives in Phase 1). */
export const staffUsers: {
  id: string;
  name: string;
  email: string;
  role: string;
  mfa: 'Enabled' | 'Not enrolled';
  status: 'Active' | 'Inactive';
}[] = [
  {
    id: 'u1',
    name: 'Aisha Khan',
    email: 'aisha.khan@aenix.example',
    role: 'Operations manager',
    mfa: 'Enabled',
    status: 'Active',
  },
  {
    id: 'u2',
    name: 'Rahul Nair',
    email: 'rahul.nair@aenix.example',
    role: 'Sales executive',
    mfa: 'Enabled',
    status: 'Active',
  },
  {
    id: 'u3',
    name: 'Mohammed Saleh',
    email: 'mohammed.saleh@aenix.example',
    role: 'Accountant',
    mfa: 'Enabled',
    status: 'Active',
  },
  {
    id: 'u4',
    name: 'Elena Petrova',
    email: 'elena.petrova@aenix.example',
    role: 'Sales executive',
    mfa: 'Not enrolled',
    status: 'Active',
  },
  {
    id: 'u5',
    name: 'Thomas Reid',
    email: 'thomas.reid@aenix.example',
    role: 'Warehouse supervisor',
    mfa: 'Not enrolled',
    status: 'Inactive',
  },
];

/** Prefilled prototype sign-in identifier (login page). */
export const prototypeLoginHint: string = 'aisha.khan@aenix.example';

// ---------- FLOW-002: industry-standard order-to-cash (owner decision 2026-11-27) ----------

// 1) Multi-service: every order/job lists ALL service types from its lines (one order can mix
//    transport, warehouse and other services). The primary type drives icons/labels.
{
  const modeOf = (serviceId: string) => services.find((x) => x.id === serviceId)?.mode;
  for (const so of salesOrders) {
    so.serviceCategories = categoriesFromLines(so.lines, modeOf, [so.serviceCategory]);
    so.serviceCategory = primaryCategory(so.serviceCategories);
  }
  for (const q of quotations) {
    q.serviceCategories = categoriesFromLines(q.lines, modeOf, [q.serviceCategory]);
    q.serviceCategory = primaryCategory(q.serviceCategories);
  }
  for (const e of enquiries) {
    e.serviceCategories = categoriesFromLines(
      e.serviceIds.map((serviceId) => ({ serviceId })),
      modeOf,
      [e.serviceCategory],
    );
    e.serviceCategory = primaryCategory(e.serviceCategories);
  }
  for (const wo of workOrders) {
    const extra = [
      wo.serviceCategory,
      ...(wo.hasWarehouse || wo.inbounds.length ? (['Warehouse'] as const) : []),
    ];
    wo.serviceCategories = categoriesFromLines(wo.lines, modeOf, extra);
    wo.serviceCategory = primaryCategory(wo.serviceCategories);
  }
}

// 2) Vendor purchase orders — issued when the vendor is assigned (before the work).
export const purchaseOrders: PurchaseOrder[] = [];
{
  let poSeq = 6100;
  for (const wo of workOrders) {
    for (const va of wo.vendorAssignments) {
      poSeq += 1;
      const bill = vendorBills.find(
        (b) => b.workOrderId === wo.id && b.vendorId === va.vendorId && !b.purchaseOrderId,
      );
      const po: PurchaseOrder = {
        id: `po-${poSeq}`,
        number: `PO-${poSeq}`,
        vendorId: va.vendorId,
        workOrderId: wo.id,
        salesOrderId: wo.salesOrderId,
        serviceId: va.serviceId,
        description: services.find((x) => x.id === va.serviceId)?.name ?? 'Service',
        amount: va.agreedCost,
        vatRate: 0.05,
        issuedAt: wo.createdAt,
        status: bill
          ? 'Billed'
          : va.status === 'Completed'
            ? 'Completed'
            : va.status === 'Accepted'
              ? 'Accepted'
              : 'Issued',
        vendorBillId: bill?.id,
      };
      if (bill) bill.purchaseOrderId = po.id;
      va.purchaseOrderId = po.id;
      purchaseOrders.push(po);
    }
  }
}

// 3) A customer advance received against a sales order (no invoice yet).
collections.push({
  id: 'rc-adv-1',
  number: 'RCPT-4422',
  customerId: 'cus-3',
  date: '2026-11-17',
  method: 'Bank transfer',
  amount: 1000,
  reference: 'TRX991207 — advance for SO-5110',
  allocations: [{ salesOrderId: 'so-5110', amount: 1000 }],
  status: 'Advance',
});

// 4) Payment vouchers for vendor bills that are (partly) paid.
export const vendorPayments: VendorPayment[] = vendorBills
  .filter((b) => b.paid > 0)
  .map((b, i) => ({
    id: `pv-${i + 1}`,
    number: `PV-${3300 + i}`,
    vendorId: b.vendorId,
    date: addDays(b.billDate, 10 + i),
    method: 'Bank transfer' as const,
    amount: b.paid,
    reference: `TT${770100 + i * 13}`,
    allocations: [{ billId: b.id, amount: b.paid }],
    status: 'Posted' as const,
  }));

// 5) Chart of accounts (illustrative; pending accountant sign-off). Customers/vendors get
//    automatic sub-ledgers under Accounts receivable / payable.
const grp = (
  id: string,
  code: string,
  name: string,
  group: LedgerAccount['group'],
  parentId?: string,
): LedgerAccount => ({
  id,
  code,
  name,
  group,
  kind: 'Group',
  parentId,
  system: true,
  active: true,
});
const led = (
  id: string,
  code: string,
  name: string,
  group: LedgerAccount['group'],
  parentId: string,
  system = true,
): LedgerAccount => ({
  id,
  code,
  name,
  group,
  kind: 'Ledger',
  parentId,
  system,
  active: true,
});
export const ledgerAccounts: LedgerAccount[] = [
  grp('g-assets', '1000', 'Assets', 'Assets'),
  grp('g-cash', '1100', 'Cash and bank', 'Assets', 'g-assets'),
  led('la-1110', '1110', 'Bank — current account', 'Assets', 'g-cash'),
  led('la-1120', '1120', 'Petty cash', 'Assets', 'g-cash', false),
  led('la-1130', '1130', 'PDC received (cheques in hand)', 'Assets', 'g-cash'),
  grp('g-ar', '1200', 'Accounts receivable', 'Assets', 'g-assets'),
  led('la-1300', '1300', 'VAT input recoverable', 'Assets', 'g-assets'),
  grp('g-liab', '2000', 'Liabilities', 'Liabilities'),
  grp('g-ap', '2100', 'Accounts payable', 'Liabilities', 'g-liab'),
  led('la-2200', '2200', 'VAT output payable', 'Liabilities', 'g-liab'),
  led('la-2300', '2300', 'Customer advances', 'Liabilities', 'g-liab'),
  led('la-2400', '2400', 'Accrued job costs', 'Liabilities', 'g-liab'),
  grp('g-eq', '3000', 'Equity', 'Equity'),
  led('la-3100', '3100', 'Share capital', 'Equity', 'g-eq'),
  grp('g-inc', '4000', 'Income', 'Income'),
  led('la-4100', '4100', 'Freight revenue', 'Income', 'g-inc'),
  led('la-4200', '4200', 'Storage & handling revenue', 'Income', 'g-inc'),
  led('la-4300', '4300', 'Customs & other services revenue', 'Income', 'g-inc'),
  grp('g-exp', '5000', 'Expenses', 'Expenses'),
  led('la-5100', '5100', 'Direct job costs — subcontracted', 'Expenses', 'g-exp'),
  led('la-6100', '6100', 'Office rent', 'Expenses', 'g-exp', false),
  led('la-6200', '6200', 'Salaries', 'Expenses', 'g-exp', false),
  ...customers.map((c, i): LedgerAccount => ({
    id: c.ledgerAccountId,
    code: `1200-${String(i + 1).padStart(3, '0')}`,
    name: c.name,
    group: 'Assets',
    kind: 'Ledger',
    parentId: 'g-ar',
    party: { type: 'Customer', id: c.id },
    system: true,
    active: true,
  })),
  ...vendors.map((v, i): LedgerAccount => ({
    id: v.ledgerAccountId,
    code: `2100-${String(i + 1).padStart(3, '0')}`,
    name: v.name,
    group: 'Liabilities',
    kind: 'Ledger',
    parentId: 'g-ap',
    party: { type: 'Vendor', id: v.id },
    system: true,
    active: true,
  })),
];

/**
 * Company profile used on tax invoices and GRNs (from the owner's documents, 2026-11-27).
 * Bank details are PLACEHOLDERS in the prototype — real values are configured in Settings
 * and are never committed to a public repository.
 */
export const company: CompanyProfile = {
  legalName: 'Aenix LLC',
  tagline: 'The Network Behind Your Logistics',
  website: 'www.aenix.ae',
  trn: '105399983300003',
  officeAddress: [
    'Office no. R01, GBH Business Center,',
    'Al Rasheed Rd, Al Muteena,',
    'Deira, Dubai, United Arab Emirates',
  ],
  registeredAddress: ['Sharjah Media City (Shams), Al Messaned, Al Bataeh,', 'Sharjah, United Arab Emirates'],
  phone: '+971 4 397 5844',
  email: 'info@aenix.ae',
  licenseNo: '2644224.01',
  bank: {
    bankName: 'Bank name (set in Settings)',
    accountName: 'AENIX LLC',
    accountNumber: '•••• •••• ••••',
    iban: 'AE•• •••• •••• •••• •••• •••',
    swift: '••••••••',
  },
  invoicePrefix: 'AEN',
  grnPrefix: 'GRN',
};
