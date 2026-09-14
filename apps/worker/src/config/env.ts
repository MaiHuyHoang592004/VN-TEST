import { z } from "zod";

const EnvSchema = z.object({
  // M5: decrypting a Store's offline token to call Shopify's Admin GraphQL API.
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
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
