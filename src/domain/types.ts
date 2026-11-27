/**
 * PROVISIONAL UI view-models for the workflow prototype (FE-PROTO-001).
 *
 * These are NOT API contracts. When Antigravity publishes the versioned OpenAPI contract
 * for a module, that module's types are replaced by the generated ones and the screens
 * are adapted. Field names here are deliberately business-readable, not wire formats.
 */

export type Id = string;
export type IsoDate = string; // YYYY-MM-DD
export type IsoDateTime = string;

export type TransportMode = 'Road' | 'Sea' | 'Air';

/**
 * What a request / order / job is for (owner instruction 2026-11-23): not every job is transport.
 * - Transport: moving goods; `mode` (Road/Sea/Air) applies ONLY here.
 * - Warehouse: 3PL inbound/storage/outbound handled by the warehouse team (PL → GRN, request → POD).
 * - Service: a direct service with no transport leg (e.g. customs clearance, labour, packing).
 */
export type ServiceCategory = 'Transport' | 'Warehouse' | 'Service';
export type ServiceMode = TransportMode | 'Warehouse' | 'Customs';

// ---------- Masters ----------
export interface Customer {
  id: Id;
  code: string;
  name: string;
  industry: string;
  city: string;
  country: string;
  trnMasked: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  creditLimit: number;
  paymentTermsDays: number;
  status: 'Active' | 'On hold' | 'Inactive';
  createdAt: IsoDate;
  /** Sub-ledger under Accounts receivable, created automatically with the customer. */
  ledgerAccountId: Id;
}

export type VendorCategory = 'Transporter' | 'Shipping line' | 'Airline' | 'Customs broker' | 'Warehouse';

export interface Vendor {
  id: Id;
  code: string;
  name: string;
  category: VendorCategory;
  city: string;
  country: string;
  contactName: string;
  contactEmail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  paymentTermsDays: number;
  status: 'Active' | 'On hold' | 'Inactive';
  /** Sub-ledger under Accounts payable, created automatically with the vendor. */
  ledgerAccountId: Id;
}

export interface Service {
  id: Id;
  code: string;
  name: string;
  mode: ServiceMode;
  unit: string;
  description: string;
}

export interface VendorRate {
  id: Id;
  vendorId: Id;
  serviceId: Id;
  origin: string;
  destination: string;
  unit: string;
  rate: number;
  validFrom: IsoDate;
  validTo: IsoDate;
}

// ---------- Commercial ----------
export interface Cargo {
  description: string;
  packages: number;
  weightKg: number;
  volumeCbm: number;
  equipment?: string; // e.g. 40ft container, 3-ton truck
}

export type EnquiryStatus = 'New' | 'Quoting' | 'Quoted' | 'Won' | 'Lost';

export interface Enquiry {
  id: Id;
  number: string;
  customerId: Id;
  /** Primary type (icon/label). */
  serviceCategory: ServiceCategory;
  /** Every service type included — one order can mix transport, warehouse and other services. */
  serviceCategories: ServiceCategory[];
  /** Transport only. */
  mode?: TransportMode;
  serviceIds: Id[];
  /** Transport: origin/destination. Warehouse/Service: service location in `origin`, `destination` may be ''. */
  origin: string;
  destination: string;
  cargo: Cargo;
  requiredBy: IsoDate;
  status: EnquiryStatus;
  owner: string;
  notes: string;
  createdAt: IsoDateTime;
}

export interface PriceLine {
  id: Id;
  serviceId: Id;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitCost: number;
}

export type QuotationStatus = 'Draft' | 'Pending approval' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired';

export interface Quotation {
  id: Id;
  number: string;
  version: number;
  enquiryId?: Id;
  customerId: Id;
  /** Primary type (icon/label). */
  serviceCategory: ServiceCategory;
  /** Every service type included — one order can mix transport, warehouse and other services. */
  serviceCategories: ServiceCategory[];
  /** Transport only. */
  mode?: TransportMode;
  origin: string;
  destination: string;
  agreement: 'One-time' | 'Long-term';
  status: QuotationStatus;
  validUntil: IsoDate;
  lines: PriceLine[];
  terms: string;
  createdAt: IsoDateTime;
  owner: string;
}

// ---------- Sales order ----------
export type SalesOrderStatus = 'Draft' | 'Confirmed' | 'In progress' | 'Completed' | 'Cancelled';

/**
 * Customer's confirmed order (Enquiry → optional Quotation → Sales Order → Work Order(s)).
 * Can be created from an accepted quotation, a contract, or directly (authorised direct pricing).
 */
export interface SalesOrder {
  id: Id;
  number: string;
  customerId: Id;
  /** Primary type (icon/label). */
  serviceCategory: ServiceCategory;
  /** Every service type included — one order can mix transport, warehouse and other services. */
  serviceCategories: ServiceCategory[];
  mode?: TransportMode;
  enquiryId?: Id;
  quotationId?: Id;
  contractId?: Id;
  customerPoRef: string;
  orderDate: IsoDate;
  origin: string;
  destination: string;
  lines: PriceLine[];
  status: SalesOrderStatus;
  owner: string;
  notes: string;
}

