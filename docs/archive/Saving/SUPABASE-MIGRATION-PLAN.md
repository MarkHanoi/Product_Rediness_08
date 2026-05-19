# Supabase Migration Plan — PRYZM BIM Platform

**Document type:** Feasibility Study + Detailed Implementation Plan  
**Author:** Architecture review, March 2026  
**Scope:** Replace Replit built-in PostgreSQL with Supabase as the sole persistent backend

---

## Part 1 — Feasibility Study

### 1.1 Current Database Architecture

PRYZM uses a **three-tier persistence strategy** today:

| Tier | Technology | Activation condition | What is stored |
|---|---|---|---|
| 0 | Browser `localStorage` | Always active | Project index + up to 20 version snapshots per project |
| 1 | Replit PostgreSQL | `DATABASE_URL` env present | Users, projects, versions |
| 2 | Supabase | `SUPABASE_URL` env present | Users, projects, versions, members, audit log, renders |
| Fallback | In-memory Maps | Neither DB env present | Everything — lost on restart |

The routing pattern throughout `server.js` is:

```
if (supabase is configured) → use Supabase
else if (DATABASE_URL is set) → use Replit pgClient + projectStore
else → use in-memory Map
```

### 1.2 What Already Exists for Supabase

The codebase is **already partially wired for Supabase**. The following are already implemented and working:

| File | Status |
|---|---|
| `server/supabaseClient.js` | Complete — factory with service role / anon key support |
| `server/projectMembers.js` | Complete — full dual-path (in-memory + Supabase) |
| `server/versionStateMachine.js` | Complete — `transitionStateInSupabase()` with audit log writes |
| `server/projectAccess.js` | Complete — checks Supabase `projects` table for socket auth |
| `server/renderService.js` | Partial — comment says "use Supabase Storage for persistence" but not yet implemented |
| `server/planStore.js` | Not implemented — purely in-memory |
| `server/authStore.js` | Not implemented — currently Replit PG only |
| `server/projectStore.js` | Not implemented for Supabase — Replit PG only |

### 1.3 Gaps to Bridge

Four areas require new implementation:

1. **Auth store** — `authStore.js` writes to `pryzm_users` in Replit PG. Must be rerouted to Supabase (either the `pryzm_users` table in Supabase, or migrate fully to Supabase Auth).
2. **Project & version store** — `projectStore.js` contains all SQL queries against Replit PG. These must be replaced with Supabase JS client calls against the Supabase `projects` / `project_versions` tables.
3. **Plan store persistence** — `planStore.js` is currently in-memory only. AI call counts and subscription tier must be persisted to Supabase so they survive server restarts.
4. **Render / panorama gallery** — `renderService.js` stores PNG buffers in memory. Migration requires Supabase Storage for the image blobs and a Supabase table for metadata.

### 1.4 Feasibility Verdict

**Fully feasible. Recommended.** The codebase was clearly designed with Supabase as the intended production backend. The routing infrastructure and Supabase client factory already exist. Removing the Replit PG dependency requires migrating four modules and creating the Supabase schema. There is no architectural conflict.

**Effort estimate:** Medium (4–6 hours of implementation work).  
**Risk:** Low — the fallback chain means nothing breaks if Supabase credentials are missing.  
**Benefits:**
- Data persists across Replit restarts and deployments
- Supabase Storage for render images (currently lost on restart)
- Row-Level Security (RLS) available at database level
- Real-time subscriptions available for collaboration features
- Supabase Dashboard for inspecting production data
- Not tied to Replit's proprietary database offering

---

## Part 2 — Implementation Plan

### 2.1 Schema Design (Supabase Tables)

Run the following SQL in the Supabase SQL Editor to create the full schema. Table names use the **Supabase convention** (no `pryzm_` prefix) because `projectAccess.js` already references `projects` and `project_versions` without the prefix.

#### Step 1 — Run Schema SQL

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- PRYZM Supabase Schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- Users (mirrors pryzm_users in Replit PG; custom auth, not Supabase Auth)
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
  owner_id      TEXT NOT NULL REFERENCES pryzm_users(id) ON DELETE CASCADE,
  version_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);

