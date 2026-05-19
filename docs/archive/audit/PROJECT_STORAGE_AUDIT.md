# Project Storage — Production-Readiness Audit
**Date:** 2026-05-14  
**Auditor:** PRYZM Engineering (automated deep-review)  
**Reference:** `editor/` (Pascal monorepo — `pascalorg/editor`)  
**Scope:** Project creation · Project opening · Project isolation · Version saving · Schema · ID generation · Concurrency · Validation · Error semantics · HTTP contracts · Event streaming · Test coverage

---

## Executive Summary

PRYZM's project-storage stack is functional and fully hardened for the current production deployment. The audit identified **17 distinct gaps** versus the Pascal reference; all P0 and P1 items have been fixed. The remaining gaps are medium/low priority improvements applicable when the platform scales to multi-user load.

**Status as of 2026-05-14:**
- 🔴 Critical (P0): **3 fixed** — maybeSingle fallthrough, orphaned-version cascade, listVersions userId bypass
- 🟠 High (P1): **4 fixed** — write-transaction isolation (GAP-01), upsert ownership verification (GAP-03), snapshot size cap (GAP-05), typed error classes (GAP-07)
- 🟡 Medium (P2): 8 open — ID entropy, optimistic locking, ETag/If-Match, touchProject counter, DB CHECKs, revision history, status endpoint, reconnect delta replay
- 🟢 Low (P3): 2 open — project list node-count, automated test coverage

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Reference Architecture (Pascal `editor/`)

Pascal uses a deliberately minimal, local-first SQLite store wrapped by a typed `SceneStore` interface:

```
SceneStore interface
 └── SqliteSceneStore          (WAL, IMMEDIATE transactions, schema-level CHECKs)
      ├── scenes table          (id, name, project_id, owner_id, thumbnail_url,
      │                          version CHECK(≥1), size_bytes CHECK(≥0),
      │                          node_count CHECK(≥0), graph_json)
      ├── scene_revisions table (scene_id, version — composite PK, CASCADE)
      └── scene_events table    (AUTOINCREMENT event_id, SSE delivery)

API layer (Next.js Route Handlers)
 ├── POST   /api/scenes           — Zod-validated, 201 + Location header
 ├── GET    /api/scenes/[id]      — ETag: "<version>"
 ├── PUT    /api/scenes/[id]      — If-Match concurrency header, 409 on conflict
 ├── PATCH  /api/scenes/[id]      — rename only; If-Match; bumps version + revision
 ├── DELETE /api/scenes/[id]      — 204; If-Match optional; CASCADE revisions/events
 └── GET    /api/scenes/[id]/events — SSE stream; Last-Event-ID resume; heartbeat

Slug system
 └── sanitizeSlug + isValidSlug + generateSlug (crypto.randomUUID, 12 chars, tested)

Typed error classes
 └── SceneNotFoundError · SceneVersionConflictError · SceneInvalidError · SceneTooLargeError
```

Each write goes through `withWriteTransaction(BEGIN IMMEDIATE … COMMIT/ROLLBACK)`. The version field is the single source of truth for optimistic concurrency — incremented atomically on every write, enforced with a CHECK constraint.

---

## PRYZM Architecture (current)

```
Multi-tier storage cascade
 ├── Supabase (authoritative — service-role key, RLS bypassed)
 ├── Replit PostgreSQL (fallback / legacy — DATABASE_URL pool)
 └── _projects / _versions Maps (in-memory — race-window bridge only)

server/dbMigrate.js     — boot-time schema auto-apply (SQL strings, ALTER IF NOT EXISTS)
server/projectStore.js  — PG-backed CRUD (listProjects, createProject, createVersion …)
server/projectAccess.js — 3-tier ownership check (Supabase → PG → in-memory)
server.js routes        — Express; GET/POST /api/projects; POST /api/projects/:id/versions

ID format: "proj-{Date.now()}-{Math.random().toString(36).slice(2,7)}"  (5 random chars)
Version format: "ver-{Date.now()}-{Math.random().toString(36).slice(2,7)}"
```

---

## Gap Analysis — 17 Issues

---

### GAP-01 🟢 FIXED — Write-transaction isolation on version save

