/**
 * §RCP-IS-NOT-A-PLAN-WITH-A-FLIPPED-CAMERA — L-5403.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUNDER'S QUESTION (2026-08-22)
 * ─────────────────────────────────────────────────────────────────────────────
 *   *"Is an RCP genuinely projected — mirrored, looking up, with ceiling-appropriate
 *   cut and occlusion — or does it fall through to plan handling with a flipped
 *   camera?"*
 *
 * MEASURED ANSWER: **neither.** It fell through to a THIRD, unhandled bucket.
 *
 *   `EdgeProjectorService.project()` opened with
 *       const isPlanView = viewType === 'plan' || viewType === 'structural-plan';
 *   and `'ceiling-plan'` is in neither arm, while
 *       const isSectionDepthView = viewType === 'section' || viewType === 'elevation';
 *   does not claim it either. So for an RCP: `cutPlaneY` null, `planFloorY` null,
 *   `planBelowY` null, `viewDepthOfBox` null, `minProjectionOccluderDepth` −Infinity.
 *
 * Everything upstream had ALREADY been built for it and was consumed by nothing:
 * `getDirectionForView` has a `case 'ceiling-plan'` returning +Y, `resolveClipRange`
 * has an RCP branch that even logs `resolveClipRange() RCP …`, and
 * `resolveViewScope('ceiling-plan')` returns the PLAN scope (cut TRUE, poché TRUE,
 * planFamily TRUE) — i.e. the ONE classifier and the projector's local literal gave
 * OPPOSITE answers about the same view.
 *
 * These tests pin the three facts that make that a defect rather than a preference,
 * and the two corrections.
 *
 * Governance: C04 §3.3 · C09 §4.6.5 (occlusion is view intent) · DOC-1.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    makePlanFamilyDepthOfBox,
    viewLooksUpward,
} from '../src/engine/views/EdgeProjectorService.js';
import {
    PLAN_VIEW_TYPES,
    ALL_VIEW_TYPES,
    VIEW_PROJECTION_DIRECTIONS,
    resolveViewScope,
    layerForZone,
} from '@pryzm/core-app-model';
import { drawingZoneFromLayerName } from '@pryzm/core-app-model';

// ─────────────────────────────────────────────────────────────────────────────
// FACT 1 — the projector's literal disagreed with the ONE classifier
// ─────────────────────────────────────────────────────────────────────────────

describe('L-5403 fact 1 — one question, two answers', () => {
    it('resolveViewScope calls a ceiling plan a CUT, POCHÉ, PLAN-FAMILY view', () => {
        const scope = resolveViewScope('ceiling-plan');
        expect(scope.planFamily).toBe(true);
        expect(scope.cut).toBe(true);
        expect(scope.poche).toBe(true);
        // …identical to a floor plan's scope. The two view types are the same KIND
        // of drawing; only the direction differs.
        expect(scope).toEqual(resolveViewScope('plan'));
    });

    it('the OLD projector literal contradicted it — this is the defect, as an assertion', () => {
        const oldLiteral = (vt: string): boolean => vt === 'plan' || vt === 'structural-plan';
        expect(resolveViewScope('ceiling-plan').planFamily).toBe(true);
        expect(oldLiteral('ceiling-plan')).toBe(false);          // ← the contradiction
    });

    it('the NEW source — PLAN_VIEW_TYPES — cannot contradict it', () => {
        // PLAN_VIEW_TYPES is the same array ViewScope's own _PLAN_FAMILY_TYPES is built
        // from, so agreement is structural, not maintained by hand.
        for (const vt of PLAN_VIEW_TYPES) {
            expect(resolveViewScope(vt).planFamily).toBe(true);
        }
        expect([...PLAN_VIEW_TYPES]).toContain('ceiling-plan');
        expect([...PLAN_VIEW_TYPES]).toEqual(['plan', 'ceiling-plan', 'structural-plan']);
    });

    /**
     * ⚠ THE DELIBERATE DIVERGENCE, RECORDED RATHER THAN TAKEN (L-5405).
     * `resolveViewScope(vt).planFamily` is TRUE for 'detail' as well, but 'detail' was
     * outside the old literal, `resolveClipRange` has no detail branch, and widening the
     * projector to it would be an unmeasured change to a fourth view type. The gap is
     * asserted here so it is a KNOWN gap and a future widening is a deliberate act.
     */
    it('detail is plan-family to the classifier but NOT to the projector — a known gap', () => {
        expect(resolveViewScope('detail').planFamily).toBe(true);
        expect([...PLAN_VIEW_TYPES]).not.toContain('detail');
    });

    it('no view type is BOTH plan-family and section-depth', () => {
        const isSectionDepthView = (vt: string): boolean => vt === 'section' || vt === 'elevation';
        for (const vt of ALL_VIEW_TYPES) {
            const plan = (PLAN_VIEW_TYPES as readonly string[]).includes(vt);
            expect(plan && isSectionDepthView(vt)).toBe(false);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FACT 2 — the fallthrough emitted ZONE-LESS layers, so every RCP intent drove nothing
// ─────────────────────────────────────────────────────────────────────────────

describe('L-5403 fact 2 — an unzoned layer has no pen, no poché and no intent', () => {
    it('a BASE ISO layer name carries no drawing zone at all', () => {
        // This is what the "no cut plane and no depth bands" branch emitted for an RCP.
        expect(drawingZoneFromLayerName('A-WALL')).toBeNull();
        expect(drawingZoneFromLayerName('A-FLOR')).toBeNull();
        expect(drawingZoneFromLayerName('A-CEIL')).toBeNull();
    });

    it('a ZONED layer name — what plan handling emits — does carry one', () => {
        expect(drawingZoneFromLayerName(layerForZone('A-WALL', 'cut'))).toBe('cut');
        expect(drawingZoneFromLayerName(layerForZone('A-WALL', 'projection'))).toBe('projection');
        expect(drawingZoneFromLayerName(layerForZone('A-WALL', 'beyond'))).toBe('beyond');
    });

    /**
     * `SystemIntents.ts` authors THREE ceiling-plan graphic intents (ceiling, slab, wall)
     * and EVERY one of them is a transform between the `cut`, `projection` and `beyond`
     * states. A view that emits no zone gives them nothing to transform — so all three
     * were authored-but-unwired, at the intent layer, because of one literal in the
     * projector. This test pins the dependency: intents need zones.
     */
    it('the ceiling-plan intents are keyed on zones, which the fallthrough never produced', () => {
        const ZONES = ['cut', 'projection', 'beyond'] as const;
        for (const z of ZONES) {
            expect(drawingZoneFromLayerName(layerForZone('A-CEIL', z))).toBe(
                z === 'projection' ? 'projection' : z,
            );
        }
        // …and the base name an RCP used to emit resolves to none of them.
        expect(ZONES.map(z => layerForZone('A-CEIL', z))).not.toContain('A-CEIL');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FACT 3 — the depth sign. Widening the literal alone would have INVERTED occlusion.
// ─────────────────────────────────────────────────────────────────────────────

describe('L-5403 fact 3 — the occluder depth follows the VIEW, not the plan', () => {
    it('the standard presets are exactly opposite along Y', () => {
        expect(VIEW_PROJECTION_DIRECTIONS.plan.y).toBe(-1);
        expect(VIEW_PROJECTION_DIRECTIONS.ceilingPlan.y).toBe(1);
    });

    it('viewLooksUpward reads the RESOLVED direction, so a per-view override is honoured', () => {
        const v = (p: { x: number; y: number; z: number }): THREE.Vector3 =>
            new THREE.Vector3(p.x, p.y, p.z);
        expect(viewLooksUpward(v(VIEW_PROJECTION_DIRECTIONS.plan))).toBe(false);
        expect(viewLooksUpward(v(VIEW_PROJECTION_DIRECTIONS.ceilingPlan))).toBe(true);
        // An elevation is horizontal — neither, and it never reaches this branch anyway.
        expect(viewLooksUpward(v(VIEW_PROJECTION_DIRECTIONS.elevationFront))).toBe(false);
    });

    /**
     * A 3 m storey. The cut plane sits at 2.9 m. Two solids:
     *   LOW  — a table, 0.0 → 0.8 m
     *   HIGH — a light fitting, 2.6 → 2.85 m
     *
     * A FLOOR PLAN's viewer is above looking down: the light is nearer.
     * An RCP's viewer is below looking up:        the table is nearer.
     */
    const CUT = 2.9;
    const low  = new THREE.Box3(new THREE.Vector3(0, 0.0,  0), new THREE.Vector3(1, 0.80, 1));
    const high = new THREE.Box3(new THREE.Vector3(0, 2.6,  0), new THREE.Vector3(1, 2.85, 1));

    it('a floor plan ranks the HIGH solid nearest', () => {
        const depth = makePlanFamilyDepthOfBox(CUT, /* looksUpward */ false);
        expect(depth(high)).toBeCloseTo(0.05, 6);   // 2.90 − 2.85
        expect(depth(low)).toBeCloseTo(2.10, 6);    // 2.90 − 0.80
        expect(depth(high)).toBeLessThan(depth(low));
    });

    it('a reflected ceiling plan ranks the LOW solid nearest', () => {
        const depth = makePlanFamilyDepthOfBox(CUT, /* looksUpward */ true);
        expect(depth(low)).toBeCloseTo(-2.90, 6);   // 0.00 − 2.90 → BEHIND the plane
        expect(depth(high)).toBeCloseTo(-0.30, 6);  // 2.60 − 2.90 → BEHIND the plane
        expect(depth(low)).toBeLessThan(depth(high));
    });

    /**
     * ⭐ THE REASON THE ONE-LINE FIX WOULD HAVE BEEN A GRAPHICS REGRESSION.
     * `applyOcclusion` orders occluders front-to-back by this number and rejects
     * anything below `minProjectionOccluderDepth: 0`. Feed an upward view the downward
     * expression and the ordering flips: the engine promotes what is FURTHEST from the
     * viewer to "nearest occluder" and deletes the lines in front of it.
     */
    it('the WRONG sign inverts the order — this is what a naive widening would have shipped', () => {
        const correct = makePlanFamilyDepthOfBox(CUT, true);
        const wrong   = makePlanFamilyDepthOfBox(CUT, false);
        expect(correct(low)).toBeLessThan(correct(high));    // RCP: low is nearer
        expect(wrong(low)).toBeGreaterThan(wrong(high));     // inverted
    });

    it('geometry ON the plane has zero depth in both frames', () => {
        const onPlane = new THREE.Box3(new THREE.Vector3(0, CUT, 0), new THREE.Vector3(1, CUT, 1));
        expect(makePlanFamilyDepthOfBox(CUT, false)(onPlane)).toBeCloseTo(0, 9);
        expect(makePlanFamilyDepthOfBox(CUT, true)(onPlane)).toBeCloseTo(0, 9);
    });

    it('a plan is byte-identical to its pre-L-5403 expression', () => {
        // The regression guard: nothing the founder looks at every day may move.
        const depth = makePlanFamilyDepthOfBox(CUT, false);
        for (const b of [low, high]) {
            expect(depth(b)).toBe(CUT - b.max.y);   // the exact old expression
        }
    });
});
