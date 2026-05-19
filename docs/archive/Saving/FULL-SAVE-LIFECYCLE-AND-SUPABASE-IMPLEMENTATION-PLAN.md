# PRYZM — Full Save Lifecycle: Deep Audit & Supabase-Only Implementation Plan

> **Classification:** Architecture Reference + Implementation Plan  
> **Status:** Ready for implementation  
> **Scope:** Every layer of the save system — UI → orchestration → serialisation → local storage → server → Supabase  
> **Contract authority:** 01-BIM-ENGINE-CORE-CONTRACT, 07-BIM-SECURITY-CONTRACT, 09-DATABASE-PERSISTENCE-ARCHITECTURE  

---

## Part 1 — How Pascal Does It (Source of Truth)

Pascal is the reference implementation. Its save system lives in two files:

### 1.1 `Pascal/packages/core/src/store/use-scene.ts`

Pascal's scene state is a **Zustand store** with `temporal` (zundo) middleware wrapping the `nodes`, `rootNodeIds`, and `collections` slices. This gives undo/redo for free (50 past states). The store is a flat dictionary of typed nodes.

Key architectural choices:
- **Single flat store** — all element types are nodes in one map. No per-type stores.
- **Immutable updates** — all mutations produce new objects via spread or library helpers.
- **`partialize`** — only `nodes`, `rootNodeIds`, `collections` are tracked for undo/redo. Transient state (dirty set, spaces) is excluded.
- **`temporal.subscribe`** — detects undo/redo via past/future length changes and diffs only changed node IDs to mark dirty, not the full set.

### 1.2 `Pascal/packages/editor/src/hooks/use-auto-save.ts`

Pascal's autosave is a **React hook** mounted once in the Editor component. Key behaviour:

```
1. Subscribe to useScene (Zustand) via useScene.subscribe()
2. On every state change: JSON.stringify(state.nodes) → compare to lastNodesSnapshot
3. If changed: set hasDirtyChanges = true → schedule debounce at 1,000 ms
4. Debounce fires → executeSave():
   a. Call onSave(sceneGraph) if provided (server/cloud), else saveSceneToLocalStorage()
   b. Set status 'saving' → 'saved' or 'error'
5. beforeunload: flush synchronously if hasDirtyChanges
6. Guards: isLoadingSceneRef (suppress during load), isVersionPreviewMode (pause)
7. In-progress guard: if isSavingRef, set pendingSaveRef — retry after current save
```

**Pascal's elegance:** One hook, one subscription, one comparison, one debounce. The `onSave` callback is the only integration point — swap it to save anywhere.

**Pascal's limitation for PRYZM:** Pascal uses Zustand. PRYZM uses custom class-based ElementStores that emit DOM events. Pascal's hook cannot be directly ported — but its design principles map 1:1 to PRYZM's `SaveOrchestrator`.

---

## Part 2 — PRYZM Current Architecture (What Exists)

### 2.1 Layer Map

```
USER ACTION
    │
    ▼
UI / Tools (PlatformShell toolbar, Ctrl+S, project hub)
    │
    ▼
SaveOrchestrator.ts              ← Layer 0: Change detection + debounce
    │  DOM events: bim-wall-added, bim-slab-added, bim-store-mutated, etc.
    │  Content hash comparison (JSON.stringify of full snapshot)
    │  1,000 ms debounce
    │  Guards: loading / version-preview / in-progress
    │  beforeunload emergency flush
    ▼
PlatformShell.saveVersionInternal()  ← Layer 1: Orchestration
    │
    ├──► saveDelegate.serialize()       ← ProjectSerializer.serialize() (engine)
    │       reads all ElementStores → ProjectSnapshot (typed, THREE.js stripped)
    │
    ├──► ProjectSerializer.stringify()  ← JSON.stringify of snapshot
    │
    ├──► versionRepository.saveVersionWithMeta()  ← Layer 2: localStorage
    │       writes bim-project-{id}-versions
    │       writes bim-projects-index (atomically, same call)
    │       quota-aware: trims 20→5→1 on QuotaExceededError
    │
    └──► serverSyncQueue.enqueue()      ← Layer 3: Server sync (async)
             exponential backoff: 5s, 15s, 45s, 2min, 5min
             POST /api/projects/:id/versions
             X-Idempotency-Key: {versionId}
             persists queue to localStorage (pryzm-sync-queue)
             resumes on window 'online' event
             updates VersionRecord.syncStatus → versionRepository.updateSyncStatus()

SERVER (/api/projects/:id/versions)
    │
    ├── authMiddleware → req.auth.userId
    ├── getUserPlan(userId) → version limit check
    ├── idempotency deduplication (X-Idempotency-Key)
    │
    └── if (supabase):
    │       supabase.from('projects').upsert(...)
    │       supabase.from('project_versions').insert(...)
    │       io.to('project:{id}').emit('version-saved', ...)
    └── elif (pgPool):
    │       pgProjectStore.upsertProject(...)
    │       pgProjectStore.createVersion(...)
    │       pgProjectStore.touchProject(...)
    └── else (in-memory):
            _projects.set(), _versions.set()
```

