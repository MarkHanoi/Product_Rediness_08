# 51 — Storage Hardening: Audit, P0/P1 Fixes, and P2 Improvements

What the reference (pascalorg/editor) does that we don't
The Pascal editor uses a deliberately minimal SQLite store with a typed SceneStore interface. Comparing it line-by-line against PRYZM reveals 17 concrete gaps, grouped by severity:

🔴 Critical (3 fixed right now)
#       Gap     Root cause      Fix applied
GAP-02  GET /api/projects/:id used .single() — a DB timeout or connection refusal was silently returned as HTTP 404 instead of 500, making outages invisible    .single() raises PGRST116 for both "no rows" AND real errors; both were caught identically      ✅ Switched to .maybeSingle(). data===null → 404; error (real DB error) → 500 with logged message
GAP-14  deleteProject manually deleted versions then the project in two separate queries — a crash between them left orphaned project_versions rows forever     Schema already has ON DELETE CASCADE; the manual delete was redundant and non-atomic    ✅ Removed the explicit DELETE FROM project_versions — single atomic cascade
GAP-15  listVersions(projectId, userId) skipped the ownership check when userId was falsy — internal server calls with no userId would return all versions to any caller        if (userId) guard was optional  ✅ Made userId required; added listVersionsAdmin() for legitimate internal-only callers
🟠 High — must fix before beta launch with real users
#       Gap     What Pascal does        What we need
GAP-01  No write-transaction isolation on version save  BEGIN IMMEDIATE wraps count-check + INSERT atomically   Supabase RPC function or PG BEGIN/COMMIT around count + upsert + insert
GAP-03  ignoreDuplicates: true on project upsert has no post-write ownership verification — ID collision is silently swallowed  Explicit collision check throws SceneInvalidError before write  Check upsert result count; return 409 if existing row's owner ≠ caller
GAP-05  No server-side snapshot size cap — a 100 MB snapshot hits Supabase's nginx 413 without a structured error body  Enforces maxSceneBytes (10 MB default) before every write       Buffer.byteLength(JSON.stringify(snapshot)) > MAX → 413 { error: 'snapshot_too_large' }
GAP-07  All errors leak as String(err) — PGRST116 internals visible to clients  4 typed error classes → HTTP 404/409/400/413 with machine-readable codes        Define ProjectNotFoundError, SnapshotTooLargeError, VersionLimitError; central handleProjectError(err, res)
🟡 Medium — improve before general availability
#       Gap     Description
GAP-04  ID collision probability: 5 base-36 chars from Math.random() ≈ 1 in 60k per project     Replace with crypto.randomBytes(8).toString('hex') for 16 hex chars; add isValidProjectId allowlist guard
GAP-06  No expectedVersion / optimistic locking on version writes; no If-Match header support   Pascal returns ETag: "<version>" on GET, parses If-Match on PUT/DELETE → HTTP 409 on conflict
GAP-08  touchProject does a subquery COUNT after the version INSERT — count can be stale if concurrent insert runs between them Use UPDATE projects SET version_count = version_count + 1 instead of re-counting
GAP-09  No DB-level CHECK constraints on tables — invalid data can enter via direct SQL or migration scripts    Add CHECK (length(name) BETWEEN 1 AND 200), CHECK (element_count >= 0)
GAP-10  No scene_revisions table — no separate draft vs. checkpoint concept     Add project_drafts table for auto-save working state; project_versions becomes checkpoint-only
GAP-11  Socket.io reconnect does a full model resend, not delta replay from project_command_log Add GET /api/projects/:id/command-log?after=<cursor> and replay on reconnect
GAP-12  Project list response has no nodeCount, isEmpty, sizeBytes — hub can't detect empty projects without loading them       Add (SELECT element_count … LIMIT 1) AS latest_element_count subquery to the list SELECT
GAP-13  No ETag headers returned, no If-Match parsing   Pascal returns ETag: "<version>" on every GET; parses If-Match on writes
GAP-17  No GET /api/projects/:id/status with graph hash — every project open transfers the full snapshot even if unchanged      Add status endpoint returning { latestVersionHash } so client skips download on hash match
🟢 Low — polish
#       Gap
GAP-16  Zero automated tests for projectStore.js and projectAccess.js. Pascal has 327-line test suite with full round-trip, conflict, cascade, corruption, and size coverage
What PRYZM does better than the reference
Area    PRYZM advantage
Multi-tier fallback     Supabase → PG → in-memory cascade. Pascal is single-backend only
Idempotency keys        Version deduplication across all 3 tiers on retry storms. Pascal has none
Client-side DEFLATE     4–8× compression before localStorage write. Pascal stores raw JSON
Plan-enforced version limits    Server-side gate with plan hierarchy. Pascal has no plan model
ISO 19650 audit trail   version_audit_log with state machine (state, revision_code, suitability_code)
Webhook delivery        model.saved events pushed to registered URLs. Pascal has no notifications
Thumbnail pipeline      Capture → compress → upload → serve from hub. Pascal has a URL field only
Real-time collaboration Socket.io rooms with CRDT ops and presence. Pascal uses SSE polling only
The full analysis is written to docs/audit/PROJECT_STORAGE_AUDIT.md with every gap, every code location, and the full fix roadmap with time estimates.



