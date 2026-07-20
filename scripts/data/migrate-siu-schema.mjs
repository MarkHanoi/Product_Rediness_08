#!/usr/bin/env node
/**
 * §L-441 Tier B — PostGIS schema for the national clasificación-del-suelo mirror.
 *
 * DELIBERATELY **NOT** IN `server/dbMigrate.js`.
 * That module runs on every server boot and owns the application tables. This corpus is a
 * different lifecycle — a ~3 GB batch load refreshed roughly semi-annually — and it depends on
 * the PostGIS extension. Wiring it into the boot path would mean:
 *   • a missing/disabled PostGIS extension takes the whole app down at startup, and
 *   • every boot pays for a migration that changes twice a year.
 * So it is an explicit, operator-run command. Boot stays fast and cannot be broken by the
 * data platform.
 *
 * USAGE
 *   DATABASE_URL=postgres://…  node scripts/data/migrate-siu-schema.mjs
 *   DATABASE_URL=postgres://…  node scripts/data/migrate-siu-schema.mjs --check   # no writes
 *
 * Idempotent. Safe to re-run.
 */

import pg from 'pg';

const CHECK_ONLY = process.argv.includes('--check');

/**
 * ATOMIC REFRESH DESIGN — the reason for `source_version` + a view.
 *
 * The naive refresh is DELETE-then-INSERT. That leaves a window, potentially minutes long on
 * a 3 GB corpus, in which the table is empty or half-populated — and during it every user
 * query silently returns "no classification data" for real Spanish land. Under C58 §1.4 that
 * is worse than an error: it is a confident wrong answer.
 *
 * Instead every row carries the ingest batch that produced it, one row in
 * `siu_ingest_version` marks which batch is ACTIVE, and `siu_clases_suelo_current` reads only
 * that batch. A refresh loads a new version alongside the live one and then flips a single
 * row. The swap is one UPDATE — atomic, instant, and trivially reversible by flipping back,
 * which also gives us a rollback path if a refresh ingests bad data.
 */
const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS siu_ingest_version (
    version      TEXT PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'loading',   -- loading | active | superseded
    source       TEXT NOT NULL DEFAULT 'siu',
    source_url   TEXT NOT NULL,
    row_count    BIGINT NOT NULL DEFAULT 0,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ,
    notes        TEXT
);

-- Exactly one active version at a time. A partial unique index makes that an invariant the
-- database enforces, rather than a convention the loader is trusted to honour.
CREATE UNIQUE INDEX IF NOT EXISTS idx_siu_version_single_active
    ON siu_ingest_version ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS siu_clases_suelo (
    id             BIGSERIAL PRIMARY KEY,
    source_version TEXT NOT NULL REFERENCES siu_ingest_version(version) ON DELETE CASCADE,

    -- SIU's own field is called ProvINE but holds the 5-digit MUNICIPALITY code. Named
    -- correctly here; the misnomer is documented so nobody "fixes" it back.
    municipio_ine  CHAR(5) NOT NULL,

    clase          TEXT NOT NULL,   -- normalised key (urbano, urbanizable_delimitado, …)
    clase_raw      TEXT NOT NULL,   -- SIU's verbatim Spanish — provenance, C58 §1.3
    nucleo_rural   BOOLEAN NOT NULL DEFAULT false,
    in_force       BOOLEAN NOT NULL DEFAULT true,
    fecha_baja     TEXT,

    -- C58 §1.11 — granularity is a first-class property, stored so a consumer reading this
    -- table directly cannot mistake it for parcel-level data. SIU polygons are sub-municipal
    -- class areas, NOT cadastral parcels.
    granularity    TEXT NOT NULL DEFAULT 'municipality-polygon',

    geom           geometry(MultiPolygon, 4326) NOT NULL,
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The spatial index. Without it a point-in-polygon over ~22k multipolygons with millions of
-- vertices is a sequential scan and the feature is unusable at interactive speed.
CREATE INDEX IF NOT EXISTS idx_siu_clases_geom
    ON siu_clases_suelo USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_siu_clases_municipio
    ON siu_clases_suelo (municipio_ine);

-- Most queries are "current version, still in force". A composite covering that path keeps
-- the hot query off the big table's other rows during a refresh, when two versions coexist.
CREATE INDEX IF NOT EXISTS idx_siu_clases_version_force
    ON siu_clases_suelo (source_version, in_force);

-- The ONLY thing application code should read. It hides version juggling entirely, so a
-- refresh is invisible to callers and no query can accidentally read a half-loaded batch.
CREATE OR REPLACE VIEW siu_clases_suelo_current AS
    SELECT c.*
      FROM siu_clases_suelo c
      JOIN siu_ingest_version v ON v.version = c.source_version
     WHERE v.status = 'active'
       AND c.in_force;
`;

const CHECKS = [
    ["postgis available", `SELECT extname FROM pg_extension WHERE extname = 'postgis'`],
    ["siu_clases_suelo",  `SELECT to_regclass('public.siu_clases_suelo') AS t`],
    ["current view",      `SELECT to_regclass('public.siu_clases_suelo_current') AS t`],
    ["active version",    `SELECT version, row_count FROM siu_ingest_version WHERE status='active'`],
    ["row count",         `SELECT count(*)::bigint AS n FROM siu_clases_suelo`],
];

async function main() {
    const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!url) {
        console.error(
            'No DATABASE_URL / SUPABASE_DB_URL set.\n' +
            'Supabase → Project Settings → Database → Connection string (URI).\n' +
            'This script only touches the SIU tables; it never reads application data.',
        );
        process.exit(2);
    }

    const client = new pg.Client({
        connectionString: url,
        ssl: /supabase|neon|render|fly/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();

    try {
        if (!CHECK_ONLY) {
            console.log('applying SIU schema…');
            await client.query('BEGIN');
            try {
                await client.query(SCHEMA_SQL);
                await client.query('COMMIT');
                console.log('✓ schema applied');
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                // The overwhelmingly common failure is PostGIS not being enabled on the
                // project. Say so directly rather than surfacing a raw SQL error.
                if (/postgis/i.test(String(e.message))) {
                    console.error(
                        '\n✗ PostGIS is not available on this database.\n' +
                        '  Supabase → Database → Extensions → enable "postgis", then re-run.\n' +
                        `  (underlying error: ${e.message})`,
                    );
                    process.exit(3);
                }
                throw e;
            }
        }

        console.log('\n──── state ────');
        for (const [label, sql] of CHECKS) {
            try {
                const { rows } = await client.query(sql);
                console.log(`  ${label.padEnd(20)} ${rows.length ? JSON.stringify(rows[0]) : '(none)'}`);
            } catch (e) {
                console.log(`  ${label.padEnd(20)} ERROR ${e.message.slice(0, 70)}`);
            }
        }
    } finally {
        await client.end();
    }
}

main().catch((e) => { console.error('MIGRATION FAILED:', e.message); process.exit(1); });
