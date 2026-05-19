// LockBadgeRenderer + collectBadgeEntries — unit tests (S45 D4).
//
// Mirrors plugins/multiplayer/__tests__/cursor.test.ts harness pattern:
// faked PryzmAwareness with a static Map; spy CanvasRenderingContext2D
// captures every paint call so we can assert which badges were painted
// in what order and what colors were used.

import { describe, expect, it } from 'vitest';
import {
  LockBadgeRenderer,
  collectBadgeEntries,
  type ElementBbox,
} from '../src/lock-ui.js';
import { peerColorFor } from '../src/cursor.js';
import type { PryzmAwareness, PryzmAwarenessState } from '@pryzm/plugin-sdk';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const peer = (over: Partial<PryzmAwarenessState>): PryzmAwarenessState => ({
  userId: 'u', displayName: 'U', cursor: null, activeViewId: 'main-3d',
  activeTool: null, selection: [], heldLocks: [], lastActivity: 0,
  ...over,
});

function fakeAwareness(map: Map<number, PryzmAwarenessState>): PryzmAwareness {
  return { getStates: () => map, on: () => () => {} } as unknown as PryzmAwareness;
}

type Call = { method: string; args: unknown[] };
function makeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 7 } as TextMetrics);
      return (...args: unknown[]) => { calls.push({ method: String(prop), args }); };
    },
    set(_t, prop: string, value: unknown) {
      calls.push({ method: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });
  return { ctx, calls };
}

const bbox = (minX: number, minY: number, maxX: number, maxY: number): ElementBbox =>
  ({ minX, minY, maxX, maxY });

// ─── collectBadgeEntries ────────────────────────────────────────────────────

describe('collectBadgeEntries', () => {
  it('returns one entry per locked element from peers other than self', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self', displayName: 'Me' })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-1', 'wall-2'] })],
      [3, peer({ userId: 'u-alice', displayName: 'Alice', heldLocks: ['door-1'] })],
    ]);
    const entries = collectBadgeEntries(fakeAwareness(states), 'main-3d', /* localClientID */ 1);
    expect(entries.map(e => e.elementId)).toEqual(['door-1', 'wall-1', 'wall-2']);
    expect(entries.find(e => e.elementId === 'door-1')?.holderDisplayName).toBe('Alice');
  });

  it('skips locks held by self (by clientID match)', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self', displayName: 'Me', heldLocks: ['wall-1'] })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-2'] })],
    ]);
    const entries = collectBadgeEntries(fakeAwareness(states), 'main-3d', 1);
    expect(entries.map(e => e.elementId)).toEqual(['wall-2']);
  });

  it('skips locks held by self even on a stale clientID (userId match)', () => {
    // Reconnect scenario: same user appears on a different clientID; we should
    // still skip the entry by userId because the local LockManager has the
    // authoritative held-locks list.
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self', displayName: 'Me' })],
      [99, peer({ userId: 'u-self', displayName: 'Me (old session)', heldLocks: ['wall-1'] })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-2'] })],
    ]);
    const entries = collectBadgeEntries(fakeAwareness(states), 'main-3d', 1);
    expect(entries.map(e => e.elementId)).toEqual(['wall-2']);
  });

  it('dedups overlapping locks (single badge per element)', () => {
    // Should not happen on the wire (server enforces UNIQUE(element_id))
    // but defensive on the client side.
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self', displayName: 'Me' })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-1'] })],
      [3, peer({ userId: 'u-alice', displayName: 'Alice', heldLocks: ['wall-1'] })],
    ]);
    const entries = collectBadgeEntries(fakeAwareness(states), 'main-3d', 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].elementId).toBe('wall-1');
  });

  it('returns empty when no peers hold locks', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self' })],
      [2, peer({ userId: 'u-bob' })],
    ]);
    expect(collectBadgeEntries(fakeAwareness(states), 'main-3d', 1)).toEqual([]);
  });
});

// ─── LockBadgeRenderer.render ──────────────────────────────────────────────

describe('LockBadgeRenderer.render', () => {
  it('paints one badge per resolvable bbox', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self' })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-1', 'wall-2'] })],
    ]);
    const r = new LockBadgeRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx } = makeCtx();
    const resolver = (id: string) => id === 'wall-1' ? bbox(0, 0, 100, 50) : bbox(120, 0, 200, 60);
    const painted = r.render(ctx, fakeAwareness(states), resolver);
    expect(painted).toBe(2);
  });

  it('skips elements whose bbox resolver returns null (not in this view)', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self' })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-1', 'wall-other-view'] })],
    ]);
    const r = new LockBadgeRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx } = makeCtx();
    const resolver = (id: string) => id === 'wall-1' ? bbox(0, 0, 100, 50) : null;
    expect(r.render(ctx, fakeAwareness(states), resolver)).toBe(1);
  });

  it('uses the holder peer color (matches peerColorFor)', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'u-self' })],
      [2, peer({ userId: 'u-bob', displayName: 'Bob', heldLocks: ['wall-1'] })],
    ]);
    const r = new LockBadgeRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx, calls } = makeCtx();
    r.render(ctx, fakeAwareness(states), () => bbox(0, 0, 100, 50));
    const fillStyleSets = calls.filter(c => c.method === 'set:fillStyle' || c.method === 'set:strokeStyle');
    const expected = peerColorFor('u-bob');
    expect(fillStyleSets.some(c => c.args[0] === expected)).toBe(true);
  });
});
