// apps/sync-server/__tests__/PgAuthz.test.ts — L-391 §4.1.
//
// ─── WHAT THIS SUITE HAS TO PROVE ───────────────────────────────────────────
//
// The same standard `WsAuth.test.ts` sets for authentication, applied to
// authorisation. A suite that seeds a member, joins, and stops would pass
// unchanged against `can() { return true }` — which is EXACTLY the code this
// change replaces. So every test is one of four kinds:
//
//   ① ADMIT   — a real member (and the owner, who has no membership row) is
//               allowed. Without this the gate could be `return false`.
//   ② REFUSE  — a non-member is refused, and the audit reason NAMES why.
//   ③ CLOSED  — the failure paths (no database, query throws, missing table,
//               unknown role) DENY. This is the arm that distinguishes an
//               authorization layer from a decoration: it is the behaviour
//               under fault, not under success.
//   ④ NO-LEAK — end-to-end through the real server: a refused upgrade
//               transports ZERO document bytes. Borrowed verbatim in intent
//               from `WsAuth.test.ts` §③, because a policy that returns `false`
//               while the socket is nonetheless attached to the room has
//               refused nothing.
//
// Every negative asserts a DISTINCT named reason. A regression that collapses
// `database-error` into `not-a-member` is a test failure here, not an
// equivalent outcome — that collapse is precisely how an outage would come to
// look like a wall of legitimate 403s.

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ulid } from 'ulid';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { ELEMENTS_NAMESPACE } from '@pryzm/sync-client';

import { PgAuthz, PG_AUTHZ_ROLE_MATRIX, type PgPoolLike } from '../src/authz/PgAuthz.js';
import { createAuthz } from '../src/authz/policies.js';
import type { AuthzDecision } from '../src/authz/MemoryAuthz.js';
import { createSyncServer, type SyncServerInstance } from '../src/index.js';
import { yjsProjectCache } from '../src/YjsProjectCache.js';
import { signSessionToken, REFUSAL_HEADER } from '../src/auth/index.js';

const SECRET = 'test-session-secret-do-not-use-anywhere-real';

// ─── A stub of the LIVE table, not of a convenient one ──────────────────────
//
// The stub answers the exact query `PgAuthz` issues against the exact shape
// `server/dbMigrate.js:120` creates: a `projects` row carrying `owner_id`, LEFT
// JOINed to a membership row carrying `role`. Modelling ownership separately
// from membership is not incidental — it is the trap that would have locked
// every project creator out of their own room.
interface Project { readonly ownerId: string }

class StubPool implements PgPoolLike {
  readonly projects = new Map<string, Project>();
  /** `${projectId}::${userId}` → role */
  readonly members = new Map<string, string>();
  readonly calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
  /** When set, every query throws it — the outage simulator. */
  failWith: Error | undefined;
  ended = false;

  addProject(projectId: string, ownerId: string): this {
    this.projects.set(projectId, { ownerId });
    return this;
  }

  addMember(projectId: string, userId: string, role: string): this {
    this.members.set(`${projectId}::${userId}`, role);
    return this;
  }

  async query(sql: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
    this.calls.push({ sql, params });
    if (this.failWith) throw this.failWith;
    if (/FROM project_members LIMIT/i.test(sql)) return { rows: [] };
    const projectId = params?.[0] as string;
    const userId = params?.[1] as string;
    const project = this.projects.get(projectId);
    if (!project) return { rows: [] };
    const role = this.members.get(`${projectId}::${userId}`);
    return { rows: [{ owner_id: project.ownerId, role: role ?? null }] };
  }

  async end(): Promise<void> { this.ended = true; }
}

/** Build a PgAuthz plus a decision-log, so every assertion can name the reason
 *  rather than settling for `false`. */
function mk(pool: PgPoolLike | (() => Promise<PgPoolLike | undefined>)): {
  authz: PgAuthz;
  decisions: AuthzDecision[];
} {
  const decisions: AuthzDecision[] = [];
  const authz = new PgAuthz({
    pool,
    onDecision: (d) => decisions.push(d),
    onWarn: () => undefined,
  });
  return { authz, decisions };
}

const last = (decisions: readonly AuthzDecision[]): AuthzDecision => {
  const d = decisions[decisions.length - 1];
  if (!d) throw new Error('no decision was recorded — the audit sink was never called');
  return d;
};

