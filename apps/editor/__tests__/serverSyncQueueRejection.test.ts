// @vitest-environment happy-dom
//
// §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310)
// §FIX-QUEUE-CAP-SILENT-EVICTION            (L-1312)
// §FIX-LEGACY-UUID-PROJECT-ID-UNSAVABLE     (L-1311)
//
// ─── WHAT THIS SUITE HAS TO FALSIFY ─────────────────────────────────────────
//
// The founder had ~50 projects that existed only in local IndexedDB. The reason
// was not that their uploads were pending. It was that `ServerSyncQueue`
//   • DELETED the payload of any 4xx,
//   • EMPTIED the entire queue on a plan-gating 401/403, and
//   • LATCHED a session-wide flag that made every later `enqueue()` a no-op.
// On the free plan the server's version limit is 1 PER PROJECT, so the second
// save of the first project tripped all three.
//
// ⭐ THE CENTRAL ASSERTION IS THE FIRST TEST, AND IT IS A SEPARATING ONE: after a
// plan-gating 403 about project A, a save of project B must still reach the
// server. On the pre-fix code no request was made for B at all — `enqueue()`
// returned before touching the network, and `attemptSync` is the only client-side
// POST to `/api/projects/:id/versions` in the repo. So a green here is not
// decoration; a regression turns it red.
//
// ─── ON CONSTRUCTING THE FAILING STATE RATHER THAN SIMULATING IT ────────────
//
// Lane LOG1 nearly shipped a green suite over a hazard it never reproduced,
// because happy-dom has no IndexedDB and the seeding quietly took a fallback
// path where the defect could not occur. The equivalent trap here would be
// stubbing `persistQueue`/`attemptSync` and then asserting about a queue that no
// real response ever touched. So: `attemptSync` is NEVER stubbed. Every block in
// this file is produced by feeding `attemptSync` a real `Response`-shaped object
// with a real server body — including the exact `{ code: 'version_limit_reached',
// plan: 'free', limit: 1 }` that `server/errors.js` `handleProjectApiError`
// serialises for `VersionLimitError`, and the exact
// `{ error: 'Invalid project ID format', code: 'invalid_id' }` that
// `server.js:3565` returns. Only `scheduleFlush` is neutralised, and only so the
// assertions are not racing a timer.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A programmable server. `next` is consulted per request so one queue can be
 * driven through "reject this project / accept that one" in a single flush —
 * which is precisely the scenario the old latch made impossible.
 */
const server = vi.hoisted(() => ({
    calls: [] as Array<{ url: string; projectId: string }>,
    reply: (_projectId: string): { status: number; body: unknown } => ({ status: 201, body: {} }),
}));

vi.mock('@pryzm/core-app-model', () => ({
    apiFetch: vi.fn(async (url: string) => {
        const projectId = /\/api\/projects\/(.+?)\/versions/.exec(url)?.[1] ?? '';
        server.calls.push({ url, projectId });
        const { status, body } = server.reply(projectId);
        return { status, ok: status >= 200 && status < 300, json: async () => body };
    }),
}));

import { apiFetch } from '@pryzm/core-app-model';
import { ServerSyncQueue, type SaveBlock } from '../src/ui/platform/ServerSyncQueue.js';
import { decideRejectionFate } from '../src/ui/platform/serverSaveRejectionFate.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

// ── The REAL server bodies, copied from the routes that emit them ────────────

/** `server/errors.js` handleProjectApiError ← VersionLimitError (403). */
const FREE_PLAN_LIMIT_BODY = {
    error: 'Version limit of 1 reached for plan "free"',
    code: 'version_limit_reached',
    plan: 'free',
    limit: 1,
    current: 1,
};
/** `server.js` POST /api/projects/:id/versions, the `maxVersions === 0` arm. */
const NO_VERSION_HISTORY_BODY = {
    error: 'Version history is not available on your current plan.',
    plan: 'free',
    upgrade: 'architect',
};
/** `server.js:3565` — the legacy `proj-<uuid>` refusal. */
const INVALID_ID_BODY = { error: 'Invalid project ID format', code: 'invalid_id' };

