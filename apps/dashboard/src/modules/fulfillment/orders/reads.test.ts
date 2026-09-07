/**
 * The orders LIST query: what it sorts by, what it filters to, and the one
 * clause every reader of this table shares.
 *
 * Four things here have each been a real bug or are one waiting to happen:
 *   · a sort key is caller input — `?sort=` — so an unknown one falls back to
 *     the default instead of reaching Prisma or throwing at a bookmarked URL;
 *   · offset paging over a non-unique ordering silently serves one row twice
 *     and hides another, so `id desc` is appended to every sort;
 *   · `deadline` is nullable, and Postgres would open "latest first" with
 *     every order that has no deadline at all;
 *   · the cards above the table and the table itself used to build their own
 *     where clauses, so a searched table sat under cards counting a different
 *     set of orders. They now build the same one, and this proves the counts
 *     agree rather than trusting that they do;
 *   · and a caller's filter spread beside the scope REPLACES it when the two
 *     name the same key, which turned `?seller=<someone else>` into a read of
 *     another seller's orders. The filters live under `AND` now, and the last
 *     test here is the one that would have caught it.
 *
 * The whitelist loop is deliberately a DATABASE test: `customerName` and
 * `warehouseCode` are relation walks, and only Prisma can say whether the
 * mapping is one it accepts. A pure test of that map would pass on a typo.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";

import {
  ORDER_SORT_KEYS,
  MAX_SELECTION_IDS,
  listOrders,
  listOrderIds,
  orderListOrderBy,
  orderListWhere,
  orderStatusSummary,
  parseDateParam,
} from "./service/reads.ts";

let adminId: string;
let sellerId: string;
let siteId: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
/** Scope "own" — the reader whose only isolation is `customerId`. */
const seller = () => ({ id: sellerId, roles: ["SELLER"] as UserRole[] });

/** Only these rows. The admin scope is "every order in the database", which
 * includes whatever the other suites sharing this database have created, so
 * every assertion below is filtered to this prefix. */
const TAG = "RD-SORT-";

const JAN = new Date("2026-01-10T00:00:00.000Z");
const FEB = new Date("2026-02-10T00:00:00.000Z");
const MAR = new Date("2026-03-10T00:00:00.000Z");

before(async () => {
  const a = await prisma.user.create({
    data: { email: "reads-admin@test.local", roles: ["ADMIN"] },
  });
  adminId = a.id;

  const s = await prisma.user.create({
    data: { email: "reads-seller@test.local", roles: ["SELLER"] },
  });
  sellerId = s.id;

  const site = await prisma.warehouse.create({ data: { code: "RD-1", name: "Reads site" } });
  siteId = site.id;

  // Three placed dates, three deadlines and one order with none — the null is
  // the whole point of the deadline case.
  await prisma.order.createMany({
    data: [
      {
        externalId: `${TAG}A`,
        quantity: 1,
        placedAt: JAN,
        deadline: MAR,
        customerId: adminId,
        warehouseId: siteId,
      },
      {
        externalId: `${TAG}B`,
        quantity: 2,
        placedAt: FEB,
        deadline: JAN,
        customerId: adminId,
        warehouseId: siteId,
      },
      {
        externalId: `${TAG}C`,
        quantity: 3,
        placedAt: MAR,
        deadline: FEB,
        customerId: adminId,
        warehouseId: siteId,
      },
      {
        externalId: `${TAG}D`,
        quantity: 4,
        placedAt: MAR,
        deadline: null,
        customerId: adminId,
        warehouseId: siteId,
      },
    ],
  });
});

