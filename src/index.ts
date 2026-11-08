import { createApp } from "./create-app.js";
import { loadConfig } from "./config.js";

// Vercel zero-config Hono entry.
export default createApp(loadConfig(process.env));
