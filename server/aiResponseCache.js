// server/aiResponseCache.js — PostgreSQL-backed AI response cache (ADR-050).
//
// Implements the same `AiResponseCacheLike` interface (duck-typed, no TS dep)
// as `AiResponseCacheFetchAdapter` and `MockAiResponseCache` in
// `packages/ai-host/src/AiResponseCache.ts`, but backed by the
// `ai_response_cache` DB table created in `server/dbMigrate.js` (table 15).
//
// Used server-side:
//   1. Two BFF routes in `server.js` delegate to this class:
//        POST /api/ai/cache/lookup
//        POST /api/ai/cache/store
//   2. A nightly setInterval calls `cleanup()` to purge expired rows.

export class PgAiResponseCache {
    /**
     * @param {import('pg').Pool} pool — Replit PostgreSQL pool from pgClient.js
     */
    constructor(pool) {
        this._pool = pool;
    }

    /**
     * Look up a cached workflow result.
     * Returns the cached `WorkflowRunResult` object or `null` on miss/expired.
     *
     * @param {{ tenantId: string; contentHash: string; modelVersion: string }} key
     * @returns {Promise<object | null>}
     */
    async get({ tenantId, contentHash, modelVersion }) {
        let rows;
        try {
            ({ rows } = await this._pool.query(
                `SELECT response_json
                   FROM ai_response_cache
                  WHERE tenant_id    = $1
                    AND content_hash = $2
                    AND model_version = $3
                    AND expires_at   > NOW()
                  LIMIT 1`,
                [tenantId, contentHash, modelVersion],
            ));
        } catch (err) {
            console.warn('[ai-cache] get() DB error (non-fatal):', err?.message);
            return null;
        }

        if (rows.length === 0) return null;

        // Increment hit_count asynchronously — best-effort, never blocks the
        // caller.  This feeds cache-efficiency metrics (ADR-050 observability).
        this._pool.query(
            `UPDATE ai_response_cache
                SET hit_count = hit_count + 1
              WHERE tenant_id    = $1
                AND content_hash = $2
                AND model_version = $3`,
            [tenantId, contentHash, modelVersion],
        ).catch((e) => {
            console.warn('[ai-cache] hit_count increment failed (non-fatal):', e?.message);
        });

        return rows[0].response_json;
    }

    /**
     * Store a workflow result.  Upserts on primary-key conflict — a retry of
     * the same request simply refreshes the TTL and resets hit_count.
     *
     * @param {{ tenantId: string; contentHash: string; modelVersion: string }} key
     * @param {object} value — WorkflowRunResult (proposedCommands + preview + actualCostUsd)
     * @param {number} [ttlDays=7]
     */
    async set({ tenantId, contentHash, modelVersion }, value, ttlDays = 7) {
        try {
            await this._pool.query(
                `INSERT INTO ai_response_cache
                        (tenant_id, content_hash, model_version, response_json, expires_at)
                 VALUES ($1, $2, $3, $4::jsonb, NOW() + ($5 || ' days')::interval)
                 ON CONFLICT (tenant_id, content_hash, model_version)
                 DO UPDATE
                    SET response_json = EXCLUDED.response_json,
                        expires_at    = EXCLUDED.expires_at,
                        hit_count     = 0`,
                [tenantId, contentHash, modelVersion, JSON.stringify(value), String(ttlDays)],
            );
        } catch (err) {
            console.warn('[ai-cache] set() DB error (non-fatal):', err?.message);
        }
    }

    /**
     * Delete all expired entries.  Called by the nightly `setInterval` in
     * `server.js` (ADR-050 §4 — TTL cleanup).
     *
     * @returns {Promise<number>} number of rows deleted
     */
    async cleanup() {
        try {
            const { rowCount } = await this._pool.query(
                `DELETE FROM ai_response_cache WHERE expires_at < NOW()`,
            );
            return rowCount ?? 0;
        } catch (err) {
            console.warn('[ai-cache] cleanup() DB error:', err?.message);
            return 0;
        }
    }
}
