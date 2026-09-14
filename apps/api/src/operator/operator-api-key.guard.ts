import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

/**
 * The whole `/operator/**` surface is an internal, non-merchant command API
 * for V1 demo/dev use (see Task 15). It requires OPERATOR_API_KEY to be set
 * — in every environment, not just production — so it is inert by default
 * and only usable once someone deliberately configures a key.
 */
@Injectable()
export class OperatorApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = process.env.OPERATOR_API_KEY;
    if (!required) throw new UnauthorizedException("operator API is disabled — set OPERATOR_API_KEY to enable it");
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers["x-operator-api-key"];
    if (provided !== required) throw new UnauthorizedException("invalid or missing X-Operator-Api-Key");
    return true;
  }
}
