import type { Hono } from "hono";
import { createApp, type AppEnv } from "./create-app.js";
import { loadConfig } from "./config.js";

// Vercel zero-config Hono entry. Vercel only accepts an entry file whose source
// imports "hono" (a text match), so the app's type is imported here explicitly.
const app: Hono<AppEnv> = createApp(loadConfig(process.env));

export default app;
