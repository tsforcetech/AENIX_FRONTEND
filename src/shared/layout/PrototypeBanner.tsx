import { FlaskConical } from 'lucide-react';

/** Always visible in prototype mode so sample data can never be mistaken for live data. */
export function PrototypeBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-surface-inverse px-4 py-1.5 text-center text-caption text-fg-inverse">
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0 text-[#f87171]" />
      <span>
        <strong className="font-semibold">Prototype</strong> · sample data only · not connected to AENIX
        services
      </span>
    </div>
  );
}
