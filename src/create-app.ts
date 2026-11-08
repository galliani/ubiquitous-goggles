import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createLogger, requestLogger, type LogFields } from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler, errorResponse, notFoundHandler } from "./middleware/errors.js";
import { requestId } from "./middleware/request-id.js";
import { healthRoutes } from "./routes/health.js";
import { scoreHandler } from "./routes/score.js";
import { LIMITS, type ConfigResult } from "./schemas/index.js";

/** Per-request values shared between middleware and handlers. */
export type AppEnv = { Variables: { requestId: string; logFields: LogFields } };

export function createApp(configResult: ConfigResult): Hono<AppEnv> {
  const logger = createLogger(configResult.ok ? configResult.config.LOG_LEVEL : "info");
  const app = new Hono<AppEnv>();

  app.use(requestId);
  app.use(requestLogger(logger));
  app.onError(errorHandler(logger));
  app.notFound(notFoundHandler());

  // Fail closed: with invalid config nothing but GET /health may run.
  if (!configResult.ok) {
    app.use(async (c, next) => {
      if (c.req.method === "GET" && c.req.path === "/health") return next();
      logger.log("error", { event: "config_invalid", request_id: c.get("requestId"), issues: configResult.issues });
      return errorResponse(c, 500, "server_misconfigured", "Server is misconfigured.");
    });
    app.route("/", healthRoutes);
    return app;
  }

  app.route("/", healthRoutes);
  const { config } = configResult;
  app.use("/score", authMiddleware(config));
  app.use(
    "/score",
    bodyLimit({
      maxSize: LIMITS.MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, 413, "payload_too_large", "Request body exceeds the size limit."),
    }),
  );
  app.post("/score", scoreHandler(config, logger));
  app.all("/score", (c) => {
    c.header("Allow", "POST");
    return errorResponse(c, 405, "method_not_allowed", "Use POST /score.");
  });

  return app;
}
