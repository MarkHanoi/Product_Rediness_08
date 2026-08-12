// apps/sync-server/index.ts — Express + WebSocketServer entry point.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 line 1050 — sync server runs on port 4000 in dev (bake worker
//     on 4001, editor on 5000).  Configurable via SYNC_PORT.
//   • S22 line 1042 — auth model: client passes `clientId` + `userId`;
//     server trusts.  Full JWT lands in Phase 3C.
//   • S22 line 1040 — single-instance only (in-process session map);
//     multi-instance via Redis Pub/Sub deferred to Phase 2D.
//
// Endpoints:
//   • GET  /health         — liveness; returns session + log stats.
//   • GET  /stats          — full snapshot of sessions + bake enqueuer.
//   • WS   /sync           — WebSocket entry; `clientId` and `userId`
//                            are read from query string for v0 (full
//                            JWT auth in Phase 3C).
//
// CLI invocation honours `SYNC_PORT` (default 4000), `SYNC_EVENT_LOG`
// (default `memory`; set to `pg` to wire DATABASE_URL → PgEventLog),
// and `BAKE_URL` (default unset → noop bake enqueuer).

import express, { type Express, type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ulid } from 'ulid';
import { createBakeEnqueuer } from './bake/createBakeEnqueuer.js';
import type { BakeEnqueuer } from './bake/types.js';
import { createEventLog } from './eventLog/createEventLog.js';
import type { EventLog } from './eventLog/types.js';
import { SessionManager } from './session/SessionManager.js';
import { createSoftLockStore } from './locks/createSoftLockStore.js';
import { mountLocksHandlers } from './locks/handlers.js';
import { Sweeper } from './locks/Sweeper.js';
import type { SoftLockStore } from './locks/types.js';
import { createAuthz } from './authz/index.js';
import type { Authz, AuthzMode } from './authz/index.js';
import { createWsAuthGate, projectIdFromRoom, refuseUpgrade } from './auth/index.js';
import type { WsAuthGate, WsAuthMode } from './auth/index.js';
import { presenceService } from './presence/PresenceService.js';
import { yjsProjectCache } from './YjsProjectCache.js';
import { setupYjsConnection, yjsRoomStats } from './yjs/setupYjsConnection.js';

export interface SyncServerOptions {
  readonly port?: number;
  readonly env?: Record<string, string | undefined>;
  readonly log?: EventLog;
  readonly bake?: BakeEnqueuer;
  readonly softLocks?: SoftLockStore;
  readonly authz?: Authz;
  readonly startSweeper?: boolean;
  /** L-391 R-B test seam — overrides `env.SESSION_SECRET` for the WS auth
   *  gate without mutating `process.env` (which is shared across a vitest
   *  file and would make suites order-dependent). */
  readonly sessionSecret?: string;
}

export interface SyncServerInstance {
  readonly app: Express;
  readonly httpServer: HttpServer;
  readonly wss: WebSocketServer;
  readonly sessions: SessionManager;
  readonly log: EventLog;
  readonly bake: BakeEnqueuer;
  readonly softLocks: SoftLockStore;
  readonly sweeper: Sweeper;
  readonly logSelection: 'memory' | 'pg';
  readonly bakeSelection: 'noop' | 'http';
  readonly softLockSelection: 'memory' | 'pg';
  readonly authz: Authz;
  readonly authzSelection: AuthzMode | 'injected';
  /** L-391 R-B — the upgrade auth gate and the mode it selected.  Exposed so
   *  `/health`, the deploy smoke test and the collab gate can all read the
   *  SAME selection rather than inferring it from behaviour. */
  readonly wsAuth: WsAuthGate;
  readonly wsAuthSelection: WsAuthMode;
  listen(port: number): Promise<number>;
  shutdown(reason: string): Promise<void>;
}

