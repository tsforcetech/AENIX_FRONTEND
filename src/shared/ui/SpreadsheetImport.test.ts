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
