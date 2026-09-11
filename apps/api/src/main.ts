import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
// rawBody: true keeps the exact request bytes on req.rawBody — required for Shopify HMAC verification (M2).
const app = await NestFactory.create(AppModule, { rawBody: true });
app.enableShutdownHooks();
await app.listen(env.PORT);
console.log(JSON.stringify({ msg: "api listening", port: env.PORT, env: env.NODE_ENV }));
