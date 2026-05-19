// EventBridge — forward + reverse + dedup + non-broadcast invariant
// (S43 D2 / ADR-0033 §2.3).

import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { EventBridge } from '../src/event-bridge.js';
import type { EventEnvelope, EventLog, SyncCommandBus } from '../src/types.js';

// ─── Test doubles ──────────────────────────────────────────────────────────

function makeMockEventLog(): EventLog & { _entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    _entries: entries,
    has: (id) => entries.has(id),
    appendInbound: (id, payload) => { entries.set(id, payload); },
  };
}

interface MockBus extends SyncCommandBus {
  /** The forward-direction listeners attached by EventBridge. */
  readonly _committed: Array<(e: EventEnvelope) => void>;
  /** Every payload that was applied via applyPatchOnly — count + content. */
  readonly _patchOnlyCalls: unknown[];
  /** Helper: simulate a local commit firing through the bridge. */
  fireLocalCommit(e: EventEnvelope): void;
}
function makeMockCommandBus(): MockBus {
  const listeners: Array<(e: EventEnvelope) => void> = [];
  const patchOnlyCalls: unknown[] = [];
  return {
    _committed: listeners,
    _patchOnlyCalls: patchOnlyCalls,
    onCommitted: (listener) => {
      listeners.push(listener);
      return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); };
    },
    applyPatchOnly: (payload) => { patchOnlyCalls.push(payload); },
    fireLocalCommit(e) { for (const l of listeners) l(e); },
  };
}

const ev = (id: string, type: string, payload: unknown): EventEnvelope =>
  ({ id, type, actorId: 'user-1', payload });

const docs: Y.Doc[] = [];
const bridges: EventBridge[] = [];
afterEach(() => {
  for (const b of bridges) b.dispose();
  bridges.length = 0;
  for (const d of docs) d.destroy();
  docs.length = 0;
});

