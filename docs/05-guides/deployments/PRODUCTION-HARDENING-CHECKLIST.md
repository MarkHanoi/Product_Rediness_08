# Production-hardening checklist — pre-Fly.io Phase A deploy (ADR-055)

> **Stamp** · 2026-06-02 — Phase A bridge deploy (pryzm.so → Fly.io)
> **Status** · LIVING — re-run before every production deploy
> **Authority** · Audit of `server.js` (5648 LOC) + `server/*` (~40 files)
> **Companion to** · `docs/02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md`
> **When to use it** · (a) Pre-flip gate before swinging `pryzm.so` DNS to Fly.io; (b) recurring audit before any production deploy; (c) post-incident verification.

Every finding is cited `file:line`. **GOOD** = ship as-is. **GAP** = document only (fix PRs come after). **WEAK** = ship-safe but next-sprint priority.

---

## §1 — Required environment variables (boot blocks if missing in production)

The boot-time `assertRequiredEnv()` (`server.js:223-247`) hard-exits if these are absent **and `npm_lifecycle_event !== 'dev'`**. Production boot will refuse to start without them.

| Var | Purpose | Format | Reference |
|---|---|---|---|
| `SESSION_SECRET` | HMAC secret for JWT signing (`jsonwebtoken`). Without it the server falls back to an **ephemeral per-process** secret — all sessions invalidate on every restart and OAuth tokens become unverifiable across machines. | ≥48-byte random hex string. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | `server/authStore.js:30-39`; `server/oauthService.js:33-37`; gate at `server.js:226` |
| `DATABASE_URL` **or** `SUPABASE_DB_URL` | Direct PostgreSQL connection string for the pool. One of the two MUST be set; `pgClient.js` prefers `DATABASE_URL`. Without either, project CRUD falls back to the in-memory store (data lost on restart). | `postgresql://user:pass@host:5432/db?sslmode=require` | `server/pgClient.js:39-50`; gate at `server.js:227-229` |

**Phase A note**: Fly.io secrets must be set via `fly secrets set SESSION_SECRET=…` **before** the first deploy. The fast-fail gate (`server.js:230-235`) is correct — surfaces config drift immediately rather than running broken.

---

## §2 — Strongly-recommended environment variables (auth/security weakens without them)

These produce **soft warnings** at boot (`server.js:237-246`) but do not block startup. Each materially degrades a security-relevant feature.

| Var | Purpose | Format | What breaks if missing | Reference |
|---|---|---|---|---|
| `ALLOWED_ORIGIN` | CORS allowlist (comma-separated). In production, *unset* → CORS **fails closed** (denies all cross-origin requests). | `https://pryzm.so,https://www.pryzm.so` | Browser app cannot call the API from any origin. | `server/corsPolicy.js:32-45` |
| `PUBLIC_BASE_URL` | Canonical server URL used to build OAuth `redirect_uri`. In production, unset → `getBaseUrl()` **throws** rather than trust the `Host:` header (open-redirect / token-theft prevention). | `https://pryzm.so` (no trailing slash) | Google + Microsoft OAuth callbacks return 500. | `server/oauthService.js:137-151` |
| `CF_WORKER_URL` **or** `ANTHROPIC_API_KEY` | AI upstream. CF Worker relay is preferred (key lives in Cloudflare). | Worker: `https://flat-morning-358d.<account>.workers.dev`; direct: `sk-ant-…` | All AI features 500 with `No AI upstream configured`. | `server.js:88-93`, gate at `server.js:240-242` |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Auth + project store backend (preferred over the `DATABASE_URL` PG fallback). Server-role key bypasses RLS — server-only secret. | URL + JWT-shaped key | Falls back to PG / in-memory — auth still works but RLS policies are not enforced server-side. | `server/supabaseClient.js:41-82`; warning at `server.js:122-130` |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Webhook signature verification + Checkout / Portal session creation. | `sk_live_…` + `whsec_…` | Webhook handler returns 200 with `received:true` but takes **no action** (`server.js:1835-1839`) — silent revenue loss. | `server.js:1832-1833`; verify at `server.js:1849` |
| `PRYZM_OWNER_EMAIL` | Auto-grants `'owner'` plan to this email at signup/signin. | `you@example.com` | No automatic admin promotion — owner plan must be set manually in DB. | `server/authStore.js:51`; `server/planStore.js:283` |

