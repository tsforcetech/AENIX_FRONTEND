import type { SessionPrincipal } from '@/shared/auth/session';
import { hasPermission, type PermissionCode } from './permissions';

/**
 * FLOW-003 X1 — PROPOSED role × module permission map (UX only).
 * Not approved: the authoritative list comes with SEC-001 and is enforced by Aenix.Api.
 * The UI uses this map only to show or hide buttons; it never authorizes anything.
 */
export const PROPOSED_ROLES = [
  'Sales',
  'Operations',
  'Warehouse',
  'Finance',
  'Manager / Admin',
  'Customer portal',
  'Vendor portal',
] as const;
export type ProposedRole = (typeof PROPOSED_ROLES)[number];

export const PERMISSION_ACTIONS = ['view', 'create', 'approve', 'post'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Modules shown in the matrix; `code` is the `module.resource` part of the permission code. */
export const PERMISSION_MODULES = [
  { code: 'crm.enquiry', label: 'Enquiries & customers' },
  { code: 'commercial.quotation', label: 'Quotations, contracts & sales orders' },
  { code: 'jobs.workorder', label: 'Jobs (work orders)' },
  { code: 'warehouse.stock', label: 'Warehouse & stock' },
  { code: 'transport.fleet', label: 'Transport & own fleet' },
  { code: 'procurement.purchaseorder', label: 'Purchase orders & vendor invoices' },
  { code: 'billing.invoice', label: 'Invoices & receipts' },
  { code: 'payables.payment', label: 'Vendor payments' },
  { code: 'finance.journal', label: 'Accounting & period close' },
  { code: 'reports.report', label: 'Reports' },
  { code: 'admin.settings', label: 'Settings, approvals & audit' },
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number]['code'];

const codes = (module: PermissionModule, actions: readonly PermissionAction[]): PermissionCode[] =>
  actions.map((a): PermissionCode => `${module}.${a}`);

/**
 * Proposal per role. Portal roles act on their OWN records only — the party scope is bound
 * server-side to the signed-in account, never taken from the screen.
 */
export const ROLE_PERMISSIONS: Record<ProposedRole, readonly string[]> = {
  Sales: [
    ...codes('crm.enquiry', ['view', 'create']),
    ...codes('commercial.quotation', ['view', 'create']),
    ...codes('jobs.workorder', ['view']),
    ...codes('billing.invoice', ['view']),
    ...codes('reports.report', ['view']),
  ],
  Operations: [
    ...codes('crm.enquiry', ['view']),
    ...codes('commercial.quotation', ['view']),
    ...codes('jobs.workorder', ['view', 'create', 'approve']),
    ...codes('warehouse.stock', ['view']),
    ...codes('transport.fleet', ['view', 'create']),
    ...codes('procurement.purchaseorder', ['view', 'create']),
    ...codes('reports.report', ['view']),
  ],
  Warehouse: [
    ...codes('jobs.workorder', ['view']),
    ...codes('warehouse.stock', ['view', 'create', 'post']),
    ...codes('reports.report', ['view']),
  ],
  Finance: [
    ...codes('crm.enquiry', ['view']),
    ...codes('commercial.quotation', ['view']),
    ...codes('jobs.workorder', ['view']),
    ...codes('warehouse.stock', ['view']),
    ...codes('procurement.purchaseorder', ['view', 'approve', 'post']),
    ...codes('billing.invoice', ['view', 'create', 'post']),
    ...codes('payables.payment', ['view', 'create', 'post']),
    ...codes('finance.journal', ['view', 'create', 'post']),
    ...codes('reports.report', ['view']),
  ],
  'Manager / Admin': ['*'],
  'Customer portal': [
    ...codes('commercial.quotation', ['view', 'approve']),
    ...codes('jobs.workorder', ['view']),
    ...codes('warehouse.stock', ['view', 'create']),
    ...codes('billing.invoice', ['view']),
  ],
  'Vendor portal': [
    ...codes('jobs.workorder', ['view', 'create']),
    ...codes('procurement.purchaseorder', ['view', 'approve']),
    ...codes('payables.payment', ['view']),
  ],
};

/** What a portal role's actions mean in the matrix (shown as a footnote). */
export const PORTAL_NOTES: Partial<Record<ProposedRole, string>> = {
  'Customer portal':
    'Own records only: accept or reject quotations, upload packing lists, see own jobs, stock and invoices.',
  'Vendor portal':
    'Own records only: accept purchase orders, update milestones and PODs on assigned jobs, see own bills and payments.',
};

function principalFor(role: ProposedRole): SessionPrincipal {
  return {
    userId: 'proposal',
    displayName: role,
    email: 'proposal@example.invalid',
    role,
    actorType: role === 'Customer portal' ? 'customer' : role === 'Vendor portal' ? 'vendor' : 'staff',
    permissions: ROLE_PERMISSIONS[role],
    prototype: true,
  };
}

/** Does the PROPOSED map give `role` this action on `module`? Same matching as `hasPermission`. */
export function roleCan(role: ProposedRole, module: PermissionModule, action: PermissionAction): boolean {
  return hasPermission(principalFor(role), `${module}.${action}`);
}
