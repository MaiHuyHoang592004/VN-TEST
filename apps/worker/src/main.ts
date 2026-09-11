import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@fulfillflow/db";
import { WorkerModule, OUTBOX_LOOP } from "./worker.module.js";
import type { OutboxLoop } from "./queue/outbox-loop.js";

const ctx = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn", "log"] });
const loop = ctx.get<OutboxLoop>(OUTBOX_LOOP);
const ac = new AbortController();
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { console.log(JSON.stringify({ msg: "worker stopping", sig })); ac.abort(); });
console.log(JSON.stringify({ msg: "worker started" }));
await loop.run(ac.signal);
await ctx.close();
await prisma.$disconnect();
console.log(JSON.stringify({ msg: "worker stopped" }));