export type ContractStatus = 'Draft' | 'Active' | 'Expiring' | 'Expired';

export interface Contract {
  id: Id;
  number: string;
  customerId: Id;
  quotationId?: Id;
  title: string;
  startDate: IsoDate;
  endDate: IsoDate;
  status: ContractStatus;
  lines: PriceLine[];
  billingCycle: 'Per job' | 'Monthly';
}

// ---------- Operations ----------
export type WorkOrderStatus =
  'Draft' | 'Confirmed' | 'In progress' | 'In transit' | 'Delivered' | 'Completed' | 'Cancelled';

export interface Milestone {
  id: Id;
  label: string;
  status: 'Done' | 'Current' | 'Pending';
  at?: IsoDateTime;
}

export interface VendorAssignment {
  id: Id;
  vendorId: Id;
  serviceId: Id;
  agreedCost: number;
  status: 'Requested' | 'Accepted' | 'Completed';
  /** Purchase order issued to the vendor when assigned (industry standard: PO before the work). */
  purchaseOrderId?: Id;
}

/** Work Order IS the Job (AENIX business rule). */
export interface WorkOrder {
  id: Id;
  number: string;
  customerId: Id;
  /** Primary type (icon/label). */
  serviceCategory: ServiceCategory;
  /** Every service type included — one order can mix transport, warehouse and other services. */
  serviceCategories: ServiceCategory[];
  salesOrderId?: Id;
  source: { type: 'Sales order' | 'Quotation' | 'Contract' | 'Direct'; refId?: Id };
  /** Transport only. */
  mode?: TransportMode;
  origin: string;
  destination: string;
  cargo: Cargo;
  status: WorkOrderStatus;
  priority: 'Normal' | 'High' | 'Urgent';
  milestones: Milestone[];
  vendorAssignments: VendorAssignment[];
  lines: PriceLine[];
  hasWarehouse: boolean;
  invoiceId?: Id;
  /** Warehouse inbound: product list sent to the warehouse team, and the GRN they return. */
  packingList?: PackingList;
  grn?: Grn;
  /** Customer out / delivery requests, each closed by a vendor or warehouse POD. */
  customerRequests: CustomerRequest[];
  /** Purchase invoices (vendor bills) drafted when the job is completed. */
  purchaseInvoiceIds?: Id[];
  completedAt?: IsoDateTime;
  createdAt: IsoDateTime;
  eta: IsoDate;
  owner: string;
}

// ---------- Job documents: PL → GRN, customer request → POD ----------
export interface DocLine {
  sku: string;
  description: string;
  quantity: number;
  uom: string;
}

/** Uploaded document metadata (the file itself is stored by the backend; prototype keeps the name only). */
export interface Attachment {
  fileName: string;
  sizeKb: number;
  uploadedAt: IsoDateTime;
  uploadedBy: string;
}

/** Product list (PL) sent to the warehouse team so they know what to expect. */
export interface PackingList {
  number: string;
  status: 'Draft' | 'Sent to warehouse';
  sentAt?: IsoDateTime;
  lines: DocLine[];
}

/** Goods received note returned by the warehouse team and uploaded against the job. */
export interface Grn {
  number: string;
  receivedAt: IsoDateTime;
  attachment?: Attachment;
  lines: { sku: string; receivedQty: number; damagedQty: number; remarks?: string }[];
  status: 'Uploaded' | 'Verified' | 'Variance raised';
}

/** Proof of delivery returned by the vendor / warehouse for a customer request. */
export interface Pod {
  number: string;
  vendorId?: Id;
  deliveredAt: IsoDateTime;
  receivedBy: string;
  attachment?: Attachment;
  lines: { sku: string; deliveredQty: number; remarks?: string }[];
}

/** Customer's out / release / delivery request against a job. */
export interface CustomerRequest {
  id: Id;
  number: string;
  requestedAt: IsoDateTime;
  requiredBy: IsoDate;
  deliverTo: string;
  lines: DocLine[];
  status: 'Open' | 'Sent to vendor' | 'Delivered' | 'Closed' | 'Variance raised';
  pod?: Pod;
}

// ---------- Warehouse ----------
export interface StockItem {
  id: Id;
  sku: string;
  customerId: Id;
  description: string;
  warehouse: string;
  location: string;
  qtyOnHand: number;
  uom: string;
  pallets: number;
  receivedAt: IsoDate;
}

export type MovementType = 'Receipt' | 'Dispatch' | 'Transfer' | 'Adjustment';

export interface StockMovement {
  id: Id;
  number: string;
  type: MovementType;
  customerId: Id;
  workOrderId?: Id;
  date: IsoDate;
  warehouse: string;
  lines: { stockItemId: Id; quantity: number }[];
  status: 'Draft' | 'Posted';
  reference: string;
}

