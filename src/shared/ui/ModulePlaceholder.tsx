import { Construction } from 'lucide-react';
import { PageHeader } from './PageHeader';

/** Temporary screen for a prototype module that is still being built. */
export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <Construction aria-hidden="true" className="size-8 text-fg-muted" />
        <p className="font-medium">This prototype screen is being built</p>
      </div>
    </div>
  );
}