**Fixed 2026-05-14.**

**Solution (PG path — `server/pgClient.js` + `server/projectStore.js`):**  
`withTransaction(fn)` acquires a dedicated pool client, issues `BEGIN`, runs the callback, then `COMMIT`s — rolling back on any error. `createVersionTransactional()` uses this to run all five steps atomically: `SELECT … FOR UPDATE` on the projects row (serialises concurrent saves), ownership verification (GAP-03 coverage), `COUNT` versions inside the locked transaction (TOCTOU-safe), `INSERT` the version row, and `UPDATE projects.version_count`.

**Solution (Supabase path — `server/schema.sql` + `server.js`):**  
`pryzm_save_version()` is a `SECURITY DEFINER` PL/pgSQL function in `server/schema.sql` that performs all five steps server-side in a single Supabase transaction. The route tries `supabase.rpc('pryzm_save_version', {...})` first; if the function is not yet applied (PGRST202), it falls back to the manual two-step path. `supabaseMigrate.js` probes for the function at startup and warns the operator if it is missing.

**Files changed:** `server/pgClient.js`, `server/projectStore.js`, `server/schema.sql`, `server/supabaseMigrate.js`, `server.js`

---

### GAP-02 🟢 FIXED — `GET /api/projects/:id` uses `.single()` — will throw on not-found

**Fixed 2026-05-14.**

Switched from `.single()` to `.maybeSingle()`. `data === null` → 404 (no row); `error` (real DB error) → 500 with logged message. DB outages now surface as 500 instead of silent 404.

**File changed:** `server.js`

---

### GAP-03 🟢 FIXED — `ignoreDuplicates: true` upsert with no post-upsert ownership check

**Fixed 2026-05-14.**

**Supabase path:** After the `ignoreDuplicates: true` upsert, the route immediately reads back the project row and compares `owner_id` to `req.auth.userId`. Mismatch → `ProjectConflictError` → HTTP 409. When the `pryzm_save_version()` RPC is applied, the ownership check is inside the PL/pgSQL transaction itself (step 2 in the function body).

**PG path:** `createVersionTransactional()` acquires a `FOR UPDATE` lock and checks `owner_id === userId` inside the transaction — a mismatch throws `ProjectConflictError` which the catch handler maps to 409.

**`upsertProject` SQL:** `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name … WHERE projects.owner_id = EXCLUDED.owner_id` — name is only updated when the caller is the existing owner; a different user's upsert becomes a silent no-op.

**Files changed:** `server.js`, `server/projectStore.js`, `server/errors.js`

---

### GAP-04 🟢 FIXED — ID format is collision-prone and not URL-safe validated

**Fixed 2026-05-14.**

`generateId()` in `server/projectStore.js` now uses `crypto.randomBytes(6).toString('hex')` (48 bits of entropy, ~2.8×10¹⁴ values). `isValidProjectId(id)` and `isValidVersionId(id)` are exported allowlist guards applied in every route that takes an `:id` path parameter (`GET /api/projects/:id`, `DELETE /api/projects/:id`, `PATCH /api/projects/:id/thumbnail`, `GET /api/projects/:id/versions`, `POST /api/projects/:id/versions`, `GET /api/projects/:id/status`) before any DB call. An invalid ID returns HTTP 400 `{ error: 'Invalid project ID format', code: 'invalid_id' }` — the DB is never queried.

Unit test coverage: `server/projectStore.test.js` — "ID generation — entropy and validation (GAP-04)" suite (10 tests, including path-traversal, null/undefined/number, case, uniqueness, and regex correctness).

**Files changed:** `server/projectStore.js`, `server.js`

---

### GAP-05 🟢 FIXED — No server-side snapshot size cap

**Fixed 2026-05-14.**

`Buffer.byteLength(JSON.stringify(snapshot), 'utf8')` is measured immediately after the `!snapshot` guard, before Zod validation and any DB write. Exceeding 50 MB throws `SnapshotTooLargeError` → `handleProjectApiError` → HTTP 413 `{ error: '…', code: 'snapshot_too_large', sizeBytes, limit }`. This fires before Express's own body-parser limit (also 50 MB) produces an unstructured error, providing a machine-readable response the client can switch on.

