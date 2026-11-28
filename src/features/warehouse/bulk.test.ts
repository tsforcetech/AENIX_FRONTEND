import { describe, expect, it } from 'vitest';
import { rowsToDocLines, rowsToGrnLines, rowsToPodLines, totalUnits } from './bulk';

describe('bulk Excel upload rows', () => {
  it('merges product list rows by SKU and batch and skips empty rows', () => {
    const lines = rowsToDocLines([
      { sku: 'abc-1', description: 'Coat', quantity: 10, uom: 'Pcs', batch: 'B1', cbm: 0.5 },
      { sku: 'ABC-1', quantity: '5', batch: 'B1', cbm: 0.25 },
      { sku: 'ABC-1', quantity: 3, batch: 'B2' },
      { sku: '', quantity: 9 },
      { sku: 'X', quantity: 0 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      sku: 'ABC-1',
      quantity: 15,
      batch: 'B1',
      cbm: 0.75,
      description: 'Coat',
    });
    expect(totalUnits(lines)).toBe(18);
  });
  it('builds GRN lines with damaged quantities and remarks', () => {
    const lines = rowsToGrnLines([
      { sku: 'A', receivedQty: 8, damagedQty: 1, remarks: 'torn' },
      { sku: 'a', receivedQty: '2', remarks: 'wet' },
    ]);
    expect(lines).toEqual([
      expect.objectContaining({ sku: 'A', receivedQty: 10, damagedQty: 1, remarks: 'torn; wet' }),
    ]);
  });
  it('builds POD lines', () => {
    expect(
      rowsToPodLines([
        { sku: 'a', deliveredQty: 4 },
        { sku: 'A', deliveredQty: '1,000' },
      ]),
    ).toEqual([{ sku: 'A', deliveredQty: 1004, remarks: undefined }]);
  });
});
