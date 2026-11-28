import type { ReactNode } from 'react';
import { useProtoDb } from '@/prototype/store';
import { Card } from '@/shared/ui/Card';
import { Logo } from '@/shared/ui/Logo';

/**
 * X5 printable document frame (company header, title, footer) used by the payment voucher and the
 * purchase order. The official PDF and numbering come from the AENIX backend.
 */
export function PrintDocument({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: ReactNode;
}) {
  const company = useProtoDb((db) => db.company);
  return (
    <Card className="overflow-hidden">
      <article aria-label={label} className="bg-white px-6 pb-8 pt-4 text-[13px] text-[#1a1a1a] sm:px-10">
        <p className="text-right text-caption">{company.website}</p>
        <div aria-hidden="true" className="mt-2 h-2 bg-[#9a2119]" />
        <header className="flex flex-wrap items-start justify-between gap-6 pt-6">
          <div>
            <Logo height={44} />
            <p className="mt-1 text-[10px] font-semibold">{company.tagline}</p>
          </div>
          <div className="max-w-xs text-[11px] leading-[1.35]">
            <p className="text-[13px] font-semibold text-[#9a2119]">{company.legalName}</p>
            {company.officeAddress.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>
              Tel: {company.phone} &nbsp; Email: {company.email}
            </p>
            <p className="mt-1 text-[#9a2119]">TRN: {company.trn}</p>
          </div>
        </header>
        <h2 className="mt-8 border-b border-fg/60 pb-2 text-center text-[14px] font-semibold text-[#9a2119]">
          {title}
        </h2>
        {children}
        <footer className="mt-12 flex flex-wrap justify-between gap-2 text-[11px] text-fg-secondary">
          <span>© 2026 {company.legalName}. All rights reserved.</span>
          <span>System-generated document.</span>
        </footer>
        <p className="mt-4 rounded bg-surface-muted px-3 py-2 text-caption text-fg-muted">
          Prototype — sample data. The official PDF, stamp and numbering are produced by the AENIX backend.
        </p>
      </article>
    </Card>
  );
}

export const printTh = 'border border-fg/70 px-2 py-1.5 text-left font-semibold';
export const printTd = 'border border-fg/70 px-2 py-1.5';