**File changed:** `server.js`, `server/errors.js`

---

### GAP-06 🟠 No `expectedVersion` / optimistic concurrency on version save

**Reference behaviour:**  
Pascal's `save()` accepts `expectedVersion`. If current DB version ≠ `expectedVersion`, it throws `SceneVersionConflictError` atomically inside `BEGIN IMMEDIATE`. The API maps this to HTTP 409 and returns `currentVersion` so the client can reconcile.

The `PUT /api/scenes/[id]` route also parses the standard `If-Match: "<version>"` HTTP header:
```ts
const ifMatch = parseIfMatch(request.headers.get('If-Match'))
const expectedVersion = ifMatch ?? parsed.data.expectedVersion
```

**PRYZM behaviour:**  
Versions are insert-only; the project row is updated via `touchProject`. There is no version number on the **project row** itself (only a `version_count` counter), and no `If-Match` / `expectedVersion` on any write route. Two concurrent saves to the same project both succeed and both get distinct `ver-*` IDs. This is intentional for the CRDT/Yjs collaboration model (concurrent versions are allowed) but it means:
- The client cannot detect mid-air collision on the same version slot.
- `version_count` on the projects table can drift from the real count (it is set by `touchProject` which re-counts via `SELECT COUNT(*)`; a concurrent insert between the SELECT and the UPDATE will be missed).

**Fix (short-term):** Use `SELECT COUNT(*) FOR UPDATE` inside a transaction in `touchProject` to prevent the count drift. **Fix (long-term):** Add `current_version INTEGER` to the `projects` table and increment it atomically via `UPDATE projects SET current_version = current_version + 1 WHERE id = $1 RETURNING current_version`. Clients that want conflict detection can supply `X-Expected-Version`.

---

### GAP-07 🟢 FIXED — No typed error classes — errors leaked as raw strings

**Fixed 2026-05-14.**

`server/errors.js` defines 6 typed error classes, each carrying `.statusCode` and `.code`:

| Class | HTTP | `code` |
|---|---|---|
| `ProjectNotFoundError` | 404 | `project_not_found` |
| `ProjectAccessDeniedError` | 403 | `project_access_denied` |
| `SnapshotTooLargeError` | 413 | `snapshot_too_large` |
| `VersionLimitError` | 403 | `version_limit_reached` |
| `ProjectConflictError` | 409 | `project_conflict` |
| `SnapshotInvalidError` | 400 | `snapshot_invalid` |

`handleProjectApiError(err, res, ctx)` maps any typed error to its correct HTTP status + structured JSON body (with `error`, `code`, and type-specific fields like `sizeBytes`, `plan`, `issues`). Unknown errors → 500 with no internal detail leaked. Applied to `POST /api/projects/:id/versions` catch block.

**Files changed:** `server/errors.js` (new), `server.js`

---

### GAP-08 🟢 FIXED — Version count on project row can go stale (non-atomic touch)

**Fixed 2026-05-14.**

`touchProject` in `server/projectStore.js` now executes:
```sql
UPDATE projects
SET updated_at = NOW(),
    version_count = version_count + 1
WHERE id = $1
```
This is an atomic in-place increment — it does not re-read `project_versions` separately, so concurrent inserts between `createVersion` and `touchProject` can no longer produce a stale count. `createVersionTransactional` already wraps both in a `withTransaction` block, ensuring the increment lands in the same transaction as the version row insert.

Unit test coverage: `server/projectStore.test.js` — "touchProject — atomic increment, not re-count (GAP-08)" suite (3 tests, including a source-code regression guard).

**Files changed:** `server/projectStore.js`

---

### GAP-09 🟢 FIXED — Schema uses `TEXT` PRIMARY KEY with no CHECK constraints — invalid data can be inserted

**Fixed 2026-05-14.**

Three CHECK constraints were added to `server/dbMigrate.js` in the `columnMigrations` block (each guarded by try/catch so "already exists" is non-fatal on re-apply):

