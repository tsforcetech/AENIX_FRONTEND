import clsx from 'clsx';
import { Info, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { staffUsers } from '@/prototype/seed';

type Tab = 'users' | 'roles' | 'company' | 'notifications';

type SampleUser = (typeof staffUsers)[number];

/** Illustrative sample users (prototype seed) — the real list comes from the Identity module (Phase 1). */
const USERS = staffUsers;

const userColumns: Column<SampleUser>[] = [
  {
    key: 'name',
    header: 'User',
    cell: (u) => (
      <div className="flex items-center gap-3">
        <Avatar name={u.name} size="sm" />
        <div>
          <p className="font-medium">{u.name}</p>
          <p className="text-caption text-fg-muted">{u.email}</p>
        </div>
      </div>
    ),
  },
  { key: 'role', header: 'Role', cell: (u) => u.role },
  {
    key: 'mfa',
    header: 'MFA',
    cell: (u) => <Badge tone={u.mfa === 'Enabled' ? 'success' : 'warning'}>{u.mfa}</Badge>,
  },
  { key: 'status', header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
];

/** Example permission codes per role × module (module.resource.action). Authoritative matrix: SEC-001. */
const ROLES = ['Operations manager', 'Sales executive', 'Accountant', 'Warehouse supervisor'];
const MATRIX: { module: string; codes: Record<string, string[]> }[] = [
  {
    module: 'Commercial',
    codes: {
      'Operations manager': ['crm.enquiry.view', 'commercial.quotation.approve'],
      'Sales executive': ['crm.enquiry.create', 'commercial.quotation.create'],
      Accountant: ['commercial.quotation.view'],
      'Warehouse supervisor': [],
    },
  },
  {
    module: 'Jobs',
    codes: {
      'Operations manager': ['jobs.workorder.create', 'jobs.workorder.assignVendor'],
      'Sales executive': ['jobs.workorder.view'],
      Accountant: ['jobs.workorder.view'],
      'Warehouse supervisor': ['jobs.workorder.view'],
    },
  },
  {
    module: 'Warehouse',
    codes: {
      'Operations manager': ['warehouse.stock.view'],
      'Sales executive': [],
      Accountant: ['warehouse.stock.view'],
      'Warehouse supervisor': ['warehouse.receipt.post', 'warehouse.stock.adjust'],
    },
  },
  {
    module: 'Billing',
    codes: {
      'Operations manager': ['billing.invoice.view'],
      'Sales executive': ['billing.invoice.view'],
      Accountant: ['billing.invoice.post', 'billing.collection.record'],
      'Warehouse supervisor': [],
    },
  },
  {
    module: 'Finance',
    codes: {
      'Operations manager': [],
      'Sales executive': [],
      Accountant: ['finance.journal.post', 'finance.journal.reverse'],
      'Warehouse supervisor': [],
    },
  },
];

const EVENTS = [
  'Quotation awaiting approval',
  'Quotation accepted by customer',
  'Work order milestone reached',
  'Invoice overdue',
  'Collection received',
  'Contract expiring',
];

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Users, roles, company profile and notification preferences."
      />
      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-xl border border-info/20 bg-info-subtle px-4 py-3 text-body-s text-fg-secondary"
      >
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          <span className="font-semibold text-fg">Illustrative until Phase 1.</span> Users, roles and
          permissions are managed by the identity service (ADR-004 / SEC-001). Nothing on this page changes
          real access.
        </p>
      </div>
      <div className="mb-6">
        <Tabs
          label="Settings sections"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: 'users', label: 'Users' },
            { value: 'roles', label: 'Roles & permissions' },
            { value: 'company', label: 'Company' },
            { value: 'notifications', label: 'Notifications' },
          ]}
        />
      </div>
      {tab === 'users' ? (
        <Card>
          <CardHeader
            title="Users"
            description={`${USERS.length} staff accounts · sample`}
            actions={
              <span title="Phase 1 — identity service">
                <Button disabled icon={<UserPlus aria-hidden="true" />} aria-describedby="invite-hint">
                  Invite user
                </Button>
                <span id="invite-hint" className="sr-only">
                  Available in Phase 1 with the identity service
                </span>
              </span>
            }
          />
          <div className="mt-3">
            <DataTable caption="Users" columns={userColumns} rows={USERS} rowKey={(u) => u.id} />
          </div>
        </Card>
      ) : null}
      {tab === 'roles' ? <RolesMatrix /> : null}
      {tab === 'company' ? (
        <Card>
          <CardHeader
            title="Company profile"
            description="Placeholder values — confirmed during onboarding"
          />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Legal name', value: 'AENIX (legal entity name pending)' },
                { label: 'VAT TRN', value: <span className="font-mono">1000•••••••••42</span> },
                { label: 'Base currency', value: 'AED — UAE dirham' },
                { label: 'Time zone', value: 'Asia/Dubai (UTC+4)' },
                { label: 'VAT rate', value: '5% standard' },
                { label: 'Financial year', value: 'January – December' },
                { label: 'Warehouse', value: 'JAFZA WH-1' },
                { label: 'Language', value: 'English' },
                { label: 'Address', value: 'To be confirmed' },
              ]}
            />
          </CardBody>
        </Card>
      ) : null}
      {tab === 'notifications' ? <NotificationPrefs /> : null}
    </div>
  );
}

