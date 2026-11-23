import { getRouteApi, Link } from '@tanstack/react-router';
import { FileText, ShoppingCart, XCircle } from 'lucide-react';
import { jobKindLabel } from '@/domain/workflow';
import { locationLabel } from '@/features/sales-orders/commercial-ui';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef } from '@/shared/ui/Money';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { lookupName } from '@/shared/data/lookups';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { useEnquiry, useSetEnquiryStatus } from './api';

const route = getRouteApi('/_app/enquiries/$id');

export function EnquiryDetailPage() {
  const { id } = route.useParams();
  const { data: e, isLoading, error } = useEnquiry(id);
  const setStatus = useSetEnquiryStatus();
  const toast = useToast();

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Enquiry not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !e) return <StatusMessage kind="loading" title="Loading enquiry…" />;

  const open = e.status === 'New' || e.status === 'Quoting' || e.status === 'Quoted';

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: e.number }]}
        title={e.number}
        meta={<StatusBadge status={e.status} />}
        description={`${e.customerName} · logged ${formatDateTime(e.createdAt)} by ${e.owner}`}
        actions={
          open ? (
            <>
              <Button
                variant="ghost"
                icon={<XCircle aria-hidden="true" />}
                busy={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate(
                    { id: e.id, status: 'Lost' },
                    { onSuccess: () => toast({ title: `${e.number} marked lost` }) },
                  )
                }
              >
                Mark lost
              </Button>
              <ButtonLink
                to="/sales-orders/new"
                search={{ enquiryId: e.id }}
                variant="secondary"
                icon={<ShoppingCart aria-hidden="true" />}
              >
                Create sales order (direct)
              </ButtonLink>
              <ButtonLink
                to="/quotations/new"
                search={{ enquiryId: e.id }}
                icon={<FileText aria-hidden="true" />}
              >
                Create quotation
              </ButtonLink>
            </>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={`${jobKindLabel(e.serviceCategory, e.mode)} request`} />
            <CardBody>
              <div className="mb-6 flex items-center gap-4 rounded-xl bg-canvas p-4">
                <span className="grid size-11 place-items-center rounded-xl bg-surface text-fg-secondary shadow-card">
                  <JobKindIcon category={e.serviceCategory} mode={e.mode} className="size-5" />
                </span>
                {e.serviceCategory === 'Transport' ? (
                  <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1">
                    <div>
                      <p className="text-caption text-fg-muted">From</p>
                      <p className="font-semibold">{e.origin}</p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="hidden h-px flex-1 border-t-2 border-dashed border-border sm:block"
                    />
                    <div>
                      <p className="text-caption text-fg-muted">To</p>
                      <p className="font-semibold">{e.destination}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1">
                    <p className="text-caption text-fg-muted">{locationLabel(e.serviceCategory)}</p>
                    <p className="font-semibold">{e.origin}</p>
                  </div>
                )}
              </div>
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Service type', value: jobKindLabel(e.serviceCategory, e.mode) },
                  { label: 'Required by', value: formatDate(e.requiredBy) },
                  {
                    label: e.serviceCategory === 'Warehouse' ? 'Handling unit' : 'Equipment',
                    value: e.cargo.equipment,
                  },
                  {
                    label: e.serviceCategory === 'Service' ? 'Service' : 'Goods',
                    value: e.cargo.description,
                  },
                  { label: 'Packages', value: formatNumber(e.cargo.packages) },
                  {
                    label: 'Weight / volume',
                    value:
                      e.cargo.weightKg || e.cargo.volumeCbm
                        ? `${formatNumber(e.cargo.weightKg)} kg · ${e.cargo.volumeCbm} cbm`
                        : '—',
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Services requested" />
            <CardBody className="flex flex-wrap gap-2">
              {e.serviceIds.map((s) => (
                <span key={s} className="rounded-full border border-border bg-canvas px-3 py-1 text-body-s">
                  {lookupName.service(s)}
                </span>
              ))}
            </CardBody>
          </Card>
          {e.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <CardBody className="whitespace-pre-wrap text-body-s text-fg-secondary">{e.notes}</CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Quotations" description="Versions prepared for this enquiry" />
            <CardBody>
              {e.quotations.length === 0 ? (
                <p className="text-body-s text-fg-muted">
                  No quotation yet. Create one, or confirm a sales order directly if an authorised rate
                  already applies.
                </p>
              ) : (
                <ul className="space-y-2">
                  {e.quotations.map((q) => (
                    <li key={q.id}>
                      <Link
                        to="/quotations/$id"
                        params={{ id: q.id }}
                        className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                      >
                        <span>
                          <DocRef>{q.number}</DocRef>{' '}
                          <span className="text-caption text-fg-muted">v{q.version}</span>
                        </span>
                        <StatusBadge status={q.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Sales orders" description="Confirmed orders raised from this enquiry" />
            <CardBody>
              {e.salesOrders.length === 0 ? (
                <p className="text-body-s text-fg-muted">No sales order yet.</p>
              ) : (
                <ul className="space-y-2">
                  {e.salesOrders.map((so) => (
                    <li key={so.id}>
                      <Link
                        to="/sales-orders/$id"
                        params={{ id: so.id }}
                        className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                      >
                        <DocRef>{so.number}</DocRef>
                        <StatusBadge status={so.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Customer" />
            <CardBody>
              <Link
                to="/customers/$id"
                params={{ id: e.customerId }}
                className="font-medium text-fg hover:text-brand hover:underline"
              >
                {e.customerName}
              </Link>
              <p className="mt-1 text-caption text-fg-muted">Owner: {e.owner}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