// ════════════════════════════════════════════════════════════════════════════
// ① ADMIT
// ════════════════════════════════════════════════════════════════════════════
describe('PgAuthz — ① admits the people who belong', () => {
  it('admits the PROJECT OWNER, who has no project_members row at all', async () => {
    // The single most dangerous bug this class could have shipped: membership is
    // stored in `project_members`, ownership in `projects.owner_id`, and nothing
    // writes an owner into the member table. A membership-only query locks every
    // user out of the project they created.
    const pool = new StubPool().addProject('p1', 'alice');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(true);
    expect(last(decisions).reason).toBe('owner');
  });

  it('admits a team_member on read, edit and lock', async () => {
    const pool = new StubPool().addProject('p1', 'alice').addMember('p1', 'bob', 'team_member');
    const { authz, decisions } = mk(pool);
    for (const action of ['projectRead', 'projectEdit', 'lockAcquire'] as const) {
      expect(await authz.can(action, { actor: { id: 'bob' }, projectId: 'p1' })).toBe(true);
    }
    // Reason parity with MemoryAuthz — callers and the audit pipeline must not
    // branch on which implementation is installed.
    expect(last(decisions).reason).toBe('member');
  });

  it('answers ownership AND membership in ONE round trip', async () => {
    // Not a style assertion. This runs on every socket upgrade; two queries
    // would double the load on the hottest authorization path in the service,
    // which is why `projectAccess.js` uses a LEFT JOIN and why this mirrors it.
    const pool = new StubPool().addProject('p1', 'alice').addMember('p1', 'bob', 'team_member');
    const { authz } = mk(pool);
    await authz.can('projectEdit', { actor: { id: 'bob' }, projectId: 'p1' });
    expect(pool.calls).toHaveLength(1);
    expect(pool.calls[0]!.sql).toMatch(/LEFT JOIN\s+project_members/i);
    expect(pool.calls[0]!.sql).toMatch(/p\.owner_id/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ② REFUSE — each with its own named reason
// ════════════════════════════════════════════════════════════════════════════
describe('PgAuthz — ② refuses, and says why', () => {
  it('refuses a verified stranger with `not-a-member`', async () => {
    const pool = new StubPool().addProject('p1', 'alice').addMember('p1', 'bob', 'team_member');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectEdit', { actor: { id: 'eve' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('not-a-member');
  });

  it('refuses a room naming a project that does not exist — `no-such-project`', async () => {
    // Under `memory-allow-by-default` an invented room name was created on
    // demand and joined. It also means "does not exist" and "not yours" are the
    // same answer on the wire, so room names are not an enumeration oracle.
    const { authz, decisions } = mk(new StubPool());
    expect(await authz.can('projectRead', { actor: { id: 'eve' }, projectId: 'p-nope' })).toBe(false);
    expect(last(decisions).reason).toBe('no-such-project');
  });

  it('refuses the anonymous actor WITHOUT touching the database', async () => {
    const pool = new StubPool().addProject('p1', 'alice');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectRead', { actor: { id: 'anonymous' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('anonymous-denied');
    expect(pool.calls).toHaveLength(0);
  });

  it('refuses a role the permission matrix does not recognise — `unknown-role`', async () => {
    // This is the assertion that catches the divergent `role DEFAULT 'editor'`
    // in the superseded `project-members.sql`. If that sketch schema were ever
    // the live one, users are refused LOUDLY rather than admitted by accident.
    const pool = new StubPool().addProject('p1', 'alice').addMember('p1', 'bob', 'editor');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectRead', { actor: { id: 'bob' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('unknown-role');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ②b PER-ACTION GRANULARITY — the capability claimed in §PGAUTHZ-ACTION-GRANULARITY
// ════════════════════════════════════════════════════════════════════════════
describe('PgAuthz — role granularity is real, not decorative', () => {
  it('a `viewer` may read but may NOT edit or lock', async () => {
    // Under MemoryAuthz a viewer was indistinguishable from an editor: the
    // action argument was accepted and never consulted.
    const pool = new StubPool().addProject('p1', 'alice').addMember('p1', 'val', 'viewer');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectRead', { actor: { id: 'val' }, projectId: 'p1' })).toBe(true);
    expect(await authz.can('projectEdit', { actor: { id: 'val' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('role-not-permitted');
    // A lock is a precursor to an edit; granting it to a role that cannot edit
    // is a denial-of-service surface (lock every element, release none).
    expect(await authz.can('lockAcquire', { actor: { id: 'val' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('role-not-permitted');
  });

  it('an `appointing_party` may read but not edit; `lead_appointed` may do both', async () => {
    const pool = new StubPool()
      .addProject('p1', 'alice')
      .addMember('p1', 'client', 'appointing_party')
      .addMember('p1', 'lead', 'lead_appointed');
    const { authz } = mk(pool);
    expect(await authz.can('projectRead', { actor: { id: 'client' }, projectId: 'p1' })).toBe(true);
    expect(await authz.can('projectEdit', { actor: { id: 'client' }, projectId: 'p1' })).toBe(false);
    expect(await authz.can('projectEdit', { actor: { id: 'lead' }, projectId: 'p1' })).toBe(true);
  });

  it('§PGAUTHZ-ROLE-MATRIX-MIRROR does not drift from server/permissions.js', async () => {
    // The matrix is mirrored rather than imported because `server/` is NOT in
    // the sync-server Docker image (see the §-comment). A mirror can drift, so
    // the drift is tested: this reads the BFF source off disk and compares.
    const src = readFileSync(
      fileURLToPath(new URL('../../../server/permissions.js', import.meta.url)),
      'utf8',
    );
    const rolesBlock = /export const ROLES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(src);
    expect(rolesBlock, 'server/permissions.js no longer declares ROLES in the expected shape').toBeTruthy();
    const bffRoles = [...rolesBlock![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect([...PG_AUTHZ_ROLE_MATRIX.roles]).toEqual(bffRoles);

    const editBlock = /edit_model:\s*\[([^\]]*)\]/.exec(src);
    expect(editBlock, 'server/permissions.js no longer declares edit_model').toBeTruthy();
    const bffEdit = [...editBlock![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect([...PG_AUTHZ_ROLE_MATRIX.editRoles].sort()).toEqual([...bffEdit].sort());
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ③ CLOSED UNDER FAILURE — the arm that matters most
// ════════════════════════════════════════════════════════════════════════════
describe('PgAuthz — ③ fails CLOSED', () => {
  it('DENIES when no database is configured — never allow-by-default', async () => {
    // The `WsAuthGate` idiom: a server that cannot check must not accept.
    // Contrast `createSoftLockStore`, which falls back to memory on the same
    // condition — correct for locks, catastrophic here.
    const { authz, decisions } = mk(async () => undefined);
    expect(await authz.can('projectRead', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(await authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('no-database-configured');
  });

  it('DENIES when the pool cannot be constructed at all', async () => {
    const { authz, decisions } = mk(async () => { throw new Error('ECONNREFUSED'); });
    expect(await authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('no-database-configured');
  });

  it('DENIES on a query error with `database-error` — DISTINCT from `not-a-member`', async () => {
    // The distinction is the point. Collapsing an outage into `not-a-member`
    // would hide a dead database inside a wall of legitimate-looking 403s; and
    // an authorization layer that OPENS under failure is worse than none,
    // because it is trusted.
    const pool = new StubPool().addProject('p1', 'alice');
    pool.failWith = new Error('connection terminated unexpectedly');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('database-error');
    expect(last(decisions).reason).not.toBe('not-a-member');
  });

  it('DENIES the OWNER too when the database is down — no fast path skips the check', async () => {
    // A tempting optimisation is to shortcut owners. There is no local evidence
    // of ownership: `owner_id` lives in the same row the failed query wanted.
    const pool = new StubPool().addProject('p1', 'alice');
    pool.failWith = new Error('pool timeout');
    const { authz } = mk(pool);
    expect(await authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
  });

  it('DENIES when project_members does not exist — a missing table is a fault, not a policy', async () => {
    const pool = new StubPool().addProject('p1', 'alice');
    pool.failWith = new Error('relation "project_members" does not exist');
    const { authz, decisions } = mk(pool);
    expect(await authz.can('projectRead', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
    expect(last(decisions).reason).toBe('database-error');
  });

  it('resolves the pool ONCE across many decisions — the hot path does not re-import pg', async () => {
    let resolutions = 0;
    const pool = new StubPool().addProject('p1', 'alice');
    const { authz } = mk(async () => { resolutions++; return pool; });
    for (let i = 0; i < 5; i++) {
      await authz.can('projectRead', { actor: { id: 'alice' }, projectId: 'p1' });
    }
    expect(resolutions).toBe(1);
  });

  it('probe() reports unreachability WITHOUT authorising anybody', async () => {
    const pool = new StubPool();
    pool.failWith = new Error('nope');
    const { authz } = mk(pool);
    const probe = await authz.probe();
    expect(probe.ok).toBe(false);
    expect(probe.reason).toMatch(/database-error/);
    const { authz: ok } = mk(new StubPool());
    expect((await ok.probe()).ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// The factory seam — `pg` must be selectable and must fail closed
// ════════════════════════════════════════════════════════════════════════════
describe('createAuthz — the `pg` mode', () => {
  it('selects PgAuthz on PRYZM_AUTHZ_MODE=pg with an injected pool', async () => {
    const pool = new StubPool().addProject('p1', 'alice');
    const r = createAuthz({ env: { PRYZM_AUTHZ_MODE: 'pg' }, pgPool: pool, onWarn: () => undefined });
    expect(r.selection).toBe('pg');
    expect(r.authz).toBeInstanceOf(PgAuthz);
    expect(await r.authz.can('projectEdit', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(true);
    expect(await r.authz.can('projectEdit', { actor: { id: 'eve' }, projectId: 'p1' })).toBe(false);
  });

  it('PRYZM_AUTHZ_MODE=pg with NO DATABASE_URL refuses everything — it does NOT fall back to memory', async () => {
    const r = createAuthz({ env: { PRYZM_AUTHZ_MODE: 'pg' }, onWarn: () => undefined });
    expect(r.selection).toBe('pg');
    expect(r.reason).toMatch(/fail-closed/);
    expect(await r.authz.can('projectRead', { actor: { id: 'alice' }, projectId: 'p1' })).toBe(false);
  });

  it('§PGAUTHZ-MODE-DEFAULT — the default is STILL memory-allow-by-default, deliberately', async () => {
    // This test exists to make the open decision VISIBLE rather than silent. It
    // is the tripwire for the follow-up commit: when the founder accepts the
    // recommendation in policies.ts, this assertion must be updated in the same
    // change that flips the default, so the flip cannot happen unnoticed.
    const r = createAuthz({ env: {} });
    expect(r.selection).toBe('memory-allow-by-default');
    expect(await r.authz.can('projectEdit', { actor: { id: 'anyone' }, projectId: 'any-room' })).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ④ END-TO-END + NO-LEAK — through the real server, the real upgrade gate
// ════════════════════════════════════════════════════════════════════════════
type Attempt =
  | { outcome: 'opened' }
  | { outcome: 'refused'; status: number; reason: string | undefined }
  | { outcome: 'error'; message: string };

function attempt(url: string): Promise<Attempt> {
  return new Promise<Attempt>((resolve) => {
    const ws = new WebSocket(url);
    const done = (a: Attempt): void => {
      try { ws.close(); } catch { /* already gone */ }
      resolve(a);
    };
    ws.on('open', () => done({ outcome: 'opened' }));
    ws.on('unexpected-response', (_req, res) => {
      const raw = res.headers[REFUSAL_HEADER.toLowerCase()];
      done({ outcome: 'refused', status: res.statusCode ?? 0, reason: Array.isArray(raw) ? raw[0] : raw });
    });
    ws.on('error', (err) => done({ outcome: 'error', message: String(err) }));
    setTimeout(() => done({ outcome: 'error', message: 'timeout' }), 5_000);
  });
}

async function until(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

const token = (sub: string): string =>
  signSessionToken({ sub, email: `${sub}@example.test`, secret: SECRET });

describe('PgAuthz — ④ end-to-end through the WebSocket upgrade gate', () => {
  let server: SyncServerInstance | undefined;
  const disposables: Array<() => void> = [];

  afterEach(async () => {
    for (const d of disposables.splice(0)) d();
    if (server) { await server.shutdown('pg-authz-cleanup'); server = undefined; }
  });

  async function start(pool: PgPoolLike): Promise<number> {
    const { authz } = createAuthz({ env: { PRYZM_AUTHZ_MODE: 'pg' }, pgPool: pool, onWarn: () => undefined });
    server = await createSyncServer({
      env: { PRYZM_SYNC_WS_AUTH: undefined, SESSION_SECRET: SECRET },
      sessionSecret: SECRET,
      authz,
    });
    return server.listen(0);
  }

  it('a MEMBER opens the room; a NON-MEMBER is refused 403 / not-a-project-member', async () => {
    // 403, not 401: authentication succeeded and authorisation did not. If these
    // collapse, "wrong password" and "wrong project" become one bug report.
    const projectId = `proj-${ulid()}`;
    const pool = new StubPool().addProject(projectId, 'user-alice').addMember(projectId, 'user-bob', 'team_member');
    const port = await start(pool);

    expect((await attempt(`ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(token('user-bob'))}`)).outcome)
      .toBe('opened');
    // The owner, who has no membership row, must also get in.
    expect((await attempt(`ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(token('user-alice'))}`)).outcome)
      .toBe('opened');

    const denied = await attempt(`ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(token('user-eve'))}`);
    expect(denied.outcome).toBe('refused');
    expect((denied as { status: number }).status).toBe(403);
    expect((denied as { reason: string }).reason).toBe('not-a-project-member');
  }, 20_000);

  it('a database outage refuses the connection — it does NOT open the room', async () => {
    const projectId = `proj-${ulid()}`;
    const pool = new StubPool().addProject(projectId, 'user-alice');
    pool.failWith = new Error('connection terminated unexpectedly');
    const port = await start(pool);
    const a = await attempt(`ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(token('user-alice'))}`);
    expect(a.outcome).toBe('refused');
    expect((a as { status: number }).status).toBe(403);
  }, 20_000);

  it('a NON-MEMBER transports ZERO document bytes from a room that HAS data', async () => {
    // The bypass detector. `can() === false` proves nothing on its own if the
    // socket is nonetheless attached to the room — a refusal that still streams
    // the model has refused nothing.
    const projectId = `proj-${ulid()}`;
    const pool = new StubPool().addProject(projectId, 'user-alice').addMember(projectId, 'user-bob', 'team_member');
    const port = await start(pool);

    // A legitimate member seeds the room so there IS something to leak.
    const seed = new WebsocketProvider(`ws://127.0.0.1:${port}`, projectId, new Y.Doc(), {
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
      params: { token: token('user-bob') },
    });
    disposables.push(() => seed.destroy());
    await until(() => seed.wsconnected, 8_000);
    expect(seed.wsconnected).toBe(true);
    yjsProjectCache.getOrCreateDocForRoom(projectId).getMap<unknown>(ELEMENTS_NAMESPACE)
      .set('secret-wall', 'confidential');

    // A VERIFIED user who is simply not on this project listens.
    let bytesReceived = 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(token('user-eve'))}`);
    ws.on('message', (data) => { bytesReceived += (data as Buffer).length; });
    await new Promise<void>((resolve) => {
      ws.on('unexpected-response', () => resolve());
      ws.on('error', () => resolve());
      ws.on('open', () => resolve());
      setTimeout(resolve, 3_000);
    });
    await new Promise((r) => setTimeout(r, 500));
    try { ws.close(); } catch { /* already gone */ }

    expect(bytesReceived).toBe(0);
  }, 30_000);

  interface HealthAuthz {
    authz: { selection: string; reason: string; probe?: { ok: boolean; reason: string } };
  }

  it('/health carries a LIVE probe, not just the selection — a reachable table reports ok', async () => {
    // The selection alone cannot answer the question the deploy actually has:
    // `pg` was chosen, but is `project_members` READABLE from this container?
    // (`selection` reads `injected` here because the harness injects the authz
    // instance; the env-driven selection is asserted in the next test.)
    const port = await start(new StubPool());
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as HealthAuthz;
    expect(health.authz.selection).toBe('injected');
    expect(health.authz.probe?.ok).toBe(true);
  }, 20_000);

  it('/health makes a MISCONFIGURED pg deploy visible without connecting as a stranger', async () => {
    // `PRYZM_AUTHZ_MODE=pg` with no `DATABASE_URL` is a server that refuses
    // everyone. That must be diagnosable in one HTTP GET — the alternative is
    // discovering it from a user who cannot open their project.
    server = await createSyncServer({
      env: { PRYZM_AUTHZ_MODE: 'pg', PRYZM_SYNC_WS_AUTH: undefined, SESSION_SECRET: SECRET },
      sessionSecret: SECRET,
    });
    const port = await server.listen(0);
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as HealthAuthz;
    expect(health.authz.selection).toBe('pg');
    expect(health.authz.reason).toMatch(/fail-closed/);
    expect(health.authz.probe?.ok).toBe(false);
    expect(health.authz.probe?.reason).toBe('no-database-configured');
  }, 20_000);
});
