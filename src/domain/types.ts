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
  /** Postal address line printed on invoices, e.g. "P.O. Box 31076, Sharjah, United Arab Emirates". */
  postalAddress?: string;
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
  /** FLOW-003 S5/A9: cost paid on the customer's behalf (duty, port fees) and rebilled at cost — not revenue. */
  isDisbursement?: boolean;
  /** FLOW-003 T8: standard surcharge (waiting, demurrage, extra stop, after-hours) that needs customer approval. */
  isSurcharge?: boolean;
  /** FLOW-003 S6/W13: minimum charge per order line in AED (0 / undefined = none). */
  minimumCharge?: number;
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
  /** FLOW-003 C1: next follow-up date; overdue follow-ups are listed. */
  nextFollowUp?: IsoDate;
  lostReason?: string;
}

export interface PriceLine {
  id: Id;
  serviceId: Id;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitCost: number;
  /** FLOW-003 T8: surcharge line accepted by the customer (required before invoicing a surcharge). */
  customerApproved?: boolean;
  /** FLOW-003 S6: minimum charge applied when quantity × price is lower. */
  minimumCharge?: number;
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
  /** FLOW-003 C10: document currency (default AED) and rate to AED. */
  currency?: Currency;
  exchangeRate?: number;
  /** FLOW-003 C2/X2: approval recorded by the approval matrix. */
  approval?: ApprovalRecord;
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
  /** FLOW-003 C4: customer's confirmation document (signed quote / PO), required on confirm. */
  confirmationAttachment?: Attachment;
  /** FLOW-003 C5: credit-limit / on-hold override recorded on confirmation. */
  creditOverride?: ApprovalRecord;
  /** FLOW-003 C8: version increases on every change after confirmation. */
  version?: number;
  revisions?: Revision[];
  /** FLOW-003 C9: cancellation reason (required) and optional cancellation fee. */
  cancelReason?: string;
  cancellationFee?: number;
  /** FLOW-003 C10 */
  currency?: Currency;
  exchangeRate?: number;
  // FLOW-003 WP-A
  /** C8: change requested after confirmation, waiting for the 'Sales order change' approval. */
  pendingAmendment?: {
    lines: PriceLine[];
    notes: string;
    note: string;
    /** Change in order value (AED, excl. VAT): new − old. */
    valueChange: number;
    approval: ApprovalRecord;
  };
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
  /** FLOW-003 C6: surcharge clause (fuel %) applied to transport lines. */
  fuelSurchargePct?: number;
  /** FLOW-003 W13: storage terms. */
  minimumMonthlyStorage?: number;
  storageFreeDays?: number;
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
  /**
   * Warehouse inbound receipts. Goods are stored over time, so a job can have MANY inbounds,
   * each with its own product list (PL / ASN) and the GRN the warehouse returns.
   */
  inbounds: Inbound[];
  /** Customer out-bond / release requests (MANY over time), each closed by a vendor or warehouse POD. */
  customerRequests: CustomerRequest[];
  /** Purchase invoices (vendor bills) drafted when the job is completed. */
  purchaseInvoiceIds?: Id[];
  completedAt?: IsoDateTime;
  createdAt: IsoDateTime;
  eta: IsoDate;
  owner: string;
  /** FLOW-003 T4: multi-leg / multi-drop stops, each closed by its own POD. */
  stops?: JobStop[];
  /** FLOW-003 T3: transport / customs documents received per checklist item. */
  documents?: JobDocument[];
  /** FLOW-003 S4: cost of own staff / own resources charged to the job (no PO). */
  internalCosts?: InternalCost[];
  /** FLOW-003 S3: service completion notes (proof for services without GRN/POD). */
  completionNotes?: ServiceCompletionNote[];
  /** FLOW-003 C9 */
  cancelReason?: string;
}

// ---------- Job documents: PL → GRN, customer request → POD ----------
export interface DocLine {
  sku: string;
  description: string;
  quantity: number;
  uom: string;
  /** Optional detail carried on warehouse documents (vendor GRN / customer GRN / ASN). */
  barcode?: string;
  batch?: string;
  productionDate?: IsoDate;
  expiryDate?: IsoDate;
  /** Volume of the line in cubic metres (item cube × quantity). */
  cbm?: number;
}

