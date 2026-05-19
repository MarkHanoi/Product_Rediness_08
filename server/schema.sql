-- =============================================================================
-- PRYZM + Pascal — Shared Supabase Schema
-- =============================================================================
-- Run this once in the Supabase SQL Editor:
--   Dashboard → SQL Editor → paste → Run
--
-- This schema is shared by:
--   • PRYZM BIM Platform  (main app — Express + Vite)
--   • Pascal Editor        (Pascal/ — Next.js)
--
-- Table naming convention:
--   pryzm_*      — PRYZM-specific tables
--   projects, project_versions, project_members, version_audit_log
--                — Shared BIM data (already referenced by server.js Supabase paths)
--   user_plans   — AI quota persistence (PRYZM)
--   render_gallery, panorama_gallery — Render storage metadata (PRYZM)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. USERS
--    Custom auth store for PRYZM (bcrypt + JWT).
--    Separate from Supabase Auth — allows both apps to share one user table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pryzm_users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'free',
    plan_status   TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 2. PROJECTS
--    Core BIM project metadata. Referenced by projectAccess.js and all
--    project routes in server.js (table name: 'projects').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    owner_id      TEXT NOT NULL REFERENCES pryzm_users(id) ON DELETE CASCADE,
    version_count INTEGER NOT NULL DEFAULT 0,
    thumbnail     TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);