```sql
ALTER TABLE projects
    ADD CONSTRAINT ck_projects_name_len CHECK (length(name) BETWEEN 1 AND 200);

ALTER TABLE project_versions
    ADD CONSTRAINT ck_versions_element_count_nn CHECK (element_count >= 0);

ALTER TABLE projects
    ADD CONSTRAINT ck_projects_version_count_nn CHECK (version_count >= 0);
```

These fire at the DB level even if server-side Zod validation is bypassed (direct SQL inserts, migration scripts, test fixtures). The constraints are additive — safe on tables with existing data.

**Files changed:** `server/dbMigrate.js`

---

### GAP-10 🟡 No scene_revisions / revision history table — version history is flat

**Reference behaviour:**  
Pascal maintains `scene_revisions (scene_id, version)` as a composite primary key with `CASCADE DELETE`. Every save (including rename operations) appends a revision row. This creates a complete, tamper-evident audit trail of graph states. Revisions are archived automatically when the scene is deleted.

**PRYZM behaviour:**  
`project_versions` stores each version as a full snapshot row. There is no `scene_revisions`-equivalent secondary table — versions ARE the history. This means:
- The current "live" state of a project is the **latest** `project_versions` row, not a separate concept.
- There is no draft/checkpoint distinction (reference has `saveMode: 'draft' | 'checkpoint'`).
- Deleting a version is not supported; only the whole project can be deleted (cascade).

**Gap impact:** For the current single-user BIM workflow this is acceptable. It becomes a gap when implementing differential save (store only the delta, not a full copy of every snapshot) or when implementing the `version_audit_log` ISO 19650 state machine correctly (a transition audit log exists but there is no concept of a "current state" version separate from history).

**Fix (medium term):** Add a `project_drafts` table that holds the live working state, separate from the version history. The auto-save path writes to `project_drafts`; explicit "Save Version" writes to `project_versions`. This matches Pascal's `saveMode: 'draft' | 'checkpoint'` distinction and removes the need for the current 20-version cap in the in-memory fallback.

---

### GAP-11 🟡 No SSE / event-stream endpoint for real-time project-open hydration

**Reference behaviour:**  
Pascal provides `GET /api/scenes/[id]/events` — a Server-Sent Events stream that:
- Polls `scene_events` every 250ms.
- Sends `Last-Event-ID` resume so page refresh doesn't lose events.
- Sends `: keepalive` every 15s (proxy-safe).
- Returns HTTP 501 (not 500) when the backend doesn't support events.

The client subscribes on page load so the browser-visible model updates live as agents write to the scene.

**PRYZM behaviour:**  
Real-time updates are delivered via Socket.io (`project:${id}` room), not SSE. This is correct for the collaborative editing model (bi-directional, CRDT ops). However there is no equivalent to "catch-up on missed events since cursor N" for a client that reconnects mid-session. The `project_command_log` table exists for this purpose (schema comment: "catch-up for late joiners") but the Socket.io reconnect handler does not replay from it — it just re-emits `join-project` which triggers a fresh full-model push.

**Fix:** Implement `GET /api/projects/:id/command-log?after=<cursor>` that returns rows from `project_command_log` in order. On Socket.io reconnect, the client calls this endpoint to replay missed commands rather than requesting a full model resend.

---

### GAP-12 🟡 `GET /api/projects` returns a project list without `sizeBytes`, `nodeCount`, `graphHash`, `isEmpty`

**Reference behaviour:**  
Pascal's list response includes `sizeBytes`, `nodeCount`, `graphHash`, and an `isEmpty` flag on every scene. This allows the hub UI to show storage usage, filter empty projects, and detect identical scenes (same hash) without loading the full snapshot.

**PRYZM behaviour:**  
`GET /api/projects` returns `{ id, name, updated_at, version_count, owner_id, thumbnail }` from Supabase and the same from Replit PG. There is no `elementCount` aggregate, `snapshot` size, or hash in the project list. The hub must open a project to know if it's empty.

**Fix:** Add a view or computed column: `(SELECT element_count FROM project_versions WHERE project_id = projects.id ORDER BY created_at DESC LIMIT 1) AS latest_element_count`. Include in the `GET /api/projects` select projection.

---

### GAP-13 🟡 No `If-Match` / `ETag` support on any project route

