/**
 * server/pgClient.js
 * PostgreSQL client for PRYZM.
 *
 * Connection priority:
 *   1. DATABASE_URL     — Replit built-in PostgreSQL (preferred on Replit)
 *   2. SUPABASE_DB_URL  — Supabase direct PostgreSQL (fallback; port 5432 is
 *                         blocked on Replit's network so this only works in
 *                         external / production deployments)
 *
 * NOTE: SUPABASE_DB_URL points to db.<project>.supabase.co:5432 which is
 * unreachable from Replit (ENOTFOUND / connection refused).  DATABASE_URL
 * is always available in the Replit environment and must be preferred here.
 * Auth continues to use the Supabase REST client (supabaseClient.js) which
 * goes through HTTPS and is unaffected by this priority change.
 *
 * Both are standard PostgreSQL — all queries in projectStore.js, authStore.js,
 * planStore.js, and dbMigrate.js work identically against either backend.
 *
 * Contract: C08-COLLABORATION-AND-SECURITY §1 — database access confined to
 * server/ and server.js. Never imported in src/.
 * Contract: C05-PERSISTENCE-AND-FILE-FORMAT §1.3 + §1.3.1 — DATABASE_URL
 * priority invariant and FK removal rationale.
 */

import pg from 'pg';

const { Pool } = pg;

let _pool = null;
let _resolvedCache = undefined; // undefined = not yet resolved; null = no DB configured

function resolveConnectionString() {
    // PERF: cache the resolution + log so the backend banner appears ONCE on
    // first init, not on every getPgPool() call (which previously logged
    // hundreds of lines per project load — see PROJECT-LOAD perf audit).
    if (_resolvedCache !== undefined) return _resolvedCache;

    if (process.env.DATABASE_URL) {
        console.log('[pgClient] Using Replit PostgreSQL (DATABASE_URL)');
        _resolvedCache = { connStr: process.env.DATABASE_URL, backend: 'replit' };
        return _resolvedCache;
    }
    if (process.env.SUPABASE_DB_URL) {
        console.log('[pgClient] Using Supabase PostgreSQL (SUPABASE_DB_URL)');
        _resolvedCache = { connStr: process.env.SUPABASE_DB_URL, backend: 'supabase' };
        return _resolvedCache;
    }
    _resolvedCache = null;
    return null;
}