function makeVersion(id: string, projectId: string): VersionRecord {
    return {
        id,
        projectId,
        label: `label-${id}`,
        timestamp: Date.now(),
        elementCount: 1,
        snapshot: { projectName: 'P', elementCount: 1, blob: 'x' } as unknown,
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

/** Build a queue whose timers are inert but whose network path is entirely real. */
function makeQueue(opts: {
    onSyncStatusChange?: (v: string, p: string, s: string) => void;
    onSaveRejected?: (status: number, body: Record<string, unknown>) => void;
    onQueueOverflow?: (v: VersionRecord, p: string, n: number) => void;
} = {}) {
    const q = new ServerSyncQueue(opts as never);
    // Only the CLOCK is neutralised. attemptSync, the 4xx policy, the block
    // bookkeeping and persistQueue all run for real.
    (q as unknown as { scheduleFlush: (ms: number) => void }).scheduleFlush = () => { };
    return q;
}

const flush = (q: ServerSyncQueue) => (q as unknown as { flush: () => Promise<void> }).flush();
const rawQueue = (q: ServerSyncQueue) =>
    (q as unknown as { queue: Array<{ version: VersionRecord; projectId: string; attemptCount: number; blocked?: SaveBlock }> }).queue;

describe('ServerSyncQueue — a rejected save is retained, scoped and surfaced (L-1310)', () => {
    beforeEach(() => {
        server.calls = [];
        server.reply = () => ({ status: 201, body: {} });
        (apiFetch as unknown as { mockClear: () => void }).mockClear();
        const store: Record<string, string> = {};
        Object.defineProperty(globalThis, 'localStorage', {
            value: {
                getItem: (k: string) => (k in store ? store[k] : null),
                setItem: (k: string, v: string) => { store[k] = v; },
                removeItem: (k: string) => { delete store[k]; },
                clear: () => { for (const k of Object.keys(store)) delete store[k]; },
            },
            configurable: true, writable: true,
        });
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    afterEach(() => { vi.restoreAllMocks(); });

    // ⭐ THE SEPARATING TEST. Pre-fix this failed at the final expect: after the
    // 403 the queue was emptied and every later enqueue short-circuited, so
    // project B never produced a request for the rest of the session.
    it('a plan 403 about ONE project does not stop a DIFFERENT project reaching the server', async () => {
        const q = makeQueue();

        server.reply = (projectId) => projectId === 'proj-1746000000000-aaaaa'
            ? { status: 403, body: FREE_PLAN_LIMIT_BODY }
            : { status: 201, body: {} };

        q.enqueue(makeVersion('ver-a', 'proj-1746000000000-aaaaa'), 'proj-1746000000000-aaaaa');
        await flush(q);

        expect(q.isPlanRejected('proj-1746000000000-aaaaa')).toBe(true);
        // The refusal was about ONE project. It must not have become session-wide.
        expect(q.isPlanRejected()).toBe(false);
        expect(q.isPlanRejected('proj-1746000000000-bbbbb')).toBe(false);

        server.calls = [];
        q.enqueue(makeVersion('ver-b', 'proj-1746000000000-bbbbb'), 'proj-1746000000000-bbbbb');
        await flush(q);

        // ⭐ The whole point: a save DID reach the server after the rejection.
        expect(server.calls.map(c => c.projectId)).toEqual(['proj-1746000000000-bbbbb']);
        q.dispose();
    });

    it('the rejected payload is RETAINED and enumerable, never discarded', async () => {
        const statuses: Array<[string, string]> = [];
        const q = makeQueue({ onSyncStatusChange: (v, _p, s) => statuses.push([v, s]) });

        server.reply = () => ({ status: 403, body: FREE_PLAN_LIMIT_BODY });
        q.enqueue(makeVersion('ver-a', 'proj-1746000000000-aaaaa'), 'proj-1746000000000-aaaaa');
        await flush(q);

        // The item is STILL in the queue, with its snapshot, carrying the reason.
        const items = rawQueue(q);
        expect(items).toHaveLength(1);
        expect(items[0].version.snapshot).toBeTruthy();
        expect(items[0].blocked?.code).toBe('plan-version-limit');
        expect(items[0].blocked?.scope).toBe('this-project');
        expect(items[0].blocked?.retryable).toBe('on-plan-change');

        // …and it is listable, which is what makes "did not reach the server"
        // something a user can be shown rather than something only a log knows.
        const blocked = q.getBlockedSaves();
        expect(blocked).toHaveLength(1);
        expect(blocked[0].versionId).toBe('ver-a');
        expect(blocked[0].block.message).toMatch(/plan version limit/i);

        expect(statuses).toContainEqual(['ver-a', 'local-only']);
        q.dispose();
    });

    it('a 403 does not empty the queue: unrelated pending uploads survive and still flush', async () => {
        const q = makeQueue();

        // Two projects queued BEFORE any rejection — the exact backlog the old
        // `this.queue = []` destroyed.
        server.reply = () => ({ status: 500, body: {} });     // keep both pending
        q.enqueue(makeVersion('ver-a', 'proj-1746000000000-aaaaa'), 'proj-1746000000000-aaaaa');
        q.enqueue(makeVersion('ver-c', 'proj-1746000000000-ccccc'), 'proj-1746000000000-ccccc');
        expect(rawQueue(q)).toHaveLength(2);

        // Now A is refused by the plan gate.
        server.reply = (projectId) => projectId === 'proj-1746000000000-aaaaa'
            ? { status: 403, body: NO_VERSION_HISTORY_BODY }
            : { status: 500, body: {} };
        await flush(q);

        const items = rawQueue(q);
        expect(items).toHaveLength(2);                                   // nothing deleted
        expect(items.find(i => i.version.id === 'ver-a')?.blocked?.code).toBe('plan-version-limit');
        expect(items.find(i => i.version.id === 'ver-c')?.blocked).toBeUndefined();  // untouched

        // C is still ACTIVE, so it is still attempted.
        server.calls = [];
        server.reply = () => ({ status: 201, body: {} });
        for (const i of items) i.attemptCount = 0;
        (q as unknown as { queue: Array<{ nextAttemptAt: number }> }).queue.forEach(i => { i.nextAttemptAt = 0; });
        await flush(q);
        expect(server.calls.map(c => c.projectId)).toEqual(['proj-1746000000000-ccccc']);
        q.dispose();
    });

    it('401 blocks the whole session but still retains every payload, and sign-in releases them', async () => {
        const q = makeQueue();
        server.reply = () => ({ status: 401, body: { error: 'Unauthorised' } });

        q.enqueue(makeVersion('ver-a', 'proj-1746000000000-aaaaa'), 'proj-1746000000000-aaaaa');
        q.enqueue(makeVersion('ver-c', 'proj-1746000000000-ccccc'), 'proj-1746000000000-ccccc');
        await flush(q);

        expect(q.isPlanRejected()).toBe(true);                 // genuinely session-wide
        expect(rawQueue(q)).toHaveLength(2);                   // …and nothing was thrown away
        expect(q.getBlockedSaves()).toHaveLength(2);
        expect(q.getBlockedSaves()[0].block.code).toBe('not-authenticated');

        // ⛔ Not a timer. The named EVENT happened, so the retained work is re-armed.
        server.reply = () => ({ status: 201, body: {} });
        const released = q.unblock('on-sign-in');
        expect(released).toBe(2);
        expect(q.isPlanRejected()).toBe(false);

        server.calls = [];
        (q as unknown as { queue: Array<{ nextAttemptAt: number }> }).queue.forEach(i => { i.nextAttemptAt = 0; });
        await flush(q);
        expect(server.calls.map(c => c.projectId).sort()).toEqual(
            ['proj-1746000000000-aaaaa', 'proj-1746000000000-ccccc'],
        );
        expect(rawQueue(q)).toHaveLength(0);                   // only a 2xx removes an item
        q.dispose();
    });

    it('a blocked item is never re-sent — refuse+retain must not become a retry loop', async () => {
        const q = makeQueue();
        server.reply = () => ({ status: 403, body: FREE_PLAN_LIMIT_BODY });
        q.enqueue(makeVersion('ver-a', 'proj-1746000000000-aaaaa'), 'proj-1746000000000-aaaaa');
        await flush(q);
        expect(server.calls).toHaveLength(1);

        for (let i = 0; i < 5; i++) {
            (q as unknown as { queue: Array<{ nextAttemptAt: number }> }).queue.forEach(x => { x.nextAttemptAt = 0; });
            await flush(q);
        }
        expect(server.calls).toHaveLength(1);   // still one. A "no" is not retried.
        q.dispose();
    });

    it('429 is a NON-answer: retried with backoff, not blocked and not discarded', async () => {
        const q = makeQueue();
        server.reply = () => ({ status: 429, body: { error: 'Too many requests' } });
        q.enqueue(makeVersion('ver-a', 'proj-1746000000000-aaaaa'), 'proj-1746000000000-aaaaa');
        await flush(q);

        const items = rawQueue(q);
        expect(items).toHaveLength(1);
        expect(items[0].blocked).toBeUndefined();       // NOT terminal
        expect(items[0].attemptCount).toBe(1);          // counted for backoff
        expect(q.isPlanRejected('proj-1746000000000-aaaaa')).toBe(false);
        q.dispose();
    });

    // The legacy `proj-<uuid>` family: 400 forever, and — before L-1310 — with no
    // user-visible surface whatsoever, because the host only reacted to 401/403.
    it('a 400 invalid_id blocks that project, is never retried, and IS surfaced', async () => {
        const rejections: Array<{ status: number; body: Record<string, unknown> }> = [];
        const q = makeQueue({ onSaveRejected: (status, body) => rejections.push({ status, body }) });

        server.reply = () => ({ status: 400, body: INVALID_ID_BODY });
        const legacyId = 'proj-3f0e8c1a-9b2d-4e5f-8a7b-1c2d3e4f5a6b';
        q.enqueue(makeVersion('ver-a', legacyId), legacyId);
        await flush(q);

        expect(rawQueue(q)[0].blocked?.code).toBe('project-id-not-savable');
        expect(rawQueue(q)[0].blocked?.retryable).toBe('never');
        expect(q.isPlanRejected(legacyId)).toBe(true);
        expect(q.isPlanRejected()).toBe(false);                     // one project, not the session

        // ⭐ The surface fired. Pre-fix, `_handleServerSaveRejected` returned early
        // for anything that was not 401/403, so this class of failure was silent.
        expect(rejections).toHaveLength(1);
        expect(rejections[0].status).toBe(400);
        expect(rejections[0].body.blockedCode).toBe('project-id-not-savable');

        // A later save of the SAME project inherits the block without a round-trip…
        server.calls = [];
        q.enqueue(makeVersion('ver-b', legacyId), legacyId);
        await flush(q);
        expect(server.calls).toHaveLength(0);
        // …but it is still RETAINED, not dropped, and it is still reported.
        expect(rawQueue(q)).toHaveLength(2);
        expect(rejections).toHaveLength(2);
        q.dispose();
    });
});

describe('ServerSyncQueue — the cap no longer evicts silently (L-1312)', () => {
    beforeEach(() => {
        server.calls = [];
        server.reply = () => ({ status: 500, body: {} });   // never drain the queue
        const store: Record<string, string> = {};
        Object.defineProperty(globalThis, 'localStorage', {
            value: {
                getItem: (k: string) => (k in store ? store[k] : null),
                setItem: (k: string, v: string) => { store[k] = v; },
                removeItem: (k: string) => { delete store[k]; },
                clear: () => { for (const k of Object.keys(store)) delete store[k]; },
            },
            configurable: true, writable: true,
        });
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });
    afterEach(() => { vi.restoreAllMocks(); });

    const CEILING = 250;

    it('past the ceiling with nothing superseded: REFUSES the new item, evicts nobody', () => {
        const overflow: Array<{ id: string; n: number }> = [];
        const q = makeQueue({ onQueueOverflow: (v, _p, n) => overflow.push({ id: v.id, n }) });

        // 250 distinct projects — the shape of a bulk re-save of ~50+ projects,
        // where every queued item is the only queued version of its project and
        // therefore none of them is redundant.
        for (let i = 0; i < CEILING; i++) {
            const pid = `proj-17460000000${String(i).padStart(2, '0')}-aaaaa`;
            q.enqueue(makeVersion(`ver-${i}`, pid), pid);
        }
        expect(rawQueue(q)).toHaveLength(CEILING);
        const idsBefore = rawQueue(q).map(i => i.version.id);

        q.enqueue(makeVersion('ver-new', 'proj-1746000009999-zzzzz'), 'proj-1746000009999-zzzzz');

        // The oldest item is STILL THERE. The old code did `this.queue.shift()`
        // behind a console.warn — a bulk re-save evicted its own backlog.
        expect(rawQueue(q).map(i => i.version.id)).toEqual(idsBefore);
        expect(overflow).toEqual([{ id: 'ver-new', n: CEILING }]);
        q.dispose();
    });

    it('past the ceiling WITH a superseded item: reclaims that one and accepts the new save', () => {
        const overflow: string[] = [];
        const q = makeQueue({ onQueueOverflow: (v) => overflow.push(v.id) });

        // One project contributes two versions — the older is genuinely redundant.
        const dup = 'proj-1746000000000-dupdup';
        q.enqueue(makeVersion('ver-dup-old', dup), dup);
        for (let i = 0; i < CEILING - 2; i++) {
            const pid = `proj-17460000000${String(i).padStart(2, '0')}-aaaaa`;
            q.enqueue(makeVersion(`ver-${i}`, pid), pid);
        }
        q.enqueue(makeVersion('ver-dup-new', dup), dup);
        expect(rawQueue(q)).toHaveLength(CEILING);

        q.enqueue(makeVersion('ver-new', 'proj-1746000009999-zzzzz'), 'proj-1746000009999-zzzzz');

        const ids = rawQueue(q).map(i => i.version.id);
        expect(ids).toContain('ver-new');
        expect(ids).toContain('ver-dup-new');
        expect(ids).not.toContain('ver-dup-old');   // the redundant one, and only it
        expect(overflow).toEqual([]);
        q.dispose();
    });

    it('a restored over-ceiling queue keeps the NEWEST items, not the oldest', () => {
        const q = makeQueue();
        const items = Array.from({ length: CEILING + 5 }, (_, i) => ({
            version: makeVersion(`ver-${i}`, `proj-1746000000000-aaaaa`),
            projectId: 'proj-1746000000000-aaaaa',
            attemptCount: 0,
            nextAttemptAt: 0,
        }));

        (q as unknown as { _applyPersistedQueue: (raw: string) => void })
            ._applyPersistedQueue(JSON.stringify(items));

        const kept = rawQueue(q).map(i => i.version.id);
        expect(kept).toHaveLength(CEILING);
        // WAS `slice(0, 50)` — kept the OLDEST and dropped everything newer, the
        // exact inversion of which snapshot matters.
        expect(kept[kept.length - 1]).toBe(`ver-${CEILING + 4}`);
        expect(kept).not.toContain('ver-0');
        q.dispose();
    });
});

describe('decideRejectionFate — the policy has no destructive arm', () => {
    it('never returns a discard action for any status', () => {
        for (const status of [400, 401, 402, 403, 404, 409, 410, 412, 418, 422, 429, 500, 503]) {
            const fate = decideRejectionFate(status, {});
            expect(['retry', 'block']).toContain(fate.action);
        }
    });

    it('scopes a plan refusal to the project and an auth refusal to the session', () => {
        const plan = decideRejectionFate(403, FREE_PLAN_LIMIT_BODY);
        expect(plan).toMatchObject({ action: 'block', scope: 'this-project', code: 'plan-version-limit' });

        const auth = decideRejectionFate(401, {});
        expect(auth).toMatchObject({ action: 'block', scope: 'this-session', code: 'not-authenticated' });

        // A validation failure is about THIS payload only — the next save of the
        // same project must still be attempted.
        const bad = decideRejectionFate(400, { error: 'Invalid snapshot payload', issues: ['x'] });
        expect(bad).toMatchObject({ action: 'block', scope: 'this-save', code: 'payload-invalid' });
    });
});
