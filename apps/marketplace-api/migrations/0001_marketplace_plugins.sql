-- 0001_marketplace_plugins.sql
-- S64 D1 — marketplace schema + first-party plugin seeding pipeline.
-- Source authority: phase-doc-2 §S64 "Implementation Detail — Marketplace
-- plugin record" (verbatim).  Strategic ADR-009 references mandate
-- Ed25519 signing + revocation list + per-plugin install scoping.
--
-- Run order: this is the bootstrap migration for the marketplace schema.
-- D2-D5 add: plugin_install_records (per-workspace install scoping),
-- plugin_audit_findings (third-party security audit log), and
-- publisher_onboarding (third-party invitation cohort).

-- ────────────────────────────────────────────────────────────────────
-- publishers — referenced by marketplace_plugins.publisher_id.
-- The phase-doc SQL block omits this table because it expects an
-- existing publishers schema; we declare it here so the migration is
-- self-contained.  D5 third-party invitation cohort writes here.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS publishers (
  id                TEXT PRIMARY KEY,                 -- e.g. 'pryzm', 'acme-bim'
  display_name      TEXT NOT NULL,
  public_key_b64    TEXT NOT NULL UNIQUE,             -- 32-byte Ed25519, base64url
  is_first_party    BOOLEAN NOT NULL DEFAULT FALSE,
  workspace_id      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────
-- marketplace_plugins — verbatim from phase-doc-2 §S64.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_plugins (
  plugin_id        TEXT PRIMARY KEY,                  -- 'pryzm/walls' or 'thirdparty/structural-rules'
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
  version          TEXT NOT NULL,                     -- semver MAJOR.MINOR.PATCH
  signature        TEXT NOT NULL,                     -- Ed25519 signature, base64
  signed_by_keyid  TEXT NOT NULL,                     -- publisher's Ed25519 public key fingerprint
  bundle_url       TEXT NOT NULL,
  bundle_sha256    TEXT NOT NULL,
  published_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,                       -- non-null = revoked
  revoke_reason    TEXT,
  PRIMARY KEY (plugin_id, version)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_plugin_versions_revoked
  ON marketplace_plugin_versions(plugin_id) WHERE revoked_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- Bootstrap publishers row — first-party 'pryzm' publisher.
-- The real Ed25519 public key is wired at S64 D5 "signing + revocation
-- infra"; D1 seeds a placeholder so the FK invariant is satisfied
-- while subsequent migrations + dev-mode UPSERTs run.
-- ────────────────────────────────────────────────────────────────────
INSERT INTO publishers (id, display_name, public_key_b64, is_first_party, workspace_id)
VALUES ('pryzm', 'PRYZM', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', TRUE, 'pryzm')
ON CONFLICT (id) DO NOTHING;