-- ---------------------------------------------------------------------------
-- 3. PROJECT VERSIONS
--    Full BIM model snapshots stored as JSONB.
--    The snapshot column holds the entire serialized scene from ProjectSerializer.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_versions (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label            TEXT NOT NULL DEFAULT 'Version',
    snapshot         JSONB,
    element_count    INTEGER NOT NULL DEFAULT 0,
    created_by       TEXT,
    idempotency_key  TEXT UNIQUE,

    -- ISO 19650 CDE state machine fields (versionStateMachine.js)
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


-- ---------------------------------------------------------------------------
-- 4. PROJECT MEMBERS
--    ISO 19650 CDE roles per project (projectMembers.js).
--    Roles: appointing_party | lead_appointed | team_manager | team_member | viewer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_members (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES pryzm_users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    invited_by  TEXT,
    invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);


-- ---------------------------------------------------------------------------
-- 5. VERSION AUDIT LOG
--    Append-only log of all ISO 19650 state transitions (versionStateMachine.js).
--    Never update or delete rows in this table.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 6. USER PLANS
--    Server-authoritative AI quota store (planStore.js).
--    Persists AI call counts across server restarts — previously lost on restart.
--    NOTE: user_id stores Clerk user IDs (e.g. 'user_2abc...') which are not
--    rows in pryzm_users. No FK constraint — supports both Clerk and custom auth.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_plans (
    user_id              TEXT PRIMARY KEY,
    plan                 TEXT NOT NULL DEFAULT 'free',
    plan_status          TEXT NOT NULL DEFAULT 'active',
    ai_calls_this_period INTEGER NOT NULL DEFAULT 0,
    period_start         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 7. RENDER GALLERY
--    Metadata for photorealistic renders (renderService.js).
--    PNG blobs are stored in Supabase Storage bucket 'renders'.
--    NOTE: user_id stores Clerk user IDs — no FK constraint (see note on user_plans).
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 8. PANORAMA GALLERY
--    Metadata for 360° panoramas (renderService.js Tier-3).
--    JPEG blobs are stored in Supabase Storage bucket 'panoramas'.
--    NOTE: user_id stores Clerk user IDs — no FK constraint (see note on user_plans).
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 9. PROJECT WEBHOOKS
--    Outbound webhook registrations for project events (webhookService.js).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_webhooks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id    TEXT NOT NULL,
    url         TEXT NOT NULL,
    events      JSONB NOT NULL DEFAULT '["model.saved"]',
    secret      TEXT,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_webhooks_project_id ON project_webhooks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_webhooks_owner_id ON project_webhooks(owner_id);


-- ---------------------------------------------------------------------------
-- 10. TEMPLATE REGISTRY
--     Shared parametric template definitions (templateService.js).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_registry (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL,
    scope       TEXT NOT NULL,
    name        TEXT NOT NULL,
    code        TEXT NOT NULL,
    definition  JSONB NOT NULL,
    is_public   BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_registry_account_id ON template_registry(account_id);
CREATE INDEX IF NOT EXISTS idx_template_registry_is_public ON template_registry(is_public);

CREATE TABLE IF NOT EXISTS visibility_intents (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    version     INTEGER NOT NULL DEFAULT 1,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    rules       JSONB NOT NULL DEFAULT '{}',
    modifiers   JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visibility_intents_project ON visibility_intents(project_id);

-- 12. Project Command Log (§30-REAL-TIME-COLLABORATION — catch-up for late joiners)
-- Rolling 24-hour, 500-row-per-project log of serialized commands broadcast via Socket.io.
-- Clients query GET /api/projects/:id/commands?since=<ISO> on reconnect.
CREATE TABLE IF NOT EXISTS project_command_log (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    command_type TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pcl_project_time ON project_command_log(project_id, created_at DESC);

-- 13. IFC Uploads (§IFC-STORE-1 — metadata for IFC models stored in Supabase Storage)
-- Binary fragment files live in the 'ifc-uploads' Supabase Storage bucket.
-- This table stores per-model metadata so they can be listed and re-loaded on session restore.
CREATE TABLE IF NOT EXISTS ifc_uploads (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id          TEXT NOT NULL,
    file_name        TEXT NOT NULL,
    storage_path     TEXT,
    file_data        TEXT,
    file_size_bytes  BIGINT NOT NULL DEFAULT 0,
    element_count    INTEGER NOT NULL DEFAULT 0,
    upload_status    TEXT NOT NULL DEFAULT 'pending',
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ifc_uploads_project_id ON ifc_uploads(project_id);
CREATE INDEX IF NOT EXISTS idx_ifc_uploads_user_id    ON ifc_uploads(user_id);


-- =============================================================================
-- STORAGE BUCKETS  (run separately in Dashboard → Storage if using the UI,
--                   or use the Supabase Management API)
-- =============================================================================
-- These cannot be created via SQL — create them in:
--   Supabase Dashboard → Storage → New bucket
--
--   Bucket name: renders      — private, 50 MB file size limit
--   Bucket name: panoramas    — private, 50 MB file size limit
--   Bucket name: ifc-uploads  — private, 500 MB file size limit (IFC binary fragments)
--
-- All buckets must be PRIVATE (no public access).
-- Serve files via signed URLs generated server-side with a short TTL.
-- =============================================================================


-- =============================================================================
-- ATOMIC VERSION SAVE  (GAP-01 — Supabase path)
-- =============================================================================
-- pryzm_save_version() is a SECURITY DEFINER PL/pgSQL function that wraps the
-- project-upsert + version-count-check + version-insert + touch into a single
-- server-side transaction, eliminating the TOCTOU race window that exists when
-- these steps are issued as separate PostgREST REST calls.
--
-- Apply once via: Supabase Dashboard → SQL Editor → paste → Run
--
-- The Express server calls this via supabase.rpc('pryzm_save_version', {...}).
-- supabaseMigrate.js probes for the function on startup and warns if missing.
-- Until the function is applied the server falls back to the two-step path.
-- =============================================================================

CREATE OR REPLACE FUNCTION pryzm_save_version(
    p_version_id      TEXT,
    p_project_id      TEXT,
    p_project_name    TEXT,
    p_owner_id        TEXT,
    p_label           TEXT,
    p_snapshot        JSONB,
    p_element_count   INTEGER,
    p_idempotency_key TEXT,
    p_max_versions    INTEGER  -- pass -1 for unlimited
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_owner   TEXT;
    v_version_count    INTEGER;
    v_result           JSONB;
BEGIN
    -- ── Step 1: Upsert project row (ownership-safe) ────────────────────────
    -- INSERT creates the row on first save; the WHERE clause on DO UPDATE
    -- means the name is only refreshed when the caller is already the owner,
    -- so a different user cannot overwrite the project name via upsert (GAP-03).
    INSERT INTO projects (id, name, owner_id)
    VALUES (p_project_id, LEFT(p_project_name, 200), p_owner_id)
    ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, updated_at = NOW()
        WHERE projects.owner_id = EXCLUDED.owner_id;

    -- ── Step 2: Verify ownership ───────────────────────────────────────────
    SELECT owner_id INTO v_existing_owner
    FROM projects WHERE id = p_project_id;

    IF v_existing_owner IS DISTINCT FROM p_owner_id THEN
        RAISE EXCEPTION 'PROJECT_CONFLICT: project % is owned by a different user', p_project_id
            USING ERRCODE = 'P0002';
    END IF;

    -- ── Step 3: Version-limit check ────────────────────────────────────────
    IF p_max_versions <> -1 THEN
        SELECT COUNT(*) INTO v_version_count
        FROM project_versions WHERE project_id = p_project_id;

        IF v_version_count >= p_max_versions THEN
            RAISE EXCEPTION 'VERSION_LIMIT_EXCEEDED: % of % versions used for project %',
                v_version_count, p_max_versions, p_project_id
                USING ERRCODE = 'P0003';
        END IF;
    END IF;

    -- ── Step 4: Insert version (idempotent via ON CONFLICT DO NOTHING) ─────
    INSERT INTO project_versions
        (id, project_id, label, snapshot, element_count, created_by, idempotency_key)
    VALUES
        (p_version_id, p_project_id, p_label, p_snapshot, p_element_count,
         p_owner_id, COALESCE(p_idempotency_key, p_version_id))
    ON CONFLICT (id) DO NOTHING;

    -- ── Step 5: Touch project (update version_count atomically) ───────────
    UPDATE projects
    SET updated_at     = NOW(),
        version_count  = (SELECT COUNT(*) FROM project_versions WHERE project_id = p_project_id)
    WHERE id = p_project_id;

    -- ── Step 6: Return the version row ─────────────────────────────────────
    SELECT to_jsonb(v.*) INTO v_result
    FROM (
        SELECT id, project_id, label, created_at, element_count
        FROM project_versions
        WHERE id = p_version_id AND project_id = p_project_id
    ) v;

    RETURN v_result;
END;
$$;


-- =============================================================================
-- ROW LEVEL SECURITY  (optional — only needed if using the anon key)
-- =============================================================================
-- When using SUPABASE_SERVICE_ROLE_KEY (recommended for server-side), RLS is
-- automatically bypassed. Enable these policies only if you ever use the anon key.
--
-- ALTER TABLE pryzm_users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE render_gallery ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE panorama_gallery ENABLE ROW LEVEL SECURITY;
-- =============================================================================
