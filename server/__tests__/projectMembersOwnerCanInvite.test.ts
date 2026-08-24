/**
 * server/__tests__/projectMembersOwnerCanInvite.test.ts
 *
 * §FIX-OWNER-READ-ON-PG (COLLAB49, 2026-08-24) — closes the invite half of
 * L-806(b).
 *
 * THE FOUNDER'S REPORT, verbatim
 * ──────────────────────────────
 *   "antoniocanerosan@gmail.com user wants to invite lookwithinjourney@gmail.com
 *    to a project that antonio created — this needs to work architecturally
 *    sound"
 *
 * It did not work. On production — PostgreSQL via DATABASE_URL, with
 * `getSupabaseClient()` returning null — the three members WRITE handlers each
 * opened with:
 *
 *     const project = supabase
 *         ? (await supabase.from('projects').select('owner_id').eq('id', id).single()).data
 *         : null;
 *     const ownerId = project?.owner_id ?? null;
 *
 * so `ownerId` was ALWAYS null, and the very next thing `resolveProjectRole`
 * does — `if (userId === projectOwnerId) return 'lead_appointed'` — could never
 * fire. Antonio resolved to NO role on his own project and
 * `hasPermission(null, 'invite_member')` returned false:
 *
 *     403 "Forbidden — only lead_appointed or appointing_party may add members."
 *
 * ⭐ WHAT THIS IS AND IS NOT
 * ─────────────────────────
 * The authorization RULE was never missing. "The project owner may invite to
 * their own project" is already written in the code, as `userId === ownerId`.
 * What was missing was the code that READS the owner out of the store the owner
 * is actually kept in. Denying Antonio was not a security posture — it was the
 * same missing-Postgres-branch defect as L-806(b) one route further on, which
 * happened to fail closed. NOTHING here grants a new permission. Every arm below
 * that expects a grant expects it for a user the code already named.
 *
 * DIFFERENTIATION — MEASURED, NOT ASSERTED
 * ────────────────────────────────────────
 * ARMs 1, 4, 6 and 8 FAIL on the pre-fix code. Measured by restoring HEAD's
 * expression — literally `const ownerId = supabase ? … : null` — inside
 * `ownerIdFor()` in `server/projectMembersRoutes.js` and re-running this file:
 *
 *     ARM 1 (owner invites)       expected 201, received 403   FAIL
 *     ARM 4 (owner changes role)  expected 200, received 403   FAIL
 *     ARM 6 (owner removes)       expected 204, received 403   FAIL
 *     ARM 8 (in-memory owner)     expected 201, received 403   FAIL
 *     ARM 2, 3, 5, 7 (deny arms)  403 / no write               PASS, both sides
 *
 * ⛔ THE DENY ARMS ARE THE POINT. A missing branch must never become a
 * permissive branch. ARM 2, 3, 5 and 7 assert that a user with NO membership
 * row and NO ownership is STILL refused — with the status code AND with the
 * fake pool proving that no INSERT/UPDATE/DELETE was ever issued. They are
 * green before this change and green after it. If a future edit makes them go
 * green for the wrong reason, ARM 7 catches it: it drives a project that exists
 * in NO store, where a permissive fallback would be indistinguishable from a
 * correct answer by status code alone.
 *
 * WHY THIS FILE CAN REPORT A STATUS CODE AT ALL
 * ─────────────────────────────────────────────
 * `server.js` calls `httpServer.listen()` at import time, so importing it in a
 * test boots a server rather than exercising a route — which is why every prior
 * members test is a TEXT arm that greps `server.js` (see the header of
 * `projectMembersBackends.test.ts`, which says so). The handler BODIES now live
 * in `server/projectMembersRoutes.js` and are mounted here on a throwaway
 * express app, exactly as `eventLog.test.ts` and `leads.test.ts` already do. The
 * four `app.<verb>(…)` REGISTRATIONS stayed in `server.js` on purpose — see
 * ARM 11b in `projectMembersBackends.test.ts`.
 *
 * NOT PROVEN HERE (so a green run is not over-read)
 * ────────────────────────────────────────────────
 *  · that live production Postgres holds a `projects` row for Antonio's project
 *    with his `owner_id` — that needs a session against the real database;
 *  · that the invitee's account exists in the LOCAL `pryzm_users` copy (auth may
 *    run against Supabase while `pgClient` prefers DATABASE_URL — precisely the
 *    split that produced L-806(b));
 *  · anything about the accept handshake. L-806(a) is still open: `accepted_at`
 *    is still written by no route;
 *  · that the OWNER appears in the members list. They do not — the owner is not
 *    a `project_members` row. That is reported, not fixed, and is the founder's
 *    decision (see the lane report).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

// @ts-expect-error — plain-JS server module, no .d.ts by design.
import { makeProjectMembersHandlers } from '../projectMembersRoutes.js';
// @ts-expect-error — plain-JS server module, no .d.ts by design.
import { readProjectOwnerId, resolveProjectRole } from '../projectAccess.js';

// ── The cast ────────────────────────────────────────────────────────────────
const PROJECT = 'proj-1787554200066-a936f1ea8b34';
const ANTONIO = 'user-antonio';            // antoniocanerosan@gmail.com — the project OWNER
const ANTONIO_EMAIL = 'antoniocanerosan@gmail.com';
const INVITEE = 'user-lookwithin';         // lookwithinjourney@gmail.com — the invitee
const INVITEE_EMAIL = 'lookwithinjourney@gmail.com';
const STRANGER = 'user-stranger';          // no ownership, no membership — must stay refused

// ── A fake Postgres pool ────────────────────────────────────────────────────
// It answers the EXACT SQL the shipped modules emit (`projectAccess.js` and
// `projectMembers.js`), and records every statement so an arm can assert that a
// refused request issued NO write at all. Its tables are plain arrays.
interface MemberRow {
    id: string; project_id: string; user_id: string; role: string;
    invited_by: string | null; invited_at: string; accepted_at: string | null;
}

function makeFakePg(opts: { projects?: Array<{ id: string; owner_id: string }>; members?: MemberRow[]; users?: Array<{ id: string; email: string }> } = {}) {
    const projects = opts.projects ?? [];
    const members = opts.members ?? [];
    const users = opts.users ?? [];
    const calls: Array<{ sql: string; params: unknown[] }> = [];

    async function query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        const s = sql.replace(/\s+/g, ' ').trim();

        if (/^SELECT owner_id FROM projects WHERE id = \$1/i.test(s)) {
            const row = projects.find(p => p.id === params[0]);
            return { rows: row ? [{ owner_id: row.owner_id }] : [], rowCount: row ? 1 : 0 };
        }
        if (/^SELECT id FROM pryzm_users WHERE lower\(email\)/i.test(s)) {
            const row = users.find(u => u.email.toLowerCase() === String(params[0]).toLowerCase());
            return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
        }
        if (/^SELECT .*FROM project_members m/i.test(s)) {
            const rows = members.filter(m => m.project_id === params[0]);
            return { rows, rowCount: rows.length };
        }
        // COLLAB49 commit B adds this shape: the single-member role read.
        if (/^SELECT .*FROM project_members\b/i.test(s) && /user_id = \$2/i.test(s)) {
            const rows = members.filter(m => m.project_id === params[0] && m.user_id === params[1]);
            return { rows, rowCount: rows.length };
        }
        if (/^INSERT INTO project_members/i.test(s)) {
            const [project_id, user_id, role, invited_by] = params as [string, string, string, string | null];
            const existing = members.find(m => m.project_id === project_id && m.user_id === user_id);
            if (existing) { existing.role = role; return { rows: [existing], rowCount: 1 }; }
            const row: MemberRow = {
                id: `mbr-${members.length + 1}`, project_id, user_id, role,
                invited_by, invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
            };
            members.push(row);
            return { rows: [row], rowCount: 1 };
        }
        if (/^UPDATE project_members SET role/i.test(s)) {
            const [project_id, user_id, role] = params as [string, string, string];
            const row = members.find(m => m.project_id === project_id && m.user_id === user_id);
            if (!row) return { rows: [], rowCount: 0 };
            row.role = role;
            return { rows: [row], rowCount: 1 };
        }
        if (/^DELETE FROM project_members/i.test(s)) {
            const [project_id, user_id] = params as [string, string];
            const i = members.findIndex(m => m.project_id === project_id && m.user_id === user_id);
            if (i < 0) return { rows: [], rowCount: 0 };
            members.splice(i, 1);
            return { rows: [], rowCount: 1 };
        }
        throw new Error(`fake pg pool: unhandled SQL — ${s}`);
    }

    return {
        query,
        calls,
        members,
        /** Every mutating statement this pool was handed. A refused request must produce ZERO. */
        writes: () => calls.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql)),
    };
}

