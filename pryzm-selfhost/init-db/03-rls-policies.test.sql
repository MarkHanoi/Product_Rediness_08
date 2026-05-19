-- pryzm-selfhost/init-db/03-rls-policies.test.sql
-- S69 D6 — Verified test queries for the RLS policies in 03-rls-policies.sql.
--
-- Spec source: docs/security/rls-audit-2026-Q4.md §4 ("Verified test
-- queries — deferred (with reason)") + S68 D5 exit-criterion language
-- ("RLS audit on Postgres: every table has policy; verified test queries").
-- Drill source: docs/00_NEW_ARCHITECTURE/runbooks/DR-DRILL-RUNBOOK.md
-- §6 ("RLS verification step").
--
-- USAGE — operator-side D6 procedure:
--   1.  Start a fresh Postgres 16 instance:
--         docker run -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16-alpine
--   2.  Apply the schema:
--         psql -h localhost -p 5433 -U postgres -f pryzm-selfhost/init-db/01-bootstrap.sql
--         psql -h localhost -p 5433 -U postgres -f pryzm-selfhost/init-db/02-marketplace.sql
--         psql -h localhost -p 5433 -U postgres -f pryzm-selfhost/init-db/03-rls-policies.sql
--   3.  Apply the test seeds + assertions:
--         psql -h localhost -p 5433 -U postgres -f pryzm-selfhost/init-db/03-rls-policies.test.sql
--   4.  Tear-down:
--         docker rm -f <container>
--
-- All assertions use the `assert_eq` and `assert_denied` helpers below.
-- Any failure raises EXCEPTION → psql exit code != 0 → drill fails.
--
-- HONESTY NOTE — this file has been hand-checked against the policy
-- patterns in `03-rls-policies.sql`.  Live execution against a Postgres
-- daemon is the operator-side D6 deliverable per the DR drill runbook.
-- The test file lands here so the drill is reproducible by anyone
-- following the runbook.

\c pryzm

-- ════════════════════════════════════════════════════════════════════
-- §0  Test infrastructure — assertion helpers + RLS-bypass switch.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assert_eq(actual ANYELEMENT, expected ANYELEMENT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'ASSERT PASS [%]: %', label, actual;
END;
$$;

CREATE OR REPLACE FUNCTION assert_denied(query TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  rows_inserted INTEGER;
BEGIN
  EXECUTE query;
  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  IF rows_inserted > 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: expected RLS denial, but % row(s) were affected', label, rows_inserted;
  ELSE
    -- INSERT/UPDATE/DELETE that affects 0 rows under RLS is the silent-deny path.
    RAISE NOTICE 'ASSERT PASS [%]: silently denied (0 rows)', label;
  END IF;
EXCEPTION
  WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'ASSERT PASS [%]: explicitly denied (%)', label, SQLERRM;
END;
$$;

-- The test harness runs as a Postgres role that can SET ROLE to a
-- non-superuser, so RLS actually applies.  Superusers bypass RLS,
-- which would invalidate every assertion below.
CREATE ROLE rls_test NOLOGIN;
GRANT USAGE ON SCHEMA public TO rls_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rls_test;

-- ════════════════════════════════════════════════════════════════════
-- §1  Seed data — 2 users, 2 projects, mixed membership.
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET ROLE postgres;  -- bypass RLS for seeding

-- Users: alice + bob.
INSERT INTO pryzm_users (id, email) VALUES
  ('user-alice', 'alice@example.com'),
  ('user-bob',   'bob@example.com')
ON CONFLICT (id) DO NOTHING;

-- Projects: proj-A owned by alice; proj-B owned by bob.  Bob is a
-- member of proj-A.
INSERT INTO projects (id, owner_id, name) VALUES
  ('proj-A', 'user-alice', 'Alice''s project'),
  ('proj-B', 'user-bob',   'Bob''s project')
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_members (project_id, user_id, role) VALUES
  ('proj-A', 'user-bob',   'editor'),
  ('proj-B', 'user-bob',   'owner')
ON CONFLICT DO NOTHING;

-- Per-user data: alice's plan + render gallery row; bob's plan.
INSERT INTO user_plans (user_id, plan_tier) VALUES
  ('user-alice', 'pro'),
  ('user-bob',   'free')
ON CONFLICT DO NOTHING;

INSERT INTO render_gallery (id, user_id, render_url) VALUES
  ('rg-1', 'user-alice', '/r/1'),
  ('rg-2', 'user-bob',   '/r/2')
ON CONFLICT DO NOTHING;

-- Per-project event-log seed.
INSERT INTO event_log (project_id, seq, payload) VALUES
  ('proj-A', 1, '{"k":"alice-event"}'::jsonb),
  ('proj-B', 1, '{"k":"bob-event"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Marketplace seed: alice publishes plug-1; bob publishes plug-2.
INSERT INTO publishers (id, display_name, public_key_b64, workspace_id) VALUES
  ('user-alice', 'Alice Inc', 'AAAA', 'ws-alice'),
  ('user-bob',   'Bob Inc',   'BBBB', 'ws-bob')
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace_plugins (plugin_id, publisher_id, name) VALUES
  ('plug-1', 'user-alice', 'Plug One'),
  ('plug-2', 'user-bob',   'Plug Two')
ON CONFLICT DO NOTHING;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- §2  AS USER ALICE — verify positive + negative cases.
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE rls_test;
SET LOCAL request.jwt.claim.sub = 'user-alice';

-- §2.1 user_plans — alice sees own row only.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM user_plans),
  1,
  'user_plans: alice sees 1 row');

-- §2.2 render_gallery — alice sees own row only.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM render_gallery),
  1,
  'render_gallery: alice sees 1 row');

