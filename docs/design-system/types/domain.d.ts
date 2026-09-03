/**
 * GoodWoodPrint — domain entity types for AI import.
 *
 * Derived VERBATIM from `fulfillment-system-be-prod/prisma/schema.prisma`
 * (models) and `src/metadata/metadata.ts` (enums). This is the shape of the
 * REAL data the screens bind to — the component `.d.ts` files describe props,
 * THIS describes payloads. Pair with `ui_kits/screen-manifest.json` (which
 * screen uses which component) to wire a screen end to end.
 *
 * Conventions:
 *  - Prisma `Decimal` money fields are typed `Money` (string) — the API
 *    serializes them as strings and the design system never does math on them
 *    (readme §3: "Aggregates belong to the server"). Format for display only.
 *  - `Json` columns are typed `Json` (unknown shape) unless a screen's README
 *    pinned the shape; those are noted inline and stay loose here on purpose.
 *  - `?` mirrors Prisma nullability. `snake_case` field names are kept exactly
 *    as the API returns them — do not camelCase on the wire.
 *  - Nothing here is invented. Where the backend has no enum (tracking_status),
 *    the type is `string`, with a comment — see BACKEND_GAPS.md §B.
 */

export type Money = string;              // Prisma Decimal over JSON
export type Json = unknown;              // opaque config/metadata blob
export type ISODate = string;            // DateTime serialized

/* ── Enums (metadata.ts — verbatim `value` strings) ─────────────────── */

/** ORDER_STATUS (src/constants/common.ts). tracking_status has NO enum. */
export type OrderStatus =
  | "Pending" | "Validating" | "Mockup Generating" | "Processing"
  | "Production Ready" | "In Production" | "Produced" | "Filled"
  | "Fulfilled" | "Completed" | "Cancel" | "Refund" | "Return"
  | "Wrong Label" | "Design problems" | "Asset processing failed" | "Out Of Stock"
  // present in FULFILLED_STATUS/FE only, never written by BE (BACKEND_GAPS §C):
  | "Pending Dropoff" | "Design Sorted";

export type UserRole =
  | "admin" | "customer" | "warehouse" | "warehouse_external"
  | "warehouse_admin" | "supporter" | "designer";

export type TicketStatus = "open" | "in_progress" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";
/** TICKET_REASON — 6 fixed VN values, priority auto-derived (DOMAIN_RESOLVED §1). */
export type TicketReason =
  | "Warehouse giao nhầm đơn" | "Khách trả hàng do chất lượng"
  | "Tạo label sai/thiếu địa chỉ" | "Khách đưa sai địa chỉ"
  | "Giao thiếu mũ" | "Lý do khác";

/** SHIPPING_TYPE value → "Ship by Platform" | "Ship by OP". */
export type ShippingType = "customer" | "op";
export type ProductVersion = "v1" | "v3";
export type TransactionType = "topup" | "refund" | string; // enum not fully pinned (BACKEND_GAPS §A)
export type TransactionStatus = "pending" | "completed" | "rejected";

/* ── Core entities ──────────────────────────────────────────────────── */

export interface User {
  id: number;
  display_name?: string | null;
  username: string;
  email: string;
  phone?: string | null;
  status: string;                 // "active" | ...
  roles: UserRole[];              // a user may hold several
  warehouse_id?: number | null;   // NB: Order.warehouse_id points at a USER (BACKEND_GAPS §D)
  balance?: Money | null;
  debt?: Money | null;            // model not documented — never derive (BACKEND_GAPS §B)
  tier?: number | null;
  api_key?: string | null;
  webhook_url?: string | null;
  configs?: Json;                 // per-customer price_table lives here (AdminUserPrice)
  last_login?: ISODate | null;
  created_at: ISODate;
}

export interface Product {
  id: number;
  display_name: string;
  key: string;
  category?: string | null;
  thumbnails?: string | null;
  status: string;                 // filter: all | active | inactive
  version: ProductVersion;        // infer v3 from here until a flag ships (BACKEND_ASKS §3.2)
  configs?: Json;                 // configs.pricing + configs.specifications (SellerCatalog)
  price_config?: Json;
  mockup_template_key?: string | null;
}

export interface Variant {          // the /variants vocabulary entry (AdminVariants)
  id: number;
  display_name: string;
  key: string;
  status: string;
}

export interface ProductVariant {   // the priced record (AdminProductVariants) — id ≠ variant_id
  id: number;
  product_id: number;
  variant_id: number;               // FK into Variant — NOT interchangeable with id
  sku?: string | null;
  stock: number;
  price: number;
  price_tier_1: number; price_tier_2: number; price_tier_3: number; price_tier_4: number;
  sale_price: number;
  position?: string | null;
  physical_variant_sku?: string | null;
  configs?: Json;
}

export interface Mockup {           // Google-Drive pointer (AdminMockups)
  id: number;
  display_name: string;
  url: string;
  thumbnails?: string | null;
  folder_id?: string | null;
  status: string;
}

