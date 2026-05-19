// S03-T1 — verifies the rAF pump (`start`/`stop`/`isRunning`/`cancelFrame`)
// and the `addTickListener` registry runs in `TickPriority` order.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 351.

import { describe, expect, it, vi } from 'vitest';
import {
  FakeRafAdapter,
  FrameScheduler,
  IDLE_CONTINUATION_FRAMES,
  TICK_PRIORITIES,
  type TickPriority,
} from '../src/index.js';

describe('FrameScheduler — rAF pump (S03-T1)', () => {
  it('start() sets isRunning; stop() clears it', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    expect(s.isRunning).toBe(false);
    s.start(adapter);
    expect(s.isRunning).toBe(true);
    s.stop();
    expect(s.isRunning).toBe(false);
  });

  it('start() is idempotent — second call while running is a no-op', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    const firstPending = adapter.pendingCount();
    s.start(adapter);
    // Second start() must not enqueue a duplicate rAF callback.
    expect(adapter.pendingCount()).toBe(firstPending);
    s.stop();
  });

  it('stop() cancels the in-flight rAF handle', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    expect(adapter.pendingCount()).toBe(1);
    s.stop();
    expect(adapter.pendingCount()).toBe(0);
  });

  it('pump() drives _tick — drainSync runs, dirty flags cleared by drain logic stay (drain reads, never clears)', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.markDirty('camera');
    s.requestFrame('paint', 'interaction');
    s.start(adapter);
    adapter.advanceTime(16);
    adapter.pump();
    // Queue is drained inside _tick.
    expect(s.getPending()).toHaveLength(0);
    // Dirty flag persists — only the producer that set it knows when it's clean.
    expect(s.isDirty('camera')).toBe(true);
    s.stop();
  });

  it('cancelFrame removes a pending request by token', () => {
    const s = new FrameScheduler();
    const t1 = s.requestFrame('a', 'idle');
    const t2 = s.requestFrame('b', 'idle');
    expect(s.getPending()).toHaveLength(2);
    expect(s.cancelFrame(t1)).toBe(true);
    expect(s.getPending()).toHaveLength(1);
    expect(s.getPending()[0]!.id).toBe(t2);
  });

  it('cancelFrame returns false for an unknown token', () => {
    const s = new FrameScheduler();
    s.requestFrame('a', 'idle');
    expect(s.cancelFrame('does-not-exist')).toBe(false);
    expect(s.getPending()).toHaveLength(1);
  });
});

describe('FrameScheduler — addTickListener (S03-T1)', () => {
  it('listeners run in TickPriority order on every tick', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const order: TickPriority[] = [];
    // Register OUT of order — the scheduler must still execute in TickPriority order.
    s.addTickListener('overlay', () => order.push('overlay'), 'overlay');
    s.addTickListener('post', () => order.push('post-render'), 'post-render');
    s.addTickListener('pre', () => order.push('pre-render'), 'pre-render');
    s.addTickListener('render', () => order.push('render'), 'render');
    // markDirty so the loop has work and doesn't enter idle on first tick.
    s.markDirty('test');
    s.start(adapter);
    adapter.advanceTime(16);
    adapter.pump();
    expect(order).toEqual([...TICK_PRIORITIES]);
    s.stop();
  });

  it('disposer removes the listener', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const cb = vi.fn();
    const dispose = s.addTickListener('foo', cb, 'render');
    s.markDirty('test');
    s.start(adapter);
    adapter.advanceTime(16); adapter.pump();
    expect(cb).toHaveBeenCalledTimes(1);
    dispose();
    s.markDirty('test2');
    adapter.advanceTime(16); adapter.pump();
    expect(cb).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it('passes deltaMs to listeners', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    adapter.setNow(0);
    const deltas: number[] = [];
    s.addTickListener('t', (_now, dt) => deltas.push(dt), 'render');
    s.markDirty('keep-busy');
    s.start(adapter);
    adapter.advanceTime(16); adapter.pump();
    adapter.advanceTime(20); adapter.pump();
    expect(deltas[0]).toBeGreaterThan(0);
    expect(deltas[1]).toBeCloseTo(20, 0);
    s.stop();
  });

  it('throws on duplicate listener id', () => {
    const s = new FrameScheduler();
    s.addTickListener('dup', () => {}, 'render');
    expect(() => s.addTickListener('dup', () => {}, 'render')).toThrow(/duplicate id/);
  });

  it('a listener that throws is logged but does not break the loop', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    s.addTickListener('bad', () => { throw new Error('boom'); }, 'render');
    let goodCalls = 0;
    s.addTickListener('good', () => { goodCalls++; }, 'overlay');
    s.markDirty('keep-busy');
    s.start(adapter);
    adapter.advanceTime(16); adapter.pump();
    expect(consoleErr).toHaveBeenCalled();
    expect(goodCalls).toBe(1);
    consoleErr.mockRestore();
    s.stop();
  });

  it('addTickListener wakes the loop if it had stopped', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    // Run past idle continuation to force stop.
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES + 1; i++) {
      adapter.advanceTime(16); adapter.pump();
    }
    expect(s.isRunning).toBe(false);
    s.addTickListener('late', () => {}, 'render');
    expect(s.isRunning).toBe(true);
    s.stop();
  });
});

describe('FrameScheduler — wake semantics (S03)', () => {
  it('markDirty wakes the loop when the adapter is known but loop is stopped', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    // Drive past idle continuation to force stop.
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES + 1; i++) {
      adapter.advanceTime(16); adapter.pump();
    }
    expect(s.isRunning).toBe(false);
    s.markDirty('user-input');
    expect(s.isRunning).toBe(true);
    s.stop();
  });

  it('requestFrame wakes the loop when stopped', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES + 1; i++) {
      adapter.advanceTime(16); adapter.pump();
    }
    expect(s.isRunning).toBe(false);
    s.requestFrame('input', 'interaction');
    expect(s.isRunning).toBe(true);
    s.stop();
  });

  it('markDirty does NOT wake the loop if start() was never called (S02 compat)', () => {
    // The S02 data-structure tests use FrameScheduler without calling start() —
    // markDirty must remain a pure data-structure mutation in that mode.
    const s = new FrameScheduler();
    s.markDirty('x');
    expect(s.isRunning).toBe(false);
  });
});
