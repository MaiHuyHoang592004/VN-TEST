import type { OutboxHandler } from "../queue/handler-registry.js";
import { logger } from "../observability/logger.js";
/** Dev/demo handler: logs the payload. Proves the loop end-to-end before real integrations exist. Routed through the redacting logger (not a bare console.log) since nothing prevents a future caller from enqueuing this with a sensitive payload. */
export const noopEchoHandler: OutboxHandler = async (event) => {
  logger.info("noop.echo", { id: event.id, aggregate: `${event.aggregateType}:${event.aggregateId}`, payload: event.payload });
};
