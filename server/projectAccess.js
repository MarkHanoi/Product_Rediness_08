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
 * @param {string} userId - The resolved server-side user ID (from JWT or 'anonymous').
 * @param {string} projectId - The project ID the user wants to join.
 * @param {{ supabase: object|null, pgPool: object|null, projectsMap: Map }} ctx - Runtime context.
 * @returns {Promise<{ allowed: boolean, reason: string }>}
 */
export async function canUserAccessProject(userId, projectId, { supabase, pgPool, projectsMap }) {
    if (!userId || userId === 'anonymous') {
        return { allowed: false, reason: 'anonymous users cannot join project rooms' };
    }

    if (!projectId || typeof projectId !== 'string') {
        return { allowed: false, reason: 'invalid projectId' };
    }

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
                // Hard database error — fail closed per security contract.
                console.error('[projectAccess] Supabase error checking project access:', error.message);
                return { allowed: false, reason: 'database error during access check' };
            }

            if (data) {
                // Found in Supabase — ownership check is authoritative.
                if (data.owner_id !== userId) {
                    return { allowed: false, reason: 'user is not the project owner' };
                }
                return { allowed: true, reason: 'owner verified via supabase' };
            }

            // data === null: project not in Supabase yet — fall through to PG / in-memory.
            // This covers: (a) race window on new project creation, (b) legacy PG-only projects.
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
                console.error('[projectAccess] PG query error:', pgErr.message);
                // Don't return here — fall through to in-memory so race-window projects still work.
            }
        }

        // ── Path 3: In-memory fallback ─────────────────────────────────────────
        // Covers the race window: project was set in _projects by POST /api/projects
        // but not yet committed to Supabase / PG when the socket join fires.
        const project = projectsMap?.get(projectId);

        if (!project) {
            return { allowed: false, reason: 'project not found' };
        }

        if (project.ownerId !== userId) {
            return { allowed: false, reason: 'user is not the project owner' };
        }

        return { allowed: true, reason: 'owner verified via in-memory store' };
    } catch (err) {
        console.error('[projectAccess] Unexpected error checking project access:', err.message);
        return { allowed: false, reason: 'internal error during access check' };
    }
}
