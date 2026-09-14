import type { ClaimedIngestion } from "@fulfillflow/db";

export type IngestionHandler = (record: ClaimedIngestion) => Promise<void>;

export class IngestionHandlerRegistry {
  private readonly handlers = new Map<string, IngestionHandler>();
  register(topic: string, handler: IngestionHandler): this {
    if (this.handlers.has(topic)) throw new Error(`handler already registered: ${topic}`);
    this.handlers.set(topic, handler);
    return this;
  }
  get(topic: string): IngestionHandler | undefined { return this.handlers.get(topic); }
}
