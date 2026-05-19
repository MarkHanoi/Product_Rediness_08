/**
 * server/supabaseMigrate.js
 * Supabase schema verification and owner seeding for PRYZM.
 *
 * Background:
 *   Replit's free-tier network blocks outbound port 5432, so direct PostgreSQL
 *   connections to Supabase fail at DNS/TCP level. The supabase-js client (which
 *   uses HTTPS/port 443) works fine and is the only DB path available here.
 *
 *   Supabase does NOT expose a DDL-over-REST endpoint in PostgREST — DDL must be
 *   applied via the Supabase Dashboard SQL Editor or the Management API (which
 *   requires a separate management API token, not the service role key).
 *
 * This module therefore:
 *   1. Detects whether the schema has been applied by querying a known table.
 *   2. If tables are missing, logs a clear one-time instruction to the user and
 *      returns false (causing dbMigrate.js to run in in-memory mode).
 *   3. Once tables exist, seeds the owner account if not already present.
 *
 * The schema is applied once, manually, by the developer:
 *   Supabase Dashboard → SQL Editor → paste server/schema.sql → Run
 */

import { getSupabaseClient } from './supabaseClient.js';

let _schemaMissingWarned = false;
let _columnWarningShown = false;
let _rpcWarningShown = false;

/**
 * Check for incremental column additions that require manual SQL Editor application.
 * PostgREST (supabase-js) cannot run DDL — ALTER TABLE must be applied manually once.
 * Detects missing columns by attempting a SELECT that references them and warns the user.
 */
async function _checkIncrementalColumns(supabase) {
    if (_columnWarningShown) return;
    // Probe for projects.thumbnail by selecting it (fails with PGRST204 if missing).
    const { error } = await supabase
        .from('projects')
        .select('id,thumbnail')
        .limit(1);
    if (error && (error.message?.includes('thumbnail') || error.code === 'PGRST204')) {
        _columnWarningShown = true;
        console.warn(
            '\n╔══════════════════════════════════════════════════════════════════════════╗\n' +
            '║  PRYZM — SUPABASE SCHEMA: ONE COLUMN MISSING (non-blocking)             ║\n' +
            '╠══════════════════════════════════════════════════════════════════════════╣\n' +
            '║  The projects table is missing the thumbnail column added in Apr 2026.   ║\n' +
            '║  Project cards will show placeholder images until this is applied.       ║\n' +
            '║                                                                          ║\n' +
            '║  Apply once in: Supabase Dashboard → SQL Editor → New query → Run:      ║\n' +
            '║                                                                          ║\n' +
            '║    ALTER TABLE projects                                                  ║\n' +
            '║    ADD COLUMN IF NOT EXISTS thumbnail TEXT;                              ║\n' +
            '║                                                                          ║\n' +
            '║  Then restart the server. Everything else continues to work normally.    ║\n' +
            '╚══════════════════════════════════════════════════════════════════════════╝\n'
        );
    } else {
        console.log('[supabaseMigrate] projects.thumbnail column: present ✓');
    }
}

/**
 * GAP-01 fix — Probe for the pryzm_save_version() PL/pgSQL RPC function.
 * The function is defined in server/schema.sql and must be applied once via the
 * Supabase Dashboard SQL Editor (PostgREST cannot run DDL).
 *
 * When the function is absent the server falls back to the two-step upsert+insert
 * path (still correct, but not race-free for concurrent saves from the same user).
 * This warning prompts the operator to apply the function when they are ready.
 */
