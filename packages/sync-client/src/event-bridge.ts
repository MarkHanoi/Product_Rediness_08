// @pryzm/sync-client — EventBridge (the strategic ADR-002 translator at the
// client; S43 D2; ADR-0033 §2.3).
//
// Forward direction:  CommandBus.onCommitted(...) → Y.Map.set(eventId, payload)
// Reverse direction:  Y.Map.observe(...)         → CommandBus.applyPatchOnly(payload)
//
// CRITICAL INVARIANTS (asserted by tests):
//   I1.  The reverse direction MUST NOT cause a re-broadcast.  If it did, the
//        network would loop (inbound event → applyPatchOnly → broadcast → Y.Map.set
//        → Y.Map.observe → applyPatchOnly → broadcast → ...).  We rely on
//        SyncCommandBus.applyPatchOnly to bypass the broadcast hook.
//   I2.  Dedup against the durable log via `EventLog.has(...)` MUST happen
//        BEFORE applyPatchOnly is called.  Otherwise, a peer that re-receives
//        its own commit (because the server echoes back) would apply patches
//        twice.
//   I3.  Inbound events are appended to the durable log via `appendInbound(...)`.
//        This guarantees that if the user reloads the project after the inbound
//        event arrived, the log already contains it (no Yjs replay needed for
//        durability).
//
// The map is keyed by event-ID (a ULID), NOT by sequence number, so out-of-order
// delivery converges without ordering tricks.  Per `[ADR 0019-sync-server-
// linearisation]` the server linearises at the log layer, not the Yjs layer.

import type { Doc as YDoc, YMapEvent, Map as YMap } from 'yjs';
import type {
  EventEnvelope,
  EventId,
  EventLog,
  SyncCommandBus,
} from './types.js';
import { withSpan } from './tracing.js';

const EVENTS_MAP_NAME = 'events';

export class EventBridge {
  private readonly events: YMap<unknown>;
  private readonly disposers: Array<() => void> = [];
  private disposed = false;

  constructor(
    doc: YDoc,
    private readonly commandBus: SyncCommandBus,
    private readonly eventLog: EventLog,
  ) {
    if (typeof commandBus.applyPatchOnly !== 'function') {
      throw new Error(
        '@pryzm/sync-client: SyncCommandBus.applyPatchOnly is missing — ' +
          'this primitive is the S43 hard dependency from ADR-0033 §2.3.  ' +
          '@pryzm/command-bus must expose a non-broadcasting patch path before ' +
          'EventBridge can be constructed.',
      );
    }

    this.events = doc.getMap<unknown>(EVENTS_MAP_NAME);

    // Forward direction.
    const forwardOff = this.commandBus.onCommitted((event) => {
      withSpan(
        'pryzm.sync-client.commit',
        () => {
          // Idempotent: if this same event-id was already set (e.g. the
          // client also received it via the reverse path during a race),
          // Y.Map.set on an equal value is a no-op at the CRDT layer.
          this.events.set(event.id, event.payload);
        },
        { 'pryzm.event.id': event.id, 'pryzm.event.type': event.type },
      );
    });
    this.disposers.push(forwardOff);

    // Reverse direction.
    const observer = (evt: YMapEvent<unknown>): void => {
      if (this.disposed) return;
      withSpan('pryzm.sync-client.inbound', () => {
        for (const key of evt.keysChanged) {
          if (this.eventLog.has(key as EventId)) {
            // Already in the local log — either we just committed it
            // ourselves (forward direction echoed back) or a previous
            // observer pass already handled it.  Skip.
            continue;
          }
          const payload = this.events.get(key);
          if (payload === undefined) {
            // Y.Map.delete arrived for an event-id we never had.  Yjs
            // never deletes from the events map (the log is append-only),
            // so this is a defensive log-and-skip.
            continue;
          }
          this.eventLog.appendInbound(key as EventId, payload);
          this.commandBus.applyPatchOnly(payload);
        }
      }, { 'pryzm.events.key-count': evt.keysChanged.size });
    };
    this.events.observe(observer);
    this.disposers.push(() => this.events.unobserve(observer));
  }

  /** Returns the count of events currently in the Y.Map.  Used by tests
   *  and by the editor's offline indicator (count vs the durable log
   *  count = how far behind we are). */
  size(): number {
    return this.events.size;
  }

  /** Returns true if an event-id is present in the Y.Map.  Mainly for tests. */
  has(eventId: EventId): boolean {
    return this.events.has(eventId);
  }

  /** Snapshot of the current Y.Map contents as a plain JS object.  Used by
   *  the round-trip identity test (the strategic ADR-002 CI gate) and by
   *  tests that need to inspect the bridge state.  O(n) where n = events. */
  snapshot(): Record<EventId, unknown> {
    const out: Record<EventId, unknown> = {};
    for (const [k, v] of this.events.entries()) out[k] = v;
    return out;
  }

  /** Convert a forward-applied event back into an EventEnvelope.  Used by
   *  the round-trip identity test.  We need the bridge to be a pure
   *  function over event-id → payload for this to work; the type field is
   *  reconstructed from the payload by the caller (the bridge does not
   *  inspect payloads). */
  static toEnvelope(id: EventId, payload: unknown, hint: { type: string; actorId: string }): EventEnvelope {
    return { id, payload, type: hint.type, actorId: hint.actorId };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.disposers) {
      try { d(); } catch { /* swallow — disposers must be best-effort */ }
    }
    this.disposers.length = 0;
  }
}
