/**
 * RFC 9457 Problem Details shape expected from Aenix.Api.
 * STATUS: REQUESTED contract (docs/API-DEPENDENCIES.md, API-DEP-03). Field names
 * beyond the RFC base (`traceId`, `correlationId`, `errors`) are pending backend confirmation.
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  correlationId?: string;
  /** Field validation errors keyed by field path (ASP.NET ValidationProblemDetails style). */
  errors?: Record<string, string[]>;
}

export class ProblemDetailsError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;
  readonly correlationId: string | undefined;

  constructor(problem: ProblemDetails, correlationId?: string) {
    super(problem.title ?? `Request failed with status ${problem.status}`);
    this.name = 'ProblemDetailsError';
    this.status = problem.status;
    this.problem = problem;
    this.correlationId = problem.correlationId ?? correlationId;
  }
}

export function isProblemDetailsError(error: unknown): error is ProblemDetailsError {
  return error instanceof ProblemDetailsError;
}

/** Normalise any response body into ProblemDetails without trusting its shape. */
export function toProblemDetails(status: number, body: unknown): ProblemDetails {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    return {
      status: typeof b.status === 'number' ? b.status : status,
      title: typeof b.title === 'string' ? b.title : undefined,
      detail: typeof b.detail === 'string' ? b.detail : undefined,
      type: typeof b.type === 'string' ? b.type : undefined,
      traceId: typeof b.traceId === 'string' ? b.traceId : undefined,
      correlationId: typeof b.correlationId === 'string' ? b.correlationId : undefined,
      errors: isErrorMap(b.errors) ? b.errors : undefined,
    };
  }
  return { status };
}

function isErrorMap(value: unknown): value is Record<string, string[]> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every((v) => Array.isArray(v) && v.every((s) => typeof s === 'string'))
  );
}

/** User-safe message: never surfaces server stack traces or raw detail for 5xx. */
export function userMessageFor(error: unknown): string {
  if (!isProblemDetailsError(error)) return 'Something went wrong. Please try again.';
  switch (error.status) {
    case 401:
      return 'Your session has ended. Please sign in again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested record was not found or is not available to you.';
    case 409:
      return 'This record was changed by someone else. Reload to see the latest version.';
    case 422:
    case 400:
      return error.problem.title ?? 'Please correct the highlighted fields.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