function RolesMatrix() {
  return (
    <Card>
      <CardHeader
        title="Roles & permissions"
        description="Example module.resource.action codes per role"
        actions={<Badge tone="warning">Pending SEC-001</Badge>}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-body-s">
          <caption className="sr-only">Role permission matrix (read-only, pending SEC-001)</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-canvas/60">
              <th
                scope="col"
                className="px-4 py-2.5 pl-5 text-caption font-medium uppercase tracking-wide text-fg-muted"
              >
                Module
              </th>
              {ROLES.map((r) => (
                <th
                  key={r}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2.5 text-caption font-medium uppercase tracking-wide text-fg-muted"
                >
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.module} className="border-b border-border-subtle align-top last:border-0">
                <th scope="row" className="px-4 py-3 pl-5 font-medium">
                  {m.module}
                </th>
                {ROLES.map((r) => (
                  <td key={r} className="px-4 py-3">
                    {m.codes[r]?.length ? (
                      <ul className="space-y-1">
                        {m.codes[r]!.map((c) => (
                          <li key={c} className="font-mono text-[12px] text-fg-secondary">
                            {c}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-fg-muted">No access</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand' : 'bg-border',
      )}
    >
      <span
        className={clsx(
          'inline-block size-5 rounded-full bg-surface shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Record<string, { email: boolean; inApp: boolean }>>(() =>
    Object.fromEntries(EVENTS.map((e, i) => [e, { email: i % 2 === 0, inApp: true }])),
  );
  const set = (event: string, channel: 'email' | 'inApp', v: boolean) =>
    setPrefs((p) => ({ ...p, [event]: { ...p[event]!, [channel]: v } }));
  return (
    <Card>
      <CardHeader
        title="Notification preferences"
        description="UI preview only — delivery (SMTP / in-app) is handled by the backend worker"
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-body-s">
          <caption className="sr-only">Notification preferences</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-canvas/60">
              <th
                scope="col"
                className="px-4 py-2.5 pl-5 text-caption font-medium uppercase tracking-wide text-fg-muted"
              >
                Event
              </th>
              <th
                scope="col"
                className="px-4 py-2.5 text-caption font-medium uppercase tracking-wide text-fg-muted"
              >
                Email
              </th>
              <th
                scope="col"
                className="px-4 py-2.5 pr-5 text-caption font-medium uppercase tracking-wide text-fg-muted"
              >
                In-app
              </th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e) => (
              <tr key={e} className="border-b border-border-subtle last:border-0">
                <th scope="row" className="px-4 py-3 pl-5 font-medium">
                  {e}
                </th>
                <td className="px-4 py-3">
                  <Toggle
                    checked={prefs[e]!.email}
                    onChange={(v) => set(e, 'email', v)}
                    label={`${e} by email`}
                  />
                </td>
                <td className="px-4 py-3 pr-5">
                  <Toggle
                    checked={prefs[e]!.inApp}
                    onChange={(v) => set(e, 'inApp', v)}
                    label={`${e} in-app`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
