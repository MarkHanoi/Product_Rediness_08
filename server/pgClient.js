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
        console.log('[pgClient] Pool initialised');
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
