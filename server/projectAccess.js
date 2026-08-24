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

// ── §FIX-ACCESS-MEMBERSHIP (L-336, 2026-08-09) ───────────────────────────────
//
// This function resolved access purely by `owner_id` on ALL THREE backends and
// never read `project_members`. Because `join-project` is the ONLY gate that
// admits a socket to a project room, every non-owner was rejected — so cursors,
// presence, remote-command relay and sheet comments were reachable only by the
// project's owner. Real-time multi-user collaboration, the product's headline
// capability, worked as two tabs of the same account.
//
// The table, `projectMembers.js`, `pendingInvites.js` and the complete ISO 19650
// role matrix in `permissions.js` all existed and were all inert on this path.
// Open as an "architectural launch-blocker" since 2026-07-16 (L-336). No test
// caught it because no test exercised two distinct users.
//
// ⚠ TWO TRAPS, both found while implementing, both deliberate decisions:
//
//   1. `accepted_at` is DEAD SCHEMA. It is in the DDL and in the in-memory
//      MemberRecord, and `acceptInvitation()` exists — but it is in-memory only,
//      NO ROUTE CALLS IT, and nothing in server/ ever writes the column. Gating
//      on `accepted_at IS NOT NULL` would have made this fix a SILENT NO-OP:
//      membership would grant nothing, tests would be green, and the blocker
//      would still be there. So a row grants access regardless. The cost — an
//      invited-but-unaccepted user can join — is real, stated, and tracked as
//      L-806. It is strictly better than a fix that grants nothing.
//
//   2. Without Supabase there is NO PG WRITE PATH for members at all
//      (`server.js` calls `upsertMember()`, which writes only the volatile
//      in-memory Map). Hence the optional `membersLookup` below: without it,
//      dev and self-host deployments would still be owner-only after this fix.
//
// This function answers a READ question ("may this socket join the room?"), and
// all five ISO roles have read rights, so any valid membership admits. WRITE
// authorisation is `hasPermission(role, action)` — which is precisely why the
// return value now carries the ROLE rather than collapsing to a boolean.
import { ROLES } from './permissions.js';

/** A role is only a role if the matrix knows it. Unknown ⇒ refuse (fail closed). */
function _validRole(role) {
    return typeof role === 'string' && ROLES.includes(role) ? role : null;
}

