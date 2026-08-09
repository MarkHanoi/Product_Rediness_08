/**
 * server/__tests__/projectStore-membership-reads.test.ts
 *
 * §FIX-ACCESS-MEMBERSHIP (L-336, part 2 of 2) — READS widen to members; WRITES
 * do not.
 *
 * ─── Why part 2 exists ───────────────────────────────────────────────────────
 * Part 1 (`4596f729`) made `canUserAccessProject()` consult `project_members`, so
 * a member can JOIN the project's socket room. But every project READ in
 * `projectStore.js` still filtered `owner_id`, so that member could join a room
 * for a project they could not list, open, or read a version of. Joining a room
 * you cannot load anything into is useless — part 1 was necessary and not
 * sufficient.
 *
 * ─── The scope decision, stated once ─────────────────────────────────────────
 * Not every `owner_id` filter should widen. The rule applied here:
 *
 *   READS  (list, get, status, versions)  → owner OR member
 *   WRITES (rename, patch, delete, thumbnail) → OWNER ONLY, unchanged
 *
 * Widening reads restores the collaboration L-336 blocks. Widening writes is a
 * separate decision that needs the ISO 19650 role matrix enforced per action
 * (`hasPermission(role, 'edit_model')` etc., which `roleCheck` already provides
 * at the route layer) — and doing it silently, inside a commit whose stated
 * purpose is "members can see the project", would be the worst way to widen a
 * write boundary. So the write tests below are not incidental coverage: they are
 * the guard that this change did NOT quietly grant more than it claims.
 *
 * ─── What these tests assert, and what they do not ───────────────────────────
 * They assert the SQL SHAPE and the parameters — that a read carries a
 * membership predicate keyed on the caller, and that a write does not. They do
 * NOT prove the predicate returns the right rows against a real Postgres; that
 * needs an integration test with two seeded users, which is L-800's item (2) and
 * is called out there. Stating the limit rather than implying full coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../pgClient.js', () => ({
    getPgPool: () => ({}),
    query: (...args: unknown[]) => mockQuery(...args),
    withTransaction: vi.fn(),
}));

let store: typeof import('../projectStore.js');

const USER = 'user-caller';
const PROJECT = 'proj-1786000000000-aaaaaa';

/** The membership predicate every widened read must carry. */
const MEMBERSHIP_PREDICATE = /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+project_members/i;

beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    store = await import('../projectStore.js');
});

/** The SQL of the Nth query issued (default: the first). */
function sqlOf(n = 0): string {
    return String(mockQuery.mock.calls[n]?.[0] ?? '');
}
function paramsOf(n = 0): unknown[] {
    return (mockQuery.mock.calls[n]?.[1] ?? []) as unknown[];
}

describe('§FIX-ACCESS-MEMBERSHIP part 2 — READS admit members', () => {
    it('listProjects returns projects the caller is a MEMBER of, not only owns', async () => {
        // The hub. Without this a member has no way to reach the project at all —
        // there is no "projects shared with me" surface, so the list IS the door.
        await store.listProjects(USER);
        expect(sqlOf()).toMatch(MEMBERSHIP_PREDICATE);
        expect(paramsOf()).toContain(USER);
    });

    it('getProject admits a member', async () => {
        await store.getProject(PROJECT, USER);
        expect(sqlOf()).toMatch(MEMBERSHIP_PREDICATE);
        expect(paramsOf()).toEqual(expect.arrayContaining([PROJECT, USER]));
    });

    it('getProjectStatus admits a member', async () => {
        await store.getProjectStatus(PROJECT, USER);
        expect(sqlOf()).toMatch(MEMBERSHIP_PREDICATE);
    });

    it('listVersions admits a member on its access pre-check', async () => {
        await store.listVersions(PROJECT, USER);
        expect(sqlOf()).toMatch(MEMBERSHIP_PREDICATE);
    });

    it('getVersionById admits a member on its access pre-check', async () => {
        await store.getVersionById(PROJECT, 'ver-1786000000000-bbbbbb', USER);
        expect(sqlOf()).toMatch(MEMBERSHIP_PREDICATE);
    });

    it('listVersions STILL refuses when called without a userId (GAP-15 regression)', async () => {
        // Widening must not reopen the hole GAP-15 closed: no userId means the
        // ownership check would be bypassed entirely, so the answer is refusal,
        // not "everything".
        await expect(store.listVersions(PROJECT, undefined as unknown as string)).resolves.toEqual([]);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

describe('§FIX-ACCESS-MEMBERSHIP part 2 — WRITES stay owner-only', () => {
    // These are the guard that this change did not quietly widen more than it
    // says. A membership predicate appearing in any of them is a FAILURE, not an
    // improvement — write authorisation belongs to the ISO 19650 role matrix
    // (hasPermission / roleCheck), decided per action, not smuggled in here.

    it('renameProject does NOT admit members', async () => {
        await store.renameProject(PROJECT, USER, 'New name');
        expect(sqlOf()).not.toMatch(MEMBERSHIP_PREDICATE);
        expect(sqlOf()).toMatch(/owner_id\s*=\s*\$/i);
    });

    it('patchProject does NOT admit members', async () => {
        await store.patchProject(PROJECT, USER, { isStarred: true });
        expect(sqlOf()).not.toMatch(MEMBERSHIP_PREDICATE);
        expect(sqlOf()).toMatch(/owner_id\s*=\s*\$/i);
    });

    it('updateProjectThumbnail does NOT admit members', async () => {
        await store.updateProjectThumbnail(PROJECT, USER, 'data:image/png;base64,AAAA');
        expect(sqlOf()).not.toMatch(MEMBERSHIP_PREDICATE);
        expect(sqlOf()).toMatch(/owner_id\s*=\s*\$/i);
    });

    it('deleteProject does NOT admit members — the most destructive path', async () => {
        // A team_member deleting the project because "collaboration was enabled"
        // is the single worst outcome available from getting this wrong.
        await store.deleteProject(PROJECT, USER);
        expect(sqlOf()).not.toMatch(MEMBERSHIP_PREDICATE);
        expect(sqlOf()).toMatch(/DELETE\s+FROM\s+projects/i);
        expect(sqlOf()).toMatch(/owner_id\s*=\s*\$/i);
    });
});
