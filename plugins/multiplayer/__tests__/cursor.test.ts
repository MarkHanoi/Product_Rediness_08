// CursorRenderer + peerColorFor unit tests (S44 D2-D3).
//
// We use happy-dom for the canvas surface; the actual paint primitives
// are recorded via a stub CanvasRenderingContext2D so we can assert
// (a) which peers got painted, (b) what colors were used, (c) that the
// cursor was skipped under the various gating rules (self / wrong view /
// no cursor).

import { describe, expect, it } from 'vitest';
import { CursorRenderer, peerColorFor } from '../src/cursor.js';
import type { PryzmAwareness, PryzmAwarenessState } from '@pryzm/plugin-sdk';

// ─── A spy Canvas2D context ────────────────────────────────────────────────

type Call = { method: string; args: unknown[] };

function makeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop: string) {
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 7 } as TextMetrics);
      // Returning a function that records the call.  Property reads (e.g.
      // `ctx.fillStyle = 'x'`) go through `set`.
      return (...args: unknown[]) => { calls.push({ method: String(prop), args }); };
    },
    set(_target, prop: string, value: unknown) {
      calls.push({ method: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });
  return { ctx, calls };
}

// ─── A faked PryzmAwareness ────────────────────────────────────────────────

function fakeAwareness(map: Map<number, PryzmAwarenessState>): PryzmAwareness {
  return {
    getStates: () => map,
    on: () => () => {},
  } as unknown as PryzmAwareness;
}

const peer = (over: Partial<PryzmAwarenessState> = {}): PryzmAwarenessState => ({
  userId: 'u',
  displayName: 'U',
  cursor: { x: 10, y: 10, viewId: 'main-3d' },
  activeViewId: 'main-3d',
  activeTool: null,
  selection: [],
  heldLocks: [],
  lastActivity: Date.now(),
  ...over,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('peerColorFor — deterministic per userId', () => {
  it('same userId → same color', () => {
    expect(peerColorFor('user-1')).toBe(peerColorFor('user-1'));
  });

  it('different userIds → (almost always) different colors', () => {
    const colors = new Set([
      peerColorFor('user-1'),
      peerColorFor('user-2'),
      peerColorFor('user-3'),
      peerColorFor('alice'),
      peerColorFor('bob'),
    ]);
    // 5 inputs; HSL hue space is 360 wide; collisions extremely unlikely.
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  it('returns a well-formed hsl(...) string', () => {
    // Comma-separated legacy form for happy-dom + older parser compatibility.
    expect(peerColorFor('any-user')).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });
});

describe('CursorRenderer — gating rules', () => {
  it('skips self', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [1, peer({ userId: 'self' })],
    ]);
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx } = makeCtx();
    expect(r.render(ctx, fakeAwareness(states))).toBe(0);
  });

  it('skips peers in a different view', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [2, peer({ userId: 'other', activeViewId: 'plan-L1' })],
    ]);
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx } = makeCtx();
    expect(r.render(ctx, fakeAwareness(states))).toBe(0);
  });

  it('skips peers with null cursor', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [2, peer({ userId: 'other', cursor: null })],
    ]);
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx } = makeCtx();
    expect(r.render(ctx, fakeAwareness(states))).toBe(0);
  });

  it('paints peers in the same view', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [2, peer({ userId: 'other' })],
      [3, peer({ userId: 'third' })],
    ]);
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx, calls } = makeCtx();
    expect(r.render(ctx, fakeAwareness(states))).toBe(2);
    expect(calls.some((c) => c.method === 'fill')).toBe(true);
  });
});

