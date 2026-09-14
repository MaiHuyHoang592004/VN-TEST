import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { verifySessionToken } from "./session-token.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TenantContext } from "./tenant-context.js";

export type RequestWithTenant = Request & { tenant: TenantContext };

/**
 * Guards every `/app/**` route except bootstrap: verifies the session token
 * AND requires an existing, ACTIVE Store for that shop — unlike
 * `ShopifySessionGuard`, which only proves the token itself is valid.
 * A missing/disconnected Store means the merchant must reopen the app so
 * managed installation + bootstrap can run again.
 */
@Injectable()
export class ShopifyTenantGuard implements CanActivate {
  constructor(
    private readonly config: ShopifyConfig,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithTenant>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing session token");

    const session = (() => {
      try {
        return verifySessionToken(header.slice("Bearer ".length), { apiKey: this.config.apiKey, apiSecret: this.config.apiSecret });
      } catch (err) {
        throw new UnauthorizedException(err instanceof Error ? err.message : "invalid session token");
      }
    })();

    const store = await this.prisma.client.store.findUnique({
      where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: session.shop } },
    });
    if (!store || store.status !== "ACTIVE") {
      throw new UnauthorizedException("store not installed or not active — reopen the app to reconnect");
    }

    const membership = await this.prisma.client.user.findUnique({ where: { shopifyUserId: session.shopifyUserId } });
    req.tenant = {
      organizationId: store.organizationId,
      storeId: store.id,
      userId: membership?.id ?? "",
      shopDomain: session.shop,
    };
    return true;
  }
}