> **Stamp**: 2026-05-14 (updated 2026-05-14) · **Status**: ✅ COMPLETE — All P0, P1, P2 tasks DONE (GAP-06, GAP-11, GAP-12, GAP-13 closed in follow-up pass)
> **Sprint**: S140 · **Auditor**: PRYZM Engineering
> **Source authority**: `docs/audit/PROJECT_STORAGE_AUDIT.md` (17-gap Pascal reference comparison) · `docs/C05-PERSISTENCE-AND-FILE-FORMAT.md §1.3` (project isolation invariant) · `docs/C08-COLLABORATION-AND-SECURITY.md §2.2` (server-side ownership gate) · `docs/02-decisions/contracts/C00-INDEX.md`
> **Anchored to**: `01-VISION.md §2` (P6 — Commands are the only state mutation path; P8 — Sync conflicts are explicit) · `02-ARCHITECTURE.md §5` (persistence tier) · `C05-PERSISTENCE-AND-FILE-FORMAT.md §1.2–§1.3` · `C08 §4` (server is the authoritative gate for all plan/size limits)
> **⚠ TRACKER RULE**: Any task status change → update `../00-PROCESS-TRACKER.md` in the same commit.

---

## §0 — What this sprint delivers and why

A systematic comparison of PRYZM's project-storage stack against the Pascal reference implementation (`pascalorg/editor/`) identified **17 distinct correctness, robustness, and observability gaps**. The full audit is at `docs/audit/PROJECT_STORAGE_AUDIT.md`.

This sprint documents and applies all **P0 (critical)** and **P1 (high)** fixes, plus the highest-impact **P2 (medium)** improvements. The goal is to make the storage layer safe for multi-user production, not merely functional for single-user development.

**Architectural principles addressed:**

| Principle | Mechanism |
|---|---|
| P6 — Commands are the only state mutation path | All version writes now go through a single atomic path (`createVersionTransactional`) |
| P8 — Sync conflicts are explicit | Ownership conflicts now surface as typed 409 errors, not silent no-ops |
| C05 §1.3 — Project isolation invariant | Three-tier enforcement: RLS → server ownership check → Socket.io guard |
| C08 §4 — Server is the authoritative gate | Server now enforces snapshot size, version limits, and plan limits with typed errors |

---

## §1 — Full Task Ledger

> STATUS values: `TODO` · `IN-PROGRESS` · `DONE` · `DEFERRED`

### Phase A — P0 Critical Fixes

| ID | Gap | Task | Contract | STATUS |
|---|---|---|---|---|
| S140-T01 | GAP-02 | Switch `GET /api/projects/:id` from `.single()` to `.maybeSingle()` so DB outages return 500 not 404 | C05 §1.3 | `DONE ✅` 2026-05-14 |
| S140-T02 | GAP-14 | Remove manual `DELETE FROM project_versions` before project delete — rely on `ON DELETE CASCADE` | C05 §6 | `DONE ✅` 2026-05-14 |
| S140-T03 | GAP-15 | Make `listVersions(projectId, userId)` require userId; add `listVersionsAdmin` for internal callers | C05 §1.3 | `DONE ✅` 2026-05-14 |

### Phase B — P1 High-Priority Fixes