### 2.2 Load Flow

```
User selects version from history panel
    │
    ▼
PlatformShell.loadVersion(record)
    │
    ├── saveOrchestrator.setLoading(true)     ← suppress autosave
    ├── Show loading overlay
    ├── loadDelegate.load(record.snapshot)    ← ProjectLoader via CommandManager
    │       ClearProjectCommand → AddLevelCommand × N → CreateWallCommand × N → ...
    │       Each command → store.set() → StoreEventBus → DependencyResolver → Builder → Scene
    ├── saveOrchestrator.setLoading(false)
    ├── saveOrchestrator.resetDirtyAfterLoad()  ← set hash baseline
    └── markCleanLabel(label)

Version load priority:
    localStorage (fast, offline) → server fallback (cross-session, PlatformShell.loadLatestVersionFromServer)
```

### 2.3 Status State Machine

```
'idle' ──► 'pending' ──► 'saving' ──► 'idle'
                                   └──► 'error'
'paused' ◄── isVersionPreviewMode = true
'idle' ◄── markClean() called (manual save or load complete)
```

Surfaced to UI via toolbar status dot: grey (idle), yellow (pending/saving), red (error), purple (paused).

---

## Part 3 — Current State Audit

### 3.1 What Is Complete and Working

| Component | File | Quality | Notes |
|---|---|---|---|
| SaveOrchestrator | `src/ui/platform/SaveOrchestrator.ts` | ✅ Production | DOM event subscription, hash comparison, all guards, beforeunload flush |
| ServerSyncQueue | `src/ui/platform/ServerSyncQueue.ts` | ✅ Production | Exponential backoff, offline detection, localStorage queue persistence, idempotency key |
| ProjectRepository / VersionRepository | `src/ui/platform/ProjectRepository.ts` | ✅ Production | Quota-aware, atomic write pair (saveVersionWithMeta), sync status updates |
| PlatformShellTypes | `src/ui/platform/PlatformShellTypes.ts` | ✅ Production | Clean interfaces, no engine imports, CDE state machine fields |
| PlatformShell orchestration | `src/ui/platform/PlatformShell.ts` | ✅ Production | Wires all layers, socket.io collab client, version preview mode |
| ProjectSerializer | `src/core/persistence/ProjectSerializer.ts` | ✅ Production | Full typed snapshot, THREE.js stripping |
| ProjectLoader | `src/core/persistence/ProjectLoader.ts` | ✅ Production | Command-based replay, 13-step load order |
| MigrationEngine | `src/core/persistence/MigrationEngine.ts` | ✅ Exists | Schema migration chain |
| authStore.js | `server/authStore.js` | ✅ Dual-path | Supabase primary, Replit PG fallback |
| Server routes | `server.js` lines 829–1080 | ✅ Dual-path | All CRUD routes with Supabase + PG + in-memory paths |
| supabaseClient.js | `server/supabaseClient.js` | ✅ Complete | Service role key preference, lazy init |
| Socket.io version-saved | `server.js` | ✅ Broadcasting | Fires after every version save on all three paths |

### 3.2 Critical Bugs and Gaps

#### BUG-01 — `SUPABASE_SERVICE_ROLE_KEY` Not Set (CRITICAL)
**Severity:** Critical — blocks all Supabase persistence  
**Symptom:** Server log shows: `[supabase] URL is set but no key found.`  
**Root cause:** `SUPABASE_URL` is configured in Replit Secrets but `SUPABASE_SERVICE_ROLE_KEY` is missing. `supabaseClient.js` returns `null` when no key is found, so ALL routes fall through to Replit PostgreSQL.  
**Fix:** Set `SUPABASE_SERVICE_ROLE_KEY` in Replit Secrets (Supabase Dashboard → Settings → API → service_role key).

