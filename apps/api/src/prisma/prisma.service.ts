import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { prisma, type PrismaClient } from "@fulfillflow/db";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = prisma;
  async ping(): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    return rows[0]?.ok === 1;
  }
  async onModuleDestroy() {
    if (process.env.NODE_ENV !== "test") await this.client.$disconnect();
  }
}
