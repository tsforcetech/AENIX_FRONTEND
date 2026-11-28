import { getRouteApi } from '@tanstack/react-router';
import { FileSpreadsheet, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField } from '@/shared/ui/Field';
import { ListToolbar } from '@/shared/ui/ListToolbar';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SpreadsheetImport, type ImportField } from '@/shared/ui/SpreadsheetImport';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import {
  getConfig,
  useDeleteMaster,
  useImportMaster,
  useMasterRows,
  useSetMasterActive,
  type MasterListRow,
} from './api';
import { isConfigKey, type ConfigKey, type MasterConfig } from './config';
import { CurrencyRatesDialog } from './CurrencyRatesDialog';
import { MasterFormDialog } from './MasterFormDialog';

const route = getRouteApi('/_app/masters/$key');

/** FLOW-003 M1 — generic master list: search, Active / Inactive, add, edit, deactivate, delete, Excel import. */
export function MasterListPage() {
  const { key } = route.useParams();
  if (!isConfigKey(key))
    return (
      <div>
        <PageHeader
          crumbs={[{ label: 'All masters', to: '/masters' }, { label: 'Not found' }]}
          title="Master not found"
        />
        <StatusMessage
          kind="empty"
          title="This master does not exist"
          description="Go back to All masters."
        />
      </div>
    );
  return <MasterList key={key} masterKey={key} />;
}

type Dlg =
  | { kind: 'form'; row?: MasterListRow }
  | { kind: 'delete'; row: MasterListRow }
  | { kind: 'deactivate'; row: MasterListRow }
  | { kind: 'import' }
  | { kind: 'rates' }
  | {
      kind: 'imported';
      added: number;
      updated: number;
      skipped: { line: number; code: string; reason: string }[];
    };

function importFields(cfg: MasterConfig): ImportField[] {
  return cfg.fields
    .filter((f) => f.importAliases !== false && !f.hidden)
    .map((f) => ({
      key: f.key,
      label: f.label,
      required: f.key === cfg.codeKey,
      type: f.type === 'number' ? ('number' as const) : ('text' as const),
      aliases: f.importAliases || undefined,
    }));
}