export async function createSyncServer(
  opts: SyncServerOptions = {},
): Promise<SyncServerInstance> {
  const env = opts.env ?? process.env;
  const logFactory = await createEventLog({ env, log: opts.log });
  const log = logFactory.log;
  const bakeFactory = createBakeEnqueuer({ env, enqueuer: opts.bake });
  const bake = bakeFactory.enqueuer;
  const authzFactory = createAuthz({ env, authz: opts.authz });
  const wsAuthFactory = createWsAuthGate({
    env,
    authz: authzFactory.authz,
    ...(opts.sessionSecret !== undefined ? { secret: opts.sessionSecret } : {}),
  });
  const sessions = new SessionManager({ log, bake, authz: authzFactory.authz });
  const lockFactory = await createSoftLockStore({ env, store: opts.softLocks });
  const softLocks = lockFactory.store;
  const sweeper = new Sweeper(softLocks);

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  mountLocksHandlers(app, { store: softLocks, authz: authzFactory.authz });

  app.get('/health', async (_: Request, res: Response) => {
    res.json({
      status: 'ok',
      sessions: sessions.stats(),
      log: { selection: logFactory.selection, reason: logFactory.reason },
      bake: { selection: bakeFactory.selection, reason: bakeFactory.reason, ...bake.stats() },
      softLocks: { reason: lockFactory.reason, ...softLocks.stats(), sweeper: sweeper.stats() },
      yjs: {
        activeDocs: yjsProjectCache.size(),
        activeLevelDocs: yjsProjectCache.levelSize(),
        ...yjsRoomStats(),
      },
      aiCache: { ttlCleanup: 'available' },
      // L-391 R-B — the deploy smoke test reads THIS.  A production instance
      // reporting `trust-query` or `deny-all` is a misconfiguration that must
      // be visible without attempting an unauthenticated connection.
      wsAuth: { mode: wsAuthFactory.mode, reason: wsAuthFactory.reason },
      // L-391 §4.1 — AUTHORISATION, reported next to authentication because the
      // two were conflated in the deploy discussion. `wsAuth.mode` says whether
      // identity is verified; THIS says whether membership is. A production
      // instance reporting `memory-allow-by-default` is admitting that any
      // signed-in user may join any room, and that must be visible on /health
      // rather than discoverable by connecting as a stranger.
      //
      // `probe` answers a question the selection alone cannot: `pg` was
      // SELECTED, but is `project_members` actually READABLE from this
      // container? It is the smoke test for the production flip.
      authz: {
        selection: authzFactory.selection,
        reason: authzFactory.reason,
        ...(typeof (authzFactory.authz as unknown as { probe?: unknown }).probe === 'function'
          ? {
              probe: await (
                authzFactory.authz as unknown as { probe: () => Promise<{ ok: boolean; reason: string }> }
              ).probe(),
            }
          : {}),
      },
    });
  });

  app.get('/stats', (_: Request, res: Response) => {
    res.json({
      sessions: sessions.stats(),
      log: { selection: logFactory.selection, reason: logFactory.reason },
      bake: { selection: bakeFactory.selection, ...bake.stats() },
      softLocks: { ...softLocks.stats(), sweeper: sweeper.stats() },
    });
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // ── L-391 R-B — EVERY upgrade passes the auth gate. ─────────────────────
  //
  // Both paths are gated, not just the new one: `/sync` mutates project state
  // through the S22 command-event protocol, and before R-B its entire
  // authentication story was `?userId=` — which `Authz.can()` downstream then
  // faithfully evaluated for whoever the caller claimed to be.  In
  // `jwt-hs256` mode the userId now comes from the VERIFIED token subject and
  // the query parameter is ignored, so `?userId=someone-else` is no longer an
  // impersonation.
  //
  // A refusal is always written to the socket with a named reason
  // (`refuseUpgrade`).  There is no `socket.destroy()` without a status on
  // this path — a silent drop and a silent accept are the two failure modes
  // this gate exists to make impossible.
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const isLegacySync = url.pathname === '/sync';

    // The legacy path chooses its project later, per message, and every
    // handler on it already calls `authz.can` — so the upgrade authorises
    // IDENTITY only (projectId `undefined`).  The y-room path names its
    // project in the URL, so it authorises identity AND membership here.
    const room = isLegacySync
      ? ''
      : decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (!isLegacySync && !room) {
      refuseUpgrade(socket, 'missing-room');
      return;
    }

    void wsAuthFactory.gate
      .authenticate(
        { url: req.url, headers: req.headers as Record<string, string | string[] | undefined> },
        'projectEdit',
        isLegacySync ? undefined : projectIdFromRoom(room),
      )
      .then((verdict) => {
        if (!verdict.ok) {
          refuseUpgrade(socket, verdict.reason);
          return;
        }

        if (isLegacySync) {
          // ── Legacy S22 JSON command-event protocol ───────────────────────
          wss.handleUpgrade(req, socket, head, (ws) => {
            const clientId = url.searchParams.get('clientId') ?? ulid();
            // AUTHORITATIVE: the verified principal, never the query string.
            const userId = verdict.principal.userId;
            const displayNameHint = url.searchParams.get('displayName') ?? '';
            const authoritativePresence = presenceService.getServerAuthoritativePresence(
              userId,
              { userId, displayName: displayNameHint },
            );
            presenceService.registerUser(userId, authoritativePresence.displayName);
            sessions.register(ws, clientId, userId);
            ws.send(JSON.stringify({ type: 'session.opened', clientId, userId }));
          });
          return;
        }

        // ── L-391 leg C — y-protocols rooms ──────────────────────────────
        // A stock y-websocket WebsocketProvider connects to `${url}/${room}`:
        // every non-`/sync` path IS a room name (ADR-049 §4.4 naming —
        // "${projectId}" or "${projectId}:${levelId}").
        wss.handleUpgrade(req, socket, head, (ws) => {
          setupYjsConnection(ws as WebSocket, room);
        });
      })
      .catch(() => {
        // An unexpected throw must refuse, never fall through to an accept.
        refuseUpgrade(socket, 'internal-error');
      });
  });

  let listening = false;
  let shuttingDown = false;
  if (opts.startSweeper !== false) sweeper.start();

  return {
    app,
    httpServer,
    wss,
    sessions,
    log,
    bake,
    softLocks,
    sweeper,
    logSelection: logFactory.selection,
    bakeSelection: bakeFactory.selection,
    softLockSelection: lockFactory.selection,
    authz: authzFactory.authz,
    authzSelection: authzFactory.selection,
    wsAuth: wsAuthFactory.gate,
    wsAuthSelection: wsAuthFactory.mode,
    async listen(port: number): Promise<number> {
      if (listening) {
        const addr = httpServer.address();
        return typeof addr === 'object' && addr ? addr.port : port;
      }
      return new Promise<number>((resolve, reject) => {
        const onError = (err: Error): void => {
          httpServer.off('listening', onListening);
          reject(err);
        };
        const onListening = (): void => {
          httpServer.off('error', onError);
          listening = true;
          const addr = httpServer.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        };
        httpServer.once('error', onError);
        httpServer.once('listening', onListening);
        httpServer.listen(port);
      });
    },
    async shutdown(reason: string): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const ws of wss.clients) {
        try {
          (ws as WebSocket).close(1001, `sync-server shutdown: ${reason}`);
        } catch { /* §SWALLOW-TEARDOWN — the socket is already gone; shutdown must still close the remaining clients */ }
      }
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await sweeper.stop();
      await log.close();
      await bake.close();
      await softLocks.close();
      // §L-391-SHUTDOWN-FIX — `createAuthz` returns `{ authz, selection,
      // reason }` and has NEVER exposed `close()`; the unconditional call
      // here made EVERY `shutdown()` throw (the pre-existing Chaos suite
      // failed at teardown on exactly this line).  Optional-call keeps the
      // seam for a future closable authz without crashing today's.
      //
      // §PGAUTHZ-CLOSE — the closable thing is the IMPLEMENTATION, not the
      // factory result: `PgAuthz` owns a `pg.Pool`. The factory line is kept
      // because the seam it describes is still valid; the second line is the
      // one that now actually releases a connection. `MemoryAuthz` has no
      // `close()`, so it stays a no-op there.
      await (authzFactory as { close?: () => Promise<void> }).close?.();
      await (authzFactory.authz as { close?: () => Promise<void> }).close?.();
    },
  };
}
