import { createApiClient } from './client';
import { CORRELATION_HEADER } from './correlation';
import { ProblemDetailsError } from './problem-details';

type TestPaths = {
  '/probe': { get: { responses: { 200: { content: { 'application/json': { ok: boolean } } } } } };
};

describe('createApiClient', () => {
  it('sends a correlation id and same-origin credentials', async () => {
    const fetchSpy = vi.fn<(req: Request) => Promise<Response>>(async () => Response.json({ ok: true }));
    const client = createApiClient<TestPaths>({ fetch: fetchSpy as unknown as typeof fetch });
    const { data } = await client.GET('/probe');
    expect(data).toEqual({ ok: true });
    const req = fetchSpy.mock.calls[0]![0];
    expect(req.headers.get(CORRELATION_HEADER)).toMatch(/[0-9a-f-]{36}/);
    expect(req.credentials).toBe('same-origin');
    expect(new URL(req.url).pathname).toBe('/api/probe');
  });

  it('throws ProblemDetailsError on non-2xx', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ title: 'Forbidden', status: 403 }, { status: 403 }));
    const client = createApiClient<TestPaths>({ fetch: fetchSpy as unknown as typeof fetch });
    await expect(client.GET('/probe')).rejects.toBeInstanceOf(ProblemDetailsError);
  });
});
