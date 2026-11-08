import type { ScoreResponse } from "../schemas/index.js";
import { DEGRADED_REASONING, DEGRADED_SCORE } from "./rubric.js";
import { routingFor, tierFor } from "./tier.js";

/** Fixed Warm-floor response used when the LLM is unavailable (D6). */
export function degradedResponse(leadId: string): ScoreResponse {
  const tier = tierFor(DEGRADED_SCORE);
  return {
    lead_id: leadId,
    score: DEGRADED_SCORE,
    tier,
    routing: routingFor(tier),
    reasoning: DEGRADED_REASONING,
  };
}
