import type { MiddlewareHandler } from "hono";
import type { Config } from "../schemas/index.js";
import type { AppEnv } from "../app.js";

type Level = Config["LOG_LEVEL"];
const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Allowed log fields. Deliberately no transcript text, evidence quotes,
 * Authorization header or keys: fields not listed here cannot be logged by accident.
 */
export type LogFields = {
  request_id?: string;
  lead_id?: string;
  method?: string;
  path?: string;
  status?: number;
  latency_ms?: number;
  mode?: string;
  degraded_reason?: string;
  llm_attempts?: number;
  llm_latency_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  score?: number;
  tier?: string;
  caps?: string[];
  event?: string;
  issues?: string[];
  error?: string;
  stack?: string;
};

export type Logger = { log(level: Level, fields: LogFields): void };

/** JSON-line logger to stdout (Vercel captures it); drops lines below `minLevel`. */
export function createLogger(minLevel: Level): Logger {
  return {
    log(level, fields) {
      if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
      console.log(JSON.stringify({ ts: new Date().toISOString(), level, ...fields }));
    },
  };
}

/** Emits the single per-request line after the response is built, errors included. */
export function requestLogger(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = Date.now();
    await next();
    const status = c.res.status;
    logger.log(status >= 500 ? "error" : "info", {
      request_id: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status,
      latency_ms: Date.now() - started,
      ...c.get("logFields"),
    });
  };
}