---

## §3 — Optional environment variables

| Var | Purpose | Format | Default | Reference |
|---|---|---|---|---|
| `ANTHROPIC_MODEL_ID` | Pin a specific Claude snapshot. | `claude-haiku-4-5` (alias preferred) | `claude-haiku-4-5` | `server.js:110` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth. Route returns 503 if unset. | — | unset | `server.js:1751-1753`; `server/oauthService.js:157-181` |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth. Route returns 503 if unset. | — | unset | `server.js:1790-1792`; `server/oauthService.js:195-219` |
| `STRIPE_PUBLISHABLE_KEY` | Client-side Stripe.js init. | `pk_live_…` | unset | `server/stripeRoutes.js:36` |
| `STRIPE_PRICE_*` (six vars) | Subscription price IDs per tier. | `price_…` | unset | `server/stripeService.js:29-38` |
| `APS_CLIENT_ID` / `APS_CLIENT_SECRET` | Autodesk Platform Services (DWG conversion). Feature disabled if unset. | — | unset | `server/dwgConversionService.js:32`; `server.js:2236` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAME` / `OTEL_EXPORTER_OTLP_HEADERS` | OpenTelemetry observability sink. Spans no-op when unset. | URL + headers | unset | `server/telemetry.js:31-54` |
| `INTERNAL_PLAN_SECRET` | Shared secret for plan-grant admin routes. | random hex | unset (route disabled) | `server.js:1619` |
| `AI_MODEL_VERSION` | Stamped on AI-usage rows. | string | `'unknown'` | `server/aiPublicApiRoutes.js:370` |
| `FAMILY_VIRUS_SCAN` | Set to `'0'` to disable virus-scan on family uploads. | `0`/`1` | enabled | `server/familyMarketplaceRoutes.js:43` |
| `REPLIT_DEV_DOMAIN` | Replit-injected; ignored on Fly. | host | unset | `server.js:95`; `server/oauthService.js:141-143` |
| `PORT` | Listen port. | int | `5000` | `server.js:5446` |
| `NODE_ENV` | Tighten security headers + boot-gate. **MUST be `production` on Fly.** | `production` | unset | `server/securityHeaders.js:58` |

---

## §4 — Security headers — `server/securityHeaders.js`

Module mounted **first** at `server.js:263`, ahead of CORS/compression/routes, so every response (including 4xx/5xx/preflight) inherits the full header set. Helmet ≥ 5.x.

| Header | Verdict | Notes |
|---|---|---|
| **Content-Security-Policy** | GOOD (enforced in prod) | `securityHeaders.js:148-156`. Report-only in dev, enforced in prod. `script-src` includes `'unsafe-eval'` (Three.js shader compilation — tracked for removal in ADR-047). `'unsafe-inline'` is dev-only (`SCRIPT_SRC_PROD` at line 90 excludes it). `style-src` keeps `'unsafe-inline'` permanently (CSS-in-JS + Three.js CSS2DRenderer). Acceptable for Phase A. |
| **Cross-Origin-Embedder-Policy** | GOOD | `credentialless` in prod (`securityHeaders.js:164`), enabling SharedArrayBuffer for Cesium/IFC WASM workers. Disabled in dev for Replit preview iframe. |
| **Cross-Origin-Opener-Policy** | GOOD | `same-origin` in prod (`securityHeaders.js:171`). |
| **Cross-Origin-Resource-Policy** | GOOD | `same-origin` in prod (`securityHeaders.js:179`). |
| **Referrer-Policy** | GOOD | `strict-origin-when-cross-origin` (`securityHeaders.js:184`). |
| **Strict-Transport-Security** | GOOD | 2-year max-age, includeSubDomains, preload (`securityHeaders.js:190-192`). Disabled in dev (localhost has no TLS). |
| **X-Content-Type-Options** | GOOD | `nosniff` (`securityHeaders.js:202`). |
| **X-Frame-Options** | GOOD | `SAMEORIGIN` in prod; removed entirely on `/embed` for third-party iframe support (`securityHeaders.js:258-261`). |
| **X-XSS-Protection** | GOOD (disabled by design) | Set to `0` (`securityHeaders.js:225`). The legacy auditor causes more XSS than it prevents; CSP is the defence. |
| **X-Powered-By** | GOOD | Removed via both `helmet.hidePoweredBy: true` (`securityHeaders.js:230`) **and** `app.disable('x-powered-by')` (`server.js:251`). Belt and suspenders. |
| **Origin-Agent-Cluster** | GOOD | Enabled (`securityHeaders.js:197`). |
| **Permissions-Policy** | GAP (not set) | Helmet 7+ doesn't set this by default. **Recommendation**: add `Permissions-Policy: camera=(), microphone=(), geolocation=()` once Cesium's geolocation needs are confirmed. Low priority. |

`IS_PROD` resolution (`securityHeaders.js:58`) is `(NODE_ENV==='production' OR npm_lifecycle_event!=='dev') AND dist/ exists`. **On Fly the Docker image MUST contain `dist/`** — otherwise headers silently downgrade to dev mode. Verify in the Fly machine: `curl -I https://pryzm.so/ | grep -i strict-transport-security`.