function MasterList({ masterKey }: { masterKey: ConfigKey }) {
  const cfg = getConfig(masterKey);
  const { data, isLoading, error } = useMasterRows(masterKey);
  const setActive = useSetMasterActive(masterKey);
  const remove = useDeleteMaster(masterKey);
  const importer = useImportMaster(masterKey);
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Active');
  const [filter, setFilter] = useState('');
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [actionError, setActionError] = useState<string>();

  const text = q.trim().toLowerCase();
  const rows = (data ?? []).filter((r) => {
    if (cfg.hasActive && (status === 'Active') !== !!r.row.active) return false;
    if (cfg.filter && filter && r.row[cfg.filter.key] !== filter) return false;
    if (!text) return true;
    return [r.row[cfg.codeKey], r.row[cfg.nameKey], ...Object.values(r.cells)]
      .join(' ')
      .toLowerCase()
      .includes(text);
  });
  const activeCount = data?.filter((r) => r.row.active).length ?? 0;

  const toggle = (r: MasterListRow, active: boolean) => {
    setActionError(undefined);
    setActive.mutate(
      { id: r.row.id, active },
      {
        onSuccess: () => {
          toast({ title: `${String(r.row[cfg.nameKey])} ${active ? 'reactivated' : 'deactivated'}` });
          setDlg(null);
        },
        onError: (e) => {
          setActionError(e instanceof Error ? e.message : 'Not changed');
          setDlg(null);
        },
      },
    );
  };

  const fieldCols = cfg.fields.filter(
    (f) => cfg.listFields.includes(f.key) && f.key !== cfg.codeKey && f.key !== cfg.nameKey,
  );
  const columns: Column<MasterListRow>[] = [
    {
      key: 'entry',
      header: cfg.codeKey === cfg.nameKey ? 'Document' : 'Code · name',
      cell: (r) => (
        <div className="min-w-40">
          {cfg.codeKey !== cfg.nameKey ? (
            <span className="font-mono text-[13px] font-medium">{String(r.row[cfg.codeKey])}</span>
          ) : null}
          <p className={cfg.codeKey === cfg.nameKey ? 'font-medium' : 'text-body-s text-fg-secondary'}>
            {String(r.row[cfg.nameKey])}
            {r.row.system ? (
              <Badge tone="info" dot={false} className="ml-2">
                System
              </Badge>
            ) : null}
            {r.row.base ? (
              <Badge tone="brand" dot={false} className="ml-2">
                Base
              </Badge>
            ) : null}
          </p>
        </div>
      ),
    },
    ...fieldCols.map((f): Column<MasterListRow> => ({
      key: f.key,
      header: f.label,
      align: f.type === 'number' ? 'right' : 'left',
      hideOnMobile: true,
      cell: (r) => <span className={f.type === 'number' ? 'tabular-nums' : undefined}>{r.cells[f.key]}</span>,
    })),
    ...(masterKey === 'numberSeries'
      ? [
          {
            key: 'example',
            header: 'Next number',
            cell: (r: MasterListRow) => <span className="font-mono text-[13px]">{r.example}</span>,
          },
        ]
      : []),
    ...(cfg.hasActive
      ? [
          {
            key: 'status',
            header: 'Status',
            cell: (r: MasterListRow) => <StatusBadge status={r.row.active ? 'Active' : 'Inactive'} />,
          },
          {
            key: 'used',
            header: 'Used in',
            hideOnMobile: true,
            cell: (r: MasterListRow) => (
              <span className="text-body-s text-fg-muted">
                {r.usage.length ? r.usage.join(', ') : 'Not used'}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) => {
        const label = String(r.row[cfg.nameKey]);
        return (
          <div className="flex justify-end gap-1.5 whitespace-nowrap">
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Edit ${label}`}
              onClick={() => setDlg({ kind: 'form', row: r })}
            >
              Edit
            </Button>
            {cfg.hasActive ? (
              r.row.active ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Deactivate ${label}`}
                  onClick={() => setDlg({ kind: 'deactivate', row: r })}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Reactivate ${label}`}
                  busy={setActive.isPending && setActive.variables?.id === r.row.id}
                  onClick={() => toggle(r, true)}
                >
                  Reactivate
                </Button>
              )
            ) : null}
            {cfg.canDelete && !r.row.system ? (
              <Button
                size="sm"
                variant="danger"
                aria-label={`Delete ${label}`}
                onClick={() => setDlg({ kind: 'delete', row: r })}
              >
                Delete
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'All masters', to: '/masters' }, { label: cfg.title }]}
        title={cfg.title}
        description={cfg.purpose}
        actions={
          <>
            {masterKey === 'currencies' ? (
              <Button
                variant="secondary"
                icon={<RefreshCw aria-hidden="true" />}
                onClick={() => setDlg({ kind: 'rates' })}
              >
                Update rates
              </Button>
            ) : null}
            <Button
              variant="secondary"
              icon={<FileSpreadsheet aria-hidden="true" />}
              onClick={() => setDlg({ kind: 'import' })}
            >
              Import from Excel
            </Button>
            {cfg.canAdd ? (
              <Button icon={<Plus aria-hidden="true" />} onClick={() => setDlg({ kind: 'form' })}>
                Add {cfg.singular}
              </Button>
            ) : null}
          </>
        }
      />
      {cfg.note ? <p className="mb-4 text-body-s text-fg-muted">{cfg.note}</p> : null}
      {actionError ? (
        <div className="mb-4">
          <StatusMessage kind="error" title="Not changed" description={actionError} />
        </div>
      ) : null}
      <Card>
        <ListToolbar
          search={q}
          onSearch={setQ}
          searchPlaceholder={`Search ${cfg.title.toLowerCase()}…`}
          tabs={
            cfg.hasActive
              ? [
                  { value: 'Active', label: 'Active', count: data ? activeCount : undefined },
                  {
                    value: 'Inactive',
                    label: 'Inactive',
                    count: data ? data.length - activeCount : undefined,
                  },
                ]
              : undefined
          }
          status={status}
          onStatus={setStatus}
          extra={
            cfg.filter ? (
              <SelectField
                label={cfg.filter.label}
                className="w-full sm:w-56"
                placeholder="All kinds"
                options={cfg.filter.options}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            ) : null
          }
        />
        <DataTable
          caption={cfg.title}
          columns={columns}
          rows={data ? rows : undefined}
          rowKey={(r) => r.row.id}
          loading={isLoading}
          error={error}
          emptyTitle={
            text || filter
              ? 'No entry matches'
              : status === 'Inactive'
                ? 'No inactive entries'
                : 'No entries yet'
          }
          emptyDescription={cfg.canAdd ? `Add a ${cfg.singular} or import a list from Excel.` : undefined}
        />
      </Card>

      {dlg?.kind === 'form' ? (
        <MasterFormDialog
          masterKey={masterKey}
          row={dlg.row?.row}
          locked={dlg.row?.locked}
          onClose={() => setDlg(null)}
        />
      ) : null}

      {dlg?.kind === 'rates' ? <CurrencyRatesDialog onClose={() => setDlg(null)} /> : null}

      {dlg?.kind === 'deactivate' ? (
        <Dialog
          open
          onClose={() => setDlg(null)}
          title={`Deactivate ${String(dlg.row.row[cfg.nameKey])}?`}
          description="It stays on existing documents but is no longer offered on new ones. You can reactivate it later."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDlg(null)}>
                Cancel
              </Button>
              <Button busy={setActive.isPending} onClick={() => toggle(dlg.row, false)}>
                Deactivate
              </Button>
            </>
          }
        >
          <p className="text-body-s">
            {dlg.row.usage.length ? `Used in ${dlg.row.usage.join(', ')}.` : 'Not used on any record yet.'}
          </p>
        </Dialog>
      ) : null}

      {dlg?.kind === 'delete' ? (
        <Dialog
          open
          onClose={() => setDlg(null)}
          title={`Delete ${String(dlg.row.row[cfg.nameKey])}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDlg(null)}>
                {dlg.row.usage.length ? 'Close' : 'Cancel'}
              </Button>
              {dlg.row.usage.length ? (
                dlg.row.row.active ? (
                  <Button onClick={() => setDlg({ kind: 'deactivate', row: dlg.row })}>
                    Deactivate instead
                  </Button>
                ) : null
              ) : (
                <Button
                  variant="danger"
                  busy={remove.isPending}
                  onClick={() =>
                    remove.mutate(dlg.row.row.id, {
                      onSuccess: () => {
                        toast({ title: `${String(dlg.row.row[cfg.nameKey])} deleted` });
                        setDlg(null);
                      },
                      onError: (e) => {
                        setActionError(e instanceof Error ? e.message : 'Not deleted');
                        setDlg(null);
                      },
                    })
                  }
                >
                  Delete
                </Button>
              )}
            </>
          }
        >
          {dlg.row.usage.length ? (
            <StatusMessage
              kind="denied"
              title="This entry is in use and cannot be deleted"
              description={`Used in ${dlg.row.usage.join(', ')}. Deactivate it so it is no longer offered on new documents.`}
            />
          ) : (
            <p className="text-body-s">It is not used anywhere. Deleting it cannot be undone.</p>
          )}
        </Dialog>
      ) : null}

      <SpreadsheetImport
        open={dlg?.kind === 'import'}
        onClose={() => setDlg((d) => (d?.kind === 'import' ? null : d))}
        title={`Import ${cfg.title.toLowerCase()}`}
        description={`Rows are matched on ${cfg.fields.find((f) => f.key === cfg.codeKey)?.label.toLowerCase() ?? 'code'}: existing entries are updated${cfg.canAdd ? ', new ones are added' : ''}.`}
        fields={importFields(cfg)}
        templateKey={`MASTER:${masterKey}`}
        onImport={(imported, file) =>
          importer.mutate(
            { rows: imported, fileName: file.name },
            {
              onSuccess: (res) => setDlg({ kind: 'imported', ...res }),
              onError: (e) => setActionError(e instanceof Error ? e.message : 'Import failed'),
            },
          )
        }
      />

      {dlg?.kind === 'imported' ? (
        <Dialog
          open
          onClose={() => setDlg(null)}
          title="Import finished"
          description={`${dlg.added} added · ${dlg.updated} updated · ${dlg.skipped.length} skipped`}
          footer={<Button onClick={() => setDlg(null)}>Done</Button>}
        >
          {dlg.skipped.length ? (
            <div
              className="max-h-64 overflow-auto rounded-lg border border-border-subtle"
              tabIndex={0}
              role="region"
              aria-label="Skipped rows"
            >
              <table className="w-full text-left text-caption">
                <caption className="sr-only">Skipped rows</caption>
                <thead className="sticky top-0 bg-canvas">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 font-medium text-fg-muted">
                      Line
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium text-fg-muted">
                      Code
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium text-fg-muted">
                      Why skipped
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dlg.skipped.map((s) => (
                    <tr key={`${s.line}-${s.code}`} className="border-t border-border-subtle">
                      <td className="px-2 py-1.5 tabular-nums text-fg-muted">{s.line}</td>
                      <td className="px-2 py-1.5 font-mono">{s.code}</td>
                      <td className="px-2 py-1.5">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-body-s">Every row was imported.</p>
          )}
        </Dialog>
      ) : null}
    </div>
  );
}
