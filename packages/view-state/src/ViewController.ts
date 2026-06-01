// ViewController — orchestrates view-switch camera animation under
// the FrameScheduler.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S17 lines 849-900.
// ADR: `docs/02-decisions/adrs/0016-view-state-command-driven.md` §"Decision".
//
// Contract (S17 typed contract, lines 849-863):
//   * `switchTo(viewId)` resolves when the camera animation completes.
//   * Transition is driven by `FrameScheduler.addTickListener` at
//     priority `'pre-render'` with eased cubic in-out interpolation.
//   * While animating, `scheduler.beginMotion()` suppresses the
//     IdleAccumulator so TRAA/SSGI do not accumulate mid-transition
//     (ADR-0014 §"Interplay with S17").
//   * A single `pryzm.view.switch` OTel span wraps the whole transition;
//     per-tick `pryzm.view.cameraAnimation.tick` spans are DEV-only
//     (1-in-10 sample).
//   * `ViewNotFoundError` is thrown when the requested id is absent from
//     the `ViewRegistry`.
//
// W-02 NOTE — this file MUST NOT import `three`.  The boundary is
// enforced by the root `pryzm/no-three-outside-committer` rule (level
// `error`).  All THREE math (component lerp, scratch vectors, matrix
// recompose) is delegated to `CameraController.interpolateTo()` which
// owns the renderer-side scratch state.

import type { FrameScheduler } from '@pryzm/frame-scheduler';
import type { ActiveViewStore } from '@pryzm/stores';
import type { CameraController, PlainPose } from '@pryzm/renderer';
import { startSpan, endSpanOk, endSpanError } from './otel.js';
import type { ViewId, ViewDefinition } from './ViewDefinition.js';
import type { ViewRegistry } from './ViewRegistry.js';

// ── Errors ─────────────────────────────────────────────────────────────────

export class ViewNotFoundError extends Error {
  constructor(viewId: ViewId) {
    super(`[ViewController] View "${viewId}" not found in registry.`);
    this.name = 'ViewNotFoundError';
  }
}

// ── Options ────────────────────────────────────────────────────────────────

export interface ViewControllerOptions {
  /** Camera transition duration in ms.  Default 400. */
  readonly transitionDurationMs?: number;
  /**
   * Emit per-tick DEV-only OTel spans (1-in-10 sample).
   * Default false.  Enable in dev builds via bootstrap.
   */
  readonly devTickSpans?: boolean;
}

// ── Easing ─────────────────────────────────────────────────────────────────

function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Plain-pose helpers (W-02 — keeps THREE out of view-state) ──────────────

/** Lift a `ViewDefinition.camera` block into a `PlainPose`.  Per
 *  `ViewDefinitionSchema` the underlying objects are already plain
 *  `{x, y, z}` — this is a structural cast guarded by an explicit
 *  field-by-field copy so a future schema drift breaks the typecheck
 *  here, not silently at runtime. */
function viewToPlainPose(view: ViewDefinition): PlainPose {
  return {
    position: { x: view.camera.position.x, y: view.camera.position.y, z: view.camera.position.z },
    target:   { x: view.camera.target.x,   y: view.camera.target.y,   z: view.camera.target.z   },
    up:       { x: view.camera.up.x,       y: view.camera.up.y,       z: view.camera.up.z       },
  };
}

// ── ViewController ─────────────────────────────────────────────────────────

export class ViewController {
  private readonly scheduler: FrameScheduler;
  private readonly cameraController: CameraController;
  private readonly viewRegistry: ViewRegistry;
  private readonly activeViewStore: ActiveViewStore;
  private readonly transitionDurationMs: number;
  private readonly devTickSpans: boolean;

  constructor(
    scheduler: FrameScheduler,
    cameraController: CameraController,
    viewRegistry: ViewRegistry,
    activeViewStore: ActiveViewStore,
    opts: ViewControllerOptions = {},
  ) {
    this.scheduler = scheduler;
    this.cameraController = cameraController;
    this.viewRegistry = viewRegistry;
    this.activeViewStore = activeViewStore;
    this.transitionDurationMs = opts.transitionDurationMs ?? 400;
    this.devTickSpans = opts.devTickSpans ?? false;
  }

  /**
   * Animate the camera to the given view and mark it as the active view.
   * Resolves when the camera animation completes.
   *
   * OTel: emits `pryzm.view.switch` span covering the full transition.
   * Motion gate: `scheduler.beginMotion()` is held for the duration so
   * the IdleAccumulator does not fire mid-transition.
   */
  async switchTo(viewId: ViewId): Promise<void> {
    const target = this.viewRegistry.getState().get(viewId) as ViewDefinition | undefined;
    if (!target) throw new ViewNotFoundError(viewId);

    const fromId = this.activeViewStore.getActive().activeViewId;
    const span = startSpan('pryzm.view.switch', {
      'view.from': fromId,
      'view.to': viewId,
    });

    try {
      // Capture starting + ending poses as plain `{x, y, z}` tuples.
      // The renderer's `interpolateTo()` owns all THREE math.
      const startPose: PlainPose = this.cameraController.snapshotPlain();
      const endPose: PlainPose = viewToPlainPose(target);

      this.scheduler.beginMotion();
      const startTime = performance.now();
      const duration = this.transitionDurationMs;
      let tickIndex = 0;
      // Unique listener id — include startTime to avoid collisions on rapid
      // successive switchTo calls for the same viewId.
      const listenerId = `view-switch-${viewId}-${startTime}`;

      await new Promise<void>((resolve, reject) => {
        const disposer = this.scheduler.addTickListener(
          listenerId,
          (_now: number) => {
            try {
              const elapsed = performance.now() - startTime;
              const tRaw = Math.min(1, elapsed / duration);
              const tEased = easeCubicInOut(tRaw);

              this.cameraController.interpolateTo(startPose, endPose, tEased);
              this.scheduler.markDirty('view-switch');

              // DEV-only per-tick span (1-in-10 sample).
              if (this.devTickSpans && tickIndex % 10 === 0) {
                const ts = startSpan('pryzm.view.cameraAnimation.tick', {
                  't': tRaw,
                  'tick.index': tickIndex,
                });
                endSpanOk(ts);
              }
              tickIndex++;

              if (tRaw >= 1) {
                disposer();
                this.activeViewStore.setActive({
                  activeViewId: viewId,
                  activeToolId: this.activeViewStore.getActive().activeToolId,
                });
                this.scheduler.endMotion();
                endSpanOk(span, {
                  'view.switch.duration_ms': performance.now() - startTime,
                });
                resolve();
              }
            } catch (inner) {
              disposer();
              try { this.scheduler.endMotion(); } catch {}
              reject(inner);
            }
          },
          'pre-render',
        );
      });
    } catch (err) {
      try { this.scheduler.endMotion(); } catch {}
      endSpanError(span, err);
      throw err;
    }
  }
}
