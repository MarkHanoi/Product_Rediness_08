// IdleAccumulator unit tests (S15 D5).
//
// Per PHASE-1C §S15 line 563 — 4 tests planned:
//   1. motion-start resets all passes
//   2. pass marked converged is skipped
//   3. all-converged stops idle-continuation
//   4. mixed budgets (16 + 32 + 0) compose correctly

import { describe, it, expect, vi } from 'vitest';
import { IdleAccumulator } from '../src/IdleAccumulator.js';
import type { RenderContext, RenderPass } from '../src/passes/types.js';
import type { TickPriority } from '@pryzm/frame-scheduler';

function fakeCtx(): RenderContext {
  return {
    renderer: {} as any,
    scene: {} as any,
    camera: {} as any,
    width: 256,
    height: 256,
  };
}

interface TestPass extends RenderPass {
  callCount: number;
  resetCount: number;
  /** Behaviour switch: how many frames before render() returns true on its own. */
  convergeAfter: number;
}

function makePass(id: string, idleBudgetFrames: number, convergeAfter = Infinity): TestPass {
  let callCount = 0;
  let resetCount = 0;
  const p: any = {
    id,
    priority: 'post-render' as TickPriority,
    idleBudgetFrames,
    setup: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    onMotionReset() {
      resetCount++;
    },
    render() {
      callCount++;
      return callCount >= convergeAfter;
    },
    get callCount() {
      return callCount;
    },
    get resetCount() {
      return resetCount;
    },
    convergeAfter,
  };
  return p;
}

describe('IdleAccumulator', () => {
  it('motion-start resets all passes (calls onMotionReset on each)', () => {
    const acc = new IdleAccumulator();
    acc.attachContext(fakeCtx());
    const a = makePass('a', 16);
    const b = makePass('b', 32);
    acc.registerPass(a);
    acc.registerPass(b);

    // Tick a few times to bump framesRendered.
    acc.onIdleTick(0);
    acc.onIdleTick(1);
    acc.onIdleTick(2);
    expect(a.callCount).toBe(3);
    expect(b.callCount).toBe(3);

    acc.onMotionStart();
    expect(a.resetCount).toBe(1);
    expect(b.resetCount).toBe(1);

    const snap = acc.snapshot();
    expect(snap.framesSinceMotion).toBe(0);
    expect(snap.passes.every((p) => p.framesRendered === 0 && !p.converged)).toBe(true);
  });

  it('pass marked converged is skipped on subsequent ticks', () => {
    const acc = new IdleAccumulator();
    acc.attachContext(fakeCtx());
    // Bloom-style one-shot — converges after first call.
    const oneShot = makePass('one-shot', 0, 1);
    // Long-budget pass — never converges of its own, capped at 5 frames.
    const long = makePass('long', 5);
    acc.registerPass(oneShot);
    acc.registerPass(long);

    for (let i = 0; i < 10; i++) acc.onIdleTick(i);

    // One-shot was called exactly once (converged frame 1; skipped 2-10).
    expect(oneShot.callCount).toBe(1);
    // Long-budget hit its cap at 5 calls.
    expect(long.callCount).toBe(5);

    const snap = acc.snapshot();
    expect(snap.passes.find((p) => p.id === 'one-shot')!.converged).toBe(true);
    expect(snap.passes.find((p) => p.id === 'long')!.converged).toBe(true);
  });

  it('all-converged stops idle-continuation on the scheduler', () => {
    const stopIdleContinuation = vi.fn();
    const acc = new IdleAccumulator({ scheduler: { stopIdleContinuation } });
    acc.attachContext(fakeCtx());
    const p = makePass('p', 3); // budget 3 → cap-converges after 3 ticks.
    acc.registerPass(p);

    acc.onIdleTick(0);
    expect(stopIdleContinuation).not.toHaveBeenCalled();
    acc.onIdleTick(1);
    expect(stopIdleContinuation).not.toHaveBeenCalled();
    const r3 = acc.onIdleTick(2);
    expect(r3.allConverged).toBe(true);
    expect(stopIdleContinuation).toHaveBeenCalledTimes(1);
  });

  it('mixed budgets (16 + 32 + 0) compose correctly per ADR-0014', () => {
    const stopIdleContinuation = vi.fn();
    const acc = new IdleAccumulator({ scheduler: { stopIdleContinuation } });
    acc.attachContext(fakeCtx());
    const bloom = makePass('bloom', 0, 1); // one-shot → converges frame 1.
    const traa = makePass('traa', 16); // 16-frame cap.
    const ssgi = makePass('ssgi', 32); // 32-frame cap.
    acc.registerPass(bloom);
    acc.registerPass(traa);
    acc.registerPass(ssgi);

    // Run 32 idle ticks — SSGI's cap should be the gate.
    for (let i = 0; i < 32; i++) acc.onIdleTick(i);

    expect(bloom.callCount).toBe(1); // one-shot, only ran on frame 0.
    expect(traa.callCount).toBe(16); // cap hit.
    expect(ssgi.callCount).toBe(32); // cap hit.
    expect(stopIdleContinuation).toHaveBeenCalledTimes(1);

    const snap = acc.snapshot();
    expect(snap.passes.every((p) => p.converged)).toBe(true);
  });

  it('with no scheduler attached, falls back to inert behaviour (no throw)', () => {
    const acc = new IdleAccumulator();
    acc.attachContext(fakeCtx());
    const p = makePass('p', 1);
    acc.registerPass(p);
    expect(() => acc.onIdleTick(0)).not.toThrow();
  });

  it('with no context attached, treats every pass as converged immediately', () => {
    const acc = new IdleAccumulator();
    const p = makePass('p', 5);
    acc.registerPass(p);
    const r = acc.onIdleTick(0);
    expect(r.passesRendered).toEqual([]);
    expect(r.allConverged).toBe(true);
    expect(p.callCount).toBe(0); // never called without a context.
  });
});
