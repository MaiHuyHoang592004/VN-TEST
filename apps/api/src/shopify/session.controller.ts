import { Controller, Get, NotFoundException, Req, UseGuards } from "@nestjs/common";
import { ShopifySessionGuard, type RequestWithShopifySession } from "./session.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("shopify")
export class SessionController {
  constructor(private readonly prisma: PrismaService) {}

  /** Proves the embedded app can authenticate a request end to end. */
  @UseGuards(ShopifySessionGuard)
  @Get("session")
  async session(@Req() req: RequestWithShopifySession) {
    const store = await this.prisma.client.store.findUnique({
      where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: req.shopifySession.shop } },
      select: { id: true, status: true, organizationId: true },
    });
    if (!store) throw new NotFoundException("store not installed for this shop");
    return { shop: req.shopifySession.shop, store };
  }
}
