import { z } from "zod";
import { TierSchema, RoutingSchema } from "./response.js";

export const CapReasonSchema = z.enum([
  "legitimacy_red_flag", "personal_use", "non_beverage", "sub_fcl_volume", "injection_attempt",
]);
export const ScoringModeSchema = z.enum(["llm", "degraded", "no_lead_evidence"]);
export const DegradedReasonSchema = z.enum([
  "llm_timeout", "llm_http_error", "llm_invalid_output", "llm_config_error", "budget_exhausted",
]);

export const ScoreBreakdownSchema = z.strictObject({
  legitimacy: z.strictObject({
    business_type: z.number(), track_record: z.number(), operational_signals: z.number(), total: z.number(),
  }),
  license: z.number(),
  volume: z.number(),
  product_fit: z.number(),
  raw_total: z.number(),
  caps_applied: z.array(z.strictObject({ reason: CapReasonSchema, max_score: z.number() })),
  final_score: z.number().int().min(0).max(100),
  tier: TierSchema,
  routing: RoutingSchema,
});

export type CapReason = z.infer<typeof CapReasonSchema>;
export type ScoringMode = z.infer<typeof ScoringModeSchema>;
export type DegradedReason = z.infer<typeof DegradedReasonSchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