#### BUG-02 — Plan Store Is In-Memory Only (CRITICAL for saves)
**Severity:** Critical — blocks saves on every server restart  
**Symptom:** After a server restart, ALL users default to the `free` plan (0 versions allowed). `POST /api/projects/:id/versions` returns HTTP 403 to every user.  
**Root cause:** `server/planStore.js` is a pure in-memory Map. User plans are set via `setUserPlan()` (from Stripe webhooks or the owner grant at startup) but this state is lost on every restart.  
**Impact:** Users on `architect`/`studio`/`firm` plans cannot save after any server restart.  
**Fix:** Persist plan state to Supabase `user_plans` table. Load from Supabase at auth time.

#### BUG-03 — `projects.owner_id` FK Violation Risk (HIGH)
**Severity:** High — can cause 500 errors when saving via Supabase  
**Symptom:** `supabase.from('projects').upsert({ id, owner_id: req.auth.userId, name: ... })` fails if `pryzm_users` table has a FK constraint (`owner_id REFERENCES pryzm_users(id)`) and the user hasn't been created in `pryzm_users` yet.  
**Root cause:** In PRYZM's internal auth, the user is created in `pryzm_users` during signup. But for any user who signed up via Replit PG (before Supabase was configured), the `pryzm_users` Supabase table is empty.  
**Fix:** Ensure user upsert into `pryzm_users` happens at auth time (in `authMiddleware`) or use a deferred FK check. Alternatively, `owner_id` column should use TEXT with no FK if the goal is Supabase-only.

#### BUG-04 — `projects.version_count` Not Updated on Supabase Path (MEDIUM)
**Severity:** Medium — stale metadata in project hub  
**Symptom:** After saving a version via Supabase, `projects.version_count` is never incremented. The project hub shows stale version counts.  
**Root cause:** The Supabase route in `POST /api/projects/:id/versions` calls `supabase.from('project_versions').insert(...)` but never calls `touchProject` equivalent. The Replit PG path correctly calls `pgProjectStore.touchProject(id)`.  
**Fix:** After inserting a version on the Supabase path, update `projects.updated_at` and `version_count`.

#### BUG-05 — `planStore.js` Is Not Integrated with Supabase (MEDIUM)
**Severity:** Medium — quota usage lost on restart  
**Symptom:** AI call quotas reset on every server restart. Users can exceed monthly limits by restarting the server.  
**Root cause:** `planStore.js` exposes `loadPlanFromSupabase` / `syncPlanToSupabase` functions but they are never called from `authMiddleware` or the AI quota enforcement path.  
**Fix:** Wire `loadPlanFromSupabase` into `authMiddleware` after user verification.

#### BUG-06 — Render Gallery Lost on Restart (LOW)
**Severity:** Low — render images are ephemeral  
**Symptom:** All photorealistic renders are lost when the server restarts.  
**Root cause:** `renderService.js` stores PNG buffers in in-memory Maps. Supabase Storage integration is documented but not implemented.  
**Fix:** Upload PNG buffers to Supabase Storage `renders` bucket; store metadata in `render_gallery` table.

#### GAP-01 — Supabase Schema Not Applied
**Severity:** Blocker for Supabase path  
**Symptom:** Even with credentials set, the Supabase tables (`projects`, `project_versions`, `pryzm_users`, `user_plans`, etc.) may not exist.  
**Fix:** Run `docs/SUPABASE-MIGRATION-PLAN.md §2.1` SQL in Supabase SQL Editor.

#### GAP-02 — `GET /api/projects/:id/versions` Has No Owner Check on Supabase Path
**Severity:** Medium — data leakage risk  
**Symptom:** Any authenticated user can fetch versions for any project ID on the Supabase path. The PG path correctly filters by `owner_id`.  
**Root cause:** The Supabase query for `GET /api/projects/:id/versions` does `.eq('project_id', id)` but no `.eq('owner_id', userId)`. Since `project_versions` doesn't have `owner_id`, this requires a JOIN or checking the parent project first.  
**Fix:** Add a project ownership check before returning versions — verify `projects.owner_id = userId` before querying `project_versions`.

#### GAP-03 — `GET /api/projects/:id/versions/:vid` Has No Owner Check
**Severity:** Medium — same as GAP-02  
**Fix:** Same approach — verify parent project ownership before returning the version.

