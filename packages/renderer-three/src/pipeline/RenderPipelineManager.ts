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
import { createBackgroundUniform } from './BackgroundUniform';
import type { PassNode, TSLNode } from '../tsl-types';
import type { BackgroundUniform, BgTheme } from './BackgroundUniform';
import { DOMEventBus } from '@pryzm/event-bus';
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
    private _scenePass:          PassNode | null              = null;
    private _zonePass:           PassNode | null              = null;
    private _outputNode:         TSLNode | null               = null;
    private _backgroundUniform:  BackgroundUniform | null     = null;

    private _webGpuActive        = false;
    private _phase: PipelinePhase = 'idle';
    private _hasPipelineError    = false;
    private _retryCount          = 0;

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
     * Binds the manager to the live Three.js scene, camera, and renderer.
     *
     * If the renderer is WebGPU-capable, loads TSL modules and sets up the
     * Phase 2 pipeline (MRT ScenePass + ZonePass + Background).
     * If the renderer is WebGL (OBC-managed), gracefully no-ops.
     */
    async bind(
        scene: THREE.Scene,
        camera: THREE.Camera,
        renderer: THREE.WebGLRenderer,
        initialTheme: BgTheme = 'dark',
    ): Promise<void> {
        this._scene    = scene;
        this._camera   = camera;
        this._renderer = renderer;

        const isWebGPU = (renderer as any).isWebGPURenderer === true;

        if (!isWebGPU) {
            console.log(
                '[RenderPipelineManager] WebGL renderer detected. ' +
                'TSL pipeline prepared but inactive until Phase 5 (OBC decoupling).',
            );
            this._phase = 'phase2';
            this._emitState();
            return;
        }

        this._webGpuActive = true;
        console.log('[RenderPipelineManager] WebGPU renderer confirmed. Initialising TSL pipeline...');

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

    render(delta = 0.016): void {
        if (!this._webGpuActive) return;

        // Tick background uniform lerp every frame regardless of pipeline state
        this._backgroundUniform?.tick(delta);

        if (!this._renderPipeline || this._hasPipelineError) return;

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

            if (this._retryCount < MAX_RETRIES) {
                this._retryCount++;
                const backoffMs = RETRY_DELAY_MS * Math.pow(2, this._retryCount - 1);
                console.warn(
                    `[RenderPipelineManager] Scheduling rebuild ` +
                    `(attempt ${this._retryCount}/${MAX_RETRIES}, backoff ${backoffMs}ms)`,
                );
                setTimeout(() => this._rebuildPipeline(), backoffMs);
            } else {
                console.error('[RenderPipelineManager] Retries exhausted — rendering without post-FX.');
                this._phase = 'error';
                this._emitState();
            }
        }
    }

    /**
     * Update the viewport theme — animates background colour smoothly.
     * @param theme — 'dark' | 'light'
     */
    setTheme(theme: BgTheme): void {
        this._backgroundUniform?.setTheme(theme);
    }

    /**
     * Animate the TSL background to any arbitrary hex color.
     * Use this when the user picks a custom color from the scene background
     * color picker (not just the two dark/light presets).
     * @param hex — CSS hex string, e.g. '#e8edf6'
     */
    setColor(hex: string): void {
        this._backgroundUniform?.setColor(hex);
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
     * compiled GPU handles are fresh.  Debounced to 16 ms (one frame) so bursts
     * of rapid additions (e.g. loading a large model) coalesce into one rebuild.
     */
    private _shadowRebuildTimer: ReturnType<typeof setTimeout> | null = null;

    scheduleShadowRebuild(): void {
        if (!this._webGpuActive) return;
        console.log(`[RenderPipelineManager] SHADOW_REBUILD_SCHEDULED meshCount=${(this as any)._scene?.children?.length ?? '?'}`);
        if (this._shadowRebuildTimer !== null) {
            clearTimeout(this._shadowRebuildTimer);
        }
        this._shadowRebuildTimer = setTimeout(() => {
            this._shadowRebuildTimer = null;
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
                });
                return;
            }

            // Normal path: reuse cached SSGI nodes — safe because we have not been in
            // plan view since the last rebuild (no SSGI contamination).
            const __t_shadow_start = performance.now();
            this._rebuildPipeline();
            console.log(`[RenderPipelineManager] SHADOW_REBUILD_COMPLETE elapsed=${(performance.now() - __t_shadow_start).toFixed(1)}ms`);
        }, 16);
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
            // Without this, the 16ms setTimeout in scheduleShadowRebuild() allows
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
        this._selectedObjects.length = 0;
        this._hoveredObjects.length  = 0;
        this._disposeOutlineInstances();
        this._outlinesActive = false;
        this._retryCount = 0;
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
            console.log('[RenderPipelineManager] onProjectLoaded (debounced) — re-activating outlines.');
            // Re-activate outlines: creates fresh GPU targets, rebuilds pipeline with
            // outlines composited. Falls back to a plain rebuild if activation fails.
            this.activateOutlines().catch((err: unknown) => {
                console.error('[RenderPipelineManager] onProjectLoaded: outline re-activation failed:', err);
                this._rebuildPipeline();
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

        const { RenderPipeline } = await import('three/webgpu') as any;
        const tsl = (globalThis as any).__PRYZM_TSL__;
        if (!tsl) throw new Error('[RenderPipelineManager] TSL not loaded — bind() must be called with a WebGPU renderer first.');
        const { vec4, mix, step, float } = tsl;

        this._scenePass = createScenePass(this._scene, this._camera);
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

        const { RenderPipeline } = await import('three/webgpu') as any;
        const tsl = (globalThis as any).__PRYZM_TSL__;
        if (!tsl) throw new Error('[RenderPipelineManager] TSL not loaded — bind() must be called with a WebGPU renderer first.');
        const { add, vec4, mix, select, step, float } = tsl;

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
    private _safeDisposeRenderPipeline(): void {
        if (!this._renderPipeline) return;
        try {
            // §I.2.1 — Null-guard `usedTimes` before dispose.
            //
            // Root cause (§FIX-DISPOSE-USEDTIMES, doc 47 §3.1): After a WebGPU device loss
            // the pipeline's `usedTimes` counter may be `undefined` because compilation
            // was interrupted mid-way.  When `dispose()` is called on such a pipeline it
            // internally reads `usedTimes` to decide whether to defer teardown → TypeError
            // (cannot read property of undefined) → cascading GPU errors → device recovery
            // starts a new round of PSO compilation.
            //
            // Fix: if `usedTimes` is not a number we force it to 0 before calling dispose(),
            // ensuring the pipeline tears down cleanly without triggering the recovery loop.
            const _rp = this._renderPipeline as any;
            if (_rp && typeof _rp.usedTimes !== 'number') {
                console.warn(
                    '[RenderPipelineManager] §I2 pipeline.usedTimes is not a number ' +
                    `(got ${typeof _rp.usedTimes}) — patching to 0 before dispose to prevent device-loss cascade.`
                );
                _rp.usedTimes = 0;
            }
            (this._renderPipeline as any).dispose?.();
        } catch (dispErr: unknown) {
            console.warn(
                '[RenderPipelineManager] §FIX-DISPOSE-USEDTIMES — old pipeline dispose ' +
                'error (non-fatal, stale GPU session after device loss):',
                (dispErr as Error)?.message ?? dispErr,
            );
        }
    }

    /**
     * Disposes raw OutlineNode GPU render targets and clears stored nodes.
     * Must be called before rebuilding the pipeline or on project-switch.
     */
    private _disposeOutlineInstances(): void {
        if (this._outlineNodes) {
            this._outlineNodes.rawInstances.selected?.dispose?.();
            this._outlineNodes.rawInstances.hover?.dispose?.();
            this._outlineNodes = null;
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

    /** Async pipeline rebuild — used by retry logic and project-switch. */
    private _rebuildPipeline(): void {
        if (!this._webGpuActive) return;
        this._hasPipelineError = false;

        this._rebuildPipelineWithCurrentState().catch((err: unknown) => {
            console.error('[RenderPipelineManager] Rebuild failed:', err);
            this._phase = 'error';
            this._emitState();
        });
    }

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
    private async _rebuildPipelineGraphOnly(isOrtho: boolean): Promise<void> {
        if (!this._scene || !this._camera || !this._renderer) return;
        if (!this._scenePass || !this._zonePass) {
            // Passes not yet created (first bind not done) — fall through to full rebuild.
            await this._fullRebuild();
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
        this._hasPipelineError = false;
        this._phase = this._outlinesActive ? 'phase4' : 'phase2';
        this._emitState();
        console.log(
            `[RenderPipelineManager] _rebuildPipelineGraphOnly: Phase 2 graph built ` +
            `for orthographic camera (no pass reconstruction, no SSGI).`
        );
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

        this._scenePass = createScenePass(this._scene, this._camera);
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