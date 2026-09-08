# MONITOR data setup

The production dashboard keeps its existing layout. The production route set
includes the generated News v1 gateway in place of the unused Economic v1 gateway,
so news is available without exceeding the existing
12-function deployment budget. Generated RPC validation, gateway authentication,
and rate limits still apply.

## Required deployment settings

Set these on the MONITOR Vercel project, in the environment being deployed.
Never put server secrets in a `VITE_` variable or commit them to GitHub.

| Setting | Purpose | Status |
| --- | --- | --- |
| `WM_SESSION_SECRET` | Signs anonymous browser sessions used by RSS and other protected APIs; at least 32 random characters | Verify in Vercel; cannot inspect from this workspace |
| `UPSTASH_REDIS_REST_URL` | Shared cache and bootstrap datasets | Previously configured; verify on this deployment |
| `UPSTASH_REDIS_REST_TOKEN` | Authenticates the Redis connection | Previously configured; verify on this deployment |
| `MONITOR_ALLOWED_ORIGINS` | Comma-separated exact HTTPS origins for any additional custom hostnames | Optional: apex/www monitorsituation.xyz and Vercel's own deployment/branch/production URL variables are already recognized |

For local development use `.env.local` with the same server settings and run
`npm run dev`. Avoid pointing `VITE_WS_API_URL` or `VITE_RSS_DIRECT_TO_RELAY` at
upstream World Monitor infrastructure; MONITOR should serve its own APIs.
Redeploy after changing Vercel environment variables.

## Panel dependencies

| Panel | Data path | Additional API or setup |
| --- | --- | --- |
| Intel Feed | News digest, with bounded RSS fallback | No paid news key needed; browser RSS requires the session secret |
| World News | Same news digest and RSS fallback | Same as Intel Feed |
| Financial | Financial headlines through the news digest/RSS | No stock-market API key needed for this panel |
| Live Intelligence | Google News RSS through MONITOR's proxy | Session secret; optional GDELT tone/volume never blocks headlines |
| Iran Watch | Three Google News searches; successful results survive another search failing | Session secret; no paid news key |
| Threat Timeline | Server insight snapshot, falling back to timestamped, classified local news clusters | Local fallback needs working news; richer shared snapshots need the publisher below |
| Escalation Monitor | Local correlation engine, with optional seeded correlation cards | News can supply signals; fuller coverage depends on conflict/protest/outage datasets. No cards can also mean no qualifying convergence |

A chart built from currently available headlines is not a complete seven-day
historical archive. The timeline retains its existing degraded/fallback label.

## Optional shared publishers (not activated by this repair)

The upstream publisher already exists at `scripts/seed-insights.mjs`. Run it in a
scheduled Node service with dependencies installed and these server settings:

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: the same Redis as Vercel.
- `API_BASE_URL`: your MONITOR deployment origin, such as `https://monitorsituation.xyz`.
- `WORLDMONITOR_RELAY_KEY`: an operator-generated key matching an entry in Vercel's
  comma-separated `WORLDMONITOR_VALID_KEYS`.
- `GROQ_API_KEY` or `OPENROUTER_API_KEY`: optional AI summaries; not required merely
  to display news or the timeline's local cluster fallback.

Run `node scripts/seed-insights.mjs` every 30 minutes. The existing
`node scripts/seed-correlation.mjs` can publish shared correlation cards after its
input datasets have been populated. Do not create dummy Redis values or fabricated
signals to make empty panels appear operational.

Scheduling, secrets, live provider responses, and deployment acceptance must be
verified in the actual hosting account. This code change does not claim those
external settings have been installed.

## Acceptance checks after deployment

1. A clean page load obtains a session from `POST /api/wm-session` (200).
2. `/api/news/v1/list-feed-digest?variant=full&lang=en&public=1` returns JSON rather
   than a missing-route response. Inspect article counts, not only HTTP status.
3. Live Intelligence renders headlines even if its GDELT timeline is unavailable;
   switching tabs does not display a previous tab's late result.
4. Intel Feed exits Loading on both success and failure. World News and Financial
   display actual source headlines, and Iran Watch filters headlines mentioning Iran.
5. Threat Timeline identifies whether it uses an insight snapshot or cluster fallback.
   Escalation Monitor receives updates even when scrolled into view after startup.
