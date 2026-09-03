/**
 * The archive's two promises: pages that neither skip nor repeat a column, and a
 * delete that can only ever reach your own rows. The second is the one worth
 * paying for — the id comes straight from the client, and the only thing
 * between it and someone else's notification is the userId in the where.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";
import { deleteOne, listMinePage, notify } from "./service.ts";

let mineId: string;
let otherId: string;

// No roles on purpose: role-derived audiences in other suites must never
// select these users, and these users need no permissions to own a bell.
const mine = () => ({ id: mineId, roles: [] as UserRole[] });
const other = () => ({ id: otherId, roles: [] as UserRole[] });

before(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: "narch-mine@test.local", roles: [] } }),
    prisma.user.create({ data: { email: "narch-other@test.local", roles: [] } }),
  ]);
  mineId = a.id;
  otherId = b.id;

  // Four for me — three system, one orders, so the type filter has something
  // to separate — and one for the other user. All through the real writer.
  for (let i = 0; i < 3; i++) {
    await notify(prisma, { userId: mineId, type: "INVITE_RECEIVED", data: { from: `n${i}` } });
  }
  await notify(prisma, { userId: mineId, type: "ORDER_CREATED", data: { externalId: "nx-1" } });
  await notify(prisma, { userId: otherId, type: "INVITE_RECEIVED" });
});

after(async () => {
  // Notifications cascade with their user, so one delete cleans both up.
  await prisma.user.deleteMany({ where: { id: { in: [mineId, otherId] } } });
});

test("pages walk newest-first without skipping, repeating, or crossing users", async () => {
  const first = await listMinePage(mine(), { limit: 2 });
  assert.equal(first.items.length, 2, "a full first page");
  assert.ok(first.nextCursor, "and it knows there is more");
  assert.ok(
    BigInt(first.items[0].id) > BigInt(first.items[1].id),
    "newest first",
  );

  const second = await listMinePage(mine(), { cursor: first.nextCursor!, limit: 2 });
  assert.equal(second.items.length, 2, "the remainder, exactly once");
  assert.equal(second.nextCursor, null, "and the end is the end");

  const seen = new Set([...first.items, ...second.items].map((n) => n.id));
  assert.equal(seen.size, 4, "no column lost or duplicated across the page seam");

  const theirs = await listMinePage(other(), {});
  assert.equal(theirs.items.length, 1, "the other user's page holds only their column");
});

test("the types filter is the tab: it cuts by type without breaking the cursor", async () => {
  const orders = await listMinePage(mine(), { types: ["ORDER_CREATED"] });
  assert.equal(orders.items.length, 1, "one orders-category column");
  assert.equal(orders.items[0].type, "ORDER_CREATED");

  const system = await listMinePage(mine(), { types: ["INVITE_RECEIVED"], limit: 2 });
  assert.equal(system.items.length, 2, "a filtered page still pages");
  assert.ok(system.nextCursor, "and still knows there is more of this type");
  const rest = await listMinePage(mine(), {
    types: ["INVITE_RECEIVED"],
    cursor: system.nextCursor!,
  });
  assert.equal(rest.items.length, 1, "the filtered remainder, exactly once");
});

test("deleting my notification removes it; a foreign id removes nothing", async () => {
  const page = await listMinePage(mine(), {});
  const target = page.items[0].id;

  // The other user aims at MY column first — the exact attack the scoping exists
  // for. It must be a silent no-op, not an error a client could probe with.
  const foreign = await deleteOne(other(), target);
  assert.equal(foreign.ok, true);
  assert.ok(
    await prisma.notification.findUnique({ where: { id: BigInt(target) } }),
    "a foreign id deletes nothing",
  );

  await deleteOne(mine(), target);
  assert.equal(
    await prisma.notification.findUnique({ where: { id: BigInt(target) } }),
    null,
    "my own delete is real",
  );
  assert.equal((await listMinePage(mine(), {})).items.length, 3, "and the page reflects it");
});
