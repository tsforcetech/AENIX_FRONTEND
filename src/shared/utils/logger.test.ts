import { redact } from './logger';

describe('redact', () => {
  it('redacts sensitive keys at any depth', () => {
    expect(
      redact({ user: { email: 'a@b.c', name: 'x' }, accessToken: 't', items: [{ iban: 'AE00' }] }),
    ).toEqual({
      user: { email: '[redacted]', name: 'x' },
      accessToken: '[redacted]',
      items: [{ iban: '[redacted]' }],
    });
  });
});
