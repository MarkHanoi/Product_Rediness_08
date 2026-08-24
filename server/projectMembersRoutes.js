/**
 * @file server/projectMembersRoutes.js
 * @description The four CDE Phase 1 Project Members HTTP handlers, extracted
 *              from `server.js` so they can be driven over real HTTP in a test.
 *
 * CONTRACT: C13 (project lifecycle & isolation), C76 (platform & API surface),
 *           C08 §2.1 (every mutating route authorises before it acts),
 *           17-ISO-19650-CDE-IMPLEMENTATION-PLAN Phase 1 §1.1.
 *
 * WHY THIS MODULE EXISTS
 * ──────────────────────
 * `server.js` calls `httpServer.listen(...)` unconditionally at import time, so
 * a test that imports it is testing a boot sequence, not a route. The members
 * handlers were therefore reachable only by TEXT arms — `projectMembersBackends`
 * greps `server.js` as a string and says so in its header. A route whose only
 * test reads it as text cannot report a STATUS CODE, and the defect this lane
 * closes is precisely a status code: the project owner got 403 where they should
 * have got 201.
 *
 * This is NOT a new pattern. `server/eventLog.js` (`makeEventLogHandler`) and
 * `server/leads.js` already do exactly this — factory here, `app.<verb>(path,
 * authMiddleware, handler)` in `server.js` — and `server/__tests__/eventLog.test.ts`
 * already mounts the real handler on a throwaway express app and drives it over
 * real HTTP. This module follows that precedent so the members routes get the
 * same grade of test.
 *
 * ⚠ THE ROUTE REGISTRATIONS STAY IN `server.js`, DELIBERATELY.
 * `tools/ga-gate/check-write-route-auth.ts` scans `server.js` — and ONLY
 * `server.js` — for `app.post|put|patch|delete(...)` and asserts every mutating
 * route is behind `authMiddleware` or declared exempt with a rationale. Moving
 * the registrations into a router mounted from a `server/*.js` module would
 * silently REMOVE these three write routes from that gate's surface, which is
 * the "audit lost sight of the artefact it audits" failure the gate was built to
 * end. Only the handler BODIES live here.
 *
 * Every dependency that reaches outside this module is INJECTED, so the tests
 * can supply a fake pool and a fake access gate without booting pgClient,
 * Supabase, or the plan store.
 */

'use strict';

import { hasPermission } from './permissions.js';
import { readProjectOwnerId } from './projectAccess.js';
import {
    listMembersForProject,
    resolveInviteTarget,
    upsertMemberForProject,
    updateMemberRoleForProject,
    removeMemberForProject,
} from './projectMembers.js';

/**
 * @typedef {Object} ProjectMembersDeps
 * @property {() => Promise<object|null>} getSupabaseClient
 * @property {() => object|null}          getPgPool
 * @property {() => {get: Function}|null} getProjectsMap    In-memory project store adapter.
 * @property {(userId: string) => boolean} isPlatformOwner  `getUserPlan(userId) === 'owner'`.
 * @property {(userId: string, projectId: string) => Promise<boolean>} canAccessProject
 *           `server.js`'s `_httpCanAccess` — owner-or-member read gate.
 * @property {(supabase: object|null, projectId: string, userId: string,
 *            projectOwnerId: string|null, isOwner: boolean) => Promise<string|null>} resolveProjectRole
 *           `server.js`'s role resolver. Injected verbatim, positional signature
 *           unchanged, so this extraction cannot alter a single authorization
 *           verdict.
 */

/** Every dependency is required — a missing one must fail loudly at wiring time,
 *  never silently resolve to `undefined` inside an authorization check. */
const _REQUIRED = [
    'getSupabaseClient', 'getPgPool', 'getProjectsMap',
    'isPlatformOwner', 'canAccessProject', 'resolveProjectRole',
];

/**
 * Builds the four members handlers.
 * @param {ProjectMembersDeps} deps
 * @returns {{list: Function, invite: Function, changeRole: Function, remove: Function}}
 */
