/**
 * The one place Admin API calls go through. Handles: refreshing an expiring
 * offline token before it lapses, retrying once on a 401 the caller reports,
 * and rotating credentials with an optimistic `tokenVersion` lock so two
 * concurrent refreshers never leave the row in a torn state — the loser just
 * re-reads and uses the winner's token instead of erroring or double-writing.
 */
import type { PrismaClient } from "@fulfillflow/db";
import { encryptToken, decryptToken } from "./token-crypto.ts";
import { refreshAccessToken, type ShopifyAuthConfig } from "./shopify-auth.client.ts";

/** Callers throw this from their `fn` when Shopify's Admin API responds 401, to trigger exactly one refresh-and-retry. */
export class ShopifyUnauthorizedError extends Error {}

type StoreRow = {
  id: string; organizationId: string; externalStoreId: string; status: string;
  accessTokenEnc: Uint8Array | null; refreshTokenEnc: Uint8Array | null;
  accessTokenExpiresAt: Date | null; refreshTokenExpiresAt: Date | null; tokenVersion: number;
};

const REFRESH_MARGIN_MS = 5 * 60_000;

function expiryDate(seconds: number | undefined): Date | null {
  return typeof seconds === "number" ? new Date(Date.now() + seconds * 1000) : null;
}

export class ShopifyTokenManager {
  private readonly prisma: PrismaClient;
  private readonly config: ShopifyAuthConfig & { tokenEncKey: string };
  private readonly fetchImpl: typeof fetch;

  constructor(
    prisma: PrismaClient,
    config: ShopifyAuthConfig & { tokenEncKey: string },
    fetchImpl: typeof fetch = fetch,
  ) {
    this.prisma = prisma;
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async withAccessToken<T>(storeId: string, fn: (accessToken: string) => Promise<T>): Promise<T> {
    let store = await this.loadActiveStore(storeId);
    if (this.needsRefresh(store)) store = await this.refreshStore(store);

    try {
      return await fn(this.decrypt(store.accessTokenEnc));
    } catch (err) {
      if (!(err instanceof ShopifyUnauthorizedError)) throw err;
      store = await this.refreshStore(store);
      return await fn(this.decrypt(store.accessTokenEnc));
    }
  }

  /** Exposed directly for schedulers (M6) and tests; loads the current row itself. */
  async refresh(storeId: string): Promise<void> {
    const store = await this.loadActiveStore(storeId);
    await this.refreshStore(store);
  }

  private needsRefresh(store: StoreRow): boolean {
    if (!store.refreshTokenEnc || !store.accessTokenExpiresAt) return false; // non-expiring token: nothing to refresh
    return store.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;
  }

  private decrypt(enc: Uint8Array | null): string {
    if (!enc) throw new Error("store has no access token");
    return decryptToken(Buffer.from(enc), this.config.tokenEncKey);
  }

  private async loadActiveStore(storeId: string): Promise<StoreRow> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    if (store.status !== "ACTIVE") throw new Error(`store ${storeId} is not ACTIVE (status=${store.status})`);
    return store;
  }

  private async refreshStore(store: StoreRow): Promise<StoreRow> {
    if (!store.refreshTokenEnc) throw new Error(`store ${store.id} has no refresh token to rotate`);
    const refreshToken = this.decrypt(store.refreshTokenEnc);

    let tokens;
    try {
      tokens = await refreshAccessToken(store.externalStoreId, refreshToken, this.config, this.fetchImpl);
    } catch (err) {
      await this.markUnrecoverable(store, err);
      throw err;
    }

    const accessTokenEnc = new Uint8Array(encryptToken(tokens.accessToken, this.config.tokenEncKey));
    // Prisma's Bytes type wants a plain Uint8Array<ArrayBuffer>; re-wrapping
    // the retained value keeps that true even when we're not rotating it.
    const refreshTokenEnc = tokens.refreshToken
      ? new Uint8Array(encryptToken(tokens.refreshToken, this.config.tokenEncKey))
      : store.refreshTokenEnc
        ? new Uint8Array(store.refreshTokenEnc)
        : null;

    // Optimistic lock: only the caller that still sees this exact tokenVersion
    // writes. The loser doesn't retry or error — it just re-reads below and
    // gets the winner's (equally valid) fresh token.
    await this.prisma.store.updateMany({
      where: { id: store.id, tokenVersion: store.tokenVersion },
      data: {
        accessTokenEnc, refreshTokenEnc,
        accessTokenExpiresAt: expiryDate(tokens.accessTokenExpiresInSeconds),
        refreshTokenExpiresAt: tokens.refreshTokenExpiresInSeconds != null
          ? expiryDate(tokens.refreshTokenExpiresInSeconds)
          : store.refreshTokenExpiresAt,
        grantedScopes: tokens.scope,
        tokenVersion: { increment: 1 },
      },
    });

    return this.prisma.store.findUniqueOrThrow({ where: { id: store.id } });
  }

  private async markUnrecoverable(store: StoreRow, err: unknown): Promise<void> {
    const subjectKey = `store:${store.id}`;
    await this.prisma.store.update({
      where: { id: store.id },
      data: { status: "ERROR", accessTokenEnc: null, refreshTokenEnc: null },
    });
    const existing = await this.prisma.exceptionCase.findFirst({
      where: { subjectKey, code: "CHANNEL_SYNC_FAILED", status: "OPEN" },
    });
    if (existing) return;
    try {
      await this.prisma.exceptionCase.create({
        data: {
          organizationId: store.organizationId,
          code: "CHANNEL_SYNC_FAILED",
          visibility: "MERCHANT",
          status: "OPEN",
          subjectKey,
          message: "Shopify disconnected this store's access — reopen the app to reconnect.",
          details: { reason: err instanceof Error ? err.message : String(err) },
        },
      });
    } catch {
      // Lost a race against another refresher's exception insert — the
      // partial unique index (one_open_exception_per_subject_code) already
      // guarantees only one OPEN row exists; nothing else to do.
    }
  }
}
