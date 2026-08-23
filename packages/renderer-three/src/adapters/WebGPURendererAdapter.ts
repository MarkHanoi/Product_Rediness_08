// @pryzm/renderer-three/adapters — WebGPU adapter (C04 §1.4).
//
// CONTRACT (C04 §1.4, P2):
//   Wraps THREE.WebGPURenderer in the RendererHandle interface so the rest
//   of the codebase has zero direct three/webgpu coupling.  Lives inside
//   packages/renderer-three/ — the sole THREE owner — so the dynamic
//   `import('three/webgpu')` here satisfies P2 without triggering
//   check-three-imports.ts (which only catches static imports outside this pkg).
//
//   Backend resolution (Three.js r183):
//     navigator.gpu + adapter acquired → WebGPU backend  → type='webgpu'
//     navigator.gpu absent / no adapter → WebGL2 backend → type='webgl2'
//     WebGPURenderer itself throws       → create() returns null
//
//   Context-loss recovery (C04 §1.4):
//     WebGPU backend  — wires gpuDevice.lost Promise to onContextLost callbacks.
//     WebGL2 backend  — wires canvas webglcontextlost/restored events via
//                       setupContextLossHandlers.
//
// Wave A15 S121 amendment: the adapter may only enter the production boot path
// after check-three-imports.ts exits 0 — that gate is now closed (Task 2.2).
//
// NOTE: This file IS inside packages/renderer-three/ and MAY import from
// 'three' and 'three/webgpu' directly.

import * as THREE from 'three';
import { setupContextLossHandlers } from '../contextLossHandlers.js';
import { trackRenderObjectsForRetirement, retireRenderer, isDeliberateDeviceDestroy } from '../rendererRetirement.js';
import { installEmptyDrawGuard, type EmptyDrawGuardHandle } from '../EmptyDrawGuard.js';
import type { RendererHandle } from '../RendererHandle.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface WebGPURendererAdapterOptions {
  /** Max device-pixel-ratio cap.  Defaults to 1.5 (Pascal pattern). */
  dprCap?: number;
  /**
   * §PERF-WEBGPU-FRAGMENT / ADR-0076 — force the WebGL2 backend (skip native
   * WebGPU). Used when the user picks "WebGL" in the backend toggle: this yields
   * a WebGL2 context (high limits, modern resource management) via the
   * WebGPURenderer, NOT the plain THREE.WebGLRenderer last-resort. Resolves
   * `type` to 'webgl2'. The render quality tier (Axis 1) keeps the TSL post-FX
   * off on heavy scenes so this stays light.
   */
  forceWebGL2?: boolean;
}

/** @internal — shape of the WebGPURenderer backend exposed by Three.js r183. */
interface WebGPUBackend {
  readonly isWebGPUBackend?: boolean;
  readonly device?: GPUDevice;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_DPR_CAP = 1.5;

// ── Adapter ────────────────────────────────────────────────────────────────

/**
 * WebGPURendererAdapter
 *
 * Implements RendererHandle over THREE.WebGPURenderer (Three.js r183).
 * The static `create()` factory handles the async WebGPURenderer.init() call
 * and backend detection.  Returns `null` when WebGPURenderer fails to
 * initialise (no WebGL2 or WebGPU on the device).
 *
 * Context-loss recovery (C04 §1.4):
 * - WebGPU backend: `gpuDevice.lost` Promise fires onContextLost callbacks.
 * - WebGL2 backend: canvas `webglcontextlost`/`webglcontextrestored` events
 *   are wired via `setupContextLossHandlers`.
 *
 * @example
 * ```ts
 * import { WebGPURendererAdapter } from '@pryzm/renderer-three';
 *
 * const adapter = await WebGPURendererAdapter.create(canvas);
 * if (adapter === null) {
 *   // Fall back to WebGLRendererAdapter
 * } else {
 *   console.log(adapter.type); // 'webgpu' | 'webgl2'
 *   adapter.onContextLost(() => frameScheduler.pause());
 * }
 * ```
 */
export class WebGPURendererAdapter implements RendererHandle {
  readonly type: 'webgpu' | 'webgl2';
  readonly domElement: HTMLCanvasElement;