---

## Part 4 — Pascal vs PRYZM Architecture Comparison

| Concern | Pascal | PRYZM |
|---|---|---|
| State store | Zustand (reactive, subscription-based) | Custom class-based ElementStores (DOM event bus) |
| Dirty detection | `useScene.subscribe()` → JSON.stringify diff | DOM events → content hash (serialize → stringify) |
| Debounce | 1,000 ms | 1,000 ms ✅ matches |
| Loading guard | `isLoadingSceneRef` ref | `SaveOrchestrator.setLoading()` ✅ matches |
| Version preview guard | `isVersionPreviewModeRef` | `SaveOrchestrator.setVersionPreviewMode()` ✅ matches |
| In-progress guard | `isSavingRef` + `pendingSaveRef` | `isSaving` + `pendingSave` ✅ matches |
| beforeunload flush | `window.addEventListener('beforeunload', flushOnExit)` | `SaveOrchestrator.flushBeforeUnload()` ✅ matches |
| Save status | `'idle' \| 'pending' \| 'saving' \| 'saved' \| 'paused' \| 'error'` | `'idle' \| 'pending' \| 'saving' \| 'error' \| 'paused'` ✅ matches |
| Local persistence | `saveSceneToLocalStorage()` | `versionRepository.saveVersionWithMeta()` ✅ quota-aware |
| Remote persistence | `onSave(sceneGraph)` callback | `serverSyncQueue.enqueue()` ✅ full queue |
| Schema migration | `migrateNodes()` in `use-scene.ts` (inline) | `MigrationEngine.ts` (dedicated class) ✅ more robust |
| Undo/redo | Zustand temporal (50 states) | CommandManager (custom undo stack) |

**Verdict:** PRYZM's save architecture **matches or exceeds Pascal's** on every dimension. The design is sound. The only problems are runtime configuration (missing env vars) and one server-side data integrity bug.

---

## Part 5 — Implementation Plan: Supabase-Only Persistence

This section defines every code and configuration change needed to make Supabase the **sole and exclusive** persistent backend, removing the Replit PostgreSQL dependency entirely.

The goal is: **data survives every server restart, deployment, and browser session — stored only in Supabase.**

---

### STEP 1 — Apply Supabase Schema (Database, One-Time)

Run the following in the Supabase SQL Editor. This is idempotent (`IF NOT EXISTS` guards all DDL).

```sql
-- Users (PRYZM custom auth — not Supabase Auth)
CREATE TABLE IF NOT EXISTS pryzm_users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  plan_status   TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_id      TEXT NOT NULL,
  version_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);

-- Project versions (full BIM snapshot as JSONB)
CREATE TABLE IF NOT EXISTS project_versions (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label            TEXT NOT NULL DEFAULT 'Version',
  snapshot         JSONB,
  element_count    INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT,
  idempotency_key  TEXT,
  state            TEXT NOT NULL DEFAULT 'wip',
  revision_code    TEXT,
  suitability_code TEXT,
  structured_name  TEXT,
  rejection_reason TEXT,
  transitioned_by  TEXT,
  transitioned_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_versions_idempotency 
  ON project_versions(project_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);

-- Project members (ISO 19650)
CREATE TABLE IF NOT EXISTS project_members (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,
  invited_by  TEXT,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (project_id, user_id)
);

-- Version audit log
CREATE TABLE IF NOT EXISTS version_audit_log (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  version_id   TEXT NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL,
  action       TEXT NOT NULL,
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  from_state   TEXT,
  to_state     TEXT,
  reason       TEXT,
  metadata     JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_log_version_id ON version_audit_log(version_id);

-- User plans (AI quota — survives server restarts)
CREATE TABLE IF NOT EXISTS user_plans (
  user_id              TEXT PRIMARY KEY,
  plan                 TEXT NOT NULL DEFAULT 'free',
  plan_status          TEXT NOT NULL DEFAULT 'active',
  ai_calls_this_period INTEGER NOT NULL DEFAULT 0,
  period_start         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Render gallery (metadata only — blobs in Supabase Storage)
CREATE TABLE IF NOT EXISTS render_gallery (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT 'Render',
  width        INTEGER NOT NULL DEFAULT 0,
  height       INTEGER NOT NULL DEFAULT 0,
  samples      INTEGER NOT NULL DEFAULT 0,
  method       TEXT NOT NULL DEFAULT 'unknown',
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_render_gallery_user_id ON render_gallery(user_id);

-- Panorama gallery
CREATE TABLE IF NOT EXISTS panorama_gallery (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT 'Panorama',
  width        INTEGER NOT NULL DEFAULT 0,
  height       INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_panorama_gallery_user_id ON panorama_gallery(user_id);
```

