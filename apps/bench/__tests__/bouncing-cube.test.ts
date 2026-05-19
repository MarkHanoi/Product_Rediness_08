// S03-T3 — Bouncing-cube demo correctness.
//
// These tests are NOT bench harness — they verify that the demo
// (`apps/bench/src/demos/bouncing-cube.ts`) drives the scheduler
// through the busy → settle → idle → stop curve required by the
// S03 exit criterion ("60 fps interaction, 0 fps idle" — spec
// `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 411).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  FakeRafAdapter,
  FrameScheduler,
  IDLE_CONTINUATION_FRAMES,
} from '@pryzm/frame-scheduler';
import {
  BouncingCube,
  CUBE_DIRTY_FLAG,
  CUBE_TICK_LISTENER_ID,
  FLOOR_Y,
} from '../src/demos/bouncing-cube.js';

const FRAME_MS = 1000 / 60;

describe('BouncingCube demo (S03-T3)', () => {
  it('attach() registers a single tick listener with the scheduler', () => {
    const scheduler = new FrameScheduler();
    const cube = new BouncingCube();
    expect(scheduler.tickListenerCount()).toBe(0);
    cube.attach(scheduler);
    expect(scheduler.tickListenerCount()).toBe(1);
  });

  it('attach() is idempotent — re-attaching to the same scheduler keeps one listener', () => {
    const scheduler = new FrameScheduler();
    const cube = new BouncingCube();
    cube.attach(scheduler);
    cube.attach(scheduler);
    expect(scheduler.tickListenerCount()).toBe(1);
  });

  it('detach() removes the listener', () => {
    const scheduler = new FrameScheduler();
    const cube = new BouncingCube();
    cube.attach(scheduler);
    cube.detach();
    expect(scheduler.tickListenerCount()).toBe(0);
  });

  it('flick() marks the dirty flag, settles to clearDirty', () => {
    const scheduler = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const cube = new BouncingCube({
      size: 1,
      startPosition: new THREE.Vector3(0, 5, 0),
    });
    cube.attach(scheduler);
    scheduler.start(adapter);

    cube.flick(new THREE.Vector3(2, 6, 1));
    // After flick, the dirty flag is set immediately (the producer has
    // declared "I have work to do this frame").
    expect(scheduler.isDirty(CUBE_DIRTY_FLAG)).toBe(true);

    // Pump until rest, with a generous safety cap.
    for (let i = 0; i < 10_000; i++) {
      if (cube.isAtRest()) break;
      adapter.advanceTime(FRAME_MS);
      adapter.pump();
    }
    expect(cube.isAtRest()).toBe(true);
    // Settled — dirty flag has been explicitly cleared.
    expect(scheduler.isDirty(CUBE_DIRTY_FLAG)).toBe(false);
  });

  it('cube ends physically resting on the floor (y = floor + halfSize)', () => {
    const scheduler = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const cube = new BouncingCube({
      size: 1,
      startPosition: new THREE.Vector3(0, 5, 0),
    });
    cube.attach(scheduler);
    scheduler.start(adapter);
    cube.flick(new THREE.Vector3(2, 6, 1));
    for (let i = 0; i < 10_000; i++) {
      if (cube.isAtRest()) break;
      adapter.advanceTime(FRAME_MS);
      adapter.pump();
    }
    const snap = cube.snapshot();
    expect(snap.position.y).toBeCloseTo(FLOOR_Y + cube.halfSize, 3);
    expect(snap.velocity.lengthSq()).toBe(0);
    expect(snap.bounceCount).toBeGreaterThan(0);
  });

  it('end-to-end: flick → settle → 30-frame tail → 0 fps idle', () => {
    const scheduler = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const cube = new BouncingCube({
      size: 1,
      startPosition: new THREE.Vector3(0, 5, 0),
    });
    cube.attach(scheduler);
    scheduler.start(adapter);
    cube.flick(new THREE.Vector3(2, 6, 1));

    // Phase 1 — busy, scheduler keeps running, budget stays full.
    let phase1 = 0;
    while (!cube.isAtRest() && phase1 < 10_000) {
      adapter.advanceTime(FRAME_MS);
      adapter.pump();
      expect(scheduler.isRunning).toBe(true);
      phase1++;
    }
    expect(cube.isAtRest()).toBe(true);
    expect(scheduler.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES);

    // Phase 2 — exactly N idle tail frames, then stop.
    for (let i = 0; i < IDLE_CONTINUATION_FRAMES; i++) {
      expect(scheduler.isRunning).toBe(true);
      adapter.advanceTime(FRAME_MS);
      adapter.pump();
    }
    expect(scheduler.isRunning).toBe(false);
    expect(scheduler.idleBudgetRemaining()).toBe(0);

    // Phase 3 — pump generously, scheduler stays stopped (0 fps idle).
    const ticksAtStop = scheduler.totalTicks();
    for (let i = 0; i < 200; i++) {
      adapter.advanceTime(FRAME_MS);
      adapter.pump();
    }
    expect(scheduler.totalTicks()).toBe(ticksAtStop);
    expect(scheduler.isRunning).toBe(false);
  });

  it('a second flick after idle-stop wakes the scheduler', () => {
    const scheduler = new FrameScheduler();
    const adapter = new FakeRafAdapter();
    const cube = new BouncingCube({
      size: 1,
      startPosition: new THREE.Vector3(0, 5, 0),
    });
    cube.attach(scheduler);
    scheduler.start(adapter);
    cube.flick(new THREE.Vector3(2, 6, 1));
    // Settle + tail-down + stop.
    for (let i = 0; i < 10_000 + IDLE_CONTINUATION_FRAMES; i++) {
      if (!scheduler.isRunning) break;
      adapter.advanceTime(FRAME_MS);
      adapter.pump();
    }
    expect(scheduler.isRunning).toBe(false);

    // A second interaction wakes the loop.
    cube.flick(new THREE.Vector3(0, 4, 0));
    expect(scheduler.isRunning).toBe(true);
    expect(scheduler.isDirty(CUBE_DIRTY_FLAG)).toBe(true);
    expect(scheduler.idleBudgetRemaining()).toBe(IDLE_CONTINUATION_FRAMES);
  });

  it('exposes the spec-named tick-listener id and dirty-flag string', () => {
    // Defensive: these constants are part of the demo's public surface
    // (used by the bench + any future browser harness) so we pin them.
    expect(CUBE_TICK_LISTENER_ID).toBe('demo:bouncing-cube');
    expect(CUBE_DIRTY_FLAG).toBe('cube');
  });
});
