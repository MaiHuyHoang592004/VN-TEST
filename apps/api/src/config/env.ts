import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),

  // Shopify Connect (M2, managed installation — no OAuth redirect).
  // SHOPIFY_APP_URL is this API's own public origin, not the shop's.
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string().min(1).default("read_orders"),
  SHOPIFY_APP_URL: z.string().url(),
  // Base64 AES-256-GCM key (32 raw bytes) for encrypting offline access tokens at rest.
  SHOPIFY_TOKEN_ENC_KEY: z.string().refine(
    (v) => { try { return Buffer.from(v, "base64").length === 32; } catch { return false; } },
    { message: "must be a base64 string decoding to exactly 32 bytes" },
  ),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}
