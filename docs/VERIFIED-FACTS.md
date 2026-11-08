# Verified External Facts (Phase 0)

Checked 2026-11-08 against official docs, live APIs, and package source. Anything not confirmed is marked **UNCONFIRMED**, together with how the design copes with it.

## OpenRouter / model

| Fact | Status | Source |
|---|---|---|
| Model slug `anthropic/claude-haiku-5.5`, 1M context, $0.10 / $0.50 per M tokens (in/out) | ✅ live API | `GET https://openrouter.ai/api/v1/models` |
| Haiku 5.5 supports `structured_outputs`, `response_format`, `tools`, `max_tokens` | ✅ live API | same |
| Haiku 5.5 does **not** accept `temperature` (unlike Haiku 4.5) | ✅ live API (absent from `supported_parameters`) | same |
| JSON-schema output via `response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}` | ✅ | https://openrouter.ai/docs/features/structured-outputs |
| Strict mode *guarantees* schema adherence for Anthropic | ⚠️ UNCONFIRMED ("Enforcement varies by provider") | same |
| `provider.require_parameters: true` routes only to endpoints supporting the requested params | ✅ | https://openrouter.ai/docs/features/provider-routing |
| Per-key credit limit (`limit`, optional `limit_reset: "daily"`) | ✅ via API; dashboard path UNCONFIRMED | https://openrouter.ai/docs/api-reference/limits, https://openrouter.ai/docs/features/provisioning-api-keys |
| Status when a key's limit is exhausted: 402 vs 403 | ⚠️ UNCONFIRMED (the docs contradict themselves) | https://openrouter.ai/docs/api-reference/errors |
| Error codes: 400, 401, 402, 403, 408, 429, 502, 503; body `{error:{code,message,metadata?}}`; an error can arrive in a 200 body | ✅ | https://openrouter.ai/docs/api-reference/errors |
| Title header is `X-OpenRouter-Title` (not `X-Title`); referer headers optional | ✅ | https://openrouter.ai/docs/sdks examples |

**How the design copes:**
- Strict mode is not trusted. The LLM output is always re-validated with zod (SPEC §4).
- Whether a key-limit error comes back as 402 or 403, the client treats every 4xx from OpenRouter as non-retryable, so both take the same path.

## Vercel (Hobby)

| Fact | Status | Source |
|---|---|---|
| WAF rate limiting is on all plans. Hobby: **1 rule per project**, keyed by IP or JA4, fixed window of 10 s–10 min, default action 429 | ✅ | https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting |
| Rate-limited traffic incurs no CDN/FDT cost; whether it invokes the function is UNCONFIRMED | ⚠️ partial | https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing |
| Function duration on Hobby (Fluid compute, the default since 2025-04-23): default 300 s, max 300 s | ✅ | https://vercel.com/docs/functions/configuring-functions/duration |
| Max request body is 4.5 MB → `413 FUNCTION_PAYLOAD_TOO_LARGE` | ✅ | https://vercel.com/docs/functions/limitations |
| Standard Protection "protects all domains except production domains"; the production *generated deployment URL* is restricted | ✅ | https://vercel.com/docs/deployment-protection |
| Protection on by default for new Hobby projects | ⚠️ UNCONFIRMED (a changelog title says yes) | — |
| Root Directory can be set to a subfolder | ✅ | https://vercel.com/docs/deployments/configure-a-build |
| Secret (formerly "Sensitive") env vars: no plan restriction documented | ✅ (no gate found) | https://vercel.com/docs/environment-variables/sensitive-environment-variables |

**How the design copes:**
- The application enforces its own 25 s budget, independent of Vercel's 300 s limit.
- Submit the **production domain** and verify it with an unauthenticated `curl`.

## Hono

| Fact | Status | Source |
|---|---|---|
| Zero-config on Vercel: `src/index.ts` with `export default app`; no `api/` folder and no `handle()` adapter | ✅ | https://vercel.com/docs/frameworks/backend/hono |
| `bearerAuth` compares with `timingSafeEqual`, responds 401 when missing/invalid and 400 on a malformed header | ✅ package source (`dist/middleware/bearer-auth`) | hono@4.13.17 tarball |
| `bodyLimit` throws `HTTPException(413)` | ✅ package source | same |
| `timeout` default exception is `HTTPException(504, "Gateway Timeout")` | ✅ package source | same |
| `@hono/zod-validator` json target requires a `Content-Type: application/json` header | ⚠️ inferred, not verified; irrelevant because we parse manually (SPEC §6) | — |

## Package versions (npm, 2026-11-08)

| Package | Version | Note |
|---|---|---|
| hono | 4.13.x | |
| zod | 4.6.x | native `z.toJSONSchema()` |
| @hono/zod-validator | 0.9.1 (peer: zod ^3.25 \|\| ^4) | not used, see SPEC §6 |
| typescript | **6.0.3** chosen over 7.0.2 | 7.x is the native-Go port; avoid build-tooling API risk on Vercel |
| vitest | 5.1.x | |
| @openrouter/sdk | 1.5.x (released daily) | **not used**: plain `fetch` gives direct control of timeouts and aborts and needs no extra dependency |
| Node (local) | 22.21.1 | |
