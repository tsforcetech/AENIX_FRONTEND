import { formatDate, formatMoney } from '@/shared/utils/format';
import type { CustomerDetail } from './api';

/**
 * FLOW-003 X5 (part): print-only statement of account. Hidden on screen; when the user prints,
 * everything else on the page is hidden and only this sheet is printed.
 */
export const STATEMENT_PRINT_ID = 'customer-statement-print';

const PRINT_CSS = `
@media screen { #${STATEMENT_PRINT_ID} { display: none; } }
@media print {
  body * { visibility: hidden !important; }
  #${STATEMENT_PRINT_ID}, #${STATEMENT_PRINT_ID} * { visibility: visible !important; }
  #${STATEMENT_PRINT_ID} { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 12mm; background: #fff; color: #000; }
  @page { size: A4; margin: 10mm; }
}`;

export function PrintableStatement({ data }: { data: CustomerDetail }) {
  const { customer: c, statement, company, balance, statementDate } = data;
  const closing = statement.length ? statement[statement.length - 1]!.balance : 0;
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div id={STATEMENT_PRINT_ID} aria-hidden="true" className="text-[12px] leading-5">
        <header className="flex items-start justify-between border-b border-black pb-3">
          <div>
            <p className="text-[16px] font-semibold">{company.legalName}</p>
            {company.officeAddress.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>
              TRN {company.trn} · {company.phone} · {company.email}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[16px] font-semibold uppercase tracking-wide">Statement of account</p>
            <p>As of {formatDate(statementDate)}</p>
            <p>Currency: AED</p>
          </div>
        </header>
        <section className="flex justify-between py-3">
          <div>
            <p className="font-semibold">{c.name}</p>
            <p>{c.postalAddress ?? `${c.city}, ${c.country}`}</p>
            <p>
              {c.code} · TRN {c.trnMasked}
            </p>
          </div>
          <div className="text-right">
            <p>Payment terms: {c.paymentTermsDays} days</p>
            <p>Credit limit: {formatMoney(c.creditLimit)}</p>
          </div>
        </section>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-black">
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Reference</th>
              <th className="py-1 pr-2">Details</th>
              <th className="py-1 pr-2 text-right">Debit</th>
              <th className="py-1 pr-2 text-right">Credit</th>
              <th className="py-1 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3">
                  No posted invoices or receipts.
                </td>
              </tr>
            ) : (
              statement.map((l) => (
                <tr key={l.id} className="border-b border-gray-300">
                  <td className="py-1 pr-2 whitespace-nowrap">{formatDate(l.date)}</td>
                  <td className="py-1 pr-2">{l.type}</td>
                  <td className="py-1 pr-2 font-mono">{l.reference}</td>
                  <td className="py-1 pr-2">{l.description}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.debit ? formatMoney(l.debit) : ''}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {l.credit ? formatMoney(l.credit) : ''}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(l.balance)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-black font-semibold">
              <td colSpan={6} className="py-1 pr-2 text-right">
                Closing balance
              </td>
              <td className="py-1 text-right tabular-nums">{formatMoney(closing)}</td>
            </tr>
          </tfoot>
        </table>
        <section className="mt-4 grid grid-cols-3 gap-2">
          <p>Outstanding invoices: {formatMoney(balance.outstanding)}</p>
          <p>Advances / unallocated: {formatMoney(balance.advances + balance.unallocated)}</p>
          <p>PDC pending: {formatMoney(balance.pdcPending)}</p>
        </section>
        <p className="mt-6 text-[11px]">
          Please check this statement and tell us of any difference within 15 days. Bank details for payment
          are on each tax invoice.
        </p>
      </div>
    </>
  );
}
