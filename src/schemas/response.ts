import { z } from "zod";

export const TierSchema = z.enum(["Hot", "Warm", "Cold"]);
export const RoutingSchema = z.enum(["kam_handoff", "nurture_pool", "auto_archive"]);

export const ScoreResponseSchema = z.strictObject({
  lead_id: z.string(),
  score: z.number().int().min(0).max(100),
  tier: TierSchema,
  routing: RoutingSchema,
  reasoning: z.string().min(1).max(300),
});

export type Tier = z.infer<typeof TierSchema>;
export type Routing = z.infer<typeof RoutingSchema>;
export type ScoreResponse = z.infer<typeof ScoreResponseSchema>;
