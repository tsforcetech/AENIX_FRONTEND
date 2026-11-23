import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useSession, type SessionPrincipal } from './session';

/** Deny-by-default route boundary. Renders children only for an authenticated session. */
export function RequireSession({
  children,
}: {
  children: ReactNode | ((principal: SessionPrincipal) => ReactNode);
}) {
  const session = useSession();
  if (session.status === 'authenticated' && session.principal) {
    return <>{typeof children === 'function' ? children(session.principal) : children}</>;
  }
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-16">
      <StatusMessage
        kind="denied"
        title="Access unavailable"
        description="Sign-in is not available yet. The approved identity contract is pending."
      />
    </main>
  );
}
