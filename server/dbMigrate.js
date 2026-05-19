/**
 * server/dbMigrate.js
 * Auto-migration: creates all PRYZM tables on server startup.
 *
 * This module runs ONCE per server boot. It ensures all required tables
 * exist in whichever database backend is active (Supabase or Replit PG).
 * No manual SQL editor step needed — the schema self-applies.
 *
 * Execution order:
 *   1. Try Supabase (preferred — SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)
 *   2. Fall back to Replit PostgreSQL (DATABASE_URL)
 *   3. Log a warning if neither is configured (in-memory mode, no persistence)
 *
 * Called once from server.js at startup, before any route handlers are registered.
 *
 * Contract: §07-BIM-SECURITY-CONTRACT §11 — DB access confined to server/.
 */

import { getPgPool } from './pgClient.js';
import { migrateViaSupabaseRest, ensureOwnerAccountInSupabase } from './supabaseMigrate.js';

const SCHEMA_SQL = `
-- 1. Users (custom auth — bcrypt + JWT)
CREATE TABLE IF NOT EXISTS pryzm_users (
    id                      TEXT PRIMARY KEY,
    email                   TEXT UNIQUE NOT NULL,
    name                    TEXT NOT NULL DEFAULT '',
    password_hash           TEXT,
    plan                    TEXT NOT NULL DEFAULT 'free',
    plan_status             TEXT NOT NULL DEFAULT 'active',
    oauth_provider          TEXT,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pryzm_users ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
ALTER TABLE pryzm_users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- 2. Projects
-- NOTE: owner_id is intentionally NOT a FK to pryzm_users.
-- In the standard Replit deployment, auth runs against Supabase — users live
-- in Supabase's pryzm_users, not in the Replit PG copy.  A FK here would
-- cause FK-violation errors on every project create (C05 §1.3).
-- Isolation is enforced by the server-side ownership check on every route,
-- not by a DB-level FK (see authMiddleware + canUserAccessProject guards).
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    owner_id      TEXT NOT NULL,
    version_count INTEGER NOT NULL DEFAULT 0,
    thumbnail     TEXT,
    is_archived   BOOLEAN NOT NULL DEFAULT false,
    is_starred    BOOLEAN NOT NULL DEFAULT false,
    description   TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);

-- 3. Project Versions (full BIM snapshots as JSONB)
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

-- 4. Project Members (ISO 19650 CDE roles)
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

-- 5. Version Audit Log (append-only ISO 19650 state transitions)
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

-- 6. User Plans (AI quota persistence)
CREATE TABLE IF NOT EXISTS user_plans (
    user_id              TEXT PRIMARY KEY,
    plan                 TEXT NOT NULL DEFAULT 'free',
    plan_status          TEXT NOT NULL DEFAULT 'active',
    ai_calls_this_period INTEGER NOT NULL DEFAULT 0,
    period_start         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Render Gallery
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

-- 8. Panorama Gallery
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

-- 9. Project Webhooks (Phase E-2 — API + Webhooks)
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

-- 10. Template Registry (Phase E-4 — Cross-Project Sharing)
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

-- 11. Visibility Intents (Contract 25 / 25a)
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
CREATE TABLE IF NOT EXISTS project_command_log (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    command_type TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pcl_project_time ON project_command_log(project_id, created_at DESC);

-- 13. IFC Uploads
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

-- 14. AI Usage
CREATE TABLE IF NOT EXISTS ai_usage (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    actor_id      TEXT NOT NULL,
    actor_kind    TEXT NOT NULL DEFAULT 'user',
    workflow      TEXT NOT NULL,
    surface       TEXT NOT NULL,
    model         TEXT NOT NULL DEFAULT 'unknown',
    plan          TEXT NOT NULL DEFAULT 'personal',
    prompt_sha    TEXT NOT NULL DEFAULT '',
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'ok',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_project_id  ON ai_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at  ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_project_month ON ai_usage(project_id, created_at DESC);

-- 15. AI Response Cache (Phase J.5 — content-hash cache)
CREATE TABLE IF NOT EXISTS ai_response_cache (
    tenant_id      TEXT NOT NULL,
    content_hash   TEXT NOT NULL,
    model_version  TEXT NOT NULL,
    response_json  JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL,
    hit_count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, content_hash, model_version)
);
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires ON ai_response_cache (expires_at);

-- 17. Marketplace Plugins (Phase F — C07 §4)
CREATE TABLE IF NOT EXISTS marketplace_plugins (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    version        TEXT NOT NULL DEFAULT '1.0.0',
    description    TEXT NOT NULL DEFAULT '',
    publisher      TEXT NOT NULL DEFAULT 'unknown',
    category       TEXT NOT NULL DEFAULT 'other',
    permissions    JSONB NOT NULL DEFAULT '[]',
    downloads      INTEGER NOT NULL DEFAULT 0,
    rating         NUMERIC(3,1) NOT NULL DEFAULT 0.0,
    price          TEXT NOT NULL DEFAULT 'free',
    tags           JSONB NOT NULL DEFAULT '[]',
    icon           TEXT,
    bundle_url     TEXT,
    bundle_sha256  TEXT,
    signature_json JSONB,
    is_active      BOOLEAN NOT NULL DEFAULT FALSE,
    is_reference   BOOLEAN NOT NULL DEFAULT FALSE,
    review_status  TEXT NOT NULL DEFAULT 'pending',
    submitted_by   TEXT,
    submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at    TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_active   ON marketplace_plugins(is_active, downloads DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_category ON marketplace_plugins(category);

-- 18. Plugin Publisher Keys (Ed25519 key registration — C07 §3, Task 6.3)
CREATE TABLE IF NOT EXISTS plugin_publisher_keys (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    publisher_id    TEXT NOT NULL,
    public_key_b64  TEXT NOT NULL,
    key_name        TEXT NOT NULL DEFAULT 'default',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ,
    UNIQUE (publisher_id, public_key_b64)
);
CREATE INDEX IF NOT EXISTS idx_plugin_publisher_keys_publisher ON plugin_publisher_keys(publisher_id);

-- 19. Plugin Revocations (CRL — ADR-0038 §Decision D, C07 §3)
CREATE TABLE IF NOT EXISTS plugin_revocations (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    revocation_type  TEXT NOT NULL,
    target           TEXT NOT NULL,
    reason           TEXT,
    revoked_by       TEXT,
    revoked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (revocation_type, target)
);

-- 20. Plugin Purchases (C08 §7 — Stripe marketplace billing, Task 6.4)
-- Tracks per-user plugin purchases; status: 'pending' | 'completed' | 'refunded'
-- 30/70 revenue share: PRYZM 30%, developer 70% (handled via Stripe Connect payouts).
CREATE TABLE IF NOT EXISTS plugin_purchases (
    id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id                  TEXT NOT NULL,
    plugin_id                TEXT NOT NULL,
    plugin_version           TEXT NOT NULL DEFAULT '1.0.0',
    price_cents              INTEGER NOT NULL DEFAULT 0,
    currency                 TEXT NOT NULL DEFAULT 'usd',
    stripe_session_id        TEXT,
    stripe_payment_intent_id TEXT,
    status                   TEXT NOT NULL DEFAULT 'pending',
    purchased_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, plugin_id)
);
CREATE INDEX IF NOT EXISTS idx_plugin_purchases_user   ON plugin_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_purchases_plugin ON plugin_purchases(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_purchases_status ON plugin_purchases(status, created_at DESC);

-- 15b. Plugin Reviews (F-4.3)
CREATE TABLE IF NOT EXISTS plugin_reviews (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    plugin_id       TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    reviewer_label  TEXT NOT NULL DEFAULT 'Anonymous',
    rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    body            TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, plugin_id)
);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_plugin ON plugin_reviews(plugin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_reviews_user   ON plugin_reviews(user_id);

-- 16. Event Log
CREATE TABLE IF NOT EXISTS event_log (
    id           TEXT PRIMARY KEY,
    actor_id     TEXT NOT NULL DEFAULT '',
    project_id   TEXT NOT NULL DEFAULT '',
    client_id    TEXT NOT NULL DEFAULT '',
    command_type TEXT NOT NULL,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload      JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_log_project_id ON event_log (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_actor_id   ON event_log (actor_id, created_at DESC);
`;