---

## §5 — CORS policy — `server/corsPolicy.js`

| Check | Verdict | Reference |
|---|---|---|
| Fail-closed when `ALLOWED_ORIGIN` unset in production | GOOD | `corsPolicy.js:31-45` returns `[]` (deny-all) + warns. Avoids the classic `origin:'*' + credentials:true` vulnerability. |
| Credentials allowed safely | GOOD | `credentials:true` (line 58) is paired with an explicit allowlist — never `*`. |
| Comma-separated multi-origin support | GOOD | `corsPolicy.js:43-44`. |
| Shared between Express and Socket.io | GOOD | Single source of truth: `expressCorsOptions()` + `socketCorsOptions()` (`server.js:281, 351`). |
| Methods + headers locked down | GOOD | `methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']`; `allowedHeaders: ['Content-Type','Authorization','x-internal-secret']` (`corsPolicy.js:56-57`). |
| Pre-flight handled | GOOD | `app.options('*', cors(...))` (`server.js:282`). |

**Phase A setting**: `ALLOWED_ORIGIN=https://pryzm.so,https://www.pryzm.so` (the `www` redirects per ADR-055 line 83 but its CORS will still preflight). Add `https://staging.pryzm.so` if/when that subdomain ships.

---

## §6 — Rate limiting — `server/rateLimiter.js`

Three limiters defined; all return JSON 429 (never HTML) on exceedance.

| Limiter | Window | Max | Scope | Verdict |
|---|---|---|---|---|
| `globalLimiter` | 15 min | **200** req/IP | All `/api/*` (`server.js:285`) | **WEAK** for production. 200 / 15 min ≈ 13 req/min for an authenticated session — the editor's autosave + cursor presence can blow this on a single user with multiple tabs. **Recommendation**: bump to 1000/15min or switch to user-id keying instead of IP for authenticated traffic. |
| `apiLimiter` | 1 min | 60 req/IP | `/api/v1/*`, `/api/v1/families` (`server.js:303, 313`) | GOOD — sized for CI / third-party callers. |
| `aiLimiter` | 15 min | 20 req/IP | AI proxy endpoints | GOOD — cost-control for Anthropic spend. Verify it is still wired on every AI route (memory note "applied to AI proxy only" — confirm post-deploy). |
| Trust-proxy hop count | 1 (`server.js:256`) | — | — | **CHECK**: Fly.io's edge + Cloudflare in front = **2 hops**. With `trust proxy = 1` the rate-limit key resolves to the Fly proxy IP (= single bucket for the whole world). **Recommendation**: when `pryzm.so` is behind Cloudflare, set `app.set('trust proxy', 2)` OR `app.set('trust proxy', '127.0.0.1, 10.0.0.0/8')`. Verify with `curl https://pryzm.so/api/health -I` — `X-Forwarded-For` should reveal the chain. |

