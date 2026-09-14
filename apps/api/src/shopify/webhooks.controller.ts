import {
  BadRequestException, Controller, Headers, HttpCode, NotFoundException,
  Post, Req, UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { Prisma } from "@fulfillflow/db";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { verifyWebhookHmac } from "./hmac.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("webhooks/shopify")
export class WebhooksController {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verify → find the Store → upsert a durable IngestionRecord. Upserting on
   * `dedupeKey` (the delivery id) makes a retried/duplicate delivery a no-op
   * instead of a second record — Shopify retries webhooks on anything but a
   * fast 2xx, so this endpoint must be safe to call more than once.
   */
  @Post("orders-create")
  @HttpCode(201)
  async ordersCreate(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-shopify-hmac-sha256") hmacHeader?: string,
    @Headers("x-shopify-shop-domain") shopDomain?: string,
    @Headers("x-shopify-webhook-id") webhookId?: string,
  ) {
    if (!req.rawBody) throw new BadRequestException("missing request body");
    if (!hmacHeader || !verifyWebhookHmac(req.rawBody, hmacHeader, this.config.apiSecret)) {
      throw new UnauthorizedException("invalid hmac");
    }
    if (!shopDomain) throw new BadRequestException("missing X-Shopify-Shop-Domain header");
    if (!webhookId) throw new BadRequestException("missing X-Shopify-Webhook-Id header");

    const store = await this.prisma.client.store.findUnique({
      where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: shopDomain } },
    });
    if (!store) throw new NotFoundException("store not installed for this shop");

    let payload: Prisma.InputJsonValue;
    try {
      payload = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("body is not valid JSON");
    }

    const record = await this.prisma.client.ingestionRecord.upsert({
      where: { dedupeKey: webhookId },
      update: {},
      create: {
        organizationId: store.organizationId,
        storeId: store.id,
        source: "SHOPIFY_WEBHOOK",
        topic: "orders/create",
        dedupeKey: webhookId,
        rawPayload: payload,
      },
    });

    return { ok: true, ingestionRecordId: record.id };
  }
}
