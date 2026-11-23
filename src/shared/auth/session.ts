import { PROTOTYPE_MODE } from '@/prototype/config';
import { protoDb, useProtoDb } from '@/prototype/store';

/**
 * Session contract — INTERFACE + PROTOTYPE ADAPTER ONLY.
 * ADR-004 / SEC-001 are PROPOSED; cookie+CSRF vs bearer/refresh is undecided, so no real
 * sign-in, token storage or session scheme exists. Outside prototype mode the session is
 * `unavailable` and protected routes deny by default.
 */
export type SessionStatus = 'unavailable' | 'anonymous' | 'authenticated';
export type ActorType = 'staff' | 'customer' | 'vendor';

export interface SessionPrincipal {
  /** Opaque, server-issued identifiers. Party binding is server-side only. */
  userId: string;
  displayName: string;
  email: string;
  role: string;
  actorType: ActorType;
  /** Prototype only: which customer/vendor a portal persona represents. */
  partyId?: string;
  /** `module.resource.action` codes, for UX visibility only — never authorization. */
  permissions: readonly string[];
  prototype: true;
}

export interface SessionState {
  status: SessionStatus;
  principal?: SessionPrincipal;
}

export function useSession(): SessionState {
  const principal = useProtoDb((db) => db.session);
  if (!PROTOTYPE_MODE) return { status: 'unavailable' };
  return principal ? { status: 'authenticated', principal } : { status: 'anonymous' };
}

const PROTOTYPE_PERSONAS: Record<ActorType, Omit<SessionPrincipal, 'email'>> = {
  staff: {
    userId: 'proto-staff',
    displayName: 'Aisha Khan',
    role: 'Operations manager',
    actorType: 'staff',
    permissions: ['*'],
    prototype: true,
  },
  customer: {
    userId: 'proto-customer',
    displayName: 'Priya Menon',
    role: 'Customer portal · Coral Bay Trading LLC',
    actorType: 'customer',
    partyId: 'cus-2',
    permissions: ['portal.customer.*'],
    prototype: true,
  },
  vendor: {
    userId: 'proto-vendor',
    displayName: 'Imran Shaikh',
    role: 'Vendor portal · Swift Haul Transport LLC',
    actorType: 'vendor',
    partyId: 'ven-1',
    permissions: ['portal.vendor.*'],
    prototype: true,
  },
};

/** PROTOTYPE sign-in: accepts any credentials and selects a persona. Never a real login. */
export function prototypeSignIn(email: string, actorType: ActorType): SessionPrincipal {
  if (!PROTOTYPE_MODE) throw new Error('Sign-in is unavailable: identity contract pending (ADR-004).');
  const principal: SessionPrincipal = { ...PROTOTYPE_PERSONAS[actorType], email };
  protoDb.update((db) => ({ ...db, session: principal }));
  return principal;
}

export function signOut(): void {
  protoDb.update((db) => ({ ...db, session: null }));
}
