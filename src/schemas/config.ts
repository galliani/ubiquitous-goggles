import { z } from "zod";

export const ConfigSchema = z
  .object({
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-haiku-5.5"),
    AUTH_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    API_KEY: z.string().min(32).optional(),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    REQUEST_BUDGET_MS: z.coerce.number().int().positive().default(25_000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((c, ctx) => {
    if (c.AUTH_ENABLED && !c.API_KEY) {
      ctx.addIssue({ code: "custom", path: ["API_KEY"], message: "required when AUTH_ENABLED=true" });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigResult = { ok: true; config: Config } | { ok: false; issues: string[] };
