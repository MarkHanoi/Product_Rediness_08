# PRYZM — Secrets & Configuration Register (C77)

> ⚠ **GENERATED FILE — DO NOT EDIT BY HAND.**
> Produced by `tools/ga-gate/check-secrets-register.ts`. Regenerate with
> `npx tsx tools/ga-gate/check-secrets-register.ts --write`.
> CI fails when this file and the code disagree, in either direction.
> Governed by [C77](../02-decisions/contracts/C77-SECRETS-AND-CONFIGURATION-REGISTER.md);
> declared columns live in [`tools/ga-gate/secrets-declarations.json`](../../tools/ga-gate/secrets-declarations.json);
> the measured inventory it was seeded from is [BIM30-SECRETS-MAPPING-AUDIT.md](BIM30-SECRETS-MAPPING-AUDIT.md).
>
> **PRESENCE, NEVER VALUE (C77 §2.4).** This register records names, read-sites,
> surfaces and declared columns. **No secret value appears anywhere in it**, and the
> generator fails closed (exit 2) if a regeneration would emit anything value-shaped.
> Prod-configuration status is deliberately absent: it is **NOT-ESTABLISHED-FROM-CODE**
> for every row (C77 §0.2) — a static read may not guess set-or-unset.

## Measured at generation

Row-derived numbers only. The walk-size floors (files scanned, read-sites) are
printed by every gate run and enforced there — they are deliberately NOT embedded
here, because the walk size moves whenever ANY file is added to a scanned root,
and a register that drifts on unrelated PRs teaches people to ignore its drift.

| | |
|---|---|
| **Distinct names** | **100** (92 read in scanned roots; floor 25) |
| Declared (have a row in secrets-declarations.json) | 86 |
| UNDECLARED (arm-a findings) | 14 |
| Declared but not found in scanned roots (disclosed, not failed) | 8 |
| build-time-inlined SECRET violations (arm b) | 0 |
| sharedWith rows missing from deploy guidance (arm c) | 0 |

These numbers are re-derived on every run. Do not transcribe them anywhere else — cite this file (C77 §0.1).

## Column meanings

| Column | Kind | Derivation |
|---|---|---|
| **name** | measured | the env identifier. |
| **classification / required / sharedWith / failureMode** | **declared** | cited from `secrets-declarations.json` — normative judgements (C77 §1.1), never derived from code that may be wrong. `UNDECLARED` = the scan found a read nobody has declared: an arm-a finding, never a favourable default. |
| **surface** | measured | `build-time-inlined` when the name is `VITE_`-prefixed or read via `import.meta.env` (vite bakes it into the public bundle — C77 §1.2); `runtime-env` otherwise. |
| **service(s)** | measured | inferred from read-site paths: BFF (`server.js` + `server/`), editor-client, sync-server, per-app, `pkg:*` (a library whose consumer decides the surface), CI, deploy. |
| **read-sites** | measured | `file:line` of every read in the scanned roots (capped at 8 per row for legibility; the count is exact). `NONE-FOUND-IN-SCANNED-ROOTS` = declared, but every read lives outside the scanned set (e.g. the transitional `src/` root) or is dynamic — disclosed, never failed. |

## Register

