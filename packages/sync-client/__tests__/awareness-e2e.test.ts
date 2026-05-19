// PryzmAwareness — e2e four-peer test (S44 D8).
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` daily plan D8
//   "e2e multi-user awareness test (4 simulated peers)."
//
// The four peers share an in-memory awareness map (the "transport").
// Each peer has its own PryzmAwareness instance, its own ProviderLike
// pointing at the shared map.  We assert:
//   1. After all four peers update their state, every peer sees every
//      other peer's state.
//   2. Activity types: cursor (coalesced), selection (immediate), tool
//      (immediate), view (immediate) — all visible cross-peer.
//   3. Throughput per peer stays under the 5 KB/s budget at a realistic
//      activity rate (10 cursor moves + 1 selection + 1 tool change per sec).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PryzmAwareness, AWARENESS_BYTES_PER_SEC_BUDGET } from '../src/awareness.js';
import type { ProviderLike } from '../src/types.js';

// ─── Shared in-memory transport ────────────────────────────────────────────
//
// Mimics y-protocols/awareness's broadcast model: every setLocalState on
// any peer's provider writes into the shared map keyed by that peer's
// clientID, then fires the 'change' listeners on every peer.

function makeSharedTransport(): {
  makeProvider(clientID: number): ProviderLike;
  states: Map<number, Record<string, unknown>>;
} {
  const states = new Map<number, Record<string, unknown>>();
  const allChangeListeners = new Set<() => void>();

  function makeProvider(clientID: number): ProviderLike {
    const handlers = new Map<string, Set<() => void>>();
    return {
      awareness: {
        clientID,
        setLocalState: (s) => {
          if (s === null) states.delete(clientID);
          else states.set(clientID, s);
          for (const l of allChangeListeners) l();
        },
        getStates: () => states,
        on: (event, fn) => {
          let set = handlers.get(event); if (!set) { set = new Set(); handlers.set(event, set); }
          set.add(fn as () => void);
          if (event === 'change') allChangeListeners.add(fn as () => void);
        },
        off: (event, fn) => {
          handlers.get(event)?.delete(fn as () => void);
          if (event === 'change') allChangeListeners.delete(fn as () => void);
        },
      },
      on: () => {},
      off: () => {},
      destroy: () => { states.delete(clientID); for (const l of allChangeListeners) l(); },
    };
  }

  return { makeProvider, states };
}

const cleanup: PryzmAwareness[] = [];
afterEach(() => { for (const a of cleanup) a.dispose(); cleanup.length = 0; vi.useRealTimers(); });

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PryzmAwareness — e2e four-peer (S44 D8)', () => {
  it('every peer sees every other peer\'s wire state', () => {
    const t = makeSharedTransport();
    const peers = [1, 2, 3, 4].map((id) => {
      const aw = new PryzmAwareness(
        t.makeProvider(id),
        { id: `user-${id}`, displayName: `User ${id}` },
        { initialViewId: id === 1 ? 'main-3d' : id === 2 ? 'plan-L1' : id === 3 ? 'section-A' : 'sheet-1' },
      );
      cleanup.push(aw);
      return aw;
    });
    // Each peer reads the shared map and should see all 4.
    for (const peer of peers) {
      const states = peer.getStates();
      expect(states.size).toBe(4);
      expect([...states.values()].map((s) => s.userId).sort()).toEqual([
        'user-1', 'user-2', 'user-3', 'user-4',
      ]);
    }
  });

  it('cross-peer view + tool + selection visibility (D8 contract)', () => {
    const t = makeSharedTransport();
    const a = new PryzmAwareness(t.makeProvider(1), { id: 'user-1', displayName: 'A' }); cleanup.push(a);
    const b = new PryzmAwareness(t.makeProvider(2), { id: 'user-2', displayName: 'B' }); cleanup.push(b);

    a.setActiveView('plan-L1');
    a.setActiveTool('wall.draw');
    a.setSelection(['w1', 'w2']);

    // B reads A's state and sees the latest values.
    const aStateAsSeenByB = b.getStates().get(1)!;
    expect(aStateAsSeenByB.activeViewId).toBe('plan-L1');
    expect(aStateAsSeenByB.activeTool).toBe('wall.draw');
    expect(aStateAsSeenByB.selection).toEqual(['w1', 'w2']);
  });

  it('cursor visibility crosses the coalesce window', () => {
    vi.useFakeTimers();
    const t = makeSharedTransport();
    const a = new PryzmAwareness(t.makeProvider(1), { id: 'user-1', displayName: 'A' }, { cursorCoalesceMs: 50 }); cleanup.push(a);
    const b = new PryzmAwareness(t.makeProvider(2), { id: 'user-2', displayName: 'B' }); cleanup.push(b);

    for (let i = 0; i < 5; i++) a.setCursor({ x: i, y: i, viewId: 'main-3d' });
    vi.advanceTimersByTime(50);
    const aCursorAsSeenByB = b.getStates().get(1)!.cursor;
    expect(aCursorAsSeenByB).toEqual({ x: 4, y: 4, viewId: 'main-3d' });
  });

  it('per-peer throughput stays under the 5 KB/s budget at realistic activity', () => {
    vi.useFakeTimers();
    const t = makeSharedTransport();
    const peers = [1, 2, 3, 4].map((id) => {
      const aw = new PryzmAwareness(t.makeProvider(id), { id: `u-${id}`, displayName: `U${id}` }, { cursorCoalesceMs: 50 });
      cleanup.push(aw);
      return aw;
    });

    // Realistic activity over 1 second:
    //   • 60 cursor moves (60 Hz mouse) → 20 flushes (50 ms coalesce)
    //   • 1 selection change
    //   • 1 active-tool change
    for (const peer of peers) {
      for (let i = 0; i < 60; i++) {
        peer.setCursor({ x: i, y: i, viewId: 'main-3d' });
        if (i > 0 && i % 3 === 0) vi.advanceTimersByTime(50);  // tick the coalesce window
      }
      peer.setSelection(['w1']);
      peer.setActiveTool('wall.draw');
      peer.flush();
    }

    // Every peer's bytesWritten must be under the 5 KB/s budget.
    for (const peer of peers) {
      const stats = peer.getThroughputStats();
      expect(stats.bytesWritten).toBeLessThan(AWARENESS_BYTES_PER_SEC_BUDGET);
      // Cursor coalescing should have collapsed many sets into far fewer flushes.
      expect(stats.cursorFlushes).toBeLessThan(stats.cursorSetsReceived);
    }
  });

  it('peer dispose drops its presence on the shared map', () => {
    const t = makeSharedTransport();
    const a = new PryzmAwareness(t.makeProvider(1), { id: 'user-1', displayName: 'A' });
    const b = new PryzmAwareness(t.makeProvider(2), { id: 'user-2', displayName: 'B' }); cleanup.push(b);
    expect(b.getStates().size).toBe(2);
    a.setLocalState(null);
    a.dispose();
    expect(b.getStates().size).toBe(1);
  });
});
