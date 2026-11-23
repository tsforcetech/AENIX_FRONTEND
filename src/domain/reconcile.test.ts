import { reconcile } from './reconcile';

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