---

## §7 — Auth + sessions — `server/authStore.js`

| Check | Verdict | Reference |
|---|---|---|
| bcrypt cost | **GOOD** | `BCRYPT_ROUNDS = 12` (`authStore.js:28`). Explicit; meets OWASP minimum. |
| JWT signing algorithm | GOOD | `jsonwebtoken` defaults to HS256 with `SESSION_SECRET`. |
| JWT expiry | **WEAK** | `TOKEN_EXPIRY = '30d'` (`authStore.js:29`; mirrored at `oauthService.js:32`). 30 days is generous — no refresh-token rotation, no per-device revocation. Acceptable for Phase A; **next sprint**: add a short-lived (15min) access token + 7-day refresh + server-side revocation list. |
| Session secret randomness | GOOD when set; ephemeral fallback otherwise | `authStore.js:30-39`. Boot gate (`server.js:226`) refuses to start in prod without it, so the ephemeral path is dev-only. |
| Secret logging | GOOD | `logSafe.js` provides `maskEmail`, `maskToken`, `isConfigured`. The boot diagnostic at `server.js:5510-5520` logs `<set>` / `<MISSING>` flags, never values. DB URL masking via `_maskDbUrl` (`server.js:5496-5508`) replaces password with `***`. |
| Cookie flags (HttpOnly / Secure / SameSite) | **N/A** | `grep res.cookie server.js` → 0 hits. Sessions are **JWT-in-Authorization-Bearer**, not cookies. Client stores in `localStorage`. Trade-off: no CSRF risk; vulnerable to XSS exfiltration. CSP (§4) is the only mitigation. **Consideration for sprint+1**: migrate to HttpOnly/Secure/SameSite=Lax cookies for the long session, keep Bearer for the API public surface. |
| Anonymous fallback | GOOD | `authMiddleware` (`server.js:636-712`) is fail-open: invalid token → `userId='anonymous'`. Every protected route must reject `'anonymous'` explicitly — verified for v1, AI Spend, family publish. Confirm any **new** route added post-audit. |
| Auth middleware throw-safety | GOOD | `server.js:679-701` wraps auxiliary DB lookups (`_resolveEmailForUserId`, `maybeAutoGrantOwner`) in try/catch so a DB blip doesn't 500 the request. Round-33 fix. |
| Owner promotion via env match | GOOD (but a foot-gun) | `PRYZM_OWNER_EMAIL` match → instant `'owner'` plan (`authStore.js:51-54`). Make sure this env is set to **a real person's email**, not a placeholder, before flip. |

---

## §8 — Database + Supabase — `server/pgClient.js`

