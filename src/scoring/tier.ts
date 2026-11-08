import type { Routing, Tier } from "../schemas/index.js";
import { HOT_MIN_SCORE, WARM_MIN_SCORE } from "./rubric.js";

export function tierFor(score: number): Tier {
  if (score >= HOT_MIN_SCORE) return "Hot";
  if (score >= WARM_MIN_SCORE) return "Warm";
  return "Cold";
}

const ROUTING_BY_TIER: Record<Tier, Routing> = {
  Hot: "kam_handoff",
  Warm: "nurture_pool",
  Cold: "auto_archive",
};

/** Routing is strictly 1:1 with tier (D5). */
export function routingFor(tier: Tier): Routing {
  return ROUTING_BY_TIER[tier];
}
