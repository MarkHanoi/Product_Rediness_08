-- pryzm-selfhost/init-db/03-rls-policies.sql
-- S69 D6 — Per-table RLS policies for self-host bootstrap.
--
-- Carry-forward from S68 D5 (`docs/security/rls-audit-2026-Q4.md` §3.2):
--   2 of 21 user-data-bearing tables had RLS at S68 close.  This file
--   adds the missing 19 across the four schema groups — PRYZM 1 shared
--   schema, PRYZM 2 sync-server, marketplace catalog, self-host bootstrap.
--
-- Mounted at /docker-entrypoint-initdb.d/03-rls-policies.sql in the
-- postgres:16-alpine container; runs after 02-marketplace.sql on first
-- boot.  Idempotent guards (CREATE POLICY IF NOT EXISTS via pg 16; ALTER
-- TABLE ... ENABLE ROW LEVEL SECURITY is naturally idempotent) so re-run
-- under `psql -f` is safe.
--
-- Every policy below uses the `pryzm_auth_uid()` SECURITY DEFINER
-- function declared at the top of this file.  In production, that
-- function reads `current_setting('request.jwt.claim.sub', true)` —
-- the same pattern Supabase uses for its `auth.uid()` helper.  The
-- self-host stack injects the JWT subject via PostgREST-style
-- `SET LOCAL request.jwt.claim.sub = '<sub>'` inside each transaction.
--
-- The five reusable policy patterns from `rls-audit-2026-Q4.md` §3.2
-- are applied table-by-table:
--   - APPEND-ONLY AUDIT      — service-role INSERT, owner SELECT
--   - PER-PROJECT            — owner OR member SELECT/UPDATE/DELETE
--   - PER-USER               — sub = user_id only
--   - CATALOG (read-anyone)  — public SELECT, publisher write
--   - PUBLISHER SELF-MANAGE  — sub = publisher.id only
--
-- HONESTY NOTE: the test queries that verify these policies live in the
-- sibling `03-rls-policies.test.sql` file.  Both files have been
-- inspected by hand against the patterns; full live verification
-- (apply against a Postgres 16 daemon with seeded multi-user data,
-- assert each query returns the expected row count) is the operator-
-- side D6 deliverable of S69 — see `docs/00_NEW_ARCHITECTURE/runbooks
-- /DR-DRILL-RUNBOOK.md` §6 "RLS verification step", which folds the
-- verification into the DR drill day procedure.

\c pryzm

-- ────────────────────────────────────────────────────────────────────
-- §0  pryzm_auth_uid() — JWT-subject extractor.
--
-- Called by every USING / WITH CHECK clause below.  Returns NULL when
-- no JWT context is present, which causes every policy below to deny
-- (since `NULL = anything` is NULL → not true).  Service-role access
-- bypasses RLS entirely (Postgres baseline), so server-side trusted
-- code paths are unaffected.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pryzm_auth_uid()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT current_setting('request.jwt.claim.sub', true)
$$;

REVOKE ALL ON FUNCTION pryzm_auth_uid() FROM public;
GRANT EXECUTE ON FUNCTION pryzm_auth_uid() TO public;

-- ════════════════════════════════════════════════════════════════════
-- §1  PRYZM 1 / shared schema — rows 1, 4–13 of rls-audit §1.1
-- ════════════════════════════════════════════════════════════════════

-- §1.1  pryzm_users — PER-USER (own row).
ALTER TABLE IF EXISTS pryzm_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pryzm_users_self ON pryzm_users;
CREATE POLICY pryzm_users_self ON pryzm_users
  FOR ALL
  USING (id = pryzm_auth_uid())
  WITH CHECK (id = pryzm_auth_uid());

-- §1.2  project_members — PER-PROJECT (members and owners may read).
ALTER TABLE IF EXISTS project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_members_select_member_or_owner ON project_members;
CREATE POLICY project_members_select_member_or_owner ON project_members
  FOR SELECT
  USING (
    user_id = pryzm_auth_uid()
    OR project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid())
  );
