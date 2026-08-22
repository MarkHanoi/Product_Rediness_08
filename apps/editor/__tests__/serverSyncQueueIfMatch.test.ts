// @vitest-environment happy-dom
//
// §FIX-IFMATCH-INVENTED-A-COUNT (L-5830) — the optimistic lock asserted a number
// nobody had ever told the client.
//
// ─── THE EVIDENCE ───────────────────────────────────────────────────────────
// From the founder's console, on a project he had merely clicked around in:
//
//     POST …/projects/proj-1787…c18c5/versions  412 (Precondition Failed)
//     [ServerSyncQueue] §L-B2-RECONCILE 412 for "Auto-save" — expected 1,
//     server has 746. Re-basing count + retrying once.
//
// "expected 1" is not a stale count. It is a MANUFACTURED one. `If-Match` is sent
// only when `_serverVersionCountByProject` holds an entry, and the sole writer of
// that entry on the success path was:
//
//     const prior = this._serverVersionCountByProject.get(projectId) ?? 0;
//     this._serverVersionCountByProject.set(projectId, prior + 1);
//
// `prior + 1` is a sound inference when `prior` came from the server — versions are
// append-only, one save adds one. `?? 0` turned "I have never been told this
// project's count" into "the server holds zero", so the first save of every session
// wrote a 1 into the cache and the SECOND save asserted `If-Match: "v1"` against a
// server holding 746. The precondition could not be true, the 412 was certain, and
// the reconcile-and-retry paid for it with a SECOND POST of the entire multi-MB
// snapshot body.
//
// ⭐ AND THE FALLBACK WAS NOT A FALLBACK — IT WAS THE ONLY PATH. The success handler
// looks for four spellings of a server-sent count (`versionCount`, `count`, `total`,
// `version.version_count`). `POST /api/projects/:id/versions` sends none of them
// from any of its three backends: `version_count` lives on the `projects` row, while
// every one of those return sites answers with a `project_versions` row. So the
// guess ran on every single successful save.
//
// ─── WHAT THESE TESTS FALSIFY ───────────────────────────────────────────────
// The first test is the separating one: a second save in a session must reach the
// server ONCE, with no `If-Match` at all. Pre-fix it sent `If-Match: "v1"`, took a
// 412, and issued a second POST. Asserting only "the save eventually succeeded"
// would have been green on the broken code — the reconcile made it succeed. The
// assertion is therefore on the REQUESTS: how many, and carrying what.
//
// ⛔ `attemptSync` is never stubbed. The mock is a programmable server that records
// every request's `If-Match` header and answers with the real 412 body shape that
// `server/errors.js` serialises for `PreconditionFailedError`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const server = vi.hoisted(() => ({
    requests: [] as Array<{ projectId: string; ifMatch: string | undefined }>,
    reply: (_projectId: string, _ifMatch: string | undefined): { status: number; body: unknown } =>
        ({ status: 201, body: {} }),
}));

vi.mock('@pryzm/core-app-model', () => ({
    apiFetch: vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        const projectId = /\/api\/projects\/(.+?)\/versions/.exec(url)?.[1] ?? '';
        const ifMatch = init?.headers?.['If-Match'];
        server.requests.push({ projectId, ifMatch });
        const { status, body } = server.reply(projectId, ifMatch);
        return { status, ok: status >= 200 && status < 300, json: async () => body };
    }),
}));

import { apiFetch } from '@pryzm/core-app-model';
import { ServerSyncQueue } from '../src/ui/platform/ServerSyncQueue.js';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes.js';

const PROJECT = 'proj-1787150674754-fe43bbbc18c5';
/** The count the founder's server actually held. */
const SERVER_HAS = 746;

function makeVersion(id: string): VersionRecord {
    return {
        id, projectId: PROJECT, label: 'Auto-save', timestamp: Date.now(),
        elementCount: 264,
        snapshot: { projectName: 'P', elementCount: 264, blob: 'x' } as unknown,
        syncStatus: 'local-only',
    } as unknown as VersionRecord;
}

/** `server/errors.js` handleProjectApiError ← PreconditionFailedError (412). */
const preconditionBody = (expected: number) => ({
    error: 'Precondition Failed',
    code: 'precondition_failed',
    expected,
    actual: SERVER_HAS,
});

function makeQueue() {
    const q = new ServerSyncQueue({} as never);
    // Only the CLOCK is neutralised — attemptSync and the whole 412 policy run.
    (q as unknown as { scheduleFlush: (ms: number) => void }).scheduleFlush = () => { };
    return q;
}
const flush = (q: ServerSyncQueue) => (q as unknown as { flush: () => Promise<void> }).flush();

