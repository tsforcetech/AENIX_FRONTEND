import type { SessionPrincipal } from '@/shared/auth/session';
import { hasPermission } from './permissions';

const p = (permissions: string[]): SessionPrincipal => ({
  userId: 'u',
  displayName: 'U',
  email: 'u@example.com',
  role: 'r',
  actorType: 'staff',
  permissions,
  prototype: true,
});

describe('hasPermission (UX only)', () => {
  it('matches exact, wildcard and module wildcard codes', () => {
    expect(hasPermission(p(['jobs.workorder.create']), 'jobs.workorder.create')).toBe(true);
    expect(hasPermission(p(['*']), 'billing.invoice.post')).toBe(true);
    expect(hasPermission(p(['portal.customer.*']), 'portal.customer.approve')).toBe(true);
    expect(hasPermission(p(['portal.customer.*']), 'billing.invoice.post')).toBe(false);
    expect(hasPermission(undefined, 'billing.invoice.post')).toBe(false);
  });
});
