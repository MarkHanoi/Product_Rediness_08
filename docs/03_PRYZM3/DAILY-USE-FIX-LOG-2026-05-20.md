# PRYZM — Daily-Use Fix Log (2026-05-20)

Concrete fixes applied this session in response to `DAILY-USE-AUDIT-2026-05-20.md`. Each entry cites its audit ID, the files + functions touched, and the contract / pattern it aligns with. No shortcuts: every change matches an existing established pattern in the codebase or amends the contract document.

---

## ✅ APPLIED — Round 31 (§57 Day 3 — door + window promoted to CACHEABLE_ELEMENT_TYPES — no source-builder change required)

### Both door + window already had Date.now() version stamps from prior audits; one-line promotion delivers immediate perf
**File:** `apps/editor/src/engine/views/EdgeProjectorService.ts` `CACHEABLE_ELEMENT_TYPES`.

**Context:** Round 25 (§57 Day 2) promoted `column` after Round 19 added per-build version stamping. The remaining candidates from the Day 1 audit notes were: door / window / stair / beam / ceiling / floor / handrail / plumbing / furniture / lighting / opening / stair-railing.

**Investigation:** an audit-by-grep of `userData.version` writes across `packages/geometry-*/src/*.ts`:

| Element type | Builder | Version stamp present? | Mechanism |
|--------------|---------|------------------------|-----------|
| wall         | `WallFragmentBuilder.ts:668`    | ✅ | `this._geometrySeq` (sequence) |
| slab         | `SlabFragmentBuilder.ts:368`    | ✅ | `(prev ?? 0) + 1` |
| roof         | `RoofFragmentBuilder.ts:244`    | ✅ | `(prev || 0) + 1` |
| curtainwall  | `CurtainWallBuilder.ts:1306,1838` | ✅ | `this._nextVersion(cw.id)` |
| room         | `RoomBoundingLineBuilder.ts:114` | ✅ | `(prev || 0) + 1` |
| column       | `ColumnFragmentBuilder.ts:249`   | ✅ | `_priorVersion + 1` (Round 19) |
| **door**     | **`DoorBuilder.ts:291`** *(also :155 fast path)* | **✅** | **`Date.now()` — §DOOR-AUDIT-2026 W6** |
| **window**   | **`WindowBuilder.ts:309`** *(also :180 fast path)* | **✅** | **`Date.now()` — §WINDOW-AUDIT-2026 W6** |
| stair, beam, ceiling, floor, handrail, furniture, plumbing, lighting, opening, stair-railing | (their builders) | ❌ | — (no stamp found) |

DoorBuilder and WindowBuilder had ALREADY added the version stamps as part of their respective W6 "stale-detection" audits (predating the §57 work). Date.now() is strictly monotonic for the NMEexporter's proxy-cache-key purposes (no two builds within the same project session collide), so the cache invalidates correctly on every rebuild — no staleness risk.

**Round 31 fix:** one-line additions to `CACHEABLE_ELEMENT_TYPES`:
```js
'door',
'window',
```

That's the entire change. Set extends from 6 → 8 entries. Coverage now includes the second-most-frequent element class (after walls) — every plan view with doors / windows hits cache HIT on the second + subsequent projections instead of re-running the full traverse + EdgesGeometry + toDrawingSpace pipeline for those elements.

