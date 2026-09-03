/**
 * Field allow-lists per audience.
 *
 * The legacy API returned the entire user column — balance, debt, tier, configs,
 * API key — to the browser on every page load. Rule here: a query that leaves
 * the app boundary selects an explicit list. Never `select: undefined` on a
 * user query, ever.
 *
 * `satisfies Prisma.<Model>Select` gives compile-time errors if a field is
 * renamed or removed, so these can't silently drift from the schema.
 */
import type { Prisma } from "../generated/prisma/client.ts";

/** Anyone may see this about anyone (author avatars, assignee names). */
export const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  image: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/** What a user may see about THEMSELVES on the profile page. */
export const USER_SELF_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  emailVerified: true,
  image: true,
  avatarUrl: true,
  phone: true,
  locale: true,
  timezone: true,
  companyName: true,
  taxId: true,
  webhookUrl: true,
  // webhookSecret is intentionally omitted — it is shown masked, fetched only
  // by the dedicated action that reveals it.
  balance: true,
  debt: true,
  tier: true,
  roles: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

/** What an admin may see about any user in the management screens. */
export const USER_ADMIN_SELECT = {
  ...USER_SELF_SELECT,
  adminNote: true,
  warehouseId: true,
  pendingEmail: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

/** API key rows for the profile page — never the hash, obviously. */
export const API_KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

export const WAREHOUSE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  region: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  zip: true,
  country: true,
  timezone: true,
  status: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarehouseSelect;

export const PRODUCT_SELECT = {
  id: true,
  name: true,
  key: true,
  thumbnail: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

export const VARIANT_SELECT = {
  id: true,
  name: true,
  key: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VariantSelect;

/** A sellable SKU with the tier table pricing.ts needs to resolve a price. */
export const SKU_SELECT = {
  id: true,
  productId: true,
  variantId: true,
  sku: true,
  position: true,
  status: true,
  stock: true,
  needed: true,
  salePrice: true,
  product: { select: { id: true, name: true, key: true, status: true } },
  prices: { select: { tier: true, price: true }, orderBy: { tier: "asc" } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductVariantSelect;

export const MOCKUP_SELECT = {
  id: true,
  name: true,
  thumbnail: true,
  url: true,
  folderId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MockupSelect;

/**
 * A ledger column for the admin screens. `user` is joined because the page is a
 * cross-account view and a column without a name is unusable; the seller's own
 * /profile/billing uses its own narrower shape.
 */
export const TRANSACTION_ADMIN_SELECT = {
  id: true,
  publicId: true,
  amount: true,
  type: true,
  status: true,
  paymentMethod: true,
  description: true,
  note: true,
  balanceBefore: true,
  balanceAfter: true,
  // What the seller attached to justify a request, and what the column is about
  // (a refund's order ids). Both are read on the SAME screen the approve
  // button lives on — an approver deciding without the receipt in front of
  // them is the workflow doc 07 B exists to end.
  evidence: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TransactionSelect;

export const AUDIT_SELECT = {
  id: true,
  action: true,
  actorId: true,
  actor: { select: USER_PUBLIC_SELECT },
  targetType: true,
  targetId: true,
  before: true,
  after: true,
  reason: true,
  ip: true,
  userAgent: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;
