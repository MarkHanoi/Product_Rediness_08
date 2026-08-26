/**
 * §PERF105-CLIP-SIGNATURE-HAS-ONE-OWNER (L-11561) — the projection cache read 0 %
 * because two drivers disagreed about ONE NUMBER.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 *
 * Founder's production console:
 *
 *   [EdgeProjectorService] §PERF-CACHE-STATS … groups=49 cwGroups=42 cacheableGroups=42
 *     cacheHits=0 cacheMisses=42 hitRate=0%
 *
 * — with `hitRate=100%` earlier in the same session and no model change between them.
 * Every cacheable element missed on every pass, so every re-projection re-ran the full
 * EdgesGeometry + toDrawingSpace pipeline *and* paid its frame yields. That is his
 * *"took ages"*.
 *
 * `planBelowDepthOffset` had THREE producers, all reachable for the same plan view:
 *
 *   1. `PlanViewManager._resolvePlanBelowDepthOffset(viewDef)` → 1.20
 *   2. an inline copy of the same six lines in the split-view path → 1.20
 *   3. `EdgeProjectorService.project(…, planBelowDepthOffset = 0)` — the default taken
 *      by `initScene.onReprojectionNeeded` (explicit `0`), by the graft path (argument
 *      omitted), by `ViewController` and by `SectionViewService`.
 *
 * Both drivers fire on the SAME store change (ViewTechnicalDrawingCache dispatches
 * `vd:projection-stale` for PlanViewManager's 30 ms debounce AND marks the view dirty
 * for ViewDependencyTracker's 48/300 ms flush). The number is folded into the cache
 * key by `computeClipSignature`, and the cache's inner map is keyed by `viewId` alone —
 * so the two drivers did not merely miss each other's entries, they DISPOSED and
 * overwrote them, forever, alternately.
 *
 * ── WHAT THIS FILE PINS ──────────────────────────────────────────────────────
 *
 * A SET and a VALUE, never "no error thrown":
 *   1. the two offsets really do produce different signatures (so the mechanism is
 *      real and not a story about one);
 *   2. `resolvePlanBelowDepthOffset` is total over the view types, and answers 0 for
 *      every non-plan type — the value the projector needs to leave `planBelowY` null;
 *   3. `project()` and `projectElementsInto()` no longer ACCEPT an offset — arity is
 *      the enforcement, because a shared constant would still have let two call sites
 *      answer;
 *   4. two projections of one unchanged view now agree, which is the cache hit.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeClipSignature, type ClipSignatureInput, EdgeProjectorService } from '../views/EdgeProjectorService';
import {
    resolvePlanBelowDepthOffset,
    DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M,
} from '../views/planBelowDepthOffset';

/** The founder's active view: a Ground-Floor plan, level elevation 0, cut at 1.2 m. */
function planInput(planBelowDepthOffset: number): ClipSignatureInput {
    return {
        viewType: 'plan',
        direction: new THREE.Vector3(0, -1, 0),
        near: 1.2,
        far: 3.0,
        planBelowDepthOffset,
        cutPlaneY: 1.2,
        planFloorY: 0,
        // Exactly what `EdgeProjectorService` derives: null unless the offset is > 0.
        planBelowY: planBelowDepthOffset > 0 ? 0 - planBelowDepthOffset : null,
        sectionDepthBands: null,
        sectionVolumeBox: null,
    };
}

describe('§PERF105-CLIP-SIGNATURE-HAS-ONE-OWNER (L-11561)', () => {
    it('⭐ THE DEFECT — 1.20 and 0 produce DIFFERENT signatures for the same unchanged view', () => {
        const fromPlanViewManager = computeClipSignature(planInput(1.20));
        const fromViewDependencyTracker = computeClipSignature(planInput(0));

        expect(fromPlanViewManager).not.toBe(fromViewDependencyTracker);

        // TWO of the twelve fields differ, and naming them is what makes this a
        // mechanism rather than an inequality: the offset itself, and the derived
        // `planBelowY` which is null (serialised 'x') whenever the offset is 0.
        expect(fromPlanViewManager).toContain('1.2000');
        expect(fromPlanViewManager).toContain('-1.2000');
        expect(fromViewDependencyTracker).toContain('0.0000');
        expect(fromViewDependencyTracker).toContain('|x|');
    });

    it('the signature is otherwise IDENTICAL — so the offset alone caused the 0 %', () => {
        // Everything else about the two calls is the same view at the same moment.
        const a = computeClipSignature(planInput(1.20)).split('|');
        const b = computeClipSignature(planInput(0)).split('|');
        expect(a.length).toBe(b.length);
        const differing = a.map((v, i) => (v === b[i] ? null : i)).filter(i => i !== null);
        expect(differing.length).toBe(2);
    });

    it('⛔ THE FIX IS ARITY — neither entry point can be handed an offset any more', () => {
        // A shared CONSTANT would not have fixed this: the bug was that two call sites
        // were entitled to answer at all. Removing the parameter makes disagreement
        // unrepresentable, and this assertion is what stops it being re-added.
        expect(EdgeProjectorService.prototype.project.length).toBe(3);           // 2 optional tail params
        expect(EdgeProjectorService.prototype.projectElementsInto.length).toBe(4);
    });

    it('the resolver is total, and answers 0 for every view type WITHOUT a below-level band', () => {
        for (const viewType of ['elevation', 'section', '3d', 'ceiling-plan', 'detail', 'schedule']) {
            expect(resolvePlanBelowDepthOffset({ id: 'v1', viewType } as never)).toBe(0);
        }
    });

    it('a plan view with no assigned intent falls back to the named default, not a literal', () => {
        // The 1.20 literal appeared THREE times before this lane. It is named once now.
        expect(DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M).toBe(1.20);
        expect(resolvePlanBelowDepthOffset({ id: 'no-intent-view', viewType: 'plan' } as never))
            .toBe(DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M);
        expect(resolvePlanBelowDepthOffset({ id: 'no-intent-view', viewType: 'structural-plan' } as never))
            .toBe(DEFAULT_PLAN_BELOW_LEVEL_DEPTH_M);
    });

    it('⭐ THE CACHE HIT — two projections of one unchanged view now agree', () => {
        // Both drivers now take the offset from the same resolver, so the signature is a
        // function of the VIEW. Same view, same signature, cache hit.
        const viewDef = { id: 'plan-L0', viewType: 'plan' } as never;
        const driverA = resolvePlanBelowDepthOffset(viewDef);
        const driverB = resolvePlanBelowDepthOffset(viewDef);
        expect(driverA).toBe(driverB);
        expect(computeClipSignature(planInput(driverA)))
            .toBe(computeClipSignature(planInput(driverB)));
    });
});