export interface StorageBillingRun {
  id: Id;
  number: string;
  customerId: Id;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  palletDays: number;
  ratePerPalletDay: number;
  status: 'Draft' | 'Invoiced';
  invoiceId?: Id;
}

// ---------- Finance ----------
export type InvoiceStatus = 'Draft' | 'Posted' | 'Partially paid' | 'Paid' | 'Overdue' | 'Cancelled';

export interface InvoiceLine {
  id: Id;
  /** Sales order this line bills (one invoice can cover several sales orders of the same customer). */
  salesOrderId?: Id;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 0.05 standard UAE VAT
}

export interface Invoice {
  id: Id;
  number: string;
  customerId: Id;
  workOrderId?: Id;
  storageRunId?: Id;
  /** Sales orders billed by this invoice. */
  salesOrderIds?: Id[];
  issueDate: IsoDate;
  dueDate: IsoDate;
  lines: InvoiceLine[];
  paid: number;
  status: InvoiceStatus;
}

export type BillStatus = 'Draft' | 'Approved' | 'Partially paid' | 'Paid' | 'Overdue';

export interface VendorBill {
  id: Id;
  number: string;
  vendorRef: string;
  vendorId: Id;
  workOrderId?: Id;
  /** Purchase order this vendor invoice is matched to (3-way match: PO vs GRN/POD vs invoice). */
  purchaseOrderId?: Id;
  billDate: IsoDate;
  dueDate: IsoDate;
  amount: number;
  vat: number;
  paid: number;
  status: BillStatus;
}

export type PaymentMethod = 'Bank transfer' | 'Cheque' | 'PDC' | 'Cash' | 'Card';

export interface Collection {
  id: Id;
  number: string;
  customerId: Id;
  date: IsoDate;
  method: PaymentMethod;
  amount: number;
  reference: string;
  chequeDate?: IsoDate;
  /** Allocated to an invoice, or held as an advance against a sales order. */
  allocations: { invoiceId?: Id; salesOrderId?: Id; amount: number }[];
  status: 'Unallocated' | 'Allocated' | 'Advance' | 'PDC pending' | 'Bounced';
}

export interface JournalEntry {
  id: Id;
  number: string;
  date: IsoDate;
  source: 'Invoice' | 'Vendor bill' | 'Collection' | 'Payment' | 'Manual' | 'Storage billing';
  reference: string;
  memo: string;
  lines: { account: string; debit: number; credit: number }[];
  status: 'Posted' | 'Reversed';
}

// ---------- Procurement & payables ----------
export type PurchaseOrderStatus = 'Draft' | 'Issued' | 'Accepted' | 'Completed' | 'Billed' | 'Cancelled';

/** Vendor purchase order, issued per vendor assignment on a job BEFORE the work starts. */
export interface PurchaseOrder {
  id: Id;
  number: string;
  vendorId: Id;
  workOrderId: Id;
  salesOrderId?: Id;
  serviceId: Id;
  description: string;
  amount: number;
  vatRate: number;
  issuedAt: IsoDateTime;
  status: PurchaseOrderStatus;
  vendorBillId?: Id;
}

/** Payment voucher: money paid to a vendor, allocated to purchase invoices (bills). */
export interface VendorPayment {
  id: Id;
  number: string;
  vendorId: Id;
  date: IsoDate;
  method: PaymentMethod;
  amount: number;
  reference: string;
  chequeDate?: IsoDate;
  allocations: { billId: Id; amount: number }[];
  status: 'Posted' | 'PDC issued' | 'Cancelled';
}

// ---------- Chart of accounts ----------
export type AccountGroup = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';

/**
 * Ledger account. Groups organise the chart; ledgers take postings. Customer and vendor
 * sub-ledgers sit under the Accounts receivable / payable control accounts and are created
 * automatically with the party. Pending accountant sign-off (Phase 8).
 */
export interface LedgerAccount {
  id: Id;
  code: string;
  name: string;
  group: AccountGroup;
  kind: 'Group' | 'Ledger';
  parentId?: Id;
  party?: { type: 'Customer' | 'Vendor'; id: Id };
  system: boolean;
  active: boolean;
}

// ---------- Cross-cutting ----------
export interface ActivityEvent {
  id: Id;
  at: IsoDateTime;
  actor: string;
  entity:
    | 'Enquiry'
    | 'Quotation'
    | 'Sales order'
    | 'Contract'
    | 'Work order'
    | 'Warehouse'
    | 'Invoice'
    | 'Collection'
    | 'Vendor bill'
    | 'Purchase order'
    | 'Payment'
    | 'Ledger';
  entityId: Id;
  entityRef: string;
  action: string;
}

export interface AppNotification {
  id: Id;
  at: IsoDateTime;
  title: string;
  body: string;
  read: boolean;
  href?: string;
}
