// editor/bootstrap.render — wires the L0→L7 RENDER half (S06-T7).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S06-T7 (line 583):
//   "Bootstrap final — `bootstrap.render.ts` constructs FrameScheduler
//    + Renderer; CameraController bound to canvas; Renderer.attachTo
//    pumps a frame on every dirty 'camera' tick.  ?pryzm2=1 (no &mode)
//    swaps in PRYZM 2 stack; URL flag is the only entry point."
//
// What this file does:
//   1. Calls `bootstrap()` (data half, S05-T8) to get the L0→L5 wiring.
//   2. Constructs a `FrameScheduler` (L5).
//   3. Awaits `Renderer.init(canvas, mode)` — WebGPU/WebGL2 dual-mode
//      per ADR-007.  Resolved mode flows into the OTel boot span.
//   4. Constructs a `CameraController` bound to the canvas; orbit / pan
//      / wheel inputs call `scheduler.markDirty('camera')`.
//   5. Calls `renderer.attachTo(scheduler)` — `render()` runs in the
//      'render' tick priority on every dirty frame.
//   6. On every `render()`, reconciles the host's SceneRegistry with
//      `renderer.scene` membership — committer-emitted Object3D nodes
//      get added (idempotent), removed nodes are detached.
//   7. Returns a `RenderRuntime` that wraps the data EditorRuntime + a
//      single `tearDown()` that disposes everything in reverse order.

import {
  bootstrap,
  type BootstrapOptions,
  type EditorRuntime,
} from './bootstrap.js';
import { FrameScheduler } from '@pryzm/frame-scheduler';
import {
  Renderer,
  CameraController,
  type RendererMode,
  type ResolvedRendererMode,
} from '@pryzm/renderer';
import type { CommitterHost } from '@pryzm/scene-committer';

export interface RenderBootstrapOptions extends BootstrapOptions {
  /** The canvas the renderer renders into.  REQUIRED. */
  readonly canvas: HTMLCanvasElement;
  /** Renderer mode — see ADR-007.  Defaults to 'auto'. */
  readonly mode?: RendererMode;
  /** Optional pre-built FrameScheduler — bench/test fixtures inject
   *  one to verify the dirty-tick wiring without spinning up rAF. */
  readonly scheduler?: FrameScheduler;
}

export interface RenderRuntime {
  readonly data: EditorRuntime;
  readonly renderer: Renderer;
  readonly scheduler: FrameScheduler;
  readonly camera: CameraController;
  /** The resolved renderer mode — `'webgpu'` or `'webgl2'`. */
  readonly mode: ResolvedRendererMode;
  /** Idempotent.  Disposes (in order):
   *    camera-controller → renderer-attachment → reconcile patch →
   *    renderer → data runtime. */
  tearDown(): void;
}

export async function bootstrapRender(
  opts: RenderBootstrapOptions,
): Promise<RenderRuntime> {
  // Data half first — we want the scene-committer registry available
  // BEFORE we plug it into the renderer.scene.
  const data = bootstrap(opts);

  // Renderer + scheduler.
  const scheduler = opts.scheduler ?? new FrameScheduler();
  const renderer = await Renderer.init(opts.canvas, { mode: opts.mode ?? 'auto' });

  // Reconciler — make `renderer.scene` membership track
  // `host.registry` membership.  Runs at 'pre-render' priority so any
  // committer-emitted Object3D additions land in the THREE scene
  // BEFORE the MeshPass walks it on the same tick.
  const detachReconciler = installSceneReconciler(data.host, renderer, scheduler);

  // Camera controller bound to canvas.
  const camera = new CameraController(renderer.camera, opts.canvas, scheduler);

  // Renderer pumps a frame on every dirty tick (priority 'render',
  // i.e. AFTER the reconciler).
  const detachRenderer = renderer.attachTo(scheduler, 'renderer.draw');

  // Trigger the first frame so the canvas isn't blank pre-input.
  scheduler.markDirty('camera');

  let torn = false;
  return {
    data,
    renderer,
    scheduler,
    camera,
    mode: renderer.mode,
    tearDown(): void {
      if (torn) return;
      torn = true;
      camera.dispose();
      detachRenderer();
      detachReconciler();
      renderer.dispose();
      data.tearDown();
    },
  };
}

/** Reconcile `renderer.scene` membership with `host.registry`.
 *
 *  Registers a `pre-render` priority tick listener on the scheduler;
 *  before every drawn frame, every Object3D in `host.registry` that
 *  hasn't been added to `renderer.scene` is added (idempotent), and
 *  any Object3D we previously tracked that has dropped out of the
 *  registry is removed.  Returns a disposer that unregisters the
 *  listener and clears the tracked set. */
function installSceneReconciler(
  host: CommitterHost,
  renderer: Renderer,
  scheduler: FrameScheduler,
): () => void {
  const tracked = new Set<unknown>();
  const dispose = scheduler.addTickListener(
    'renderer.scene-reconcile',
    (): void => {
      const live = new Set<unknown>();
      for (const obj of host.registry.values()) {
        live.add(obj);
        if (!tracked.has(obj)) {
          tracked.add(obj);
          renderer.scene.add(obj as never);
        }
      }
      if (tracked.size > live.size) {
        for (const obj of tracked) {
          if (!live.has(obj)) {
            tracked.delete(obj);
            renderer.scene.remove(obj as never);
          }
        }
      }
    },
    'pre-render',
  );
  return () => {
    dispose();
    tracked.clear();
  };
}
