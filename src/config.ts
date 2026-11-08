import { ConfigSchema, type ConfigResult } from "./schemas/index.js";

/**
 * Parse environment variables into a typed config.
 * Empty or whitespace-only values count as unset, so a blank `API_KEY=` copied
 * from .env.example doesn't take the service down while auth is off.
 */
export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  const parsed = ConfigSchema.safeParse(present);
  if (parsed.success) return { ok: true, config: parsed.data };

  // Path + message only: input values may be secrets and must never be echoed.
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { ok: false, issues };
}