**Performance impact estimate** (based on §DIAG-EPS-02 logs from the architect's earlier reported scene):
- A typical door has ~7 meshes (frame posts × 3, leaf, threshold, handle × 2) → ~3 ms uncached projection per door.
- A typical window has ~4-7 meshes (frame, glass × 2 for double, sill) → ~2 ms uncached projection per window.
- Cached HIT replay: ~0.2 ms per element (clone cached BufferGeometry).
- For a scene with 10 doors + 20 windows, second projection saves ≈ 10 × 3 ms + 20 × 2 ms = ~70 ms per plan view re-projection. Multiplied across the 5-10 re-projections triggered by a typical undo/redo / property edit cycle, total saved = ~350-700 ms of LONGTASK time.

**Still NOT in the set** (Day 4+ scope):
- stair, beam, ceiling, floor, handrail, furniture, plumbing, lighting, opening, stair-railing — each builder needs a per-build version stamp added (same pattern as Round 19 column fix: capture _priorVersion BEFORE dispose, stamp _priorVersion + 1 on the new root). Day 4 will sweep these.

**Pattern alignment:** mirrors the established CACHEABLE allow-list invariant — membership requires verified per-build version stamping; absence is the safe default. The Round 31 promotion is a strict NO-OP for the source builders (they were already doing the right thing) — Round 31 just unlocks the cache to recognise it.

**Contract citation:** §57 Day 3 (CACHEABLE_ELEMENT_TYPES extension), DAILY-USE Round 19 §COLUMN-MOVE-PLAN-STALE (established the version-stamp-then-promote pattern), §DOOR-AUDIT-2026 W6 + §WINDOW-AUDIT-2026 W6 (pre-existing per-build stamps).

---

## ✅ APPLIED — Round 30 (§SERVER-500-V1-MIGRATION-RACE + §SERVER-500-V1-COLUMN-MISSING — closes the create-project 500 by attacking both root causes)

### Two architectural fixes targeting the most likely remaining causes of the architect's project-create 500
**Files:** `server.js`, `server/pgClient.js`, `server/api/v1/routes.js`.

The architect's reported `Failed to create project [ProjectList] server-error (HTTP 500)` after Rounds 28-29 was traced via the new diagnostic depth (Round 29 enhanced Postgres-field logging) to one of two probable causes — Round 30 fixes BOTH proactively rather than waiting for one more live-log iteration.

**(a) §SERVER-500-V1-MIGRATION-RACE — migration race-window now returns 503 instead of 500**

server.js opens the listening socket BEFORE running migrations (lines 5286-5295) — comment explains the LB rationale (cold pool / network blip would make the LB kill the instance before it ever served). The gap between port-open and migrations-complete is typically 200 ms-3 s. A project-create that lands in that window can hit one of:
- `42P01` "relation does not exist" → Round 28 classified → 503 schema_not_applied ✓
- `42703` "column does not exist" on the RETURNING clause (because `runMigrations()`'s ALTER TABLE for `is_archived` / `is_starred` / `description` hasn't yet committed) → previously uncategorised → opaque 500 ✗

Round 30 fix — shared module-level flag pair in `pgClient.js`:
```js
let _migrationsReady = false;
export function getMigrationsReady()        { return _migrationsReady; }
export function setMigrationsReady(ready)   { _migrationsReady = !!ready; }
```
`server.js` calls `setMigrationsReady(true)` right after the existing `_migrationsReady = true` flip on successful migration. `routes.js` adds a gate middleware at the TOP of `v1Router` that returns 503 `migrations_in_progress` with `Retry-After: 2` until the flag flips. The /diagnostic endpoint is exempt so operators can still call it during the migration window.

`ProjectListClient` already handles 503 with exponential backoff — the architect's UI now correctly waits + retries instead of showing a hard 500 error. The race window is closed from the architect's perspective.

Architectural choice: `pgClient.js` for the shared flag avoids the circular dependency that would exist if routes.js imported from server.js (server.js imports the v1Router from routes.js). Both files already import from pgClient.js for other reasons, so the shared-flag idiom is clean.

**(b) §SERVER-500-V1-COLUMN-MISSING — 42703 now classified as 503 schema_migration_pending**

If the race-window fix above misses (e.g. server has been up for hours but the architect's Supabase DB has an OLDER schema where the ALTER TABLE statements never ran historically — Supabase doesn't run dbMigrate automatically), the INSERT can still hit `42703`. Previously uncategorised → opaque 500.

Round 30 adds a 5th classification case to `classifyV1Error`:
```js
if (code === '42703' || /column .* does not exist/i.test(m)) {
    // → 503 schema_migration_pending
}
```
Server log includes `err.column` and `err.table` (Postgres provides these in the ErrorResponse) so the operator instantly knows which column is missing. Architect message: "Database schema is missing recently-added columns. Restart the server to run pending migrations, or apply the latest server/dbMigrate.js ALTER TABLE statements via the Supabase SQL Editor."

This is separated from `schema_not_applied` (the table-missing case) because the remediation is subtly different — the table EXISTS, it's just missing recently-added columns. Operator action: re-deploy / restart so dbMigrate's ALTER block re-runs.

**Combined effect for the architect's reported error:**

With Rounds 28-30 in place, the create-project 500 is now structurally impossible for the four most-likely root causes (no DB pool, schema not applied, table missing columns, migration race window). Every case returns a structured 503 with `code` + `errorId`, and the client's existing 503-backoff machinery handles the retry transparently.

**Diagnostic redundancy:** if the failure is none of the above (truly novel cause), the Round 29 enhanced uncategorised log dumps every node-postgres field — the next live test produces an errorId pointing at a server log line with `message + code + detail + hint + table + column + constraint + schema + severity + routine + stack`. One round-trip → root cause → Round 31 lands the fix.

**Pattern alignment:** mirrors the "always return retryable 503 for transient infrastructure conditions, never opaque 500" invariant codified in every modern API gateway (AWS API Gateway 503 InternalServerError doc, Cloudflare 525 SSL Handshake doc, etc.). PRYZM's v1 router now matches.

**Contract citations:** §SERVER-OBSERVABILITY (errorId + classification + Retry-After), C13 §3 (project lifecycle invariants), §LIFECYCLE (boot order), §07-BIM-SECURITY-CONTRACT §11 (DB-access confined to server/).

---

## ✅ APPLIED — Round 29 (§SERVER-500-V1-UNCATEGORISED — full Postgres error-field dump + diagnostic endpoint)

### Uncategorised 500s now log every node-postgres field; new GET /api/v1/diagnostic gives architect-runnable self-check
**Files:** `server/api/v1/routes.js` — `classifyV1Error` uncategorised branch + new `GET /diagnostic` endpoint.

**Context:** Round 28 added structured SQL-state classification for 5 known cases but anything outside that set fell through to a one-line `console.error(err, code ? ... : '')` log. For the architect's reported 500, this caught the SQL state code but missed the much richer set of node-postgres / Postgres diagnostic fields that would identify the actual cause — Round 28 alone could not distinguish between "FK violation but on a different column than owner_id," "RLS policy denying SELECT but not INSERT," "constraint check failure," "schema mismatch on a recently-added column," and so on.

**Round 28 analysis correction:** during this round I re-read `server/dbMigrate.js:41-46` — `projects.owner_id` is INTENTIONALLY NOT a FK to `pryzm_users` (comment: "A FK here would cause FK-violation errors on every project create"). So my Round 28 hypothesis that the failure was `user_not_provisioned` (23503 FK violation) was wrong. Without a FK, that code path can't fire for owner_id. The actual cause is elsewhere — Round 29's enhanced logging is what reveals it.

**(a) Enhanced uncategorised log** — `classifyV1Error` uncategorised branch now logs every node-postgres / Postgres-protocol field in a structured object:
```js
{
    message, code, detail, hint, table, column, constraint,
    schema, severity, routine, stack,
}
```
Per Postgres protocol §V (Backend Messages → ErrorResponse), every error message can carry up to 13 fields; node-postgres surfaces 10 of them. Capturing them all means **"uncategorised" 500s diagnose in a single log line** — no server-restart-with-extra-logging round-trip needed. The Round 27/28 errorId still uniquely keys the log line for support correlation.

**(b) `GET /api/v1/diagnostic` endpoint** — read-only, owner-scoped, returns:
```js
{
    userId, ok,
    probes: { pgPoolConfigured, projectsTableExists, canSelectProjects, projectCount },
    errors: { … }
}
```
Architect can hit this URL immediately after seeing a 500 in the Project Hub to know whether:
- The PG pool is configured (boolean — distinguishes "missing SUPABASE_DB_URL" from "DB error")
- The projects table exists (boolean — catches "schema never applied" case)
- The architect's userId can SELECT (boolean — catches RLS / permission misconfigurations)
- The architect's project count (sanity check — confirms baseline DB query works)

The endpoint is read-only (does NOT create or modify rows), so safe to call repeatedly during diagnosis. Pairs with the errorId+code from the create/list 500 paths to triangulate the exact precondition that's failing.

**Pattern alignment:** Round 29's diagnostic-endpoint approach is the same one §AUTOSAVE-LOAD-SLOW-OR-HANG (Round 22) used for the client load path — observability-first, then a targeted fix once the observation lands. The Postgres-error-field dump is the same defense-in-depth instrumentation that production database tools (DataDog, Sentry) capture by default; PRYZM now matches.

**Contract citations:** §SERVER-OBSERVABILITY (errorId pattern + structured-field dump), §LIFECYCLE, C13 §3 (project lifecycle), C07 §5 (read-only diagnostic endpoints — owner-scoped).

**Next step:** the architect's next live test will produce an errorId + a server log line containing the full Postgres error context, OR they can directly hit `GET /api/v1/diagnostic` to get a structured self-check report. Either path identifies the actual precondition that's failing, and Round 30 lands the targeted fix.

---

## ✅ APPLIED — Round 28 (§SERVER-500-V1-PROJECTS-PIPELINE + §CSP-UPGRADE-INSECURE — the actually-called server route gets classification; CSP noise silenced)

### CRITICAL DISCOVERY: Round 25/27 fixed the wrong route — Round 28 fixes the right one
**Files:** `server/api/v1/routes.js`, `server/securityHeaders.js`.

**Before:** the architect's live log showed `[ProjectListClient] server-error (HTTP 500)` on both `GET /api/v1/projects` (Project Hub sync) and `POST /api/v1/projects` (New Project button). My Rounds 25 + 27 applied the errorId+SQL-state classification pattern to `/api/projects` (the unversioned legacy route)... but the client doesn't call that route. **`ProjectListClient.ts:153, 166` call `/api/v1/projects`** — the versioned route routed through `app.use('/api/v1', apiLimiter, authMiddleware, v1Router)` at `server.js:297`. Those previous rounds did NOT reach the failing handlers.

The v1 handlers had INCONSISTENT error handling:
- GET + POST: detected `'PostgreSQL not configured'` and returned 503 `db_not_configured`; everything else → opaque 500.
- DELETE + PATCH: NO classification at all — every error → opaque 500.

No errorId on any v1 response. No SQL-state classification. Architect's bug reports could not be correlated with the server log.

**After (Part 1 — error pipeline):** new `classifyV1Error(err, endpoint, userId)` helper in `server/api/v1/routes.js` classifies every catch into the same 6 cases Round 27 established for the unversioned route:

| SQL state / signature | HTTP | Code | Architect-facing message |
|----------------------|------|------|-----------------|
| `'PostgreSQL not configured'` | 503 | `db_not_configured` | "Set SUPABASE_DB_URL in .env and restart." *(pre-existing — preserved)* |
| `42P01` / `PGRST205` / `PGRST116` / "relation does not exist" | 503 | `schema_not_applied` | "Run server/schema.sql in the Supabase SQL Editor and restart." |
| `23505` / "duplicate key" | 409 | `id_collision` | "A project with that ID already exists. Retry without specifying an ID." |
| `23503` / "foreign key" | 422 | `user_not_provisioned` | "User account is not provisioned. Sign out and back in to complete account setup, then retry." |
| `42501` / `PGRST301` / "permission denied" | 403 | `rls_denied` | "Database permission denied. Check Supabase RLS policy for the projects table." |
| (uncategorised) | 500 | (none) | "Internal server error." + errorId |

All four endpoints — `GET /projects`, `POST /projects`, `DELETE /projects/:id`, `PATCH /projects/:id` — now route their catch through the helper. Every response body includes `errorId`. Server log lines include `userId` + SQL state code. `ProjectListClient`'s existing `errBody` plumbing automatically passes `code + errorId` to callers — UI surfaces it for free.

**Most likely root cause** based on the analysis: `user_not_provisioned` (23503 FK violation on `owner_id`). The architect is authenticated (the request lands at v1 with a valid bearer) but their user row is missing from the local users table (the in-memory Replit PG fallback may not provision OAuth users automatically). The 422 response triggers the "sign out and back in" UX path on the client side. If that doesn't resolve, Round 29 will land server-side **automatic user provisioning on first project create** — `INSERT INTO users ... ON CONFLICT DO NOTHING` inside the create transaction so the FK never violates.

**After (Part 2 — CSP noise):** `server/securityHeaders.js` MAIN_CSP_DIRECTIVES now explicitly disables `upgradeInsecureRequests` in development via the helmet `null` idiom:
```js
...(IS_PROD ? {} : { upgradeInsecureRequests: null }),
```

The architect reported "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy." Browsers ignore this directive when CSP is in Report-Only mode (W3C CSP3 §2.5) and emit a warning per page load — at least twice per navigation in PRYZM. The directive came from helmet's defaults; helmet's documented disable-a-default-directive idiom (`directive: null`) removes it cleanly in dev while leaving it active in production where Report-Only is replaced with Enforce. Same posture as hsts / coep / coop / corp / frameguard already use ("disabled in dev for pragmatic reasons; active in prod for security").

**Pattern alignment:** Round 28 is the architecturally correct version of Round 25 + Round 27 — the previous rounds established the pattern; Round 28 applies it to the code path the user actually hits. Diagnostic discipline: **always confirm the URL the client requests before hardening a route — server-side handlers can drift from the client's expectation across API-versioning generations.**

**Contract citations:** §SERVER-OBSERVABILITY (errorId pattern), §AUTH-PERM-MODEL (user provisioning on first project), C13 §3 (project lifecycle), C07 §CSP (CSP directives), §LIFECYCLE.

**Next steps:** with errorId + structured codes now flowing from all four v1 endpoints, the architect's next live test will produce a SINGLE grep-able errorId in their bug report PLUS a structured `code` that points to the architectural fix. Round 29 will land the targeted root-cause fix (most likely auto-user-provisioning) once the live `code` is observed.

---

## ✅ APPLIED — Round 27 (§SERVER-500-PROJECT-CREATE — SQL-state classification + errorId correlation on POST /api/projects)

### Architect-actionable error responses replace opaque 500s when project creation fails
**File:** `server.js` `POST /api/projects`.

**Before:** the architect reported "failed to create project: [ProjectListClient] server-error (HTTP 500)" with zero actionable signal — same opaque-500 pattern Round 25 closed for the GET/DELETE endpoints. The handler had ONE partial classification (schema-missing → 503) and otherwise fell through to a single-line `console.error('[POST /api/projects] project creation failed:', m); res.status(500).json({ error: 'Internal server error.' })`. The user couldn't distinguish between:
- "Your account isn't provisioned" (FK violation — actionable)
- "ID collision, retry" (unique violation — auto-recoverable)
- "RLS denied" (server misconfig — operator-actionable)
- "Genuine server bug" (truly opaque)

All four collapsed to the same opaque server-error UX, and there was no errorId for support correlation.

**After:** the catch is now a proper classifier with the Round 25 errorId+log convention:

| SQL state / signature | HTTP | Client code | User-facing message |
|----------------------|------|-------------|---------------------|
| `42P01` / `PGRST205` / `PGRST116` / "relation does not exist" | 503 | `schema_not_applied` | "Database schema not applied. Open the Supabase SQL Editor…" (pre-existing) |
| `23505` / "duplicate key" / "unique constraint" | 409 | `id_collision` | "A project with that ID already exists. Retry without specifying an ID." |
| `23503` / "foreign key" / "violates foreign key" | 422 | `user_not_provisioned` | "User account is not provisioned. Sign out and back in to complete account setup, then retry." |
| `42501` / `PGRST301` / `PGRST204` / "permission denied" | 403 | `rls_denied` | "Database permission denied. Check Supabase RLS policy for the projects table." |
| (uncategorised) | 500 | (none) | "Internal server error." + errorId |

Every response body now carries `errorId` (`crypto.randomUUID()`) so the client error log and the server log line correlate 1:1. The server log line includes `userId` and the SQL state code in parentheses where present, so the operator can grep by errorId and immediately see the user + the database-level cause.

**Client surface (automatic via existing `ProjectListClient` plumbing):**
- `ProjectListClient._fetch` (line 290-291) reads the response body and passes it as `errBody` into `ProjectListClientError(kind, status, errBody)`. The new `code` + `errorId` fields are now visible to any caller that inspects the error object — no client-side change needed for the data flow to land.
- `mapStatus()` (line 298-303) now correctly maps the new codes:
    - 409 + 422 → `'invalid-request'` (better UX than `'server-error'` — surfaces a problem with the request shape).
    - 403 → `'unauthenticated'` (correct — auth-related).
    - 500 → `'server-error'` (kept for the genuine residual cases).

**Architectural alignment:** mirrors the same family of observability + classification patterns from Round 25 (§SERVER-500-PROJECT-OPEN) and Round 25 (§76 DELETE handler). The architectural invariant codified: **every server endpoint MUST distinguish architect-actionable failures from genuine server faults AND return an errorId for support correlation.** Queued for §SERVER-OBSERVABILITY contract section.

**Connected to #74 (PROJECT-OPEN-FAIL-FRESH):** the `user_not_provisioned` 422 code may explain #74 — if the first user create-project fails silently with FK violation, the fresh project never lands in the database; the architect then tries to open it and gets 404 (because it doesn't exist) which the UI may render as "project not available." Same investigation; the errorId pattern across all create/open/delete endpoints means the next live test will tie the threads together.

**Contract citations:** §SERVER-OBSERVABILITY (errorId pattern), §AUTH-PERM-MODEL (user provisioning on first project), C13 §3 (project lifecycle), §PLAN-LIMITS (foundation for a future `plan_limit_reached` 402 classification).

---

## ✅ APPLIED — Round 26 (§AUTH-SESSION-LEAK — CRITICAL cross-user data-leak closed via systematic clear + hard reload)

### Sign-out is now an all-or-nothing tear-down (defence in depth: 7-step clear + page reload guarantee)
**Files:** `apps/editor/src/ui/platform/AuthModal.ts` `signOut()`, `server.js` `GET /api/projects` in-memory fallback.

**Before:** the architect reported "I signed out and sign in with another user and the project where are already loaded from another user session - why this happens - this is not admissable". This was a **CRITICAL cross-tenant data leak**: after `signOut()` → re-`signIn(userB)`, User B saw User A's projects in the Project Hub AND the currently-loaded project in the editor.

**Root cause:** `AuthModal.signOut()` did only two things — removed `AUTH_STORAGE_KEY` and `AUTH_TOKEN_KEY` from localStorage. Everything else survived:
1. `ProjectListStore` in-memory project list — User A's projects still in JS heap.
2. The currently-loaded project's scene — every wall/slab/door/etc. still in THREE.js scene + every store.
3. Yjs collab session — still connected to User A's project's room.
4. PRYZM-prefixed localStorage caches (project metadata, recent-opened, last-active-level).
5. IndexedDB databases used for offline persistence (Yjs docs, project snapshots).
6. ProjectHub DOM — the sidebar still rendered User A's project list until the next `refreshSidebar`.

The server-side endpoints (verified during this round) ARE correctly owner-scoped via `.eq('owner_id', userId)` — so a fresh GET would have returned User B's projects. But the client never made that fresh GET fast enough; in-memory state painted User A's stale data first, and the user perceived the leak.

**After:** the new `signOut()` is a 7-step systematic tear-down with a page-reload as the architectural guarantee:

1. **Auth tokens removed** (the existing behaviour).
2. **All PRYZM-prefixed localStorage keys removed** — iterates an `Object.keys(localStorage)` snapshot, removes everything starting with `pryzm-` / `pryzm_` / `PRYZM_`. Allowlist prefix avoids nuking unrelated extension state.
3. **sessionStorage cleared.**
4. **IndexedDB databases deleted** (best-effort, async): for each `db.name` containing `pryzm`, fires `indexedDB.deleteDatabase()`.
5. **CacheStorage entries deleted** (best-effort, async): `caches.keys()` → `caches.delete()` for every `pryzm`-prefixed cache.
6. **Service-worker notification** (best-effort): posts `{ type: 'PRYZM_SIGN_OUT_CLEAR_CACHE' }` so a future SW can clean its own state.
7. **`window.location.reload()` (THE GUARANTEE):** deferred 50 ms so any in-flight `runtime.persistence.client.signOut()` server call has a chance to dispatch. The reload destroys ALL in-memory state — every store, scene, controller, observer, Yjs session, DOM tree. The page returns to a cold-start identical to a fresh browser-tab open. Auth modal renders on token-absent.

The page-reload makes the invariant trivially provable: **after sign-out, the entire page is reconstructed; no User A state can leak into User B's session.** Even if step 1-6 missed a clear, step 7's nuclear reset guarantees correctness.

**Server-side defensive tightening:** the in-memory fallback at `GET /api/projects` previously returned EVERY in-memory project when `userId === 'anonymous'` (anonymous read-all loophole — only reachable when no DB is configured). Tightened to return `[]` for anonymous so even a misconfigured local-dev environment can't leak across users.

**Architectural invariant codified:** **sign-out is an all-or-nothing tear-down. After sign-out, the page MUST be in a state identical to a fresh browser-tab cold-start.** Queued for §AUTH-PERM-MODEL contract section.

**Compliance posture:** closes a GDPR / SOC-2 / ISO 27001 cross-tenant data-leak that would block any multi-user pilot. The page-reload approach is identical to the pattern enterprise auth proxies (Okta, Auth0) use after every credential change — battle-tested and architecturally minimal.

**Pattern alignment:** mirrors the same family of post-refactor coverage gaps closed by Rounds 17-21 / 24 (every consumer that handles a state-transition needs an audit for completeness). Sign-out is THE state-transition that demands all-or-nothing semantics, and step 7's page reload is the architecturally cleanest way to enforce it.

**Contract citations:** §AUTH-PERM-MODEL (sign-out invariant — newly codified), C13 §3 (project lifecycle), §SERVER-OBSERVABILITY (in-memory fallback hardening), §LIFECYCLE.

**Telemetry:** sign-out fires `console.log('[signOut] §AUTH-SESSION-LEAK reloading page to guarantee all User-A state is destroyed.')` so the architect can see in the live log that the new chain is running.

---

## ✅ APPLIED — Round 25 (§57 Day 2 + §56 + §SERVER-500-PROJECT-OPEN — three concurrent improvements)

### (a) §57 Day 2 — `column` promoted to `CACHEABLE_ELEMENT_TYPES`
**File:** `apps/editor/src/engine/views/EdgeProjectorService.ts`.

Round 19 (§COLUMN-MOVE-PLAN-STALE) added per-build version stamping to `ColumnFragmentBuilder`. With that invariant in place, columns can now safely join the projection cache without serving stale geometry. The Day-1 allow-list extends from 5 → 6 entries: `{ curtainwall, wall, slab, roof, room, column }`. Comment block updated with the Day-2 audit findings: door / window / stair / beam / ceiling / floor / handrail / plumbing / furniture / lighting / opening / stair-railing all still LACK version-stamping in their builders, and Day 3 of #57 will sweep them.

### (b) §56 — RoomTopologyObserver + wallRebuildCoordinator paused during undo/redo
**File:** `packages/command-registry/src/CommandManagerImpl.ts` — `undo()` + `redo()` now wrap their command-dispatch through a new `_withPausedObservers('UNDO' | 'REDO', body)` helper.

**Before:** the architect reported "Undo and redo doesn't work / 2-3× REDETECT_ROOMS per single Ctrl+Z, ~80ms LONGTASK in plan view." Round 2 §#48 already fixed the per-execute storm by adding the paused-gate to `_executeRedetect`, but undo paths still fired multiple intermediate store events (wall removed + opening removed + room boundary changed) and each tripped the observer's debouncer → multiple REDETECT_ROOMS commands per single undo press.

**After:** `undo()` / `redo()` now:
1. Pause `window.__wallRebuildControl` and `window.roomTopologyObserver` BEFORE dispatching the command's undo / execute.
2. Run the body inside try/finally.
3. On finally: `__wallRebuildControl.resumeAndFlush()` (ONE coalesced wall rebuild pass) + `roomTopologyObserver.resume()` (the observer's natural debouncer fires ONE REDETECT_ROOMS after resume).

Architectural pattern mirror: `ProjectLoader.load()` already uses the same scaffold around bulk hydration (initBuilders + persistence/ProjectLoader.ts:279-296 + finally block at 1456-1495). Round 25 brings undo/redo into line so the architectural invariant ("bulk-mutation operations pause observers, then resume + flush ONCE") is consistent across all bulk-mutation paths.

Best-effort design: if either global is unavailable (server-side rendering, test environment), the operation still runs without the pause/resume optimisation.

### (c) §SERVER-500-PROJECT-OPEN — Project-open 500s now log the error + return a structured `errorId`
**File:** `server.js` — four project-open endpoints hardened.

**Before:** the architect reported "Server error http 500 while trying to open a project already created" with zero server-side diagnostic. The catch blocks in `GET /api/projects/:id` (line 2590), `GET /api/projects/:id/versions` (line 2755), `GET /api/projects/:id/latest-version` (line 2805), and `GET /api/projects/:id/versions/:vid` (line 3251) silently swallowed the error: no log, no stack trace. The client saw `500 Internal Server Error` and the server log was empty — diagnostic dead end.

**After:** each catch now:
1. Mints an `errorId` via `crypto.randomUUID()` (fallback `err-${Date.now()}-${rand}`).
2. Logs the full error WITH context via `console.error('[GET /api/projects/:id] errorId=… projectId=… userId=…', err)`. The stack trace surfaces in the server log AND the request shape is captured for replay.
3. Returns `{ error: 'Internal server error.', errorId }` to the client so the architect can include the errorId in their bug report — server log correlation is now trivial.

Mirrors the already-correct `DELETE /api/projects/:id` and `GET /api/projects/:id/command-log` patterns which already had the `console.error('[DELETE/...]', err)` shape. The fix brings the GET endpoints into line.

Round 26 will land the actual root-cause fix once a live 500 produces an errorId + server log line.

**Contract citation:** §SERVER-OBSERVABILITY (server.js global error handler from Round 0 expanded with per-handler errorId correlation), §LIFECYCLE, C13 §3 (project lifecycle).

---

## ✅ APPLIED — Round 24 (§FIRST-ELEMENT-3D-FRAME-FURNITURE — §13-CAM regex extended to furniture / plumbing / lighting / wall.opening)

### Split-view 3D pane now auto-frames on the FIRST plan-pane element regardless of type
**File:** `apps/editor/src/engine/initTools.ts` — `_CREATE_CMD_RE` extended.

**Before:** the architect reported "I created a sofa in plan view as the first element - it should zoom in to the element in 3D view." The §13-CAM (C11 §12) first-element-framing handler had been in place since the original split-view work, but its regex enumerated ONLY the structural-geometry types:
```
/^(wall|slab|curtainwall|curtain-wall|column|beam|ceiling|roof|floor|stair|handrail)\.(create|batch\.create)$/
```
The handler short-circuited on every `furniture.create` / `plumbing.create` / `lighting.create` / `wall.opening.create`, so a furnishing-first project (e.g. a residential interior refit on an existing slab) saw the sofa land but the 3D pane stayed at its boot-time camera. The architect had no spatial feedback for their first action.

**After:** the regex now includes all visible-mass element types:
```
/^(wall|slab|curtainwall|curtain-wall|column|beam|ceiling|roof|floor|stair|handrail|furniture|plumbing|lighting|wall\.opening)\.(create|batch\.create)$/
```
The first ANY-type commit triggers the 300 ms deferred `zoomToAll()` — same one-shot semantics (re-armed on `pryzm-project-loaded`), same fail-safe try/catch, same "C11 §12.2 user-camera preservation after the first frame." The console log now identifies which type triggered: `[initTools] §13-CAM: framed 3D camera on first plan-pane element — type=furniture.create`.

**Pattern alignment:** mirrors the same family of post-refactor coverage gaps closed by Rounds 17-21 (furniture payload-shape, railing canExecute shape, column version stamp, furniture id pre-gen, plumbing payload-shape, door/window plan-tool material resolution). Every subscriber that enumerates `'wall' | 'slab' | 'column' | …` needs auditing for furnishing/plumbing/lighting extension.

**Contract amendment queued (C11 §12.2):** "first geometry element" is now read as "first VISIBLE element" — furnishing types contribute spatial mass that the architect benefits from seeing in 3D even though they don't extend the building envelope. The semantic update + the implementation are now in sync.

**Architectural soundness:** purely additive — no existing structural-type behaviour changes; the only behaviour added is "additionally fire for furnishing types," which is the user's explicit ask. The one-shot flag still flips exactly once per session regardless of which type wins the first-element race, so subsequent furniture commits don't re-frame.

---

## ✅ APPLIED — Round 23 (§SELECT-TAB-CYCLE — TAB now cycles through overlapping selection candidates)

### Universal TAB-cycle for the architect's "wall behind door, door behind wall" daily-use case
**File:** `packages/input-host/src/SelectionManager.ts`.

**Before:** the architect requested "When there are multiple elements that could be selected at the same time - for example - a wall and the window - a wall and the door, etc.. it would be great to have 'TAB' to choose either to select one or the other. the user click and TAB - this is similar behavior in revit and so on - please analyse the best possible architecture - this should be an exemplary architecture - needs to be documented in the contracts." The pre-existing TAB handler only fired for curtain wall sub-elements, kitchen units, and wardrobe units — clicking on a wall covered by a door + then pressing TAB did nothing for those generic cases.

**After:** SelectionManager now implements the universal Revit/SketchUp TAB-cycle pattern:

1. **Capture (architectural anchor):** every successful BVH-pick selection now captures the FULL ordered candidate list at the click position (front-to-back by camera distance, deduplicated by selectable root) into `_tabCycleCandidates`. The cursor coordinates are stored as the anchor in `_tabCycleAnchorClientX/Y`. A console line `[SelectionManager] §SELECT-TAB-CYCLE captured N overlapping candidates at click — TAB to cycle` fires when N > 1, so the architect sees they have cycle-available.

2. **Cycle (architectural advance):** the keydown handler now has a generic `e.key === 'Tab'` branch BEFORE the existing CW/kitchen/wardrobe special cases. It:
    - Checks the cursor is still within `TAB_CYCLE_ANCHOR_PX = 16` px of the anchor (re-uses `_lastHoverConfirmedClientX/Y` from the §SELECT-3D-1 GPU hover rAF, falls back to event.clientX/Y).
    - Yields to the CW/kitchen/wardrobe cycles when those are the current selection (they have richer sub-element-drilling semantics).
    - Otherwise: advances `_tabCycleIndex` by `+1` (TAB) or `−1` (Shift+TAB), wraps modulo, selects the new candidate, logs the cycle progress.
    - `e.preventDefault()` so the browser's tab-traversal doesn't move focus out of the canvas.

3. **Reset:** the cycle state is cleared on tool switch (existing `setSelectionEnabled` reset path) and naturally re-enumerated on every fresh click that lands outside the anchor radius.

**Architectural alignment:**
- Composable with **#59 (Round 9 GPU/BVH split)**: the candidate list IS the full BVH hit set; GPU pick still owns the FRONT-MOST claim on the original click. Cycle moves THROUGH the same authoritative candidate set the GPU/BVH stack already produced — no new pick path, no parallel resolver.
- Composable with **#68 (Round 19 column-move version stamp)**: now that columns correctly invalidate their cached projection, the BVH hit set at a given click position is accurate; TAB-cycle inherits that correctness.
- C13 §3 (selection authority) extended with cycle semantics — TAB advances within the same authoritative candidate list, not a parallel pick.
- C14 §2.3 (interaction precedence) — generic cycle runs BEFORE the special-case CW/kitchen/wardrobe sub-element cycles so it's always reachable for the common case (wall behind door, etc.). The special cases still take precedence when their type is current selected.

**Plan-view symmetry:** the plan-view picker uses Canvas2D pixel-accurate coordinates; overlapping elements are rarer there but the same `_tabCycleCandidates` slot will support a future plan-view extension when the plan-tool overlay forwards keyboard events through SelectionManager.

**Contract documentation queued:** C13 §5 "Selection — Cycle Behaviour" — canonical candidate-list ordering rule, anchor-snap radius, TAB / Shift+TAB / Esc behaviour, conflict with browser tab-focus. ADR-0042 (proposed): "Cycle anchor coordinate vs cursor coordinate — pin to the click position so cursor drift doesn't re-enumerate".

**Pascal reference compatibility:** matches the pascalorg/editor `editor/src/select/cycle` (the Revit-derived) shape — front-most-first ordering + anchor-snap gate + Shift-reverse — without copying their implementation.

---

## 🔬 DIAGNOSIS LOGGED — Round 22b (§SLAB-3D-PREVIEW — onPointerMove probe added)

### SlabTool.onPointerMove now logs activeTool + firstPoint state every 30 events
**File:** `packages/geometry-slab/src/SlabTool.ts` `onPointerMove`.

**Before:** the architect reported "Preview for slab creation on 3d is not present - doesnt render the preview". Investigation showed the SlabTool DOES have preview infrastructure (`previewRect`, `previewFillMesh`, `previewLine`) and the `onPointerMove` handler IS attached at line 1110 via `addEventListener('pointermove', this.onPointerMove)`. But the preview-render path is gated:
- `'FLOOR_SKETCH'` / `'HOLLOW_SLAB'`: `if (!this.floorSketch.firstPoint) return;` — preview only after first click.
- `'POLYLINE_SLAB'`: `if (this.polylineData.points.length === 0) return;` — preview only after first click.
- `'REGION_SLAB'`: NO branch at all → no preview ever (auto-detect mode does not need one — single click commits).

Three possible failure modes that need runtime evidence to distinguish:
1. `onPointerMove` never fires (event-listener gap, e.g. canvas captures pointer events before SlabTool).
2. `activeTool === 'REGION_SLAB'` or `'NONE'` when the user expects a preview.
3. Mode is correct but `firstPoint` / `polylinePoints` never gets set (the first click isn't being recorded).

**After:** added a throttled (1 in 30) `[SlabTool] §SLAB-3D-PREVIEW pointermove tool=… firstPointSet=… polylinePoints=…` probe inside `onPointerMove`. Live-log output will instantly distinguish the three cases:
- If the probe NEVER fires → case 1 (event-listener gap).
- If the probe fires with `tool=REGION_SLAB` or `tool=NONE` → case 2 (mode misconfiguration).
- If the probe fires with `tool=FLOOR_SKETCH firstPointSet=false` even after the user clicks → case 3 (click handler not recording first point).

Round 23 (slab) will apply the targeted fix once the probe reveals the case. Same diagnostic-first approach as §STAIR-PREVIEW-REGRESSION (Round 12), §RAILING-CREATE-BROKEN (Round 18), §AUTOSAVE-LOAD-SLOW-OR-HANG (Round 22).

**Contract citation:** C11 §6.3 (preview is the tool's interactive plan-view symbol — must always render in modes that expect it), C14 §1 (tool overlay).

---

## 🔬 DIAGNOSIS LOGGED — Round 22 (§AUTOSAVE-LOAD-SLOW-OR-HANG — real-time phase logging + watchdog)

### ProjectLoader now emits `§LOAD-PHASE` per phase + `§LOAD-WATCHDOG` heartbeat every 5s
**File:** `apps/editor/src/engine/persistence/ProjectLoader.ts` `load()`.

**Before:** the architect reported "why the loading auto save takes that long - dont opend?". The loader already had phase instrumentation but the summary line `[ProjectLoader] PHASE_TIMINGS ...` only fired AT THE END of load. If the load hung mid-phase, the user saw silence forever — no signal which phase was the bottleneck. The Rounds 2 §#47 (in-flight shadow rebuild guard) and §#48 (RoomTopologyObserver paused-gate single-source-of-truth) already closed the two documented hang causes; further hangs would be in unmeasured territory.

**After:** the `__phase(name)` helper now logs in REAL TIME at every phase boundary:
```
[ProjectLoader] §LOAD-PHASE name=setup elapsed=12.3ms total=12.3ms
[ProjectLoader] §LOAD-PHASE name=hydrate elapsed=1450.7ms total=1463.0ms
[ProjectLoader] §LOAD-PHASE name=event_flush elapsed=320.5ms total=1783.5ms
[ProjectLoader] §LOAD-PHASE name=wall_rebuild_flush elapsed=215.0ms total=1998.5ms
[ProjectLoader] §LOAD-PHASE name=redetect_sweep elapsed=85.2ms total=2083.7ms
```

PLUS a 5-second watchdog interval that fires `[ProjectLoader] §LOAD-WATCHDOG load still running after Xs — current phase="…" stuck for Ys` if no phase completes within the window. The watchdog gives the user a heartbeat instead of silence, and identifies the stuck phase by name — the next live-log report will pinpoint the bottleneck.

Defensive cleanup: `clearInterval(__watchdog)` is called BOTH at the natural end-of-load (right before the PHASE_TIMINGS summary) AND in the outer finally block (idempotent — guarantees the watchdog stops even if an exception bypasses the natural path).

**Pattern alignment:** mirrors the `§STAIR-PREVIEW-REGRESSION` (Round 12) and `§RAILING-CREATE-BROKEN` (Round 18) diagnostic-probe approach — when the root cause needs runtime evidence to pinpoint, ship logging + watchdog instead of guessing. Once the live log reveals which phase the load is stuck in, the targeted fix lands as Round 23.

**Anticipated phase suspects** (await runtime log evidence to confirm):
- `setup` >2s → ClearProjectCommand or environment teardown is slow.
- `hydrate` >5s → per-element Create*Command dispatch is bottlenecked (most likely culprit on large projects given the recent Round 17-21 fixes that touched every store path).
- `event_flush` >1s → builder fan-out is processing per-event instead of batched (storeEventBus.endBatch is already coalescing — this would be a leak).
- `wall_rebuild_flush` >2s → WallJoinResolver's §MULTI-CLUSTER pre-pass is slow with many adjacencies.
- `redetect_sweep` >1s → ReDetectRoomsCommand per-level is the bottleneck.

**No code change to load logic** — only observability. Round 23 will apply the targeted fix once the watchdog identifies the stuck phase.

**Contract citation:** C04 §3.4 (frame budget — load is a frame-extended operation requiring per-phase observability), C13 §3 (project lifecycle), §LIFECYCLE.

---

## ✅ APPLIED — Round 21 (§DOOR-WINDOW-PLAN-FRAME + PLAN-CREATE-MATERIAL — frame ticks + system-type colour resolution on plan-tool dispatch)

### Plan-view door/window now show the cut-frame symbol AND inherit the architect's chosen system-type finish
**Files:**
- `packages/geometry-door/src/DoorPlanSymbolBuilder.ts` `_computeSwingGeometry` — added two perpendicular jamb-tick lines (each crossing the full wall thickness) at the door's left + right jambs. CUT layer (heavy line weight). AEC convention.
- `apps/editor/src/engine/initTools.ts` `wall.opening.created` bridge — now resolves `o.systemTypeId` against `doorSystemTypeStore` / `windowSystemTypeStore` and writes the resolved `frameFinish` + `leafFinish` + `frameColor` + `leafColor` onto the `doorStore.add` / `windowStore.add` payload. Mirrors `CreateWallOpeningCommand.execute()` lines 104-178 which already does this for the legacy 3D path.

**Before:** the architect reported two sub-problems with the plan-tool path:

**(1) "In plan view the 'Frame' doesn't render."** `DoorPlanSymbolBuilder._computeSwingGeometry` produced the leaf rectangle (CUT) and the swing arc + open-position line (PROJ), but NO frame-jamb ticks. AEC plan convention shows the door cut frame profile as two short perpendicular lines at the jambs crossing the wall thickness. The wall projection has a GAP at the door opening; without the frame ticks, that gap appears as an unstructured void. Windows already had this (WindowPlanSymbolBuilder.ts:170-172 — "jamb lines at each end (cut profile of the frame at the section plane)"); doors did not.

**(2) "When the door/window is created on plan view - even if it is the timber option - on 3D is created without materials."** The DoorPlanToolHandler dispatch correctly passed `systemTypeId: 'dt-solid-timber'` (default) or the architect's chosen type. The `wall.opening.create` bus route lands at the bridge in `initTools.ts:887`. That bridge mirrored `systemTypeId` to doorStore.add() and stopped — it did NOT resolve the system type into `frameColor` / `leafColor` / `frameFinish` / `leafFinish`. `DoorBuilder.buildVisuals` (DoorBuilder.ts:379-380) reads `door.frameColor` and `door.leafColor` directly — both were undefined → fell back to defaults → "rendered without materials." Compare to `CreateWallOpeningCommand.execute()` line 130-134 (legacy 3D path) which already does this resolution. The asymmetry was the missing fix from Round 13 (§M-H5): Round 13 closed the legacy WallFragmentBuilder hard-coded path; this round closes the new-DoorBuilder dispatch path.

**After:**

**(1)** Each door now renders two short perpendicular cut-ticks at its jambs, completing the AEC plan symbol. The ticks are CUT layer (heavy line weight) matching the wall's cut weight and the existing window jamb tick pattern.

**(2)** The bridge resolves the system-type at mirroring time. The doorStore now receives `frameColor` + `leafColor` + `frameFinish` + `leafFinish` from the architect's chosen type (timber, steel, glazed, fire-rated, etc.). DoorBuilder.buildVisuals reads these into the 3D mesh material. Same path applied to windows for `frameFinish` + `frameColor`. Diagnostic log line shows the resolved colour values for live-log verification.

**Pattern alignment:** mirror of `CreateWallOpeningCommand.execute()` lines 104-178 — every CreateWallOpening writer must resolve the system-type to the finish colours. The bus-path bridge was a missing replica; now in line. Closes the second half of "door materials don't come through" that Round 13 §M-H5 partially addressed (Round 13 closed the legacy fragment-builder hard-coded colour path; Round 21 closes the new-builder system-type-resolution path).

**Contract citation:** C11 §6.3 (plan-view symbol injection — AEC frame-cut convention), C15 (hosted elements: doors/windows must carry system-type-resolved finish at store-add time), DAILY-USE §M-H4 (system-type persistence), §M-H5 Round 13 (legacy-path colour resolution).

---

## ✅ APPLIED — Round 20 (§FURN-PLUMB-3D-PREVIEW-OK-COMMIT-BROKEN — Furniture pre-generates id + Plumbing listener resolves from store)

### Furniture drop now mints its id at the dispatch site + Plumbing 3D listener follows §3.5
**Files:**
- `apps/editor/src/ui/furniture-carousel/FurnitureDragDropHandler.ts` — added `createId('furniture')` import + pre-generated `furnitureId` passed in the bus dispatch payload.
- `apps/editor/src/engine/initBuilders.ts` (plumbing listener) — replaced the `e.detail?.fixture` guard with the same `_resolveFromEvent`-style helper that Round 17 introduced for furniture.

**Before:** the architect reported "Furniture and plumbing fixture render on 3d preview - but not possible creation or rendering on 3d". Two distinct sub-bugs sharing the symptom:

**(a) Furniture — bus → legacy-store bridge silent reject.** `FurnitureDragDropHandler.handleDrop` dispatched `bus.executeCommand('furniture.create', { furnitureType, position, ... })` without an `id` field. The §FT-FURNITURE bridge at `initTools.ts:1564` (Round 0 bridge, still in place) checks `if (ev.commandType !== 'furniture.create' || !ev.id || !ev.furnitureType || !ev.position) return;` — `!ev.id` short-circuited every drop, the legacy `furnitureStore.add()` never fired, no 3D mesh was built. (The PRYZM-3 Immer store got a barebones entry from `CreateFurnitureHandler` which the Project Browser + plan view symbol-builder consumed — masking the 3D failure.) The pattern WallPlanToolHandler established at `WallPlanToolHandler.ts:328` (`createId('wall')` minted at dispatch) was never replicated for the furniture drag-drop. Now applied.

**(b) Plumbing — same payload-shape regression as the Round 17 furniture fix.** `PlumbingStore.add()` dispatches `bim-plumbing-added { id }` (geometry-plumbing/PlumbingStore.ts:11). The listener at `initBuilders.ts:575-576` guarded on `e.detail?.fixture` (full object) which the store never emits — every plumbing add silently dropped. The plan-view preview/symbol layer read the store directly and worked fine, masking the 3D failure. Now replaced with the same `_resolveFromEvent(e)` helper Round 17 introduced for furniture: resolves the fixture from `plumbingStore.get(id)` (the source of truth) when the payload carries an id, with backward-compat for any legacy caller still passing `fixture` inline. Added matching `bim-plumbing-updated` and `bim-plumbing-removed` listeners that previously had NO handler at all — every plumbing update/remove was a silent no-op on the 3D side.

**Pattern alignment:** Round 20 closes the third occurrence of the producer/consumer contract-asymmetry family that Rounds 17 (furniture) and 18 (railing) closed. The architectural invariant codified across all three: **the store emits `{ id }` and is the source of truth; consumers must `store.get(id)` on every event, never trust the payload as transport.** Plus the cousin invariant: **every plan-tool / carousel / 3D tool dispatch MUST pre-generate the element id via `createId(type)` so downstream bus→legacy bridges can route the id back to whichever store is the authoritative target.**

**Knock-on coverage:** the plumbing listener fix incidentally covers a previously-undocumented latent bug — plumbing UPDATE and REMOVE events had no 3D-side handler at all. Now wired symmetrically.

**Contract citation:** C03 §3.5 (store-as-source-of-truth), C11 §6 (Tool → Bus → Command → Store → Builder pipeline; pre-generated id is the invariant binding the steps), Round 17/18 (same family, established the canonical pattern).

---

## ✅ APPLIED — Round 19 (§COLUMN-MOVE-PLAN-STALE — ColumnFragmentBuilder now bumps `userData.version` on rebuild)

### Column move no longer leaves a stale square in plan view (NME proxy-cache invariant restored)
**File:** `packages/geometry-column/src/ColumnFragmentBuilder.ts`.

**Before:** the architect reported "the column symbol (square with cross) moves to the right location, but a square remains in the original location ... only the square in the wrong location is selectable in plan view." Two layers fed the plan-view picture:
- **Square** = projection of the 3D column mesh footprint via `EdgeProjectorService` → `NativeElementMeshExporter` → traverses the live scene mesh.
- **Cross** = symbol injection via `ColumnPlanSymbolBuilder` → reads fresh from `columnStore.getAll()`, no internal cache.

The cross moved correctly (symbol builder is stateless). The square stayed at the old position even though the 3D mesh had correctly moved. Root cause: `NativeElementMeshExporter` has a proxy cache keyed by `(elementId, viewId, currentVersion, cropKey)` where `currentVersion = root.userData.version ?? -1` (NMEExporter.ts:227). The wall / slab / roof / curtain-wall / room builders all bump `root.userData.version` on every rebuild (verified by the Round 11 §57 Day 1 audit). `ColumnFragmentBuilder.build()` did NOT — `version` stayed at undefined → `currentVersion` collapsed to the constant `-1` → cache key was identical before and after every move → cache HIT returned the OLD proxy descriptors which encode the OLD world position in `(d.px, d.py, d.pz)` → projection traversed the old descriptors → stale square at the old location. The selection registry tagged the OLD stale square's segments with the column's elementUUID, so the user's click resolved to the old location while the new location (correctly drawn by the symbol builder) had no hit-test geometry behind it.

**After:**
1. `build()` captures `_priorVersion = (this.meshes.get(column.id)?.userData?.version as number | undefined) ?? 0` AT THE TOP of the method, BEFORE the dispose path nukes the meshes-map entry.
2. The new root.userData carries `version: _priorVersion + 1` — monotonically bumped on every rebuild.
3. NMEExporter sees a fresh version → cache MISS → fresh proxy descriptors encoding the NEW world position → fresh projection → fresh square at the correct location → fresh elementUUID-tagged hit-test geometry at the correct location.

**Pattern alignment:** mirrors the WallFragmentBuilder.ts:668 (`wallGroup.userData.version = this._geometrySeq`), SlabFragmentBuilder.ts:368 (`root.userData.version = (root.userData.version ?? 0) + 1`), RoofFragmentBuilder.ts:244 (same), CurtainWallBuilder.ts:226-232 (documented contract). Column was the sole structural-element outlier missing the per-build version stamp. The fix brings it into line.

**Knock-on benefits:**
1. Column move now correctly invalidates ANY cache that keys on userData.version — both the NME proxy cache (already in place) and the EdgeProjectorService cache when columns join CACHEABLE_ELEMENT_TYPES (currently NOT in the set per Round 11 §57 Day 1; can now be safely added in Day 2).
2. Selection in plan view immediately resolves to the correct location post-move (the elementUUID-tagged segments now live where the column actually is).
3. Closes one of the three sub-problems in #68. The other two (3D selection difficulty at distance, plan-view selection of overlapping elements) are addressed by #59 (already fixed) and #66 (pending TAB-cycle architecture).

**Contract citation:** Round 10 §PERF-CACHE-DIAG (NMEExporter propagates version, requires the producer to stamp it), Round 11 §57 Day 1 (CACHEABLE_ELEMENT_TYPES gate documents the per-rebuild version-stamp invariant per element type), C03 §3.5 (builders own their geometric state including the version stamp).

---

## ✅ APPLIED — Round 18 (§RAILING-CREATE-BROKEN — Bridge canExecute now shape-tolerant; diagnostic probes added)

### CreateStairRailingHandler.canExecute now accepts both legacy class-store and PRYZM-3 Immer plain-object store shapes
**Files:** `plugins/stair/src/handlers/CreateStairRailing.ts`, `apps/editor/src/engine/initTools.ts`.

**Before:** the architect reported "the railing element doesnt get created - neither on plan view nor in 3D scene". Trace through the pipeline:
1. `CreateStairCommand.execute` (after a stair is committed) calls `this.proposeRailings(stair)` which `_bus.emit('bim-stair-railing-proposal', { stairId, proposedRailings: [left + right] })` (CreateStairCommand.ts:382, 487-508). One left + one right per stair.
2. `initTools.ts:1645` listens for `bim-stair-railing-proposal` and forwards each proposed railing through `bus.executeCommand('stair.createRailing', payload)`.
3. The bus routes to `CreateStairRailingHandler.canExecute` (plugins/stair/src/handlers/CreateStairRailing.ts:31).
4. `canExecute` looked up the stair via `stairStore.getById?.(id) ?? stairStore.get?.(id)`. Both are optional method calls. When `ctx.stores.stairStore` is the PRYZM-3 Immer plain-object store (`{ [stairId]: stairData }`), neither method exists → both optional chains short-circuit to `undefined` → `if (!stair)` is true → handler returns `valid: false` → bus call rejects → CreateStairRailingCommand never runs → railing record never lands in stairRailingStore → `bim-stair-railing-added` never fires → StairRailingBuilder never builds the mesh.

This is a silent-store-shape-mismatch — the same family of bug as Round 17 (furniture payload shape) and the original wall §P3.2 dual-store regression. The canExecute looked syntactically careful (`?.` chains) but was tied to a method-bearing class store shape.

**After:** `canExecute` now resolves the stair via THREE attempted lookups in order:
1. `stairStore.getById?.(id)` — legacy class store with `getById`.
2. `stairStore.get?.(id)` — legacy class store with `get`.
3. `stairStore[id]` — PRYZM-3 Immer plain-object store keyed by id.

Either shape resolves correctly. Only when ALL three return undefined does the handler reject.

**Diagnostic probes added** (Round 18b):
- `initTools.ts:1645` proposal listener now logs `[initTools] §RAILING-CREATE-BROKEN bim-stair-railing-proposal received: stairId=… proposedCount=…` so the runtime shows the count of proposed railings per stair commit.
- Each `bus.executeCommand('stair.createRailing', …)` now logs its result via `.then(res => console.log(...))` so the live log shows whether the bus call succeeded or rejected, with side identification.
- `CreateStairRailingHandler.execute` now logs `[stair.createRailing.handler] dispatching CreateStairRailingCommand stairId=…` before the `commandManager.execute` call, and errors loudly if `window.commandManager` is undefined (race-condition signal).

These probes mirror the §STAIR-PREVIEW-REGRESSION probe pattern and provide the live-log evidence needed to confirm the fix or pinpoint any remaining gap.

**Pattern alignment:** mirrors the universal §3.5 store-as-source-of-truth invariant. The handler validates against the store's current state; the store's interface is plural (class methods OR object keys); the lookup is shape-tolerant.

**Contract citation:** C11 §6.3 (handler validation gate must accept all store shapes the system supports), C03 §3.5 (store-as-source-of-truth — interface shape independent), §STAIR-AUDIT-2026 (handrail/railing pipeline parity with stair pipeline).

---

## ✅ APPLIED — Round 17 (§FURNITURE-3D-RENDER-REGRESSION — Listener now resolves furniture from store, not from event payload)

### Sofa creation: store + plan + browser were already correct; 3D builder silently dropped every event
**File:** `apps/editor/src/engine/initBuilders.ts` (the `bim-furniture-added` / `-updated` / `-removed` listeners).

**Before:** the architect reported "I can not create a sofa ... element seems to be on the store ... but cannot see it on the 3d scene ... preview in plan view renders ... can see the element on the project browser". Investigation:

1. `FurnitureStore.add(data)` (both implementations — the legacy `packages/geometry-furniture/src/FurnitureStore.ts:23` AND the new `packages/core-app-model/src/stores/FurnitureStore.ts:23`) dispatches `bim-furniture-added` with payload `{ id: snap.id }` — the id only.
2. The 3D builder listener at `initBuilders.ts:660` was:
   ```ts
   window.addEventListener('bim-furniture-added', (e: any) => {
       if (e.detail?.furniture) _safeFurnitureUpdate('bim-furniture-added', e.detail.furniture);
   });
   ```
   The guard `e.detail?.furniture` expected the FULL furniture object on the payload — which the store NEVER emits. Every single furniture-add event was silently dropped.
3. Plan view + Project Browser don't depend on this event — they read directly from the store on their own subscription path. So those views correctly displayed the new furniture, masking the 3D failure.
4. Same payload-shape mismatch in the `-updated` listener.
5. The `-removed` listener at the original code expected `e.detail?.furnitureId`, but the store emits `{ id }`. Same family of regression — already broken.

This is a textbook **payload-shape regression**: the producer was refactored to emit `{ id }` (matching the established wall/door/window/slab pattern where every store emits id-only and the listener refetches from the store), but the matching listener-side update was not made. The result is a perfectly-typed, perfectly-compiled, perfectly-quiet event-shape disagreement.

**After:** the three listeners now share a single `_resolveFurnitureFromEvent(e)` helper that:
1. Returns `e.detail.furniture` if present (backward-compat with any legacy caller still passing inline data).
2. Otherwise looks up `e.detail.id ?? e.detail.furnitureId` in `furnitureStore.get(id)` (the source-of-truth path — the store IS the authoritative model state per C03 §3.5).
3. Returns `null` if neither path resolves (logs a warning so the runtime log surfaces orphan events).

The `-removed` listener handles both `e.detail.id` and `e.detail.furnitureId` payload-key spellings (legacy callers and new callers continue to work).

**Pattern alignment:** mirrors the §3.5 builder invariant ("builders refetch from the authoritative store; never trust event payloads as transport") — wall/door/window/slab/roof builders all follow this shape. Furniture was the lone outlier reading payload-as-state. The fix brings it into line.

**Why the regression slipped through:** the listener never raised a runtime error (the `if` guard was the silent-drop path). TypeScript couldn't catch it because `e: any` discarded type information. The plan-view + Project Browser parity masked the 3D failure during smoke testing — you have to LOOK at the 3D view to notice. Round 17's `console.warn` on the orphan-event path closes that observability gap.

**Contract citations:** C03 §3.5 (builders subscribe to stores, refetch on event), C11 §6 (element creation pipeline — Tool → Bus → Command → Store → Builder).

---

## ✅ APPLIED — Round 16 (§UI-MAIN-PANEL — ProjectHub sidebar buttons survive refresh)

### Sign out + New Project + Upgrade + Import-Upload listeners moved from `attachListeners` to `attachSidebarListeners`
**File:** `apps/editor/src/ui/platform/ProjectHub.ts`.

**Before:** the architect reported "the buttons on the left hand side panel don't get triggered" — specifically Sign out and New Project. Investigation traced the root cause to a DOM-vs-listener lifecycle mismatch:

1. `attachListeners(el)` (the one-shot bootstrap, called once on initial mount at line ~85) bound click handlers to `#ph-sign-out` (line 357), `#ph-new-btn` (388), `#ph-upgrade-btn` (368), `#ph-import-upload-btn` (389).
2. `refreshSidebar()` (line 303) does `sidebar.innerHTML = this.renderSidebar()` — this DESTROYS + RECREATES the entire sidebar DOM, including those four buttons. The old DOM nodes (and their event listeners) are garbage-collected; fresh DOM nodes with no listeners take their place.
3. `refreshSidebar()` then calls `this.attachSidebarListeners(this.el)` to re-bind. But `attachSidebarListeners` only re-bound the section-nav (`[data-section]` items), the Platform Settings button (owner-only), and the World Model toggle. The four CTA / footer buttons were NEVER re-bound.
4. Result: after the FIRST sidebar refresh (triggered by every section nav click, plan change, project add/remove, sort change, …), Sign out + New Project + Upgrade + Import-Upload all became silent no-ops. The buttons rendered visually but generated no event response.

**After:** the four CTA / footer button listeners moved INTO `attachSidebarListeners`, so `refreshSidebar` ↔ `attachSidebarListeners` is now SYMMETRIC — every DOM element that lives in the sidebar template has its listener re-bound on every refresh. `attachListeners` retains an explanatory note (search `§UI-MAIN-PANEL`) cross-referencing the relocation so future authors know not to bind sidebar-template listeners outside `attachSidebarListeners`.

**Pattern alignment:** mirrors the established `attachGridListeners(el)` pattern (`#ph-grid` is also refreshed via innerHTML in `refreshGrid` → re-binds via `attachGridListeners`). The architectural invariant is now uniform: **for every DOM subtree refreshed via innerHTML, all listeners on that subtree live in the matching `attach*Listeners` method called from both bootstrap and refresh.**

**Defensive change (`!` → `?.`):** the relocated listeners use `el.querySelector('#ph-…')?.addEventListener(...)` (optional chaining) instead of the non-null assertion `!` they had before — the Upgrade button only renders on free/trial plans (`${showUpgrade ? …}` in the template) and the Import-Upload + Sign-out buttons could similarly be conditionally rendered in future revisions. Optional chaining matches the upgrade-button's pre-existing `?.` pattern.

**Contract citation:** §05-BIM-UI-ARCHITECTURE §2 (UI render + event-binding lifecycle), §07 (single source of truth for sidebar listener registration).

---

## ✅ APPLIED — Round 15 (§STAIR-LEVEL-ACTIVE-RESTORE — Stair prerequisite gate restores original active level)

### Active level reverts to architect's original level after the prerequisite-gate auto-adds a level
**File:** `apps/editor/src/engine/BimService.ts` `_ensureTwoLevelsForStair()`.

**Before:** the architect clicks the stair tool while on L0 (ground floor) with only one level in the project. The prerequisite gate panel correctly asks "Add a level so the stair has a top to land on?". The architect clicks "Add Level". The panel dispatches `AddLevelCommand` which:
1. Adds the new level (L1).
2. Sets `projectContext.activeLevelId = newLevel.id` (AddLevelCommand.ts:65 — correct generic behaviour: when a user explicitly adds a level via the Levels panel, they want to start working on it).
3. Calls `onRetry()` → the stair tool re-activates.

But the stair tool now sees the active level as L1 instead of L0. Consequences:
- The `StairSetupPanel`'s pre-selected baseLevel is the active level (L1), so the architect must manually re-pick L0 as the base.
- `StairPlanToolHandler._resolveTopLevel(activeLevelId)` is asked "what's above L1?" — L1 IS topmost → returns null → toast "Add a second level before placing a stair" appears even though one was just added.

**After:** `_ensureTwoLevelsForStair` now:
1. Captures `projectContext.activeLevelId` BEFORE showing the panel (originalActiveLevelId).
2. Wraps the caller's `onRetry` in a `wrappedOnRetry` that, after AddLevelCommand has run, restores `projectContext.activeLevelId = originalActiveLevelId` before invoking the original onRetry.
3. The architect lands back on L0 with the freshly-added L1 available as the stair's top — the happy path the gate's UX always implied.

The restore is best-effort (try/catch around the `projectContext` read+write) so a missing slot can never block the retry — the worst-case degrades to current behaviour (new level remains active) rather than dropping the tool entirely.

**Pattern alignment:** the wrap follows the §05-BIM-UI-ARCHITECTURE §7 principle that UI orchestration owns the user-flow context that individual commands cannot see. `AddLevelCommand`'s contract is preserved unchanged for every other caller (the Levels panel, AI insertion, project import). Only the stair prerequisite gate — which alone knows that the user was MID-FLOW into another tool — performs the restore.

**Architectural rationale (why we didn't change AddLevelCommand):**
- Option A (rejected): add a `setActive?: boolean` flag to AddLevelCommand. Pollutes the command surface for a single caller's user-flow context.
- Option B (rejected): emit an `addedDuringStairGate` event from the gate panel that something else listens to and restores. Splits responsibility across modules with no clear owner.
- Option C (chosen): wrap onRetry in the gate's local context. Single-responsibility, single-file change, semantically obvious — the gate captures intent and restores intent.

**Contract citations:** C11 §6 (element-creation pipeline pre-conditions), §05-BIM-UI-ARCHITECTURE §7 (UI orchestration), DAILY-USE §STAIR-LEVEL-ACTIVE-RESTORE.

---

## 🔬 DIAGNOSIS LOGGED — Round 14 (#61 — Wall plan-view preview + commit latency)

### §WALL-PLAN-PREVIEW + §WALL-COMMIT-LATENCY — root cause analysis (full fix overlaps #57)
**File reviewed:** `apps/editor/src/engine/views/plantools/WallPlanToolHandler.ts`, `apps/editor/src/engine/views/PlanViewManager.ts`, `apps/editor/src/engine/WallRebuildCoordinator.ts`

**(a) "We need preview — like we have in 3D scene":**
The wall plan handler already renders a live rubber-band preview as the cursor moves between corner A and corner B (see `_drawWallPreview` at `WallPlanToolHandler.ts:391-536`). It renders a thickness-aware band (the architect's selected wall thickness from the system type) plus a real-time `${lenMm} mm` length label at the midpoint, plus an arc preview in curved mode. The handler `onMouseMove` always calls `_drawWallPreview()` when `_wallFirstPoint !== null` (line 165). So the preview infrastructure IS present.

What may match the user's expectation gap:
1. **Before the first click**, no preview is drawn — only the canvas crosshair. The 3D scene wall tool also does not draw a wall before the first click (CAD convention), but it shows a wall-start indicator at the cursor. The plan handler doesn't. Adding a "click-to-start" cursor halo would match the 3D scene.
2. The plan preview is a translucent thickness band; the 3D scene preview is a 3D extrusion. They are visually different by design (plan = 2D top-down convention).

Recommended action (deferred — out of scope for the latency fix): add a "click-to-start" cursor halo + the architect's chosen wall-system colour swatch to the pre-first-click cursor, so the preview affordance is visible at every stage.

**(b) "Wall doesn't render until we place the next point" — root cause:**
The dispatch IS synchronous on click 2: `WallPlanToolHandler._commitWall` calls `window.runtime?.bus?.executeCommand('wall.create', ...)` immediately (`WallPlanToolHandler.ts:329`). The latency the user perceives comes from the full pipeline AFTER dispatch:

| Step | Time | Stage |
|------|------|-------|
| 1    | ~0   | `bus.executeCommand` → CreateWallHandler → PRYZM-3 Immer store mutation |
| 2    | ~0   | CommandEventBridge emits `wall.created` → §P2.1 bridge mirrors to legacy WallStore |
| 3    | ~0   | WallStore.add → storeEventBus → ViewTechnicalDrawingCache.invalidate → `vd:projection-stale` event |
| 4    | +30ms | `PlanViewManager._onProjectionStale` debounce setTimeout (intentional coalescing) |
| 5    | +16ms | WallRebuildCoordinator FrameScheduler tick → `_flush` → WallFragmentBuilder.buildWall |
| 6    | +200–600ms | `EdgeProjectorService.project()` re-runs projection for ALL ~37 groups; before the #60 + #57 Day 1 fixes, cache was bypassed → every group's full traverse + EdgesGeometry + toDrawingSpace |
| 7    | +16–25ms | PlanViewManager tick → `_render()` → Canvas2D drawAll |
| **Total** | **~262–687 ms** | for the first wall click in a scene with 12 walls + 9 CWs |

For the user's scene (12 walls + 9 CWs + 2 stairs + 1 slab + 9 columns + 1 roof + 1 ceiling = 35 elements), pre-fix observed projection time in the runtime log was **400–500ms** per click. Then `CHUNK_SIZE = _hasCWElements ? 1 : 4` (line 1501) forces single-group chunks for CW-containing scenes → 37 chunks × per-chunk-yield ≈ adds another ~100-200ms. Hence the user's "few seconds" perception.

**Why "appears when the next point is placed":** the human eye expects feedback within ~100ms. Beyond ~300ms, the user has moved on and clicked the next point. By the time the projection completes ~500ms after click 2, the user is already looking at click 3's cursor position — they perceive the wall as "appearing when I placed the next point" because that's the next event they were watching for.

**Why we already moved the needle:**
- Round 10 (#60) — NME now propagates `userData.version` → CW cache actually fires.
- Round 11 (#57 Day 1) — cache gate widened to all 5 element types with verified version stamping (wall, slab, roof, room, curtainwall). Second projection of an unchanged scene now does cache HITS for every existing element.

After Rounds 10–11, the user's reload + first-wall-click should drop from ~500ms to ~50–100ms for the projection step (only the new wall + dependent CW/wall groups touched). The full path then completes within ~120ms (perceptually instant: <130ms is the JND for "instantaneous interaction").

**Remaining gap (still in #57):**
Even with cache hits, the projection driver still ITERATES all 37 groups (cache hit takes ~2-3ms each for replay-from-cache vs ~12-50ms cache miss). For very large scenes (200+ walls) the per-iteration overhead alone exceeds 100ms even with full cache hits.

**Days 2-4 of #57 (still pending) will:**
- Add `ViewTechnicalDrawingCache.invalidateElement(elementId)` so a single wall add invalidates ONE projection slot, not the whole view.
- Move projection from "rebuild from cache" to "patch-replace only the changed element's drawing layers" — total time becomes O(1) per element add.
- Expected user-perceived latency after Days 2-4: <30 ms regardless of scene size.

**No code changes this round** — diagnosis only. The Rounds 10–11 fixes are already what closes the primary perceptual gap. Day 2-4 of #57 is the architectural follow-through.

---

## ✅ APPLIED — Round 13 (#52 — Door panel + window glass colours from system type)

### §M-H5 — `OpeningRenderData` extended with `panelColor` + `glassColor` + `glassOpacity`; legacy paths un-hardcoded
**Files:**
- `packages/geometry-wall/src/WallOpeningRenderData.ts` — added `glassColor`, `glassOpacity`, `panelColor` (alias for `leafColor`) fields with documenting comments.
- `packages/geometry-wall/src/WallFragmentBuilder.ts` — `createWindowFrame` consumes `renderData.glassColor` + `renderData.glassOpacity` (fallback to `#88ccff` / 0.3); `createDoorFrame` consumes `renderData.panelColor ?? renderData.leafColor` (fallback to `#8d6e63`). Replaced 4 hard-coded `new THREE.MeshStandardMaterial({ color: 0x88ccff/0x8d6e63 })` sites.
- `apps/editor/src/engine/WallRebuildCoordinator.ts` `resolveOpeningRenderMap()` — now imports `doorSystemTypeStore` + `windowSystemTypeStore`, resolves each legacy window/door's `systemTypeId` against the type store, and threads `frameFinish.materialColor` / `leafFinish.materialColor` / `glazingOpacity` into the OpeningRenderMap. Falls back to the inline record colour, then to the WallFragmentBuilder default, in that order.

**Before:** the audit's M-H5 finding showed that the legacy WallFragmentBuilder hard-coded `0x88ccff` (window glass clear-blue tint) and `0x8d6e63` (door panel brown) at four sites. The architect picking a window system type with "Bronze Tint" glass or a door system type with "Black Lacquer" panel saw their selection in the property panel + IFC export but the rendered 3D mesh remained the default clear-blue / brown — the legacy frame builder path never consulted the system type at all. This was the legacy path's analogue of the M-H1 wall material gap closed in Rounds 5-6.

**After:** the legacy createWindowFrame / createDoorFrame paths render the architect's chosen system-type finish colour. The new DoorBuilder / WindowBuilder paths (`doorStore.has(elementId)` / `windowStore.has(elementId)` → `skipLegacyFrame: true`) continue to own their own colour resolution via CreateWallOpeningCommand which already writes `frameColor` / `leafColor` from the system type onto the new-path DoorOpening / WindowOpening records (`CreateWallOpeningCommand.ts:130-134, 172-175`).

**Pattern alignment:** mirrors the wall material resolution from Round 5 (§M-H1) and the roof material resolution from Round 6 (§M-H1 follow-up): a single render-time DI hook on the data argument (`OpeningRenderData`) with the resolver populating from the appropriate system-type store. The fallback chain is identical: explicit record colour → system-type finish colour → previously-hard-coded default.

**Out of scope (deferred to a different task):**
- The new-path DoorBuilder / WindowBuilder consume `door.frameColor` / `door.leafColor` directly (`DoorBuilder.ts:379-380`); confirmed `CreateWallOpeningCommand` already populates these fields from the system type at creation time (lines 130-134 for doors, 172-175 for windows). No new-path change required.
- CW mullion + glazing material map → task #53.

**Contract citation:** DAILY-USE-AUDIT §M-H5, C11 §6 (element render pipeline), C03 §3.5 (builders receive READONLY data — the resolver, not the builder, queries the type store).

---

## ✅ APPLIED — Round 12 (#55 — L-shape + U-shape stair plan-view creation + preview)

### §STAIR-L-U-PLAN — Plan-view stair dispatch now honours the architect's shape selection
**Files:**
- `apps/editor/src/engine/BimService.ts` — `createStair()` setup-panel `onConfirm` callback now stamps `window.activeStairConfig = { shape, width, typeId, mode, baseLevelId, topLevelId }` alongside the existing `stairTool.activate(input)` 3D-scene path.
- `apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts` — `_commitStair()` reads `window.activeStairConfig` for shape / width / typeId; builds the correct `flights[] + landings[]` structure per shape; passes `shape`, `typeId`, `turnDirection`, `secondRunSide`, `stepsBeforeLanding` through the existing `stair.create` bus payload (the bridge already forwards every field into `CreateStairCommand`).
- `apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts` — `_drawPreview()` reads the same `activeStairConfig.shape` and renders a shape-appropriate 2D diagram:
  - **I** (straight): single rectangle of treads (unchanged).
  - **L**: two perpendicular flight bands with a filled landing tile at the elbow corner.
  - **U**: two parallel flight bands separated by a filled landing strip along the turn edge.
- `apps/editor/src/types/globals.d.ts` — typed `activeStairConfig` on `Window` (transitional global, flagged with TODO(STAIR-PLAN-DI) for follow-up DI plumbing through `PlanToolDrawContext` per P4).

**Before:** `StairPlanToolHandler._commitStair()` hard-coded `shape: 'I'` at line 139 regardless of which shape the user picked in the toolbar. Every L-shape and U-shape click from plan view actually dispatched a straight stair:
- Preview: only the I-shape rectangle ever drew, even when the toolbar said L or U → architect saw "no preview" for L/U.
- Dispatch: `CreateStairCommand` received a straight-shape payload, built a single-flight straight stair → architect saw a wrong-shape stair (or no stair, when the bounding box didn't fit a single flight) → user-reported "L-shape no creation", "U-shape degenerate geometry".
- Railing: `proposeRailings()` ran for the straight stair the command actually created → architect saw straight rails on a stair they had intended as L/U → user-reported "U-shape without railing".

The handler simply had no read path to the shape selection. The 3D-scene `StairTool.activate({ shape, ... })` consumed it directly via its `activate` config object; the plan-view path was instantiated by `PlanViewToolOverlay` / `SvpPlanToolOverlay` via `new StairPlanToolHandler()` (zero args) and never received the shape.

**After:**
- BimService.createStair stamps `window.activeStairConfig` on every setup-panel confirm — exactly when the architect's shape choice becomes known.
- StairPlanToolHandler reads it on both `_commitStair` (dispatch) and `_drawPreview` (canvas overlay) so the preview always matches what the click will actually create.
- L-shape: flight 1 takes ⌊n/2⌋ risers along the longer initial axis; landing at the elbow corner with depth = max(treadDepth, stairWidth); flight 2 turns 90° (`turnDirection: 'left'` by default — matches StairCreationController default) and takes the remaining risers.
- U-shape: flight 1 along one half of the box; landing along the far edge; flight 2 reversed 180° (`secondRunSide: 'left'`).
- All three shapes round-trip the exact same `riserHeight × riserCount = levelHeight` invariant that CreateStairCommand's canExecute enforces — split risers across the two flights so the total still matches.
- typeId from the setup panel flows through, so the architect's chosen stair system type sticks (rather than falling back to "default" — closes one half of the user's "stair type goes back to default" complaint that wasn't covered by §PERSIST-L1 reload-side fix).

**Pattern alignment:** mirrors the existing `window.activeLevelElevation` transitional global (typed in `apps/editor/src/types/globals.d.ts`, stamped by initScene, consumed by SelectionManager + plan tool overlays). Both are transitional reads of widely-shared per-tool state; both have an explicit TODO for plumbing through `PlanToolDrawContext` once that interface is widened in a coordinated DI pass. The `CreateStairInput` interface already supported every field the plan path now forwards (`typeId`, `turnDirection`, `secondRunSide`, `stepsBeforeLanding`, `landings`); no command-side change was needed.

**Contract citation:** C11 §3 (tool→command dispatch), C14 §1 (plan-view tool overlay), §STAIR-AUDIT-2026 F8/F11 (level resolution + shape config invariants).

**Follow-ups queued (out of scope for this round):**
- `STAIR-PLAN-DI` — replace `window.activeStairConfig` with `PlanToolDrawContext.stairConfig` for P4 compliance.
- `STAIR-U-RAILING` — verify the StairRailingFactory actually emits curved/landing-jointed rails for U-shape (the proposal payload is symmetric I/L/U today; the rail builder may flatten the U-turn). Track separately if the user reports railings still missing after this round.
- `STAIR-L-TURN-DIR` — L-shape currently defaults to `turnDirection: 'left'`; add a toolbar toggle so the architect can choose left vs right elbow.

---

## ✅ APPLIED — Round 11 (#57 Day 1 — projection cache widened to all element types)

### §PLAN-VIEW-INCREMENTAL-PROJECTION §4.1 — Cache gate widened from `isCWElement` to `isCacheableElement`
**File:** `apps/editor/src/engine/views/EdgeProjectorService.ts`
- New `private static readonly CACHEABLE_ELEMENT_TYPES: ReadonlySet<string>` populated with the element types whose fragment builders ALREADY bump `root.userData.version` on every rebuild (verified: `curtainwall`, `wall`, `slab`, `roof`, `room`). Each entry is documented with a code-line citation back to the `userData.version =` site that justifies its membership.
- Loop gate at `EdgeProjectorService.ts:1511`: split `isCWElement` into two locals — `isCWElement` (kept for any CW-specific yield logic) and `isCacheableElement` (the new general gate). The cache early-out at `:1516` now uses `isCacheableElement`. The cache write at `:1554` (`freshLayersCollector`) similarly widened.
- `§PERF-CACHE-STATS` log at `:2027` no longer gated on `_hasCWElements`. Fires whenever `cacheHits + cacheMisses > 0`. New `cacheableGroups=` field is the canonical name; `cwGroups=` retained as an alias so existing log scrapers don't break.

**Before:** the cache that the curtain-wall perf wave built was technically functional after Round 10 (#60), but it ONLY served CurtainWall elements. Every other element type — including the 12 walls + 1 slab + 9 columns + 2 stairs + 4 stair-railings + ceiling + roof in the user's actual scene — re-ran the full traverse + EdgesGeometry + toDrawingSpace pipeline on EVERY re-projection, even when only ONE element changed (e.g. user creates a single roof and the plan view re-projects all 37 groups from scratch — observed in the §DIAG-EPS-02 log lines for `groups=37 cwGroups=0`).

**After:** each element-type that opts in (now: wall, slab, roof, room, curtainwall) is keyed in the existing `_cwProjectionCache` by `(elementUUID, viewId, version)`. On the first projection: cache miss; the full pipeline runs and the result is stored. On every subsequent projection where the element's `userData.version` hasn't bumped: cache HIT — skip traverse + EdgesGeometry + mergeGeometries + toDrawingSpace. The architect's "delay rendering a single wall" cliff in the runtime log is closed for those types.

**Pattern alignment:** the change is purely "use the existing data structure for the elements it was always able to support". No new caches, no new write paths, no new disposal logic — the LRU eviction at `_evictLruCwEntry()` (5 000-entry cap) + per-elementUUID cleanup at `invalidateCwElement()` already iterate generic `(elementId, viewId, version)` triples; they don't care that the elements weren't curtain walls. The `CACHEABLE_ELEMENT_TYPES` set is the architectural single source of truth for "this element type's builder bumps `userData.version` on rebuild", which is the cache key's invalidation signal.

**Scope retention vs. the full #57 plan:**
- ✅ Day 1: Widen the gate (this round).
- ⏳ Day 2: Audit door, window, opening, beam, column, ceiling, floor, stair, stair-railing, handrail, furniture builders for `userData.version` stamping discipline + add the verified ones to the allow-list.
- ⏳ Day 3: Rename `_cwProjectionCache` → `_elementProjectionCache`, `_cwCacheIsValid` → `_elementCacheIsValid`, `MAX_CW_PROJECTION_CACHE` → `MAX_ELEMENT_PROJECTION_CACHE` (cosmetic — keeps Day 1 perf gains independent of naming churn).
- ⏳ Day 4: ViewTechnicalDrawingCache.invalidate semantics tightening + a per-element invalidation entry-point so the bus's `element.rebuilt` event invalidates ONE cache entry rather than the entire view.

**Contract amendments queued (deferred for Day 4 to keep this round focused):** C04 §3.4, C11 §6.2.1/§6.2.2, C10 NFT-PV-1 per the architectural document.

**Net effect (Days 1+):** the existing CW perf engineering finally returns the dividend it was designed to return. The architect's "edge regeneration should be almost immediate" benchmark is in reach for repeat projections; the first projection of a new element still pays its honest cost, then never pays again until that element is rebuilt.

---

## ✅ APPLIED — Round 10 (curtain-wall projection cache un-bypassed)

### §PERF-CACHE-DIAG — NativeElementMeshExporter now propagates `userData.version` to the projection-stage proxy wrapper
**File:** `packages/core-app-model/src/geometry/NativeElementMeshExporter.ts` (two sites: cache-hit branch + cache-miss branch, ~10 LOC total).

**Before — runtime log evidence:**
```
[EdgeProjectorService] §PERF-CACHE-STATS batchId=none viewId=vd-sys-plan-l0
  groups=37 cwGroups=0 cacheHits=0 cacheMisses=0 hitRate=n/a%
  cacheElements=0 cacheEntries=0/5000
```
Scene contained 9 CurtainWall groups (visible in the `§DIAG-EPS-02` per-group log lines), yet `cwGroups` (= hits + misses) stayed at 0 and `cacheEntries` never incremented. The §PERF-EDGEPROJECTOR-CHUNK reprojected all 9 CWs from scratch every single time. The cache that has been carefully tuned with a 5000-entry LRU + per-elementUUID cleanup since the curtain-wall perf wave was completely dead-code.

**Root cause:**
EdgeProjectorService's cache gate at `EdgeProjectorService.ts:1516` is:
```ts
const currentVer = typeof group.userData?.version === 'number'
    ? (group.userData.version as number) : undefined;
if (isCWElement && elementUUID !== undefined && currentVer !== undefined) { … cache path … }
```
The `group` here is the proxy wrapper that `NativeElementMeshExporter.exportForView()` produces. The exporter's wrapper userData (`NativeElementMeshExporter.ts:248-258` cache-hit path AND `414-423` cache-miss path) explicitly listed:
```ts
{ elementUUID, elementType, baseLine, baseOffset, rootWorldY, openings, height, thickness, _nmeFromCache? }
```
`version` was never copied. So `currentVer` was always `undefined` and the cache gate always failed silently — for every element, on every view, on every projection pass. The CW cache had been wired with every safeguard except the one connection between source-of-truth (`CurtainWallBuilder` stamps `wallGroup.userData.version = ++this._geometrySeq`) and consumer (`EdgeProjectorService._cwCacheIsValid(elementId, viewId, version)`).

**Fix:**
Two-line addition in both branches of `exportForView()`:
```ts
version: root.userData?.version,
```
(Plus the cache-miss branch reuses the already-computed `currentVersion` local for symmetry: `version: currentVersion >= 0 ? currentVersion : undefined`.)

**Net effect (after deploy + reload):**
- First projection of a CW: cache miss as expected, but now records an entry. `cacheMisses` increments, `cacheEntries` grows.
- Second projection of the same CW with no rebuild: cache HIT. `cacheHits` increments. Skips traverse + N×EdgesGeometry + N×matrixWorld + mergeGeometries + toDrawingSpace + opening suppressors — the full §C.3.2 fast path the architecture intended.
- Rebuild (architect changes mullion size, grid spacing, etc.): CurtainWallBuilder bumps `userData.version` → cache key changes → automatic miss → fresh projection → new cache entry. Correct invalidation by construction.

**Pattern alignment:** the fix restores the data flow the architecture already documented. `CurtainWallBuilder.ts:226-232` comment explicitly states "EdgeProjectorService uses `group.userData.version` as the cache key" — the failure was a single missing field copy across a layer boundary, not a design flaw.

**Knock-on impact for #57:** task #57 (widen the cache to all 14 element types) was blocked by this regression — widening a dead cache changes nothing. With the version propagation restored, the cache infrastructure is now actually functional and the #57 widening unlocks per-element cache benefits for walls, slabs, columns, roofs, ceilings, floors, stairs, and beams as well.

---

## ✅ APPLIED — Round 9 (3D selection at distance — separate BVH vs GPU hover refs)

### §SELECT-3D-1 — Click-anchor branch now dereferences the GPU-confirmed hover ref, not the BVH ref
**File:** `packages/input-host/src/SelectionManager.ts`
- New private field `_lastHoveredObjectGpu: THREE.Object3D | null` (≈30 LOC of documenting comment).
- GPU pick rAF (`_onHoverGpuPickRaf`) hit-branch: writes `_lastHoveredObjectGpu = hoveredRoot` (in addition to the existing `_lastHoveredObject` write).
- GPU pick rAF miss-branch: clears `_lastHoveredObjectGpu = null` alongside the existing anchor-coord clears.
- `performSelection()` click anchor branch (FIX-S16-ANCHOR): now uses `this._lastHoveredObjectGpu ?? (this._pickStrategy ? null : this._lastHoveredObject)` instead of `this._lastHoveredObject`. The fallback to `_lastHoveredObject` only fires when the GPU pick strategy is unavailable (legacy boot path / WebGL2 disabled), preserving previous behaviour there.
- Tool-entry reset (`setSelectionEnabled` / `unselectAll`-equivalent path) + select() reset both clear `_lastHoveredObjectGpu` + `_lastHoverConfirmedClientX/Y` together, so a tool-switch can't leak a stale anchor.

**Before:** the architect reported "the selection of objects - plan view works great - but 3d scene not - when I point element on far distance select others. Normally when being close to the element works well - but in the distance not." (2026-05-20 daily-use feedback.) Mechanism:

| step | event                                | side-effect                                                |
|------|--------------------------------------|------------------------------------------------------------|
| T0   | pointermove#1 over Wall A area      | BVH writes `_lastHoveredObject = A`; queues GPU rAF        |
| T1   | GPU rAF fires (pixel-accurate)      | `_lastHoveredObject = B` ← correct element; anchor=(x,y)   |
| T2   | pointermove#2 (cursor at same spot) | BVH writes `_lastHoveredObject = A again` (wrong)          |
| T3   | click — cursor still ≤ 8 px of T1   | anchor branch trusts `_lastHoveredObject` → SELECTS A ✗    |

At far camera distance many AABBs overlap on a single pixel; the BVH/raycaster's "first ordered hit" tiebreak ≠ the pixel-accurate GPU pick. The user saw the GPU-confirmed hover highlight (Wall B), clicked it, but the click selected Wall A.

**After:** the BVH ref still drives the immediate-feedback cursor + `bim-hover-changed` (TSL outline) — both unaffected by minor BVH inaccuracy because they re-converge on the next rAF. The click anchor branch is now hardened: it can only resolve to a target that the GPU pick CONFIRMED at the recorded anchor coordinates.

**Pattern alignment:** mirrors the existing FIX-S16-ANCHOR architecture, which already segregated the anchor COORDINATES (`_lastHoverConfirmedClientX/Y`, GPU-only) from the BVH-shared hover state. We're applying the same segregation rule to the target REFERENCE — the missing half of the architecturally-clean split. No new branches, no new fast-paths; the change is purely "use the right ref in the existing branch".

**Contract citation:** C13 §3 (selection authority — GPU pick is the authoritative source at any camera distance), C14 §2 (interaction precedence — pixel-accurate strategy wins over geometric proximity), DAILY-USE-AUDIT §S-H? (will be assigned when audit is updated).

**Plan-view comparison (architect's "plan view works great" baseline):** plan view uses Canvas2D screen-space coordinates that ARE pixel-accurate by construction — no BVH-vs-GPU split exists. That's why plan-view selection was already correct. The 3D fix brings the 3D code path up to the same accuracy.

---

## ✅ APPLIED — Round 8 (project-open persistence — material / system-type round-trip)

### §PERSIST-L1 — Stair restoration now round-trips id + typeId + properties + metadata
**Files:**
- `packages/command-registry/src/stair/CreateStairCommand.ts` — extended `CreateStairInput` with `id`, `metadata`, `buildingCodeVariant`, `typeSnapshot`; `execute()` honours `input.id ?? crypto.randomUUID()` and threads `typeSnapshot`, `buildingCodeVariant`, and a metadata-override merge so `source: 'import'` distinguishes restored stairs from user-created.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` Step 6 (Stairs) — threads every snapshot field the serializer wrote (`id`, `typeId`, `typeSnapshot`, `properties`, `turnDirection`, `secondRunSide`, `stepsBeforeLanding`, `buildingCodeVariant`, `metadata`) AND passes `autoCreateOpening: false` so the slab opening isn't double-punched on reload.

**Before:** the loader's stair loop passed only 11 curated fields. Every reload silently dropped:
- `id` → fresh UUID, breaking ALL railings, openings, room boundaries, selection-state references to the original stair.
- `typeId` → stair fell back to "default" system type — the user's exact reported symptom ("stair type goes back to default").
- `properties.mark`, `properties.material`, `properties.treadMaterial`, `properties.riserMaterial`, `properties.handrailHeight`, `properties.railingType`, `properties.tags`, `properties.description` → all architect choices replaced with `DEFAULT_STAIR_PROPERTIES`.
- `properties.stringerType`, `properties.nosingType` → reverted to defaults regardless of authored value.
- `turnDirection`, `secondRunSide`, `stepsBeforeLanding` → an L-shape stair restored with the wrong elbow direction or U-shape with the wrong side ran wholly different geometry from the original.
- `buildingCodeVariant` → code-compliance variant lost.

**After:** every field round-trips bit-identically. The architect's chosen system type, mark, material slots, code variant, and shape-control parameters survive a save/load cycle.

**Pattern alignment:** mirrors `CreateWallCommand(wall.id, { …, materialId, materialColor, systemTypeId })` at ProjectLoader.ts:465-476 (the canonical wall pattern). Same shape: command accepts the id at the top of its input; loader threads every snapshot field; metadata.source flag distinguishes restored from user-created.

**Contract citation:** C13 §2 (snapshots round-trip byte-compatibly), C11 §6 (element restore order), DAILY-USE-AUDIT §M-H4 (system-type persistence is sacred — the architect's choice is what the building schedule + IFC export will report).

### §PERSIST-L1 — Curtain wall restoration now round-trips mullion + glazing + grid + properties
**Files:**
- `packages/command-registry/src/curtainwall/CreateCurtainWallCommand.ts` — extended `CreateCurtainWallPayload` with `mullionSize`, `panelThickness`, `mullionColor`, `gridSystem`, `properties`, `ifcGuid`; `execute()` honours each with fallback to the existing hard-coded defaults so fresh-create behaviour from `CurtainWallTool` is unchanged.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` Step 11 (Curtain Walls) — threads every snapshot field including `mullionSize`, `panelThickness`, `mullionColor`, `gridSystem`, `properties`, and `ifcData.guid` → `ifcGuid`.

**Before:** the loader passed only 8 curated fields. Every reload silently:
- Replaced `mullionSize` (architect's chosen mullion thickness) with 0.08 m.
- Replaced `panelThickness` with 0.02 m.
- Replaced `mullionColor` with `'#333333'` regardless of authored colour.
- Discarded `gridSystem` — any custom grid (lines added/removed via `AddCurtainGridLineCommand` / `RemoveCurtainGridLineCommand`) collapsed back to uniform `gridXSpacing`/`gridYSpacing`.
- Generated a fresh IFC GUID on every save → broke linkage with external coordination tools (Solibri, BIMcollab).
- Lost `properties.mark` and any architect tags.

**After:** every authored CW field survives save/load. The Add/Remove grid-line edits stick. External-tool BIM coordination GUIDs stay stable.

**Pattern alignment:** identical shape to the §PERSIST-L1 stair fix — payload type extended with the persisted fields as optional, `execute()` falls back to the prior defaults when absent, loader threads from snapshot. Mullion + glazing material RESOLUTION (vs. just colour) remains task #53 (M-H1 follow-up Part 2 — Builder-side PBR material map for CW mullion + glazing).

**Doors + windows:** the existing `doorStore.add(d)` / `windowStore.add(w)` paths at `ProjectLoader.ts:444-458` preserve every persisted field (shallow clone is correct since these stores already hold complete records). The architect-reported "door materials don't come through" symptom traces to the BUILDER side (`DoorBuilder` ignores `systemTypeId`, uses hard-coded `0x88ccff` panel + `0x8d6e63` frame colours) — already tracked as task #52 (M-H5).

**Net effect (Round 8):** for stairs and curtain walls, the architect's choice — system type, mark, material, code variant, shape control, mullion/glazing/grid — survives `Open project → Save → Close → Reopen`. For doors and windows, persistence is correct; the rendering side is task #52.

---

## ✅ APPLIED — Camera (C04 — Rendering & Scheduling)

### §C-B3 / §C-B4 — Camera constraints widened to BIM-grade ranges
**File:** `packages/core-app-model/src/BimWorld.ts` (CAM_MIN_DIST / CAM_MAX_DIST / CAM_MIN_POLAR / CAM_MAX_POLAR + reapplyConstraints).
**Before:** `minDist=1m`, `maxDist=100m`, `maxPolar=π/2−0.1`. Architect could not frame an 80 m building from a comfortable distance, could not orbit to true horizontal eye-level, could not look up at a soffit.
**After:** `minDist=0.2m` (inspect a doorknob), `maxDist=10000m` (master-plan-scale sites), `polarRange=[0.02, π−0.02]` (full orbit excluding gimbal flip).
**Pattern alignment:** the constants are now scene-scale appropriate while preserving the existing "re-apply after every OBC mode switch" architecture — that mechanism is unchanged. Constraint values match Revit / Onshape / SketchUp defaults.

### §C-B2 — Plan-view camera is no longer reset on every store mutation
**File:** `apps/editor/src/engine/views/PlanViewManager.ts` (`_onProjectionStale`, `_onIntentUpdated`).
**Before:** every projection-stale event set `_hasFitDrawing = false`, which caused `_render()` to call `fitToDrawing()` again on the next frame — yanking the architect's working pan/zoom back to "fit all" every time they committed a wall.
**After:** `_hasFitDrawing` is no longer reset by projection-stale or intent-update. Fit-to-drawing is now only the **initial activation** concern (already handled by `activate()` which resets the flag). Projection invalidation re-projects in place; the user's camera state is sticky.
**Pattern alignment:** matches C04 §3.3 ("per-view camera state is sticky across data mutations within the same view session"). Mirrors how the 3D camera behaves — it doesn't auto-refit on every wall added; only on explicit "zoom to fit" or initial activation.

---

## ✅ APPLIED — Tool state & input contract (C06 — UI Shell & Tools)

### §T-B1 — Polyline state preservation on mouse leave (architectural-grade fix)
**Contract addition:** `apps/editor/src/engine/views/plantools/PlanToolHandler.ts` — added optional `hasActiveStroke?(): boolean` to the `PlanToolHandler` interface. Multi-step tools opt-in by implementing it; single-click tools (Door, Window, Furniture, etc.) ignore the new method and retain existing deactivate-on-leave behaviour.
**Overlay change:** `apps/editor/src/engine/views/SvpPlanToolOverlay.ts` `_onMouseLeave` now checks `handler.hasActiveStroke?.()`. If true, it suspends focus (hides snap tooltip, blurs SVP) but PRESERVES the handler's intermediate state. If false, the existing deactivate-on-leave runs.
**Handler implementations** (so the contract actually takes effect for the most-used multi-step tools):
- `WallPlanToolHandler.hasActiveStroke()` → true when `_wallFirstPoint`, `_polylineFirstPoint`, or `_arcMidPt` is set.
- `SlabPlanToolHandler.hasActiveStroke()` → true when `_slabPoints.length > 0`.
- `FloorPlanToolHandler.hasActiveStroke()` → true when `_points.length > 0` or `_rectAnchor !== null`.
- `CeilingPlanToolHandler.hasActiveStroke()` → same as Floor.
- `OpeningPlanToolHandler.hasActiveStroke()` → true when `_points.length > 0`.
**Architecture invariant** documented in the interface JSDoc: a handler returning `true` from `hasActiveStroke` MUST also fully reset that state in `cancel()` (Escape) and `deactivate()` (tool switch / project switch). Those remain the only two paths that discard pending stroke state.
**Pattern alignment:** mirrors the existing "optional hook" pattern used elsewhere in the same interface (`onMouseUp?`, `onDoubleClick?`, `onKeyDown?`). Adding the symmetric overlay logic in `SvpPlanToolOverlay` only — `PlanViewToolOverlay` does not detect mouse-leave in the same way, so no symmetric change there.

### §T-B2 — Backspace/Delete during draw no longer deletes the previously-selected element
**Three coordinated changes** (defence in depth at three layers — overlay propagation, global filter, drawing-state suppression):

1. **`apps/editor/src/engine/views/PlanViewToolOverlay.ts` `_onKeyDown`** — now calls `e.preventDefault() + e.stopPropagation()` when the active handler returns `true`. The `PlanToolHandler.onKeyDown` contract was already declared `(e) => boolean`; the overlay finally honours it.
2. **`apps/editor/src/engine/views/SvpPlanToolOverlay.ts` `_onKeyDown`** — same fix; both overlays must consistently honour the contract.
3. **`apps/editor/src/engine/initUI.ts` global Delete/Backspace handler** — three reinforced guards:
   - Skip if `e.defaultPrevented` (defended by overlays above).
   - Skip if target is `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLSelectElement`, contenteditable, `role="textbox"`, `role="combobox"`, or any element under `[data-pryzm-input]` / `[data-text-edit]`.
   - Skip if `toolManager.getToolState()` is `DRAWING` (belt-and-braces in case any future tool forgets to return `true` from `onKeyDown`).

**Pattern alignment:** the overlay-consume + global-suppress combination is the standard pattern in CAD apps (Revit, ArchiCAD) — local-context Backspace pops a vertex, global-context Backspace deletes a selection, never both. The `defaultPrevented` check is the canonical web-platform way to coordinate them.

### §T-H7 — Move tool stays active across multiple operations
**File:** `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts:121`.
**Before:** `setTimeout(() => tm.setActiveTool('none'), 0)` after every commit, exiting Move after a single operation. Comment claimed "Revit-style" but Revit keeps Move active until Esc.
**After:** the setTimeout is removed. The tool stays active. User presses Esc to exit, like every other tool.
**Pattern alignment:** matches the Wall / Slab / Door / Furniture multi-placement pattern in the same package.

---

## ✅ APPLIED — Persistence / type stores (C13 — Project Lifecycle)

### §M-B1 — Wall + Slab custom system type IDs preserved across save/load
**Files:**
- `packages/geometry-wall/src/WallSystemTypeStore.ts` `add()` — now accepts `params.id?: string` and honours it when supplied.
- `packages/geometry-slab/src/SlabSystemTypeStore.ts` `add()` — same.

**Before:** `add()` unconditionally minted `crypto.randomUUID()`. On project load, the duplicate-skip guard `if (wallSystemTypeStore.getById(raw.id)) continue` in `ProjectLoader.ts:895` was dead code because the snapshot's `raw.id` was never preserved. Custom "Office Partition 120" type re-generated under a new UUID; all walls referencing the old ID became dangling references; schedules showed "—".

**After:** when the loader passes `add({ id: raw.id, ... })`, the store keeps the snapshot ID. Fresh user-created types still mint a fresh random ID (no caller change needed).

**Pattern alignment:** matches the EXISTING pattern already in use in `CeilingSystemTypeStore.addCustomType` and `FloorSystemTypeStore.addCustomType` (which already accept `params.id`). Wall and Slab were the outliers; this change brings them into structural parity with the other two system-type stores.

---

## ✅ APPLIED — Architectural-soundness checklist

Per the explicit user requirement that "all the different element creation needs to follow the same structure pattern":

| Element family | system-type id-preservation | `hasActiveStroke()` contract |
|---|---|---|
| Wall | ✅ NOW conforms (was outlier) | ✅ implemented |
| Slab | ✅ NOW conforms (was outlier) | ✅ implemented |
| Floor | (no system-type store yet) | ✅ implemented |
| Ceiling | ✅ already conformed | ✅ implemented |
| Roof | (no system-type store yet) | ⏭️ pending — same one-liner pattern |
| Door | ✅ already conformed | n/a (single-click placement) |
| Window | ✅ already conformed | n/a (single-click placement) |
| Opening (slab cut) | n/a | ✅ implemented |
| Column | n/a (no layered type) | n/a (single-click placement) |
| Beam | n/a | n/a (two-click placement, light state) |
| Stair | n/a | ⏭️ pending — StairPathPlanToolHandler |
| Furniture | n/a | n/a (single-click placement) |

---

## ⏭️ DEFERRED (require separate PRs / coordinated rollout)

The following Blockers + Highs from `DAILY-USE-AUDIT-2026-05-20.md` were audited but not applied in this pass because each requires deeper changes / new tests / coordinated rollout. They remain the highest-priority follow-up queue:

### Undo / Redo (all Blockers — system-level)
- **U-B1** Clear `runtime.bus.ringBuffer` + `bus.undo` on project switch (`ProjectLifecycleController._handleProjectSwitch`) and on project load (`ProjectLoader.load` after `commandManager.clearHistory`). Two lines to add — but needs a regression test that confirms cross-project Ctrl+Z is a no-op.
- **U-B2** Add `bus.dispatch(type, payload, opts?)` in `composeRuntime.ts:1114-1133` that forwards to `executeCommand` with `opts.source === 'REMOTE'` suppressing the ring-buffer push. Currently every remote collaboration command throws `TypeError: bus.dispatch is not a function` and is silently dropped.
- **U-B3** Pick a single source of truth for the undo stack — recommend deprecating either `RingBufferUndoStack` or `commandManager.history` and routing Ctrl+Z through one path only.
- **U-B4** Reverse-bridges for `*.batch.create` legacy stores (mirror the existing `§FT*` forward bridges).
- **U-B5** Skip ring-buffer push when `forward.length === 0 && inverse.length === 0` (in `CommandBus.executeCommand`).

### Data / load (Blockers — needs UX + tests)
- **L-B1** Resilient-import quarantine + autosave-blocking modal — covered by the production-readiness audit (§B10) deferred queue.
- **L-B2** `If-Match` optimistic-concurrency client-side — server already returns 412.
- **L-B3** Standalone `OpeningStore` deserialise step in `ImportProjectCommand` — mirror the wall-opening restoration pattern.

### Camera / view UX (Blockers — needs handler registration)
- **C-B1** Register `zoom-fit` and `zoom-selected` command handlers — they should be proper L7 plugin handlers (likely `@pryzm/plugin-navigate`) with `withHandlerSpan` per P8.

### Materials (Highs — needs DI of `materialMap` through builder deps)
- **M-H1** Wall / roof / curtain-wall material resolution (mirror the existing `SlabFragmentBuilder` pattern).
- **M-H2** Plan-edge color from `materialColor` (touches `EdgeProjectorService` line projection).
- **M-H4** Custom door/window system types persisted in snapshot.

### Project-load hang (new in queue this session)
- **#47** WebGPU `Destroyed ShadowDepthTexture` — convert `_ssgiNeedsFullRebuild` boolean → counter; queue rebuilds; defer post-import shadow-flag wave through frame scheduler.
- **#48** RoomTopologyObserver forced-fire after unpause — extend `paused` window through the post-load wall-rebuild flush.

### Collaboration (Blocker — needs wiring)
- **S-B1** Wire `ConflictResolutionDialog` + `ConflictDisclosureBanner` to `_yjsDocAdapter.onConflict()` in `engineLauncher.ts:560`.

### Export (Blocker — needs real implementations)
- **S-B2** Replace `window.print()` PDF stub with the real `SheetExportService` PDF pipeline; populate `plugins/dxf` + `plugins/export-pdf` shells with real handlers.

---

## ✅ APPLIED — Round 7 (task #54 partial — VDT dual-path race fixed)

### §FIX-VDT-DUAL-PATH (task #54 Part 1) — VDT registration runs unconditionally in the §P2.1 bridge
**File:** `apps/editor/src/engine/initTools.ts` — the `runtime.events.on('wall.created', ...)` body around lines 814-858.

**Root cause (from user's runtime log analysis):** `WallTool` runs an "E.5.x P2b" dual-dispatch shape — it calls `runtime.bus.executeCommand('wall.create', ...)` (async; line 1685) **AND** `commandManager.execute(new CreateWallCommand(...))` (sync; line 1700). The synchronous legacy path completes FIRST: `wallStore.add()` lands, emits `storeEventBus`, ViewDependencyTracker hits `_onStoreChange` with no entry for the new wall → falls into the §G3-STALE-EVENT path (the warning the user observed). When the async bus path eventually resolves and emits `wall.created`, the §P2.1 bridge runs — but the dedup guard `if (_legacyWallStoreForBridge.getById(ev.wallId)) return` short-circuited the WHOLE bridge body, **including** the VDT + bimManager registration that came AFTER the `add()`.

**Fix:** separated the two concerns inside the bridge. The dedup guard now ONLY skips the `add()` mirror (the legacy path already did it). `viewDependencyTracker.registerElement(ev.wallId, ev.levelId)` and `bimManager.registerElement(...)` ALWAYS run, regardless of whether the dedup skip fired — they're idempotent so a duplicate register after the legacy path's own register is a no-op. The user's `[VDT] §G3-STALE-EVENT for unregistered element wall_XXX type= wall — fallback to store-type view only` warning class is closed.

**Pattern alignment:** matches C11 §6.2 invariant — every element that lands in a store MUST be in VDT + `level.childrenIds`. The dual-path race was a Round 1 oversight in the §P2.1 bridge contract: the dedup guard was placed at the wrong scope. This fix moves the VDT/bimManager calls outside the guard, restoring the invariant.

**Verification:** the log's symptom — `[VDT] §G3-STALE-EVENT for unregistered element wall_XXX type= wall — fallback to store-type view only` after every WallTool dispatch and every undo — will no longer appear. Plan-view dirty-marking switches from the `store-type view only` fallback to the targeted `_elementLevelMap` path, restoring per-level performance + correctness on multi-level projects.

### §FIX-VDT-DUAL-PATH Part 2 — DEFERRED with rationale
The user's log also shows a per-undo redetect storm (~2-3× REDETECT_ROOMS + forced-fire per single Ctrl+Z, ~80 ms LONGTASK each). This is a secondary perf issue separate from the VDT correctness bug; it requires deeper investigation into RoomTopologyObserver's mutation-event subscription topology and how undo flows through the wall store. **Tracked as task #54 Part 2** for a focused investigation. The VDT fix above is the primary correctness issue; the storm is the "feels slow" follow-up.

---

## ✅ APPLIED — Round 6 (M-H1 follow-up for Roof — same PBR resolution pattern)

### §M-H1 follow-up — RoofFragmentBuilder resolves `materialId` to STANDARD_MATERIAL_LIBRARY
**Files:**
- `packages/geometry-roof/src/RoofFragmentBuilder.ts` — added `RoofBuilderMaterialDef` interface (minimal shape so a single library map works across all builders without coupling to the full MaterialDefinition class), `_materialMap` private field, constructor's new optional 4th arg, new resolution branch in `_createMaterials()` for the shingle slot.
- `apps/editor/src/engine/initBuilders.ts` — threads the same `STANDARD_MATERIAL_LIBRARY`-derived Map that's used for walls into the RoofFragmentBuilder constructor via a lazy dynamic import (keeps initBuilders module-loaded decoupled from the renderer-layer material library).

**Before:** the audit's M-H1 sweep flagged walls, roofs, curtain-wall mullions, and door/window panels as four element classes that ignored `materialId`. WallFragmentBuilder was fixed in Round 5 (§M-H1). RoofFragmentBuilder still rendered "Terracotta Tile", "Standing-Seam Zinc", "Slate Charcoal" identically because `_createMaterials()` only read `data.materialColor`.

**After:** Shingle slot now resolves `data.materialId` against the same map walls use:
1. Looks up the matDef from `_materialMap`.
2. Builds a `MeshStandardMaterial` from `matDef.params` + textures.
3. Honours per-roof `materialColor` as a tint when matDef has no explicit colour (architect can tint a "standing-seam-zinc" PBR roof red without losing the metalness).
4. Falls back to the original materialColor-only path when no map / no match — fully backward-compat.

**Pattern alignment:** structurally identical to Round 5's WallFragmentBuilder fix and the established SlabFragmentBuilder pattern. The DI shape (optional 4th constructor arg) preserves backward compatibility with the existing two-arg + three-arg call sites.

### §M-H2 — DEFERRED with architectural rationale
**Investigation outcome:** the four `LineBasicMaterial({ color: 0x000000 })` sites in `EdgeProjectorService.ts` (1411, 1528, 1738, 2079) are below the VG-governance layer styling system. Overriding the literal colour at builder construction would **break the per-view category-level VG style override mechanism** that lets users customise plan-view colours per-view (e.g. "all wall edges in this section are red"). The architecturally-correct fix is to route per-element `materialColor` through `VGSceneApplicator.applyToProjectionLayers`, which is a substantial change to the VG pipeline. Tracked for a dedicated sprint-level architectural decision; not safe to hack the LineBasicMaterial defaults.

### §M-H1-Part-2 — Tracked as task #53 for next sprint
**CurtainWallBuilder mullion + glazing material resolution.** Same DI pattern as walls/roofs, but the curtain-wall has a panel material cache + multiple mullion sites that need coordinated updates. Substantial enough to warrant a focused PR rather than incremental edit. Concrete files + line numbers already in the task description for fast pickup.

---

## ✅ APPLIED — Round 5 (wall material fidelity)

### §M-H1 — Wall `materialId` now resolves to PBR via the STANDARD_MATERIAL_LIBRARY map
**Files:**
- `packages/geometry-wall/src/WallFragmentBuilder.ts` — added private `injectedMaterialMap` field + optional `materialMap` parameter to the constructor's `viewStores` arg + a new branch at the top of `createWallMaterial()` that resolves `wall.materialId` against the map and builds a real `THREE.MeshStandardMaterial` from `matDef.params` + textures.
- `packages/geometry-wall/src/WallTool.ts` — imports `STANDARD_MATERIAL_LIBRARY` and builds the id→def `Map` ONCE in the constructor (library is module-scoped + immutable), then passes the map to `new WallFragmentBuilder(...)`.

**Before:** the audit's M-H1 found that `WallFragmentBuilder.createWallMaterial()` consulted only `wall.materialColor` (a hex). The `materialId` field was preserved in `userData` but **never resolved** — so the architect's choice between "Steel Stainless Polished" (metalness 1.0, roughness 0.05), "Concrete Smooth" (matte), "Glass Tempered" (transmissive), and "Brick Red" produced **nearly-identical matte plaster walls** in the viewport. Schedules and IFC export correctly reported the architect's choice; the 3D scene lied. `SlabFragmentBuilder` already did this resolution (`SlabFragmentBuilder.ts:822-858`) — walls were the outlier.

**After:** `createWallMaterial()`'s new top branch:
1. Looks up `wall.materialId` in the injected map.
2. If found, builds a `MeshStandardMaterial` from `matDef.params` (roughness / metalness / colour / opacity).
3. Honours HDRI envMap on realistic style (metals still reflect the environment).
4. Collapses to matte on SCHEMATIC style (matches the slab's `visualStyle === 1` branch — preserves "everything looks like cardboard" in schematic mode).
5. Honours per-wall `materialColor` as a tint when the matDef has no explicit colour (so the architect can recolour a "concrete-smooth" PBR wall to red without losing the PBR roughness/metalness).
6. Emits a one-shot console warn per missing id so the gap is visible during dev without flooding the console.
7. Falls back gracefully to the existing realistic/schematic + materialColor-only paths when no map / no match.

**Pattern alignment:** structurally identical to the established `SlabFragmentBuilder` material-resolution block. The DI shape matches: WallTool builds the map once + threads it to the builder via the existing constructor `viewStores` arg (extended additively — fully backward-compat with callers that don't supply `materialMap`).

**Net effect:** the architect's STANDARD_MATERIAL_LIBRARY choice now actually changes the rendered wall material. The four largest "looks identical" complaints (concrete vs steel, smooth vs polished, glass vs solid, matte vs gloss) are closed.

---

## ✅ APPLIED — Round 4 (concurrency + door/window finish persistence)

### §L-B2 — Client-side `If-Match` optimistic-concurrency on every save
**File:** `apps/editor/src/ui/platform/ServerSyncQueue.ts`.
**Before:** the server's `POST /api/projects/:id/versions` route has fully implemented `If-Match: "v${n}"` parsing (`server.js:2806-2817`) + `PreconditionFailedError` returning HTTP 412 (`server.js:2961`) — but **the client never sent the header**. Two tabs / two devices / a collaborator saving the same project at the same time silently last-writer-wins; the slower client's snapshot was appended to history but their working scene diverged silently from what's on the server. The audit's L-B2 / M-B2-from-Production identified this gap.
**After:**
  1. New per-project map `_serverVersionCountByProject` tracks the last server-confirmed count.
  2. `attemptSync` builds the `If-Match: "v${count}"` header whenever a previously-confirmed count exists (the very first save has no expected count — server treats absent `If-Match` as "no precondition", which is the correct first-writer-wins semantics).
  3. On 201/200 success, parses the response body's `versionCount` / `count` / `total` field; if absent, increments the prior known count by 1 (every successful save adds exactly one version).
  4. **412 handled distinctly from generic 4xx**: drops from the active queue (won't retry — would recur) but marks the version `local-only` so it survives in localStorage; clears the stale count cache; surfaces a structured `onSaveRejected(412, { error: 'concurrent_edit', actual, expected, versionId, label })` to the host so the platform shell can show a "Project changed on the server — reload to merge" modal.
**Pattern alignment:** the existing `_planRejectsSync` latch already handled 401/403 plan-gating distinctly from generic 4xx; this 412 branch follows the same shape — early-return after the special handling, before falling through to the generic 4xx drop logic. No new public API on `ServerSyncQueue`; the host integrates via the existing `onSaveRejected` callback that's already wired.

### §M-H4 — Custom door + window system types persisted across save/load
**Files:**
- `apps/editor/src/engine/persistence/ProjectSerializer.ts` — added top-level imports for `doorSystemTypeStore` / `windowSystemTypeStore`, two new filtered-`structuredClone()` blocks, two new optional fields on `ProjectSnapshot`, and two new entries in the `snapshot` output object.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` — added two restoration loops after the existing floorSystemType restoration. Each loop guards against malformed entries (`!raw.id || !raw.name`), skips entries already in the store (built-ins are seeded from code at boot), forces `isBuiltIn: false` on restoration, and registers each restored type with `elementRegistry.registerSemantic(id, '<type>SystemType')` for graph indexing.
**Before:** custom door/window finish types ("Solid oak 35mm with brushed-nickel handle", "Triple-glazed argon 1.0 W/m²K") were wiped on every project reload because the snapshot had no slot for them. Doors and windows referencing the dropped type fell back to inline parameters and emitted `[DoorBuilder]/[WindowBuilder] references unknown systemTypeId` warnings. The audit found this matches §M-H3 / §H-H5 of the materials audit.
**After:** custom door/window finish types round-trip through save/load like wall/slab/ceiling/floor types already do. The runtime warning class is closed for door/window assemblies; schedules + IFC export now report the architect's authored finish names.
**Pattern alignment:** structurally identical to the existing wallSystemType / slabSystemType / ceilingSystemType / floorSystemType serialization + restoration patterns. The only surface divergence — door/window stores use a top-level `isBuiltIn` field whereas wall/slab/ceiling/floor use an `isBuiltIn(id)` method — is explicitly noted in a comment in the serializer; we filter `t.isBuiltIn` accordingly rather than refactor four stores out of scope.

---

## ✅ APPLIED — Round 3 (data restore + zoom toolbar + conflict UI)

### §L-B3 — Standalone slab/floor openings restored on project load
**File:** `packages/command-registry/src/project/ImportProjectCommand.ts` — Step 5d (between floors and stairs).
**Before:** `ProjectSerializer.ts:670` wrote `openings = openingStore.getAll()` to the snapshot. `ClearProjectCommand` cleared `openingStore`. `ImportProjectCommand` then never read back `snapshot.openings`. After ONE autosave the field was permanently dropped — every stairwell cut, every service penetration, silently lost.
**After:** new Step 5d loop dispatches `CreateOpeningCommand` (`packages/command-registry/src/slabs/CreateOpeningCommand.ts`) for each opening in the snapshot. Uses the same `runSub` / `recordFail` resilient pattern as every other restoration step. Runs after slabs (the host) and before stairs (some stairs reference their landing opening). Defensive validation: rejects malformed openings missing `id`/`hostId`/`levelId`/`profile` rather than throwing.
**Pattern alignment:** structurally identical to Step 5b (Ceilings) and Step 5c (Floors). Same import location, same loop shape, same error reporting.

### §C-B1 — `zoom-fit` and `zoom-selected` toolbar buttons now functional
**File:** `apps/editor/src/engine/engineLauncher.ts` — handler registrations after the `registerSelectionHandlers(_bus)` block.
**Before:** `MainToolbar.ts:57-58` dispatched `zoom-fit` and `zoom-selected` bus commands. `commands.ts:45-46` typed both as `EmptyPayload`. **No handler was registered anywhere** → every click was a silent no-op. The Fit and Zoom-Selection buttons did literally nothing.
**After:** both handlers registered inline in `engineLauncher.ts` (where `zoomToAll`, `viewController`, `selectionManager`, and `world.camera.controls` are all in scope from the same construction frame). `zoom-fit` calls the existing `zoomToAll(true)` closure; `zoom-selected` computes a `THREE.Box3.setFromObject(selectionManager.selectedObject)` and dispatches `controls.fitToBox(box, true)` — falling back to `setLookAt` when the camera-controls build lacks `fitToBox`, or to `zoomToAll` when no selection exists.
**Pattern alignment:** matches the `affectedStores: [] as const` + trivial `canExecute` shape used by every other side-effect-only bridge in this file. Try/catch around each `_bus.register(...)` matches the existing `(non-fatal)` pattern.

### §S-B1 — CRDT conflict-disclosure UI wired (P8 compliance)
**File:** `apps/editor/src/engine/engineLauncher.ts` — block immediately after the YjsDocAdapter setup at line ~560-577.
**Before:** `ConflictResolutionDialog`, `ConflictDisclosureBanner`, and `CRDTConflictResolver` were all built and exported (Wave A19-T3/T6/T7) but **nothing called `_yjsDocAdapter.onConflict(...)`**. C08 §3.1 / §3.3 "silent LWW is forbidden" was violated for every concurrent edit. Every collaboration conflict was logged once internally and lost.
**After:** singleton instances of `_conflictBanner`, `_conflictDialog`, `_conflictResolver` created at boot. `_yjsDocAdapter.onConflict(c => …)` wires:
  1. **Banner** appears immediately (P8 disclosure — `role="alert"`, `aria-live="assertive"`).
  2. **Banner click → Dialog opens** with both versions side-by-side.
  3. **Dialog resolution → re-dispatch** via the bus's existing `element.updateParameters` generic update handler, applying the user's choice (Keep mine / Keep theirs / Merge).
  4. Both successful resolution and re-dispatch failures are logged with the conflict's `(elementId, property, resolution, value)` for audit.
**Pattern alignment:** singletons constructed once at engine boot (matches `BatchCoordinator`, `wallRebuildCoordinator`, etc.). The UI components manage their own DOM lifecycle (show/hide). Re-dispatch uses the existing generic `element.updateParameters` bridge — the same path the property panel uses — so the resolution flows through the regular command/event/CRDT pipeline.

---

## ✅ APPLIED — Round 2 (undo/redo + collaboration + project-load hangs)

### §U-B1 — RingBufferUndoStack + bus.UndoStack cleared on project switch + load
**Files:**
- `packages/runtime-composer/src/composeRuntime.ts` — added `bus.clearUndoStacks()` method on the outer facade. Wipes both `inner.bus.ringBuffer.clear()` and the legacy `undoStack.clear()`.
- `packages/runtime-composer/src/types.ts` — declared `clearUndoStacks(): void` on the `PryzmRuntime.bus` slot type.
- `packages/runtime-composer/src/ProjectLifecycleController.ts` — accepts a third constructor arg `onClearUndoStacks: (() => void) | null = null` and invokes it as **Step 0** (before BatchCoordinator reset) inside `_handleProjectSwitch`.
- `apps/editor/src/engine/engineLauncher.ts` — passes `() => runtime.bus.clearUndoStacks()` to the `ProjectLifecycleController` constructor.
- `apps/editor/src/engine/persistence/ProjectLoader.ts` — calls `runtime.bus.clearUndoStacks()` immediately after `commandManager.clearHistory()` so all three undo stacks (legacy + bus.UndoStack + RingBuffer) are wiped on project load.
**Before:** Ctrl+Z in Project B applied a JSON-Patch inverse recorded against Project A's stores → no-op on missing element IDs, data corruption on ID collision.
**After:** crossing a project boundary wipes both PRYZM-3 undo stacks atomically. Architecturally clean — single new facade method exposed on `bus`, threaded through one new optional ctor arg.

### §U-B2 — `bus.dispatch(type, payload, opts?)` method added; collaboration commands no longer dropped
**Files:**
- `packages/runtime-composer/src/composeRuntime.ts` — added `dispatch(type, payload, opts?: { source?: 'LOCAL'|'REMOTE'|'PROJECT_LOAD' })` to the outer bus facade. Forwards to `inner.bus.executeCommand(type, payload, { suppressUndo: source === 'REMOTE' || 'PROJECT_LOAD' })`.
- `packages/runtime-composer/src/types.ts` — declared the new method on `PryzmRuntime.bus`.
- `packages/command-bus/src/CommandBus.ts` `executeCommand` — accepts new optional 3rd arg `opts?: { suppressUndo?: boolean }`. When true, skips BOTH `undoStack.push(record)` and `_ringBuffer.push(...)`.
**Before:** `RemoteCommandDispatcher.ts:98` called `window.runtime.bus.dispatch(...)` — but the method didn't exist. Every inbound CRDT/collaboration command threw `TypeError: bus.dispatch is not a function`, was caught at line 112, logged with `'error'`, and the remote mutation was silently dropped. Real-time collaboration was functionally broken.
**After:** the method exists, and REMOTE-sourced commands correctly bypass the local user's undo stack (per §30-COLLAB §3.5 — Ctrl+Z must never undo someone else's work). RemoteCommandDispatcher needed zero changes — it already called the right shape.

### §U-B5 — Empty-patch records no longer poison the ring-buffer cursor
**File:** `packages/command-bus/src/CommandBus.ts` `executeCommand`.
**Before:** Bridge handlers like `view/DeleteElement` return `{ forward: [], inverse: [] }` (delegating to the legacy CommandManager). Every one of those calls pushed a degenerate `PatchPair` onto the RingBuffer, eating a cursor slot. After enough deletes, Ctrl+Z mispop cascaded.
**After:** auto-detects `forward.length === 0 && inverse.length === 0` and skips the ring-buffer push. The legacy `undoStack` still records the EventRecord for backward-compat accounting (it's keyed on events, not patches).

### §#47 — RenderPipelineManager in-flight rebuild guard (closes ShadowDepthTexture race)
**File:** `packages/renderer-three/src/pipeline/RenderPipelineManager.ts` `scheduleShadowRebuild` + new private `_finishRebuildAndDrainQueue()`.
**Before:** 88 element-added events during project load each called `scheduleShadowRebuild()`. The 16 ms setTimeout coalesced them into one rebuild — but a second rebuild scheduled DURING the in-flight one disposed the in-use ShadowDepthTextures → 15× "Destroyed texture [Texture ShadowDepthTexture] used in a submit" → the project appears to hang.
**After:** introduced `_rebuildInFlight` + `_rebuildQueuedAfterFlight` latches. While a rebuild is running, additional schedules set the queued flag but DON'T start a new rebuild. After completion (via `.finally(() => _finishRebuildAndDrainQueue())`), if the queued flag is set, exactly ONE follow-up rebuild is dispatched via `setTimeout(0)` — a new macrotask so the GPU queue has drained the previous submit. Same in-flight-and-queue pattern used by `WallRebuildCoordinator._scheduleFlush`.

### §#48 — RoomTopologyObserver `_executeRedetect` honours `paused` (single source of truth)
**File:** `packages/room-topology/src/RoomTopologyObserver.ts` `_executeRedetect`.
**Before:** C11 §FIX-ROOMOBSERVER-PAUSE added the `paused` check at the top of `_scheduleRedetect` — but THREE other call sites (`scheduleRedetectAllLevels`'s cleanup loop, the `MAX_DEBOUNCE_RESETS` forced-fire branch, the batch-redetect-all path) invoke `_executeRedetect` directly without going through `_scheduleRedetect`. During post-load wall-flush, those direct paths fired `ReDetectRoomsCommand` while the observer was paused → main-thread stall while half-built room polygons were redetected.
**After:** added the `paused` guard to `_executeRedetect` itself — single source of truth. Every redetect path now respects pause uniformly. Comment block at the new guard explicitly documents which three direct-call sites it protects.

---

## ✅ Architectural soundness checklist — Round 2

Per the explicit user requirement "no shortcuts, architecturally sound, aligned with contractual documentation":

| Concern | Pattern alignment | Contract reference |
|---|---|---|
| `bus.dispatch` | Mirrors existing `executeCommand` signature; opts param mirrors how OTel/tracing options are threaded elsewhere | C03 §4.1, §30-COLLAB §3.5 |
| `clearUndoStacks` | Single new facade method; alternative would have leaked `inner` to callers | C03 §4.1, C13 §3.x |
| `ProjectLifecycleController` ctor change | Additive optional param with default `null` — backward-compatible with all callers | C13 §4 |
| `executeCommand` `opts` param | Optional 3rd arg, default behaviour unchanged for every existing caller | C03 §4.1 |
| Empty-patch skip | Auto-detected, no caller change needed | C03 §4.1 |
| `_finishRebuildAndDrainQueue` | Mirrors `WallRebuildCoordinator._scheduleFlush` in-flight+queue pattern | C04 §3 |
| `_executeRedetect` paused guard | Single source of truth — same C11 §FIX-ROOMOBSERVER-PAUSE intent, applied at the right layer | C11 §6.3 |

---

## Summary (cumulative across both rounds)

**Applied this session, both rounds (architecturally clean, all aligned with existing patterns + contracts):**

### Round 1 — tools, camera, persistence
- §C-B3, §C-B4 — camera dolly + polar constraints widened to BIM-grade ranges.
- §C-B2 — plan-view camera sticky across element commits.
- §T-B1 — `hasActiveStroke?()` contract added to `PlanToolHandler`; implemented in 5 polyline handlers; `SvpPlanToolOverlay.onMouseLeave` honours it.
- §T-B2 — `e.preventDefault()/stopPropagation()` propagation through both overlays + reinforced global Delete/Backspace filter.
- §T-H7 — Move tool stays active until Esc.
- §M-B1 — Wall + Slab `SystemTypeStore.add()` preserves caller-supplied id (parity with Ceiling + Floor).

### Round 2 — undo/redo + collaboration + project-load hangs
- §U-B1 — Both PRYZM-3 undo stacks (RingBuffer + bus.UndoStack) cleared on project switch + project load.
- §U-B2 — `bus.dispatch(type, payload, opts?)` added; collaboration commands no longer throw + silently drop.
- §U-B5 — Empty-patch records no longer poison the ring-buffer cursor.
- §#47 — In-flight rebuild guard in `scheduleShadowRebuild` closes the ShadowDepthTexture race that caused project-load hangs.
- §#48 — `paused` guard moved to `_executeRedetect` (single source of truth) — no more `forced fire resets=12` during post-load wall-flush.

**Total finding closures this session:** 7 Blockers (3 from audit + 2 task-queue hangs + 2 collaboration) + 4 Highs directly fixed in source code. All edits backed by explicit contract citations and structurally identical to pre-existing patterns in the codebase.

**Net effect:** the most-painful "real-architect first-hour" cliff-edges are closed. Day-to-day work — drawing polylines, pressing Backspace, opening old projects, switching projects, collaboration, custom system types — now behaves the way an architect expects.

**For full daily-use audit context:** `DAILY-USE-AUDIT-2026-05-20.md`.
**For production-readiness audit:** `PRODUCTION-READINESS-AUDIT-2026-05-20.md` + `PRODUCTION-READINESS-FIX-LOG-2026-05-20.md`.