/** Uploaded document metadata (the file itself is stored by the backend; prototype keeps the name only). */
export interface Attachment {
  fileName: string;
  sizeKb: number;
  uploadedAt: IsoDateTime;
  uploadedBy: string;
}

/** Product list (PL / ASN) sent to the warehouse team so they know what to expect. */
export interface PackingList {
  number: string;
  status: 'Draft' | 'Sent to warehouse';
  sentAt?: IsoDateTime;
  lines: DocLine[];
  /** Original file (e.g. the customer's Excel) when the lines were imported. */
  attachment?: Attachment;
  source?: 'Staff' | 'Customer portal' | 'Excel import';
}

/** One inbound receipt: a consignment arriving at the warehouse (PL → GRN → check). */
export interface Inbound {
  id: Id;
  number: string;
  /** Customer reference: ASN, container, AWB or truck number. */
  reference: string;
  expectedAt: IsoDate;
  /** Shipment header as on the vendor's Received Goods Report. */
  asnNo?: string;
  boeNo?: string;
  containerNo?: string;
  sealNo?: string;
  blNo?: string;
  supplierName?: string;
  /** Warehouse location, e.g. "Dubai Industrial City". */
  location?: string;
  packingList: PackingList;
  grn?: Grn;
  /** FLOW-003 W12: customer return (received into quarantine until inspected). */
  kind?: 'Receipt' | 'Return';
  /** FLOW-003 W1: planned arrival time for dock planning. */
  expectedTime?: string;
  /** FLOW-003 W4: put-away confirmed (stock lots created at bin locations). */
  putawayDone?: boolean;
}

/** Goods received note returned by the warehouse team and uploaded against the job. */
export interface Grn {
  number: string;
  receivedAt: IsoDateTime;
  attachment?: Attachment;
  lines: {
    sku: string;
    receivedQty: number;
    damagedQty: number;
    remarks?: string;
    batch?: string;
    productionDate?: IsoDate;
    expiryDate?: IsoDate;
    cbm?: number;
  }[];
  status: 'Uploaded' | 'Verified' | 'Variance raised';
  /** Vendor warehouse receiving times (as on the vendor's Received Goods Report). */
  receivingStart?: IsoDateTime;
  receivingEnd?: IsoDateTime;
  /** Customer-facing GRN issued by Aenix from this receipt (e.g. AEN061 layout). */
  customerGrnNumber?: string;
  customerGrnIssuedAt?: IsoDateTime;
}

