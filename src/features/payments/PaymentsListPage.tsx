import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { BadgeCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import type { VendorPayment } from '@/domain/types';
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
import { usePayments, usePresentPdc, type PaymentRow } from './api';

const route = getRouteApi('/_app/payments');
const STATUSES: VendorPayment['status'][] = ['Pending approval', 'Posted', 'PDC issued', 'Cancelled'];

export function PaymentsListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/payments' });
  const toast = useToast();
  const { data, isLoading, isFetching, error } = usePayments({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  const present = usePresentPdc();
  const [pdc, setPdc] = useState<PaymentRow | null>(null);

  const columns: Column<PaymentRow>[] = [
    {
      key: 'number',
      header: 'Payment',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.vendorName}</p>
          <p className="font-mono text-caption text-fg-muted">{r.billNumbers.join(', ')}</p>
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
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) =>
        r.status === 'PDC issued' ? (
          <Button
            size="sm"
            variant="secondary"
            className="whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              setPdc(r);
            }}
          >
            Mark presented
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Payment vouchers to vendors, allocated to approved purchase invoices. Issued PDCs stay open until the cheque is presented."
        actions={
          <ButtonLink to="/payments/new" icon={<Plus aria-hidden="true" />}>
            New payment
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
          searchPlaceholder="Search payment, vendor, bill, reference…"
        />
        <DataTable
          caption="Payments"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          onRowClick={(r) => void navigate({ to: '/payments/$id', params: { id: r.id } })}
          loading={isLoading || isFetching}
          error={error}
          emptyTitle="No payments match"
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
        title={pdc ? `Mark ${pdc.number} presented?` : 'Mark presented'}
        description="Confirm the bank has paid the post-dated cheque. The amount then leaves the bank account."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPdc(null)}>
              Cancel
            </Button>
            <Button
              icon={<BadgeCheck aria-hidden="true" />}
              busy={present.isPending}
              onClick={() =>
                pdc &&
                present.mutate(pdc.id, {
                  onSuccess: () => {
                    toast({ title: `${pdc.number} presented`, body: 'Posted to the bank' });
                    setPdc(null);
                  },
                })
              }
            >
              Mark presented
            </Button>
          </>
        }
      >
        {pdc ? (
          <p className="text-body-s">
            {pdc.vendorName} · <Money amount={pdc.amount} className="font-semibold" />
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
