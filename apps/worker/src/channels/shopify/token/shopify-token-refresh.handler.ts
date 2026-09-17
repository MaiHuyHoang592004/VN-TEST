/**
 * `shopify.token.refresh`: rotate this store's offline token ahead of
 * expiry. `ShopifyTokenManager.refresh()` already durably marks the store
 * ERROR and opens a merchant `CHANNEL_SYNC_FAILED` exception on any failure
 * (network, invalid_grant, or a race where the store was disconnected
 * between enqueue and processing) — nothing about retrying this outbox
 * event could help, so any failure here dead-letters immediately instead of
 * following the loop's normal exponential backoff.
 */
import { z } from "zod";
import type { ClaimedOutbox } from "@fulfillflow/db";
import { shopifyTokenManager } from "../shopify-client.js";
import { BusinessOutboxError } from "../../../queue/outbox-errors.js";

const payloadSchema = z.object({ storeId: z.string().min(1) });

type TokenManagerLike = { refresh(storeId: string): Promise<void> };

export async function refreshShopifyToken(
  event: ClaimedOutbox,
  deps: { tokenManager?: TokenManagerLike } = {},
): Promise<void> {
  const { storeId } = payloadSchema.parse(event.payload);
  const tokenManager = deps.tokenManager ?? shopifyTokenManager;
  try {
    await tokenManager.refresh(storeId);
  } catch (err) {
    throw new BusinessOutboxError(err instanceof Error ? err.message : String(err));
  }
}
