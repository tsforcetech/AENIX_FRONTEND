import type { ReactNode } from 'react';
import { useSession } from '@/shared/auth/session';
import { hasPermission, type PermissionCode } from './permissions';

/** Show children only when the session lists the permission (UX affordance only). */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionCode;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { principal } = useSession();
  return <>{hasPermission(principal, permission) ? children : fallback}</>;
}
