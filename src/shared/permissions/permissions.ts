import type { SessionPrincipal } from '@/shared/auth/session';

/**
 * UX-ONLY permission helpers. Hiding or disabling a control is NOT a security control:
 * Aenix.Api enforces permission + data scope + document state + approval on every call.
 * Codes follow `module.resource.action`; the authoritative list is SEC-001 (pending).
 */
export type PermissionCode = `${string}.${string}.${string}`;

export function hasPermission(principal: SessionPrincipal | undefined, code: PermissionCode): boolean {
  if (!principal) return false;
  return principal.permissions.some(
    (p) => p === '*' || p === code || (p.endsWith('.*') && code.startsWith(p.slice(0, -1))),
  );
}
