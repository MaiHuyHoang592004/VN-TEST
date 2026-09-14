import { Injectable } from "@nestjs/common";
import { loadEnv } from "../config/env.js";

@Injectable()
export class ShopifyConfig {
  private readonly env = loadEnv();
  get apiKey() { return this.env.SHOPIFY_API_KEY; }
  get apiSecret() { return this.env.SHOPIFY_API_SECRET; }
  get scopes() { return this.env.SHOPIFY_SCOPES; }
  get appUrl() { return this.env.SHOPIFY_APP_URL; }
  get tokenEncKey() { return this.env.SHOPIFY_TOKEN_ENC_KEY; }
}
