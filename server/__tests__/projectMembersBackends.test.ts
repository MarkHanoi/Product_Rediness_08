/**
 * server/__tests__/projectMembersBackends.test.ts
 *
 * §FIX-MEMBERS-PG-WRITE-PATH + §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — closes
 * L-806(b), which was logged on 2026-08-09 in these words and left open:
 *
 *   "There is no PG write path for members. […] On a DATABASE_URL-only
 *    deployment — which is the priority pgClient.js itself prefers — adding a
 *    member persists nothing and is lost on restart, silently."
 *
 * WHAT THE FOUNDER ACTUALLY SAW, AND WHICH HALF OF IT THESE ARMS PIN
 * ------------------------------------------------------------------
 * On production, `getSupabaseClient()` returns null (no SUPABASE_URL / key) and
 * `getPgPool()` is live (DATABASE_URL). Every members route branched
 * `supabase ? … : <in-memory Map>` and so:
 *
 *   · GET  answered `{members: []}` / HTTP 200 from a Map nothing durable ever
 *     writes — a confident "0 members" for a store that could not have had any.
 *   · POST with an email hit `if (!supabase)` and answered
 *     HTTP 400 "Inviting by email requires the database connection."
 *     The database connection was UP. The message named a cause that was false;
 *     what was missing was a code path, not a connection.
 *
 * ARMS 1–8 pin the store layer. ARMS 9–11 read `server.js` AS TEXT and say so
 * rather than pretending to be behavioural: `server.js` is a ~240 KB Express
 * module that binds ports, starts migrations and opens Socket.io at import
 * time, so importing it here would be testing a boot sequence, not a route.
 * What ARMS 9–11 can prove is exactly what they claim — that the false literal
 * is gone from the shipped file and the routes are wired to the orchestrators.
 *
 * NOT PROVEN HERE (stated so a green run is not over-read):
 *   · that the live production Postgres actually holds `project_members` rows —
 *     that needs a session against the real DB;
 *   · that the invitee's account exists in the LOCAL `pryzm_users` copy (auth
 *     may run against Supabase while `pgClient` prefers DATABASE_URL, which is
 *     precisely the split that produced this defect);
 *   · anything about the accept handshake — L-806(a) is still open, `accepted_at`
 *     is still never written by any route.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    toMemberDTO,
    listMembersForProject,
    resolveInviteTarget,
    upsertMemberForProject,
    updateMemberRoleForProject,
    removeMemberForProject,
    // @ts-expect-error — plain-JS server module, no .d.ts by design.
} from '../projectMembers.js';

// ── A fake pg pool: records every SQL string it is handed ────────────────────
function fakePool(result: unknown = { rows: [], rowCount: 0 }) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
        calls,
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
            calls.push({ sql, params });
            return result as never;
        }),
    };
}

const SQL = (p: ReturnType<typeof fakePool>) => p.calls.map(c => c.sql).join('\n').replace(/\s+/g, ' ');

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-MEMBERS-PG-WRITE-PATH — the Postgres branch exists and is used', () => {
    it('ARM 1 — with a pool and no Supabase, the LIST reads project_members (not the Map)', async () => {
        const pool = fakePool({
            rows: [{
                id: 'mbr-1', project_id: 'proj-1787554200066-a936f1ea8b34', user_id: 'u-9',
                role: 'team_member', invited_by: 'u-1',
                invited_at: '2026-08-20T10:00:00.000Z', accepted_at: null,
                email: 'ada@example.com', name: 'Ada Lovelace',
            }],
            rowCount: 1,
        });

        const out = await listMembersForProject({
            supabase: null, pool, projectId: 'proj-1787554200066-a936f1ea8b34',
        });

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(SQL(pool)).toContain('FROM project_members');
        expect(out.source).toBe('postgres');
        expect(out.members).toHaveLength(1);
        // Normalised to the ONE shape the client declares.
        expect(out.members[0].userId).toBe('u-9');
        expect(out.members[0].displayName).toBe('Ada Lovelace');
        expect(out.members[0].email).toBe('ada@example.com');
    });

    it('ARM 2 — with a pool, an INVITE writes an INSERT to project_members', async () => {
        const pool = fakePool({
            rows: [{ id: 'mbr-2', project_id: 'p1', user_id: 'u-9', role: 'team_member', invited_by: 'u-1', invited_at: 0, accepted_at: null }],
            rowCount: 1,
        });

        const { member, source } = await upsertMemberForProject({
            supabase: null, pool, projectId: 'p1', userId: 'u-9', role: 'team_member', invitedBy: 'u-1',
        });

        expect(source).toBe('postgres');
        expect(SQL(pool)).toContain('INSERT INTO project_members');
        // Idempotent on the UNIQUE (project_id, user_id) constraint — a repeat
        // invite must update the role, not explode.
        expect(SQL(pool)).toContain('ON CONFLICT (project_id, user_id) DO UPDATE');
        expect(member.userId).toBe('u-9');
    });

    it('ARM 3 — with a pool, a ROLE CHANGE and a REMOVAL both hit Postgres', async () => {
        const p1 = fakePool({ rows: [{ id: 'm', project_id: 'p1', user_id: 'u-9', role: 'viewer' }], rowCount: 1 });
        const r1 = await updateMemberRoleForProject({ supabase: null, pool: p1, projectId: 'p1', userId: 'u-9', role: 'viewer' });
        expect(r1.source).toBe('postgres');
        expect(SQL(p1)).toContain('UPDATE project_members SET role');

        const p2 = fakePool({ rows: [], rowCount: 1 });
        const r2 = await removeMemberForProject({ supabase: null, pool: p2, projectId: 'p1', userId: 'u-9' });
        expect(r2.source).toBe('postgres');
        expect(r2.removed).toBe(true);
        expect(SQL(p2)).toContain('DELETE FROM project_members');
    });

    it('ARM 4 — with NO pool and NO Supabase, the source is reported as the volatile Map', async () => {
        // The in-memory store is a DECLARED backend (dev / PRYZM_FORCE_INMEMORY),
        // not a degrade — so it is kept. What changes is that it now says so,
        // instead of its `[]` being indistinguishable from a real zero.
        const out = await listMembersForProject({ supabase: null, pool: null, projectId: 'p-empty' });
        expect(out.source).toBe('memory');
        expect(out.members).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-MEMBERS-ABSENT-VS-UNREACHABLE — a failed read never becomes an empty one', () => {
    it('ARM 5 — a pool that THROWS rejects; it does not silently fall back to the Map', async () => {
        // This is §FIX-DEGRADE-HONESTY (L-789) one layer up: degrading to the
        // Map on a pooler blip would answer "0 members" during exactly the
        // incident where that answer is most damaging.
        const pool = {
            query: vi.fn(async () => {
                throw Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' });
            }),
        };
        await expect(
            listMembersForProject({ supabase: null, pool, projectId: 'p1' }),
        ).rejects.toThrow(/Connection terminated/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-MEMBERS-INVITE-MESSAGE — the "database connection" claim was false', () => {
    it('ARM 6 — with a pool, an email resolves against the Postgres user directory', async () => {
        const pool = fakePool({ rows: [{ id: 'u-42' }], rowCount: 1 });
        const out = await resolveInviteTarget({ supabase: null, pool, target: 'lookwithinjourney@gmail.com' });

        expect(out.ok).toBe(true);
        expect(out.userId).toBe('u-42');
        expect(out.source).toBe('postgres');
        expect(SQL(pool)).toContain('FROM pryzm_users');
        // Case-insensitive EXACT match, mirroring the Supabase .ilike() call —
        // never a wildcard, or an invite could land on the wrong account.
        expect(SQL(pool)).toContain('lower(email) = lower($1)');
    });

    it('ARM 7 — with a pool and no such account, it is a 404 about the ACCOUNT, not the DB', async () => {
        const pool = fakePool({ rows: [], rowCount: 0 });
        const out = await resolveInviteTarget({ supabase: null, pool, target: 'nobody@example.com' });

        expect(out.ok).toBe(false);
        expect(out.status).toBe(404);
        expect(out.code).toBe('user_not_found');
        expect(out.error).toContain('nobody@example.com');
    });

    it('ARM 8 — with NEITHER backend, the refusal names the real cause and is not a 400', async () => {
        const out = await resolveInviteTarget({ supabase: null, pool: null, target: 'someone@example.com' });

        expect(out.ok).toBe(false);
        // 400 said "you sent a bad request". The request was fine; the server
        // has no directory. 503 is the honest code, and it is retryable.
        expect(out.status).toBe(503);
        expect(out.code).toBe('user_directory_unavailable');
        expect(out.error).toContain('no user directory');
        // The literal that was wrong on production must not come back.
        expect(out.error).not.toContain('requires the database connection');
    });

    it('ARM 8b — a bare userId (no @) needs no directory at all', async () => {
        const out = await resolveInviteTarget({ supabase: null, pool: null, target: '  u-7  ' });
        expect(out.ok).toBe(true);
        expect(out.userId).toBe('u-7');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('toMemberDTO — one shape for three backends', () => {
    it('ARM 9 — snake_case (Supabase / PG) and camelCase (Map) normalise identically', () => {
        const snake = toMemberDTO({
            id: 'm', project_id: 'p', user_id: 'u', role: 'viewer',
            invited_by: 'i', invited_at: '2026-08-20T10:00:00.000Z', accepted_at: null, name: 'Ada',
        });
        const camel = toMemberDTO({
            id: 'm', projectId: 'p', userId: 'u', role: 'viewer',
            invitedBy: 'i', invitedAt: Date.parse('2026-08-20T10:00:00.000Z'), acceptedAt: null, displayName: 'Ada',
        });
        expect(snake).toEqual(camel);
        expect(snake.userId).toBe('u');
        expect(snake.invitedAt).toBe(Date.parse('2026-08-20T10:00:00.000Z'));
        expect(snake.acceptedAt).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠ TEXT ARMS. These read shipped source as a string — see the header for why.
//
// §FIX-OWNER-READ-ON-PG (COLLAB49, 2026-08-24) — ARMs 11 and 12 used to read
// `server.js`, because that is where the four members HANDLER BODIES lived. They
// now live in `server/projectMembersRoutes.js`; the four `app.<verb>(…)`
// REGISTRATIONS deliberately stayed in `server.js` so that
// `tools/ga-gate/check-write-route-auth.ts` — which scans `server.js` and only
// `server.js` — keeps seeing all three mutating routes. So these arms now read
// the file that holds the thing each one is actually asserting about: the
// registrations from `server.js`, the handler bodies from the routes module.
// The ASSERTIONS are unchanged in intent and strength.
//
// Route-level BEHAVIOUR (status codes, and the SQL a handler actually issues) is
// pinned in `projectMembersOwnerCanInvite.test.ts`, which mounts these very
// handlers on a throwaway express app and drives them over real HTTP — the thing
// no text arm can do.
// ─────────────────────────────────────────────────────────────────────────────
describe('members route wiring (source-text arms)', () => {
    const REPO = resolve(__dirname, '../..');
    const serverJs = readFileSync(join(REPO, 'server.js'), 'utf8');
    const routesJs = readFileSync(join(REPO, 'server', 'projectMembersRoutes.js'), 'utf8');

    it('ARM 10 — the false "requires the database connection" literal is gone', () => {
        expect(serverJs).not.toContain('Inviting by email requires the database connection');
        expect(routesJs).not.toContain('Inviting by email requires the database connection');
    });

    it('ARM 11 — the members handlers call the backend-selecting orchestrators', () => {
        for (const fn of [
            'listMembersForProject',
            'resolveInviteTarget',
            'upsertMemberForProject',
            'updateMemberRoleForProject',
            'removeMemberForProject',
        ]) {
            // twice each: the import, and at least one call site.
            expect(routesJs.split(fn).length - 1, `${fn} import + call site`).toBeGreaterThanOrEqual(2);
        }
    });

    it('ARM 11b — all four routes are still REGISTERED in server.js behind authMiddleware', () => {
        // The write-route-auth gate scans server.js only. If these registrations
        // ever migrate into a router module, three mutating routes silently leave
        // that gate's surface — which is the exact "the audit lost sight of the
        // artefact" failure the gate exists to end.
        for (const reg of [
            "app.get('/api/projects/:id/members', authMiddleware,",
            "app.post('/api/projects/:id/members', authMiddleware,",
            "app.patch('/api/projects/:id/members/:uid/role', authMiddleware,",
            "app.delete('/api/projects/:id/members/:uid', authMiddleware,",
        ]) {
            expect(serverJs, reg).toContain(reg);
        }
    });

    it('ARM 12 — the members GET no longer answers a failed read with HTTP 500 "Internal server error"', () => {
        // The GET handler now returns a 503 carrying `members_store_unavailable`,
        // so the client can distinguish "could not read" from "read zero rows".
        const get = routesJs.slice(routesJs.indexOf('async function list(req, res)'));
        const handler = get.slice(0, get.indexOf('async function invite(req, res)'));
        expect(handler).toContain('members_store_unavailable');
        expect(handler).toContain('res.status(503)');
    });
});
