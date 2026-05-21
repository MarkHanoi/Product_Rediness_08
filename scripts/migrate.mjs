/**
 * scripts/migrate.mjs — standalone database migration runner.
 *
 * Applies the full PRYZM schema (server/dbMigrate.js → CREATE TABLE IF NOT
 * EXISTS …) to whatever Postgres backend is configured, WITHOUT booting the
 * whole server.
 *
 * Usage:
 *   pnpm run migrate
 *
 * Requires a direct Postgres connection in .env — set ONE of:
 *   SUPABASE_DB_URL=postgresql://...   (Supabase: Project Settings → Database
 *                                       → Connection string → URI)
 *   DATABASE_URL=postgresql://...      (any other Postgres)
 *
 * The service-role key / PostgREST CANNOT run DDL — that is why a direct
 * connection string is required here (see server/supabaseMigrate.js header).
 *
 * This is idempotent: every statement is CREATE TABLE IF NOT EXISTS, so
 * re-running it is safe.
 */

import { runMigrations } from '../server/dbMigrate.js';
import { getBackendInfo, query } from '../server/pgClient.js';

const info = getBackendInfo();

if (info.backend === 'none') {
    console.error(
        '\n[migrate] No database is configured.\n' +
        '[migrate] Add SUPABASE_DB_URL (or DATABASE_URL) to .env, then run `pnpm run migrate` again.\n' +
        '[migrate] Supabase: Dashboard → Project Settings → Database → Connection string → URI.\n'
    );
    process.exit(1);
}

console.log(`[migrate] Database backend: ${info.backend}`);
console.log('[migrate] Applying schema (CREATE TABLE IF NOT EXISTS …) …');

try {
    await runMigrations();

    // Verify the critical tables now exist so the result is unambiguous.
    const { rows } = await query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('projects','project_versions','pryzm_users','user_plans')
         ORDER BY table_name`
    );
    const found = rows.map((r) => r.table_name);
    console.log(`[migrate] Tables present: ${found.join(', ') || '(none)'}`);

    if (found.includes('projects')) {
        console.log('[migrate] ✓ Migration complete — project creation should now work. Restart `pnpm run dev`.');
        process.exit(0);
    } else {
        console.error('[migrate] ✗ `projects` table is still missing after migration — check the errors above.');
        process.exit(1);
    }
} catch (err) {
    console.error('[migrate] ✗ Migration failed:', err?.message ?? err);
    console.error('[migrate]   Common causes: wrong DB password, IPv6-only direct host');
    console.error('[migrate]   (use the Session pooler connection string), or a firewall block.');
    process.exit(1);
}
