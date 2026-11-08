import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const port = Number(process.env.PORT) || 8787;
serve({ fetch: createApp(loadConfig(process.env)).fetch, port }, () => {
  console.log(`lead-scorer listening on http://127.0.0.1:${port}`);
});
