/**
 * @file server/__tests__/eventLog.test.ts
 *
 * L-406 (C08 §1.2 + §2.2) — POST /api/event-log auth + anti-spoof enforcement.
 *
 * The event-log route was an UNAUTHENTICATED mutating write that trusted
 * `audit.actorId` / `audit.projectId` from the request body — letting any
 * caller forge an audit row attributed to another user in another tenant's
 * project. These tests pin the fix:
 *   1. Anonymous callers are rejected 401 and NOTHING is persisted.
 *   2. The persisted actor is the SESSION user — a body-supplied actorId is
 *      ignored (actor-spoof closed).
 *   3. A project-scoped event that fails the membership gate is rejected 403
 *      and NOTHING is persisted (cross-tenant write closed).
 *   4. The membership gate is consulted with the SESSION actor + the requested
 *      projectId, and an authorized write is persisted with session identity.
 *   5. A global (no-project) event skips the membership gate but is still
 *      attributed only to the authenticated caller.
 *
 * Mirrors the server/leads.test.ts extraction pattern: mount the exported
 * handler on a throwaway express app with a stub authMiddleware + injected
 * membership gate / persistence sink, and drive it over real HTTP.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { EVENT_LOG_PATH, makeEventLogHandler } from '../eventLog.js';

// ── Test harness ────────────────────────────────────────────────────────────

interface PersistedRow {
    id: string;
    actorId: string;
    projectId: string;
    clientId: string;
    commandType: string;
    timestamp: string;
    payload: unknown;
}

const persisted: PersistedRow[] = [];
const requireAccessCalls: Array<{ userId: string; projectId: string }> = [];
// Configurable per-test: when it returns false the handler must NOT persist.
let allowAccess = true;

/** Stub of _httpRequireAccess: records the call, and on deny writes 403 itself. */
async function stubRequireAccess(userId: string, projectId: string, res: express.Response): Promise<boolean> {
    requireAccessCalls.push({ userId, projectId });
    if (allowAccess) return true;
    res.status(403).json({ error: 'Access denied to this project.', code: 'project_access_denied' });
    return false;
}

/** Fake authMiddleware: `x-test-user` header ⇒ that userId, else anonymous. */
function fakeAuth(req: express.Request, _res: express.Response, next: express.NextFunction): void {
    const u = req.header('x-test-user');
    (req as express.Request & { auth: { userId: string } }).auth = { userId: u && u.length ? u : 'anonymous' };
    next();
}

function buildApp(): express.Express {
    const app = express();
    app.use(express.json());
    app.post(
        EVENT_LOG_PATH,
        fakeAuth,
        makeEventLogHandler({
            requireAccess: stubRequireAccess,
            persistEvent: async (row) => { persisted.push(row as PersistedRow); },
        }),
    );
    return app;
}

function listen(app: express.Express): Promise<{ server: Server; url: string }> {
    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}
const close = (s: Server) => new Promise<void>((r) => s.close(() => r()));
/** Flush the microtask chain so the post-202 fire-and-forget persist runs. */
const flush = () => new Promise<void>((r) => setTimeout(r, 20));

async function post(url: string, body: unknown, user?: string) {
    return fetch(`${url}${EVENT_LOG_PATH}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(user ? { 'x-test-user': user } : {}),
        },
        body: JSON.stringify(body),
    });
}

describe('POST /api/event-log — L-406 auth + anti-spoof (C08 §1.2/§2.2)', () => {
    beforeEach(() => {
        persisted.length = 0;
        requireAccessCalls.length = 0;
        allowAccess = true;
    });

    it('T01 — anonymous (no session) is rejected 401 and nothing is persisted', async () => {
        const { server, url } = await listen(buildApp());
        try {
            const r = await post(url, {
                id: 'ev-1', type: 'wall.create',
                audit: { actorId: 'victim', projectId: 'projX' },
            }); // no x-test-user ⇒ anonymous
            expect(r.status).toBe(401);
            expect((await r.json()).code).toBe('auth_required');
            await flush();
            expect(persisted).toHaveLength(0);
            expect(requireAccessCalls).toHaveLength(0);
        } finally {
            await close(server);
        }
    });

    it('T02 — body-supplied actorId is ignored; the SESSION user is persisted', async () => {
        const { server, url } = await listen(buildApp());
        try {
            const r = await post(url, {
                id: 'ev-2', type: 'wall.create',
                audit: { actorId: 'attacker-spoof', /* no projectId ⇒ global */ },
                payload: { a: 1 },
            }, 'userA');
            expect(r.status).toBe(202);
            await flush();
            expect(persisted).toHaveLength(1);
            expect(persisted[0].actorId).toBe('userA');       // session, not 'attacker-spoof'
            expect(persisted[0].projectId).toBe('');           // global event
            expect(persisted[0].payload).toEqual({ a: 1 });
        } finally {
            await close(server);
        }
    });

    it('T03 — cross-tenant project (membership gate denies) → 403, nothing persisted', async () => {
        allowAccess = false;
        const { server, url } = await listen(buildApp());
        try {
            const r = await post(url, {
                id: 'ev-3', type: 'wall.create',
                audit: { projectId: 'tenantB-project' },
            }, 'userA');
            expect(r.status).toBe(403);
            expect((await r.json()).code).toBe('project_access_denied');
            await flush();
            // gate consulted with SESSION actor + requested project…
            expect(requireAccessCalls).toEqual([{ userId: 'userA', projectId: 'tenantB-project' }]);
            // …and the write never happened.
            expect(persisted).toHaveLength(0);
        } finally {
            await close(server);
        }
    });

    it('T04 — authorized project write is persisted with session identity', async () => {
        allowAccess = true;
        const { server, url } = await listen(buildApp());
        try {
            const r = await post(url, {
                id: 'ev-4', type: 'door.move',
                audit: { actorId: 'ignored', projectId: 'projA', clientId: 'c-1' },
            }, 'ownerA');
            expect(r.status).toBe(202);
            await flush();
            expect(requireAccessCalls).toEqual([{ userId: 'ownerA', projectId: 'projA' }]);
            expect(persisted).toHaveLength(1);
            expect(persisted[0]).toMatchObject({
                id: 'ev-4', actorId: 'ownerA', projectId: 'projA',
                clientId: 'c-1', commandType: 'door.move',
            });
        } finally {
            await close(server);
        }
    });

    it('T05 — global (no-project) event skips the membership gate', async () => {
        const { server, url } = await listen(buildApp());
        try {
            const r = await post(url, { id: 'ev-5', type: 'view.pan', audit: {} }, 'userA');
            expect(r.status).toBe(202);
            await flush();
            expect(requireAccessCalls).toHaveLength(0); // no projectId ⇒ gate skipped
            expect(persisted).toHaveLength(1);
            expect(persisted[0].actorId).toBe('userA');
        } finally {
            await close(server);
        }
    });
});
