/**
 * buildingGenerationLifecycle.ts — ONE lifecycle hook for a whole building generation.
 *
 * A "building generation" is a KNOWN-heavy, multi-sub-batch operation: the residential /
 * office / house generators each build a main structural batch and then a long tail of
 * deferred sub-batches (per-level ceilings, floor finishes, furnish, lighting, openings,
 * …). This module gives every such generator ONE call to make at its true START, which
 * owns two cross-cutting concerns that must both bracket the WHOLE generation:
 *
 *   FIX A — §AUTO-WEBGL-HEAVY-PROACTIVE (ADR-0267 / L-367). Swap WebGPU→WebGL up front,
 *     BEFORE the first heavy sub-batch renders on WebGPU, so the generation never trips
 *     the heavy-scene device-loss (TSL invalid-float flash + PSO-compile stall) the
 *     founder saw when the reactive per-scene swap only fired mid-generation.
 *
 *   FIX B — §GEN-CONTINUOUS-OVERLAY (L-367). Hold ONE continuous loading overlay across
 *     the whole generation. The batch lifecycle ({@link initBatchLifecycle}) opens a
 *     `LoadingOverlayController` session per sub-batch and ENDS it on each drain; between
 *     sub-batches the overlay's ref-count hit zero and the frosted overlay flickered
 *     (Preparing→Done→Preparing→Done, once per sub-batch). We open ONE OUTER overlay
 *     session for the generation, so the ref-count never reaches zero between sub-batches
 *     and the overlay stays up continuously — the per-sub-batch sessions still layer on
 *     top and drive the live title/progress; the outer session just keeps it visible.
 *
 * The overlay is released at the TRUE end of the generation. Two release paths, both
 * always armed so the overlay can NEVER get stuck:
 *   1. Batch-idle SETTLE — mirrors the SaveOrchestrator §AUTOSAVE-BATCH-SUPPRESS pattern:
 *      the generation's sub-batches all fire `pryzm-batch-started` / `pryzm-batch-ended`
 *      (from initBatchLifecycle). Once the batch depth drains to zero AND stays zero for
 *      {@link HOLD_MS}, the generation is quiescent → release. Any new sub-batch cancels
 *      the pending release, so a brief inter-sub-batch gap never releases early.
 *   2. Explicit {@link endBuildingGeneration} — callers with a precise async terminus
 *      (the house post-gen chain's `finally`) release immediately; tighter than the
 *      settle, and the natural "finally" safety.
 * A hard {@link MAX_MS} cap force-releases regardless, so a stalled / never-settling
 * generation can never leave the overlay up forever. An initial {@link INITIAL_GRACE_MS}
 * covers the window between the hook firing and the first sub-batch starting.
 *
 * Contract compliance: C01 §2 — pure UI orchestration (no store writes, no THREE). P3 —
 * no rAF (only DOM batch events + setTimeout). The proactive swap keeps its own P2/P4/P8
 * compliance inside {@link proactivelySwitchToWebGLForBuildingGeneration}.
 */

import { getLoadingOverlay, type LoadingSession } from '@app/ui/overlays/LoadingOverlayController';
import { proactivelySwitchToWebGLForBuildingGeneration } from '@app/rendering/autoWebGLHeavyScene';

/** Batch-idle quiet window before the continuous overlay releases. Must comfortably
 *  bridge the gap between one sub-batch draining and the next starting (per-level
 *  ceilings, furnish, lighting cascade). Sized like SaveOrchestrator's batch settle,
 *  widened for the finish-chain's inter-stage settles (`yieldBatchSettled`). */
const HOLD_MS = 6_000;
/** Grace for the window between the hook firing and the FIRST sub-batch starting (the
 *  generator's pure pre-build / level minting). If no sub-batch ever starts within it
 *  (e.g. the generation produced nothing), the overlay releases rather than hanging. */
const INITIAL_GRACE_MS = 20_000;
/** Hard cap — the overlay is force-released after this regardless of batch activity, so a
 *  stalled generation can never strand it. Generous: a 40-storey office finish-chain is
 *  minutes of legitimate work. */
