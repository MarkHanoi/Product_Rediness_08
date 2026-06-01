# Postgres RLS Audit — 2026-Q4 (S68 D5)

**Sprint**: PRYZM 2 Phase 3D · S68 D5
**Spec ref**: `docs/03-execution/plans/legacy/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 D5 — "RLS audit on Postgres: every table has policy; verified test queries."
**Exit-criteria target**: "RLS verified" (S68 exit §3); "RLS audit on Postgres: every table has policy" (S68 exit-criteria table row 4).
**Carry-forward from S67**: ADR-0048 §F follow-up — per-service rw/ro role split for the self-host stack.

---

## §1 Inventory — every persistent table

This audit enumerates **every CREATE TABLE in the repo** and records its RLS posture as of 2026-04-28.

### 1.1 PRYZM 1 / shared schema (`server/schema.sql`)

| #  | Table                  | Holds user data?                              | RLS policy?                       | Source of policy              |
| -- | ---------------------- | --------------------------------------------- | --------------------------------- | ----------------------------- |
| 1  | `pryzm_users`          | Yes (email, hash)                             | **MISSING** — only commented stub | `server/supabase-rls.sql:99`+ |
| 2  | `projects`             | Yes (owner, metadata)                         | **PRESENT** (`projects_select_own`, `_insert_own`, `_update_own`, `_delete_own`) | `server/supabase-rls.sql:38–61` |
| 3  | `project_versions`     | Yes (owner via project_id, snapshot)          | **PRESENT** (`versions_select_own_project`, `_insert_own_project`, `_delete_own_project`) | `server/supabase-rls.sql:67–93` |
| 4  | `project_members`      | Yes (member list per project)                 | **MISSING** — only commented stub | `server/supabase-rls.sql:?`   |
| 5  | `version_audit_log`    | Yes (actor + timestamps)                      | **MISSING** — append-only audit; needs read-only policy + service-role insert | n/a |
| 6  | `user_plans`           | Yes (per-user quota state)                    | **MISSING** — only commented stub | `server/supabase-rls.sql:?`   |
| 7  | `render_gallery`       | Yes (per-user render metadata)                | **MISSING** — only commented stub | `server/supabase-rls.sql:?`   |
| 8  | `panorama_gallery`     | Yes (per-user panorama metadata)              | **MISSING** — only commented stub | `server/supabase-rls.sql:?`   |
| 9  | `project_webhooks`     | Yes (per-project webhook URLs + secrets)      | **MISSING**                       | n/a                           |
| 10 | `template_registry`    | Mostly read-only catalog                      | **MISSING** — likely read-anyone, write-admin pattern needed | n/a |
| 11 | `visibility_intents`   | Yes (per-user view filters)                   | **MISSING**                       | n/a                           |
| 12 | `project_command_log`  | Yes (audit log)                               | **MISSING** — append-only audit pattern needed | n/a |
| 13 | `ifc_uploads`          | Yes (per-user upload manifests)               | **MISSING**                       | n/a                           |

**Coverage**: 2 / 13 tables have explicit RLS policies; 11 / 13 have either commented stubs or no mention.

### 1.2 PRYZM 2 sync-server (`apps/sync-server/migrations/001_phase2_supabase.sql` + `apps/sync-server/src/{authz,locks}/*.sql`)

| # | Table             | Holds user data?              | RLS policy?              | Source                     |
| - | ----------------- | ----------------------------- | ------------------------ | -------------------------- |
| 1 | `event_log`       | Yes (per-project event stream)| **MISSING**              | n/a                        |
| 2 | `soft_locks`      | Yes (lock-holder identity)    | **MISSING**              | n/a                        |
| 3 | `project_members` | Yes (RBAC subject + role)     | **MISSING**              | n/a (different table from §1.1 row 4 — phase 2 schema) |
| 4 | `ai_usage`        | Yes (per-user AI spend)       | **MISSING**              | n/a                        |
| 5 | `audit_log`       | Yes (security audit events)   | **MISSING** — append-only | n/a                       |

**Coverage**: 0 / 5 tables have explicit RLS.

### 1.3 PRYZM 2 marketplace (`apps/marketplace-api/migrations/0001_marketplace_plugins.sql`)

| # | Table                          | Holds user data?               | RLS policy?              |
| - | ------------------------------ | ------------------------------ | ------------------------ |
| 1 | `publishers`                   | Yes (publisher identity + key) | **MISSING**              |
| 2 | `marketplace_plugins`          | Mostly catalog (publisher-owned) | **MISSING**            |
| 3 | `marketplace_plugin_versions`  | Mostly catalog (publisher-owned) | **MISSING**            |

**Coverage**: 0 / 3 tables have explicit RLS.

### 1.4 Self-host bootstrap (`pryzm-selfhost/init-db/01-bootstrap.sql` + `02-marketplace.sql`)

The self-host bootstrap files create `schema_migrations` (system) plus mirror the marketplace tables from §1.3. Same RLS posture: 0 / 3.

---

## §2 Honest gap analysis

**Of 21 distinct user-data-bearing tables across the repo, only 2 (≈ 9 %) have RLS policies in the migration tree.**

That number is **misleading on its own** — most of these tables are written and read by trusted server processes (`server.js`, `apps/sync-server`, `apps/api-gateway`, `apps/marketplace-api`) using either:

- The Supabase **service role key** (which bypasses RLS by design), or
- A direct Postgres connection from a privileged service account.

The `server/supabase-rls.sql` header is explicit about this:

> The server uses `SUPABASE_SERVICE_ROLE_KEY` (when set), which bypasses RLS for trusted server operations. These policies protect direct client-side or anon-key access. They are a defence-in-depth measure, not a replacement for server-side auth.

**So the working security model is**: server-side authz (the api-gateway's `defaultTestAuthShim` → production OAuth2 resource server, plus `apps/sync-server/src/authz/` middleware) gates every request before it reaches Postgres. RLS is a **defence-in-depth backstop** for the case where the anon key leaks or a misconfigured service exposes a direct DB connection.

**The S68 D5 exit criterion** ("every table has policy") **treats the backstop as mandatory** — and that is the correct gate, because:

1. The self-host stack uses a single Postgres user (`pryzm`) for all services in the S67 baseline. If any service is compromised, that one credential reads everything.
2. The marketplace catalog tables are read by the **marketplace-web public surface**, which is a different trust zone from the editor.
3. SOC2 (S57 contract) requires "least-privilege access controls" at the database layer.

---

## §3 Remediation plan — split into S68 D5 fix + S69+ follow-on

### 3.1 S68 D5 fix — landed in this sprint (documentation only)

This audit doc itself **is the S68 D5 D-output**. The D5 spec language ("RLS audit on Postgres: every table has policy; verified test queries") is split intentionally:

- **The audit** (this doc) — DONE — enumerates every table, records the gap honestly.
- **The policy migrations + verified test queries** — SCOPED HERE, IMPLEMENTATION DEFERRED to §3.2.

The reason for the split: writing 19 new RLS policies across 4 schemas + verifying them with test queries against a live Postgres is **outside the dev-env capability** (no Postgres daemon to apply migrations against, no Supabase project to verify against). Doing it as untested SQL would violate the no-fake-verification rule. The **honest** S68 D5 deliverable is this audit.

### 3.2 Per-table policy follow-on (sprint S69 D6 — DR drill day fits the same code path)

The policy migrations land in two new files at S69 D6 (which already touches the rollback runbook + DR drill against a live Postgres):

| File                                                | Adds RLS for                                         |
| --------------------------------------------------- | ---------------------------------------------------- |
| `server/supabase-rls.sql` (extension)               | rows 1, 4–13 of §1.1 (PRYZM 1 schema)                |
| `apps/sync-server/migrations/002_rls_policies.sql`  | all rows of §1.2 (sync-server schema)                |
| `apps/marketplace-api/migrations/0002_rls.sql`      | all rows of §1.3 (marketplace schema)                |
| `pryzm-selfhost/init-db/03-rls-policies.sql`        | mirrors marketplace + sync-server policies for self-host bootstrap |

Each new policy follows the established pattern from `server/supabase-rls.sql`:

```sql
-- Append-only audit-table pattern (audit_log, version_audit_log, project_command_log)
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "<name>_select_own" ON <table>
  FOR SELECT USING (actor_id = pryzm_auth_uid());
-- INSERT only via SECURITY DEFINER service function; no client INSERT policy.

-- Per-project pattern (event_log, soft_locks, ai_usage, project_webhooks, ifc_uploads, project_members)
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "<name>_select_own_project" ON <table>
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = pryzm_auth_uid())
    OR project_id IN (SELECT project_id FROM project_members WHERE user_id = pryzm_auth_uid())
  );
-- + symmetric INSERT/UPDATE/DELETE policies as appropriate.

-- Per-user pattern (user_plans, render_gallery, panorama_gallery, visibility_intents)
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "<name>_self" ON <table>
  FOR ALL USING (user_id = pryzm_auth_uid())
  WITH CHECK (user_id = pryzm_auth_uid());

-- Catalog pattern (template_registry, marketplace_plugins, marketplace_plugin_versions)
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "<name>_read_all" ON <table> FOR SELECT USING (true);
CREATE POLICY "<name>_write_publisher" ON <table>
  FOR INSERT WITH CHECK (publisher_id = pryzm_auth_uid());
-- + UPDATE/DELETE limited to publisher_id.

-- Publisher self-management (publishers)
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publishers_self" ON publishers
  FOR ALL USING (id = pryzm_auth_uid())
  WITH CHECK (id = pryzm_auth_uid());
```

Verified test queries land alongside each migration as `<name>_rls.test.sql` — invoked from a sync-server vitest workflow that boots a Postgres docker (S69 D6 DR drill day already provisions one).

### 3.3 Per-service rw/ro role split (carry-forward from S67 ADR-0048 §F)

The self-host stack currently uses a single `pryzm` Postgres user for all services. ADR-0048 §F flagged a follow-up to split into per-service rw/ro roles:

```
pryzm_sync_rw       — sync-server: rw on event_log, soft_locks, project_members, ai_usage, audit_log
pryzm_sync_ro       — read-only equivalent for read-replica routing (M37+ post-GA)
pryzm_gateway_rw    — api-gateway: rw on session-related rows, ro on everything else
pryzm_marketplace_rw — marketplace-api: rw on marketplace_plugins, publishers, marketplace_plugin_versions
pryzm_baker_ro      — bake-worker: ro on project_versions for snapshot fetch
```

This split lands in `pryzm-selfhost/init-db/01-bootstrap.sql` as a follow-on to §3.2 RLS policies. **Not in S68 D5 scope** because it requires changing every service's `DATABASE_URL` env var, retesting all 175+ tests across api-gateway/sync-server/bake-worker. Tracked at S70 D8 self-host publish day.

---

## §4 Verified test queries — deferred (with reason)

The S68 D5 spec calls for "verified test queries". As §3.1 explains, applying and verifying RLS against a live Postgres is outside the dev-env capability for this sprint. The verification queries are **specified** here so they land alongside the §3.2 migrations:

```sql
-- For every per-user table, two queries must hold:
--   1. As user A, SELECT returns only rows where actor matches A.
--   2. As user A, attempting to INSERT a row with actor=B is rejected.
-- 
-- Standard test harness (sync-server vitest pattern):

SET LOCAL request.jwt.claim.sub = 'user-a';
SELECT * FROM <table>;                          -- expect: only user-a rows
INSERT INTO <table> (..., actor_id) VALUES (..., 'user-b');  -- expect: RLS rejection

SET LOCAL request.jwt.claim.sub = 'user-b';
SELECT * FROM <table>;                          -- expect: only user-b rows
```

Per-table test scaffolding lands in `apps/sync-server/__tests__/rls/` at S69 D6.

---

## §5 What this audit does NOT claim

- It does **not** claim every table now has an RLS policy — only 2 / 21 do today, and the rest are tracked in §3.2 for S69 D6 implementation.
- It does **not** claim verified test queries — those queries are specified in §4 but cannot be executed in this dev environment.
- It does **not** claim the per-service rw/ro role split is done — that is a follow-on at S70 D8.
- It does **not** replace server-side authz (the api-gateway + sync-server middleware that gates every request before it reaches Postgres). RLS is a defence-in-depth backstop, not the primary gate.
- It does **not** cover Supabase-managed tables outside `server/schema.sql` (e.g. `auth.users`) — those are governed by Supabase's own RLS defaults.

---

**Authored by**: sprint-S68 (2026-04-28)
**Companion docs**: `docs/04-reference/security/csp-audit-2026-Q4.md`, `docs/04-reference/security/oauth2-review-2026-Q4.md`.
