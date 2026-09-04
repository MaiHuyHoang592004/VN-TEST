/**
 * Ticket invariants, against a real database.
 *
 * The five that matter, all of them things legacy got wrong:
 *   · a CLOSED ticket refuses replies ON THE SERVER (legacy hid the box)
 *   · one seller cannot read another seller's ticket BY ID (the scope, not the
 *     hidden menu, is the security)
 *   · both parties get notified — the whole point of the phase
 *   · an out-of-scope orderId is dropped AND reported (legacy dropped silently)
 *   · an oversized attachment is refused before a byte is stored
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";

import {
  createTicket,
  getTicketDetail,
  listTickets,
  replyTicket,
  setTicketStatus,
  TicketError,
} from "./service.ts";

let sellerAId: string;
let sellerBId: string;
let supporterId: string;
let orderOfB: number;

const sellerA = () => ({ id: sellerAId, roles: ["SELLER"] as UserRole[], email: "tkt-a@test.local" });
const sellerB = () => ({ id: sellerBId, roles: ["SELLER"] as UserRole[], email: "tkt-b@test.local" });
const supporter = () => ({
  id: supporterId,
  roles: ["SUPPORT"] as UserRole[],
  email: "tkt-support@test.local",
});
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

/** An in-memory File, so nothing touches disk unless the test means to. */
const upload = (name: string, type: string, size: number): File =>
  ({ name, type, size, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as File;

const notificationsFor = (userId: string, type: "TICKET_REPLIED" | "TICKET_STATUS_CHANGED") =>
  prisma.notification.count({ where: { userId, type } });

async function openTicket(actor: ReturnType<typeof sellerA>, title = "Wrong shirt arrived") {
  const created = await createTicket(actor, { title, reason: "wrong-item", priority: "HIGH" });
  return created.id;
}

before(async () => {
  const [a, b, s] = await Promise.all([
    prisma.user.create({ data: { email: "tkt-a@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "tkt-b@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "tkt-support@test.local", roles: ["SUPPORT"] } }),
  ]);
  sellerAId = a.id;
  sellerBId = b.id;
  supporterId = s.id;

  const order = await prisma.order.create({
    data: { quantity: 1, placedAt: new Date(), customerId: sellerBId, externalId: "TKT-B-1" },
    select: { id: true },
  });
  orderOfB = order.id;
});

// ── Scope ────────────────────────────────────────────────────────────────────

test("a seller cannot read another seller's ticket, by id or by list", async () => {
  const id = await openTicket(sellerB(), "B's private problem");

  await assert.rejects(
    () => getTicketDetail(sellerA(), id),
    (e) => e instanceof TicketError && codeOf(e) === "not-found",
    "the id alone must prove nothing",
  );

  const { rows } = await listTickets(sellerA(), {});
  assert.equal(
    rows.some((r) => r.id === id),
    false,
    "and it must not appear in the list either",
  );

  // Support sees it — the same scope, a different grant.
  const seen = await getTicketDetail(supporter(), id);
  assert.equal(seen.id, id);
});

test("an orderId outside the actor's scope is DROPPED and REPORTED", async () => {
  const created = await createTicket(sellerA(), {
    title: "About someone else's order",
    reason: "other",
    priority: "MEDIUM",
    orderId: orderOfB,
  });
  assert.equal(created.droppedOrder, true, "the caller has to be told, not silently ignored");

  const detail = await getTicketDetail(sellerA(), created.id);
  assert.equal(detail.order, null, "and the reference must not have been stored");
});

// ── The thread ───────────────────────────────────────────────────────────────

test("a CLOSED ticket refuses replies on the server", async () => {
  const id = await openTicket(sellerA());
  await setTicketStatus(sellerA(), id, { status: "CLOSED" }, ctx(sellerA()));

  await assert.rejects(
    () => replyTicket(sellerA(), id, { content: "one more thing" }),
    (e) => e instanceof TicketError && codeOf(e) === "ticket-closed",
  );

  // Reopening is the documented way back in, and it works.
  await setTicketStatus(sellerA(), id, { status: "OPEN" }, ctx(sellerA()));
  const reply = await replyTicket(sellerA(), id, { content: "one more thing" });
  assert.equal(reply.ok, true);
});

test("a reply notifies the OTHER party, in both directions", async () => {
  const id = await openTicket(sellerA(), "Notify me");

  const supporterBefore = await notificationsFor(supporterId, "TICKET_REPLIED");
  const authorBefore = await notificationsFor(sellerAId, "TICKET_REPLIED");

  // Nobody has answered yet, so the seller's follow-up reaches ticket managers.
  await replyTicket(sellerA(), id, { content: "any update?" });
  assert.ok(
    (await notificationsFor(supporterId, "TICKET_REPLIED")) > supporterBefore,
    "an unanswered ticket's follow-up must not go nowhere",
  );

  await replyTicket(supporter(), id, { content: "looking into it" });
  assert.equal(
    await notificationsFor(sellerAId, "TICKET_REPLIED"),
    authorBefore + 1,
    "the author hears about the answer",
  );

  const detail = await getTicketDetail(sellerA(), id);
  assert.equal(detail.status, "IN_PROGRESS", "a staff answer picks the ticket up");
  assert.equal(detail.replies.length, 2);
});

test("a status change is audited and announced", async () => {
  const id = await openTicket(sellerA(), "Close me");
  const before = await notificationsFor(sellerAId, "TICKET_STATUS_CHANGED");

  await setTicketStatus(supporter(), id, { status: "RESOLVED", note: "refund issued" }, ctx(supporter()));

  assert.equal(await notificationsFor(sellerAId, "TICKET_STATUS_CHANGED"), before + 1);
  const audit = await prisma.auditLog.findFirst({
    where: { action: "TICKET_STATUS_CHANGED", targetId: String(id) },
    select: { before: true, after: true, reason: true },
  });
  assert.ok(audit, "a status flip is what a dispute hinges on — it is logged");
  assert.equal(audit.reason, "refund issued");
});

test("a seller cannot set a staff-only status on their own ticket", async () => {
  const id = await openTicket(sellerA(), "Not mine to resolve");
  await assert.rejects(
    () => setTicketStatus(sellerA(), id, { status: "RESOLVED" }, ctx(sellerA())),
    (e) => e instanceof TicketError && codeOf(e) === "not-yours",
  );
});

// ── Attachments ──────────────────────────────────────────────────────────────

test("an oversized attachment is refused before anything is stored", async () => {
  await assert.rejects(
    () =>
      createTicket(
        sellerA(),
        { title: "Photo of the damage", reason: "quality-return", priority: "URGENT" },
        [upload("huge.png", "image/png", 11 * 1024 * 1024)],
      ),
    (e) => codeOf(e) === "file-too-large",
  );

  await assert.rejects(
    () =>
      createTicket(
        sellerA(),
        { title: "Invoice", reason: "other", priority: "LOW" },
        [upload("invoice.pdf", "application/pdf", 1024)],
      ),
    (e) => codeOf(e) === "not-an-image",
  );
});
