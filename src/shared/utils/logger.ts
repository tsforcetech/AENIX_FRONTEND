/**
 * Browser diagnostic logger. Not an audit log — security and document audit are written by
 * the backend only. No telemetry exporter is wired until the logging ADR is decided.
 */
const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|cookie|iban|account|card|cvv|bank|email|phone|mobile|emirates.?id|trn/i;
const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)]),
    );
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

export function log(level: Level, message: string, context?: Record<string, unknown>): void {
  if (level === 'debug' && !import.meta.env.DEV) return;
  const safe = context ? redact(context) : undefined;
  console[level](`[aenix] ${message}`, safe ?? '');
}
