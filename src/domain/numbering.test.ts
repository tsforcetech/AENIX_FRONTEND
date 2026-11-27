import { nextDocNumber, seqOf } from './numbering';

describe('numbering', () => {
  it('continues the AEN invoice series', () => {
    expect(nextDocNumber(['AEN077', 'AEN078', 'INV-3029'], 'AEN')).toBe('AEN079');
    expect(nextDocNumber([], 'AEN', 3, 60)).toBe('AEN061');
    expect(seqOf('CN-078')).toBe(78);
  });
});