describe('CursorRenderer — multi-view fan-out (ADR-0025)', () => {
  it('one renderer per view paints exactly the peers whose activeViewId matches', () => {
    const states = new Map<number, PryzmAwarenessState>([
      [2, peer({ userId: 'a', activeViewId: 'main-3d' })],
      [3, peer({ userId: 'b', activeViewId: 'plan-L1' })],
      [4, peer({ userId: 'c', activeViewId: 'section-A' })],
      [5, peer({ userId: 'd', activeViewId: 'sheet-1' })],
    ]);
    const r3d = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const rPlan = new CursorRenderer({ viewId: 'plan-L1', localClientID: 1 });
    const rSection = new CursorRenderer({ viewId: 'section-A', localClientID: 1 });
    const rSheet = new CursorRenderer({ viewId: 'sheet-1', localClientID: 1 });
    const aw = fakeAwareness(states);
    expect(r3d.render(makeCtx().ctx, aw)).toBe(1);
    expect(rPlan.render(makeCtx().ctx, aw)).toBe(1);
    expect(rSection.render(makeCtx().ctx, aw)).toBe(1);
    expect(rSheet.render(makeCtx().ctx, aw)).toBe(1);
  });

  it('peer view-change moves their cursor between renderers within one frame', () => {
    const initial = peer({ userId: 'mover', activeViewId: 'main-3d' });
    const states = new Map<number, PryzmAwarenessState>([[2, initial]]);
    const r3d = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const rPlan = new CursorRenderer({ viewId: 'plan-L1', localClientID: 1 });
    const aw = fakeAwareness(states);
    expect(r3d.render(makeCtx().ctx, aw)).toBe(1);
    expect(rPlan.render(makeCtx().ctx, aw)).toBe(0);
    // Peer switches views.
    states.set(2, peer({ userId: 'mover', activeViewId: 'plan-L1' }));
    expect(r3d.render(makeCtx().ctx, aw)).toBe(0);
    expect(rPlan.render(makeCtx().ctx, aw)).toBe(1);
  });
});

describe('CursorRenderer — idle fade', () => {
  it('fades cursor of a peer whose lastActivity is past idle threshold', () => {
    const now = 100_000;
    const states = new Map<number, PryzmAwarenessState>([
      [2, peer({ userId: 'idle', lastActivity: 0 })],  // 100s old at "now"
    ]);
    const r = new CursorRenderer(
      { viewId: 'main-3d', localClientID: 1 },
      { idleThresholdMs: 30_000, now: () => now },
    );
    const { ctx, calls } = makeCtx();
    r.render(ctx, fakeAwareness(states));
    const alphaSet = calls.find((c) => c.method === 'set:globalAlpha');
    expect(alphaSet?.args[0]).toBe(0.3);
  });

  it('does NOT fade a recently-active peer', () => {
    const now = 100_000;
    const states = new Map<number, PryzmAwarenessState>([
      [2, peer({ userId: 'fresh', lastActivity: now - 1000 })],
    ]);
    const r = new CursorRenderer(
      { viewId: 'main-3d', localClientID: 1 },
      { idleThresholdMs: 30_000, now: () => now },
    );
    const { ctx, calls } = makeCtx();
    r.render(ctx, fakeAwareness(states));
    const alphaSet = calls.find((c) => c.method === 'set:globalAlpha');
    expect(alphaSet?.args[0]).toBe(1.0);
  });
});

describe('CursorRenderer — drawCursor primitive', () => {
  it('writes peer color into fillStyle', () => {
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx, calls } = makeCtx();
    r.drawCursor(ctx, 10, 20, 'Alice', 'hsl(123 70% 50%)', 1.0);
    const fillStyleSets = calls.filter((c) => c.method === 'set:fillStyle');
    expect(fillStyleSets.some((c) => c.args[0] === 'hsl(123 70% 50%)')).toBe(true);
  });

  it('writes the peer label as text', () => {
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx, calls } = makeCtx();
    r.drawCursor(ctx, 10, 20, 'Alice', 'red', 1.0);
    const fillTextCalls = calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls.length).toBeGreaterThan(0);
    expect(fillTextCalls[0]!.args[0]).toBe('Alice');
  });

  it('save/restore wrapping is balanced', () => {
    const r = new CursorRenderer({ viewId: 'main-3d', localClientID: 1 });
    const { ctx, calls } = makeCtx();
    r.drawCursor(ctx, 0, 0, 'X', 'red', 1.0);
    const saves = calls.filter((c) => c.method === 'save').length;
    const restores = calls.filter((c) => c.method === 'restore').length;
    expect(saves).toBe(restores);
    expect(saves).toBeGreaterThan(0);
  });
});