| ID | Gap | Task | Contract | STATUS |
|---|---|---|---|---|
| S140-T04 | GAP-01 | Transaction isolation: `withTransaction` + `createVersionTransactional` + `pryzm_save_version` RPC | C05 §1.3, C08 §2.2 | `DONE ✅` 2026-05-14 |
| S140-T05 | GAP-03 | Post-upsert ownership verification on all 3 storage paths | C05 §1.3, C08 §2.2 | `DONE ✅` 2026-05-14 |
| S140-T06 | GAP-05 | Server-side snapshot size cap — 50 MB → `SnapshotTooLargeError` → HTTP 413 | C05 §6, C08 §4 | `DONE ✅` 2026-05-14 |
| S140-T07 | GAP-07 | Typed error classes + `handleProjectApiError` central handler in `server/errors.js` | C05 §1.3, C08 §4 | `DONE ✅` 2026-05-14 |

### Phase C — P2 Medium Priority Improvements

| ID | Gap | Task | Contract | STATUS |
|---|---|---|---|---|
| S140-T08 | GAP-04 | ID entropy: `crypto.randomBytes(6)` hex, `isValidProjectId` + `isValidVersionId` guards | C05 §6, C08 §1 | `DONE ✅` 2026-05-14 |
| S140-T09 | GAP-08 | `touchProject` atomic increment: `version_count + 1` instead of full re-count | C05 §1.3 | `DONE ✅` 2026-05-14 |
| S140-T10 | GAP-09 | DB-level CHECK constraints for `projects.name` length and `project_versions.element_count` | C05 §6 | `DONE ✅` 2026-05-14 |
| S140-T11 | GAP-17 | `GET /api/projects/:id/status` lightweight metadata endpoint (no snapshot) | C05 §3 | `DONE ✅` 2026-05-14 |
| S140-T12 | GAP-16 | Automated storage tests — `server/projectStore.test.js` covering all critical paths | C05 §1.3, C10 §1 | `DONE ✅` 2026-05-14 |
| S140-T13 | GAP-13 | ETag headers on `GET /api/projects/:id`, `/status`, `/latest-version` (all 3 backends) | C05 §3 | `DONE ✅` 2026-05-14 |
| S140-T14 | GAP-06 | Optimistic locking: `If-Match: "vN"` header on `POST /api/projects/:id/versions` → 412 on mismatch; atomic on PG path (FOR UPDATE lock), advisory on Supabase path | C05 §1.3, C08 §2.2 | `DONE ✅` 2026-05-14 |
| S140-T15 | GAP-12 | List response: `LEFT JOIN LATERAL` in `listProjects` adds `latest_element_count` + `is_empty` per project | C05 §3 | `DONE ✅` 2026-05-14 |
| S140-T16 | GAP-11 | `GET /api/projects/:id/command-log?after=<ISO8601>` — paginated delta replay endpoint with ownership check (PG + Supabase + in-memory paths) | C05 §3, C08 §2.1 | `DONE ✅` 2026-05-14 |

---

## §2 — Detailed Implementation per Task

---

### S140-T01 — GAP-02: `.single()` → `.maybeSingle()`

**File**: `server.js`

**Problem**: `.single()` throws on 0 rows (PGRST116) AND on network errors, both caught as silent 404. A database outage looks like "project not found" to the client, preventing retry or alerting.

**Fix**:
```js
// Before (GAP-02)
const { data, error } = await supabase.from('projects')
    .select('*').eq('id', id).eq('owner_id', userId).single();
if (error) return res.status(404).json({ error: 'Not found' });

// After (FIXED)
const { data, error } = await supabase.from('projects')
    .select('*').eq('id', id).eq('owner_id', userId).maybeSingle();
if (error) {
    console.error('[api/projects/:id] Supabase error:', error.message);
    return res.status(500).json({ error: 'Database error', detail: error.message });
}
if (!data) return res.status(404).json({ error: 'Project not found' });
```

**Why correct**: `.maybeSingle()` returns `data = null` (not an error) for 0 rows. Real DB errors surface as a non-null `error` object → 500. Semantically correct, operationally observable.

---

### S140-T02 — GAP-14: Cascade-only delete

**File**: `server/projectStore.js`

**Problem**: Two sequential DELETE statements. Server crash between them → orphaned `project_versions` rows with no parent. Also: a concurrent INSERT between the two DELETEs creates a version row that immediately becomes orphaned.

