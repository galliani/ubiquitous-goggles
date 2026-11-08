/**
 * Integration smoke runner (SPEC section 11).
 *
 *   npm run smoke -- --url <baseUrl> --suite <suite> [--api-key <key>]
 *
 * Cases live in evals/cases.json and run sequentially against a live server.
 * Besides the spec's case shape, three small extensions are supported:
 *   - "oversizeBody": true  -> a valid-looking JSON body above 64 KB is generated at runtime.
 *   - "noContentType": true -> the body is sent as a Uint8Array, so fetch adds no Content-Type
 *                              (a string body would be sent as text/plain). Otherwise the
 *                              runner sends Content-Type: application/json.
 *   - Header values may contain {{API_KEY}}, replaced with the --api-key value.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  ErrorBodySchema,
  LIMITS,
  ScoreResponseSchema,
  type ErrorCode,
  type Routing,
  type ScoringMode,
  type Tier,
} from "../src/schemas/index.js";

/** Independent copy of the D5 mapping, so the runner doesn't trust the code under test. */
const ROUTING_FOR_TIER: Record<Tier, Routing> = {
  Hot: "kam_handoff",
  Warm: "nurture_pool",
  Cold: "auto_archive",
};

const SUITES = ["behaviour", "protocol", "degraded", "auth", "misconfig"] as const;
type Suite = (typeof SUITES)[number];

const REQUEST_TIMEOUT_MS = 35_000;
const STACK_TRACE_PATTERN = /\bat .+:\d+:\d+/;
const API_KEY_PLACEHOLDER = "{{API_KEY}}";
const USAGE =
  "Usage: npm run smoke -- --url <baseUrl> --suite <behaviour|protocol|degraded|auth|misconfig> [--api-key <key>]";

interface Expectation {
  status: number;
  tier?: Tier[];
  mode?: ScoringMode;
  score?: number;
  code?: ErrorCode;
}

interface SmokeCase {
  id: string;
  suite: Suite;
  description: string;
  method?: string;
  path?: string;
  payload?: unknown;
  rawBody?: string;
  oversizeBody?: boolean;
  noContentType?: boolean;
  headers?: Record<string, string>;
  expect: Expectation;
}

interface Observed {
  status?: number;
  tier?: string;
  score?: number;
  mode?: string;
  latencyMs: number;
}

interface CaseResult {
  smokeCase: SmokeCase;
  observed: Observed;
  failures: string[];
}

interface CliOptions {
  baseUrl: string;
  suite: Suite;
  apiKey: string;
}

// ---------- CLI ----------

function isSuite(value: string): value is Suite {
  return (SUITES as readonly string[]).includes(value);
}

function parseCli(): CliOptions | undefined {
  try {
    const { values } = parseArgs({
      options: {
        url: { type: "string" },
        suite: { type: "string" },
        "api-key": { type: "string" },
      },
    });
    if (!values.url || !values.suite || !isSuite(values.suite)) return undefined;
    new URL(values.url);
    return { baseUrl: values.url.replace(/\/+$/, ""), suite: values.suite, apiKey: values["api-key"] ?? "" };
  } catch {
    return undefined;
  }
}

function loadCases(suite: Suite): SmokeCase[] {
  const all = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as SmokeCase[];
  return all.filter((c) => c.suite === suite);
}

// ---------- Building the request ----------

function buildOversizeBody(): string {
  const filler = "x".repeat(LIMITS.MAX_BODY_BYTES + 1024);
  return JSON.stringify({ lead_id: "P04", conversation: [{ role: "lead", text: filler }] });
}

function buildBodyText(c: SmokeCase): string | undefined {
  if (c.oversizeBody) return buildOversizeBody();
  if (c.rawBody !== undefined) return c.rawBody;
  if (c.payload !== undefined) return JSON.stringify(c.payload);
  return undefined;
}

function buildHeaders(c: SmokeCase, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (buildBodyText(c) !== undefined && !c.noContentType) headers["Content-Type"] = "application/json";
  for (const [name, value] of Object.entries(c.headers ?? {})) {
    headers[name] = value.replaceAll(API_KEY_PLACEHOLDER, apiKey);
  }
  return headers;
}

