/**
 * MIGRATION NOTE (S92-WIRE, 2026-05-01):
 *   Moved from `src/rendering/createRenderer.ts` → `src/engine/subsystems/rendering/createRenderer.ts`
 *   Reason: Intra-src consolidation: L6 renderer factory → engine subsystems
 *   Per `02-ARCHITECTURE.md §8` convergence boolean row 1 (`legacy_src_folders == 1`).
 *   Package promotion deferred to Wave 11 (`15-PACKAGE-PROMOTION-GAP.md §3`).
 *
 * TASK 2.3 REFACTOR (2026-05-09, R05 · C04 §1.4):
 *   The WebGPU trial-init logic (`tryCreateWebGPURenderer`) and the plain-WebGL
 *   fallback (`createWebGLFallback`) have moved to:
 *     - packages/renderer-three/src/adapters/WebGPURendererAdapter.ts
 *     - packages/renderer-three/src/RendererHandleFactory.ts
 *   This file now DELEGATES to RendererHandleFactory.create() and maps the
 *   RendererHandle back to the legacy RendererResult for backward compatibility
 *   with initScene.ts (which passes the raw THREE.WebGLRenderer to
 *   RenderPipelineManager.bind() and to window.pryzmRenderer).
 *
 *   The GPU device-lost recovery handler (window globals: renderPipelineManager,
 *   threeScene, threeCamera) stays here because it is app-level code that cannot
 *   live in packages/renderer-three/.  It will move in Task 2.4 / 3D-VIEW-AUDIT §F18
 *   when the window-global epidemic is resolved via RecoveryProvider.
 */

/**
 * @file src/rendering/createRenderer.ts
 *
 * WebGPU renderer factory — delegates to RendererHandleFactory (C04 §1.4).
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-1 Steps 1.2, 1.4):
 *  - Prefers WebGPU when available; falls back to WebGL2 via WebGPURenderer's
 *    built-in backend selection.  Only creates a plain THREE.WebGLRenderer
 *    when WebGPURenderer itself fails to initialise.
 *  - Does NOT touch CommandManager, ElementStores, or the semantic graph.
 *
 * Usage:
 *   const { renderer, backend } = await createRenderer(canvas);
 *   // renderer: THREE.WebGLRenderer  (WebGPURenderer at runtime — extends WebGLRenderer)
 *   // backend:  'webgpu' | 'webgl-fallback' | 'webgl-only'
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
  RendererHandleFactory,
  WebGPURendererAdapter,
  WebGLRendererAdapter,
} from '@pryzm/renderer-three';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Which GPU API backs the active renderer.
 *  - `'webgpu'`         — native WebGPU backend acquired successfully.
 *  - `'webgl-fallback'` — WebGPU unavailable; WebGPURenderer used WebGL2 backend.
 *  - `'webgl-only'`     — WebGPURenderer failed; plain WebGLRenderer in use
 *                         (TSL pipeline NOT available on this path).
 */
export type RendererBackend = 'webgpu' | 'webgl-fallback' | 'webgl-only';

/**
 * The canonical return type from createRenderer().
 * Named RendererResult to match the migration spec (§Step 1.2).
 */
