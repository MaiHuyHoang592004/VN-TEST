import type { OutboxHandler } from "../queue/handler-registry.js";
/** Dev/demo handler: logs the payload. Proves the loop end-to-end before real integrations exist. */
export const noopEchoHandler: OutboxHandler = async (event) => {
  console.log(JSON.stringify({ msg: "noop.echo", id: event.id, aggregate: `${event.aggregateType}:${event.aggregateId}`, payload: event.payload }));
};