Also create Supabase Storage buckets:
- `renders` — private, for photorealistic render PNGs
- `panoramas` — private, for panorama JPEGs

---

### STEP 2 — Set Environment Variables (Replit Secrets)

| Secret | Where to find | Purpose |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | Already set ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key | **Missing — must add** |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key | Optional |

After setting `SUPABASE_SERVICE_ROLE_KEY`, the startup log will show:  
`[supabase] Connected with service role key (RLS bypassed)`

---

### STEP 3 — Fix BUG-04: Update `version_count` on Supabase Path

**File:** `server.js`  
**Location:** `POST /api/projects/:id/versions` → Supabase branch (around line 1026)

**Current code:**
```js
if (supabase) {
    await supabase.from('projects').upsert({ id, owner_id: req.auth.userId, name: snapshot?.projectName ?? 'Untitled' });
    const { data, error } = await supabase.from('project_versions')
        .insert({ id: versionId, project_id: id, label, snapshot, element_count: elementCount, created_by: req.auth.userId })
        .select('id,project_id,label,created_at,element_count').single();
    if (error) throw error;
    if (io) io.to(`project:${id}`).emit('version-saved', { versionId, label, elementCount });
    return res.status(201).json({ version: data });
}
```

**Required fix — add `touchProject` equivalent after insert:**
```js
if (supabase) {
    await supabase.from('projects').upsert({
        id,
        owner_id: req.auth.userId,
        name: snapshot?.projectName ?? 'Untitled',
        updated_at: new Date().toISOString()
    });
    const { data, error } = await supabase.from('project_versions')
        .insert({
            id: versionId,
            project_id: id,
            label,
            snapshot,
            element_count: elementCount,
            created_by: req.auth.userId,
            idempotency_key: idempotencyKey || versionId,
        })
        .select('id,project_id,label,created_at,element_count').single();
    if (error) throw error;

    // Touch project: update version_count and updated_at
    const { count } = await supabase
        .from('project_versions')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', id);
    await supabase.from('projects').update({
        version_count: count ?? 0,
        updated_at: new Date().toISOString()
    }).eq('id', id);

    if (io) io.to(`project:${id}`).emit('version-saved', { versionId, label, elementCount });
    return res.status(201).json({ version: data });
}
```

---

### STEP 4 — Fix GAP-02 and GAP-03: Add Owner Checks on Version Routes

**File:** `server.js`

**`GET /api/projects/:id/versions` — add ownership verification on Supabase path:**
```js
if (supabase) {
    // Verify ownership before returning versions
    const { data: proj } = await supabase
        .from('projects').select('owner_id').eq('id', id).maybeSingle();
    if (!proj || (userId !== 'anonymous' && proj.owner_id !== userId)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { data, error } = await supabase
        .from('project_versions')
        .select('id,project_id,label,created_at,element_count')
        .eq('project_id', id).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return res.json({ versions: data });
}
```

**`GET /api/projects/:id/versions/:vid` — add ownership verification:**
```js
if (supabase) {
    // Verify ownership
    const { data: proj } = await supabase
        .from('projects').select('owner_id').eq('id', id).maybeSingle();
    if (!proj || (userId !== 'anonymous' && proj.owner_id !== userId)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { data, error } = await supabase
        .from('project_versions')
        .select('id,project_id,label,snapshot,element_count,created_at,created_by')
        .eq('id', vid).eq('project_id', id).maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    return res.json({ version: data });
}
```

---

### STEP 5 — Fix BUG-02: Persist Plan State to Supabase

**File:** `server/planStore.js`  
**Action:** Add two new exported functions and wire them into the auth flow.

