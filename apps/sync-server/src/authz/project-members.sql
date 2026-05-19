-- apps/sync-server/authz/project-members.sql — W-03 / ADR-0040.
--
-- Membership table backing `PgAuthz` (Phase 3C).  v0 in-memory authz reads
-- a Map; this schema lands now so the cutover (W-06) creates the table at
-- the same time as the event_log and soft_locks tables.
--
-- Roles are textual to keep the table forward-compatible with future
-- additions (`viewer`, `commenter`, …).  Phase 3C JWT will map `roles`
-- claim → row insert / update.

CREATE TABLE IF NOT EXISTS project_members (
  project_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'editor',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_user_idx
  ON project_members (user_id);

COMMENT ON TABLE project_members IS
  'PRYZM 2 W-03 / ADR-0040 — per-project membership for authz.can.';
COMMENT ON COLUMN project_members.role IS
  'Role string; v0: editor; Phase 3C: editor|viewer|commenter|owner.';
