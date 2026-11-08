import type { Context } from "hono";
import type { AppEnv } from "../create-app.js";
import { deadlineFrom } from "../lib/budget.js";
import type { Logger } from "../lib/logger.js";
import { extractFacts } from "../llm/extract.js";
import { errorResponse } from "../middleware/errors.js";
import { degradedResponse } from "../scoring/fallback.js";
import { buildReasoning } from "../scoring/reasoning.js";
import { scoreFacts } from "../scoring/score.js";
import {
  ScoreRequestSchema,
  ScoreResponseSchema,
  UNKNOWN_FACTS,
  type Config,
  type ScoreBreakdown,
  type ScoreRequest,
  type ScoreResponse,
  type ScoringMode,
} from "../schemas/index.js";

type Outcome = { response: ScoreResponse; mode: ScoringMode; breakdown?: ScoreBreakdown };

/** POST /score: parse, validate, extract (or skip), score, self-check, respond. */
export function scoreHandler(config: Config, logger: Logger) {
  return async (c: Context<AppEnv>): Promise<Response> => {
    const start = Date.now();

    // Parse manually so Content-Type never matters (curl -d sends form-urlencoded).
    let json: unknown;
    try {
      json = JSON.parse(await c.req.text());
    } catch {
      return errorResponse(c, 400, "invalid_json", "Request body is not valid JSON.");
    }

    const parsed = ScoreRequestSchema.safeParse(json);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return errorResponse(c, 422, "validation_error", "Request body failed validation.", details);
    }
    const req = parsed.data;
    const logFields = c.get("logFields");
    logFields.lead_id = req.lead_id;

    const outcome = await scoreRequest(req, start, config, logger, c);
    const body = finalise(outcome, req.lead_id, logger, c);

    logFields.mode = body.mode;
    logFields.score = body.response.score;
    logFields.tier = body.response.tier;
    if (outcome.breakdown) logFields.caps = outcome.breakdown.caps_applied.map((cap) => cap.reason);

    c.header("X-Scoring-Mode", body.mode);
    return c.json(body.response, 200);
  };
}

/** Run the pipeline from a validated request to a (not yet self-checked) response. */
async function scoreRequest(
  req: ScoreRequest,
  start: number,
  config: Config,
  logger: Logger,
  c: Context<AppEnv>,
): Promise<Outcome> {
  const logFields = c.get("logFields");

  // No lead evidence: skip the LLM entirely; nothing to extract.
  if (!req.conversation.some((turn) => turn.role === "lead")) {
    const breakdown = scoreFacts(UNKNOWN_FACTS);
    return toOutcome(req.lead_id, breakdown, buildReasoning(breakdown, UNKNOWN_FACTS, "no_lead_evidence"), "no_lead_evidence");
  }

  const llmStart = Date.now();
  // A throw here is a contract violation; let it reach onError as 500.
  const result = await extractFacts(req, { deadline: deadlineFrom(start, config.REQUEST_BUDGET_MS), config });
  logFields.llm_attempts = result.attempts;
  logFields.llm_latency_ms = Date.now() - llmStart;

  if (!result.ok) {
    logFields.degraded_reason = result.reason;
    // Config problems (e.g. missing API key) need attention; spec §4.6 wants an error log per request.
    if (result.reason === "llm_config_error") {
      logger.log("error", { event: "llm_config_error", request_id: c.get("requestId"), lead_id: req.lead_id });
    }
    return { response: degradedResponse(req.lead_id), mode: "degraded" };
  }
  if (result.usage) {
    logFields.prompt_tokens = result.usage.prompt_tokens;
    logFields.completion_tokens = result.usage.completion_tokens;
  }
  const breakdown = scoreFacts(result.facts);
  return toOutcome(req.lead_id, breakdown, buildReasoning(breakdown, result.facts, "llm"), "llm");
}

function toOutcome(leadId: string, b: ScoreBreakdown, reasoning: string, mode: ScoringMode): Outcome {
  const response: ScoreResponse = {
    lead_id: leadId,
    score: b.final_score,
    tier: b.tier,
    routing: b.routing,
    reasoning,
  };
  return { response, mode, breakdown: b };
}

/** Never break the response contract: if our own output is invalid (a bug), degrade instead. */
function finalise(outcome: Outcome, leadId: string, logger: Logger, c: Context<AppEnv>): Outcome {
  if (ScoreResponseSchema.safeParse(outcome.response).success) return outcome;
  logger.log("error", { event: "response_self_check_failed", request_id: c.get("requestId"), lead_id: leadId });
  return { response: degradedResponse(leadId), mode: "degraded" };
}