**Fix**:
```js
// Before (GAP-14) — two-step, non-atomic
await query(`DELETE FROM project_versions WHERE project_id = $1`, [projectId]);
const result = await query(`DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id`, [projectId, userId]);

// After (FIXED) — one statement; DB cascade handles versions atomically
const result = await query(
    `DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id`,
    [projectId, userId]
);
```

**Why correct**: `project_versions` declares `REFERENCES projects(id) ON DELETE CASCADE`. A single `DELETE FROM projects` cascades to all version rows in the same transaction. No partial state possible.

---

### S140-T03 — GAP-15: `listVersions` required userId

**File**: `server/projectStore.js`

**Problem**: `if (userId)` — when called without a userId (internal server code, test harness), the ownership check is silently skipped and ALL versions are returned for the project.

**Fix**:
```js
// Before — optional userId
export async function listVersions(projectId, userId) {
    if (userId) { /* ownership check */ }
    // ... returns all versions when userId is absent

// After — required userId (refuses with empty array + error log)
export async function listVersions(projectId, userId) {
    if (!userId) {
        console.error('[projectStore] listVersions called without userId — refusing (GAP-15)');
        return [];
    }
    // ownership check always runs
    ...
}

// New: server-internal escape hatch
export async function listVersionsAdmin(projectId) { ... }
```

---

### S140-T04 — GAP-01: Atomic write-transaction isolation

**Files**: `server/pgClient.js`, `server/projectStore.js`, `server/schema.sql`, `server/supabaseMigrate.js`, `server.js`

**Problem**: Three sequential Supabase calls with no transaction on `POST /api/projects/:id/versions`. A race between two concurrent saves can both pass the version-count check and both insert, exceeding plan limits.

**PG path fix — `withTransaction` + `createVersionTransactional`**:

`server/pgClient.js` exports:
```js
export async function withTransaction(fn) {
    const client = await _pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

`createVersionTransactional` in `server/projectStore.js` runs 5 steps inside a single `BEGIN/COMMIT`:
1. `SELECT … FOR UPDATE` on the project row — serialises concurrent saves for the same project
2. If project doesn't exist: `INSERT INTO projects … ON CONFLICT DO NOTHING`
3. If project exists: verify `owner_id === userId` (throws `ProjectConflictError` on mismatch)
4. `COUNT` existing versions inside the lock (TOCTOU-safe; enforces plan limits)
5. `INSERT INTO project_versions … ON CONFLICT DO NOTHING` (idempotency)
6. `UPDATE projects SET version_count = …` atomically

**Supabase path fix — `pryzm_save_version` PL/pgSQL RPC**:

`server/schema.sql` appends a `SECURITY DEFINER` function that does the same 5 steps in a server-side PG transaction. The route calls `supabase.rpc('pryzm_save_version', {...})` first; if the function is not yet applied (error PGRST202), it falls back to the sequential path gracefully.

`server/supabaseMigrate.js` probes for the function at startup and logs a boxed operator warning with the SQL to apply if it is missing.

**Race condition closed**: Two concurrent auto-saves targeting the same `projectId` will both try to acquire `FOR UPDATE` on the projects row. One will succeed; the other will block until the first COMMIT, then see the updated `version_count` and either proceed (if within limit) or receive a `VersionLimitError`.

---

### S140-T05 — GAP-03: Post-upsert ownership verification

**Files**: `server.js`, `server/projectStore.js`, `server/errors.js`

**Problem**: `ignoreDuplicates: true` upsert means a concurrent insert from a different user becomes a silent no-op. No feedback to the caller. The PG path had no ownership check inside the version-save path.

**Supabase path fix** (`server.js`): After the upsert, immediately read back the project row and compare `owner_id` to `req.auth.userId`. On mismatch → `ProjectConflictError` → HTTP 409.

**PG path fix** (`createVersionTransactional`): Inside the `FOR UPDATE` lock, step 2b checks `existingOwnerId !== userId` and throws `ProjectConflictError`. The conflict is detected and rejected before any data is written.

**SQL upsert fix** (`upsertProject` in `server/projectStore.js`):
```sql
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, updated_at = NOW()
WHERE projects.owner_id = EXCLUDED.owner_id
```
The `WHERE` clause means a different user's upsert becomes a no-op at the SQL level, rather than overwriting the project name.

---

### S140-T06 — GAP-05: Server-side snapshot size cap

**Files**: `server.js`, `server/errors.js`

**Problem**: No byte-length check. A 100 MB snapshot is passed directly to Supabase JSONB. Supabase's nginx layer returns an unstructured 413 the client can't distinguish from a network error.

**Fix** (runs before Zod validation and before any DB write):
```js
const snapshotJson = JSON.stringify(snapshot);
const snapshotBytes = Buffer.byteLength(snapshotJson, 'utf8');
if (snapshotBytes > SNAPSHOT_LIMIT_BYTES) {
    throw new SnapshotTooLargeError(snapshotBytes, SNAPSHOT_LIMIT_BYTES);
}
```

`SNAPSHOT_LIMIT_BYTES = 50 * 1024 * 1024` (50 MB — generous for BIM, safe for Supabase JSONB).

`SnapshotTooLargeError` → `handleProjectApiError` → HTTP 413:
```json
{
  "error": "Snapshot too large: 55574528 bytes (limit: 52428800 bytes)",
  "code": "snapshot_too_large",
  "sizeBytes": 55574528,
  "limit": 52428800
}
```

The client can switch on `code === 'snapshot_too_large'` and display a targeted "model is too large" message rather than a generic network error.

---

### S140-T07 — GAP-07: Typed error classes + central handler

**File**: `server/errors.js` (new file)

**Problem**: All error paths used `catch (err) { res.status(500).json({ error: String(err) }) }`, leaking PostgREST internal messages to clients and making client-side error handling impossible.

**Fix**: 6 typed error classes, all following the same shape:

| Class | HTTP | `code` | Extra fields |
|---|---|---|---|
| `ProjectNotFoundError` | 404 | `project_not_found` | `projectId` |
| `ProjectAccessDeniedError` | 403 | `project_access_denied` | `projectId` |
| `SnapshotTooLargeError` | 413 | `snapshot_too_large` | `sizeBytes`, `limitBytes` |
| `VersionLimitError` | 403 | `version_limit_reached` | `plan`, `limit`, `current` |
| `ProjectConflictError` | 409 | `project_conflict` | `projectId` |
| `SnapshotInvalidError` | 400 | `snapshot_invalid` | `issues` |

`handleProjectApiError(err, res, ctx)` is the single catch-point:
- Typed errors → their declared `statusCode` + structured JSON body
- Unknown errors → HTTP 500 + `{ error: 'Internal server error', code: 'server_error' }` — no internal detail leaked

**Client contract**: Every error response from project routes now has at least `{ error: string, code: string }`. Clients can `switch(code)` to display targeted UI (upgrade prompt, size warning, conflict resolution, etc.).

---

### S140-T08 — GAP-04: ID entropy + allowlist validation

**File**: `server/projectStore.js`

**Problem**: `Math.random()` generates 5 base-36 chars (~60 million values). With 1,000 projects, collision probability ≈ 1 in 60,000. No server-side validation of caller-supplied IDs (path traversal risk).

**Fix**:
```js
import { randomBytes } from 'crypto';

function generateId(prefix) {
    // 6 bytes = 12 hex chars = 48 bits of entropy.
    // Collision probability with 1M projects: < 1 in 10^10.
    return `${prefix}-${Date.now()}-${randomBytes(6).toString('hex')}`;
}

// Allowlist validators — accept both legacy base-36 and new hex format
const PROJECT_ID_RE = /^proj-\d{10,16}-[a-z0-9]{5,16}$/;
const VERSION_ID_RE = /^ver-\d{10,16}-[a-z0-9]{5,16}$/;

export function isValidProjectId(id) {
    return typeof id === 'string' && PROJECT_ID_RE.test(id);
}
export function isValidVersionId(id) {
    return typeof id === 'string' && VERSION_ID_RE.test(id);
}
```

**Validation applied in routes** (`server.js`): `GET /api/projects/:id`, `DELETE /api/projects/:id`, `PATCH /api/projects/:id/thumbnail`, `GET /api/projects/:id/versions`, and `POST /api/projects/:id/versions` all call `isValidProjectId(req.params.id)` and return HTTP 400 on failure.

**Backward compatibility**: The regex `[a-z0-9]{5,16}` accepts both the old 5-7 char base-36 format and the new 12 char hex format. No existing project IDs are invalidated.

---

### S140-T09 — GAP-08: `touchProject` atomic increment

**File**: `server/projectStore.js`

**Problem**: `touchProject` does a full re-count (`SELECT COUNT(*) FROM project_versions`) which is non-atomic relative to the caller's version insert. A concurrent insert between the insert and the touchProject call results in a stale `version_count`.

**Fix**:
```sql
-- Before (non-atomic recount)
UPDATE projects
SET updated_at = NOW(),
    version_count = (SELECT COUNT(*) FROM project_versions WHERE project_id = $1)
