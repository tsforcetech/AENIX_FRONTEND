import { getRouteApi } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate, formatNumber } from '@/shared/utils/format';
import { PrintDocument, printTd, printTh } from '@/features/accounting/PrintDocument';
import { usePurchaseOrder } from './api';

const route = getRouteApi('/_app/purchase-orders/$id/print');

/** X5: printable purchase order (company header, vendor, job, service, amount, VAT, terms). */
export function PurchaseOrderPrintPage() {
  const { id } = route.useParams();
  const { data: po, isLoading, error } = usePurchaseOrder(id);
  if (error) return <StatusMessage kind="error" title="Purchase order not found" />;
  if (isLoading || !po) return <StatusMessage kind="loading" title="Loading purchase order…" />;
  const money = (n: number) => formatNumber(n, 2);
  const vat = Math.round((po.total - po.amount) * 100) / 100;

  return (
    <div className="mx-auto max-w-4xl" data-print-root="">
      <PageHeader
        crumbs={[
          { label: 'Purchase orders', to: '/purchase-orders' },
          { label: po.number, to: `/purchase-orders/${po.id}` },
          { label: 'Print' },
        ]}
        title={`Purchase order ${po.number}`}
        meta={<StatusBadge status={po.status} />}
        actions={
          <Button variant="secondary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <PrintDocument title="Purchase Order" label={`Purchase order ${po.number}`}>
        <section className="flex flex-wrap justify-between gap-6 border-b border-fg/20 py-6 text-[12px]">
          <div className="leading-[1.45]">
            <p className="font-semibold">To: {po.vendorName}</p>
            {po.vendor ? (
              <>
                <p>Vendor code: {po.vendor.code}</p>
                <p>
                  {po.vendor.city}, {po.vendor.country}
                </p>
                <p>
                  Attn: {po.vendor.contactName} · {po.vendor.contactEmail}
                </p>
              </>
            ) : null}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 self-start">
            <dt>PO number:</dt>
            <dd className="font-medium">{po.number}</dd>
            <dt>Issued:</dt>
            <dd>{formatDate(po.issuedAt)}</dd>
            <dt>Job:</dt>
            <dd>{po.jobNumber}</dd>
            {po.salesOrderNumber ? (
              <>
                <dt>Sales order:</dt>
                <dd>{po.salesOrderNumber}</dd>
              </>
            ) : null}
            {po.route ? (
              <>
                <dt>Route / site:</dt>
                <dd>{po.route}</dd>
              </>
            ) : null}
          </dl>
        </section>
        <div className="mt-6 overflow-x-auto" role="region" aria-label="Purchase order lines" tabIndex={0}>
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead>
              <tr>
                <th scope="col" className={printTh}>
                  Service
                </th>
                <th scope="col" className={printTh}>
                  Description
                </th>
                <th scope="col" className={`${printTh} text-right`}>
                  Amount AED
                </th>
                <th scope="col" className={`${printTh} text-right`}>
                  VAT {Math.round(po.vatRate * 100)}%
                </th>
                <th scope="col" className={`${printTh} text-right`}>
                  Total AED
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={printTd}>{po.serviceName}</td>
                <td className={printTd}>{po.description}</td>
                <td className={`${printTd} text-right tabular-nums`}>{money(po.amount)}</td>
                <td className={`${printTd} text-right tabular-nums`}>{money(vat)}</td>
                <td className={`${printTd} text-right font-semibold tabular-nums`}>{money(po.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <section aria-label="Terms" className="mt-8 text-[12px] leading-[1.5]">
          <p className="font-semibold">Terms</p>
          <ol className="ml-4 list-decimal">
            <li>Quote this PO number on your invoice. Invoices without a PO number may be returned.</li>
            <li>
              Payment {po.vendor ? `${po.vendor.paymentTermsDays} days` : 'per agreed terms'} from receipt of
              a valid tax invoice, matched to this PO and the proof of work (GRN, POD or signed completion
              note).
            </li>
            <li>Any change in scope or amount needs a revised PO before the work is done.</li>
          </ol>
        </section>
        <section className="mt-10 grid gap-6 text-[12px] sm:grid-cols-2">
          <div>
            <p className="font-semibold">Authorised by</p>
            <p className="mt-6 border-t border-fg/50 pt-1">Aenix — signature</p>
          </div>
          <div>
            <p className="font-semibold">Accepted by vendor</p>
            <p className="mt-6 border-t border-fg/50 pt-1">Signature & stamp</p>
          </div>
        </section>
      </PrintDocument>
    </div>
  );
}
