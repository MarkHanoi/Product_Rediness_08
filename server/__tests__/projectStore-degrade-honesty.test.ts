/**
 * server/__tests__/projectStore-degrade-honesty.test.ts
 *
 * §FIX-DEGRADE-HONESTY (L-789) — a failed durable write must NOT be reported as
 * a success.
 *
 * THE DEFECT THIS LOCKS OUT
 * -------------------------
 * `§SERVER-PG-DEGRADE` (2026-05-23) made `createProject` and `deleteProject`
 * catch ANY PostgreSQL error and complete the operation against the volatile
 * `_inMemoryProjects` map instead, returning a normal-looking row. The user saw
 * HTTP 201, the project appeared in the hub, and it evaporated on the next
 * deploy. The delete path was worse: its own comment concedes that on a
 * foreign-key violation the PG row SURVIVES, so a "successful" delete reappears
 * on the next PG-backed list.
 *
 * That is the §CONTEXT-DATA-HONESTY failure — a refusal and a success carrying
 * the same value — in the WRITE path, where it costs data rather than a
 * confusing read. It is also worse precisely when it matters most: load is what
 * produces the transient pooler errors it swallows.
 *
 * WHY THE FALLBACK IS KEPT AT ALL
 * -------------------------------
 * It was introduced for a real reason (Round 40): a developer with a
 * misconfigured pool could not create a project at all, and was blocked for
 * fifteen rounds. That value is real in DEVELOPMENT and worthless in
 * PRODUCTION, where the only thing it buys is a lie. So the fix is a gate, not
 * a deletion — and these tests pin BOTH sides of the gate, because a fix that
 * silently removed the dev affordance would be its own regression.
 *
 * NOTE ON THE NO-POOL PATH: when no pool is configured at all, the in-memory
 * store is the legitimate, declared backend (dev / first boot) and is NOT a
 * degrade. These tests only exercise "a pool EXISTS and the write threw".
 *
 * Contract: C05 §1.1 (persistence client is the single write gateway).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the PG seam BEFORE importing the store ──────────────────────────────
// `_hasPool()` must be true (a pool EXISTS) while `query()` throws — that is the
// exact state §SERVER-PG-DEGRADE was written for and the only one under test.
const pgError = Object.assign(new Error('Connection terminated unexpectedly'), {
    code: '57P01',
});

const mockQuery = vi.fn();

vi.mock('../pgClient.js', () => ({
    getPgPool: () => ({ /* truthy — a pool exists */ }),
    query: (...args: unknown[]) => mockQuery(...args),
    withTransaction: vi.fn(),
}));

let projectStore: typeof import('../projectStore.js');

let _seq = 0;
const uid = (p: string) => `${p}-${Date.now()}-${(_seq++).toString(36)}`;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockRejectedValue(pgError);
    projectStore = await import('../projectStore.js');
});

afterEach(() => {
    // Restore rather than delete — some runners treat an absent NODE_ENV as
    // production, which would leak this test's gate state into its neighbours.
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    vi.restoreAllMocks();
});

describe('§FIX-DEGRADE-HONESTY (L-789) — production refuses instead of lying', () => {
    it('createProject REJECTS when the durable write fails', async () => {
        process.env.NODE_ENV = 'production';
        await expect(
            projectStore.createProject('Doomed Project', uid('user')),
        ).rejects.toThrow(/terminated/i);
    });

    it('createProject leaves NO in-memory shadow behind after a failed write', async () => {
        process.env.NODE_ENV = 'production';
        const owner = uid('user');
        await projectStore.createProject('Doomed Project', owner).catch(() => { /* expected */ });

        // The whole point: a refused create must not leave a row that a later
        // list / open / access-check can resolve. A shadow row is the lie in a
        // different disguise.
        expect(projectStore.imListProjects(owner)).toHaveLength(0);
    });

    it('the rejected error keeps its SQL state so the route can classify it', async () => {
        process.env.NODE_ENV = 'production';
        // handleProjectApiError() maps 57P01 to a retryable 503 rather than an
        // opaque 500. Swallowing or re-wrapping the error would destroy that,
        // and the client's ServerSyncQueue distinguishes 5xx-retryable from
        // 4xx-terminal by exactly this classification.
        await expect(
            projectStore.createProject('Doomed Project', uid('user')),
        ).rejects.toMatchObject({ code: '57P01' });
    });

    it('deleteProject REJECTS rather than reporting a delete that did not happen', async () => {
        process.env.NODE_ENV = 'production';
        await expect(
            projectStore.deleteProject(uid('proj'), uid('user')),
        ).rejects.toThrow(/terminated/i);
    });

    it('deleteProject does not report success for a row that may still exist in PG', async () => {
        process.env.NODE_ENV = 'production';
        // The FK-violation case the old comment described: PG keeps the row, the
        // client is told it is gone, and it reappears on the next list. `false`
        // would be almost as bad as `true` here — "not deleted" and "could not
        // tell" are different answers — so the contract is THROW.
        const result = await projectStore
            .deleteProject(uid('proj'), uid('user'))
            .then(() => 'resolved', () => 'rejected');
        expect(result).toBe('rejected');
    });
});

describe('§FIX-DEGRADE-HONESTY (L-789) — development keeps the unblocking fallback', () => {
    it('createProject still degrades to the in-memory store outside production', async () => {
        process.env.NODE_ENV = 'development';
        const owner = uid('user');
        const row = await projectStore.createProject('Dev Project', owner);

        expect(row).toMatchObject({ name: 'Dev Project', owner_id: owner });
        expect(projectStore.imListProjects(owner).map(p => p.id)).toContain(row.id);
    });

    it('deleteProject still degrades outside production', async () => {
        process.env.NODE_ENV = 'development';
        const owner = uid('user');
        const row = await projectStore.createProject('Dev Project', owner);
        await expect(projectStore.deleteProject(row.id, owner)).resolves.toBe(true);
        expect(projectStore.imGetProject(row.id)).toBeNull();
    });

    it('the gate is read per CALL, not captured at module load', async () => {
        // Flipping NODE_ENV between two calls to the SAME loaded module must
        // change behaviour. A module-load-time constant would make the
        // production gate depend on import order — untestable, and silently
        // wrong under any runner that sets NODE_ENV late.
        process.env.NODE_ENV = 'development';
        await expect(projectStore.createProject('A', uid('user'))).resolves.toBeTruthy();

        process.env.NODE_ENV = 'production';
        await expect(projectStore.createProject('B', uid('user'))).rejects.toThrow();
    });
});