async function _checkSaveVersionRpc(supabase) {
    if (_rpcWarningShown) return;
    // A no-op probe call with placeholder arguments — if the function exists it
    // will raise a PL/pgSQL error (missing project / limit exceeded), which is fine.
    // If the function does not exist PostgREST returns PGRST202.
    const { error } = await supabase.rpc('pryzm_save_version', {
        p_version_id: '__probe__', p_project_id: '__probe__',
        p_project_name: '__probe__', p_owner_id: '__probe__',
        p_label: '__probe__', p_snapshot: {}, p_element_count: 0,
        p_idempotency_key: '__probe__', p_max_versions: -1,
    });
    const isMissing = error && (
        error.code === 'PGRST202' ||
        (error.message ?? '').includes('Could not find the function') ||
        (error.message ?? '').includes('pryzm_save_version')
    );
    if (isMissing) {
        _rpcWarningShown = true;
        console.warn(
            '\n╔══════════════════════════════════════════════════════════════════════════╗\n' +
            '║  PRYZM — SUPABASE RPC: pryzm_save_version() NOT YET APPLIED            ║\n' +
            '╠══════════════════════════════════════════════════════════════════════════╣\n' +
            '║  The atomic version-save RPC (GAP-01 fix) is not yet installed.         ║\n' +
            '║  Version saves will work correctly but are not race-free against         ║\n' +
            '║  concurrent saves from the same user in multiple tabs.                  ║\n' +
            '║                                                                          ║\n' +
            '║  Apply once in: Supabase Dashboard → SQL Editor → New query → Run:      ║\n' +
            '║  (paste the pryzm_save_version block from server/schema.sql)             ║\n' +
            '║                                                                          ║\n' +
            '║  Then restart the server. Everything else continues to work normally.    ║\n' +
            '╚══════════════════════════════════════════════════════════════════════════╝\n'
        );
    } else {
        console.log('[supabaseMigrate] pryzm_save_version() RPC: present ✓');
    }
}

/**
 * Verify the PRYZM schema exists in Supabase.
 * Returns true if all critical tables are accessible, false if schema is missing.
 */
export async function migrateViaSupabaseRest() {
    const supabase = await getSupabaseClient();
    if (!supabase) return false;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';

    // Check the critical tables that all auth + plan flows depend on
    const { error: usersError } = await supabase
        .from('pryzm_users')
        .select('id')
        .limit(1);

    if (!usersError) {
        console.log('[supabaseMigrate] Supabase schema verified — all tables accessible.');
        // Check for incremental column additions that cannot be applied via PostgREST DDL.
        // These must be applied once in the Supabase SQL Editor.
        await _checkIncrementalColumns(supabase);
        // Check for the atomic version-save RPC (GAP-01 fix).
        await _checkSaveVersionRpc(supabase);
        return true;
    }

    const msg = usersError.message || '';
    const code = usersError.code || '';
    const isAuthFailure = msg.includes('Invalid API key') || msg.includes('invalid JWT') ||
                          msg.includes('JWTError') || usersError.status === 401;
    const isMissingTable = msg.includes('does not exist') || msg.includes('relation') ||
                           code === '42P01' || code === 'PGRST116';

    if (!_schemaMissingWarned) {
        _schemaMissingWarned = true;

        if (isAuthFailure) {
            // Key/URL mismatch — most common cause of this error
            console.error(
                '\n╔══════════════════════════════════════════════════════════════════════════╗\n' +
                '║  PRYZM — SUPABASE AUTHENTICATION FAILED (Invalid API key)               ║\n' +
                '╠══════════════════════════════════════════════════════════════════════════╣\n' +
                '║  The SUPABASE_SERVICE_ROLE_KEY does not match the SUPABASE_URL.          ║\n' +
                '║  Both secrets must come from the SAME Supabase project.                  ║\n' +
                '║                                                                          ║\n' +
                '║  To fix:                                                                 ║\n' +
                '║  1. Open your Supabase Dashboard → Settings → API                       ║\n' +
                '║  2. Copy the exact "service_role" key (the long one, not anon)           ║\n' +
                '║  3. Update SUPABASE_SERVICE_ROLE_KEY in Replit Secrets                   ║\n' +
                '║  4. Verify SUPABASE_URL also matches that same project                   ║\n' +
                '║  5. Restart this server                                                   ║\n' +
                '╚══════════════════════════════════════════════════════════════════════════╝\n'
            );
            console.error(`[supabaseMigrate] SUPABASE_URL in use: ${supabaseUrl}`);
            console.error(`[supabaseMigrate] Error: ${msg} (HTTP ${usersError.status || '?'})`);
        } else if (isMissingTable) {
            console.error(
                '\n╔══════════════════════════════════════════════════════════════════════════╗\n' +
                '║  PRYZM — SUPABASE SCHEMA NOT APPLIED                                    ║\n' +
                '╠══════════════════════════════════════════════════════════════════════════╣\n' +
                '║  Tables do not exist yet. Apply the schema via the SQL Editor:           ║\n' +
                '║  1. Supabase Dashboard → SQL Editor → New query                          ║\n' +
                '║  2. Paste server/schema.sql → Run                                        ║\n' +
                '║  3. Restart this server                                                   ║\n' +
                '╚══════════════════════════════════════════════════════════════════════════╝\n'
            );
            console.error(`[supabaseMigrate] SUPABASE_URL in use: ${supabaseUrl}`);
            console.error(`[supabaseMigrate] Error code: ${code} — ${msg}`);
        } else {
            console.error('[supabaseMigrate] Unexpected Supabase error:', code, msg);
            console.error(`[supabaseMigrate] SUPABASE_URL in use: ${supabaseUrl}`);
        }
    }

    return false;
}

