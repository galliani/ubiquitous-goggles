import { Hono } from "hono";
import type { AppEnv } from "../create-app.js";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/health", (c) => c.json({ status: "ok", service: "lead-scorer" }));

// Bare `/` is intentionally empty on any method: the only scoring endpoint is POST /score (D18).
healthRoutes.all("/", (c) => c.body(null, 204));