async function migrateViaPg(pool) {
    const client = await pool.connect();
    try {
        const cleanSql = SCHEMA_SQL
            .split('\n')
            .filter(line => !line.trimStart().startsWith('--'))
            .join('\n');

        await client.query(cleanSql);

        const columnMigrations = [
            `ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey`,
            `ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey`,
            `ALTER TABLE pryzm_users ADD COLUMN IF NOT EXISTS oauth_provider TEXT`,
            `ALTER TABLE pryzm_users ALTER COLUMN password_hash DROP NOT NULL`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail TEXT`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_starred  BOOLEAN NOT NULL DEFAULT false`,
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS tenant_id TEXT`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS content_hash TEXT`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS model_version TEXT`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS response_json JSONB`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
            `ALTER TABLE ai_response_cache ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 0`,
            // GAP-09 fix — DB-level CHECK constraints for data integrity (defense in depth).
            // These are wrapped in try/catch by the loop below; "already exists" errors are non-fatal.
            `ALTER TABLE projects ADD CONSTRAINT chk_projects_name_len CHECK (char_length(name) >= 1 AND char_length(name) <= 200)`,
            `ALTER TABLE project_versions ADD CONSTRAINT chk_pv_element_count CHECK (element_count >= 0)`,
            `ALTER TABLE project_versions ADD CONSTRAINT chk_pv_label_len CHECK (char_length(label) >= 1)`,
        ];

        for (const sql of columnMigrations) {
            try {
                await client.query(sql);
            } catch (err) {
                console.warn('[dbMigrate] column migration failed (non-fatal):', err.message);
            }
        }
    } finally {
        client.release();
    }
}

export async function runMigrations() {
    const pool = getPgPool();
    if (!pool) return;
    await migrateViaPg(pool);
}
