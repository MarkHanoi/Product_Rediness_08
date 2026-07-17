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
 *  - `'webgl-classic'` — §L-372 Batch 2 / L-382 — a PROGRAMMATIC (not user-toggle)
 *                 target that routes DIRECTLY to a genuine classic `THREE.WebGLRenderer`
 *                 (backend `'webgl-only'`), bypassing the WebGPURenderer(forceWebGL2)
 *                 that `'webgl'` resolves to. The forceWebGL2 path still node-compiles
 *                 every material's shader lazily via TSL ("Compiling GPU shaders"); the
 *                 classic renderer uses stock GLSL with NO TSL/node compile, so it kills
 *                 that compile tail during heavy building generation. Used only by the
 *                 heavy-gen swap (`autoWebGLHeavyScene`); `getRendererBackendPreference`
 *                 never round-trips it (a persisted copy degrades to `'webgl'`), so the
 *                 corner toggle stays a 3-state control.
 */
export type RendererBackendPreference = 'auto' | 'webgpu' | 'webgl' | 'webgl-classic';

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

// §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE — true ONLY while the device-loss recovery is
// executing its OWN recursive createRenderer() rebuild. Lets the top-of-createRenderer
// reconstruction-boundary guard tell the recovery's legitimate rebuild apart from an EXTERNAL
// caller (a live backend swap) trying to build a renderer mid-recovery — which must be blocked
// so two GPU devices / reconstruction boundaries never overlap.
let _recoveryRecursionInProgress = false;

interface DeviceLossGlobals {
    __pryzmDeviceLossRecoveryCap?: boolean;
    __pryzmRenderSafeMode?: boolean;
    __pryzmDeviceLossCount?: number;
    // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — true from the instant the WebGPU
    // device is lost until the recovered renderer is rebound (or recovery gives up). Read by
    // CesiumViewport.mount() to GATE globe activation: bringing Cesium up while the browser's
    // GPU process is mid-reset makes Cesium's first shader compile fail ("Compile log: null")
    // → its dead-end "Rendering has stopped" panel. Gating until this clears avoids that.
    __pryzmRendererRecovering?: boolean;
    // §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE — set true once the browser has BLOCKED all
    // page GL contexts (WebGPU AND the WebGL2 fallback). A single TERMINAL state: every further
    // context-creation attempt is refused and the user must reload. Read by createRenderer() and
    // the device.lost handler to STOP the recovery loop, and surfaced to the user as a reload CTA.
    __pryzmRendererTerminalReloadRequired?: boolean;
}
function _deviceLossGlobals(): DeviceLossGlobals {
    return globalThis as unknown as DeviceLossGlobals;
}
function _isDeviceLossCapEnabled(): boolean {
    return _deviceLossGlobals().__pryzmDeviceLossRecoveryCap !== false;
}

// ── §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE: terminal "reload required" state ──────

/** True once the browser has blocked all GL contexts and no further recovery is possible. */
function _isRendererTerminal(): boolean {
    return _deviceLossGlobals().__pryzmRendererTerminalReloadRequired === true;
}

/**
 * §L-324 — does this error indicate the browser has BLOCKED GL context creation?
 *
 * After the device-loss recovery thrashes context creation, Chrome blocks all page GL
 * contexts ("Web page caused context loss and was blocked"); RendererHandleFactory then
 * throws "no GPU renderer available … / context could not be created". Either signal means
 * no context of ANY backend can be acquired — the terminal condition.
 */
function _isContextBlockedError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
    return (
        msg.includes('context loss and was blocked') ||
        msg.includes('was blocked') ||
        msg.includes('no gpu renderer') ||
        msg.includes('context could not be created')
    );
}

/**
 * §L-324 — enter the single TERMINAL "reload required" state.
 *
 * STOPS all further context-creation attempts (the flag is checked at the top of
 * createRenderer() and at the device.lost handler entry) and surfaces one honest reload CTA
 * on the shared brand overlay instead of an infinite "Recovering renderer…" spinner.
 * Idempotent. Best-effort overlay (no-op with no DOM, e.g. under unit tests).
 */
