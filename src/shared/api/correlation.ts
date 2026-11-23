/** Per-request correlation ID sent to the API so UI errors can be traced in backend logs. */
export const CORRELATION_HEADER = 'X-Correlation-Id';

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
