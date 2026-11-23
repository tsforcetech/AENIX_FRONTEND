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
  ShoppingCart,
  Tags,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
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
  { label: 'Overview', items: [{ label: 'Home', to: '/home', icon: Home, phase: 10 }] },
  {
    label: 'Commercial',
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
      { label: 'Work orders', to: '/work-orders', icon: Truck, phase: 4 },
      { label: 'Warehouse', to: '/warehouse', icon: Warehouse, phase: 5 },
      { label: 'Storage billing', to: '/storage-billing', icon: Boxes, phase: 6 },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', to: '/invoices', icon: Receipt, phase: 7 },
      { label: 'Purchase invoices', to: '/vendor-bills', icon: ClipboardList, phase: 7 },
      { label: 'Collections', to: '/collections', icon: Wallet, phase: 7 },
      { label: 'Accounting', to: '/accounting', icon: Landmark, phase: 8 },
    ],
  },
  {
    label: 'Masters',
    items: [
      { label: 'Customers', to: '/customers', icon: Building2, phase: 2 },
      { label: 'Vendors', to: '/vendors', icon: Handshake, phase: 2 },
      { label: 'Services & rates', to: '/services', icon: Tags, phase: 2 },
    ],
  },
  { label: 'Insights', items: [{ label: 'Reports', to: '/reports', icon: BarChart3, phase: 10 }] },
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