-- Project versions (stores full BIM snapshot as JSONB)
CREATE TABLE IF NOT EXISTS project_versions (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label            TEXT NOT NULL DEFAULT 'Version',
  snapshot         JSONB,
  element_count    INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT,
  idempotency_key  TEXT UNIQUE,
  state            TEXT NOT NULL DEFAULT 'wip',
  revision_code    TEXT,
  suitability_code TEXT,
  structured_name  TEXT,
  rejection_reason TEXT,
  transitioned_by  TEXT,
  transitioned_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);

-- Project members (ISO 19650 roles)
CREATE TABLE IF NOT EXISTS project_members (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES pryzm_users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  invited_by   TEXT,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  UNIQUE (project_id, user_id)
);

-- Version audit log (append-only, ISO 19650 CDE transitions)
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

-- User plans (AI usage quotas — survives server restarts)
CREATE TABLE IF NOT EXISTS user_plans (
  user_id              TEXT PRIMARY KEY REFERENCES pryzm_users(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL DEFAULT 'free',
  plan_status          TEXT NOT NULL DEFAULT 'active',
  ai_calls_this_period INTEGER NOT NULL DEFAULT 0,
  period_start         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Render gallery metadata (image blobs go to Supabase Storage)
CREATE TABLE IF NOT EXISTS render_gallery (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES pryzm_users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Render',
  width       INTEGER NOT NULL DEFAULT 0,
  height      INTEGER NOT NULL DEFAULT 0,
  samples     INTEGER NOT NULL DEFAULT 0,
  method      TEXT NOT NULL DEFAULT 'unknown',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,           -- Path in Supabase Storage bucket 'renders'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_render_gallery_user_id ON render_gallery(user_id);

-- Panorama gallery metadata
CREATE TABLE IF NOT EXISTS panorama_gallery (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES pryzm_users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Panorama',
  width       INTEGER NOT NULL DEFAULT 0,
  height      INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panorama_gallery_user_id ON panorama_gallery(user_id);
```

#### Step 2 — Create Supabase Storage Buckets

In the Supabase Dashboard → Storage, create:
- Bucket name: `renders` — for render PNG images, set to **private** (served via signed URLs)
- Bucket name: `panoramas` — for panorama JPEG images, set to **private**

#### Step 3 — Row-Level Security (Optional for service role key usage)

When using the **service role key** (recommended for server-side), RLS is bypassed automatically. If you ever use the anon key, add these policies:

```sql
-- Enable RLS on all tables
ALTER TABLE pryzm_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE panorama_gallery ENABLE ROW LEVEL SECURITY;

-- Users can read their own record
CREATE POLICY "users_own_row" ON pryzm_users
  FOR ALL USING (id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Projects: owner access only
CREATE POLICY "projects_owner" ON projects
  FOR ALL USING (owner_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Versions: owner of the parent project
CREATE POLICY "versions_owner" ON project_versions
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects
      WHERE owner_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );
```

---

### 2.2 Environment Variables to Set (Replit Secrets)

Add these in Replit → Secrets (do not commit to source code):

| Secret key | Where to find it | Purpose |
|---|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | Connects the client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key | Server-side, bypasses RLS |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key | Optional fallback |

Once these are set, `server/supabaseClient.js` will return a live client and all Supabase paths in the code will activate automatically.

---

### 2.3 Code Changes — Module by Module

#### 2.3.1 `server/authStore.js` — Migrate to Supabase

**Current state:** All queries go to Replit PG via `pgClient.js`.  
**Goal:** Route all queries to Supabase's `pryzm_users` table.

Replace the entire file contents:

```js
/**
 * server/authStore.js
 * Server-side user authentication for PRYZM — Supabase-backed.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getSupabaseClient } from './supabaseClient.js';

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY = '30d';

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        console.warn('[authStore] SESSION_SECRET not set — using insecure fallback.');
        return 'pryzm-dev-secret-change-in-production';
    }
    return secret;
}

function generateUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function signUp({ email, password, name }) {
    const supabase = await getSupabaseClient();
    const normalEmail = email.toLowerCase().trim();

    // Check for existing user
    const { data: existing } = await supabase
        .from('pryzm_users')
        .select('id')
        .eq('email', normalEmail)
        .maybeSingle();

    if (existing) throw new Error('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = generateUserId();

    const { error } = await supabase.from('pryzm_users').insert({
        id: userId,
        email: normalEmail,
        name: name.trim(),
        password_hash: passwordHash,
        plan: 'free',
        plan_status: 'active',
    });

    if (error) throw new Error(`Sign-up failed: ${error.message}`);

    // Initialise plan record
    await supabase.from('user_plans').upsert({
        user_id: userId,
        plan: 'free',
        plan_status: 'active',
        ai_calls_this_period: 0,
        period_start: new Date().toISOString(),
    });

    const user = { id: userId, email: normalEmail, name: name.trim(), plan: 'free', planStatus: 'active' };
    const token = jwt.sign({ sub: userId, email: normalEmail }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });

    console.log(`[authStore] New user created: ${normalEmail} (${userId})`);
    return { user, token };
}

export async function signIn({ email, password }) {
    const supabase = await getSupabaseClient();
    const normalEmail = email.toLowerCase().trim();

    const { data: row, error } = await supabase
        .from('pryzm_users')
        .select('id, email, name, password_hash, plan, plan_status')
        .eq('email', normalEmail)
        .maybeSingle();

    if (error || !row) throw new Error('Invalid email or password.');

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid email or password.');

    const user = { id: row.id, email: row.email, name: row.name, plan: row.plan, planStatus: row.plan_status };
    const token = jwt.sign({ sub: row.id, email: row.email }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });

    console.log(`[authStore] User signed in: ${normalEmail} (${row.id})`);
    return { user, token };
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, getSessionSecret());
    } catch {
        return null;
    }
}

export async function getUserById(userId) {
    const supabase = await getSupabaseClient();
    const { data } = await supabase
        .from('pryzm_users')
        .select('id, email, name, plan, plan_status')
        .eq('id', userId)
        .maybeSingle();
    if (!data) return null;
    return { id: data.id, email: data.email, name: data.name, plan: data.plan, planStatus: data.plan_status };
}
```

#### 2.3.2 `server/projectStore.js` — Add Supabase Path

**Current state:** Replit PG only.  
**Goal:** Add Supabase functions that mirror every existing PG function.

Add the following exports at the bottom of `server/projectStore.js`:

```js
// ── Supabase-backed equivalents ───────────────────────────────────────────────

export async function listProjectsFromSupabase(supabase, userId) {
    const { data, error } = await supabase
        .from('projects')
        .select('id, name, owner_id, version_count, updated_at, created_at')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return data ?? [];
}

export async function createProjectInSupabase(supabase, name, userId) {
    const id = generateId('proj');
    const { data, error } = await supabase
        .from('projects')
        .insert({ id, name, owner_id: userId })
        .select('id, name, owner_id, version_count, updated_at, created_at')
        .single();
    if (error) throw error;
    return data;
}

export async function getProjectFromSupabase(supabase, projectId, userId) {
    const { data } = await supabase
        .from('projects')
        .select('id, name, owner_id, version_count, updated_at, created_at')
        .eq('id', projectId)
        .eq('owner_id', userId)
        .maybeSingle();
    return data ?? null;
}

export async function upsertProjectInSupabase(supabase, projectId, name, userId) {
    const { error } = await supabase
        .from('projects')
        .upsert({ id: projectId, name, owner_id: userId, updated_at: new Date().toISOString() });
    if (error) throw error;
}

export async function touchProjectInSupabase(supabase, projectId) {
    const { count } = await supabase
        .from('project_versions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);

    await supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString(), version_count: count ?? 0 })
        .eq('id', projectId);
}

export async function listVersionsFromSupabase(supabase, projectId) {
    const { data, error } = await supabase
        .from('project_versions')
        .select('id, project_id, label, element_count, created_at, created_by')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return data ?? [];
}

export async function getVersionByIdFromSupabase(supabase, projectId, versionId) {
    const { data } = await supabase
        .from('project_versions')
        .select('id, project_id, label, snapshot, element_count, created_at, created_by')
        .eq('id', versionId)
        .eq('project_id', projectId)
        .maybeSingle();
    return data ?? null;
}

export async function getVersionByIdempotencyKeyFromSupabase(supabase, projectId, key) {
    const { data } = await supabase
        .from('project_versions')
        .select('id, project_id, label, element_count, created_at')
        .eq('project_id', projectId)
        .eq('idempotency_key', key)
        .maybeSingle();
    return data ?? null;
}

export async function createVersionInSupabase(supabase, { versionId, projectId, label, snapshot, elementCount, createdBy, idempotencyKey }) {
    const id = versionId || generateId('ver');
    const { data, error } = await supabase
        .from('project_versions')
        .insert({
            id,
            project_id: projectId,
            label,
            snapshot,
            element_count: elementCount,
            created_by: createdBy,
            idempotency_key: idempotencyKey || id,
        })
        .select('id, project_id, label, element_count, created_at')
        .single();
    if (error) throw error;
    return data;
}
```

#### 2.3.3 `server/server.js` — Update Route Handlers

The route handlers in `server.js` already have the pattern:

```js
const supabase = await getSupabaseClient();
if (supabase) {
    // Supabase path (currently only partial)
} else {
    // pgProjectStore path (Replit PG)
}
```

For every route that currently falls into the `pgProjectStore` path, add the Supabase branch using the new functions from step 2.3.2. 

The affected routes are:
- `GET /api/projects` → add `listProjectsFromSupabase(supabase, userId)`
- `POST /api/projects` → add `createProjectInSupabase(supabase, name, userId)`
- `GET /api/projects/:id` → add `getProjectFromSupabase(supabase, id, userId)`
- `POST /api/projects/:id/versions` → add `createVersionInSupabase(supabase, {...})`
- `GET /api/projects/:id/versions` → add `listVersionsFromSupabase(supabase, id)`
- `GET /api/projects/:id/versions/:vid` → add `getVersionByIdFromSupabase(supabase, id, vid)`

Pattern for each route (example: `GET /api/projects`):

```js
app.get('/api/projects', authMiddleware, async (req, res) => {
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            // NEW: Supabase path
            const projects = await listProjectsFromSupabase(supabase, req.user.id);
            return res.json({ projects });
        }
        // Existing: Replit PG fallback
        const projects = await pgProjectStore.listProjects(req.user.id);
        res.json({ projects });
    } catch (err) {
        console.error('[api/projects] list error:', err);
        res.status(500).json({ error: String(err) });
    }
});
```

#### 2.3.4 `server/planStore.js` — Add Supabase Persistence

**Current state:** Fully in-memory. AI quota resets on every server restart.  
**Goal:** Persist plan tier and usage counts to the `user_plans` table.

Add two new async functions to `planStore.js`:

```js
/**
 * Load a user's plan record from Supabase. Call once at auth time.
 */
export async function loadPlanFromSupabase(supabase, userId) {
    const { data } = await supabase
        .from('user_plans')
        .select('plan, ai_calls_this_period, period_start')
        .eq('user_id', userId)
        .maybeSingle();
    if (!data) return;

    // Sync into in-memory store
    const record = _getRecord(userId);
    record.plan = data.plan;
    record.aiCallsThisPeriod = data.ai_calls_this_period;
    record.periodStart = new Date(data.period_start);
    _resetPeriodIfNeeded(record);
}

/**
 * Flush the current in-memory plan state to Supabase.
 */
export async function syncPlanToSupabase(supabase, userId) {
    const record = _getRecord(userId);
    await supabase.from('user_plans').upsert({
        user_id: userId,
        plan: record.plan,
        ai_calls_this_period: record.aiCallsThisPeriod,
        period_start: record.periodStart.toISOString(),
        updated_at: new Date().toISOString(),
    });
}
```

Then in `server.js`, call `loadPlanFromSupabase` inside `authMiddleware` after verifying the user, and call `syncPlanToSupabase` inside `enforceAIQuota` after incrementing. This keeps in-memory as the fast path and Supabase as the durable store.

#### 2.3.5 `server/renderService.js` — Add Supabase Storage

**Current state:** PNG buffers are held in-memory Maps.  
**Goal:** Upload buffers to Supabase Storage bucket `renders`, store metadata in `render_gallery` table.

Add Supabase-backed functions:

```js
export async function saveRenderToSupabase(supabase, userId, imageBuffer, meta) {
    const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${userId}/${id}.png`;

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
        .from('renders')
        .upload(storagePath, imageBuffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    // Insert metadata row
    const { error: dbError } = await supabase.from('render_gallery').insert({
        id,
        user_id: userId,
        name: meta.name ?? `Render`,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        samples: meta.samples ?? 0,
        method: meta.method ?? 'unknown',
        duration_ms: meta.durationMs ?? 0,
        storage_path: storagePath,
    });

    if (dbError) throw new Error(`Metadata insert failed: ${dbError.message}`);

    console.log(`[renderService] Saved render to Supabase Storage: ${storagePath}`);
    return { id, url: `/api/render/${id}/image` };
}

export async function listRendersFromSupabase(supabase, userId) {
    const { data, error } = await supabase
        .from('render_gallery')
        .select('id, name, width, height, samples, method, duration_ms, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return (data ?? []).map(r => ({ ...r, url: `/api/render/${r.id}/image` }));
}

export async function getRenderImageFromSupabase(supabase, userId, renderId) {
    const { data: row } = await supabase
        .from('render_gallery')
        .select('storage_path')
        .eq('id', renderId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!row) return null;

    const { data, error } = await supabase.storage
        .from('renders')
        .download(row.storage_path);

    if (error) return null;
    return Buffer.from(await data.arrayBuffer());
}

export async function deleteRenderFromSupabase(supabase, userId, renderId) {
    const { data: row } = await supabase
        .from('render_gallery')
        .select('storage_path')
        .eq('id', renderId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!row) return false;

    await supabase.storage.from('renders').remove([row.storage_path]);
    await supabase.from('render_gallery').delete().eq('id', renderId);
    return true;
}
```

---

### 2.4 Supabase Integration via Replit

Replit has a native Supabase integration. Use it instead of manually setting secrets:

1. Go to **Tools → Integrations** in the Replit workspace
2. Find **Supabase** and click **Connect**
3. Authenticate with your Supabase account and select your project
4. Replit will automatically inject `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables
5. Manually add `SUPABASE_SERVICE_ROLE_KEY` in **Secrets** (this key should never be auto-shared)

---

### 2.5 Data Migration from Replit PG

If there is existing data in the Replit PostgreSQL database that must be migrated:

```js
// server/scripts/migrate-to-supabase.js
// Run once: node server/scripts/migrate-to-supabase.js

import { getPgPool } from '../pgClient.js';
import { getSupabaseClient } from '../supabaseClient.js';

const pool = getPgPool();
const supabase = await getSupabaseClient();

// 1. Migrate users
const { rows: users } = await pool.query('SELECT * FROM pryzm_users');
for (const u of users) {
    await supabase.from('pryzm_users').upsert(u, { onConflict: 'id' });
}
console.log(`Migrated ${users.length} users`);

// 2. Migrate projects
const { rows: projects } = await pool.query('SELECT * FROM pryzm_projects');
for (const p of projects) {
    await supabase.from('projects').upsert({
        id: p.id, name: p.name, owner_id: p.owner_id,
        version_count: p.version_count,
        updated_at: p.updated_at, created_at: p.created_at,
    }, { onConflict: 'id' });
}
console.log(`Migrated ${projects.length} projects`);

// 3. Migrate versions (may be slow for large snapshots)
const { rows: versions } = await pool.query('SELECT * FROM pryzm_project_versions');
for (const v of versions) {
    await supabase.from('project_versions').upsert({
        id: v.id, project_id: v.project_id, label: v.label,
        snapshot: v.snapshot, element_count: v.element_count,
        created_by: v.created_by, idempotency_key: v.idempotency_key,
        created_at: v.created_at,
    }, { onConflict: 'id' });
}
console.log(`Migrated ${versions.length} versions`);

pool.end();
console.log('Migration complete.');
```

---

### 2.6 Removing the Replit PG Dependency (Final Step)

Once Supabase is confirmed working and data is migrated:

1. Remove `DATABASE_URL` from Replit's environment / provisioned modules
2. Delete `server/pgClient.js`
3. Remove the `pg` package: `npm uninstall pg`
4. Delete `server/projectStore.js` (Supabase versions live in it now, or move them to a new `server/supabaseProjectStore.js`)
5. Remove `pgClient.js` and `pgProjectStore` imports from `server.js`
6. Delete `query as pgQuery` import and all `pgQuery` usages in `server.js`
7. Update `server/authStore.js` to remove the now-unused `pgClient.js` import (already done in step 2.3.1)
8. Remove the `modules = ["postgresql-16"]` entry from `.replit`

---

### 2.7 Implementation Order (Recommended Sequence)

| Step | Task | Status | Risk |
|---|---|---|---|
| 1 | Create Supabase project, run `server/schema.sql` | ⬜ USER ACTION REQUIRED | None |
| 2 | Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Replit Secrets | ⬜ USER ACTION REQUIRED | None |
| 3 | Verify connection (server log: "Connected with service role key") | ⬜ Automatic after step 2 | None |
| 4 | `server/supabaseClient.js` — supports both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` | ✅ DONE | — |
| 5 | `server/authStore.js` — routes auth to Supabase, Replit PG as fallback | ✅ DONE | — |
| 6 | `server.js` auth routes — removed hard `getPgPool()` gate | ✅ DONE | — |
| 7 | `server/schema.sql` — unified schema for PRYZM + Pascal | ✅ DONE | — |
| 8 | Add plan persistence to Supabase `user_plans` table | ⬜ Phase 2 | Low |
| 9 | Add render gallery Supabase Storage | ⬜ Phase 2 | Medium |
| 10 | Create Storage buckets in Supabase Dashboard (renders, panoramas) | ⬜ Phase 2 — USER ACTION | None |
| 11 | Run data migration script if Replit PG has live data | ⬜ Phase 2 | Medium |
| 12 | Remove Replit PG dependency entirely | ⬜ Phase 3 — after verification | Low |

---

### 2.8 Testing Checklist

After each step, verify the following before moving to the next:

- [ ] Server starts without errors (check workflow console)
- [ ] `POST /api/auth/signup` creates a row in `pryzm_users` in Supabase Dashboard
- [ ] `POST /api/auth/signin` returns a valid JWT
- [ ] `GET /api/projects` returns projects from Supabase (not in-memory)
- [ ] `POST /api/projects` creates a row in `projects` table
- [ ] `POST /api/projects/:id/versions` creates a row in `project_versions` with snapshot JSONB
- [ ] `GET /api/projects/:id/versions/:vid` loads snapshot correctly
- [ ] Render save uploads a file visible in Supabase Storage → `renders` bucket
- [ ] After server restart, all data is still present (confirms not falling back to in-memory)
- [ ] AI quota counter persists across server restarts (check `user_plans` table)

---

### 2.9 Summary

The migration is a natural completion of work that was already started. The codebase was architected from the beginning with Supabase as the intended long-term backend. The routing infrastructure, Supabase client, and partial integrations are already in place. The four areas requiring new code (auth, project store, plan store, render gallery) are each self-contained and low-risk because the existing fallback chain means the application continues to function throughout the migration. With Supabase configured, none of the Replit PostgreSQL code paths will be reached, making removal clean and safe.
