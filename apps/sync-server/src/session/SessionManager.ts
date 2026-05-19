// apps/sync-server/session/SessionManager.ts — WebSocket session state.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 980-1037 — canonical SessionManager pattern.
//   • S22 line 1040 — Phase 1D: in-process Map only; multi-instance via
//     Redis Pub/Sub deferred to Phase 2D (S43).
//   • S22 line 1042 — auth model: client passes `userId`, server trusts
//     it.  Full JWT lands in Phase 3C — documented in code-level
//     ADR-0019.
//   • S22 D6 (line 1060) — reconnect + re-subscribe handler with
//     replay from `fromSeq`.

import type { WebSocket } from 'ws';
import type { BakeEnqueuer } from '../bake/types.js';
import type { EventLog } from '../eventLog/types.js';
import type { Authz } from '../authz/index.js';
import { handleAppendEvent } from '../handlers/AppendEvent.js';
import { handleLoadEvents } from '../handlers/LoadEvents.js';
import {
  EVENTS_LOAD_PAGE_LIMIT,
  parseClientMessage,
  type ErrorMessage,
  type LinearisedEvent,
  type ProjectSubscribedMessage,
  type EventPushMessage,
  type EventsPageMessage,
} from '../protocol/messages.js';
import { SYNC_SPANS, withSpan } from '../otel.js';

export interface ClientSession {
  readonly ws: WebSocket;
  readonly clientId: string;
  readonly userId: string;
  /** The project this session is currently subscribed to.  null until
   *  `project.subscribe` is received.  v0 supports one project per
   *  session — switching projects requires a new `project.subscribe`. */
  projectId: string | null;
  /** Highest sequence number this session has been broadcast.  Used by
   *  reconnect catch-up to avoid re-pushing events the client already
   *  has. */
  lastBroadcastSeq: number;
}

export interface SessionManagerDeps {
  readonly log: EventLog;
  readonly bake: BakeEnqueuer;
  /** Authz boundary (W-03 / ADR-0040).  Required — passed to every
   *  per-message handler so the gate is exercised on every code path. */
  readonly authz: Authz;
}

export interface SessionManagerStats {
  readonly sessions: number;
  readonly subscribed: number;
  readonly projectSubscriberCounts: Readonly<Record<string, number>>;
  readonly broadcasts: number;
  readonly broadcastTargets: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, ClientSession>();
  private _broadcasts = 0;
  private _broadcastTargets = 0;

  constructor(private readonly deps: SessionManagerDeps) {}

