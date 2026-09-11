import type { ClaimedOutbox } from "@fulfillflow/db";

export type OutboxHandler = (event: ClaimedOutbox) => Promise<void>;

export class HandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();
  register(name: string, handler: OutboxHandler): this {
    if (this.handlers.has(name)) throw new Error(`handler already registered: ${name}`);
    this.handlers.set(name, handler);
    return this;
  }
  get(name: string): OutboxHandler | undefined { return this.handlers.get(name); }
}