const MAX_MS = 6 * 60_000;

/** The public handle a generator holds. `end()` releases the continuous overlay early
 *  (idempotent); the settle / cap paths release it otherwise. */
export interface BuildingGenerationHandle {
    /** Release the continuous overlay now (idempotent). Safe to call from a `finally`. */
    end(): void;
    /** True until released. */
    readonly active: boolean;
}

/** The single in-flight generation lease (generations do not nest in practice). */
let _current: GenerationOverlayLease | null = null;

class GenerationOverlayLease {
    private session: LoadingSession | null = null;
    private batchDepth = 0;
    private sawBatch = false;
    private released = false;
    private settleTimer: ReturnType<typeof setTimeout> | null = null;
    private capTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly onBatchStart: () => void;
    private readonly onBatchEnd: () => void;
    /** §GEN-SHADOW-SUPPRESS (L-372) — release handle for the whole-generation shadow-pass
     *  suppression pushed in the constructor; called in release(). Idempotent + exception-safe. */
    private shadowRelease: (() => void) | null = null;

    constructor(title: string, label: string) {
        // §GEN-LOG-GATING (L-369, 2026-07-17) — publish a process-wide "a building generation
        // is in flight" flag for the WHOLE generation (all sub-batches). Lower layers read it
        // via `globalThis.__pryzmBuildingGenActive` (no import — mirrors
        // `__pryzmProjectLoadActive`) to gate their hot per-element debug logs
        // (BimManager register/unregister, WallOccupancyStore canPlace, RoomFinishSyncService
        // sync/propagate, WallFragmentBuilder RAF_DRAIN) and to suppress the RoomTopologyObserver's
        // wasteful per-sub-batch auto-redetects. Cleared in release(), which then fires ONE
        // final redetect sweep.
        (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive = true;

        // §GEN-UNDO-COALESCE (L-376d / L-375d) — open the legacy CommandManager's generation undo
        // batch for the WHOLE generation. While open, every legacy `commandManager.execute(...)` a
        // generator runs (stairs, lifts, slabs, floors, roofs, rooms, room-bounding lines, handrails,
        // furniture…) SKIPS its per-command `createSnapshot()` (the batch is atomic like PROJECT_LOAD —
        // this kills the O(N·M) `structuredClone` tail the stair scope ["stair","opening","slab"] paid
        // as the slab store grew) and is ACCUMULATED into ONE composite undo entry flushed in release()
        // (C16 §8.6 — the whole generation becomes ONE undo unit; closes L-376f). Walls are already
        // coalesced to one `wall.batch.create` per level on the bus (L-131). Best-effort + optional-
        // chained: if the commandManager is not yet ready the generation just falls back to the
        // per-command snapshot + push (correct, only slower). The matching release lives in release().
        try {
            (window as unknown as { commandManager?: { beginGenerationBatch?(): void } })
                .commandManager?.beginGenerationBatch?.();
        } catch (e) {
            console.warn('[buildingGenerationLifecycle] could not open the generation undo batch (non-fatal):', e);
        }

        // §GEN-SHADOW-SUPPRESS (L-372) — suppress the shadow PASS for the WHOLE generation via
        // the single-owner ref-counted latch (RenderPipelineManager, the sole writer of
        // renderer.shadowMap.enabled — P2). This removes the per-frame shadow-MAP render from the
        // generation hot loop and defers the one shadow (re)compile until AFTER the scene settles.
        // It is the founder's "WebGPU still doing shades = slow" cost: on the heavy-scene Auto-WebGL
        // fallback the renderer is a WebGPURenderer(forceWebGL2) that STILL drives shadows through
        // its TSL shadow-node graph, so the map-render is real work every frame during generation.
        // Backend-agnostic (shadowMap.enabled exists on WebGPURenderer AND classic WebGLRenderer).
        // Composes with the batch-scoped 'batch' suppression but spans the ENTIRE lifecycle (incl.
        // the non-batched glass/PBR tail), so shadows re-enable ONCE at the end, not per sub-batch.
        // Exception-safe: the release handle is idempotent and is called in release() (which has a
        // hard-cap backstop), so it can never strand shadows OFF (the L-205 leak class).
        try {
            this.shadowRelease =
                (window.renderPipelineManager as unknown as
                    { pushShadowPassDisabled?(reason: string): () => void } | undefined
                )?.pushShadowPassDisabled?.('building-generation') ?? null;
        } catch (e) {
            console.warn('[buildingGenerationLifecycle] could not suppress shadows for generation (non-fatal):', e);
            this.shadowRelease = null;
        }

        // ONE outer session held for the whole generation. Opened FIRST, so the overlay's
        // ref-count never drops to zero as per-sub-batch sessions layer on top and end.
        try {
            this.session = getLoadingOverlay().begin('building-generation', { title, label });
        } catch (e) {
            console.warn('[buildingGenerationLifecycle] could not open the continuous overlay (non-fatal):', e);
            this.session = null;
        }

        this.onBatchStart = () => {
            this.sawBatch = true;
            this.batchDepth++;
            // A sub-batch is running → cancel any pending release (settle or initial grace).
            this.clearSettle();
        };
        this.onBatchEnd = () => {
            if (this.batchDepth > 0) this.batchDepth--;
            if (this.batchDepth > 0) return;
            // Every sub-batch has drained → arm the quiet-window release; a new sub-batch
            // within HOLD_MS cancels it, so back-to-back sub-batches stay under one overlay.
            this.armSettle(HOLD_MS);
        };
        window.addEventListener('pryzm-batch-started', this.onBatchStart);
        window.addEventListener('pryzm-batch-ended', this.onBatchEnd);

        // Initial grace: covers the pre-build window before the first sub-batch. If the
        // first sub-batch never comes, this releases (nothing to keep the overlay up for).
        this.armSettle(INITIAL_GRACE_MS);
        // Hard cap: the overlay can NEVER get stuck, even if the settle never fires.
        this.capTimer = setTimeout(() => {
            console.warn('[buildingGenerationLifecycle] §GEN-CONTINUOUS-OVERLAY — hard cap reached; force-releasing.');
            this.release();
        }, MAX_MS);
    }

    private armSettle(ms: number): void {
        this.clearSettle();
        this.settleTimer = setTimeout(() => {
            // Only release on settle once at least one sub-batch has actually run (so the
            // initial-grace timer, which also lands here, does not release mid-pre-build if
            // a slow generator has not opened its first batch yet — the cap is its backstop).
            if (!this.sawBatch && this.batchDepth === 0) {
                // Pre-build overran the initial grace but nothing is in flight → release; a
                // generation that produced no batch has nothing to keep the overlay up for.
                this.release();
                return;
            }
            if (this.batchDepth === 0) this.release();
        }, ms);
    }

    private clearSettle(): void {
        if (this.settleTimer !== null) {
            clearTimeout(this.settleTimer);
            this.settleTimer = null;
        }
    }

    get active(): boolean {
        return !this.released;
    }

    release(): void {
        if (this.released) return;
        this.released = true;
        this.clearSettle();
        if (this.capTimer !== null) { clearTimeout(this.capTimer); this.capTimer = null; }
        window.removeEventListener('pryzm-batch-started', this.onBatchStart);
        window.removeEventListener('pryzm-batch-ended', this.onBatchEnd);
        try { this.session?.end(); } catch { /* overlay teardown must never throw upward */ }
        this.session = null;
        if (_current === this) _current = null;

        // §GEN-SHADOW-SUPPRESS (L-372) — generation done: pop the whole-generation shadow-pass
        // suppression. The latch re-enables shadows ONLY if no other reason (batch/ifc) still
        // holds AND the user's preference allows — and asks for exactly ONE settled depth render.
        // Idempotent + exception-safe; never throws upward.
        try { this.shadowRelease?.(); } catch { /* shadow re-enable must never break teardown */ }
        this.shadowRelease = null;

        // §GEN-LOG-GATING / §GEN-SINGLE-REDETECT (L-369) — the generation is done: clear the
        // process-wide flag so live-edit logging + the RoomTopologyObserver auto-redetect
        // resume, then fire ONE final redetect sweep. Graph-authoritative levels (all the
        // executors mark theirs) are suppressed inside `scheduleRedetectAllLevels`, so on a
        // normal generation this is a no-op safety net; for any non-graph level it recovers the
        // single end-of-generation redetect that was suppressed during the run. Explicit
        // `ReDetectRoomsCommand`s the executors run (e.g. house pre-naming) bypass the observer
        // and are unaffected either way.
        (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive = false;

        // §GEN-UNDO-COALESCE (L-376d / L-375d) — generation done: close the CommandManager's
        // generation undo batch, flushing every accumulated legacy create into ONE composite undo
        // entry (opened in the constructor). Idempotent + exception-safe: a generation that ran no
        // legacy commands, or a commandManager that never opened the batch, flushes nothing.
        try {
            (window as unknown as { commandManager?: { endGenerationBatch?(): number } })
                .commandManager?.endGenerationBatch?.();
        } catch (e) {
            console.warn('[buildingGenerationLifecycle] could not close the generation undo batch (non-fatal):', e);
        }

        try {
            (window as unknown as { roomTopologyObserver?: { scheduleRedetectAllLevels?: () => void } })
                .roomTopologyObserver?.scheduleRedetectAllLevels?.();
        } catch (e) {
            console.warn('[buildingGenerationLifecycle] end-of-generation redetect sweep failed (non-fatal):', e);
        }
    }
}

/**
 * Call at the TRUE START of a building generation (residential / office / house), after
 * the cheap guards pass (active level, command manager) and BEFORE the first structural
 * sub-batch. Fires the proactive WebGL swap (FIX A) and opens the continuous overlay
 * (FIX B). Idempotent per generation: if one is already in flight, returns a handle onto
 * the existing lease (no second overlay / no second swap attempt).
 *
 * @param reason short tag for the swap log/span (e.g. `'resi-building'`, `'office-building'`, `'house'`).
 * @param opts.title outer-overlay headline (default "Generating your building").
 * @param opts.label outer-overlay phase line shown between sub-batches.
 */
export function beginBuildingGeneration(
    reason: string,
    opts?: { title?: string; label?: string },
): BuildingGenerationHandle {
    // SSR / non-DOM safety (tests, node): no overlay, no swap — a no-op handle.
    if (typeof window === 'undefined') {
        return { end: () => { /* no-op */ }, active: false };
    }

    // FIX A — proactive start-of-generation WebGL swap (once per session; all its own
    // gates apply, so a light/explicit-WebGL/non-WebGPU context is a no-op).
    try {
        proactivelySwitchToWebGLForBuildingGeneration(reason);
    } catch (e) {
        console.warn('[buildingGenerationLifecycle] proactive WebGL swap failed (non-fatal):', e);
    }

    // FIX B — one continuous overlay. Reuse the in-flight lease if a generation is already
    // running (defensive; generations are mutually-exclusive top-level ops in practice).
    if (_current && _current.active) {
        const existing = _current;
        return { end: () => existing.release(), active: existing.active };
    }
    const lease = new GenerationOverlayLease(
        opts?.title ?? 'Generating your building',
        opts?.label ?? 'Preparing…',
    );
    _current = lease;
    return { end: () => lease.release(), active: lease.active };
}

/**
 * Release the continuous overlay for the in-flight generation NOW (idempotent). For
 * callers with a precise async terminus (the house post-gen chain's `finally`). No-op
 * when no generation is in flight. The settle / cap paths release it otherwise, so
 * calling this is an optimisation (tighter release), never a correctness requirement.
 */
export function endBuildingGeneration(): void {
    _current?.release();
}

/** True while a building-generation continuous overlay is held. Test/observability seam. */
export function isBuildingGenerationActive(): boolean {
    return _current?.active === true;
}
