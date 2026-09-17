import { BadRequestException, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { Prisma } from "@fulfillflow/db";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { verifyWebhookHmac } from "./hmac.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * The one canonical webhook endpoint every Shopify topic targets
 * (shopify.app.toml points `orders/create`, `orders/updated`,
 * `app/uninstalled`, the compliance topics, etc. all here). This request
 * path does exactly one thing per Global Constraints: raw-body HMAC verify →
 * resolve store → durable IngestionRecord insert/dedupe → commit → 200. No
 * per-topic business logic runs here — that's the M3 ingestion worker's job,
 * dispatching on `IngestionRecord.topic`.
 */
@Controller("webhooks")
export class WebhooksController {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly prisma: PrismaService,
  ) {}

  @Post("shopify")
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-shopify-hmac-sha256") hmacHeader?: string,
    @Headers("x-shopify-shop-domain") shopDomain?: string,
    @Headers("x-shopify-webhook-id") webhookId?: string,
    @Headers("x-shopify-topic") topic?: string,
  ) {
    if (!req.rawBody) throw new BadRequestException("missing request body");
    if (!hmacHeader || !verifyWebhookHmac(req.rawBody, hmacHeader, this.config.apiSecret)) {
      throw new UnauthorizedException("invalid hmac");
    }
    if (!shopDomain) throw new BadRequestException("missing X-Shopify-Shop-Domain header");
    if (!webhookId) throw new BadRequestException("missing X-Shopify-Webhook-Id header");
    if (!topic) throw new BadRequestException("missing X-Shopify-Topic header");

    const store = await this.prisma.client.store.findUnique({
      where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: shopDomain } },
    });
    if (!store) {
      // Uninstalled/never-installed shop: still HMAC-valid, so Shopify isn't
      // lying to us — there's just nothing to attach the record to. A 2xx
      // (not 404) stops Shopify from retrying forever.
      return { ok: true, ignored: true };
    }

    let payload: Prisma.InputJsonValue;
    try {
      payload = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("body is not valid JSON");
    }

    // upsert() alone isn't atomic against a genuinely concurrent duplicate
    // delivery of the same webhook id (Shopify's own retry can race the
    // original): two simultaneous upserts can both observe "no existing
    // row" and both attempt to create one. Depending on timing, Prisma 7's
    // upsert surfaces that race as either a unique-constraint violation
    // (P2002, the loser's INSERT) or "no record found for an upsert"
    // (P2025, the loser's own internal existence check losing a footrace to
    // the winner's commit) — this repo hit both under load-test concurrency.
    // Either way the recovery is identical: the row now exists (the winner
    // created it), so re-read it by dedupeKey. Only if that re-read ALSO
    // comes up empty is this a genuinely different failure, not a race.
    let record;
    try {
      record = await this.prisma.client.ingestionRecord.upsert({
        where: { dedupeKey: webhookId },
        update: {},
        create: {
          organizationId: store.organizationId,
          storeId: store.id,
          source: "SHOPIFY_WEBHOOK",
          topic,
          dedupeKey: webhookId,
          rawPayload: payload,
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError)) throw err;
      const existing = await this.prisma.client.ingestionRecord.findUnique({ where: { dedupeKey: webhookId } });
      if (!existing) throw err;
      record = existing;
    }

    return { ok: true, ingestionRecordId: record.id };
  }
}
