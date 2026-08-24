/**
 * server/__tests__/projectRolePgBranch.test.ts
 *
 * §FIX-ROLE-READ-ON-PG (COLLAB49, 2026-08-24) — the third and last surface of
 * L-806(b): `resolveProjectRole` had no PostgreSQL branch.
 *
 * THE DEFECT
 * ──────────
 * `resolveProjectRole` spoke exactly two backends — Supabase, or the volatile
 * in-process Map behind `getUserRole()`. Production speaks NEITHER: it runs
 * PostgreSQL via DATABASE_URL, and `getSupabaseClient()` returns null there. So
 * a REAL `project_members` row —
 *
 *   · written by the very POST route this resolver also guards,
 *   · read CORRECTLY out of Postgres by `canUserAccessProject` in the same file,
 *   · and sufficient to admit that user to the project's Socket.io room —
 *
 * granted NOTHING to the invite / change-role / remove-member routes, nor to the
 * versions/transition route. It fell through to an empty Map, resolved to
 * `null`, and 403'd a collaborator the access gate had already admitted.
 *
 * The ACCESS GATE and the ROLE GATE were reading two different stores. That
 * split is the whole of L-806(b), and this is its last instance.
 *
 * ⭐ NOT A NEW RULE. `PERMISSIONS` in `server/permissions.js` is untouched. The
 * `project_members` table is untouched. This reads the role out of the store the
 * role is already kept in. Nobody acquires an ability the matrix did not already
 * name for their role.
 *
 * ⛔ DENY-BY-DEFAULT — THE ARMS THAT MATTER MOST
 * ─────────────────────────────────────────────
 * A missing branch must never become a permissive branch. ARMs 4–8 assert that
 * the new branch REFUSES: no row ⇒ null; a row on a DIFFERENT project ⇒ null; a
 * row for a DIFFERENT user ⇒ null; a role string the matrix does not know ⇒
 * null, not a guess. Every one of ARMs 4–8b is green BEFORE this change (where
 * the answer was null for want of a branch at all) and green AFTER it (where the
 * answer is null because the store was asked and said no) — verified by
 * measurement, below. ARMs 11 and 12 pin the same refusals at the HTTP layer.
 *
 * That before/after symmetry is deliberate. A deny arm that only goes green
 * after the change is not testing deny-by-default; it is testing the change.
 *
 * DIFFERENTIATION — MEASURED, NOT ASSERTED
 * ────────────────────────────────────────
 * Measured by deleting the `if (pool) { … }` block from `resolveProjectRole` and
 * re-running this file. 5 failed / 8 passed:
 *
 *     ARM 1   team_manager row on PG        expected 'team_manager', got null   FAIL
 *     ARM 2   every ISO role round-trips    expected role, got null             FAIL
 *     ARM 8c  pool error propagates         resolved null instead of rejecting  FAIL
 *     ARM 10  member invites over HTTP      expected 201, received 403          FAIL
 *     ARM 11  team_member row really read   expected false to be true           FAIL
 *     ARM 3, 4, 5, 6, 7, 8, 8b, 12                                              PASS
 *
 * ⚠ ARM 11 IS SPLIT, AND THE SPLIT IS THE HONEST PART. Its *status code* half
 * (403) is green on BOTH sides — a `team_member` was refused before this change
 * and is refused after it. Its second half — that the resolver ACTUALLY QUERIED
 * `project_members` — is red before and green after. Before the fix the 403 was
 * an ACCIDENT (there was no branch to ask with); after it, the 403 is a DECISION
 * (the row was read, and `team_member` is not in `PERMISSIONS.invite_member`).
 * Reporting ARM 11 as simply "green both sides" would have hidden exactly the
 * distinction the arm exists to draw.
 *
 * NOT PROVEN HERE
 * ───────────────
 *  · that production's `project_members` actually holds the row — that needs a
 *    session against the real database;
 *  · anything about the accept handshake. L-806(a) is still open: `accepted_at`
 *    is still written by no route, so an invited-but-unaccepted user resolves to
 *    their role. That trade-off is stated in `canUserAccessProject`'s header and
 *    is unchanged here — this commit did not widen it and did not close it.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

import {
    resolveProjectRole,
    readProjectMemberRole,
    // @ts-expect-error — plain-JS server module, no .d.ts by design.
} from '../projectAccess.js';
// @ts-expect-error — plain-JS server module, no .d.ts by design.
import { makeProjectMembersHandlers } from '../projectMembersRoutes.js';

const PROJECT = 'proj-1787554200066-a936f1ea8b34';
const OTHER_PROJECT = 'proj-someone-elses';
const OWNER = 'user-antonio';
const MEMBER = 'user-lookwithin';
const STRANGER = 'user-stranger';

interface Row { project_id: string; user_id: string; role: string }

/** A pool that answers the single-member role probe the resolver emits. */
function poolWith(rows: Row[]) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
        calls,
        async query(sql: string, params: unknown[] = []) {
            calls.push({ sql, params });
            const s = sql.replace(/\s+/g, ' ').trim();
            if (/^SELECT role FROM project_members WHERE project_id = \$1 AND user_id = \$2/i.test(s)) {
                const hit = rows.find(r => r.project_id === params[0] && r.user_id === params[1]);
                return { rows: hit ? [{ role: hit.role }] : [], rowCount: hit ? 1 : 0 };
            }
            throw new Error(`unhandled SQL — ${s}`);
        },
    };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-ROLE-READ-ON-PG — a real project_members row now resolves to a real role', () => {
    it('ARM 1 — a member row in PostgreSQL resolves to that role (was null: no branch existed)', async () => {
        const pool = poolWith([{ project_id: PROJECT, user_id: MEMBER, role: 'team_manager' }]);
        const role = await resolveProjectRole(null, PROJECT, MEMBER, OWNER, false, { pool });
        expect(role).toBe('team_manager');
        expect(pool.calls, 'the store was actually asked').toHaveLength(1);
        expect(pool.calls[0].params).toEqual([PROJECT, MEMBER]);
    });

    it('ARM 2 — every ISO 19650 role round-trips through the Postgres branch', async () => {
        for (const role of ['appointing_party', 'lead_appointed', 'team_manager', 'team_member', 'viewer']) {
            const pool = poolWith([{ project_id: PROJECT, user_id: MEMBER, role }]);
            expect(await resolveProjectRole(null, PROJECT, MEMBER, OWNER, false, { pool }), role).toBe(role);
        }
    });

    it('ARM 3 — Supabase keeps priority; the pool is not consulted when Supabase answers', async () => {
        const pool = poolWith([{ project_id: PROJECT, user_id: MEMBER, role: 'viewer' }]);
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'lead_appointed' }, error: null }) }) }),
                }),
            }),
        };
        expect(await resolveProjectRole(supabase, PROJECT, MEMBER, OWNER, false, { pool })).toBe('lead_appointed');
        expect(pool.calls).toHaveLength(0);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('⛔ DENY-BY-DEFAULT — green BEFORE this change and green AFTER it', () => {
    it('ARM 4 — no row at all ⇒ null ⇒ the caller 403s', async () => {
        const pool = poolWith([]);
        expect(await resolveProjectRole(null, PROJECT, STRANGER, OWNER, false, { pool })).toBeNull();
    });

    it('ARM 5 — a row on a DIFFERENT project grants nothing here', async () => {
        const pool = poolWith([{ project_id: OTHER_PROJECT, user_id: STRANGER, role: 'lead_appointed' }]);
        expect(await resolveProjectRole(null, PROJECT, STRANGER, OWNER, false, { pool })).toBeNull();
    });

    it('ARM 6 — a row for a DIFFERENT user grants nothing to this one', async () => {
        const pool = poolWith([{ project_id: PROJECT, user_id: MEMBER, role: 'lead_appointed' }]);
        expect(await resolveProjectRole(null, PROJECT, STRANGER, OWNER, false, { pool })).toBeNull();
    });

    it('ARM 7 — a role string the matrix does not know is REFUSED, not guessed at', async () => {
        // An authorization gate must not interpret data it cannot parse.
        for (const bad of ['admin', 'OWNER', 'lead-appointed', '', 'superuser']) {
            const pool = poolWith([{ project_id: PROJECT, user_id: MEMBER, role: bad }]);
            expect(await resolveProjectRole(null, PROJECT, MEMBER, OWNER, false, { pool }), bad).toBeNull();
        }
    });

    it('ARM 8 — omitting the pool preserves the pre-fix behaviour exactly', async () => {
        // Any caller that has not been updated still gets supabase → in-memory,
        // never an accidental grant.
        expect(await resolveProjectRole(null, PROJECT, STRANGER, OWNER, false)).toBeNull();
        expect(await resolveProjectRole(null, PROJECT, STRANGER, null, false)).toBeNull();
        // …and the null-owner trap: two nullish values must not compare equal
        // into a `lead_appointed` grant.
        expect(await resolveProjectRole(null, PROJECT, null as never, null, false)).toBeNull();
        expect(await resolveProjectRole(null, PROJECT, undefined as never, undefined as never, false)).toBeNull();
    });

    it('ARM 8b — readProjectMemberRole is a plain read: it decides nothing', async () => {
        const pool = poolWith([{ project_id: PROJECT, user_id: MEMBER, role: 'viewer' }]);
        expect(await readProjectMemberRole(pool, PROJECT, MEMBER)).toBe('viewer');
        expect(await readProjectMemberRole(pool, PROJECT, STRANGER)).toBeNull();
    });

    it('ARM 8c — a pool error PROPAGATES rather than degrading into "no role"', async () => {
        // L-789: a transient blip reported as a verified denial is a lie the
        // client cannot retry out of. Let it surface.
        const blip = { query: async () => { throw Object.assign(new Error('Connection terminated'), { code: '57P01' }); } };
        await expect(resolveProjectRole(null, PROJECT, MEMBER, OWNER, false, { pool: blip }))
            .rejects.toThrow('Connection terminated');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// The same two facts at the HTTP layer, on the real handlers.
// ═════════════════════════════════════════════════════════════════════════════
describe('§FIX-ROLE-READ-ON-PG — over real HTTP, on the shipped handlers', () => {
    interface MemberRow {
        id: string; project_id: string; user_id: string; role: string;
        invited_by: string | null; invited_at: string; accepted_at: string | null;
    }

    function fullPool(members: MemberRow[]) {
        const calls: Array<{ sql: string; params: unknown[] }> = [];
        return {
            calls, members,
            writes: () => calls.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql)),
            async query(sql: string, params: unknown[] = []) {
                calls.push({ sql, params });
                const s = sql.replace(/\s+/g, ' ').trim();
                if (/^SELECT owner_id FROM projects/i.test(s)) {
                    return { rows: params[0] === PROJECT ? [{ owner_id: OWNER }] : [], rowCount: params[0] === PROJECT ? 1 : 0 };
                }
                if (/^SELECT role FROM project_members/i.test(s)) {
                    const hit = members.find(m => m.project_id === params[0] && m.user_id === params[1]);
                    return { rows: hit ? [{ role: hit.role }] : [], rowCount: hit ? 1 : 0 };
                }
                if (/^SELECT id FROM pryzm_users/i.test(s)) {
                    return { rows: [{ id: 'user-new-invitee' }], rowCount: 1 };
                }
                if (/^INSERT INTO project_members/i.test(s)) {
                    const [project_id, user_id, role, invited_by] = params as [string, string, string, string | null];
                    const row: MemberRow = {
                        id: `mbr-${members.length + 1}`, project_id, user_id, role, invited_by,
                        invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
                    };
                    members.push(row);
                    return { rows: [row], rowCount: 1 };
                }
                throw new Error(`unhandled SQL — ${s}`);
            },
        };
    }

    let server: Server | null = null;
    async function mount(pool: ReturnType<typeof fullPool>) {
        const app = express();
        app.use(express.json());
        const handlers = makeProjectMembersHandlers({
            getSupabaseClient: async () => null,
            getPgPool: () => pool,
            getProjectsMap: () => null,
            isPlatformOwner: () => false,
            canAccessProject: async () => true,
            resolveProjectRole,
        });
        app.use((req, _res, next) => {
            (req as express.Request & { auth: { userId: string } }).auth = { userId: req.header('x-test-user') ?? 'anonymous' };
            next();
        });
        app.post('/api/projects/:id/members', handlers.invite);
        server = createServer(app);
        await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }
    async function post(base: string, user: string, body: unknown) {
        const res = await fetch(`${base}/api/projects/${PROJECT}/members`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-test-user': user },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    }
    async function close() {
        if (server) { await new Promise<void>(r => server!.close(() => r())); server = null; }
    }

    const row = (user_id: string, role: string): MemberRow => ({
        id: 'mbr-x', project_id: PROJECT, user_id, role,
        invited_by: OWNER, invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
    });

    it('ARM 10 — a lead_appointed MEMBER (not the owner) can invite: 201 and the row exists', async () => {
        // On HEAD this was 403: the row was in Postgres and the resolver never
        // looked there. `lead_appointed` IS in PERMISSIONS.invite_member, so this
        // is a grant the matrix already named — read, not widened.
        const pool = fullPool([row(MEMBER, 'lead_appointed')]);
        const base = await mount(pool);
        try {
            const res = await post(base, MEMBER, { userId: 'someone@example.com', role: 'viewer' });
            expect(res.status, JSON.stringify(res.body)).toBe(201);
            expect(pool.members).toHaveLength(2);
        } finally { await close(); }
    });

    it('ARM 11 — DENY: a team_member row is REALLY read and STILL refused (403, zero writes)', async () => {
        // The false-positive guard for ARM 10. If the new branch ever collapsed
        // into "has a row ⇒ allowed", this arm goes red.
        const pool = fullPool([row(MEMBER, 'team_member')]);
        const base = await mount(pool);
        try {
            const res = await post(base, MEMBER, { userId: 'someone@example.com', role: 'viewer' });
            expect(res.status).toBe(403);
            expect(pool.writes()).toHaveLength(0);
            // …and prove the row really WAS read, so the 403 is a decision and
            // not merely the old "there was no branch" accident.
            expect(pool.calls.some(c => /SELECT role FROM project_members/i.test(c.sql))).toBe(true);
        } finally { await close(); }
    });

    it('ARM 12 — DENY: a user with no row anywhere is still refused (403, zero writes)', async () => {
        const pool = fullPool([]);
        const base = await mount(pool);
        try {
            const res = await post(base, STRANGER, { userId: 'someone@example.com', role: 'viewer' });
            expect(res.status).toBe(403);
            expect(pool.writes()).toHaveLength(0);
        } finally { await close(); }
    });
});