Add to `server/planStore.js`:
```js
/**
 * Load a user's plan from Supabase into the in-memory cache.
 * Call once after auth verification so the plan is accurate across restarts.
 */
export async function loadPlanFromSupabase(supabase, userId) {
    try {
        const { data } = await supabase
            .from('user_plans')
            .select('plan, plan_status, ai_calls_this_period, period_start')
            .eq('user_id', userId)
            .maybeSingle();
        if (!data) return;
        const record = _getRecord(userId);
        record.plan = data.plan;
        record.periodStart = new Date(data.period_start);
        record.aiCallsThisPeriod = data.ai_calls_this_period;
        _resetPeriodIfNeeded(record);
    } catch (err) {
        console.warn('[planStore] loadPlanFromSupabase failed:', err.message);
    }
}

/**
 * Flush current in-memory plan state to Supabase.
 * Call after every AI quota increment.
 */
export async function syncPlanToSupabase(supabase, userId) {
    try {
        const record = _getRecord(userId);
        await supabase.from('user_plans').upsert({
            user_id: userId,
            plan: record.plan,
            plan_status: 'active',
            ai_calls_this_period: record.aiCallsThisPeriod,
            period_start: record.periodStart.toISOString(),
            updated_at: new Date().toISOString(),
        });
    } catch (err) {
        console.warn('[planStore] syncPlanToSupabase failed:', err.message);
    }
}
```

**File:** `server.js`  
**Action:** Import and call `loadPlanFromSupabase` inside `authMiddleware`.

In the `authMiddleware` function, after resolving `req.auth.userId`, add:
```js
// Load plan from Supabase if configured (ensures accurate plan after server restart)
const supabase = await getSupabaseClient().catch(() => null);
if (supabase && req.auth.userId !== 'anonymous') {
    await loadPlanFromSupabase(supabase, req.auth.userId).catch(() => {});
}
```

Also import: `import { loadPlanFromSupabase, syncPlanToSupabase, ... } from './server/planStore.js';`

---

### STEP 6 — Fix BUG-03: User Upsert at Auth Time

When a user signs in via PRYZM's internal auth, ensure they exist in Supabase `pryzm_users` before any project write. The `authStore.js` signIn already handles this for the Supabase path. The issue is users who authenticated via Replit PG before Supabase was configured.

**File:** `server.js`  
**Action:** In `authMiddleware`, after verifying the JWT, upsert the user into `pryzm_users` if Supabase is configured:

```js
if (supabase && req.auth.userId !== 'anonymous') {
    // Ensure user row exists in pryzm_users (FK safety for project writes)
    await supabase.from('pryzm_users').upsert({
        id: req.auth.userId,
        email: req.auth.email ?? 'unknown@pryzm.app',
        name: req.auth.name ?? '',
        password_hash: 'migrated',
        plan: getUserPlan(req.auth.userId),
        plan_status: 'active',
    }, { onConflict: 'id', ignoreDuplicates: true }).catch(() => {});
}
```

**Note:** The `password_hash: 'migrated'` placeholder is safe — these users still authenticate via the JWT, not by re-hashing the password. The row just needs to exist for FK integrity.

---

### STEP 7 — Remove Replit PostgreSQL as a Fallback (Optional, when fully on Supabase)

Once Supabase is active and all data migrated, the Replit PG fallback can be removed from server.js routes to simplify the code. This is optional — the dual-path is harmless but adds code complexity.

**Affected routes:**
- `GET /api/projects` — remove `if (getPgPool())` branch
- `POST /api/projects` — remove pg branch
- `GET /api/projects/:id` — remove pg branch
- `GET /api/projects/:id/versions` — remove pg branch
- `POST /api/projects/:id/versions` — remove pg branch
- `GET /api/projects/:id/versions/:vid` — remove pg branch

Each route becomes a clean two-branch: Supabase → in-memory fallback.

**Do not remove `server/dbMigrate.js` startup** — it auto-creates Replit PG tables, which acts as a safety net for local dev.

---

### STEP 8 — Render Gallery: Supabase Storage (Low Priority)

**File:** `server/renderService.js`  
**Action:** Replace in-memory buffer storage with Supabase Storage.

```js
export async function saveRenderToSupabase(supabase, userId, imageBuffer, meta) {
    const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${userId}/${id}.png`;

    const { error: uploadError } = await supabase.storage
        .from('renders')
        .upload(storagePath, imageBuffer, { contentType: 'image/png', upsert: false });
    if (uploadError) throw new Error(`Storage upload: ${uploadError.message}`);

    await supabase.from('render_gallery').insert({
        id,
        user_id: userId,
        name: meta.name ?? 'Render',
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        samples: meta.samples ?? 0,
        method: meta.method ?? 'unknown',
        duration_ms: meta.durationMs ?? 0,
        storage_path: storagePath,
    });
    return id;
}

