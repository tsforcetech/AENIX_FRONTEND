import { guessMapping, parseCsv, parseNumber, PL_FIELDS, GRN_FIELDS } from './SpreadsheetImport';

describe('spreadsheet import helpers', () => {
  it('parses CSV with quotes, escaped quotes, semicolons and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('SKU;Qty\nA;1')).toEqual([
      ['SKU', 'Qty'],
      ['A', '1'],
    ]);
  });

  it('parses formatted numbers', () => {
    expect(parseNumber('1,250')).toBe(1250);
    expect(parseNumber(' 12.5 pcs')).toBe(12.5);
    expect(parseNumber('n/a')).toBeNull();
  });

  it('guesses columns from customer headers and prefers a saved mapping', () => {
    const headers = ['Item Code', 'Item Description', 'Qty (Pcs)', 'UOM', 'Carton No'];
    expect(guessMapping(headers, PL_FIELDS)).toEqual({ sku: 0, description: 1, quantity: 2, uom: 3 });
    const saved = { sku: 'Carton No' };
    expect(guessMapping(headers, PL_FIELDS, saved).sku).toBe(4);
    expect(guessMapping(['Code', 'Received', 'Damaged', 'Remarks'], GRN_FIELDS)).toEqual({
      sku: 0,
      receivedQty: 1,
      damagedQty: 2,
      remarks: 3,
    });
  });
});

describe('owner document formats', () => {
  it('maps the RHS Logistics "Received Goods Report" columns', () => {
    const rhs = [
      'SKU',
      'Description',
      'Qty Exp',
      'Qty Rec',
      'Dam Qty',
      'Item Cube',
      'Item Cube *Qtyrecevd',
      'Prod. Date',
      'Expiry Date',
      'Batch',
      'Status',
    ];
    const pl = guessMapping(rhs, PL_FIELDS);
    expect(pl).toMatchObject({
      sku: 0,
      description: 1,
      quantity: 2,
      cbm: 6,
      productionDate: 7,
      expiryDate: 8,
      batch: 9,
    });
    const grn = guessMapping(rhs, GRN_FIELDS);
    expect(grn).toMatchObject({ sku: 0, receivedQty: 3, damagedQty: 4, cbm: 6, expiryDate: 8, batch: 9 });
  });

  it('maps the Aenix customer GRN columns', () => {
    const aen = ['Batch No', 'Barcode', 'Description', 'Qty Box', 'Volume (CBM)'];
    expect(guessMapping(aen, PL_FIELDS)).toMatchObject({
      sku: 1,
      description: 2,
      quantity: 3,
      batch: 0,
      cbm: 4,
    });
  });
});