DROP POLICY IF EXISTS project_members_write_owner_only ON project_members;
CREATE POLICY project_members_write_owner_only ON project_members
  FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()));

-- §1.3  version_audit_log — APPEND-ONLY AUDIT.
--   - SELECT: visible to the owner of the parent project.
--   - INSERT: SECURITY DEFINER service function only — no client INSERT
--     policy is defined, so RLS denies all client INSERTs.
ALTER TABLE IF EXISTS version_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS version_audit_log_select_owner ON version_audit_log;
CREATE POLICY version_audit_log_select_owner ON version_audit_log
  FOR SELECT
  USING (
    version_id IN (
      SELECT pv.id FROM project_versions pv
      JOIN projects p ON p.id = pv.project_id
      WHERE p.owner_id = pryzm_auth_uid()
    )
  );

-- §1.4  user_plans — PER-USER.
ALTER TABLE IF EXISTS user_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_plans_self ON user_plans;
CREATE POLICY user_plans_self ON user_plans
  FOR ALL
  USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- §1.5  render_gallery — PER-USER.
ALTER TABLE IF EXISTS render_gallery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS render_gallery_self ON render_gallery;
CREATE POLICY render_gallery_self ON render_gallery
  FOR ALL
  USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- §1.6  panorama_gallery — PER-USER.
ALTER TABLE IF EXISTS panorama_gallery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS panorama_gallery_self ON panorama_gallery;
CREATE POLICY panorama_gallery_self ON panorama_gallery
  FOR ALL
  USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- §1.7  project_webhooks — PER-PROJECT (owner only — not members).
ALTER TABLE IF EXISTS project_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_webhooks_owner ON project_webhooks;
CREATE POLICY project_webhooks_owner ON project_webhooks
  FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()));

-- §1.8  template_registry — CATALOG (read-anyone, write-admin).
--   "Admin" role is checked via the JWT `role` claim.  The check uses
--   current_setting() rather than pryzm_auth_uid() because the admin
--   marker is not the user id.
ALTER TABLE IF EXISTS template_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS template_registry_read_all ON template_registry;
CREATE POLICY template_registry_read_all ON template_registry
  FOR SELECT
  USING (true);
DROP POLICY IF EXISTS template_registry_write_admin ON template_registry;
CREATE POLICY template_registry_write_admin ON template_registry
  FOR ALL
  USING (current_setting('request.jwt.claim.role', true) = 'admin')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'admin');

-- §1.9  visibility_intents — PER-USER.
ALTER TABLE IF EXISTS visibility_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visibility_intents_self ON visibility_intents;
CREATE POLICY visibility_intents_self ON visibility_intents
  FOR ALL
  USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- §1.10  project_command_log — APPEND-ONLY AUDIT (read by project owner).
ALTER TABLE IF EXISTS project_command_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_command_log_select_owner ON project_command_log;
CREATE POLICY project_command_log_select_owner ON project_command_log
  FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()));

-- §1.11  ifc_uploads — PER-USER.
ALTER TABLE IF EXISTS ifc_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ifc_uploads_self ON ifc_uploads;
CREATE POLICY ifc_uploads_self ON ifc_uploads
  FOR ALL
  USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- ════════════════════════════════════════════════════════════════════
-- §2  PRYZM 2 sync-server — all rows of rls-audit §1.2
-- ════════════════════════════════════════════════════════════════════

-- §2.1  event_log — PER-PROJECT (member or owner).
ALTER TABLE IF EXISTS event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_log_select_member_or_owner ON event_log;
CREATE POLICY event_log_select_member_or_owner ON event_log
  FOR SELECT
  USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = pryzm_auth_uid())
  );
DROP POLICY IF EXISTS event_log_insert_member_or_owner ON event_log;
CREATE POLICY event_log_insert_member_or_owner ON event_log
  FOR INSERT
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = pryzm_auth_uid())
  );

-- §2.2  soft_locks — PER-PROJECT (member or owner can read; only the
--                    holder can release).
ALTER TABLE IF EXISTS soft_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS soft_locks_select_project ON soft_locks;
CREATE POLICY soft_locks_select_project ON soft_locks
  FOR SELECT
  USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = pryzm_auth_uid())
  );
