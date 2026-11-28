import { AlertTriangle, Printer } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { SelectField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import { useVatReturn } from './closing';

type Q = 1 | 2 | 3 | 4;

/** A12 VAT return — UAE FTA Form 201 style DRAFT. The accountant reviews and files on the FTA portal. */
export function VatReturnPage() {
  const thisYear = Number(PROTO_TODAY.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState<Q>((Math.floor((Number(PROTO_TODAY.slice(5, 7)) - 1) / 3) + 1) as Q);
  const { data, isLoading, error } = useVatReturn(year, quarter);
  const td = 'px-4 py-2.5';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        crumbs={[{ label: 'Accounting', to: '/accounting' }, { label: 'VAT return' }]}
        title="VAT return (draft)"
        description="Summary in the FTA Form 201 layout, built from posted invoices, credit notes, vendor bills and expenses."
        actions={
          <Button variant="secondary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
            Print draft
          </Button>
        }
      />
      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-subtle p-4 text-body-s text-warning"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong className="font-semibold">Draft — accountant to file.</strong> Classification is
          illustrative and pending accountant sign-off. Nothing is submitted to the FTA from AENIX.
        </p>
      </div>
      <Card className="mb-6">
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Year"
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            options={[thisYear - 1, thisYear].map((y) => ({ value: String(y), label: String(y) }))}
          />
          <SelectField
            label="Quarter"
            value={String(quarter)}
            onChange={(e) => setQuarter(Number(e.target.value) as Q)}
            options={[
              { value: '1', label: 'Q1 (Jan–Mar)' },
              { value: '2', label: 'Q2 (Apr–Jun)' },
              { value: '3', label: 'Q3 (Jul–Sep)' },
              { value: '4', label: 'Q4 (Oct–Dec)' },
            ]}
          />
          {data ? (
            <p className="self-end pb-2 text-body-s text-fg-muted">
              {formatDate(data.from)} – {formatDate(data.to)} · {data.invoiceCount} invoice(s)
            </p>
          ) : null}
        </CardBody>
      </Card>
      {error ? (
        <StatusMessage kind="error" title="Could not build the VAT return" />
      ) : isLoading || !data ? (
        <StatusMessage kind="loading" title="Building the VAT return…" />
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader title="VAT on sales and all other outputs" />
            <div className="overflow-x-auto" role="region" aria-label="VAT on sales" tabIndex={0}>
              <table className="w-full text-left text-body-s">
                <caption className="sr-only">VAT on sales and other outputs</caption>
                <thead>
                  <tr className="border-y border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className={`${td} font-medium`}>
                      Box
                    </th>
                    <th scope="col" className={`${td} text-right font-medium`}>
                      Amount (AED)
                    </th>
                    <th scope="col" className={`${td} text-right font-medium`}>
                      VAT (AED)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.box1.map((r, i) => (
                    <tr key={r.emirate} className="border-b border-border-subtle">
                      <th scope="row" className={`${td} font-normal`}>
                        1{String.fromCharCode(97 + i)} Standard-rated supplies in {r.emirate}
                      </th>
                      <td className={`${td} text-right`}>
                        <Money amount={r.amount} muted={r.amount === 0} />
                      </td>
                      <td className={`${td} text-right`}>
                        <Money amount={r.vat} muted={r.vat === 0} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-border-subtle">
                    <th scope="row" className={`${td} font-normal`}>
                      4 Zero-rated supplies (incl. customers outside the UAE)
                    </th>
                    <td className={`${td} text-right`}>
                      <Money amount={data.zeroRated} />
                    </td>
                    <td className={`${td} text-right text-fg-muted`}>—</td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <th scope="row" className={`${td} font-normal`}>
                      5 Exempt supplies
                    </th>
                    <td className={`${td} text-right`}>
                      <Money amount={data.exempt} muted />
                    </td>
                    <td className={`${td} text-right text-fg-muted`}>—</td>
                  </tr>
                  <tr className="border-b border-border-subtle">
                    <th scope="row" className={`${td} font-normal`}>
                      Out of scope — disbursements rebilled at cost (not on the return)
                    </th>
                    <td className={`${td} text-right`}>
                      <Money amount={data.outOfScope} />
                    </td>
                    <td className={`${td} text-right text-fg-muted`}>—</td>
                  </tr>
                  <tr className="font-semibold">
                    <th scope="row" className={td}>
                      8 Total standard-rated outputs
                    </th>
                    <td className={`${td} text-right`}>
                      <Money amount={data.standardTotal.amount} />
                    </td>
                    <td className={`${td} text-right`}>
                      <Money amount={data.standardTotal.vat} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {data.creditNoteAdjustment.amount ? (
              <p className="px-5 pb-4 text-caption text-fg-muted">
                Box 1 is net of credit notes: <Money amount={data.creditNoteAdjustment.amount} /> (VAT{' '}
                <Money amount={data.creditNoteAdjustment.vat} />
                ).
              </p>
            ) : null}
          </Card>
          <Card className="mb-6">
            <CardHeader title="VAT on expenses and all other inputs" />
            <CardBody>
              <dl className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2 text-body-s">
                <dt>
                  9 Standard-rated expenses
                  <span className="block text-caption text-fg-muted">
                    {data.box9.bills} vendor bill(s), {data.box9.expenses} expense(s)
                  </span>
                </dt>
                <dd className="text-right">
                  <Money amount={data.box9.amount} />
                </dd>
                <dd className="text-right">
                  <Money amount={data.box9.vat} />
                </dd>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-body-s text-fg-muted">
                  {data.netVatDue >= 0 ? '14 Net VAT payable' : '14 Net VAT refundable'} (Box 8 VAT − Box 9
                  VAT)
                </p>
                <p className="text-[26px] font-semibold tracking-tight">
                  <Money amount={Math.abs(data.netVatDue)} />
                </p>
              </div>
              <p className="max-w-sm text-caption text-fg-muted">Draft — accountant to file.</p>
            </CardBody>
            {data.warnings.length ? (
              <ul className="space-y-1 border-t border-border-subtle px-5 py-4 text-caption text-warning">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