test("an unknown sort key falls back to the default rather than reaching Prisma", () => {
  // The shape a stale bookmark or a hand-edited URL arrives in.
  assert.deepEqual(orderListOrderBy("customer.name; drop table orders", "asc"), [
    { placedAt: "asc" },
    { id: "desc" },
  ]);
  assert.deepEqual(orderListOrderBy("createdAt"), [{ placedAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(orderListOrderBy(undefined), [{ placedAt: "desc" }, { id: "desc" }]);
  // A direction we did not offer is not a direction. `dir` is typed, but it
  // arrives as `?dir=` — the double cast is what the URL does for real.
  const fromTheUrl = "sideways" as unknown as "asc";
  assert.deepEqual(orderListOrderBy("quantity", fromTheUrl), [
    { quantity: "desc" },
    { id: "desc" },
  ]);
});

test("every sort ends in the id tiebreaker, or paging loses a row", () => {
  for (const key of ORDER_SORT_KEYS) {
    for (const dir of ["asc", "desc"] as const) {
      const orderBy = orderListOrderBy(key, dir);
      assert.equal(orderBy.length, 2, `${key} ${dir} should be [column, tiebreaker]`);
      assert.deepEqual(
        orderBy[orderBy.length - 1],
        { id: "desc" },
        `${key} ${dir} must end in the unique tiebreaker`,
      );
    }
  }
});

test("deadline nulls sort LAST in both directions", () => {
  assert.deepEqual(orderListOrderBy("deadline", "asc")[0], {
    deadline: { sort: "asc", nulls: "last" },
  });
  assert.deepEqual(orderListOrderBy("deadline", "desc")[0], {
    deadline: { sort: "desc", nulls: "last" },
  });
});

test("the two relation columns walk the relation, not a column that isn't there", () => {
  assert.deepEqual(orderListOrderBy("customerName", "asc")[0], { customer: { name: "asc" } });
  assert.deepEqual(orderListOrderBy("warehouseCode", "desc")[0], { warehouse: { code: "desc" } });
});

test("every whitelisted key is one Prisma actually accepts", async () => {
  // The map is only as good as the schema it names. A renamed relation shows
  // up here as a thrown query rather than as an empty table in production.
  for (const key of ORDER_SORT_KEYS) {
    const { rows } = await listOrders(admin(), { search: TAG, sort: key, dir: "asc", pageSize: 4 });
    assert.equal(rows.length, 4, `sorting by ${key} returned the wrong number of rows`);
  }
});

test("the deadline sort puts the order with no deadline last, however it is read", async () => {
  const asc = await listOrders(admin(), { search: TAG, sort: "deadline", dir: "asc" });
  assert.deepEqual(
    asc.rows.map((r) => r.externalId),
    [`${TAG}B`, `${TAG}C`, `${TAG}A`, `${TAG}D`],
  );

  const desc = await listOrders(admin(), { search: TAG, sort: "deadline", dir: "desc" });
  assert.deepEqual(
    desc.rows.map((r) => r.externalId),
    [`${TAG}A`, `${TAG}C`, `${TAG}B`, `${TAG}D`],
    "nulls stay at the bottom on desc — they are not the most urgent",
  );
});

test("two orders sharing a sort value come back in a stable order", async () => {
  // C and D share a placedAt. Without the tiebreaker their relative order is
  // whatever Postgres feels like per query, which is what makes offset paging
  // serve one of them twice.
  const first = await listOrders(admin(), { search: TAG, sort: "placedAt", dir: "desc" });
  const second = await listOrders(admin(), { search: TAG, sort: "placedAt", dir: "desc" });
  assert.deepEqual(
    first.rows.map((r) => r.id),
    second.rows.map((r) => r.id),
  );
  // The tie is broken by id desc, so the later-created row of the pair leads.
  const tie = first.rows.filter((r) => r.placedAt.getTime() === MAR.getTime());
  assert.equal(tie.length, 2);
  assert.ok(tie[0].id > tie[1].id, "the tie is broken by id desc, not by chance");
});

test("the date window filters on placedAt, and each side is optional", async () => {
  const scoped = { search: TAG };

  const all = await listOrders(admin(), scoped);
  assert.equal(all.total, 4);

  const fromFeb = await listOrders(admin(), { ...scoped, from: FEB });
  assert.equal(fromFeb.total, 3, "February onwards");

  const toFeb = await listOrders(admin(), { ...scoped, to: FEB });
  assert.equal(toFeb.total, 2, "up to and including February");

  const febOnly = await listOrders(admin(), { ...scoped, from: FEB, to: FEB });
  assert.equal(febOnly.total, 1, "both sides, one day wide");

  // The window is a clause under AND like every other caller filter — see the
  // scope test at the bottom of this file for why none of them may sit beside
  // the scope.
  const where = await orderListWhere(admin(), { from: JAN, to: MAR });
  assert.deepEqual(where.AND, [{ placedAt: { gte: JAN, lte: MAR } }]);
  assert.deepEqual(await orderListWhere(admin(), { from: JAN }), {
    deletedAt: null,
    AND: [{ placedAt: { gte: JAN } }],
  });
  // No window asked for is no clause at all, not an empty one — and no empty
  // AND either.
  assert.deepEqual(await orderListWhere(admin(), {}), { deletedAt: null });
});

test("a date that does not parse is a date that was not given", () => {
  assert.equal(parseDateParam(undefined), undefined);
  assert.equal(parseDateParam(""), undefined);
  assert.equal(parseDateParam("last tuesday"), undefined);
  assert.equal(parseDateParam("2026-02-10")?.toISOString(), "2026-02-10T00:00:00.000Z");
});

test("the summary and the list build the SAME clause for the same filter", async () => {
  // `customerId` is in here deliberately: it is the filter the summary did NOT
  // carry, which is how clicking the Seller column left the cards counting the
  // whole platform under a table showing one account.
  const filter = {
    search: TAG,
    warehouseId: siteId,
    customerId: adminId,
    from: JAN,
    to: MAR,
  };

  // Structurally: the list's clause differs from the summary's by exactly the
  // status filter, which the summary must not have — it IS the per-status
  // breakdown.
  const listWhere = await orderListWhere(admin(), { ...filter, status: ["PENDING"] });
  const listFilters = (listWhere.AND ?? []) as Record<string, unknown>[];
  assert.deepEqual(listFilters[0], { status: { in: ["PENDING"] } });
  assert.deepEqual(
    { ...listWhere, AND: listFilters.slice(1) },
    await orderListWhere(admin(), filter),
  );

  // And in what they actually count: this is the assertion the cards existed
  // to make true, and it was false whenever anyone typed in the search box.
  const [list, summary] = await Promise.all([
    listOrders(admin(), filter),
    orderStatusSummary(admin(), filter),
  ]);
  const counted = summary.reduce((sum, group) => sum + group.orders, 0);
  assert.equal(counted, list.total, "the cards count exactly the rows in the table below them");
  assert.equal(counted, 4);

  // A narrower search moves both, together.
  const narrow = { search: `${TAG}B` };
  const [narrowList, narrowSummary] = await Promise.all([
    listOrders(admin(), narrow),
    orderStatusSummary(admin(), narrow),
  ]);
  assert.equal(narrowList.total, 1);
  assert.equal(
    narrowSummary.reduce((sum, group) => sum + group.orders, 0),
    1,
  );
});

test("select-all returns the whole match, and says so honestly", async () => {
  const filter = { search: TAG };
  const [selection, list] = await Promise.all([
    listOrderIds(admin(), filter),
    listOrders(admin(), { ...filter, pageSize: 2 }),
  ]);

  assert.equal(selection.total, 4);
  assert.equal(selection.ids.length, 4, "not the 2 the page was showing");
  assert.equal(selection.capped, false);
  assert.ok(selection.total > list.rows.length, "the point: more ids than rows on the page");

  // The ids are the SAME set the table would have paged through — same where
  // builder, so a row can only be selected if it could have been reached.
  const paged = await listOrders(admin(), filter);
  assert.deepEqual([...selection.ids].sort(), paged.rows.map((r) => r.id).sort());

  // The cap is a number the UI quotes back to the user ("2000 of 5312"), so
  // it is part of the contract rather than an implementation detail.
  assert.equal(MAX_SELECTION_IDS, 2000);
});

test("select-all honours the date window as well as the search", async () => {
  const selection = await listOrderIds(admin(), { search: TAG, from: MAR });
  assert.equal(selection.total, 2, "only the two placed in March");
  assert.equal(selection.ids.length, 2);
});

test("a filter NARROWS the scope and can never replace it", async () => {
  // The whole reason orderListWhere puts caller filters under AND. `?seller=`
  // is a real URL parameter on /orders and a real field on the select-all
  // action, so this is what an own-scope reader can literally type: another
  // account's id, in the very key their scope is made of. Spread beside the
  // scope it won and returned that account's orders, addresses and costs.
  const where = await orderListWhere(seller(), { customerId: adminId });
  assert.equal(where.customerId, sellerId, "the scope's own clause survives");
  assert.deepEqual(where.AND, [{ customerId: adminId }], "the filter is an extra clause");

  // And in what actually comes back: two customerIds that cannot both hold.
  const list = await listOrders(seller(), { search: TAG, customerId: adminId });
  assert.equal(list.total, 0, "no rows: the seller owns none of these orders");
  const selection = await listOrderIds(seller(), { search: TAG, customerId: adminId });
  assert.deepEqual(selection.ids, [], "and select-all enumerates none of them either");

  // The admin, whose scope is `{}`, still gets the filter applied — narrowing
  // has to keep working for the reader it was written for.
  const scoped = await listOrders(admin(), { search: TAG, customerId: adminId });
  assert.equal(scoped.total, 4);
  assert.equal((await listOrders(admin(), { search: TAG, customerId: sellerId })).total, 0);
});