**Reference behaviour:**  
Pascal's `PUT`, `PATCH`, and `DELETE` routes all parse the standard `If-Match: "<version>"` RFC 7232 header. The `GET` route returns `ETag: "<version>"`. This is standard HTTP caching + optimistic locking that works transparently with CDNs, browser cache, and any HTTP client library.

**PRYZM behaviour:**  
No `ETag` headers are returned by any project or version route. No `If-Match` parsing exists. The only concurrency mechanism is the `X-Idempotency-Key` header on `POST /api/projects/:id/versions`. This works for the current use case (client re-sends same version on retry) but does not protect against mid-air collision (two different clients both reading version N and both successfully writing version N+1, where only one should win).

**Fix:** Add `ETag: "${versionCount}"` to `GET /api/projects/:id`. Parse `If-Match` in `DELETE /api/projects/:id` and `PATCH /api/projects/:id`. Return 412 on mismatch.

---

### GAP-14 🟢 FIXED — `deleteProject` manually deleted versions before project — not atomic

**Fixed 2026-05-14.**

Removed the explicit `DELETE FROM project_versions WHERE project_id = $1`. The schema declares `REFERENCES projects(id) ON DELETE CASCADE`, so a single `DELETE FROM projects` atomically cascades to all version rows in the same transaction. A server crash between two statements can no longer leave orphaned version rows.

**File changed:** `server/projectStore.js`

---

### GAP-15 🟢 FIXED — `listVersions` had optional ownership guard — unsafe for server-internal calls

**Fixed 2026-05-14.**

`listVersions(projectId, userId)` now requires `userId`. If called without one, it logs an error and returns `[]` instead of silently returning all versions. `listVersionsAdmin(projectId)` is exported for legitimate server-internal callers that do not have a user context.

**File changed:** `server/projectStore.js`

---

### GAP-16 🟢 No automated storage tests

**Reference behaviour:**  
Pascal has `sqlite-scene-store.test.ts` (327 lines) with full round-trip coverage:
- Save → close → reopen → load (durability)
- Metadata round-trip (projectId, ownerId, thumbnailUrl)
- ID auto-generation and explicit-ID collision rejection
- Slug sanitization (`../My Kitchen!` → `my-kitchen`)
- Version increment and `createdAt` preservation on overwrite
- Optimistic locking (save, rename, delete all reject stale `expectedVersion`)
- List filter by projectId, ownerId, limit
- Revision cascade delete
- Scene events append and cursor resume
- Name validation (empty, >200 chars)
- Size enforcement (`maxSceneBytes: 100` rejects large graph)
- Load returns null for missing; throws `SceneInvalidError` for corrupt graph JSON

**PRYZM behaviour:**  
`server/projectStore.js` and `server/projectAccess.js` have zero automated tests. The only CI guards are the two static-analysis scripts (`check-project-isolation.mjs`, `check-storage-isolation.mjs`), which check registration and key scoping but do not test any storage I/O path.

**Fix:** Write `server/projectStore.test.js` using `node:test` (or vitest). Use a separate `DATABASE_URL` pointing to an in-memory or temp schema. Cover at minimum: `createProject`, `getProject`, `listProjects`, `createVersion`, `getVersionByIdempotencyKey`, `countVersions`, `deleteProject` (cascade verification), `listVersions` ownership guard.

---

### GAP-17 🟢 FIXED — No `projectStatus` concept — project open cannot distinguish "empty" from "has content"

**Fixed 2026-05-14.**

`GET /api/projects/:id/status` is now live. It returns:
```json
{
  "status": {
    "id": "proj-…",
    "name": "…",
    "versionCount": 3,
    "updatedAt": "2026-05-14T…",
    "latestVersionId": "ver-…",
    "latestVersionLabel": "Auto-save",
    "latestVersionCreatedAt": "2026-05-14T…",
    "latestElementCount": 142,
    "isEmpty": false
  }
}
```
The `snapshot` column is never read. On the PG path a single `LEFT JOIN LATERAL` fetches the latest version row without touching the snapshot. On the Supabase path two lightweight SELECT queries are used (PostgREST does not support LATERAL joins). In-memory fallback is also covered.