export interface RendererResult {
    /** Fully-initialised, BIM-ready renderer. Typed as WebGLRenderer for compatibility. */
    renderer: THREE.WebGLRenderer;
    /** The actual GPU backend selected at runtime. */
    backend: RendererBackend;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Creates the best available GPU renderer for the supplied canvas element.
 *
 * Delegates to RendererHandleFactory (packages/renderer-three/) which implements
 * the C04 §1.4 fallback chain and logs the selected backend:
 *   [renderer-three] backend: webgpu|webgl2|webgl1
 *
 * Maps RendererHandle → RendererResult for backward compatibility with initScene.ts.
 *
 * @param canvas — The HTMLCanvasElement to render into.
 * @returns `{ renderer, backend }` where `backend` is `'webgpu'`, `'webgl-fallback'`,
 *          or `'webgl-only'`.
 */
export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererResult> {
    // ── Factory creates the best available adapter (C04 §1.4) ────────────
    // RendererHandleFactory.create() attempts:
    //   1. WebGPURenderer with native WebGPU backend → type='webgpu'
    //   2. WebGPURenderer with WebGL2 backend        → type='webgl2'
    //   3. Plain THREE.WebGLRenderer (last resort)   → type='webgl2'
    // And logs `[renderer-three] backend: webgpu|webgl2|webgl1`.
    const handle = await RendererHandleFactory.create(canvas);

    // ── Extract the underlying THREE.WebGLRenderer ────────────────────────
    // Backward-compat: initScene.ts passes the raw THREE.WebGLRenderer to
    // RenderPipelineManager.bind() and sets window.pryzmRenderer.
    // Both adapters expose `.threeRenderer` (transitional accessor, Wave 11+).
    let threeRenderer: THREE.WebGLRenderer;
    let backend: RendererBackend;

    if (handle instanceof WebGPURendererAdapter) {
        threeRenderer = handle.threeRenderer;
        backend = handle.type === 'webgpu' ? 'webgpu' : 'webgl-fallback';

        // ── GPU device-lost recovery (app-level: uses window globals) ─────
        // The WebGPURendererAdapter also wires a device-lost handler internally
        // (fires onContextLost callbacks).  This second handler supplements it
        // with the full recovery pipeline:
        //   1. Reset CW prewarm (BN-05c — PSOs invalidated by device loss)
        //   2. Set 5s cooldown (BN-09a — stale GPU render objects need time to GC)
        //   3. Wait 2 s
        //   4. Dispose dead RPM pipeline + old renderer
        //   5. Recreate renderer via createRenderer() (recursive call)
        //   6. Rebind RPM via rpm.bind(scene, camera, newRenderer)
        //
        // This stays in src/ because it references window.renderPipelineManager,
        // window.threeScene, window.threeCamera — L7 globals that cannot enter
        // packages/renderer-three/ (layer inversion).  Tracked for removal in
        // Task 2.4 / 3D-VIEW-AUDIT §F18 (RecoveryProvider pattern).
        if (handle.type === 'webgpu') {
            const gpuDevice: GPUDevice | undefined = (threeRenderer as any).backend?.device;
            if (gpuDevice) {
                // §M2-err (audit) — `.catch` on the outer `.then` so an
                // unexpected throw outside the inner try/catch (e.g. before
                // the try block at line 146 or inside the setTimeout promise)
                // does not become an unhandled rejection that the global
                // handler installed in main.ts then reports as a fatal crash.
                gpuDevice.lost.then(async (info: GPUDeviceLostInfo) => {
                    console.error(
                        `[createRenderer] WebGPU device lost: reason="${info.reason}", message="${info.message}"`,
                    );

                    if (info.reason === 'destroyed') return;

                    // BN-05c: Reset the CW prewarm flag immediately (before the 2s
                    // recovery delay) so the next CW batch re-warms against the fresh
                    // device instead of treating stale PSOs as valid.
                    try {
                        if (typeof window.__resetCwPrewarm === 'function') {
                            window.__resetCwPrewarm();
                            console.log('[createRenderer] §BN-05c WebGPU device lost — CW prewarm reset (PSOs invalidated)');
                        }
                        // BN-09a: Set GPU-recovery cooldown so prewarm does not fire until
                        // Three.js has had 5s to GC stale GPU render objects from dead device.
                        window.__cwPrewarmCooldownUntil = Date.now() + 5000;
                        console.log('[createRenderer] §BN-09a WebGPU device lost — CW prewarm cooldown set (5000ms)');
                    } catch (_) { /* non-fatal */ }

                    await new Promise<void>(r => setTimeout(r, 2000));

                    try {
                        // 3D-VIEW-AUDIT-2026 §F12 — dispose dead RPM pipeline FIRST.
                        const rpm = window.renderPipelineManager;
                        try { rpm?.disposePipeline?.(); }
                        catch (e) { console.warn('[createRenderer] RPM disposePipeline failed during recovery:', e); }

                        // 3D-VIEW-AUDIT-2026 §F37 — dispose dead renderer before recreating.
                        try { (threeRenderer as any).dispose?.(); }
                        catch (e) { console.warn('[createRenderer] prior renderer dispose failed during recovery:', e); }

                        const newResult = await createRenderer(canvas);
                        window.pryzmRenderer = newResult.renderer;
                        console.log('[createRenderer] WebGPU device recovered — renderer recreated.');

                        // 3D-VIEW-AUDIT-2026 §F11 — read window.threeScene / window.threeCamera
                        // (keys BimWorld.ts writes).  The RPM rebind makes the fresh pipeline
                        // replace the dead one without a page reload.
                        const scene  = window.threeScene;
                        const camera = window.threeCamera;
                        if (rpm && scene && camera) {
                            await rpm.bind(scene, camera, newResult.renderer);
                            console.log('[createRenderer] WebGPU device recovered — pipeline rebound.');
                        } else {
                            console.error(
                                '[createRenderer] WebGPU recovery: missing rpm/scene/camera on window — pipeline NOT rebound.',
                                { hasRpm: !!rpm, hasScene: !!scene, hasCamera: !!camera },
                            );
                        }
                    } catch (err) {
                        console.error('[createRenderer] WebGPU recovery failed:', err);
                    }
                }).catch((err: unknown) => {
                    console.error('[createRenderer] WebGPU device.lost handler rejected (non-fatal):', err);
                });
            }
        }

    } else if (handle instanceof WebGLRendererAdapter) {
        threeRenderer = handle.threeRenderer;
        backend = 'webgl-only';

    } else {
        // Future-proof: an unknown RendererHandle type from a future factory
        // release.  Fail loudly so the engineering team notices immediately.
        throw new Error(
            '[createRenderer] RendererHandleFactory returned an unknown RendererHandle type. ' +
            'Please update createRenderer.ts to handle the new adapter class.',
        );
    }

    return { renderer: threeRenderer, backend };
}

// ── Renderer backend probe ────────────────────────────────────────────────

/**
 * Probes GPU backend availability without creating a renderer.
 * Used by EngineBootstrap for early capability logging.
 *
 * Returns:
 *   - `'webgpu'`  — browser exposes `navigator.gpu`
 *   - `'webgl'`   — WebGPU absent; WebGL 2 assumed present
 *   - `'none'`    — neither API detected (headless / outdated browser)
 */
export function probeRendererBackend(): 'webgpu' | 'webgl' | 'none' {
    if (typeof navigator === 'undefined') return 'none';
    if (navigator.gpu) return 'webgpu';

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return gl ? 'webgl' : 'none';
}
