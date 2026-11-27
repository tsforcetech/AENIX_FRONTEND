import clsx from 'clsx';
import { FolderTree, Plus } from 'lucide-react';
import { useState } from 'react';
import type { AccountGroup } from '@/domain/types';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { useChartOfAccounts, useCreateLedger, useSetLedgerActive, type AccountNode } from './api';

const GROUPS: AccountGroup[] = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];

/**
 * Chart of accounts: groups and ledgers by section. Customer / vendor sub-ledgers are created
 * automatically with the party and are read-only here. Pending accountant sign-off (Phase 8).
 */
export function ChartOfAccountsView() {
  const { data, isLoading, error } = useChartOfAccounts();
  const toggle = useSetLedgerActive();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [showParties, setShowParties] = useState(false);

  if (error)
    return (
      <div className="p-5">
        <StatusMessage kind="error" title="Could not load the chart of accounts" />
      </div>
    );
  if (isLoading || !data)
    return (
      <div className="p-5">
        <StatusMessage kind="loading" title="Loading chart of accounts…" />
      </div>
    );

  const rows = data.filter((a) => showParties || !a.party);
  const hiddenParties = data.filter((a) => a.party).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <label className="flex items-center gap-2 text-body-s text-fg-secondary">
          <input
            type="checkbox"
            checked={showParties}
            onChange={(e) => setShowParties(e.target.checked)}
            className="size-4 accent-[var(--color-brand)]"
          />
          Show customer and vendor sub-ledgers ({hiddenParties})
        </label>
        <Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>
          New account
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-s">
          <caption className="sr-only">Chart of accounts</caption>
          <thead>
            <tr className="border-y border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
              <th scope="col" className="px-5 py-2 font-medium">
                Code
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Account
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Type
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Balance (Dr + / Cr −)
              </th>
              <th scope="col" className="px-5 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                className={clsx(
                  'border-b border-border-subtle last:border-0',
                  a.kind === 'Group' && a.depth === 0 && 'bg-canvas font-semibold',
                  !a.active && 'opacity-50',
                )}
              >
                <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[13px]">{a.code}</td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2" style={{ paddingLeft: `${a.depth * 20}px` }}>
                    {a.kind === 'Group' ? (
                      <FolderTree aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                    ) : null}
                    <span className={a.kind === 'Group' ? 'font-semibold' : undefined}>{a.name}</span>
                    {a.party ? (
                      <Badge tone="neutral" dot={false}>
                        Auto-created · {a.party.type}
                      </Badge>
                    ) : null}
                    {!a.active ? <Badge tone="warning">Inactive</Badge> : null}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">
                  {a.kind}
                  {a.system && !a.party ? ' · system' : ''}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <Money amount={a.balance} muted={a.balance === 0} />
                </td>
                <td className="whitespace-nowrap px-5 py-2.5 text-right">
                  {!a.system && !a.party ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={toggle.isPending && toggle.variables?.id === a.id}
                      onClick={() =>
                        toggle.mutate(
                          { id: a.id, active: !a.active },
                          {
                            onSuccess: () =>
                              toast({ title: `${a.code} ${a.active ? 'deactivated' : 'reactivated'}` }),
                          },
                        )
                      }
                    >
                      {a.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-caption text-fg-muted">
        Balances are best-effort prototype figures from posted journals; customer and vendor sub-ledgers show
        open invoices / bills. The backend ledger is the authority.
      </p>
      {open ? <NewAccountDialog accounts={data} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function NewAccountDialog({ accounts, onClose }: { accounts: AccountNode[]; onClose: () => void }) {
  const create = useCreateLedger();
  const toast = useToast();
  const [group, setGroup] = useState<AccountGroup>('Expenses');
  const parents = accounts.filter((a) => a.kind === 'Group' && a.group === group && !a.party);
  const [parentId, setParentId] = useState(parents[0]?.id ?? '');
  const [kind, setKind] = useState<'Ledger' | 'Group'>('Ledger');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    setError(undefined);
    if (!/^\d{4}(-\d{1,3})?$/.test(code.trim())) return setError('Use a 4-digit code, e.g. 6300.');
    if (name.trim().length < 2) return setError('Enter the account name.');
    if (!parentId) return setError('Choose the parent group.');
    create.mutate(
      { group, parentId, code, name, kind },
      {
        onSuccess: (acc) => {
          toast({ title: `${acc.code} ${acc.name} created` });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Could not create the account.'),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New ledger account"
      description="Customer and vendor accounts are created automatically with the party."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={create.isPending} onClick={submit}>
            Create account
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Section"
          value={group}
          onChange={(e) => {
            const g = e.target.value as AccountGroup;
            setGroup(g);
            setParentId(accounts.find((a) => a.kind === 'Group' && a.group === g && !a.party)?.id ?? '');
          }}
          options={GROUPS.map((g) => ({ value: g, label: g }))}
        />
        <SelectField
          label="Parent group"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          options={parents.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))}
        />
        <SelectField
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'Ledger' | 'Group')}
          options={[
            { value: 'Ledger', label: 'Ledger (takes postings)' },
            { value: 'Group', label: 'Group (organises ledgers)' },
          ]}
        />
        <TextField
          label="Code"
          required
          value={code}
          placeholder="e.g. 6300"
          onChange={(e) => setCode(e.target.value)}
        />
        <TextField
          label="Name"
          required
          className="sm:col-span-2"
          value={name}
          placeholder="e.g. Fuel and tolls"
          onChange={(e) => setName(e.target.value)}
        />
        {error ? (
          <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
