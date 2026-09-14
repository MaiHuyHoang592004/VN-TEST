import { Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ShopifySessionGuard, type RequestWithShopifySession } from "./session.guard.js";
import { ShopifyTenantGuard } from "./tenant.guard.js";
import { CurrentTenant } from "./current-tenant.decorator.js";
import type { TenantContext } from "./tenant-context.js";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { exchangeIdToken } from "./shopify-auth.client.js";
import { bootstrapShopifyStore } from "./store-bootstrap.js";

@Controller("app/session")
export class SessionController {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Managed installation, no OAuth redirect: the embedded app's first load
   * hands us its App Bridge ID token; we verify it, exchange it for an
   * offline access token, and bootstrap the tenant. Idempotent — the
   * embedded app can (and does) call this on every load, not just the first.
   */
  @UseGuards(ShopifySessionGuard)
  @Post("bootstrap")
  @HttpCode(200)
  async bootstrap(@Req() req: RequestWithShopifySession) {
    const idToken = req.headers.authorization!.slice("Bearer ".length);
    const tokens = await exchangeIdToken(req.shopifySession.shop, idToken, {
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
    });
    const tenant: TenantContext = await bootstrapShopifyStore(this.prisma.client, {
      shop: req.shopifySession.shop,
      shopifyUserId: req.shopifySession.shopifyUserId,
      tokens,
      tokenEncKey: this.config.tokenEncKey,
    });
    return { ok: true, tenant };
  }

  /** Every other `/app/**` request's shape: valid session + an already-bootstrapped, ACTIVE Store. */
  @UseGuards(ShopifyTenantGuard)
  @Get()
  session(@CurrentTenant() tenant: TenantContext) {
    return { ok: true, tenant };
  }
}