function newPair() {
  const doc = new Y.Doc(); docs.push(doc);
  const bus = makeMockCommandBus();
  const log = makeMockEventLog();
  const bridge = new EventBridge(doc, bus, log); bridges.push(bridge);
  return { doc, bus, log, bridge };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('EventBridge — construction', () => {
  it('throws if commandBus.applyPatchOnly is missing', () => {
    const doc = new Y.Doc(); docs.push(doc);
    const log = makeMockEventLog();
    const badBus = { onCommitted: () => () => {} } as unknown as SyncCommandBus;
    expect(() => new EventBridge(doc, badBus, log)).toThrow(/applyPatchOnly is missing/);
  });

  it('subscribes to commandBus.onCommitted exactly once', () => {
    const { bus } = newPair();
    expect(bus._committed.length).toBe(1);
  });
});

describe('EventBridge — forward direction (local commit → Y.Map.set)', () => {
  it('writes the event to the Y.Map keyed by event-id', () => {
    const { bus, bridge } = newPair();
    bus.fireLocalCommit(ev('evt-001', 'wall.create', { length: 3 }));
    expect(bridge.size()).toBe(1);
    expect(bridge.has('evt-001')).toBe(true);
    expect(bridge.snapshot()).toEqual({ 'evt-001': { length: 3 } });
  });

  it('handles many events without collision', () => {
    const { bus, bridge } = newPair();
    for (let i = 0; i < 50; i++) {
      bus.fireLocalCommit(ev(`evt-${i.toString().padStart(3, '0')}`, 'wall.create', { i }));
    }
    expect(bridge.size()).toBe(50);
  });

  it('Y.Map.set is idempotent on equal value (same event-id committed twice)', () => {
    const { bus, bridge } = newPair();
    const e = ev('evt-007', 'door.create', { width: 0.9 });
    bus.fireLocalCommit(e);
    bus.fireLocalCommit(e);
    expect(bridge.size()).toBe(1);
  });
});

describe('EventBridge — reverse direction (Y.Map.observe → applyPatchOnly)', () => {
  function pairWithDoc() {
    const doc = new Y.Doc(); docs.push(doc);
    const bus = makeMockCommandBus();
    const log = makeMockEventLog();
    const bridge = new EventBridge(doc, bus, log); bridges.push(bridge);
    return { doc, bus, log, bridge };
  }

  it('applies an inbound event via applyPatchOnly', () => {
    const { doc, bus } = pairWithDoc();
    // Simulate an inbound op: set the event from outside the bridge's
    // forward path (e.g. applied by Y.applyUpdate from a peer).
    doc.transact(() => {
      doc.getMap('events').set('inbound-001', { from: 'peer' });
    });
    expect(bus._patchOnlyCalls).toEqual([{ from: 'peer' }]);
  });

  it('appends the inbound event to the durable log', () => {
    const { doc, log } = pairWithDoc();
    doc.transact(() => {
      doc.getMap('events').set('inbound-002', { from: 'peer' });
    });
    expect(log._entries.get('inbound-002')).toEqual({ from: 'peer' });
  });

  it('DEDUP: skips an inbound event that is already in the durable log', () => {
    const { doc, bus, log } = pairWithDoc();
    log._entries.set('already-known', { v: 1 });
    doc.transact(() => {
      doc.getMap('events').set('already-known', { v: 1 });
    });
    expect(bus._patchOnlyCalls).toEqual([]);  // applyPatchOnly NOT called
  });

  it('NON-BROADCAST INVARIANT: forward commit does NOT trigger applyPatchOnly via the reverse path', () => {
    // This is the critical test: if an inbound op were ALSO applied to the
    // local store via applyPatchOnly, we would loop the network.  The
    // forward direction goes to Y.Map.set; the Y.Map observer fires for
    // the same key, but the dedup check (eventLog.has) MUST suppress the
    // applyPatchOnly call because the local commit path already wrote
    // through the normal CommandBus.execute → store-patch flow.
    //
    // For this test we simulate the contract: when the local commit fires,
    // the event-id is ALREADY in the eventLog (because CommandBus.execute
    // wrote it before firing onCommitted).  So the observer should skip.
    const { bus, log } = newPair();
    const e = ev('local-001', 'wall.create', { length: 3 });
    log._entries.set('local-001', e.payload);  // CommandBus.execute wrote this first
    bus.fireLocalCommit(e);
    expect(bus._patchOnlyCalls).toEqual([]);  // observer fired but skipped
  });

  it('skips an inbound op for a key whose value is undefined (defensive)', () => {
    const { doc, bus } = pairWithDoc();
    // Simulate a Y.Map.delete arriving (which the bridge does not support
    // since the events map is append-only).  No applyPatchOnly fire.
    doc.transact(() => {
      doc.getMap('events').set('to-delete', { x: 1 });
    });
    bus._patchOnlyCalls.length = 0;  // reset
    doc.transact(() => {
      doc.getMap('events').delete('to-delete');
    });
    // The observer fires with keysChanged={'to-delete'} but get() returns
    // undefined → bridge skips.  Still no extra applyPatchOnly call.
    expect(bus._patchOnlyCalls).toEqual([]);
  });
});

describe('EventBridge — convergence across two Y.Docs over Y.applyUpdate', () => {
  it('two bridges on two Y.Docs reach the same in-memory state after Y.applyUpdate', () => {
    // This is the smallest possible CRDT-convergence assertion.  It is the
    // unit-class precursor to the chaos harness in apps/sync-server/__tests__/Chaos.test.ts.

    const docA = new Y.Doc(); docs.push(docA);
    const busA = makeMockCommandBus();
    const logA = makeMockEventLog();
    const bridgeA = new EventBridge(docA, busA, logA); bridges.push(bridgeA);

    const docB = new Y.Doc(); docs.push(docB);
    const busB = makeMockCommandBus();
    const logB = makeMockEventLog();
    const bridgeB = new EventBridge(docB, busB, logB); bridges.push(bridgeB);

    // A commits 3 events.  Per the non-broadcast invariant contract, the
    // eventLog is written BEFORE the bridge's forward hook fires (because
    // CommandBus.execute writes the log first, then calls onCommitted).
    // Without this, the local observer would treat its own writes as
    // inbound and invoke applyPatchOnly redundantly.
    const aEvents = [
      ev('a-1', 'wall.create',   { id: 'w1' }),
      ev('a-2', 'door.create',   { id: 'd1' }),
      ev('a-3', 'window.create', { id: 'win1' }),
    ];
    for (const e of aEvents) { logA._entries.set(e.id, e.payload); busA.fireLocalCommit(e); }

    // B commits 2 events.
    const bEvents = [
      ev('b-1', 'room.create', { id: 'r1' }),
      ev('b-2', 'slab.create', { id: 's1' }),
    ];
    for (const e of bEvents) { logB._entries.set(e.id, e.payload); busB.fireLocalCommit(e); }

    // Cross-replicate via Y.applyUpdate.
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    // Both bridges now hold the same 5 events.
    expect(bridgeA.size()).toBe(5);
    expect(bridgeB.size()).toBe(5);
    expect(bridgeA.snapshot()).toEqual(bridgeB.snapshot());

    // Each side's CommandBus.applyPatchOnly was called with the OTHER side's events.
    expect(busA._patchOnlyCalls.length).toBe(2);  // received B's 2
    expect(busB._patchOnlyCalls.length).toBe(3);  // received A's 3
  });
});

describe('EventBridge — dispose', () => {
  it('dispose() removes the observer (subsequent inbound ops do nothing)', () => {
    const { doc, bus, bridge } = newPair();
    bridge.dispose();
    doc.transact(() => {
      doc.getMap('events').set('after-dispose', { x: 1 });
    });
    expect(bus._patchOnlyCalls).toEqual([]);
  });

  it('dispose() is idempotent', () => {
    const { bridge } = newPair();
    bridge.dispose();
    expect(() => bridge.dispose()).not.toThrow();
  });
});
