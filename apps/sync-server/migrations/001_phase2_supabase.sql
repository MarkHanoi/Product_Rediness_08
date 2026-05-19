-- 001_phase2_supabase.sql — combined Phase 2 schema (W-06).
--
-- Source: phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md §W-06.
-- Authority: ADR-0019 (linearisation), ADR-0035 (soft-locks + cutover),
--            ADR-0040 (authz-middleware-sync-server), ADR-0037 (ai-host).
--
-- This file is the single source of truth for the Phase 2 schemas that
-- migrate to Supabase as part of the S43 D9 cutover.  Apply order is
-- deliberate: tables that are referenced by FKs declare their referent
-- first.
--
-- Deliberately additive — every CREATE uses `IF NOT EXISTS` so re-running
-- against an existing Supabase instance is idempotent.  Destructive
-- operations (DROP TABLE project_command_log etc) are gated behind
-- `scripts/cutover-checklist.mjs` and run only after a 14-day green
-- restore-verify burn-in.
--
-- USAGE
-- ─────────────────────────────────────────────────────────────────────────────
--   psql "$DATABASE_URL" -f apps/sync-server/migrations/001_phase2_supabase.sql
--
-- Or via the supabase CLI:
--   supabase db push --file apps/sync-server/migrations/001_phase2_supabase.sql
--
-- The script is wrapped in a single transaction so partial failure rolls
-- back cleanly.

BEGIN;

-- ─── §1 Event log (S22 / ADR-0019) ──────────────────────────────────────────
-- Append-only event sequence per project.  `seq` is the linearisation
-- order; clients use `cursor` (a base64 of `seq`) to resume.
CREATE TABLE IF NOT EXISTS event_log (
  project_id   uuid          NOT NULL,
  seq          bigint        NOT NULL,
  event_id     text          NOT NULL,
  event_type   text          NOT NULL,
  actor_id     text          NOT NULL,
  payload      jsonb         NOT NULL,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, seq)
);

CREATE INDEX IF NOT EXISTS event_log_project_created_idx
  ON event_log (project_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS event_log_event_id_idx
  ON event_log (project_id, event_id);

-- ─── §2 Soft-locks (S43 / ADR-0035) ─────────────────────────────────────────
-- Per-element optimistic lock used by the multiplayer cursor + edit guard.
CREATE TABLE IF NOT EXISTS soft_locks (
  project_id   uuid          NOT NULL,
  element_id   text          NOT NULL,
  user_id      text          NOT NULL,
  client_id    text          NOT NULL,
  acquired_at  timestamptz   NOT NULL DEFAULT now(),
  expires_at   timestamptz   NOT NULL,
  PRIMARY KEY (project_id, element_id)
);

CREATE INDEX IF NOT EXISTS soft_locks_expires_idx
  ON soft_locks (expires_at);

CREATE INDEX IF NOT EXISTS soft_locks_user_idx
  ON soft_locks (project_id, user_id);

-- ─── §3 Project members — authz (W-03 / ADR-0040) ──────────────────────────
-- Ground truth for `authz.can(*, projectId)` membership checks.  Phase 3C
-- replaces the `user_id text` with a Supabase Auth UUID join; the policy
-- surface (rows here) does not change.
CREATE TABLE IF NOT EXISTS project_members (
  project_id   uuid          NOT NULL,
  user_id      text          NOT NULL,
  role         text          NOT NULL DEFAULT 'editor',
  added_at     timestamptz   NOT NULL DEFAULT now(),
  added_by     text,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT project_members_role_chk
    CHECK (role IN ('viewer', 'editor', 'owner'))
);

CREATE INDEX IF NOT EXISTS project_members_user_idx
  ON project_members (user_id);

-- ─── §4 AI usage / cost meter (S47 / ADR-0037) ─────────────────────────────
-- Per-call AI usage row.  `cost_usd` is computed via SPEC-28 §1 pricing
-- (also pinned in `packages/ai-cost/src/CostMeter.ts`).
CREATE TABLE IF NOT EXISTS ai_usage (
  id              bigserial     PRIMARY KEY,
  project_id      uuid          NOT NULL,
  user_id         text          NOT NULL,
  workflow_kind   text          NOT NULL,
  provider        text          NOT NULL,
  model           text          NOT NULL,
  input_tokens    bigint        NOT NULL DEFAULT 0,
  output_tokens   bigint        NOT NULL DEFAULT 0,
  cost_usd        numeric(10,6) NOT NULL DEFAULT 0,
  recorded_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_project_recorded_idx
  ON ai_usage (project_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_user_recorded_idx
  ON ai_usage (user_id, recorded_at DESC);

-- ─── §5 Audit log (S57 / S65 carry-over) ───────────────────────────────────
-- Defence-in-depth: every authz denial / cutover action lands here.  The
-- middleware (`tests/audit-log-s57/`) writes via the same connection.
CREATE TABLE IF NOT EXISTS audit_log (
  id           bigserial     PRIMARY KEY,
  occurred_at  timestamptz   NOT NULL DEFAULT now(),
  actor_id     text,
  action       text          NOT NULL,
  resource     text          NOT NULL,
  decision     text          NOT NULL,            -- 'allow' | 'deny' | 'error'
  metadata     jsonb         NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_log_decision_chk
    CHECK (decision IN ('allow', 'deny', 'error'))
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_idx
  ON audit_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON audit_log (actor_id, occurred_at DESC);

COMMIT;

-- ─── §6 Post-migration smoke ───────────────────────────────────────────────
-- Run after the COMMIT above to verify the schema is reachable:
--
--   SELECT count(*) FROM event_log;
--   SELECT count(*) FROM soft_locks;
--   SELECT count(*) FROM project_members;
--   SELECT count(*) FROM ai_usage;
--   SELECT count(*) FROM audit_log;
--
-- All five MUST return `0` on a fresh install.
