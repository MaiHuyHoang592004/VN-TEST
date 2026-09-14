import { prisma, type Prisma } from "@fulfillflow/db";
import { openException } from "../exceptions/open-exception.js";

export type RouteOrderResult = { routingDecisionId: string; fulfillmentId?: string };

const STRATEGY_VERSION = "v1-single-facility";

type Candidate = { facilityId: string; facilityCode: string; priority: number; leadTimeHours: number | null };
type CandidateSummary = { facilityId: string; score: { priority: number; leadTimeHours: number | null } | null; reasons: string[] };

/**
 * V1 single-facility routing. A facility is eligible only if it is ACTIVE and
 * has an enabled FacilitySkuCapability for every distinct SKU on the order.
 * Because a capability row (priority/leadTimeHours) is per facility+SKU, a
 * multi-SKU order scores a facility by its weakest link: the lowest priority
 * and the longest lead time among the order's SKUs at that facility. Ties
 * break on facility code for determinism. See ADR-08.
 */
export async function routeOrder(orderId: string): Promise<RouteOrderResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const skuIds = [...new Set(order.items.map((item) => item.skuId))];

    const facilities = await tx.facility.findMany({
      where: { status: "ACTIVE" },
      include: { capabilities: { where: { skuId: { in: skuIds } } } },
      orderBy: { code: "asc" },
    });

    const candidates: Candidate[] = [];
    const summary: CandidateSummary[] = [];
    for (const facility of facilities) {
      const bySku = new Map(facility.capabilities.map((c) => [c.skuId, c]));
      const missing = skuIds.filter((id) => !bySku.get(id)?.enabled);
      if (missing.length) {
        summary.push({ facilityId: facility.id, score: null, reasons: [`missing or disabled capability for sku(s): ${missing.join(", ")}`] });
        continue;
      }
      const rows = [...bySku.values()];
      const priority = Math.min(...rows.map((r) => r.priority));
      const leadTimeHours = rows.some((r) => r.leadTimeHours == null) ? null : Math.max(...rows.map((r) => r.leadTimeHours as number));
      candidates.push({ facilityId: facility.id, facilityCode: facility.code, priority, leadTimeHours });
      summary.push({ facilityId: facility.id, score: { priority, leadTimeHours }, reasons: ["eligible"] });
    }

    // Higher priority wins; then shorter lead time (unknown lead time sorts last); facility code breaks remaining ties.
    candidates.sort((a, b) =>
      b.priority - a.priority ||
      (a.leadTimeHours ?? Number.POSITIVE_INFINITY) - (b.leadTimeHours ?? Number.POSITIVE_INFINITY) ||
      a.facilityCode.localeCompare(b.facilityCode),
    );
    const selected = candidates[0];

    if (!selected) {
      const decision = await tx.routingDecision.create({
        data: { orderId, status: "NO_ROUTE", strategyVersion: STRATEGY_VERSION, candidates: summary as unknown as Prisma.InputJsonValue },
      });
      await openException(tx, {
        organizationId: order.organizationId, code: "NO_ELIGIBLE_FACILITY", visibility: "INTERNAL",
        subjectKey: `order:${orderId}`, orderId,
        message: "No active facility has an enabled capability for every SKU on this order",
      });
      return { routingDecisionId: decision.id };
    }

    const decision = await tx.routingDecision.create({
      data: {
        orderId, status: "SELECTED", selectedFacilityId: selected.facilityId,
        strategyVersion: STRATEGY_VERSION, candidates: summary as unknown as Prisma.InputJsonValue,
      },
    });
    const fulfillment = await tx.fulfillment.create({
      data: { orderId, facilityId: selected.facilityId, routingDecisionId: decision.id, kind: "ORIGINAL", status: "QUEUED" },
    });
    await tx.fulfillmentItem.createMany({
      data: order.items.map((item) => ({ fulfillmentId: fulfillment.id, orderId, orderItemId: item.id, quantity: item.quantity })),
    });
    return { routingDecisionId: decision.id, fulfillmentId: fulfillment.id };
  });
}
