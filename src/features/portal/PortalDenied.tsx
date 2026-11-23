import { StatusMessage } from '@/shared/ui/StatusMessage';

/** Shown when the signed-in persona is not the portal's party type (deny by default). */
export function PortalDenied({ kind }: { kind: 'customer' | 'vendor' }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <StatusMessage
        kind="denied"
        title="Access denied"
        description={`This area is only available to signed-in ${kind} portal users. Your account is not linked to a ${kind}.`}
      />
    </div>
  );
}