| name | classification | surface | required | service(s) | sharedWith | failureMode | read-sites |
|---|---|---|---|---|---|---|---|
| `ACCESS_NOTIFY_FROM` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — access-attempt notification sender unset | server/accessAttemptNotifier.js:48 |
| `ACCESS_NOTIFY_TO` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — access-attempt notification recipient unset | server/accessAttemptNotifier.js:47 |
| `AI_MODEL_VERSION` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — model pin default used | server/aiPublicApiRoutes.js:370 |
| `ALLOWED_ORIGIN` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — CORS default applies (posture varies by NODE_ENV) | server.js:305 · server/corsPolicy.js:32 |
| `ANTHROPIC_API_KEY` | SECRET | runtime-env | optional | BFF | — | degraded-feature — with no CF_WORKER_URL, AI features hard-degraded | server.js:137 · server.js:307 · server.js:6155 |
| `ANTHROPIC_MODEL_ID` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — model pin default used | server.js:159 |
| `APEX_ORIGIN` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — apex/app split origin default (C51) | server.js:5946 |
| `API_GATEWAY_PORT` | **UNDECLARED** | runtime-env | UNDECLARED | api-gateway | UNDECLARED | UNDECLARED — arm-a finding | apps/api-gateway/Dockerfile:62 · apps/api-gateway/src/index.ts:67 |
| `APS_CLIENT_ID` | SECRET | runtime-env | optional | BFF | — | degraded-feature — Autodesk DWG conversion disabled | server.js:2714 · server/dwgConversionService.js:32 · server/dwgConversionService.js:71 |
| `APS_CLIENT_SECRET` | SECRET | runtime-env | optional | BFF | — | degraded-feature — Autodesk DWG conversion disabled | server.js:2714 · server/dwgConversionService.js:32 · server/dwgConversionService.js:72 |
| `BAKE_PORT` | **UNDECLARED** | runtime-env | UNDECLARED | bake-worker | UNDECLARED | UNDECLARED — arm-a finding | apps/bake-worker/Dockerfile:31 · apps/bake-worker/src/index.ts:183 |
| `BUILT_AT` | CONFIG | runtime-env | optional | BFF + CI + deploy | — | degraded-feature — /version provenance blank; one of the nine C77 §2.3 build-args | .github/workflows/deploy-fly.yml:464 · Dockerfile:237 · server.js:2460 · tools/deploy/fly-manual-deploy.sh:231 |
| `CATALOG_UPSTREAM` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — catalog proxy target missing | server/context-delivery/catalogAssetProxy.js:39 |
| `CF_WORKER_URL` | SECRET | runtime-env | required-in-prod-only | BFF | — | degraded-feature — AI proxying falls through to direct ANTHROPIC_API_KEY; with neither, the AI plane is dead | server.js:142 · server.js:307 · server.js:6154 |
| `CONTEXT_TILES_UPSTREAM` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — context-tiles proxy target missing | server/context-delivery/contextTilesProxy.js:44 |
| `DATABASE_URL` | SECRET | runtime-env | required-in-prod-only | BFF | sync-server | degraded-feature — BFF falls back to in-memory Postgres (non-durable); sync-server AUTHZ_MODE=pg refuses every request without it | server.js:294 · server.js:6151 · server.js:6161 · server/pgClient.js:52 · server/pgClient.js:54 |
| `DATAFORDELER_API_KEY` | SECRET | runtime-env | optional | BFF | — | degraded-feature — DK cadastre proxy fails | server/jurisdiction/dkMatrikelProxy.js:262 · server/jurisdiction/dkMatrikelProxy.js:287 |
| `DK_DAWA_JORDSTYKKER_URL` | **UNDECLARED** | runtime-env | UNDECLARED | BFF | UNDECLARED | UNDECLARED — arm-a finding | server/jurisdiction/dkMatrikelProxy.js:51 |
| `DK_MATRIKEL_GEOM_TYPENAME` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — DK proxy misconfigured | server/jurisdiction/dkMatrikelProxy.js:67 |
| `DK_MATRIKEL_TYPENAME` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — DK proxy misconfigured | server/jurisdiction/dkMatrikelProxy.js:72 |
| `DK_MATRIKEL_WFS_URL` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — DK proxy misconfigured | server/jurisdiction/dkMatrikelProxy.js:59 |
| `FAMILY_SEED` | **UNDECLARED** | runtime-env | UNDECLARED | BFF | UNDECLARED | UNDECLARED — arm-a finding | server.js:464 |
| `FAMILY_VIRUS_SCAN` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — family upload scanning default | server/familyMarketplaceRoutes.js:44 |
| `FLY_IMAGE_REF` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — image provenance blank | server.js:2462 |
| `GIT_BRANCH` | CONFIG | runtime-env | optional | BFF + CI + deploy | — | degraded-feature — /version provenance blank; one of the nine C77 §2.3 build-args | .github/workflows/deploy-fly.yml:463 · Dockerfile:236 · server.js:2459 · tools/deploy/fly-manual-deploy.sh:230 |
| `GIT_SHA` | CONFIG | runtime-env | optional | BFF + CI + deploy | — | degraded-feature — /version provenance blank; one of the nine C77 §2.3 build-args | .github/workflows/deploy-fly.yml:462 · Dockerfile:235 · Dockerfile:239 · server.js:2458 · tools/deploy/fly-manual-deploy.sh:229 |
| `GOOGLE_CLIENT_ID` | PUBLIC-TOKEN | runtime-env | optional | BFF | — | degraded-feature — Google OAuth disabled | server.js:2076 · server/oauthService.js:157 · server/oauthService.js:173 |
| `GOOGLE_CLIENT_SECRET` | SECRET | runtime-env | optional | BFF | — | degraded-feature — Google OAuth disabled | server/oauthService.js:174 |
| `INTERNAL_PLAN_SECRET` | SECRET | runtime-env | optional | BFF | — | degraded-feature — internal plan endpoint auth denies | server.js:1867 |
| `LINZ_API_KEY` | SECRET | runtime-env | optional | BFF | — | degraded-feature — NZ cadastre leg (/api/parcel/nz, LINZ WFS layer 50772) answers 503 outcome:'unconfigured' and the client falls to the OSM footprint; NEVER read as empty (C57 §1.5 amendment 3). Free self-service key at data.linz.govt.nz/my/api/ — set as a Fly secret | server/jurisdiction/euCadastreProxy.js:1924 |
| `LOWMEM` | CONFIG | runtime-env | optional | CI + deploy | — | degraded-feature — low-memory build profile default; one of the nine C77 §2.3 build-args (CI passes LOWMEM=0) | .github/workflows/deploy-fly.yml:457 · Dockerfile:52 · tools/deploy/fly-manual-deploy.sh:224 |
| `MARKETPLACE_PORT` | **UNDECLARED** | runtime-env | UNDECLARED | marketplace-api | UNDECLARED | UNDECLARED — arm-a finding | apps/marketplace-api/src/index.ts:38 |
| `MICROSOFT_CLIENT_ID` | PUBLIC-TOKEN | runtime-env | optional | BFF | — | degraded-feature — Microsoft OAuth disabled | server.js:2130 · server/oauthService.js:195 · server/oauthService.js:211 |
| `MICROSOFT_CLIENT_SECRET` | SECRET | runtime-env | optional | BFF | — | degraded-feature — Microsoft OAuth disabled | server/oauthService.js:212 |
| `MIGRATION_BOOT_GATE_TIMEOUT_MS` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — boot-gate timeout default | server.js:6202 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC-TOKEN | runtime-env | optional | BFF | — | degraded-feature — alias of SUPABASE_ANON_KEY | server/supabaseClient.js:53 |
| `NEXT_PUBLIC_SUPABASE_URL` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — alias of SUPABASE_URL | server/supabaseClient.js:41 · server/supabaseMigrate.js:118 |
| `NODE_ENV` | CONFIG | runtime-env | optional | BFF + api-gateway + bake-worker + deploy + pkg:core-app-model + sync-server | — | degraded-feature — dev defaults apply; SECURITY-RELEVANT: several fallbacks (SESSION_SECRET, CORS) branch on it | apps/api-gateway/Dockerfile:61 · apps/bake-worker/Dockerfile:30 · apps/sync-server/Dockerfile:31 · Dockerfile:216 · fly.toml:73 · packages/core-app-model/src/BimWorld.ts:414 · server.js:2463 · server.js:6156 (+5 more) |
| `NSHARDS` | **UNDECLARED** | runtime-env | UNDECLARED | CI | UNDECLARED | UNDECLARED — arm-a finding | .github/workflows/terrain-bake-all.yml:91 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — spans not exported | server.js:2521 · server/telemetry.js:34 |
| `OTEL_EXPORTER_OTLP_HEADERS` | SECRET | runtime-env | optional | BFF | — | degraded-feature — telemetry export unauthenticated or off (may carry an auth token) | server/telemetry.js:89 |
| `OTEL_RESOURCE_ATTRIBUTES` | **UNDECLARED** | runtime-env | UNDECLARED | deploy | UNDECLARED | UNDECLARED — arm-a finding | fly.toml:80 |
| `OTEL_SERVICE_NAME` | CONFIG | runtime-env | optional | BFF + deploy | — | degraded-feature — default service name used | fly.toml:79 · server.js:2543 · server/telemetry.js:33 |
| `PG_POOL_MAX` | CONFIG | runtime-env | optional | UNKNOWN | — | degraded-feature — pool default | NONE-FOUND-IN-SCANNED-ROOTS |
| `PG_PREFLIGHT_TIMEOUT_MS` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — preflight-timeout default | server/pgClient.js:292 |
| `PG_STATEMENT_TIMEOUT_MS` | CONFIG | runtime-env | optional | UNKNOWN | — | degraded-feature — statement-timeout default | NONE-FOUND-IN-SCANNED-ROOTS |
| `PG_STATEMENT_TIMEOUT_VIA_OPTIONS` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — statement-timeout transport default (server/pgClient.js:113; the audit's PG_STATEMENT_TIMEOUT* family row) | server/pgClient.js:113 |
| `PNPM_HOME` | **UNDECLARED** | runtime-env | UNDECLARED | deploy | UNDECLARED | UNDECLARED — arm-a finding | Dockerfile:53 |
| `PNPM_VERSION` | CONFIG | runtime-env | optional | deploy | — | broken-bundle — wrong pnpm pinned in the image build | Dockerfile:47 |
| `PORT` | CONFIG | runtime-env | optional | BFF + deploy | — | degraded-feature — default listen port used | fly.toml:76 · server.js:6083 |
| `PRYZM_ACCESS_CHECK_RETRYABLE` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — access-check retry default | server/projectAccess.js:58 |
| `PRYZM_AUTHZ_MODE` | CONFIG | runtime-env | required-in-prod-only | sync-server | — | degraded-feature — DEFAULT IS PERMISSIVE (memory-allow-by-default): security posture lives in this value (BIM30 audit risk #5) | apps/sync-server/fly.toml:30 |
| `PRYZM_DEV_PRINT_SRCDOC` | **UNDECLARED** | runtime-env | UNDECLARED | pkg:plugin-sdk | UNDECLARED | UNDECLARED — arm-a finding | packages/plugin-sdk/src/dev/cli.ts:177 |
| `PRYZM_FORCE_INMEMORY` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — forces the non-durable DB path; interacts with DATABASE_URL | server/pgClient.js:46 |
| `PRYZM_MARKETPLACE_URL` | **UNDECLARED** | runtime-env | UNDECLARED | pkg:plugin-sdk | UNDECLARED | UNDECLARED — arm-a finding | packages/plugin-sdk/src/dev/publish-command.ts:55 |
| `PRYZM_OWNER_EMAIL` | CONFIG | runtime-env | required | BFF | — | degraded-feature — owner-grant resolves to free tier; no owner auto-grant | server.js:1907 · server.js:2888 · server.js:3719 · server.js:6153 · server/authStore.js:51 · server/oauthService.js:40 · server/planStore.js:283 · server/supabaseMigrate.js:192 |
| `PRYZM_OWNER_PASSWORD` | SECRET | runtime-env | required | BFF | — | degraded-feature — owner seed account not provisioned | server/supabaseMigrate.js:193 |
| `PRYZM_PUBLISHER_KEY_PATH` | **UNDECLARED** | runtime-env | UNDECLARED | pkg:plugin-sdk | UNDECLARED | UNDECLARED — arm-a finding | packages/plugin-sdk/src/dev/publish-command.ts:198 |
| `PRYZM_PUBLISHER_TOKEN` | **UNDECLARED** | runtime-env | UNDECLARED | pkg:plugin-sdk | UNDECLARED | UNDECLARED — arm-a finding | packages/plugin-sdk/src/dev/publish-command.ts:56 |
| `PRYZM_SYNC_WS_AUTH` | CONFIG | runtime-env | optional | UNKNOWN | — | degraded-feature — trust-query DISABLES upgrade auth: a security-off switch, deliberately unset in fly.toml | NONE-FOUND-IN-SCANNED-ROOTS |
| `PRYZM_TRACING` | CONFIG | runtime-env | optional | UNKNOWN | — | degraded-feature — unset means OFF: every trace.getTracer() returns the API no-op and NOTHING is collected. 'console' exports to stdout; 'otlp'/'1'/'true'/'on' REQUIRE OTEL_EXPORTER_OTLP_ENDPOINT and otherwise REFUSE (stay off, log one loud line) rather than dropping spans silently | NONE-FOUND-IN-SCANNED-ROOTS |
| `PRYZM_TRACING_SAMPLE` | CONFIG | runtime-env | optional | UNKNOWN | — | degraded-feature — head sample ratio 0..1; unset = 0.05 in OTLP mode, 1.0 in console mode. Raising it to 1 multiplies span egress 20x. MEASURED 2026-08-23: one project-open of the founder's 281-element project = 288 spans = 126336 bytes of OTLP/JSON (439 B/span); ~6.3 KB per open at the 0.05 default | NONE-FOUND-IN-SCANNED-ROOTS |
| `PUBLIC_BASE_URL` | CONFIG | runtime-env | required-in-prod-only | BFF | — | degraded-feature — OAuth redirect URIs wrong; OAuth breaks | server.js:306 · server.js:460 · server/oauthService.js:138 · server/oauthService.js:139 |
| `REPLIT_DEV_DOMAIN` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — legacy dev-domain detection off | server.js:144 · server/oauthService.js:141 · server/oauthService.js:142 |
| `RESEND_API_KEY` | SECRET | runtime-env | optional | BFF | — | degraded-feature — access-attempt email notifications SILENTLY off (a C77 §1.3-shaped trap) | server/accessAttemptNotifier.js:49 |
| `RUN_NUMBER` | CONFIG | runtime-env | optional | BFF + CI + deploy | — | degraded-feature — /version provenance blank; one of the nine C77 §2.3 build-args | .github/workflows/deploy-fly.yml:465 · Dockerfile:238 · server.js:2461 · tools/deploy/fly-manual-deploy.sh:232 |
| `SESSION_SECRET` | SECRET | runtime-env | required-in-prod-only | BFF | sync-server | hard-exit (prod) / ephemeral-fallback (dev) | server.js:293 · server.js:6152 · server/authStore.js:33 · server/oauthService.js:36 |
| `SHARD` | **UNDECLARED** | runtime-env | UNDECLARED | CI | UNDECLARED | UNDECLARED — arm-a finding | .github/workflows/terrain-bake-all.yml:91 |
| `STRIPE_PRICE_ARCHITECT_ANNUAL` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — plan purchase mapping missing | server/stripeService.js:30 |
| `STRIPE_PRICE_ARCHITECT_MONTHLY` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — plan purchase mapping missing | server/stripeService.js:29 |
| `STRIPE_PRICE_FIRM_ANNUAL` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — plan purchase mapping missing | server/stripeService.js:38 |
| `STRIPE_PRICE_FIRM_MONTHLY` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — plan purchase mapping missing | server/stripeService.js:37 |
| `STRIPE_PRICE_STUDIO_ANNUAL` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — plan purchase mapping missing | server/stripeService.js:34 |
| `STRIPE_PRICE_STUDIO_MONTHLY` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — plan purchase mapping missing | server/stripeService.js:33 |
| `STRIPE_PUBLISHABLE_KEY` | PUBLIC-TOKEN | runtime-env | optional | BFF | — | degraded-feature — client checkout disabled | server/stripeRoutes.js:36 |
| `STRIPE_SECRET_KEY` | SECRET | runtime-env | optional | BFF | — | degraded-feature — billing disabled | server.js:2185 · server.js:2538 · server.js:5591 · server/stripeService.js:44 |
| `STRIPE_WEBHOOK_SECRET` | SECRET | runtime-env | optional | BFF | — | degraded-feature — webhook signature verification fails; billing events dropped | server.js:319 · server.js:2186 · server.js:2538 |
| `SUPABASE_ANON_KEY` | PUBLIC-TOKEN | runtime-env | optional | BFF | — | degraded-feature — client-side Supabase disabled | server.js:6149 · server/supabaseClient.js:52 |
| `SUPABASE_DB_URL` | SECRET | runtime-env | optional | BFF | — | degraded-feature — alternate DB DSN; unset falls through to DATABASE_URL | server.js:294 · server.js:6150 · server.js:6161 · server/pgClient.js:57 · server/pgClient.js:59 |
| `SUPABASE_SERVICE_ROLE_KEY` | SECRET | runtime-env | optional | BFF | — | degraded-feature — privileged Supabase ops fail; a leak here breaks C13 project isolation | server.js:172 · server.js:6148 · server.js:6162 · server/supabaseClient.js:51 · server/supabaseClient.js:82 |
| `SUPABASE_URL` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — Supabase client unavailable; auth/storage degraded | server.js:171 · server.js:2536 · server.js:6147 · server.js:6162 · server/supabaseClient.js:41 · server/supabaseMigrate.js:118 |
| `SYNC_EVENT_LOG` | CONFIG | runtime-env | optional | sync-server | — | degraded-feature — pg needs DATABASE_URL; else in-memory event log | apps/sync-server/fly.toml:31 |
| `SYNC_PORT` | CONFIG | runtime-env | optional | sync-server | — | degraded-feature — default listen port 4000 | apps/sync-server/Dockerfile:32 · apps/sync-server/fly.toml:26 |
| `TRUST_PROXY_HOPS` | CONFIG | runtime-env | optional | BFF | — | degraded-feature — proxy-hop default | server.js:341 · server.js:342 |
| `VITE_CATASTRO_BLOCK_ENDPOINT` | CONFIG | build-time-inlined | optional | editor-client | — | degraded-feature — ES catastro block endpoint default | apps/editor/src/ui/site/parcel/CatastroBlockProvider.ts:31 |
| `VITE_CATASTRO_PARCEL_ENDPOINT` | CONFIG | build-time-inlined | optional | editor-client | — | degraded-feature — ES catastro parcel endpoint default | apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts:23 |
| `VITE_CESIUM_TOKEN` | PUBLIC-TOKEN | build-time-inlined | required-in-prod-only | CI + deploy + editor-client | — | broken-bundle — ships tokenless; the 3D globe does not load. Baked into the public bundle BY DESIGN (C77 §1.2/§2.3) — scope + rotate at the ion dashboard | .github/workflows/deploy-fly.yml:458 · apps/editor/src/ui/geospatial/CesiumViewport.ts:313 · Dockerfile:118 · Dockerfile:119 · tools/deploy/fly-manual-deploy.sh:225 |
| `VITE_COLLAB_CRDT` | CONFIG | build-time-inlined | optional | UNKNOWN | — | degraded-feature — CRDT provider gated off | NONE-FOUND-IN-SCANNED-ROOTS |
| `VITE_CONTEXT_TILES_URL` | CONFIG | build-time-inlined | required-in-prod-only | BFF + CI + deploy | — | degraded-feature — falls back to live Overpass instead of pre-baked R2 tiles | .github/workflows/deploy-fly.yml:461 · Dockerfile:144 · Dockerfile:145 · server/context-delivery/contextTilesProxy.js:45 · tools/deploy/fly-manual-deploy.sh:228 |
| `VITE_DK_MATRIKEL_PARCEL_ENDPOINT` | CONFIG | build-time-inlined | optional | editor-client | — | degraded-feature — DK parcel endpoint default | apps/editor/src/ui/site/parcel/DkMatrikelParcelProvider.ts:18 |
| `VITE_GEOCODE_ENDPOINT` | CONFIG | build-time-inlined | optional | editor-client | — | degraded-feature — geocode endpoint default | apps/editor/src/ui/site/geocodeAddress.ts:41 |
| `VITE_GLB_URL` | CONFIG | build-time-inlined | required-in-prod-only | CI + deploy + pkg:core-app-model | — | broken-bundle — furniture GLBs fall back to local /items/ (the prod-404 cliff, DEPLOY-CONTRACT-MANUAL-FLY.md §3.4) | .github/workflows/deploy-fly.yml:460 · Dockerfile:138 · Dockerfile:139 · packages/core-app-model/src/catalog/catalogAssetUrl.ts:79 · tools/deploy/fly-manual-deploy.sh:227 |
| `VITE_GOOGLE_MAPS_KEY` | PUBLIC-TOKEN | build-time-inlined | required-in-prod-only | CI + deploy + editor-client | — | broken-bundle — photorealistic tiles unavailable. Baked into the public bundle BY DESIGN — restrict by API + referrer | .github/workflows/deploy-fly.yml:459 · apps/editor/src/ui/geospatial/CesiumViewport.ts:321 · Dockerfile:127 · Dockerfile:128 · tools/deploy/fly-manual-deploy.sh:226 |
| `VITE_MUC_ZONING_ENDPOINT` | CONFIG | build-time-inlined | optional | editor-client | — | degraded-feature — Munich zoning endpoint default | apps/editor/src/ui/site/zoning/MucZoningProvider.ts:24 |
| `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` | PUBLIC-TOKEN | build-time-inlined | optional | CI + deploy | — | broken-feature — the PUBLIC OTLP ingest URL the browser posts spans to. Baked into the public bundle BY DESIGN (same posture as VITE_CESIUM_TOKEN) and therefore MUST be an ingest endpoint that is safe to publish and CORS-enabled; without it VITE_PRYZM_TRACING=otlp REFUSES rather than dropping spans | .github/workflows/deploy-fly.yml:468 · Dockerfile:180 · Dockerfile:181 · tools/deploy/fly-manual-deploy.sh:235 |
| `VITE_PRYZM_TRACING` | CONFIG | build-time-inlined | optional | CI + deploy | — | degraded-feature — the BROWSER half of PRYZM_TRACING. Read by vite.config.ts at BUILD time and baked in as __PRYZM_TRACING__; unset means the browser's 345 tracer sites stay no-ops. Flipping it requires a REBUILD, not a restart | .github/workflows/deploy-fly.yml:466 · Dockerfile:167 · Dockerfile:168 · tools/deploy/fly-manual-deploy.sh:233 |
| `VITE_PRYZM_TRACING_ENDPOINT` | PUBLIC-TOKEN | build-time-inlined | optional | UNKNOWN | — | degraded-feature — alias of VITE_OTEL_EXPORTER_OTLP_ENDPOINT | NONE-FOUND-IN-SCANNED-ROOTS |
| `VITE_PRYZM_TRACING_SAMPLE` | CONFIG | build-time-inlined | optional | CI + deploy | — | degraded-feature — browser head sample ratio; baked at build time as __PRYZM_TRACING_SAMPLE__ | .github/workflows/deploy-fly.yml:467 · Dockerfile:172 · Dockerfile:173 · tools/deploy/fly-manual-deploy.sh:234 |
| `VITE_SYNC_URL` | CONFIG | build-time-inlined | optional | UNKNOWN | — | degraded-feature — collaboration off | NONE-FOUND-IN-SCANNED-ROOTS |
| `WORKER_CONCURRENCY` | **UNDECLARED** | runtime-env | UNDECLARED | bake-worker | UNDECLARED | UNDECLARED — arm-a finding | apps/bake-worker/Dockerfile:32 |

## UNDECLARED names (arm-a findings — the honest first reading)

Each of these is read in production sources with no declared classification,
requiredness, sharing, or failure mode. They are NOT silently declared (C77 §0.2 —
a judgement nobody made must not print as one somebody did). A name leaves this
list by gaining an argued declaration row, or by its read being deleted.

- `API_GATEWAY_PORT`
- `BAKE_PORT`
- `DK_DAWA_JORDSTYKKER_URL`
- `FAMILY_SEED`
- `MARKETPLACE_PORT`
- `NSHARDS`
- `OTEL_RESOURCE_ATTRIBUTES`
- `PNPM_HOME`
- `PRYZM_DEV_PRINT_SRCDOC`
- `PRYZM_MARKETPLACE_URL`
- `PRYZM_PUBLISHER_KEY_PATH`
- `PRYZM_PUBLISHER_TOKEN`
- `SHARD`
- `WORKER_CONCURRENCY`

## Declared but not found in scanned roots (disclosed)

Declared in the audit-seeded columns, but no read-site inside the scanned roots
(server.js · server/ · apps/\*/src · packages/\*/src · tools/deploy/ · Dockerfiles ·
fly.toml · .github/workflows/). Absence from a subset is not absence: known homes
include the transitional `src/` client root and dynamic `env[...]` reads.

- `PG_POOL_MAX`
- `PG_STATEMENT_TIMEOUT_MS`
- `PRYZM_SYNC_WS_AUTH`
- `PRYZM_TRACING`
- `PRYZM_TRACING_SAMPLE`
- `VITE_COLLAB_CRDT`
- `VITE_PRYZM_TRACING_ENDPOINT`
- `VITE_SYNC_URL`
