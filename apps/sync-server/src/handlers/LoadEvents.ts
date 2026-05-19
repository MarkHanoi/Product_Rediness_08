// apps/sync-server/handlers/LoadEvents.ts — paginated history fetch.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 D4 (line 1058) — pagination 500 events per response.
//   • S22 exit criterion #6 (line 1077) — reconnect + re-subscribe
//     loads events from `lastSeq + 1`.

import type { WebSocket } from 'ws';
import type { EventLog } from '../eventLog/types.js';
import type { Authz, AuthzActor } from '../authz/index.js';
import {
  EVENTS_LOAD_PAGE_LIMIT,
  type ErrorMessage,
  type EventsLoadMessage,
  type EventsPageMessage,
} from '../protocol/messages.js';
import { SYNC_SPANS, withSpan } from '../otel.js';

export interface LoadEventsDeps {
  readonly log: EventLog;
  /** Authz boundary (W-03 / ADR-0040). */
  readonly authz: Authz;
  readonly actor: AuthzActor;
}

export async function handleLoadEvents(
  ws: WebSocket,
  msg: EventsLoadMessage,
  deps: LoadEventsDeps,
): Promise<void> {
  const { projectId, fromSeq } = msg.payload;
  const requestedLimit = msg.payload.limit ?? EVENTS_LOAD_PAGE_LIMIT;
  // Cap below + above — reject negative limits, cap at the spec page max.
  const limit = Math.min(EVENTS_LOAD_PAGE_LIMIT, Math.max(1, Math.floor(requestedLimit)));

  // Authz gate (W-03 / ADR-0040).
  const allowed = await deps.authz.can('projectRead', { actor: deps.actor, projectId });
  if (!allowed) {
    send(ws, {
      type: 'error',
      code: 'authz.forbidden',
      message: `actor ${deps.actor.id} not authorised to read project ${projectId}`,
      correlationId: msg.payload.cursor,
    });
    return;
  }

  if (fromSeq < 0 || !Number.isFinite(fromSeq)) {
    send(ws, {
      type: 'error',
      code: 'load.invalid-fromSeq',
      message: `fromSeq must be ≥ 0 and finite (got ${fromSeq})`,
      correlationId: msg.payload.cursor,
    });
    return;
  }

  await withSpan(
    SYNC_SPANS.load,
    {
      'pryzm.sync.project_id': projectId,
      'pryzm.sync.load.from_seq': fromSeq,
      'pryzm.sync.load.limit': limit,
    },
    async (span) => {
      try {
        const page = await deps.log.load(projectId, fromSeq, limit);
        span.setAttribute('pryzm.sync.load.returned', page.events.length);
        span.setAttribute('pryzm.sync.load.done', page.done);

        const response: EventsPageMessage = {
          type: 'events.page',
          projectId,
          events: page.events,
          fromSeq,
          nextSeq: page.nextSeq,
          done: page.done,
          ...(msg.payload.cursor !== undefined ? { cursor: msg.payload.cursor } : {}),
        };
        send(ws, response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send(ws, {
          type: 'error',
          code: 'load.failed',
          message,
          correlationId: msg.payload.cursor,
        });
      }
    },
  );
}

function send(ws: WebSocket, msg: EventsPageMessage | ErrorMessage): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}