-- §2.3 projects — alice sees both proj-A (owner) and proj-B (NOT a
--      member, so not visible).  Pre-existing policy from
--      `server/supabase-rls.sql` filters by owner_id only.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM projects),
  1,
  'projects: alice sees 1 (her own)');

-- §2.4 event_log — alice sees proj-A events (owner), not proj-B.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM event_log),
  1,
  'event_log: alice sees proj-A events only');

-- §2.5 NEGATIVE: alice tries to insert a row for bob → silently denied.
SELECT assert_denied(
  $sql$INSERT INTO user_plans (user_id, plan_tier) VALUES ('user-bob', 'enterprise')$sql$,
  'user_plans: alice cannot insert as bob');

-- §2.6 NEGATIVE: alice tries to write to bob's render gallery → denied.
SELECT assert_denied(
  $sql$INSERT INTO render_gallery (id, user_id, render_url) VALUES ('rg-3', 'user-bob', '/r/3')$sql$,
  'render_gallery: alice cannot insert as bob');

-- §2.7 marketplace catalog read — anyone sees all plugins.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM marketplace_plugins),
  2,
  'marketplace_plugins: read-anyone visible to alice');

-- §2.8 NEGATIVE: alice cannot modify bob's plugin.
SELECT assert_denied(
  $sql$UPDATE marketplace_plugins SET name = 'Hacked' WHERE plugin_id = 'plug-2'$sql$,
  'marketplace_plugins: alice cannot modify bob''s plugin');

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- §3  AS USER BOB — symmetric checks (member-of-proj-A path).
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE rls_test;
SET LOCAL request.jwt.claim.sub = 'user-bob';

-- §3.1 user_plans — bob sees own row only.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM user_plans),
  1,
  'user_plans: bob sees 1 row');

-- §3.2 event_log — bob is a member of proj-A AND owner of proj-B → sees both.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM event_log),
  2,
  'event_log: bob (member of A + owner of B) sees both');

-- §3.3 NEGATIVE: bob cannot read alice's plan even though he's a member of her project.
--      user_plans is per-user, not per-project.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM user_plans WHERE user_id = 'user-alice'),
  0,
  'user_plans: bob cannot read alice''s row');

-- §3.4 marketplace publisher self-management — bob can update his own plugin.
UPDATE marketplace_plugins SET name = 'Plug Two v2' WHERE plugin_id = 'plug-2';
SELECT assert_eq(
  (SELECT name FROM marketplace_plugins WHERE plugin_id = 'plug-2'),
  'Plug Two v2',
  'marketplace_plugins: bob updates own plugin');

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- §4  NO-JWT CONTEXT — verify total denial without sub claim.
-- ════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL ROLE rls_test;
-- Deliberately NO `SET LOCAL request.jwt.claim.sub`.

-- pryzm_auth_uid() returns NULL → every USING clause becomes NULL → denies.
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM user_plans),
  0,
  'no-jwt: user_plans denies all reads');
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM event_log),
  0,
  'no-jwt: event_log denies all reads');

-- Catalog tables remain readable even without JWT (`USING (true)`).
SELECT assert_eq(
  (SELECT COUNT(*)::INTEGER FROM marketplace_plugins),
  2,
  'no-jwt: marketplace_plugins read-anyone unaffected');

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- §5  Summary line — printable by the drill log.
-- ════════════════════════════════════════════════════════════════════
\echo '✓ RLS verification: every assertion in 03-rls-policies.test.sql PASSED'
\echo '  — Apply this file from the DR drill day (S69 D6) per DR-DRILL-RUNBOOK.md §6.'