| Check | Verdict | Reference |
|---|---|---|
| Connection-pool sizing | WEAK for production | `max: 10` (`pgClient.js:62`). Fly's free-tier machine has 256MB RAM (ADR-055 line 65); 10 pool slots × ~6MB / connection is fine. Supabase free tier limits to 60 direct connections — 10 is safe. **Bump only after scaling past free tier.** |
| Statement timeout | GOOD | `SET statement_timeout = '60s'` on every connect (`pgClient.js:82-86`). Caps runaway queries. |
| Idle-in-transaction timeout | GOOD | `SET idle_in_transaction_session_timeout = '30s'` (same block). Reaps leaked `BEGIN`s. |
| Connection timeout | GOOD | `connectionTimeoutMillis: 10_000` (`pgClient.js:64`). |
| TLS | GOOD | `ssl: { rejectUnauthorized: false }` for non-localhost (`pgClient.js:61`). **GAP**: `rejectUnauthorized: false` accepts self-signed certs — fine for Supabase (their CA is valid) but the flag would mask MITM if someone swapped the URL. **Recommendation**: switch to `ssl: { rejectUnauthorized: true }` for `*.supabase.co` URLs, falling back only for self-host scenarios. Low priority. |
| Preflight (boot health) | GOOD | `pgPreflight()` (`pgClient.js:124-141`) races `SELECT 1` against a 6s timeout so an unreachable host doesn't hang boot. |
| Migration-race gate | GOOD | `_migrationsSettled` flag (`pgClient.js:195-209`) opens the v1 gate **after** boot migration finishes (success **or** terminal failure), so a configured-but-unreachable DB falls through to in-memory rather than 503-loops. |
| Transactions | GOOD | `withTransaction()` (`pgClient.js:227-242`) — BEGIN/COMMIT/ROLLBACK wrapper, releases client always. |
| Prepared statement / param binding | GOOD | All real-traffic queries use `$1, $2, …` placeholders. Verified in `authStore.js:157-167, 191-194, 205-213`, every `pgQuery(...)` in `server.js`, and the Stripe webhook (`server.js:1873-1879`, etc.). |
| Raw template-string SQL with user input | ONE FINDING | `server.js:4538-4571` builds `marketplace_plugins` listing with dynamic `WHERE ${where}`. **Analysis**: `where` is composed only from **literal column-name fragments** built by the server (`conditions.push('category = $N')`); user values (`q`, `cat`) go through `params.push(...)` placeholders. Verdict: **NOT injectable** — the template substitution is safe because no user-controlled string is interpolated. Note for the next reviewer so they don't change the pattern carelessly. |
| Supabase RLS | OUT-OF-SCOPE here | RLS policies live in `server/supabase-rls.sql`. Service-role key bypasses RLS — server is trusted boundary. Audit RLS separately. |

---

## §9 — OAuth callback URIs to update post-DNS-flip

When `pryzm.so` CNAME points at Fly, the OAuth provider dashboards need new entries. The code-side `redirect_uri` builders use `getBaseUrl(req)` (`server/oauthService.js:137-151`), which returns `process.env.PUBLIC_BASE_URL` (highest priority). Set `PUBLIC_BASE_URL=https://pryzm.so` as a Fly secret and the callbacks below are what's generated.

### Google Cloud Console → OAuth 2.0 Client ID → Authorized redirect URIs

Add:

```
https://pryzm.so/api/auth/google/callback
```

Keep (until Phase A confirms green for ≥1 sprint):

```
https://<old-replit-domain>/api/auth/google/callback
```

Code path: `server.js:1761` (callback handler), `server/oauthService.js:155-164` (URL builder).

### Microsoft Azure AD → App registration → Redirect URIs (type: Web)

Add:

```
https://pryzm.so/api/auth/microsoft/callback
```

Keep (until Phase A confirms green for ≥1 sprint):

```
https://<old-replit-domain>/api/auth/microsoft/callback
```

Code path: `server.js:1800` (callback handler), `server/oauthService.js:193-203` (URL builder).

### Verification post-flip

1. `curl -I https://pryzm.so/api/auth/google` → expect `302 Location: https://accounts.google.com/o/oauth2/v2/auth?...&redirect_uri=https%3A%2F%2Fpryzm.so%2Fapi%2Fauth%2Fgoogle%2Fcallback&...`
2. Same for `/api/auth/microsoft` → expect `login.microsoftonline.com/.../authorize?...redirect_uri=https%3A%2F%2Fpryzm.so%2Fapi%2Fauth%2Fmicrosoft%2Fcallback&...`
3. End-to-end: sign in via popup. If the popup shows `redirect_uri_mismatch`, the provider dashboard is stale.

---

## §10 — Stripe webhooks

