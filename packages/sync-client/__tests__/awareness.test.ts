// PryzmAwareness — wire-shape stability + per-field setters + coalescing
// (S44 full runtime per spec §S44 line 286-318 + ADR-0033 §2.6).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PryzmAwareness,
  AWARENESS_BYTES_PER_SEC_BUDGET,
  type PryzmAwarenessState,
} from '../src/awareness.js';
import type { ProviderLike } from '../src/types.js';

function makeMockProvider(): ProviderLike & {
  _stored: Map<number, Record<string, unknown>>;
  _local: Record<string, unknown> | null;
  _changeListeners: Set<() => void>;
} {
  const stored = new Map<number, Record<string, unknown>>();
  let local: Record<string, unknown> | null = null;
  const handlers = new Map<string, Set<() => void>>();
  const changeListeners = new Set<() => void>();
  return {
    _stored: stored,
    get _local() { return local; },
    set _local(v: Record<string, unknown> | null) { local = v; },
    _changeListeners: changeListeners,
    awareness: {
      clientID: 1,
      setLocalState: (s) => { local = s; if (s) stored.set(1, s); else stored.delete(1); for (const l of changeListeners) l(); },
      getStates: () => stored,
      on: (event, fn) => {
        let s = handlers.get(event); if (!s) { s = new Set(); handlers.set(event, s); }
        s.add(fn as () => void);
        if (event === 'change') changeListeners.add(fn as () => void);
      },
      off: (event, fn) => {
        handlers.get(event)?.delete(fn as () => void);
        if (event === 'change') changeListeners.delete(fn as () => void);
      },
    },
    on: () => {},
    off: () => {},
    destroy: () => {},
  };
}

const cleanup: PryzmAwareness[] = [];
afterEach(() => {
  for (const a of cleanup) a.dispose();
  cleanup.length = 0;
  vi.useRealTimers();
});

describe('PryzmAwareness — initial state', () => {
  it('writes the spec §S44 wire shape on construction', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'user-1', displayName: 'Alice' });
    cleanup.push(aw);
    const local = provider._local!;
    expect(local).toMatchObject({
      userId: 'user-1',
      displayName: 'Alice',
      cursor: null,
      activeViewId: 'main-3d',
      activeTool: null,
      selection: [],
      heldLocks: [],
    });
    expect(typeof local.lastActivity).toBe('number');
  });

  it('respects the legacy initialViewId positional arg', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'user-1', displayName: 'Alice' }, 'plan-level-1');
    cleanup.push(aw);
    expect(provider._local!.activeViewId).toBe('plan-level-1');
  });

  it('respects the new options bag signature', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'user-1', displayName: 'Alice' }, {
      initialViewId: 'section-A',
      cursorCoalesceMs: 100,
      now: () => 12345,
    });
    cleanup.push(aw);
    expect(provider._local!.activeViewId).toBe('section-A');
    expect(provider._local!.lastActivity).toBe(12345);
  });
});

describe('PryzmAwareness — getStates', () => {
  it('returns a snapshot of all peer states (including self)', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'user-1', displayName: 'Alice' });
    cleanup.push(aw);
    provider._stored.set(2, {
      userId: 'user-2', displayName: 'Bob', cursor: null,
      activeViewId: 'main-3d', activeTool: null, selection: [],
      heldLocks: [], lastActivity: Date.now(),
    });
    const states = aw.getStates();
    expect(states.size).toBe(2);
    expect(states.get(1)?.userId).toBe('user-1');
    expect(states.get(2)?.userId).toBe('user-2');
  });

  it('returns a copy — mutations do not affect provider state', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'user-1', displayName: 'Alice' });
    cleanup.push(aw);
    const states = aw.getStates();
    states.delete(1);
    expect(aw.getStates().size).toBe(1);
  });
});

describe('PryzmAwareness — per-field setters (immediate)', () => {
  it('setSelection updates immediately', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    aw.setSelection(['w1', 'w2']);
    expect(provider._local!.selection).toEqual(['w1', 'w2']);
  });

  it('setSelection is a no-op when the list is unchanged', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    aw.setSelection(['w1']);
    const flushesAfterFirst = aw.getThroughputStats().flushes;
    aw.setSelection(['w1']);
    expect(aw.getThroughputStats().flushes).toBe(flushesAfterFirst);
  });

  it('setActiveTool updates immediately', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    aw.setActiveTool('wall.draw');
    expect(provider._local!.activeTool).toBe('wall.draw');
    aw.setActiveTool(null);
    expect(provider._local!.activeTool).toBeNull();
  });

  it('setActiveView updates immediately AND clears the cursor', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    aw.setCursor({ x: 1, y: 2, viewId: 'main-3d' });
    aw.flush();
    aw.setActiveView('plan-L1');
    expect(provider._local!.activeViewId).toBe('plan-L1');
    expect(provider._local!.cursor).toBeNull();
  });

  it('setHeldLocks updates only when the list changes', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    aw.setHeldLocks(['w1']);
    const after = aw.getThroughputStats().flushes;
    aw.setHeldLocks(['w1']);
    expect(aw.getThroughputStats().flushes).toBe(after);
    aw.setHeldLocks(['w1', 'w2']);
    expect(aw.getThroughputStats().flushes).toBeGreaterThan(after);
  });

  it('every immediate flush bumps lastActivity', () => {
    let now = 1000;
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { now: () => now });
    cleanup.push(aw);
    now = 2000; aw.setSelection(['x']);
    expect(provider._local!.lastActivity).toBe(2000);
    now = 3000; aw.setActiveTool('t');
    expect(provider._local!.lastActivity).toBe(3000);
  });
});

