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
// §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS (L-1470) — the shared "has this surface any
// area?" ladder. See _isRenderTargetZeroSize() for why this stopped being local.
import { hasDrawableArea } from '../surfaceArea';
// §FRAME-THROW-STRANDS-RENDER-STATE (L-13313) — the renderer state a THROWN frame strands,
// put back by the frame owner before any repair runs. See render()'s catch.
import { RenderFrameUnwind } from './renderFrameUnwind';
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
    // §RECOVERY-MUST-REFUSE — a light-owned shadow map cannot be replaced by a
    // pipeline rebuild, so that recovery must decline rather than burn a rebuild.
    isShadowResourceError,
    // §SHADOW-MAP-REALLOC-AT-BOUNDARY — light-owned shadow-map resolution changes
    // are queued by their writers (ShadowQualityUpgrader) and performed HERE, at
    // the frame boundary, so the old texture's destroy is ordered against the
    // previous frame's submit and the depth pass regenerates before any encoder
    // references the new one.
    drainShadowMapReallocQueue,
    // §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — the DERIVED arm. Every element
    // builder frees its meshes through the release funnel, so the moment a shadow
    // CASTER is actually released is observable there; this manager claims the
    // observer slot and opens its guard window from the DISPOSE rather than from
    // the BIM event that led to it.
    setShadowCasterReleaseObserver,
    pendingGpuReleaseCount,
    // §SHADOW-CASTER-FLIP-AT-BOUNDARY (L-10380) — the SECOND derived arm, keyed on
    // the LIGHT rather than on the mesh. three r183 frees a light-owned shadow map
    // from inside a node-graph build, and it builds INSIDE the frame's open command
    // encoder, so a caster flip written on any tick detonates mid-submit — at an
    // arbitrary later frame, which is why a guard wrapped around the WRITE never
    // covered it. See the block comment in safeDispose.ts.
    drainShadowCasterFlipQueue,
    lightsWithPendingCasterRelease,
    lightOwnsLiveShadowMap,
    releaseLightOwnedShadowNow,
    // §FOREIGN-SHADOW-MAP-CLAIM (L-13281) — the FOURTH arm. The three above order a
    // free THIS package is about to cause. This one detects a free caused by a
    // SECOND THREE.WebGLRenderer over the same scene, which changes NOTHING the
    // caster fingerprint observes and is therefore invisible to every other arm.
    lightsWithForeignShadowMapClaim,
    type ShadowOwningLight,
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
 * §L-966-BOUNDED-AUTO-RECOVERY — how many times the manager may drive its OWN
 * {@link RenderPipelineManager.recoverFromRenderFailure} before it stops trying
 * and tells the user what died.
 *
 * WHY THIS BOUND EXISTS AT ALL. `recoverFromRenderFailure()` was reachable ONLY
 * from a human click on the crash card's "Reload viewport". The automatic path
 * (`_onDestroyedGpuResource`) refused the pipeline rebuild — correctly, per
 * §RECOVERY-MUST-REFUSE: a light-owned `ShadowDepthTexture` is structurally
 * unreachable from `_rebuildPipeline()` — and then went straight to
 * `phase='error'` WITHOUT ever attempting the repair that CAN reach it. The
 * founder's viewport therefore died and stayed dead (L-966). The fix is to
 * attempt the DIFFERENT repair, never to soften the refusal.
 *
 * WHY 2, and not ∞ or 1:
 *   • NOT ∞ (and not "reset by any lifecycle event") — that is L-663 verbatim:
 *     recovery resetting the counters that bound it, so crash → recover → same
 *     fault → crash spins forever. Each turn is a full dispose + node-cache reset
 *     + recompose, so an unbounded loop does not merely fail to fix the viewport,
 *     it PINS THE GPU. A dead viewport that also burns the GPU is strictly worse
 *     than a dead viewport, which is why the counter had to land before the wiring.
 *   • NOT 1 — the two attempts are not repeats of each other. Attempt 1 runs
 *     against live compiled node states and frees a light-owned texture that a
 *     still-encoding frame may reference (§L930-DETACH-BEFORE-FREE narrowed that
 *     window; it did not prove it shut). Attempt 2 runs against an ALREADY-reset
 *     node cache and freshly re-owned maps — genuinely different starting state,
 *     and L-908 records recovery succeeding from exactly there.
 *   • 2 attempts is ~2 rebuilds ≈ a perceptible stutter; 3+ is a freeze, and no
 *     measured recovery has ever succeeded on a third attempt that failed twice.
 *
 * The budget is per-GPU-DEVICE, not per-session: `recoverPipeline()` (a genuinely
 * NEW renderer after device loss — a different failure class with brand-new
 * bookkeeping) resets it via {@link RenderPipelineManager._resetAutoRecoveryBudgetForNewDevice}.
 * `onProjectSwitch()` deliberately does NOT — that is L-663's defect 1, an
 * unrelated lifecycle event erasing the only bound on a live fault.
 */
const MAX_AUTO_RECOVERY_ATTEMPTS = 2;

/**
 * §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — the ceiling on how many CONSECUTIVE
 * frames the derived caster-release window may hold the submit pause open.
 *
 * A window that never closes is a viewport that never repaints (the L-663 spin,
 * one layer down). Sustained per-frame caster churn — a house generation batch —
 * would re-arm every frame, so the pause degrades to the ordinary batch-level
 * freezes past this many frames rather than blanking the screen. 8 frames ≈ 130 ms
 * at 60 Hz: long enough to cover any single element's teardown (a 31-segment
 * handrail retype is one tick), far short of anything a user perceives as a hang.
 */
const MAX_CASTER_RELEASE_PAUSED_FRAMES = 8;

/**
 * §SUBMIT-PAUSE-IS-BOUNDED (founder 2026-09-09 · L-13270 · C04 §SHADOW rule 7)
 *
 * ⛔ HOW LONG THE SUBMIT PAUSE MAY HOLD THE VIEWPORT DARK, in milliseconds, before it releases
 * itself and says so.
 *
 * ⭐⭐ MEASURED, ON THE FOUNDER'S OWN OPEN: `SHADOW_REBUILD_COMPLETE elapsed=16011.5ms`. For all
 * SIXTEEN SECONDS `render()` returned at the `shadowRebuildPaused` gate, so NOTHING repainted —
 * while the chunked loader beside it was yielding three times specifically so *"the user sees a
 * progressive build"*. It painted nothing for 16 of its 17 s.
 *
 * ⛔ AND THE PAUSE ITSELF IS CORRECT AND MUST STAY. It exists to close the exact crash the
 * founder hit — *"a shadow depth texture (ShadowDepthTexture) was released while the GPU was
 * still drawing with it"* — by guaranteeing no submit references the outgoing project's shadow
 * texture while the pipeline is recomposed (L-231, ADR-0111). Deleting the pause to recover the
 * 16 s would trade a frozen viewport for a dead one.
 *
 * ⭐ SO THE FIX IS A CEILING, NOT A DELETION — and the precedent is twenty lines below, in this
 * same file: the sibling caster-release guard is capped at
 * {@link MAX_CASTER_RELEASE_PAUSED_FRAMES} *because* **"an unbounded window is a frozen
 * viewport — the L-663 shape"** and **"a bounded guard that degrades is worth more than an
 * unbounded one that blanks the screen."** That reasoning was written for the derived guard and
 * is just as true of the primary one; it simply never acquired the cap.
 *
 * ⚠ WHY TIME AND NOT FRAMES. The sibling counts FRAMES because it closes at a frame boundary.
 * This window is held across an `await` whose continuation is not serviced while the main thread
 * runs a multi-second hydrate — there are no frames to count. A wall-clock ceiling is the only
 * unit that can bound it.
 *
 * ⚠ 2000 ms IS A CEILING, NOT A TARGET. A healthy rebuild on this path is single-digit
 * milliseconds (the founder's own empty-project open logs `SHADOW_REBUILD_COMPLETE elapsed=6.0ms`).
 * Anything approaching this bound is already pathological; the number only decides how long the
 * screen may stay dark before the guard admits it has lost.
 */
