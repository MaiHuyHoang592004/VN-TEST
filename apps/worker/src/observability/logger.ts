/**
 * Structured JSON logging for the worker's background loops. Redacts known
 * sensitive keys recursively (case-insensitive substring match, since a
 * payload field might be `accessToken`, `access_token`, or nested under
 * something like `headers.authorization`) so a stray `log("...", { record })`
 * over a raw Shopify webhook payload or a decrypted token can never leak one
 * into stdout.
 */
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|apikey|api_key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(val, depth + 1);
  }
  return out;
}

export type LogFields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", msg: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, msg, ...(fields ? (redact(fields) as LogFields) : {}), ts: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, fields?: LogFields) => write("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};
