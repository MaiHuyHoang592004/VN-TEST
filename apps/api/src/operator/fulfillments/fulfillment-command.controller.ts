import { Controller, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { OperatorApiKeyGuard } from "../operator-api-key.guard.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { startFulfillment, completeProduction } from "./fulfillment-command.service.js";

/** Internal operator command surface for V1 — see OperatorApiKeyGuard. No merchant route calls these. */
@UseGuards(OperatorApiKeyGuard)
@Controller("operator/fulfillments")
export class FulfillmentCommandController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(":id/start")
  @HttpCode(200)
  start(@Param("id") id: string) {
    return startFulfillment(this.prisma.client, id);
  }

  @Post(":id/complete-production")
  @HttpCode(200)
  completeProductionRoute(@Param("id") id: string) {
    return completeProduction(this.prisma.client, id);
  }
}