// ── Harness: mount the REAL handlers on a throwaway express app ─────────────
// Mirrors server/__tests__/eventLog.test.ts. Only the four dependency seams the
// module declares are stubbed; the handler bodies are the shipped ones.

type Pg = ReturnType<typeof makeFakePg>;

function buildApp(cfg: {
    pool?: Pg | null;
    supabase?: unknown | null;
    projectsMap?: { get: (id: string) => unknown } | null;
    platformOwners?: string[];
    canAccess?: boolean;
}) {
    const app = express();
    app.use(express.json());

    const handlers = makeProjectMembersHandlers({
        getSupabaseClient: async () => cfg.supabase ?? null,
        getPgPool: () => cfg.pool ?? null,
        getProjectsMap: () => cfg.projectsMap ?? null,
        isPlatformOwner: (userId: string) => (cfg.platformOwners ?? []).includes(userId),
        canAccessProject: async () => cfg.canAccess ?? true,
        // The REAL resolver, imported from server/projectAccess.js — not a stand-in.
        resolveProjectRole,
    });

    // `x-test-user` ⇒ that userId, else anonymous. Stands in for authMiddleware,
    // which populates req.auth and never rejects (C08 §1.2).
    app.use((req, _res, next) => {
        const u = req.header('x-test-user');
        (req as express.Request & { auth: { userId: string } }).auth = { userId: u && u.length ? u : 'anonymous' };
        next();
    });

    app.get('/api/projects/:id/members', handlers.list);
    app.post('/api/projects/:id/members', handlers.invite);
    app.patch('/api/projects/:id/members/:uid/role', handlers.changeRole);
    app.delete('/api/projects/:id/members/:uid', handlers.remove);
    return app;
}

