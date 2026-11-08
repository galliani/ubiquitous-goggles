import { EXTRACTED_FACTS_JSON_SCHEMA, type Config, type ScoreRequest } from "../schemas/index.js";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOKENS = 1200;

/** Statuses worth one more try; every other non-2xx is treated as our fault (bad key, bad request). */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type Usage = { prompt_tokens: number; completion_tokens: number };

/**
 * Outcome of one HTTP attempt. Deliberately carries no upstream error text:
 * only a kind/status, so nothing the provider says can leak to callers or logs.
 */
export type AttemptResult =
  | { kind: "ok"; content: string; usage?: Usage }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "http"; status: number; retryable: boolean }
  | { kind: "body_error" };

/**
 * zod emits a draft-2020-12 `$schema` URI that some strict-mode providers reject
 * as an unknown keyword. Copy without it so the shared schema object stays intact.
 */
function schemaForProvider(): Record<string, unknown> {
  const { $schema: _dropped, ...schema } = EXTRACTED_FACTS_JSON_SCHEMA as Record<string, unknown>;
  return schema;
}

/**
 * No `temperature` (Haiku 5.5 does not accept it) and no `reasoning`.
 * `require_parameters` stops OpenRouter routing to a provider that would silently ignore json_schema.
 */
export function buildRequestBody(req: ScoreRequest, model: string): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(req) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "lead_facts", strict: true, schema: schemaForProvider() },
    },
    max_tokens: MAX_TOKENS,
    provider: { require_parameters: true },
  };
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

function readUsage(body: any): Usage | undefined {
  const { prompt_tokens, completion_tokens } = body?.usage ?? {};
  if (typeof prompt_tokens !== "number" || typeof completion_tokens !== "number") return undefined;
  return { prompt_tokens, completion_tokens };
}

/** Classify a response that arrived: HTTP status first, then an `error` hidden in a 200 body. */
async function classifyResponse(res: Response): Promise<AttemptResult> {
  if (!res.ok) return { kind: "http", status: res.status, retryable: RETRYABLE_STATUSES.has(res.status) };

  let body: any;
  try {
    body = await res.json();
  } catch (err) {
    if (isAbort(err)) return { kind: "timeout" }; // the deadline can also fire mid-body
    return { kind: "body_error" };
  }
  if (body === null || typeof body !== "object" || body.error) return { kind: "body_error" };

  // A missing/odd content field becomes "" so it fails parsing downstream as invalid output.
  const content = body.choices?.[0]?.message?.content;
  return { kind: "ok", content: typeof content === "string" ? content : "", usage: readUsage(body) };
}

/** One HTTP attempt. Never throws; every outcome is a classified AttemptResult. */
export async function callOpenRouter(
  req: ScoreRequest,
  opts: { apiKey: string; config: Config; timeoutMs: number },
): Promise<AttemptResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "northern-coast-lead-scorer",
      },
      body: JSON.stringify(buildRequestBody(req, opts.config.OPENROUTER_MODEL)),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    return await classifyResponse(res);
  } catch (err) {
    return isAbort(err) ? { kind: "timeout" } : { kind: "network" };
  }
}
