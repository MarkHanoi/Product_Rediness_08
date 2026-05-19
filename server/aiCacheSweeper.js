import { query as pgQuery } from './pgClient.js';

export async function sweepExpiredAiResponseCache() {
    const result = await pgQuery(
        `DELETE FROM ai_response_cache
          WHERE expires_at < NOW()
          RETURNING tenant_id, content_hash, model_version`,
    ).catch(err => {
        console.warn('[ai/cache-sweeper] sweep failed:', err.message);
        return { rowCount: 0 };
    });
    return { deleted: result.rowCount ?? 0 };
}