| Check | Verdict | Reference |
|---|---|---|
| Signature verification | GOOD | `constructWebhookEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)` is the **first** action after env check (`server.js:1849`). Failure → 400 (`server.js:1850-1853`) — exactly correct. |
| Raw body capture | GOOD | Global JSON parser explicitly **skips** `/api/stripe/webhook` (`server.js:273-277`). Webhook handler uses `express.raw({ type: 'application/json' })` (`server.js:1831`). Stripe SDK requires the raw `Buffer` — confirmed. |
| Missing-secret fail mode | **WEAK** | When `STRIPE_WEBHOOK_SECRET` is unset, the handler returns 200 `{received:true}` (`server.js:1835-1839`). **Trade-off**: Stripe stops retrying (good for cold-start staging); but if production loses the secret mid-flight, real events are silently dropped. **Recommendation**: in prod (`isProd`) return 503 instead of 200 so retries continue + monitoring alerts. |
| Missing signature header | GOOD | 400 with `Missing stripe-signature header.` (`server.js:1841-1844`). |
| Event handler errors | GOOD | Try/catch returns 500 (`server.js:1963-1965`) — Stripe will retry. |
| Per-event DB writes use parameterised queries | GOOD | All `pgQuery(...)` with `$N` placeholders (`server.js:1873-1879, 1903-1913, 1927-1932, 1946-1952`). |

### Webhook secret rotation for `pryzm.so`

Per ADR-055 §A (Sprint 3), when DNS flips:

1. Stripe Dashboard → Developers → Webhooks → existing endpoint → **Roll secret** (or create a new endpoint URL `https://pryzm.so/api/stripe/webhook` and disable the old Replit one).
2. `fly secrets set STRIPE_WEBHOOK_SECRET=whsec_…`
3. Trigger a test event in Stripe Dashboard → expect 200 + log line `[stripe] Event received: <type>` (`server.js:1856`).

---

## §11 — Error handling + logging

| Check | Verdict | Reference |
|---|---|---|
| Terminal error handler returns JSON, not HTML | GOOD | `server.js:5388-5436` — 4-arg Express handler is the LAST middleware. Returns `{ error, errorId }`. Mints UUID for log/response correlation. |
| Stack trace leakage in 500 responses | **GOOD** | Response body deliberately excludes `err.message` — only `error` (generic) + `errorId` (`server.js:5432-5435`). Comment explicitly cites the risk of leaking internal paths / secrets. |
| Stack trace logged server-side | GOOD | `console.error` includes `stack`, `code`, `detail`, `type`, `name`, `statusCode` (`server.js:5419-5429`). |
| Per-route 500s leak `err.message` | **2 FINDINGS** | `server.js:2253, 2312, 2332, 2355, 2379` return `{ error: String(err.message ?? err) }` (Autodesk / DWG conversion endpoints). Also `server.js:340` (AI spend) returns `detail: err.message`. **Recommendation**: switch to the `errorId`-only pattern. Low/medium priority — these paths are authenticated. |
| Unhandled rejection / uncaught exception safety | GOOD | `server.js:188-214`. `unhandledRejection` logs + keeps process alive. `uncaughtException` in prod: log + `process.exit(1)` after 100ms so the orchestrator restarts cleanly; in dev: log + keep alive (matches developer expectations). |
| Structured logger | **GAP** | Direct `console.log/warn/error` throughout. No JSON-shaped log emitter, no log levels, no log shipper config. Fine for Fly stdout capture; **recommendation**: when observability budget allows, add `pino` (~1k LOC change). |
| Sensitive-field redaction in logs | GOOD | `server/logSafe.js` exports `maskEmail`, `maskToken`, `isConfigured`. Boot diagnostic uses `<set>`/`<MISSING>` flags (`server.js:5510-5520`) — never raw secret values. DB URL passwords masked via `_maskDbUrl` (`server.js:5496-5508`). |
| JWT / bcrypt / API keys never logged | GOOD | grep confirmed: no `console.log(.*SECRET)`, `console.log(.*KEY)` against value references. Helper `isConfigured()` exists specifically to avoid tripping Replit's HoundDog PII scanner. |

---

## §12 — Health + readiness — `/api/health*`

