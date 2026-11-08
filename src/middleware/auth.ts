import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import type { AppEnv } from "../app.js";
import type { Config } from "../schemas/index.js";

/** Bearer-token auth (timing-safe, via Hono) when AUTH_ENABLED; a pass-through otherwise. */
export function authMiddleware(config: Config): MiddlewareHandler<AppEnv> {
  if (!config.AUTH_ENABLED || !config.API_KEY) return (_c, next) => next();
  return bearerAuth({ token: config.API_KEY });
}
