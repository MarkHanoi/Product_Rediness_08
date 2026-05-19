-- pryzm-selfhost/init-db/02-marketplace.sql
-- S67 D2 — Mirrors apps/marketplace-api/migrations/0001_marketplace_plugins.sql
--          for self-host bootstrap.  Source of truth for the marketplace schema
--          remains the file in apps/marketplace-api/migrations/.  This copy
--          exists so a fresh `docker compose up` produces a database that
--          marketplace-api can serve immediately, without requiring a
--          separate migration runner step in the install path.
--
-- Keep this file in sync with apps/marketplace-api/migrations/0001_marketplace_plugins.sql.
-- A drift check is added to S67 D8 lint.

\c pryzm

-- ────────────────────────────────────────────────────────────────────
-- publishers — referenced by marketplace_plugins.publisher_id.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publishers (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  public_key_b64    TEXT NOT NULL UNIQUE,
  is_first_party    BOOLEAN NOT NULL DEFAULT FALSE,
  workspace_id      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- marketplace_plugins — verbatim from phase-doc-2 §S64.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_plugins (
  plugin_id        TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  publisher_id     TEXT NOT NULL REFERENCES publishers(id),
  description      TEXT NOT NULL,
  license          TEXT NOT NULL,
  category         TEXT NOT NULL,
  surfaces         TEXT[] NOT NULL,
  homepage_url     TEXT,
  source_url       TEXT,
  is_first_party   BOOLEAN NOT NULL DEFAULT FALSE,
  audit_passed     BOOLEAN NOT NULL DEFAULT FALSE,
  audit_passed_at  TIMESTAMPTZ,
  install_count    BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_publisher ON marketplace_plugins(publisher_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_category  ON marketplace_plugins(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_plugins_first_pty ON marketplace_plugins(is_first_party);

-- ────────────────────────────────────────────────────────────────────
-- marketplace_plugin_versions — verbatim from phase-doc-2 §S64.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_plugin_versions (
  plugin_id        TEXT NOT NULL REFERENCES marketplace_plugins(plugin_id) ON DELETE CASCADE,
  version          TEXT NOT NULL,
  signature        TEXT NOT NULL,
  signed_by_keyid  TEXT NOT NULL,
  bundle_url       TEXT NOT NULL,
  bundle_sha256    TEXT NOT NULL,
  published_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  revoke_reason    TEXT,
  PRIMARY KEY (plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_plugin_versions_revoked
  ON marketplace_plugin_versions(plugin_id) WHERE revoked_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- Bootstrap publishers row — first-party 'pryzm' publisher.
-- ────────────────────────────────────────────────────────────────────
INSERT INTO publishers (id, display_name, public_key_b64, is_first_party, workspace_id)
VALUES ('pryzm', 'PRYZM', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', TRUE, 'pryzm')
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────
-- Record this migration.
-- ────────────────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, source)
VALUES ('0001_marketplace_plugins', 'init-db')
ON CONFLICT (version) DO NOTHING;
