import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const up = await this.prisma.ping().catch(() => false);
    if (!up) throw new ServiceUnavailableException({ ok: false, db: "down" });
    return { ok: true, db: "up" };
  }
}
