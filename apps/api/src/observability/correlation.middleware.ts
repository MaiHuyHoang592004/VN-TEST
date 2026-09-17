/**
 * Every request gets a correlation id: the caller's own `X-Correlation-Id`
 * if it sent one, otherwise a fresh UUIDv7 (time-ordered, so a log/DB scan
 * for "everything from around this request" sorts naturally alongside the
 * uuid(7) entity ids the schema already uses everywhere). Echoed back on the
 * response and attached to `req.correlationId` for handlers that want to
 * stamp it onto an Order/ExceptionCase/OutboxEvent/AuditLog row.
 */
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    correlationId?: string;
  }
}

const HEADER = "x-correlation-id";

export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ts = BigInt(Date.now());
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[HEADER];
  const id = (typeof incoming === "string" && incoming.trim().length > 0) ? incoming : uuidv7();
  req.correlationId = id;
  res.setHeader("X-Correlation-Id", id);
  next();
}
