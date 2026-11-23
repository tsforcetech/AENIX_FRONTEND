import createClient, { type Middleware } from 'openapi-fetch';
import { CORRELATION_HEADER, newCorrelationId } from './correlation';
import { ProblemDetailsError, toProblemDetails } from './problem-details';

/**
 * Typed API client factory. `Paths` will be the type generated from the approved
 * OpenAPI contract in `contracts/openapi/` (not yet published). No endpoints are defined
 * here and none may be hand-written — see docs/API-DEPENDENCIES.md.
 *
 * Session/CSRF handling is intentionally NOT implemented: the ADR-004 session model is
 * still PROPOSED. A middleware slot is reserved for it.
 */
export const API_BASE_PATH = '/api';

/** Same-origin absolute base (the SPA is served alongside Aenix.Api). */
export function apiBaseUrl(): string {
  return new URL(API_BASE_PATH, window.location.origin).toString();
}

const correlationMiddleware: Middleware = {
  onRequest({ request }) {
    if (!request.headers.has(CORRELATION_HEADER)) {
      request.headers.set(CORRELATION_HEADER, newCorrelationId());
    }
    return request;
  },
};

const problemDetailsMiddleware: Middleware = {
  async onResponse({ request, response }) {
    if (response.ok) return response;
    let body: unknown;
    try {
      body = await response.clone().json();
    } catch {
      body = undefined;
    }
    throw new ProblemDetailsError(
      toProblemDetails(response.status, body),
      request.headers.get(CORRELATION_HEADER) ?? undefined,
    );
  },
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- placeholder until contract types are generated
export function createApiClient<Paths extends {} = {}>(options?: { fetch?: typeof fetch }) {
  const client = createClient<Paths>({
    baseUrl: apiBaseUrl(),
    credentials: 'same-origin',
    fetch: options?.fetch,
  });
  client.use(correlationMiddleware, problemDetailsMiddleware);
  return client;
}
