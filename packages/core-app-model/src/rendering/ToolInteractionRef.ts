/**
 * ToolInteractionRef — §DEFER-TIER-DURING-DRAW (2026-07-02)
 *
 * A lightweight, mutable, cross-layer latch that records whether a *live tool
 * interaction* (e.g. the wall rubber-band draw between the first and last
 * click) is currently in progress.
 *
 * ─── THIS IS NOT A PRYZM STORE ────────────────────────────────────────────────
 * - Not registered in StoreRegistry.
 * - Does not participate in undo/redo.
 * - Not serialised / not persisted to the project file.
 * - Purely a rendering-layer cross-reference — analogous to
 *   `activePlanDrawingRef` (DOC-5.2) and `floorPlanUnderlayRef`.
 *
 * ## Why this exists
 *
 * On an EMPTY project, committing the FIRST wall re-evaluates the scene quality
 * tier (`RenderingPipelineCoordinator.applyTierForMeshCount`). Because the tier
 * manager starts at cold-start (`_tier === undefined`), the very first
 * evaluation reports `changed === true` and escalates the pipeline to
 * `cinematic` (SSGI on, TRAA on, high shadows) — which DISPOSES and REBUILDS the
 * WebGPU render pipeline mid-draw. During a polyline draw (segment N commits
 * while the user is still placing segment N+1) this rebuild stalls the
 * interaction, and the freshly-enabled TRAA temporal accumulation ghosts the
 * fast-moving rubber-band preview line so it appears to "stick" then jump.
 *
 * The fix (this ref) lets the wall tool mark "an interaction is in progress" so
 * the tier-escalation CALL SITE (in `apps/editor/.../initScene.ts`) can DEFER
 * the escalation until the tool commits/deactivates. The deferred escalation is
 * captured and flushed exactly once when the interaction ends, so the tier still
 * settles to the correct value — just not mid-draw.
 *
 * This does NOT touch the SceneQualityTierManager internals: it is a pure gate
 * the caller reads. Contract compliance:
 *   P2 — imports no THREE.
 *   P3 — no requestAnimationFrame.
 *   §01 §5 — rendering-layer cross-reference only; not exposed to the Command system.
 *
 * ## Usage
 *
 *   // Tool layer (WallTool.activate / deactivate):
 *   toolInteractionRef.beginInteraction();   // draw started
 *   ...
 *   toolInteractionRef.endInteraction();     // draw finished / cancelled
 *
 *   // Tier-escalation call site (initScene):
 *   const applyTier = () => renderingCoordinator.applyTierForMeshCount(n, isWebGPU);
 *   if (!toolInteractionRef.deferTierApply(applyTier)) {
 *       applyTier(); // no interaction in progress — apply now
 *   }
 *   // (when the interaction ends, the LATEST deferred applyTier runs once)
 */

/** A callback that (re)applies the render quality tier. */
export type DeferredTierApply = () => void;

export interface ToolInteractionRefApi {
    /** True while ≥1 tool interaction (e.g. a wall draw) is in progress. */
    readonly active: boolean;
    /** Nesting depth — public for diagnostics/tests only. */
    readonly depth: number;
    /** Mark the start of a live tool interaction (nestable; ref-counted). */
    beginInteraction(): void;
    /**
     * Mark the end of a live tool interaction. When the depth returns to 0, any
     * pending deferred tier-apply captured via {@link deferTierApply} is flushed
     * exactly once.
     */
    endInteraction(): void;
    /**
     * If an interaction is in progress, capture `apply` as the pending
     * tier-escalation to run when the interaction ends (only the LATEST call is
     * kept, since the newest mesh count wins) and return `true` — the caller
     * MUST NOT apply now. If no interaction is in progress, return `false` — the
     * caller should apply immediately.
     */
    deferTierApply(apply: DeferredTierApply): boolean;
    /** Test/diagnostic reset — clears depth and any pending deferred apply. */
    reset(): void;
}

class ToolInteractionRefImpl implements ToolInteractionRefApi {
    private _depth = 0;
    private _pendingTierApply: DeferredTierApply | null = null;

    get active(): boolean {
        return this._depth > 0;
    }

    get depth(): number {
        return this._depth;
    }

    beginInteraction(): void {
        this._depth++;
    }

    endInteraction(): void {
        if (this._depth === 0) return; // unbalanced end — ignore defensively
        this._depth--;
        if (this._depth === 0 && this._pendingTierApply) {
            const apply = this._pendingTierApply;
            this._pendingTierApply = null;
            try {
                apply();
            } catch (err) {
                // Never let a deferred re-tier throw across the interaction boundary.
                console.warn('[ToolInteractionRef] deferred tier-apply error:', err);
            }
        }
    }

    deferTierApply(apply: DeferredTierApply): boolean {
        if (this._depth === 0) return false;
        // Keep only the newest apply — it reflects the most recent mesh count.
        this._pendingTierApply = apply;
        return true;
    }

    reset(): void {
        this._depth = 0;
        this._pendingTierApply = null;
    }
}

/** Process-wide singleton (one interaction latch shared across all tools). */
export const toolInteractionRef: ToolInteractionRefApi = new ToolInteractionRefImpl();
