import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { verifySessionToken, type VerifiedSession } from "./session-token.js";

export type RequestWithShopifySession = Request & { shopifySession: VerifiedSession };

/** Verifies the App Bridge session token on embedded-app requests. */
@Injectable()
export class ShopifySessionGuard implements CanActivate {
  constructor(private readonly config: ShopifyConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithShopifySession>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing session token");
    try {
      req.shopifySession = verifySessionToken(header.slice("Bearer ".length), {
        apiKey: this.config.apiKey,
        apiSecret: this.config.apiSecret,
      });
    } catch (err) {
      throw new UnauthorizedException(err instanceof Error ? err.message : "invalid session token");
    }
    return true;
  }
}