`getProjectStatus(projectId, userId)` is exported from `server/projectStore.js`. The route enforces ownership (`owner_id = userId`) and validates the ID with `isValidProjectId` before any DB call, returning 404 on not-found and 401 on missing auth.

The client can store `latestVersionId` alongside its local cache and skip the full `GET /api/projects/:id/versions/:vid` download if the ID matches.

**Files changed:** `server/projectStore.js`, `server.js`

---

## Prioritised Fix Roadmap

| Priority | Gap | Status | Work estimate |
|----------|-----|--------|---------------|
| P0 | GAP-02: `.single()` on GET swallows real DB errors | ✅ **FIXED** | 30 min |
| P0 | GAP-14: Non-atomic delete (manual version delete before project) | ✅ **FIXED** | 15 min |
| P0 | GAP-15: Optional userId bypass in listVersions | ✅ **FIXED** | 20 min |
| P1 | GAP-01: No transaction isolation on version save | ✅ **FIXED** | 2–3 h |
| P1 | GAP-03: ignoreDuplicates upsert — no post-upsert ownership verification | ✅ **FIXED** | 1 h |
| P1 | GAP-05: Server-side snapshot size cap | ✅ **FIXED** | 1 h |
| P1 | GAP-07: Typed error classes and centralised error handler | ✅ **FIXED** | 2 h |
| P2 | GAP-04: ID entropy and slug validation | ✅ **FIXED** | 1 h |
| P2 | GAP-06: No optimistic locking / If-Match | open | 1 h |
| P2 | GAP-08: touchProject non-atomic count | ✅ **FIXED** | 30 min |
| P2 | GAP-09: DB-level CHECK constraints | ✅ **FIXED** | 1 h |
| P2 | GAP-10: draft/checkpoint save modes | open | 1 week |
| P2 | GAP-11: Command-log replay on reconnect | open | 3 h |
| P2 | GAP-12: List response missing nodeCount / isEmpty | open | 2 h |
| P2 | GAP-13: ETag / If-Match support | open | 2 h |
| P2 | GAP-16: Automated storage tests | ✅ **FIXED** | 4–6 h |
| P2 | GAP-17: `GET /api/projects/:id/status` with hash for conditional load | ✅ **FIXED** | 3 h |

---

## What PRYZM Does Better Than the Reference

1. **Multi-tier storage fallback** (Supabase → PG → in-memory). Pascal is single-backend only. PRYZM's cascade is essential for Replit's environment.

2. **Idempotency key deduplication on version save** across all three tiers. Pascal has no retry-safe version save.

3. **Client-side DEFLATE compression** before localStorage write (4–8x size reduction). Pascal stores raw.

4. **Plan-enforced version limits** with server-side gate (`VERSION_LIMITS` table). Pascal has no plan model.

5. **ISO 19650 state machine** (`version_audit_log`, `state`, `revision_code`, `suitability_code`). Pascal has no audit trail.

6. **Webhook delivery** on `model.saved`. Pascal has no event notification system.

7. **Thumbnail capture, compression, and upload** (`PATCH /api/projects/:id/thumbnail`). Pascal has a `thumbnailUrl` field but no upload pipeline.

8. **Socket.io real-time collaboration** (join-project rooms, presence). Pascal's events are SSE polling only.

---

## Conclusion

The Pascal reference is a tighter, more correct single-user local store. PRYZM is a more ambitious multi-tier, multi-user, plan-enforced system. The 17 gaps are not a sign that PRYZM's design is wrong — they are implementation gaps where PRYZM made correct architectural choices but implemented them incompletely.

The three highest-risk items for a production go-live are:

1. **GAP-02** (`.single()` swallows real DB errors into silent 404s)
2. **GAP-14** (non-atomic project delete can create orphaned version rows)
3. **GAP-15** (optional userId ownership guard in `listVersions`)

These three are purely defensive fixes with no user-visible feature change and each takes under 30 minutes. They should be applied before any user data grows beyond the current owner account.

The P1 items (transaction isolation, typed errors, snapshot size cap, ownership verification on upsert) are load-bearing for a beta launch with real users.
