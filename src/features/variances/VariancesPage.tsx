import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';
import { useCustomerOptions } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { SelectField } from '@/shared/ui/Field';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils/format';
import {
  usePendingVarianceDocs,
  useVarianceAction,
  useVariances,
  VARIANCE_SOURCES,
  VARIANCE_STATUSES,
  type PendingVarianceDoc,
  type VarianceRow,
} from './api';

const route = getRouteApi('/_app/variances');

/** FLOW-003 W3 — variances and claims: GRN / POD / cycle-count differences, outcome and approval. */
export function VariancesPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/variances' });
  const customers = useCustomerOptions();
  const { data, isLoading, isFetching, error } = useVariances({
    page: search.page,
    status: search.status,
    search: search.q,
    source: search.source,
    customerId: search.customerId,
  });

  const columns: Column<VarianceRow>[] = [
    {
      key: 'number',
      header: 'Variance',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDateTime(r.raisedAt)}</p>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      cell: (r) => (
        <div>
          <p className="whitespace-nowrap">
            {r.source} <span className="font-mono text-[13px]">{r.sourceRef}</span>
          </p>
          {r.jobNumber ? <p className="font-mono text-caption text-fg-muted">{r.jobNumber}</p> : null}
        </div>
      ),
    },
    {
      key: 'party',
      header: 'Customer / vendor',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.customerName}</p>
          <p className="text-caption text-fg-muted">{r.vendorName ?? 'No vendor'}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Short / damaged',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums">
          {r.shortQty} / {r.damagedQty}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      hideOnMobile: true,
      cell: (r) => (
        <div>
          <p>{r.outcome ?? <span className="text-fg-muted">Not decided</span>}</p>
          {r.value !== undefined ? <Money amount={r.value} muted className="text-caption" /> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Variances and claims"
        description="GRN and POD shortages, excess and damage, and cycle-count differences: outcome, approval, claims and debit notes."
      />
      <PendingDocsCard />
      <Card>
        <ListToolbar
          tabs={statusTabs(VARIANCE_STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search variance, document, SKU, job…"
          extra={
            <div className="flex flex-wrap gap-3">
              <SelectField
                label="Source"
                className="w-40"
                placeholder="All sources"
                options={VARIANCE_SOURCES.map((s) => ({ value: s, label: s }))}
                value={search.source ?? ''}
                onChange={(e) =>
                  void navigate({
                    search: (p) => ({
                      ...p,
                      source: VARIANCE_SOURCES.find((x) => x === e.target.value),
                      page: undefined,
                    }),
                  })
                }
              />
              <SelectField
                label="Customer"
                className="w-56"
                placeholder="All customers"
                options={customers.data ?? []}
                value={search.customerId ?? ''}
                onChange={(e) =>
                  void navigate({
                    search: (p) => ({ ...p, customerId: e.target.value || undefined, page: undefined }),
                  })
                }
              />
            </div>
          }
        />
        <DataTable
          caption="Variances"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          onRowClick={(r) => void navigate({ to: '/variances/$id', params: { id: r.id } })}
          loading={isLoading || isFetching}
          error={error}
          emptyTitle="No variances match"
          emptyDescription="A variance is opened when a GRN or POD does not match, or from a cycle count."
          footer={
            data ? (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={(page) => void navigate({ search: (p) => ({ ...p, page }) })}
              />
            ) : null
          }
        />
      </Card>
    </div>
  );
}

/** Documents already flagged 'Variance raised' (older data) that still need a variance record. */
export function PendingDocsCard({ workOrderId }: { workOrderId?: string }) {
  const { data } = usePendingVarianceDocs(workOrderId);
  if (!data?.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Variance raised — record still to open"
        description="These documents were flagged as not matching. Open the variance record to decide the outcome."
      />
      <CardBody>
        <ul className="divide-y divide-border-subtle">
          {data.map((d) => (
            <PendingDocItem key={`${d.workOrderId}-${d.docId}`} doc={d} />
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function PendingDocItem({ doc }: { doc: PendingVarianceDoc }) {
  const action = useVarianceAction();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div>
        <p className="flex flex-wrap items-center gap-2">
          <span>{doc.source}</span>
          <DocRef>{doc.sourceRef}</DocRef>
          <Link
            to="/work-orders/$id"
            params={{ id: doc.workOrderId }}
            className="font-mono text-[13px] font-medium text-brand hover:underline"
          >
            {doc.jobNumber}
          </Link>
        </p>
        <p className="text-caption text-fg-muted">{doc.customerName}</p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        icon={<FilePlus2 aria-hidden="true" />}
        busy={busy && action.isPending}
        onClick={() => {
          setBusy(true);
          action.mutate(
            { kind: 'fromDoc', workOrderId: doc.workOrderId, source: doc.source, docId: doc.docId },
            {
              onSuccess: (v) => void navigate({ to: '/variances/$id', params: { id: v.id } }),
              onError: (e) =>
                toast({ title: 'Not opened', body: e instanceof Error ? e.message : 'Please try again.' }),
            },
          );
        }}
      >
        Open variance record
      </Button>
    </li>
  );
}