export function getPgPool() {
    const resolved = resolveConnectionString();
    if (!resolved) return null;

    if (!_pool) {
        const { connStr } = resolved;
        // §D7 (DAILY-USE 2026-06-03) — detect a TRANSACTION-mode pooler
        // (Supabase Supavisor :6543 / pgbouncer). Session-level state does not
        // persist there — each statement may land on a different backend — so
        // the `SET` session-timeout block below is both useless AND harmful on a
        // pooler: it can HANG, and because node-postgres queues it on the same
        // freshly-connected client, the very first pooled query (the pgPreflight
        // `SELECT 1`) sits behind the hung SET and never resolves. The preflight
        // then times out and the server wrongly drops to the in-memory fallback
        // even when the DB is perfectly healthy (the `client.query() when already
        // executing` warning is exactly this SET↔SELECT-1 collision). So we skip
        // the SET on a pooler; direct connections (:5432) still honour it.
        const isTxPooler = /pooler\.supabase\.com|[:.]6543(\/|$|\?)|pgbouncer=true/i.test(connStr);
        _pool = new Pool({
            connectionString: connStr,
            ssl: connStr.includes('localhost') ? false : { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });
        _pool.on('error', (err) => {
            console.error('[pgClient] Unexpected pool error:', err.message);
        });
        // §D4 (DAILY-USE 2026-05-24) — cap runaway queries + leaked open
        // transactions on EVERY pooled connection. Without a statement_timeout a
        // single hung query holds a pool slot (max:10) indefinitely; under load
        // that starves the pool. idle_in_transaction_session_timeout reaps a
        // transaction that BEGINs and never COMMITs (a leaked withTransaction()).
        // 60s is generous — far above any legitimate snapshot/IFC write — so it
        // only kills truly stuck statements. DIRECT connections only — see §D7.
        if (!isTxPooler) {
            _pool.on('connect', (client) => {
                client.query(
                    `SET statement_timeout = '60s'; SET idle_in_transaction_session_timeout = '30s'`,
                ).catch((e) => console.warn('[pgClient] could not set session timeouts:', e.message));
            });
        }
        console.log(
            `[pgClient] Pool initialised${isTxPooler ? ' (transaction pooler — session SET skipped, §D7)' : ''}`,
        );
    }
    return _pool;
}

/**
 * Execute a parameterized query using the pool directly.
 * pool.query() acquires and releases a connection automatically — no manual
 * connect/release needed and no risk of connection leak.
 *
 * @param {string} text - SQL query with $1, $2 placeholders
 * @param {any[]} [params] - Parameter values
 */
export async function query(text, params) {
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL not configured (neither SUPABASE_DB_URL nor DATABASE_URL is set)');
    return pool.query(text, params);
}

/**
 * §D3 (DAILY-USE 2026-05-24) — fast connection preflight. A single `SELECT 1`
 * raced against a short timeout so an UNREACHABLE DB URL is detected in a few
 * seconds instead of burning ~10s on the migration retry loop's exponential
 * backoff before the caller settles the v1 gate to the in-memory fallback.
 *
 * A genuinely-dead host (ECONNREFUSED / ENOTFOUND) rejects almost instantly via
 * the query promise; the timer only bounds the BLACK-HOLE case (packets dropped,
 * no RST) which would otherwise hang until connectionTimeoutMillis (10s). A
 * slow-but-alive host that connects within the window passes. On a false-fail
 * (cold pooler slower than the window) the boot self-heal upgrades to real
 * persistence within 30s — strictly better than a hang.
 *
 * Throws on failure (message names the masked host); resolves on success.
 * No-op when no pool is configured (caller already handles in-memory mode).
 *
 * §D8 (DAILY-USE 2026-06-03): raised 6000 → 18000ms. The preflight fires
 * DURING boot, when heavy synchronous module-loading (tsx transform, Vite
 * middleware setup, the ~240 KB server bundle) can block the event loop for
 * several seconds. A blocked loop stalls BOTH the socket I/O and the timer, so
 * the 6s budget would expire the instant the loop freed — beating an otherwise
 * sub-second query (measured: 759 ms connect + 70 ms SELECT 1 to the Supabase
 * eu-central pooler). A HEALTHY DB was being misclassified as dead, dropping
 * the whole session to the volatile in-memory store. 18s comfortably clears a
 * boot stall while still bounding a genuinely black-holed host (the self-heal
 * + in-memory fallback still cover a truly-dead DB).
 *
 * @param {number} [timeoutMs=18000]
 */
export async function pgPreflight(timeoutMs = 18000) {
    const pool = getPgPool();
    if (!pool) return;
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`pg preflight timed out after ${timeoutMs}ms`)),
            timeoutMs,
        );
    });
    const q = pool.query('SELECT 1');
    q.catch(() => { /* prevent unhandled rejection if the timeout wins the race */ });
    try {
        await Promise.race([q, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Returns which database backend is active and whether a pool exists.
 * Used by the /api/health endpoint so ops can confirm the correct backend
 * is in use without reading server logs.
 *
 * @returns {{ backend: 'replit'|'supabase'|'none', poolReady: boolean }}
 */
export function getBackendInfo() {
    const resolved = resolveConnectionString();
    if (!resolved) return { backend: 'none', poolReady: false };
    return { backend: resolved.backend, poolReady: _pool !== null };
}

// ── §SERVER-500-V1-MIGRATION-RACE (DAILY-USE 2026-05-21, Round 30) ────────────
//
// `runMigrations()` runs ASYNCHRONOUSLY after `httpServer.listen()` so the
// port opens fast for the LB health probe (per the pre-existing comment in
// server.js:5269-5274). The trade-off is a window — typically 200 ms-3 s —
// where requests are accepted but the schema may not be fully applied. A
// project-create that lands in that window can hit "column does not exist"
// (42703) on the RETURNING clause when `runMigrations()`'s ALTER TABLE
// additions for `is_archived` / `is_starred` / `description` haven't yet
// committed.
//
// Round 30 fix: expose a shared `getMigrationsReady()` / `setMigrationsReady()`
// flag pair here (where both server.js and the v1 router already import
// from); the v1 router's per-request gate returns 503 `migrations_in_progress`
// until the flag flips, eliminating the race entirely. The client retries
// (it already handles 503 with exponential backoff per ProjectListClient).
//
// The flag lives in pgClient.js to avoid a circular dependency between
// server.js (which calls runMigrations) and routes.js (which gates on it).
// Both files already import from pgClient, so the shared-flag idiom is
// architecturally clean.
let _migrationsReady = false;
// §SERVER-503-MIGRATION-GATE-DEADLOCK (DAILY-USE 2026-05-24) ───────────────────
// The v1 gate (routes.js) must open once the boot migration has SETTLED — i.e.
// finished trying — NOT only when it SUCCEEDED. Two distinct facts:
//   • _migrationsReady   = "schema genuinely applied" (success only; for honest
//                          health/ready + boot-log parity).
//   • _migrationsSettled = "the boot migration has finished" (success, no-pool,
//                          OR terminal failure).
// The gate keys on SETTLED so that when a configured pool is UNREACHABLE
// (e.g. a stale/remote DATABASE_URL or SUPABASE_DB_URL in a local .env that
// can't connect), requests fall THROUGH to the §SERVER-PG-DEGRADE in-memory
// fallback in projectStore.js instead of being walled off by a permanent 503
// `migrations_in_progress`. The gate exists ONLY to bridge the brief boot race
// window (port-open before the ALTER TABLEs commit); it must never permanently
// block when the DB is down. Before this fix, a failed boot migration left
// _migrationsReady=false forever and — because the gate runs BEFORE the route
// handlers — the in-memory degrade path was unreachable (the architect's
// recurring "can't create/open projects — 503 migrations_in_progress").
let _migrationsSettled = false;
export function getMigrationsReady() { return _migrationsReady; }
export function setMigrationsReady(ready) {
    _migrationsReady = !!ready;
    if (ready) _migrationsSettled = true; // success implies the boot migration is settled
}
export function getMigrationsSettled() { return _migrationsSettled; }
/**
 * Mark the boot migration as settled WITHOUT claiming the schema is ready —
 * called on terminal migration failure / no usable pool so the v1 gate opens
 * and the §SERVER-PG-DEGRADE in-memory degrade path can serve. Intentionally
 * does NOT flip `_migrationsReady`, so /api/health/ready stays honest (it does
 * its own live `SELECT 1` anyway).
 */
export function markMigrationsSettled() { _migrationsSettled = true; }

/**
 * GAP-01 fix — Run a callback inside a serialised BEGIN/COMMIT transaction
 * on a dedicated pool client.  The client is pinned for the duration of the
 * callback so that all intermediate queries share the same transaction.
 *
 * On callback error ROLLBACK is called automatically; the original error is
 * re-thrown so callers can map it to an HTTP response.  The pool client is
 * always released — even when ROLLBACK itself fails.
 *
 * Contract: C05 §1.1 — persistence client is the single write gateway;
 * transactions are the mechanism that makes compound writes atomic.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
    const pool = getPgPool();
    if (!pool) throw new Error('PostgreSQL not configured — withTransaction requires DATABASE_URL or SUPABASE_DB_URL');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* suppress rollback error — original error is what matters */ }
        throw err;
    } finally {
        client.release();
    }
}