WHERE id = $1

-- After (atomic increment — a single SQL statement, no TOCTOU)
UPDATE projects
SET updated_at = NOW(),
    version_count = version_count + 1
WHERE id = $1
```

**Note**: `createVersionTransactional` (the PG transactional path) still uses the full recount inside the `FOR UPDATE` lock, which is correct there because the count is needed for the plan limit check. `touchProject` (called from the Supabase/legacy path) uses the atomic increment since it runs after the version is already inserted.

---

### S140-T10 — GAP-09: DB-level CHECK constraints

**File**: `server/dbMigrate.js`

**Problem**: No CHECK constraints on the schema. Invalid data (empty name, negative element_count, empty label) can be inserted at the application level if a validation check is missed.

**Fix** (added to the idempotent `columnMigrations` array, wrapped in try/catch):
```sql
ALTER TABLE projects ADD CONSTRAINT chk_projects_name_len
    CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

ALTER TABLE project_versions ADD CONSTRAINT chk_pv_element_count
    CHECK (element_count >= 0);

ALTER TABLE project_versions ADD CONSTRAINT chk_pv_label_len
    CHECK (char_length(label) >= 1);
```

**Also applied in `server/schema.sql`** (Supabase path): CHECK constraints added inline to the `CREATE TABLE` statements for `projects` and `project_versions`.

**Defense in depth**: The server validates names via Zod before writing. The DB constraint is a second layer that catches any future bypass (direct SQL, migration scripts, test fixtures).

---

### S140-T11 — GAP-17: `GET /api/projects/:id/status`

**Files**: `server.js`, `server/projectStore.js`

**Problem**: `GET /api/projects/:id` returns only the project row. Every project open requires a full snapshot download (28 MB observed in browser logs) even when the client already has the same version in memory.

**New endpoint**:
```
GET /api/projects/:id/status
Authorization: Bearer <token>

→ 200 {
    id:                        string,
    name:                      string,
    versionCount:              number,
    updatedAt:                 ISO8601,
    latestVersionId:           string | null,
    latestVersionLabel:        string | null,
    latestVersionCreatedAt:    ISO8601 | null,
    latestElementCount:        number,
    isEmpty:                   boolean   // true when no versions exist
  }
→ 401 — not authenticated
→ 400 — invalid project ID format
→ 404 — project not found or not owned by caller
```

**`getProjectStatus(projectId, userId)` in `server/projectStore.js`**: Single query with a `LEFT JOIN LATERAL` to get the most recent version metadata without touching the `snapshot` column (which can be 50+ MB).

**Client usage pattern**:
```js
const status = await fetch(`/api/projects/${id}/status`).then(r => r.json());
if (status.isEmpty) showEmptyCanvas();
else if (cachedVersionId === status.latestVersionId) restoreFromCache(); // skip download
else loadFullSnapshot(status.latestVersionId);
```

---

### S140-T12 — GAP-16: Automated storage tests

**File**: `server/projectStore.test.js`

**Problem**: Zero automated tests for the storage layer. The only CI guards were static-analysis scripts that check registration and key scoping.

**Fix**: `server/projectStore.test.js` using Node.js built-in `node:test` + `node:assert`. Test categories:

1. **ID generation** — entropy, uniqueness, format validity, `isValidProjectId` allowlist
2. **`touchProject` increment** — verifies SQL uses `version_count + 1` (atomic)
3. **`listVersions` userId guard** — refuses without userId, delegates to listVersionsAdmin
4. **`createVersionTransactional` structure** — verifies FOR UPDATE lock, ownership check, idempotency key
5. **`deleteProject` cascade** — verifies no manual version delete (single DELETE only)
6. **Error classes** — all 6 classes shape-verified (statusCode, code, extra fields)
7. **`handleProjectApiError`** — maps each error type to correct HTTP status

**Run**: `node --test server/projectStore.test.js`

---

## §3 — Architecture assessment

### What changed at the storage boundary

```
Before this sprint                    After this sprint
──────────────────────────────────    ─────────────────────────────────────────
Math.random() IDs (low entropy)   →   crypto.randomBytes(6) hex IDs (48-bit)
No ID validation on ingress       →   isValidProjectId() on all routes
.single() swallows DB errors      →   .maybeSingle() + 404/500 distinction
Manual 2-step delete              →   Single DELETE + ON DELETE CASCADE
listVersions(id) bypasses auth    →   listVersions(id, userId) requires userId
No write transaction              →   withTransaction + FOR UPDATE on PG path
                                      pryzm_save_version() RPC on Supabase path