function _enterTerminalReloadState(reason: string): void {
    if (_isRendererTerminal()) return;
    _deviceLossGlobals().__pryzmRendererTerminalReloadRequired = true;
    console.error(
        `[createRenderer] §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE — ${reason}. The browser has ` +
        `blocked all page GL contexts; STOPPING every further WebGPU/WebGL context-creation attempt and ` +
        `surfacing a single "reload required" state (never an infinite recovery overlay).`,
    );
    try { showRendererSwapOverlay('Renderer unavailable — please reload the page'); }
    catch { /* overlay is best-effort (no DOM in tests) */ }
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

/**
 * §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION — resolve the EFFECTIVE backend preference for
 * one `createRenderer()` call.
 *
 * An explicit per-call `override` wins over the persisted preference. This lets the
 * device-loss safe-mode recovery force the WebGL2 path for the CURRENT session WITHOUT
 * calling `setRendererBackendPreference('webgl')` — which previously silently clobbered
 * the user's persisted WebGPU/Auto choice and produced the "persisted `forceWebGL`
 * flip-flopping true↔false" the founder reported (L-203 issue #1). With no override the
 * persisted preference is used unchanged.
 */
export function resolveEffectiveBackendPreference(
    override?: RendererBackendPreference,
): RendererBackendPreference {
    return override ?? getRendererBackendPreference();
}

/**
 * §L-372 Batch 2 / L-382 — decide whether a live-swap result on the classic
 * `'webgl-only'` backend is a FAILURE that must roll back.
 *
 * A `'webgl-only'` result is a failure ONLY when webgl-only was NOT the intended
 * target: for an `'auto'`/`'webgpu'`/`'webgl'` swap it means the WebGPURenderer
 * construction failed, so the swap rolls back to the previous renderer (unchanged
 * pre-L372B behaviour). When the swap DELIBERATELY targeted the classic renderer
 * (`'webgl-classic'`, the heavy-generation path), `'webgl-only'` is the intended
 * SUCCESS and must NOT be rejected. Extracted as a pure predicate so the Phase-5
 * swap guard is unit-testable.
 */
export function isUnintendedWebglOnlySwap(
    resultBackend: RendererBackend,
    intendedClassicWebGL: boolean,
): boolean {
    return resultBackend === 'webgl-only' && !intendedClassicWebGL;
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
export async function createRenderer(
    canvas: HTMLCanvasElement,
    backendOverride?: RendererBackendPreference,
): Promise<RendererResult> {
    // ── §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE — reconstruction-boundary guards ──
    // (1) Terminal state: once the browser has blocked ALL page GL contexts, refuse every
    //     new renderer build — the next attempt would only deepen the block. The user must
    //     reload; the reload CTA is already shown.
    if (_isRendererTerminal()) {
        throw new Error(
            '[createRenderer] §L-324 renderer is in the terminal "reload required" state ' +
            '(the browser blocked all GL contexts) — refusing to create a new renderer. Reload the page.',
        );
    }
    // (2) A live backend swap must NOT build a renderer while a device-loss recovery is in
    //     flight — two overlapping GPU devices / reconstruction boundaries is the L-324 trigger.
    //     The recovery's OWN recursive rebuild sets _recoveryRecursionInProgress, so it is let
    //     through; any EXTERNAL caller (the swap) is blocked and should roll back to the live
    //     renderer, which recovery will settle.
    if (_deviceLossGlobals().__pryzmRendererRecovering === true && !_recoveryRecursionInProgress) {
        throw new Error(
            '[createRenderer] §L-324 a WebGPU device-loss recovery is in flight — refusing to build a ' +
            'new renderer for a concurrent live backend swap (the swap is a reconstruction boundary and ' +
            'must not overlap recovery). The caller should roll back; recovery will settle the viewport.',
        );
    }

    // ── User backend preference (corner toggle, §PERF-WEBGPU-FRAGMENT) ────
    // 'webgl' resolves to the WebGL2 backend (high limits, modern resource
    // management — via WebGPURenderer's forceWebGL), falling back to plain
    // THREE.WebGLRenderer only if WebGL2 is unavailable. NOT the old plain-WebGL1
    // last-resort that crash-guarded on heavy generated buildings. The render
    // quality tier keeps SSGI/TRAA off on heavy scenes so WebGL2 stays light.
    // 'auto'/'webgpu' use the normal C04 §1.4 (native-WebGPU-first) chain.
    //
    // §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION — `backendOverride` (when supplied by the
    // device-loss safe-mode recovery) forces the backend for THIS call only, WITHOUT
    // persisting it, so the user's stored preference is never silently flip-flopped.
    const pref = resolveEffectiveBackendPreference(backendOverride);
    // §L-372 Batch 2 / L-382 — 'webgl-classic' routes DIRECTLY to a genuine classic
    // THREE.WebGLRenderer (backend 'webgl-only', no TSL/node compile). It shares the
    // forceWebGL entry (skip the WebGPU adapter), plus a dedicated flag telling the
    // factory to try the classic adapter FIRST and only fall back to the
    // WebGPURenderer(forceWebGL2) 'webgl-fallback' path if classic construction fails
    // (the guarded fallback = today's behaviour). 'webgl' keeps its exact meaning.
    const preferClassicWebGL = pref === 'webgl-classic';
    const forceWebGL = pref === 'webgl' || preferClassicWebGL;

    // §PERF-WEBGPU-FRAGMENT — make the boot backend DECISION observable so a
    // "why webgpu on a fresh profile?" is self-explanatory in the console:
    //   - resolvedPreference=webgl  → unset profile OR explicit WebGL (default).
    //   - resolvedPreference=webgpu → a value was PERSISTED by a prior toggle click
    //     (NOT an independent default — there is one renderer-creation path).
    console.log(
        `[createRenderer] §PERF-WEBGPU-FRAGMENT resolvedPreference=${pref} ` +
        `(forceWebGL=${forceWebGL}, preferClassicWebGL=${preferClassicWebGL}` +
        `${backendOverride ? `, session-override=${backendOverride}` : ''}) — ${preferClassicWebGL
            ? 'resolving to CLASSIC THREE.WebGLRenderer (backend webgl-only; no TSL/node compile — §L-372B/L-382), guarded-fallback to WebGL2 if classic construction fails'
            : forceWebGL
            ? 'resolving to WebGL2 backend (high limits; tier keeps post-FX off on heavy scenes)'
            : "using WebGPU-first chain (this value was explicitly persisted by the backend toggle; clear it or pick 'WebGL' to get the WebGL default)"}`,
    );

    // ── Factory creates the best available adapter (C04 §1.4) ────────────
    // RendererHandleFactory.create() attempts:
    //   1. WebGPURenderer with native WebGPU backend → type='webgpu'
    //   2. WebGPURenderer with WebGL2 backend        → type='webgl2'
    //   3. Plain THREE.WebGLRenderer (last resort)   → type='webgl2'
    // And logs `[renderer-three] backend: webgpu|webgl2|webgl1`.
    const handle = await RendererHandleFactory.create(canvas, forceWebGL, preferClassicWebGL);

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

                    // §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE — if we have already reached the
                    // terminal "reload required" state, do NOT attempt any further recovery: another
                    // context-creation attempt would only deepen the browser's block. The reload CTA
                    // is already shown; the loop stops here.
                    if (_isRendererTerminal()) {
                        console.error(
                            '[createRenderer] §L-324 WebGPU device lost while already in the terminal ' +
                            'reload-required state — no further recovery attempted (reload the page).',
                        );
                        return;
                    }

                    // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — mark the renderer as
                    // recovering so CesiumViewport.mount() GATES globe activation until the
                    // GPU process has settled and the pipeline is rebound. Cleared in the
                    // `finally` below on EVERY recovery outcome (rebound / safe-mode / failure).
                    _deviceLossGlobals().__pryzmRendererRecovering = true;

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
                        // §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION (L-203) — safe-mode is now a
                        // SESSION-only flag, driven through the recovery's backendOverride
                        // below. We deliberately do NOT persist 'webgl' here: overwriting the
                        // user's stored WebGPU/Auto choice is exactly the "persisted forceWebGL
                        // flip-flopping true↔false" the founder reported (the toggle then reads
                        // 'webgl', the user re-picks 'webgpu', a device loss forces 'webgl'
                        // again …). The persisted preference stays whatever the user chose; a
                        // fresh reload gives WebGPU another chance, and if it is genuinely
                        // unstable the cap re-engages safe-mode for that session.
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

                        // §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION — once safe-mode is engaged,
                        // force the WebGL2 path for THIS recovery via the override (NOT by
                        // persisting), so the WebGPU device.lost handler is not re-armed and
                        // the thrash loop ends, while the user's stored preference is untouched.
                        const _recoveryOverride: RendererBackendPreference | undefined =
                            _deviceLossGlobals().__pryzmRenderSafeMode === true ? 'webgl' : undefined;
                        // §L-324 — mark this as the recovery's OWN rebuild so the top-of-
                        // createRenderer reconstruction-boundary guard lets it through (only an
                        // EXTERNAL swap build is blocked). Always cleared, even on throw.
                        _recoveryRecursionInProgress = true;
                        let newResult: RendererResult;
                        try {
                            newResult = await createRenderer(canvas, _recoveryOverride);
                        } finally {
                            _recoveryRecursionInProgress = false;
                        }
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
                        // §L-324 SS-FIX-RECOVERY-LOOP-TERMINAL-STATE — the "2/2 cap accounts for the
                        // WebGL2 fallback ALSO being blocked" fix. The cap already dropped us to the
                        // WebGL2 safe-mode rebuild; if THAT rebuild also failed to acquire a context
                        // (or the error reports the browser blocked contexts), BOTH backends are
                        // exhausted — there is nowhere left to go. Enter the terminal state so we STOP
                        // retrying instead of thrashing context creation into a permanent block.
                        if (_isContextBlockedError(err) || _deviceLossGlobals().__pryzmRenderSafeMode === true) {
                            _enterTerminalReloadState(
                                _deviceLossGlobals().__pryzmRenderSafeMode === true
                                    ? 'the WebGL2 safe-mode recovery also failed to acquire a context'
                                    : 'context creation was blocked by the browser during recovery',
                            );
                        }
                    } finally {
                        // §FEAT-SWAP-LOADING-OVERLAY (L-141) — guaranteed hide once
                        // recovery settles on EVERY path (rebound, safe-mode, or a
                        // thrown recovery error). Paired with the show() above.
                        hideRendererSwapOverlay();
                        // §L-324 — but if recovery ended in the terminal state, re-assert the single
                        // honest reload CTA (the hide above released the recovery-spinner holder). It
                        // stays up instead of an infinite "Recovering renderer…" overlay so the user
                        // knows to reload.
                        if (_isRendererTerminal()) {
                            try { showRendererSwapOverlay('Renderer unavailable — please reload the page'); }
                            catch { /* best-effort */ }
                        }
                        // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — recovery has
                        // settled: the renderer is rebound (or degraded to safe-mode, or the
                        // attempt failed). Clear the gate so a queued Cesium activation may
                        // proceed. Bounded by recovery, so it can never stick indefinitely.
                        _deviceLossGlobals().__pryzmRendererRecovering = false;
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

    // §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION (L-203 issue #2) — surface a WebGL2 fallback
    // HONESTLY. When the user asked for 'webgpu'/'auto' but this device has no native
    // WebGPU, the WebGPURenderer silently used its WebGL2 backend → backend==='webgl-
    // fallback' and the TSL post-FX pipeline (SSGI/outlines/shadows) stays OFF. Say so
    // plainly so "are we actually on WebGPU?" is answerable from the console; the GPU
    // badge already shows "· webgl-fallback" (never a fake "· webgpu").
    // §L-372 Batch 2 — a 'webgl-classic' request that lands on 'webgl-fallback' means
    // the guarded fallback fired (classic construction failed); it is NOT a "no native
    // WebGPU" surprise, so suppress the WebGPU-fallback warning for it too.
    if (backend === 'webgl-fallback' && pref !== 'webgl' && pref !== 'webgl-classic') {
        console.warn(
            `[createRenderer] §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION requested backend "${pref}" but this ` +
            `device exposes NO native WebGPU adapter — resolved to the WebGL2 fallback (backend=` +
            `'webgl-fallback'). This is HONEST fallback, not a WebGPU device: TSL post-FX (SSGI / ` +
            `outlines / soft shadows) stays OFF. Pick "WebGL" in the toggle to make this explicit, or ` +
            `use a WebGPU-capable browser/GPU for the full pipeline.`,
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
