import { z } from "zod";

export const LIMITS = {
  MAX_BODY_BYTES: 64 * 1024,
  MAX_TURNS: 50,
  MAX_TURN_CHARS: 4_000,
  MAX_TOTAL_CHARS: 20_000,
  MAX_LEAD_ID_CHARS: 128,
  MAX_CHANNEL_CHARS: 32,
} as const;

export const RoleSchema = z.enum(["lead", "agent"]);

export const TurnSchema = z.object({
  role: RoleSchema,
  text: z.string().trim().min(1).max(LIMITS.MAX_TURN_CHARS),
});

export const ScoreRequestSchema = z
  .object({
    lead_id: z.string().trim().min(1).max(LIMITS.MAX_LEAD_ID_CHARS),
    channel: z.string().trim().min(1).max(LIMITS.MAX_CHANNEL_CHARS).optional(), // lenient: free string
    conversation: z.array(TurnSchema).min(1).max(LIMITS.MAX_TURNS),
  })
  .superRefine((req, ctx) => {
    const total = req.conversation.reduce((n, t) => n + t.text.length, 0);
    if (total > LIMITS.MAX_TOTAL_CHARS) {
      ctx.addIssue({ code: "custom", path: ["conversation"], message: `total text exceeds ${LIMITS.MAX_TOTAL_CHARS} chars` });
    }
  }); // unknown top-level/turn keys are stripped, not rejected

export type Role = z.infer<typeof RoleSchema>;
export type Turn = z.infer<typeof TurnSchema>;
export type ScoreRequest = z.infer<typeof ScoreRequestSchema>;
