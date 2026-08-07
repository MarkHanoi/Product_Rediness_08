/**
 * @file src/rendering/pipeline/RenderPipelineManager.ts
 *
 * Phase 2/3/4 — TSL Render Pipeline Manager.
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-2 Step 2.3; §Phase-3 Steps 3.1–3.4; §Phase-4 Steps 4.1–4.4):
 *
 *  Phase 2 Pipeline (WebGPU, no post-FX):
 *    ScenePass (MRT: output, diffuseColor, normal, velocity)
 *      └─ Zone pass (zone layer composited over scene)
 *           └─ Background uniform blend → RenderPipeline output
 *
 *  Phase 3 Pipeline (SSGI/SSGINode + Denoise + Background):
 *    ScenePass (MRT)
 *      └─ Zone pass
 *           └─ SSGINode (r183) → DenoiseNode (AO scalar)
 *                └─ Composite: (scene × AO) + zone + (diffuse × GI)
 *                     └─ Background uniform blend → RenderPipeline output
 *
 *  Phase 4 Pipeline (TRAA colour filter + Outlines):
 *    ScenePass (MRT) — provides depth/normal/diffuse/velocity
 *      └─ SSGI composite (AO + GI)
 *           └─ + selectedOutlineNode + hoverOutlineNode
 *                └─ TRAANode colour filter (r183) blended via hasGeometry mask
 *                     └─ Background blend → RenderPipeline output
 *
 *  B4 upgrade note:
 *    r175 used PostProcessing from three/webgpu.
 *    r183 uses RenderPipeline from three/webgpu (API-compatible rename).
 *    r175 TRAAPassNode (scene-level pass) → r183 TRAANode (colour filter).
 *    TRAA is now applied inline in _buildPhase3Pipeline after outlines,
 *    before the final background blend — matching Pascal exactly.
 *
 *  Graceful degradation: when the renderer is WebGL (OBC-managed, Phases 1–4),
 *  the manager is a no-op.  The full pipeline activates after Phase 5 (OBC decoupling).
 *
 *  Retry logic (§Phase-4, Step 4.3):
 *    MAX_RETRIES = 3, RETRY_DELAY_MS = 500.
 *    On pipeline error: dispose, schedule rebuild.
 *    After retries exhausted: fall through to raw scene rendering.
 *
 *  Project-switch handling (§Phase-4, Step 4.4):
 *    Clears outline arrays synchronously, disposes outline GPU targets, rebuilds pipeline.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No semantic state mutations.
 *  - Does NOT import from src/commands/, src/elements/, or any store.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE §1):
 *  - No UI elements created here.  Status exposed via window.renderPipelineManager.
 *
 * Usage (EngineBootstrap):
 *   const rpm = new RenderPipelineManager();
 *   await rpm.bind(scene, camera, renderer);
 *   window.renderPipelineManager = rpm;
 */

import * as THREE from '../three-re-export';
import { createScenePass, MRT_OUTPUT } from './ScenePass';
import { createZonePass } from './ZonePass';
import { createBackgroundUniform, LIGHT_BG_HEX, DARK_BG_HEX } from './BackgroundUniform';
import type { PassNode, TSLNode } from '../tsl-types';
import type { BackgroundUniform, BgTheme } from './BackgroundUniform';
import { DOMEventBus } from '@pryzm/event-bus';
// §I2 — shared device-loss `usedTimes` predicate (single source of truth for
// the WebGPU dispose-throw family; also used by the element-builder safeDispose
// helpers). See ../safeDispose.ts.
// §RPM-RECOVERY-DOWNGRADE (ADR-0087) — `isShaderCompileError` classifies the
// "Fragment shader failed to compile" RuntimeError THREE throws after a
// device-loss + recovery rebuild so we can downgrade to the lightweight phase-2
// pipeline instead of letting it flip THREE's fatal "Rendering has stopped" latch.
import {
    isUsedTimesDisposeError,
    isShaderCompileError,
    // §GPU-RESOURCE-LIFETIME (ADR-0281) — the frame-boundary release drain and the
    // "a GPU resource was destroyed while still referenced" classifier. The latter
    // exists because such a failure is UNREACHABLE from a pipeline rebuild (the
    // damage is in the RENDERER's attribute/render-object bookkeeping, not in the
    // post-FX graph) — so it must never ride the retry ladder.
    drainGpuReleaseQueue,
    isDestroyedGpuResourceError,
} from '../safeDispose';
const _bus = new DOMEventBus();
/**
 * View-switch listener protocol — renderer-local definition.
 * Structurally compatible with src/engine/subsystems/core/views/IViewSwitchListener.
 * Both src/ ViewController and this package use the same two-method shape (structural typing).
 */
export interface IViewSwitchListener {
    onBeforeViewSwitch(): void;
    onAfterViewSwitch(): void;
}

/**
 * Minimal coordinator interface for Pascal-pass gating.
 * Structurally compatible with src/engine/subsystems/core/rendering/FrameCoordinator.
 */
interface IFrameCoordinator {
    shouldRenderPascalPass(): boolean;
}

// ── Constants (Phase 4 retry spec) ────────────────────────────────────────

const MAX_RETRIES     = 3;
const RETRY_DELAY_MS  = 500;

