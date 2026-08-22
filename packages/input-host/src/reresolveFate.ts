/**
 * reresolveFate — §SELECT-SURVIVES-THE-REBUILD (L-3530), 2026-08-22.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    L1 input-host — PURE decision derivation. No THREE (P2), no
 *                    DOM, no rAF (P3), no store writes (P6). The CALLER
 *                    (`SelectionManager._reresolveSelectionAfterRebuild`) owns
 *                    every scene read and every selection write.
 * Architectural Classification: A (view/interaction-only).
 * Contract:          C06 (UI shell and tools — selection is a domain concept on
 *                    `selectionBus`; the highlight is a render concern, and this
 *                    module decides neither, it decides only WHETHER THE DOMAIN
 *                    SELECTION SURVIVES) · C84 EI-9 (one authority per fact: the
 *                    authority on "does this element exist" is the element
 *                    registry, never the scene graph).
 *
 * ── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-22 ──────────────────────────
 *
 * Founder: *"click a wall → it highlights for about a second, then the highlight
 * is lost."*
 *
 * `SelectionManager._reresolveSelectionAfterRebuild()` re-resolves the selected
 * element's mesh after a builder rebuilds it, and its miss branch read, in full:
 *
 *     if (!fresh) {
 *       // Element no longer in the scene (e.g. undo-of-create removed it)
 *       this.unselectAll();
 *       return;
 *     }
 *
 * ⭐ "NO SCENE-ATTACHED MESH CARRIES THIS ID" IS NOT "THIS ELEMENT IS GONE."
 * They are two different facts that arrive as the SAME VALUE — `null` — and the
 * old code inferred the second from the first. That is
 * [[context-data-honesty-family]] at the interaction layer, and its cost is a
 * live wall being deselected while it is being rebuilt.
 *
 * The race is documented in the calling file's own comments and then contradicted
 * three lines later: the `setTimeout(…, 0)` defer is justified as *"so the
 * builder's scene.remove(old) + scene.add(new) has settled"*, while the
 * `onRootSwapped` subscription immediately below it states *"Builders register
 * the root BEFORE scene.add()"*. A builder that registers on one tick and
 * attaches on a later FRAME — the build queue drains from a `pre-render`
 * scheduler slot — is observed as ABSENT by a macrotask-deferred check.
 *
 * ⚠ WHAT THIS MODULE DELIBERATELY DOES NOT DECIDE. It does not know whether the
 * mesh is genuinely late or genuinely orphaned; nothing at this point can. It
 * decides how many observations to take before concluding, and it makes the
 * two conclusions DIFFERENT VALUES so the caller can log them differently. A
 * silent deselect is the thing being removed; replacing it with a differently
 * silent deselect would be no fix at all.
 */

/** What the caller should do about a re-resolve that found no live mesh. */
export type ReresolveFate =
    /** The domain still knows this element — the mesh is LATE. Keep the selection, look again. */
    | 'retry'
    /**
     * The element registry has forgotten this id, so it really was removed
     * (undo-of-create, delete). Deselect — this is the case the original branch
     * was written for, and it stays correct.
     */
    | 'deselect-removed'
    /**
     * The registry still holds the id but no mesh ever attached within the retry
     * budget. Deselect, but say so LOUDLY: a registered root that never reaches
     * the scene is an orphaned registration, a different defect with a different
     * fix, and folding it into 'removed' is how it would stay invisible.
     */
    | 'deselect-orphan';

export interface ReresolveInput {
    /**
     * True when the element registry still holds this id — via `getStoreType()`
     * (which survives the transient `unregisterRoot()` + `registerRoot()` pair a
     * stair-shaped rebuild performs, and is cleared only by a REAL `unregister()`)
     * or via `getRoot()`.
     *
     * ⚠ THIS MUST COME FROM THE REGISTRY, NOT FROM THE SCENE. The registry is by
     * its own header *"the SINGLE SOURCE OF TRUTH for what scene roots are placed
     * BIM elements"*; asking the scene again would just re-ask the question that
     * already returned null.
     */
    readonly domainKnowsId: boolean;
    /** How many retries have ALREADY been spent on this id. 0 on the first miss. */
    readonly attemptsSoFar: number;
    /** The budget. See `SelectionManager.RERESOLVE_MAX_RETRIES`. */
    readonly maxRetries: number;
}

/**
 * Decide the fate of a selection whose mesh could not be re-resolved.
 *
 * Order is load-bearing: the domain's verdict OUTRANKS the retry budget. An
 * element the registry has forgotten is deselected on the FIRST miss — spending
 * 200 ms of retries on an element the user just deleted would make delete feel
 * broken, and there is nothing to wait for.
 */
export function decideReresolveFate(input: ReresolveInput): ReresolveFate {
    if (!input.domainKnowsId) return 'deselect-removed';
    if (input.attemptsSoFar < input.maxRetries) return 'retry';
    return 'deselect-orphan';
}
