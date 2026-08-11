// apps/sync-server/__tests__/WsAuth.test.ts — L-391 R-B.
//
// ─── WHAT THIS SUITE HAS TO PROVE ───────────────────────────────────────────
//
// "A test that only proves the happy path cannot detect an auth bypass."  The
// failure this gate closes is not "the socket didn't connect" — it is "the
// socket connected and NOBODY ASKED".  A suite that mints a good token, sees a
// convergence, and stops would pass unchanged against a server with the entire
// gate deleted.
//
// So every test here is one of three kinds, and the file is worthless without
// all three:
//
//   ① ACCEPT   — a VALID token opens a room and data flows.  Without this the
//                gate could be `return false` and the suite would be green.
//   ② REFUSE   — an invalid token is refused with the CORRECT NAMED REASON,
//                asserted from the HTTP response the client actually received.
//                Not "the connection failed" (a timeout, a crashed server and
//                a refusal all look like that) — a 401 with
//                `X-Pryzm-Sync-Refusal: bad-signature`.
//   ③ NO-LEAK  — a refused upgrade transported NO DOCUMENT BYTES.  This is the
//                bypass detector proper: it fails if a refusal is written to
//                the socket but the connection is nonetheless attached to the
//                room.
//
// The negative cases are the standard JWT attack set, each mapped to its own
// refusal member so a regression that collapses two of them into one is a test
// failure rather than an equivalent outcome:
//   alg:none · alg:RS256 (algorithm confusion) · foreign secret · tampered
//   payload · expired · no-exp · not-yet-valid · no-subject · no token ·
//   not-a-member · server without a secret.

import { afterEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { YjsDocAdapter, ELEMENTS_NAMESPACE, type YjsProvider } from '@pryzm/sync-client';
import { createSyncServer, type SyncServerInstance } from '../src/index.js';
import { yjsProjectCache } from '../src/YjsProjectCache.js';
import { MemoryAuthz } from '../src/authz/index.js';
import { signSessionToken, signTokenWithoutExp, REFUSAL_HEADER } from '../src/auth/index.js';

const SECRET = 'test-session-secret-do-not-use-anywhere-real';
const OTHER_SECRET = 'a-different-secret-entirely';

// ─── Harness ────────────────────────────────────────────────────────────────

/** The observable outcome of an upgrade attempt.  `opened` and `refused` are
 *  DIFFERENT VALUES — the whole point. */
type Attempt =
  | { outcome: 'opened' }
  | { outcome: 'refused'; status: number; reason: string | undefined }
  | { outcome: 'error'; message: string };

/**
 * Attempt a raw WebSocket upgrade and report what the SERVER said.
 *
 * Uses the `ws` client's `unexpected-response` event, which hands back the
 * real `IncomingMessage` — status line and headers included.  That is how the
 * named reason is asserted rather than inferred.
 */
function attempt(url: string, headers?: Record<string, string>): Promise<Attempt> {
  return new Promise<Attempt>((resolve) => {
    const ws = new WebSocket(url, headers ? { headers } : undefined);
    const done = (a: Attempt): void => {
      try { ws.close(); } catch { /* already gone */ }
      resolve(a);
    };
    ws.on('open', () => done({ outcome: 'opened' }));
    ws.on('unexpected-response', (_req, res) => {
      const raw = res.headers[REFUSAL_HEADER.toLowerCase()];
      done({
        outcome: 'refused',
        status: res.statusCode ?? 0,
        reason: Array.isArray(raw) ? raw[0] : raw,
      });
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

function goodToken(sub = 'user-alice'): string {
  return signSessionToken({ sub, email: `${sub}@example.test`, secret: SECRET });
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('L-391 R-B — auth on the WebSocket upgrade', () => {
  let server: SyncServerInstance | undefined;
  const disposables: Array<() => void> = [];

  afterEach(async () => {
    for (const d of disposables.splice(0)) d();
    if (server) { await server.shutdown('ws-auth-cleanup'); server = undefined; }
  });

  /** A server in the DEPLOY configuration: a secret, and no opt-out. */
  async function startAuthenticated(authz?: MemoryAuthz): Promise<number> {
    server = await createSyncServer({
      env: { PRYZM_SYNC_WS_AUTH: undefined, SESSION_SECRET: SECRET },
      sessionSecret: SECRET,
      ...(authz ? { authz } : {}),
    });
    return server.listen(0);
  }

  // ── Mode selection ───────────────────────────────────────────────────────

  it('selects jwt-hs256 when SESSION_SECRET is present — the deploy configuration', async () => {
    await startAuthenticated();
    expect(server!.wsAuthSelection).toBe('jwt-hs256');
  });

  it('FAILS CLOSED to deny-all when SESSION_SECRET is absent — an unverifiable server accepts nothing', async () => {
    server = await createSyncServer({
      env: {},
      sessionSecret: '',
    });
    const port = await server.listen(0);
    expect(server.wsAuthSelection).toBe('deny-all');

    const a = await attempt(`ws://127.0.0.1:${port}/proj-${ulid()}`);
    expect(a.outcome).toBe('refused');
    expect((a as { status: number }).status).toBe(500);
    expect((a as { reason: string }).reason).toBe('server-misconfigured-no-session-secret');
  });

  it('reaches trust-query ONLY by explicit opt-in, never by omission', async () => {
    server = await createSyncServer({
      env: { PRYZM_SYNC_WS_AUTH: 'trust-query' },
      sessionSecret: '',
    });
    const port = await server.listen(0);
    expect(server.wsAuthSelection).toBe('trust-query');
    const a = await attempt(`ws://127.0.0.1:${port}/proj-${ulid()}`);
    expect(a.outcome).toBe('opened');
  });

  // ── ① ACCEPT ─────────────────────────────────────────────────────────────

  it('ACCEPTS a valid token on a y-room and the document actually converges', async () => {
    const port = await startAuthenticated();
    const room = `proj-${ulid()}`;
    const token = goodToken();

    const adapterA = new YjsDocAdapter(room);
    const adapterB = new YjsDocAdapter(room);
    adapterA.applyCommand('wall.create', { id: 'wall-1', height: 3 });
    adapterB.applyUpdate(adapterA.encodeStateAsUpdate());
    expect(adapterB.readElementProperty('wall-1', 'height')).toBe(3);

    const mk = (adapter: YjsDocAdapter): WebsocketProvider => {
      const p = new WebsocketProvider(`ws://127.0.0.1:${port}`, room, adapter.doc, {
        WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
        disableBc: true,
        maxBackoffTime: 500,
        params: { token },
      });
      adapter.connectWithProvider(p as unknown as YjsProvider);
      disposables.push(() => { p.destroy(); adapter.destroy(); });
      return p;
    };
    mk(adapterA);
    mk(adapterB);

    adapterA.applyCommand('wall.updateDimensions', { wallId: 'wall-1', height: 5 });
    await until(() => adapterB.readElementProperty('wall-1', 'height') === 5, 8_000);
    // `toBe(5)` against a document SEEDED WITH 3 — a dead transport reads 3.
    expect(adapterB.readElementProperty('wall-1', 'height')).toBe(5);
  }, 30_000);

  it('ACCEPTS a valid token presented as `Authorization: Bearer` (non-browser clients)', async () => {
    const port = await startAuthenticated();
    const a = await attempt(`ws://127.0.0.1:${port}/proj-${ulid()}`, {
      Authorization: `Bearer ${goodToken()}`,
    });
    expect(a.outcome).toBe('opened');
  });

  // ── ② REFUSE — each attack, each with its own named reason ───────────────

  it.each([
    [
      'no token at all',
      (): string | undefined => undefined,
      401,
      'missing-token',
    ],
    [
      'not a JWT',
      (): string => 'this-is-not-a-token',
      401,
      'malformed-token',
    ],
    [
      'alg:none — the unsigned-token attack',
      (): string =>
        signSessionToken({ sub: 'user-mallory', secret: SECRET, header: { alg: 'none', typ: 'JWT' } }),
      401,
      'unsupported-algorithm',
    ],
    [
      'alg:RS256 — the algorithm-confusion attack',
      (): string =>
        signSessionToken({ sub: 'user-mallory', secret: SECRET, header: { alg: 'RS256', typ: 'JWT' } }),
      401,
      'unsupported-algorithm',
    ],
    [
      'signed with a foreign secret',
      (): string => signSessionToken({ sub: 'user-mallory', secret: SECRET, signWith: OTHER_SECRET }),
      401,
      'bad-signature',
    ],
    [
      'expired',
      (): string => signSessionToken({ sub: 'user-alice', secret: SECRET, expiresInSeconds: -3600 }),
      401,
      'expired-token',
    ],
    [
      'no exp claim — a session token that never dies is refused, not honoured',
      (): string => signTokenWithoutExp({ sub: 'user-alice', secret: SECRET }),
      401,
      'expired-token',
    ],
    [
      'nbf in the future',
      (): string =>
        signSessionToken({ sub: 'user-alice', secret: SECRET, notBeforeSeconds: 3600 }),
      401,
      'token-not-yet-valid',
    ],
    [
      'no subject — a verified token with nobody in it',
      (): string => signSessionToken({ sub: '', secret: SECRET }),
      401,
      'missing-subject',
    ],
  ])('REFUSES %s → %s', async (_name, mint, status, reason) => {
    const port = await startAuthenticated();
    const token = (mint as () => string | undefined)();
    const url = `ws://127.0.0.1:${port}/proj-${ulid()}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const a = await attempt(url);
    expect(a.outcome).toBe('refused');
    expect((a as { status: number }).status).toBe(status);
    expect((a as { reason: string }).reason).toBe(reason);
  }, 20_000);

  it('REFUSES a token whose payload was tampered with after signing', async () => {
    const port = await startAuthenticated();
    const token = goodToken('user-alice');
    const [h, p, s] = token.split('.') as [string, string, string];
    // Swap the subject; keep the original signature.  This is the exact edit an
    // attacker with a legitimate token of their own would make.
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
    payload['sub'] = 'user-owner';
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;

    const a = await attempt(`ws://127.0.0.1:${port}/proj-${ulid()}?token=${encodeURIComponent(forged)}`);
    expect(a.outcome).toBe('refused');
    expect((a as { reason: string }).reason).toBe('bad-signature');
  });

  it('REFUSES a VERIFIED user who is not a member of the room project (403, not 401)', async () => {
    // Authentication succeeded; authorisation did not.  The two must not be
    // reported the same way — otherwise "wrong password" and "wrong project"
    // are one bug report.
    const authz = new MemoryAuthz({ allowByDefault: false });
    const projectId = `proj-${ulid()}`;
    authz.addMember(projectId, 'user-alice');
    const port = await startAuthenticated(authz);

    const allowed = await attempt(
      `ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(goodToken('user-alice'))}`,
    );
    expect(allowed.outcome).toBe('opened');

    const denied = await attempt(
      `ws://127.0.0.1:${port}/${projectId}?token=${encodeURIComponent(goodToken('user-bob'))}`,
    );
    expect(denied.outcome).toBe('refused');
    expect((denied as { status: number }).status).toBe(403);
    expect((denied as { reason: string }).reason).toBe('not-a-project-member');
  }, 20_000);

  it('authorises the PROJECT of a per-level room (`${projectId}:${levelId}`), not the raw room string', async () => {
    const authz = new MemoryAuthz({ allowByDefault: false });
    const projectId = `proj-${ulid()}`;
    authz.addMember(projectId, 'user-alice');
    const port = await startAuthenticated(authz);

    const a = await attempt(
      `ws://127.0.0.1:${port}/${projectId}%3AL1?token=${encodeURIComponent(goodToken('user-alice'))}`,
    );
    expect(a.outcome).toBe('opened');
  });

  // ── The legacy /sync path — identity, and the impersonation hole ─────────

  it('REFUSES an unauthenticated legacy /sync upgrade', async () => {
    const port = await startAuthenticated();
    const a = await attempt(`ws://127.0.0.1:${port}/sync?clientId=c1&userId=whoever`);
    expect(a.outcome).toBe('refused');
    expect((a as { reason: string }).reason).toBe('missing-token');
  });

  it('IGNORES `?userId=` and uses the verified token subject — closing the impersonation hole', async () => {
    const port = await startAuthenticated();
    const token = goodToken('user-alice');
    const opened = await new Promise<{ userId: string }>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/sync?clientId=c1&userId=user-owner&token=${encodeURIComponent(token)}`,
      );
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data)) as { type: string; userId: string };
        if (msg.type === 'session.opened') { ws.close(); resolve(msg); }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 5_000);
    });
    // Pre-R-B this asserted 'user-owner' — the query string WAS the identity.
    expect(opened.userId).toBe('user-alice');
  });

  // ── ③ NO-LEAK — the bypass detector ──────────────────────────────────────

  it('a REFUSED upgrade transports zero document bytes — refusal is not a slow accept', async () => {
    const port = await startAuthenticated();
    const room = `proj-${ulid()}`;

    // A legitimate client seeds the room so there IS something to leak.
    const seed = new WebsocketProvider(`ws://127.0.0.1:${port}`, room, new Y.Doc(), {
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
      disableBc: true,
      params: { token: goodToken('user-alice') },
    });
    disposables.push(() => seed.destroy());
    await until(() => seed.wsconnected, 8_000);
    expect(seed.wsconnected).toBe(true);
    const serverDoc = yjsProjectCache.getOrCreateDocForRoom(room);
    serverDoc.getMap<unknown>(ELEMENTS_NAMESPACE).set('secret-wall', 'confidential');

    // The attacker connects to the SAME room with no credentials and listens.
    const eavesdropper = new Y.Doc();
    let bytesReceived = 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${room}`);
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
    expect(eavesdropper.getMap<unknown>(ELEMENTS_NAMESPACE).get('secret-wall')).toBeUndefined();
  }, 30_000);
});