describe('PryzmAwareness — cursor coalescing', () => {
  it('coalesces rapid setCursor calls into a single flush at the window boundary', () => {
    vi.useFakeTimers();
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { cursorCoalesceMs: 50 });
    cleanup.push(aw);
    const baseFlushes = aw.getThroughputStats().flushes;

    for (let i = 0; i < 10; i++) {
      aw.setCursor({ x: i, y: i, viewId: 'main-3d' });
    }
    // No flush yet — still inside the window.
    expect(aw.getThroughputStats().flushes).toBe(baseFlushes);
    expect(aw.getThroughputStats().cursorSetsReceived).toBe(10);

    vi.advanceTimersByTime(50);
    // One flush, carrying the most-recent cursor.
    expect(aw.getThroughputStats().flushes).toBe(baseFlushes + 1);
    expect(aw.getThroughputStats().cursorFlushes).toBe(1);
    expect(provider._local!.cursor).toEqual({ x: 9, y: 9, viewId: 'main-3d' });
  });

  it('a second coalesce burst starts a fresh window', () => {
    vi.useFakeTimers();
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { cursorCoalesceMs: 50 });
    cleanup.push(aw);

    aw.setCursor({ x: 1, y: 1, viewId: 'main-3d' });
    vi.advanceTimersByTime(50);
    aw.setCursor({ x: 2, y: 2, viewId: 'main-3d' });
    vi.advanceTimersByTime(50);
    expect(aw.getThroughputStats().cursorFlushes).toBe(2);
    expect(provider._local!.cursor).toEqual({ x: 2, y: 2, viewId: 'main-3d' });
  });

  it('immediate flush() drains the pending coalesce window', () => {
    vi.useFakeTimers();
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { cursorCoalesceMs: 50 });
    cleanup.push(aw);
    aw.setCursor({ x: 9, y: 9, viewId: 'main-3d' });
    aw.flush();
    expect(provider._local!.cursor).toEqual({ x: 9, y: 9, viewId: 'main-3d' });
    expect(aw.getThroughputStats().cursorFlushes).toBe(1);
  });

  it('null cursor is also coalesced', () => {
    vi.useFakeTimers();
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { cursorCoalesceMs: 50 });
    cleanup.push(aw);
    aw.setCursor({ x: 1, y: 1, viewId: 'main-3d' });
    aw.setCursor(null);
    vi.advanceTimersByTime(50);
    expect(provider._local!.cursor).toBeNull();
  });
});

describe('PryzmAwareness — setLocalState (escape hatch)', () => {
  it('replaces the entire state', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    const next: PryzmAwarenessState = {
      userId: 'u', displayName: 'A',
      cursor: { x: 100, y: 200, viewId: 'main-3d' },
      activeViewId: 'main-3d', activeTool: 'wall.draw',
      selection: ['w1', 'w2'], heldLocks: ['w1'], lastActivity: 12345,
    };
    aw.setLocalState(next);
    expect(provider._local).toMatchObject(next);
  });

  it('passing null clears the local state', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    aw.setLocalState(null);
    expect(provider._local).toBeNull();
  });

  it('cancels any pending cursor coalesce', () => {
    vi.useFakeTimers();
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { cursorCoalesceMs: 50 });
    cleanup.push(aw);
    aw.setCursor({ x: 1, y: 1, viewId: 'main-3d' });
    aw.setLocalState(null);
    vi.advanceTimersByTime(100);  // would have flushed; should NOT.
    expect(provider._local).toBeNull();
  });
});

describe('PryzmAwareness — wire-shape contract (frozen for S45)', () => {
  it('every required field is present', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'user-1', displayName: 'Alice' });
    cleanup.push(aw);
    const keys = Object.keys(provider._local!).sort();
    expect(keys).toEqual([
      'activeTool',
      'activeViewId',
      'cursor',
      'displayName',
      'heldLocks',
      'lastActivity',
      'selection',
      'userId',
    ]);
  });
});

describe('PryzmAwareness — throughput surface', () => {
  it('exports the 5 KB/s/peer budget constant', () => {
    expect(AWARENESS_BYTES_PER_SEC_BUDGET).toBe(5_000);
  });

  it('getThroughputStats reports real counters', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    cleanup.push(aw);
    const initial = aw.getThroughputStats();
    expect(initial.flushes).toBe(1);  // construction flush
    expect(initial.bytesWritten).toBeGreaterThan(0);
    aw.setSelection(['w1']);
    const after = aw.getThroughputStats();
    expect(after.flushes).toBe(2);
    expect(after.bytesWritten).toBeGreaterThan(initial.bytesWritten);
  });
});

describe('PryzmAwareness — dispose', () => {
  it('cancels any pending cursor coalesce', () => {
    vi.useFakeTimers();
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' }, { cursorCoalesceMs: 50 });
    aw.setCursor({ x: 9, y: 9, viewId: 'main-3d' });
    aw.dispose();
    vi.advanceTimersByTime(100);
    expect(provider._local!.cursor).toBeNull();  // never flushed the cursor
  });

  it('subsequent setters are no-ops', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    aw.dispose();
    const before = aw.getThroughputStats().flushes;
    aw.setSelection(['x']);
    aw.setActiveTool('t');
    expect(aw.getThroughputStats().flushes).toBe(before);
  });

  it('dispose is idempotent', () => {
    const provider = makeMockProvider();
    const aw = new PryzmAwareness(provider, { id: 'u', displayName: 'A' });
    aw.dispose();
    expect(() => aw.dispose()).not.toThrow();
  });
});
