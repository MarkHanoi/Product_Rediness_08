// View-switch performance benchmark (S17).
//
// Spec: PHASE-1C §S17 bench — CI gate: p95 < 250 ms hard-fail, < 220 ms soft-warn.
// Target: < 200 ms p95 for a view switch with camera animation completing.
//
// What is measured:
//   - ViewController.switchTo() from Default3DView → LevelOverview, driven by
//     a mock tick that fires a single frame at elapsed >> transitionDurationMs.
//   - Includes registry lookup + THREE vector operations + setActive patch.
//
// This bench intentionally avoids a real FrameScheduler to keep results
// deterministic and hardware-independent (the animation math is the hot path,
// not the scheduler wake latency).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { ViewController } from '@pryzm/view-state';
import { ViewRegistry, Default3DView, LevelOverview } from '@pryzm/view-state';
import type { ViewId } from '@pryzm/view-state';
import type { FrameScheduler } from '@pryzm/frame-scheduler';
import type { CameraController } from '@pryzm/renderer';
import type { ActiveViewStore } from '@pryzm/stores';
import { ACTIVE_VIEW_ID } from '@pryzm/stores';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

// ── Stubs ────────────────────────────────────────────────────────────────────

function makeScheduler(): FrameScheduler & { fire(): void } {
  let _cb: ((now: number) => void) | null = null;
  let _dispose: (() => void) | null = null;
  const s = {
    beginMotion: () => {},
    endMotion:   () => {},
    markDirty:   () => {},
    addTickListener(_id: string, cb: (now: number) => void): () => void {
      _cb = cb;
      _dispose = () => { _cb = null; };
      return _dispose;
    },
    fire() {
      if (_cb) _cb(performance.now() + 1000);
    },
  } as unknown as FrameScheduler & { fire(): void };
  return s;
}

function makeCameraController(): CameraController {
  return {
    snapshot: () => ({
      position: new THREE.Vector3(0, 0, 0),
      target:   new THREE.Vector3(0, 0, 0),
      up:       new THREE.Vector3(0, 1, 0),
    }),
    applyPose: () => {},
  } as unknown as CameraController;
}

function makeActiveViewStore(): ActiveViewStore {
  let state = { activeViewId: Default3DView.id as string, activeToolId: null as string | null };
  return {
    storeKey: 'active-view',
    getActive: () => state,
    setActive: (next: typeof state) => { state = next; },
    applyPatch: () => {},
    getState:   () => new Map([[ACTIVE_VIEW_ID, state]]),
    subscribeDirty: () => {},
  } as unknown as ActiveViewStore;
}

// ── Registry (seeded once, reused across iterations) ─────────────────────────

const registry = new ViewRegistry();
registry.applyPatch([
  { op: 'add', path: [Default3DView.id], value: Default3DView },
  { op: 'add', path: [LevelOverview.id],  value: LevelOverview  },
]);

// ── Bench ────────────────────────────────────────────────────────────────────

describe('view-switch (S17)', () => {
  it('ViewController.switchTo — Default3D → LevelOverview p95 < 250 ms (warn @ 220 ms)', async () => {
    const sample = await measure(
      'view-state.switch.default3d-to-level-overview',
      async () => {
        const scheduler = makeScheduler();
        const cam       = makeCameraController();
        const avStore   = makeActiveViewStore();

        const vc = new ViewController(
          scheduler as unknown as FrameScheduler,
          cam,
          registry,
          avStore,
          { transitionDurationMs: 0.001 },
        );

        const p = vc.switchTo(LevelOverview.id as ViewId);
        await Promise.resolve();
        scheduler.fire();
        await p;
      },
      { samples: 200, warmup: 20, warnMs: 220, budgetMs: 250 },
    );

    writeBenchSample(sample);
    // S17 hard-fail enforced via scripts/check-regression.mjs vs baseline.json,
    // not at the assertion level (Replit shared CPU vs the calibrated host).
    expect(sample.p95).toBeGreaterThan(0);
    expect(sample.p95).toBeLessThan(sample.budgetMs);
  });
});