/** Proof of delivery returned by the vendor / warehouse for a customer request. */
export interface Pod {
  number: string;
  vendorId?: Id;
  deliveredAt: IsoDateTime;
  receivedBy: string;
  attachment?: Attachment;
  lines: { sku: string; deliveredQty: number; remarks?: string }[];
  /** FLOW-003 T5: receiver's designation / phone and exception remarks written on the POD. */
  receiverContact?: string;
  exceptions?: string;
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
  /** FLOW-003 W6/W7: pick list (FEFO-suggested lots) and dispatch note. */
  picks?: {
    lotId: Id;
    sku: string;
    batch?: string;
    expiryDate?: IsoDate;
    locationCode: string;
    qty: number;
  }[];
  pickedAt?: IsoDateTime;
  dispatchNoteNumber?: string;
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
  /** FLOW-003 W4/W5: bin location, batch / expiry and stock status (lot-level stock). */
  locationId?: Id;
  batch?: string;
  expiryDate?: IsoDate;
  stockStatus?: 'Available' | 'Quarantine' | 'Damaged';
  workOrderId?: Id;
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

/** How storage is charged: area per period (dry storage by sq.ft), pallet-days or CBM-days. */
export type StorageBasis = 'Sq.ft per period' | 'Pallet-day' | 'CBM-day';

export interface StorageBillingRun {
  id: Id;
  number: string;
  customerId: Id;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  /** Charging basis; defaults to Pallet-day for older runs. */
  basis?: StorageBasis;
  /** Quantity in basis units (sq.ft, pallet-days or CBM-days). Name kept for compatibility. */
  palletDays: number;
  /** Rate per basis unit. Name kept for compatibility. */
  ratePerPalletDay: number;
  status: 'Draft' | 'Invoiced';
  invoiceId?: Id;
  /** FLOW-003 W13: minimum monthly charge applied when the computed amount is lower. */
  minimumCharge?: number;
  freeDays?: number;
}

// ---------- Finance ----------
export type InvoiceStatus = 'Draft' | 'Posted' | 'Partially paid' | 'Paid' | 'Overdue' | 'Cancelled';

export interface InvoiceLine {
  id: Id;
  /** Unit of measure shown on the tax invoice (e.g. Sq.ft, Hour, Truck). */
  uom?: string;
  /** Sales order this line bills (one invoice can cover several sales orders of the same customer). */
  salesOrderId?: Id;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 0.05 standard UAE VAT
  /** FLOW-003 A9: disbursement (cost rebilled for the customer) — posted to 1250 Disbursements recoverable, not revenue. */
  isDisbursement?: boolean;
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
  /** FLOW-003 C10: invoice currency (default AED) and rate to AED; balances are kept in AED. */
  currency?: Currency;
  exchangeRate?: number;
  /** FLOW-003 A16: amount written off as bad debt (with approval). */
  writtenOff?: number;
  writeOff?: ApprovalRecord;
  /** FLOW-003 A6: payment reminders sent. */
  reminders?: { level: 1 | 2 | 3; at: IsoDateTime; channel: 'Email' | 'WhatsApp' | 'Letter' }[];
  /** FLOW-003 X5 */
  emirate?: Emirate;
  // FLOW-003 WP-D: credit notes are settled into `paid` (like write-offs); this keeps the credited part
  // (incl. VAT, invoice currency) so balances can tell cash received from credits.
  credited?: number;
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
  /** FLOW-003 A10: debit notes raised against this bill. */
  debitNoteIds?: Id[];
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
  /** FLOW-003 A5: PDC register — drawee bank, cleared / bounced dates, bounce charge. */
  chequeNo?: string;
  bankName?: string;
  pdcStatus?: PdcStatus;
  clearedAt?: IsoDate;
  bouncedAt?: IsoDate;
  bounceReason?: string;
  bounceCharge?: number;
  /** FLOW-003 A13 */
  reconciledAt?: IsoDate;
}

export interface JournalEntry {
  id: Id;
  number: string;
  date: IsoDate;
  source:
    | 'Invoice'
    | 'Vendor bill'
    | 'Collection'
    | 'Payment'
    | 'Manual'
    | 'Storage billing'
    | 'Accrual'
    | 'Credit note'
    | 'Debit note'
    | 'Write-off'
    | 'Expense'
    | 'Trip'
    | 'Stock adjustment';
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
  status: 'Posted' | 'PDC issued' | 'Cancelled' | 'Pending approval';
  /** FLOW-003 A11: payment approval before release. */
  approval?: ApprovalRecord;
  chequeNo?: string;
  pdcStatus?: PdcStatus;
  reconciledAt?: IsoDate;
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
    | 'Ledger'
    | 'Variance'
    | 'Fleet'
    | 'Trip'
    | 'Approval'
    | 'Settings'
    | 'Expense';
  entityId: Id;
  entityRef: string;
  action: string;
  /** FLOW-003 X3: audit detail — field changes (old → new). */
  changes?: { field: string; from: string; to: string }[];
}

export interface AppNotification {
  id: Id;
  at: IsoDateTime;
  title: string;
  body: string;
  read: boolean;
  href?: string;
}

// ---------- Company profile (document header / footer) ----------
export interface CompanyProfile {
  legalName: string;
  tagline: string;
  website: string;
  trn: string;
  /** Office address printed on tax invoices. */
  officeAddress: string[];
  /** Registered address (used on warehouse documents such as GRNs). */
  registeredAddress: string[];
  phone: string;
  email: string;
  licenseNo: string;
  bank: { bankName: string; accountName: string; accountNumber: string; iban: string; swift: string };
  invoicePrefix: string;
  grnPrefix: string;
  /** FLOW-003 X4: restart document numbers every calendar year (e.g. AEN-2027-001). */
  numberingResetYearly?: boolean;
  /** FLOW-003 A14: accounting periods up to and including this date are locked. */
  lockedUntil?: IsoDate;
  /** FLOW-003 scope switches (owner decisions): optional modules. */
  modules?: { ownFleet: boolean; ownWarehouseFloor: boolean; multiCurrency: boolean };
  /** FLOW-003 X7: notification channels per event. */
  notificationChannels?: Record<string, { email: boolean; whatsapp: boolean; inApp: boolean }>;
}

// ===================== FLOW-003 (industry-standard gap closure) =====================
export type Currency = 'AED' | 'USD' | 'EUR' | 'SAR';
export type Emirate =
  'Abu Dhabi' | 'Dubai' | 'Sharjah' | 'Ajman' | 'Umm Al Quwain' | 'Ras Al Khaimah' | 'Fujairah';
export type PdcStatus = 'Pending' | 'Deposited' | 'Cleared' | 'Bounced';

/** Who approved / overrode what, when and why (X2 approval matrix, C5 credit override). */
export interface ApprovalRecord {
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedBy: string;
  requestedAt: IsoDateTime;
  approverRole: string;
  decidedBy?: string;
  decidedAt?: IsoDateTime;
  reason?: string;
}

/** C8: change history of a document after confirmation. */
export interface Revision {
  version: number;
  at: IsoDateTime;
  by: string;
  note: string;
}

/** X2: approval matrix row — documents of this type above the threshold need this role's approval. */
export type ApprovalDocType =
  | 'Quotation discount %'
  | 'Quotation margin % below'
  | 'Credit override'
  | 'Sales order change'
  | 'Purchase order'
  | 'Vendor invoice variance'
  | 'Payment voucher'
  | 'Stock adjustment (qty)'
  | 'Variance outcome'
  | 'Write-off'
  | 'Credit note'
  | 'Expense';

export interface ApprovalRule {
  id: Id;
  docType: ApprovalDocType;
  /** Amount in AED, % or quantity depending on docType. 0 = always. */
  threshold: number;
  approverRole: 'Operations manager' | 'Sales manager' | 'Finance manager' | 'General manager';
  active: boolean;
}

/** Item waiting in the approvals inbox (X2). */
export interface ApprovalRequest {
  id: Id;
  docType: ApprovalDocType;
  entity: ActivityEvent['entity'];
  entityId: Id;
  entityRef: string;
  summary: string;
  amount?: number;
  record: ApprovalRecord;
  href?: string;
}

// ---------- T3: document checklist per job ----------
export interface JobDocument {
  id: Id;
  /** e.g. "Bill of lading", "Delivery order", "BOE", "CMR / waybill", "Airway bill", "Commercial invoice". */
  name: string;
  required: boolean;
  number?: string;
  attachment?: Attachment;
  receivedAt?: IsoDateTime;
}

// ---------- T4: stops ----------
export interface JobStop {
  id: Id;
  seq: number;
  type: 'Pickup' | 'Delivery';
  address: string;
  contact?: string;
  plannedAt: IsoDateTime;
  actualAt?: IsoDateTime;
  status: 'Planned' | 'Arrived' | 'Done' | 'Failed';
  pod?: { receivedBy: string; at: IsoDateTime; exceptions?: string; attachment?: Attachment };
}

// ---------- S4 / S3 ----------
export interface InternalCost {
  id: Id;
  date: IsoDate;
  kind: 'Labour' | 'Own vehicle (trip)' | 'Equipment' | 'Material' | 'Other';
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  /** Trip that produced the cost (own fleet). */
  tripId?: Id;
}

export interface ServiceCompletionNote {
  id: Id;
  number: string;
  serviceId: Id;
  vendorId?: Id;
  purchaseOrderId?: Id;
  date: IsoDate;
  quantity: number;
  unit: string;
  description: string;
  customerSignedBy?: string;
  attachment?: Attachment;
  status: 'Draft' | 'Signed';
}

// ---------- W3 / A10: variances and debit notes ----------
export type VarianceOutcome =
  'Accept as is' | 'Customer claim' | 'Vendor debit note' | 'Carrier / insurer claim' | 'Write-off';

export interface Variance {
  id: Id;
  number: string;
  workOrderId: Id;
  customerId: Id;
  vendorId?: Id;
  source: 'GRN' | 'POD' | 'Cycle count';
  sourceRef: string;
  raisedAt: IsoDateTime;
  lines: { sku: string; expected: number; actual: number; damaged: number; remarks?: string }[];
  photos: Attachment[];
  outcome?: VarianceOutcome;
  /** Value of the shortage / damage in AED (for the debit note / claim). */
  value?: number;
  approval?: ApprovalRecord;
  debitNoteId?: Id;
  creditNoteInvoiceId?: Id;
  status: 'Open' | 'Pending approval' | 'Resolved';
}

export interface DebitNote {
  id: Id;
  number: string;
  vendorId: Id;
  vendorBillId?: Id;
  purchaseOrderId?: Id;
  varianceId?: Id;
  date: IsoDate;
  reason: string;
  amount: number;
  vatRate: number;
  status: 'Draft' | 'Posted' | 'Adjusted';
}

/** Customer credit note (A2 existing UI, now a stored document). */
export interface CreditNote {
  id: Id;
  number: string;
  customerId: Id;
  invoiceId: Id;
  varianceId?: Id;
  date: IsoDate;
  reason: string;
  amount: number;
  vatRate: number;
  status: 'Posted';
}

// ---------- W4–W8: warehouse floor (optional module: own warehouse floor) ----------
export interface WarehouseLocation {
  id: Id;
  warehouse: string;
  code: string; // e.g. A-01-02 (aisle-rack-level)
  zone: 'Ambient' | 'Chilled' | 'Bulk floor' | 'Quarantine' | 'Dispatch';
  capacityPallets: number;
  active: boolean;
}

export interface CycleCount {
  id: Id;
  number: string;
  warehouse: string;
  customerId?: Id;
  zone?: WarehouseLocation['zone'];
  date: IsoDate;
  lines: { stockItemId: Id; sku: string; locationCode: string; systemQty: number; countedQty?: number }[];
  status: 'Open' | 'Counted' | 'Pending approval' | 'Posted';
  approval?: ApprovalRecord;
  countedBy?: string;
}

// ---------- T6 / T7: own fleet (optional module) ----------
export interface Vehicle {
  id: Id;
  plate: string;
  type: '3-ton truck' | '7-ton truck' | '10-ton truck' | 'Trailer (40ft)' | 'Pickup' | 'Forklift';
  capacityKg: number;
  registrationExpiry: IsoDate;
  insuranceExpiry: IsoDate;
  status: 'Available' | 'On trip' | 'Maintenance' | 'Inactive';
  odometerKm: number;
}

export interface Driver {
  id: Id;
  name: string;
  licenceNo: string;
  licenceExpiry: IsoDate;
  phone: string;
  status: 'Available' | 'On trip' | 'Off duty';
}

export type TripExpenseType =
  'Fuel' | 'Salik / tolls' | 'Driver allowance' | 'Parking' | 'Maintenance' | 'Other';

export interface Trip {
  id: Id;
  number: string;
  workOrderId: Id;
  vehicleId: Id;
  driverId: Id;
  date: IsoDate;
  startKm?: number;
  endKm?: number;
  expenses: { id: Id; type: TripExpenseType; amount: number; reference?: string }[];
  status: 'Planned' | 'Started' | 'Completed' | 'Cancelled';
}

// ---------- A7 / A13 / A18 ----------
export interface AccrualRun {
  id: Id;
  number: string;
  periodEnd: IsoDate;
  lines: {
    kind: 'Unbilled revenue' | 'Accrued cost';
    workOrderId?: Id;
    purchaseOrderId?: Id;
    reference: string;
    amount: number;
  }[];
  status: 'Draft' | 'Posted' | 'Reversed';
  journalId?: Id;
  reversalJournalId?: Id;
}

export interface BankStatementLine {
  id: Id;
  bankAccount: string;
  date: IsoDate;
  description: string;
  reference: string;
  /** + money in, − money out. */
  amount: number;
  matched?: { kind: 'Receipt' | 'Payment' | 'Expense' | 'Bank charge'; id?: Id; ref: string };
}

export interface Expense {
  id: Id;
  number: string;
  date: IsoDate;
  /** Ledger account (rent, salaries, utilities, petty cash expense…). */
  accountId: Id;
  description: string;
  amount: number;
  vatRate: number;
  paidFrom: 'Bank' | 'Petty cash' | 'Credit card';
  payee: string;
  reference?: string;
  approval?: ApprovalRecord;
  status: 'Draft' | 'Pending approval' | 'Posted';
}