export interface Order {
  id: number;
  order_id?: string | null;         // human/marketplace id (mono) — id is the PK
  order_sku?: string | null;
  origin_id?: string | null;
  warehouse_id?: number | null;     // a warehouse-role USER id
  customer_id?: number | null;
  tracking_number?: string | null;
  tracking_status?: string | null;  // NO enum — render plain (BACKEND_GAPS §B)
  warehouse_status?: OrderStatus | null;
  order_date: ISODate;
  fulfilled_at?: ISODate | null;
  assigned_at?: ISODate | null;
  quantity: number;
  filled: number;
  product_id?: number | null;
  variant_id?: number | null;
  product?: Product | null;
  variant?: Variant | null;
  product_variant_id?: number | null;
  leather_shape?: string | null;
  shipping_email?: string | null;
  shipping_name?: string | null;
  shipping_company?: string | null;
  shipping_address?: string | null;
  shipping_address_line_2?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zipcode?: string | null;
  shipping_country?: string | null;
  note?: string | null;
  warehouse_note?: string | null;
  mockup_id?: number | null;
  mockup?: Mockup | null;
  label_url?: string | null;
  marketplace?: string | null;
  base_cost?: Money | null;         // present in a PUT suppresses repricing (BACKEND_GAPS §D)
  shipping_cost?: Money | null;
  shipping_type?: ShippingType | null;
  seller?: string | null;
  order_image?: string | null;
  barcode?: string | null;          // warehouse view
  basket_position?: string | null;  // set permission not open to workers (BACKEND_ASKS §4)
  // V3 ordering:
  physical_variant_sku?: string | null;
  production_option_id?: number | null;
  configs?: Json;
}

export interface Ticket {
  id: number;
  display_name: string;
  description?: string | null;
  reason?: TicketReason | null;
  status?: TicketStatus | null;
  priority: TicketPriority;         // auto-derived from reason, read-only in UI
  author_id: number;
  order_id?: number | null;         // a ticket need not be order-linked
  created_at: ISODate;
}
export interface TicketReply {
  id: number; ticket_id: number; author_id: number; content: string; created_at: ISODate;
}

export interface Transaction {      // model TopupTransaction (AdminTransactions / Wallet)
  id: number;
  user_id: number;
  amount: Money;
  status: TransactionStatus;
  transaction_id?: string | null;
  payment_method?: string | null;
  type?: TransactionType | null;
  description?: string | null;
  balance_before?: Money | null;
  balance_after?: Money | null;
  reason_rejected?: string | null;
  metadata?: Json;
  created_at: ISODate;
}

/* ── Catalog / production (V3) ───────────────────────────────────────── */

export interface PhysicalVariant {  // AdminPhysicalVariants — sku is the join key
  id: number; sku: string; product_id: number; display_name: string;
  attributes: Json;                 // { body, patch, ... }
  configs?: Json;                   // { price_op_ship, price_customer_ship, ... }
  status: string;
}
export interface ProductionOption { // AdminProductionOptions
  id: number; variant_sku: string; option_code: string;
  technique?: string | null; position?: string | null;
  base_price?: Money | null; display_name: string; status: string;
}

/* ── BOM / materials ─────────────────────────────────────────────────── */

export interface Bom {              // AdminBomConfigs — cannot exist without a product variant
  id: number; product_variant_id: number; name: string;
  version: number; status: "draft" | "active" | string;
  effective_from?: ISODate | null; effective_to?: ISODate | null; note?: string | null;
}
export interface BomLine {
  id: number; bom_id: number;
  component_product_variant_id?: number | null;
  material_item_id?: number | null; // a line with neither reads "Not Assigned"
  component_sku: string; component_name?: string | null;
  quantity_per_unit: string;        // Decimal — CSV defaults to 1 (BACKEND_GAPS §E)
  unit: string; wastage_rate: string; // wastage_rate = form% / 100
  stage: string; required: boolean; sort_order: number;
}
export interface MaterialItem {     // AdminMaterials — holds no stock; no price field
  id: number; sku: string; name: string;
  type: "raw_material" | "packaging" | "semi_finished" | "consumable" | "other" | string;
  uom: string; status: string; track_inventory: boolean; description?: string | null;
}
export interface MaterialInventory {
  id: number; warehouse_id: number; material_item_id: number;
  quantity: number; stock: number; reserved: number; bad_quantity: number; needed: number;
}

/* ── Warehouse / vendors / expenses ──────────────────────────────────── */

export interface Warehouse {        // AdminWarehouses — code locks once set
  id: number; code?: string | null; display_name: string;
  region?: string | null; location?: string | null; address?: string | null;
  city?: string | null; state?: string | null; zipcode?: string | null; country?: string | null;
  status: string;
}
export interface Vendor {           // AdminVendors — code server-generated
  id: number; code: string; name: string;
  contact_name?: string | null; phone?: string | null; email?: string | null;
  address?: string | null; tax_code?: string | null; note?: string | null; status: string;
}
export interface ExpenseCategory { id: number; name: string; type: "expense" | "income" | string; note?: string | null; }
export interface ExpenseEntry {     // AdminExpenses — amount>0, sign lives in type
  id: number; category_id: number; type: string; amount: Money;
  occurred_at: ISODate; description?: string | null;
  payment_method?: string | null; vendor_id?: number | null;
}

/* ── Notifications / channels ────────────────────────────────────────── */

export interface CustomerContactChannel { // AdminUserChannels
  id: number; user_id: number; type: "telegram" | "lark" | string; name: string;
  status: string; config: Json; last_tested_at?: ISODate | null; last_error?: string | null;
}
export interface NotificationBroadcast {   // AdminNotifications
  id: number; title: string; message: string;
  status: "queued" | "sending" | "done" | string;
  recipient_user_ids: Json; target_user_count: number;
  active_user_count: number; channel_count: number; summary?: Json;
}

/* ── Pagination envelope (TanStack-table style used across the app) ───── */
export interface Paginated<T> { data: T[]; meta: { total: number; pageIndex: number; pageSize: number }; }
