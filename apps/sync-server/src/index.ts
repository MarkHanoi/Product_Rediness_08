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
import { presenceService } from './presence/PresenceService.js';
import { yjsProjectCache } from './YjsProjectCache.js';

export interface SyncServerOptions {
  readonly port?: number;
  readonly env?: Record<string, string | undefined>;
  readonly log?: EventLog;
  readonly bake?: BakeEnqueuer;
  readonly softLocks?: SoftLockStore;
  readonly authz?: Authz;
  readonly startSweeper?: boolean;
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
      yjs: { activeDocs: yjsProjectCache.size(), activeLevelDocs: yjsProjectCache.levelSize() },
      aiCache: { ttlCleanup: 'available' },
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

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/sync') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const clientId = url.searchParams.get('clientId') ?? ulid();
      const userId = url.searchParams.get('userId') ?? 'anonymous';
      const displayNameHint = url.searchParams.get('displayName') ?? '';
      const authoritativePresence = presenceService.getServerAuthoritativePresence(
        userId,
        { userId, displayName: displayNameHint },
      );
      presenceService.registerUser(userId, authoritativePresence.displayName);
      sessions.register(ws, clientId, userId);
      ws.send(JSON.stringify({ type: 'session.opened', clientId, userId }));
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
        } catch {}
      }
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await sweeper.stop();
      await log.close();
      await bake.close();
      await softLocks.close();
      await authzFactory.close();
    },
  };
}