/** The server as it really behaves: append-only, honouring a precondition. */
function appendOnlyServer(): void {
    let count = SERVER_HAS;
    server.reply = (_projectId, ifMatch) => {
        if (ifMatch !== undefined) {
            const expected = Number(ifMatch.replace(/[^0-9]/g, ''));
            if (expected !== count) return { status: 412, body: preconditionBody(expected) };
        }
        count += 1;
        // ⚠ Modelled faithfully: the real route answers with a `project_versions`
        // row and NO count, which is the whole reason the client had to guess.
        return { status: 201, body: { version: { id: 'v', project_id: PROJECT } } };
    };
}

beforeEach(() => {
    server.requests = [];
    appendOnlyServer();
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

describe('§FIX-IFMATCH-INVENTED-A-COUNT (L-5830)', () => {
    it('⭐ the SECOND save of a session sends no If-Match and costs exactly ONE request', async () => {
        const q = makeQueue();

        q.enqueue(makeVersion('ver-1'), PROJECT);
        await flush(q);
        expect(server.requests.map(r => r.ifMatch)).toEqual([undefined]); // first save: correct today

        server.requests = [];
        q.enqueue(makeVersion('ver-2'), PROJECT);
        await flush(q);

        // ⭐ THE SEPARATING ASSERTION. Pre-fix this was
        //   ['"v1"', '"v746"']  — a 412 and a re-POST of the whole snapshot —
        // because the first save's response carried no count and `?? 0` invented
        // one. A test asserting only "the save succeeded" would have been GREEN on
        // the broken code: the reconcile made it succeed, at double the cost.
        expect(server.requests).toHaveLength(1);
        expect(server.requests[0]!.ifMatch).toBeUndefined();
        q.dispose();
    });

    it('⭐ ten saves in a row cost ten requests — no 412 ever fires', async () => {
        const q = makeQueue();
        for (let i = 0; i < 10; i++) {
            q.enqueue(makeVersion(`ver-${i}`), PROJECT);
            await flush(q);
        }
        // Pre-fix: 11 (the second save 412'd and retried), and the founder paid the
        // extra multi-MB POST for it.
        expect(server.requests).toHaveLength(10);
        expect(server.requests.every(r => r.ifMatch === undefined)).toBe(true);
        q.dispose();
    });

    it('an AUTHORITATIVE count from the server IS asserted on the next save', async () => {
        // The lock is not removed — it is made conditional on having been told. This
        // is the arm that goes live the moment a POST return site carries the count
        // (ISSUE-LOG L-5831); it is asserted now so that change lands on a tested
        // path rather than an assumed one.
        const q = makeQueue();
        let count = SERVER_HAS;
        server.reply = (_p, ifMatch) => {
            if (ifMatch !== undefined) {
                const expected = Number(ifMatch.replace(/[^0-9]/g, ''));
                if (expected !== count) return { status: 412, body: preconditionBody(expected) };
            }
            count += 1;
            return { status: 201, body: { versionCount: count } }; // ← authoritative
        };

        q.enqueue(makeVersion('ver-1'), PROJECT);
        await flush(q);
        server.requests = [];
        q.enqueue(makeVersion('ver-2'), PROJECT);
        await flush(q);

        expect(server.requests).toHaveLength(1);
        expect(server.requests[0]!.ifMatch).toBe(`"v${SERVER_HAS + 1}"`);
        q.dispose();
    });

    it('a 412 body\'s `actual` is authoritative, and `prior + 1` may build on it', async () => {
        // A REAL concurrent writer still produces a 412, the reconcile still adopts
        // the server's number and retries once, and the count learned that way is
        // authoritative — so the save AFTER it may legitimately assert `prior + 1`.
        const q = makeQueue();
        let count = SERVER_HAS;
        let firstCall = true;
        server.reply = (_p, ifMatch) => {
            if (firstCall) {
                // Someone else saved between our read and our write.
                firstCall = false;
                return { status: 412, body: preconditionBody(Number(ifMatch?.replace(/[^0-9]/g, '') ?? 0)) };
            }
            if (ifMatch !== undefined) {
                const expected = Number(ifMatch.replace(/[^0-9]/g, ''));
                if (expected !== count) return { status: 412, body: preconditionBody(expected) };
            }
            count += 1;
            return { status: 201, body: { version: { id: 'v' } } };
        };

        q.enqueue(makeVersion('ver-1'), PROJECT);
        await flush(q);
        // Reconciled: one refused attempt, one accepted retry carrying the server's
        // own number.
        expect(server.requests).toHaveLength(2);
        expect(server.requests[1]!.ifMatch).toBe(`"v${SERVER_HAS}"`);

        server.requests = [];
        q.enqueue(makeVersion('ver-2'), PROJECT);
        await flush(q);
        // `prior` is now server-sourced, so `prior + 1` is a real inference.
        expect(server.requests).toHaveLength(1);
        expect(server.requests[0]!.ifMatch).toBe(`"v${SERVER_HAS + 1}"`);
        q.dispose();
    });
});
