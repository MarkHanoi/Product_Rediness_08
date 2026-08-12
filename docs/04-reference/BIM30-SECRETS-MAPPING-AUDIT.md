# BIM30 — Secrets / Sensitive-Config Contractual-Mapping Audit

> **Stamp:** 2026-08-12 · **Mode:** READ-ONLY security-configuration audit · **HEAD:** f4a2d999 (branch `main`)
> **Commissioned because:** a `SESSION_SECRET` misreading went uncaught for lack of a map that OWNS the secret enumeration.
> **Security discipline of this document:** NAME · presence · length only. **No secret VALUE is printed anywhere.** Presence-not-value.

---

## 1. VERDICT

**NO — secrets and sensitive config are NOT contractually mapped.** No contract in the C01–C75 suite OWNS the
enumeration of the system's secrets/env the way **C69** owns the verb list or **C65** owns the element-type list.
`C08 §Auth` *mentions* `SESSION_SECRET`, `SESSION_SECRET_TTL`, `STRIPE_WEBHOOK_SECRET` and `DATABASE_URL` in prose,
but names no register, declares no per-secret read-site / service / shared-with / failure-mode, and has no gate.
**This is the C69 / COORD-01 pattern a third time: nothing owns the question, so a misconfiguration (wrong value,
missing value, or a secret that must be byte-identical across two services but silently is not) has no artefact that
would catch it.** The `SESSION_SECRET` incident is the first realised instance of that gap.

---

## 2. THE SECRET / SENSITIVE-CONFIG INVENTORY (Part 1 — EXECUTED greps)

Legend — **Kind:** SECRET / PUBLIC (ships in bundle by design) / CONFIG (non-secret operational). **Inlined:** vite build-time-baked
vs runtime `process.env`. **Prod:** whether configured-in-prod is verifiable read-only → **NOT-ESTABLISHED** where it is not.

### 2a. BFF (`server.js` + `server/*.js`) — runtime `process.env`