let server: Server | null = null;
async function listen(app: express.Express): Promise<string> {
    server = createServer(app);
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
}
async function close() {
    if (server) { await new Promise<void>(r => server!.close(() => r())); server = null; }
}

async function call(base: string, method: string, path: string, user: string | null, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: {
            'content-type': 'application/json',
            ...(user ? { 'x-test-user': user } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* 204 has no body */ }
    return { status: res.status, body: json };
}

beforeEach(() => { server = null; });

/** The production deployment shape: PostgreSQL live, Supabase absent. */
function productionShape() {
    return makeFakePg({
        projects: [{ id: PROJECT, owner_id: ANTONIO }],
        users: [{ id: ANTONIO, email: ANTONIO_EMAIL }, { id: INVITEE, email: INVITEE_EMAIL }],
        members: [],
    });
}

// ═════════════════════════════════════════════════════════════════════════════
describe("§FIX-OWNER-READ-ON-PG — the founder's case, over real HTTP", () => {
    it('ARM 1 — the project OWNER invites by email on a PG deployment: 201, and the project_members row EXISTS', async () => {
        // THE arm. On HEAD this is 403, because ownerId was read from Supabase,
        // which is not configured on production.
        const pool = productionShape();
        const base = await listen(buildApp({ pool, supabase: null }));
        try {
            const res = await call(base, 'POST', `/api/projects/${PROJECT}/members`, ANTONIO, {
                userId: INVITEE_EMAIL, role: 'team_member',
            });

            expect(res.status, JSON.stringify(res.body)).toBe(201);
            expect(res.body?.source).toBe('postgres');

            // The OUTCOME, not merely the status: the row is in the table.
            expect(pool.members).toHaveLength(1);
            expect(pool.members[0]).toMatchObject({
                project_id: PROJECT,
                user_id: INVITEE,          // the email was resolved against pryzm_users
                role: 'team_member',
                invited_by: ANTONIO,
            });
        } finally { await close(); }
    });

    it('ARM 2 — DENY-BY-DEFAULT: a non-member invites on the same project: 403, and NOTHING is written', async () => {
        // Green BEFORE this change and green AFTER it. A missing branch must
        // never become a permissive branch.
        const pool = productionShape();
        const base = await listen(buildApp({ pool, supabase: null }));
        try {
            const res = await call(base, 'POST', `/api/projects/${PROJECT}/members`, STRANGER, {
                userId: INVITEE_EMAIL, role: 'team_member',
            });

            expect(res.status).toBe(403);
            expect(String(res.body?.error)).toContain('Forbidden');
            expect(pool.members).toHaveLength(0);
            expect(pool.writes(), 'a refused invite must issue no write').toHaveLength(0);
        } finally { await close(); }
    });

    it('ARM 3 — DENY-BY-DEFAULT: the INVITEE cannot invite others (team_member lacks invite_member)', async () => {
        // A real membership row is not a blank cheque. `team_member` is not in
        // PERMISSIONS.invite_member, so this must stay 403 even once the role
        // read reaches Postgres (COLLAB49 commit B).
        const pool = makeFakePg({
            projects: [{ id: PROJECT, owner_id: ANTONIO }],
            users: [{ id: ANTONIO, email: ANTONIO_EMAIL }, { id: INVITEE, email: INVITEE_EMAIL }],
            members: [{
                id: 'mbr-1', project_id: PROJECT, user_id: INVITEE, role: 'team_member',
                invited_by: ANTONIO, invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
            }],
        });
        const base = await listen(buildApp({ pool, supabase: null }));
        try {
            const res = await call(base, 'POST', `/api/projects/${PROJECT}/members`, INVITEE, {
                userId: 'someone-else@example.com', role: 'viewer',
            });
            expect(res.status).toBe(403);
            expect(pool.writes()).toHaveLength(0);
        } finally { await close(); }
    });

    it('ARM 4 — the OWNER changes a member role on PG: 200 and the stored role changes', async () => {
        const pool = makeFakePg({
            projects: [{ id: PROJECT, owner_id: ANTONIO }],
            members: [{
                id: 'mbr-1', project_id: PROJECT, user_id: INVITEE, role: 'viewer',
                invited_by: ANTONIO, invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
            }],
        });
        const base = await listen(buildApp({ pool, supabase: null }));
        try {
            const res = await call(base, 'PATCH', `/api/projects/${PROJECT}/members/${INVITEE}/role`, ANTONIO, {
                role: 'team_manager',
            });
            expect(res.status, JSON.stringify(res.body)).toBe(200);
            expect(pool.members[0].role).toBe('team_manager');
        } finally { await close(); }
    });

    it('ARM 5 — DENY-BY-DEFAULT: a non-member cannot change a role: 403, stored role untouched', async () => {
        const pool = makeFakePg({
            projects: [{ id: PROJECT, owner_id: ANTONIO }],
            members: [{
                id: 'mbr-1', project_id: PROJECT, user_id: INVITEE, role: 'viewer',
                invited_by: ANTONIO, invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
            }],
        });
        const base = await listen(buildApp({ pool, supabase: null }));
        try {
            const res = await call(base, 'PATCH', `/api/projects/${PROJECT}/members/${INVITEE}/role`, STRANGER, {
                role: 'lead_appointed',
            });
            expect(res.status).toBe(403);
            expect(pool.members[0].role).toBe('viewer');
            expect(pool.writes()).toHaveLength(0);
        } finally { await close(); }
    });

    it('ARM 6 — the OWNER removes a member on PG: 204 and the row is gone; a non-member gets 403 and the row survives', async () => {
        const seed = (): MemberRow[] => ([{
            id: 'mbr-1', project_id: PROJECT, user_id: INVITEE, role: 'team_member',
            invited_by: ANTONIO, invited_at: '2026-08-24T20:00:00.000Z', accepted_at: null,
        }]);

        // Refused first — the row must survive.
        const denied = makeFakePg({ projects: [{ id: PROJECT, owner_id: ANTONIO }], members: seed() });
        let base = await listen(buildApp({ pool: denied, supabase: null }));
        try {
            const res = await call(base, 'DELETE', `/api/projects/${PROJECT}/members/${INVITEE}`, STRANGER);
            expect(res.status).toBe(403);
            expect(denied.members).toHaveLength(1);
            expect(denied.writes()).toHaveLength(0);
        } finally { await close(); }

        // Then the owner — the row goes.
        const allowed = makeFakePg({ projects: [{ id: PROJECT, owner_id: ANTONIO }], members: seed() });
        base = await listen(buildApp({ pool: allowed, supabase: null }));
        try {
            const res = await call(base, 'DELETE', `/api/projects/${PROJECT}/members/${INVITEE}`, ANTONIO);
            expect(res.status).toBe(204);
            expect(allowed.members).toHaveLength(0);
        } finally { await close(); }
    });

    it('ARM 7 — a project that exists in NO store grants NOTHING, to anyone', async () => {
        // The false-positive guard. If `readProjectOwnerId` ever returned a
        // truthy-but-meaningless owner, or if a missing project degraded into a
        // permissive branch, ARM 1 would still pass and this one would not:
        // `ownerId` is null here for a legitimate reason, and null must deny.
        const pool = makeFakePg({ projects: [], users: [{ id: INVITEE, email: INVITEE_EMAIL }] });
        const base = await listen(buildApp({ pool, supabase: null }));
        try {
            const res = await call(base, 'POST', '/api/projects/proj-does-not-exist/members', ANTONIO, {
                userId: INVITEE_EMAIL, role: 'team_member',
            });
            expect(res.status).toBe(403);
            expect(pool.writes()).toHaveLength(0);
        } finally { await close(); }
    });

    it('ARM 8 — the in-memory deployment: the owner of an in-process project can invite too', async () => {
        // PRYZM_FORCE_INMEMORY / no DATABASE_URL, and the create-then-invite race.
        // HEAD denied here for the same reason it denied on PG: `ownerId` was read
        // from Supabase or from nowhere at all.
        const projectsMap = { get: (id: string) => (id === PROJECT ? { id, ownerId: ANTONIO } : undefined) };
        const base = await listen(buildApp({ pool: null, supabase: null, projectsMap }));
        try {
            const res = await call(base, 'POST', `/api/projects/${PROJECT}/members`, ANTONIO, {
                userId: INVITEE, role: 'team_member',   // raw userId: no directory in this mode
            });
            expect(res.status, JSON.stringify(res.body)).toBe(201);
            expect(res.body?.source).toBe('memory');
        } finally { await close(); }
    });

    it('ARM 9 — the PLATFORM owner still bypasses, and an anonymous caller still does not', async () => {
        const pool = productionShape();
        const base = await listen(buildApp({ pool, supabase: null, platformOwners: ['user-platform'] }));
        try {
            const ok = await call(base, 'POST', `/api/projects/${PROJECT}/members`, 'user-platform', {
                userId: INVITEE_EMAIL, role: 'viewer',
            });
            expect(ok.status, JSON.stringify(ok.body)).toBe(201);

            const anon = await call(base, 'POST', `/api/projects/${PROJECT}/members`, null, {
                userId: INVITEE_EMAIL, role: 'viewer',
            });
            expect(anon.status).toBe(403);
        } finally { await close(); }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('readProjectOwnerId — the read that did not exist', () => {
    it('ARM 10 — reads owner_id out of Postgres and names the store', async () => {
        const pool = productionShape();
        const out = await readProjectOwnerId({ supabase: null, pool, projectId: PROJECT });
        expect(out).toEqual({ ownerId: ANTONIO, source: 'postgres', found: true });
    });

    it('ARM 11 — falls through to the in-memory store, and reports "none" when no store has it', async () => {
        const projectsMap = { get: (id: string) => (id === PROJECT ? { id, ownerId: ANTONIO } : undefined) };
        expect(await readProjectOwnerId({ pool: null, projectsMap, projectId: PROJECT }))
            .toEqual({ ownerId: ANTONIO, source: 'memory', found: true });

        // ABSENT vs UNREACHABLE (C01 §6 r6): `found:false` is not the same fact as
        // a project row whose owner column is null.
        expect(await readProjectOwnerId({ pool: null, projectsMap, projectId: 'proj-nope' }))
            .toEqual({ ownerId: null, source: 'none', found: false });
    });

    it('ARM 12 — Supabase keeps priority over Postgres, unchanged', async () => {
        const pool = makeFakePg({ projects: [{ id: PROJECT, owner_id: 'someone-stale' }] });
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({ maybeSingle: async () => ({ data: { owner_id: ANTONIO }, error: null }) }),
                }),
            }),
        };
        const out = await readProjectOwnerId({ supabase, pool, projectId: PROJECT });
        expect(out).toEqual({ ownerId: ANTONIO, source: 'supabase', found: true });
        // The Supabase answer was authoritative — Postgres was never asked.
        expect(pool.calls).toHaveLength(0);
    });

    it('ARM 13 — a bad projectId is refused before any store is touched', async () => {
        const pool = productionShape();
        for (const bad of ['', null, undefined, 42]) {
            const out = await readProjectOwnerId({ pool, projectId: bad as never });
            expect(out.found).toBe(false);
            expect(out.ownerId).toBeNull();
        }
        expect(pool.calls).toHaveLength(0);
    });
});
