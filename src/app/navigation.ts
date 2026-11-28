import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  FileSignature,
  FileText,
  Handshake,
  Home,
  Landmark,
  MessageSquareText,
  Receipt,
  Settings,
  ShoppingBag,
  Banknote,
  ShoppingCart,
  Tags,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
  CarFront,
  CheckCheck,
  CreditCard,
  History,
  TriangleAlert,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Phase in DEVELOPMENT-STAGES that delivers the real (API-backed) module. */
  phase: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const staffNavigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Home', to: '/home', icon: Home, phase: 10 },
      { label: 'Approvals', to: '/approvals', icon: CheckCheck, phase: 10 },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Enquiries', to: '/enquiries', icon: MessageSquareText, phase: 3 },
      { label: 'Quotations', to: '/quotations', icon: FileText, phase: 3 },
      { label: 'Sales orders', to: '/sales-orders', icon: ShoppingCart, phase: 3 },
      { label: 'Contracts', to: '/contracts', icon: FileSignature, phase: 3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Jobs (work orders)', to: '/work-orders', icon: Truck, phase: 4 },
      { label: 'Purchase orders', to: '/purchase-orders', icon: ShoppingBag, phase: 4 },
      { label: 'Fleet and trips', to: '/fleet', icon: CarFront, phase: 4 },
    ],
  },
  {
    label: 'Warehouse',
    items: [
      { label: 'Stock and inbounds', to: '/warehouse', icon: Warehouse, phase: 5 },
      { label: 'Variances and claims', to: '/variances', icon: TriangleAlert, phase: 5 },
      { label: 'Storage billing', to: '/storage-billing', icon: Boxes, phase: 6 },
    ],
  },
  {
    label: 'Receivables',
    items: [
      { label: 'Invoices', to: '/invoices', icon: Receipt, phase: 7 },
      { label: 'Receipts and PDC', to: '/collections', icon: Wallet, phase: 7 },
    ],
  },
  {
    label: 'Payables',
    items: [
      { label: 'Purchase invoices', to: '/vendor-bills', icon: ClipboardList, phase: 7 },
      { label: 'Payments', to: '/payments', icon: Banknote, phase: 7 },
      { label: 'Expenses', to: '/expenses', icon: CreditCard, phase: 8 },
    ],
  },
  {
    label: 'Accounts',
    items: [{ label: 'Accounting', to: '/accounting', icon: Landmark, phase: 8 }],
  },
  {
    label: 'Masters',
    items: [
      { label: 'Customers', to: '/customers', icon: Building2, phase: 2 },
      { label: 'Vendors', to: '/vendors', icon: Handshake, phase: 2 },
      { label: 'Services & rates', to: '/services', icon: Tags, phase: 2 },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', to: '/reports', icon: BarChart3, phase: 10 },
      { label: 'Audit log', to: '/audit', icon: History, phase: 10 },
    ],
  },
];

export const settingsNav: NavItem = { label: 'Settings', to: '/settings', icon: Settings, phase: 1 };

export const customerPortalNavigation: NavGroup[] = [
  {
    label: 'Customer portal',
    items: [
      { label: 'Overview', to: '/portal', icon: Home, phase: 9 },
      { label: 'Approvals', to: '/portal/approvals', icon: FileText, phase: 9 },
      { label: 'Invoices & statement', to: '/portal/invoices', icon: Receipt, phase: 9 },
    ],
  },
];

export const vendorPortalNavigation: NavGroup[] = [
  {
    label: 'Vendor portal',
    items: [
      { label: 'Overview', to: '/vendor-portal', icon: Home, phase: 9 },
      { label: 'Assignments', to: '/vendor-portal/assignments', icon: Truck, phase: 9 },
      { label: 'Bills & payments', to: '/vendor-portal/bills', icon: ClipboardList, phase: 9 },
    ],
  },
];
