import { getRouteApi } from '@tanstack/react-router';
import { Clock3, Printer } from 'lucide-react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import { PrintDocument, printTd, printTh } from '@/features/accounting/PrintDocument';
import { usePayment } from './api';

const route = getRouteApi('/_app/payments/$id');

/** A11 / X5: payment voucher with its approval trail, printable. */
export function PaymentVoucherPage() {
  const { id } = route.useParams();
  const { data: pv, isLoading, error } = usePayment(id);
  if (error) return <StatusMessage kind="error" title="Payment voucher not found" />;
  if (isLoading || !pv) return <StatusMessage kind="loading" title="Loading payment voucher…" />;
  const money = (n: number) => formatNumber(n, 2);

  return (
    <div className="mx-auto max-w-4xl" data-print-root="">
      <PageHeader
        crumbs={[{ label: 'Payments', to: '/payments' }, { label: pv.number }]}
        title={pv.number}
        meta={<StatusBadge status={pv.status} />}
        description={`${pv.vendorName} · ${pv.method}`}
        actions={
          <Button variant="secondary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
            Print voucher
          </Button>
        }
      />
      {pv.status === 'Pending approval' ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-body-s text-warning">
          <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Waiting for approval by the {pv.approval?.approverRole ?? 'approver'}. Nothing is paid or posted
          until it is approved.
        </p>
      ) : null}
      <p className="mb-4 text-caption text-fg-muted">
        Postings are illustrative and pending accountant sign-off.
      </p>
      <PrintDocument title="Payment Voucher" label={`Payment voucher ${pv.number}`}>
        <section className="flex flex-wrap justify-between gap-6 border-b border-fg/20 py-6 text-[12px]">
          <div className="leading-[1.45]">
            <p className="font-semibold">Paid to: {pv.vendor.name}</p>
            <p>Vendor code: {pv.vendor.code}</p>
            <p>
              {pv.vendor.city}, {pv.vendor.country}
            </p>
            <p>Attn: {pv.vendor.contactName}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 self-start">
            <dt>Voucher:</dt>
            <dd className="font-medium">{pv.number}</dd>
            <dt>Date:</dt>
            <dd>{formatDate(pv.date)}</dd>
            <dt>Method:</dt>
            <dd>{pv.method}</dd>
            {pv.chequeNo ? (
              <>
                <dt>Cheque no.:</dt>
                <dd>{pv.chequeNo}</dd>
              </>
            ) : null}
            {pv.chequeDate ? (
              <>
                <dt>Cheque date:</dt>
                <dd>{formatDate(pv.chequeDate)}</dd>
              </>
            ) : null}
            <dt>Reference:</dt>
            <dd>{pv.reference || '—'}</dd>
          </dl>
        </section>
        <div className="mt-6 overflow-x-auto" role="region" aria-label="Bills paid" tabIndex={0}>
          <table className="w-full min-w-[480px] border-collapse text-[12px]">
            <thead>
              <tr>
                <th scope="col" className={printTh}>
                  Purchase invoice
                </th>
                <th scope="col" className={printTh}>
                  Vendor invoice no.
                </th>
                <th scope="col" className={`${printTh} text-right`}>
                  Amount AED
                </th>
              </tr>
            </thead>
            <tbody>
              {pv.bills.map((b) => (
                <tr key={b.id}>
                  <td className={printTd}>{b.number}</td>
                  <td className={printTd}>{b.vendorRef || '—'}</td>
                  <td className={`${printTd} text-right tabular-nums`}>{money(b.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${printTd} text-right font-semibold`} colSpan={2}>
                  Total paid AED
                </td>
                <td className={`${printTd} text-right font-semibold tabular-nums`}>{money(pv.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <section aria-label="Approval and signatures" className="mt-10 grid gap-6 text-[12px] sm:grid-cols-3">
          <div>
            <p className="font-semibold">Prepared by</p>
            <p>{pv.approval?.requestedBy ?? '—'}</p>
          </div>
          <div>
            <p className="font-semibold">Approved by</p>
            <p>
              {pv.approval?.status === 'Approved'
                ? `${pv.approval.decidedBy ?? ''} · ${pv.approval.decidedAt ? formatDateTime(pv.approval.decidedAt) : ''}`
                : pv.approval
                  ? `${pv.approval.status} (${pv.approval.approverRole})`
                  : 'Below the approval limit'}
            </p>
          </div>
          <div>
            <p className="font-semibold">Received by (vendor)</p>
            <p className="mt-6 border-t border-fg/50 pt-1">Signature & stamp</p>
          </div>
        </section>
      </PrintDocument>
    </div>
  );
}
