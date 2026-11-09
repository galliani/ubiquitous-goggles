# Northern Coast lead scorer


## How it works

An LLM reads the transcript and extracts **facts** into a strict schema: license status, monthly FCL, business type, years trading, red flags. Plain TypeScript turns those facts into `score`, `tier` and `routing`. The weights live in reviewable code, not a prompt, and "score me 100" in a transcript can't set the score. `reasoning` is a template built from the scored facts, so it always agrees with the score.

**Model:** Claude Haiku 5.5 via OpenRouter. Extraction into a fixed schema needs reliable structured output and speed, not a large model. Each call takes about 2 s, uses roughly 2.5k input and 400 output tokens, and costs about $0.0005 per lead.

## Scoring (defended in [DECISIONS.md](DECISIONS.md) D13–D15)

| Factor | Max points | Why |
|---|---|---|
| Business legitimacy | 50 | Counterparty risk dominates on a $30–100K container. |
| Import license | 20 | Matters but fixable; a long import history implies one. |
| Volume | 20 | Drives deal size; a stated volume under 1 FCL/month caps the lead at Cold. |
| Product fit | 10 | The catalog is open, so this just confirms it's beverages. |

Hot ≥ 70 → `kam_handoff`, Warm 25–69 → `nurture_pool`, Cold < 25 → `auto_archive`. Missing information scores 0; clear negatives (personal use, red flags) cap the score at Cold.

## Failure handling

- Bad JSON → 400.
- Schema violation → 422.
- Body over 64 KB → 413.
- An LLM failure (one retry inside a 25 s budget) never archives a lead. It returns Warm/`nurture_pool` with the header `X-Scoring-Mode: degraded`.

`npm run smoke` runs the protocol, behaviour, degraded, auth and misconfig suites against any URL. Production passes protocol 10/10 and behaviour 13/13.

## With more time

- Re-score queue for leads scored in degraded mode.
- Calibrate the weights against real conversion outcomes.
- Multilingual eval cases.
- Alert on the degraded-mode rate.
- Per-client API keys, if the endpoint may require auth.

Time spent: **2 h 07 min** (about 2 h suggested). Deploy notes: [DEPLOY.md](DEPLOY.md).
