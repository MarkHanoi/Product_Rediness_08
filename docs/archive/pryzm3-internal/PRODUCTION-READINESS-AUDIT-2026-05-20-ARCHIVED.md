# PRYZM — Production-Readiness Audit (2026-05-20)

**Verdict: NOT READY for public production launch.** PRYZM has an unusually strong architectural skeleton (composition root, plugin SDK, frame scheduler, schemas-as-zod, plugin sandbox, IFC4/Yjs/persistence stack) but a hollow operational interior. Six parallel independent deep-dive audits — security, error handling, architecture, orchestration, data integrity, performance/dependencies — converged on the same conclusion: launching tomorrow would mean (a) a five-figure surprise AI bill within hours, (b) silent cross-tenant data injection through collaboration sockets, (c) data loss on every project load that has any failed element, (d) full outage from a single unhandled rejection, (e) the entire CI/CD enforcement story is fiction (no `.github/workflows/` exists on disk), (f) `SESSION_SECRET` defaults to a per-process random secret so any restart logs every user out and horizontal scaling silently breaks auth, (g) 4 Critical + 19 High dependency CVEs (including `jsPDF` HTML injection / LFI shipping to end users).

The remediation surface is concentrated and tractable: the Blockers in §1 below are roughly **2–3 focused engineering days** to close. The Highs (§2) are an additional **5–10 days**. The Architecture migration gap (the 30–40% incomplete PRYZM-3 strangler) is a **6–12 week** programme, not a launch-blocker provided the bridge architecture stays disciplined.

This document consolidates the six parallel audits. Each finding cross-references its source audit. All file paths are absolute under `C:\Users\LENOVO\OneDrive\Desktop\PRYZM\Product_Rediness_08`.

---

