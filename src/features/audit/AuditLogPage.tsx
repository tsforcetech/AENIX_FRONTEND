import { Download } from 'lucide-react';
import { useState } from 'react';
import type { ActivityEvent } from '@/domain/types';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { SelectField, TextField } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SearchInput } from '@/shared/ui/SearchInput';
import { useToast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils/format';
import { exportAuditCsv, useAuditLog } from './api';
import type { AuditFilter } from './audit';
import { downloadCsv } from './csv';

const columns: Column<ActivityEvent>[] = [
  {
    key: 'at',
    header: 'When',
    cell: (e) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(e.at)}</span>,
  },
  { key: 'actor', header: 'User', cell: (e) => <span className="whitespace-nowrap">{e.actor}</span> },
  {
    key: 'doc',
    header: 'Record',
    cell: (e) => (
      <div>
        <DocRef>{e.entityRef}</DocRef>
        <p className="text-caption text-fg-muted">{e.entity}</p>
      </div>
    ),
  },
  {
    key: 'action',
    header: 'What changed',
    cell: (e) => (
      <div className="min-w-56">
        <p>{e.action}</p>
        {e.changes?.length ? (
          <ul className="mt-1 space-y-0.5 text-caption text-fg-secondary">
            {e.changes.map((c, i) => (
              <li key={`${c.field}-${i}`}>
                <span className="font-medium">{c.field}:</span>{' '}
                <span className="line-through decoration-fg-muted">{c.from || '—'}</span>
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> changed to </span>
                <span className="font-medium text-fg">{c.to || '—'}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ),
  },
];

export function AuditLogPage() {
  const [filter, setFilter] = useState<AuditFilter>({});
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAuditLog(filter, page);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const update = (patch: Partial<AuditFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, await exportAuditCsv(filter));
      toast({ title: 'Audit log exported', body: `${data?.total ?? 0} entries in the CSV file.` });
    } finally {
      setExporting(false);
    }
  };
  const hasFilter = Object.values(filter).some(Boolean);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Who changed what and when, across all documents. Newest first. The backend keeps the official, tamper-proof trail."
        actions={
          <Button
            variant="secondary"
            icon={<Download aria-hidden="true" />}
            busy={exporting}
            disabled={!data?.total}
            onClick={() => void exportCsv()}
          >
            Export CSV
          </Button>
        }
      />
      <Card>
        <div className="space-y-4 border-b border-border-subtle px-5 py-4">
          <SearchInput
            value={filter.q ?? ''}
            onChange={(q) => update({ q: q || undefined })}
            label="Search the audit log"
            placeholder="Search reference, action, field…"
            className="w-full sm:max-w-sm"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Record type"
              value={filter.entity ?? ''}
              placeholder="All types"
              options={(data?.entities ?? []).map((e) => ({ value: e, label: e }))}
              onChange={(e) => update({ entity: (e.target.value || undefined) as AuditFilter['entity'] })}
            />
            <SelectField
              label="User"
              value={filter.actor ?? ''}
              placeholder="All users"
              options={(data?.actors ?? []).map((a) => ({ value: a, label: a }))}
              onChange={(e) => update({ actor: e.target.value || undefined })}
            />
            <TextField
              label="From date"
              type="date"
              value={filter.from ?? ''}
              max={filter.to}
              onChange={(e) => update({ from: e.target.value || undefined })}
            />
            <TextField
              label="To date"
              type="date"
              value={filter.to ?? ''}
              min={filter.from}
              onChange={(e) => update({ to: e.target.value || undefined })}
            />
          </div>
          {hasFilter ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilter({});
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        <DataTable
          caption="Audit log entries"
          columns={columns}
          rows={data?.items}
          rowKey={(e) => e.id}
          loading={isLoading}
          error={error}
          emptyTitle={hasFilter ? 'No entries match these filters' : 'No activity yet'}
          footer={
            data && data.total > data.pageSize ? (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
              />
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}