| NAME | read at (file:line) | Kind | Inlined? | What FAILS without it | Shared? |
|---|---|---|---|---|---|
| **SESSION_SECRET** | `server/authStore.js:33`, `server/oauthService.js:36`, `server.js:276,6112` | SECRET | runtime | **Ephemeral per-process fallback** (`authStore.js:30`, `randomBytes(48)`) — sessions silently invalidate on restart / differ per instance; token verification breaks cross-service | **YES — must be byte-identical with sync-server** |
| **DATABASE_URL** | `server/pgClient.js:52,54`, `server.js:277,6111` | SECRET | runtime | Falls back to in-memory Postgres (degraded, non-durable); `PRYZM_FORCE_INMEMORY` interacts | **YES — sync-server (PgAuthz/PgEventLog)** |
| **SUPABASE_DB_URL** | `server/pgClient.js:57,59`, `server.js:6110,6121` | SECRET | runtime | Alternate DB DSN; unset → DATABASE_URL path | with DB tier |
| **SUPABASE_URL** / **NEXT_PUBLIC_SUPABASE_URL** | `server/supabaseClient.js:41`, `server.js:154,6107` | CONFIG (URL) | runtime | Supabase client unavailable → auth/storage degraded | — |
| **SUPABASE_SERVICE_ROLE_KEY** | `server/supabaseClient.js:51,82`, `server.js:155,6108` | SECRET | runtime | Privileged Supabase ops fail | — |
| **SUPABASE_ANON_KEY** / **NEXT_PUBLIC_SUPABASE_ANON_KEY** | `server/supabaseClient.js:52,53`, `server.js:6109` | PUBLIC | runtime | Client-side Supabase disabled | — |
| **CF_WORKER_URL** | `server.js:125,290,6114` | SECRET-ish (proxy URL) | runtime | Falls through to direct `ANTHROPIC_API_KEY`; if neither → AI proxy dead | — |
| **ANTHROPIC_API_KEY** | `server.js:120,290,6115` | SECRET | runtime | With no CF_WORKER_URL → AI features hard-degraded | — |
| **PRYZM_OWNER_EMAIL** | `server/authStore.js:51`, `server/oauthService.js:40`, `server.js:1875,2856,3651,6113` + more | SENSITIVE CONFIG | runtime | Owner-grant resolves to `free`; no owner auto-grant | — |
| **PRYZM_OWNER_PASSWORD** | `server/supabaseMigrate.js:193` | SECRET | runtime | Owner seed account not provisioned | — |
| **ALLOWED_ORIGIN** | `server/corsPolicy.js:32`, `server.js:288` | CONFIG | runtime | CORS default (may open/lock origins by NODE_ENV) | — |
| **PUBLIC_BASE_URL** | `server/oauthService.js:138,139`, `server.js:289,432` | CONFIG | runtime | OAuth redirect URIs wrong → OAuth breaks | — |
| **STRIPE_SECRET_KEY** | `server/stripeService.js:44`, `server.js:2153,2506,5551` | SECRET | runtime | Billing disabled | — |
| **STRIPE_WEBHOOK_SECRET** | `server.js:302,2154,2506`, `server/stripeRoutes.js` (verify) | SECRET | runtime | Webhook signature verification fails → billing events dropped | — |
| **STRIPE_PUBLISHABLE_KEY** | `server/stripeRoutes.js:36` | PUBLIC | runtime | Client checkout disabled | — |
| **STRIPE_PRICE_*** (6: ARCHITECT/STUDIO/FIRM × MONTHLY/ANNUAL) | `server/stripeService.js:29–38` | CONFIG (ids) | runtime | Plan purchase mapping missing | — |
| **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET** | `server/oauthService.js:157,173,174`, `server.js:2044` | SECRET (secret half) | runtime | Google OAuth disabled | — |
| **MICROSOFT_CLIENT_ID** / **MICROSOFT_CLIENT_SECRET** | `server/oauthService.js:195,211,212`, `server.js:2098` | SECRET (secret half) | runtime | Microsoft OAuth disabled | — |
| **APS_CLIENT_ID** / **APS_CLIENT_SECRET** | `server/dwgConversionService.js:32,71,72`, `server.js:2682` | SECRET | runtime | Autodesk DWG conversion disabled | — |
| **DATAFORDELER_API_KEY** | `server/jurisdiction/dkMatrikelProxy.js:247,272` | SECRET | runtime | DK cadastre proxy fails | — |
| **RESEND_API_KEY** | `server/accessAttemptNotifier.js:49` | SECRET | runtime | Access-attempt email notifications silently off | — |
| **INTERNAL_PLAN_SECRET** | `server.js:1835` | SECRET | runtime | Internal plan endpoint auth bypass/deny | — |
| **STRIPE_WEBHOOK_SECRET**/**STRIPE_SECRET_KEY** test doubles (`__TEST_*`) | `server/__tests__/security-gates-adr-055.test.ts:135–183` | TEST-ONLY | test | — | — |
| **OTEL_EXPORTER_OTLP_HEADERS** | `server/telemetry.js:68` | SECRET (may carry auth token) | runtime | Telemetry export unauthenticated/off | — |
| **OTEL_EXPORTER_OTLP_ENDPOINT** / **OTEL_SERVICE_NAME** | `server/telemetry.js:33,34`, `server.js:2489,2511` | CONFIG | runtime | Spans not exported | — |
| **CATALOG_UPSTREAM** / **CONTEXT_TILES_UPSTREAM** | `server/context-delivery/*.js:39,44` | CONFIG (URL) | runtime | Proxy targets missing | — |
| **DK_MATRIKEL_WFS_URL / _GEOM_TYPENAME / _TYPENAME** | `server/jurisdiction/dkMatrikelProxy.js:44,52,57` | CONFIG | runtime | DK proxy misconfigured | — |
| **AI_MODEL_VERSION** / **ANTHROPIC_MODEL_ID** | `server/aiPublicApiRoutes.js:370`, `server.js:142` | CONFIG | runtime | Model pin default | — |
| Operational non-secret: **NODE_ENV, PORT, TRUST_PROXY_HOPS, PG_POOL_MAX, PG_STATEMENT_TIMEOUT*, PG_PREFLIGHT_TIMEOUT_MS, MIGRATION_BOOT_GATE_TIMEOUT_MS, PRYZM_FORCE_INMEMORY, PRYZM_ACCESS_CHECK_RETRYABLE, FAMILY_VIRUS_SCAN, ACCESS_NOTIFY_TO/FROM, APEX_ORIGIN, REPLIT_DEV_DOMAIN, GIT_SHA, GIT_BRANCH, BUILT_AT, RUN_NUMBER, FLY_IMAGE_REF** | various | CONFIG | runtime | operational/observability defaults | — |

### 2b. Editor client (`import.meta.env.*`) — **BUILD-TIME INLINED by vite, served in the public bundle**

| NAME | read at (file:line) | Kind | Inlined? | Note |
|---|---|---|---|---|
| **VITE_CESIUM_TOKEN** | `apps/editor/src/ui/geospatial/CesiumViewport.ts:233`; `Dockerfile:118` ARG/ENV | PUBLIC client token (baked) | **build-time** | Ships in `dist/assets`; Dockerfile comment states it is a public client token — scope+rotate from ion dashboard |
| **VITE_GOOGLE_MAPS_KEY** | `CesiumViewport.ts:241`; `Dockerfile:127` | PUBLIC client key (baked) | **build-time** | Ships in bundle; restrict by API + referrer |
| **VITE_GLB_URL** | `Dockerfile:138`; `.github/workflows/deploy-fly.yml:431,467` | PUBLIC CDN URL | **build-time** | R2 furniture base; empty → local `/items/` |
| **VITE_CONTEXT_TILES_URL** | `Dockerfile:144`; `server/context-delivery/contextTilesProxy.js:45`; `deploy-fly.yml:432,472` | PUBLIC CDN URL | **build-time** | Empty → live Overpass fallback |
| **VITE_SYNC_URL** | `src/main.ts` (SyncClient url); `docs`/`STATUS-REPORT-2026-07-21.md:409` | CONFIG (URL) | build-time | Unset → collaboration off |
| **VITE_COLLAB_CRDT** | `src/main.ts`; `STATUS-REPORT-2026-07-21.md:408`; `ADR-0311` | CONFIG flag | build-time | Gates CRDT provider |
| **VITE_MUC_ZONING_ENDPOINT / VITE_DK_MATRIKEL_PARCEL_ENDPOINT / VITE_CATASTRO_PARCEL_ENDPOINT / VITE_CATASTRO_BLOCK_ENDPOINT / VITE_GEOCODE_ENDPOINT** | `apps/editor/src/ui/site/**` (`:24,:18,:23,:31,:41`) | PUBLIC endpoint URLs | build-time | Jurisdiction data endpoints, inlined |

### 2c. Sync-server (`apps/sync-server`) — read via injected `env` object (`src/index.ts:83` → `opts.env ?? process.env`)

| NAME | read at (file:line) | Kind | Inlined? | What FAILS without it | Shared? |
|---|---|---|---|---|---|
| **SESSION_SECRET** | `src/auth/WsAuthGate.ts:158–185`, `verifySessionToken.ts`; test seam `index.ts:51` | SECRET | runtime | WS-upgrade auth cannot verify BFF-issued tokens → refuses (fail-closed) unless `PRYZM_SYNC_WS_AUTH=trust-query` | **YES — must equal BFF's SESSION_SECRET** |
| **DATABASE_URL** | `src/authz/PgAuthz.ts`, `src/eventLog/createEventLog.ts:53` | SECRET | runtime | `AUTHZ_MODE=pg` with no URL → **refuses every request**; `SYNC_EVENT_LOG=pg` → in-memory + warn | **YES — BFF** |
| **PRYZM_AUTHZ_MODE** | `src/authz/policies.ts:106`; `fly.toml:30` = `memory-allow-by-default` | SENSITIVE CONFIG | runtime | Default is permissive; security posture depends on this value | — |
| **PRYZM_SYNC_WS_AUTH** | `src/auth/WsAuthGate.ts:158`; `fly.toml:32` deliberately UNSET | SENSITIVE CONFIG | runtime | `trust-query` DISABLES upgrade auth | — |
| **SYNC_EVENT_LOG** | `src/eventLog/createEventLog.ts:39`; `fly.toml:31` = `memory` | CONFIG | runtime | `pg` needs DATABASE_URL; else in-memory | — |
| **SYNC_PORT** | `fly.toml:26`, `Dockerfile:32` (default 4000) | CONFIG | runtime | Listen port | — |

### 2d. Deploy build-arg contract (`Dockerfile` — the NINE args CI passes at `deploy-fly.yml:428–436`)

`LOWMEM`, `PNPM_VERSION`, **`VITE_CESIUM_TOKEN`**, **`VITE_GOOGLE_MAPS_KEY`**, **`VITE_GLB_URL`**, **`VITE_CONTEXT_TILES_URL`**,
`GIT_SHA`, `GIT_BRANCH`, `BUILT_AT`, `RUN_NUMBER`. Governed ONLY by prose in `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md §3`
(header `Status: ACTIVE`, but it is a **manual-deploy runbook, not a C-suite contract**). The two `VITE_*` credentials are
**build-time-inlined and public by design** — that fact lives in Dockerfile comments and the deploy runbook, **not in any contract.**

> **CONFIGURED-in-prod status is NOT-ESTABLISHED for every secret above** — read-only, no live secret reads permitted.
> This audit certifies EXISTS-in-code + read-site + failure-trace, not prod presence.

---

## 3. THE OWNERSHIP MATRIX (Part 2)

For each candidate owner, the answer to "does this contract OWN the secret's declaration (name · read-site · service · inlined · failure · shared-with)?"

| Secret / config class | C01 Arch | C03 State | C05 Persist | C08 Collab-Sec | C10 Perf/Obs | C13 Isolation | C39/C40 Billing | C51 Apex-split | C67/C68 Chat | C69 Verb-reg | **OWNER?** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SESSION_SECRET (+ shared-with-sync invariant) | — | — | — | *mentions* name+TTL (`C08:16,18,35`), NOT the register, NOT shared-with | — | — | — | — | — | — | **NO OWNER** |
| DATABASE_URL / SUPABASE_DB_URL | — | — | *mentions* self-host DSN (`C08:176`) | *mentions* | — | — | — | — | — | — | **NO OWNER** |
| SUPABASE_* keys | — | — | — | — | — | — | — | — | — | — | **NO OWNER** |
| ANTHROPIC_API_KEY / CF_WORKER_URL | — | — | — | — | — | — | — | — | (assumes AI host) | — | **NO OWNER** |
| STRIPE_* (secret + webhook) | — | — | — | *mentions* webhook secret (`C08:166`) | — | — | pricing prose, not secret reg | — | — | — | **NO OWNER** |
| Google/Microsoft/APS OAuth secrets | — | — | — | *mentions* OAuth flow (`C08:35`), not creds | — | — | — | — | — | — | **NO OWNER** |
| DATAFORDELER / RESEND / INTERNAL_PLAN_SECRET / OTEL headers | — | — | — | — | OTel prose only | — | — | — | — | — | **NO OWNER** |
| PRYZM_OWNER_EMAIL / _PASSWORD | — | — | — | — | — | — | — | — | — | — | **NO OWNER** |
| sync-server AUTHZ_MODE / WS_AUTH / EVENT_LOG | — | — | — | closest in spirit; NOT enumerated | — | — | — | — | — | — | **NO OWNER** |
| VITE_* build-time public creds (4) | — | — | — | — | — | — | — | apex/app split prose | — | — | **NO OWNER (Dockerfile + DEPLOY runbook only)** |
| The nine build-args as a set | — | — | — | — | — | — | — | — | — | — | **NO OWNER (runbook `DEPLOY-CONTRACT-MANUAL-FLY.md §3`, not a contract)** |
| **Shared-secret invariant (SESSION_SECRET byte-identical BFF↔sync)** | — | — | — | — | — | — | — | — | — | — | **NO OWNER — this is the realised-incident gap** |

**Every row's owner column is NO OWNER.** No contract owns the deploy build-arg set; no contract owns the shared-secret invariant.

---

## 4. LATENT RISKS THE MISSING MAP ALLOWS

1. **SESSION_SECRET shared-secret invariant is unowned (realised incident).** The BFF signs session/JWT tokens with
   `SESSION_SECRET` (`authStore.js:33`, `oauthService.js:36`); the sync-server verifies WS-upgrade tokens with the SAME
   secret (`WsAuthGate.ts:174–185`). **They MUST be byte-identical across two independently-deployed Fly apps.** Nothing
   asserts this. A drift (rotate one, forget the other; or a whitespace/newline difference) makes every collaboration
   upgrade fail auth — or, combined with `PRYZM_SYNC_WS_AUTH=trust-query`, silently *disables* upgrade auth. This is
   exactly the class the `SESSION_SECRET` misreading fell into.
2. **Ephemeral insecure fallback is unowned.** `authStore.js:30–38` mints a per-process `randomBytes(48)` secret and only
   `console.warn`s when `SESSION_SECRET` is unset. A prod instance that boots without it "works" but silently invalidates
   sessions on restart and cannot share tokens with sync-server. Failure-vs-emptiness: a missing secret looks like a
   working one until the second instance/restart.
3. **Four VITE_* credentials are build-time-inlined and shipped in the public bundle** (`Dockerfile:111–145`). This is
   intended for the two map tokens (public client tokens), but the *fact* is stated only in Dockerfile comments and a
   deploy runbook — **no contract states "these are public-by-design and MUST be scoped/rotated as such,"** and nothing
   prevents a future dev from build-arg-baking a genuinely-secret value (e.g. mistakenly wiring `ANTHROPIC_API_KEY` as a
   `VITE_` var), which would be irreversibly published in `dist/`.
4. **Multiple high-value secrets have degraded/silent fallbacks** (DATABASE_URL → in-memory; CF_WORKER_URL/ANTHROPIC →
   AI off; RESEND_API_KEY → notifications silently off; OTEL headers → unauthenticated export). Each is a
   "empty == working" honesty trap with no register to make the required set explicit.
5. **`PRYZM_AUTHZ_MODE` defaults permissive** (`memory-allow-by-default`, `fly.toml:30`) and `PRYZM_SYNC_WS_AUTH=trust-query`
   is a security-off switch — both are security posture encoded in unowned env, not in a contract.

---

## 5. RECOMMENDATION — smallest correct fix (founder conservatism rule)

**No existing contract can own this cleanly** — C08 is the nearest, but it is the collaboration/auth *behaviour* contract,
not a secrets *register*; folding a generated env inventory into it would bloat it and still leave the deploy build-args
and the sync-server operational env outside its remit. This is the **C69 pattern**: mint a dedicated register-owning contract.

**Recommend a new contract — candidate `C77` (VERIFIED FREE against the README index: highest minted is C75; C76 is
earmarked for the element-family register in COORD-01, `docs/04-reference/reviews/BIM30-CONTRACT-REVIEW-COORDINATOR-NOTES.md:47`).**

**C77 — Secrets & Configuration Register.** It owns:
- **A GENERATED register** (`tools/ga-gate/…` emits it), one row per env name, with:
  - *Measured columns* (from grep, like C69): NAME · read-site(s) · consuming service (BFF / editor-client / sync-server / worker / CI / deploy) · **inlined-vs-runtime** · secret/public/config.
  - *Declared columns*: required-or-optional · **shared-with** (the SESSION_SECRET BFF↔sync invariant becomes a declared, checkable field) · failure-mode (hard-exit / ephemeral-fallback / degraded / broken-bundle).
- **The build-arg sub-contract** — the nine Dockerfile args and the "VITE_* is public-by-design, MUST NOT carry a secret value" rule, promoted out of the deploy runbook into contract law.
- **A gate** (`check-secrets-registered.ts`) that:
  - (a) **FAILS if a `process.env.X` or `import.meta.env.X` read exists for a name absent from the register** — the C69 "unregistered read" pattern.
  - (b) **NEVER prints a value.** It asserts a NAME is declared and (optionally, via a deploy-time probe) PRESENT — **presence-not-value.** The gate's report shows name · service · set/unset · length only, never the secret. This is the security constraint that makes it different from C69: the same failure-vs-emptiness discipline C-honesty applies to data, applied to credentials.
  - (c) **Flags any `VITE_`/`import.meta.env` name marked SECRET** as a build-time-inlined-secret violation (guards risk #3).

This is the smallest fix that closes all three unowned questions (enumeration, build-args, shared-secret invariant) with
one contract + one generated register + one presence-not-value gate.

---

## 6. EVIDENCE — grading

**EXECUTED (grep/read at HEAD f4a2d999):**
- BFF env reads — `server.js` grep (lines 120–6162); `server/*.js` grep (authStore/oauthService/pgClient/supabaseClient/stripeService/dwgConversionService/dkMatrikelProxy/telemetry/corsPolicy/accessAttemptNotifier). EXECUTED.
- `server/authStore.js:30–38` ephemeral SESSION_SECRET fallback. EXECUTED (read).
- Client `import.meta.env.*` — `CesiumViewport.ts:233,241`; `apps/editor/src/ui/site/**`; `Dockerfile:118–145`. EXECUTED.
- Sync-server env — `src/authz/policies.ts:106`; `src/auth/WsAuthGate.ts:158–185`; `src/eventLog/createEventLog.ts:39–93`; `src/index.ts:83`; `apps/sync-server/fly.toml:26–32`. EXECUTED.
- Deploy build-args — `.github/workflows/deploy-fly.yml:428–472`; `Dockerfile:47–203`. EXECUTED.
- Contract ownership — `docs/02-decisions/contracts/README.md` (C01–C75 index, read); C08 grep (`:16,18,35,166,176`) = mentions only, no register. EXECUTED.
- Free number — `ls contracts/ | C7x` → C70–C75 highest; C76 earmarked (`BIM30-CONTRACT-REVIEW-COORDINATOR-NOTES.md:47`). EXECUTED.

**BY-READ (documented behaviour, trusted from comments/docs):**
- VITE_* build-time inlining semantics — Dockerfile + `deploy-fly.yml` comments state it; not independently re-verified against a built `dist/`.
- Sync-server SESSION_SECRET must equal BFF's — inferred from WsAuthGate verifying BFF-signed tokens; consistent across both codebases (read), not runtime-proven.

**NOT-ESTABLISHED-FROM-CODE (read-only limit):**
- Which secrets are actually CONFIGURED in prod (Fly secrets store) — cannot be verified read-only without reading live values; deliberately not attempted. Every "prod presence" claim is NOT-ESTABLISHED.
- Whether the two Fly apps (BFF, sync-server) currently hold byte-identical `SESSION_SECRET` — NOT-ESTABLISHED (this is precisely what an owned register + presence probe would make checkable).
