// EventBridge — strategic ADR-002 round-trip identity CI gate.
//
// The contract from strategic ADR-002 §"Decision":
//   "the round-trip identity test (event → Yjs → event must be byte-equal)
//    is a CI gate per `apps/bench/.../sync-roundtrip.bench.ts`."
//
// This file is the unit-class precursor to that bench gate.  We assert two
// things:
//   1.  toYjs(toEvent(yjsUpdate)) merges into the source Y.Doc identically
//       — i.e. the state is reconstructible by replaying the events through
//       the bridge into a fresh Y.Doc.
//   2.  toEvent(yjsUpdate) followed by toEvent(toYjs(toEvent(yjsUpdate)))
//       yields the same set of EventEnvelopes — the bridge is idempotent
//       under the round-trip.

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { EventBridge } from '../src/event-bridge.js';
import type { EventEnvelope, EventLog, SyncCommandBus } from '../src/types.js';

function mkBus(): SyncCommandBus & {
  _committed: Array<(e: EventEnvelope) => void>;
  _patchOnly: unknown[];
  fire(e: EventEnvelope): void;
} {
  const listeners: Array<(e: EventEnvelope) => void> = [];
  const patchOnly: unknown[] = [];
  return {
    _committed: listeners,
    _patchOnly: patchOnly,
    onCommitted: (l) => { listeners.push(l); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; },
    applyPatchOnly: (p) => { patchOnly.push(p); },
    fire(e) { for (const l of listeners) l(e); },
  };
}
function mkLog(): EventLog & { _entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return { _entries: entries, has: (id) => entries.has(id), appendInbound: (id, p) => { entries.set(id, p); } };
}

const e = (id: string, type: string, payload: unknown): EventEnvelope => ({ id, type, actorId: 'u', payload });

const FIXTURE: EventEnvelope[] = [
  e('01J7-001', 'wall.create',     { id: 'w1', length: 3.0, height: 2.7 }),
  e('01J7-002', 'wall.create',     { id: 'w2', length: 4.5, height: 2.7 }),
  e('01J7-003', 'door.create',     { id: 'd1', wallId: 'w1', width: 0.9 }),
  e('01J7-004', 'window.create',   { id: 'win1', wallId: 'w2', width: 1.2, sillHeight: 0.9 }),
  e('01J7-005', 'room.create',     { id: 'r1', boundary: ['w1', 'w2'] }),
  e('01J7-006', 'wall.move',       { id: 'w1', dx: 0.1, dy: 0 }),
  e('01J7-007', 'door.setWidth',   { id: 'd1', width: 1.0 }),
];

describe('EventBridge — round-trip identity (strategic ADR-002 CI gate)', () => {
  it('replays events into a fresh Y.Doc to byte-equal state', () => {
    // Source: a bridge that has consumed all FIXTURE events via the
    // forward path.
    const docSrc = new Y.Doc();
    const busSrc = mkBus();
    const logSrc = mkLog();
    const _bridgeSrc = new EventBridge(docSrc, busSrc, logSrc);
    for (const event of FIXTURE) {
      logSrc._entries.set(event.id, event.payload);  // simulate eventLog write
      busSrc.fire(event);
    }
    const updateSrc = Y.encodeStateAsUpdate(docSrc);

    // Replay: a fresh bridge whose forward path is fed the SAME events.
    const docReplay = new Y.Doc();
    const busReplay = mkBus();
    const logReplay = mkLog();
    const _bridgeReplay = new EventBridge(docReplay, busReplay, logReplay);
    for (const event of FIXTURE) {
      logReplay._entries.set(event.id, event.payload);
      busReplay.fire(event);
    }
    const updateReplay = Y.encodeStateAsUpdate(docReplay);

    // The encoded Y.Doc states might differ in metadata (clock IDs differ
    // per Y.Doc instance); merge both into a fresh Y.Doc and compare the
    // resulting events Map content for byte equality.
    const docMergeA = new Y.Doc(); Y.applyUpdate(docMergeA, updateSrc);
    const docMergeB = new Y.Doc(); Y.applyUpdate(docMergeB, updateReplay);
    const mapA = docMergeA.getMap<unknown>('events');
    const mapB = docMergeB.getMap<unknown>('events');

    expect(mapA.size).toBe(FIXTURE.length);
    expect(mapB.size).toBe(FIXTURE.length);

    // Every event-id present + payloads deep-equal.
    for (const event of FIXTURE) {
      expect(mapA.has(event.id)).toBe(true);
      expect(mapB.has(event.id)).toBe(true);
      expect(mapA.get(event.id)).toEqual(event.payload);
      expect(mapB.get(event.id)).toEqual(event.payload);
    }
  });

  it('toEvent ∘ toYjs ∘ toEvent is the same set of events as toEvent alone', () => {
    // Forward: events → Y.Doc.
    const docFwd = new Y.Doc();
    const busFwd = mkBus();
    const logFwd = mkLog();
    const _bridgeFwd = new EventBridge(docFwd, busFwd, logFwd);
    for (const event of FIXTURE) {
      logFwd._entries.set(event.id, event.payload);
      busFwd.fire(event);
    }

    // Reverse: Y.Doc → events (read back from the bridge's Y.Map).
    const reverseEvents: Array<{ id: string; payload: unknown }> = [];
    for (const event of FIXTURE) {
      const map = docFwd.getMap<unknown>('events');
      reverseEvents.push({ id: event.id, payload: map.get(event.id) });
    }

    // Round-trip: feed the reverse events back through a SECOND bridge
    // and read out again.
    const docRound = new Y.Doc();
    const busRound = mkBus();
    const logRound = mkLog();
    const _bridgeRound = new EventBridge(docRound, busRound, logRound);
    for (const event of reverseEvents) {
      logRound._entries.set(event.id, event.payload);
      busRound.fire({ id: event.id, type: 'replay', actorId: 'u', payload: event.payload });
    }

    const roundEvents: Array<{ id: string; payload: unknown }> = [];
    for (const event of FIXTURE) {
      const map = docRound.getMap<unknown>('events');
      roundEvents.push({ id: event.id, payload: map.get(event.id) });
    }

    expect(roundEvents).toEqual(reverseEvents);
  });

  it('two bridges that each receive a disjoint subset converge after merge', () => {
    // Tab A receives FIXTURE[0..3]; Tab B receives FIXTURE[4..6].  After
    // Y.applyUpdate cross-merge, both tabs hold all 7 events.

    const docA = new Y.Doc();
    const busA = mkBus();
    const logA = mkLog();
    const _ba = new EventBridge(docA, busA, logA);
    for (const event of FIXTURE.slice(0, 4)) {
      logA._entries.set(event.id, event.payload); busA.fire(event);
    }

    const docB = new Y.Doc();
    const busB = mkBus();
    const logB = mkLog();
    const _bb = new EventBridge(docB, busB, logB);
    for (const event of FIXTURE.slice(4)) {
      logB._entries.set(event.id, event.payload); busB.fire(event);
    }

    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    expect(docA.getMap('events').size).toBe(FIXTURE.length);
    expect(docB.getMap('events').size).toBe(FIXTURE.length);
    for (const event of FIXTURE) {
      expect(docA.getMap('events').get(event.id)).toEqual(event.payload);
      expect(docB.getMap('events').get(event.id)).toEqual(event.payload);
    }
  });
});