export async function canUserAccessProject(userId, projectId, { supabase, pgPool, projectsMap, membersLookup }) {
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
                // Found in Supabase — this row is authoritative for ownership.
                if (data.owner_id === userId) {
                    return { allowed: true, role: 'owner', reason: 'owner verified via supabase' };
                }
                // §FIX-ACCESS-MEMBERSHIP (L-336) — not the owner is NOT the end of the
                // question any more. Only now do we pay for a second round trip; the
                // owner case (the overwhelming majority) still costs exactly one.
                try {
                    const { data: mem, error: memErr } = await supabase
                        .from('project_members')
                        .select('role')
                        .eq('project_id', projectId)
                        .eq('user_id', userId)
                        .maybeSingle();
                    if (memErr) {
                        // Could not VERIFY membership — not the same as "not a member".
                        // Fall through so PG / in-memory can still answer, and let the
                        // retryable path own the outcome if nothing else can (L-136).
                        console.error('[projectAccess] Supabase membership lookup failed (falling through):', memErr.message);
                        dbErrorSeen = true;
                    } else {
                        const role = _validRole(mem?.role);
                        if (role) return { allowed: true, role, reason: `member (${role}) verified via supabase` };
                        // A row with an unrecognised role reaches here and is refused:
                        // an authorization gate must not guess at data it cannot parse.
                        return { allowed: false, reason: 'user is neither owner nor a member of this project' };
                    }
                } catch (memThrow) {
                    console.error('[projectAccess] Supabase membership lookup threw (falling through):', memThrow.message);
                    dbErrorSeen = true;
                }
            }
            // data === null (and no error): project not in Supabase yet — fall through
            // to PG / in-memory. Covers (a) race window on new project creation,
            // (b) legacy PG-only projects.
        }

        // ── Path 2: Replit PG ─────────────────────────────────────────────────
        if (pgPool) {
            try {
                // §FIX-ACCESS-MEMBERSHIP (L-336) — ownership AND membership in ONE
                // round trip. This runs on EVERY socket join, so two queries would
                // double the load on the pool L-787 just resized, on the hottest
                // authorization path in the server. The LEFT JOIN is served by
                // `idx_project_members_user_project (user_id, project_id)`, added in
                // L-788 specifically ahead of this change so it would not ship a
                // sequential scan.
                const result = await pgPool.query(
                    `SELECT p.owner_id, m.role
                       FROM projects p
                       LEFT JOIN project_members m
                         ON m.project_id = p.id AND m.user_id = $2
                      WHERE p.id = $1
                      LIMIT 1`,
                    [projectId, userId]
                );

                if (result.rows.length > 0) {
                    const row = result.rows[0];
                    if (row.owner_id === userId) {
                        return { allowed: true, role: 'owner', reason: 'owner verified via replit pg' };
                    }
                    const role = _validRole(row.role);
                    if (role) {
                        return { allowed: true, role, reason: `member (${role}) verified via replit pg` };
                    }
                    // The project EXISTS and this user is neither its owner nor a
                    // member with a role we recognise — a verified denial, and the one
                    // case that must NOT fall through to the in-memory shadow store.
                    return { allowed: false, reason: 'user is neither owner nor a member of this project' };
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
            if (project.ownerId === userId) {
                return { allowed: true, role: 'owner', reason: 'owner verified via in-memory store' };
            }
            // §FIX-ACCESS-MEMBERSHIP (L-336) — the in-memory branch needs its own
            // membership source, because WITHOUT SUPABASE there is no PG write path
            // for members at all: `server.js` falls back to `upsertMember()`, which
            // writes only the volatile `_members` Map in projectMembers.js (L-806).
            // Omitting this would leave dev and self-host deployments owner-only even
            // after this fix — the change would look done and be half-done.
            const role = _validRole(membersLookup?.(projectId, userId)?.role);
            if (role) {
                return { allowed: true, role, reason: `member (${role}) verified via in-memory store` };
            }
            return { allowed: false, reason: 'user is neither owner nor a member of this project' };
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

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-OWNER-READ-ON-PG (COLLAB49, 2026-08-24) — closes the invite half of
// L-806(b): the project OWNER could not invite anyone to their OWN project.
// ─────────────────────────────────────────────────────────────────────────────
//
// THE DEFECT
// ----------
// `server.js`s three members WRITE routes each opened with:
//
//     const project = supabase
//         ? (await supabase.from('projects').select('owner_id').eq('id', id).single()).data
//         : null;
//     const ownerId = project?.owner_id ?? null;
//
// Production runs PostgreSQL via DATABASE_URL and `getSupabaseClient()` returns
// null there, so `ownerId` was ALWAYS null and the very next line --
// `if (userId === projectOwnerId) return 'lead_appointed'` inside
// `resolveProjectRole` -- could never fire. The rule "the project owner may
// invite collaborators to their own project" was already WRITTEN; what was
// missing was the code that READS the owner out of the store the owner is
// actually kept in. A permission check reading an empty store denies a user it
// was written to allow. That is the same missing-Postgres-branch shape as
// L-806(b) one route further on, failing closed instead of open.
//
// WHAT THIS IS NOT
// ----------------
// This grants NOBODY a new ability. `owner_id` is already the column the
// `projects` table has always carried, `canUserAccessProject` above already
// reads it on all three backends, and the `userId === projectOwnerId` arm is
// already in `resolveProjectRole`. This function only makes that arm read a
// REAL value on the backend production actually runs.
//
// SOURCE PRIORITY is deliberately the SAME as `canUserAccessProject`:
// supabase -> postgres -> in-memory. If the ACCESS GATE and the OWNER READ
// disagreed about who owns a project, one of them would be wrong on every
// deployment where both can answer.

/**
 * Reads the STORED owner of a project. Answers a pure READ question -- it
 * makes no authorization decision of its own.
 *
 * `source` matters for the same reason it does in `projectMembers.js`:
 * `{ownerId: null, source: 'postgres', found: true}` is a project row whose
 * owner column is genuinely null, while `{ownerId: null, found: false}` means
 * no store had the project at all. Callers that cannot tell those apart cannot
 * tell ABSENT from UNREACHABLE (C01 §6 rule 6).
 *
 * A Postgres error PROPAGATES -- it is not degraded into "no owner", which
 * would silently become a 403 for the legitimate owner. That mirrors the
 * pre-existing owner read in the versions/transition route, which is the
 * in-repo precedent for exactly this query.
 *
 * @param {{supabase?: object|null, pool?: object|null, projectsMap?: {get: Function}|null, projectId: string}} ctx
 * @returns {Promise<{ownerId: string|null, source: 'supabase'|'postgres'|'memory'|'none', found: boolean}>}
 */
export async function readProjectOwnerId({ supabase = null, pool = null, projectsMap = null, projectId }) {
    if (!projectId || typeof projectId !== 'string') {
        return { ownerId: null, source: 'none', found: false };
    }

    // ── Path 1: Supabase ─────────────────────────────────────────────────────
    // `maybeSingle()` rather than `single()`: "no rows" must be a clean fall
    // through to the next store, not a PGRST116 error. The call sites this
    // replaces used `single()` and read `.data` off the error result, so they
    // already treated an error as "no owner"; this keeps that outcome and stops
    // manufacturing the error in the first place.
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('owner_id')
                .eq('id', projectId)
                .maybeSingle();
            if (error) {
                console.error('[projectAccess] Supabase owner read failed (falling through):', error.message);
            } else if (data) {
                return { ownerId: data.owner_id ?? null, source: 'supabase', found: true };
            }
        } catch (sbErr) {
            console.error('[projectAccess] Supabase owner read threw (falling through):', sbErr.message);
        }
    }

    // ── Path 2: PostgreSQL -- THE BRANCH THAT DID NOT EXIST ──────────────────
    if (pool) {
        const { rows } = await pool.query(
            'SELECT owner_id FROM projects WHERE id = $1 LIMIT 1',
            [projectId],
        );
        if (rows && rows.length > 0) {
            return { ownerId: rows[0].owner_id ?? null, source: 'postgres', found: true };
        }
    }

    // ── Path 3: In-memory ────────────────────────────────────────────────────
    // Covers PRYZM_FORCE_INMEMORY / no-DATABASE_URL deployments and the
    // create-then-invite race, exactly as path 3 of `canUserAccessProject`
    // does. Without it the owner of a project in a dev process could not invite
    // to it either -- the same defect, a different store.
    const project = projectsMap?.get?.(projectId);
    if (project) {
        return { ownerId: project.ownerId ?? project.owner_id ?? null, source: 'memory', found: true };
    }

    return { ownerId: null, source: 'none', found: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// `resolveProjectRole` — MOVED HERE from server.js by COLLAB49, 2026-08-24,
// body unchanged.
// ─────────────────────────────────────────────────────────────────────────────
//
// It lives beside `canUserAccessProject` because the two answer the SAME
// question at different strengths: "may this user touch this project, and as
// what?". Keeping them in one module is what stops the ACCESS GATE and the ROLE
// GATE from reading two different stores — which is exactly the split that
// produced L-806(b), where `canUserAccessProject` read `project_members` from
// Postgres while every members route read a volatile in-process Map.
//
// It is also, plainly, why the founder's case failed: this function was private
// to a 240 KB module that binds ports at import time, so no test could reach it.
import { getMemberFromSupabase, getUserRole } from './projectMembers.js';

// ── §FIX-ROLE-READ-ON-PG (COLLAB49, 2026-08-24) ──────────────────────────────
//
// THE SECOND HALF OF THE SAME DEFECT. `resolveProjectRole` spoke exactly two
// backends — Supabase, or the volatile in-process Map behind `getUserRole()`.
// Production speaks NEITHER: it runs PostgreSQL via DATABASE_URL, and
// `getSupabaseClient()` returns null there. So on production a REAL
// `project_members` row — written by the very POST route this file also serves,
// read correctly by `canUserAccessProject` twenty lines up, and enough to admit
// the user to the project's Socket.io room — granted NOTHING to the invite /
// change-role / remove-member routes. It fell through to an empty Map, resolved
// to `null`, and 403'd.
//
// That is the same missing-Postgres-branch shape as L-806(b), on the third and
// last surface of it. The row already exists; nothing here decides who may do
// what. It only reads the role out of the store the role is actually kept in.
//
// ⛔ DENY-BY-DEFAULT IS UNCHANGED AND MUST STAY UNCHANGED. No row ⇒ no role ⇒
// the caller's `hasPermission(null, …)` is false ⇒ 403, exactly as before. A row
// carrying a role string the matrix does not know is refused rather than
// guessed at, the same way `_validRole` already governs `canUserAccessProject`.
// A missing branch must never become a permissive branch.

/**
 * Reads ONE user's `project_members` role out of PostgreSQL.
 *
 * Served by the table's `UNIQUE (project_id, user_id)` constraint index
 * (dbMigrate.js §4), so this is an index probe, not a scan, on an authorization
 * path that runs on every members write.
 *
 * A pool error PROPAGATES. Degrading it into "no role" would turn a transient
 * blip into a silent, permanent-looking 403 for a legitimate collaborator —
 * the §FIX-DEGRADE-HONESTY (L-789) defect. The caller's own catch turns it into
 * a 500, which is at least the truth: we could not read.
 *
 * @returns {Promise<string|null>} a role string as stored, or null when absent.
 */
export async function readProjectMemberRole(pool, projectId, userId) {
    const { rows } = await pool.query(
        `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`,
        [projectId, userId],
    );
    return rows?.[0]?.role ?? null;
}

/**
 * Resolves the requesting user's CDE role for a given project.
 * Project owner/platform-owner always has 'lead_appointed' (or as specified).
 * Falls through to member record lookup.
 *
 * Source priority for the membership read is supabase → postgres → in-memory —
 * the SAME order `canUserAccessProject` uses, so the room-join gate and the
 * members-write gate cannot disagree about a user's role.
 *
 * @param {object|null} supabase
 * @param {string} projectId
 * @param {string} userId
 * @param {string|null} projectOwnerId  The STORED owner — see `readProjectOwnerId`.
 * @param {boolean} isOwner             true for the PLATFORM owner plan, not the project owner.
 * @param {{pool?: object|null}} [opts] `pool` is the Postgres pool. Omitting it
 *        preserves the pre-2026-08-24 behaviour exactly (supabase → in-memory).
 * @returns {Promise<string|null>} an ISO 19650 role key, or null (⇒ deny).
 */
export async function resolveProjectRole(supabase, projectId, userId, projectOwnerId, isOwner, opts = {}) {
    if (isOwner) return 'lead_appointed';
    // TIGHTENING, not a widening: previously a bare `userId === projectOwnerId`,
    // which would have granted `lead_appointed` had both sides ever been null or
    // undefined together. No current call site can produce that — the routes pass
    // `req.auth?.userId ?? 'anonymous'` — but an authorization boundary should not
    // depend on that remaining true.
    if (userId && projectOwnerId && userId === projectOwnerId) return 'lead_appointed';

    if (supabase) {
        const row = await getMemberFromSupabase(supabase, projectId, userId);
        // `_validRole` added here for the same reason it guards the Supabase
        // branch of `canUserAccessProject`: refuse data the matrix cannot parse.
        // Observably identical — `hasPermission` already rejected any role string
        // outside the matrix — but the refusal is now stated, not incidental.
        return _validRole(row?.role);
    }

    // ── The branch that did not exist ────────────────────────────────────────
    const pool = opts?.pool ?? null;
    if (pool) {
        const role = _validRole(await readProjectMemberRole(pool, projectId, userId));
        if (role) return role;
        // No PG row: fall through to the in-memory Map below rather than
        // returning null here. That is deliberate and it is NOT a widening —
        // this exact fallback is what the pre-fix code did on the Postgres
        // deployment (it called `getUserRole()` unconditionally). Removing it
        // would REVOKE the only membership that works today on a self-host or
        // dev process that has both a pool and pre-existing in-memory members.
    }

    return _validRole(getUserRole(projectId, userId));
}
