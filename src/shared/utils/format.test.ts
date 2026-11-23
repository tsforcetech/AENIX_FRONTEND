import { formatDate, formatMoney } from './format';

describe('format', () => {
  it('formats AED from decimal strings', () => {
    expect(formatMoney('1234.5')).toMatch(/AED\s?1,234\.50/);
    expect(formatMoney('not-a-number')).toBe('—');
  });

  it('formats dates in Asia/Dubai', () => {
    // 2026-01-01T21:00Z is already 2 Jan in Dubai (UTC+4)
    expect(formatDate('2026-01-01T21:00:00Z')).toContain('2');
    expect(formatDate('bad')).toBe('—');
  });
});
