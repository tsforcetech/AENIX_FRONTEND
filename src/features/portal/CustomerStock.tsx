import { Download } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DocRef } from '@/shared/ui/Money';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import { downloadCsv } from '@/features/audit/csv';
import { exportCustomerStockCsv, useCustomerStock, type CustomerStock } from './api';
import type { StockStatementRow } from './portalLogic';

const stockColumns: Column<StockStatementRow>[] = [
  {
    key: 'sku',
    header: 'SKU',
    cell: (r) => (
      <div>
        <span className="font-mono text-[13px] font-medium">{r.sku}</span>
        <p className="text-caption text-fg-muted">{r.description}</p>
      </div>
    ),
  },
  {
    key: 'batch',
    header: 'Batch',
    hideOnMobile: true,
    cell: (r) => r.batch || <span className="text-fg-muted">—</span>,
  },
  {
    key: 'expiry',
    header: 'Expiry',
    hideOnMobile: true,
    cell: (r) =>
      r.expiry ? (
        <span className="whitespace-nowrap">{formatDate(r.expiry)}</span>
      ) : (
        <span className="text-fg-muted">—</span>
      ),
  },
  {
    key: 'loc',
    header: 'Location',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap">{r.location}</span>,
  },
  {
    key: 'qty',
    header: 'Qty',
    align: 'right',
    cell: (r) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatNumber(r.qty)} {r.uom}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <Badge tone={r.status === 'Available' ? 'success' : 'warning'}>{r.status}</Badge>,
  },
];

type Claim = CustomerStock['claims'][number];
const claimColumns: Column<Claim>[] = [
  {
    key: 'no',
    header: 'Variance',
    cell: (c) => (
      <div>
        <DocRef>{c.number}</DocRef>
        <p className="text-caption text-fg-muted">
          {c.jobRef} · {c.source}
        </p>
      </div>
    ),
  },
  {
    key: 'raised',
    header: 'Raised',
    hideOnMobile: true,
    cell: (c) => <span className="whitespace-nowrap">{formatDate(c.raisedAt)}</span>,
  },
  {
    key: 'qty',
    header: 'Short / damaged',
    align: 'right',
    cell: (c) => (
      <span className="whitespace-nowrap tabular-nums">
        {c.short} short · {c.damaged} damaged
      </span>
    ),
  },
  {
    key: 'outcome',
    header: 'Outcome',
    cell: (c) => (
      <div>
        <span>{c.outcome ?? 'Under review'}</span>
        {c.creditNote ? <p className="text-caption text-fg-muted">Credit note {c.creditNote}</p> : null}
      </div>
    ),
  },
  { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
];

/** Customer portal: stock on hand (downloadable statement) and open variances / claims, read-only. */
export function CustomerStockCard({ partyId }: { partyId: string }) {
  const { data, isLoading } = useCustomerStock(partyId);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const download = async () => {
    setBusy(true);
    try {
      downloadCsv(
        `stock-statement-${new Date().toISOString().slice(0, 10)}.csv`,
        await exportCustomerStockCsv(partyId),
      );
      toast({ title: 'Stock statement downloaded' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Your stock in our warehouse"
          description="Stock on hand by batch, expiry and bin. Quarantined or damaged stock cannot be released until inspected."
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={<Download aria-hidden="true" />}
              busy={busy}
              disabled={!data?.stock.length}
              onClick={() => void download()}
            >
              Download stock statement (CSV)
            </Button>
          }
        />
        <div className="mt-3">
          <DataTable
            caption="Your stock on hand"
            columns={stockColumns}
            rows={data?.stock}
            rowKey={(r) => r.id}
            loading={isLoading}
            emptyTitle="No stock on hand"
          />
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Variances & claims"
          description="Shortages or damage found at receipt or delivery, and how they are being settled. Contact us to discuss."
        />
        <div className="mt-3">
          <DataTable
            caption="Open variances and claims"
            columns={claimColumns}
            rows={data?.claims}
            rowKey={(c) => c.id}
            loading={isLoading}
            emptyTitle="No open variances"
          />
        </div>
      </Card>
    </div>
  );
}
