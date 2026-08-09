/**
 * server/__tests__/projectAccess-membership.test.ts
 *
 * §FIX-ACCESS-MEMBERSHIP (L-336) — the access gate consults `project_members`.
 *
 * ─── The defect ──────────────────────────────────────────────────────────────
 * `canUserAccessProject()` resolved access purely by `owner_id` on ALL THREE of
 * its backends. `project_members` — the table, `projectMembers.js`, the complete
 * ISO 19650 role matrix in `permissions.js`, `pendingInvites.js` — was never
 * read by it. Since `join-project` is the only gate that admits a socket to a
 * project room, every non-owner was rejected, and cursors, presence,
 * remote-command relay and sheet comments were unreachable by anyone but the
 * project's owner. Real-time multi-user collaboration, the product's headline
 * capability, worked only as two tabs of the same account.
 *
 * Open as an "architectural launch-blocker" since 2026-07-16. No test caught it
 * because no test exercised two distinct users — which is the actual lesson, and
 * why the first test below is the one that matters.
 *
 * ─── Two traps found while implementing, both pinned here ────────────────────
 *
 * TRAP 1 — `accepted_at` is DEAD SCHEMA. It exists in the DDL and in the
 * in-memory `MemberRecord`, and `acceptInvitation()` exists in
 * `projectMembers.js` — but it is in-memory-only and NO ROUTE CALLS IT, and
 * nothing writes `accepted_at` to the database anywhere in `server/`. Requiring
 * `accepted_at IS NOT NULL` would therefore have made this whole fix a SILENT
 * NO-OP: membership would grant nothing, the tests would be green, and the
 * launch-blocker would still be there. So a row grants access regardless of
 * `accepted_at`, deliberately and with the trade-off stated (L-806).
 *
 * TRAP 2 — a role string that is not in `ROLES` must FAIL CLOSED. The gate is an
 * authorization boundary; the correct response to data it does not understand is
 * refusal, not a guess.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canUserAccessProject } from '../projectAccess.js';

const PROJECT = 'proj-1786000000000-aaaaaa';
const OWNER = 'user-owner';
const MEMBER = 'user-member';
const STRANGER = 'user-stranger';

/** A pg pool whose single JOIN query returns `rows`. */
function pgPoolReturning(rows: unknown[]) {
    return { query: vi.fn().mockResolvedValue({ rows }) };
}
/** A pg pool whose query rejects — the transient-error path. */
function pgPoolThrowing() {
    return { query: vi.fn().mockRejectedValue(Object.assign(new Error('Connection terminated'), { code: '57P01' })) };
}

