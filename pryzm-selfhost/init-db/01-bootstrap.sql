-- pryzm-selfhost/init-db/01-bootstrap.sql
-- S67 D2 — Postgres bootstrap for self-host stack.
--
-- This file is mounted at /docker-entrypoint-initdb.d/01-bootstrap.sql in the
-- postgres:16-alpine container.  Postgres runs files in this directory
-- alphabetically on first boot only (when /var/lib/postgresql/data is empty).
--
-- Order:
--   01-bootstrap.sql   ← this file: schema_migrations + role grants
--   02-marketplace.sql ← marketplace plugins schema (S64, copied from
--                        apps/marketplace-api/migrations/0001_marketplace_plugins.sql)
--
-- Subsequent migrations (sync-server CommandEvent log, bake job state, project
-- ACLs, etc.) ship as code-managed migrations under apps/*/migrations/ and run
-- on first service boot.  This file is the absolute minimum needed for the
-- stack to start clean.

-- ────────────────────────────────────────────────────────────────────
-- Connect to the application database (POSTGRES_DB=pryzm in compose).
-- ────────────────────────────────────────────────────────────────────
\c pryzm

-- ────────────────────────────────────────────────────────────────────
-- Required extensions.
--   pgcrypto    — gen_random_uuid() for IDs.
--   citext      — case-insensitive emails / publisher slugs.
-- ────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ────────────────────────────────────────────────────────────────────
-- schema_migrations — single source of truth for what's been applied.
-- Each migration file (in this directory or app-managed) inserts a row
-- on successful apply.  Idempotent: re-applies are no-ops because
-- INSERT … ON CONFLICT DO NOTHING.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version       TEXT PRIMARY KEY,            -- e.g. '0001_marketplace_plugins'
  source        TEXT NOT NULL,               -- 'init-db' | 'apps/<name>/migrations'
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum_sha256 TEXT                       -- optional integrity check
);

INSERT INTO schema_migrations (version, source)
VALUES ('0000_bootstrap', 'init-db')
ON CONFLICT (version) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- App role grants.  The pryzm role (POSTGRES_USER=pryzm) owns the DB
-- already; future per-service roles (sync_server_rw, bake_worker_rw,
-- api_gateway_ro) land in S68 D5 alongside the RLS audit.
-- ────────────────────────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON SCHEMA public TO pryzm;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pryzm;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pryzm;