export async function listRendersFromSupabase(supabase, userId) {
    const { data } = await supabase
        .from('render_gallery')
        .select('id, name, width, height, samples, method, duration_ms, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    return data ?? [];
}

export async function getRenderImageFromSupabase(supabase, userId, renderId) {
    const { data: meta } = await supabase
        .from('render_gallery')
        .select('storage_path')
        .eq('id', renderId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!meta?.storage_path) return null;
    const { data } = await supabase.storage.from('renders').download(meta.storage_path);
    if (!data) return null;
    return Buffer.from(await data.arrayBuffer());
}
```

---

## Part 6 — Implementation Priority Order

Execute in this exact order. Each step is independently testable.

| Priority | Step | Severity | Effort | Unblocks |
|---|---|---|---|---|
| 1 | **STEP 1** — Apply Supabase schema SQL | Blocker | 5 min | Everything |
| 2 | **STEP 2** — Set `SUPABASE_SERVICE_ROLE_KEY` in Replit Secrets | Blocker | 2 min | All Supabase routes |
| 3 | **STEP 3** — Fix version_count update on Supabase path | Critical | 10 min | Correct project metadata |
| 4 | **STEP 4** — Add ownership checks to version GET routes | Medium | 15 min | Security compliance §07 |
| 5 | **STEP 5** — Persist plan state to Supabase | Critical | 20 min | Saves not blocked after restart |
| 6 | **STEP 6** — User upsert at auth time | Medium | 15 min | FK integrity |
| 7 | **STEP 7** — Remove Replit PG fallback | Low | 30 min | Code simplification |
| 8 | **STEP 8** — Render gallery Supabase Storage | Low | 45 min | Persistent renders |

---

## Part 7 — Testing Checklist

After each step, verify:

### After STEP 1 + STEP 2:
```
[ ] Server startup log: "[supabase] Connected with service role key (RLS bypassed)"
[ ] Server startup log: NO "[supabase] URL is set but no key found"
[ ] POST /api/projects → 201, project row in Supabase projects table
[ ] POST /api/projects/:id/versions → 201, version row in Supabase project_versions table
[ ] GET /api/projects → returns project list from Supabase
```

### After STEP 3:
```
[ ] After saving a version: projects.version_count increments in Supabase dashboard
[ ] After saving a version: projects.updated_at reflects current timestamp
```

### After STEP 5:
```
[ ] Restart server: user plan is loaded from Supabase (not reset to 'free')
[ ] Architect plan users: can save >0 versions immediately after server restart
[ ] Owner email account: shows 'owner' plan after restart (from Supabase, not re-grant)
```

### Full integration test:
```
[ ] Open app → create project → place walls → Ctrl+S → version saved toast
[ ] Check Supabase dashboard: project_versions row exists with snapshot JSONB
[ ] Reload browser: project auto-restores from server (loadLatestVersionFromServer)
[ ] Open version history: shows versions listed from Supabase
[ ] Click old version: loads correctly, saves paused, resume on exit
[ ] Close tab while dirty: emergency save fires (beforeunload)
[ ] Go offline: ServerSyncQueue suspends, resumes on reconnect
```

---

## Part 8 — Contract Compliance Summary

Every change in this plan complies with:

| Contract Rule | How It Is Met |
|---|---|
| §01 §2.1 — No direct store mutation from UI | SaveOrchestrator reads via getHash callback only; no store writes |
| §01 §3.7 — Store Event Bus | SaveOrchestrator subscribes to DOM events fired by the bus |
| §05 §1 — UI is read-only w.r.t. semantic model | PlatformShell.saveVersionInternal() only reads via delegate |
| §07 §1.1 — All AI calls via internal proxy | Unchanged — no AI routes affected |
| §07 §2.1 — authMiddleware is the only auth gate | loadPlanFromSupabase is called INSIDE authMiddleware |
| §07 §3.1 — Server is plan authority | planStore.js remains authoritative; Supabase is its backing store |
| §07 §11.1 — Only supabaseClient.js factory | All new Supabase calls use `getSupabaseClient()` |
| §07 §11.3 — Owner-based query filtering | GAP-02/03 fixes add `.owner_id = userId` checks |
| §09 — Supabase as primary, localStorage as L0 | Four-layer pipeline maintained; Supabase is now the durable Layer 3 |
| §09 — Version limits enforced server-side | Unchanged — version limit check remains in POST /api/projects/:id/versions |
