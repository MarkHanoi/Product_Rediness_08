// apps/sync-server/handlers/AppendEvent.ts — event linearisation entry.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 905-966 — the canonical AppendEvent implementation.
//   • S22 line 968 — sequence numbers MUST be monotonic + gap-free.
//   • S22 line 972 — bake enqueue is fire-and-forget; never blocks ack.
//
// Pipeline:
//   1. CDE validator (when applicable) — fail fast with `error`.
//   2. EventLog.append — assigns `sequenceNumber` under per-project lock.
//   3. Broadcast linearised event to all subscribers of `projectId`.
//   4. Fire-and-forget bake enqueue — failure is logged, NOT thrown.
//   5. Send `event.ack` to the original sender.
//
// All four observable steps are wrapped in OTel spans so per-step
// latencies are visible in Honeycomb (S22 exit criterion #3).

import type { WebSocket } from 'ws';
import type { BakeEnqueuer } from '../bake/types.js';
import { CDE_VALIDATORS } from '../cde/index.js';
import type { EventLog } from '../eventLog/types.js';
import type { Authz, AuthzActor } from '../authz/index.js';
import type {
  EventAckMessage,
  EventAppendMessage,
  ErrorMessage,
  LinearisedEvent,
} from '../protocol/messages.js';
import { SYNC_SPANS, withSpan } from '../otel.js';

export interface AppendEventDeps {
  readonly log: EventLog;
  readonly bake: BakeEnqueuer;
  readonly broadcast: (projectId: string, event: LinearisedEvent) => void;
  /** Authz boundary (W-03 / ADR-0040).  Required — no opt-out, even in
   *  tests, so the gate is exercised on every code path. */
  readonly authz: Authz;
  /** Acting user — derived from the WS session by SessionManager. */
  readonly actor: AuthzActor;
  /** Optional level-id resolver — applied when the event payload does
   *  not carry an explicit `levelId`.  v0 default returns `'__root__'`,
   *  matching the bake worker's per-project root level. */
  readonly resolveLevelId?: (event: EventAppendMessage['payload']['event']) => string;
}

/** Default — "no level info" → use the project-root pseudo-level. */
export function defaultLevelIdResolver(event: EventAppendMessage['payload']['event']): string {
  const payload = event.payload;
  if (typeof payload === 'object' && payload !== null) {
    const lid = (payload as Record<string, unknown>).levelId;
    if (typeof lid === 'string' && lid.length > 0) return lid;
  }
  return '__root__';
}

export async function handleAppendEvent(
  ws: WebSocket,
  msg: EventAppendMessage,
  deps: AppendEventDeps,
): Promise<void> {
  const { projectId, event } = msg.payload;
  const resolveLevelId = deps.resolveLevelId ?? defaultLevelIdResolver;

  // 0. Authz gate (W-03 / ADR-0040) — reject before validators or persist.
  const allowed = await deps.authz.can('projectEdit', { actor: deps.actor, projectId });
  if (!allowed) {
    send(ws, {
      type: 'error',
      code: 'authz.forbidden',
      message: `actor ${deps.actor.id} not authorised to edit project ${projectId}`,
      correlationId: event.id,
    });
    return;
  }

  // 1. CDE validator (if registered for this event type).
  const validator = CDE_VALIDATORS[event.type];
  if (validator) {
    const err = validator(event.payload);
    if (err) {
      send(ws, {
        type: 'error',
        code: 'cde.validation',
        message: err,
        correlationId: event.id,
      });
      return;
    }
  }

  // 2. Append + linearise — wrapped in `pryzm.sync.sequence` span (the
  //    advisory-lock-equivalent serialised section).
  let result: Awaited<ReturnType<EventLog['append']>>;
  try {
    result = await withSpan(
      SYNC_SPANS.sequence,
      {
        'pryzm.sync.project_id': projectId,
        'pryzm.sync.event.id': event.id,
        'pryzm.sync.event.type': event.type,
      },
      () => deps.log.append(projectId, event),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(ws, {
      type: 'error',
      code: 'append.failed',
      message,
      correlationId: event.id,
    });
    return;
  }

  // pryzm.sync.append wraps the post-sequence work (broadcast + bake +
  // ack) so the span tree shows the full append latency.
  await withSpan(
    SYNC_SPANS.append,
    {
      'pryzm.sync.project_id': projectId,
      'pryzm.sync.event.id': event.id,
      'pryzm.sync.event.type': event.type,
      'pryzm.sync.event.sequence': result.sequenceNumber,
    },
    async () => {
      const linearised: LinearisedEvent = {
        ...event,
        projectId,
        sequenceNumber: result.sequenceNumber,
        persistedAt: result.persistedAt,
      };

      // 3. Broadcast — wrapped in pryzm.sync.broadcast inside SessionManager.
      deps.broadcast(projectId, linearised);

      // 4. Fire-and-forget bake enqueue.
      void deps.bake
        .enqueue({
          projectId,
          levelId: resolveLevelId(event),
          events: [linearised],
        })
        .catch((err: unknown) => {
          // Should be unreachable — the enqueuer's contract says it MUST
          // NOT throw — but guard so a misbehaving impl can't crash the
          // sync server (spec line 972).
          // eslint-disable-next-line no-console
          console.warn(
            `[sync-server] bake enqueue rejected (should not happen): ${err instanceof Error ? err.message : String(err)}`,
          );
        });

      // 5. Ack the sender.
      send(ws, {
        type: 'event.ack',
        id: event.id,
        sequenceNumber: result.sequenceNumber,
      });
    },
  );
}

function send(ws: WebSocket, msg: EventAckMessage | ErrorMessage): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}