/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297) — coalescing window for destroyed-resource
 * reports. WebGPU validation errors arrive as FLOODS (a single shadow-map rebuild
 * produced 500 "Destroyed texture … used in a submit" in the founder's log), so
 * reports are accounted per window and only the FIRST drives a reconstruction.
 * Acting on each would be a worse outage than the fault it responds to.
 */
const DESTROYED_RESOURCE_WINDOW_MS = 2000;

/**
 * §PERF-PHASE2 — shadow-rebuild debounce window (ms).
 *
 * Was a hard-coded `16` (one frame). On project LOAD, PascalSceneLighting calls
 * scheduleShadowRebuild() once per new mesh in a single `bim-*-added` event burst
 * (~88×). A 16 ms window is shorter than the gap between successive burst sub-ticks,
 * so the timer re-armed and FIRED several times mid-load — each fire disposing +
 * recreating the ShadowDepthTexture while the WebGPU queue still referenced the old
 * handle (the "Destroyed texture used in a submit" race) AND running a full pipeline
 * rebuild longtask per fire. Raising the window to 100 ms lets a load burst coalesce
 * into ONE rebuild after the burst settles. Steady-state interactive shadow changes
 * (single mesh add/move) still rebuild after a single 100 ms idle — imperceptible —
 * and the in-flight/queued latch (§#47) is unchanged. Foreground render is identical.
 */
const SHADOW_REBUILD_DEBOUNCE_MS = 100;

// ── Phase flags ───────────────────────────────────────────────────────────

export type PipelinePhase = 'idle' | 'phase2' | 'phase3' | 'phase4' | 'error';

export interface PipelineStatus {
    phase:           PipelinePhase;
    webGpuActive:    boolean;
    retryCount:      number;
    ssgiActive:      boolean;
    traaActive:      boolean;
    outlinesActive:  boolean;
}

// ── Stored outline nodes (created by OutlinePass factory) ─────────────────

interface StoredOutlineNodes {
    selectedOutlineNode: TSLNode;
    hoverOutlineNode:    TSLNode;
    rawInstances: {
        selected: { dispose?: () => void } | null;
        hover:    { dispose?: () => void } | null;
    };
}

// ── RenderPipelineManager ─────────────────────────────────────────────────

export class RenderPipelineManager implements IViewSwitchListener {
    // ── State ───────────────────────────────────────────────────────────────
    private _scene:              THREE.Scene | null           = null;
    private _camera:             THREE.Camera | null          = null;
    private _renderer:           THREE.WebGLRenderer | null   = null;
    private _renderPipeline:     unknown                      = null;
    // §FIX-DISPOSE-USEDTIMES-DEVICE — the GPUDevice the CURRENT `_renderPipeline` was
    // built against. Disposing a RenderPipeline ACROSS a device boundary (after a backend
    // swap / device-loss recovery rebinds a NEW renderer+device) is the ROOT of the
    // "Cannot read properties of undefined (reading 'usedTimes')" throw:
    // RenderPipeline.dispose() → NodeManager.delete(renderObject) reads `.usedTimes` on
    // render objects the NEW device's NodeManager never created → `undefined.usedTimes`.
    // Recording the build-time device lets `_safeDisposeRenderPipeline` SKIP the
    // cross-device teardown (the old device's GPU resources are already reclaimed by the
    // browser) instead of walking a foreign NodeManager and throwing.
    private _renderPipelineDevice: unknown                    = null;
    private _scenePass:          PassNode | null              = null;
    private _zonePass:           PassNode | null              = null;
    private _outputNode:         TSLNode | null               = null;
    private _backgroundUniform:  BackgroundUniform | null     = null;

    private _webGpuActive        = false;

    // ── §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) ────────────────────────────────
    // When the resolved backend is the WebGL2 backend of a forced-WebGL
    // WebGPURenderer (RendererBackend 'webgl-fallback'), the TSL pipeline is OFF
    // (_webGpuActive=false) so render() would no-op — BUT in Phase 5 the OBC
    // PostproductionRenderer is locked to MANUAL and silenced, so NOTHING paints
    // the scene per-frame. The viewport then only repaints when some other code
    // path happens to drive a render (e.g. on camera 'rest'), producing the
    // "navigation is stuck — only updates after you stop moving" bug.
    //
    // Fix: when this flag is set, render() performs a lightweight, direct
    // `renderer.render(scene, camera)` every frame. The pascal callback already
    // calls render() once per rAF tick from the single FrameScheduler-owned loop
    // (C04 §2 / P3), so this drives a continuous repaint during orbit/pan/zoom on
    // the WebGL2 backend WITHOUT adding a second rAF loop. Enabled explicitly by
    // initScene ONLY for the Phase-5 webgl-fallback path (where this manager owns
    // the sole render); left OFF for native WebGPU (TSL pipeline renders) and for
    // the OBC-managed 'webgl-only' path (OBC's AUTO loop renders).
    private _lightweightWebGlActive = false;

    // ── §FIX-WEBGL2-GHOST-ON-ROTATE (W2.2 / ADR-0108) ────────────────────────
    // Optional per-frame hook invoked at the START of every lightweight WebGL2
    // move-frame, BEFORE the overlay's own `renderer.render()`. On the Phase-5
    // 'webgl-fallback' path the PRYZM overlay canvas (alpha:true, cleared to
    // transparent every frame) composites on TOP of the silenced OBC base canvas
    // whose GL context is `preserveDrawingBuffer:false`. §FIX-OBC-BASE-STALE-
    // COMPOSITE clears that base ONCE at activate/live-swap — but during
    // §PERF-WEBGL2-RENDER-ON-MOVE continuous repaint the stale base buffer can
    // resurface under the transparent overlay (driver-dependent buffer
    // re-presentation), so the OLD geometry shows through the overlay's
    // transparent pixels while the overlay draws the NEW positions → the reported
    // ghost/duplicate-on-rotate trails that settle once motion stops.
    //
    // initScene injects its `clearObcBaseFramebuffer` closure here so the OBC base
    // is re-cleared (color+depth invalidated) on EVERY lightweight frame, keeping
    // the transparent overlay the sole visible surface throughout the motion.
    // This field is ONLY consulted inside the `_lightweightWebGlActive` branch,
    // which is set true EXCLUSIVELY for the WebGL2 backend — the native-WebGPU TSL
    // render path never reads it, so WebGPU output is byte-unchanged.
    private _preLightweightFrameHook: (() => void) | null = null;

    private _phase: PipelinePhase = 'idle';
    private _hasPipelineError    = false;
    private _retryCount          = 0;

    /**
     * §GPU-RESOURCE-LIFETIME (ADR-0281) — latch: a destroyed/dangling GPU-resource
     * render failure has already consumed its ONE full-reconstruction attempt.
     * A second occurrence is unrecoverable and fails loudly instead of looping.
     *
     * Cleared ONLY by {@link recoverPipeline} — i.e. when a genuinely NEW renderer
     * (new GPU device, new attribute/render-object bookkeeping) has been bound, so
     * a fresh attempt is actually meaningful. Deliberately NOT cleared by
     * {@link onProjectSwitch}: that is the reconstruction this latch is guarding,
     * and clearing it there would rebuild the unbounded retry loop we are removing.
     */
    private _gpuResourceResetAttempted = false;

    /**
     * §RPM-RECOVERY-DOWNGRADE (ADR-0087) — when true, the heavy TSL post-FX
     * passes (SSGI / TRAA / outlines) are FORCE-DISABLED because a shader failed
     * to compile (typically on a freshly device-loss-recovered WebGPU device).
     * The manager then runs ONLY the lightweight phase-2 pipeline (MRT scene +
     * background blend) so the viewport keeps rendering plain instead of dying
     * behind THREE's fatal "Rendering has stopped" overlay.
     *
     * `activateSSGI()` / `activateTRAA()` / `activateOutlines()` no-op while this
     * latch is set. `tryUpgradePostFx()` clears it and re-attempts the full
     * pipeline on an idle frame; if compilation fails again it re-latches and
     * stays on the safe path.
     */
    private _postFxDisabled = false;

    private _ssgiActive          = false;
    private _traaActive          = false;
    private _outlinesActive      = false;

    /**
     * When true, the SSGI/TRAA post-processing passes are skipped each frame.
     * Use setSuspended(true) during heavy CPU operations (e.g. IFC streaming)
     * to prevent the WebGPU pipeline from competing with the main thread.
     * The base OBC scene render still runs; only post-FX are skipped.
     */
    private _suspended           = false;

    // Phase 3 — cached SSGI nodes for pipeline rebuilds that preserve SSGI
    private _cachedAo:  TSLNode | null = null;
    private _cachedGi:  TSLNode | null = null;

    // Phase 4 — stored outline nodes + raw GPU instances
    private _outlineNodes: StoredOutlineNodes | null = null;

    /**
     * Multi-Camera Single-Pipeline — Phase A.
     *
     * Set to true by notifyProjectionToggle() immediately before
     * ViewController calls camera.projection.set(). Consumed once by
     * updateCamera() to skip _fullRebuild() on projection switches.
     */
    private _cameraUpdateIsProjectionToggle = false;

    /**
     * BUG-FIX (bugs 1 & 3): armed by notifyProjectionToggle(false) when SSGI
     * is active.  Tells scheduleShadowRebuild() to call _fullRebuild() rather
     * than _rebuildPipelineWithCurrentState(), flushing the contaminated SSGI
     * temporal history that accumulated during plan view.
     * Cleared after the full rebuild executes.
     */
    private _ssgiNeedsFullRebuild = false;
    private _hasVisitedOrthographic = false;

    /**
     * Multi-Camera Single-Pipeline — Phase C.
     *
     * TSL UniformNode<float>. 0.0 = perspective, 1.0 = orthographic.
     * Written by notifyProjectionToggle() before the view switch fires.
     * Read by the compiled Phase 3 GPU shader via select() nodes to bypass
     * SSGI and TRAA compute paths in plan/section view — no recompile needed.
     * Null until _loadTSL() completes.
     */
    private _uIsOrthographic: any | null = null;

    // Phase 4 — live mutable arrays (owned here; passed by reference to OutlinePass)
    private _selectedObjects:  THREE.Object3D[] = [];
    private _hoveredObjects:   THREE.Object3D[] = [];

    /** True while a view switch is in progress — suppresses outline pass. */
    private _viewSwitchInProgress = false;

    /**
     * Phase 2 Performance — Task 2.4.
     * Optional FrameCoordinator injected by initScene. When set, render() checks
     * shouldRenderPascalPass() before executing PASCAL post-processing passes so
     * the concurrent scene mutation during view switches cannot race the GPU.
     */
    private _frameCoordinator: IFrameCoordinator | null = null;

    /** Optional state-change callback for UI sync. */
    onStateChange?: (status: PipelineStatus) => void;

    /**
     * §FIX-RENDER-RECOVERY-DEPTH (L-312 Problem A) — reusable size-probe so the
     * per-frame render-size reconcile ({@link _reconcileRenderSize}) allocates
     * nothing on the hot path.
     */
    private readonly _sizeProbe = new THREE.Vector2();

    /**
     * §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — the OPAQUE background colour
     * the WebGL2 lightweight overlay clears to each frame.
     *
     * On the WebGL2 (webgl-fallback) backend the PRYZM overlay used to clear to
     * TRANSPARENT (`setClearAlpha(0)`) so the CSS/OBC layer below showed through the
     * background pixels. But in Phase 5 the OBC base canvas underneath is silenced and
     * frozen — and during a camera rotation it re-composites its LAST frame under the
     * moving transparent overlay, so BOTH the frozen base and the live overlay draw the
     * SAME geometry at two different camera states → the founder's doubled walls /
     * offset roof (which "settles once motion stops", i.e. when the two cameras
     * re-converge). The per-frame OBC base clear alone did not reliably kill it.
     *
     * Fix: render the overlay OPAQUE (clear alpha 1) to the theme background colour, so
     * the overlay is the SOLE visible surface — the base cannot composite through it at
     * ALL. Same final look (the bg colour is the same white/navy the WebGPU pipeline
     * blends to), minus the doubling. WebGL2 lightweight path ONLY — the native-WebGPU
     * TSL path (which owns its own transparent presence-alpha compositing) is untouched.
     */
    private readonly _lightweightBgColor = new THREE.Color(LIGHT_BG_HEX);

    /**
     * §FIX-RENDER-RECOVERY-DEPTH (L-312 Problem A) — arm the per-frame render-size
     * reconcile. OFF by default so a HEALTHY session (never a device loss) pays
     * ZERO cost — no per-frame `clientWidth` read (which can force a layout reflow).
     *
     * It is armed permanently once {@link recoverPipeline} runs, because that is the
     * only situation the reconcile guards: after a device-loss the app recreates the
     * renderer but its resize closure still references the PRE-recovery renderer, so
     * the fresh renderer never receives a `setSize()` from the app again this session
     * — a later split-view resize would otherwise re-open the depth/color mismatch
     * flood forever. Before any recovery the app's own resize path is intact, so the
     * safety net is unnecessary.
     */
    private _renderSizeReconcileArmed = false;

    // ── Status ──────────────────────────────────────────────────────────────

    get status(): PipelineStatus {
        return {
            phase:          this._phase,
            webGpuActive:   this._webGpuActive,
            retryCount:     this._retryCount,
            ssgiActive:     this._ssgiActive,
            traaActive:     this._traaActive,
            outlinesActive: this._outlinesActive,
        };
    }

    get selectedObjects(): THREE.Object3D[] { return this._selectedObjects; }
    get hoveredObjects():  THREE.Object3D[] { return this._hoveredObjects;  }

    needsSsgiFullRebuild(): boolean {
        return this._ssgiNeedsFullRebuild;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * §PERF-WEBGL2-NO-TSL — authoritative "is this a REAL WebGPU backend?" test.
     *
     * The TSL pipeline (SSGI / outlines / multi-phase post-FX) may ONLY activate
     * on a genuine WebGPU backend. It must NOT key off the renderer CLASS:
     * a `THREE.WebGPURenderer` created with `forceWebGL: true` (the user's
     * "WebGL" backend toggle) has `isWebGPURenderer === true` BUT a **WebGL2
     * backend** — `renderer.backend.isWebGPUBackend === false`. Keying off the
     * class wrongly bound the full TSL pipeline on the forced-WebGL path,
     * producing multi-minute loads and a permanently frozen viewport on heavy
     * scenes (the WebGL path is meant to be the lightweight one).
     *
     * Resolution order:
     *  1. If the caller threaded an authoritative flag (`override`), trust it —
     *     the RendererHandleFactory already resolved the backend
     *     ('webgpu' vs 'webgl-fallback'/'webgl-only') and is the source of truth.
     *  2. Otherwise probe `renderer.backend.isWebGPUBackend === true` — the only
     *     renderer-level signal that distinguishes a real WebGPU backend from the
     *     WebGL2 backend of a forced-WebGL WebGPURenderer.
     *
     * Note we deliberately do NOT fall back to `isWebGPURenderer` — that is the
     * exact class-level check that caused the regression.
     *
     * @internal exported for unit testing (fake renderer → activates vs skips).
     */
    static isRealWebGPUBackend(
        renderer: THREE.WebGLRenderer | null | undefined,
        override?: boolean,
    ): boolean {
        if (typeof override === 'boolean') return override;
        const backend = (renderer as unknown as {
            backend?: { isWebGPUBackend?: boolean };
        } | null | undefined)?.backend;
        return backend?.isWebGPUBackend === true;
    }

    /**
     * Binds the manager to the live Three.js scene, camera, and renderer.
     *
     * If the renderer is backed by a **real WebGPU backend**, loads TSL modules
     * and sets up the Phase 2 pipeline (MRT ScenePass + ZonePass + Background).
     * Otherwise (WebGL2 backend — including a WebGPURenderer created with
     * `forceWebGL: true`, or a plain OBC-managed WebGLRenderer) it gracefully
     * no-ops so the lightweight WebGL render path is used.
     *
     * §PERF-WEBGL2-NO-TSL — see {@link isRealWebGPUBackend}. The ONLY condition
     * that means "real WebGPU → run TSL" is `backend.isWebGPUBackend === true`
     * (or an authoritative `backendIsWebGPU === true` override), NOT the renderer
     * class.
     *
     * @param backendIsWebGPU
     *   Optional authoritative override threaded from the caller, which already
     *   knows the resolved backend (RendererHandleFactory:
     *   'webgpu' | 'webgl-fallback' | 'webgl-only'). Pass `true` ONLY for the
     *   native-WebGPU 'webgpu' case. When omitted, `bind()` probes
     *   `renderer.backend.isWebGPUBackend`.
     */
    async bind(
        scene: THREE.Scene,
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        initialTheme: BgTheme = 'dark',
        backendIsWebGPU?: boolean,
    ): Promise<void> {
        this._scene    = scene;
        this._camera   = camera;
        this._renderer = renderer;

        // §FIX-SHADOW-ENABLE-LATCH (founder L-205) — RE-ASSERT both shadow latches onto the
        // (possibly freshly-swapped) renderer. `bind()` runs on the initial attach AND on a
        // backend swap / recoverPipeline re-attach; a new renderer object carries THREE's
        // defaults (`enabled=true`, `autoUpdate=true`), which would silently diverge from the
        // latch's intended state. Asserting here makes the enable/freeze state an INVARIANT of
        // whatever renderer is currently bound — the fix for "the leak survives a renderer
        // identity change". P2/ADR-0111: timing flags only, no dispose, no mapSize change.
        this._applyShadowEnabledState();
        this._applyShadowFreezeState();

        // §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — seed the opaque overlay
        // background from the current theme so the WebGL2 lightweight path clears to the
        // right colour (white in light mode, deep navy at night) on its very first frame.
        this._lightweightBgColor.set(initialTheme === 'dark' ? DARK_BG_HEX : LIGHT_BG_HEX);

        const isWebGPU = RenderPipelineManager.isRealWebGPUBackend(renderer, backendIsWebGPU);

        if (!isWebGPU) {
            console.log(
                '[RenderPipelineManager] §PERF-WEBGL2-NO-TSL WebGL2 backend detected ' +
                `(authoritativeOverride=${backendIsWebGPU === undefined ? 'none' : String(backendIsWebGPU)}, ` +
                `backend.isWebGPUBackend=${String((renderer as unknown as { backend?: { isWebGPUBackend?: boolean } })?.backend?.isWebGPUBackend)}). ` +
                'Lightweight WebGL render path active — TSL pipeline (SSGI / outlines / post-FX) stays OFF.',
            );
            this._phase = 'phase2';
            this._emitState();
            return;
        }

        this._webGpuActive = true;
        console.log('[RenderPipelineManager] WebGPU renderer confirmed. Initialising TSL pipeline...');

        // §GPU-RESOURCE-LIFETIME — subscribe to the device's uncaptured-error channel
        // BEFORE the first pipeline build, so a destroyed-resource validation failure
        // during project load (the founder's white-viewport-on-open, 500× "Destroyed
        // texture ShadowDepthTexture used in a submit") is classified instead of
        // silently producing an empty frame. `bind()` also runs on every renderer
        // swap / device-loss recovery, so the listener follows the live device.
        this._attachUncapturedGpuErrorListener();

        try {
            await this._loadTSL();
            this._backgroundUniform = createBackgroundUniform(initialTheme);
            await this._buildPipeline();
            console.log('[RenderPipelineManager] Phase 2 pipeline active.');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[RenderPipelineManager] Pipeline init error:', msg);
            this._phase = 'error';
            this._emitState();
        }
    }

    /**
     * Suspend or resume the WebGPU post-processing passes.
     *
     * When suspended, SSGI/TRAA compute passes are skipped each frame.
     * The base OBC scene render (managed separately) continues unaffected.
     * Call setSuspended(true) before heavy synchronous work (IFC streaming,
     * large snapshot restore) and setSuspended(false) when done.
     */
    setSuspended(suspended: boolean): void {
        this._suspended = suspended;
        if (suspended) {
            console.log('[RenderPipelineManager] Post-FX suspended (IFC load / heavy op)');
        } else {
            console.log('[RenderPipelineManager] Post-FX resumed');
        }
    }

    get isSuspended(): boolean { return this._suspended; }

    /**
     * §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) — enable/disable the lightweight
     * per-frame WebGL render path.
     *
     * Call with `true` ONLY when this manager is the sole renderer on the WebGL2
     * backend (Phase-5 'webgl-fallback' path: OBC is MANUAL/silenced and the TSL
     * pipeline is OFF). When enabled, {@link render} issues a direct
     * `renderer.render(scene, camera)` each frame so camera movement repaints
     * continuously. No-op when the renderer/scene/camera are not yet bound.
     *
     * Idempotent. Has no effect on a real WebGPU backend (the TSL pipeline owns
     * rendering there) — callers MUST NOT enable it in that case.
     *
     * @param active — true to drive a per-frame plain WebGL render.
     */
    setLightweightWebGlRender(active: boolean): void {
        if (this._lightweightWebGlActive === active) return;
        this._lightweightWebGlActive = active;
        console.log(
            `[RenderPipelineManager] §PERF-WEBGL2-RENDER-ON-MOVE lightweight WebGL render ` +
            `${active ? 'ENABLED' : 'disabled'} — continuous per-frame repaint on the WebGL2 backend ` +
            `${active ? 'active (camera movement now renders every frame)' : 'off'}.`,
        );
    }

    /** True while the lightweight per-frame WebGL render path is active. */
    get isLightweightWebGlActive(): boolean { return this._lightweightWebGlActive; }

    /**
     * §FIX-WEBGL2-GHOST-ON-ROTATE (W2.2 / ADR-0108) — inject a callback run at the
     * START of every lightweight WebGL2 move-frame, immediately before the overlay
     * `renderer.render()`. Used by initScene to re-clear the silenced OBC base
     * framebuffer per frame so its stale content cannot resurface under the
     * transparent PRYZM overlay during §PERF-WEBGL2-RENDER-ON-MOVE repaints
     * (the ghost/duplicate-on-rotate trail).
     *
     * The hook is consulted ONLY inside the lightweight branch of {@link render},
     * which runs EXCLUSIVELY on the WebGL2 'webgl-fallback' backend — the native
     * WebGPU TSL path never invokes it, so WebGPU rendering is untouched. Pass
     * `null` to clear the hook. Idempotent; carries no I/O (a pure setter).
     */
    setPreLightweightFrameHook(hook: (() => void) | null): void {
        this._preLightweightFrameHook = hook;
    }

    /**
     * §FIX-WEBGL2-GHOST-STALE-TARGET (L-05 / G6) — re-assert the two invariants a
     * ghost/smear REQUIRES to be violated, once per lightweight WebGL2 move-frame:
     *
     *   1. the frame must land on the CANVAS  → `setRenderTarget(null)`
     *   2. the frame must CLEAR before it paints → `autoClear{,Color,Depth} = true`
     *
     * WHY THIS IS NOT DEFENSIVE NOISE — the renderer is BORROWED, and a borrower can
     * leave it pointing somewhere else.
     *
     * `renderer` here is a shared THREE renderer, not a private one. Other subsystems
     * legitimately borrow it and REDIRECT its output to an offscreen render target:
     * the GPU picker (`SelectionManager._buildGpuPickRenderer().renderToTarget`),
     * `initTools`' pick-strategy probe, `ViewRenderCache.renderToCache`,
     * `PhotorealisticRenderer`, `PanoramaCapture`, `ViewportPathTracer` — every one of
     * them does `setRenderTarget(target) → render() → setRenderTarget(prev)`.
     *
     * Two of those restore WITHOUT a `try/finally` (the initTools probe;
     * `ViewRenderCache.renderToCache`, whose outer `catch` swallows the throw and never
     * restores). So if the inner `render()` THROWS — and on this backend it demonstrably
     * does: the founder's console carries `GL_INVALID_OPERATION: glDrawElements:
     * Mismatch between texture format and sampler type` and `Cannot read properties of
     * undefined (reading 'usedTimes')` on exactly this path — the renderer is left
     * PERMANENTLY BOUND to that offscreen target. From that instant every subsequent
     * `renderer.render(scene, camera)` paints into the offscreen buffer and NOTHING
     * touches the canvas: the canvas keeps compositing its LAST frame while the camera
     * keeps orbiting → stale geometry visibly trailing the live camera = the reported
     * ghost/smear-on-rotate. It also silently defeats every per-frame clear (an explicit
     * `clear()` clears the BOUND framebuffer, not the canvas — three's
     * `WebGLRenderer.clear()` issues `gl.clear()` against whatever FBO is current), which
     * is why a session can start clean and ghost permanently from one bad pick onwards.
     *
     * The frame owner is the only place that can enforce "my frame goes to the canvas".
     * Per C04 §2 the render-loop owner owns the frame — so it re-asserts the target and
     * the clear latches at the top of the frame instead of trusting every borrower to
     * unwind cleanly. Cost: two property writes + one no-op `setRenderTarget(null)` per
     * frame (three early-returns when the target is already null).
     *
     * WebGL2 lightweight path ONLY — the native-WebGPU TSL path composes through
     * PostProcessing, which owns its own target chain; it is deliberately untouched
     * (§FIX-WEBGPU-INVALID-PIPELINE-MRT, L-253).
     */
    private _assertLightweightFrameTarget(renderer: THREE.WebGLRenderer): void {
        const r = renderer as unknown as {
            getRenderTarget?: () => unknown;
            setRenderTarget?: (t: unknown) => void;
            autoClear?: boolean;
            autoClearColor?: boolean;
            autoClearDepth?: boolean;
        };
        try {
            // 1. Canvas, not a leaked offscreen target.
            if (typeof r.setRenderTarget === 'function' && r.getRenderTarget?.() != null) {
                console.warn(
                    '[RenderPipelineManager] §FIX-WEBGL2-GHOST-STALE-TARGET — a borrowed render ' +
                    'target was still bound at the start of a lightweight WebGL2 frame (a GPU-pick / ' +
                    'thumbnail / path-trace pass did not unwind, most likely because its render() threw). ' +
                    'Re-binding the canvas so the frame is not painted into an offscreen buffer.',
                );
                r.setRenderTarget(null);
            }
            // 2. Clear before paint — the overlay is alpha:true and composites over the
            //    OBC base canvas; a suppressed clear turns every frame into an accumulation
            //    buffer (exactly what `BimWorld.ts` does to the OBC renderer on purpose).
            if (r.autoClear === false)      r.autoClear      = true;
            if (r.autoClearColor === false) r.autoClearColor = true;
            if (r.autoClearDepth === false) r.autoClearDepth = true;
        } catch {
            /* invariant re-assertion is best-effort; never break the frame over it */
        }
    }

    render(delta = 0.016): void {
        // ── §GPU-RESOURCE-LIFETIME (ADR-0281, INVARIANT L2) ───────────────────
        // THE FRAME BOUNDARY. Element mutations (a furniture type swap, a wall
        // rebuild, …) DETACH their old subtree on their own tick and enqueue the
        // GPU release here; this is the one instant at which releasing is safe:
        // the previous frame's passes are fully encoded and submitted, and this
        // frame has not yet built a draw list. Releasing anywhere else is what
        // produced the founder's hard stop —
        //   "Failed to execute 'setIndexBuffer' … parameter 1 is not of type
        //    'GPUBuffer'" in _renderTransparents
        // i.e. a draw call reaching for an index buffer a store-event listener
        // had already destroyed. C04 §2 — the frame owner owns the boundary.
        // Deliberately BEFORE every early-return below: a frame we decline to
        // submit is still a frame boundary, and the queue must not grow unbounded
        // while the viewport is zero-size / suspended / paused.
        drainGpuReleaseQueue();

        // ── §L-328 SS-FIX-ELEVATION-VIEW-ZERO-SIZE-RENDER-TARGET (P1) ─────────
        // NEVER submit a render pass against a zero-size / incomplete framebuffer.
        // Creating a documentation view (elevation) spins up a split pane whose render
        // target is momentarily 0×0 before its container is laid out; the engine keeps
        // submitting against that incomplete framebuffer → "Framebuffer is incomplete:
        // Attachment has zero size" → a shader-VALIDATE_STATUS burst → WebGPU device loss,
        // on a trivial 53-mesh scene. The existing _reconcileRenderSize() 0×0 early-return
        // (line ~798) only skips the RESIZE — it does NOT suppress the SUBMIT. This gate
        // skips the submit ENTIRELY (both the lightweight WebGL2 path below and the WebGPU
        // pass) until the pane reports a non-zero measured backing-store size; the pass
        // resumes automatically once layout lands. This is the single change that stops the
        // device loss. C04 §2 (the frame owner owns the submit); P3 (the single rAF still
        // ticks, it simply skips this frame's submit). Reflow-free — see helper.
        if (this._isRenderTargetZeroSize()) return;

        // ── §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) ────────────────────────────
        // Lightweight WebGL2 path: the TSL pipeline is OFF (_webGpuActive=false)
        // but this manager owns the sole render in Phase 5. Drive a plain scene
        // render every frame so orbit/pan/zoom repaints continuously. This branch
        // is taken BEFORE the _webGpuActive early-return below.
        if (this._lightweightWebGlActive) {
            if (this._suspended) return; // honour heavy-op suspension (IFC load, etc.)
            const renderer = this._renderer;
            const scene    = this._scene;
            const camera   = this._camera;
            if (!renderer || !scene || !camera) return;
            try {
                // §FIX-WEBGL2-GHOST-ON-ROTATE (W2.2 / ADR-0108) — clear/invalidate
                // the silenced OBC base framebuffer per move-frame BEFORE painting
                // the transparent overlay, so a stale base frame cannot resurface
                // under the overlay's transparent pixels during continuous repaint
                // (the ghost/duplicate-on-rotate trail). WebGL2 path ONLY — this
                // branch never runs on the native-WebGPU TSL path. Best-effort:
                // a hook throw must not break the overlay render.
                if (this._preLightweightFrameHook) {
                    try { this._preLightweightFrameHook(); }
                    catch { /* base-clear is best-effort; overlay render proceeds */ }
                }
                this._assertLightweightFrameTarget(renderer);
                // §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — render the overlay
                // OPAQUE (clear alpha 1) to the theme background so the silenced OBC base
                // canvas underneath can NEVER composite through transparent background
                // pixels. That cross-layer bleed was the doubled/offset geometry on
                // rotate: the frozen base + the live overlay drew the same geometry at two
                // camera states. An opaque overlay is the sole visible surface, so the
                // doubling is impossible regardless of what the base does. Was
                // setClearAlpha(0) (transparent) — the exact channel the base bled through.
                (renderer as any).setClearColor?.(this._lightweightBgColor, 1);
                renderer.render(scene, camera);
            } catch (err: unknown) {
                console.error(
                    '[RenderPipelineManager] §PERF-WEBGL2-RENDER-ON-MOVE lightweight render failed:',
                    err instanceof Error ? err.message : err,
                );
            }
            return;
        }

        if (!this._webGpuActive) return;

        // Tick background uniform lerp every frame regardless of pipeline state
        this._backgroundUniform?.tick(delta);

        if (!this._renderPipeline || this._hasPipelineError) return;

        // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — do NOT submit a WebGPU frame while
        // an async shadow rebuild is in flight. Submitting during the rebuild's pipeline
        // dispose + `createScenePass()` recomposition (and the shadow-map realloc it can
        // trigger) is what destroyed the `ShadowDepthTexture` mid-submit → device loss.
        // The last-rendered frame stays on screen for the rebuild's duration (mirrors the
        // `_fullRebuild` plan-view path's `_hasPipelineError` pause). C04 §SHADOW rule 7.
        if (this._shadowRebuildPaused) return;

        // Skip expensive post-FX passes while suspended (e.g. during IFC geometry streaming).
        if (this._suspended) return;

        // ── Phase 2 Performance: FrameCoordinator guard ────────────────────
        // Skip PASCAL post-processing passes while a view switch is in progress.
        // The OBC base render (driven by the other rAF loop) still runs normally
        // so the display never goes blank. This is the companion to the existing
        // _viewSwitchInProgress outline guard — it provides a coarser but earlier
        // bail-out for the entire pipeline when coordinated by ViewController.
        if (this._frameCoordinator && !this._frameCoordinator.shouldRenderPascalPass()) {
            return;
        }

        // §FIX-RENDER-RECOVERY-DEPTH (L-312 Problem A) — NEVER begin a WebGPU render
        // pass with a depth attachment whose size differs from the color base plane.
        // Reconcile the renderer backing-store size to the LIVE canvas size FIRST, so
        // the color targets and the shared "depthBuffer" depth attachment both
        // reallocate from ONE source of truth. This closes the post-device-loss +
        // split-view flood ("depth stencil attachment size (1145×915) does not match
        // the other attachments' base plane (632×915)" → every submit rejected) that
        // the app's own resize path misses when its resize closure still points at the
        // pre-recovery renderer. Cheap: a compare per frame; a setSize only on genuine
        // drift (rare). Placed before the pass is encoded so the fix lands this frame.
        // Armed only after a device-loss recovery so healthy sessions pay nothing.
        if (this._renderSizeReconcileArmed) this._reconcileRenderSize();

        const rp = this._renderPipeline as any;
        try {
            // Do NOT render outlines while a view switch is in progress.
            // The _selectedObjects / _hoveredObjects arrays have been cleared,
            // but OutlineNode holds its own internal GPU render targets and can
            // still attempt a secondary scene pass if _outlinesActive is true.
            // Temporarily masking _outlinesActive via the flag avoids this.
            const outlinesWereActive = this._outlinesActive;
            if (this._viewSwitchInProgress) {
                this._outlinesActive = false;
            }

            (this._renderer as any)?.setClearAlpha?.(0);
            rp.render();

            if (this._viewSwitchInProgress) {
                this._outlinesActive = outlinesWereActive;
            }
        } catch (err: unknown) {
            this._hasPipelineError = true;
            console.error(`[RenderPipelineManager] PIPELINE_FAILURE reason="${(err as any)?.message ?? 'unknown'}" retryCount=${(this as any)._retryCount ?? '?'}`);
            console.error('[RenderPipelineManager] Pipeline render failed:', err);

            this._safeDisposeRenderPipeline();
            this._renderPipeline = null;

            // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — a shader-COMPILE failure (the
            // post-device-loss "Fragment shader failed to compile" RuntimeError)
            // will NEVER heal on a plain retry: the SAME heavy phase-4 TSL graph
            // (SSGI / TRAA / outlines) recompiles to the SAME failing shader and
            // THREE flips its fatal "Rendering has stopped" latch. Short-circuit
            // the retry ladder and DOWNGRADE straight to the lightweight phase-2
            // pipeline (no post-FX) so the viewport keeps rendering plain instead
            // of dying behind the hard error overlay.
            if (isShaderCompileError(err)) {
                console.warn(
                    '[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE shader-compile failure in render ' +
                    '— disabling post-FX (SSGI/TRAA/outlines) and falling back to the lightweight ' +
                    'phase-2 pipeline. Viewport stays alive (degraded, no overlay).',
                );
                this._downgradeToLightweightPipeline();
                return;
            }

            // §GPU-RESOURCE-LIFETIME (ADR-0281) — a DESTROYED-RESOURCE failure
            // ("setIndexBuffer … parameter 1 is not of type 'GPUBuffer'",
            // "Destroyed texture used in a submit", "deleted object") is damage in
            // the RENDERER's per-attribute / per-render-object bookkeeping. The
            // retry ladder below rebuilds the POST-FX PIPELINE, which cannot reach
            // that bookkeeping — so the founder's "attempt 1/3, backoff 500ms" was
            // guaranteed to fail and left a permanently blocked scene, blank
            // thumbnails, and no user-visible explanation. A retry that CANNOT
            // succeed is worse than a hard failure.
            //
            // Policy: ONE genuine reconstruction attempt, and if the fault RECURS we
            // fail LOUDLY into phase='error' so ViewportCrashGuard surfaces it. We
            // never sit in a silent retry loop on a fault class we cannot repair.
            //
            // ⚠ The reconstruction is DELIBERATELY NOT `onProjectSwitch()`, despite
            // that being the app's habitual "soft recovery" lever. onProjectSwitch()
            // reconciles size and schedules a shadow rebuild but *explicitly defers
            // the pipeline rebuild to onProjectLoaded()* ("Pipeline rebuild is
            // intentionally deferred…", ~line 1996). We have just set
            // `_hasPipelineError = true` and nulled `_renderPipeline`, so calling it
            // would log a confident recovery and leave the viewport permanently dark
            // with no error — reproducing the very symptom this fix exists to remove.
            // (That optimistic-log-without-the-work shape is also what L-663 pins.)
            // We therefore heal the size AND drive the one call that actually
            // restores `_renderPipeline` and clears `_hasPipelineError`.
            if (isDestroyedGpuResourceError(err)) {
                this._onDestroyedGpuResource(
                    err instanceof Error ? err.message : String(err),
                    'render() throw',
                );
                return;
            }

            if (this._retryCount < MAX_RETRIES) {
                this._retryCount++;
                const backoffMs = RETRY_DELAY_MS * Math.pow(2, this._retryCount - 1);
                console.warn(
                    `[RenderPipelineManager] Scheduling rebuild ` +
                    `(attempt ${this._retryCount}/${MAX_RETRIES}, backoff ${backoffMs}ms)`,
                );
                setTimeout(() => { void this._rebuildPipeline(); }, backoffMs);
            } else {
                console.error('[RenderPipelineManager] Retries exhausted — rendering without post-FX.');
                this._phase = 'error';
                this._emitState();
            }
        }
    }

    /**
     * §FIX-RENDER-RECOVERY-DEPTH (L-312 Problem A) — reconcile the renderer's
     * backing-store size with the LIVE canvas CSS size so the color targets AND
     * the shared default-framebuffer depth attachment (THREE names it
     * `"depthBuffer"`) always reallocate from ONE size read.
     *
     * ROOT CAUSE this closes — the post-device-loss depth/color size-mismatch flood:
     *
     *   The depth stencil attachment [TextureView of Texture "depthBuffer"] size
     *   (width: 1145, height: 915) does not match the size of the other
     *   attachments' base plane (width: 632, height: 915)
     *     → [Invalid CommandBuffer] … While calling [Queue].Submit()
     *
     * On a WebGPU device-loss the app RECREATES the renderer and sizes it ONCE, at
     * recovery time, to the canvas's then-current CSS size (WebGPURendererAdapter.
     * create → setSize(clientWidth, clientHeight)). If a viewport resize — classically
     * dragging the SPLIT-VIEW divider, which narrows the 3D pane to 632 / 417 / 1152 px
     * — lands DURING the ~2 s device-loss window (or the split layout reflows AFTER
     * recovery, when the app's resize closure still references the pre-recovery
     * renderer), the fresh renderer never gets re-sized. Its color backbuffer and the
     * shared depth attachment then derive from two different size reads: the depth
     * buffer is NOT resized to match the split-view color attachments. Every render
     * pass is invalid and every submit rejected — a PERMANENT flood, not a one-frame
     * transient (the render loop keeps submitting at the inconsistent size forever).
     *
     * FIX (single source of truth for pass size — NOT a validation silence): re-read
     * the LIVE canvas size and re-apply {@link THREE.WebGLRenderer.setSize}. THREE's
     * setSize cascades to BOTH the color targets and (via getDrawingBufferSize →
     * getDepthBuffer) the shared `depthBuffer`, so both reallocate from ONE read and
     * can no longer disagree. `updateStyle=false` keeps the canvas CSS (width:100% of
     * its container) untouched — we only correct the backing store. No-op in the common
     * case (sizes already consistent) and when the canvas is detached / zero-sized.
     *
     * @returns true if a corrective setSize was issued (i.e. drift was found).
     */
    /**
     * §L-328 SS-FIX-ELEVATION-VIEW-ZERO-SIZE-RENDER-TARGET (P1) — is the active render
     * target / canvas backing store zero-size (so a submitted pass would draw against an
     * incomplete framebuffer)?
     *
     * Keyed on the renderer's DRAWING-BUFFER / backing-store size
     * (getDrawingBufferSize → getSize → canvas.width/height) — that IS the dimension the
     * render-target attachments are allocated from, so a 0 here is exactly the
     * "Attachment has zero size" condition. Deliberately NOT `clientWidth`/`clientHeight`:
     * reading those forces a layout reflow every frame (see the `_renderSizeReconcileArmed`
     * note); the backing-store reads here are plain property/getter reads with no reflow, so
     * this is safe to run on EVERY frame of a healthy session. Returns false when no renderer
     * is bound (the caller's own null guards then apply) or the size cannot be read.
     */
    private _isRenderTargetZeroSize(): boolean {
        const r = this._renderer as unknown as {
            getDrawingBufferSize?: (t: THREE.Vector2) => THREE.Vector2;
            getSize?: (t: THREE.Vector2) => THREE.Vector2;
            domElement?: { width?: number; height?: number };
        } | null;
        if (!r) return false;
        try {
            const read =
                typeof r.getDrawingBufferSize === 'function' ? r.getDrawingBufferSize.bind(r)
                : typeof r.getSize === 'function' ? r.getSize.bind(r)
                : null;
            if (read) {
                const s = read(this._sizeProbe);
                if (!s || s.x <= 0 || s.y <= 0) return true;
            }
        } catch {
            /* fall through to the canvas backing-store read */
        }
        const el = r.domElement;
        if (el && ((el.width ?? 1) <= 0 || (el.height ?? 1) <= 0)) return true;
        return false;
    }

    private _reconcileRenderSize(): boolean {
        const renderer = this._renderer as unknown as {
            domElement?: { clientWidth?: number; clientHeight?: number };
            getSize?: (t: THREE.Vector2) => THREE.Vector2;
            setSize?: (w: number, h: number, updateStyle?: boolean) => void;
        } | null;
        if (!renderer || typeof renderer.setSize !== 'function' || typeof renderer.getSize !== 'function') {
            return false;
        }

        const el = renderer.domElement;
        const w = el?.clientWidth ?? 0;
        const h = el?.clientHeight ?? 0;
        // Detached / not-yet-laid-out canvas (0×0): resizing to zero would itself
        // produce the "Attachment has zero size" GL error — leave the last good size.
        if (w <= 0 || h <= 0) return false;

        const cur = renderer.getSize(this._sizeProbe);
        // Already consistent — the overwhelming common case. No churn, no realloc.
        if (cur.x === w && cur.y === h) return false;

        console.warn(
            `[RenderPipelineManager] §FIX-RENDER-RECOVERY-DEPTH render-size drift ${cur.x}×${cur.y} → ${w}×${h} ` +
            '— re-applying setSize so the color targets and the shared depthBuffer reallocate together ' +
            '(closes the post-device-loss / split-view depth-attachment size-mismatch flood).',
        );
        try {
            renderer.setSize(w, h, false);
        } catch (err: unknown) {
            console.warn(
                '[RenderPipelineManager] §FIX-RENDER-RECOVERY-DEPTH setSize during reconcile failed (non-fatal):',
                err instanceof Error ? err.message : err,
            );
            return false;
        }
        return true;
    }

    /**
     * Update the viewport theme — animates background colour smoothly.
     * @param theme — 'dark' | 'light'
     */
    setTheme(theme: BgTheme): void {
        this._backgroundUniform?.setTheme(theme);
        // §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — keep the WebGL2 opaque-overlay
        // background in sync with the theme (the WebGPU path animates via the uniform;
        // the lightweight path snaps to this colour on the next frame).
        this._lightweightBgColor.set(theme === 'dark' ? DARK_BG_HEX : LIGHT_BG_HEX);
    }

    /**
     * Animate the TSL background to any arbitrary hex color.
     * Use this when the user picks a custom color from the scene background
     * color picker (not just the two dark/light presets).
     * @param hex — CSS hex string, e.g. '#e8edf6'
     */
    setColor(hex: string): void {
        this._backgroundUniform?.setColor(hex);
        // §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — a custom scene-background
        // colour must also drive the WebGL2 opaque overlay clear. Guard bad hex so a
        // parse failure never throws on the render path.
        try { this._lightweightBgColor.set(hex); } catch { /* ignore invalid hex */ }
    }

    /**
     * Update the live array of selected objects for TSL outline highlighting.
     * Replaces the array contents in-place so the outline pass sees the update
     * immediately without a pipeline rebuild.
     *
     * @param objects — Current selection (empty array = no outlines).
     */
    setSelectedObjects(objects: THREE.Object3D[]): void {
        this._selectedObjects.length = 0;
        this._selectedObjects.push(...objects);
    }

    /**
     * Update the live array of hovered objects for pulsing outline highlighting.
     * Replaces the array contents in-place so the outline pass sees the update
     * immediately without a pipeline rebuild.
     *
     * @param objects — Currently hovered objects (empty = no hover outline).
     */
    setHoveredObjects(objects: THREE.Object3D[]): void {
        this._hoveredObjects.length = 0;
        this._hoveredObjects.push(...objects);
    }

    /**
     * Synchronously clears all selected and hovered object references and
     * suppresses outline compositing for the duration of a view switch.
     *
     * MUST be called by ViewController.activate() BEFORE any scene mutation
     * (deactivate, cleanup, camera change) so the PASCAL OutlineNode does not
     * attempt a secondary scene render against stale or removed Object3D refs.
     *
     * Call resumeOutlinesAfterViewSwitch() once the new view is fully active.
     */
    clearForViewSwitch(): void {
        this._selectedObjects.length = 0;
        this._hoveredObjects.length  = 0;
        this._viewSwitchInProgress   = true;
    }

    /**
     * Re-enables outline compositing after a view switch has completed.
     * Called at the END of ViewController.activate(), inside the finally block.
     */
    resumeOutlinesAfterViewSwitch(): void {
        this._viewSwitchInProgress = false;
    }

    // ── IViewSwitchListener ────────────────────────────────────────────────

    /**
     * Phase 2 Performance — Task 2.1.
     * Implements IViewSwitchListener.onBeforeViewSwitch().
     * Delegates to the existing clearForViewSwitch() so ViewController no
     * longer needs to access this instance via window.renderPipelineManager.
     */
    onBeforeViewSwitch(): void {
        this.clearForViewSwitch();
    }

    /**
     * Phase 2 Performance — Task 2.1.
     * Implements IViewSwitchListener.onAfterViewSwitch().
     * Re-enables outline compositing after the view is fully stable.
     */
    onAfterViewSwitch(): void {
        this.resumeOutlinesAfterViewSwitch();
    }

    /**
     * Phase 2 Performance — Task 2.4.
     * Inject the FrameCoordinator so render() can check shouldRenderPascalPass()
     * before executing post-processing. Called once from initScene after both
     * objects are created.
     */
    setFrameCoordinator(coordinator: IFrameCoordinator): void {
        this._frameCoordinator = coordinator;
    }

    /**
     * Schedule a debounced full pipeline rebuild after shadow-map changes.
     *
     * When PascalSceneLighting sets castShadow/receiveShadow on new meshes,
     * Three.js WebGPU destroys and recreates the ShadowDepthTexture.  Any live
     * RenderPipeline still holds compiled GPU shaders that reference the old
     * (now destroyed) texture handle — every subsequent rp.render() emits
     * "Destroyed texture [ShadowDepthTexture] used in a submit".
     *
     * Fix: pause rendering immediately (_hasPipelineError = true), then do a
     * FULL rebuild — recreate scenePass + zonePass + SSGI nodes — so all
     * compiled GPU handles are fresh.  Debounced to SHADOW_REBUILD_DEBOUNCE_MS
     * (§PERF-PHASE2, 100 ms) so a project-load burst of rapid additions
     * (~88 meshes in one event tick) coalesces into ONE rebuild after the burst
     * settles, instead of firing several mid-load (the old 16 ms window).
     */
    private _shadowRebuildTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * §#47 (TASK queue 2026-05-20) — in-flight + queued-follow-up guard for the
     * SSGI shadow rebuild path. Closes the "Destroyed texture [ShadowDepthTexture]
     * used in a submit" race during project load:
     *
     *   1. Project load fires `bim-*-added` for ~88 meshes in one event burst.
     *   2. PascalSceneLighting calls `scheduleShadowRebuild()` 88×.
     *   3. The setTimeout(16ms) coalesces those to ONE rebuild — but if any code
     *      (e.g. updateCamera, splitViewActivate) triggers ANOTHER rebuild before
     *      the in-flight one's `_fullRebuild()` completes, the WebGPU command
     *      queue holds stale ShadowDepthTexture handles that have been disposed
     *      and recreated mid-flight → 15× "Destroyed texture used in a submit".
     *
     * Fix: track `_rebuildInFlight`. If a schedule arrives while a rebuild is
     * underway, set `_rebuildQueuedAfterFlight` — the completion handler then
     * schedules exactly ONE follow-up rebuild. This serialises the GPU work
     * without losing the final rebuild signal. Matches the same "in-flight +
     * queued" pattern used by `WallRebuildCoordinator._scheduleFlush`.
     */
    private _rebuildInFlight = false;
    private _rebuildQueuedAfterFlight = false;

    /**
     * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (founder L-231) — true while an async shadow
     * rebuild is in flight. While set, {@link render} skips the WebGPU `rp.render()` submit
     * so NO frame is submitted during the rebuild's pipeline dispose + `createScenePass()`
     * recomposition (C04 §SHADOW rule 7: "never dispose or rebuild the render pipeline
     * off-frame" — the old normal path left `_hasPipelineError=false` and kept submitting
     * frames for the whole ~6 s rebuild, so the dispose/realloc landed mid-submit → device
     * loss). Paired with a shadow-map freeze so neither the pipeline teardown NOR the
     * per-light shadow depth pass can touch a submit-referenced texture during the rebuild.
     */
    private _shadowRebuildPaused = false;

    /**
     * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — enter the guarded window for an async
     * shadow rebuild: pause WebGPU submits AND freeze the shadow map (now per-light-effective,
     * see {@link _applyShadowFreezeState}). Balanced by {@link _endShadowRebuildGuard}.
     */
    private _beginShadowRebuildGuard(): void {
        this._shadowRebuildPaused = true;
        this.setShadowReallocFrozen(true);
    }

    /**
     * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — leave the guarded window: resume
     * submits and thaw the shadow map DEFERRED one macrotask past any in-flight submit
     * (ADR-0111 / §SHADOW-DEVICE-LOSS-FIX — the single depth regen at the new state lands on
     * a clean idle frame, never in a submit).
     */
    private _endShadowRebuildGuard(): void {
        this._shadowRebuildPaused = false;
        setTimeout(() => this.setShadowReallocFrozen(false), 0);
    }

    scheduleShadowRebuild(): void {
        if (!this._webGpuActive) return;

        // §#47 — coalesce schedules during an in-flight rebuild into a single
        // post-rebuild follow-up. Without this every scheduleShadowRebuild call
        // during the in-flight window would re-arm the 16 ms timer and the
        // SECOND fire would dispose ShadowDepthTextures the GPU queue still
        // references.
        if (this._rebuildInFlight) {
            this._rebuildQueuedAfterFlight = true;
            return;
        }

        console.log(`[RenderPipelineManager] SHADOW_REBUILD_SCHEDULED meshCount=${(this as any)._scene?.children?.length ?? '?'}`);
        if (this._shadowRebuildTimer !== null) {
            clearTimeout(this._shadowRebuildTimer);
        }
        this._shadowRebuildTimer = setTimeout(() => {
            this._shadowRebuildTimer = null;
            this._rebuildInFlight = true;
            // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — pause submits + freeze the
            // shadow map for the WHOLE async rebuild (covers both branches below). Released
            // in `_finishRebuildAndDrainQueue`, which every completion path funnels through.
            this._beginShadowRebuildGuard();
            console.log('[RenderPipelineManager] Rebuilding pipeline after shadow-map update.');

            // BUG-FIX (bugs 1 & 3): if returning from plan view with contaminated SSGI
            // temporal history, call _fullRebuild() to create fresh SSGINode + PassNodes
            // instead of _rebuildPipelineWithCurrentState() which reuses _cachedAo/_cachedGi.
            if (this._ssgiNeedsFullRebuild) {
                this._ssgiNeedsFullRebuild = false;
                console.log('[RenderPipelineManager] SHADOW_REBUILD → _fullRebuild() (flushing contaminated SSGI history from plan view).');
                const __t = performance.now();
                this._hasPipelineError = true;
                this._fullRebuild().then(() => {
                    this._hasPipelineError = false;
                    console.log(`[RenderPipelineManager] FULL_REBUILD_COMPLETE elapsed=${(performance.now() - __t).toFixed(1)}ms`);
                }).catch((err: unknown) => {
                    console.error('[RenderPipelineManager] Full rebuild after plan-view failed:', err);
                    this._hasPipelineError = false;
                    this._phase = 'error';
                    this._emitState();
                }).finally(() => {
                    this._finishRebuildAndDrainQueue();
                });
                return;
            }

            // Normal path: reuse cached SSGI nodes — safe because we have not been in
            // plan view since the last rebuild (no SSGI contamination).
            //
            // §FIX-SHADOW-REBUILD-LATCH-ASYNC (L-205) — `_rebuildPipeline()` is ASYNC
            // (its real work — dispose old RenderPipeline + `createScenePass()` — lands on a
            // later microtask). The old code cleared `_rebuildInFlight` in a SYNCHRONOUS
            // `finally`, so the latch fell to false (logged `SHADOW_REBUILD_COMPLETE
            // elapsed=0.0ms`) long BEFORE the async teardown completed. That defeated §#47's
            // coalescing: a second `scheduleShadowRebuild()` arriving during the async window
            // saw `_rebuildInFlight === false`, armed a fresh timer, and a SECOND rebuild's
            // off-frame dispose could race the first's still-in-flight GPU submit — the
            // "Destroyed texture [ShadowDepthTexture] used in a submit" class. We now await
            // the promise so the latch spans the REAL work; `_finishRebuildAndDrainQueue()`
            // clears it only once the async rebuild has settled, and any schedule that arrived
            // meanwhile is coalesced into exactly one post-completion follow-up.
            const __t_shadow_start = performance.now();
            Promise.resolve(this._rebuildPipeline())
                .then(() => {
                    console.log(`[RenderPipelineManager] SHADOW_REBUILD_COMPLETE elapsed=${(performance.now() - __t_shadow_start).toFixed(1)}ms`);
                })
                .finally(() => {
                    this._finishRebuildAndDrainQueue();
                });
            return;
        }, SHADOW_REBUILD_DEBOUNCE_MS);
    }

    /**
     * §#47 — clear the in-flight latch, then drain a single queued follow-up if
     * any scheduleShadowRebuild calls arrived while the in-flight rebuild was
     * running. Defers the follow-up via setTimeout(0) so it lands on a new
     * macrotask AFTER any GPU submit work for the just-completed rebuild has
     * drained from the WebGPU command queue.
     */
    private _finishRebuildAndDrainQueue(): void {
        this._rebuildInFlight = false;
        // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — resume submits + thaw the shadow
        // map (deferred past the in-flight submit) now the async rebuild has settled.
        this._endShadowRebuildGuard();
        if (this._rebuildQueuedAfterFlight) {
            this._rebuildQueuedAfterFlight = false;
            setTimeout(() => this.scheduleShadowRebuild(), 0);
        }
    }

    /**
     * §FIX-SHADOW-MIDSUBMIT-DESTROY (founder L-25) — suppress/restore the shadow
     * RENDER PASS without ever destroying the ShadowDepthTexture.
     *
     * ROOT CAUSE this closes: the §PERF-NAV-LOD nav lever used to drop shadows
     * during camera/pointer motion by clearing `keyLight.castShadow`. On the WebGPU
     * backend, when a light stops casting THREE's shadow renderer DESTROYS the
     * light's ShadowDepthTexture inside the very next `rp.render()` — but the
     * previous frame's command buffer (which referenced that texture) may still be
     * in flight on the GPU queue → "Destroyed texture [ShadowDepthTexture] used in a
     * submit" → WebGPU device-loss cascade → black viewport. Rapid mouse motion
     * (start/settle each nudge) thrashed this every few frames.
     *
     * The fix is to FREEZE the shadow map instead of tearing it down. Setting
     * `renderer.shadowMap.autoUpdate = false` tells THREE to REUSE the existing
     * ShadowDepthTexture and skip the (expensive) shadow-caster re-render — the pass
     * is skipped, but NO texture is allocated, reallocated, or destroyed. This is
     * the "prefer skipping the shadow render pass over destroying the resource"
     * guarantee: while frozen, no shadow texture can ever be `.destroy()`-ed within
     * the frame it is submitted, because none is destroyed at all.
     *
     * On restore we re-enable `autoUpdate` and set `needsUpdate = true` so the frozen
     * map is refreshed exactly once against the settled scene. `castShadow` is left
     * untouched throughout — the texture stays allocated the whole time.
     *
     * Idempotent; WebGPU-path only (no-op when the TSL/WebGPU backend is inactive —
     * the WebGL2 fallback drives its own shadowMap and is out of this lane). Never
     * disposes a GPU texture, so it fully honours §SHADOW-DEVICE-LOSS-FIX.
     *
     * @param suppressed  true ⇒ freeze the shadow map (skip the pass, keep the
     *                    texture); false ⇒ resume + refresh once.
     */
    private _shadowPassSuppressed = false;
    setShadowPassSuppressed(suppressed: boolean): void {
        if (!this._webGpuActive) return;
        if (suppressed === this._shadowPassSuppressed) return;
        this._shadowPassSuppressed = suppressed;
        this._applyShadowFreezeState();
    }

    /**
     * §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — freeze the shadow map around a
     * shadow-map REALLOCATION (resolution/level change) or the whole project-load +
     * tier-escalation window. Load-time sibling of L-25 (§FIX-SHADOW-MIDSUBMIT-DESTROY
     * / ADR-0111), which covered only the NAV-LOD per-motion path.
     *
     * ROOT CAUSE this closes: on project open the SceneQualityTier escalates to
     * `cinematic` and `ShadowQualityUpgrader.setLevel()` reallocates the Pascal key
     * light's shadow map 512→2048. With `renderer.shadowMap.autoUpdate === true` (the
     * live default) THREE performs that realloc INSIDE a `render()`/submit while the
     * rAF loop is still draining command buffers that reference the old
     * ShadowDepthTexture → "Destroyed texture [ShadowDepthTexture] used in a submit"
     * ×hundreds → WebGPU device-loss cascade → the whole app freezes on the last frame.
     * The `§SHADOW-DEVICE-LOSS-FIX` setTimeout(0) defer covered the upgrader's EXPLICIT
     * `.dispose()` but NOT THREE's own in-render realloc when `autoUpdate` is live.
     *
     * Freezing (`autoUpdate=false`) makes THREE REUSE the existing texture and never
     * touch the shadow map, no matter what `mapSize` the escalation writes. The caller
     * (RenderingPipelineCoordinator via an injected guard, and the initScene load
     * window) changes the resolution while frozen, then thaws — DEFERRED past the
     * in-flight submit (`setTimeout(0)`) — so the single regen at the new resolution
     * lands on an idle frame. `castShadow` is never touched; no texture is ever
     * `.destroy()`-ed here, so it honours the ADR-0111 shadow-lifecycle contract.
     *
     * Ref-counted (`frozen=true` pushes, `frozen=false` pops) so nested realloc guards
     * AND the whole-load freeze compose, and it composes with the nav freeze via the
     * shared {@link _applyShadowFreezeState}. WebGPU-path only; inert on the WebGL2
     * fallback (which owns its own shadowMap). Never disposes a GPU texture.
     */
    private _shadowReallocFreezeDepth = 0;
    setShadowReallocFrozen(frozen: boolean): void {
        if (!this._webGpuActive) return;
        if (frozen) {
            this._shadowReallocFreezeDepth++;
        } else if (this._shadowReallocFreezeDepth > 0) {
            this._shadowReallocFreezeDepth--;
        } else {
            return; // already fully thawed — nothing to pop
        }
        this._applyShadowFreezeState();
    }

    /**
     * Shared applier for the two independent freeze sources (nav-LOD transient +
     * §FIX-SHADOW-LOAD-TIER-DESTROY realloc/load). The shadow map is frozen
     * (`autoUpdate=false`) while EITHER source is active; when the last source
     * releases, `autoUpdate` is resumed and `needsUpdate=true` refreshes the frozen
     * map exactly once against the settled scene. Idempotent — only writes on a real
     * frozen⇄thawed transition, so overlapping sources never thrash the flag.
     */
    private _shadowFrozenState = false;
    private _applyShadowFreezeState(): void {
        const shadowMap = (this._renderer as { shadowMap?: { autoUpdate?: boolean; needsUpdate?: boolean } } | null)?.shadowMap;
        if (!shadowMap) return;
        const shouldFreeze = this._shadowPassSuppressed || this._shadowReallocFreezeDepth > 0;
        const transitioned = shouldFreeze !== this._shadowFrozenState;
        this._shadowFrozenState = shouldFreeze;
        // §FIX-SHADOW-ENABLE-LATCH (founder L-205) — ASSERT `autoUpdate` on EVERY call
        // (idempotent: same value ⇒ no thrash) rather than writing ONLY on a frozen⇄thawed
        // transition. The transition-only writer was the L-205 grey-catcher trap: after a
        // renderer REPLACEMENT (bind / backend swap / recoverPipeline) `this._renderer` is a
        // fresh object whose `shadowMap.autoUpdate` defaults to `true`, but the cached
        // `_shadowFrozenState` may still read `true`, so the next thaw saw "no transition"
        // and NEVER re-asserted — a leaked freeze left the live map with `autoUpdate=false`
        // forever, so the first shadow caster's depth pass never rendered and the L0 ground
        // catcher composited SOLID GREY. Asserting every call, plus re-invoking this from
        // {@link bind}, guarantees the NEW renderer always carries the intended freeze state.
        shadowMap.autoUpdate = !shouldFreeze;
        // Only KICK a one-shot refresh on a real THAW transition — never mid-freeze (that
        // would force a depth pass while the texture may still be in a submit; ADR-0111).
        if (transitioned && !shouldFreeze) shadowMap.needsUpdate = true;

        // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (founder L-231) — freeze the PER-LIGHT
        // shadow flag, not just `renderer.shadowMap.autoUpdate`.
        //
        // ROOT CAUSE this closes (C04 §SHADOW rule 10, ADR-0120): on the WebGPU node path
        // `renderer.shadowMap.autoUpdate` is INERT — three's `ShadowNode.updateBefore()`
        // gates the per-frame depth redraw on the PER-LIGHT `light.shadow.autoUpdate` /
        // `light.shadow.needsUpdate`, NOT on the renderer-level flag. So every freeze latch
        // in this manager (§FIX-SHADOW-MIDSUBMIT-DESTROY nav, §FIX-SHADOW-LOAD-TIER-DESTROY
        // realloc/whole-load, §FIX-SHADOW-WALLCOMMIT-DESTROY) was a NO-OP against the real
        // WebGPU shadow pass: the ShadowNode kept re-rendering (and, when a caller nulled
        // `shadow.map` for a mapSize realloc, kept destroying + recreating) the
        // `ShadowDepthTexture` every frame regardless of the "freeze" — which is exactly the
        // "Destroyed texture [ShadowDepthTexture] used in a submit" ×N → WebGPU device loss
        // the founder hit on the heavy residential scene. Writing the per-light flag makes
        // the freeze ACTUALLY stop the depth pass for the frozen duration, so no realloc /
        // regen can land mid-submit. WebGPU-path only (WebGL2 fallback owns its own shadowMap
        // and honours the renderer-level flag). Never disposes a texture (ADR-0111).
        if (this._webGpuActive) {
            this._forEachShadowCastingLight((sh) => {
                sh.autoUpdate = !shouldFreeze;
                if (transitioned && !shouldFreeze) sh.needsUpdate = true;
            });
        }
    }

    /**
     * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — invoke `cb` with the `shadow` object of
     * every shadow-CASTING directional light in the scene. Used to write the PER-LIGHT shadow
     * flags the WebGPU `ShadowNode` actually gates on (C04 §SHADOW rule 10). Pure traversal;
     * mutates nothing itself. Freeze transitions are infrequent (nav settle / realloc / load /
     * wall-commit / shadow-rebuild), so the sub-millisecond traverse is not a per-frame cost.
     */
    private _forEachShadowCastingLight(
        cb: (shadow: { autoUpdate?: boolean; needsUpdate?: boolean }) => void,
    ): void {
        this._scene?.traverse((obj) => {
            const light = obj as THREE.DirectionalLight;
            if (light.isDirectionalLight && light.castShadow && light.shadow) {
                cb(light.shadow as unknown as { autoUpdate?: boolean; needsUpdate?: boolean });
            }
        });
    }

    // ── §FIX-SHADOW-ENABLE-LATCH (founder L-205) — single-owner shadow-PASS enable latch ──
    /**
     * `renderer.shadowMap.enabled` is a GLOBAL GPU flag. Before L-205 it was save/restored
     * by FIVE modules across FOUR packages (BatchCoordinator + CurtainWallBuilder via the
     * `__pryzmBatchShadowWasEnabled` window hand-off, initUI's Cast-shadows toggle + IFC
     * streaming, PerformanceModePanel, ShadowQualityUpgrader) with NO single owner and NO
     * invariant. Any consumer that threw between save and restore leaked `enabled=false`
     * FOREVER (P4 violation: shared `window` state; P2 violation: `renderer.shadowMap` poked
     * from L4/L7 packages). {@link requestShadowRefresh} then silently no-op'd, so nothing
     * ever recovered — the exact "grey square until a manual backend swap" the founder saw
     * (a swap constructs a fresh adapter with `enabled=true`, masking the leak).
     *
     * This manager (renderer-three, the L1 THREE owner — P2) is now the SOLE writer of
     * `shadowMap.enabled`. Two orthogonal channels compose into it:
     *   • PREFERENCES ({@link _shadowPrefs}) — persistent user/mode choices (Cast-shadows
     *     toggle, performance mode). Effective-enabled requires EVERY preference `true`.
     *   • SUPPRESSIONS ({@link _shadowSuppressions}) — transient, ref-counted-by-reason
     *     (batch PSO-storm, IFC streaming). Effective-enabled requires EVERY count `0`.
     * Modelling them separately means a transient release can NEVER override a user's
     * explicit OFF, and a user toggle can never strand a transient suppression.
     */
    private _shadowPrefs = new Map<string, boolean>();
    private _shadowSuppressions = new Map<string, number>();

    private _shadowsEffectivelyEnabled(): boolean {
        for (const enabled of this._shadowPrefs.values()) if (!enabled) return false;
        for (const count of this._shadowSuppressions.values()) if (count > 0) return false;
        return true;
    }

    /**
     * THE ONLY writer of `renderer.shadowMap.enabled`. Idempotent — writes only on a real
     * change, but re-computes from the latch every call, so re-invoking it from {@link bind}
     * re-asserts the intended state onto a freshly-swapped renderer (closing the L-205 leak).
     * ADR-0111: touches only the timing flag `enabled` (skips/runs the pass) — never disposes
     * a texture, never resizes a live caster's mapSize.
     */
    private _applyShadowEnabledState(): void {
        const shadowMap = (this._renderer as { shadowMap?: { enabled?: boolean; needsUpdate?: boolean } } | null)?.shadowMap;
        if (!shadowMap) return;
        const enabled = this._shadowsEffectivelyEnabled();
        if (shadowMap.enabled === enabled) return;
        shadowMap.enabled = enabled;
        // Re-enabling: ask for one depth render so the freshly-enabled pass repaints the
        // settled scene — unless a freeze latch is deliberately holding the map quiet
        // (its deferred thaw owns the refresh then).
        if (enabled && !this._shadowFrozenState) shadowMap.needsUpdate = true;
    }

    /**
     * Set a persistent shadow PREFERENCE (a user/mode choice, NOT a transient suppression).
     * `source` namespaces independent choosers ('user' = Cast-shadows toggle, 'performance'
     * = performance mode) so they compose without clobbering each other. Effective-enabled
     * requires every preference `true`. P2: the sole `renderer.shadowMap.enabled` write lives
     * here; L4/L7 callers dispatch DOWN into this facade instead of poking the renderer.
     */
    setShadowsEnabledPreference(source: string, enabled: boolean): void {
        this._shadowPrefs.set(source, enabled);
        this._applyShadowEnabledState();
    }

    /**
     * Push a transient shadow-PASS suppression, ref-counted under `reason`. Returns an
     * idempotent, exception-safe release handle: call it (ideally in a `finally`) to pop.
     * Calling the handle twice pops only once, so a throwing consumer that releases in
     * `finally` can never leak the flag. Multiple concurrent pushes under the same reason
     * stack; the pass re-enables only when the LAST releases AND no preference forbids it.
     */
    pushShadowPassDisabled(reason: string): () => void {
        this._shadowSuppressions.set(reason, (this._shadowSuppressions.get(reason) ?? 0) + 1);
        this._applyShadowEnabledState();
        let released = false;
        return (): void => {
            if (released) return;
            released = true;
            const next = (this._shadowSuppressions.get(reason) ?? 0) - 1;
            if (next <= 0) this._shadowSuppressions.delete(reason);
            else this._shadowSuppressions.set(reason, next);
            this._applyShadowEnabledState();
        };
    }

    /**
     * Symmetric boolean form for suppressions whose push and release happen in DIFFERENT
     * modules (the batch PSO-storm: `BatchCoordinator._setupBatch` disables; either
     * `CurtainWallBuilder._reactivateShadows` ~30 s later OR the BatchCoordinator fallback
     * re-enables). Boolean-presence per reason (not counted) so the several batch restore
     * paths collapse to one idempotent release — replacing the cross-package
     * `__pryzmBatchShadowWasEnabled` window hand-off entirely. A given reason MUST use either
     * this or {@link pushShadowPassDisabled}, never both.
     */
    setShadowPassDisabled(reason: string, disabled: boolean): void {
        if (disabled) this._shadowSuppressions.set(reason, 1);
        else this._shadowSuppressions.delete(reason);
        this._applyShadowEnabledState();
        // §L-361-WEBGPU-TRANSMISSION-GUARD — batch start is the moment just before the resi-batch
        // PSO compile that device-loses on WebGPU. On the real WebGPU backend, neutralize the
        // transmission-glass node graph (the "expected a float" TSL device-loss seed) so the node
        // material rebuilds WITHOUT the transmission node before the next post-batch render.
        if (disabled && reason === 'batch') this._neutralizeTransmissionForWebGPU();
    }

    /**
     * §L-361-WEBGPU-TRANSMISSION-GUARD (Fix 2, L-366) — PUBLIC entry point so the
     * NON-batched geometry-add path can neutralize transmission glass too.
     *
     * ROOT CAUSE this closes: the private neutralizer had ONE caller —
     * {@link setShadowPassDisabled}('batch', true) — which BatchCoordinator invokes ONLY
     * during a batchCoordinator batch. The residential / office generators add their glass
     * OUTSIDE batches (the same reason the Auto-WebGL swap needs a non-batched hook), so on
     * that path the neutralizer NEVER ran: the MeshPhysicalNodeMaterial transmission node
     * graph reached the first post-generation WebGPU render un-neutralized and device-lost
     * with `THREE.TSL: Invalid generated code, expected a "float"`. Exposing this lets the
     * same non-batched seam the swap uses (initScene runTierPbrPass) disarm the transmission
     * node BEFORE that first render. Real-WebGPU-gated + idempotent inside; no-op on WebGL.
     */
    neutralizeTransmissionForWebGPU(): void {
        this._neutralizeTransmissionForWebGPU();
    }

    /**
     * §L-361-WEBGPU-TRANSMISSION-GUARD — on the REAL WebGPU backend, fall physical glass back
     * to plain opacity glass (`transmission = 0`) so the MeshPhysicalNodeMaterial transmission/
     * refraction TSL node graph is never emitted.
     *
     * The live §L-361-DIAG proved the crash is NOT a non-finite material float — every glass
     * scalar (transmission/thickness/ior/attenuationDistance/dispersion) is finite, yet
     * `THREE.TSL: Invalid generated code, expected a "float"` still fires during
     * `_renderTransparents` PSO compile → WebGPU device loss. That is the transmission NODE GRAPH
     * itself generating invalid WGSL on three r183's WebGPU backend, independent of the floats.
     * Removing `transmission` removes the node entirely (kept visibly glassy via opacity).
     * `needsUpdate` forces the node material to rebuild WITHOUT the transmission node.
     * Runs at every batch boundary so glass minted during a sub-batch is caught before the next
     * post-batch render. Idempotent (transmission already 0 → skipped).
     *
     * §L-361-FALLBACK-STILL-TSL (L-372) — the gate is the renderer CLASS, not `_webGpuActive`.
     * A `WebGPURenderer` with `forceWebGL2` (backend 'webgl-fallback', the Auto-WebGL heavy-scene
     * target) has `_webGpuActive===false` yet STILL node-compiles every material through the same
     * TSL builder on its WebGL2 backend — so the transmission node (and its "expected a float"
     * seed) survives the swap. Gating on `isWebGPURenderer` runs the neutralizer on BOTH the native
     * WebGPU backend and the WebGL2-backed fallback (both node-compile), and correctly SKIPS a
     * classic `THREE.WebGLRenderer` (backend 'webgl-only'), which has no node graph and keeps full
     * refractive glass.
     */
    private _neutralizeTransmissionForWebGPU(): void {
        try {
            // Fire whenever the renderer node-compiles (native WebGPU OR WebGL2-backed
            // WebGPURenderer). A plain THREE.WebGLRenderer (isWebGPURenderer falsy) has no TSL
            // node graph → skip, keeping refractive glass.
            const rendererNodeCompiles =
                (this._renderer as { isWebGPURenderer?: boolean } | null)?.isWebGPURenderer === true;
            if (!rendererNodeCompiles || !this._scene) return;
            const seen = new Set<string>();
            let neutralized = 0;
            this._scene.traverse((obj) => {
                const rawMat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
                if (!rawMat) return;
                const mats = Array.isArray(rawMat) ? rawMat : [rawMat];
                for (const m of mats) {
                    if (!(m instanceof THREE.MeshPhysicalMaterial) || seen.has(m.uuid)) continue;
                    seen.add(m.uuid);
                    const mm = m as unknown as { transmission?: number; opacity?: number; transparent?: boolean; needsUpdate?: boolean };
                    if (typeof mm.transmission === 'number' && mm.transmission > 0) {
                        mm.transmission = 0;
                        mm.transparent = true;
                        // keep it readably glassy — a fully-opaque pane reads as solid
                        if (typeof mm.opacity !== 'number' || mm.opacity >= 0.95) mm.opacity = 0.5;
                        mm.needsUpdate = true;
                        neutralized++;
                    }
                }
            });
            if (neutralized > 0) {
                console.warn(
                    `[RenderPipelineManager] §L-361-WEBGPU-TRANSMISSION-GUARD neutralized ${neutralized} ` +
                    `transmission material(s) → opacity glass on the node-compiling renderer (native ` +
                    `WebGPU or WebGL2-backed fallback — both emit the transmission TSL node, the ` +
                    `"expected a float" device-loss seed). Classic WebGLRenderer keeps refractive glass.`,
                );
            }
        } catch (err: unknown) {
            console.warn('[RenderPipelineManager] §L-361-WEBGPU-TRANSMISSION-GUARD failed (non-fatal):', err instanceof Error ? err.message : err);
        }
    }

    /**
     * §FIX-WEBGPU-GROUND-SHADOW-DEVICE-LOSS (founder L-197) — freeze-AWARE single
     * shadow-map refresh for the L-171 §FIX-GROUND-SHADOW-WEBGPU-RECEIVE re-home.
     *
     * ROOT CAUSE this closes: after L-171, `RealSunService.onKeyLightDriven` poked
     * `renderer.shadowMap.needsUpdate = true` DIRECTLY (from initScene, on the live
     * WebGPU renderer) whenever the key light was re-driven — including on the debounced
     * geometry-settle refit (RealEnvironmentService.refitShadowToScene), which fires in
     * the SAME window the SceneQualityTier escalates to `cinematic` and the shadow-map
     * freeze latch (§FIX-SHADOW-MIDSUBMIT-DESTROY L-25 / §FIX-SHADOW-LOAD-TIER-DESTROY
     * L-39 / ADR-0111) holds `autoUpdate=false` to keep the map quiet during the realloc.
     * `needsUpdate` OVERRIDES `autoUpdate=false` (THREE renders a shadow map when
     * `autoUpdate || needsUpdate`), so that direct poke DEFEATED the freeze: it forced
     * the shadow depth pass to run mid-tier-realloc / mid-submit, destroying+recreating
     * the ShadowDepthTexture while the WebGPU queue still referenced it →
     * "Destroyed texture [ShadowDepthTexture] used in a submit" ×hundreds → device loss →
     * the shadow pass died → the L0 ground shadow vanished. L-171's comment claimed the
     * poke was "identical to the RenderPipelineManager thaw", but the thaw only sets
     * `needsUpdate=true` AS PART OF thawing (`autoUpdate=true`, deferred past the submit) —
     * never while the map is frozen.
     *
     * The fix routes L-171's refresh through here so it is FREEZE-AWARE: when a freeze
     * latch is active we NO-OP — the pending thaw ({@link _applyShadowFreezeState} on the
     * last release) already sets `needsUpdate=true` against the settled scene, so the
     * caster's newly-fitted pose is refreshed the instant the freeze releases (L-171's
     * intent preserved). When nothing is frozen (a genuinely idle settled scene — the case
     * L-171 actually needed), we set `needsUpdate=true` for the one depth re-render into the
     * EXISTING texture; never touches `shadow.mapSize`, never disposes a texture (ADR-0111).
     *
     * P2: the `renderer.shadowMap` write lives here in renderer-three (the THREE owner),
     * not in the app layer. Inert when shadows are OFF (`enabled=false` — survival tier /
     * safe-mode). On the WebGL2 fallback (`_webGpuActive=false`) no freeze is ever active,
     * so it simply refreshes — matching L-171's original WebGL behaviour.
     */
    requestShadowRefresh(): void {
        const shadowMap = (this._renderer as { shadowMap?: { enabled?: boolean; autoUpdate?: boolean; needsUpdate?: boolean } } | null)?.shadowMap;
        if (!shadowMap) return;
        // §FIX-SHADOW-ENABLE-LATCH (founder L-205) — `enabled === false` is now ALWAYS a
        // LEGITIMATE suppression (user Cast-shadows OFF, performance mode, or a transient
        // batch/IFC suppression), never a leak: {@link _applyShadowEnabledState} is the sole
        // writer and the ref-counted latch makes an accidental leak impossible. So this early
        // return is a deliberate "shadows are off on purpose", not the silent bug-mask it was
        // before L-205 (when a leaked `enabled=false` stranded the refresh forever).
        if (shadowMap.enabled === false) return;
        if (this._webGpuActive &&
            (this._shadowFrozenState || this._shadowReallocFreezeDepth > 0 || this._shadowPassSuppressed)) {
            // Frozen — the thaw will refresh. Forcing it now would destroy the texture mid-submit.
            return;
        }
        // §FIX-WEBGPU-GROUND-SHADOW-RECEIVE (founder L-202) — RESTORE `autoUpdate=true` here,
        // not just `needsUpdate`. `_applyShadowFreezeState` is the ONLY writer of `autoUpdate`
        // and it flips it back to `true` ONLY on a frozen→thawed TRANSITION. If any freeze
        // source (nav / whole-load / tier realloc / wall-commit) left `autoUpdate=false` and
        // its thaw transition was missed or served against the pre-caster (empty) scene, the
        // live WebGPU key-light shadow map stops re-rendering each frame — so once the L0
        // ground catcher flips visible on the first caster it samples an empty/stale depth map,
        // reads "fully shadowed", and paints a SOLID GREY square with NO projected shadow
        // (the founder's populated-scene regression). This refresh only runs when NOT frozen,
        // and post-§FIX-WEBGPU-SHADOW-TIER-DESTROY `apply()` never resizes a live caster, so
        // resuming `autoUpdate` re-renders the depth pass into the EXISTING texture — the
        // natural THREE default, device-loss safe (no mapSize realloc, no mid-submit destroy).
        // This is what makes the geometry-settle refit's refresh ACTUALLY take effect and keep
        // the ground shadow live thereafter, restoring L-171's receive without L-171's crash.
        shadowMap.autoUpdate = true;
        shadowMap.needsUpdate = true;
    }

    /**
     * §DIAG-GROUND-SHADOW (founder L-205) — one-line dump of EVERY state that can make the
     * L0 ground catcher paint a solid grey square instead of receiving the real sun shadow.
     *
     * The catcher is a `ShadowMaterial` plane: it paints `opacity × (1 − shadowMask)`. It
     * therefore goes UNIFORM GREY exactly when the key light's shadow depth map is never
     * rendered (every fragment reads "fully shadowed"), and INVISIBLE when the map is live
     * and the fragment is lit. Five independent mechanisms can stop that depth pass:
     *
     *   1. `shadowMap.enabled === false`  — post-L-205 the SINGLE-OWNER enable latch
     *      ({@link setShadowsEnabledPreference} + {@link pushShadowPassDisabled} /
     *      {@link setShadowPassDisabled}) is the sole writer, so this is always a LEGITIMATE
     *      preference/suppression (reported below as `prefs`/`suppress`), never the leaked
     *      global it was when five modules save/restored it via `__pryzmBatchShadowWasEnabled`.
     *   2. `shadowMap.autoUpdate === false` — a leaked freeze latch (`_shadowFrozenState` /
     *      `_shadowReallocFreezeDepth` / `_shadowPassSuppressed`, ADR-0111).
     *   3. `keyLight.castShadow === false` — the nav-LOD / heavy-scene lever dropped it.
     *   4. `keyLight.shadow.map === null` — the depth target was disposed and never rebuilt.
     *   5. the WebGPU TSL ScenePass was composed against a caster-less scene and never
     *      rebuilt (§FIX-WEBGPU-SCENEPASS-FIRST-CASTER).
     *
     * Reading the code cannot distinguish these — they all end in "no shadow map". This
     * reports the live values so the failing one is named outright. Pure read + console
     * log; mutates nothing. P2: the THREE/renderer reads live in renderer-three.
     */
    logShadowDiagnostics(tag: string): void {
        const shadowMap = (this._renderer as {
            shadowMap?: { enabled?: boolean; autoUpdate?: boolean; needsUpdate?: boolean };
        } | null)?.shadowMap;

        let keyLight: THREE.DirectionalLight | null = null;
        this._scene?.traverse((obj) => {
            const light = obj as THREE.DirectionalLight;
            if (!keyLight && light.isDirectionalLight && light.castShadow) keyLight = light;
        });
        // Fall back to ANY directional light so a `castShadow=false` key light is reported
        // rather than silently read as "no light at all" (suspect 3 must stay visible).
        if (!keyLight) {
            this._scene?.traverse((obj) => {
                const light = obj as THREE.DirectionalLight;
                if (!keyLight && light.isDirectionalLight) keyLight = light;
            });
        }
        const kl = keyLight as THREE.DirectionalLight | null;
        const cam = kl?.shadow?.camera as THREE.OrthographicCamera | undefined;

        // §DIAG-GROUND-SHADOW-MAPTYPE (L-205 attempt 9 — shared-shadow-map probe).
        //
        // The grey rectangle is the shadow camera's ground footprint reading "fully
        // shadowed" everywhere. The prime suspect is a WebGPU depth map that is never
        // written: three's WebGPU `ShadowNode` OWNS its own RenderTarget and samples
        // `this.shadowMap`, but the shared `THREE.DirectionalLight` also carries the OBC
        // WebGL renderer's `WebGLRenderTarget` in `light.shadow.map`. Reading the MAP's
        // and its TEXTURE's constructor names discriminates a live WebGPU shadow target
        // (`RenderTarget` / `Texture`) from a foreign `WebGLRenderTarget` the WebGPU pass
        // never wrote, and the PER-LIGHT `shadow.autoUpdate` says whether the node path
        // (which gates on it, NOT on `renderer.shadowMap.autoUpdate`) will redraw the depth.
        //
        // `metresPerTexel = (right − left) / mapSize.width` is the shadow-quality invariant
        // (C04 §SHADOW.2.2). Pure reads; mutates nothing.
        const sh = kl?.shadow as (THREE.DirectionalLightShadow & { map?: { texture?: unknown }; autoUpdate?: boolean }) | undefined;
        const shMap = sh?.map as { constructor?: { name?: string }; texture?: { constructor?: { name?: string } } } | null | undefined;
        const camWidth = cam ? cam.right - cam.left : NaN;
        const mapW = sh?.mapSize?.width ?? 0;
        const metresPerTexel = Number.isFinite(camWidth) && mapW > 0 ? camWidth / mapW : NaN;

        console.log(
            `[RenderPipelineManager] §DIAG-GROUND-SHADOW (${tag}) ` +
            `backend=${this._webGpuActive ? 'webgpu' : 'webgl2'} phase=${this._phase} ` +
            `| shadowMap.enabled=${shadowMap?.enabled} autoUpdate=${shadowMap?.autoUpdate} ` +
            `needsUpdate=${shadowMap?.needsUpdate} ` +
            `| frozenState=${this._shadowFrozenState} reallocDepth=${this._shadowReallocFreezeDepth} ` +
            `passSuppressed=${this._shadowPassSuppressed} ` +
            `| keyLight=${kl ? 'present' : 'MISSING'} castShadow=${kl?.castShadow} ` +
            `shadow.map=${shMap ? 'allocated' : 'NULL'} ` +
            `shadowMapType=${shMap?.constructor?.name ?? 'none'} ` +
            `shadowTexType=${shMap?.texture?.constructor?.name ?? 'none'} ` +
            `lightAutoUpdate=${sh?.autoUpdate} ` +
            `mapSize=${mapW || '?'} ` +
            `metresPerTexel=${Number.isFinite(metresPerTexel) ? metresPerTexel.toFixed(3) : '?'} ` +
            `frustum=[${cam ? `${cam.left},${cam.right},${cam.top},${cam.bottom},near=${cam.near},far=${cam.far}` : 'n/a'}] ` +
            `| scenePass=${this._scenePass ? 'built' : 'NULL'} ` +
            `| effEnabled=${this._shadowsEffectivelyEnabled()} ` +
            `prefs={${Array.from(this._shadowPrefs.entries()).map(([k, v]) => `${k}:${v}`).join(',') || '∅'}} ` +
            `suppress={${Array.from(this._shadowSuppressions.entries()).map(([k, v]) => `${k}:${v}`).join(',') || '∅'}}`,
        );
    }

    /**
     * Multi-Camera Single-Pipeline — Phase A.
     *
     * Signal that the NEXT updateCamera() call is a projection toggle
     * (3D ↔ plan/section), not a structural camera change.  Call this in
     * ViewController immediately before triggering camera.projection.set().
     *
     * Effect: updateCamera() will use the fast path — it swaps the camera
     * reference on the existing PassNodes and rebuilds only the pipeline
     * graph (reusing cached SSGI nodes), without calling _fullRebuild().
     * This eliminates the 50–400 ms WebGPU shader recompile on every switch.
     *
     * The flag is consumed exactly once on the next updateCamera() call and
     * then cleared.  If notifyProjectionToggle() is called but no updateCamera()
     * follows (e.g. the view switch is cancelled), the flag stays set and is
     * consumed on the next updateCamera() regardless — safe because the fast
     * path degrades gracefully (no crash, renders correctly).
     *
     * @param isOrthographic  true = switching to plan/section (ortho),
     *                        false = switching back to 3D (perspective).
     */
    notifyProjectionToggle(isOrthographic: boolean): void {
        if (!this._webGpuActive) return;
        this._cameraUpdateIsProjectionToggle = true;
        if (isOrthographic) {
            this._hasVisitedOrthographic = true;
        }
        // Phase C: write the GPU uniform synchronously so the COMPILED Phase 3
        // pipeline already bypasses SSGI/TRAA by the time the first ortho frame
        // renders — no graph rebuild or shader recompile required.
        if (this._uIsOrthographic) {
            this._uIsOrthographic.value = isOrthographic ? 1.0 : 0.0;
            console.log(
                `[RenderPipelineManager] notifyProjectionToggle(${isOrthographic}) — ` +
                `fast path armed; _uIsOrthographic.value = ${isOrthographic ? 1.0 : 0.0}.`
            );
        } else {
            console.log(
                `[RenderPipelineManager] notifyProjectionToggle(${isOrthographic}) — ` +
                `fast path armed; _uIsOrthographic not yet allocated (TSL not loaded).`
            );
        }

        // BUG-FIX (bugs 1 & 3 — black walls / wrong tone after plan-view round-trip):
        //
        // SSGINode executes every frame even in plan view (_uIsOrthographic=1.0 only
        // bypasses its OUTPUT).  The SSGI temporal history accumulates near-zero (black)
        // AO values against the near-empty plan-view depth buffer.
        //
        // When returning to perspective we must NOT reuse _cachedAo/_cachedGi —
        // _buildPhase3Pipeline(cachedAo, cachedGi) would composite that black AO.
        //
        // Fix: arm _ssgiNeedsFullRebuild when returning to perspective with SSGI active.
        // scheduleShadowRebuild() reads this flag and calls _fullRebuild() (fresh
        // SSGINode + scenePass + zonePass) instead of _rebuildPipelineWithCurrentState()
        // which would reuse the contaminated cached nodes.
        //
        // We deliberately do NOT null _cachedAo/_cachedGi here — doing so would break
        // the phase3Active guard in updateCamera() Guard 2, dropping the pipeline to
        // Phase 2 and permanently disabling SSGI/TRAA until activateSSGI() is called.
        if (!isOrthographic && this._ssgiActive && this._hasVisitedOrthographic) {
            this._ssgiNeedsFullRebuild = true;
            // BUG-FIX (black walls on 3D return): block the PASCAL pipeline
            // immediately so zero contaminated frames composite the plan-view
            // SSGI AO history before _fullRebuild() creates fresh SSGINode nodes.
            // Without this, the debounce setTimeout in scheduleShadowRebuild() allows
            // 1-3 frames of near-zero (black) AO to render — visible as black walls
            // around door/window openings that had geometry clipped in plan view.
            // _hasPipelineError is cleared by _fullRebuild() on completion.
            this._hasPipelineError = true;
            console.log(
                '[RenderPipelineManager] notifyProjectionToggle(false) — ' +
                '_ssgiNeedsFullRebuild armed; PASCAL pipeline blocked immediately ' +
                'to prevent contaminated SSGI frames. _fullRebuild() will unblock.'
            );
        }
    }

    /**
     * Update the active camera reference and rebuild the pipeline as needed.
     *
     * OBC's OrthoPerspectiveCamera replaces `world.camera.three` with a new
     * THREE.OrthographicCamera (or reverts to THREE.PerspectiveCamera) when the
     * view mode changes.  The ScenePass and SSGI nodes must see the new camera.
     *
     * Guard 1 — same-object identity: if newCamera === this._camera (orbit/pan),
     *   skip the rebuild entirely.  OBC fires view-activated on every
     *   controls.update(), not only on camera-type changes.
     *
     * Guard 2 — projection toggle fast path: if notifyProjectionToggle() was
     *   called before this updateCamera(), swap the camera reference on the
     *   existing PassNodes and rebuild only the pipeline graph (no pass
     *   reconstruction, no SSGI shader recompile).
     *
     * Structural change (project reload, renderer re-init): full rebuild.
     *
     * Call this from the 'view-activated' window handler with
     * `world.camera.three` as the argument.
     */
    async updateCamera(newCamera: THREE.Camera): Promise<void> {
        if (!this._webGpuActive) return;

        // Guard 2 is checked FIRST: OBC's OrthoPerspectiveCamera mutates the same
        // camera object in place when toggling projections, so Guard 1 (same-reference
        // early-return) would fire before Guard 2 and short-circuit the projection
        // switch.  By evaluating the projection-toggle path first we ensure the fast
        // path executes even when the object reference has not changed.

        // Guard 2: projection toggle fast path (armed by notifyProjectionToggle).
        if (this._cameraUpdateIsProjectionToggle) {
            this._camera = newCamera;
            this._cameraUpdateIsProjectionToggle = false;

            // Swap the camera reference on existing PassNodes.
            // PassNode stores the camera as a mutable property used at render
            // time — swapping does not alter the compiled shader program.
            if (this._scenePass) (this._scenePass as any).camera = newCamera;
            if (this._zonePass)  (this._zonePass  as any).camera  = newCamera;

            // FIX-3: Trust the uniform value already committed by notifyProjectionToggle()
            // rather than reading newCamera.isOrthographicCamera. On the first 3D return
            // after a plan view, world.camera.three still references the OrthographicCamera
            // at the moment 'view-activated' fires — the projection change propagates
            // asynchronously — so the camera property gives a false "orthographic" result.
            // The uniform is always correct because notifyProjectionToggle() writes it BEFORE
            // camera.projection.set() is called. This also fixes the misleading log label.
            const isOrtho = this._uIsOrthographic ? this._uIsOrthographic.value === 1.0 : (newCamera as any).isOrthographicCamera === true;

            // Phase C: when the Phase 3 pipeline is active (SSGI compiled and
            // cached), the select(_uIsOrthographic, ...) nodes inside the COMPILED
            // shader handle the ortho/persp bypass without any graph rebuild.
            // notifyProjectionToggle() already wrote _uIsOrthographic.value before
            // this call, so the GPU sees the correct value on the very next frame.
            // Only fall back to _rebuildPipelineGraphOnly for Phase 2 (no SSGI),
            // where no select() node exists and the pipeline graph must be rewired.
            const phase3Active = this._ssgiActive && this._cachedAo !== null && this._cachedGi !== null;

            if (phase3Active) {
                console.log(
                    `[RenderPipelineManager] updateCamera: Phase C fast path ` +
                    `(${isOrtho ? 'orthographic' : 'perspective'}) — ` +
                    `camera swapped; _uIsOrthographic handles SSGI/TRAA bypass; ` +
                    `no graph rebuild (select() uniform already written by notifyProjectionToggle).`
                );
            } else {
                // Phase 2 pipeline (no SSGI) or SSGI nodes not cached yet —
                // rebuild the graph using existing PassNodes (no shader recompile).
                console.log(
                    `[RenderPipelineManager] updateCamera: projection toggle fast path ` +
                    `(${isOrtho ? 'orthographic' : 'perspective'}) — ` +
                    `camera swapped on existing passes; rebuilding graph only (Phase 2 path).`
                );
                this._rebuildPipelineGraphOnly(isOrtho).catch((err: unknown) => {
                    console.error(
                        '[RenderPipelineManager] Fast-path graph rebuild failed — ' +
                        'falling back to full rebuild:', err
                    );
                    this._fullRebuild().catch(console.error);
                });
            }
            return;
        }

        // Guard 1: same camera object reference — orbit, pan, or duplicate event.
        // This check is intentionally placed AFTER Guard 2 so that a
        // projection-toggle (which reuses the same object) is never short-circuited.
        if (newCamera === this._camera) {
            console.log(
                '[RenderPipelineManager] updateCamera: same camera object — ' +
                'skipping rebuild (orbit/pan or duplicate view-activated).'
            );
            return;
        }

        // Structural camera change (project reload, renderer re-init): full rebuild.
        this._camera = newCamera;
        if (this._shadowRebuildTimer !== null) {
            clearTimeout(this._shadowRebuildTimer);
            this._shadowRebuildTimer = null;
        }
        console.log('[RenderPipelineManager] Camera updated — rebuilding TSL pipeline (structural change).');
        this._hasPipelineError = true;
        try {
            await this._fullRebuild();
        } catch (err: unknown) {
            console.error('[RenderPipelineManager] Camera update rebuild failed:', err);
            this._phase = 'error';
            this._emitState();
        } finally {
            this._hasPipelineError = false;
        }
    }

    /**
     * Call when the user switches projects (Socket.io project-switch event).
     * Clears stale Object3D references, disposes outline GPU targets,
     * and rebuilds the pipeline with outlines re-activated so selection
     * highlights work correctly in the new project.
     * (Phase 4, Step 4.4)
     *
     * Root-cause fix: the previous implementation called _rebuildPipeline()
     * after setting _outlinesActive = false, which left outlines permanently
     * disabled for the lifetime of the new project session. activateOutlines()
     * creates fresh OutlineNode GPU instances bound to the now-empty
     * _selectedObjects / _hoveredObjects arrays, sets _outlinesActive = true,
     * and rebuilds the pipeline with outlines composited — restoring violet hover
     * and violet selection highlights (PRYZM brand palette) for the incoming project.
     * If WebGPU is inactive (WebGL path), this is a no-op.
     */
    onProjectSwitch(): void {
        console.log('[RenderPipelineManager] onProjectSwitch — clearing outline refs, resetting retry counter');
        this._retryCount = 0;

        // §FIX-PROJECT-SWITCH-GPU-STATE-NOT-RESET (L-316) — a project-switch is a
        // RECONSTRUCTION BOUNDARY, not just a data reset. The DATA isolates clean
        // (ProjectIsolationAudit ✓), but the RENDER GPU state does not: the old
        // project's teardown leaves two render-side faults the outline/ retry reset
        // below does NOT touch —
        //
        //   • "Destroyed texture [ShadowDepthTexture] used in a submit" (WebGPU) —
        //     core-app-model disposes the OUTGOING project's shadow depth texture
        //     while a submit that still references it is in flight (the same
        //     mid-submit-dispose race as §SHADOW-DEVICE-LOSS-FIX / L-303, now fired
        //     by project-switch).
        //   • "Framebuffer is incomplete: Attachment has zero size" — the render
        //     targets are not reallocated to the incoming viewport size.
        //
        // Reuse the EXISTING proven reconstruction machinery rather than inventing a
        // parallel one:
        //   1. _reconcileRenderSize() — one-shot: reallocate the color targets AND
        //      the shared depth attachment to the CURRENT canvas size so no pass
        //      begins with a zero-size / mismatched attachment (the same single-
        //      source-of-truth sizing as L-312A; one-shot here — a switch keeps the
        //      SAME renderer, so the per-frame arm is unnecessary).
        //   2. scheduleShadowRebuild() — routes the shadow-pass reconstruction
        //      through the guarded cycle that PAUSES WebGPU submits and FREEZES the
        //      shadow map for the whole async rebuild, then thaws DEFERRED past the
        //      in-flight submit (_begin/_endShadowRebuildGuard + §#47 in-flight
        //      coalescing). While submits are paused the outgoing project's shadow
        //      texture can be disposed with NO submit referencing it, and the
        //      rebuilt pipeline compiles against the incoming project's fresh shadow
        //      handles — closing the "used in a submit" crash at its source instead
        //      of swallowing the validation error. No-op on the WebGL path
        //      (webGpuActive false); the size reconcile above still heals its
        //      zero-size framebuffer.
        this._reconcileRenderSize();
        this.scheduleShadowRebuild();

        // §OI-053d — pipeline built once/tab; switch re-points outline arrays only.
        // If the outline GPU instances already exist (2nd+ open in this tab), we do
        // NOT dispose them or rebuild the SSGI/outline node graph — that teardown was
        // content-INDEPENDENT and 100% redundant across switches (the 768ms LONGTASK
        // + the repeated §I2 dispose fingerprint). Isolation is preserved by dropping
        // the previous project's stale Object3D refs via the O(1) array re-point; the
        // OutlinePass holds these arrays BY REFERENCE, so re-pointing needs no GPU
        // dispose and no shader recompile. Outlines stay ACTIVE, so the historical
        // "outlines left permanently disabled after switch" bug cannot recur.
        if (this._outlineNodes) {
            this.setSelectedObjects([]);
            this.setHoveredObjects([]);
            return;
        }
        // First switch before outlines were ever built: clear refs and let
        // onProjectLoaded() perform the one-time build.
        this._selectedObjects.length = 0;
        this._hoveredObjects.length  = 0;
        this._disposeOutlineInstances();
        this._outlinesActive = false;
        // NOTE: Pipeline rebuild is intentionally deferred to onProjectLoaded().
        // Rebuilding here (on pryzm-project-switch) runs longtasks while BIM
        // elements are mid-load, producing blank render frames that make geometry
        // appear to vanish.  onProjectLoaded() fires after elements are visible,
        // so the GPU rebuild races no draw-calls and the user sees no blank screen.
    }

    /**
     * Called once pryzm-project-loaded fires (all BIM elements are in the scene).
     *
     * This is the deferred half of the old onProjectSwitch() pipeline rebuild.
     * By waiting until the project is fully loaded before rebuilding outline GPU
     * targets and recompositing the SSGI/TRAA graph, we avoid the blank-screen
     * longtasks that previously fired while walls/slabs were still being added.
     *
     * §FIX-PROJECT-LOADED-DEBOUNCE (2026-05-07):
     * During reconnect / catch-up replay, the collaboration layer re-applies
     * missed commands which each fire pryzm-project-loaded. This causes N rapid
     * `activateOutlines()` calls → N pipeline rebuilds → cascading LONGTASKs
     * (observed: 7 fires, 1365ms + 1756ms + 325ms + ... ≈ 4.6s of main-thread work).
     *
     * Fix: debounce to 300ms so a burst of rapid fires coalesces into one rebuild.
     * 300ms > the typical catch-up replay window (~50ms) but short enough that the
     * user does not notice the delay before outlines are active in the new project.
     */
    private _projectLoadedDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    onProjectLoaded(): void {
        if (!this._webGpuActive) return;

        if (this._projectLoadedDebounceTimer !== null) {
            clearTimeout(this._projectLoadedDebounceTimer);
        }
        this._projectLoadedDebounceTimer = setTimeout(() => {
            this._projectLoadedDebounceTimer = null;
            // §OI-053d — build the SSGI/outline pipeline ONCE per tab. If the outline
            // GPU instances already exist, the project switch already re-pointed the
            // selected/hover arrays (O(1), no GPU dispose, no shader recompile), so
            // there is nothing to rebuild here. Only the FIRST loaded-event in this
            // tab authors the node graph + allocates the outline targets.
            if (this._outlineNodes) {
                console.log('[RenderPipelineManager] onProjectLoaded (debounced) — outlines already built; re-point only, no rebuild.');
                return;
            }
            console.log('[RenderPipelineManager] onProjectLoaded (debounced) — activating outlines (one-time build).');
            // Activate outlines: creates GPU targets, rebuilds pipeline with outlines
            // composited. Falls back to a plain rebuild if activation fails.
            this.activateOutlines().catch((err: unknown) => {
                console.error('[RenderPipelineManager] onProjectLoaded: outline activation failed:', err);
                void this._rebuildPipeline();
            });
        }, 300);
    }

    dispose(): void {
        this._disposeOutlineInstances();
        this._safeDisposeRenderPipeline();
        this._renderPipeline     = null;
        this._scenePass          = null;
        this._zonePass           = null;
        this._outputNode         = null;
        this._backgroundUniform  = null;
        this._scene              = null;
        this._camera             = null;
        this._renderer           = null;
        this._cachedAo                         = null;
        this._cachedGi                         = null;
        this._cameraUpdateIsProjectionToggle   = false;
        this._ssgiNeedsFullRebuild             = false;
        this._hasVisitedOrthographic           = false;
        this._uIsOrthographic                  = null;
        this._phase                            = 'idle';
        this._webGpuActive                     = false;
        this._postFxDisabled                   = false; // §RPM-RECOVERY-DOWNGRADE
        // §FIX-SHADOW-MIDSUBMIT-DESTROY / §FIX-SHADOW-LOAD-TIER-DESTROY — reset the
        // shadow-freeze state so a rebound singleton starts un-frozen.
        this._shadowPassSuppressed             = false;
        this._shadowReallocFreezeDepth         = 0;
        this._shadowFrozenState                = false;
        // §FIX-SHADOW-ENABLE-LATCH — a rebound singleton starts with a clean enable latch
        // (no stale transient suppressions; preferences re-seed from the fresh UI state).
        this._shadowPrefs.clear();
        this._shadowSuppressions.clear();
    }

    // ── Phase 3: SSGI activation ──────────────────────────────────────────

    /**
     * Activates SSGI (SSGINode-based ambient occlusion + GI compositing).
     * Requires Phase 2 pipeline to be active first.
     * (Phase 3 implementation sprint — upgraded to SSGINode in Phase B)
     */
    async activateSSGI(params?: object): Promise<void> {
        if (!this._webGpuActive || !this._scenePass || !this._camera) {
            console.warn('[RenderPipelineManager] Cannot activate SSGI: pipeline not ready.');
            return;
        }
        // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — post-FX is force-disabled after a
        // shader-compile failure (device-loss recovery). Re-building the heavy
        // SSGI graph would just re-trigger the fatal compile error, so stay on
        // the lightweight phase-2 pipeline. tryUpgradePostFx() clears the latch.
        if (this._postFxDisabled) {
            console.warn('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE activateSSGI skipped — post-FX disabled after a shader-compile failure.');
            return;
        }
        // Idempotency guard: skip rebuild when SSGI is already active and no params
        // are supplied. Re-activating SSGI when already on creates new SSGINode
        // instances, disposes the current RenderPipeline, and resets the SSGI
        // temporal-accumulation history — all of which cause a brief flicker.
        if (this._ssgiActive && this._cachedAo && this._cachedGi && !params) {
            console.log('[RenderPipelineManager] activateSSGI: already active — skipping redundant rebuild.');
            this._emitState();
            return;
        }
        try {
            const { createSSGIPass } = await import('./SSGIPass');
            const { ao, gi } = await createSSGIPass(this._scenePass, this._camera, params);
            this._ssgiActive  = true;
            this._cachedAo    = ao;
            this._cachedGi    = gi;
            console.log('[RenderPipelineManager] SSGI activated (SSGINode r183 + DenoiseNode).');
            await this._buildPhase3Pipeline(ao, gi);
        } catch (err: unknown) {
            console.error('[RenderPipelineManager] SSGI activation failed:', err);
        }
        this._emitState();
    }

    /** Deactivates SSGI and rebuilds the Phase 2 pipeline. */
    async deactivateSSGI(): Promise<void> {
        this._ssgiActive = false;
        this._cachedAo   = null;
        this._cachedGi   = null;
        await this._buildPipeline();
        this._emitState();
    }

    // ── Phase 4: TRAA activation ──────────────────────────────────────────

    /**
     * Activates Phase 4 TRAA (r183 TRAANode colour filter).
     *
     * B4 upgrade: r183 ships TRAANode.js — a colour-filter that accepts a
     * composite colour node as input. It is applied inline in _buildPhase3Pipeline
     * after outlines and before the background blend — exactly matching Pascal.
     *
     * No separate pass object is created here; TRAA is applied inline during
     * pipeline construction via createTRAAFilter() in _buildPhase3Pipeline.
     */
    async activateTRAA(): Promise<void> {
        if (!this._webGpuActive) {
            console.warn('[RenderPipelineManager] Cannot activate TRAA: WebGPU not active.');
            return;
        }
        // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — see activateSSGI().
        if (this._postFxDisabled) {
            console.warn('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE activateTRAA skipped — post-FX disabled after a shader-compile failure.');
            return;
        }
        this._traaActive = true;
        console.log('[RenderPipelineManager] TRAA enabled (r183 TRAANode colour filter).');
        await this._rebuildPipelineWithCurrentState();
        this._emitState();
    }

    /** Deactivates TRAA and rebuilds the pipeline without temporal AA. */
    async deactivateTRAA(): Promise<void> {
        // Idempotency guard: skip rebuild if already inactive.
        // Calling deactivateTRAA() when TRAA is already off still triggers
        // _rebuildPipelineWithCurrentState(), which disposes the RenderPipeline
        // and resets the SSGI temporal history — causing an unnecessary flicker.
        if (!this._traaActive) {
            console.log('[RenderPipelineManager] deactivateTRAA: already inactive — skipping redundant rebuild.');
            this._emitState();
            return;
        }
        this._traaActive = false;
        await this._rebuildPipelineWithCurrentState();
        this._emitState();
    }

    // ── Phase 4: Outline activation ───────────────────────────────────────

    /**
     * Activates Phase 4 TSL outlines (selected + hover pulsing).
     *
     * Outlines are composited AFTER SSGI (if active) and BEFORE TRAA + background blend
     * — matching the editor compositing order (post-processing.tsx lines 259–271).
     *
     * The `selectedObjects` and `hoveredObjects` arrays are owned by this
     * manager and passed by reference to OutlinePass.  Call
     * `setSelectedObjects()` / `setHoveredObjects()` to update them without
     * rebuilding the pipeline.
     */
    async activateOutlines(): Promise<void> {
        if (!this._webGpuActive || !this._scenePass || !this._scene || !this._camera) {
            console.warn('[RenderPipelineManager] Cannot activate outlines: pipeline not ready.');
            return;
        }
        // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — see activateSSGI().
        if (this._postFxDisabled) {
            console.warn('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE activateOutlines skipped — post-FX disabled after a shader-compile failure.');
            return;
        }
        try {
            const { createOutlinePasses } = await import('./OutlinePass');
            this._disposeOutlineInstances();
            const result = await createOutlinePasses(
                this._scene as THREE.Scene,
                this._camera,
                this._selectedObjects,
                this._hoveredObjects,
            );
            this._outlineNodes   = result;
            this._outlinesActive = true;
            console.log('[RenderPipelineManager] Outlines activated (selected + hover).');
            await this._rebuildPipelineWithCurrentState();
        } catch (err: unknown) {
            console.error('[RenderPipelineManager] Outline activation failed:', err);
        }
        this._emitState();
    }

    /**
     * Deactivates TSL outlines, disposes GPU render targets, and rebuilds
     * the pipeline without outline compositing.
     */
    async deactivateOutlines(): Promise<void> {
        this._outlinesActive = false;
        this._disposeOutlineInstances();
        await this._rebuildPipelineWithCurrentState();
        this._emitState();
    }

    // ── Private: TSL loading ──────────────────────────────────────────────

    /**
     * §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS (L-319) — whether `three/tsl` has finished
     * loading (`globalThis.__PRYZM_TSL__` present). Every pipeline builder that calls
     * `createScenePass` / `createZonePass` (which THROW when the TSL module is absent) MUST
     * gate on this. `bind()` sets `_webGpuActive = true` and awaits `_loadTSL()` in that order,
     * so there is a real window where the manager is "WebGPU active" but TSL is not yet loaded.
     * A batch's `autoEnablePerf → _setSsgi → _fullRebuild` (or a `scheduleShadowRebuild`) landing
     * in that window would call `createScenePass()` before `initTSL()` and throw an UNHANDLED
     * render rejection — the exact class that escapes the ViewportCrashGuard on the globe path
     * and ejects the user (L-318). Gating defers the (non-load-bearing) perf-mode rebuild until
     * `bind()` builds the pipeline once TSL is ready.
     */
    private get _tslLoaded(): boolean {
        return !!(globalThis as any).__PRYZM_TSL__;
    }

    private async _loadTSL(): Promise<void> {
        if ((globalThis as any).__PRYZM_TSL__) return;
        const tsl = await import('three/tsl');
        (globalThis as any).__PRYZM_TSL__ = tsl;
        // Phase C: allocate the orthographic-mode uniform exactly once.
        // Value 0.0 = perspective (default); 1.0 = orthographic (plan/section).
        if (!this._uIsOrthographic) {
            this._uIsOrthographic = (tsl as any).uniform(0.0);
        }
        console.log('[RenderPipelineManager] three/tsl loaded.');
    }

    // ── Private: pipeline construction ───────────────────────────────────

    /**
     * Phase 2 pipeline: ScenePass + ZonePass + Background blend.
     * Visual output is identical to WebGL — just routed through TSL.
     * If outlines are active, composites them before the background blend.
     *
     * B4: Uses RenderPipeline (r183) instead of PostProcessing (r175 API name).
     */
    private async _buildPipeline(): Promise<void> {
        if (!this._scene || !this._camera || !this._renderer) return;
        // §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS (L-319) — never call createScenePass()
        // before initTSL() has resolved (it throws). bind() awaits _loadTSL() before its own
        // _buildPipeline() call, so this only ever short-circuits an EARLY external trigger.
        if (!this._tslLoaded) {
            console.warn('[RenderPipelineManager] §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS _buildPipeline deferred — TSL not loaded yet.');
            return;
        }

        const { RenderPipeline } = await import('three/webgpu') as any;
        const tsl = (globalThis as any).__PRYZM_TSL__;
        if (!tsl) throw new Error('[RenderPipelineManager] TSL not loaded — bind() must be called with a WebGPU renderer first.');
        const { vec4, mix, step, float } = tsl;

        // §FIX-WEBGPU-INVALID-PIPELINE-MRT (L-253) — the G-buffer (diffuseColor/normal/velocity)
        // exists ONLY for SSGI and TRAA. Declaring those targets when nothing reads them made
        // every render pipeline INVALID for any material that does not emit them (ShadowMaterial,
        // lines, gizmos) — every submit was rejected, every frame. Ask for it only when used.
        this._scenePass = createScenePass(this._scene, this._camera, this._ssgiActive || this._traaActive);
        this._zonePass  = createZonePass(this._scene, this._camera);

        const scenePassColor = this._scenePass.getTextureNode(MRT_OUTPUT);
        const hasGeometry    = scenePassColor.a;
        const contentAlpha   = hasGeometry.max(this._zonePass.a);
        // PRESENCE alpha: 1 wherever ANY geometry/zone has been drawn
        // (even semi-transparent previews), 0 only for truly empty pixels.
        // Using contentAlpha directly as the output alpha would re-multiply
        // translucent ghost previews against the CSS white background and
        // wash them out (wall preview → single line; slab preview → invisible).
        const presenceAlpha  = step(float(0.0001), contentAlpha);

        // Phase 2: scene colour pass-through blended over background.
        // Optionally composited with outlines (Phase 4, no SSGI path).
        let contentColor: TSLNode = scenePassColor.rgb;

        if (this._outlinesActive && this._outlineNodes) {
            const { selectedOutlineNode, hoverOutlineNode } = this._outlineNodes;
            contentColor = contentColor.add(selectedOutlineNode).add(hoverOutlineNode);
        }

        const bg = this._backgroundUniform?.node ?? vec4(0, 0, 0, 1);

        // ── PURE-WHITE BACKGROUND FIX (Option 3) ─────────────────────────
        // Output alpha = contentAlpha (NOT a hardcoded 1). For pixels with
        // no geometry and no zone fill, alpha is 0 — the renderer composites
        // them with `setClearAlpha(0)` so the underlying viewport CSS
        // background (`#ffffff` set by SceneTheme) shines through unmodified.
        // This bypasses ACES tone mapping for background pixels, which is
        // why a "pure white" scene background previously turned ~#d6d6d6 in
        // ACES Filmic at exposure 0.9. See SceneTheme.ts and
        // BackgroundUniform.ts for the layered colour contract.
        this._outputNode = vec4(mix(bg, contentColor, contentAlpha), presenceAlpha);

        const rp = new RenderPipeline(this._renderer as any);
        rp.outputNode  = this._outputNode;

        this._safeDisposeRenderPipeline();
        this._renderPipeline   = rp;
        // §FIX-DISPOSE-USEDTIMES-DEVICE — record the device this pipeline is built against.
        this._renderPipelineDevice = this._currentBackendDevice();
        this._hasPipelineError = false;
        this._phase = this._outlinesActive ? 'phase4' : 'phase2';
        this._emitState();
    }

    /**
     * Phase 3 pipeline: ScenePass + ZonePass + SSGI (AO/GI) + Background.
     * Phase 4 extension: composites outlines after SSGI; applies TRAA colour
     *                    filter (r183 TRAANode) after outlines, before bg blend.
     *
     * Compositing formula (from migration spec §3.3 + §4.1, aligned with Pascal
     * post-processing.tsx lines 202–272):
     *   composite   = (sceneColor × AO) + zone + (diffuse × GI)
     *   withOutline = composite + selectedOutline + hoverOutline   [outlines on]
     *   colorSource = mix(withOutline.rgb, traaRgb, hasGeometry)  [TRAA on]
     *              OR withOutline.rgb                               [TRAA off]
     *   finalOutput = vec4(mix(background, colorSource, contentAlpha), 1)
     *
     * B4: Uses RenderPipeline (r183). TRAA applied inline as colour filter.
     *
     * @param ao — Denoised AO scalar node from SSGIPass.
     * @param gi — Indirect GI colour node from SSGIPass.
     */
    private async _buildPhase3Pipeline(ao: TSLNode, gi: TSLNode): Promise<void> {
        if (!this._scene || !this._camera || !this._renderer || !this._scenePass || !this._zonePass) return;
        // §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS (L-319) — the phase-3 path can rebuild the
        // scene pass (createScenePass) when SSGI/TRAA are inactive; guard against a pre-initTSL call.
        if (!this._tslLoaded) {
            console.warn('[RenderPipelineManager] §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS _buildPhase3Pipeline deferred — TSL not loaded yet.');
            return;
        }

        const { RenderPipeline } = await import('three/webgpu') as any;
        const tsl = (globalThis as any).__PRYZM_TSL__;
        if (!tsl) throw new Error('[RenderPipelineManager] TSL not loaded — bind() must be called with a WebGPU renderer first.');
        const { add, vec4, mix, select, step, float } = tsl;

        // §FIX-WEBGPU-INVALID-PIPELINE-MRT (L-253) — this is the ONLY consumer of the
        // G-buffer. The scene pass now builds those targets only when SSGI/TRAA is active
        // (declaring targets nothing reads made every pipeline INVALID — see ScenePass.ts).
        // If we somehow got here without them, rebuild the pass WITH the G-buffer rather
        // than reading absent targets: a missing attachment here would be the same class of
        // invalid-pipeline bug in the other direction.
        if (!this._ssgiActive && !this._traaActive && this._scene && this._camera) {
            console.warn('[RenderPipelineManager] §FIX-WEBGPU-INVALID-PIPELINE-MRT — phase-3 pipeline requested with SSGI/TRAA inactive; rebuilding the scene pass WITH its G-buffer.');
            this._scenePass = createScenePass(this._scene, this._camera, true);
        }

        const scenePassColor   = this._scenePass.getTextureNode('output');
        const scenePassDiffuse = this._scenePass.getTextureNode('diffuseColor');
        const scenePassDepth   = this._scenePass.getTextureNode('depth');
        const scenePassVelocity = this._scenePass.getTextureNode('velocity');

        const hasGeometry  = scenePassColor.a;
        const contentAlpha = hasGeometry.max(this._zonePass.a);
        // PRESENCE alpha — see _buildPipeline() for full rationale.  Output 1
        // wherever any geometry/zone exists so translucent ghost previews do
        // not get re-multiplied against the CSS white background.
        const presenceAlpha = step(float(0.0001), contentAlpha);

        // ── SSGI composite ────────────────────────────────────────────────
        // Compositing formula (01-WEBGPU-RENDERING-MIGRATION §3.3):
        //   final = (scene × AO) + (zone + diffuse × GI)
        const ssgiComposite: TSLNode = add(
            scenePassColor.rgb.mul(ao),
            add(
                this._zonePass.rgb,
                scenePassDiffuse.rgb.mul(gi),
            ),
        );

        // Phase C — GPU-level SSGI bypass via select(_uIsOrthographic, ...).
        // When _uIsOrthographic = 1.0 (plan/section view): output raw scene
        // colour, bypassing SSGI math entirely on the GPU.
        // When _uIsOrthographic = 0.0 (3D perspective view): use full SSGI composite.
        // select() compiles BOTH branches into the shader; the uniform picks which
        // branch result is used each frame without any pipeline reconstruction.
        let compositeColor: TSLNode = this._uIsOrthographic
            ? select(this._uIsOrthographic, scenePassColor.rgb, ssgiComposite)
            : ssgiComposite;

        // ── Phase 4: Outline compositing ──────────────────────────────────
        // Outlines are added AFTER SSGI, BEFORE TRAA + background blend.
        // Pascal pattern (post-processing.tsx lines 260–262):
        //   compositeWithOutlines = vec4(composite.rgb + selected + hover, alpha)
        if (this._outlinesActive && this._outlineNodes) {
            const { selectedOutlineNode, hoverOutlineNode } = this._outlineNodes;
            compositeColor = compositeColor.add(selectedOutlineNode).add(hoverOutlineNode);
        }

        const compositeWithAlpha = vec4(compositeColor, contentAlpha);

        // ── Phase 4: TRAA colour filter (B4 — r183 TRAANode) ─────────────
        // TRAA is applied AFTER outlines and BEFORE background blend.
        // Pascal pattern (post-processing.tsx lines 265–271):
        //   const traaOutput = traa(compositeWithOutlines, depth, velocity, camera)
        //   const colorSource = mix(composite.rgb, traaRgb, hasGeometry)
        //
        // Background pixels (hasGeometry=0, depth=1.0) are excluded from TRAA —
        // they output black when depth=1 enters the velocity reprojection.
        //
        // Phase C: TRAA is compiled into the pipeline when the camera is perspective
        // at build time, then gated by select(_uIsOrthographic, ...) so the GPU
        // bypasses the reprojection path when rendering ortho views.
        // This allows the SAME compiled pipeline to serve both view modes.
        // If the camera is already ortho at build time (e.g. first compile in plan
        // view), TRAA is skipped at construction — the uniform still guards correctly.
        const _cameraIsPerspective = (this._camera as any).isPerspectiveCamera === true;
        let colorSource: TSLNode = compositeColor;

        if (this._traaActive && _cameraIsPerspective) {
            try {
                const { createTRAAFilter } = await import('./TRAAPass');
                const { traaRgb } = await createTRAAFilter(
                    compositeWithAlpha as TSLNode,
                    scenePassDepth,
                    scenePassVelocity,
                    this._camera as THREE.Camera,
                );
                const traaColor: TSLNode = mix(compositeColor, traaRgb, hasGeometry);
                // Phase C: bypass TRAA via select() in ortho mode — both branches
                // are compiled; the uniform picks which value the GPU uses per frame.
                colorSource = this._uIsOrthographic
                    ? select(this._uIsOrthographic, compositeColor, traaColor)
                    : traaColor;
                console.log('[RenderPipelineManager] TRAA colour filter applied inline (Phase C select() bypass active).');
            } catch (traaErr: unknown) {
                console.warn('[RenderPipelineManager] TRAA filter failed, rendering without TRAA:', traaErr);
                this._traaActive = false;
            }
        }

        // ── Background blend (§3.4) ───────────────────────────────────────
        const bg = this._backgroundUniform?.node ?? vec4(0, 0, 0, 1);
        // PURE-WHITE BACKGROUND FIX (Option 3): see _buildPipeline() for the
        // full rationale.  contentAlpha lets the CSS viewport background
        // ('#ffffff' from SceneTheme) show through where there is no geometry,
        // so background pixels skip ACES tone mapping and stay pure white.
        this._outputNode = vec4(mix(bg, colorSource, contentAlpha), presenceAlpha);

        const rp = new RenderPipeline(this._renderer as any);
        rp.outputNode  = this._outputNode;

        this._safeDisposeRenderPipeline();
        this._renderPipeline   = rp;
        // §FIX-DISPOSE-USEDTIMES-DEVICE — record the device this pipeline is built against.
        this._renderPipelineDevice = this._currentBackendDevice();
        this._hasPipelineError = false;

        // Phase flag: promote to phase4 if TRAA or outlines are active
        this._phase = (this._traaActive || this._outlinesActive) ? 'phase4' : 'phase3';
        this._emitState();
    }

    // ── Private: helpers ──────────────────────────────────────────────────

    /**
     * §FIX-DISPOSE-USEDTIMES (2026-05-07):
     * Safely disposes the current RenderPipeline, swallowing the stale-GPU-session
     * error that Three.js throws after WebGPU device loss + recovery.
     *
     * Root cause: when the old RenderPipeline.dispose() fires, it triggers
     * `renderObject.onDispose` callbacks on THREE.js render objects from the OLD
     * GPU session. Those callbacks call `NodeManager.delete(renderObject)` — but
     * the NEW renderer's NodeManager has no record of those stale render objects,
     * so `this.nodes.get(renderObject)` returns `undefined` and then:
     *   "Cannot read properties of undefined (reading 'usedTimes')"
     *   at NodeManager.delete (three.webgpu.js:53547)
     *
     * The crash is non-fatal: the old GPU resources are already reclaimed by the
     * browser's WebGPU device-loss recovery path. Swallowing it with a console.warn
     * prevents the NEW pipeline from being erroneously pushed to `phase: 'error'`,
     * which previously left the viewport blank until the user hard-refreshed.
     *
     * Callers: _buildPipeline(), _buildPhase3Pipeline(), _rebuildPipelineGraphOnly(),
     * and dispose(). All four replace this._renderPipeline immediately after this call.
     */
    /**
     * @internal — the GPUDevice backing the current renderer (WebGPU backend), or null
     * when there is no renderer / it is the WebGL2 fallback (which owns no GPUDevice).
     * Used only to detect a device boundary in {@link _safeDisposeRenderPipeline}.
     */
    private _currentBackendDevice(): unknown {
        try {
            return (this._renderer as unknown as { backend?: { device?: unknown } })
                ?.backend?.device ?? null;
        } catch {
            return null;
        }
    }

    /* ─── §GPU-RESOURCE-LIFETIME — detection, classification, recovery ────────
     *
     * ADR-0297 made ONE path loud: a destroyed-resource fault that surfaces as a
     * JS THROW out of `render()`. That covers `setIndexBuffer … not of type
     * 'GPUBuffer'`, because a bad JS argument throws a TypeError synchronously.
     *
     * It does NOT cover the other half of the fault class, and the founder found
     * it the hard way (fresh session, project load, 3D viewport went WHITE after
     * ~1 s, elements still selectable, switching to WebGL restored everything):
     *
     *   500× "Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
     *         - While calling [Queue].Submit([[CommandBuffer …]])"
     *
     * That is a **WebGPU VALIDATION error**, not a JS exception. WebGPU is an
     * error-scope API: a validation failure inside an already-recorded command
     * buffer does not reject a promise and does not throw — it is delivered to
     * the device's `uncapturederror` event, and if nobody listens, the browser
     * merely prints it. `render()` returns normally, `PIPELINE_FAILURE` never
     * fires, nothing is classified, `phase` never leaves `phase4`, and the crash
     * guard is never told. The frame produces nothing and the user is shown a
     * blank viewport **with no error at all** — precisely the outcome ADR-0297
     * exists to abolish, reached by a route the ADR did not consider.
     *
     * The generalisation, and the reason this is a listener rather than another
     * special case: DETECTION MUST NOT DEPEND ON THE FAULT HAPPENING TO THROW.
     * `uncapturederror` is the device-wide channel for every WebGPU validation
     * failure of every resource kind, so a fourth resource kind (a destroyed
     * vertex buffer, a destroyed bind group, a destroyed sampler) is classified
     * by the SAME `isDestroyedGpuResourceError` predicate on the SAME path,
     * without a fourth founder discovering it by staring at a white screen.
     *
     * NOTE on the WebGL2 sibling reported alongside this
     * (`glDrawElements: Mismatch between texture format and sampler type
     * (signed/unsigned/float/shadow)` ×252, plus the `PCFSoftShadowMap has been
     * deprecated` notice): those come from the WebGL2 fallback context and are a
     * DIFFERENT defect — a shadow-map sampler/format mismatch, not a lifetime
     * fault. `isDestroyedGpuResourceError` deliberately does not match them, so
     * they neither trigger nor mask this path. They are logged as-is.
     */

    /** The GPUDevice we have already attached an `uncapturederror` listener to. */
    private _uncapturedErrorDevice: unknown = null;
    /** Bound listener, kept so it can be detached across a device swap. */
    private _uncapturedErrorListener: ((ev: Event) => void) | null = null;
    /** Destroyed-resource validation errors observed since the window opened. */
    private _destroyedResourceReports = 0;
    /** Start of the current reporting window (ms epoch). */
    private _destroyedResourceWindowStart = 0;

    /**
     * §GPU-RESOURCE-LIFETIME — subscribe to the WebGPU device's `uncapturederror`
     * channel so a destroyed-resource validation failure is CLASSIFIED even when
     * it never throws.
     *
     * Idempotent, and re-attaches across a device swap / device-loss recovery (the
     * listener is keyed on the device identity, so a new device gets a new
     * subscription and the superseded one is released).
     *
     * Deliberately tolerant: if the backend exposes no device, or the device is
     * not an EventTarget (a test double, a polyfill), this is a silent no-op —
     * detection is a safety net and must never itself break the renderer.
     */
    private _attachUncapturedGpuErrorListener(): void {
        const device = this._currentBackendDevice() as
            | (EventTarget & { removeEventListener?: unknown })
            | null;
        if (device === this._uncapturedErrorDevice) return;

        // Release the superseded device's subscription first.
        if (this._uncapturedErrorDevice && this._uncapturedErrorListener) {
            try {
                (this._uncapturedErrorDevice as EventTarget).removeEventListener(
                    'uncapturederror',
                    this._uncapturedErrorListener,
                );
            } catch { /* superseded device already gone — nothing to release */ }
        }
        this._uncapturedErrorDevice   = device;
        this._uncapturedErrorListener = null;

        if (!device || typeof (device as EventTarget).addEventListener !== 'function') return;

        const listener = (ev: Event): void => {
            const message = (ev as { error?: { message?: unknown } })?.error?.message;
            if (typeof message !== 'string') return;
            if (!isDestroyedGpuResourceError(message)) {
                // Not a lifetime fault (e.g. a genuine pipeline-validation bug).
                // Surface it — an uncaptured WebGPU error is never nothing — but do
                // not route it into the resource-lifetime recovery path.
                console.warn('[RenderPipelineManager] uncaptured WebGPU error:', message);
                return;
            }
            // coalesce=true — validation errors arrive in floods (500 from one
            // shadow-map rebuild in the founder's log).
            this._onDestroyedGpuResource(message, 'GPUDevice.uncapturederror', true);
        };

        try {
            (device as EventTarget).addEventListener('uncapturederror', listener);
            this._uncapturedErrorListener = listener;
            console.log(
                '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME uncapturederror listener attached — ' +
                'destroyed-resource validation failures that never throw are now classified.',
            );
        } catch (err: unknown) {
            console.warn(
                '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME could not attach uncapturederror ' +
                'listener (detection degraded, rendering unaffected):',
                err instanceof Error ? err.message : err,
            );
        }
    }

    /**
     * §GPU-RESOURCE-LIFETIME — the SINGLE classified handler for
     * "a GPU resource was released while the renderer still referenced it",
     * whatever channel it arrived on (a `render()` throw, or the device's
     * `uncapturederror` event) and whatever resource kind it names.
     *
     * Policy, unchanged from ADR-0297 and now applied to both channels:
     *   • ONE genuine reconstruction. The damage is in the RENDERER's per-attribute
     *     / per-render-object bookkeeping, so the backoff retry ladder (which
     *     rebuilds the POST-FX pipeline) provably cannot repair it — *a retry that
     *     cannot repair the fault class is a defect, not a mitigation*.
     *   • If it RECURS after that reconstruction → `phase='error'`, loudly, so the
     *     crash guard tells the user instead of leaving a silent blank viewport.
     *
     * ⚠ The reconstruction is DELIBERATELY NOT `onProjectSwitch()`. That method
     * explicitly DEFERS the pipeline rebuild to `onProjectLoaded()`, and by this
     * point `_hasPipelineError` is set and `_renderPipeline` nulled — so routing
     * recovery through it prints a confident recovery message and leaves the
     * viewport permanently dark with no error. `_rebuildPipeline()` is the only
     * call that actually restores `_renderPipeline` and clears the error latch.
     *
     * ── Why `coalesce` is a property of the CHANNEL, not of the fault ────────
     * A THROWN failure is inherently self-limiting: `render()` can only throw once
     * per frame, so every report is a distinct frame and a second one genuinely IS
     * a recurrence. ADR-0297's policy applies to it verbatim and unmodified.
     *
     * An UNCAPTURED VALIDATION error is not self-limiting at all — the founder's
     * log carried 500 from a single shadow-map rebuild, all describing the one
     * fault. Treating each as a separate event would either fire 500
     * reconstructions or declare a "recurrence" 16 ms after the first report, before
     * the (async) reconstruction had any chance to land. So that channel — and only
     * that channel — coalesces per window.
     *
     * Getting this backwards is how the previous revision of this method broke
     * ADR-0297's pinned `destroyedGpuResource` recurrence test.
     *
     * @param coalesce true for flood-prone channels (validation errors); false for
     *                 self-limiting ones (a `render()` throw).
     */
    private _onDestroyedGpuResource(message: string, source: string, coalesce = false): void {
        // Already failed loudly — the user has been told; nothing further to do.
        if (this._phase === 'error') return;

        if (coalesce) {
            const now = Date.now();
            if (now - this._destroyedResourceWindowStart > DESTROYED_RESOURCE_WINDOW_MS) {
                this._destroyedResourceWindowStart = now;
                this._destroyedResourceReports     = 0;
            }
            // One action per window: the remaining 499 describe the same fault, and the
            // reconstruction they would each re-trigger is still in flight.
            if (++this._destroyedResourceReports > 1) return;
        }

        if (this._gpuResourceResetAttempted) {
            console.error(
                '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME destroyed/dangling GPU resource ' +
                `RECURRED after a full reconstruction (via ${source}: "${message.slice(0, 160)}") — this is ` +
                'an unrecoverable resource-lifetime defect, not a transient. Failing loudly ' +
                '(phase=error) so the user is told, rather than leaving a blocked scene behind a ' +
                'silent retry or a blank viewport behind no error at all.',
            );
            this._phase = 'error';
            this._emitState();
            return;
        }

        this._gpuResourceResetAttempted = true;
        console.warn(
            '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME destroyed/dangling GPU resource ' +
            `reached the GPU (via ${source}: "${message.slice(0, 160)}") — a backoff retry cannot ` +
            'repair renderer-side resource state. Performing ONE immediate reconstruction instead ' +
            'of the retry ladder. If this recurs the pipeline will fail loudly.',
        );
        try {
            this._reconcileRenderSize();
            void this._rebuildPipeline();
        } catch (resetErr: unknown) {
            console.error(
                '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME reconstruction failed — ' +
                'failing loudly rather than leaving a dark viewport:',
                resetErr instanceof Error ? resetErr.message : resetErr,
            );
            this._phase = 'error';
            this._emitState();
        }
    }

    /**
     * §GPU-RESOURCE-LIFETIME — the PUBLIC recovery lever for a viewport that has
     * failed into `phase='error'`. This is what `ViewportCrashGuard`'s "Reload
     * viewport" button must call.
     *
     * ⚠ It exists because `onProjectSwitch()` — the codebase's habitual "soft
     * recovery" lever — is the WRONG lever for a render failure, and ADR-0297 said
     * so in prose while leaving the wrong call live one layer up in the crash
     * guard. `onProjectSwitch()` reconciles size and schedules a shadow rebuild but
     * *explicitly defers the pipeline rebuild to `onProjectLoaded()`*, which never
     * arrives when the user is simply retrying the current project. The guard
     * therefore logged "Soft recovery initiated" and left the viewport dark.
     *
     * This method drives the call that actually restores rendering, and clears the
     * one-reconstruction latch so a genuinely-fixed scene is not permanently barred
     * from a future recovery attempt.
     *
     * @returns true if a real rebuild was driven; false if there is nothing to
     *          rebuild (no WebGPU pipeline), so the caller can fall back to a hard
     *          reload rather than reporting a recovery that did not happen.
     */
    recoverFromRenderFailure(): boolean {
        if (!this._webGpuActive) return false;
        console.log(
            '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME recoverFromRenderFailure — ' +
            'reconciling size and rebuilding the render pipeline (NOT onProjectSwitch, which ' +
            'defers the rebuild and would leave the viewport dark).',
        );
        this._gpuResourceResetAttempted    = false;
        this._destroyedResourceReports     = 0;
        this._destroyedResourceWindowStart = 0;
        this._retryCount                   = 0;
        try {
            this._reconcileRenderSize();
        } catch { /* size reconcile is best-effort; the rebuild is the load-bearing part */ }
        void this._rebuildPipeline();
        return true;
    }

    private _safeDisposeRenderPipeline(): void {
        if (!this._renderPipeline) return;

        // §FIX-DISPOSE-USEDTIMES-DEVICE (root fix — replaces the old §I2 `usedTimes`
        // number-patch, which was a band-aid on the WRONG object):
        //
        // ROOT of "Cannot read properties of undefined (reading 'usedTimes')":
        // RenderPipeline.dispose() fans out to NodeManager.delete(renderObject) for every
        // render object the pipeline referenced; delete() reads
        // `this.get(renderObject).nodeBuilderState.usedTimes`. After a backend swap or a
        // device-loss recovery, `this._renderer` (and its NodeManager) is a DIFFERENT
        // GPUDevice than the one this pipeline was built against, so
        // `this.get(staleRenderObject)` returns `undefined` → `undefined.usedTimes` throws.
        // `usedTimes` is therefore never undefined ON THE PIPELINE — it is undefined on an
        // INTERNAL render object the NEW device's NodeManager never created (see
        // safeDispose.ts). The old code pre-set `pipeline.usedTimes = 0`, which patched the
        // pipeline handle, NOT the throwing render object — so it was ineffective and only
        // the surrounding catch hid the throw.
        //
        // The real fix: never call THREE's teardown ACROSS a device boundary. If the
        // pipeline was built against a device that is no longer the renderer's current
        // device, the old device's GPU resources are already reclaimed by the browser on
        // device loss / renderer disposal — so we simply DROP the reference here. This
        // eliminates the `usedTimes` cascade at its source (the dominant swap / device-loss
        // case) rather than swallowing it after the fact.
        const builtDevice = this._renderPipelineDevice;
        const liveDevice  = this._currentBackendDevice();
        if (builtDevice !== null && liveDevice !== null && builtDevice !== liveDevice) {
            console.warn(
                '[RenderPipelineManager] §FIX-DISPOSE-USEDTIMES-DEVICE skipping RenderPipeline.dispose() ' +
                'across a device boundary — the pipeline was built against a superseded/lost GPU device ' +
                '(its GPU resources are already reclaimed). Dropping the stale pipeline reference without ' +
                'walking the new NodeManager (prevents the usedTimes device-loss cascade at its source).',
            );
            this._renderPipelineDevice = null;
            return;
        }

        try {
            (this._renderPipeline as { dispose?: () => void }).dispose?.();
        } catch (dispErr: unknown) {
            // Residual SAME-device path: a stale render object left over from a previous
            // build on the SAME device can still hit the usedTimes throw. Classify via the
            // shared predicate and keep the disposal non-fatal (unchanged behaviour) —
            // the device-boundary skip above already covers the swap/device-loss case.
            const kind = isUsedTimesDisposeError(dispErr)
                ? 'stale same-device render object (usedTimes)'
                : 'unexpected pipeline dispose failure';
            console.warn(
                `[RenderPipelineManager] §FIX-DISPOSE-USEDTIMES — old pipeline dispose ` +
                `error (non-fatal, ${kind}):`,
                (dispErr as Error)?.message ?? dispErr,
            );
        }
        this._renderPipelineDevice = null;
    }

    /**
     * Disposes raw OutlineNode GPU render targets and clears stored nodes.
     * Must be called before rebuilding the pipeline or on project-switch.
     *
     * §SHADOW-DEVICE-LOSS-FIX (Bug B) — the OutlineNode `.dispose()` walks its
     * internal render targets + materials and, on a STALE / device-loss-recovered
     * WebGPU session, hits the same NodeManager `usedTimes` TypeError family that
     * `_safeDisposeRenderPipeline` (§FIX-DISPOSE-USEDTIMES) and the element-builder
     * `safeDispose*` helpers already tame:
     *
     *   TypeError: Cannot read properties of undefined (reading 'usedTimes')
     *       at onMaterialDispose (three) … _disposeOutlineInstances
     *
     * Before this guard the throw escaped `_disposeOutlineInstances()` → aborted
     * `activateOutlines()` / `recoverPipeline()` → recovery failed → the device was
     * lost AGAIN (a recoverable device-loss became a total renderer death). Each
     * dispose is now individually wrapped so the stale-GPU `usedTimes` throw is
     * swallowed and teardown always completes; any OTHER error still surfaces.
     */
    private _disposeOutlineInstances(): void {
        if (this._outlineNodes) {
            this._safeDisposeOutlineInstance(this._outlineNodes.rawInstances.selected);
            this._safeDisposeOutlineInstance(this._outlineNodes.rawInstances.hover);
            this._outlineNodes = null;
        }
    }

    /**
     * §SHADOW-DEVICE-LOSS-FIX (Bug B) — dispose ONE raw OutlineNode instance,
     * swallowing ONLY the stale-GPU `usedTimes` device-loss TypeError (via the
     * shared {@link isUsedTimesDisposeError} predicate). Any other error re-throws
     * so genuine disposal bugs still surface. Safe with null/undefined.
     */
    private _safeDisposeOutlineInstance(instance: { dispose?: () => void } | null | undefined): void {
        if (!instance || typeof instance.dispose !== 'function') return;
        try {
            instance.dispose();
        } catch (err: unknown) {
            if (isUsedTimesDisposeError(err)) {
                console.warn(
                    '[RenderPipelineManager] §SHADOW-DEVICE-LOSS-FIX outline dispose hit the stale-GPU ' +
                    'usedTimes device-loss error (non-fatal, swallowed so recovery completes):',
                    (err as Error)?.message ?? err,
                );
                return;
            }
            throw err;
        }
    }

    /**
     * Rebuilds the pipeline preserving all currently-active features
     * (SSGI, TRAA, outlines).  Used by activate/deactivate methods that
     * need to rebuild without losing peer feature state.
     */
    private async _rebuildPipelineWithCurrentState(): Promise<void> {
        if (this._ssgiActive && this._cachedAo && this._cachedGi) {
            await this._buildPhase3Pipeline(this._cachedAo, this._cachedGi);
        } else {
            await this._buildPipeline();
        }
    }

    /**
     * Async pipeline rebuild — used by retry logic and project-switch.
     *
     * §FIX-SHADOW-REBUILD-LATCH-ASYNC (L-205) — returns the underlying rebuild
     * Promise so callers (notably `scheduleShadowRebuild`'s §#47 in-flight latch)
     * can await the REAL async work (dispose old pipeline + `createScenePass`)
     * rather than the synchronous shell. Own errors are still handled internally,
     * so the returned promise always resolves (never rejects) — call-and-forget
     * callers (retry backoff, projection toggle) are unaffected.
     */
    private _rebuildPipeline(): Promise<void> {
        if (!this._webGpuActive) return Promise.resolve();
        this._hasPipelineError = false;

        return this._rebuildPipelineWithCurrentState().catch((err: unknown) => {
            // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — a shader-compile failure during
            // a rebuild downgrades to the safe lightweight pipeline instead of
            // killing the viewport with phase='error' (→ crash overlay).
            if (isShaderCompileError(err)) {
                console.warn('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE rebuild hit a shader-compile failure — downgrading to lightweight phase-2.');
                this._downgradeToLightweightPipeline();
                return;
            }
            console.error('[RenderPipelineManager] Rebuild failed:', err);
            this._phase = 'error';
            this._emitState();
        });
    }

    /**
     * §RPM-RECOVERY-DOWNGRADE (ADR-0087) — strip ALL heavy post-FX (SSGI / TRAA /
     * outlines) and rebuild the minimal phase-2 pipeline (MRT scene + background
     * blend) so the viewport keeps rendering plain.
     *
     * Called when a shader fails to compile — typically the heavy phase-4 TSL
     * graph (SSGI/outlines) rebuilt against a freshly device-loss-recovered WebGPU
     * device. Retrying the SAME graph just recompiles the SAME failing shader and
     * flips THREE's fatal "Rendering has stopped" latch, so we instead drop to the
     * known-good lightweight pipeline and latch `_postFxDisabled` so the activate*
     * methods don't immediately rebuild the heavy graph again.
     *
     * Never throws: a failure to even build phase-2 is the only path to
     * phase='error' (a genuinely unrecoverable state → crash overlay).
     */
    private _downgradeToLightweightPipeline(): void {
        this._postFxDisabled = true;
        this._ssgiActive     = false;
        this._traaActive     = false;
        this._outlinesActive = false;
        this._cachedAo       = null;
        this._cachedGi       = null;
        this._disposeOutlineInstances();
        this._retryCount     = 0;
        this._hasPipelineError = false;

        // Build the minimal phase-2 pipeline. If even THIS throws a shader-compile
        // error the device is genuinely unusable for TSL → surface phase='error'.
        this._buildPipeline()
            .then(() => {
                console.log(
                    '[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE lightweight phase-2 pipeline active ' +
                    '— viewport rendering plain (post-FX disabled). Call tryUpgradePostFx() to re-attempt the full pipeline.',
                );
            })
            .catch((err: unknown) => {
                console.error('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE lightweight rebuild ALSO failed — unrecoverable:', err);
                this._phase = 'error';
                this._emitState();
            });
    }

    /**
     * §RPM-RECOVERY-DOWNGRADE (ADR-0087) — public, NON-FATAL device-loss recovery
     * entry point.
     *
     * Re-binds the (already-recreated) renderer and attempts the FULL pipeline
     * (phase-2 → SSGI → outlines). If any stage throws a shader-compile failure
     * — the post-device-loss "Fragment shader failed to compile" RuntimeError —
     * the manager downgrades to the lightweight phase-2 pipeline rather than
     * letting the throw escape and flip THREE's fatal "Rendering has stopped"
     * latch. The viewport therefore ALWAYS ends up rendering (degraded if
     * necessary) — never on a dead overlay.
     *
     * Returns the resolved phase so callers can log the outcome.
     *
     * @param scene  Live THREE scene to bind.
     * @param camera Live camera to bind.
     * @param renderer The freshly-recreated renderer.
     * @param backendIsWebGPU Authoritative backend flag from the factory
     *   ('webgpu' → true). When false, bind() takes the lightweight WebGL path
     *   and this is effectively a no-op upgrade.
     * @param restorePostFx When true (default), re-attempt SSGI + outlines after
     *   the phase-2 bind succeeds; on shader-compile failure, downgrade.
     */
    async recoverPipeline(
        scene: THREE.Scene,
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        backendIsWebGPU?: boolean,
        restorePostFx = true,
    ): Promise<PipelinePhase> {
        // Clear any latch from a PRIOR recovery so a fresh device gets a fair
        // attempt at the full pipeline.
        this._postFxDisabled = false;
        this._retryCount     = 0;
        // §GPU-RESOURCE-LIFETIME (ADR-0281) — a freshly-recreated renderer has
        // brand-new attribute / render-object bookkeeping, so the destroyed-resource
        // latch is genuinely stale here (and ONLY here). See the field's doc.
        this._gpuResourceResetAttempted = false;

        try {
            await this.bind(scene, camera, renderer, 'light', backendIsWebGPU);
        } catch (err: unknown) {
            if (isShaderCompileError(err)) {
                console.warn('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE recoverPipeline bind() shader-compile failure — lightweight downgrade.');
                this._downgradeToLightweightPipeline();
                return this._phase;
            }
            throw err;
        }

        // §FIX-RENDER-RECOVERY-DEPTH (L-312 Problem A) — the fresh renderer was sized
        // ONCE at create time; if a split-view / viewport resize landed during the
        // device-loss window the color and shared depth attachments would otherwise
        // begin the next pass at mismatched sizes. Reconcile to the LIVE canvas size
        // NOW (belt-and-suspenders alongside the per-frame reconcile in render()) so
        // recovery lands consistent even before the first submitted frame. Also ARM
        // the per-frame reconcile for the rest of the session: the app's resize closure
        // now points at the dead pre-recovery renderer, so this manager becomes the sole
        // guarantor that color and depth stay the same size on every future resize.
        this._renderSizeReconcileArmed = true;
        this._reconcileRenderSize();

        // ── §L-326 SS-FIX-WEBGL-FALLBACK-WHITE-BACKGROUND ────────────────────
        // Lightweight WebGL path (no real WebGPU backend). A device-loss recovery (or a
        // live backend swap) that LANDS on the WebGL2 fallback backend must drive the
        // lightweight per-frame render so render()'s opaque theme-bg clear (the
        // §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE / L-317 `setClearColor(_lightweightBgColor, 1)`)
        // actually paints LIGHT_BG_HEX (white) / DARK_BG_HEX (navy). Without this the fallback
        // renderer keeps the TRANSPARENT clear primed at boot for the WebGPU-TSL path
        // (initScene `setClearColor(0x000000, 0)`), and the grey container shows through as a
        // GREY viewport — the founder's grey background after the office/resi batch tripped the
        // device-loss cascade into webgl-fallback. The BOOT path already wires this
        // (initScene §PERF-WEBGL2-RENDER-ON-MOVE); the device-loss RECOVERY path
        // (createRenderer.ts → recoverPipeline) previously returned here without it. This is
        // L-317's opaque-overlay invariant extended one path further, to the FULL fallback
        // backend (not just render-on-move). Idempotent: the live-swap caller re-asserts the
        // same flag right after, and setLightweightWebGlRender() no-ops when already active.
        if (!this._webGpuActive) {
            this.setLightweightWebGlRender(true);
            return this._phase;
        }

        if (restorePostFx) {
            try {
                // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — SSGI is OFF by
                // default and is user-opt-in. Only RESTORE it across a device-loss /
                // backend live-swap if the user had it enabled before the loss (bind()
                // does not reset _ssgiActive, so it still reflects prior intent). This
                // stops the constant SSGI flicker from silently returning after a swap.
                if (this._ssgiActive) await this.activateSSGI();
                await this.activateOutlines();
            } catch (err: unknown) {
                if (isShaderCompileError(err)) {
                    console.warn(
                        '[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE recoverPipeline post-FX rebuild hit a ' +
                        'shader-compile failure — downgrading to lightweight phase-2. Viewport stays alive.',
                    );
                    this._downgradeToLightweightPipeline();
                    return this._phase;
                }
                // Non-shader failure during post-FX: keep the phase-2 pipeline
                // that bind() already built rather than crashing.
                console.error('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE recoverPipeline post-FX failed (non-shader) — staying on phase-2:', err);
                this._postFxDisabled = true;
            }
        }

        console.log(`[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE recoverPipeline complete — phase=${this._phase}, postFxDisabled=${this._postFxDisabled}.`);
        return this._phase;
    }

    /**
     * §RPM-RECOVERY-DOWNGRADE (ADR-0087) — best-effort re-upgrade to the full
     * post-FX pipeline after a downgrade. Clears the `_postFxDisabled` latch and
     * re-attempts SSGI + outlines; on a repeat shader-compile failure it
     * re-latches and stays on the safe phase-2 path. Safe to call on an idle
     * frame. No-op if post-FX is not currently disabled or WebGPU is inactive.
     *
     * @returns true if the full pipeline was restored, false if it stayed downgraded.
     */
    async tryUpgradePostFx(): Promise<boolean> {
        if (!this._webGpuActive || !this._postFxDisabled) return !this._postFxDisabled;
        console.log('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE tryUpgradePostFx — re-attempting full pipeline.');
        this._postFxDisabled = false;
        try {
            // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — SSGI is OFF by
            // default (user-opt-in). Only re-upgrade SSGI if the user had it enabled;
            // otherwise just restore outlines so we don't silently reintroduce the flicker.
            if (this._ssgiActive) await this.activateSSGI();
            await this.activateOutlines();
            console.log('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE tryUpgradePostFx succeeded — full pipeline restored.');
            return true;
        } catch (err: unknown) {
            console.warn('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE tryUpgradePostFx failed — staying downgraded:', err);
            this._downgradeToLightweightPipeline();
            return false;
        }
    }

    /** True while the lightweight (post-FX-disabled) recovery path is active. */
    get isPostFxDisabled(): boolean { return this._postFxDisabled; }

    /**
     * Multi-Camera Single-Pipeline — Phase A fast-path rebuild.
     *
     * Rebuilds the RenderPipeline graph using the EXISTING this._scenePass and
     * this._zonePass (whose .camera property has already been updated to the new
     * camera by updateCamera() Guard 2).  Does NOT call createScenePass() or
     * createZonePass() — no PassNode reconstruction, no shader recompile for
     * the pass itself.
     *
     * For perspective with SSGI: delegates to _buildPhase3Pipeline(cachedAo, cachedGi)
     * which reuses the cached SSGI TSL node objects → no SSGI shader recompile.
     *
     * For orthographic (plan/section): builds a Phase 2 graph (no SSGI/TRAA)
     * inline, identical to _buildPipeline() but without the pass creation step.
     *
     * @param isOrtho  true when the new camera is orthographic.
     */
    private async _rebuildPipelineGraphOnly(isOrtho: boolean, _deferAttempt = 0): Promise<void> {
        if (!this._scene || !this._camera || !this._renderer) return;
        if (!this._scenePass || !this._zonePass) {
            // Passes not yet created (first bind not done) — fall through to full rebuild.
            await this._fullRebuild();
            return;
        }

        // ── §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — RECONCILE the compile camera
        //    against the SINGLE projection authority (`_uIsOrthographic`) BEFORE building.
        //
        // ROOT of the demo-critical `PIPELINE_FAILURE reason="Cannot read properties of
        // undefined (reading 'replace')"` on elevation/plan → 3D:
        //
        //   `notifyProjectionToggle(false)` writes the authority uniform SYNCHRONOUSLY
        //   (`_uIsOrthographic.value = 0.0` = perspective). But OBC's OrthoPerspectiveCamera
        //   flips `world.camera.three` to Perspective ASYNCHRONOUSLY — so at the moment the
        //   window 'view-activated' event fires `updateCamera()`, the live camera object is
        //   STILL orthographic (see the FIX-3 note in `updateCamera`). `updateCamera` bound
        //   that still-orthographic camera onto `this._camera` + the PassNodes, and we would
        //   then compile the new `RenderPipeline` against it. three's WGSL program assembly
        //   walks camera-projection-type-dependent nodes (e.g. ViewportDepthNode branches on
        //   `camera.isPerspectiveCamera`); compiled against a camera whose projection flags
        //   are mid-flip (neither cleanly perspective nor the type the authority declares) a
        //   camera-dependent node resolves an undefined shader string/type and three throws
        //   `.replace(undefined)` on the first `rp.render()`. The full backend swap "fixed"
        //   it only because its complete pass reconstruction ran LATER, once the perspective
        //   camera had settled.
        //
        // TWO SOURCES OF TRUTH: the uniform (`_uIsOrthographic`, correct/forward-written) and
        // the camera object bound to the passes (stale, lagging OBC's async flip). This guard
        // makes the uniform the ONLY authority: we refuse to compile against a camera whose
        // live projection contradicts it, and instead DEFER one tick until OBC's in-place
        // mutation (C04 note: OBC mutates the SAME camera object in place) lands the intended
        // projection. This preserves the fast path — no pass reconstruction, no SSGI recompile
        // — it only withholds the compile from a mid-transition camera.
        if (!this._compileCameraMatchesProjectionAuthority()) {
            this._deferGraphRebuildUntilCameraSettles(isOrtho, _deferAttempt);
            return;
        }

        if (!isOrtho && this._ssgiActive && this._cachedAo && this._cachedGi) {
            // Perspective + SSGI active: reuse cached AO/GI nodes → no SSGI shader recompile.
            await this._buildPhase3Pipeline(this._cachedAo, this._cachedGi);
            return;
        }

        // Orthographic (or perspective without SSGI): Phase 2 graph.
        // Identical to _buildPipeline() except createScenePass/createZonePass are NOT called.
        const { RenderPipeline } = await import('three/webgpu') as any;
        const tsl = (globalThis as any).__PRYZM_TSL__;
        if (!tsl) {
            await this._fullRebuild();
            return;
        }
        const { vec4, mix, step, float } = tsl;

        const scenePassColor = this._scenePass.getTextureNode(MRT_OUTPUT);
        const hasGeometry    = scenePassColor.a;
        const contentAlpha   = hasGeometry.max(this._zonePass.a);
        // PRESENCE alpha — see _buildPipeline() for full rationale.
        const presenceAlpha  = step(float(0.0001), contentAlpha);

        let contentColor: TSLNode = scenePassColor.rgb;
        if (this._outlinesActive && this._outlineNodes) {
            const { selectedOutlineNode, hoverOutlineNode } = this._outlineNodes;
            contentColor = contentColor.add(selectedOutlineNode).add(hoverOutlineNode);
        }

        const bg = this._backgroundUniform?.node ?? vec4(0, 0, 0, 1);
        // PURE-WHITE BACKGROUND FIX (Option 3): keep alpha = contentAlpha
        // so background pixels stay transparent and the CSS viewport white
        // shows through unmodified by ACES tone mapping.  See _buildPipeline().
        this._outputNode = vec4(mix(bg, contentColor, contentAlpha), presenceAlpha);

        const rp = new RenderPipeline(this._renderer as any);
        rp.outputNode = this._outputNode;

        this._safeDisposeRenderPipeline();
        this._renderPipeline   = rp;
        // §FIX-DISPOSE-USEDTIMES-DEVICE — record the device this pipeline is built against.
        this._renderPipelineDevice = this._currentBackendDevice();
        this._hasPipelineError = false;
        this._phase = this._outlinesActive ? 'phase4' : 'phase2';
        this._emitState();
        console.log(
            // §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — was a HARDCODED "orthographic"
            // that lied on every perspective return (the log the founder saw contradicting
            // `updateCamera`'s "perspective"). Report the ACTUAL projection the graph was
            // built for, taken from the same authority the compile-camera guard just enforced.
            `[RenderPipelineManager] _rebuildPipelineGraphOnly: Phase 2 graph built ` +
            `for ${isOrtho ? 'orthographic' : 'perspective'} camera (no pass reconstruction, no SSGI).`
        );
    }

    /**
     * §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — RED-first guard predicate.
     *
     * ONE SOURCE OF TRUTH: the projection uniform `_uIsOrthographic`, written
     * synchronously by `notifyProjectionToggle()` before the view switch fires, is
     * the authority. This returns `true` iff the camera the pipeline will compile
     * against (`this._camera`, already bound onto the PassNodes by `updateCamera`
     * Guard 2) presents the SAME projection that authority declares.
     *
     * Returns `false` — the stale-camera read this whole fix exists to catch — when:
     *   - authority says PERSPECTIVE (`value === 0.0`) but the live camera is not
     *     perspective (still orthographic mid-flip, or type flags momentarily
     *     undefined), or
     *   - authority says ORTHOGRAPHIC (`value === 1.0`) but the live camera is not
     *     orthographic.
     *
     * A camera that is NEITHER (both flags falsy — the true mid-transition instant)
     * also contradicts the authority and returns `false`: it is not YET the
     * projection the authority declares, so compiling against it is exactly the
     * `.replace(undefined)` hazard.
     *
     * When TSL is not loaded (`_uIsOrthographic` null) there is no authority to
     * contradict, so it returns `true` and the caller proceeds (the graph-only path
     * already falls back to a full rebuild when TSL is absent).
     *
     * @internal exported semantics pinned by unit test — this predicate is the
     * assertion with teeth against the stale-camera read.
     */
    private _compileCameraMatchesProjectionAuthority(): boolean {
        if (!this._uIsOrthographic) return true;
        const authorityIsOrtho = this._uIsOrthographic.value === 1.0;
        const cam = this._camera as unknown as {
            isPerspectiveCamera?: boolean;
            isOrthographicCamera?: boolean;
        } | null;
        const camIsPerspective  = cam?.isPerspectiveCamera === true;
        const camIsOrthographic = cam?.isOrthographicCamera === true;
        return authorityIsOrtho ? camIsOrthographic : camIsPerspective;
    }

    /**
     * §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — maximum times we re-check the
     * live camera before falling back to a full rebuild. Each deferral is a single
     * macrotask (~0 ms); OBC's in-place projection flip settles within a tick, so on
     * the happy path this bounds at one short deferral, NOT a pass reconstruction.
     * The full-rebuild fallback exists only for a pathological camera that never
     * catches up (it reconstructs the passes against whatever camera is then live).
     */
    private static readonly _MAX_PROJECTION_SETTLE_DEFERS = 8;

    /**
     * §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — DEFER the fast-path graph rebuild
     * one macrotask so OBC's asynchronous, in-place projection flip can land on the
     * (same-reference) camera object before we compile against it. Re-invokes
     * `_rebuildPipelineGraphOnly` — whose guard re-checks the authority — up to
     * {@link _MAX_PROJECTION_SETTLE_DEFERS} times, then falls back to a full rebuild.
     *
     * This is the companion to {@link _compileCameraMatchesProjectionAuthority}: the
     * guard decides "not yet", this schedules the retry. It keeps the fast path
     * (no pass reconstruction, no SSGI recompile) on every normal switch — it only
     * withholds the compile from a mid-transition camera for a tick.
     */
    private _deferGraphRebuildUntilCameraSettles(isOrtho: boolean, attempt: number): void {
        const authorityIsOrtho = this._uIsOrthographic ? this._uIsOrthographic.value === 1.0 : isOrtho;
        const cam = this._camera as unknown as {
            isPerspectiveCamera?: boolean;
            isOrthographicCamera?: boolean;
        } | null;

        if (attempt >= RenderPipelineManager._MAX_PROJECTION_SETTLE_DEFERS) {
            console.warn(
                `[RenderPipelineManager] §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — the ` +
                `pipeline-bound camera never reconciled with the projection authority after ` +
                `${attempt} deferrals (authority=${authorityIsOrtho ? 'ortho' : 'persp'}, ` +
                `camera.isPerspectiveCamera=${String(cam?.isPerspectiveCamera)}, ` +
                `camera.isOrthographicCamera=${String(cam?.isOrthographicCamera)}). ` +
                `Falling back to a FULL rebuild (reconstructs passes against the live camera).`,
            );
            this._fullRebuild().catch((err: unknown) => {
                console.error(
                    '[RenderPipelineManager] §FIX-PROJECTION-TOGGLE-STALE-GRAPH full-rebuild fallback failed:',
                    err instanceof Error ? err.message : err,
                );
            });
            return;
        }

        console.warn(
            `[RenderPipelineManager] §FIX-PROJECTION-TOGGLE-STALE-GRAPH (L-301) — DEFERRING ` +
            `graph rebuild: the pipeline-bound camera has not caught up to the projection ` +
            `authority (authority=${authorityIsOrtho ? 'ortho' : 'persp'}, ` +
            `camera.isPerspectiveCamera=${String(cam?.isPerspectiveCamera)}, ` +
            `camera.isOrthographicCamera=${String(cam?.isOrthographicCamera)}). NOT compiling ` +
            `against a mid-transition camera (attempt ${attempt + 1}/` +
            `${RenderPipelineManager._MAX_PROJECTION_SETTLE_DEFERS}).`,
        );
        setTimeout(() => {
            void this._rebuildPipelineGraphOnly(isOrtho, attempt + 1);
        }, 0);
    }

    /**
     * Full pipeline rebuild: recreates scenePass + zonePass with the current
     * camera, then re-creates SSGI nodes against the new scenePass textures.
     *
     * Required after:
     *  - Shadow-map texture destruction (ShadowDepthTexture GPU handle changes)
     *  - Camera object replacement (OBC switches PerspectiveCamera ↔ OrthographicCamera)
     *
     * Unlike _rebuildPipelineWithCurrentState(), this method does NOT reuse
     * the cached scenePass or SSGI nodes — it starts from scratch so that all
     * compiled WebGPU resource handles are fresh.
     *
     * A6 (Phase A — orthographic SSGI guard):
     *  SSGINode uses perspective-space screen-space ray marching. The algorithm
     *  assumes a perspective depth buffer (non-linear, W-divided) for correct
     *  AO hemisphere sampling. With an OrthographicCamera the depth buffer is
     *  linear and the foreshortening cues SSGI depends on are absent, producing
     *  a flat uniform darkening over the entire floor plan — the opposite of the
     *  intended contact-shadow effect.
     *
     *  Guard: when the active camera is orthographic (plan view / elevation /
     *  section view), skip SSGI and build the Phase 2 pipeline instead.
     *  _ssgiActive remains true so the next _fullRebuild() on a perspective
     *  camera transparently restores SSGI — matching the TRAA guard behaviour
     *  in _buildPhase3Pipeline (line ~656).
     */
    private async _fullRebuild(): Promise<void> {
        if (!this._scene || !this._camera || !this._renderer) return;
        // §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS (L-319) — THE fix site for the founder's
        // unhandled render rejection. `_setSsgi → _fullRebuild` fires from a batch's
        // autoEnablePerf, which can arrive in the window between bind() setting _webGpuActive
        // and _loadTSL() resolving. createScenePass() below throws when TSL is absent → an
        // unhandled promise rejection in the render context. Deferring is safe: bind()'s
        // _buildPipeline() runs once TSL loads and re-applies _ssgiActive intent.
        if (!this._tslLoaded) {
            console.warn('[RenderPipelineManager] §SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS _fullRebuild deferred — initTSL() has not completed (createScenePass would throw).');
            return;
        }

        // §FIX-WEBGPU-INVALID-PIPELINE-MRT (L-253) — the G-buffer (diffuseColor/normal/velocity)
        // exists ONLY for SSGI and TRAA. Declaring those targets when nothing reads them made
        // every render pipeline INVALID for any material that does not emit them (ShadowMaterial,
        // lines, gizmos) — every submit was rejected, every frame. Ask for it only when used.
        this._scenePass = createScenePass(this._scene, this._camera, this._ssgiActive || this._traaActive);
        this._zonePass  = createZonePass(this._scene, this._camera);

        // Phase C unification: when SSGI is active, ALWAYS build the Phase 3
        // pipeline regardless of camera type.  The select(_uIsOrthographic, ...)
        // nodes compiled into the Phase 3 shader handle the ortho/persp bypass at
        // the GPU level — no rebuild required on camera switches.
        //
        // Pre-Phase-C behaviour: the Phase 3 pipeline was only built for perspective
        // cameras; orthographic cameras got a Phase 2 pipeline (no SSGI).  This
        // caused a full graph rebuild (+ SSGI shader recompile) on every 3D↔plan
        // switch.  Phase C removes that branch entirely.
        if (this._ssgiActive) {
            const { createSSGIPass } = await import('./SSGIPass');
            const { ao, gi } = await createSSGIPass(this._scenePass, this._camera);
            this._cachedAo = ao;
            this._cachedGi = gi;
            await this._buildPhase3Pipeline(ao, gi);
        } else {
            await this._buildPipeline();
        }
    }

    private _emitState(): void {
        const s = this.status;
        this.onStateChange?.(s);

        // Dispatch window events so sidebar badges and toggles can sync
        // without importing RenderPipelineManager (avoids circular deps).
        _bus.emit('pipeline-phase-changed', { phase: s.phase, webGpuActive: s.webGpuActive }); // F.events.18
        _bus.emit('ssgi-state-changed', { enabled: s.ssgiActive }); // F.events.18
        _bus.emit('traa-state-changed', { enabled: s.traaActive }); // F.events.18
    }
}