const MAX_SUBMIT_PAUSE_MS = 2000;

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
    /**
     * §L-966 — the error that actually caused `phase === 'error'`.
     *
     * Before this field existed the status carried a phase and nothing else, so
     * `ViewportCrashGuard.handlePipelineError()` was called with NO argument and
     * minted its own placeholder — *"Render pipeline retries exhausted —
     * phase=error"*. That string is a FABRICATION on this path: the founder's
     * stack shows the escalation coming from `_onDestroyedGpuResource`, which
     * sets `phase='error'` directly and never touches `_retryCount`; the retry
     * ladder never ran. The crash guard therefore reported a mechanism that did
     * not execute, discarded the real signature, and — because
     * `ViewportCrashGuard._diagnose()` keys on that signature — fell back to
     * blaming the user's graphics driver for our own resource-lifetime defect.
     *
     * Carrying the real error is what lets the guard tell the user WHAT died.
     * Null whenever the pipeline is not in an error state.
     */
    lastError:       Error | null;
    /**
     * §L-966 — automatic recoveries already spent against the CURRENT GPU device,
     * out of {@link MAX_AUTO_RECOVERY_ATTEMPTS}. Exposed so the health indicator
     * and tests can see the bound being consumed rather than inferring it.
     */
    autoRecoveryAttempts: number;
    /**
     * §L-966 — true while a recovery rebuild is actually IN FLIGHT (submit gate
     * held, pipeline being reconstructed).
     *
     * Making recovery automatic removed the one thing that made it visible: the
     * crash card. Without this flag the health badge reports 'ok' throughout a
     * multi-second reconstruction during which the viewport is frozen, which is the
     * "confident message, no work" shape this whole area keeps relapsing into.
     * Self-clearing — it is popped by the rebuild's own `finally`, so it can never
     * latch the badge on.
     */
    recoveringInFlight: boolean;
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
    /**
     * §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — the G-buffer layout the LIVE `_scenePass`
     * was CONSTRUCTED with, not the layout we would like it to have.
     *
     * THE FOUNDER'S "I clicked SSGI and TRAA and the scene collapsed".
     *
     * `PassNode.getTexture(name)` is not a read. three r183 (`three/src/nodes/display/
     * PassNode.js:564-583`) CLONES the base colour texture for an unknown name and
     * `this.renderTarget.textures.push(texture)` — it MUTATES the render target, growing its
     * colour-attachment count. `setMRT()` is what makes the material EMIT those extra
     * fragment outputs, and it is a separate call.
     *
     * So asking a NON-MRT scene pass for `diffuseColor` / `normal` / `velocity` silently
     * produced a 4-attachment render pass driven by 1-output shaders. That is the founder's
     * console, verbatim and in both directions:
     *
     *   [RenderPassEncoder] expects { colorTargets: [0,1,2,3 = RGBA16Float], … }
     *   [RenderPipeline "renderPipeline_MeshStandardMaterial_681"] has { colorTargets: [0] }
     *
     * The `RGBA16Float` on ALL FOUR is the proof it was the lazy clone and not `ScenePass`:
     * `createScenePass(…, true)` downgrades `diffuseColor` + `normal` to `UnsignedByteType`
     * (→ `RGBA8Unorm`). Four half-float targets is a texture cloned from `output`.
     *
     * `activateSSGI()` handed `createSSGIPass()` a pass built with `needsGBuffer=false`
     * (SSGI/TRAA are off by default, so `_buildPipeline` had correctly built the cheap
     * single-target pass). SSGI then read two G-buffer channels off it, and every submit for
     * the rest of the session was rejected. TRAA reached the same hole through `velocity`.
     *
     * Tracking the layout as BUILT — never inferring it from `_ssgiActive || _traaActive`,
     * which is the INTENT and is exactly what was already out of step — lets
     * {@link _ensureScenePassGBuffer} rebuild the pass BEFORE anyone reads a G-buffer channel.
     */
    private _scenePassHasGBuffer = false;
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
    // ⚠⚠ CORRECTED 2026-08-20 (lane BG1, §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND / L-1350).
    // This paragraph used to end: "This field is ONLY consulted inside the
    // `_lightweightWebGlActive` branch, which is set true EXCLUSIVELY for the WebGL2
    // backend — the native-WebGPU TSL render path never reads it, so WebGPU output is
    // byte-unchanged." That was an accurate description of the code and a DESCRIPTION OF
    // THE DEFECT, because the two arms were INVERTED:
    //
    //   • On the WebGL backends the overlay clears OPAQUE — §FIX-WEBGL2-GHOST-ON-ROTATE-
    //     INCOMPLETE / L-317 made it `setClearColor(_lightweightBgColor, 1)`. An opaque
    //     surface cannot composite anything from underneath. The base clear therefore
    //     CANNOT change a pixel on the only path that ran it.
    //   • On native WebGPU the overlay's output alpha is
    //     `presenceAlpha = step(0.0001, contentAlpha)` (see {@link _buildPipeline}) — i.e.
    //     EXACTLY 0 in every empty-space pixel, by design, so the CSS/OBC layer below is
    //     what fills the background. Anything left on the silenced OBC base canvas is
    //     therefore visible THROUGH the overlay on every frame — and this was the one path
    //     that disarmed the clear (initScene passed `null` on a swap to WebGPU).
    //
    // The clear was armed exactly where it is impossible for it to matter and disarmed
    // exactly where it is the only thing that can matter. That is the founder's WebGPU
    // "reminiscencia" — a ghost copy of the model at an older camera pose showing through
    // the transparent overlay.
    //
    // The hook is now keyed on the CONDITION it exists for — "the base framebuffer may
    // still hold a previous composite when this manager presents a frame" — which is true
    // on every backend this manager renders on. It runs at the start of BOTH branches, so
    // a future backend inherits it instead of having to be enumerated. The hook itself
    // (initScene's `clearObcBaseFramebuffer`) owns the question of whether the OBC canvas
    // is currently someone ELSE's output surface (bloom / legacy-SSGI / VPT all render
    // INTO it with the overlay hidden) and no-ops in that case.
    private _preFrameBaseClearHook: (() => void) | null = null;

    private _phase: PipelinePhase = 'idle';
    private _hasPipelineError    = false;
    private _retryCount          = 0;

    /**
     * §FRAME-THROW-STRANDS-RENDER-STATE (L-13313) — the renderer / camera / scene state three's
     * WebGPU frame sets and restores only on a clean return, snapshotted before `rp.render()`
     * and put back by its `catch`. See renderFrameUnwind.ts.
     */
    private readonly _frameUnwind = new RenderFrameUnwind();

    /**
     * §L-966 — the error that drove `_phase = 'error'`, preserved for the crash
     * guard. See {@link PipelineStatus.lastError} for why a phase alone was not
     * enough. Cleared whenever the pipeline returns to a rendering phase.
     */
    private _lastError: Error | null = null;

    /**
     * §L-966-BOUNDED-AUTO-RECOVERY — automatic {@link recoverFromRenderFailure}
     * attempts already spent against the CURRENT GPU device.
     *
     * ⚠ Deliberately NOT reset by `onProjectSwitch()`, `recoverFromRenderFailure()`
     * or `_downgradeToLightweightPipeline()`. Every one of those resets some other
     * counter, and L-663 is precisely the defect of recovery erasing its own bound.
     * The ONLY sanctioned reset is {@link _resetAutoRecoveryBudgetForNewDevice},
     * called from `recoverPipeline()` when a genuinely new renderer/device is bound
     * — the same reasoning `_gpuResourceResetAttempted` already documents.
     */
    private _autoRecoveryAttempts = 0;

    /**
     * §L-966 — a recovery rebuild is in flight (see
     * {@link PipelineStatus.recoveringInFlight}). Set by
     * {@link _driveRecoveryRebuild}, popped by the rebuild's own `finally`.
     */
    private _recoveringInFlight = false;

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
    /**
     * §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — the quality overrides the LIVE SSGI nodes
     * were built from, so a rebuild reproduces the SAME pass rather than silently reverting
     * to `DEFAULT_SSGI_PARAMS`. Every rebuild path (`_ensureScenePassGBuffer`, `_fullRebuild`)
     * re-derived from defaults, so `activateSSGI({ radius: … })` survived exactly until the
     * first camera change — a quality regression with nothing in the console to attribute it to.
     */
    private _ssgiParams: object | undefined = undefined;

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
     * ── §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) ──────────────────────────
     * Which backend currently OWNS the viewport background. Resolved in {@link bind}
     * from the same `isRealWebGPUBackend()` verdict that gates the TSL pipeline, so
     * the background decision can never disagree with the pipeline decision.
     *
     *   • `true`  — native WebGPU: the TSL output node owns it
     *               (`mix(bgUniform, sceneColor, hasGeometry)`), and `scene.background`
     *               MUST stay null or the alpha geometry-mask is defeated (initScene
     *               §Phase-5 "whitening layer").
     *   • `false` — EITHER WebGL backend ('webgl-fallback' / 'webgl-only'): there is no
     *               output node, so the background is a property of the SCENE.
     */
    private _tslOwnsBackground = false;

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
            // §L-966 — the crash guard must be told WHAT died, not just that
            // something did. Only meaningful while phase === 'error'.
            lastError:      this._phase === 'error' ? this._lastError : null,
            autoRecoveryAttempts: this._autoRecoveryAttempts,
            recoveringInFlight:   this._recoveringInFlight,
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
        // §SHADOW-CASTER-DECLARED-BUT-UNSATISFIABLE (L-1482) — a bind is a new renderer
        // with no shadow maps of its own; re-arm the one-shot audit so the first frame it
        // presents reports any caster whose depth pass can never run. See
        // {@link auditShadowCasters} for why that state silently blanks every lit mesh.
        this._shadowCasterAuditPending = true;

        // §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE (L-317) — seed the opaque overlay
        // background from the current theme so the WebGL2 lightweight path clears to the
        // right colour (white in light mode, deep navy at night) on its very first frame.
        this._lightweightBgColor.set(initialTheme === 'dark' ? DARK_BG_HEX : LIGHT_BG_HEX);

        const isWebGPU = RenderPipelineManager.isRealWebGPUBackend(renderer, backendIsWebGPU);

        // §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) — record WHICH backend owns the
        // background and assert it onto the scene + the renderer clear NOW, before the
        // first frame of either path. This is the single seam that knows the resolved
        // backend, so it is the only honest place for the decision. See
        // {@link _applyViewportBackground} for why the WebGL2 side is a SCENE property.
        this._tslOwnsBackground = isWebGPU;
        this._applyViewportBackground();

        if (!isWebGPU) {
            // ⚠ CORRECTED 2026-08-20 (lane SWAP1, L-1412) — this line used to open
            // "**WebGL2 backend detected**", a HARDCODED BACKEND NAME on a branch that
            // resolves NO backend name at all. `isRealWebGPUBackend()` answers exactly one
            // question — *is this a native WebGPU backend?* — and this branch is its `false`
            // arm, which covers TWO different renderers: the `WebGPURenderer` WebGL2
            // fallback AND a classic `THREE.WebGLRenderer` on WebGL1/2. On the founder's
            // §AUTO-WEBGL-HEAVY swap the very next line of his console read
            // `[renderer-three] backend: webgl1 (§L-372B classic THREE.WebGLRenderer)` — so
            // two components one line apart named two different backends, and a reader had
            // no way to tell which was guessing.
            //
            // This is the SAME defect UnifiedFrameLoop was corrected for (a hardcoded
            // "WebGPU" in a block that read no backend state): an INSTRUMENT NAMING THE
            // WRONG SUBSYSTEM. The DECISION here was never wrong — `isRealWebGPUBackend` is
            // a partition by construction, the same partition `isNativeWebGpuBackend` /
            // `isLightweightWebGlBackend` express at the app layer — only the LABEL lied.
            //
            // ⛔ Do NOT "fix" this by comparing a backend string here. This class is L1 and
            // cannot see the app-layer `RendererBackend` vocabulary; a third string
            // comparison is precisely what created the disagreement. It reports the boolean
            // it actually evaluated, and the raw evidence it evaluated it from.
            console.log(
                '[RenderPipelineManager] §PERF-WEBGL2-NO-TSL non-WebGPU backend — TSL pipeline OFF ' +
                `(isRealWebGPUBackend=false; authoritativeOverride=${backendIsWebGPU === undefined ? 'none' : String(backendIsWebGPU)}, ` +
                `backend.isWebGPUBackend=${String((renderer as unknown as { backend?: { isWebGPUBackend?: boolean } })?.backend?.isWebGPUBackend)}). ` +
                'This arm covers BOTH the WebGPURenderer WebGL2 fallback and a classic ' +
                'THREE.WebGLRenderer — it does not name which; see the [renderer-three] backend ' +
                'line for the resolved backend. Lightweight WebGL render path active — SSGI / ' +
                'outlines / post-FX stay OFF.',
            );
            // §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) — prime the clear OPAQUE to the
            // theme colour the moment the backend is known, rather than waiting for the
            // first lightweight frame. initScene primes this renderer TRANSPARENT at boot
            // (`setClearColor(0x000000, 0)`) for the WebGPU-TSL contract; on a WebGL
            // backend that prime is simply wrong, and every frame that does not reach the
            // lightweight branch inherits it. Best-effort: a renderer variant without
            // setClearColor must not break the bind.
            try { (renderer as unknown as { setClearColor?: (c: THREE.Color, a: number) => void })
                .setClearColor?.(this._lightweightBgColor, 1); }
            catch { /* not all renderer variants expose setClearColor */ }
            this._phase = 'phase2';
            this._emitState();
            return;
        }

        this._webGpuActive = true;
        console.log('[RenderPipelineManager] WebGPU renderer confirmed. Initialising TSL pipeline...');

        // §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — claim the release funnel's single
        // observer slot. Claimed HERE, after `_webGpuActive` is set and only on the
        // WebGPU path, because that is exactly the population the ordering exists for
        // (the WebGL2 fallback owns its own shadowMap). Re-claiming on a rebind is
        // idempotent — the slot holds one observer, and this manager is the frame owner.
        setShadowCasterReleaseObserver(this._onShadowCasterRelease);

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
            // §L-966-SECOND-MINTING-SITE (L-1003) — carry the cause; see _failWithCause.
            this._failWithCause(
                'The 3D viewport could not start: building the render pipeline failed.',
                err,
            );
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
     * §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350, supersedes the backend-scoped
     * §FIX-WEBGL2-GHOST-ON-ROTATE / ADR-0108 arming) — inject a callback run at the
     * START of every frame this manager presents, on EITHER branch, immediately
     * before the paint.
     *
     * THE CONDITION, not the backend. The invariant is *"the framebuffer stacked
     * BENEATH the PRYZM overlay must not still hold a previous frame's composite when
     * this manager presents"*. That is true on every backend this manager renders on,
     * for two different reasons (see {@link _preFrameBaseClearHook} for the full
     * post-mortem of why arming it per-backend put it on the wrong one).
     *
     * The callback must be SELF-GATING: it is called unconditionally, so it — not this
     * manager — owns the question of whether the base canvas is currently somebody
     * else's output surface (bloom / legacy-SSGI / viewport path tracer all render INTO
     * the OBC canvas with the overlay hidden, and clearing it there would erase their
     * image every frame). initScene's `clearObcBaseFramebuffer` carries that guard.
     *
     * Pass `null` to clear the hook. Idempotent; carries no I/O (a pure setter).
     */
    setPreFrameBaseClearHook(hook: (() => void) | null): void {
        this._preFrameBaseClearHook = hook;
    }

    /**
     * @deprecated Use {@link setPreFrameBaseClearHook}. Retained because the name
     * encodes the retired "lightweight-only" scoping that WAS the defect; kept so an
     * older caller does not silently lose its hook. Same behaviour.
     */
    setPreLightweightFrameHook(hook: (() => void) | null): void {
        this.setPreFrameBaseClearHook(hook);
    }

    /**
     * Run the injected base-clear once, best-effort. A hook throw must never break the
     * frame — the paint is more important than the clear. Called from BOTH render
     * branches so neither backend can be the one that forgets.
     */
    private _runPreFrameBaseClear(): void {
        if (!this._preFrameBaseClearHook) return;
        try { this._preFrameBaseClearHook(); }
        catch { /* base-clear is best-effort; the frame still paints */ }
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
     *
     * ⚠ §FRAME-THROW-STRANDS-RENDER-STATE (L-13313) — "owns its own target chain" holds only on
     * a CLEAN return: three's PassNode.updateBefore restores the target it borrowed with no
     * try/finally, so a throw strands it. The WebGPU arm of this invariant is the snapshot /
     * restore around `rp.render()` in {@link render} (renderFrameUnwind.ts).
     */
    /**
     * ── §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) — THE single runtime writer ──
     *
     * THE DEFECT THIS REPLACES. `LIGHT_BG_HEX` was already one CONSTANT
     * (§VIEWPORT-BG-ONE-AUTHORITY, 2026-08-08) — but the two backends reached the
     * pixel by two independent MECHANISMS, and only one of them was structural:
     *
     *   • WebGPU — the background is a PROPERTY OF THE PIPELINE OUTPUT
     *     (`mix(bgUniform, sceneColor, hasGeometry)`). It cannot be missed: if a
     *     frame is presented at all, the background is in it.
     *   • WebGL2 — the background was ONE `setClearColor(_lightweightBgColor, 1)`
     *     statement living INSIDE the `if (this._lightweightWebGlActive)` branch of
     *     {@link render}, behind a boolean that THREE separate call sites must keep
     *     in sync (initScene boot :3156, the live swap :4423, recoverPipeline) and
     *     behind four early-returns (`_suspended`, `_isRenderTargetZeroSize`,
     *     unbound scene/camera, the catch). Miss any one of them and the WebGL
     *     canvas keeps the TRANSPARENT clear that initScene primes at boot for the
     *     WebGPU-TSL path (`setClearColor(0x000000, 0)`) — and the silenced OBC base
     *     canvas frozen underneath shows through as the founder's GREY viewport.
     *
     * That asymmetry is why L-326 has now been reported THREE times and "fixed"
     * twice by arming the same flag on one more path (recoverPipeline, then the
     * live swap). Arming the flag on an Nth path is not a fix, it is the defect
     * repeating: the background must not depend on a flag at all.
     *
     * THE FIX. On every non-WebGPU backend the background becomes a property of the
     * SCENE, so ANY renderer that draws this scene paints it — the lightweight
     * branch, a recovery frame, a borrowed pass, OBC. The per-frame opaque clear at
     * :932 STAYS (it is what makes the overlay opaque for
     * §FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE / L-317); this makes the background
     * survive the frames that clear never reaches.
     *
     * WHY IT LIVES HERE AND NOT IN initScene. This manager is the only object that
     * holds the resolved backend, the theme colour and the scene at once — and it is
     * the L1 THREE owner (P2). initScene's unconditional `scene.background = null`
     * was a WebGPU-shaped decision applied before the backend was known.
     *
     * A TEXTURE background is left alone: `HDRIEnvironmentManager`,
     * `ProceduralSkyService`, `RealtimeLightingService` and `PanoramaCapture` each
     * save + restore `scene.background` around their own activation. This authority
     * owns the FLAT viewport colour only (C84 EI-9 — one role, one owner).
     */
    private _applyViewportBackground(): void {
        const scene = this._scene as unknown as { background?: unknown } | null;
        if (!scene) return;
        const bg = scene.background as
            { isColor?: boolean; isTexture?: boolean } | null | undefined;

        // A deliberate environment background (HDRI / panorama / procedural sky) is
        // owned by its provider, which restores it on deactivate. Never stomp it.
        if (bg && bg.isTexture === true) return;

        if (this._tslOwnsBackground) {
            // The TSL output node owns the fill; the scene must present alpha=0 in
            // empty space or `hasGeometry` reads 1 everywhere and the mix never runs.
            if (bg != null) scene.background = null;
            return;
        }

        if (bg && bg.isColor === true) {
            (bg as unknown as THREE.Color).copy(this._lightweightBgColor);
            return;
        }
        scene.background = this._lightweightBgColor.clone();
    }

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

    // ── §L900-FRAME-SKIP-ATTRIBUTION (founder L-900) — the instrument, not the fix ──
    /**
     * Total frames declined, per early-return gate in {@link render}.
     *
     * WHY THIS EXISTS. L-900 is "the 3D viewport is STALE after a wall move" — the plan
     * view is correct, so the scene graph is already right and only the PRESENTED FRAME
     * is old. Every candidate explanation for that ends at the same place: one of
     * `render()`'s early returns is being taken. Until now they were indistinguishable
     * from each other AND from a healthy idle scheduler, so the defect could only be
     * chased by reading code — which is how L-900 accumulated two refuted leads.
     *
     * ⚠ The severity of that is higher than it looks, and higher than the code used to
     * claim. There is NO second rAF loop painting a base frame underneath this one
     * (`UnifiedFrameLoop.setObcRenderCallback` has no caller — see the corrected comment
     * on the FrameCoordinator gate below), so a declined frame is a FROZEN VIEWPORT, not
     * a dropped post-FX pass.
     *
     * WHAT IT MEASURES. A transient skip is normal — a view switch, a rebuild, a
     * zero-size pane during layout all legitimately decline frames. A STUCK skip is the
     * defect. So the load-bearing number is not the total, it is
     * {@link _consecutiveSkips}: how many frames IN A ROW one gate has declined. That
     * turns "the 3D is stale" into "gate `shadowRebuildPaused` has declined 600
     * consecutive frames", which discriminates every remaining L-900 candidate in one
     * reading and costs an integer increment per frame.
     *
     * This is an INSTRUMENT. It changes no control flow, decides nothing, and repairs
     * nothing — deliberately, because L-900's next step is a measurement and guessing at
     * the fix is how L-107 shipped.
     */
    private _frameSkips: Record<string, number> = Object.create(null) as Record<string, number>;
    private _lastSkipReason: string | null = null;
    private _consecutiveSkips = 0;
    /** Frames presented since the last declined frame (0 while stalled). */
    private _framesPresented = 0;
    /** One WARN per stall, at this consecutive-skip count (~2 s at 60 fps). Re-armed on recovery. */
    private static readonly _STALL_WARN_FRAMES = 120;
    private _stallWarned = false;

    /**
     * §L900-FRAME-SKIP-ATTRIBUTION — record that this frame was declined, and why.
     * Returns void so call sites can `return this._skipFrame('reason');` inline.
     */
    private _skipFrame(reason: string): void {
        this._frameSkips[reason] = (this._frameSkips[reason] ?? 0) + 1;
        this._consecutiveSkips = reason === this._lastSkipReason ? this._consecutiveSkips + 1 : 1;
        this._lastSkipReason = reason;
        this._framesPresented = 0;
        // Say it ONCE per stall. A viewport that has declined 120 frames in a row for the
        // same reason is not busy, it is stuck — and the user is looking at a frozen
        // image with no other signal that anything is wrong.
        if (!this._stallWarned && this._consecutiveSkips >= RenderPipelineManager._STALL_WARN_FRAMES) {
            this._stallWarned = true;
            console.warn(
                `[RenderPipelineManager] §L900-FRAME-SKIP-ATTRIBUTION the viewport has declined ` +
                `${this._consecutiveSkips} consecutive frames at gate "${reason}". Nothing else ` +
                `repaints the canvas, so the user is looking at a FROZEN frame. If this gate is a ` +
                `latch (shadowRebuildPaused / suspended / pipelineError) it has leaked; call ` +
                `getFrameSkipReport() for the full attribution.`,
            );
        }
    }

    /** §L900-FRAME-SKIP-ATTRIBUTION — mark this frame as actually presented. */
    private _markFramePresented(): void {
        this._framesPresented++;
        this._consecutiveSkips = 0;
        this._lastSkipReason   = null;
        this._stallWarned      = false;
        // §SHADOW-CASTER-DECLARED-BUT-UNSATISFIABLE (L-1482) — audit ONCE per bind, HERE,
        // because this is the only point that is (a) after a real paint, so three has had
        // its chance to allocate every caster's `shadow.map`, and (b) common to BOTH render
        // branches, so the tripwire cannot end up armed on one backend and not the other —
        // the L-1350 / L-1480 mistake. Cost is one traverse per bind, never per frame.
        if (this._shadowCasterAuditPending) {
            this._shadowCasterAuditPending = false;
            try { this.auditShadowCasters(); } catch { /* a tripwire must never break a frame */ }
        }
    }

    /**
     * §L900-FRAME-SKIP-ATTRIBUTION — the attribution report.
     *
     * `consecutiveSkips` is the diagnostic: > 0 with a `lastSkipReason` means the
     * viewport is CURRENTLY stalled at that gate and the image on screen is stale.
     * `framesPresented > 0` means the pipeline is live and any staleness is upstream of
     * this class (a mesh that was never rebuilt, or a scheduler that was never woken).
     * That single distinction is what L-900 needs and could not previously obtain.
     */
    getFrameSkipReport(): {
        skips: Record<string, number>;
        lastSkipReason: string | null;
        consecutiveSkips: number;
        framesPresented: number;
    } {
        return {
            skips: { ...this._frameSkips },
            lastSkipReason:   this._lastSkipReason,
            consecutiveSkips: this._consecutiveSkips,
            framesPresented:  this._framesPresented,
        };
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

        // ── §L-10010-TRANSMISSION-SWEEP-COVERS-THE-BATCH ─────────────────────
        // The frame boundary is the last instant that is provably AFTER every
        // material this frame will compile and BEFORE any of them is compiled. A
        // sweep armed by a batch boundary (or by the recovery ladder) lands here,
        // which is what makes the guard cover materials CREATED DURING a batch —
        // the window the founder's 2026-08-23 crash fell through. One boolean read
        // when not armed. See {@link armTransmissionSweep}.
        this._runArmedTransmissionSweep();

        // ── §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) ──────────────────────────
        // The releases above have now actually happened, at the boundary, with
        // submits paused since the tick that enqueued them. Close the derived
        // window — deferred, so THIS frame stays unsubmitted and the next one
        // carries the single depth regen at the settled caster set.
        this._closeCasterReleaseWindowAtBoundary();

        // ── §SHADOW-MAP-REALLOC-AT-BOUNDARY (founder P0, 2026-08-10) ──────────
        // Perform any queued light-owned shadow-map resolution changes HERE, at
        // the same boundary: the previous frame's Queue.submit() has returned
        // (destroy-after-submit is legal WebGPU) and this frame has not yet
        // opened a command encoder. `shadow.map.setSize()` lets THREE dispose
        // and re-create ITS OWN target — external code never destroys a
        // light-owned texture (ADR-0111 / C04 §SHADOW) — and the following
        // shadow pass regenerates the depth texture before the main pass samples
        // it. NOT drained while the shadow map is frozen: a frozen map's depth
        // pass is suppressed, so a resize-now would leave the main pass sampling
        // a destroyed, never-regenerated texture; the queue holds the request
        // until the first unfrozen frame (the thaw's needsUpdate covers regen).
        if (!this._shadowFrozenState) drainShadowMapReallocQueue();

        // ── §SHADOW-CASTER-FLIP-AT-BOUNDARY (L-10380) ────────────────────────
        // The FREE half of the same problem. `drainShadowMapReallocQueue` above
        // orders a shadow map's RESIZE; these two order its DESTRUCTION.
        //   (a) the opt-in funnel, for writers that route their `castShadow` flip
        //       through `scheduleShadowCasterFlip()`; and
        //   (b) the DERIVED detector, which catches a BARE write from any call site
        //       — present or future, guarded or not — by comparing the fingerprint
        //       three itself keys the node cache on.
        // Both must run at the boundary: three performs this free from inside a
        // node-graph build, which happens INSIDE the frame's open command encoder.
        drainShadowCasterFlipQueue();
        this._orderPendingCasterReleasesAtBoundary();

        // ── §FOREIGN-SHADOW-MAP-CLAIM (L-13281) ───────────────────────
        // The three arms above order frees THIS package causes. This one detects a
        // free caused by a SECOND THREE.WebGLRenderer over the same scene — the
        // L-205 dual-renderer claim, which moves nothing the caster fingerprint
        // observes and is therefore invisible to all three. Deliberately BEFORE
        // every early-return below: a frame we decline to submit is still a frame
        // boundary, and this arm is what lets a viewport already latched shut by
        // §RECOVERY-MUST-REFUSE-NO-FLOOD come back.
        this._healForeignShadowMapClaimsAtBoundary();

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
        if (this._isRenderTargetZeroSize()) return this._skipFrame('renderTargetZeroSize');

        // ── §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) ────────────────────────────
        // Lightweight WebGL2 path: the TSL pipeline is OFF (_webGpuActive=false)
        // but this manager owns the sole render in Phase 5. Drive a plain scene
        // render every frame so orbit/pan/zoom repaints continuously. This branch
        // is taken BEFORE the _webGpuActive early-return below.
        if (this._lightweightWebGlActive) {
            if (this._suspended) return this._skipFrame('suspended:lightweight'); // heavy-op suspension (IFC load, etc.)
            const renderer = this._renderer;
            const scene    = this._scene;
            const camera   = this._camera;
            if (!renderer || !scene || !camera) return this._skipFrame('unbound:lightweight');
            try {
                // §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) — clear/invalidate the
                // silenced OBC base framebuffer BEFORE painting. On THIS branch the
                // overlay clears opaque (L-317) so the clear is belt-and-braces; it is
                // the WebGPU branch below that actually needs it. Both call the same
                // helper so neither can be the arm that was forgotten.
                this._runPreFrameBaseClear();
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
                this._markFramePresented();
            } catch (err: unknown) {
                this._skipFrame('lightweightRenderThrew');
                console.error(
                    '[RenderPipelineManager] §PERF-WEBGL2-RENDER-ON-MOVE lightweight render failed:',
                    err instanceof Error ? err.message : err,
                );
            }
            return;
        }

        if (!this._webGpuActive) return this._skipFrame('webGpuInactive');

        // Tick background uniform lerp every frame regardless of pipeline state
        this._backgroundUniform?.tick(delta);

        if (!this._renderPipeline || this._hasPipelineError) {
            return this._skipFrame(this._hasPipelineError ? 'pipelineError' : 'noPipeline');
        }

        // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — do NOT submit a WebGPU frame while
        // an async shadow rebuild is in flight. Submitting during the rebuild's pipeline
        // dispose + `createScenePass()` recomposition (and the shadow-map realloc it can
        // trigger) is what destroyed the `ShadowDepthTexture` mid-submit → device loss.
        // The last-rendered frame stays on screen for the rebuild's duration (mirrors the
        // `_fullRebuild` plan-view path's `_hasPipelineError` pause). C04 §SHADOW rule 7.
        // §SUBMIT-PAUSE-IS-BOUNDED (L-13270) — the pause above is correct, and it must not be
        // able to hold the screen dark without limit. The founder measured 16,011 ms of it on
        // one project open, during which the chunked loader's whole reason for existing — a
        // progressive build the user can watch — produced nothing. Past the ceiling the pause
        // releases and the viewport paints; the realloc freeze that prevents the device loss
        // stays on.
        if (this._submitPauseIsHolding()) {
            return this._skipFrame('shadowRebuildPaused');
        }

        // Skip expensive post-FX passes while suspended (e.g. during IFC geometry streaming).
        if (this._suspended) return this._skipFrame('suspended');

        // ── Phase 2 Performance: FrameCoordinator guard ────────────────────
        // Skip PASCAL post-processing passes while a view switch is in progress.
        // Companion to the existing `_viewSwitchInProgress` outline guard — a coarser
        // but earlier bail-out for the entire pipeline when coordinated by ViewController.
        //
        // ⚠ CORRECTED 2026-08-18 (L-908 lane, measured). This comment used to end:
        // "The OBC base render (driven by the other rAF loop) still runs normally so the
        // display never goes blank." THAT IS FALSE, and it is false for EVERY early
        // return above as well as this one.
        //
        // `UnifiedFrameLoop.setObcRenderCallback()` (UnifiedFrameLoop.ts:206) has NO
        // CALLER anywhere in apps/, packages/ or plugins/ — measured, not inferred. So
        // `_obcCallback` is permanently null and the OBC-render block it gates
        // (UnifiedFrameLoop.ts:527-535) is dead code. There is no second rAF loop painting
        // a base frame underneath us. When this method returns early, NOTHING repaints:
        // the last presented frame stays frozen on screen until some later event resumes
        // submits. Every `return` above is therefore a TOTAL VIEWPORT FREEZE for its
        // duration, not a "skip the expensive passes" — and any latch that leaks strands
        // the user on a stale frame indefinitely (L-900 is the open report of exactly
        // that shape).
        //
        // This is the DECLARED-BUT-NEVER-CALLED defect class — C84 §3.5.1 axis (d), the
        // CALL axis, distinct from import and construction. It is now the third measured
        // instance: `setObcRenderCallback` here, C04 §3.5's LOD `setViewDistance` (zero
        // callers while the contract says "called every frame"), and this comment's own
        // claim. A comment asserting a safety net that does not exist is worse than no
        // comment, because it tells the next reader not to worry — the L-809/L-812 class.
        //
        // Do NOT re-add the old sentence. If a base-render fallback is ever wanted, wire
        // `setObcRenderCallback` first and cite the call site here.
        if (this._frameCoordinator && !this._frameCoordinator.shouldRenderPascalPass()) {
            return this._skipFrame('frameCoordinatorViewSwitch');
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

            // §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) — THE ARM THAT WAS MISSING.
            // The next statement is what makes this branch need the clear: the overlay
            // presents with `setClearAlpha(0)` and an output alpha of
            // `presenceAlpha = step(0.0001, contentAlpha)`, so EVERY empty-space pixel of
            // this canvas is fully transparent and whatever sits on the silenced OBC base
            // canvas underneath is visible through it. §FIX-OBC-BASE-STALE-COMPOSITE
            // clears that base ONCE (phase-5 activate / post-live-swap) — a one-shot
            // cannot answer a condition that recurs every frame, and the OBC renderer is
            // BORROWED (GPU pick, view-render cache, thumbnail capture) with
            // `autoClear = false`, so a stale composite can land on it at any time. That
            // stale composite, seen through a moving transparent overlay, is the founder's
            // WebGPU ghost / "reminiscencia". Self-gating hook — see
            // {@link setPreFrameBaseClearHook}.
            this._runPreFrameBaseClear();
            (this._renderer as any)?.setClearAlpha?.(0);
            // §FRAME-THROW-STRANDS-RENDER-STATE (L-13313) — snapshot what three's pass chain sets
            // and restores only on a clean return; the catch below puts it back (renderFrameUnwind.ts).
            this._frameUnwind.capture(this._renderer, this._camera, this._scene);
            rp.render();
            this._frameUnwind.release();
            // §L900-FRAME-SKIP-ATTRIBUTION — the ONE place a WebGPU frame is actually
            // submitted. Everything before this is a gate; reaching here is the only
            // evidence the user's viewport is live.
            this._markFramePresented();

            if (this._viewSwitchInProgress) {
                this._outlinesActive = outlinesWereActive;
            }
        } catch (err: unknown) {
            this._hasPipelineError = true;
            console.error(`[RenderPipelineManager] PIPELINE_FAILURE reason="${(err as any)?.message ?? 'unknown'}" retryCount=${(this as any)._retryCount ?? '?'}`);
            console.error('[RenderPipelineManager] Pipeline render failed:', err);

            // §FRAME-THROW-STRANDS-RENDER-STATE (L-13313) — FIRST, before the teardown and before
            // any repair is chosen: put back what three's PassNode.updateBefore (PassNode.js:796-863)
            // and RenderPipeline.render (RenderPipeline.js:112-130) set and restore only on a
            // clean return. Left stranded, the renderer stays bound to the thrown pass's render
            // target and every later frame — the reconstruction's included — composites OFF the
            // canvas (Renderer.js:1392): the founder's white viewport with no RECURRED line, which
            // no repair lever below could ever reach.
            const unwound = this._frameUnwind.restore();
            if (unwound.length > 0) {
                console.warn(
                    '[RenderPipelineManager] §FRAME-THROW-STRANDS-RENDER-STATE the failed frame left renderer ' +
                    `state behind (${unwound.join(', ')}) — restored before recovery, so the next frame lands ` +
                    'on the canvas.',
                );
            }

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

            // §L-819 — a SHADOW-classified throw that is not a destroyed-resource
            // message is the dangling-shadow-node TypeError ("Cannot read properties
            // of null (reading 'depthTexture')" in ShadowNode.updateShadow): a
            // ShadowNode whose target was dropped while its compiled updateBefore
            // registration survived in a cached node-builder state. The retry
            // ladder below rebuilds the POST-FX pipeline, which does not recompile
            // cached material node states — so on production it burned attempt 1/3
            // against the same dangling node and exhausted into the crash modal.
            // Route it to the classified handler, which refuses loudly; the crash
            // guard's recoverFromRenderFailure() then performs the one repair that
            // works (light re-own + compiled-node-state reset + rebuild).
            if (isShadowResourceError(err)) {
                this._onDestroyedGpuResource(
                    err instanceof Error ? err.message : String(err),
                    'render() throw (shadow lifetime)',
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
                // §L-966-SECOND-MINTING-SITE (L-1003) — this is the ONE path on which
                // "retries exhausted" was ever literally true, and even here it means the
                // POST-FX rebuild ladder, not the viewport. Say which.
                this._failWithCause(
                    `The 3D viewport's post-processing could not be rebuilt after ` +
                    `${MAX_RETRIES} attempts, so it is rendering without post-FX.`,
                );
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
    /**
     * ⚠ REWRITTEN 2026-08-20 (lane RENDER3, §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS /
     * L-1470) — this method used to carry its own copy of the accessor ladder
     * (`getDrawingBufferSize` → `getSize` → `domElement.width/height`). It was
     * CORRECT, and it was the ONLY correct copy: the founder's flood came from a
     * SECOND surface — OBC's WebGL canvas — that this gate never examines, and the
     * sites drawing into that one each answered the question their own way or not
     * at all. Two implementations of "does this surface have area?" is how one of
     * them stays right while the other is never written.
     *
     * The ladder now lives in `surfaceArea.ts` as {@link hasDrawableArea} and every
     * site shares it, so a fix to the measurement reaches all of them at once. The
     * behaviour here is unchanged and its six-case suite
     * (`RenderPipelineManager.zeroSizeRenderGate.test.ts`) still pins it — including
     * the deliberate "unreadable is NOT zero" case, which the shared helper
     * preserves as an explicit, documented rule rather than as a fall-through.
     */
    private _isRenderTargetZeroSize(): boolean {
        return !hasDrawableArea(this._renderer);
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
        // §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) — push the new colour through the
        // single authority so the SCENE background follows the theme on the WebGL
        // backends too, not only the per-frame clear.
        this._applyViewportBackground();
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
        // §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME (L-1148) — a custom scene-background colour
        // is still THIS authority's colour; route it through the same apply so the WebGL
        // scene background tracks the picker.
        this._applyViewportBackground();
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
     * §L930-SUBMIT-PAUSE-DEPTH — nesting depth of {@link _beginShadowRebuildGuard}.
     *
     * The guard used to be a bare boolean, so the INNER of two overlapping windows
     * un-paused submits while the OUTER one was still tearing GPU state down. That
     * matters now that {@link _rebuildPipeline} takes the guard for every async
     * rebuild: `scheduleShadowRebuild()` already wraps its own `_rebuildPipeline()`
     * call in a guard, so the two nest by construction. Ref-counted like
     * {@link setShadowReallocFrozen}, which had this shape from the start.
     *
     * `_shadowRebuildPaused` stays as the DERIVED boolean the frame gate reads (and
     * that existing tests poke directly) — depth is the authority for the guard
     * pair, the boolean is the authority for `render()`.
     */
    private _submitPauseDepth = 0;

    /**
     * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — enter the guarded window for an async
     * shadow rebuild: pause WebGPU submits AND freeze the shadow map (now per-light-effective,
     * see {@link _applyShadowFreezeState}). Balanced by {@link _endShadowRebuildGuard}.
     */
    /**
     * §SUBMIT-PAUSE-IS-BOUNDED (L-13270) — when the OUTERMOST pause opened. `null` ⇒ not paused.
     * Read by `render()`'s gate, which is the one place that runs often enough to notice a
     * window that has overstayed.
     */
    private _submitPauseOpenedAtMs: number | null = null;
    /** True once this window has already reported itself over the ceiling — report ONCE. */
    private _submitPauseCapReported = false;

    private _beginShadowRebuildGuard(): void {
        this._submitPauseDepth++;
        this._shadowRebuildPaused = true;
        // ⭐ Stamp only on the OUTERMOST open (§L930-SUBMIT-PAUSE-DEPTH): a nested guard must not
        // restart the clock, or a re-arming inner pause could hold the ceiling off forever —
        // which is the unbounded case this ceiling exists to end.
        if (this._submitPauseOpenedAtMs === null) {
            this._submitPauseOpenedAtMs = performance.now();
            this._submitPauseCapReported = false;
        } else if (performance.now() - this._submitPauseOpenedAtMs >= MAX_SUBMIT_PAUSE_MS) {
            // ⛔⛔ §A-LIVENESS-CEILING-MAY-NOT-DEFEAT-A-CORRECTNESS-PAUSE (L-13283).
            //
            // ⭐ THIS BRANCH IS THE FOUNDER'S 2026-09-10 DEAD VIEWPORT, AND IT IS THE HALF THAT
            //    KILLS THE RECOVERY — not the crash, the FAILURE TO RECOVER FROM IT.
            //
            // The ceiling above is a LIVENESS device: past MAX_SUBMIT_PAUSE_MS the pause
            // releases so the user is not staring at a frozen frame. Correct, and it stays.
            // But the clock belongs to the window, and — with the outermost stamp rule alone —
            // an ALREADY-OVERSTAYED window swallows every guard opened after it: the depth
            // counter rises, `_shadowRebuildPaused` is set, and `render()` submits anyway
            // because the clock is still the expired one.
            //
            // ⛔ That silently disarms `recoverFromRenderFailure()`. Its whole safety argument
            // is step 1: *"Close the submit gate BEFORE anything is freed … so no frame is
            // encoded between the free and the new pipeline's install."* It opens THIS guard
            // and then calls `_recreateLightOwnedShadowMaps()`, which frees every light-owned
            // `ShadowDepthTexture`. On an overstayed window that gate never actually shuts, so
            // the recovery frees those textures WHILE FRAMES ARE BEING SUBMITTED — re-creating,
            // from inside the repair, the exact fault it was invoked to repair:
            //
            //   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
            //
            // Which is why the founder's console reads §RECOVERY-MUST-REFUSE → recovery 1/2 →
            // §RECOVERY-MUST-REFUSE → recovery 2/2 → budget EXHAUSTED → phase=error. The ladder's
            // repair is RIGHT; it was being performed with the gate wedged open, so each
            // attempt re-armed the fault and spent a life doing it. On his open the outer
            // window had held 16 799 ms against a 2 000 ms ceiling — the recovery never had a
            // closed gate to work behind.
            //
            // ⭐ THE RULE: a liveness ceiling may bound how long ITS OWN window darkens the
            // screen; it may never pre-expire a pause a LATER caller opens for correctness.
            // So a guard nesting onto an expired window RE-STAMPS the clock and gets its own
            // bounded window. This does NOT restore the unbounded case L-13270 closed: every
            // re-stamped window is itself capped at MAX_SUBMIT_PAUSE_MS, so sustained
            // re-arming yields bounded darkness with paints in between — which is what that
            // ceiling was asking for — rather than a pause that never holds at all.
            this._submitPauseOpenedAtMs  = performance.now();
            this._submitPauseCapReported = false;
            console.warn(
                '[RenderPipelineManager] §A-LIVENESS-CEILING-MAY-NOT-DEFEAT-A-CORRECTNESS-PAUSE '
                + '(L-13283) — a new submit pause was opened on top of a window that had already '
                + `overstayed its ${MAX_SUBMIT_PAUSE_MS} ms liveness ceiling. RE-STAMPING the clock so `
                + 'this guard actually holds submits: the caller is about to free or rebind GPU '
                + 'state, and an expired clock would let frames encode straight through it — which '
                + 'is how a recovery re-creates the very "Destroyed texture [ShadowDepthTexture] '
                + 'used in a submit" fault it was invoked to repair. The new window is bounded by '
                + 'the same ceiling.',
            );
        }
        this.setShadowReallocFrozen(true);
    }

    /**
     * §SUBMIT-PAUSE-IS-BOUNDED (L-13270) — has the submit pause overstayed its ceiling?
     *
     * ⛔ IT DOES NOT CANCEL THE REBUILD. The rebuild is still in flight and still needs its
     * shadow-realloc freeze; what this releases is only the SUBMIT PAUSE, so the viewport can
     * paint the scene it already has. The realloc freeze — the half that actually prevents the
     * `ShadowDepthTexture` crash — is untouched and is released by the rebuild's own completion
     * path, exactly as before.
     *
     * ⚠ A pause that overstays is a DEFECT REPORT, not a routine event: it says the rebuild's
     * continuation is not being serviced. It is logged once, loudly, with the elapsed time.
     */
    private _submitPauseHasOverstayed(): boolean {
        const openedAt = this._submitPauseOpenedAtMs;
        if (openedAt === null) return false;
        const heldMs = performance.now() - openedAt;
        if (heldMs < MAX_SUBMIT_PAUSE_MS) return false;
        if (!this._submitPauseCapReported) {
            this._submitPauseCapReported = true;
            console.warn(
                '[RenderPipelineManager] §SUBMIT-PAUSE-IS-BOUNDED (L-13270) — the submit pause has '
                + `held the viewport dark for ${heldMs.toFixed(0)} ms, past its ${MAX_SUBMIT_PAUSE_MS} ms `
                + 'ceiling. RELEASING THE PAUSE so the viewport can paint; the shadow-realloc freeze '
                + 'STAYS, so the device-loss guard (L-231) is intact. A healthy rebuild on this path '
                + 'is single-digit ms — so the rebuild continuation is not being serviced, '
                + 'almost always because the main thread is inside a long synchronous load.',
            );
        }
        return true;
    }

    /**
     * §PAUSE-FLAG-IS-NOT-THE-SUBMIT-GATE (L-13282) — is the submit pause ACTUALLY holding
     * this frame back?
     *
     * ⭐⭐ THE DISTINCTION THIS METHOD EXISTS FOR IS THE FOUNDER'S 2026-09-10 DEAD VIEWPORT.
     *
     * Before §SUBMIT-PAUSE-IS-BOUNDED (L-13270, landed 2026-09-09 — ONE DAY earlier),
     * `_shadowRebuildPaused === true` and "no frame will be submitted" were the SAME FACT,
     * and every boundary arm was written against that equivalence. The ceiling split them:
     * past {@link MAX_SUBMIT_PAUSE_MS} the pause RELEASES and the viewport paints while the
     * flag is still `true`. The founder's own console shows the gap it opens —
     * `SHADOW_REBUILD_COMPLETE elapsed=16799.0ms` against a 2000 ms ceiling, i.e.
     * **~14.8 SECONDS OF SUBMITTED FRAMES WITH THE FLAG SET.**
     *
     * ⛔ `_orderPendingCasterReleasesAtBoundary()` early-returns on that flag, and its own
     * comment states the premise out loud: *"Already inside a paused window …: the
     * fingerprint is deliberately NOT recorded, so a change that lands during the pause is
     * still seen on the first unpaused boundary."* That is sound ONLY while the pause holds
     * submits — a latent free cannot detonate in a frame that is never encoded. Once the
     * ceiling lets frames through, the derived caster detector is switched off across a
     * window in which three IS building node graphs inside open command encoders, and a
     * `castShadow` flip landing anywhere in those ~14.8 s frees the `ShadowDepthTexture`
     * mid-submit with nothing watching:
     *
     *   Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.
     *    - While calling [Queue].Submit([[CommandBuffer from CommandEncoder "renderContext_1"]])
     *
     * …which §RECOVERY-MUST-REFUSE correctly refuses, the bounded ladder spends 2/2 on, and
     * the viewport dies. The ladder's repair is RIGHT; the hole simply re-opens behind it,
     * because the detector that would have ordered the free is still gated off.
     *
     * ⭐ THE RULE: a boundary arm must gate on *"will this frame submit?"*, never on
     * *"is a pause flag set?"* — those stopped being the same question on 2026-09-09.
     * `render()`'s own frame gate already asks it this way; this method is that question
     * given a name so the two can never drift apart again.
     *
     * Cheap and idempotent: {@link _submitPauseHasOverstayed} latches its report, so calling
     * it from both the frame gate and the boundary arms cannot double-log.
     */
    private _submitPauseIsHolding(): boolean {
        return this._shadowRebuildPaused && !this._submitPauseHasOverstayed();
    }

    /**
     * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — leave the guarded window: resume
     * submits and thaw the shadow map DEFERRED one macrotask past any in-flight submit
     * (ADR-0111 / §SHADOW-DEVICE-LOSS-FIX — the single depth regen at the new state lands on
     * a clean idle frame, never in a submit).
     *
     * §L930-SUBMIT-PAUSE-DEPTH — only the OUTERMOST release resumes submits.
     */
    private _endShadowRebuildGuard(): void {
        if (this._submitPauseDepth > 0) this._submitPauseDepth--;
        this._shadowRebuildPaused = this._submitPauseDepth > 0;
        // §SUBMIT-PAUSE-IS-BOUNDED (L-13270) — the clock belongs to the OUTERMOST window.
        if (this._submitPauseDepth === 0) {
            this._submitPauseOpenedAtMs = null;
            this._submitPauseCapReported = false;
        }
        setTimeout(() => this.setShadowReallocFrozen(false), 0);
    }

    /* ── §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) ───────────────────────────────
     *
     * ⭐ THE DERIVED GUARD. `runShadowCasterMutation` above is the same window,
     * opened by a caller who REMEMBERED to open it. Its two production callers are
     * the tier coordinator and one curtain-wall prewarm; NO element builder calls
     * it, and no release path calls it. Everything else relies on
     * `initScene._debouncedGeomAdded` recognising the BIM event that led to the
     * teardown — which is why the founder's crash has recurred once per newly
     * exercised route (nav → load → wall commit → tier → handrail retype →
     * handrail MATERIAL, the last of them through the GENERIC
     * `element.updateParameters` bridge that no per-family event list is shaped
     * to cover).
     *
     * This arm is keyed on the DISPOSE instead. `scheduleGpuRelease` notifies once
     * per release batch that frees a `castShadow` mesh; we open the SAME window
     * (`_beginShadowRebuildGuard` — submit pause + ref-counted shadow freeze) and
     * close it in `render()` once the boundary drain has emptied the queue. A
     * route that forgets to announce itself is still safe, because it cannot free
     * a caster's mesh without passing through the funnel.
     *
     * ⚠ BOUNDED, deliberately. While the window is open `render()` skips its
     * submit, so an unbounded window is a frozen viewport — the L-663 shape. A
     * batch that churns geometry every frame (house generation) would re-arm
     * forever, so the pause is capped at {@link MAX_CASTER_RELEASE_PAUSED_FRAMES}
     * consecutive frames; past that the window closes and the ordinary
     * batch-level freezes carry it. A bounded guard that degrades is worth more
     * than an unbounded one that blanks the screen.
     */
    private _casterReleaseGuardArmed  = false;
    private _casterReleaseGuardFrames = 0;

    /** Installed into `safeDispose`'s single observer slot by {@link bind}. */
    private readonly _onShadowCasterRelease = (): void => {
        // WebGL2 fallback owns its own shadowMap and needs no ordering here; the
        // guard pair is a no-op there anyway, but arming it would still cost a
        // skipped frame.
        if (!this._webGpuActive) return;
        if (this._casterReleaseGuardArmed) return;
        this._casterReleaseGuardArmed  = true;
        this._casterReleaseGuardFrames = 0;
        this._beginShadowRebuildGuard();
    };

    /**
     * Close the derived window at the frame boundary — called from `render()`
     * immediately after `drainGpuReleaseQueue()`, i.e. at the one instant the
     * releases have actually happened and nothing new has been encoded.
     *
     * The close is DEFERRED one macrotask: resuming synchronously here would let
     * THIS frame submit, and this frame is precisely the one that must not.
     */
    private _closeCasterReleaseWindowAtBoundary(): void {
        if (!this._casterReleaseGuardArmed) return;
        this._casterReleaseGuardFrames++;
        const drained = pendingGpuReleaseCount() === 0;
        const capped  = this._casterReleaseGuardFrames >= MAX_CASTER_RELEASE_PAUSED_FRAMES;
        if (!drained && !capped) return;
        if (capped && !drained) {
            console.warn(
                '[RenderPipelineManager] §GPU-CASTER-RELEASE-CHOKEPOINT the derived caster-release ' +
                `window hit its ${MAX_CASTER_RELEASE_PAUSED_FRAMES}-frame cap with ` +
                `${pendingGpuReleaseCount()} releases still queued — releasing the submit pause so the ` +
                'viewport cannot stay dark. Sustained per-frame caster churn (a generation batch) is ' +
                'expected to hit this; anything else is a leak in the release queue.',
            );
        }
        this._casterReleaseGuardArmed  = false;
        this._casterReleaseGuardFrames = 0;
        setTimeout(() => { this._endShadowRebuildGuard(); }, 0);
    }

    /* ── §SHADOW-CASTER-FLIP-AT-BOUNDARY (L-10380) ─────────────────────────────
     *
     * ⭐ THE THIRD DERIVED GUARD, AND THE ONE KEYED ON THE LIGHT.
     *
     * `runShadowCasterMutation` is keyed on the CALLER remembering; the
     * §GPU-CASTER-RELEASE-CHOKEPOINT arm above is keyed on a MESH release. Neither
     * covers a `light.castShadow` flip, and MEASURED against three r183.2 that flip
     * is the thing that actually frees the `ShadowDepthTexture`
     * (AnalyticLightNode.js:267-270 → ShadowNode._reset() → shadowMap.dispose()).
     *
     * ⛔ AND IT DOES NOT FREE IT WHEN THE FLAG IS WRITTEN. The free happens on the
     * next node-graph BUILD, and `RenderObjects.get` only re-reads the cache key
     * when `material.version` bumped or `renderObject.needsUpdate` is set
     * (RenderObjects.js:127-129) — so the flip sits LATENT for an unbounded number
     * of frames and detonates on an unrelated event (a fixture placement, a
     * material swap, a new mesh), INSIDE that frame's open command encoder. A guard
     * wrapped around the WRITE has closed long before. That is why this family
     * recurred with a guard in place: L-25 → L-39 → L-64 → L-908 → here.
     *
     * ── WHAT THIS ARM OBSERVES ─────────────────────────────────────────────────
     * Not the BIM event, not the write — the STATE three itself keys on. At the
     * frame boundary it reads `renderer.lighting.getNode(scene).customCacheKey()`
     * (LightsNode.js:117-141 — a hash of every light's `id` and `castShadow`) plus
     * `shadowMap.type` / `.enabled`, which `NodeManager.getCacheKey` folds into every
     * render object's key (NodeManager.js:441-447). When that fingerprint moves, a
     * rebuild is coming and any light that has stopped casting while still owning a
     * live map carries a pending free. We perform that free HERE, at the boundary,
     * via three's own sanctioned `'dispose'` signal — so the mid-encode build finds
     * `shadowNode === null` and frees nothing.
     *
     * ⚠ THE RESET IS NOT OPTIONAL. The node graph compiled while the light WAS
     * casting still binds the map we just freed, so `_resetCompiledNodeStates()`
     * runs in the same boundary step and the whole thing sits inside the
     * ref-counted submit-pause window — the frame that recompiles is one we do not
     * submit. Without the reset this would trade a mid-encode free for a stale
     * binding, which is the same crash wearing a different message.
     *
     * COST: `customCacheKey()` is O(#lights) — a Pascal key/fill/rim plus the
     * fixture live-light budget, single digits — and allocates nothing when the
     * fingerprint is unchanged, which is every frame but the rare ones. It is NOT
     * a scene traverse; the L-1151/L-1155 defect class is deliberately avoided.
     * Inert on the WebGL2 fallback, which owns its own shadowMap.
     */
    private _lastCasterFingerprint: number | null = null;
    private _lastShadowMapTypeSeen: number | null = null;
    private _lastShadowMapEnabledSeen: boolean | null = null;
    /** Cumulative count of boundary-ordered light-owned shadow releases (diagnostics). */
    private _boundaryCasterReleases = 0;

    /** Total light-owned shadow maps this manager has released at a frame boundary. */
    get boundaryCasterReleaseCount(): number { return this._boundaryCasterReleases; }

    private _orderPendingCasterReleasesAtBoundary(): void {
        if (!this._webGpuActive) return;
        // Inside a submit pause that is ACTUALLY HOLDING (a rebuild, a mesh-release
        // window, a tier mutation): the fingerprint is deliberately NOT recorded, so a
        // change that lands during the pause is still seen on the first boundary that
        // submits. Safe, because a latent free cannot detonate in a frame nobody encodes.
        //
        // ⚠ §PAUSE-FLAG-IS-NOT-THE-SUBMIT-GATE (L-13282) — this used to read
        // `if (this._shadowRebuildPaused) return;`, and that was correct only while the
        // flag and "no frame will be submitted" were the same fact. §SUBMIT-PAUSE-IS-BOUNDED
        // (L-13270) split them on 2026-09-09: past the 2000 ms ceiling the pause releases
        // and frames submit WITH THE FLAG STILL SET. On the founder's 2026-09-10 open the
        // rebuild ran 16 799 ms — ~14.8 s of submitted frames during which this detector,
        // the ONLY thing watching for a latent mid-encode `ShadowDepthTexture` free, was
        // switched off. Ask whether the frame will submit, never whether a flag is set.
        if (this._submitPauseIsHolding()) return;

        const renderer = this._renderer as unknown as {
            lighting?: { getNode?(scene: unknown): { customCacheKey?(): number; getLights?(): unknown[] } | null };
            shadowMap?: { type?: number; enabled?: boolean };
        } | null;
        const scene = this._scene;
        if (!renderer || !scene) return;

        let lightsNode: { customCacheKey?(): number; getLights?(): unknown[] } | null = null;
        let fingerprint = 0;
        let shadowType: number | null = null;
        let shadowEnabled: boolean | null = null;
        try {
            lightsNode = renderer.lighting?.getNode?.(scene) ?? null;
            if (!lightsNode || typeof lightsNode.customCacheKey !== 'function') return;
            fingerprint   = lightsNode.customCacheKey();
            shadowType    = renderer.shadowMap?.type ?? null;
            shadowEnabled = renderer.shadowMap?.enabled ?? null;
        } catch {
            // A backend mid-swap, or a renderer that predates the node path. Never
            // let a diagnostic read kill the frame.
            return;
        }

        const first        = this._lastCasterFingerprint === null;
        const setChanged   = !first && fingerprint   !== this._lastCasterFingerprint;
        const typeChanged  = !first && (shadowType    !== this._lastShadowMapTypeSeen ||
                                        shadowEnabled !== this._lastShadowMapEnabledSeen);
        this._lastCasterFingerprint      = fingerprint;
        this._lastShadowMapTypeSeen      = shadowType;
        this._lastShadowMapEnabledSeen   = shadowEnabled;
        if (!first && !setChanged && !typeChanged) return;

        let lights: unknown[] = [];
        try { lights = lightsNode.getLights?.() ?? []; } catch { return; }
        // A shadow-TYPE change makes three `_reset()` EVERY live shadow node
        // (ShadowNode.js:615-622), not only the ones that stopped casting.
        const candidates: ShadowOwningLight[] = typeChanged
            ? (lights as ShadowOwningLight[]).filter((l) => lightOwnsLiveShadowMap(l))
            : lightsWithPendingCasterRelease(lights as ShadowOwningLight[]);
        if (candidates.length === 0) return;

        // Pause submits FIRST: the reset below recompiles the node graph, and the
        // frame that recompiles must not be a frame we submit.
        this._beginShadowRebuildGuard();
        let released = 0;
        for (const light of candidates) {
            if (releaseLightOwnedShadowNow(light)) released++;
        }
        // Nothing may still BIND the maps we just freed. This is the documented
        // §L-819 companion — a pipeline rebuild cannot reach a cached
        // nodeBuilderState, only this can.
        this._resetCompiledNodeStates();
        this._boundaryCasterReleases += released;
        // The fingerprint we recorded above was read BEFORE the release; re-read it
        // so the next frame compares against the settled state rather than
        // re-triggering on our own mutation.
        try { this._lastCasterFingerprint = lightsNode.customCacheKey?.() ?? fingerprint; }
        catch { /* keep the pre-release value; a spurious extra pass is harmless */ }
        setTimeout(() => { this._endShadowRebuildGuard(); }, 0);
        console.log(
            `[RenderPipelineManager] §SHADOW-CASTER-FLIP-AT-BOUNDARY released ${released} ` +
            `light-owned shadow map(s) AT THE FRAME BOUNDARY (${typeChanged ? 'shadowMap type/enabled' : 'caster set'} ` +
            'changed). three would have freed these from inside a node build, i.e. inside an open ' +
            'command encoder — "Destroyed texture [ShadowDepthTexture] used in a submit". ' +
            'Compiled node states reset; submits resume next macrotask.',
        );
    }


    /* ── §FOREIGN-SHADOW-MAP-CLAIM (L-13281) ───────────────────────────────────
     *
     * ⭐ THE FOURTH BOUNDARY ARM — AND THE FIRST ONE THAT DOES NOT ASK WHO DID IT.
     *
     * The founder's production crash (project open → split-view auto-open → dead
     * viewport, 2026-09-10) is the L-205 dual-renderer claim, and every existing
     * guard is structurally blind to it:
     *
     *   • `drainShadowMapReallocQueue`   orders a resize WE requested.
     *   • `drainShadowCasterFlipQueue`   orders a caster flip WE requested.
     *   • `_orderPendingCasterReleasesAtBoundary` derives a caster flip from
     *     `LightsNode.customCacheKey()` + `shadowMap.type/.enabled` on OUR renderer.
     *
     * A foreign `THREE.WebGLRenderer` rendering the same scene with
     * `shadowMap.enabled === true` moves NONE of those: no `castShadow` flip, no
     * light id change (so the fingerprint is byte-identical), no `mapSize` write, no
     * change to OUR `shadowMap.type`. It simply walks into the shared
     * `LightShadow.map` slot at WebGLShadowMap.js:203-227 and frees the target the
     * WebGPU `ShadowNode` is still sampling — "Destroyed texture [Texture
     * ShadowDepthTexture] used in a submit", forever, on a frame this manager never
     * owned.
     *
     * ⛔ THAT is why §RECOVERY-MUST-REFUSE is RIGHT to refuse and why the bounded
     * ladder spends 2/2 and still dies: the ladder's repair is correct
     * (`_recreateLightOwnedShadowMaps` + `_resetCompiledNodeStates`), but the
     * CLAIMANT IS STILL ARMED, so it re-does the damage after each repair. A repair
     * loop against a live cause is not a fix; DETECTING THE CAUSE is.
     *
     * ── THE DETECTION IS A CONSTRUCTION, NOT A HEURISTIC ────────────────────────
     * three itself brands the two owners of that one slot:
     *   • node path — `ShadowNode.setupRenderTarget()` → `builder.createRenderTarget()`
     *     → `new RenderTarget(…)` (NodeBuilder.js:505-509), which sets ONLY
     *     `isRenderTarget = true` (RenderTarget.js:75).
     *   • WebGL path — `WebGLShadowMap.render()` → `new WebGLRenderTarget(…)`, whose
     *     constructor sets `isWebGLRenderTarget = true` (WebGLRenderTarget.js:28).
     * So on a native-WebGPU session `light.shadow.map.isWebGLRenderTarget === true`
     * IS the claim, positively identified, with no false-positive branch and no
     * dependence on WHICH module armed the flag, on a log line, or on any caller
     * remembering anything. It closes the CLASS, not one call site — the property
     * the eight existing tests in this family lacked.
     *
     * ── THE REPAIR IS THE MACHINERY THAT ALREADY EXISTS ─────────────────────────
     * Exactly the §SHADOW-CASTER-FLIP-AT-BOUNDARY step, at the same instant, for the
     * same reason: pause submits, perform three's OWN release
     * (`releaseLightOwnedShadowNow`), reset the compiled node states so the graph
     * recompiles with a fresh `ShadowNode` + fresh target, resume next macrotask.
     * Because this runs at the TOP of `render()` — before any encoder is opened and
     * before the `pipelineError` / `shadowRebuildPaused` gates — the first frame
     * after a claim heals it, so no submit references the corpse and the crash is
     * never reported at all.
     *
     * ⚠ HEALING IS THE SECOND LINE, NOT THE FIRST. The claim must not happen: the
     * arming write is refused and its author named by `sealShadowMapEnabled()`
     * (§SHADOW-ENABLE-SINGLE-OWNER), installed on the foreign renderer at the
     * Phase-5 hand-over. This arm exists because five modules declaring an invariant
     * and nothing enforcing it is how the founder got here twice, and because a seal
     * can only cover renderers we know to seal.
     *
     * COST: one `lighting.getNode(scene).getLights()` (O(#lights) — a Pascal
     * key/fill/rim plus the fixture budget, single digits) and one property read per
     * light. No scene traverse; the L-1151/L-1155 defect class is deliberately
     * avoided. Inert unless the native-WebGPU backend is live.
     */
    /** Cumulative count of foreign WebGL shadow-map claims healed at a frame boundary. */
    private _foreignShadowClaimHeals = 0;

    /** Total foreign WebGL `LightShadow.map` claims this manager has healed. */
    get foreignShadowClaimHealCount(): number { return this._foreignShadowClaimHeals; }

    private _healForeignShadowMapClaimsAtBoundary(): void {
        // A `WebGLRenderTarget` in `shadow.map` is CORRECT on a WebGL session — this
        // predicate is a violation only on the node path. Gate on the live backend.
        if (!this._webGpuActive) return;

        const renderer = this._renderer as unknown as {
            lighting?: { getNode?(scene: unknown): { getLights?(): unknown[] } | null };
        } | null;
        const scene = this._scene;
        if (!renderer || !scene) return;

        let lights: unknown[] = [];
        try {
            const lightsNode = renderer.lighting?.getNode?.(scene) ?? null;
            if (!lightsNode || typeof lightsNode.getLights !== 'function') return;
            lights = lightsNode.getLights() ?? [];
        } catch {
            // A backend mid-swap, or a renderer that predates the node path. A
            // diagnostic read must never kill the frame.
            return;
        }

        const claimed = lightsWithForeignShadowMapClaim(lights as ShadowOwningLight[]);
        if (claimed.length === 0) return;

        // Pause submits FIRST: the reset below recompiles the node graph, and the
        // frame that recompiles must not be a frame we submit.
        this._beginShadowRebuildGuard();
        let healed = 0;
        const names: string[] = [];
        for (const light of claimed) {
            names.push(light.name || `id:${light.id ?? '?'}`);
            if (releaseLightOwnedShadowNow(light)) healed++;
        }
        // Nothing may still BIND the map the foreign renderer freed. Same companion
        // as §SHADOW-CASTER-FLIP-AT-BOUNDARY — a pipeline rebuild cannot reach a
        // cached nodeBuilderState, only this can (§L-819).
        this._resetCompiledNodeStates();
        this._foreignShadowClaimHeals += healed;

        console.error(
            `[RenderPipelineManager] §FOREIGN-SHADOW-MAP-CLAIM (L-13281) a SECOND WebGL renderer ` +
            `claimed the shadow slot of ${claimed.length} light(s) [${names.join(', ')}] — their ` +
            '`LightShadow.map` is a `WebGLRenderTarget`, which only `WebGLShadowMap.render()` ' +
            'mints, so a foreign renderer ran a shadow pass over the live scene and freed the ' +
            'WebGPU ShadowDepthTexture out from under our ShadowNode (WebGLShadowMap.js:209/214). ' +
            `This is the L-205 dual-renderer claim. HEALED ${healed} at the frame boundary ` +
            "(three's own release + compiled node-state reset), so no submit references the " +
            'destroyed texture and the viewport keeps painting. ⛔ THIS IS A SECOND LINE OF ' +
            'DEFENCE, NOT A FIX: some module armed `shadowMap.enabled = true` on a renderer that ' +
            'is not the live one. Seal that renderer with `sealShadowMapEnabled()` ' +
            "(§SHADOW-ENABLE-SINGLE-OWNER) — it refuses the write and prints the violator's stack.",
        );

        // §RECOVERY-MUST-REFUSE-NO-FLOOD companion — if the refusal latch is holding
        // the loop shut over exactly the fault we just repaired, lift it. Not from
        // the terminal state (`phase='error'` is the user's crash card and belongs to
        // the crash guard's own lever), and not while a rebuild owns the pipeline.
        if (this._hasPipelineError && this._phase !== 'error' && !this._rebuildInFlight && this._renderPipeline) {
            this._hasPipelineError = false;
            console.warn(
                '[RenderPipelineManager] §FOREIGN-SHADOW-MAP-CLAIM cleared the ' +
                '§RECOVERY-MUST-REFUSE-NO-FLOOD latch: it was holding the render loop shut over a ' +
                'destroyed light-owned shadow map, and that map has just been released and ' +
                'un-bound. Frames resume; the node graph recompiles a fresh ShadowDepthTexture.',
            );
        }

        setTimeout(() => { this._endShadowRebuildGuard(); }, 0);
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

        // §DIAGNOSTIC-HONESTY — this used to print `scene.children.length` under the
        // label `meshCount`. Those are TOP-LEVEL children, not meshes: on the founder's
        // P0 project it reported 63 and 232 for a scene of 445 meshes, so every trace
        // read off this line was misleading about the very quantity being diagnosed.
        // A diagnostic that lies costs more than no diagnostic. Both numbers are now
        // reported under their true names. The traverse is O(scene) but runs only on
        // the debounced schedule path (and not at all while a rebuild is in flight).
        let meshCount = 0;
        this._scene?.traverse((o: THREE.Object3D) => { if ((o as THREE.Mesh).isMesh) meshCount++; });
        console.log(
            `[RenderPipelineManager] SHADOW_REBUILD_SCHEDULED meshCount=${meshCount} ` +
            `sceneChildren=${this._scene?.children?.length ?? '?'}`,
        );
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
                    // §L-966-SECOND-MINTING-SITE (L-1003) — carry the cause.
                    this._failWithCause(
                        'The 3D viewport could not be rebuilt after returning from plan view.',
                        err,
                    );
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
        // §NAV-SHADOW-CAMERA-CANNOT-CHANGE-IT (L-3310, 2026-08-22) —
        // ⚠⚠ THIS METHOD USED TO OPEN WITH `if (!this._webGpuActive) return;`, on the
        // stated grounds that *"the WebGL2 fallback drives its own shadowMap and is out of
        // this lane"*. That is the SAME claim §SHADOW-PER-LIGHT-FREEZE-IS-SCENE-STATE
        // (L-1480) measured as FALSE and removed from `_applyShadowFreezeState` thirty
        // lines below, in this same class, two days earlier. The classic
        // `WebGLShadowMap` reads BOTH the renderer-level and the per-light autoUpdate
        // flags (three r183, WebGLShadowMap.js:95 and :170). The belief has now cost the
        // same defect three times; it is disproven in this file, above and below.
        //
        // ⭐ WHY IT MATTERED MOST ON THE BACKEND IT EXCLUDED: `autoWebGLHeavyScene` forces
        // WebGPU -> WebGL precisely BECAUSE a scene is heavy (measured on the founder's
        // session: 331 elements / 1848 meshes -> `reason=tier:post-load`). So the nav
        // shadow freeze disabled itself in exactly the case it was written for. The
        // heavier the model, the more certainly the optimisation was off.
        //
        // ⭐ WHY FREEZING DURING NAVIGATION IS LOSSLESS, not a quality trade:
        // a shadow map is a function of the LIGHTS and the GEOMETRY. It is not a function
        // of the view camera — and in this build that is not an assumption, it is checked:
        // both shadow cameras are FIXED ortho boxes set at configuration time
        // (`RealSunService.ts:469-472` at +/-80 m, `PascalSceneLighting.ts:296-301` at
        // +/-cfg.shadowCameraSize), never fitted to the view frustum. Orbiting therefore
        // cannot change a single texel of the map, and re-rendering it per frame
        // reproduces a bit-identical texture. On the founder's session that is 1366
        // shadow-casting meshes redrawn every frame to compute a result already in memory,
        // which is why `drawCalls=3685` against `sceneMeshes=1947`.
        //
        // ⛔ If a future change makes the shadow camera follow the view (cascades, a fitted
        // frustum), THIS FREEZE BECOMES LOSSY and the two citations above stop holding.
        // Re-read them before adding one.
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
     * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — run a mutation that changes the
     * shadow CASTER SET (any `light.castShadow` flip) with WebGPU submits PAUSED, resuming
     * DEFERRED past the in-flight submit.
     *
     * ── WHY A FREEZE IS NOT ENOUGH, AND NEVER WAS ────────────────────────────────
     * {@link setShadowReallocFrozen} / {@link setShadowPassSuppressed} set
     * `autoUpdate=false`, which suppresses the depth PASS. That is exactly the right lever
     * for a `mapSize` realloc, and that half of the problem is now clean by construction
     * (§SHADOW-MAP-REALLOC-AT-BOUNDARY + §SHADOW-MAPSIZE-WRITE-AT-BOUNDARY, L-819 — the
     * mapSize write AND the resize both land in `drainShadowMapReallocQueue`).
     *
     * A CASTER-SET change is a different failure. When a light stops casting, three's
     * `AnalyticLightNode` drops its `ShadowNode` and releases the `ShadowDepthTexture` on
     * its OWN schedule, inside the next `render()` — a release gated on nothing this class
     * writes. `autoUpdate=false` cannot defer it, because there is no depth pass left to
     * defer. That is the L-25 mechanism verbatim (ADR-0111 §Context: "when a light stops
     * casting, THREE's shadow renderer DESTROYS that light's ShadowDepthTexture inside the
     * very next `rp.render()`"), and ADR-0111's remedy was to stop the NAV gate pulling
     * that lever — not to make the lever safe for everyone else.
     *
     * The lever is still pulled, by a DIFFERENT gate (the mesh-count shadow ceiling). The
     * only ordering that helps is the one §L930-DETACH-BEFORE-FREE established for the
     * recovery path: submit nothing until the previous frames have drained, THEN let the
     * destroy happen. So this reuses the SAME ref-counted pair (`_begin`/
     * `_endShadowRebuildGuard`, §L930-SUBMIT-PAUSE-DEPTH) instead of inventing a fifth
     * latch — it therefore composes with the nav, whole-load, wall-commit and rebuild
     * windows by construction.
     *
     * ⚠ THIS DOES NOT OVERTURN ADR-0111. ADR-0111 permits a PERSISTENT `castShadow` clear
     * on the heavy-tier gate, justified because it "happens once and stays". The tier
     * caller never met that precondition: `RenderingPipelineCoordinator
     * .applyTierForMeshCount()` is re-evaluated on EVERY geometry event (its own throttle
     * comment records 188× during one generation) and its gate is keyed on the raw mesh
     * count crossing 8000 — which a generation batch crosses exactly once, at exactly the
     * moment `batchAutoFrame` is submitting frames. The ADR's rule stands; that call site
     * was never inside it.
     *
     * Ordering, in three macrotasks:
     *   T+0  pause submits + freeze, then run `mutate` (the `castShadow` flips)
     *   T+1  resume submits — the next `render()` is the first frame that may carry
     *        three's release, and every pre-pause submit has drained by then
     *   T+2  thaw the freeze (`_endShadowRebuildGuard`'s own deferred pop), so the single
     *        depth regen at the NEW caster set lands on an idle frame
     *
     * NEVER disposes a GPU resource itself — it only ORDERS three's own release (ADR-0111
     * / C04 §SHADOW rule 6; ADR-0297 INVARIANT L2, RELEASE at the boundary). Touches no
     * receiver and no attachment: the ground shadow-catcher is not presence-gated, not
     * late-attached, and not read here at all (L-107/L-112 — never re-introduce that).
     * P3-clean: `setTimeout`, no new `requestAnimationFrame`.
     *
     * Inert on the WebGL2 fallback, which owns its own shadowMap — the mutation runs
     * unwrapped. `try/finally` so a throwing lever can never strand the viewport paused.
     */
    runShadowCasterMutation(mutate: () => void): void {
        if (!this._webGpuActive) { mutate(); return; }
        this._beginShadowRebuildGuard();
        try {
            mutate();
        } finally {
            // Deferred release: resuming SYNCHRONOUSLY here would put the very next frame
            // — and three's release with it — back inside the window a pre-pause submit
            // may still occupy, which is the whole defect.
            setTimeout(() => { this._endShadowRebuildGuard(); }, 0);
        }
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

        // §SHADOW-PER-LIGHT-FREEZE-IS-SCENE-STATE (L-1480, 2026-08-20, lane WEBGL4) —
        // ⚠⚠ THIS BLOCK USED TO BE WRAPPED IN `if (this._webGpuActive) { … }`, AND THAT
        // GATE WAS THE FOUNDER'S "3D VIEW SHOWS ONLY OUTLINE PROFILES OF WALLS AND SLABS".
        //
        // The gate's stated justification — kept verbatim below because the DEVICE-LOSS
        // half of it is still correct — ended: *"WebGPU-path only (WebGL2 fallback owns its
        // own shadowMap and honours the renderer-level flag)."* **The second half is FALSE,
        // measured in the installed three r183 source, not inferred:**
        //
        //   node_modules/.pnpm/three@0.183.2/…/webgl/WebGLShadowMap.js
        //     :95   if ( scope.autoUpdate === false && scope.needsUpdate === false ) return;   ← renderer-level
        //     :170  if ( shadow.autoUpdate === false && shadow.needsUpdate === false ) continue; ← PER-LIGHT
        //
        // The classic `WebGLShadowMap` reads the PER-LIGHT flags TOO. So the write was armed
        // on the backend where it matters and the UN-write was disarmed on a backend where it
        // matters just as much — the identical inversion §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND
        // (L-1350) was corrected for, twelve hours earlier, in this same class.
        //
        // ── THE CHAIN, END TO END (every link cited) ──────────────────────────────────
        //  1. Project OPEN on native WebGPU. `setShadowReallocFrozen(true)` pushes the
        //     whole-load/tier-escalation freeze → this applier writes `shadowMap.autoUpdate =
        //     false` AND (old gate: only here) `light.shadow.autoUpdate = false` on every
        //     shadow-casting light.
        //  2. The `tier:post-load` pass fires §AUTO-WEBGL-HEAVY (C04 §1.4) — i.e. the backend
        //     swap is fired FROM INSIDE that freeze window. Not a coincidence: both hang off
        //     the same post-load tier pass.
        //  3. `§RENDERER-LIVE-SWAP` calls `rpm.dispose()` FIRST, which zeroes
        //     `_shadowReallocFreezeDepth` / `_shadowPassSuppressed` / `_shadowFrozenState`
        //     and sets `_webGpuActive = false` — **without ever applying the thaw.** The
        //     counters are reset; the LIGHTS are not. The live swap deliberately KEEPS the
        //     same `THREE.Scene`, so those are the same `DirectionalLight` objects.
        //  4. `bind()` re-runs this applier against the new classic `THREE.WebGLRenderer`
        //     with `shouldFreeze === false` → `shadowMap.autoUpdate = true` ✓ … and, under
        //     the old gate, `_webGpuActive === false` skipped the per-light restore. The
        //     lights keep `shadow.autoUpdate === false` **permanently**.
        //  5. `WebGLShadowMap.js:170` therefore `continue`s for the key light every frame →
        //     **`light.shadow.map` is never allocated.**
        //  6. `WebGLLights.js:243-259` pushes `shadowMap = null` anyway (it keys on
        //     `light.castShadow`, not on the map), and `:459-465` sets
        //     `state.directionalShadowMap.length = 1`.
        //  7. That non-zero LENGTH makes `WebGLPrograms.js:332/344` emit `USE_SHADOWMAP` +
        //     `SHADOWMAP_TYPE_PCF`, so `shadowmap_pars_fragment.glsl.js:18-20` declares
        //     `uniform sampler2DShadow directionalShadowMap[1]`.
        //  8. `WebGLRenderer.js:2526-2533` uploads the array via
        //     `WebGLUniforms.setValueT1Array` (`:825-841`), which substitutes
        //     `emptyShadowTexture`. That texture's `version` is 0 forever, so
        //     `WebGLTextures.setTexture2D` (`:518`) never uploads it, `__webglTexture` is
        //     `undefined`, and `WebGLState.js:951` binds `emptyTextures[TEXTURE_2D]` — a 1×1
        //     **RGBA8** texture with **`TEXTURE_COMPARE_MODE = NONE`**. (Note the scalar
        //     sibling `setValueT1` at `:571-584` DOES set `compareFunction`; the ARRAY path,
        //     which is the one shadows always take, does not.)
        //  9. A `sampler2DShadow` bound to a non-comparison colour texture is INCOMPLETE for
        //     that sampler type, so the driver raises `INVALID_OPERATION` and **DROPS THE
        //     DRAW**. Every lit mesh. Every frame.
        // 10. ⭐ **AND THAT IS THE WHOLE MESH-vs-LINE SPLIT.** `LineBasicMaterial` compiles
        //     `ShaderLib.basic` → `meshbasic.glsl.js`, which includes **no `shadowmap_*`
        //     chunk at all** and therefore declares no shadow sampler. Lines draw; solids do
        //     not. "Black outline profiles floating in white space."
        //
        // ── WHY IT VANISHES ON WebGPU (the founder's own controlled experiment) ────────
        // `WebGLShadowMap` exists ONLY on the classic `THREE.WebGLRenderer`. Native WebGPU
        // and the `WebGPURenderer({forceWebGL})` WebGL2 fallback both run three's NODE
        // shadow path (`ShadowNode`), which allocates its own depth texture and never binds
        // an empty RGBA to a comparison sampler. One variable changed; the defect is the
        // classic renderer's shadow path, not the model, not the materials.
        //
        // ── THE RULE, so this cannot be re-scoped to a backend again ──────────────────
        // `LightShadow.autoUpdate` / `.needsUpdate` are **SCENE STATE, not backend state.**
        // They live on the lights the live swap deliberately keeps, and three reads them on
        // EVERY backend (`WebGLShadowMap.render()` classic, `ShadowNode.updateBefore()`
        // node). The freeze must therefore be asserted onto them wherever this manager is
        // bound — exactly like `renderer.shadowMap.autoUpdate` two lines above, which was
        // never gated. ⛔ Do NOT re-add a backend gate here. If a future backend must not be
        // frozen, gate the FREEZE SOURCE (`setShadowPassSuppressed` /
        // `setShadowReallocFrozen` already early-return off the WebGPU path), never the
        // ASSERT — gating the assert is what strands a `false`.
        //
        // ── The original L-231 rationale, still true and still the reason to write these ──
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
        this._forEachShadowCastingLight((sh) => {
            sh.autoUpdate = !shouldFreeze;
            if (transitioned && !shouldFreeze) sh.needsUpdate = true;
        });
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

    // ── §SHADOW-CASTER-DECLARED-BUT-UNSATISFIABLE (L-1482, lane WEBGL4, 2026-08-20) ──
    /**
     * THE TRIPWIRE FOR L-1480. A shadow caster whose depth pass can never run does not
     * fail loudly on the classic WebGL path — it silently makes **every lit mesh draw in
     * the scene invalid**, while unlit lines keep drawing. That silence is why the same
     * viewport symptom reached the founder repeatedly before anyone could name it.
     *
     * THE PREDICATE IS three's OWN, not a paraphrase. `WebGLShadowMap.render()` skips a
     * light's depth pass with, verbatim (three r183, `WebGLShadowMap.js:170`):
     *
     *     if ( shadow.autoUpdate === false && shadow.needsUpdate === false ) continue;
     *
     * A light in that state **with no `shadow.map` already allocated** is UNSATISFIABLE:
     * the map will never be built, yet `WebGLLights.setup()` still counts the light
     * (`WebGLLights.js:243-259`, `:459-465` — it keys on `castShadow`, never on the map),
     * so `numDirLightShadows` is ≥ 1, `USE_SHADOWMAP` is defined, and every lit program
     * declares a `sampler2DShadow` that three can only satisfy with a 1×1 RGBA
     * `TEXTURE_COMPARE_MODE = NONE` texture (`WebGLUniforms.js:825-841` →
     * `WebGLTextures.js:518` → `WebGLState.js:951`). Incomplete for that sampler type ⇒
     * `INVALID_OPERATION` ⇒ the draw is dropped.
     *
     * ⭐ "CAN THIS EVER BE TRUE?" — the question the unsatisfiable-gate lesson says to ask
     * BEFORE "why is it slow / dark / empty". A freeze means *"reuse the map you already
     * have"*; a renderer that has never run its depth pass has no map to reuse, so a
     * freeze asserted onto it is not a freeze, it is a permanent suppression.
     *
     * Reports, never repairs. Repairing here would hide which upstream latch stranded the
     * flag — and the fix for L-1480 is that {@link _applyShadowFreezeState} asserts the
     * per-light flags on EVERY backend, so a strand should now be impossible. This exists
     * so that if one ever happens again it arrives as a named line instead of an empty
     * building. Runs ONCE per bind, on the first frame this manager presents (one traverse
     * of an already-traversed scene; not a per-frame cost).
     *
     * @returns the number of unsatisfiable casters found (0 = healthy). Exported for the
     *   separating test, which asserts the COUNT rather than that a log happened.
     */
    auditShadowCasters(): number {
        const shadowMap = (this._renderer as { shadowMap?: { enabled?: boolean } } | null)?.shadowMap;
        // `enabled === false` means no lit program declares a shadow sampler at all
        // (`shadowMapEnabled` in WebGLPrograms.js:344 is `renderer.shadowMap.enabled &&
        // shadows.length > 0`), so an unsatisfiable caster cannot invalidate any draw.
        if (!shadowMap || shadowMap.enabled === false) return 0;
        const stranded: string[] = [];
        this._scene?.traverse((obj) => {
            const light = obj as THREE.DirectionalLight;
            if (!light.isDirectionalLight || !light.castShadow || !light.shadow) return;
            const sh = light.shadow as unknown as {
                autoUpdate?: boolean; needsUpdate?: boolean; map?: unknown;
            };
            if (sh.autoUpdate === false && sh.needsUpdate === false && sh.map == null) {
                stranded.push(light.name || light.uuid.slice(0, 8));
            }
        });
        if (stranded.length > 0) {
            console.error(
                `[RenderPipelineManager] §SHADOW-CASTER-DECLARED-BUT-UNSATISFIABLE (L-1482) — ` +
                `${stranded.length} shadow-casting light(s) [${stranded.join(', ')}] have ` +
                `shadow.autoUpdate=false, shadow.needsUpdate=false AND no allocated shadow.map. ` +
                `three's WebGLShadowMap.render() skips their depth pass forever ` +
                `(WebGLShadowMap.js:170), but WebGLLights still counts them, so every LIT ` +
                `material in this scene declares a sampler2DShadow that resolves to a 1x1 RGBA ` +
                `texture with no compare mode — an INVALID_OPERATION that DROPS THE DRAW. ` +
                `Expect solid surfaces to vanish while LineBasicMaterial edges keep drawing. ` +
                `This is L-1480; a shadow FREEZE was asserted onto a renderer that had never ` +
                `rendered a depth pass, so there was no map to "reuse".`,
            );
        }
        return stranded.length;
    }

    /** §L-1482 — one audit per bind, taken on the first frame actually presented. */
    private _shadowCasterAuditPending = false;

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

        // §L-10010-TRANSMISSION-SWEEP-COVERS-THE-BATCH — the line above sweeps at the
        // moment the batch STARTS, which is the moment BEFORE the batch's materials
        // exist. Arm a sweep that runs at the next `render()` instead: the first render
        // after a batch is BatchCoordinator's §FIX-POST-GEOMETRY-COMPILE-V2
        // `rpm.render()`, i.e. exactly the compile that turns a transmission node into
        // WGSL. See {@link armTransmissionSweep} for the full measurement.
        this.armTransmissionSweep(`shadowLatch:${reason}:${disabled ? 'on' : 'off'}`);
    }

    /**
     * §L-10010-TRANSMISSION-SWEEP-COVERS-THE-BATCH (founder crash, 2026-08-23)
     * ────────────────────────────────────────────────────────────────────────
     *
     * ARMS a transmission sweep for the next `render()`. Cheap: one boolean write.
     *
     * ⭐ WHY A LATCH AND NOT ANOTHER CALL SITE. The guard this joins
     * (`§L-361-WEBGPU-TRANSMISSION-GUARD`) had two live entry points and the founder's
     * crash fell between them. MEASURED by reading the control flow, 2026-08-23:
     *
     *   1. `setShadowPassDisabled('batch', true)` — fires at batch START, from
     *      `BatchCoordinator._setupBatch`. Any material the batch is ABOUT to create
     *      does not exist yet, so the sweep can only ever find zero of them. The
     *      founder's console shows the `§BATCH-SHADOW-MAP-SUPPRESS` line and **no**
     *      `neutralized N transmission material(s)` line, which is what a sweep over an
     *      empty set looks like.
     *   2. `initScene.runTierPbrPass` → `neutralizeTransmissionForWebGPU()` — the
     *      non-batched geometry-add seam (ADR-0267 §Fix-2). It is **skipped for the
     *      whole batch** by `shouldDeferPerAddGeometryPass(batchCoordinator.isBatching)`,
     *      and its consolidated post-batch run happens inside `_onPostBatch()`, which
     *      `BatchCoordinator.onComplete` invokes **AFTER** the
     *      §FIX-POST-GEOMETRY-COMPILE-V2 synchronous `rpm.render()`.
     *
     * ⛔ So a material created DURING a batch is compiled by a render that sits after
     * entry 1 and before entry 2. A guard that runs before the thing it guards exists,
     * and again after that thing has already been compiled, guards nothing. That window
     * is where `THREE.TSL: Invalid generated code, expected a "float"` printed.
     *
     * ⭐ THE LATCH CLOSES THE CLASS, NOT THE GESTURE. It does not matter which code
     * path created the material, whether it was inside a batch, or which of the several
     * synchronous-compile renders picks it up: the sweep runs at the LAST INSTANT
     * BEFORE ANY RENDER, which is the only place that is provably after every material
     * that render will compile. Adding a third hand-placed call site would have fixed
     * this gesture and left the next one open.
     *
     * ⚠ COST WHEN NOT ARMED: one boolean read per frame. The sweep itself is a scene
     * traverse, so it must never be run unconditionally per frame — that is why this is
     * a latch and not a per-frame call.
     */
    armTransmissionSweep(reason: string): void {
        this._transmissionSweepArmed = true;
        this._transmissionSweepReason = reason;
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
    /** §L-10010 — a transmission sweep is due at the next `render()`. */
    private _transmissionSweepArmed = false;
    /** §L-10010 — why the sweep was armed, for the one log line it prints if it finds work. */
    private _transmissionSweepReason = '';

    /**
     * §L-10010 — run the armed sweep, if any. Called from `render()` at the frame
     * boundary, BEFORE any pass is encoded, so a material created since the last frame
     * is neutralized before the compile that would emit its TSL node.
     */
    private _runArmedTransmissionSweep(): void {
        if (!this._transmissionSweepArmed) return;
        this._transmissionSweepArmed = false;
        const reason = this._transmissionSweepReason;
        this._transmissionSweepReason = '';
        const n = this._neutralizeTransmissionForWebGPU();
        if (n > 0) {
            console.warn(
                `[RenderPipelineManager] §L-10010-TRANSMISSION-SWEEP-COVERS-THE-BATCH the ` +
                `pre-render sweep (armed by ${reason}) neutralized ${n} transmission material(s) ` +
                `that did NOT exist when the batch-start sweep ran. Without this latch those ` +
                `${n} would have reached the synchronous post-batch compile un-neutralized — ` +
                `the "expected a float" seed.`,
            );
        }
    }

    private _neutralizeTransmissionForWebGPU(): number {
        try {
            // Fire whenever the renderer node-compiles (native WebGPU OR WebGL2-backed
            // WebGPURenderer). A plain THREE.WebGLRenderer (isWebGPURenderer falsy) has no TSL
            // node graph → skip, keeping refractive glass.
            const rendererNodeCompiles =
                (this._renderer as { isWebGPURenderer?: boolean } | null)?.isWebGPURenderer === true;
            if (!rendererNodeCompiles || !this._scene) return 0;
            const seen = new Set<string>();
            let neutralized = 0;
            this._scene.traverse((obj) => {
                const rawMat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
                if (!rawMat) return;
                const mats = Array.isArray(rawMat) ? rawMat : [rawMat];
                for (const m of mats) {
                    if (!m || seen.has(m.uuid)) continue;
                    seen.add(m.uuid);
                    // §L-10011-NODE-MATERIAL-IS-NOT-A-PHYSICAL-MATERIAL — this test was
                    // `m instanceof THREE.MeshPhysicalMaterial`, and in three r183 that is
                    // NOT the class this guard's own docstring names. MEASURED in
                    // `three.webgpu.js`: `class MeshPhysicalNodeMaterial extends
                    // MeshStandardNodeMaterial` → `extends NodeMaterial` → `extends
                    // Material`. It does NOT extend MeshPhysicalMaterial, so the guard
                    // written to disarm "the MeshPhysicalNodeMaterial transmission node
                    // graph" could not see a MeshPhysicalNodeMaterial at all.
                    //
                    // ⭐ THE PROPERTY IS THE SUBJECT, NOT THE CLASS. What emits the
                    // transmission TSL node is a numeric `transmission > 0`, whatever
                    // class carries it. Keying on the property covers
                    // MeshPhysicalMaterial (all of today's PRYZM glass —
                    // `WindowBuilder.ts:321` `transmission: 0.9`), MeshPhysicalNodeMaterial
                    // (none today, latent), and anything a future importer or the GLB
                    // round-trip mints. A material with no numeric `transmission` is
                    // untouched, so this widening cannot reach an ordinary material.
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
            return neutralized;
        } catch (err: unknown) {
            console.warn('[RenderPipelineManager] §L-361-WEBGPU-TRANSMISSION-GUARD failed (non-fatal):', err instanceof Error ? err.message : err);
            return 0;
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
            // §L-966-SECOND-MINTING-SITE (L-1003) — carry the cause.
            this._failWithCause(
                'The 3D viewport could not be rebuilt after a camera or view change.',
                err,
            );
        } finally {
            this._hasPipelineError = false;
        }
    }

    /**
     * §FIX-ONCE-IMPORT-EVERYWHERE (ADR-0297 / ADR-0302) — the narrow, correct entry
     * point for a VIEWPORT GEOMETRY CHANGE.
     *
     * ── The rule this imports ────────────────────────────────────────────────
     * ADR-0297 established that `onProjectSwitch()` is a PROJECT-LIFECYCLE lever and
     * must not be borrowed for other purposes; `ViewportCrashGuardRecoveryLever.test.ts:79`
     * pins "NEVER via onProjectSwitch()" for the RECOVERY case. The RESIZE
     * subscription was simply never audited under the same rule. It is the same
     * defect, one call-site over — so the rule is imported here rather than
     * re-derived a third time.
     *
     * ── What was wrong ──────────────────────────────────────────────────────
     * `initScene.ts` routed every viewport-geometry change — a `window.resize`
     * listener AND a `ResizeObserver` on `#container` — into `onProjectSwitch()`.
     * So opening the property inspector, toggling a sidebar, dragging a panel,
     * opening devtools, browser zoom, a CSS transition on a neighbour, or the split
     * view mounting during project load each ran `_reconcileRenderSize()` **plus**
     * `scheduleShadowRebuild()` — a full pipeline dispose + `createScenePass()`
     * recomposition, with WebGPU submits paused for its duration (measured at
     * 1,862 ms on the founder's 445-mesh project). The founder's Cesium log shows
     * the container oscillating 677 → 678 → 677 px, each oscillation taking that
     * path. A 1-pixel reflow was buying a multi-second shadow reconstruction.
     *
     * ── What a resize ACTUALLY requires: only this ───────────────────────────
     * I checked rather than assumed, because the comment on
     * {@link _renderSizeReconcileArmed} claims "the app's own resize path is intact"
     * and that claim is what made this look safe for so long.
     *
     *   • The renderer's backing store must follow the canvas — that is
     *     `_reconcileRenderSize()`, which re-applies `setSize` so the colour targets
     *     AND the shared `depthBuffer` reallocate from ONE size read (L-312A).
     *   • The TSL post-processing targets need NOTHING here. `PassNode.updateBefore`
     *     (three/src/nodes/display/PassNode.js:788-794) calls `renderer.getSize()`
     *     and `this.setSize(...)` on EVERY frame, cascading to
     *     `renderTarget.setSize(...)`. Our `OutlinePass`/`ZonePass` are TSL node
     *     compositions over `pass(...)` and own no independently-sized targets.
     *     So every post-FX target re-derives from the renderer size on the next
     *     frame, automatically.
     *   • The shadow map needs NOTHING here. A shadow map's resolution is
     *     `light.shadow.mapSize`, which is a function of QUALITY TIER, not of
     *     viewport size. Reallocating it on resize was never buying correctness —
     *     and reallocating it is precisely the operation that destroyed a
     *     ShadowDepthTexture mid-submit (§GPU-RESOURCE-LIFETIME).
     *
     * Hence: reconcile the size, and nothing else. No pipeline rebuild, no shadow
     * rebuild, no submit pause. Cheap enough to run on every ResizeObserver tick.
     *
     * Safe to call before `bind()` and on the WebGL path (both no-op).
     *
     * @returns true if a corrective `setSize` was issued (i.e. real drift was
     *          found), false when the renderer already matched the canvas — so a
     *          caller can log honestly instead of claiming work it did not do.
     */
    onViewportResize(): boolean {
        try {
            return this._reconcileRenderSize();
        } catch (err: unknown) {
            // A resize must never be able to break the frame loop.
            console.warn(
                '[RenderPipelineManager] onViewportResize — size reconcile failed (non-fatal):',
                err instanceof Error ? err.message : err,
            );
            return false;
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
        // §L-966 / L-663 defect 1 — a project switch is a LIFECYCLE event, not a
        // recovery. It may hand the INCOMING project a fresh post-FX retry ladder,
        // but it must not erase a bound that is currently holding a FAILED pipeline:
        // that is how "recovery resets every counter that bounds it" was built. The
        // automatic-recovery budget (`_autoRecoveryAttempts`) is never touched here
        // at all — only `recoverPipeline()`'s new device may restore it.
        const holdingAFailedPipeline = this._phase === 'error';
        console.log(
            '[RenderPipelineManager] onProjectSwitch — clearing outline refs' +
            (holdingAFailedPipeline
                ? ' (retry counter PRESERVED: the pipeline is in phase=error and the bound is live)'
                : ', resetting retry counter'),
        );
        if (!holdingAFailedPipeline) this._retryCount = 0;

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
        // ── §SHADOW-PER-LIGHT-FREEZE-IS-SCENE-STATE (L-1480) ─────────────────────
        // THAW THE LIGHTS BEFORE DROPPING THE SCENE REFERENCE. Everything else this
        // method resets is state this manager OWNS; the per-light
        // `LightShadow.autoUpdate` flags are not — they live on the scene's
        // `DirectionalLight`s, which OUTLIVE this manager (the §RENDERER-LIVE-SWAP
        // path deliberately keeps the same `THREE.Scene`). Zeroing
        // `_shadowReallocFreezeDepth` / `_shadowPassSuppressed` forty lines below
        // WITHOUT applying the corresponding thaw is what stranded the founder's key
        // light at `autoUpdate === false` across a swap: the counters said "not
        // frozen", the lights said "frozen", and three believed the lights
        // (`WebGLShadowMap.js:170`). Every lit mesh draw was then dropped while
        // `LineBasicMaterial` edges kept drawing — the "outline profiles only" 3D view.
        //
        // `bind()` re-asserts these too, so this is belt-and-braces — deliberately.
        // A dispose with no following bind (project teardown, terminal recovery) would
        // otherwise leave the scene's lights frozen for whoever picks that scene up
        // next, and "whoever picks it up next" is exactly the swap. Must run FIRST:
        // `this._scene = null` is four lines down and `_forEachShadowCastingLight`
        // reads it. Best-effort — a teardown must never throw.
        try {
            this._forEachShadowCastingLight((sh) => { sh.autoUpdate = true; sh.needsUpdate = true; });
        } catch { /* a thaw must never break a dispose */ }

        this._disposeOutlineInstances();
        this._safeDisposeRenderPipeline();
        this._renderPipeline     = null;
        this._scenePass          = null;
        this._scenePassHasGBuffer = false; // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT — dies with the pass
        this._zonePass           = null;
        this._outputNode         = null;
        this._backgroundUniform  = null;
        this._scene              = null;
        this._camera             = null;
        this._renderer           = null;
        this._cachedAo                         = null;
        this._cachedGi                         = null;
        this._ssgiParams                       = undefined; // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510)
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
        // §GPU-CASTER-RELEASE-CHOKEPOINT (L-1290) — give the observer slot back. A
        // disposed manager that stayed installed would open a submit-pause window on
        // a renderer it no longer owns, and `_beginShadowRebuildGuard` writes state
        // that nothing would ever drain.
        setShadowCasterReleaseObserver(null);
        this._casterReleaseGuardArmed          = false;
        this._casterReleaseGuardFrames         = 0;
        this._submitPauseDepth                 = 0;
        this._shadowRebuildPaused              = false;
        // ⭐⭐ §A-TEARDOWN-RELEASES-THE-RENDERER-NOT-THE-CALLER'S-LATCH (L-1485, lane
        // WEBGL4, 2026-08-20). These two lines used to be:
        //
        //     // §FIX-SHADOW-ENABLE-LATCH — a rebound singleton starts with a clean enable
        //     // latch (no stale transient suppressions; preferences re-seed from the fresh
        //     // UI state).
        //     this._shadowPrefs.clear();
        //     this._shadowSuppressions.clear();
        //
        // **Both halves of that justification are false on the path that matters — the
        // §RENDERER-LIVE-SWAP, which calls `dispose()` and then re-`bind()`s THE SAME
        // singleton against a new renderer, with no fresh UI and no re-seed anywhere.**
        //
        //   • PREFERENCES. `_shadowPrefs` holds the user's *Cast shadows OFF* and
        //     performance mode's choice. Nothing re-seeds them after a swap — there is no
        //     "fresh UI state" to read from; the panels wrote once, at the moment the user
        //     clicked. So every backend swap silently turned a user's *Cast shadows OFF*
        //     back ON. That is the same defect as L-1483 one file over: **a teardown
        //     destroying a statement of intent it does not own.**
        //   • SUPPRESSIONS. `_shadowSuppressions` is ref-counted BY REASON, and its whole
        //     contract is *the caller that pushed is the caller that pops*
        //     ({@link pushShadowPassDisabled} returns the release handle for exactly this).
        //     `BatchCoordinator` holds `'batch'` for the DURATION of a heavy generation and
        //     releases it up to 30 s later. §AUTO-WEBGL-HEAVY fires its swap MID-batch — so
        //     this clear dropped a suppression whose owner was still running. The classic
        //     renderer then ran a **full `WebGLShadowMap` depth pass over every `castShadow`
        //     mesh, every frame, for the rest of the generation** — precisely the cost
        //     §BATCH-SHADOW-MAP-SUPPRESS exists to avoid, incurred at the exact moment the
        //     swap was performed to REDUCE cost. And the eventual
        //     `setShadowPassDisabled('batch', false)` then deleted a key that was no longer
        //     there: a silent no-op, so nothing ever reported it.
        //
        // THE RULE: `dispose()` releases THE RENDERER. `_shadowPrefs` / `_shadowSuppressions`
        // are the CALLER'S latch about the SCENE — the same category as the per-light
        // `LightShadow.autoUpdate` flags thawed at the top of this method (L-1480). A
        // teardown may reset what it owns; it must not silently answer on someone else's
        // behalf. Both maps therefore SURVIVE, and `bind()`'s `_applyShadowEnabledState()`
        // re-asserts the resulting state onto the new renderer — which is what that
        // re-assert was added for (§FIX-SHADOW-ENABLE-LATCH / L-205).
        //
        // ⚠ STATED HONESTLY, not hidden: keeping them means a caller that pushes a
        // suppression and NEVER releases now leaks across a dispose instead of being
        // papered over by this clear. That trade is deliberate — L-205 already made the
        // leak structurally hard (`pushShadowPassDisabled` hands back an idempotent,
        // exception-safe handle, and `setShadowPassDisabled` is boolean-presence so repeated
        // releases collapse) — and a leaked suppression is VISIBLE (`§DIAG-GROUND-SHADOW`
        // prints both maps) whereas a silently discarded user preference is not.
        // ⛔ Do not "fix" a future leak by restoring these clears; fix the caller that
        // failed to release.
    }

    // ── §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) ──────────────────────────
    //
    /**
     * §SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) — the ONLY place `_scenePass` is assigned a
     * newly-built pass.
     *
     * A `PassNode` owns a `RenderTarget`; every TSL node derived from it (`_cachedAo`,
     * `_cachedGi` — built by `createSSGIPass` from this pass's `output`/`depth`/`normal`
     * texture nodes) is bound to THAT target. Replacing the pass without dropping them
     * leaves the composite graph sampling a render target the pipeline no longer renders
     * into. Three sites built a new pass (`_buildPipeline`, `_fullRebuild`,
     * `_ensureScenePassGBuffer`) and only two of them dropped the derived nodes.
     *
     * The path that did not is the device-loss / live-backend-swap recovery:
     * `recoverPipeline → bind() → _buildPipeline()` mints a fresh pass, and the very next
     * step, `if (this._ssgiActive) await this.activateSSGI()`, hit `activateSSGI`'s
     * idempotency guard — `_ssgiActive && _cachedAo && _cachedGi && !params` — and returned
     * WITHOUT rebuilding, because the stale nodes were still there to satisfy it. SSGI then
     * composited nodes bound to the pre-loss target for the rest of the session.
     *
     * Dropping them here makes that guard read TRUE STATE, so recovery genuinely re-derives.
     *
     * It is deliberately LOUD when it drops live nodes while SSGI is still flagged on: that
     * combination means SSGI is off until something re-activates it, and a feature that turns
     * itself off without a console line is how a "quality regression" gets attributed to the
     * wrong change six weeks later.
     */
    private _setScenePass(pass: PassNode, hasGBuffer: boolean): void {
        if (this._ssgiActive && (this._cachedAo || this._cachedGi)) {
            console.warn(
                '[RenderPipelineManager] §SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) — the scene pass was '
                + 'replaced while SSGI was active; the cached AO/GI nodes are bound to the OLD render '
                + 'target and are being dropped. SSGI stays OFF until it is re-derived '
                + `(hasGBuffer=${hasGBuffer}).`,
            );
        }
        this._scenePass           = pass;
        this._scenePassHasGBuffer = hasGBuffer;
        this._cachedAo            = null;
        this._cachedGi            = null;
    }

    /**
     * Guarantee that `_scenePass` DECLARES its G-buffer before anything reads a G-buffer
     * channel off it.
     *
     * WHY IT IS A METHOD AND NOT A LINE AT EACH CALL SITE. The failure it prevents is silent
     * in both halves: `PassNode.getTexture(name)` never throws for an undeclared attachment
     * (it clones and pushes one — `three/src/nodes/display/PassNode.js:564-583`), and
     * `setMRT()` is the separate call that makes materials emit those outputs. So a reader
     * that forgets the pairing gets a render target and a shader that disagree, and the only
     * report is a WebGPU validation flood on the next submit. One chokepoint, keyed on the
     * layout the pass was BUILT with, is the only way that pairing stays true.
     *
     * ⚠ Replacing the pass INVALIDATES every node derived from the old one. `_cachedAo` /
     * `_cachedGi` are exactly that, so they are dropped — and re-derived here when SSGI is
     * active, because the alternative (leaving them null) makes `_rebuildPipelineWithCurrentState`
     * fall through to `_buildPipeline()` and silently drop SSGI on a TRAA toggle. A feature
     * that disappears because a peer feature was switched on is the same class of defect as
     * the one being fixed: a state change nobody reported.
     *
     * No-op — deliberately, not defensively — when the pass already carries the G-buffer, when
     * there is no scene/camera/pass, or before TSL is loaded. `_buildPipeline()` re-asserts the
     * layout from `_ssgiActive || _traaActive` on its own, so a deferred call loses nothing.
     *
     * ⚠ It never MINTS a pass where there was none (`_scenePass === null`). `activateTRAA()`
     * has no `_scenePass` guard of its own, and a pass created here would be built outside
     * `_buildPipeline`/`_fullRebuild` — the two places that also build the zone pass and the
     * graph that consumes both. There is nothing to repair on a manager with no pass; whoever
     * builds the first one builds it with the correct flag.
     *
     * @returns `true` when `_scenePass` is safe to read G-buffer channels from — i.e. it
     *          DECLARES them via `setMRT`. `false` means the caller must NOT call
     *          `getTextureNode('diffuseColor' | 'normal' | 'velocity')` on it: doing so is
     *          precisely the lazy-clone bug. The boolean exists because the failure is
     *          otherwise silent, and a caller that ignores it re-opens L-1510.
     */
    private async _ensureScenePassGBuffer(): Promise<boolean> {
        if (this._scenePassHasGBuffer) return true;
        if (!this._scenePass || !this._scene || !this._camera || !this._tslLoaded) return false;

        console.log(
            '[RenderPipelineManager] §FIX-WEBGPU-MRT-LAZY-ATTACHMENT — rebuilding the scene pass '
            + 'WITH its G-buffer before a G-buffer channel is read '
            + `(ssgi=${this._ssgiActive} traa=${this._traaActive}).`,
        );

        // §SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) — also drops `_cachedAo`/`_cachedGi`; they
        // are bound to the pass we just discarded.
        this._setScenePass(createScenePass(this._scene, this._camera, true), true);

        if (this._ssgiActive) {
            try {
                const { createSSGIPass } = await import('./SSGIPass');
                // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT — re-derive with the SAME quality params the
                // user activated with. Re-deriving from DEFAULT_SSGI_PARAMS would silently
                // discard a caller's overrides on a rebuild, which is a quality regression with
                // no console line attached.
                const { ao, gi } = await createSSGIPass(this._scenePass, this._camera, this._ssgiParams);
                this._cachedAo = ao;
                this._cachedGi = gi;
            } catch (err: unknown) {
                // Say it. An SSGI that vanishes without a line in the console is how a
                // "quality regression" gets attributed to the wrong change six weeks later.
                console.error(
                    '[RenderPipelineManager] §FIX-WEBGPU-MRT-LAZY-ATTACHMENT — the scene pass was '
                    + 'rebuilt with its G-buffer but the SSGI nodes could not be re-derived; SSGI '
                    + 'is OFF for this pipeline until it is re-activated:', err,
                );
                this._ssgiActive = false;
            }
        }
        return true;
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
            // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — THE FIX, and its position is the fix.
            //
            // `createSSGIPass` reads `diffuseColor` and `normal` off this pass. On a pass built
            // without the G-buffer — the DEFAULT, because SSGI/TRAA start off — those two reads
            // do not fail and do not warn: `PassNode.getTexture` clones `output` and pushes the
            // clone onto `renderTarget.textures`, so the render pass silently acquires colour
            // attachments that no material emits. Every subsequent submit is rejected by WebGPU
            // and the viewport dies. Rebuild the pass WITH its MRT declaration first, so the
            // attachments and the fragment outputs are minted by the same call.
            //
            // Runs while `_ssgiActive` is still false, so the re-derive branch inside
            // `_ensureScenePassGBuffer` does not build an SSGI pass we are about to build here.
            const gBufferReady = await this._ensureScenePassGBuffer();
            if (!gBufferReady) {
                // The pass cannot be given a G-buffer right now (no pass yet / TSL not loaded).
                // Reading `normal` off it here is EXACTLY the L-1510 defect, so refuse instead.
                // `_buildPipeline()` re-asserts the layout from `_ssgiActive` when it runs, and
                // `_ssgiActive` is still false here, so nothing is silently left half-enabled.
                console.warn(
                    '[RenderPipelineManager] §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — SSGI activation '
                    + 'refused: the scene pass has no G-buffer and cannot be rebuilt with one yet '
                    + `(scenePass=${this._scenePass ? 'built' : 'NULL'} tslLoaded=${this._tslLoaded}).`,
                );
                this._emitState();
                return;
            }
            const { createSSGIPass } = await import('./SSGIPass');
            const { ao, gi } = await createSSGIPass(this._scenePass, this._camera, params);
            this._ssgiActive  = true;
            this._ssgiParams  = params;
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
        this._ssgiParams = undefined; // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510)
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
        // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — TRAA reaches the SAME hole as SSGI, one
        // channel over: `_buildPhase3Pipeline` reads `velocity`. With SSGI already on, the
        // rebuild below takes the phase-3 branch and never revisits the pass, so the ensure has
        // to happen here. With SSGI off it takes `_buildPipeline()`, which rebuilds the pass
        // with `_traaActive` now true — this call is then a no-op, which is the correct answer.
        await this._ensureScenePassGBuffer();
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
        // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) + §SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) —
        // record the layout as BUILT, and drop the AO/GI nodes bound to the pass being replaced.
        const needsGBuffer = this._ssgiActive || this._traaActive;
        this._setScenePass(createScenePass(this._scene, this._camera, needsGBuffer), needsGBuffer);
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

        // §FIX-WEBGPU-INVALID-PIPELINE-MRT (L-253) + §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) —
        // this is the ONLY consumer of the G-buffer, and the four `getTextureNode` calls below
        // are the exact lines that used to MINT missing attachments onto a single-target pass
        // (see `_scenePassHasGBuffer`). The guard here used to fire only when SSGI *and* TRAA
        // were both inactive — a state `activateSSGI()` had already made unreachable by setting
        // `_ssgiActive = true` first — so on the founder's click it did nothing at all.
        //
        // Keyed on the layout the pass was BUILT with, it fires exactly when it must.
        if (!await this._ensureScenePassGBuffer()) {
            // Refuse, do not degrade silently. The four reads below on a pass with no MRT
            // declaration ARE the defect; building the cheap phase-2 pipeline instead keeps
            // the viewport valid and leaves `_ssgiActive` intact, so the next rebuild that
            // CAN give the pass a G-buffer restores phase 3.
            console.warn(
                '[RenderPipelineManager] §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — phase-3 pipeline '
                + 'refused: the scene pass does not declare a G-buffer and could not be rebuilt with '
                + 'one. Falling back to the phase-2 pipeline (SSGI/TRAA not composited this build).',
            );
            await this._buildPipeline();
            return;
        }

        // `_ensureScenePassGBuffer` may have REPLACED the pass, in which case `_cachedAo` /
        // `_cachedGi` were re-derived against the new one and the `ao` / `gi` ARGUMENTS still
        // point at the discarded one. Locals, not parameter reassignment — the arguments stay
        // readable as "what the caller asked for".
        let aoNode = ao;
        let giNode = gi;
        if (this._ssgiActive) {
            if (!this._cachedAo || !this._cachedGi) {
                // The re-derive failed (`_ensureScenePassGBuffer` logs and clears `_ssgiActive`),
                // or SSGI was never derived. Compositing the arguments would sample a dead
                // render target. Phase 2 is the honest answer.
                console.warn(
                    '[RenderPipelineManager] §SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) — phase-3 pipeline '
                    + 'refused: SSGI is flagged active but has no live AO/GI nodes for the CURRENT scene '
                    + 'pass. Falling back to the phase-2 pipeline.',
                );
                await this._buildPipeline();
                return;
            }
            aoNode = this._cachedAo;
            giNode = this._cachedGi;
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
            scenePassColor.rgb.mul(aoNode),
            add(
                this._zonePass.rgb,
                scenePassDiffuse.rgb.mul(giNode),
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

        // §RECOVERY-MUST-REFUSE (ADR-0299) applied to OUR OWN recovery.
        //
        // A light's `LightShadow.map` (the ShadowDepthTexture) is owned by the LIGHT and
        // reallocated by THREE's shadow pass. It is NOT reachable from
        // `_rebuildPipeline()` and NOT replaceable by it. On the founder's P0
        // (167 elements / 145 walls / 4 levels / 445 meshes) we burned a full
        // reconstruction on exactly this and failed anyway — honest, but wasteful: the
        // user paid a multi-second rebuild before being told.
        //
        // A repair that cannot perform what its name promises must decline. The real
        // fix for this fault is upstream — release the shadow depth target at the FRAME
        // BOUNDARY (§GPU-RESOURCE-LIFETIME L2, ShadowQualityUpgrader._deferReleaseShadowMap)
        // rather than on a `setTimeout(0)` guess. If it still reaches here, the pipeline
        // is the wrong owner and pretending otherwise only costs time.
        if (isShadowResourceError(message)) {
            console.error(
                '[RenderPipelineManager] §RECOVERY-MUST-REFUSE a SHADOW depth resource was destroyed ' +
                `while still referenced by an in-flight submit (via ${source}: "${message.slice(0, 160)}"). ` +
                'REFUSING the pipeline reconstruction: a light-owned shadow map is not reachable from ' +
                '_rebuildPipeline(), so that repair cannot fix this and would only cost a multi-second ' +
                'rebuild before failing anyway. Failing loudly now. Root cause is a shadow-map realloc ' +
                'not ordered against submission — see §GPU-RESOURCE-LIFETIME L2.',
            );
            // §RECOVERY-MUST-REFUSE-NO-FLOOD — stop submitting frames we KNOW will
            // fail validation. Without this latch the render loop kept submitting
            // against the destroyed ShadowDepthTexture every frame, producing an
            // endless uncapturederror flood behind the crash dialog (half of the
            // founder's refuse/recover livelock). The last good frame stays on
            // screen under the dialog; recoverFromRenderFailure() clears the latch
            // when it drives its rebuild.
            this._hasPipelineError = true;

            // ── §L-966-BOUNDED-AUTO-RECOVERY ────────────────────────────────────
            // The refusal above is UNCHANGED and stays exactly as loud: a blind
            // `_rebuildPipeline()` provably cannot reach a light-owned shadow map.
            // What was missing is what came NEXT — nothing. The path fell straight
            // to `phase='error'` and the viewport stayed dead, while the repair that
            // CAN reach a light-owned map (`recoverFromRenderFailure()`: re-own the
            // maps, reset the compiled node states, THEN rebuild) sat behind a human
            // click. Refusing one repair is not a reason to attempt none — this is
            // the refusing half finally getting its escape hatch, bounded so it
            // cannot become the L-663 spin.
            if (this._attemptAutoRecovery('shadow-resource destroyed mid-submit', source)) return;

            this._failLoudly(
                `The 3D viewport could not recover: a shadow depth texture ` +
                `(ShadowDepthTexture) was released while the GPU was still drawing with it, ` +
                `and ${MAX_AUTO_RECOVERY_ATTEMPTS} automatic repair attempts did not fix it. ` +
                `Original GPU report (via ${source}): "${message.slice(0, 160)}"`,
            );
            return;
        }

        if (this._gpuResourceResetAttempted) {
            console.error(
                '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME destroyed/dangling GPU resource ' +
                `RECURRED after a full reconstruction (via ${source}: "${message.slice(0, 160)}") — this is ` +
                'an unrecoverable resource-lifetime defect, not a transient. Failing loudly ' +
                '(phase=error) so the user is told, rather than leaving a blocked scene behind a ' +
                'silent retry or a blank viewport behind no error at all.',
            );
            // §RECOVERY-MUST-REFUSE-NO-FLOOD — same latch as the shadow refusal above:
            // once we have declared the fault unrecoverable, keep the render loop from
            // re-submitting provably-failing frames behind the crash dialog.
            this._hasPipelineError = true;

            // §L-966-BOUNDED-AUTO-RECOVERY — the ONE reconstruction this branch is
            // reporting the failure of was `_rebuildPipeline()`, which reaches the
            // POST-FX graph and nothing else. `recoverFromRenderFailure()` is a
            // strictly larger repair (light-owned shadow maps + the compiled
            // node-builder/render-object/pipeline/binding caches), so "the small one
            // failed" is not evidence that the large one will. Attempt it, within the
            // same bound.
            if (this._attemptAutoRecovery('destroyed GPU resource recurred', source)) return;

            this._failLoudly(
                `The 3D viewport could not recover: a GPU resource was released while the ` +
                `renderer was still using it, and it recurred after a full reconstruction plus ` +
                `${MAX_AUTO_RECOVERY_ATTEMPTS} automatic repair attempts. ` +
                `Original GPU report (via ${source}): "${message.slice(0, 160)}"`,
            );
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
            this._failLoudly(
                `The 3D viewport could not recover: rebuilding the render pipeline after a ` +
                `GPU resource fault threw. ` +
                `Rebuild error: "${(resetErr instanceof Error ? resetErr.message : String(resetErr)).slice(0, 160)}". ` +
                `Original GPU report (via ${source}): "${message.slice(0, 160)}"`,
            );
        }
    }

    /**
     * §L-966-BOUNDED-AUTO-RECOVERY — attempt the repair that a pipeline rebuild
     * cannot do, at most {@link MAX_AUTO_RECOVERY_ATTEMPTS} times per GPU device.
     *
     * This is the automatic half of the lever that previously existed only behind
     * the crash card's "Reload viewport" button. Two things make it safe to call
     * without a human in the loop, and BOTH are load-bearing:
     *
     *   1. The budget is bounded and is NOT reset by recovery itself, nor by any
     *      lifecycle event (L-663). Without that, a recovery that fails re-enters
     *      here on the next frame's fault report forever — an infinite recovery
     *      loop is worse than a dead viewport, because a dead viewport at least
     *      stops touching the GPU.
     *   2. `recoverFromRenderFailure()` closes the submit gate for the whole
     *      teardown/rebuild window (§L930-DETACH-BEFORE-FREE), so an automatic
     *      call cannot widen the use-after-free window it is repairing.
     *
     * @returns true when a recovery was actually driven, so the caller must return
     *          rather than escalating; false when the budget is spent (or there is
     *          nothing to rebuild), so the caller must fail loudly and tell the user.
     */
    private _attemptAutoRecovery(faultDescription: string, source: string): boolean {
        if (this._autoRecoveryAttempts >= MAX_AUTO_RECOVERY_ATTEMPTS) {
            console.error(
                `[RenderPipelineManager] §L-966-BOUNDED-AUTO-RECOVERY budget EXHAUSTED ` +
                `(${this._autoRecoveryAttempts}/${MAX_AUTO_RECOVERY_ATTEMPTS}) for "${faultDescription}" ` +
                `via ${source}. Not attempting a ${this._autoRecoveryAttempts + 1}th recovery: an ` +
                'unbounded recover→same-fault→recover cycle pins the GPU and is strictly worse than ' +
                'stopping. Failing loudly with the real error so the user is TOLD what died.',
            );
            return false;
        }

        this._autoRecoveryAttempts++;
        console.warn(
            `[RenderPipelineManager] §L-966-BOUNDED-AUTO-RECOVERY attempting automatic recovery ` +
            `${this._autoRecoveryAttempts}/${MAX_AUTO_RECOVERY_ATTEMPTS} for "${faultDescription}" ` +
            `via ${source} — re-owning light shadow maps + resetting compiled node states before ` +
            'the rebuild (the repair a bare _rebuildPipeline() cannot perform).',
        );

        // `auto: true` — do NOT clear `_gpuResourceResetAttempted`. That latch is
        // the ONE-full-reconstruction budget; the manual button may reopen it
        // because a human has decided to spend the time, but an automatic path that
        // reopened it would compound two budgets into an effectively unbounded one.
        const driven = this._driveRecoveryRebuild(true);
        if (!driven) {
            console.error(
                '[RenderPipelineManager] §L-966-BOUNDED-AUTO-RECOVERY nothing to rebuild ' +
                '(no active WebGPU pipeline) — recovery is not possible for this backend state.',
            );
        }
        return driven;
    }

    /**
     * §L-966 — enter the terminal error state with the REAL cause attached.
     *
     * Every `phase='error'` escalation on the resource-lifetime path routes through
     * here so that `PipelineStatus.lastError` is never empty when the crash guard
     * reads it. The message is written for the USER: what died, that we tried, how
     * many times, and the raw GPU report so a founder can paste it into a bug.
     * A refusal that explains itself is a correct answer; a blank canvas is not.
     */
    /**
     * §L-966-SECOND-MINTING-SITE (L-1003) — enter `phase='error'` with the REAL cause
     * attached, WITHOUT touching `_hasPipelineError`.
     *
     * L-966 fixed the fabricated *"Render pipeline retries exhausted — phase=error"*
     * by routing the resource-lifetime escalation through {@link _failLoudly} and
     * making `initScene` pass `status.lastError`. It reached ONE of the seven paths
     * that set `phase='error'`. The other SIX set the phase and emitted with
     * `_lastError` still null, so `_emitState()` published `lastError: null`,
     * `initScene.ts:3070` passed `undefined`, and
     * `ViewportCrashGuard.handlePipelineError()`'s DEFAULT ARGUMENT minted the same
     * fabricated string all over again — including on the manual "Reload viewport"
     * path, because {@link _driveRecoveryRebuild} clears `_lastError` on the way in
     * and the rebuild's own `.catch` never set a new one. That is the founder's
     * L-981 sighting, and it is NOT a stale bundle: the `§L-966-BOUNDED-AUTO-RECOVERY`
     * lines in the same console were introduced by the L-966 commit itself (551e7131),
     * so the deployed build POSTDATES the fix.
     *
     * Separate from {@link _failLoudly} on purpose: that one also latches
     * `_hasPipelineError = true` to stop the render loop re-submitting provably
     * failing frames, which is right for a destroyed-GPU-resource fault and WRONG as
     * a blanket change to six unrelated build/rebuild failures. This helper changes
     * only what the user is TOLD. Zero behavioural delta beyond the message.
     *
     * `_diagnose()` in the crash guard keys on the error SIGNATURE to decide whether
     * to say "this is a PRYZM defect" or blame the user's driver — so an escalation
     * that arrives with no identity does not merely under-inform, it MISATTRIBUTES.
     */
    private _failWithCause(userFacingMessage: string, cause?: unknown): void {
        const detail = cause instanceof Error ? cause.message : cause != null ? String(cause) : '';
        this._lastError = new Error(
            detail ? `${userFacingMessage} (${detail.slice(0, 200)})` : userFacingMessage,
        );
        this._phase = 'error';
        this._emitState();
    }

    private _failLoudly(userFacingMessage: string): void {
        this._hasPipelineError = true;
        this._lastError        = new Error(userFacingMessage);
        this._phase            = 'error';
        this._emitState();
    }

    /**
     * §L-966 — restore the automatic-recovery budget, and ONLY for the one event
     * that makes a spent budget genuinely stale: a brand-new GPU device.
     *
     * `recoverPipeline()` binds a freshly-recreated renderer after device loss.
     * That device has new attribute / render-object bookkeeping and new light-owned
     * resources, so faults on the OLD device say nothing about this one — exactly
     * the reasoning `_gpuResourceResetAttempted` already carries, applied to the
     * same boundary. Device-loss, first-load and project-switch are three different
     * failure classes and only the first of them is a new device; giving all three
     * a fresh budget is how L-663 was built.
     */
    private _resetAutoRecoveryBudgetForNewDevice(): void {
        if (this._autoRecoveryAttempts === 0) return;
        console.log(
            `[RenderPipelineManager] §L-966-BOUNDED-AUTO-RECOVERY new GPU device bound — ` +
            `resetting the spent recovery budget (${this._autoRecoveryAttempts}/${MAX_AUTO_RECOVERY_ATTEMPTS}). ` +
            'Faults on the previous device do not bound this one.',
        );
        this._autoRecoveryAttempts = 0;
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
        // §L-966 — the MANUAL lever. Deliberately NOT bounded by
        // MAX_AUTO_RECOVERY_ATTEMPTS: that budget exists to stop an UNATTENDED spin,
        // never to disable the user's own retry. A human clicking "Reload viewport"
        // has decided to spend the time, and if this returns false the crash guard
        // falls back to a hard reload — so the user always has a way forward.
        return this._driveRecoveryRebuild(false);
    }

    /**
     * §L-966 — the shared body of {@link recoverFromRenderFailure}, used by both
     * the manual lever and the bounded automatic path.
     *
     * @param auto true when driven by `_attemptAutoRecovery`. The ONLY difference is
     *   that the automatic path does NOT reopen `_gpuResourceResetAttempted` (the
     *   one-full-reconstruction budget): reopening it automatically would compound
     *   two independent budgets into an unbounded one, which is the exact L-663
     *   shape this work exists to remove. A human may reopen it; a loop may not.
     */
    private _driveRecoveryRebuild(auto: boolean): boolean {
        if (!this._webGpuActive) return false;
        console.log(
            '[RenderPipelineManager] §GPU-RESOURCE-LIFETIME recoverFromRenderFailure ' +
            `(${auto ? 'AUTOMATIC, bounded' : 'manual'}) — ` +
            'reconciling size and rebuilding the render pipeline (NOT onProjectSwitch, which ' +
            'defers the rebuild and would leave the viewport dark).',
        );
        if (!auto) this._gpuResourceResetAttempted = false;
        this._destroyedResourceReports     = 0;
        this._destroyedResourceWindowStart = 0;
        this._retryCount                   = 0;
        // The viewport is being given another chance — drop the stale cause so a
        // LATER, unrelated failure cannot be reported with this one's message.
        this._lastError                    = null;

        // ── §L-10012-RETRY-MUST-CHANGE-SOMETHING ─────────────────────────────
        //
        // ⛔ A RETRY THAT REPEATS THE PREVIOUS ATTEMPT BYTE-FOR-BYTE IS LATENCY, NOT
        // MITIGATION. This method already states that principle for the shadow class
        // (§RECOVERY-MUST-REFUSE: *"a retry that cannot repair the fault class is a
        // defect, not a mitigation"*) — and then, for the TSL class, did exactly the
        // thing it forbids. The founder's 2026-08-23 console is the proof: a
        // `THREE.TSL: Invalid generated code, expected a "float"` seeded a GPU fault,
        // the ladder rebuilt the pipeline N times against the SAME material graph, and
        // every rebuild re-compiled the same invalid node. The user paid N multi-second
        // rebuilds for an outcome that was determined before the first one started.
        //
        // ⭐ SO REMOVE THE SEED BEFORE REBUILDING, and let the count say whether this
        // attempt differs from the last. Neutralizing transmission is the one repair
        // that changes what the next compile will emit; it is idempotent, so on the
        // second pass it reports 0 and the log says plainly that this attempt is
        // identical to the previous one rather than implying progress.
        //
        // ⚠ The bound (MAX_AUTO_RECOVERY_ATTEMPTS) is deliberately NOT changed here.
        // It is pinned by `RenderPipelineManager.autoRecoveryBound.test.ts` and
        // `recoveryLoopUnbounded.test.ts` and it is the L-663 spin guard; making the
        // attempts MEANINGFUL is this change's job, re-tuning how many there are is not.
        const _txNeutralized = this._neutralizeTransmissionForWebGPU();
        console.log(
            `[RenderPipelineManager] §L-10012-RETRY-MUST-CHANGE-SOMETHING pre-rebuild ` +
            `transmission sweep neutralized ${_txNeutralized} material(s). ` +
            (_txNeutralized > 0
                ? 'This attempt therefore differs from the previous one: the TSL transmission ' +
                  'node that seeded the fault will not be emitted by the next compile.'
                : 'NOTHING CHANGED — if the fault recurs it will recur identically, and the ' +
                  'cause is NOT the transmission node graph. Read the original GPU report, ' +
                  'not this ladder.'),
        );

        // ── §L930-DETACH-BEFORE-FREE (founder L-930) — the ORDER below is the fix ──
        //
        // MEASURED, from the founder's own console, in the order it printed:
        //   2  recoverFromRenderFailure          ← this method
        //   3  signalled 1 shadow-casting light  ← the ShadowDepthTexture is FREED here
        //   4  compiled node states reset (4/4)
        //   5  old pipeline dispose error: undefined 'usedTimes'   ← teardown ABORTS
        //   6  Phase: phase4                     ← the rebuild SUCCEEDED
        //   7  §RECOVERY-MUST-REFUSE  destroyed ShadowDepthTexture in a submit → phase=error
        //
        // Two ordering breaches produced 5 and 7, and BOTH are visible in that
        // sequence:
        //
        //  (a) THE SUBMIT GATE WAS OPEN WHILE THE TEXTURE WAS FREED. Step 3 frees a
        //      light-owned GPU texture on an arbitrary tick (the crash guard's), and
        //      `_rebuildPipeline()` then clears `_hasPipelineError` synchronously
        //      while `_renderPipeline` still points at the OLD pipeline — whose bind
        //      groups sample exactly that texture. Every rAF tick in the rebuild
        //      window therefore encoded and submitted against the corpse: two render
        //      contexts (shadow depth pass + main pass) × two frames before the
        //      NO-FLOOD latch caught up = the founder's ×4, renderContext_1 and
        //      renderContext_4, twice each. ADR-0297 INVARIANT L2: DETACH now,
        //      RELEASE at the boundary — the release was ordered against NOTHING.
        //
        //  (b) THE OLD PIPELINE WAS TORN DOWN AFTER ITS NODE CACHES WERE WIPED.
        //      `_resetCompiledNodeStates()` (step 4) empties the NodeManager DataMap;
        //      `_buildPipeline()`'s `_safeDisposeRenderPipeline()` runs LATER and fans
        //      out to `NodeManager.delete(renderObject)`, which reads
        //      `this.get(renderObject).nodeBuilderState` — `undefined` on a wiped map
        //      → step 5. It is logged non-fatal and it is not harmless: the teardown
        //      ABORTS half-done, leaving precisely the stale render-object / bind-group
        //      records that then submit the dead texture. Two lifetime defects in one
        //      path were never two coincidences — they are one inverted order.
        //
        // So: CLOSE THE GATE, TEAR DOWN, then free. Nothing below weakens
        // §RECOVERY-MUST-REFUSE — the refusal is correct and stays exactly as loud;
        // the point is that it should no longer be REACHED, because the recovery no
        // longer frees a resource the next submits still reference.

        // 1. Close the submit gate BEFORE anything is freed. Held across the whole
        //    recovery (the inner guard `_rebuildPipeline()` takes nests via
        //    §L930-SUBMIT-PAUSE-DEPTH), so no frame is encoded between the free and
        //    the new pipeline's install.
        this._beginShadowRebuildGuard();

        // 2. Tear the OLD pipeline down while its node caches are still INTACT —
        //    the only order in which `NodeManager.delete()` can complete — and null
        //    it, so `render()`'s gate is shut on the resource identity too, not only
        //    on the pause flag. `_buildPipeline()`'s own `_safeDisposeRenderPipeline()`
        //    becomes a no-op (it early-returns on a null pipeline), so this is a
        //    REORDER, not a second teardown.
        this._safeDisposeRenderPipeline();
        this._renderPipeline = null;

        // §RECOVERY-MUST-REFUSE (ADR-0299) companion — do the ONE thing a pipeline
        // rebuild cannot: force every shadow-casting light to RE-OWN a fresh shadow
        // map. A shadow-class destroyed-resource fault ("Destroyed texture
        // [ShadowDepthTexture] used in a submit") lives in the light's WebGPU
        // ShadowNode, which is unreachable from _rebuildPipeline() — so before this
        // call the guard's retry rebuilt the post-FX graph, hit the SAME destroyed
        // light-owned texture on the next submit, refused again, and looped forever
        // (the founder's refuse/recover livelock). Recreating the light-owned maps
        // first, then rebuilding, repairs the whole fault class this lever is asked
        // to recover from. Harmless for non-shadow faults: the fresh maps simply
        // regenerate on the next shadow pass.
        this._recreateLightOwnedShadowMaps();
        // §L-819 — the re-own signal above is NECESSARY but was NOT SUFFICIENT, and
        // the gap is why the production recovery livelocked. Three r183's LightsNode
        // REUSES AnalyticLightNode instances by light.id (LightsNode.js:216) and
        // NodeManager caches nodeBuilderStates by the render object's initialCacheKey
        // (NodeManager.js:171-247) — neither is invalidated by a pipeline rebuild. So
        // after the 'dispose' dispatch, the compiled material node states still
        // embedded the now-disposed ShadowNode: its updateBefore registration kept
        // firing ("Cannot read properties of null (reading 'depthTexture')" in
        // updateShadow — node.shadowMap was nulled by _reset()) and its sampler
        // still referenced the destroyed ShadowDepthTexture (renderContext_6/7
        // recurrence). A fresh ShadowNode is only minted at the next NODE BUILD
        // (AnalyticLightNode.setup → shadowNode === null → setupShadowNode), which
        // never came. Reset the compiled node states so the first post-recovery
        // render rebuilds the graph — fresh ShadowNode, fresh target, no stale
        // updateBefore, no stale bindings.
        this._resetCompiledNodeStates();
        try {
            this._reconcileRenderSize();
        } catch { /* size reconcile is best-effort; the rebuild is the load-bearing part */ }
        // §L930-DETACH-BEFORE-FREE — release the OUTER pause only once the rebuild
        // has settled and installed a pipeline whose bind groups sample the FRESH
        // shadow map. `_rebuildPipeline()` takes (and releases) its own nested
        // guard; the depth counter means submits resume exactly once, here.
        // §L-966 — flag the in-flight window so the health badge says "recovering"
        // instead of "ok" while the viewport is frozen mid-reconstruction, and emit
        // NOW so the badge updates at the start of the window, not the end.
        this._recoveringInFlight = true;
        this._emitState();
        void this._rebuildPipeline().finally(() => {
            this._endShadowRebuildGuard();
            this._recoveringInFlight = false;
            this._emitState();
        });
        return true;
    }

    /**
     * §L-819 — drop every compiled node-builder state, render-object record,
     * pipeline and bind-group record on the CURRENT renderer, so the next render
     * recompiles the full node graph from live scene state.
     *
     * This is the render-side "reconstruction boundary" reset applied to crash
     * recovery: mirrors the exact subset (and ORDER) of three r183's own
     * `Renderer.dispose()` teardown — `_objects → _pipelines → _nodes → _bindings`
     * (Renderer.js:2361-2376) — without touching the backend, the textures or the
     * render contexts, all of which remain valid. Every cleared cache is rebuilt
     * on demand by `RenderObjects.get` / `NodeManager.getForRender` /
     * `Pipelines.updateForRender`, so the cost is one full shader recompile on
     * the first post-recovery frame — acceptable at a crash boundary, and the
     * only lever that reaches a cached nodeBuilderState (a pipeline rebuild does
     * not: the cache is keyed by initialCacheKey, which the rebuild leaves
     * unchanged).
     *
     * Structural access into three internals is confined to this package (P2 —
     * renderer-three is the sole THREE owner). Never throws; a partial reset is
     * still strictly better than none, and the §I2 `usedTimes` family is
     * swallowed like every other dispose path here.
     */
    private _resetCompiledNodeStates(): void {
        const r = this._renderer as unknown as {
            _objects?:   { dispose?: () => void };
            _pipelines?: { dispose?: () => void };
            _nodes?:     { dispose?: () => void };
            _bindings?:  { dispose?: () => void };
        } | null;
        if (!r) return;
        let resetCount = 0;
        // three's own teardown order (Renderer.dispose, r183).
        for (const key of ['_objects', '_pipelines', '_nodes', '_bindings'] as const) {
            try {
                const sub = r[key];
                if (sub && typeof sub.dispose === 'function') {
                    sub.dispose();
                    resetCount++;
                }
            } catch (err: unknown) {
                if (!isUsedTimesDisposeError(err)) {
                    console.warn(
                        `[RenderPipelineManager] §L-819 compiled-node-state reset: ${key}.dispose() failed (non-fatal):`,
                        err instanceof Error ? err.message : err,
                    );
                }
            }
        }
        if (resetCount > 0) {
            console.log(
                `[RenderPipelineManager] §L-819 compiled node states reset (${resetCount}/4 caches) — ` +
                'the next render rebuilds the node graph, minting fresh light-owned shadow maps ' +
                'with no stale ShadowNode updateBefore registrations or destroyed-texture bindings.',
            );
        }
    }

    /**
     * §RECOVERY-MUST-REFUSE companion — make every shadow-casting light drop and
     * re-own its shadow map.
     *
     * Mechanism: three r183's `AnalyticLightNode` subscribes to its light's
     * `'dispose'` event (AnalyticLightNode.js:107) and responds by disposing its
     * `ShadowNode` — which disposes the node-owned shadow render target
     * (`ShadowNode._reset()`) and nulls the node's reference. Dispatching the
     * event (WITHOUT calling `light.dispose()`, which would also tear down the
     * light itself) is therefore the one sanctioned signal that reaches the
     * light-owned GPU resource from outside the renderer.
     *
     * ⚠ §L-819 — a pipeline rebuild alone does NOT recreate the lighting node
     * graph (this method's original comment claimed it did, and that false claim
     * was the recovery livelock): LightsNode reuses AnalyticLightNode by light.id
     * and NodeManager serves cached nodeBuilderStates, so the disposed ShadowNode
     * stayed live in the compiled graph. The caller MUST follow this sweep with
     * {@link _resetCompiledNodeStates} — only a node-state rebuild mints the
     * fresh ShadowNode + ShadowDepthTexture (AnalyticLightNode.setup →
     * setupShadowNode, at the light's current `mapSize`).
     *
     * ⚠ §L930-DETACH-BEFORE-FREE — this docblock used to assert "at that point the
     * previous frame's submits have completed, so the dispose is ordered against
     * submission". THAT WAS FALSE, and it is the founder's L-930 crash: nothing in
     * the recovery path ordered anything against submission. `_rebuildPipeline()`
     * cleared `_hasPipelineError` synchronously while `_renderPipeline` still held
     * the OLD pipeline, so the rAF kept submitting against the texture this method
     * had just freed. The claim is TRUE only because the CALLER now closes the
     * submit gate first (`_beginShadowRebuildGuard()` + a nulled `_renderPipeline`)
     * and reopens it only after the rebuild installs bind groups that sample the
     * FRESH map. The precondition is asserted below rather than assumed.
     *
     * PRECONDITION: submits paused and no pipeline installed. Never throws.
     *
     * @returns the number of lights signalled.
     */
    private _recreateLightOwnedShadowMaps(): number {
        // §L930-DETACH-BEFORE-FREE — an unordered free is the whole defect, so say
        // so at the moment it would happen rather than 4 frames later as a
        // "Destroyed texture … used in a submit" the reader must trace backwards.
        // §PAUSE-FLAG-IS-NOT-THE-SUBMIT-GATE (L-13282) — ask whether the gate is ACTUALLY
        // holding, not whether the flag is set. Past §SUBMIT-PAUSE-IS-BOUNDED's ceiling the
        // flag stays `true` while frames submit, so the flag alone would suppress exactly
        // the warning this precondition exists to print — the one case where the free below
        // really is unordered against submission.
        if (!this._submitPauseIsHolding() || this._renderPipeline !== null) {
            console.warn(
                '[RenderPipelineManager] §L930-DETACH-BEFORE-FREE about to free light-owned shadow ' +
                `maps with the submit gate OPEN (pauseFlag=${this._shadowRebuildPaused}, ` +
                `pauseActuallyHolding=${this._submitPauseIsHolding()}, ` +
                `pipelineInstalled=${this._renderPipeline !== null}). The next submitted frame will ` +
                'reference a destroyed ShadowDepthTexture — call _beginShadowRebuildGuard() and null ' +
                '_renderPipeline BEFORE this sweep (ADR-0297 INVARIANT L2).',
            );
        }
        let count = 0;
        try {
            this._scene?.traverse((obj) => {
                const light = obj as unknown as {
                    isLight?: boolean;
                    castShadow?: boolean;
                    shadow?: unknown;
                    dispatchEvent?: (ev: { type: string }) => void;
                };
                if (light.isLight && light.castShadow && light.shadow) {
                    try {
                        light.dispatchEvent?.({ type: 'dispose' } as never);
                        // §L-819 — ShadowNode._reset() (reached via AnalyticLightNode's
                        // 'dispose' listener) nulls only the NODE's reference
                        // (`node.shadowMap`); `LightShadow.map` keeps pointing at the
                        // now-DISPOSED render target. Null it so no external reader
                        // (the realloc drain, diagnostics, the WebGL path) can touch
                        // the corpse — the rebuilt node graph assigns a fresh target
                        // to both slots at its next setup (ShadowNode.js:563-564).
                        (light.shadow as { map?: unknown }).map = null;
                        count++;
                    } catch { /* one bad light must not abort the recovery sweep */ }
                }
            });
        } catch { /* traverse is best-effort — recovery proceeds to the rebuild */ }
        if (count > 0) {
            console.log(
                `[RenderPipelineManager] §RECOVERY-MUST-REFUSE companion — signalled ${count} ` +
                'shadow-casting light(s) to re-own fresh shadow maps before the pipeline rebuild ' +
                '(a light-owned ShadowDepthTexture is unreachable from the rebuild itself).',
            );
        }
        return count;
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

        // ── §L930-REBUILD-WINDOW-IS-A-SUBMIT-WINDOW (founder L-930) ──────────
        // The line below clears `_hasPipelineError` SYNCHRONOUSLY, but the new
        // pipeline is installed only at the very END of the async build
        // (`_buildPipeline` :2448-2452). Between those two instants `render()`'s
        // gate — `if (!this._renderPipeline || this._hasPipelineError) return` —
        // is OPEN and `_renderPipeline` still points at the OLD pipeline, so the
        // single rAF keeps encoding and submitting frames against whatever the
        // caller freed on its way in. That is precisely the window in which the
        // founder's recovery destroyed a light-owned ShadowDepthTexture: two
        // render contexts × two frames = the "Destroyed texture … used in a
        // submit (renderContext_1 / renderContext_4)" ×4.
        //
        // `scheduleShadowRebuild()` has closed this window since L-231 — with the
        // very same guard, and with a comment that says the same thing ("the old
        // normal path left `_hasPipelineError=false` and kept submitting frames
        // for the whole ~6 s rebuild, so the dispose/realloc landed mid-submit").
        // It was applied to ONE of the five callers of this method. Hoisting it
        // here covers all of them (retry ladder, classified reconstruction,
        // recoverFromRenderFailure, projection/view toggles) and nests correctly
        // with `scheduleShadowRebuild`'s outer guard via §L930-SUBMIT-PAUSE-DEPTH.
        // C04 §SHADOW rule 7 — never dispose or rebuild the render pipeline
        // off-frame. ADR-0297 INVARIANT L2 — RELEASE at the boundary.
        this._beginShadowRebuildGuard();
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
            // §L-966-SECOND-MINTING-SITE (L-1003) — THE founder's L-981 path. This
            // `.catch` is where the manual "Reload viewport" recovery lands when its
            // rebuild throws, and _driveRecoveryRebuild() has just cleared `_lastError`
            // on the way in — so before this line the escalation arrived with NO cause
            // and the crash guard minted "Render pipeline retries exhausted", naming a
            // retry ladder that had not run.
            this._failWithCause(
                'The 3D viewport could not recover: rebuilding the render pipeline failed.',
                err,
            );
        }).finally(() => {
            // §L930-REBUILD-WINDOW-IS-A-SUBMIT-WINDOW — resume submits ONLY once
            // the new pipeline is installed. `finally` (never `then`) so an early
            // return inside `_buildPipeline` (TSL not loaded), a shader-compile
            // downgrade, or a hard failure can never strand the viewport paused.
            this._endShadowRebuildGuard();
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
        this._ssgiParams     = undefined; // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510)
        this._disposeOutlineInstances();
        this._retryCount     = 0;
        this._hasPipelineError = false;

        // Build the minimal phase-2 pipeline. If even THIS throws a shader-compile
        // error the device is genuinely unusable for TSL → surface phase='error'.
        // §L930-REBUILD-WINDOW-IS-A-SUBMIT-WINDOW — this is the sixth async build
        // path and it reaches `_buildPipeline()` directly, bypassing the guard
        // `_rebuildPipeline()` now takes. Guard it here so the downgrade's own
        // dispose/install window is not a submit window either.
        this._beginShadowRebuildGuard();
        this._buildPipeline()
            .then(() => {
                console.log(
                    '[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE lightweight phase-2 pipeline active ' +
                    '— viewport rendering plain (post-FX disabled). Call tryUpgradePostFx() to re-attempt the full pipeline.',
                );
            })
            .catch((err: unknown) => {
                console.error('[RenderPipelineManager] §RPM-RECOVERY-DOWNGRADE lightweight rebuild ALSO failed — unrecoverable:', err);
                // §L-966-SECOND-MINTING-SITE (L-1003) — carry the cause.
                this._failWithCause(
                    'The 3D viewport could not recover: even the reduced-quality fallback ' +
                    'pipeline failed to build.',
                    err,
                );
            })
            .finally(() => { this._endShadowRebuildGuard(); });
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
        // §L-966 — same boundary, same reasoning: a NEW device is a different
        // failure class from the one whose budget was spent. This is the only
        // sanctioned reset of the automatic-recovery bound.
        this._resetAutoRecoveryBudgetForNewDevice();

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
        // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) + §SCENEPASS-IDENTITY-CHOKEPOINT (L-1511) —
        // record the layout as BUILT, and drop the AO/GI nodes bound to the pass being replaced.
        const needsGBuffer = this._ssgiActive || this._traaActive;
        this._setScenePass(createScenePass(this._scene, this._camera, needsGBuffer), needsGBuffer);
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
            // §FIX-WEBGPU-MRT-LAZY-ATTACHMENT (L-1510) — re-derive with the params the user
            // activated with, not DEFAULT_SSGI_PARAMS.
            const { ao, gi } = await createSSGIPass(this._scenePass, this._camera, this._ssgiParams);
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