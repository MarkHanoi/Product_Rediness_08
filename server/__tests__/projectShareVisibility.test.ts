/**
 * server/__tests__/projectShareVisibility.test.ts
 *
 * §SHARE101 — "the user I am adding doesn't see the new project. Where could it
 * access?" (founder, 2026-08-25).
 *
 * ─── What was actually wrong, stated so the tests are readable ───────────────
 * The briefed root ("GET /api/projects returns only projects the requester OWNS;
 * there is no membership join anywhere in the list path") was STALE. L-336 part 2
 * had already widened `listProjects` to `owner OR member`, and that fix is live in
 * the deployed SHA. Two real defects survived it:
 *
 *   1. The row could not SAY it was shared. It came back shaped exactly like an
 *      owned project — no role, no ownerId, no flag — so no client could render
 *      "shared with you". The list answered "where can they access it?" with
 *      silence, which is the founder's second question unanswered.
 *   2. The SAVE path still authorised on `owner_id` alone
 *      (`createVersionTransactional` step 2b). A member could list the project,
 *      open it, load the model, edit it — and lose every change, because each
 *      autosave came back "owned by a different user — save rejected". Visibility
 *      without a write path is worse than no sharing: the user does real work and
 *      it silently does not persist.
 *
 * ─── What these tests assert, and what they do NOT ──────────────────────────
 * They drive the real `projectStore` functions against a FAKE pool, asserting the
 * SQL shape, the bound parameters, and — for the save path — the ACCEPT/REJECT
 * decision per role, which is a real branch and not merely a string match. They do
 * NOT prove the predicates select the right rows out of a live Postgres; that is
 * the integration test L-800 item (2) still owes. Stating the limit rather than
 * implying full coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockClientQuery = vi.fn();

vi.mock('../pgClient.js', () => ({
    getPgPool: () => ({}),
    query: (...args: unknown[]) => mockQuery(...args),
    withTransaction: async (fn: (c: unknown) => unknown) =>
        fn({ query: (...args: unknown[]) => mockClientQuery(...args) }),
}));

let store: typeof import('../projectStore.js');
let label: typeof import('../projectShareLabel.js');

const OWNER = 'user-owner';
const MEMBER = 'user-member';
const STRANGER = 'user-stranger';
const PROJECT = 'proj-1786000000000-aaaaaa';

beforeEach(async () => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    store = await import('../projectStore.js');
    label = await import('../projectShareLabel.js');
});

const sqlOf = (n = 0) => String(mockQuery.mock.calls[n]?.[0] ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// (a) + (b) + (c) — the list admits a member, excludes a stranger, and LABELS
// ─────────────────────────────────────────────────────────────────────────────
describe('§SHARE101 — the list says HOW the caller reached each row', () => {
    it('(c) labels a project the caller OWNS as owned, never shared', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: PROJECT, name: 'Casa', owner_id: OWNER, member_role: null }],
        });
        const [row] = await store.listProjects(OWNER) as any[];
        expect(row.ownerId).toBe(OWNER);
        expect(row.role).toBe('owner');
        expect(row.sharedWithMe).toBe(false);
    });

    it('(c) labels a project shared WITH the caller as shared, carrying the real role', async () => {
        // THE FOUNDER'S CASE. Before §SHARE101 this row carried none of these three
        // fields, so the hub had nothing to render a "Shared with you" badge from.
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: PROJECT, name: 'Casa', owner_id: OWNER, member_role: 'team_member' }],
        });
        const [row] = await store.listProjects(MEMBER) as any[];
        expect(row.ownerId).toBe(OWNER);
        expect(row.role).toBe('team_member');
        expect(row.sharedWithMe).toBe(true);
    });

    it('(a) the list query still admits members — the membership predicate survives labelling', async () => {
        await store.listProjects(MEMBER);
        expect(sqlOf()).toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+project_members/i);
    });

    it('(b) the list query is still SCOPED to the caller — a stranger cannot be admitted by it', async () => {
        // §AUTH-SESSION-LEAK-2. This change makes the list BROADER by design, which
        // makes it the change most able to re-introduce the leak this repo actually
        // suffered. Both legs of the widened predicate — ownership AND membership —
        // must be keyed on the CALLER, so there is no row shape that reaches a
        // non-owner non-member. A predicate that forgot the user on either leg
        // would return everyone's projects and still pass a "returns rows" test.
        await store.listProjects(STRANGER);
        const sql = sqlOf();
        expect(sql).toMatch(/p\.owner_id\s*=\s*\$1/);          // ownership leg keyed on caller
        expect(sql).toMatch(/m\.user_id\s*=\s*\$1/);            // membership leg keyed on caller
        expect(mockQuery.mock.calls[0]?.[1]).toContain(STRANGER);
        // …and nothing else may be bound as an identity.
        expect(mockQuery.mock.calls[0]?.[1]).not.toContain(OWNER);
        expect(mockQuery.mock.calls[0]?.[1]).not.toContain(MEMBER);
    });

    it('the role LEFT JOIN cannot multiply rows — it is keyed on BOTH unique columns', async () => {
        // project_members carries UNIQUE (project_id, user_id). Joining on both
        // matches at most one row. Joining on project_id ALONE would duplicate a
        // project once per member — a five-person project appearing five times.
        await store.listProjects(MEMBER);
        expect(sqlOf()).toMatch(
            /LEFT\s+JOIN\s+project_members\s+m\s+ON\s+m\.project_id\s*=\s*p\.id\s+AND\s+m\.user_id\s*=\s*\$1/i,
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The honesty rule — UNKNOWN is not FALSE
// ─────────────────────────────────────────────────────────────────────────────
describe('§SHARE101 — a backend that cannot tell must not claim', () => {
    it('the in-memory arm reports sharedWithMe=null (unknown), never false', () => {
        // C01 §6 rule 6 / [[context-data-honesty-family]]: ABSENT and UNKNOWN must
        // not be reported as the same value. This store holds no roles, so it can
        // prove ownership and cannot disprove membership.
        const rows = [{ id: PROJECT, name: 'Casa', owner_id: OWNER }];
        label.labelProjectsForCaller(rows as any, MEMBER, { membershipKnown: false });
        expect((rows[0] as any).sharedWithMe).toBeNull();
        expect((rows[0] as any).sharedWithMe).not.toBe(false);
    });

    it('a backend that DID look but found no role still reports shared=true', () => {
        // It reached the caller through a membership predicate, so it IS shared;
        // only the role is unreadable. Reporting `false` would claim ownership.
        const rows = [{ id: PROJECT, owner_id: OWNER, member_role: null }];
        label.labelProjectsForCaller(rows as any, MEMBER, { membershipKnown: true });
        expect((rows[0] as any).sharedWithMe).toBe(true);
        expect((rows[0] as any).role).toBeNull();
    });

    it('an unknown role string fails closed rather than being echoed back', () => {
        const rows = [{ id: PROJECT, owner_id: OWNER, member_role: 'superuser' }];
        label.labelProjectsForCaller(rows as any, MEMBER);
        expect((rows[0] as any).role).toBeNull();
    });

    it('countOwnedVsShared separates the three states for the leak diagnostic', () => {
        const rows = [
            { sharedWithMe: false }, { sharedWithMe: true },
            { sharedWithMe: true }, { sharedWithMe: null },
        ];
        expect(label.countOwnedVsShared(rows as any)).toEqual({
            owned: 1, shared: 2, unknown: 1, total: 4,
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) — a member may SAVE; a viewer and a stranger may not; nobody gains owner powers
// ─────────────────────────────────────────────────────────────────────────────
describe('§SHARE101 — the save path enforces the role matrix, not owner_id', () => {
    /** Drives createVersionTransactional against a project owned by OWNER. */
    async function saveAs(userId: string, role: string | null, projectName?: string) {
        mockClientQuery.mockReset();
        mockClientQuery.mockImplementation(async (sql: string) => {
            const s = String(sql);
            if (/SELECT id, owner_id, version_count FROM projects/.test(s)) {
                return { rows: [{ id: PROJECT, owner_id: OWNER, version_count: 1 }] };
            }
            if (/SELECT role FROM project_members/.test(s)) {
                return { rows: role ? [{ role }] : [] };
            }
            if (/SELECT COUNT\(\*\) AS cnt/.test(s)) return { rows: [{ cnt: '1' }] };
            if (/INSERT INTO project_versions/.test(s)) {
                return { rows: [{ id: 'ver-1', project_id: PROJECT, label: 'v', element_count: 0 }] };
            }
            return { rows: [], rowCount: 0 };
        });
        return store.createVersionTransactional({
            versionId: 'ver-1', projectId: PROJECT, projectName, userId,
            label: 'v', snapshot: {}, elementCount: 0,
            idempotencyKey: 'k1', maxVersions: -1, plan: 'free',
        } as any);
    }

    const sqlsIssued = () => mockClientQuery.mock.calls.map(c => String(c[0]));

    it('(d) a team_member CAN save a project shared with them', async () => {
        // FAILED BEFORE §SHARE101 with ProjectConflictError "owned by a different
        // user — save rejected". This is the defect that made sharing worthless.
        await expect(saveAs(MEMBER, 'team_member')).resolves.toBeTruthy();
        expect(sqlsIssued().some(s => /INSERT INTO project_versions/.test(s))).toBe(true);
    });

    it('(d) a lead_appointed CAN save', async () => {
        await expect(saveAs(MEMBER, 'lead_appointed')).resolves.toBeTruthy();
    });

    it('(d) a VIEWER cannot save — read rights are not write rights', async () => {
        await expect(saveAs(MEMBER, 'viewer')).rejects.toThrow(/does not carry edit rights/);
    });

    it('(d) an appointing_party cannot save — it approves, it does not author', async () => {
        await expect(saveAs(MEMBER, 'appointing_party')).rejects.toThrow(/does not carry edit rights/);
    });

    it('(b) a NON-MEMBER still cannot save, and is told a different thing than a viewer is', async () => {
        // ABSENT vs FORBIDDEN are different failures with opposite fixes: "ask for
        // an invite" vs "ask for a higher role". Collapsing them into one message
        // is the C01 §6 rule 6 defect this codebase keeps re-finding.
        await expect(saveAs(STRANGER, null)).rejects.toThrow(/not a member of it/);
    });

    it('the owner still saves without any membership lookup at all', async () => {
        await expect(saveAs(OWNER, null)).resolves.toBeTruthy();
        expect(sqlsIssued().some(s => /SELECT role FROM project_members/.test(s))).toBe(false);
    });

    it('a member\'s save cannot RENAME the project — no owner power is granted', async () => {
        // A rename smuggled inside an autosave: the member opens the project with a
        // stale local title and the owner's project silently takes that name.
        await saveAs(MEMBER, 'team_member', 'Renamed By Member');
        expect(sqlsIssued().some(s => /UPDATE projects SET name/.test(s))).toBe(false);
    });

    it('the OWNER can still rename via save — the pre-existing behaviour is intact', async () => {
        await saveAs(OWNER, null, 'Renamed By Owner');
        expect(sqlsIssued().some(s => /UPDATE projects SET name/.test(s))).toBe(true);
    });

    it('the role is read INSIDE the locking transaction, not before it', async () => {
        // A role revoked concurrently must not be usable by an in-flight save. The
        // membership read must be serialised by the same FOR UPDATE that guards the
        // version count — i.e. issued on the transaction client, never the pool.
        await saveAs(MEMBER, 'team_member');
        expect(sqlsIssued().some(s => /SELECT role FROM project_members/.test(s))).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
