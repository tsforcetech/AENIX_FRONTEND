import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Info, Lock, Plus, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { ApprovalDocType, ApprovalRule, CompanyProfile } from '@/domain/types';
import { staffUsers } from '@/prototype/seed';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  PORTAL_NOTES,
  PROPOSED_ROLES,
  roleCan,
} from '@/shared/permissions/roles';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { inputClasses, TextareaField, TextField } from '@/shared/ui/Field';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { formatDate } from '@/shared/utils/format';
import { APPROVAL_DOC_TYPES, APPROVER_ROLES } from '@/features/approvals/inbox';
import {
  useSaveApprovalRules,
  useSaveCompanyProfile,
  useSaveSystemSettings,
  useSettings,
  type SettingsData,
} from './api';
import {
  CHANNEL_LABELS,
  describeRule,
  MODULE_LABELS,
  thresholdUnit,
  validateRules,
  type SettingsTab,
} from './system';

const route = getRouteApi('/_app/settings');

/** Period close lives in Accounting (finance package); kept as a plain string link. */
const PERIOD_CLOSE_PATH: string = '/accounting/period-close';

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

export function SettingsPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/settings' });
  const tab: SettingsTab = search.tab ?? 'users';
  const { data, isLoading, error } = useSettings();
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Users, roles, approval matrix, company profile and system switches."
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
          onChange={(v) => void navigate({ search: { tab: v === 'users' ? undefined : (v as SettingsTab) } })}
          items={[
            { value: 'users', label: 'Users' },
            { value: 'roles', label: 'Roles & permissions' },
            { value: 'approvals', label: 'Approvals' },
            { value: 'company', label: 'Company & system' },
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
      {tab !== 'users' && tab !== 'roles' ? (
        error ? (
          <StatusMessage kind="error" title="Could not load settings" />
        ) : isLoading || !data ? (
          <StatusMessage kind="loading" title="Loading settings…" />
        ) : tab === 'approvals' ? (
          <ApprovalMatrixEditor key={rulesKey(data.approvalRules)} rules={data.approvalRules} />
        ) : (
          <div className="space-y-6">
            <SystemSettings key={JSON.stringify(systemSlice(data.company))} data={data} />
            <CompanyProfileForm key={profileKey(data.company)} company={data.company} />
          </div>
        )
      ) : null}
    </div>
  );
}

const rulesKey = (rules: readonly ApprovalRule[]) => rules.map((r) => JSON.stringify(r)).join('|');
const systemSlice = (c: CompanyProfile) => ({
  numberingResetYearly: c.numberingResetYearly,
  modules: c.modules,
  notificationChannels: c.notificationChannels,
});
const profileKey = (c: CompanyProfile) =>
  JSON.stringify({ ...c, numberingResetYearly: 0, modules: 0, notificationChannels: 0, lockedUntil: 0 });

// ---------------- X1: roles × modules (proposal) ----------------
const ACTION_LABEL = { view: 'View', create: 'Create', approve: 'Approve', post: 'Post' } as const;

