import { ProblemDetailsError, toProblemDetails, userMessageFor } from './problem-details';

describe('toProblemDetails', () => {
  it('keeps typed RFC 9457 fields and validation errors', () => {
    const pd = toProblemDetails(422, { title: 'Invalid', status: 422, errors: { name: ['Required'] } });
    expect(pd).toMatchObject({ status: 422, title: 'Invalid', errors: { name: ['Required'] } });
  });

  it('ignores untyped garbage and falls back to the HTTP status', () => {
    expect(toProblemDetails(500, 'oops')).toEqual({ status: 500 });
    expect(toProblemDetails(400, { status: 'x', errors: { a: [1] } }).errors).toBeUndefined();
  });
});

describe('userMessageFor', () => {
  it.each([401, 403, 404, 409])('returns a safe message for %i', (status) => {
    const msg = userMessageFor(new ProblemDetailsError({ status, detail: 'at Aenix.Api.Secret()' }));
    expect(msg).not.toContain('Aenix.Api');
  });

  it('never exposes server detail for 5xx', () => {
    const msg = userMessageFor(
      new ProblemDetailsError({ status: 500, detail: 'System.NullReferenceException' }),
    );
    expect(msg).toBe('Something went wrong. Please try again.');
  });
});
