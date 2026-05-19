/**
 * @file server/aiUsageStore.js
 * @description ai_usage table CRUD helpers (SPEC-28 §5.1, S49).
 *
 * Every AI workflow (Phase 1 generative, Phase 2 voice/ambient, Phase 3
 * Plan-Critique / Generate-3 / Public AI API) writes one row here per
 * call.  Rows feed:
 *   - The AI Spend dashboard (`/admin/ai-spend.html`).
 *   - The Honeycomb pipeline that aggregates `pryzm.ai.cost.usd`.
 *   - Daily / monthly budget tracking + per-project caps.
 *
 * CONTRACT:
 *   - ALL writes go through `recordAiUsage()`.  No raw INSERTs allowed.
 *   - All reads go through `getSpendSummary()` for the dashboard, or the
 *     ad-hoc `query()` helper for analytics.
 *   - Writes never throw to the caller — telemetry must never block an
 *     AI request.  Failures log to console and increment a Prometheus
 *     counter (TODO when /metrics endpoint lands at S60).
 *   - All cost figures are USD; serialise as numeric(10,6).
 */

import { randomUUID } from 'crypto';
import { query as pgQuery } from './pgClient.js';

const VALID_WORKFLOWS = new Set([
    'plan-critique',
    'generate-3-options',
    'voice-parse',
    'ambient-analyse',
    'brief-parse',
    'generative-advise',
    'compliance-advise',
    'portfolio-query',
    'pdf-floorplan-import',
    'public-api-query',
    'public-api-generate',
    'public-api-validate',
    'anthropic-proxy',
    'other',
]);

/**
 * Insert one row into ai_usage.  Never throws to the caller.
 *
 * @param {object} row
 * @param {string} row.projectId       Project context (or 'unknown').
 * @param {string} row.actorId         User ID issuing the call.
 * @param {string} [row.actorKind='user']  'user' | 'service' | 'webhook'.
 * @param {string} row.workflow        One of VALID_WORKFLOWS.
 * @param {string} row.surface         The UI/API surface ('plan-view', 'cli', '/v1/ai/query', …).
 * @param {string} [row.model='claude-haiku-4-5-20251014']
 * @param {string} [row.plan='personal']
 * @param {string} [row.promptSha='']
 * @param {number} [row.inputTokens=0]
 * @param {number} [row.outputTokens=0]
 * @param {number} [row.costUsd=0]
 * @param {number} [row.durationMs=0]
 * @param {string} [row.status='ok']   'ok' | 'error' | 'budget-cap' | 'rate-limit'.
 * @returns {Promise<{ id: string }>}
 */
export async function recordAiUsage(row) {
    const id = `aiu_${randomUUID()}`;
    const wf = VALID_WORKFLOWS.has(row.workflow) ? row.workflow : 'other';
    try {
        await pgQuery(
            `INSERT INTO ai_usage
                (id, project_id, actor_id, actor_kind, workflow, surface,
                 model, plan, prompt_sha,
                 input_tokens, output_tokens, cost_usd, duration_ms, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
                id,
                row.projectId ?? 'unknown',
                row.actorId ?? 'anonymous',
                row.actorKind ?? 'user',
                wf,
                row.surface ?? 'unknown',
                row.model ?? 'claude-haiku-4-5-20251014',
                row.plan ?? 'personal',
                row.promptSha ?? '',
                row.inputTokens ?? 0,
                row.outputTokens ?? 0,
                row.costUsd ?? 0,
                row.durationMs ?? 0,
                row.status ?? 'ok',
            ],
        );
    } catch (err) {
        console.warn('[ai_usage] insert failed (telemetry-only):', err.message);
    }
    return { id };
}

/**
 * Aggregate spend summary for the AI Spend dashboard.
 *
 * Returns:
 *   {
 *     monthlyByProject: [{ projectId, costUsd, callCount }],
 *     monthlyByWorkflow: [{ workflow, costUsd, callCount }],
 *     topSurfaces: [{ surface, costUsd, callCount }],
 *     totalUsd: number,
 *     totalCalls: number,
 *     monthStart: ISO string,
 *   }
 *
 * Optionally scoped to a single project via `projectId`.
 */
export async function getSpendSummary({ projectId = null, monthsBack = 0 } = {}) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - monthsBack);
    const monthStartIso = monthStart.toISOString();

    const projectFilter = projectId ? 'AND project_id = $2' : '';
    const params = projectId ? [monthStartIso, projectId] : [monthStartIso];

    const [byProject, byWorkflow, topSurfaces, totals] = await Promise.all([
        pgQuery(
            `SELECT project_id   AS "projectId",
                    SUM(cost_usd)::float AS "costUsd",
                    COUNT(*)::int  AS "callCount"
               FROM ai_usage
              WHERE created_at >= $1 ${projectFilter}
              GROUP BY project_id
              ORDER BY "costUsd" DESC
              LIMIT 50`,
            params,
        ),
        pgQuery(
            `SELECT workflow,
                    SUM(cost_usd)::float AS "costUsd",
                    COUNT(*)::int  AS "callCount"
               FROM ai_usage
              WHERE created_at >= $1 ${projectFilter}
              GROUP BY workflow
              ORDER BY "costUsd" DESC`,
            params,
        ),
        pgQuery(
            `SELECT surface,
                    SUM(cost_usd)::float AS "costUsd",
                    COUNT(*)::int  AS "callCount"
               FROM ai_usage
              WHERE created_at >= $1 ${projectFilter}
              GROUP BY surface
              ORDER BY "costUsd" DESC
              LIMIT 10`,
            params,
        ),
        pgQuery(
            `SELECT COALESCE(SUM(cost_usd), 0)::float AS "totalUsd",
                    COUNT(*)::int  AS "totalCalls"
               FROM ai_usage
              WHERE created_at >= $1 ${projectFilter}`,
            params,
        ),
    ]);

    return {
        monthStart: monthStartIso,
        monthlyByProject: byProject.rows ?? [],
        monthlyByWorkflow: byWorkflow.rows ?? [],
        topSurfaces: topSurfaces.rows ?? [],
        totalUsd: Number((totals.rows?.[0]?.totalUsd ?? 0).toFixed(6)),
        totalCalls: totals.rows?.[0]?.totalCalls ?? 0,
    };
}
