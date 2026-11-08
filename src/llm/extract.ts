import { remainingMs } from "../lib/budget.js";
import {
  ExtractedFactsSchema,
  type Config,
  type DegradedReason,
  type ExtractedFacts,
  type ScoreRequest,
} from "../schemas/index.js";
import { callOpenRouter, type AttemptResult, type Usage } from "./openrouter.js";

export type ExtractResult =
  | { ok: true; facts: ExtractedFacts; attempts: number; usage?: Usage }
  | { ok: false; reason: DegradedReason; attempts: number };

const MAX_ATTEMPTS = 2;
/** Keep this much of the budget for scoring and responding after the LLM call. */
const RESPONSE_RESERVE_MS = 1000;
/** A retry only makes sense if a useful attempt (>= 2 s after the reserve) still fits. */
const MIN_MS_TO_RETRY = 3000;

type AttemptOutcome =
  | { done: true; facts: ExtractedFacts; usage?: Usage }
  | { done: false; reason: DegradedReason; retryable: boolean };

/**
 * Extract structured facts from the conversation. NEVER throws: the caller relies on
 * every failure arriving as `{ ok: false }` so it can degrade instead of returning 500.
 */
export async function extractFacts(
  req: ScoreRequest,
  opts: { deadline: number; config: Config },
): Promise<ExtractResult> {
  let attempts = 0;
  try {
    const apiKey = opts.config.OPENROUTER_API_KEY;
    if (!apiKey) return { ok: false, reason: "llm_config_error", attempts };

    let last: Extract<AttemptOutcome, { done: false }> | undefined;
    while (attempts < MAX_ATTEMPTS) {
      const timeoutMs = attemptTimeoutMs(opts);
      if (timeoutMs <= 0) {
        return { ok: false, reason: last?.reason ?? "budget_exhausted", attempts };
      }

      attempts += 1;
      const result = await callOpenRouter(req, { apiKey, config: opts.config, timeoutMs });
      const outcome = interpret(result);
      if (outcome.done) return { ok: true, facts: outcome.facts, attempts, usage: outcome.usage };

      last = outcome;
      if (!outcome.retryable || remainingMs(opts.deadline) < MIN_MS_TO_RETRY) break;
      // Retry immediately: no backoff sleep and no Retry-After wait, which would eat the 25 s budget.
    }
    return { ok: false, reason: last?.reason ?? "llm_http_error", attempts };
  } catch {
    // Defensive: a bug here must degrade the lead, not crash the request.
    return { ok: false, reason: "llm_http_error", attempts };
  }
}

function attemptTimeoutMs(opts: { deadline: number; config: Config }): number {
  return Math.min(opts.config.LLM_TIMEOUT_MS, remainingMs(opts.deadline) - RESPONSE_RESERVE_MS);
}

/** Map one HTTP attempt to success, or to a failure with its DegradedReason and retryability (SPEC 8.3). */
function interpret(result: AttemptResult): AttemptOutcome {
  switch (result.kind) {
    case "ok":
      return parseContent(result.content, result.usage);
    case "timeout":
      return { done: false, reason: "llm_timeout", retryable: true };
    case "network":
    case "body_error":
      return { done: false, reason: "llm_http_error", retryable: true };
    case "http":
      if (result.retryable) return { done: false, reason: "llm_http_error", retryable: true };
      // A non-retryable 4xx means our key/request is wrong; retrying cannot fix it.
      return { done: false, reason: result.status < 500 ? "llm_config_error" : "llm_http_error", retryable: false };
  }
}

function parseContent(content: string, usage?: Usage): AttemptOutcome {
  const invalid: AttemptOutcome = { done: false, reason: "llm_invalid_output", retryable: true };
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return invalid;
  }
  const parsed = ExtractedFactsSchema.safeParse(json);
  return parsed.success ? { done: true, facts: sanitise(parsed.data), usage } : invalid;
}

// ---- Sanitisation (SPEC 8.4): LLM output is untrusted and feeds reasoning text. ----

const MAX_YEARS = 100;
const MAX_RETAIL_ACCOUNTS = 1_000_000;
const MAX_MARKET_CHARS = 40;
const MAX_BRAND_CHARS = 40;
const MAX_BRANDS = 5;
const MAX_EVIDENCE = 6;
const MAX_QUOTE_CHARS = 160;

function sanitise(f: ExtractedFacts): ExtractedFacts {
  return {
    ...f,
    years_in_business: cappedNumber(f.years_in_business, MAX_YEARS),
    retail_accounts: cappedNumber(f.retail_accounts, MAX_RETAIL_ACCOUNTS),
    existing_brands_count: cappedNumber(f.existing_brands_count),
    monthly_fcl: cappedNumber(f.monthly_fcl),
    named_market: f.named_market === null ? null : cleanString(f.named_market, MAX_MARKET_CHARS) || null,
    brands: f.brands.map((b) => cleanString(b, MAX_BRAND_CHARS)).filter(Boolean).slice(0, MAX_BRANDS),
    evidence: f.evidence.slice(0, MAX_EVIDENCE).map((e) => ({
      fact: cleanString(e.fact),
      quote: cleanString(e.quote, MAX_QUOTE_CHARS),
    })),
  };
}

/** Negative, non-finite or above-max numbers are implausible extractions: treat as "not stated". */
function cappedNumber(n: number | null, max = Infinity): number | null {
  return n === null || !Number.isFinite(n) || n < 0 || n > max ? null : n;
}

/** Strip control characters (incl. newlines), trim, then truncate. */
function cleanString(s: string, maxChars = Infinity): string {
  return s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, maxChars).trim();
}
