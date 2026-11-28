import { PERMISSION_ACTIONS, PERMISSION_MODULES, PROPOSED_ROLES, ROLE_PERMISSIONS, roleCan } from './roles';

describe('ROLE_PERMISSIONS proposal (X1, UX only)', () => {
  it('covers every proposed role with well-formed codes', () => {
    for (const role of PROPOSED_ROLES) {
      const list = ROLE_PERMISSIONS[role];
      expect(list.length).toBeGreaterThan(0);
      for (const c of list)
        expect(c === '*' || /^[a-z]+\.[a-z]+\.(view|create|approve|post)$/.test(c)).toBe(true);
    }
  });

  it('gives Manager / Admin everything', () => {
    for (const m of PERMISSION_MODULES)
      for (const a of PERMISSION_ACTIONS) expect(roleCan('Manager / Admin', m.code, a)).toBe(true);
  });

  it('never lets portal roles post or reach accounting and settings', () => {
    for (const role of ['Customer portal', 'Vendor portal'] as const) {
      for (const m of PERMISSION_MODULES) expect(roleCan(role, m.code, 'post')).toBe(false);
      expect(roleCan(role, 'finance.journal', 'view')).toBe(false);
      expect(roleCan(role, 'admin.settings', 'view')).toBe(false);
    }
  });

  it('keeps posting of invoices with Finance and the manager only', () => {
    expect(PROPOSED_ROLES.filter((r) => roleCan(r, 'billing.invoice', 'post'))).toEqual([
      'Finance',
      'Manager / Admin',
    ]);
    expect(roleCan('Sales', 'finance.journal', 'post')).toBe(false);
    expect(roleCan('Warehouse', 'warehouse.stock', 'post')).toBe(true);
  });

  it('every other action implies view on the same module', () => {
    for (const role of PROPOSED_ROLES)
      for (const m of PERMISSION_MODULES)
        if (PERMISSION_ACTIONS.some((a) => a !== 'view' && roleCan(role, m.code, a)))
          expect(roleCan(role, m.code, 'view')).toBe(true);
  });
});
