import { BadRequestException, Controller, Get, Query, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { isValidShopDomain, buildInstallUrl, exchangeCodeForToken } from "./oauth.service.js";
import { createState, verifyState } from "./oauth-state.js";
import { verifyOAuthHmac } from "./hmac.js";
import { bootstrapShopifyStore } from "./store-bootstrap.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("shopify")
export class OAuthController {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly prisma: PrismaService,
  ) {}

  /** Merchant clicks "Install" (or App Store) → we redirect them to Shopify's consent screen. */
  @Get("install")
  install(@Query("shop") shop: string | undefined, @Res() res: Response) {
    if (!shop || !isValidShopDomain(shop)) throw new BadRequestException("invalid or missing shop");
    const state = createState(shop, this.config.apiSecret);
    const url = buildInstallUrl(shop, { apiKey: this.config.apiKey, scopes: this.config.scopes, appUrl: this.config.appUrl }, state);
    res.redirect(url);
  }

  /** Shopify redirects back here after the merchant approves. */
  @Get("callback")
  async callback(@Query() query: Record<string, string>, @Res() res: Response) {
    const { shop, code, state } = query;
    if (!shop || !isValidShopDomain(shop)) throw new BadRequestException("invalid or missing shop");
    if (!verifyOAuthHmac(query, this.config.apiSecret)) throw new UnauthorizedException("invalid hmac");
    if (!state || !verifyState(state, shop, this.config.apiSecret)) throw new UnauthorizedException("invalid or expired state");
    if (!code) throw new BadRequestException("missing code");

    const { accessToken, scope } = await exchangeCodeForToken(shop, code, {
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
    });
    await bootstrapShopifyStore(this.prisma.client, {
      shop, accessToken, scope, tokenEncKey: this.config.tokenEncKey,
    });

    res.redirect(`https://${shop}/admin/apps/${this.config.apiKey}`);
  }
}