  /** Register a new client session.  Wires WS event handlers and
   *  returns the session so the caller (`ConnectClient`) can wire any
   *  additional state. */
  register(ws: WebSocket, clientId: string, userId: string): ClientSession {
    const session: ClientSession = {
      ws,
      clientId,
      userId,
      projectId: null,
      lastBroadcastSeq: 0,
    };
    this.sessions.set(clientId, session);

    ws.on('message', (data) => {
      // `ws` may pass Buffer | ArrayBuffer | Buffer[] — coerce to string.
      const raw = typeof data === 'string'
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data).toString('utf-8')
          : data instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(data)).toString('utf-8')
            : data.toString('utf-8');
      void this.handleMessage(session, raw);
    });
    ws.on('close', () => {
      this.sessions.delete(clientId);
    });
    ws.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.warn(`[sync-server] WebSocket error for client ${clientId}: ${err.message}`);
    });

    return session;
  }

  /** Unregister explicitly — used by tests and by the SIGTERM handler.
   *  Does NOT close the underlying socket; that's the caller's job. */
  unregister(clientId: string): void {
    this.sessions.delete(clientId);
  }

  /** Broadcast a linearised event to all sessions subscribed to its
   *  project.  Wrapped in `pryzm.sync.broadcast` for OTel. */
  broadcast(projectId: string, event: LinearisedEvent): void {
    void withSpan(
      SYNC_SPANS.broadcast,
      {
        'pryzm.sync.project_id': projectId,
        'pryzm.sync.event.sequence': event.sequenceNumber,
      },
      (span) => {
        const payload: EventPushMessage = { type: 'event.push', event };
        const text = JSON.stringify(payload);
        let count = 0;
        for (const session of this.sessions.values()) {
          if (session.projectId !== projectId) continue;
          if (session.ws.readyState !== session.ws.OPEN) continue;
          session.ws.send(text);
          if (event.sequenceNumber > session.lastBroadcastSeq) {
            session.lastBroadcastSeq = event.sequenceNumber;
          }
          count++;
        }
        this._broadcasts++;
        this._broadcastTargets += count;
        span.setAttribute('pryzm.sync.broadcast.targets', count);
      },
    );
  }

  stats(): SessionManagerStats {
    const counts: Record<string, number> = {};
    let subscribed = 0;
    for (const s of this.sessions.values()) {
      if (s.projectId) {
        counts[s.projectId] = (counts[s.projectId] ?? 0) + 1;
        subscribed++;
      }
    }
    return {
      sessions: this.sessions.size,
      subscribed,
      projectSubscriberCounts: counts,
      broadcasts: this._broadcasts,
      broadcastTargets: this._broadcastTargets,
    };
  }

  /** Snapshot of the live session map.  Test helper — NOT part of the
   *  external surface. */
  snapshotSessions(): readonly ClientSession[] {
    return Array.from(this.sessions.values());
  }

  private async handleMessage(session: ClientSession, raw: string): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.sendError(session.ws, {
        type: 'error',
        code: 'protocol.malformed',
        message: 'Could not parse message — expected ProjectSubscribe / EventAppend / EventsLoad',
      });
      return;
    }

    switch (msg.type) {
      case 'project.subscribe':
        await this.handleSubscribe(session, msg.projectId, msg.fromSeq);
        return;

      case 'event.append':
        await handleAppendEvent(session.ws, msg, {
          log: this.deps.log,
          bake: this.deps.bake,
          authz: this.deps.authz,
          actor: { id: session.userId },
          broadcast: (pid, ev) => this.broadcast(pid, ev),
        });
        return;

      case 'events.load':
        await handleLoadEvents(session.ws, msg, {
          log: this.deps.log,
          authz: this.deps.authz,
          actor: { id: session.userId },
        });
        return;
    }
  }

  /** project.subscribe — set the session's projectId, ack with the
   *  current latestSeq, and (when fromSeq is set) immediately stream a
   *  catch-up page.  Spec line 1060: D6 reconnect + re-subscribe. */
  private async handleSubscribe(
    session: ClientSession,
    projectId: string,
    fromSeq: number | undefined,
  ): Promise<void> {
    // Authz gate (W-03 / ADR-0040) — subscribe is a read on the project.
    const allowed = await this.deps.authz.can('projectRead', {
      actor: { id: session.userId }, projectId,
    });
    if (!allowed) {
      this.sendError(session.ws, {
        type: 'error',
        code: 'authz.forbidden',
        message: `actor ${session.userId} not authorised to subscribe to project ${projectId}`,
      });
      return;
    }

    session.projectId = projectId;

    const latestSeq = await this.deps.log.latestSeq(projectId);
    const ack: ProjectSubscribedMessage = {
      type: 'project.subscribed',
      projectId,
      latestSeq,
    };
    if (session.ws.readyState === session.ws.OPEN) {
      session.ws.send(JSON.stringify(ack));
    }

    if (fromSeq !== undefined && fromSeq < latestSeq) {
      const page = await this.deps.log.load(projectId, fromSeq, EVENTS_LOAD_PAGE_LIMIT);
      const response: EventsPageMessage = {
        type: 'events.page',
        projectId,
        events: page.events,
        fromSeq,
        nextSeq: page.nextSeq,
        done: page.done,
      };
      if (session.ws.readyState === session.ws.OPEN) {
        session.ws.send(JSON.stringify(response));
        // Treat the catch-up page as already-broadcast events so the
        // subsequent `broadcast()` calls don't re-push them.
        session.lastBroadcastSeq = page.nextSeq;
      }
    }
  }

  private sendError(ws: WebSocket, err: ErrorMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(err));
  }
}