  /**
   * @internal — transitional accessor for createRenderer.ts backward compatibility.
   *
   * Exposes the underlying THREE.WebGLRenderer (which at runtime is a WebGPURenderer
   * instance — WebGPURenderer extends THREE.WebGLRenderer in r183) so that initScene.ts
   * can pass it to RenderPipelineManager.bind() and store it on window.pryzmRenderer.
   *
   * Once initScene.ts migrates to a RendererHandle-first API (Wave 11+, Task 2.3
   * follow-on), this getter will be removed.  Do NOT use from plugin or ui code.
   */
  readonly threeRenderer: THREE.WebGLRenderer;

  private readonly _lostCallbacks     = new Set<() => void>();
  private readonly _restoredCallbacks = new Set<() => void>();
  private _removeContextHandlers: (() => void) | null = null;
  /** §SCENE6-EMPTY-DRAW-GUARD (L-10002) — null when the backend has no hook. */
  private _emptyDrawGuard: EmptyDrawGuardHandle | null = null;

  private constructor(
    renderer: THREE.WebGLRenderer,
    type: 'webgpu' | 'webgl2',
  ) {
    this.type         = type;
    this.threeRenderer = renderer;
    this.domElement   = renderer.domElement as HTMLCanvasElement;
  }

  // ── Static factory ────────────────────────────────────────────────────────