| Endpoint | Purpose | Verdict | Reference |
|---|---|---|---|
| `GET /api/health/live` | Process liveness — returns 200 if Node is up. NO DB hit. Safe for LB high-frequency polling. | GOOD | `server.js:1988` |
| `GET /api/health/ready` | Readiness — single `SELECT 1` against pool. 503 when DB down. Safe for orchestrator drain decisions. | GOOD | `server.js:1989-1998` |
| `GET /api/health` | Deep health — checks DB backend + Supabase REST reachability + schema integrity (information_schema lookup of 3 required tables). | GOOD (but heavy) | `server.js:2000+`. Comment explicitly warns not to poll this every few seconds — three info_schema queries would self-DoS the pool. |

**Fly.io health-check config recommendation** (per `fly.toml`):

```toml
[[services.http_checks]]
  path = "/api/health/live"
  interval = "10s"
  grace_period = "5s"
  timeout = "2s"
```

Reserve `/api/health/ready` for the manual drain probe; `/api/health` for human-driven runbook checks.

---

## §13 — Graceful shutdown

| Check | Verdict | Reference |
|---|---|---|
| `SIGTERM` handler | GOOD | `server.js:5647`. Drains httpServer + socket.io + PG pool, then exits 0. |
| `SIGINT` handler | GOOD | `server.js:5648`. Same path. |
| Force-kill timer | GOOD | 10s ceiling (`server.js:5621-5625`) — if drain hangs, `process.exit(1)` to let Fly restart. |
| Re-entrancy guard | GOOD | `_shuttingDown` boolean (`server.js:5616-5619`). |
| In-flight HTTP requests drained | GOOD | `httpServer.close()` waits for current responses to finish (`server.js:5628-5631`). |
| Socket.io disconnect | GOOD | `io.close()` (`server.js:5633-5634`). |
| PG pool drain | GOOD | `pool.end()` then exit (`server.js:5637-5645`). |
| Fire-and-forget DB writes loss | **KNOWN GAP** | Comment at `server.js:5613` explicitly notes: "`_persistToDb()` writes lose data" if a project save lands mid-shutdown. Acceptable for Phase A (low write volume); revisit with a write-queue + flush-on-drain in a later sprint. |

Fly.io sends SIGINT then waits the `kill_timeout` (default 5s) before SIGKILL — **bump `kill_timeout` to `15s`** in `fly.toml` so the 10s force-exit timer can complete.

---

## §14 — Backup & DR (Supabase PITR)

Per ADR-055 line 45 + line 147 (C48 reference):

| Target | Mechanism | Verdict | Notes |
|---|---|---|---|
| **Database** | Supabase PITR (Point-in-Time Recovery) | Plan-dependent — Free tier = daily backup only, no PITR. **Pro tier ($25/mo) is required for PITR.** | ADR-055 budget assumes Pro tier "at scale" — confirm enabled **before** first paying customer. |
| **Object storage** | Cloudflare R2 versioning | Per ADR-055 §C48 reference | R2 versioning is a per-bucket flag — verify ON before any user file is uploaded. |
| **In-memory project store** | None (volatile by design) | GOOD | The in-memory fallback (`§SERVER-PG-DEGRADE` in `projectStore.js`) is for dev-without-DB. **Production must never run in this mode** — boot gate `assertRequiredEnv()` enforces. |
| **Code / config** | Git + Fly machine image | GOOD | Standard. |

**RTO / RPO targets (per C48 reference, to confirm in C48 itself):**

- **RPO (data loss tolerance)** — ≤ 5 min on Pro tier (PITR granularity); ≤ 24 h on Free tier.
- **RTO (recovery time)** — ≤ 1 h for DB restore (Supabase support SLA); ≤ 15 min for app redeploy (`fly deploy`).

**Verification cadence**: trigger a non-production restore drill every quarter. Document the result in `docs/05-guides/deployments/` as `DR-DRILL-<date>.md`.

---

## §15 — Pre-flip gate (the actual checklist)

Run this before swinging `pryzm.so` DNS at Fly.io. Tick each box; only flip when **all** are green.

### Secrets configured in Fly (`fly secrets list`)