No post-upsert ownership check    →   Immediate read-back + ProjectConflictError
No snapshot size cap              →   SnapshotTooLargeError at 50 MB
String(err) in every catch        →   6 typed error classes + handleProjectApiError
touchProject full recount         →   version_count + 1 atomic increment
No DB CHECK constraints           →   3 CHECK constraints (name len, elem count, label)
No lightweight status endpoint    →   GET /api/projects/:id/status (no snapshot)
Zero storage tests                →   server/projectStore.test.js (7 categories)
```

### Remaining open items

| Gap | Priority | Effort | Notes |
|---|---|---|---|
| GAP-10: Draft/checkpoint save modes | P3 | 1 week | ISO 19650 CDE state machine already in schema; `project_versions` becomes checkpoint-only, new `project_drafts` table for auto-save working state. Deferred — does not block current production. |

GAP-06, GAP-11, GAP-12, and GAP-13 are now **DONE** (see S140-T13–T16 above).

GAP-10 does not block production. It is the only item deferred to a future sprint when CDE workflow maturity is targeted.

---

## §4 — Verification record

| Check | Result | Date |
|---|---|---|
| Contract 45 — ProjectIsolationAudit (`check-project-isolation.mjs`) | ✅ PASS | 2026-05-14 |
| Contract 48 — StorageIsolationAudit (`check-storage-isolation.mjs`) | ✅ PASS | 2026-05-14 |
| All 7 typed error classes — shape verified (incl. `PreconditionFailedError`) | ✅ PASS | 2026-05-14 |
| `withTransaction` export | ✅ PASS | 2026-05-14 |
| `createVersionTransactional` — 5-step structure + GAP-06 lock | ✅ PASS | 2026-05-14 |
| Size-cap boundary logic (over/under/handler) | ✅ PASS | 2026-05-14 |
| `ProjectConflictError` → 409 | ✅ PASS | 2026-05-14 |
| `PreconditionFailedError` → 412 with expected/actual | ✅ PASS | 2026-05-14 |
| `VersionLimitError` → 403 with plan/limit/current | ✅ PASS | 2026-05-14 |
| `isValidProjectId` allowlist — valid/invalid cases | ✅ PASS | 2026-05-14 |
| `touchProject` uses atomic increment SQL | ✅ PASS | 2026-05-14 |
| `listVersions` refuses null userId | ✅ PASS | 2026-05-14 |
| `deleteProject` uses single DELETE only | ✅ PASS | 2026-05-14 |
| DB CHECK constraints applied | ✅ PASS | 2026-05-14 |
| `GET /api/projects/:id/status` returns correct shape + ETag | ✅ PASS | 2026-05-14 |
| `GET /api/projects/:id` returns ETag header | ✅ PASS | 2026-05-14 |
| `GET /api/projects/:id/latest-version` returns ETag header | ✅ PASS | 2026-05-14 |
| `POST /api/projects/:id/versions` with `If-Match: "v0"` returns 201 (no-op path) | ✅ PASS | 2026-05-14 |
| `POST /api/projects/:id/versions` with wrong `If-Match` returns 412 | ✅ PASS | 2026-05-14 |
| `listProjects` returns `latest_element_count` + `is_empty` | ✅ PASS | 2026-05-14 |
| `GET /api/projects/:id/command-log` returns `{ commands, hasMore, nextCursor }` | ✅ PASS | 2026-05-14 |
| `GET /api/projects/:id/command-log` without auth returns 401 | ✅ PASS | 2026-05-14 |
| `getCommandLogAfter` honours `after` cursor and `limit` cap | ✅ PASS | 2026-05-14 |
| Server starts clean (no errors in logs) | ✅ PASS | 2026-05-14 |
| App renders in preview | ✅ PASS | 2026-05-14 |
