# Deploy

## Production

| | |
|---|---|
| URL | `https://northern-coast-lead-scorer-ecru.vercel.app` (scoring at `POST /score`) |
| Vercel project | `northern-coast-lead-scorer`, Hobby plan, Fluid compute |
| Repo | `github.com/galliani/ubiquitous-goggles`, Git-connected, so every push to `main` deploys to production |
| Framework | Hono, pinned in `vercel.json` |

Use the production domain. Vercel Deployment Protection gates the per-deploy `*-<hash>-*.vercel.app` URLs, but not the production domain.

## Environment variables (Production)

| Name | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Store as a Secret. If it is missing, every lead is scored in degraded mode. |
| `API_KEY` | no | Store as a Secret, ≥ 32 chars, or leave it unset. A shorter key fails config validation and returns 500 (D21). |
| `AUTH_ENABLED` | no | Default `false`. Set `true` to require `Authorization: Bearer $API_KEY` on `/score`. |
| `OPENROUTER_MODEL`, `LLM_TIMEOUT_MS`, `REQUEST_BUDGET_MS`, `LOG_LEVEL` | no | Defaults in `.env.example`. |

Add a variable without echoing its value:

```sh
grep '^API_KEY=' .env | cut -d= -f2- | tr -d '"\n' | vercel env add API_KEY production --sensitive
```

Env changes take effect only on the next deploy.

## Abuse controls outside the repo

- **Vercel Firewall rate limit** (D8): one rule, per IP, **100 requests / 60 s**, action **403** (Deny). It is configured in the dashboard under Project → Firewall.
- **OpenRouter per-key credit limit** (set on the production key, under OpenRouter → Keys): caps worst-case LLM spend if the endpoint is abused.

## Vercel entrypoint gotchas (D22)

- The Hono preset tries an `app` entry before `index`. The app factory is named `src/create-app.ts` so that the preset uses `src/index.ts`.
- The entry file's source must contain an import from `"hono"`; Vercel checks this with a text match. `src/index.ts` imports the `Hono` type for this reason.
- Without `"framework": "hono"`, a project created from the CLI builds with the "Other" preset, which produces no function and returns 404 everywhere.

## Verify

```sh
U=https://northern-coast-lead-scorer-ecru.vercel.app
curl -s -o /dev/null -w '%{http_code}\n' $U/        # 204
curl -s $U/health                                   # {"status":"ok",...}
npm run smoke -- --url $U --suite protocol          # 10/10
npm run smoke -- --url $U --suite behaviour         # 13/13 (uses ~13 LLM calls)
```

## Local

```sh
npm ci
cp .env.example .env   # add OPENROUTER_API_KEY
PORT=8810 npm run dev
```