- [ ] `SESSION_SECRET` — set, ≥ 48 random bytes
- [ ] `DATABASE_URL` **or** `SUPABASE_DB_URL` — points at the production Supabase project
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — production project
- [ ] `ALLOWED_ORIGIN=https://pryzm.so,https://www.pryzm.so`
- [ ] `PUBLIC_BASE_URL=https://pryzm.so`
- [ ] `CF_WORKER_URL` (preferred) **or** `ANTHROPIC_API_KEY`
- [ ] `STRIPE_SECRET_KEY=sk_live_…` (NOT test mode)
- [ ] `STRIPE_WEBHOOK_SECRET=whsec_…` (rotated for the pryzm.so endpoint — §10)
- [ ] `PRYZM_OWNER_EMAIL` — real admin email
- [ ] `NODE_ENV=production`
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (if Google sign-in flips with this deploy)
- [ ] `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (if MS sign-in flips with this deploy)

### OAuth provider dashboards updated (§9)

- [ ] Google Cloud Console: `https://pryzm.so/api/auth/google/callback` added to Authorized redirect URIs
- [ ] Microsoft Azure AD: `https://pryzm.so/api/auth/microsoft/callback` added to App registration redirect URIs
- [ ] Old Replit callback URIs retained for ≥ 1 sprint as rollback safety

### Reachability + headers verified on the Fly machine

- [ ] `curl -fsS https://pryzm.so/api/health/live` → `{"ok":true}`
- [ ] `curl -fsS https://pryzm.so/api/health/ready` → `{"ok":true}` (DB reachable)
- [ ] `curl -fsS https://pryzm.so/api/health | jq` → `schemaOk:true`, `backend:'replit'|'supabase'`
- [ ] `curl -I https://pryzm.so/` shows `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- [ ] `curl -I https://pryzm.so/` shows `Content-Security-Policy:` (NOT `…-Report-Only:` — that's dev-mode)
- [ ] `curl -I https://pryzm.so/` shows `Cross-Origin-Opener-Policy: same-origin`
- [ ] CORS allows `Origin: https://pryzm.so` but rejects `Origin: https://evil.example`

### Stripe end-to-end

- [ ] Stripe Dashboard → Developers → Webhooks → endpoint URL = `https://pryzm.so/api/stripe/webhook`
- [ ] Test event from Stripe → 200 + log line `[stripe] Event received: …`
- [ ] Webhook secret rotated for the pryzm.so endpoint; old Replit endpoint disabled or deleted

### Operational

- [ ] DB pool size matches Fly machine RAM (default `max:10` is correct for 256MB; bump for larger machines)
- [ ] Supabase PITR enabled (Pro tier) **or** acknowledged as deferred to billed-launch
- [ ] Last Supabase backup confirmed < 24 h old (Supabase Dashboard → Database → Backups)
- [ ] Cloudflare R2 bucket versioning ON for every user-data bucket
- [ ] `fly.toml` `kill_timeout = '15s'` so graceful shutdown's 10s drain can complete (§13)
- [ ] `app.set('trust proxy', N)` reviewed against the deployed proxy chain (§6) — likely `2` once behind Cloudflare → Fly
- [ ] Observability endpoint configured (`OTEL_EXPORTER_OTLP_ENDPOINT`) **or** noted as gap in the launch ticket
- [ ] Sentry / error-aggregation configured **or** noted as gap (current state: logs to stdout only — Fly's log explorer is the fallback)

### Rollback rehearsal

- [ ] CNAME → old origin DNS record cached and ready to reapply (TTL ≤ 60s during flip)
- [ ] Old Replit / staging deployment kept running for ≥ 1 sprint
- [ ] Smoke-test script (curl health + sign-in + create project + delete project) parked in `scripts/check/` and runs green against both old + new origins

---

**Next runbook** (post-flip, recurring): pin this document at the top of `docs/05-guides/deployments/`. Re-read §15 before every production deploy. When the rate-limit / cookie / Permissions-Policy / structured-logger / `err.message`-leak gaps are closed in follow-up PRs, flip those rows from **WEAK/GAP** to **GOOD** in place — keep this file canonical.