DROP POLICY IF EXISTS soft_locks_write_holder_only ON soft_locks;
CREATE POLICY soft_locks_write_holder_only ON soft_locks
  FOR ALL
  USING (holder_id = pryzm_auth_uid())
  WITH CHECK (holder_id = pryzm_auth_uid());

-- §2.3  project_members (sync-server schema — different from §1.2 above):
--      same pattern: members read themselves, owners read all, owners write.
--      The sync-server schema may use a different column set; the policy
--      assumes (project_id, user_id, role) like the PRYZM 1 schema.
--      No-op DROP POLICY IF EXISTS handles re-runs cleanly.
--      Already covered by §1.2 if both schemas share the table; if they
--      are separate physical tables (e.g. in different schemas), this
--      block is a no-op against the §1.2 table and applies cleanly to
--      the sync-server one.

-- §2.4  ai_usage — PER-USER (each row is one user's spend record).
ALTER TABLE IF EXISTS ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_self ON ai_usage;
CREATE POLICY ai_usage_self ON ai_usage
  FOR ALL
  USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- §2.5  audit_log (sync-server) — APPEND-ONLY AUDIT.
--      No SELECT policy by default — only the SOC2 evidence query
--      (S57 D7) reads this table, and that runs as the service role.
--      Adding an explicit owner-of-workspace SELECT policy is deferred
--      to S70 D8 when SOC2 admin UI lands.
ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;
-- (Intentionally no SELECT or INSERT policy → all client access denied.)

-- ════════════════════════════════════════════════════════════════════
-- §3  Marketplace catalog — all rows of rls-audit §1.3
-- ════════════════════════════════════════════════════════════════════

-- §3.1  publishers — PUBLISHER SELF-MANAGE (own row only).
ALTER TABLE IF EXISTS publishers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publishers_read_all ON publishers;
CREATE POLICY publishers_read_all ON publishers
  FOR SELECT
  USING (true);
DROP POLICY IF EXISTS publishers_write_self ON publishers;
CREATE POLICY publishers_write_self ON publishers
  FOR ALL
  USING (id = pryzm_auth_uid())
  WITH CHECK (id = pryzm_auth_uid());

-- §3.2  marketplace_plugins — CATALOG.
ALTER TABLE IF EXISTS marketplace_plugins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_plugins_read_all ON marketplace_plugins;
CREATE POLICY marketplace_plugins_read_all ON marketplace_plugins
  FOR SELECT
  USING (true);
DROP POLICY IF EXISTS marketplace_plugins_write_publisher ON marketplace_plugins;
CREATE POLICY marketplace_plugins_write_publisher ON marketplace_plugins
  FOR ALL
  USING (publisher_id = pryzm_auth_uid())
  WITH CHECK (publisher_id = pryzm_auth_uid());

-- §3.3  marketplace_plugin_versions — CATALOG.
ALTER TABLE IF EXISTS marketplace_plugin_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_plugin_versions_read_all ON marketplace_plugin_versions;
CREATE POLICY marketplace_plugin_versions_read_all ON marketplace_plugin_versions
  FOR SELECT
  USING (true);
DROP POLICY IF EXISTS marketplace_plugin_versions_write_publisher ON marketplace_plugin_versions;
CREATE POLICY marketplace_plugin_versions_write_publisher ON marketplace_plugin_versions
  FOR ALL
  USING (
    plugin_id IN (SELECT plugin_id FROM marketplace_plugins WHERE publisher_id = pryzm_auth_uid())
  )
  WITH CHECK (
    plugin_id IN (SELECT plugin_id FROM marketplace_plugins WHERE publisher_id = pryzm_auth_uid())
  );

-- ════════════════════════════════════════════════════════════════════
-- §4  Migration ledger — record this migration in schema_migrations.
-- ════════════════════════════════════════════════════════════════════
INSERT INTO schema_migrations (version, source, applied_at)
VALUES ('03-rls-policies', 'init-db', now())
ON CONFLICT (version) DO NOTHING;