function buildRequestInit(c: SmokeCase, apiKey: string): RequestInit {
  const bodyText = buildBodyText(c);
  const body = bodyText === undefined ? undefined : c.noContentType ? new TextEncoder().encode(bodyText) : bodyText;
  return {
    method: c.method ?? "POST",
    headers: buildHeaders(c, apiKey),
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

// ---------- Checking the response ----------

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function checkBody(c: SmokeCase, status: number, text: string, observed: Observed, mode: string | undefined): string[] {
  const failures: string[] = [];
  const json = tryParseJson(text);
  const path = c.path ?? "/score";

  if (status === 204) {
    if (text !== "") failures.push("204 response must have an empty body");
    return failures;
  }

  if (status >= 400) {
    const parsed = ErrorBodySchema.safeParse(json);
    if (!parsed.success) failures.push(`error body does not match ErrorBodySchema: ${parsed.error.message}`);
    else if (c.expect.code && parsed.data.error.code !== c.expect.code) {
      failures.push(`expected error code ${c.expect.code}, got ${parsed.data.error.code}`);
    }
    if (STACK_TRACE_PATTERN.test(text)) failures.push("error body contains stack-trace text");
    return failures;
  }

  if (status === 200 && path === "/score") {
    const parsed = ScoreResponseSchema.safeParse(json);
    if (!parsed.success) {
      failures.push(`200 body does not match ScoreResponseSchema: ${parsed.error.message}`);
      return failures;
    }
    observed.tier = parsed.data.tier;
    observed.score = parsed.data.score;
    // D5: routing is strictly derived from tier; the schema alone can't enforce that pairing.
    const expectedRouting = ROUTING_FOR_TIER[parsed.data.tier];
    if (parsed.data.routing !== expectedRouting) {
      failures.push(`routing ${parsed.data.routing} does not match tier ${parsed.data.tier} (expected ${expectedRouting})`);
    }
    failures.push(...checkScoreExpectations(c.expect, parsed.data.tier, parsed.data.score, mode));
  }
  return failures;
}

function checkScoreExpectations(expect: Expectation, tier: Tier, score: number, mode: string | undefined): string[] {
  const failures: string[] = [];
  if (expect.tier && !expect.tier.includes(tier)) failures.push(`tier ${tier} not in [${expect.tier.join(", ")}]`);
  if (expect.score !== undefined && score !== expect.score) failures.push(`score ${score}, expected ${expect.score}`);
  if (expect.mode && mode !== expect.mode) failures.push(`mode ${mode ?? "(none)"}, expected ${expect.mode}`);
  return failures;
}

async function runCase(c: SmokeCase, options: CliOptions): Promise<CaseResult> {
  const started = Date.now();
  const observed: Observed = { latencyMs: 0 };
  const failures: string[] = [];
  try {
    const response = await fetch(options.baseUrl + (c.path ?? "/score"), buildRequestInit(c, options.apiKey));
    const text = await response.text();
    observed.latencyMs = Date.now() - started;
    observed.status = response.status;
    observed.mode = response.headers.get("x-scoring-mode") ?? undefined;

    if (response.status !== c.expect.status) failures.push(`status ${response.status}, expected ${c.expect.status}`);
    failures.push(...checkBody(c, response.status, text, observed, observed.mode));
    if (c.suite === "behaviour" && observed.mode === "degraded") failures.push("scoring mode is degraded");
  } catch (error) {
    observed.latencyMs = Date.now() - started;
    failures.push(`request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { smokeCase: c, observed, failures };
}

// ---------- Output ----------

function describeExpected(expect: Expectation): string {
  const parts = [String(expect.status)];
  if (expect.tier) parts.push(expect.tier.join("|"));
  if (expect.code) parts.push(expect.code);
  return parts.join(" ");
}

function describeActual(observed: Observed): string {
  return [observed.status ?? "ERR", observed.tier].filter((p) => p !== undefined).join(" ");
}

function formatRow(result: CaseResult): string {
  const { smokeCase, observed, failures } = result;
  const cells = [
    failures.length === 0 ? "PASS" : "FAIL",
    smokeCase.id.padEnd(5),
    describeExpected(smokeCase.expect).padEnd(32),
    describeActual(observed).padEnd(10),
    String(observed.score ?? "-").padEnd(5),
    (observed.mode ?? "-").padEnd(16),
    `${observed.latencyMs}ms`,
  ];
  return cells.join("  ");
}

function printReport(results: CaseResult[]): void {
  console.log(["     ", "id   ", "expected".padEnd(32), "actual".padEnd(10), "score".padEnd(5), "mode".padEnd(16), "latency"].join("  "));
  for (const result of results) console.log(formatRow(result));

  const failed = results.filter((r) => r.failures.length > 0);
  for (const result of failed) {
    console.log(`\n${result.smokeCase.id} (${result.smokeCase.description})`);
    for (const reason of result.failures) console.log(`  - ${reason}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
}

// ---------- Main ----------

async function main(): Promise<number> {
  const options = parseCli();
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  const cases = loadCases(options.suite);
  const needsKey = cases.some((c) => Object.values(c.headers ?? {}).some((v) => v.includes(API_KEY_PLACEHOLDER)));
  if (needsKey && !options.apiKey) {
    console.error(`Suite "${options.suite}" needs --api-key.\n${USAGE}`);
    return 2;
  }

  const results: CaseResult[] = [];
  for (const c of cases) results.push(await runCase(c, options));
  printReport(results);
  return results.every((r) => r.failures.length === 0) ? 0 : 1;
}

process.exitCode = await main();
