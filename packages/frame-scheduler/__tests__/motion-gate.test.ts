// FrameScheduler motion-gate tests (S17-T6).
//
// `beginMotion()` / `endMotion()` MUST be additive — every existing
// idle-continuation invariant continues to hold for callers that don't
// touch the motion API.  See ADR-0016 §"Camera animation under the
// FrameScheduler motion gate".

import { describe, expect, it } from 'vitest';
import {
  FakeRafAdapter,
  FrameScheduler,
  IDLE_CONTINUATION_FRAMES,
} from '../src/index.js';

describe('FrameScheduler motion gate (S17-T6)', () => {
  it('beginMotion suppresses idle exhaustion; endMotion lets idle window resume', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    s.beginMotion();
    expect(s.isInMotion()).toBe(true);

    // Run 3× the normal idle budget — loop must NOT stop while in motion.
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES * 3; i++) {
      adapter.advanceTime(16);
      adapter.pump();
      expect(s.isRunning).toBe(true);
    }

    // End motion → next idle window should exhaust normally.
    s.endMotion();
    expect(s.isInMotion()).toBe(false);
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES; i++) {
      adapter.advanceTime(16);
      adapter.pump();
    }
    expect(s.isRunning).toBe(false);
    expect(s.idleBudgetRemaining()).toBe(0);
  });

  it('onMotionStart subscribers fire on every beginMotion call (incl. re-entrant)', () => {
    const s = new FrameScheduler();
    let count = 0;
    const dispose = s.onMotionStart(() => {
      count++;
    });
    s.beginMotion();
    s.beginMotion(); // re-entrant — must still notify (IdleAccumulator restart)
    expect(count).toBe(2);
    dispose();
    s.endMotion();
    s.beginMotion();
    expect(count).toBe(2); // disposer worked
  });
});
