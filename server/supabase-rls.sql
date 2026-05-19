-- =============================================================================
-- PRYZM — Supabase Row-Level Security (RLS) Policies
-- =============================================================================
--
-- CONTRACT (07-BIM-SECURITY-CONTRACT §5 — Database Security):
--   RLS MUST be enabled on all tables that store user data.
--   Without RLS, any holder of the anon key can read or write all rows.
--   Apply these policies in the Supabase SQL editor or via a migration tool.
--
-- HOW TO APPLY:
--   1. Open your Supabase project dashboard → SQL Editor
--   2. Paste and run this file in full
--   3. Verify each table shows "RLS enabled" in the Table Editor
--
-- IMPORTANT: The server uses SUPABASE_SERVICE_ROLE_KEY (when set), which bypasses
-- RLS for trusted server operations. These policies protect direct client-side or
-- anon-key access. They are a defence-in-depth measure, not a replacement for
-- server-side auth.
-- =============================================================================


-- ─── Helper: get the authenticated user's Clerk user ID from the JWT ────────
-- Clerk embeds the user id in the 'sub' claim of the JWT.
-- Supabase exposes it via auth.jwt() -> 'sub'.
CREATE OR REPLACE FUNCTION pryzm_auth_uid() RETURNS text AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'sub',
    current_setting('request.jwt.claim.sub', true)
  );
$$ LANGUAGE sql STABLE;


-- =============================================================================
-- TABLE: projects
-- =============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Users can only see their own projects
CREATE POLICY "projects_select_own"
  ON projects FOR SELECT
  USING (owner_id = pryzm_auth_uid());

-- Users can only insert projects they own
CREATE POLICY "projects_insert_own"
  ON projects FOR INSERT
  WITH CHECK (owner_id = pryzm_auth_uid());

-- Users can only update their own projects
CREATE POLICY "projects_update_own"
  ON projects FOR UPDATE
  USING (owner_id = pryzm_auth_uid())
  WITH CHECK (owner_id = pryzm_auth_uid());

-- Users can only delete their own projects
CREATE POLICY "projects_delete_own"
  ON projects FOR DELETE
  USING (owner_id = pryzm_auth_uid());


-- =============================================================================
-- TABLE: project_versions
-- =============================================================================

ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;

-- Users can read versions for projects they own
CREATE POLICY "versions_select_own_project"
  ON project_versions FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()
    )
  );

-- Users can insert versions only into their own projects
CREATE POLICY "versions_insert_own_project"
  ON project_versions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()
    )
  );

-- Users can delete versions from their own projects
CREATE POLICY "versions_delete_own_project"
  ON project_versions FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = pryzm_auth_uid()
    )
  );


-- =============================================================================
-- TABLE: user_plans (if separate table used instead of planStore.js in-memory)
-- =============================================================================

-- If you migrate planStore.js to Supabase, apply the following:
-- ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
--
-- Users can only read their own plan row:
-- CREATE POLICY "user_plans_select_own"
--   ON user_plans FOR SELECT
--   USING (user_id = pryzm_auth_uid());
--
-- Plan updates are ONLY via the Stripe webhook (service role key bypasses RLS).
-- No client-facing INSERT/UPDATE/DELETE policies should be created for user_plans.


-- =============================================================================
-- VERIFICATION QUERIES
-- Run these to confirm RLS is active:
-- =============================================================================
--
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('projects', 'project_versions');
--
-- Expected output: rowsecurity = true for each table.
-- =============================================================================
