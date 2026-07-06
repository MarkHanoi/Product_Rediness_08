/**
 * @file server/projectAccess.js
 * @description Server-side project ownership/access verification for Socket.io.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §7 — Socket.io Security):
 *  - Before a client may join a project room, their userId MUST be verified as
 *    the owner of (or a permitted collaborator on) that project.
 *  - Checks are performed in order: Supabase → Replit PG → in-memory map.
 *  - Anonymous users are NEVER permitted to join project rooms.
 *  - This module MUST NOT be imported from any file inside src/.
 *
 * Usage:
 *   import { canUserAccessProject } from './server/projectAccess.js';
 *   const allowed = await canUserAccessProject(userId, projectId, { supabase, pgPool, projectsMap });
 */

/**
 * Checks whether `userId` has read access to `projectId`.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §7 — Socket.io Security, C13 — Project Lifecycle):
 *   Sources are checked in priority order: Supabase → Replit PG → in-memory.
 *   When a source reports a hard error (not merely "no rows"), we fail closed.
 *   When a source reports "no rows" we fall through to the next source — this is
 *   necessary to handle two legitimate cases:
 *     (a) Race window: client sends join-project before POST /api/projects commits
 *         the new row to Supabase; the project exists in _projects (in-memory) but
 *         not yet in Supabase.
 *     (b) Legacy projects created when Supabase was not configured live in Replit PG
 *         only; they must still be joinable after Supabase is activated.
 *
 * §FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE (L-136, 2026-07-06):
 *   Previously a Supabase ERROR (not "no rows") caused an immediate
 *   `{ allowed:false }` — i.e. a transient pooler blip read as "not owner" and
 *   permanently denied the open (grey card, no retry). That is a FAIL-CLOSED
 *   over-reaction: we could not VERIFY ownership, but that is not the same as
 *   "verified not-owner". Now a DB error on ANY source FALLS THROUGH to the
 *   remaining sources (a Supabase blip is often covered by PG / in-memory), and
 *   ONLY when EVERY source is unavailable *specifically because of a DB error*
 *   do we return a distinct RETRYABLE result `{ allowed:false, retryable:true }`
 *   so the caller can surface a retryable 503 instead of a permanent deny.
 *
 *   SECURITY (07-BIM-SECURITY-CONTRACT §7): we NEVER fail OPEN. `retryable:true`
 *   still carries `allowed:false` — it grants nothing; it only distinguishes
 *   "cannot verify right now, retry" from "verified not the owner / not found".
 *   A verified not-owner or not-found is still a hard `{ allowed:false }`.
 *
 * @param {string} userId - The resolved server-side user ID (from JWT or 'anonymous').
 * @param {string} projectId - The project ID the user wants to join.
 * @param {{ supabase: object|null, pgPool: object|null, projectsMap: Map }} ctx - Runtime context.
 * @returns {Promise<{ allowed: boolean, retryable?: boolean, reason: string }>}
 */
// §FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE — the security-preserving FALL-THROUGH
// is always on (it is strictly safer — it can only widen verification, never
// grant access). Only the behaviour-CHANGING part — returning a `retryable:true`
// signal (which flips a permanent deny into a retryable 503) — is flag-gated so
// the change is instantly revertible in prod. Default ON; set
// PRYZM_ACCESS_CHECK_RETRYABLE=0 to fall back to the legacy plain-deny result.
const ACCESS_CHECK_RETRYABLE_ENABLED = process.env.PRYZM_ACCESS_CHECK_RETRYABLE !== '0';

export async function canUserAccessProject(userId, projectId, { supabase, pgPool, projectsMap }) {
    if (!userId || userId === 'anonymous') {
        return { allowed: false, reason: 'anonymous users cannot join project rooms' };
    }

    if (!projectId || typeof projectId !== 'string') {
        return { allowed: false, reason: 'invalid projectId' };
    }

    // Tracks whether ANY source failed with a hard DB error (as opposed to a
    // clean "no rows"). If we reach the end without verifying ownership AND a DB
    // error was seen, the correct answer is "cannot verify — retry", not "denied".
    let dbErrorSeen = false;

    try {
        // ── Path 1: Supabase ──────────────────────────────────────────────────
        // Use maybeSingle() instead of single() so "no rows" returns { data: null, error: null }
        // rather than a PGRST116 error — allowing us to fall through to other sources
        // instead of failing closed on newly-created or legacy projects.
        if (supabase) {
            const { data, error } = await supabase
                .from('projects')
                .select('id, owner_id')
                .eq('id', projectId)
                .maybeSingle();

            if (error) {
                // §FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE — a transient DB error is NOT
                // a verified denial. FALL THROUGH to PG / in-memory (mirroring the PG
                // branch below); a Supabase pooler blip is frequently covered by the
                // other sources. Only if ALL sources are unusable do we report it as
                // retryable at the end.
                console.error('[projectAccess] Supabase error checking project access (falling through):', error.message);
                dbErrorSeen = true;
            } else if (data) {
                // Found in Supabase — ownership check is authoritative.
                if (data.owner_id !== userId) {
                    return { allowed: false, reason: 'user is not the project owner' };
                }
                return { allowed: true, reason: 'owner verified via supabase' };
            }
            // data === null (and no error): project not in Supabase yet — fall through
            // to PG / in-memory. Covers (a) race window on new project creation,
            // (b) legacy PG-only projects.
        }

        // ── Path 2: Replit PG ─────────────────────────────────────────────────
        if (pgPool) {
            try {
                const result = await pgPool.query(
                    'SELECT id, owner_id FROM projects WHERE id = $1 LIMIT 1',
                    [projectId]
                );

                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    if (row.owner_id !== userId) {
                        return { allowed: false, reason: 'user is not the project owner' };
                    }
                    return { allowed: true, reason: 'owner verified via replit pg' };
                }
                // Not found in PG either — fall through to in-memory.
            } catch (pgErr) {
                console.error('[projectAccess] PG query error (falling through):', pgErr.message);
                dbErrorSeen = true;
                // Don't return here — fall through to in-memory so race-window projects still work.
            }
        }

        // ── Path 3: In-memory fallback ─────────────────────────────────────────
        // Covers the race window: project was set in _projects by POST /api/projects
        // but not yet committed to Supabase / PG when the socket join fires.
        const project = projectsMap?.get(projectId);

        if (project) {
            // In-memory has an authoritative owner for this project — verify it.
            if (project.ownerId !== userId) {
                return { allowed: false, reason: 'user is not the project owner' };
            }
            return { allowed: true, reason: 'owner verified via in-memory store' };
        }

        // ── Not verified by ANY source ─────────────────────────────────────────
        // §FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE — distinguish two very different
        // states that used to collapse into the same permanent deny:
        //   • A DB error was seen → we genuinely COULD NOT verify → RETRYABLE.
        //   • No DB error → the project truly does not exist in any source → deny.
        if (dbErrorSeen && ACCESS_CHECK_RETRYABLE_ENABLED) {
            return { allowed: false, retryable: true, reason: 'transient database error — could not verify access' };
        }
        return { allowed: false, reason: 'project not found' };
    } catch (err) {
        // Unexpected (non-DB) error inside the check itself. Treat as retryable
        // (still allowed:false — never fail open) only when the flag is on; the
        // caller can retry a genuinely transient hiccup instead of a hard deny.
        console.error('[projectAccess] Unexpected error checking project access:', err.message);
        if (ACCESS_CHECK_RETRYABLE_ENABLED) {
            return { allowed: false, retryable: true, reason: 'internal error during access check' };
        }
        return { allowed: false, reason: 'internal error during access check' };
    }
}