  /**
   * Attempts to create a WebGPURendererAdapter.
   *
   * Three.js WebGPURenderer internally selects the best available backend:
   *   - navigator.gpu present + adapter acquired → WebGPU backend (type='webgpu')
   *   - navigator.gpu absent / adapter null      → WebGL2 backend (type='webgl2')
   *
   * Returns `null` only when WebGPURenderer itself throws (e.g. no WebGL2).
   * The caller (`RendererHandleFactory`) then falls through to `WebGLRendererAdapter`.
   */
  static async create(
    canvas: HTMLCanvasElement,
    opts: WebGPURendererAdapterOptions = {},
  ): Promise<WebGPURendererAdapter | null> {
    const dprCap = opts.dprCap ?? DEFAULT_DPR_CAP;

    try {
      // Dynamic import keeps 'three/webgpu' out of the initial bundle.
      // The ambient module declaration in three-webgpu-types.d.ts (in this
      // package) provides the TypeScript types.
      const { WebGPURenderer } = await import('three/webgpu');

      const renderer = new WebGPURenderer({
        canvas,
        antialias:       false,            // TRAA replaces hardware MSAA (Phase 4)
        alpha:           true,             // transparent overlay — OBC canvas shows through
        powerPreference: 'high-performance',
        // §PERF-WEBGPU-FRAGMENT — when the user picked "WebGL", skip native WebGPU
        // and use WebGPURenderer's WebGL2 backend (high limits + modern resource
        // management). WebGPURenderer honours `forceWebGL` to pick the WebGL2 path.
        ...(opts.forceWebGL2 ? { forceWebGL: true } : {}),
      });

      // Apply BIM defaults BEFORE init() — spec-mandated ordering for WebGPURenderer.
      // (Settings applied after init() may be silently ignored by the backend.)
      renderer.setSize(
        canvas.clientWidth  || window.innerWidth,
        canvas.clientHeight || window.innerHeight,
      );
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
      renderer.shadowMap.enabled    = true;
      renderer.shadowMap.type       = THREE.PCFShadowMap;
      renderer.outputColorSpace     = THREE.SRGBColorSpace;
      renderer.toneMapping          = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure  = 0.9;   // editor: 0.9 exactly (matched on all paths)

      // CRITICAL: await init() before any rendering.
      // WebGPURenderer selects WebGPU or WebGL2 backend here — no extra code needed.
      await renderer.init();

      // §RETIRE-RENDERER-DETACHES-LISTENERS (L-948) — record the render objects this
      // renderer mints, so retiring it can detach its per-material / per-geometry
      // 'dispose' listeners BEFORE its DataMaps are cleared. Installed HERE because
      // `Renderer._objects` is created by `init()` (three r183 Renderer.js:796) —
      // any earlier and there is nothing to instrument. Without this, a live backend
      // swap (ADR-0077) or a device-loss rebuild (ADR-0089) leaves the dead renderer
      // listening on three's module-global shadow material, and the first material
      // compiled on the new backend throws `usedTimes` — permanently, so the whole
      // model stops rendering. See ../rendererRetirement.ts for the full chain.
      if (!trackRenderObjectsForRetirement(renderer)) {
        console.warn(
          '[renderer-three/WebGPURendererAdapter] §RETIRE-RENDERER-DETACHES-LISTENERS could not ' +
          'instrument this renderer (no RenderObjects after init) — retirement will not be able to ' +
          'detach its material/geometry dispose listeners (L-948).',
        );
      }

      // ── §SCENE6-EMPTY-DRAW-GUARD (L-10002, C04 §1.4) ────────────────────
      //
      // Installed HERE, immediately after init(), for the same structural reason
      // as the retirement tracker above: the render-object hook is created by
      // `init()`. Installed BEFORE the pipeline binds, so the guard is the
      // OUTERMOST link — three's own MRT/post-processing passes chain onto it
      // rather than replacing it (see `installEmptyDrawGuard`'s chaining note).
      //
      // ⚠ WHY THIS IS SAFE TO HAVE ON BY DEFAULT. It skips a draw only on proof
      // that the draw submits zero vertices — a draw that was already going to
      // put nothing on the screen. There is no visual difference between the
      // guarded and unguarded frame; the difference is that the WebGPU command
      // encoder is not asked to encode a zero-vertex draw, which is the thing
      // that flickers the entire canvas (AUDIT-C §2.6 / §3.7). A guard that only
      // ever removes no-ops does not need a flag, and a flag would mean the
      // founder has to reproduce a whole-canvas flicker before turning it on.
      const guardHost = renderer as unknown as Parameters<typeof installEmptyDrawGuard>[0];
      const emptyDrawGuard = installEmptyDrawGuard(guardHost);

      // backend.isWebGPUBackend = true  → native WebGPU backend (r183 API)
      // backend.isWebGPUBackend absent  → WebGL2 fallback backend (still TSL-capable)
      const backend = (renderer as unknown as { backend?: WebGPUBackend }).backend;
      const isNativeWebGPU = backend?.isWebGPUBackend === true;
      const type: 'webgpu' | 'webgl2' = isNativeWebGPU ? 'webgpu' : 'webgl2';

      // WebGPURenderer extends THREE.WebGLRenderer (r183) — cast is safe.
      const threeCompatible = renderer as unknown as THREE.WebGLRenderer;
      const adapter = new WebGPURendererAdapter(threeCompatible, type);
      adapter._emptyDrawGuard = emptyDrawGuard;

      // ── Wire context-loss recovery (C04 §1.4) ───────────────────────────
      if (isNativeWebGPU) {
        // WebGPU backend: device-loss is signalled via GPUDevice.lost Promise.
        // The canvas does NOT emit webglcontextlost for native WebGPU.
        const gpuDevice = backend?.device;
        if (gpuDevice) {
          gpuDevice.lost.then((info: GPUDeviceLostInfo) => {
            console.error(
              '[renderer-three/WebGPURendererAdapter] WebGPU device lost: ' +
              `reason="${info.reason}", message="${info.message}"`,
            );
            // §DEVICE-DESTROY-IS-NOT-DEVICE-LOSS (L-1001) — `reason="destroyed"` means
            // `device.destroy()` was CALLED, which is the last step of retireRenderer()
            // on every live backend swap (ADR-0077) and every device-loss rebuild. It is
            // OUR teardown, not a failure. Firing onContextLost for it kicks the app-level
            // recovery pipeline for a fault that did not occur — which itself retires a
            // renderer and destroys another device. `createRenderer.ts` already guarded
            // this and stopped; this handler, on the SAME device, did not, and both
            // printed back to back in the founder's 2026-08-18 capture. The rule now lives
            // once, in the module that CAUSES the reason. The raw info is still logged
            // above verbatim — nothing is suppressed, only mis-classification is.
            if (isDeliberateDeviceDestroy(info)) return;
            // Fire onContextLost callbacks — app-level recovery wired by caller.
            adapter._lostCallbacks.forEach(cb => cb());
            // Note: onContextRestored callbacks are NOT fired for native WebGPU
            // device loss — the caller must recreate the entire renderer.
          });
        }
      } else {
        // WebGL2 backend of WebGPURenderer: standard canvas context events.
        adapter._removeContextHandlers = setupContextLossHandlers(threeCompatible, {
          label:     'WebGPURendererAdapter/webgl2',
          onLost:    () => adapter._lostCallbacks.forEach(cb => cb()),
          onRestore: () => adapter._restoredCallbacks.forEach(cb => cb()),
        });
      }

      return adapter;

    } catch (err) {
      console.warn(
        '[renderer-three/WebGPURendererAdapter] WebGPURenderer init failed ' +
        '(no WebGL2? headless?) — caller should fall back to WebGLRendererAdapter:',
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  // ── RendererHandle implementation ─────────────────────────────────────────

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.threeRenderer.render(scene, camera);
  }

  setSize(width: number, height: number, updateStyle = true): void {
    this.threeRenderer.setSize(width, height, updateStyle);
  }

  setPixelRatio(ratio: number): void {
    this.threeRenderer.setPixelRatio(ratio);
  }

  getSize(target: THREE.Vector2): THREE.Vector2 {
    return this.threeRenderer.getSize(target);
  }

  setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.threeRenderer.setRenderTarget(target);
  }

  getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.threeRenderer.getRenderTarget();
  }