function RolesMatrix() {
  return (
    <Card>
      <CardHeader
        title="Roles & permissions"
        description="What each role may do per module: view, create, approve, post."
        actions={<Badge tone="warning">Proposed · pending SEC-001</Badge>}
      />
      <CardBody className="pb-0">
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-subtle px-4 py-3 text-body-s text-fg-secondary"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <span className="font-semibold text-fg">Proposed</span> — enforced by the backend after SEC-001
            approval; the screen only hides buttons.
          </p>
        </div>
      </CardBody>
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Role permission matrix">
        <table className="w-full border-collapse text-left text-body-s">
          <caption className="sr-only">Proposed role permission matrix (read-only, pending SEC-001)</caption>
          <thead>
            <tr className="border-y border-border-subtle bg-canvas/60">
              <th
                scope="col"
                className="px-4 py-2.5 pl-5 text-caption font-medium uppercase tracking-wide text-fg-muted"
              >
                Module
              </th>
              {PROPOSED_ROLES.map((r) => (
                <th
                  key={r}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-caption font-medium uppercase tracking-wide text-fg-muted"
                >
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((m) => (
              <tr key={m.code} className="border-b border-border-subtle align-top last:border-0">
                <th scope="row" className="min-w-44 px-4 py-3 pl-5 font-medium">
                  {m.label}
                  <span className="block font-mono text-[11px] font-normal text-fg-muted">{m.code}</span>
                </th>
                {PROPOSED_ROLES.map((r) => {
                  const actions = PERMISSION_ACTIONS.filter((a) => roleCan(r, m.code, a));
                  return (
                    <td key={r} className="px-3 py-3">
                      {actions.length ? (
                        <ul className="flex flex-wrap gap-1">
                          {actions.map((a) => (
                            <li key={a}>
                              <Badge tone={a === 'view' ? 'neutral' : 'info'} dot={false}>
                                {ACTION_LABEL[a]}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-caption text-fg-muted">No access</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardBody>
        <ul className="space-y-1 text-caption text-fg-muted">
          {Object.entries(PORTAL_NOTES).map(([role, note]) => (
            <li key={role}>
              <span className="font-medium text-fg-secondary">{role}:</span> {note}
            </li>
          ))}
          <li>Manager / Admin has every permission. Approvals also follow the approval matrix.</li>
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------------- X2: approval matrix editor ----------------
function ApprovalMatrixEditor({ rules }: { rules: ApprovalRule[] }) {
  const [draft, setDraft] = useState<ApprovalRule[]>(rules);
  const [seq, setSeq] = useState(1);
  const save = useSaveApprovalRules();
  const toast = useToast();
  const errors = validateRules(draft);
  const set = (id: string, patch: Partial<ApprovalRule>) =>
    setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    setDraft((d) => [
      ...d,
      {
        id: `apr-new-${Date.now().toString(36)}-${seq}`,
        docType: 'Purchase order',
        threshold: 0,
        approverRole: 'Operations manager',
        active: true,
      },
    ]);
    setSeq((s) => s + 1);
  };
  const submit = () => {
    if (Object.keys(errors).length || save.isPending) return;
    save.mutate(draft, {
      onSuccess: (n) =>
        toast({
          title: n ? 'Approval matrix saved' : 'No changes to save',
          body: n ? `${n} change${n === 1 ? '' : 's'} recorded in the audit log.` : undefined,
        }),
    });
  };
  useFormShortcuts({ onSave: submit, onAddLine: add });

  return (
    <Card>
      <CardHeader
        title="Approval matrix"
        description="Documents at or above the threshold wait for this role's approval (0 = always). For margin, approval is needed when the margin is below the threshold."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus aria-hidden="true" />}
            onClick={add}
            title="Alt + N"
          >
            Add rule
          </Button>
        }
      />
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Approval rules">
        <table className="w-full border-collapse text-left text-body-s">
          <caption className="sr-only">Approval rules (editable)</caption>
          <thead>
            <tr className="border-y border-border-subtle bg-canvas/60 text-caption font-medium uppercase tracking-wide text-fg-muted">
              <th scope="col" className="px-4 py-2.5 pl-5 font-medium">
                Document
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Threshold
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Approver role
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Active
              </th>
              <th scope="col" className="px-3 py-2.5 pr-5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => {
              const unit = thresholdUnit(r.docType);
              const err = errors[r.id];
              const errId = `rule-err-${i}`;
              return (
                <tr key={r.id} className="border-b border-border-subtle align-top last:border-0">
                  <td className="px-4 py-3 pl-5">
                    <select
                      aria-label={`Document type, rule ${i + 1}`}
                      value={r.docType}
                      onChange={(e) => set(r.id, { docType: e.target.value as ApprovalDocType })}
                      className={clsx(inputClasses, 'h-9 min-w-52 pr-8')}
                    >
                      {APPROVAL_DOC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-caption text-fg-muted">{describeRule(r)}</p>
                    {err ? (
                      <p id={errId} role="alert" className="mt-1 text-caption font-medium text-danger">
                        {err}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {unit === 'AED' ? <span className="text-caption text-fg-muted">AED</span> : null}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={unit === '%' ? 100 : undefined}
                        step={unit === 'qty' ? 1 : 'any'}
                        aria-label={`Threshold in ${unit === 'qty' ? 'quantity' : unit}, rule ${i + 1}`}
                        aria-invalid={!!err || undefined}
                        aria-describedby={err ? errId : undefined}
                        value={Number.isFinite(r.threshold) ? r.threshold : ''}
                        onChange={(e) =>
                          set(r.id, { threshold: e.target.value === '' ? NaN : Number(e.target.value) })
                        }
                        className={clsx(inputClasses, 'h-9 w-28 text-right tabular-nums')}
                      />
                      {unit !== 'AED' ? <span className="text-caption text-fg-muted">{unit}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={`Approver role, rule ${i + 1}`}
                      value={r.approverRole}
                      onChange={(e) =>
                        set(r.id, { approverRole: e.target.value as ApprovalRule['approverRole'] })
                      }
                      className={clsx(inputClasses, 'h-9 min-w-44 pr-8')}
                    >
                      {APPROVER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <Toggle
                      checked={r.active}
                      onChange={(v) => set(r.id, { active: v })}
                      label={`Rule ${i + 1} active (${r.docType})`}
                    />
                  </td>
                  <td className="px-3 py-3 pr-5 text-right">
                    <button
                      type="button"
                      aria-label={`Remove rule ${i + 1} (${r.docType})`}
                      onClick={() => setDraft((d) => d.filter((x) => x.id !== r.id))}
                      className="rounded-md p-1.5 text-fg-muted hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {draft.length === 0 ? (
        <p className="px-5 py-6 text-center text-body-s text-fg-muted">
          No rules — nothing will need approval. Add a rule to start.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
        <p className="text-caption text-fg-muted">
          Changes apply to new requests only. The backend re-checks every rule.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDraft(rules)}>
            Reset
          </Button>
          <Button
            busy={save.isPending}
            disabled={Object.keys(errors).length > 0}
            onClick={submit}
            title="Ctrl/⌘ + S"
          >
            Save approval matrix
          </Button>
        </div>
      </div>
      {save.error ? (
        <p role="alert" className="px-5 pb-4 text-body-s font-medium text-danger">
          {save.error.message}
        </p>
      ) : null}
    </Card>
  );
}

// ---------------- X4 / scope switches / A14 / X7 ----------------
const MODULE_HELP: Record<keyof typeof MODULE_LABELS, string> = {
  ownFleet: 'Plan trips with your own trucks and drivers; fuel, tolls and allowances are charged to the job.',
  ownWarehouseFloor: 'Run your own bins: put-away, FEFO picking, dispatch notes and cycle counts.',
  multiCurrency: 'Quote and invoice in USD, EUR or SAR; balances and the ledger stay in AED.',
};

const DEFAULT_MODULES = { ownFleet: false, ownWarehouseFloor: false, multiCurrency: false };

function SystemSettings({ data }: { data: SettingsData }) {
  const { company, numberExamples } = data;
  const [reset, setReset] = useState(!!company.numberingResetYearly);
  const [modules, setModules] = useState(company.modules ?? DEFAULT_MODULES);
  const [channels, setChannels] = useState(company.notificationChannels ?? {});
  const save = useSaveSystemSettings();
  const toast = useToast();
  const events = Object.keys(channels);
  const submit = () =>
    save.mutate(
      { numberingResetYearly: reset, modules, notificationChannels: channels },
      {
        onSuccess: (n) =>
          toast({
            title: n ? 'System settings saved' : 'No changes to save',
            body: n ? `${n} change${n === 1 ? '' : 's'} recorded in the audit log.` : undefined,
          }),
      },
    );

  return (
    <>
      <Card>
        <CardHeader
          title="Numbering & books"
          description="How new documents are numbered and which period is closed."
        />
        <CardBody className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium" id="reset-label">
                Restart numbers every year
              </p>
              <p className="text-caption text-fg-muted" id="reset-example">
                Next invoice number:{' '}
                <span className="font-mono text-fg">
                  {reset ? numberExamples.yearly : numberExamples.running}
                </span>
                {reset ? ' — numbering starts again at 001 on 1 January.' : ' — one running sequence.'}
              </p>
            </div>
            <Toggle
              checked={reset}
              onChange={setReset}
              label="Restart numbers every year"
              describedBy="reset-example"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3">
            <p className="flex items-center gap-2 text-body-s">
              <Lock aria-hidden="true" className="size-4 text-fg-muted" />
              {company.lockedUntil ? (
                <span>
                  Books locked up to <span className="font-semibold">{formatDate(company.lockedUntil)}</span>
                </span>
              ) : (
                <span>No period is locked yet</span>
              )}
            </p>
            <Link to={PERIOD_CLOSE_PATH} className="text-body-s font-medium text-brand hover:underline">
              Go to period close
            </Link>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Modules"
          description="Turn on only what the company runs itself (owner decision)."
        />
        <CardBody>
          <ul className="divide-y divide-border-subtle">
            {(Object.keys(MODULE_LABELS) as (keyof typeof MODULE_LABELS)[]).map((k) => (
              <li key={k} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium">{MODULE_LABELS[k]}</p>
                  <p id={`module-${k}-help`} className="text-caption text-fg-muted">
                    {MODULE_HELP[k]}
                  </p>
                </div>
                <Toggle
                  checked={modules[k]}
                  onChange={(v) => setModules((m) => ({ ...m, [k]: v }))}
                  label={MODULE_LABELS[k]}
                  describedBy={`module-${k}-help`}
                />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Notification channels"
          description="Which channel each event uses. Sending is done by the backend; this screen only saves the choice."
        />
        <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Notification channels">
          <table className="w-full border-collapse text-left text-body-s">
            <caption className="sr-only">Notification channel per event</caption>
            <thead>
              <tr className="border-y border-border-subtle bg-canvas/60">
                <th
                  scope="col"
                  className="px-4 py-2.5 pl-5 text-caption font-medium uppercase tracking-wide text-fg-muted"
                >
                  Event
                </th>
                {Object.values(CHANNEL_LABELS).map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="px-4 py-2.5 text-center text-caption font-medium uppercase tracking-wide text-fg-muted"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev} className="border-b border-border-subtle last:border-0">
                  <th scope="row" className="px-4 py-3 pl-5 font-medium">
                    {ev}
                  </th>
                  {(Object.keys(CHANNEL_LABELS) as (keyof typeof CHANNEL_LABELS)[]).map((ch) => (
                    <td key={ch} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand)]"
                        aria-label={`${ev} by ${CHANNEL_LABELS[ch]}`}
                        checked={!!channels[ev]?.[ch]}
                        onChange={(e) =>
                          setChannels((c) => ({
                            ...c,
                            [ev]: {
                              email: false,
                              whatsapp: false,
                              inApp: false,
                              ...c[ev],
                              [ch]: e.target.checked,
                            },
                          }))
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setReset(!!company.numberingResetYearly);
            setModules(company.modules ?? DEFAULT_MODULES);
            setChannels(company.notificationChannels ?? {});
          }}
        >
          Reset
        </Button>
        <Button busy={save.isPending} onClick={submit}>
          Save system settings
        </Button>
      </div>
    </>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand' : 'bg-border-strong',
      )}
    >
      <span
        className={clsx(
          'inline-block size-5 rounded-full bg-surface shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
      <span className="sr-only">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}

/** Company profile printed on tax invoices and GRNs. Bank details stay in Settings, never in code. */
function CompanyProfileForm({ company }: { company: CompanyProfile }) {
  const [draft, setDraft] = useState(company);
  const save = useSaveCompanyProfile();
  const toast = useToast();
  const text = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <TextField label={label} value={value} hint={hint} onChange={(e) => set(e.target.value)} />
  );
  const lines = (label: string, value: string[], set: (v: string[]) => void) => (
    <TextareaField
      label={label}
      rows={3}
      value={value.join('\n')}
      onChange={(e) => set(e.target.value.split('\n'))}
    />
  );
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Company profile"
          description="Printed on tax invoices (office address) and GRNs (registered address)."
        />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          {text('Legal name', draft.legalName, (v) => setDraft({ ...draft, legalName: v }))}
          {text('VAT TRN', draft.trn, (v) => setDraft({ ...draft, trn: v }))}
          {text('Tagline', draft.tagline, (v) => setDraft({ ...draft, tagline: v }))}
          {text('Website', draft.website, (v) => setDraft({ ...draft, website: v }))}
          {text('Phone', draft.phone, (v) => setDraft({ ...draft, phone: v }))}
          {text('Email', draft.email, (v) => setDraft({ ...draft, email: v }))}
          {lines('Office address (tax invoice)', draft.officeAddress, (v) =>
            setDraft({ ...draft, officeAddress: v }),
          )}
          {lines('Registered address (GRN)', draft.registeredAddress, (v) =>
            setDraft({ ...draft, registeredAddress: v }),
          )}
          {text('Trade licence no.', draft.licenseNo, (v) => setDraft({ ...draft, licenseNo: v }))}
          <div className="grid grid-cols-2 gap-4">
            {text(
              'Invoice prefix',
              draft.invoicePrefix,
              (v) => setDraft({ ...draft, invoicePrefix: v.toUpperCase() }),
              'e.g. AEN → AEN079',
            )}
            {text('GRN prefix', draft.grnPrefix, (v) => setDraft({ ...draft, grnPrefix: v.toUpperCase() }))}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Bank details on invoices"
          description="Shown in the Bank Details block of every tax invoice."
        />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          {text('Bank name', draft.bank.bankName, (v) =>
            setDraft({ ...draft, bank: { ...draft.bank, bankName: v } }),
          )}
          {text('Account name', draft.bank.accountName, (v) =>
            setDraft({ ...draft, bank: { ...draft.bank, accountName: v } }),
          )}
          {text('Account number', draft.bank.accountNumber, (v) =>
            setDraft({ ...draft, bank: { ...draft.bank, accountNumber: v } }),
          )}
          {text('IBAN', draft.bank.iban, (v) => setDraft({ ...draft, bank: { ...draft.bank, iban: v } }))}
          {text('SWIFT', draft.bank.swift, (v) => setDraft({ ...draft, bank: { ...draft.bank, swift: v } }))}
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setDraft(company)}>
          Reset
        </Button>
        <Button
          busy={save.isPending}
          onClick={() =>
            save.mutate(draft, {
              onSuccess: () =>
                toast({ title: 'Company profile saved', body: 'New invoices and GRNs use these details.' }),
            })
          }
        >
          Save company profile
        </Button>
      </div>
    </div>
  );
}