/**
 * Seed the owner account in Supabase after migration.
 * Idempotent — skipped if the account already exists.
 */
export async function ensureOwnerAccountInSupabase() {
    const ownerEmail = process.env.PRYZM_OWNER_EMAIL;
    const ownerPassword = process.env.PRYZM_OWNER_PASSWORD;
    if (!ownerEmail || !ownerPassword) return;

    const supabase = await getSupabaseClient();
    if (!supabase) return;

    const normalEmail = ownerEmail.toLowerCase().trim();

    try {
        // Check if owner already exists
        const { data: existing, error: fetchErr } = await supabase
            .from('pryzm_users')
            .select('id, plan')
            .eq('email', normalEmail)
            .maybeSingle();

        if (fetchErr) {
            console.warn('[supabaseMigrate] Cannot check owner account:', fetchErr.message);
            return;
        }

        if (existing) {
            // Ensure plan is 'owner'
            if (existing.plan !== 'owner') {
                await supabase
                    .from('pryzm_users')
                    .update({ plan: 'owner' })
                    .eq('id', existing.id);
                await supabase.from('user_plans').upsert({
                    user_id: existing.id,
                    plan: 'owner',
                    plan_status: 'active',
                    ai_calls_this_period: 0,
                    period_start: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' });
                console.log(`[supabaseMigrate] Owner promoted to 'owner' plan: ${existing.id}`);
            } else {
                console.log(`[supabaseMigrate] Owner account OK: ${existing.id} (plan: ${existing.plan})`);
            }
            return;
        }

        // Create the owner account fresh
        const bcrypt = (await import('bcryptjs')).default;
        const passwordHash = await bcrypt.hash(ownerPassword, 12);
        const userId = `user-${Date.now()}-owner`;

        const { error: insertErr } = await supabase.from('pryzm_users').insert({
            id: userId,
            email: normalEmail,
            name: 'Platform Owner',
            password_hash: passwordHash,
            plan: 'owner',
            plan_status: 'active',
        });

        if (insertErr) {
            // Possible race — re-fetch
            if (insertErr.code === '23505' || insertErr.message.includes('duplicate')) {
                console.log(`[supabaseMigrate] Owner account created by concurrent process`);
                return;
            }
            console.warn('[supabaseMigrate] Owner insert failed:', insertErr.message);
            return;
        }

        // Fetch actual id in case of rewrite
        const { data: newRow } = await supabase
            .from('pryzm_users')
            .select('id')
            .eq('email', normalEmail)
            .maybeSingle();

        const actualId = newRow?.id ?? userId;

        await supabase.from('user_plans').upsert({
            user_id: actualId,
            plan: 'owner',
            plan_status: 'active',
            ai_calls_this_period: 0,
            period_start: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        console.log(`[supabaseMigrate] Owner account seeded: ${actualId} plan=owner`);
    } catch (err) {
        console.warn('[supabaseMigrate] ensureOwnerAccount error:', err.message);
    }
}