  /**
   * Reads RGBA8 pixel data from `target` into `buffer`.
   *
   * NOTE (Task 2.3 / C04 §3.2): Synchronous readback works correctly for the
   * WebGL2 backend of WebGPURenderer (used by GPUPicker for O(1) ID-buffer
   * readback).  For the native WebGPU backend, readRenderTargetPixels may need
   * async in a future wave — tracked under Task 2.4 (GPU-pick depth readback).
   */
  readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): void {
    this.threeRenderer.readRenderTargetPixels(target, x, y, width, height, buffer);
  }

  onContextLost(cb: () => void): () => void {
    this._lostCallbacks.add(cb);
    return () => { this._lostCallbacks.delete(cb); };
  }

  onContextRestored(cb: () => void): () => void {
    this._restoredCallbacks.add(cb);
    return () => { this._restoredCallbacks.delete(cb); };
  }

  dispose(): void {
    // Uninstall BEFORE retirement: the guard holds a bound reference to the
    // renderer's own `renderObject`, and restoring the previous function is
    // what keeps a swapped-in renderer (ADR-0077) from inheriting a closure
    // over the dead one.
    this._emptyDrawGuard?.uninstall();
    this._emptyDrawGuard = null;
    this._removeContextHandlers?.();
    this._lostCallbacks.clear();
    this._restoredCallbacks.clear();
    // §RETIRE-RENDERER-DETACHES-LISTENERS (L-948) — NOT `threeRenderer.dispose()`.
    // Detach this renderer's render objects from every material/geometry they
    // listen to FIRST (ADR-0297 INVARIANT L2), then release the renderer.
    retireRenderer(this.threeRenderer);
  }
}
