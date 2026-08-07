/**
 * §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) — the cancellation signal for the
 * technical-drawing projection pipeline.
 *
 * WHY THIS IS ITS OWN MODULE, and not part of `EdgeProjectorService.ts`:
 * `EdgeProjectorService` is LAZY-LOADED behind a façade in `initScene.ts` (Phase 6 — the
 * real service is only imported on the first projection). The drivers that must RECOGNISE
 * a cancellation — `initScene`'s `onReprojectionNeeded` and `PlanViewManager` — would
 * defeat that lazy load if they took a value import from it just to reach a two-line type
 * predicate. Keeping the signal in a leaf module with no dependencies lets every caller
 * import it eagerly while the 3,700-line projector stays lazy.
 *
 * CONTEXT — the waste this exists to stop. `ViewTechnicalDrawingCache.setIfCurrent()`
 * rejects a superseded projection only AFTER it has run to completion. Nothing ever
 * cancelled one. The founder's 2026-08-06 session shows three complete plan projections
 * computed and thrown away per wall drawn:
 *
 *   Stale projection rejected — viewId=vd-sys-plan-l0 staleGen=2 currentGen=5
 *   Stale projection rejected — viewId=vd-sys-plan-l0 staleGen=3 currentGen=5
 *   Stale projection rejected — viewId=vd-sys-plan-l0 staleGen=4 currentGen=5
 *
 * SPEC-30 §9: *"No 'render everything every frame.' Incremental re-resolve + dirty-rect
 * repaint is mandatory."* Finishing a pass whose result is already unusable is the purest
 * form of the anti-pattern that clause forbids.
 */

/**
 * Thrown by `EdgeProjectorService.project()` when it abandons a pass because a newer
 * generation for the same view was started while it was yielded at a chunk boundary.
 *
 * ⚠ THIS IS NOT A FAILURE. It is the successful outcome of "stop doing work nobody can
 * use". Callers MUST branch on {@link isProjectionSuperseded} and return quietly; logging
 * it as an error would print a red line on every keystroke of an interactive wall draw,
 * which is exactly how a performance fix gets reverted as "noisy".
 */
export class ProjectionSupersededError extends Error {
    readonly viewId:          string;
    readonly groupsCompleted: number;
    readonly groupsTotal:     number;

    constructor(viewId: string, groupsCompleted: number, groupsTotal: number) {
        super(
            `[EdgeProjectorService] projection for viewId=${viewId} was superseded after ` +
            `${groupsCompleted}/${groupsTotal} group(s) and abandoned`,
        );
        this.name            = 'ProjectionSupersededError';
        this.viewId          = viewId;
        this.groupsCompleted = groupsCompleted;
        this.groupsTotal     = groupsTotal;
    }
}

/**
 * Cancellation test. Also matches by `name` so a cancellation raised inside the lazily
 * imported projector chunk is still recognised by a caller in the eagerly loaded main
 * bundle, where `instanceof` across two module instances cannot be relied upon.
 */
export function isProjectionSuperseded(err: unknown): err is ProjectionSupersededError {
    return err instanceof ProjectionSupersededError
        || (typeof err === 'object' && err !== null
            && (err as { name?: unknown }).name === 'ProjectionSupersededError');
}
