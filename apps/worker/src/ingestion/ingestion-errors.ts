export class RetryableIngestionError extends Error {}

export class BusinessIngestionError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