export function makeProjectMembersHandlers(deps) {
    for (const key of _REQUIRED) {
        if (typeof deps?.[key] !== 'function') {
            throw new TypeError(`makeProjectMembersHandlers: dependency "${key}" is required`);
        }
    }
    const {
        getSupabaseClient, getPgPool, getProjectsMap,
        isPlatformOwner, canAccessProject, resolveProjectRole,
    } = deps;

    // ── §FIX-OWNER-READ-ON-PG (COLLAB49) ─────────────────────────────────────
    //
    // THE ONE BEHAVIOURAL CHANGE IN THIS EXTRACTION. The three write handlers
    // below each opened with:
    //
    //     const project = supabase
    //         ? (await supabase.from('projects').select('owner_id').eq('id', id).single()).data
    //         : null;
    //     const ownerId = project?.owner_id ?? null;
    //
    // On production `getSupabaseClient()` is null (PRYZM runs PostgreSQL via
    // DATABASE_URL), so `ownerId` was ALWAYS null and the
    // `userId === projectOwnerId` arm inside `resolveProjectRole` could never
    // fire. The project's own OWNER resolved to no role and got
    // `403 Forbidden — only lead_appointed or appointing_party may add members`
    // on their own project.
    //
    // The fix is a READ, not a RULE. `readProjectOwnerId` reads `owner_id` from
    // the store the owner is already kept in, at the same source priority
    // `canUserAccessProject` uses. No caller gains an ability that was not
    // already written down; the arm that was already there now sees a real
    // value. A non-owner still resolves through membership, and a user with no
    // membership still resolves to `null` and is still refused.
    async function ownerIdFor(supabase, projectId) {
        const { ownerId } = await readProjectOwnerId({
            supabase,
            pool: getPgPool(),
            projectsMap: getProjectsMap(),
            projectId,
        });
        return ownerId;
    }

    /** GET /api/projects/:id/members */
    async function list(req, res) {
        const { id } = req.params;
        const userId = req.auth?.userId ?? 'anonymous';
        const isOwner = isPlatformOwner(userId);
        // §H2 (audit) — every authenticated user could previously list any
        // project's members. Owner-or-member only.
        if (!isOwner && !await canAccessProject(userId, id)) {
            return res.status(403).json({ error: 'Forbidden — no access to this project.' });
        }
        try {
            // §FIX-MEMBERS-PG-WRITE-PATH (L-806(b)) — three backends, fixed priority,
            // and the answer now NAMES the store that produced it. Previously this
            // read the volatile in-process Map on every PG-only deployment (i.e. on
            // PRODUCTION) and returned `{members: []}` with HTTP 200, which the modal
            // rendered as a confident "0 members / No members yet".
            const supabase = await getSupabaseClient();
            const { members, source } = await listMembersForProject({
                supabase, pool: getPgPool(), projectId: id,
            });
            res.json({ members, source });
        } catch (err) {
            // §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — a read that FAILED must never
            // reduce to an empty list. 503 + a machine code, so the client can say
            // "could not load" instead of "nobody is on this project" (C01 §6 r6).
            console.error('[api/members] GET error:', err);
            res.status(503).json({
                error: 'Could not read the project member list — the member store is unreachable. This is NOT a report that the project has no members.',
                code: 'members_store_unavailable',
            });
        }
    }

    /** POST /api/projects/:id/members */
    async function invite(req, res) {
        const { id } = req.params;
        const userId = req.auth?.userId ?? 'anonymous';
        const isOwner = isPlatformOwner(userId);
        let { userId: targetUserId } = req.body ?? {};
        const { role } = req.body ?? {};

        if (!targetUserId || !role) {
            return res.status(400).json({ error: 'userId (or email) and role are required.' });
        }
        try {
            const supabase = await getSupabaseClient();
            const pool = getPgPool();

            // ── Permission FIRST, target resolution SECOND ───────────────────────
            // Deliberate REORDER, and it is a TIGHTENING, never a widening: the
            // inputs to `resolveProjectRole` are byte-identical to before, so the
            // verdict is identical — it simply now runs BEFORE the directory
            // lookup. Previously ANY authenticated caller could POST an email here
            // and read back "no PRYZM user found with …" vs a role error, i.e. probe
            // the user directory for account existence without ever passing the
            // invite_member check. No caller gains an ability; one loses an oracle.
            //
            // §FIX-OWNER-READ-ON-PG — `ownerId` now comes from whichever store
            // actually holds the project. See `ownerIdFor` above.
            const ownerId = await ownerIdFor(supabase, id);
            const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

            if (!hasPermission(callerRole, 'invite_member', isOwner)) {
                return res.status(403).json({ error: 'Forbidden — only lead_appointed or appointing_party may add members.' });
            }

            // §ADD-PEOPLE (2026-05-22): the invite field accepts "User ID or email"
            // (ProjectMemberPanel placeholder). When an EMAIL is supplied it is
            // resolved to the PRYZM userId — the POST body otherwise requires a raw
            // userId nobody knows. The invitee must already have a PRYZM account.
            //
            // §FIX-MEMBERS-PG-WRITE-PATH — this used to hard-400 with "Inviting by
            // email requires the database connection." the moment Supabase was
            // absent. On production Supabase IS absent and the database connection
            // is FINE (Postgres, DATABASE_URL): the message named a cause that was
            // not the cause. `resolveInviteTarget` now tries Supabase, then the
            // Postgres `pryzm_users` directory, and only reports "no user directory"
            // (503) when neither exists — which is the truth in that one case.
            const resolved = await resolveInviteTarget({ supabase, pool, target: targetUserId });
            if (!resolved.ok) {
                return res.status(resolved.status).json({ error: resolved.error, code: resolved.code });
            }
            targetUserId = resolved.userId;

            let written;
            try {
                written = await upsertMemberForProject({
                    supabase, pool, projectId: id, userId: targetUserId, role, invitedBy: userId,
                });
            } catch (writeErr) {
                // 23503 = foreign_key_violation. `project_members.project_id`
                // REFERENCES projects(id): a project that exists only in the browser
                // (never synced) genuinely cannot carry member rows. Say THAT, rather
                // than "Internal server error" — the two have opposite fixes.
                if (writeErr?.code === '23503') {
                    return res.status(409).json({
                        error: 'This project is not stored in the database yet, so members cannot be attached to it. Save/sync the project first, then invite.',
                        code: 'project_not_persisted',
                    });
                }
                throw writeErr;
            }
            res.status(201).json({ member: written.member, source: written.source });
        } catch (err) {
            console.error('[api/members] POST error:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    /** PATCH /api/projects/:id/members/:uid/role */
    async function changeRole(req, res) {
        const { id, uid } = req.params;
        const userId = req.auth?.userId ?? 'anonymous';
        const isOwner = isPlatformOwner(userId);
        const { role } = req.body ?? {};

        if (!role) return res.status(400).json({ error: 'role is required.' });
        try {
            const supabase = await getSupabaseClient();
            // §FIX-OWNER-READ-ON-PG — was `supabase ? … : null`, i.e. null on PG.
            const ownerId = await ownerIdFor(supabase, id);
            const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

            if (!hasPermission(callerRole, 'change_role', isOwner)) {
                return res.status(403).json({ error: 'Forbidden — insufficient role to change member roles.' });
            }

            // §FIX-MEMBERS-PG-WRITE-PATH — same three-backend priority as the GET,
            // so a role changed here is the role the access gate reads back.
            const { member, source } = await updateMemberRoleForProject({
                supabase, pool: getPgPool(), projectId: id, userId: uid, role,
            });
            if (!member) return res.status(404).json({ error: 'Member not found.' });
            res.json({ member, source });
        } catch (err) {
            console.error('[api/members] PATCH role error:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    /** DELETE /api/projects/:id/members/:uid */
    async function remove(req, res) {
        const { id, uid } = req.params;
        const userId = req.auth?.userId ?? 'anonymous';
        const isOwner = isPlatformOwner(userId);
        try {
            const supabase = await getSupabaseClient();
            // §FIX-OWNER-READ-ON-PG — was `supabase ? … : null`, i.e. null on PG.
            const ownerId = await ownerIdFor(supabase, id);
            const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

            if (!hasPermission(callerRole, 'remove_member', isOwner)) {
                return res.status(403).json({ error: 'Forbidden — insufficient role to remove members.' });
            }

            // §FIX-MEMBERS-PG-WRITE-PATH — a removal that only mutated the volatile
            // Map left the `project_members` row in place, so the removed member
            // kept their access across the next restart.
            await removeMemberForProject({ supabase, pool: getPgPool(), projectId: id, userId: uid });
            res.status(204).end();
        } catch (err) {
            console.error('[api/members] DELETE error:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    return { list, invite, changeRole, remove };
}
