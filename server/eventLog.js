/**
 * @file server/eventLog.js
 * @description S04 (ADR-002, ADR-004) — Event Log audit-trail write.
 *
 * The client-side `EventLogPersistor` POSTs each CommandBus `EventRecord` here
 * after every successful dispatch, building a per-actor / per-project audit
 * trail in the `event_log` table.
 *
 * SECURITY (L-406, C08 §1.2 + §2.2)
 *   This is a mutating write attributed to a user AND a project, so it is NOT a
 *   public sink. It was previously mounted WITHOUT `authMiddleware` and trusted
 *   `audit.actorId` / `audit.projectId` straight from the request body — which
 *   let any unauthenticated caller forge an audit row attributed to any user in
 *   any tenant's project (cross-tenant write). This module closes that:
 *     1. A valid session is REQUIRED — anonymous callers get 401.
 *     2. The actor is ALWAYS the session user; any body-supplied `actorId` is
 *        ignored (closes the actor-spoof vector).
 *     3. Project-scoped events additionally require project membership via the
 *        same `requireAccess` gate every other project-scoped route uses
 *        (`_httpRequireAccess`); a cross-tenant projectId is rejected 403.
 *     4. A genuinely global (no-project) event — `audit.projectId` empty — is
 *        allowed: it is attributed only to the authenticated caller and carries
 *        no cross-tenant surface.
 *
 *   This mirrors the sibling real-time write (`command-executed` in server.js),
 *   which derives `user_id` from the authenticated socket and requires prior
 *   authorized project access — never trusting client-supplied identity.
 *
 * @see server.js POST /api/event-log (registration)
 * @see docs/02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md §1.2, §2.2
 */

import { getSupabaseClient } from './supabaseClient.js';
import { query as pgQuery } from './pgClient.js';

export const EVENT_LOG_PATH = '/api/event-log';

/**
 * Default persistence: Supabase REST when configured, else direct PG. Both are
 * best-effort — a missing `event_log` table (schema not yet applied) or any
 * transient failure is logged non-fatally and never surfaces to the client
 * (the 202 has already been sent).
 *
 * @param {{id:string, actorId:string, projectId:string, clientId:string,
 *          commandType:string, timestamp:string, payload:object}} row
 */
async function defaultPersistEvent(row) {
    const sb = await getSupabaseClient().catch(() => null);
    if (sb) {
        const { error } = await sb.from('event_log').insert({
            id:           row.id,
            actor_id:     row.actorId,
            project_id:   row.projectId,
            client_id:    row.clientId,
            command_type: row.commandType,
            timestamp:    row.timestamp,
            payload:      row.payload,
        });
        if (error && error.code !== '42P01' && !/does not exist/i.test(error.message || '')) {
            console.warn(`[event-log] Supabase insert failed (non-fatal): ${error.message}`);
        }
        return;
    }
    await pgQuery(
        `INSERT INTO event_log (id, actor_id, project_id, client_id, command_type, timestamp, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [row.id, row.actorId, row.projectId, row.clientId, row.commandType, row.timestamp, JSON.stringify(row.payload)],
    );
}

/**
 * Build the Express handler for `POST {EVENT_LOG_PATH}`. A factory so the
 * project-membership gate and the persistence sink are injectable for unit
 * tests (matching the `server/leads.js` extraction pattern).
 *
 * MUST be mounted behind `authMiddleware` so `req.auth` is populated.
 *
 * @param {object} deps
 * @param {(userId:string, projectId:string, res:import('express').Response) => Promise<boolean>} deps.requireAccess
 *   Project-membership gate. Returns true when the caller may write; when it
 *   returns false it has ALREADY written the response (403 deny / 503 retryable).
 *   In server.js this is `_httpRequireAccess`.
 * @param {(row:object) => Promise<void>} [deps.persistEvent] Persistence sink
 *   (defaults to Supabase/PG). Injected in tests to observe the written row.
 * @returns {import('express').RequestHandler}
 */
export function makeEventLogHandler({ requireAccess, persistEvent = defaultPersistEvent }) {
    if (typeof requireAccess !== 'function') {
        throw new TypeError('makeEventLogHandler: requireAccess dependency is required');
    }
    return async function eventLogHandler(req, res) {
        // §1.2 — authMiddleware populates req.auth; it never rejects, so the
        // route enforces the auth requirement itself. An audit-trail write MUST
        // be attributable to a real session.
        const sessionUserId = req.auth?.userId ?? 'anonymous';
        if (!sessionUserId || sessionUserId === 'anonymous') {
            return res.status(401).json({ error: 'Authentication required.', code: 'auth_required' });
        }

        const body        = req.body ?? {};
        const id          = typeof body.id   === 'string' ? body.id   : `ev-${Date.now()}`;
        const commandType = typeof body.type === 'string' ? body.type : 'unknown';
        const audit       = typeof body.audit === 'object' && body.audit ? body.audit : {};
        const projectId   = typeof audit.projectId === 'string' ? audit.projectId : '';
        const clientId    = typeof audit.clientId  === 'string' ? audit.clientId  : '';
        const timestamp   = typeof audit.timestamp === 'string' ? audit.timestamp : new Date().toISOString();
        const payload     = typeof body.payload === 'object' && body.payload ? body.payload : {};

        // §SPOOF — the actor is ALWAYS the session user. Any body-supplied
        // `audit.actorId` is deliberately ignored so a caller cannot attribute
        // an event to another user.
        const actorId = sessionUserId;

        // §2.2 — a project-scoped event requires membership in that project.
        // An empty projectId is a global (non-project) event with no cross-tenant
        // surface, so it skips the gate.
        if (projectId) {
            if (!await requireAccess(actorId, projectId, res)) return; // writes 403 / 503
        }

        // Non-blocking insert — respond 202 Accepted, then persist. The write
        // outcome never gates the client (fire-and-forget telemetry).
        res.status(202).end();

        Promise.resolve()
            .then(() => persistEvent({ id, actorId, projectId, clientId, commandType, timestamp, payload }))
            .catch((err) => console.warn('[event-log] Insert failed (non-fatal):', err?.message ?? err));
    };
}
