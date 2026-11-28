/**
 * Production stand-in for `seed.ts` (wired by the Vite alias in vite.config.ts for every mode
 * except `development` and `prototype`). Guarantees no sample data reaches a production bundle.
 */
import type * as Seed from './seed';

export const PROTO_TODAY: typeof Seed.PROTO_TODAY = '1970-01-01';
export const customers: typeof Seed.customers = [];
export const vendors: typeof Seed.vendors = [];
export const services: typeof Seed.services = [];
export const vendorRates: typeof Seed.vendorRates = [];
export const enquiries: typeof Seed.enquiries = [];
export const quotations: typeof Seed.quotations = [];
export const salesOrders: typeof Seed.salesOrders = [];
export const purchaseOrders: typeof Seed.purchaseOrders = [];
export const vendorPayments: typeof Seed.vendorPayments = [];
export const ledgerAccounts: typeof Seed.ledgerAccounts = [];
export const contracts: typeof Seed.contracts = [];
export const workOrders: typeof Seed.workOrders = [];
export const stockItems: typeof Seed.stockItems = [];
export const stockMovements: typeof Seed.stockMovements = [];
export const storageRuns: typeof Seed.storageRuns = [];
export const invoices: typeof Seed.invoices = [];
export const vendorBills: typeof Seed.vendorBills = [];
export const collections: typeof Seed.collections = [];
export const journals: typeof Seed.journals = [];
export const activity: typeof Seed.activity = [];
export const notifications: typeof Seed.notifications = [];
export const monthlyRevenue: typeof Seed.monthlyRevenue = [];
export const staffUsers: typeof Seed.staffUsers = [];
export const prototypeLoginHint: typeof Seed.prototypeLoginHint = '';
export const company: typeof Seed.company = {
  legalName: '',
  tagline: '',
  website: '',
  trn: '',
  officeAddress: [],
  registeredAddress: [],
  phone: '',
  email: '',
  licenseNo: '',
  bank: { bankName: '', accountName: '', accountNumber: '', iban: '', swift: '' },
  invoicePrefix: 'AEN',
  grnPrefix: 'GRN',
  modules: { ownFleet: false, ownWarehouseFloor: false, multiCurrency: false },
};
export const approvalRules: typeof Seed.approvalRules = [];
export const approvalRequests: typeof Seed.approvalRequests = [];
export const variances: typeof Seed.variances = [];
export const debitNotes: typeof Seed.debitNotes = [];
export const creditNotes: typeof Seed.creditNotes = [];
export const cycleCounts: typeof Seed.cycleCounts = [];
export const accrualRuns: typeof Seed.accrualRuns = [];
export const warehouseLocations: typeof Seed.warehouseLocations = [];
export const vehicles: typeof Seed.vehicles = [];
export const drivers: typeof Seed.drivers = [];
export const trips: typeof Seed.trips = [];
export const bankStatementLines: typeof Seed.bankStatementLines = [];
export const expenses: typeof Seed.expenses = [];
export const fixedAssets: typeof Seed.fixedAssets = [];
export const depreciationRuns: typeof Seed.depreciationRuns = [];
export const warehouses: typeof Seed.warehouses = [];
