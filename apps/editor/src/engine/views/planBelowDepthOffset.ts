/**
 * planBelowDepthOffset — THE ONE OWNER of a plan view's "below level" depth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * §PERF105-CLIP-SIGNATURE-HAS-ONE-OWNER (L-11561) — WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE FOUNDER'S DEFECT: `[EdgeProjectorService] §PERF-CACHE-STATS … cacheableGroups=42
 * cacheHits=0 cacheMisses=42 hitRate=0%`, with `hitRate=100%` earlier in the SAME
 * session and no model change in between. Every cacheable element in the view missed,
 * every time, so every re-projection re-ran the full EdgesGeometry + toDrawingSpace
 * pipeline AND paid its frame yields — the founder's *"took ages"*.
 *
 * THE CAUSE, and it is not a caching bug: this number had THREE producers.
 *
 *   1. `PlanViewManager._resolvePlanBelowDepthOffset(viewDef)` → **1.20**
 *      (intent value, or the 1.20 m default) — used by the graft path, the full
 *      path and the double-buffered path.
 *   2. An INLINE COPY of the same six lines in `PlanViewManager`'s split-view
 *      path — same answer, separately maintained.
 *   3. A hard-coded **`0`** default on `EdgeProjectorService.project()`, taken by
 *      `initScene`'s `onReprojectionNeeded` (which passes `0` explicitly), by
 *      `projectElementsInto`'s graft (which omits the argument), and by
 *      `ViewController`.
 *
 * Both drivers fire on the SAME element create for the SAME plan view —
 * `ViewTechnicalDrawingCache` dispatches `vd:projection-stale` (PlanViewManager,
 * 30 ms debounce) *and* marks the view dirty (ViewDependencyTracker, 48/300 ms
 * debounce → `initScene._reprojectView`). So the same view was projected twice, under
 * two different numbers.
 *
 * That number is folded into `computeClipSignature` — it must be (§FIX-ELEV-LIVE-CROP-
 * REPROJECT, L-202: it genuinely governs the `:beyond` banding, and an earlier attempt
 * to drop `far` from the same key was correctly refused). Two of the twelve signature
 * fields therefore differed by driver:
 *
 *     planBelowDepthOffset : "1.2000"  vs  "0.0000"
 *     planBelowY           : "-1.2000" vs  "x"        (null when the offset is 0)
 *
 * And the cache does not merely MISS on the other driver's entry — the inner map is
 * keyed by `viewId` alone, so each driver DISPOSES the other's geometry and overwrites
 * it (`EdgeProjectorService._putCwCache`). Two drivers, alternating, mutually evicting:
 * a steady **0 %** under alternation, and **100 %** whenever one driver happens to run
 * twice in a row. That is exactly the founder's log, both readings of it.
 *
 * ⚠ THE REPO HAD ALREADY SEEN THIS AND MISREAD IT. `ISSUE-LOG.md` L-307 records the
 * identical fingerprint — *"one pass hitRate=0 % (241 edge geos rebuilt), next 100 %"* —
 * names these same two drivers, and attributes it to *"a redundant warm-replay pass"*.
 * The redundant pass was real; it was not why the two passes could not share an entry.
 *
 * ⭐ THE RULE THIS FILE ENFORCES: the offset is a property of the VIEW, not of the
 * CALLER. `EdgeProjectorService.project()` resolves it here, from the viewDef, and
 * takes no parameter for it — so no call site can express a different answer. That is
 * the fix; a shared constant would not have been, because the bug was that two code
 * paths were entitled to ANSWER AT ALL.
 *
 * Contract: C04 §3.3 (rendering / scheduling) · C06 (view intents).
 * P2 — no THREE. P3 — no rAF. Pure but for two store reads.
 */

import type { ViewDefinition } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';

/**
 * The default "below level" depth, in metres, when the view carries no intent or the
 * intent does not set one.
 *
 * ⚠ 1.20 m was the literal in `PlanViewManager._resolvePlanBelowDepthOffset`, twice.
 * It is named here so the third copy cannot be written.
 */
export const DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M = 1.20;

/** The view types that have a "below level" band at all. Everything else is 0. */
const PLAN_TYPES_WITH_BELOW_BAND: ReadonlySet<string> = new Set(['plan', 'structural-plan']);

/**
 * Resolve a view's `planBelowDepthOffset`, in metres.
 *
 * Non-plan views (elevation, section, 3d, ceiling-plan, detail …) return `0` — they
 * have no below-level band, and `0` is what makes `planBelowY` null in the projector.
 *
 * ⛔ DO NOT re-implement this beside a call site, and do not add a parameter that lets
 * a caller override it. The whole defect this closes is that two call sites each held
 * their own answer; a third answer, however well-intentioned, re-opens it.
 */
export function resolvePlanBelowDepthOffset(viewDef: ViewDefinition): number {
    if (!PLAN_TYPES_WITH_BELOW_BAND.has(viewDef.viewType)) return 0;

    const instance = viewIntentInstanceStore.get(viewDef.id);
    const intent   = instance ? visibilityIntentStore.get(instance.intentId) : null;

    // ⚠ A boot-time flip lives here too, and it is the SAME defect at a smaller scale:
    // before the intent stores hydrate, `intent` is null and this returns the 1.20
    // fallback; after they hydrate it returns the intent's value. If those differ, the
    // first projection of a session is cached under a signature the second cannot hit.
    // That is a legitimate invalidation (the answer genuinely changed) and is left
    // alone — but it is why the cache can miss once on boot without anything being
    // wrong, and a reader chasing a cold-start miss should stop here.
    return viewDef.viewType === 'structural-plan'
        ? (intent?.planViewRange?.structuralPlanBelowLevelDepth ?? DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M)
        : (intent?.planViewRange?.belowLevelDepth ?? DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M);
}
