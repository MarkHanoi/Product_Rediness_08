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
// §FEAT-SWAP-LOADING-OVERLAY (L-141) — the WebGPU device-loss recovery below
// disposes the dead renderer and rebuilds a fresh one (a backend swap in all but
// name), so the viewport blanks during recovery. Cover it with the SAME shared
// brand overlay the manual live-swap uses (apps/editor is one L7 unit, so this
// intra-app UI import is in-bounds).
import { showRendererSwapOverlay, hideRendererSwapOverlay } from '@app/ui/overlays/RendererSwapOverlay';

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

// ── User backend preference (corner toggle) ─────────────────────────────────
//
// §PERF-WEBGPU-FRAGMENT / ADR-0076 — the founder-requested corner toggle. The
// renderer is created once at boot, so the toggle persists the choice to
// localStorage and reloads; the next boot honours it here.

/**
 * The user's chosen GPU backend.
 *  - `'auto'`   — WebGPU when available, else WebGL2 (an explicit, WebGPU-capable choice).
 *  - `'webgpu'` — prefer the full WebGPU TSL pipeline (still falls back internally
 *                 if the device has no WebGPU). Needed for the presentation /
 *                 SSGI / TRAA fidelity tier.
 *  - `'webgl'`  — plain WebGL2 (no TSL post-FX) — the stable, fragment-engine-suited
 *                 path. **This is the DEFAULT when the user has set no override**
 *                 (founder decision, 2026-06-25): the per-element fragment engine
 *                 suits WebGL's cheap-draw model; WebGPU only wins once instancing /
 *                 material-sharing land, and WebGL renders the full building cleanly.
 */
export type RendererBackendPreference = 'auto' | 'webgpu' | 'webgl';

const BACKEND_PREF_KEY = 'pryzm.renderer.backend';

// ── §FIX-HEAVY-SCENE-3D-SCALABILITY (L-139): device-loss recovery CAP ────────
//
// The native-WebGPU device-loss handler below recreates the renderer and re-arms
// a FRESH `device.lost` handler on every recovered device. On a heavy scene that
// is genuinely over the GPU's budget (the 40-storey office), the recovered device
// is lost AGAIN within seconds → an UNBOUNDED recovery loop that thrashes until the
// browser blocks the context ("Web page caused context loss and was blocked") and
// the renderer is dead. This cap breaks the loop: after MAX_WEBGPU_DEVICE_LOSSES
// native-WebGPU losses we switch to a STABLE WebGL safe-mode (WebGL2 backend →
// TSL post-FX off, reduced DPR, shadows off) and STOP re-arming the WebGPU loss
// handler, so the user keeps a plainer-but-navigable 3D view instead of a dead one.
//
// Module-scoped (persists across the recursive createRenderer() re-creations).
// Gate: globalThis.__pryzmDeviceLossRecoveryCap === false disables the cap
// (restores the prior unbounded-recovery behaviour). Default ON.
const MAX_WEBGPU_DEVICE_LOSSES = 2;
let _webgpuDeviceLossCount = 0;

interface DeviceLossGlobals {
    __pryzmDeviceLossRecoveryCap?: boolean;
    __pryzmRenderSafeMode?: boolean;
    __pryzmDeviceLossCount?: number;
}
function _deviceLossGlobals(): DeviceLossGlobals {
    return globalThis as unknown as DeviceLossGlobals;
}
function _isDeviceLossCapEnabled(): boolean {
    return _deviceLossGlobals().__pryzmDeviceLossRecoveryCap !== false;
}

/**
 * Read the persisted backend preference.
 *
 * §PERF-WEBGPU-FRAGMENT (founder decision 2026-06-25) — when the user has NOT
 * set an override, the DEFAULT is `'webgl'` (the stable, fragment-engine-suited
 * path), NOT WebGPU. WebGPU stays fully selectable via the toggle ('webgpu' /
 * 'auto'). Storage-safe.
 */
export function getRendererBackendPreference(): RendererBackendPreference {
    try {
        const v = globalThis.localStorage?.getItem(BACKEND_PREF_KEY);
        if (v === 'webgpu' || v === 'webgl' || v === 'auto') return v;
    } catch {
        /* localStorage unavailable (private mode / non-browser) — fall through */
    }
    return 'webgl'; // unset default → WebGL (was 'auto'/WebGPU-first)
}

