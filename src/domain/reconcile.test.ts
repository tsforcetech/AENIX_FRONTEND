import { autoMatchBank, reconcile, type BookItem } from './reconcile';

describe('autoMatchBank', () => {
  const items: BookItem[] = [
    { kind: 'Receipt', id: 'r1', ref: 'RCPT-4401', refs: ['TT-88213'], date: '2026-11-03', amount: 18450 },
    { kind: 'Payment', id: 'p1', ref: 'PV-3301', refs: ['TT771230'], date: '2026-11-09', amount: -7350 },
    { kind: 'Expense', id: 'e1', ref: 'EXP-003', refs: [], date: '2026-11-19', amount: -2310 },
    { kind: 'Receipt', id: 'r2', ref: 'RCPT-4402', refs: [], date: '2026-11-18', amount: 500 },
    { kind: 'Receipt', id: 'r3', ref: 'RCPT-4403', refs: [], date: '2026-11-18', amount: 500 },
  ];
  const line = (id: string, amount: number, reference: string, date = '2026-11-10') => ({
    id,
    amount,
    reference,
    date,
    description: 'Transfer',
  });

  it('matches by amount and reference first', () => {
    const m = autoMatchBank([line('a', 18450, 'TT-88213'), line('b', -7350, 'PV 3301')], items);
    expect(m.map((x) => [x.lineId, x.item.id, x.rule])).toEqual([
      ['a', 'r1', 'Amount + reference'],
      ['b', 'p1', 'Amount + reference'],
    ]);
  });

  it('falls back to a unique amount within the date window, never on ambiguous amounts', () => {
    const m = autoMatchBank(
      [line('c', -2310, 'DD-DEWA', '2026-11-20'), line('d', 500, 'X', '2026-11-18')],
      items,
    );
    expect(m.map((x) => [x.lineId, x.item.id, x.rule])).toEqual([['c', 'e1', 'Amount + date']]);
  });

  it('does not match a different amount', () => {
    expect(autoMatchBank([line('e', 18451, 'TT-88213')], items)).toEqual([]);
  });
});

const pl = [
  { sku: 'A', description: 'Item A', quantity: 10, uom: 'Ctn' },
  { sku: 'B', description: 'Item B', quantity: 5, uom: 'Ctn' },
  { sku: 'C', description: 'Item C', quantity: 2, uom: 'Plt' },
];

describe('reconcile', () => {
  it('flags short, excess, missing, unexpected and damaged lines', () => {
    const r = reconcile(pl, [
      { sku: 'A', qty: 10 },
      { sku: 'B', qty: 4, damaged: 1 },
      { sku: 'X', qty: 3 },
    ]);
    expect(r.rows.map((x) => [x.sku, x.status, x.variance])).toEqual([
      ['A', 'Match', 0],
      ['B', 'Short', -1],
      ['C', 'Not received', -2],
      ['X', 'Not expected', 3],
    ]);
    expect(r.mismatches).toBe(3);
    expect(r.ok).toBe(false);
  });

  it('is ok when everything matches', () => {
    expect(
      reconcile(
        pl,
        pl.map((l) => ({ sku: l.sku, qty: l.quantity })),
      ).ok,
    ).toBe(true);
  });

  it('counts damage on a matching line as a mismatch', () => {
    expect(reconcile(pl.slice(0, 1), [{ sku: 'A', qty: 10, damaged: 2 }]).ok).toBe(false);
  });
});
