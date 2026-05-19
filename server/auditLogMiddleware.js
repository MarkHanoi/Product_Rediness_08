/**
 * Audit Log Middleware (Phase 3-B Sprint S57)
 *
 * Per docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md
 * §S57 + ADR-028 Part G + [strategic ADR-021]: every gateway route emits an
 * audit_log row whether the action succeeds or not.
 *
 * Usage:
 *   import { createAuditLogMiddleware } from './auditLogMiddleware.js';
 *   app.use(createAuditLogMiddleware({ pool, resolveAction }));
 *
 * The middleware is non-fatal — a DB write failure logs a warning but never
 * fails the request. Audit volume is bounded by gateway QPS; for very hot
 * routes pass `skip: req => …` to opt out.
 */

const VALID_KINDS = new Set(['user', 'service', 'plugin', 'ai-workflow']);
const VALID_OUTCOMES = new Set(['ok', 'denied', 'error']);

const DEFAULT_RESOLVE_ACTION = (req) => `${req.method.toLowerCase()}.${req.path}`;
const DEFAULT_RESOLVE_RESOURCE = () => ({ kind: 'http', id: null });
const DEFAULT_RESOLVE_ACTOR = (req) => {
    if (req.user?.id) return { id: String(req.user.id), kind: 'user' };
    if (req.headers['x-pryzm-service']) return { id: String(req.headers['x-pryzm-service']), kind: 'service' };
    return { id: 'anonymous', kind: 'user' };
};

function outcomeFromStatus(status) {
    if (status >= 200 && status < 400) return 'ok';
    if (status === 401 || status === 403) return 'denied';
    return 'error';
}

/**
 * Build the audit row that the middleware writes. Exported for direct use
 * outside Express (e.g. queue handlers, AI workflows).
 *
 * @param {object} opts
 * @returns {object}
 */
export function buildAuditRow({
    actor,
    workspaceId,
    projectId = null,
    action,
    resource,
    outcome,
    permissionUsed = null,
    traceId = null,
    metadata = null,
}) {
    if (!actor || !VALID_KINDS.has(actor.kind)) {
        throw new Error(`buildAuditRow: actor.kind must be one of ${[...VALID_KINDS].join(',')}`);
    }
    if (!VALID_OUTCOMES.has(outcome)) {
        throw new Error(`buildAuditRow: outcome must be one of ${[...VALID_OUTCOMES].join(',')}`);
    }
    if (!workspaceId) {
        throw new Error('buildAuditRow: workspaceId required');
    }
    if (!action || !resource?.kind) {
        throw new Error('buildAuditRow: action + resource.kind required');
    }
    return {
        actor_id: String(actor.id),
        actor_kind: actor.kind,
        workspace_id: String(workspaceId),
        project_id: projectId == null ? null : String(projectId),
        action: String(action),
        resource_kind: String(resource.kind),
        resource_id: resource.id == null ? null : String(resource.id),
        outcome,
        permission_used: permissionUsed,
        trace_id: traceId,
        metadata: metadata == null ? null : metadata,
    };
}

/**
 * Insert a single audit row through the supplied pg pool. Resolves to true
 * on success, false on failure (logs a warning either way).
 *
 * @param {object} pool node-postgres Pool
 * @param {object} row buildAuditRow() output
 */
export async function writeAuditRow(pool, row) {
    if (!pool) return false;
    try {
        await pool.query(
            `INSERT INTO audit_log
             (actor_id, actor_kind, workspace_id, project_id, action,
              resource_kind, resource_id, outcome, permission_used, trace_id, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                row.actor_id,
                row.actor_kind,
                row.workspace_id,
                row.project_id,
                row.action,
                row.resource_kind,
                row.resource_id,
                row.outcome,
                row.permission_used,
                row.trace_id,
                row.metadata == null ? null : JSON.stringify(row.metadata),
            ],
        );
        return true;
    } catch (err) {
        console.warn('[auditLog] write failed:', err.message);
        return false;
    }
}

/**
 * Express middleware factory. Wraps res.end() to emit the audit row after the
 * response has been sent so the recorded outcome reflects the real HTTP status.
 *
 * @param {object} opts
 * @param {object} opts.pool node-postgres Pool (required, but null-tolerant —
 *                          logs a warning if absent so dev mode without DB
 *                          still functions)
 * @param {(req)=>{id,kind}} [opts.resolveActor]
 * @param {(req)=>string}   [opts.resolveAction]
 * @param {(req,res)=>{kind,id?}} [opts.resolveResource]
 * @param {(req)=>string}   [opts.resolveWorkspaceId]
 * @param {(req)=>string|null} [opts.resolveProjectId]
 * @param {(req)=>boolean}  [opts.skip]
 */
export function createAuditLogMiddleware(opts = {}) {
    const {
        pool,
        resolveActor = DEFAULT_RESOLVE_ACTOR,
        resolveAction = DEFAULT_RESOLVE_ACTION,
        resolveResource = DEFAULT_RESOLVE_RESOURCE,
        resolveWorkspaceId = (req) => req.user?.workspaceId || req.headers['x-pryzm-workspace'] || 'default',
        resolveProjectId = (req) => req.params?.projectId || req.body?.projectId || null,
        skip = () => false,
    } = opts;

    return function auditLogMiddleware(req, res, next) {
        if (skip(req)) return next();

        const origEnd = res.end.bind(res);
        res.end = function patchedEnd(...args) {
            try {
                const actor = resolveActor(req);
                const resource = resolveResource(req, res);
                const row = buildAuditRow({
                    actor,
                    workspaceId: resolveWorkspaceId(req),
                    projectId: resolveProjectId(req),
                    action: resolveAction(req),
                    resource,
                    outcome: outcomeFromStatus(res.statusCode),
                    traceId: req.headers['x-otel-trace-id'] || null,
                    metadata: { method: req.method, path: req.path, status: res.statusCode },
                });
                writeAuditRow(pool, row).catch(() => { /* swallowed by writeAuditRow */ });
            } catch (err) {
                console.warn('[auditLog] middleware row build failed:', err.message);
            }
            return origEnd(...args);
        };

        next();
    };
}

/**
 * SOC2 evidence ad-hoc query. Returns aggregated outcomes for a window.
 * Used by the S68 quarterly automation; lit at S57 D7 as proof-of-concept.
 *
 * @param {object} pool
 * @param {object} params { workspaceId, sinceIso, untilIso }
 */
export async function querySoc2Evidence(pool, { workspaceId, sinceIso, untilIso }) {
    if (!pool) return [];
    const { rows } = await pool.query(
        `SELECT
             action,
             outcome,
             COUNT(*)::int AS count,
             MIN(ts)       AS first_seen,
             MAX(ts)       AS last_seen
         FROM audit_log
         WHERE workspace_id = $1 AND ts >= $2 AND ts < $3
         GROUP BY action, outcome
         ORDER BY action ASC, outcome ASC`,
        [workspaceId, sinceIso, untilIso],
    );
    return rows;
}
