/**
 * GET /api/v1/me
 *
 * Who this key belongs to, and what their balance is. Small on purpose: it
 * exists so an integration can prove its key works and show "you have $X"
 * without scraping the dashboard — the two things every one of them does first.
 */
import { prisma } from "@opcreative/db";
import { withApiKey, iso, money } from "../_lib/with-api-key.ts";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (_req, actor) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      id: true,
      name: true,
      email: true,
      roles: true,
      tier: true,
      balance: true,
      debt: true,
      createdAt: true,
    },
  });

  return Response.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      // The tier the catalogue prices against — the same number /api/v1/catalog
      // uses, so a seller can see why they were quoted what they were quoted.
      tier: user.tier,
      balance: money(user.balance),
      debt: money(user.debt),
      created_at: iso(user.createdAt),
    },
  });
});
