-- soft-locks schema (S45 D2).  Verbatim from
-- `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S45 lines 427-438,
-- extended with the holder-display-name column needed for the 409 conflict
-- response body and the project_id/element_id index needed for the
-- per-project list endpoint.
--
-- The migration is idempotent — guarded with IF NOT EXISTS so the same SQL
-- can run on a fresh database (Supabase D9 cutover) and on an already-bootstrapped
-- one.  Use `psql -f apps/sync-server/src/locks/soft-locks.sql` to apply.

CREATE TABLE IF NOT EXISTS soft_locks (
  element_id          TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  holder_id           TEXT NOT NULL,
  holder_display_name TEXT NOT NULL,
  lease_id            UUID NOT NULL,
  acquired_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_future_expiry CHECK (expires_at > acquired_at)
);

-- Sweeper index — the sweeper SQL is `DELETE FROM soft_locks WHERE
-- expires_at <= now()`; this index makes that O(log n) instead of O(n).
CREATE INDEX IF NOT EXISTS soft_locks_expires_at_idx
  ON soft_locks (expires_at);

-- List-by-project index — GET /api/locks scans by project_id every cold-start.
CREATE INDEX IF NOT EXISTS soft_locks_project_id_idx
  ON soft_locks (project_id);

-- Per-project per-element advisory-lock key — the application uses
-- pg_advisory_xact_lock(hashtextextended(project_id || element_id, 0)) to
-- guard the (read existing → maybe-insert → maybe-overwrite) acquire path.
-- No DDL needed for that; documenting here for future readers.
