import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { BadgeCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Collection } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { useClearPdc, useCollections, type CollectionRow } from './api';

const route = getRouteApi('/_app/collections');
const STATUSES: Collection['status'][] = ['Unallocated', 'Allocated', 'PDC pending', 'Bounced'];

export function CollectionsListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/collections' });
  const toast = useToast();
  const { data, isLoading, isFetching, error } = useCollections({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  const clearPdc = useClearPdc();
  const [pdc, setPdc] = useState<CollectionRow | null>(null);

  const columns: Column<CollectionRow>[] = [
    {
      key: 'number',
      header: 'Receipt',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.customerName}</p>
          <p className="text-caption text-fg-muted">
            {r.invoiceNumbers.length ? r.invoiceNumbers.join(', ') : 'No allocation yet'}
          </p>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      hideOnMobile: true,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p>{r.method}</p>
          <p className="text-caption text-fg-muted">
            {r.chequeDate ? `Cheque dated ${formatDate(r.chequeDate)}` : r.reference}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) => <Money amount={r.amount} className="whitespace-nowrap font-medium" />,
    },
    {
      key: 'allocated',
      header: 'Allocated',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => <Money amount={r.allocated} muted={r.allocated === 0} className="whitespace-nowrap" />,
    },
    {
      key: 'unallocated',
      header: 'Unallocated',
      align: 'right',
      hideOnMobile: true,
      cell: (r) => (
        <Money
          amount={r.unallocated}
          muted={r.unallocated === 0}
          className={r.unallocated > 0 ? 'whitespace-nowrap font-medium text-warning' : 'whitespace-nowrap'}
        />
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === 'PDC pending' ? (
          <Button
            size="sm"
            variant="secondary"
            className="whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              setPdc(r);
            }}
          >
            Clear PDC
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Collections"
        description="Customer receipts and their allocation to invoices. Post-dated cheques are held until they clear."
        actions={
          <ButtonLink to="/collections/new" icon={<Plus aria-hidden="true" />}>
            Record collection
          </ButtonLink>
        }
      />
      <Card>
        <ListToolbar
          tabs={statusTabs(STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search receipt, customer, reference…"
        />
        <DataTable
          caption="Collections"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          emptyTitle="No collections match"
          emptyDescription="Try another status or search term."
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

      <Dialog
        open={!!pdc}
        onClose={() => setPdc(null)}
        title={pdc ? `Clear ${pdc.number}?` : 'Clear PDC'}
        description="Confirm the post-dated cheque has been honoured by the bank. The receipt is then allocated oldest invoice first and posted to the bank."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPdc(null)}>
              Cancel
            </Button>
            <Button
              icon={<BadgeCheck aria-hidden="true" />}
              busy={clearPdc.isPending}
              onClick={() =>
                pdc &&
                clearPdc.mutate(pdc.id, {
                  onSuccess: () => {
                    toast({
                      title: `${pdc.number} cleared`,
                      body: 'Allocated to open invoices and posted to bank',
                    });
                    setPdc(null);
                  },
                })
              }
            >
              Mark as cleared
            </Button>
          </>
        }
      >
        {pdc ? (
          <dl className="grid grid-cols-2 gap-3 text-body-s">
            <dt className="text-fg-muted">Customer</dt>
            <dd className="text-right font-medium">{pdc.customerName}</dd>
            <dt className="text-fg-muted">Cheque</dt>
            <dd className="text-right">{pdc.reference}</dd>
            <dt className="text-fg-muted">Cheque date</dt>
            <dd className="text-right">{pdc.chequeDate ? formatDate(pdc.chequeDate) : '—'}</dd>
            <dt className="text-fg-muted">Amount</dt>
            <dd className="text-right">
              <Money amount={pdc.amount} className="font-semibold" />
            </dd>
          </dl>
        ) : null}
      </Dialog>
    </div>
  );
}
