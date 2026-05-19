// S03-T2 — verifies the IdleContinuation 30-frame budget per ADR-006.
// Exit criteria from `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 397:
//   • Bouncing-cube demo: 60 fps interaction, 0 fps idle.
// Translated to a deterministic test:
//   • While dirty/queued, the loop keeps pumping at 60 fps.
//   • When the scene clears, the scheduler runs exactly N more frames
//     (N = IDLE_CONTINUATION_FRAMES = 30) and then stops.
//   • markDirty() / requestFrame() resume immediately.

import { describe, expect, it } from 'vitest';
import {
  FakeRafAdapter,
  FrameScheduler,
  IDLE_CONTINUATION_FRAMES,
  IdleContinuation,
} from '../src/index.js';

describe('IdleContinuation (unit)', () => {
  it('starts at IDLE_CONTINUATION_FRAMES (30)', () => {
    const idle = new IdleContinuation();
    expect(idle.budget).toBe(IDLE_CONTINUATION_FRAMES);
    expect(idle.budget).toBe(30);
    expect(idle.exhausted).toBe(false);
  });

  it('consume() decrements; reaches 0 after exactly N calls', () => {
    const idle = new IdleContinuation();
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES - 1; i++) idle.consume();
    expect(idle.budget).toBe(1);
    expect(idle.exhausted).toBe(false);
    const last = idle.consume();
    expect(last).toBe(0);
    expect(idle.exhausted).toBe(true);
  });

  it('consume() at zero stays at zero', () => {
    const idle = new IdleContinuation();
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES + 5; i++) idle.consume();
    expect(idle.budget).toBe(0);
    expect(idle.exhausted).toBe(true);
  });

  it('reset() restores the full budget', () => {
    const idle = new IdleContinuation();
    for (let i = 0; i < 10; i++) idle.consume();
    expect(idle.budget).toBe(20);
    idle.reset();
    expect(idle.budget).toBe(30);
    expect(idle.exhausted).toBe(false);
  });
});

describe('FrameScheduler — idle continuation gate (S03-T2)', () => {
  it('idle scene stops the rAF loop after exactly 30 tail frames', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    // Tick 30 more frames — the budget hits 0 on the 30th tick.
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES; i++) {
      expect(s.isRunning).toBe(true);
      adapter.advanceTime(16);
      adapter.pump();
    }
    // After the 30th idle frame, scheduler must have stopped.
    expect(s.isRunning).toBe(false);
    expect(s.idleBudgetRemaining()).toBe(0);
    expect(s.totalTicks()).toBe(IDLE_CONTINUATION_FRAMES);
  });

  it('busy scene (markDirty present) keeps the loop running indefinitely', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.markDirty('camera');
    s.start(adapter);
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES * 3; i++) {
      adapter.advanceTime(16);
      adapter.pump();
      expect(s.isRunning).toBe(true);
      expect(s.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES);
    }
    s.stop();
  });

  it('queued frame requests keep the loop running until they drain', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    s.requestFrame('a', 'interaction');
    // First tick: drains the request, budget stays at max.
    adapter.advanceTime(16); adapter.pump();
    expect(s.isRunning).toBe(true);
    expect(s.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES);
    expect(s.getPending()).toHaveLength(0);
    // Subsequent idle ticks decrement the budget.
    adapter.advanceTime(16); adapter.pump();
    expect(s.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES - 1);
    s.stop();
  });

  it('markDirty during the idle window resets the budget and keeps pumping', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    // Burn 10 frames of idle.
    for (let i = 0; i < 10; i++) { adapter.advanceTime(16); adapter.pump(); }
    expect(s.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES - 10);
    s.markDirty('camera');
    expect(s.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES);
    expect(s.isRunning).toBe(true);
    s.stop();
  });

  it('after exhaustion, markDirty resumes the loop with a fresh budget', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES + 5; i++) {
      adapter.advanceTime(16); adapter.pump();
    }
    expect(s.isRunning).toBe(false);
    s.markDirty('user-input');
    expect(s.isRunning).toBe(true);
    expect(s.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES);
    // The producer clears the dirty flag once it has handled the
    // wake-up — per ADR-006 dirty flags persist until `clearDirty`.
    s.clearDirty('user-input');
    // The next 30 idle ticks tail the budget down to 0.
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES; i++) {
      expect(s.isRunning).toBe(true);
      adapter.advanceTime(16); adapter.pump();
    }
    expect(s.isRunning).toBe(false);
  });

  it('listeners are called for each of the 30 tail frames before stop', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    let calls = 0;
    s.addTickListener('counter', () => { calls++; }, 'render');
    s.start(adapter);
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES + 5; i++) {
      adapter.advanceTime(16); adapter.pump();
    }
    // Loop ran for exactly 30 frames before stopping; subsequent pumps had no callback.
    expect(calls).toBe(IDLE_CONTINUATION_FRAMES);
    expect(s.isRunning).toBe(false);
  });

  it('pure idle from the start: 30 ticks total, then stop', () => {
    const s = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    s.start(adapter);
    expect(s.totalTicks()).toBe(0);
    // Pump generously past the budget.
    for (let i = 0; i < 100; i++) {
      adapter.advanceTime(16);
      adapter.pump();
    }
    expect(s.totalTicks()).toBe(IDLE_CONTINUATION_FRAMES);
    expect(s.isRunning).toBe(false);
  });
});
