import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.js";

/** Assigns a UUID to every request and echoes it as X-Request-Id (errors and 204 included). */
export const requestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  c.set("logFields", {});
  c.header("X-Request-Id", id);
  await next();
};
