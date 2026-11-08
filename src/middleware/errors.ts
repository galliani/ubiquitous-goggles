import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../app.js";
import type { ErrorBody, ErrorCode } from "../schemas/index.js";
import type { Logger } from "../lib/logger.js";

type Details = NonNullable<ErrorBody["error"]["details"]>;

/** Build the one error shape every failure uses. Messages are fixed text: never upstream or exception text. */
export function errorResponse(
  c: Context<AppEnv>,
  status: 400 | 401 | 404 | 405 | 413 | 422 | 500,
  code: ErrorCode,
  message: string,
  details?: Details,
): Response {
  const body: ErrorBody = {
    error: { code, message, request_id: c.get("requestId"), ...(details && { details }) },
  };
  return c.json(body, status);
}

/** Maps a framework HTTPException status onto our error codes. */
function codeForHttpStatus(status: number): { code: ErrorCode; message: string } {
  switch (status) {
    case 400: // malformed Authorization header from bearerAuth
    case 401:
      return { code: "unauthorized", message: "Missing or invalid credentials." };
    case 413:
      return { code: "payload_too_large", message: "Request body exceeds the size limit." };
    default:
      return { code: "internal_error", message: "Internal server error." };
  }
}

export function notFoundHandler(): NotFoundHandler<AppEnv> {
  return (c) => errorResponse(c, 404, "not_found", "No such route.");
}

export function errorHandler(logger: Logger): ErrorHandler<AppEnv> {
  return (err, c) => {
    if (err instanceof HTTPException) {
      const { code, message } = codeForHttpStatus(err.status);
      const res = errorResponse(c, err.status as 400 | 401 | 413 | 500, code, message);
      // Clients need the challenge to know how to authenticate.
      const challenge = err.getResponse().headers.get("WWW-Authenticate");
      if (challenge) res.headers.set("WWW-Authenticate", challenge);
      return res;
    }
    // Stack goes to server logs only, never into the response.
    logger.log("error", {
      event: "unhandled_exception",
      request_id: c.get("requestId"),
      error: err.message,
      stack: err.stack,
    });
    return errorResponse(c, 500, "internal_error", "Internal server error.");
  };
}
