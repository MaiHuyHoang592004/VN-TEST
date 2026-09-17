import { Controller, Get } from "@nestjs/common";

/**
 * Pure liveness: the process is up and responding. No dependency checks —
 * a database hiccup should not make an orchestrator restart a perfectly
 * healthy process. See ReadinessController for the DB-dependent check.
 */
@Controller("health")
export class HealthController {
  @Get()
  get() {
    return { ok: true };
  }
}
