// apps/sync-server/protocol/messages.ts — wire-format types.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 1021-1037 — message dispatch in SessionManager.
//   • S22 line 890 — wire format is JSON in v0; MessagePack adoption
//     for the event-log channel by S22 close (deferred — JSON ships in
//     v0, codec swap is single-line in `framing.ts` once landed).
//
// Frozen wire shape — the editor + the sync server agree on these
// exact fields.  Any addition is an additive optional field; renames /
// removals require a protocol-version bump.

/** A command-event the editor sends to the server.
 *
 *  This is the trimmed-down shape the sync server cares about — it does
 *  NOT need the full `EventRecord<T>` type from `@pryzm/persistence-client`
 *  because v0 does not validate payloads server-side (the bake worker
 *  re-validates when it replays events).  Keeping the dependency surface
 *  small means the sync server stays a thin transport layer.
 */
export interface CommandEvent {
  /** ULID — Crockford base32, 26 chars.  Used as the dedup key. */
  readonly id: string;
  /** Command type, e.g. `wall.create`, `cde.linkDocument`. */
  readonly type: string;
  /** User who issued the command — opaque string in v0 (full Supabase
   *  user-id wiring lands in Phase 3C). */
  readonly actorId: string;
  /** Command payload.  Shape is owned by the producer. */
  readonly payload: unknown;
}

/** A linearised event — `CommandEvent` + the server-assigned sequence
 *  number + project scope + persistence timestamp. */
export interface LinearisedEvent extends CommandEvent {
  readonly projectId: string;
  /** Monotonically increasing within `projectId`.  Gap-free. */
  readonly sequenceNumber: number;
  /** ISO-8601 timestamp at which the event was persisted. */
  readonly persistedAt: string;
}

// ─── Client → server messages ────────────────────────────────────────

export interface ProjectSubscribeMessage {
  readonly type: 'project.subscribe';
  readonly projectId: string;
  /** When set, the server will replay events with `sequenceNumber > fromSeq`
   *  immediately after the `project.subscribed` ack.  Used by reconnect
   *  flows (S22 exit criterion #6). */
  readonly fromSeq?: number;
}

export interface EventAppendMessage {
  readonly type: 'event.append';
  readonly payload: {
    readonly projectId: string;
    readonly clientId: string;
    readonly event: CommandEvent;
  };
}

export interface EventsLoadMessage {
  readonly type: 'events.load';
  readonly payload: {
    readonly projectId: string;
    readonly fromSeq: number;
    /** Capped at 500 by the server (S22 D4 spec line 1058). */
    readonly limit?: number;
    /** Set by the client to correlate the response page with the request. */
    readonly cursor?: string;
  };
}

export type ClientMessage =
  | ProjectSubscribeMessage
  | EventAppendMessage
  | EventsLoadMessage;

// ─── Server → client messages ────────────────────────────────────────

export interface ProjectSubscribedMessage {
  readonly type: 'project.subscribed';
  readonly projectId: string;
  /** The highest sequence number already present in the log for this
   *  project — lets the client know whether catch-up replay is needed. */
  readonly latestSeq: number;
}

export interface EventAckMessage {
  readonly type: 'event.ack';
  readonly id: string;
  readonly sequenceNumber: number;
}

export interface EventPushMessage {
  readonly type: 'event.push';
  readonly event: LinearisedEvent;
}

export interface EventsPageMessage {
  readonly type: 'events.page';
  readonly projectId: string;
  readonly events: readonly LinearisedEvent[];
  readonly fromSeq: number;
  /** When the page is full (== limit), the next request should pass
   *  `fromSeq = nextSeq`. */
  readonly nextSeq: number;
  /** True when no more pages remain (the page is shorter than the limit). */
  readonly done: boolean;
  readonly cursor?: string;
}

export interface ErrorMessage {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  /** When the error is a response to a specific client message, echoes
   *  the message id (or event id) so the client can correlate. */
  readonly correlationId?: string;
}

export type ServerMessage =
  | ProjectSubscribedMessage
  | EventAckMessage
  | EventPushMessage
  | EventsPageMessage
  | ErrorMessage;

/** Maximum events returned per `events.load` response.
 *  Spec line 1058 — D4 deliverable. */
export const EVENTS_LOAD_PAGE_LIMIT = 500;

/** Strict parser — returns null when the payload is malformed.  Used by
 *  the WS message handler so a bad frame from one client never crashes
 *  the server. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const t = (json as { type?: unknown }).type;
  if (typeof t !== 'string') return null;
  switch (t) {
    case 'project.subscribe': {
      const m = json as Record<string, unknown>;
      if (typeof m.projectId !== 'string' || m.projectId.length === 0) return null;
      const fromSeq = m.fromSeq;
      if (fromSeq !== undefined && (typeof fromSeq !== 'number' || !Number.isFinite(fromSeq))) {
        return null;
      }
      return {
        type: 'project.subscribe',
        projectId: m.projectId,
        ...(fromSeq !== undefined ? { fromSeq } : {}),
      };
    }
    case 'event.append': {
      const m = json as { payload?: unknown };
      if (typeof m.payload !== 'object' || m.payload === null) return null;
      const p = m.payload as Record<string, unknown>;
      if (typeof p.projectId !== 'string' || typeof p.clientId !== 'string') return null;
      if (typeof p.event !== 'object' || p.event === null) return null;
      const e = p.event as Record<string, unknown>;
      if (typeof e.id !== 'string' || typeof e.type !== 'string' || typeof e.actorId !== 'string') {
        return null;
      }
      return {
        type: 'event.append',
        payload: {
          projectId: p.projectId,
          clientId: p.clientId,
          event: {
            id: e.id,
            type: e.type,
            actorId: e.actorId,
            payload: e.payload,
          },
        },
      };
    }
    case 'events.load': {
      const m = json as { payload?: unknown };
      if (typeof m.payload !== 'object' || m.payload === null) return null;
      const p = m.payload as Record<string, unknown>;
      if (typeof p.projectId !== 'string') return null;
      if (typeof p.fromSeq !== 'number' || !Number.isFinite(p.fromSeq)) return null;
      const limit = p.limit;
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isFinite(limit))) return null;
      const cursor = p.cursor;
      if (cursor !== undefined && typeof cursor !== 'string') return null;
      return {
        type: 'events.load',
        payload: {
          projectId: p.projectId,
          fromSeq: p.fromSeq,
          ...(limit !== undefined ? { limit } : {}),
          ...(cursor !== undefined ? { cursor } : {}),
        },
      };
    }
    default:
      return null;
  }
}
