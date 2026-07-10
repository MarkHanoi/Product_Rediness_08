/**
 * @vitest-environment happy-dom
 *
 * §FIX-STAIR-PLAN-ROUTING-VIEWSTATE (L-217) — `is2DSnapAvailable` semantics.
 *
 * Regression guard for the P2 rename `isInPlanView()` → `is2DSnapAvailable()`.
 * SlabTool.getPlanPoint() gates its DOC-5.3 2D snap resolver on this predicate, so
 * its behaviour must be identical after the rename: true ONLY when the camera is
 * orthographic AND a TechnicalDrawing is mounted (activePlanDrawingRef.drawing).
 *
 * The rename exists because the old name implied a view-mode answer. This suite
 * also pins the DELIBERATE truth that an orthographic plan camera with NO drawing
 * mounted returns false — proving the predicate is snap-availability, not
 * plan-view membership (which is why routing must not use it; see
 * apps/editor stairSketchRouting.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { planView2DCreationMode } from '../PlanView2DCreationMode';
import { activePlanDrawingRef } from '../ActivePlanDrawingRef';
import type * as OBC from '@thatopen/components';

// A truthy stand-in for a mounted TechnicalDrawing — is2DSnapAvailable only
// checks `!== null`, never dereferences it.
const FAKE_DRAWING = {} as unknown as OBC.TechnicalDrawing;

describe('planView2DCreationMode.is2DSnapAvailable (L-217 rename)', () => {
    beforeEach(() => { activePlanDrawingRef.drawing = null; });
    afterEach(() => { activePlanDrawingRef.drawing = null; });

    it('is true for an orthographic camera WITH a mounted drawing', () => {
        activePlanDrawingRef.drawing = FAKE_DRAWING;
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        expect(planView2DCreationMode.is2DSnapAvailable(ortho)).toBe(true);
    });

    it('is false for an orthographic camera with NO drawing mounted (still a plan view)', () => {
        const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        // No drawing → snap unavailable even though the camera is a plan camera.
        expect(planView2DCreationMode.is2DSnapAvailable(ortho)).toBe(false);
    });

    it('is false for a perspective (3D) camera even WITH a drawing mounted', () => {
        activePlanDrawingRef.drawing = FAKE_DRAWING;
        const persp = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        expect(planView2DCreationMode.is2DSnapAvailable(persp)).toBe(false);
    });
});
