import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { PencilLine, Plus, Power, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { inputClasses } from '@/shared/ui/Field';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { formatMoney } from '@/shared/utils/format';
import { useServices, useSetServiceActive, type ServiceRow } from './api';
import { BuyingRatesTab } from './BuyingRatesTab';
import type { ServicesTab } from './routes';
import { SellingRatesTab } from './SellingRatesTab';
import { ServiceDialog } from './ServiceDialog';

const route = getRouteApi('/_app/services');

const serviceColumns = (
  onEdit: (s: ServiceRow) => void,
  onToggle: (s: ServiceRow) => void,
  busyId?: string,
): Column<ServiceRow>[] => [
  { key: 'code', header: 'Code', cell: (s) => <DocRef>{s.code}</DocRef> },
  {
    key: 'name',
    header: 'Service',
    cell: (s) => (
      <div className="min-w-40">
        <span className="font-medium">{s.name}</span>
        {s.isDisbursement || s.isSurcharge || s.minimumCharge ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {s.isDisbursement ? (
              <Badge tone="info" dot={false}>
                Disbursement — at cost
              </Badge>
            ) : null}
            {s.isSurcharge ? (
              <Badge tone="warning" dot={false}>
                Surcharge — customer approval
              </Badge>
            ) : null}
            {s.minimumCharge ? (
              <Badge tone="neutral" dot={false}>
                Min. charge {formatMoney(s.minimumCharge)}
              </Badge>
            ) : null}
          </span>
        ) : null}
        {s.description ? (
          <span className="mt-1 block text-caption text-fg-muted">{s.description}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'type',
    header: 'Service type',
    cell: (s) => (
      <Badge tone="neutral" dot={false}>
        {s.serviceTypeName}
      </Badge>
    ),
  },
  { key: 'unit', header: 'Unit', cell: (s) => s.unit },
  { key: 'tax', header: 'Tax code', hideOnMobile: true, cell: (s) => s.taxCodeName },
  {
    key: 'ledgers',
    header: 'Ledgers',
    hideOnMobile: true,
    cell: (s) => (
      <span className="block text-caption text-fg-muted">
        <span className="block whitespace-nowrap">Income {s.incomeAccountLabel}</span>
        <span className="block whitespace-nowrap">Cost {s.costAccountLabel}</span>
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (s) => (
      <Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>
    ),
  },
  {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    align: 'right',
    cell: (s) => (
      <span className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={<PencilLine aria-hidden="true" />}
          aria-label={`Edit ${s.name}`}
          onClick={() => onEdit(s)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          busy={busyId === s.id}
          icon={s.isActive ? <Power aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
          aria-label={`${s.isActive ? 'Deactivate' : 'Reactivate'} ${s.name}`}
          onClick={() => onToggle(s)}
        >
          {s.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </span>
    ),
  },
];

export function ServicesPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/services' });
  const tab: ServicesTab = search.tab ?? 'services';
  const setTab = (t: string) =>
    void navigate({
      search: () => ({ tab: t === 'services' ? undefined : (t as ServicesTab) }),
      replace: true,
    });
  const services = useServices();
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const toggle = useSetServiceActive();
  const toast = useToast();
  const all = services.data ?? [];
  const rows = all.filter((s) =>
    statusFilter === 'all' ? true : statusFilter === 'active' ? s.isActive : !s.isActive,
  );

  const onToggle = (s: ServiceRow) =>
    toggle.mutate(
      { id: s.id, active: !s.isActive },
      {
        onSuccess: () =>
          toast({
            title: `${s.name} ${s.isActive ? 'deactivated' : 'reactivated'}`,
            body: s.isActive
              ? 'It is no longer offered on new quotations, orders or jobs. Existing documents keep it.'
              : 'It is offered again on new quotations, orders and jobs.',
          }),
        onError: (e) => toast({ title: 'Could not change the status', body: e.message }),
      },
    );

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Masters', to: '/masters' }, { label: 'Services & rates' }]}
        title="Services & rates"
        description="What we sell, what vendors charge us (buying rates) and what we charge customers (selling rates). Quotations and orders price from these."
        actions={
          tab === 'services' ? (
            <Button icon={<Plus aria-hidden="true" />} onClick={() => setEditing('new')}>
              New service
            </Button>
          ) : null
        }
      />
      <Tabs
        label="Services and rates"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'services', label: 'Services', count: all.filter((s) => s.isActive).length },
          { value: 'buying', label: 'Buying rates' },
          { value: 'selling', label: 'Selling rates' },
        ]}
      />
      {tab === 'services' ? (
        <Card>
          <CardHeader
            title="Service catalogue"
            description={`${rows.length} of ${all.length} services`}
            actions={
              <div className="w-full sm:w-44">
                <label className="sr-only" htmlFor="service-status-filter">
                  Show services
                </label>
                <select
                  id="service-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className={`${inputClasses} h-9`}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
              </div>
            }
          />
          <div className="mt-3">
            <DataTable
              caption="Service catalogue"
              columns={serviceColumns(
                setEditing,
                onToggle,
                toggle.isPending ? toggle.variables?.id : undefined,
              )}
              rows={rows}
              rowKey={(s) => s.id}
              loading={services.isLoading}
              error={services.error}
              emptyTitle={statusFilter === 'inactive' ? 'No inactive services' : 'No services'}
            />
          </div>
        </Card>
      ) : null}
      {tab === 'buying' ? (
        <BuyingRatesTab
          vendorId={search.vendorId}
          onVendorChange={(vendorId) =>
            void navigate({ search: (p) => ({ ...p, vendorId: vendorId || undefined }), replace: true })
          }
        />
      ) : null}
      {tab === 'selling' ? (
        <SellingRatesTab
          customerId={search.customerId}
          onCustomerChange={(customerId) =>
            void navigate({ search: (p) => ({ ...p, customerId: customerId || undefined }), replace: true })
          }
        />
      ) : null}
      {editing ? (
        <ServiceDialog service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
