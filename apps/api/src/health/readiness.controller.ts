import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** Readiness: can this instance actually serve traffic right now — is the DB reachable. 503 when it isn't. */
@Controller("ready")
export class ReadinessController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const up = await this.prisma.ping().catch(() => false);
    if (!up) throw new ServiceUnavailableException({ ok: false, db: "down" });
    return { ok: true, db: "up" };
  }
}
