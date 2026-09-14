import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequestWithTenant } from "./tenant.guard.js";

/** Use only behind `ShopifyTenantGuard` — it's what populates `req.tenant`. */
export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<RequestWithTenant>().tenant;
});