/** Persist the backend preference. Caller is responsible for reloading. */
export function setRendererBackendPreference(pref: RendererBackendPreference): void {
    try {
        globalThis.localStorage?.setItem(BACKEND_PREF_KEY, pref);
    } catch {
        /* non-fatal */
    }
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
    // ── User backend preference (corner toggle, §PERF-WEBGPU-FRAGMENT) ────
    // 'webgl' resolves to the WebGL2 backend (high limits, modern resource
    // management — via WebGPURenderer's forceWebGL), falling back to plain
    // THREE.WebGLRenderer only if WebGL2 is unavailable. NOT the old plain-WebGL1
    // last-resort that crash-guarded on heavy generated buildings. The render
    // quality tier keeps SSGI/TRAA off on heavy scenes so WebGL2 stays light.
    // 'auto'/'webgpu' use the normal C04 §1.4 (native-WebGPU-first) chain.
    const pref = getRendererBackendPreference();
    const forceWebGL = pref === 'webgl';

    // §PERF-WEBGPU-FRAGMENT — make the boot backend DECISION observable so a
    // "why webgpu on a fresh profile?" is self-explanatory in the console:
    //   - resolvedPreference=webgl  → unset profile OR explicit WebGL (default).
    //   - resolvedPreference=webgpu → a value was PERSISTED by a prior toggle click
    //     (NOT an independent default — there is one renderer-creation path).
    console.log(
        `[createRenderer] §PERF-WEBGPU-FRAGMENT resolvedPreference=${pref} ` +
        `(forceWebGL=${forceWebGL}) — ${forceWebGL
            ? 'resolving to WebGL2 backend (high limits; tier keeps post-FX off on heavy scenes)'
            : "using WebGPU-first chain (this value was explicitly persisted by the backend toggle; clear it or pick 'WebGL' to get the WebGL default)"}`,
    );

    // ── Factory creates the best available adapter (C04 §1.4) ────────────
    // RendererHandleFactory.create() attempts:
    //   1. WebGPURenderer with native WebGPU backend → type='webgpu'
    //   2. WebGPURenderer with WebGL2 backend        → type='webgl2'
    //   3. Plain THREE.WebGLRenderer (last resort)   → type='webgl2'
    // And logs `[renderer-three] backend: webgpu|webgl2|webgl1`.
    const handle = await RendererHandleFactory.create(canvas, forceWebGL);

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

                    // §FEAT-SWAP-LOADING-OVERLAY (L-141) — the viewport is dead from
                    // here until the recovered renderer is rebound (through the 2s GC
                    // cooldown + renderer rebuild). Cover it with the shared brand
                    // overlay now; the finally on the recovery try/catch below hides it
                    // the instant recovery finishes (rebind ready OR safe-mode degrade
                    // OR failure), so it is bounded by recovery and never stuck.
                    showRendererSwapOverlay('Recovering renderer…');

                    // ── §FIX-HEAVY-SCENE-3D-SCALABILITY (L-139): recovery CAP ──
                    // Count this loss and, once we exceed the cap, drop to a STABLE
                    // WebGL safe-mode BEFORE recreating: persist the 'webgl' backend
                    // preference so the recursive createRenderer() below resolves to
                    // the WebGL2 forced path (backend='webgl-fallback' → the WebGPU
                    // device.lost handler is NOT re-armed → the thrash loop ends), and
                    // flag safe-mode so we can reduce DPR + disable shadows on the new
                    // renderer. Observable via globalThis.__pryzmDeviceLossCount.
                    _webgpuDeviceLossCount++;
                    _deviceLossGlobals().__pryzmDeviceLossCount = _webgpuDeviceLossCount;
                    const capEnabled = _isDeviceLossCapEnabled();
                    const capReached = capEnabled && _webgpuDeviceLossCount >= MAX_WEBGPU_DEVICE_LOSSES;
                    if (capReached) {
                        console.error(
                            `[createRenderer] §FIX-HEAVY-SCENE-3D-SCALABILITY device-loss cap reached ` +
                            `(${_webgpuDeviceLossCount}/${MAX_WEBGPU_DEVICE_LOSSES}) — switching to STABLE WebGL ` +
                            `safe-mode (WebGL2 backend, post-FX off, reduced DPR, shadows off) and STOPPING ` +
                            `WebGPU recovery. The 3D view stays navigable (plainer) instead of thrashing to a ` +
                            `dead/blocked context.`,
                        );
                        setRendererBackendPreference('webgl');
                        _deviceLossGlobals().__pryzmRenderSafeMode = true;
                    }

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

                        // §FIX-HEAVY-SCENE-3D-SCALABILITY (L-139) — once in safe-mode,
                        // degrade the freshly-created renderer to the stable settings:
                        // reduced DPR (halve GPU fill cost) and shadows OFF (the shadow
                        // pass over a 40-storey caster set is a primary device-loss
                        // trigger). Best-effort — a failure here must not abort recovery.
                        if (_deviceLossGlobals().__pryzmRenderSafeMode === true) {
                            try {
                                newResult.renderer.setPixelRatio(1);
                                const sm = (newResult.renderer as { shadowMap?: { enabled?: boolean } }).shadowMap;
                                if (sm) sm.enabled = false;
                                console.log('[createRenderer] §FIX-HEAVY-SCENE-3D-SCALABILITY safe-mode applied — DPR=1, shadows OFF.');
                            } catch (e) {
                                console.warn('[createRenderer] safe-mode degrade failed (non-fatal):', e);
                            }
                        }
                        // §SHADOW-DEVICE-LOSS-FIX (Bug C) — if the fallback swapped in a
                        // FRESH canvas (WebGL2 cannot bind a WebGPU-tainted canvas), the
                        // live canvas is the renderer's domElement now, NOT the old one.
                        // Re-point window.pryzmCanvas so resize / thumbnail capture use it.
                        try {
                            const liveCanvas = newResult.renderer.domElement as HTMLCanvasElement;
                            if (liveCanvas && liveCanvas !== window.pryzmCanvas) {
                                window.pryzmCanvas = liveCanvas;
                                console.log('[createRenderer] §SHADOW-DEVICE-LOSS-FIX window.pryzmCanvas re-pointed to the fresh recovery canvas.');
                            }
                        } catch { /* domElement always present on THREE renderers */ }
                        console.log('[createRenderer] WebGPU device recovered — renderer recreated.');

                        // 3D-VIEW-AUDIT-2026 §F11 — read window.threeScene / window.threeCamera
                        // (keys BimWorld.ts writes).  The RPM rebind makes the fresh pipeline
                        // replace the dead one without a page reload.
                        const scene  = window.threeScene;
                        const camera = window.threeCamera;
                        if (rpm && scene && camera) {
                            // §PERF-WEBGL2-NO-TSL — thread the authoritative resolved
                            // backend so the rebind never re-probes the renderer CLASS.
                            // Only a native 'webgpu' backend may run the TSL pipeline.
                            //
                            // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — DEMO-KILLER FIX.
                            // Route through recoverPipeline() (NON-FATAL) instead of a
                            // bare bind(). On a freshly device-loss-recovered WebGPU
                            // device the heavy phase-4 TSL graph (SSGI/outlines) often
                            // hits "Fragment shader failed to compile", which previously
                            // flipped THREE's fatal "Rendering has stopped" latch and
                            // killed the viewport. recoverPipeline() rebuilds the full
                            // pipeline but DOWNGRADES to the lightweight phase-2 pipeline
                            // on a shader-compile failure — the viewport keeps rendering
                            // plain, never the dead overlay.
                            if (typeof rpm.recoverPipeline === 'function') {
                                const phase = await rpm.recoverPipeline(
                                    scene, camera, newResult.renderer,
                                    newResult.backend === 'webgpu',
                                );
                                console.log(
                                    `[createRenderer] WebGPU device recovered — pipeline rebound (phase=${phase}` +
                                    `${rpm.isPostFxDisabled ? ', post-FX downgraded — shader recompile failed on recovered device' : ''}).`,
                                );
                            } else {
                                // Defensive fallback if an older RPM is on window.
                                await rpm.bind(scene, camera, newResult.renderer, 'light', newResult.backend === 'webgpu');
                                console.log('[createRenderer] WebGPU device recovered — pipeline rebound.');
                            }
                        } else {
                            console.error(
                                '[createRenderer] WebGPU recovery: missing rpm/scene/camera on window — pipeline NOT rebound.',
                                { hasRpm: !!rpm, hasScene: !!scene, hasCamera: !!camera },
                            );
                        }
                    } catch (err) {
                        console.error('[createRenderer] WebGPU recovery failed:', err);
                    } finally {
                        // §FEAT-SWAP-LOADING-OVERLAY (L-141) — guaranteed hide once
                        // recovery settles on EVERY path (rebound, safe-mode, or a
                        // thrown recovery error). Paired with the show() above.
                        hideRendererSwapOverlay();
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

    // Expose the resolved backend so the corner toggle (RendererBackendToggle)
    // can show what is actually in use (e.g. "· webgpu"). §PERF-WEBGPU-FRAGMENT.
    window.pryzmRendererBackend = backend;

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
