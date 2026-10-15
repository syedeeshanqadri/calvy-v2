/**
 * Structured JSON logger for server code. One line per event.
 *  - Sensitive keys are redacted (passwords, tokens, secrets, cookies, emails, phones...).
 *  - Errors are reduced to name + message (+ stack outside production).
 *  - Pass `requestId` (from `getRequestId(req)`) to correlate a request's lines.
 *  - `error()` also reports to Sentry when SENTRY_DSN is configured.
 * Never log request bodies or whole user/client records.
 */
export type LogFields = Record<string, unknown> & { requestId?: string; err?: unknown };

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|e-?mail|phone|otp|card|cvv|iban|signature|session|jwt/i;
const MAX_STRING = 500;
const MAX_DEPTH = 4;

function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message.length > MAX_STRING ? err.message.slice(0, MAX_STRING) + "…" : err.message,
      ...(process.env.NODE_ENV !== "production" && err.stack ? { stack: err.stack } : {}),
    };
  }
  return { message: typeof err === "string" ? redact(err) : "non-error thrown" };
}

export function formatLog(level: "info" | "warn" | "error", msg: string, fields: LogFields = {}): string {
  const { err, ...rest } = fields;
  const line: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(redact(rest) as Record<string, unknown>),
  };
  if (err !== undefined) line.err = serializeError(err);
  return JSON.stringify(line);
}

/** Reads the id set by middleware (or a caller-supplied one); falls back to "unknown". */
export function getRequestId(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get("x-request-id") ?? "unknown";
}

function reportToSentry(msg: string, fields: LogFields) {
  if (!process.env.SENTRY_DSN) return;
  import("@sentry/nextjs")
    .then((Sentry) => {
      const err = fields.err instanceof Error ? fields.err : new Error(msg);
      Sentry.withScope((scope) => {
        scope.setTag("message", msg);
        if (fields.requestId) scope.setTag("requestId", fields.requestId);
        Sentry.captureException(err);
      });
    })
    .catch(() => {});
}

export const logger = {
  info: (msg: string, fields?: LogFields) => console.log(formatLog("info", msg, fields)),
  warn: (msg: string, fields?: LogFields) => console.warn(formatLog("warn", msg, fields)),
  error: (msg: string, fields?: LogFields) => {
    console.error(formatLog("error", msg, fields));
    reportToSentry(msg, fields ?? {});
  },
};