## Table of Contents
- [§1 — Blockers (must fix before any public traffic)](#1--blockers)
- [§2 — High (must fix before GA)](#2--high)
- [§3 — Medium](#3--medium)
- [§4 — Low](#4--low)
- [§5 — What's done well](#5--whats-done-well)
- [§6 — Single points of failure](#6--single-points-of-failure)
- [§7 — Required environment variables](#7--required-environment-variables)
- [§8 — Prioritised remediation plan](#8--prioritised-remediation-plan)

---

## §1 — Blockers

### B1 [SECURITY] AI proxy is open to anonymous; no `max_tokens` / model / cost ceiling
`server.js:594` (`/api/anthropic/v1/messages`) + every `/api/ai/*` route (`:670, 758, 832, 918, 1016, 1122, 3652, 3721, 3795, 3875`). `authMiddleware` is **fail-open** — invalid/missing token silently becomes `userId='anonymous'`. None of these routes reject anonymous. Proxy forwards `JSON.stringify(req.body)` verbatim to Anthropic — no `max_tokens` clamp, no model allowlist, no per-call cost ceiling, no prompt-byte cap. One IP-rotating attacker = unlimited cost. **Fix:** require non-anonymous on all AI routes; force `model` to `ANTHROPIC_MODEL_ID`; clamp `max_tokens ≤ 4096`; cap body size; mirror the existing `COST_CEILINGS_USD` from `/v1/ai/*`.

### B2 [SECURITY] Socket.io collaboration events broadcast without verifying room membership
`server.js:358` (`command-executed`), `:420-438` (`vi:*`), `:440` (`cursor-move`), `:451/461` (`sheet-comment-*`). Only `join-project` enforces `canUserAccessProject`. Every other handler does `socket.to(\`project:${data.projectId}\`).emit(...)` using the **client-supplied** projectId with zero check that this socket actually joined that room. An authenticated (or anonymous) user can inject forged commands into any other tenant's collaboration session, and the `command-executed` handler **persists** those forged commands into `project_command_log` (line 373–391) for catch-up replay to legitimate clients. Cross-tenant data injection. **Fix:** every mutating socket handler must check `socket.rooms.has(\`project:${data.projectId}\`)` before broadcasting/persisting.

### B3 [SECURITY] `POST /api/v1/families` (marketplace publish) has no authentication
`server.js:224-230` mounts `buildFamilyMarketplaceRouter` with only `apiLimiter`. The router's `POST /` has no auth. Anyone on the public internet can publish `.pryzm-family` packages that other users browse/install. The "signature verification" trusts the JWK in the request header (signer == attacker), and the "virus scan" is an EICAR-string stub. **Fix:** add `authMiddleware`; reject anonymous; bind publisher key to a registered `family_publisher_keys` table (mirror plugin model); gate publishing behind manual review until a real scanner is wired.

### B4 [ERROR] Server has no `process.on('unhandledRejection')`; async Socket.io handlers can crash the process
`server.js` — grep confirms zero `process.on(...)` handlers. Async socket handlers (`join-project`, `command-executed`, …) are not `try/catch`-wrapped; Socket.io does not catch handler rejections. On Node ≥15 (this repo requires ≥20) an unhandled rejection terminates the process. One collaborator with a transient DB blip = full server outage for all users. **Fix:** add `process.on('unhandledRejection'|'uncaughtException')`; wrap every async socket handler body in try/catch.

### B5 [ERROR] No global Express error-handling middleware
`server.js` — no terminal `app.use((err,req,res,next)=>...)`. Malformed JSON bodies, `next(err)` paths, and any uncaught synchronous throw fall through to Express's default handler which leaks stack traces and returns bare HTML. **Fix:** add a terminal error handler returning a JSON envelope and logging server-side only.

### B6 [ORCHESTRATION] No CI/CD pipeline exists on disk
`.github/workflows/` is empty (only `ISSUE_TEMPLATE/` present). `CLAUDE.md` and contracts claim "8 principles are CI-enforced and merge-blocking" — there is no workflow file enforcing anything. Every governance claim is doctrinal, not technical. Compounded by `.gitignore:10` which excludes `.github/workflows/` so any committed workflow would be silently dropped. **Fix:** remove the `.gitignore` line, commit a real `ci.yml` running lint + isolation + commandmanager + tests + build on every PR with required-status-check enabled.

### B7 [ORCHESTRATION] No `start` script; production transpiles `tsx` at runtime
`package.json` has no `start`. `.replit:41` runs `dist/index.cjs` which `spawn`s `node --import tsx server.js`. TypeScript is a hard runtime dependency in prod; type errors in any workspace package crash the server at boot, not build. **Fix:** add `"start": "node ./dist/index.cjs"` to root package; long-term, finish `tsc -b` per-package compilation.

### B8 [ORCHESTRATION] No graceful shutdown; SIGTERM hard-kills in-flight requests + leaks DB connections
`server.js` — no SIGTERM/SIGINT handlers, no `httpServer.close()`, no `io.close()`, no `pool.end()`. Every Replit Autoscale scale-down/redeploy drops in-flight HTTP, hard-disconnects Socket.io, abandons PG connections, and loses any fire-and-forget `_persistToDb()` write. **Fix:** wire `SIGTERM/SIGINT → shutdown()` that stops accepting connections, closes io + pool, with a 10s force-exit timeout.

### B9 [ORCHESTRATION] DB migration runs on every boot, unguarded, concurrent-boot race
`server/dbMigrate.js:357-406` + `server.js:4933` `await runMigrations()`. The whole `SCHEMA_SQL` is one `client.query(cleanSql)` — no transaction, no advisory lock. With `deploymentTarget=autoscale`, concurrent boots race DDL → deadlocks / partial schema / repeated `ADD CONSTRAINT` failures. No `schema_migrations` version table, no rollback. **Fix:** wrap migrations in `SELECT pg_advisory_lock(<const>)`; move to a one-shot pre-deploy step; add a versions table.

### B10 [DATA] "Resilient" import silently drops failed elements then autosave overwrites the source snapshot
`ProjectLoader.ts:1294-1303` + `PlatformVersionController.ts:385-393` + `SaveOrchestrator.resetDirtyAfterLoad`. Any element that fails `canExecute` on load is logged + dropped + `result.success=true` set + post-drop state hashed as the clean baseline. The next autosave writes a new version *without* the dropped elements, then the old version may age out under the 15-version-limit. The "3 failed, 3 errors" log line in user runs proves this is the current production behaviour. **Permanent silent data loss.** Affects: openings (door/window), slabs, walls, rooms, levels, grids, columns, ceilings, floors, stairs, furniture, roofs, handrails, plumbing, curtain walls, beams. **Fix:** any element drop must block autosave and surface a blocking modal; quarantine dropped elements verbatim in `snapshot.__quarantine` until the user explicitly discards.

### B11 [DATA] Version-limit enforcement silently degrades paid users to "browser-only" mode
`server.js:2746-2754` + `server/projectStore.js:518-527`. When `existingCount >= maxVersions` (15 on architect) the server returns 403. `ServerSyncQueue` has a "plan-rejected latch" that short-circuits all subsequent autosaves for the entire session. The user keeps editing; nothing reaches the server; only localStorage protects them, which is capped at 20 versions and ~5–10 MB browser quota. Hours of work lost on tab close. **Fix:** server-side auto-prune (delete oldest non-pinned autosave); never short-circuit silently — surface "version limit" as a blocking modal.

### B12 [DATA] CRDT silently overwrites concurrent edits — P8 violated by every property edit
`packages/sync-client/src/YjsDocAdapter.ts:545-563`. `applyCommand` does raw `elementMap.set(key, value)` — last-write-wins semantics. The `CRDTConflictResolver` class exists with proper 3-way merge logic but has **zero callers** — it is orphaned dead code. P8 ("CRDT merges that lose data surface as user-resolvable conflicts") is violated for every wall height / door width / room name / property edit. Two collaborators editing the same property within the same Yjs sync window silently lose one side. **Fix:** wire `CRDTConflictResolver.mergeElement` into `applyCommand` before each `set`.

### B13 [DATA] Command-log catch-up bounded at 500 rows / 24h with no `hasMore` cursor
`server.js:394-414` (retention) + `:3303-3396` (catch-up endpoint). Probabilistic 24h deletion + `LIMIT 500` with no `hasMore` or `nextCursor` returned. A client offline >24h or in an active edit storm silently misses commands and believes it is caught up. Commands are persisted *after* socket broadcast — if the insert fails the live peer sees the edit and the catch-up replay never will. **Fix:** durable insert before broadcast; cursor-paginated catch-up returning `nextCursor`/`hasMore`; configurable retention tied to snapshot pointer.

### B14 [DATA] In-memory `_projects` / `_versions` fallback paths allow silent data loss on restart
`server.js:559-564, 2929-2962`. Server boots without a DB; `POST /api/projects/:id/versions` writes to in-memory Map, responds 201, broadcasts `version-saved` — and the data evaporates on the next restart. The 20-version splice silently drops older versions before then. **Fix:** at boot, hard-exit if neither `DATABASE_URL` nor `SUPABASE_SERVICE_ROLE_KEY` is set in production. Remove the in-memory write path entirely; return 503 when no DB.

### B15 [ARCH] Dual mutation paths + try/catch'd handler registration silently swap legacy and PRYZM-3 handlers
`apps/editor/src/engine/engineLauncher.ts:362-460` — every `register*Handlers(_bus)` is wrapped in `try{...}catch(e){ console.error('failed (non-fatal)', ...) }`. Bootstrap log shows ~20 element types with `"handler already registered: X.create"` — meaning the stub from `initBusHandlers` won, and the real typed plugin handler was silently discarded. Five of the last eleven commits are "fix walls not displaying" rooted in this race. **Fix:** remove the try/catch so conflicts throw; either delete all stubs in `initBusHandlers.ts` or invert order; add a CI gate that fails on `failed (non-fatal)` in boot logs.

### B16 [PERF] 4 Critical + 19 High dependency vulnerabilities shipping to production
`pnpm audit` reports 54 vulns: 3 low, 28 moderate, 19 high, 4 critical. Critical includes `jsPDF` HTML Injection + LFI (shipped to every user via PDF export), Handlebars JS injection (transitive via `eslint-plugin-boundaries`), Happy DOM VM context escape (dev runtime, still installed). **Fix:** `pnpm up jspdf` to patched line; pin transitive `dompurify` / `handlebars` via `pnpm.overrides`.

### B17 [PERF] 11.5s and 16.6s synchronous main-thread freezes during initial render
PSO compile + `markLevelsDirty` reproject 867 edges in the same frame after `BatchCoordinator` lifts render suppression. Browser frozen 11–16 seconds; observed FPS 1–9. Hard UX failure. **Fix:** prewarm PSOs via `renderPipelineManager.render()` before `runBatch()`; defer `markLevelsDirty` via `scheduleOnce(..., 'post-render')`; slice EdgeProjectorService work across frames; implement ADR-047 (Web Worker).

### B18 [PERF] Five stray empty files committed to repo root
`bimManager.registerMany(ids, levelId)`, `Canvas2D`, `editor`, `Master-Foundation`, `index.lock` — all tracked 0-byte files, the residue of botched shell redirects. `editor`/`Master-Foundation` shadow real directory names; `index.lock` mimics git's internal lock file. Evidence of no pre-commit hygiene. **Fix:** `git rm` all five; add a pre-commit hook rejecting 0-byte files outside an allowlist.

### B19 [PERF] Real secrets in plaintext `.env` on every developer's disk
`.env` correctly gitignored, but contains live `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS — full project compromise if leaked), `SESSION_SECRET`, `PRYZM_OWNER_PASSWORD`. **Fix:** rotate all three; move to a secrets manager; document that dev `.env` must only hold dev-only credentials.

---

## §2 — High

### H1 [SECURITY] CORS defaults to `*` with `credentials:true`
`server/corsPolicy.js:25`. If `ALLOWED_ORIGIN` unset, returns `*`; combined with `credentials:true` the `cors` package effectively reflects the request origin, allowing any origin with credentials. **Fix:** fail startup in production if `ALLOWED_ORIGIN` unset; never emit `*`+credentials.

### H2 [SECURITY] Authenticated read endpoints leak cross-tenant data
`server.js:3441` `GET /members` no role check; `:3113` `GET /visibility-intents`, `:3602` `/audit`, `:3623` `/state` have no `_httpCanAccess`. Any authenticated user reads any project's membership, visibility config, audit trail, and CDE workflow state. **Fix:** add `_httpCanAccess(userId, projectId)` to each.

### H3 [SECURITY] OAuth `state` is not a CSRF nonce; `postMessage` target can be `*`
`oauthService.js:138` + `server.js:1558,:1566` + `oauthService.js:235`. `state` is `base64(baseUrl)` (attacker-controllable); never validated as a session-bound random nonce. The minted JWT is `postMessage`'d to an origin derived from `state` (falls back to `'*'`). **Fix:** random nonce stored server-side; verify on callback; target origin from server allowlist only.

### H4 [SECURITY] `getBaseUrl()` trusts client `Host` header → OAuth redirect-URI manipulation
`oauthService.js:128-134`. Builds OAuth `redirect_uri` from the `Host` header. **Fix:** require `PUBLIC_BASE_URL` env var; never derive from request headers.

### H5 [SECURITY] `JWT` lifetime 30 days, no revocation, no refresh
`authStore.js:29` `TOKEN_EXPIRY='30d'`. Stolen token valid for a month; password change cannot revoke. **Fix:** shorten access TTL ≤24h; add refresh tokens + server-side `jti` denylist; `tokenVersion` claim bumped on password change.

### H6 [SECURITY] Marketplace plugin signature check trusts client-supplied `fileSha256`
`server.js:4267` + `pluginSigningService.js:73`. `fileSha256` falls back to the value inside the signature payload — attacker controls both sides of the equality check. `bundleUrl` is never fetched/hashed server-side. **Fix:** server downloads `bundleUrl`, computes SHA-256, requires match.

### H7 [SECURITY] IFC upload 500 MB in-memory buffer → memory-exhaustion DoS
`server.js:2053-2055`. `multer.memoryStorage()` with `fileSize: 500 MB`. A few concurrent max-size uploads OOM the process. **Fix:** stream to disk/S3; lower cap; concurrency limit; magic-byte validation not just `.ifc` extension.

### H8 [SECURITY] Error responses leak internal detail via `String(err)`
~10+ handlers return `res.status(500).json({ error: String(err) })` exposing Supabase/PG table+constraint names. **Fix:** central error handler; log detail server-side, return generic body.

### H9 [SECURITY] In-memory data fallbacks return all-projects to anonymous
`server.js:2270-2272` `GET /api/projects` in-memory branch returns ALL projects when `userId==='anonymous'`. **Fix:** never return data to anonymous in any fallback.

### H10 [ERROR] `bootPlatform()` failure leaves blank white screen
`src/main.ts:549-560`. Catch only `console.error`. No DOM fallback. **Fix:** plain DOM "reload" fallback.

### H11 [ERROR] `installGlobalHandlers()` dead code — no global `window.onerror`
`packages/crash-reporter/src/CrashReporter.ts:43` exported but zero call sites. The dead-code `window.Sentry` path in `ViewportCrashGuard` is the only "crash capture." **Fix:** call `installGlobalHandlers({scope:'browser'})` in `bootPlatform()`; delete the `window.Sentry` ghost.

### H12 [ERROR] `_bootstrapped` latches true before `bootstrap()` completes
`src/main.ts:166-176`. Set before `await mod.bootstrap(runtime)`. Failure leaves permanently half-initialized engine; retry never re-runs bootstrap. **Fix:** set after resolve; dispose on failure.

### H13 [ERROR] `~25 catch ... (non-fatal)` swallows in `engineLauncher.ts` mask real feature loss
Plugin handler registration failures become silent feature loss. **Fix:** track failed registrations; surface degraded-mode banner if any failed.

### H14 [ERROR] `apiFetch` has no timeout; client hangs indefinitely on stalled server
`packages/persistence-client/src/apiFetch.ts:59-66`. **Fix:** `AbortController` with default 30s timeout; typed `NetworkTimeoutError`.

### H15 [ERROR] Unprotected `await` in camera-`rest` handler → recurring unhandled rejections
`apps/editor/src/engine/initScene.ts:932`. Same bug class as `addTickListener` duplicate-id throw. **Fix:** try/catch the handler body; audit all `addEventListener(..., async ...)` sites.

### H16 [ORCHESTRATION] `SESSION_SECRET` silently falls back to ephemeral per-process secret
`authStore.js:30-39` + `oauthService.js:33-37`. Two *different* random secrets generated, so OAuth tokens don't verify on the auth path and vice versa. Every restart logs everyone out. Multi-instance auth silently broken. **Fix:** hard-fail boot in prod if `SESSION_SECRET` unset; share one secret module.

### H17 [ORCHESTRATION] Stateful server + no Redis adapter for Socket.io
Real-time collaboration silently partitions across instances. Rate limits reset per-instance. AI quota counters per-instance. `_projects` Map seeded on instance A 404s on instance B. **Fix:** add `@socket.io/redis-adapter` + `rate-limit-redis`; or pin to single instance (`reserved-vm` / scale=1) until Redis exists.

### H18 [ORCHESTRATION] `runMigrations()` blocks `listen()`; no liveness vs readiness split
`server.js:4933` `await runMigrations()` before `listen()`. DB slow at boot → port closed for 10s+, LB declares instance dead. **Fix:** listen first; migrate post-listen (or pre-deploy). Add `/api/health/live` vs `/ready`.

### H19 [ORCHESTRATION] OpenTelemetry SDK packages NOT in `package.json`
`server/telemetry.js` dynamically imports `@opentelemetry/sdk-node` etc., which are not installed. Telemetry silently a no-op. P8 spans go nowhere. No metrics, no Sentry, no alerting; logs are unstructured `console.*` only. **Fix:** install SDK packages; configure OTLP endpoint; adopt pino for structured logs; wire error capture + alerting.

### H20 [ORCHESTRATION] No backup / DR for the PG JSONB snapshot DB
No `pg_dump`, no PITR config, no documented restore. DB loss = total customer data loss. **Fix:** enable managed PITR/snapshots; cron `pg_dump` to off-provider storage; tested restore runbook.

### H21 [DATA] Rooms restored as one atomic batch — one bad room fails all
`ImportProjectCommand.ts:691-700`. **Fix:** loop per-room with `runSub`.

### H22 [DATA] `project_command_log` lacks FK to `projects` — orphaned rows on delete
`server/dbMigrate.js:192-200`. **Fix:** add FK with `ON DELETE CASCADE`.

### H23 [DATA] Save payload validation is `passthrough()` — only furniture strictly typed
`server.js:2694-2726`. **Fix:** type walls/slabs/doors/windows; reject schema-invalid before persist.

### H24 [DATA] `SNAPSHOT_LIMIT_BYTES=50MB` hard-stop with no chunked save or UX warning
`server.js:2674-2686`. **Fix:** UI size indicator; implement chunked save (the load path's `SnapshotStreaming` is unused for save).

### H25 [DATA] Snapshot `schemaVersion > current` only `console.warn`s
`apps/editor/src/engine/persistence/MigrationEngine.ts:241-248`. A future-version snapshot opens in an older client and reads garbage. **Fix:** refuse with "please upgrade" error.

### H26 [PERF] Two THREE.js versions resolved (0.176 + 0.183)
`plugins/view/package.json` pins 0.176; everywhere else 0.183. Duplicate engines → `instanceof` checks fail across packages, ~600KB duplicate code in bundle, P2 effectively violated. **Fix:** bump `plugins/view`; `pnpm.overrides.three: "^0.183.2"`.

### H27 [PERF] Per-request dynamic `import('./server/dbMigrate.js')` in 16 hot handlers
`server.js`. Microtask + Promise alloc per request. **Fix:** hoist to top-level import.

### H28 [PERF] ~250 MB of duplicate/dead binary assets tracked in git
`public/items/WIP/` byte-identical to `public/items/<Category>/.../model.glb`; `client/public/items/` duplicates `public/items/`; `docs/archive/pryzm3-internal/InterviewDAR.docx` 19MB; `attached_assets/` 26MB of chat-paste history. **Fix:** `git rm`; add `attached_assets/` to gitignore; LFS for big binaries.

### H29 [PERF] `_disposeChildren` shallow → GPU geometry leak (observed in runtime logs)
`packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:2157-2173`. Flat for-loop misses nested panel→mullion+glazing groups. Matches observed `[GPU Monitor] ⚠ Geometry count grew 185.7%`. **Fix:** `group.traverse(...)` like `WallFragmentBuilder._disposeWallGroupChildren`.

### H30 [PERF] `tsconfig.tsbuildinfo` committed; not in `.gitignore`
Three `.tsbuildinfo` files were committed. Shows as deleted in every contributor's `git status`. **Fix:** add `*.tsbuildinfo` to `.gitignore`; `git rm --cached`.

### H31 [PERF] `(window as any)` baseline pinned at 1343 occurrences — P4 baselined, not enforced
`eslint-baseline-window-as-any.json`. **Fix:** ratchet plan ≥100 casts/sprint; acknowledge in CLAUDE.md.

### H32 [PERF] Cesium 5.8MB loaded eagerly via `vite-plugin-cesium`
Most users never open geospatial view. **Fix:** on-demand dynamic import from geospatial entrypoint only.

### H33 [ARCH] P6 (commands-only mutation) is ~30-40% migrated
186 `cmdMgr.execute()` call sites in packages+plugins vs 17 canonical `commandBus.dispatch({type:...})` sites. Until P6 is real, undo/redo, CRDT collab, AI attribution, OTel tracing are all *structurally present but dormant*. **Fix:** the central remaining migration — 6–12 weeks of focused interior work.

### H34 [ARCH] GA-gate scope masks 100% of real P4/P6 violations
`check-cast-count.ts` scans `src/` only — reports 0 while 218 `(window as any)` casts exist in `packages/+apps/+plugins/`. `check-no-commandmanager.ts` similarly scoped. `eslint-baseline-window-as-any.json` is stale from PRYZM-2 phase C. Gates are passing by virtue of scanning nothing relevant. **Fix:** widen scope to whole tree, accept real baseline, ratchet down.

### H35 [ARCH] `window-store-packages` gate would fail at 250 vs ceiling 246 but never runs
`tools/ga-gate/check-window-store-in-packages.ts` + missing `.ga-gate/baselines/window-store-packages.json`. Falls back to `MAX_SAFE_INTEGER` — no-op. **Fix:** run the gate, accept real baseline, drive down.

### H36 [ARCH] `server.js` god-file (4944 LOC, 93 routes, 135 top-level decls)
**Fix:** extract `server/routes/{ai,auth,marketplace,files}.js`; target ≤500 LOC.

### H37 [ARCH] 670 unsanitized `innerHTML` sites; only 1 uses `DOMPurify`
IFC-derived strings flow into 669 unsanitized `innerHTML` template literals. Critical XSS surface for a BIM SaaS ingesting third-party IFC. **Fix:** `DOMPurify.sanitize` mandate on every `innerHTML` with a variable; CI rule against new unsanitized template-literal innerHTML.

---

## §3 — Medium

[Trimmed for brevity. Full lists in each audit agent's output. Notable items: `authMiddleware` fail-open by design (M1-sec), `/api/event-log` unauthenticated audit-log injection (M4-sec), `/embed` XSS hardening incomplete (M8-sec), `ServerSyncQueue` drops oldest unsynced version at 50 (M3-err), Socket.io disconnect has no UX indicator (M4-err), CustomEvent dispatches ratcheted upward (M1-arch), AI cache cleanup runs on every instance redundantly (M5-orch), `pnpm install --no-frozen-lockfile` in deploy (M6-orch), per-debounce full-project rehash (M1-data), `beforeunload` doesn't use `sendBeacon` (M2-data), idempotency key only 25 bits entropy (M7-data), `EdgeProjectorService` 2398 LOC single sync pass (M2-perf), 1.6MB unoptimized logo PNG (M5-perf), `RoomDetectionEngine` no spatial index (M6-perf).]

## §4 — Low

[Notable: rate limits IP-only (L1-sec), `/api/health` discloses infra (L4-sec), keyword-based render-crash filter (L1-err), `dist/cesium/` shipped eagerly (L4-perf), 1711 TODO markers across 450 files (M4-perf), `.local-tsc-errors.txt` 439KB untracked file in tree (L6-perf).]

---

## §5 — What's done well

- **Parameterised SQL everywhere** — clean, no string-built queries.
- **Stripe webhook signature verification** is correct, raw-body parsed correctly, signature checked before any business logic.
- **Helmet mounted first** with real CSP, HSTS, COOP/COEP, `nosniff`, frameguard; `x-powered-by` disabled.
- **Project-version-save path** (`createVersionTransactional`, `pryzm_save_version` RPC) is genuinely careful about ownership TOCTOU, optimistic locking, idempotency.
- **Passwords bcrypt cost 12**; generic "invalid email or password" (no user enumeration).
- **Plan/quota authority server-side**; client localStorage plan never trusted.
- **Socket.io `join-project` enforces `canUserAccessProject`** and rejects anonymous.
- **`ProjectLoader` per-element try/catch** with `LoadResult` reporting (the bug is what happens *after* — silent resave).
- **`ServerSyncQueue`** is well-engineered: backoff, online/offline, localStorage persistence, `X-Idempotency-Key`.
- **`pgClient`** has pool error listener; `withTransaction` proper BEGIN/COMMIT/ROLLBACK with guaranteed release.
- **WebGPU device-lost + WebGL context-loss recovery** both implemented — most BIM editors have neither.
- **Composition root genuine** (`packages/runtime-composer/composeRuntime.ts`); EngineBootstrap deleted.
- **`src/` shrink essentially complete** (391K → 1,315 LOC).
- **Plugin SDK well-designed**: iframe sandbox, Ed25519 signing, ESLint boundary rule, 47 L7-compliant plugins.
- **Frame scheduler / scene-committer separation sound**; single rAF owner real.
- **Schemas-pure (P5) holds** — `packages/schemas` genuinely pure Zod.
- **Geospatial (C12)** LTP-ENU + proj4 + Cesium is a competitive moat.
- **Contract suite C01–C15** + ADRs/SPECs — mature governance.

## §6 — Single points of failure

1. The PostgreSQL DB — single instance, no replica, no backup (B9/H20).
2. The Cloudflare Worker AI relay (`CF_WORKER_URL`) — all AI funnels through one external worker.
3. `SESSION_SECRET` — if changes or differs across instances, all auth breaks (H16).
4. Socket.io single-instance state — collaboration partitions (H17).
5. Boot-time migration — one bad DDL or slow DB blocks/breaks every cold start (B9/H18).

## §7 — Required environment variables

**Hard-required (boot must fail without these in production):**
`SESSION_SECRET`, `DATABASE_URL` *or* `SUPABASE_DB_URL`, `PRYZM_OWNER_EMAIL`, `ALLOWED_ORIGIN`, `PUBLIC_BASE_URL`, `CF_WORKER_URL` *or* `ANTHROPIC_API_KEY`.

**Required for full functionality:** `PRYZM_OWNER_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_PLAN_SECRET` (or delete the endpoint).

**Optional:** `STRIPE_*` (billing), `GOOGLE_*`/`MICROSOFT_*` (OAuth), `OTEL_*` (observability), `ANTHROPIC_MODEL_ID`, `APS_*` (DWG conversion), `PORT`, `NODE_ENV`.

A `.env.example` must be committed.

## §8 — Prioritised remediation plan

**Day 1 (Critical — block public traffic until done):**
1. Implement B1 (AI proxy auth + cost ceilings) + B2 (socket room membership) + B3 (marketplace publish auth).
2. B4–B5 (server crash handlers + global Express error handler).
3. B19 (rotate leaked secrets).
4. B16 (jspdf + happy-dom + handlebars upgrade).
5. B18 (delete stray root files).
6. B6 (commit a real CI workflow YAML).

**Days 2–3 (data integrity):**
7. B10 (resilient import quarantine; block autosave on element drop).
8. B11 (version-limit auto-prune or blocking UX).
9. B12 (wire CRDTConflictResolver).
10. B14 (fail-fast no-DB in production).
11. B13 (cursor-paginated catch-up + durable-insert-before-broadcast).

**Days 4–5 (orchestration + stability):**
12. B7 (`start` script).
13. B8 (graceful shutdown).
14. B9 (advisory-lock migrations + pre-deploy step).
15. H16 (hard-fail on missing SESSION_SECRET in prod).
16. H17 (Redis adapter OR explicit single-instance pin).
17. H18 (split /live vs /ready; listen before migrate).
18. H19 (install OTel SDK + structured logger).
19. H20 (enable managed PITR; document restore).

**Week 2 (Highs):**
20. H1–H9 (security hardening — CORS fail-closed, cross-tenant GET authz, OAuth state, JWT lifetime, plugin signature, IFC stream upload, error redaction).
21. H10–H15 (client crash resilience — global handlers, bootstrap latch, apiFetch timeout, async event try/catch).
22. H21–H25 (data integrity — per-room loop, FK, payload typing, snapshot streaming-save, future-version refuse).
23. H26–H32 (perf — pin THREE, hoist dbMigrate import, delete dead assets, dispose recursion, gitignore tsbuildinfo, Cesium lazy).
24. H37 (XSS sweep — DOMPurify mandate).

**Weeks 3–12 (architecture migration):**
25. H33–H36 (finish P6 migration; widen GA-gate scope; reset ratchets; split server.js).

---

**End of audit.** Each finding is traceable to one of the six independent agent reports. The fix list is concrete and ordered. The first three days of work move PRYZM from "will lose money and data on launch day" to "limited beta-grade." Two weeks of work move it to GA-grade. Full architectural maturity is a quarter's work — but is not strictly required for a controlled beta provided the bridge layer stays disciplined and CI starts actually enforcing the contracts.
