/**
 * Liveness probe — "is this process up and serving?".
 *
 * Deliberately shallow: it does NOT touch the database. A health check that
 * fails during a DB blip makes the orchestrator kill every task at once,
 * turning a recoverable database hiccup into a full outage. Readiness (can we
 * actually serve traffic) belongs in a separate endpoint if we ever need one.
 *
 * Used by the Docker HEALTHCHECK and by ECS/ALB target groups.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    // Set by the platform (Vercel injects the commit SHA); handy for
    // confirming which build a box is actually running.
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_VERSION ?? "dev",
  });
}
