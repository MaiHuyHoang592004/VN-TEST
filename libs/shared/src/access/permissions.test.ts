/**
 * The authorization gate. These assertions must be green before any service
 * or action is written — they are the spec for who-can-do-what, and a
 * regression here is a security bug, not a test failure.
 *
 * Run: node --test libs/auth/src/permissions.test.ts   (Node 24 strips types)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { can, permissionsFor, scopeFor, ROLE_PERMISSIONS } from "./permissions.ts";

test("SELLER is confined to its own data", () => {
  const roles = ["SELLER"] as const;
  assert.equal(can(roles, "users.read"), false, "seller cannot list users");
  assert.equal(can(roles, "users.balance.manage"), false, "seller cannot top up");
  assert.equal(can(roles, "orders.read.all"), false, "seller cannot read all orders");
  assert.equal(can(roles, "orders.read.own"), true, "seller can read own orders");
  assert.equal(scopeFor(roles, "orders"), "own");
  assert.equal(scopeFor(roles, "transactions"), "own");
});

test("DESIGNER cannot touch money or manage products", () => {
  const roles = ["DESIGNER"] as const;
  assert.equal(can(roles, "products.read"), true);
  assert.equal(can(roles, "products.manage"), false, "designer cannot edit products");
  assert.equal(can(roles, "users.balance.manage"), false, "designer cannot touch money");
  assert.equal(can(roles, "orders.refund"), false);
  assert.equal(scopeFor(roles, "orders"), "all", "designer sees all orders, read-only");
});

test("WAREHOUSE is scoped to its customer, not the whole system", () => {
  const roles = ["WAREHOUSE"] as const;
  assert.equal(scopeFor(roles, "orders"), "customer");
  assert.equal(can(roles, "orders.read.all"), false);
  assert.equal(can(roles, "users.read"), false);
  assert.equal(can(roles, "warehouses.manage"), false, "line staff can't edit warehouses");
});

test("WAREHOUSE_ADMIN manages members and assigns, but isn't a super-admin", () => {
  const roles = ["WAREHOUSE_ADMIN"] as const;
  assert.equal(can(roles, "warehouses.members.manage"), true);
  assert.equal(can(roles, "orders.assign"), true);
  assert.equal(scopeFor(roles, "orders"), "customer");
  assert.equal(can(roles, "users.balance.manage"), false, "not a money role");
  assert.equal(can(roles, "users.delete"), false);
});

test("SUPPORT reads across the system but can't move money or edit products", () => {
  const roles = ["SUPPORT"] as const;
  assert.equal(can(roles, "users.read"), true);
  assert.equal(scopeFor(roles, "orders"), "all");
  assert.equal(scopeFor(roles, "transactions"), "all");
  assert.equal(can(roles, "tickets.manage"), true);
  assert.equal(can(roles, "users.balance.manage"), false);
  assert.equal(can(roles, "products.manage"), false);
});

test("ADMIN can do everything, including the money and role permissions", () => {
  const roles = ["ADMIN"] as const;
  assert.equal(can(roles, "users.balance.manage"), true);
  assert.equal(can(roles, "users.roles.manage"), true);
  assert.equal(can(roles, "users.delete"), true);
  assert.equal(can(roles, "audit.read"), true);
  assert.equal(scopeFor(roles, "orders"), "all");
});

test("roles.manage is separate from users.update (no accidental escalation)", () => {
  // A role that could edit users but NOT change roles must be expressible.
  assert.equal(
    ROLE_PERMISSIONS.SUPPORT.includes("users.roles.manage"),
    false,
    "support can read users but must not grant roles",
  );
});

test("mockups.manage is separate from products.manage (whole role matrix)", () => {
  // Fixing a bad mockup must not carry the power to edit the catalogue or its
  // prices, so the two never travel together outside ADMIN. Asserting every
  // role here means a careless grant in ROLE_PERMISSIONS fails loudly.
  const expected: Record<string, [mockups: boolean, products: boolean]> = {
    ADMIN: [true, true],
    WAREHOUSE_ADMIN: [true, false],
    SUPPORT: [true, false],
    WAREHOUSE: [false, false],
    DESIGNER: [false, false],
    SELLER: [false, false],
  };
  for (const [role, [mockups, products]] of Object.entries(expected)) {
    const roles = [role as keyof typeof ROLE_PERMISSIONS];
    assert.equal(can(roles, "mockups.manage"), mockups, `${role} mockups.manage`);
    assert.equal(can(roles, "products.manage"), products, `${role} products.manage`);
  }
});

test("order write permissions: who may create, edit, advance and delete", () => {
  // The split that matters: the customer floor advances work along the
  // fulfillment map but must never be able to rewrite an order's money or
  // create one, and a seller creates only for itself (the service forces the
  // owner — orders.update is what buys the right to name someone else).
  const expected: Record<string, Array<"create" | "update" | "status" | "delete">> = {
    ADMIN: ["create", "update", "status", "delete"],
    WAREHOUSE_ADMIN: ["status"],
    WAREHOUSE: ["status"],
    SELLER: ["create"],
    SUPPORT: [],
    DESIGNER: [],
  };
  const perm = {
    create: "orders.create",
    update: "orders.update",
    status: "orders.status.update",
    delete: "orders.delete",
  } as const;
  for (const [role, granted] of Object.entries(expected)) {
    const roles = [role as keyof typeof ROLE_PERMISSIONS];
    for (const [name, permission] of Object.entries(perm)) {
      assert.equal(
        can(roles, permission),
        granted.includes(name as "create"),
        `${role} ${permission}`,
      );
    }
  }
});

test("assigning orders — the money path — is not granted by reading them", () => {
  // assignOrders debits a seller's balance, so the permission is deliberately
  // narrower than order visibility: support and designers see every order and
  // must still not be able to charge anyone.
  assert.equal(can(["SUPPORT"], "orders.assign"), false);
  assert.equal(can(["DESIGNER"], "orders.assign"), false);
  assert.equal(can(["WAREHOUSE"], "orders.assign"), false, "line staff cannot charge");
  assert.equal(can(["WAREHOUSE_ADMIN"], "orders.assign"), true);
  assert.equal(can(["ADMIN"], "orders.assign"), true);
});

test("labels are a customer power, and never a read-only one", () => {
  // Buying a label spends real money with a carrier, so the grant follows the
  // people who physically ship parcels rather than the people who can see
  // them: support and designers read every order and must still not be able
  // to purchase, and a seller must not be able to touch labels at all.
  const expected: Record<string, boolean> = {
    ADMIN: true,
    WAREHOUSE_ADMIN: true,
    WAREHOUSE: true,
    SUPPORT: false,
    DESIGNER: false,
    SELLER: false,
  };
  for (const [role, granted] of Object.entries(expected)) {
    assert.equal(
      can([role as keyof typeof ROLE_PERMISSIONS], "orders.labels.manage"),
      granted,
      `${role} orders.labels.manage`,
    );
  }
  // And it is its own permission: advancing an order must not smuggle in the
  // ability to spend, which is why the stations ask only for status.update.
  assert.equal(
    ROLE_PERMISSIONS.SELLER.includes("orders.status.update"),
    false,
    "a seller advances nothing, so this pair cannot be confused",
  );
});

test("inventory: reading stock is wide, changing it is narrow", () => {
  // The whole inventory matrix in one table, because these permissions move
  // real goods and a careless grant is the kind that nobody notices until the
  // counts are wrong. Read the columns: only ADMIN orders stock; only the
  // people who physically handle it can book it in; nobody but ADMIN and the
  // site's own admin can change a number by hand.
  const expected: Record<
    string,
    Array<"read" | "adjust" | "create" | "receive" | "suppliers" | "boms" | "vendors">
  > = {
    ADMIN: ["read", "adjust", "create", "receive", "suppliers", "boms", "vendors"],
    WAREHOUSE_ADMIN: ["read", "adjust", "receive", "suppliers", "boms"],
    WAREHOUSE: ["read", "receive"],
    SUPPORT: ["read"],
    DESIGNER: [],
    SELLER: [],
  };
  const perm = {
    read: "inventory.read",
    adjust: "inventory.adjust",
    create: "inventory.receipts.create",
    receive: "inventory.receipts.receive",
    suppliers: "suppliers.manage",
    boms: "boms.manage",
    vendors: "vendors.manage",
  } as const;
  for (const [role, granted] of Object.entries(expected)) {
    const roles = [role as keyof typeof ROLE_PERMISSIONS];
    for (const [name, permission] of Object.entries(perm)) {
      assert.equal(
        can(roles, permission),
        granted.includes(name as "read"),
        `${role} ${permission}`,
      );
    }
  }
  // Two pairs that must never collapse into one grant, spelled out because
  // the roles holding them overlap today and that is what makes it tempting:
  // receiving is evidenced by a shipment, adjusting is a bare number, and
  // creating a material is not the same act as changing how many exist.
  assert.equal(can(["WAREHOUSE"], "inventory.adjust"), false, "receive ≠ adjust");
  assert.equal(can(["SUPPORT"], "suppliers.manage"), false, "read ≠ manage");
});

test("multiple roles union their permissions", () => {
  const roles = ["SELLER", "SUPPORT"] as const;
  assert.equal(can(roles, "orders.read.all"), true, "gains support's reach");
  assert.equal(can(roles, "orders.read.own"), true, "keeps seller's own");
  // 'all' outranks 'own' when both are present.
  assert.equal(scopeFor(roles, "orders"), "all");
});

test("an unknown role grants nothing rather than throwing", () => {
  // Defence against a legacy role string surviving a bad migration.
  const roles = ["NONSENSE" as unknown as "SELLER"];
  assert.equal(permissionsFor(roles).size, 0);
  assert.equal(can(roles, "orders.read.own"), false);
  assert.equal(scopeFor(roles, "orders"), null, "no access → null scope → match nothing");
});