beforeEach(() => vi.clearAllMocks());

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — the two-user case that was never tested', () => {
    it('GRANTS access to a project member who is not the owner', async () => {
        // THE test. Had this existed in July, L-336 would have been caught then.
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: 'team_member' }]);
        const res = await canUserAccessProject(MEMBER, PROJECT, { supabase: null, pgPool, projectsMap: null });
        expect(res.allowed).toBe(true);
        expect(res.role).toBe('team_member');
    });

    it('still grants the owner, and reports the owner role', async () => {
        // Regression guard: widening a boundary must not disturb the existing one.
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: null }]);
        const res = await canUserAccessProject(OWNER, PROJECT, { supabase: null, pgPool, projectsMap: null });
        expect(res.allowed).toBe(true);
        expect(res.role).toBe('owner');
    });

    it('DENIES a user who is neither owner nor member', async () => {
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: null }]);
        const res = await canUserAccessProject(STRANGER, PROJECT, { supabase: null, pgPool, projectsMap: null });
        expect(res.allowed).toBe(false);
        expect(res.retryable).toBeFalsy();   // a VERIFIED denial, not "cannot tell"
    });

    it('still denies anonymous, before any query runs', async () => {
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: 'lead_appointed' }]);
        const res = await canUserAccessProject('anonymous', PROJECT, { supabase: null, pgPool, projectsMap: null });
        expect(res.allowed).toBe(false);
        expect(pgPool.query).not.toHaveBeenCalled();
    });

    it('grants every valid ISO 19650 role, viewer included', async () => {
        // Joining a room is a READ action and all five roles have read rights.
        // WRITE authorisation is `hasPermission(role, ...)`, which is why the gate
        // must RETURN the role rather than collapse it to a boolean.
        for (const role of ['appointing_party', 'lead_appointed', 'team_manager', 'team_member', 'viewer']) {
            const pgPool = pgPoolReturning([{ owner_id: OWNER, role }]);
            const res = await canUserAccessProject(MEMBER, PROJECT, { supabase: null, pgPool, projectsMap: null });
            expect(res.allowed, `role ${role} should be admitted`).toBe(true);
            expect(res.role).toBe(role);
        }
    });
});

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — fails closed on data it does not understand', () => {
    it('DENIES an unrecognised role string rather than guessing', async () => {
        // TRAP 2. This is an authorization boundary: the correct response to an
        // unknown value is refusal. A truthy-role check would have admitted this.
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: 'superuser' }]);
        const res = await canUserAccessProject(MEMBER, PROJECT, { supabase: null, pgPool, projectsMap: null });
        expect(res.allowed).toBe(false);
    });

    it('DENIES an empty-string role', async () => {
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: '' }]);
        expect((await canUserAccessProject(MEMBER, PROJECT, { supabase: null, pgPool, projectsMap: null })).allowed).toBe(false);
    });
});

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — an unaccepted invitation still grants (stated trade-off)', () => {
    it('grants when accepted_at is null, because NOTHING EVER SETS IT', async () => {
        // TRAP 1, pinned deliberately. `accepted_at` is dead schema: no route calls
        // acceptInvitation(), and nothing in server/ writes the column. Gating on it
        // would make this entire fix a silent no-op — green tests, blocker intact.
        //
        // ⚠ The cost is real and is recorded as L-806: an INVITED-but-not-accepted
        // user can join. That is a deliberate, stated trade-off, not an oversight,
        // and it is strictly better than a fix that grants nothing. When the
        // invitation lifecycle is built, this test must be INVERTED, not deleted.
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: 'team_member', accepted_at: null }]);
        expect((await canUserAccessProject(MEMBER, PROJECT, { supabase: null, pgPool, projectsMap: null })).allowed).toBe(true);
    });
});

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — one round trip, not two', () => {
    it('resolves ownership AND membership in a SINGLE pg query', async () => {
        // This runs on EVERY socket join. Two queries would double the load on the
        // pool that L-787 just resized, on the hottest authorization path there is.
        const pgPool = pgPoolReturning([{ owner_id: OWNER, role: 'viewer' }]);
        await canUserAccessProject(MEMBER, PROJECT, { supabase: null, pgPool, projectsMap: null });
        expect(pgPool.query).toHaveBeenCalledTimes(1);
        const [sql] = pgPool.query.mock.calls[0]!;
        expect(String(sql)).toMatch(/LEFT JOIN\s+project_members/i);
    });
});

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — transient errors stay retryable (L-136 regression)', () => {
    it('a DB error is RETRYABLE, never a verified denial', async () => {
        // L-136's distinction must survive: "could not verify" and "verified not
        // permitted" are different answers and must not collapse — that is what
        // produced the permanent grey card.
        const res = await canUserAccessProject(MEMBER, PROJECT, {
            supabase: null, pgPool: pgPoolThrowing(), projectsMap: null,
        });
        expect(res.allowed).toBe(false);
        expect(res.retryable).toBe(true);
    });

    it('a project absent from every source is a hard deny, not retryable', async () => {
        const res = await canUserAccessProject(MEMBER, PROJECT, {
            supabase: null, pgPool: pgPoolReturning([]), projectsMap: null,
        });
        expect(res.allowed).toBe(false);
        expect(res.retryable).toBeFalsy();
    });
});

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — Supabase path', () => {
    function supabaseWith(project: unknown, member: unknown) {
        return {
            from: (table: string) => ({
                select: () => ({
                    eq: function () { return this; },
                    maybeSingle: async () =>
                        table === 'projects' ? { data: project, error: null } : { data: member, error: null },
                }),
            }),
        };
    }

    it('grants a member on the Supabase path too', async () => {
        const supabase = supabaseWith({ id: PROJECT, owner_id: OWNER }, { role: 'team_manager' });
        const res = await canUserAccessProject(MEMBER, PROJECT, { supabase, pgPool: null, projectsMap: null });
        expect(res.allowed).toBe(true);
        expect(res.role).toBe('team_manager');
    });

    it('denies a stranger on the Supabase path', async () => {
        const supabase = supabaseWith({ id: PROJECT, owner_id: OWNER }, null);
        expect((await canUserAccessProject(STRANGER, PROJECT, { supabase, pgPool: null, projectsMap: null })).allowed).toBe(false);
    });
});

describe('§FIX-ACCESS-MEMBERSHIP (L-336) — in-memory path', () => {
    it('grants the owner via the projectsMap adapter (race-window case)', async () => {
        const projectsMap = { get: () => ({ ownerId: OWNER }) };
        const res = await canUserAccessProject(OWNER, PROJECT, { supabase: null, pgPool: null, projectsMap });
        expect(res.allowed).toBe(true);
        expect(res.role).toBe('owner');
    });

    it('grants an in-memory member when a membersLookup is supplied', async () => {
        // Without Supabase, `upsertMember()` writes ONLY to the volatile in-memory
        // Map — there is no PG write path for members at all (L-806). So the
        // in-memory branch has to consult it, or dev/self-host deployments would
        // still be owner-only after this fix.
        const projectsMap = { get: () => ({ ownerId: OWNER }) };
        const membersLookup = () => ({ role: 'team_member' });
        const res = await canUserAccessProject(MEMBER, PROJECT, {
            supabase: null, pgPool: null, projectsMap, membersLookup,
        });
        expect(res.allowed).toBe(true);
        expect(res.role).toBe('team_member');
    });

    it('denies a stranger in memory', async () => {
        const projectsMap = { get: () => ({ ownerId: OWNER }) };
        const membersLookup = () => null;
        expect((await canUserAccessProject(STRANGER, PROJECT, {
            supabase: null, pgPool: null, projectsMap, membersLookup,
        })).allowed).toBe(false);
    });
});
