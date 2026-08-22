/**
 * @vitest-environment happy-dom
 *
 * §FIX-ELEVATION-CROP-EXTEND (L-175) — resize the crop rectangle by dragging its
 * corner handles while IN a section/elevation view (parity with the plan-view
 * scope-box resize). PlanViewCanvas.hitTestCropHandle() picks the grabbed corner
 * and PlanViewCanvas.cropFromHandleDrag() converts the cursor position into a new
 * `crop.region` — respecting the elevation projection frame (horizontal H axis +
 * vertical world-Y axis, with the view's H sign) — which PlanViewInteraction then
 * dispatches through the view.setCrop command (P6, the only mutation path).
 *
 * These tests exercise the pure crop-region math directly, without a live canvas
 * render: a stub 2D context satisfies the constructor; setSize/setSectionAxes/
 * setFrustum place the camera; the private `_lastViewId` is stamped so the methods
 * resolve their ViewDefinition from the store (white-box, mirroring render()).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlanViewCanvas } from '../PlanViewCanvas';
import { viewDefinitionStore } from '../ViewDefinitionStore';
import type { ViewSectionVolume } from '../ViewDefinitionTypes';

function makeCanvas(): PlanViewCanvas {
    const fake = {
        getContext: () => ({}),
        width: 0,
        height: 0,
        clientWidth: 800,
        clientHeight: 600,
    } as unknown as HTMLCanvasElement;
    return new PlanViewCanvas(fake);
}

/**
 * Configure a section/elevation-framed canvas whose stored crop.region is in
 * ABSOLUTE world-H (the sectionVolume path — the founder's real case, where the
 * elevation carries a sectionVolume-derived crop).
 */
function setupSectionCanvas(viewId: string, hSign: 1 | -1): PlanViewCanvas {
    const sectionVolume: ViewSectionVolume = {
        origin: [0, 0, 0],
        direction: [0, 0, -1],
        width: 20,
        height: 3,
        near: 0,
        far: 8,
    };
    viewDefinitionStore.reset();
    viewDefinitionStore.create({
        id: viewId,
        name: 'South Elevation',
        viewType: 'elevation',
        spatial: { sectionVolume },
        crop: {
            enabled: true,
            region: { min: [-10, 0], max: [10, 3] },
            farClip: { offset: 8 },
        },
    });

    const pvc = makeCanvas();
    pvc.setSize(800, 600);
    pvc.setViewType('elevation');
    pvc.setSectionAxes('x', true, hSign);
    // fH = 10, camTarget = (horizontalCentre=0, _, verticalCentre=1.5)
    pvc.setFrustum(10, { x: 0, y: 0, z: 1.5 } as unknown as import('@pryzm/renderer-three/three').Vector3);
    // Stamp the active view id the way render() does, so the crop methods resolve it.
    (pvc as unknown as { _lastViewId: string })._lastViewId = viewId;
    return pvc;
}

describe('§FIX-ELEVATION-CROP-EXTEND (L-175) — elevation crop handle drag', () => {
    beforeEach(() => viewDefinitionStore.reset());

    it('hit-tests the NE crop corner handle at its projected screen position', () => {
        const pvc = setupSectionCanvas('vd-elev-1', 1);
        // NE corner = (maxH=10, maxV=3). worldToScreen → (700, 255) at fH=10, 800x600.
        const hit = pvc.hitTestCropHandle(700, 255, 10);
        expect(hit).not.toBeNull();
        expect(hit!.handle).toBe('ne');
    });

    it('returns null when the cursor is far from every crop handle', () => {
        const pvc = setupSectionCanvas('vd-elev-1b', 1);
        expect(pvc.hitTestCropHandle(400, 300, 10)).toBeNull();
    });

    it('extends the crop region when the NE handle is dragged outward (sign +1)', () => {
        const pvc = setupSectionCanvas('vd-elev-2', 1);
        // Drag NE toward world (H=12, V=4) → screen (760, 225).
        const crop = pvc.cropFromHandleDrag('ne', 760, 225);
        expect(crop).not.toBeNull();
        expect(crop!.enabled).toBe(true);
        // Only the dragged (max) corner moves; the min corner stays put.
        expect(crop!.region!.min[0]).toBeCloseTo(-10, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(0, 3);
        expect(crop!.region!.max[0]).toBeCloseTo(12, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(4, 3);
        // farClip is preserved through the resize.
        expect(crop!.farClip?.offset).toBe(8);
    });

    it('moves only the vertical extreme when dragging changes height (SW handle)', () => {
        const pvc = setupSectionCanvas('vd-elev-3', 1);
        // SW corner = (minH=-10, minV=0) → screen (100, 345). Drag down-left to
        // world (H=-12, V=-1) → screen (40, 375).
        const crop = pvc.cropFromHandleDrag('sw', 40, 375);
        expect(crop).not.toBeNull();
        expect(crop!.region!.min[0]).toBeCloseTo(-12, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(-1, 3);
        // opposite (NE) corner unchanged
        expect(crop!.region!.max[0]).toBeCloseTo(10, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(3, 3);
    });

    it('respects the elevation H sign: a mirrored view (sign -1) inverts the H mapping', () => {
        const pvc = setupSectionCanvas('vd-elev-4', -1);
        // With hSign=-1, world-H maps to canvas-H negated. Dragging the NE screen
        // corner rightward (canvas-H = 12) must resolve to the correct region side.
        const crop = pvc.cropFromHandleDrag('ne', 760, 225);
        expect(crop).not.toBeNull();
        // canvasH 12 → regionH -12 under sign -1; sorted region spans [-12, 10].
        expect(crop!.region!.min[0]).toBeCloseTo(-12, 3);
        expect(crop!.region!.max[0]).toBeCloseTo(10, 3);
        // vertical axis is sign-independent (identity)
        expect(crop!.region!.max[1]).toBeCloseTo(4, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(0, 3);
    });

    it('rejects a drag that would collapse the crop below the minimum span', () => {
        const pvc = setupSectionCanvas('vd-elev-5', 1);
        // Drag the NE corner almost onto the SW corner (near minH=-10, minV=0):
        // world (H≈-9.95, V≈0.02) → screen ≈ (101.5, 344.4). Span < 0.1 → null.
        const crop = pvc.cropFromHandleDrag('ne', 101.5, 344.4);
        expect(crop).toBeNull();
    });

    it('does not offer crop handles in plan (non-flipV) views', () => {
        viewDefinitionStore.reset();
        viewDefinitionStore.create({
            id: 'vd-plan-1',
            name: 'Level 1 Plan',
            viewType: 'plan',
            crop: { enabled: true, region: { min: [-5, -5], max: [5, 5] } },
        });
        const pvc = makeCanvas();
        pvc.setSize(800, 600);
        pvc.setViewType('plan');
        // plan default: _sectionFlipV stays false
        pvc.setFrustum(10, { x: 0, y: 0, z: 0 } as unknown as import('@pryzm/renderer-three/three').Vector3);
        (pvc as unknown as { _lastViewId: string })._lastViewId = 'vd-plan-1';
        expect(pvc.hitTestCropHandle(400, 300, 10)).toBeNull();
        expect(pvc.cropFromHandleDrag('ne', 700, 100)).toBeNull();
    });
});

/**
 * §CROP-HANDLE-IS-GRABBABLE (L-4302) — the FOUR EDGE MIDPOINTS.
 *
 * Founder, 2026-08-22: *"more importantly allow me to easily drag … When the user hovers
 * with the mouse it should be able to see an arrow, and then click and resize the crop
 * view."*
 *
 * Four corners were the whole vocabulary, and a corner moves BOTH axes. So "crop the sky
 * off the top of this elevation without narrowing it" was NOT EXPRESSIBLE — every gesture
 * that changed height also changed width. The midpoints are also what make `ns-resize` /
 * `ew-resize` (the plain double-headed arrows) reachable; the corners only ever produce
 * the diagonal pair.
 *
 * Screen frame for these tests (same `setupSectionCanvas` as above):
 *   sx = 400 + 30·H     (H = -10 → 100,  H = +10 → 700)
 *   sy = 345 − 30·V     (V =   0 → 345,  V =   3 → 255)
 */
describe('§CROP-HANDLE-IS-GRABBABLE (L-4302) — edge midpoints resize ONE axis', () => {
    beforeEach(() => viewDefinitionStore.reset());

    it('hit-tests the N midpoint at the top edge centre', () => {
        const pvc = setupSectionCanvas('vd-mid-1', 1);
        const hit = pvc.hitTestCropHandle(400, 255);
        expect(hit).not.toBeNull();
        expect(hit!.handle).toBe('n');
    });

    it('hit-tests the E midpoint at the right edge centre', () => {
        const pvc = setupSectionCanvas('vd-mid-2', 1);
        expect(pvc.hitTestCropHandle(700, 300)!.handle).toBe('e');
    });

    it('hit-tests the S and W midpoints', () => {
        const pvc = setupSectionCanvas('vd-mid-3', 1);
        expect(pvc.hitTestCropHandle(400, 345)!.handle).toBe('s');
        expect(pvc.hitTestCropHandle(100, 300)!.handle).toBe('w');
    });

    it('⭐ N moves ONLY the top edge — the gesture that was previously impossible', () => {
        const pvc = setupSectionCanvas('vd-mid-4', 1);
        // Drag the top edge down to V = 2 (sy = 345 − 60 = 285). The horizontal cursor
        // position is deliberately OFF-CENTRE, to prove H is ignored.
        const crop = pvc.cropFromHandleDrag('n', 610, 285);
        expect(crop).not.toBeNull();
        expect(crop!.region!.max[1]).toBeCloseTo(2, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(0, 3);
        // Both H edges untouched — the assertion a corner drag CANNOT satisfy.
        expect(crop!.region!.min[0]).toBeCloseTo(-10, 3);
        expect(crop!.region!.max[0]).toBeCloseTo(10, 3);
    });

    it('S moves ONLY the bottom edge', () => {
        const pvc = setupSectionCanvas('vd-mid-5', 1);
        // V = −1 → sy = 375.
        const crop = pvc.cropFromHandleDrag('s', 250, 375);
        expect(crop!.region!.min[1]).toBeCloseTo(-1, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(3, 3);
        expect(crop!.region!.min[0]).toBeCloseTo(-10, 3);
        expect(crop!.region!.max[0]).toBeCloseTo(10, 3);
    });

    it('E moves ONLY the right edge — the vertical cursor position is ignored', () => {
        const pvc = setupSectionCanvas('vd-mid-6', 1);
        // H = 12 → sx = 760; sy deliberately far from the edge centre.
        const crop = pvc.cropFromHandleDrag('e', 760, 200);
        expect(crop!.region!.max[0]).toBeCloseTo(12, 3);
        expect(crop!.region!.min[0]).toBeCloseTo(-10, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(0, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(3, 3);
    });

    it('W moves ONLY the left edge', () => {
        const pvc = setupSectionCanvas('vd-mid-7', 1);
        // H = −12 → sx = 40.
        const crop = pvc.cropFromHandleDrag('w', 40, 500);
        expect(crop!.region!.min[0]).toBeCloseTo(-12, 3);
        expect(crop!.region!.max[0]).toBeCloseTo(10, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(0, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(3, 3);
    });

    it('a corner still moves BOTH axes — the existing vocabulary is kept, not replaced', () => {
        const pvc = setupSectionCanvas('vd-mid-8', 1);
        const crop = pvc.cropFromHandleDrag('ne', 760, 225);
        expect(crop!.region!.max[0]).toBeCloseTo(12, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(4, 3);
    });

    it('the MIN_SPAN collapse guard applies to a single-axis drag too', () => {
        const pvc = setupSectionCanvas('vd-mid-9', 1);
        // Drag the top edge down to V = 0.05 (sy = 343.5) → vertical span 0.05 < 0.1.
        expect(pvc.cropFromHandleDrag('n', 400, 343.5)).toBeNull();
    });

    it('the H sign is honoured by the single-axis handles as well', () => {
        const pvc = setupSectionCanvas('vd-mid-10', -1);
        // canvasH 12 → regionH −12 under sign −1; the sorted region spans [−12, 10].
        const crop = pvc.cropFromHandleDrag('e', 760, 300);
        expect(crop!.region!.min[0]).toBeCloseTo(-12, 3);
        expect(crop!.region!.max[0]).toBeCloseTo(10, 3);
        expect(crop!.region!.min[1]).toBeCloseTo(0, 3);
        expect(crop!.region!.max[1]).toBeCloseTo(3, 3);
    });

    it('plan views still offer no crop handles at all, midpoints included', () => {
        viewDefinitionStore.reset();
        viewDefinitionStore.create({
            id: 'vd-plan-mid',
            name: 'Level 1 Plan',
            viewType: 'plan',
            crop: { enabled: true, region: { min: [-5, -5], max: [5, 5] } },
        });
        const pvc = makeCanvas();
        pvc.setSize(800, 600);
        pvc.setViewType('plan');
        pvc.setFrustum(10, { x: 0, y: 0, z: 0 } as unknown as import('@pryzm/renderer-three/three').Vector3);
        (pvc as unknown as { _lastViewId: string })._lastViewId = 'vd-plan-mid';
        for (const h of ['n', 's', 'e', 'w'] as const) {
            expect(pvc.cropFromHandleDrag(h, 700, 100)).toBeNull();
        }
    });
});

describe('§CROP-HANDLE-IS-GRABBABLE (L-4302) — the grab radius, and the hover state', () => {
    beforeEach(() => viewDefinitionStore.reset());

    it('⭐ the default radius is 14, not the old 10 — a 12 px near-miss now lands', () => {
        const pvc = setupSectionCanvas('vd-grab-1', 1);
        // 12 px below the NE corner (700, 255).
        expect(pvc.hitTestCropHandle(700, 267)).not.toBeNull();
        expect(pvc.hitTestCropHandle(700, 267)!.handle).toBe('ne');
        // …and the same point missed under the threshold this file used to pass.
        expect(pvc.hitTestCropHandle(700, 267, 10)).toBeNull();
    });

    it('nearest-wins is preserved when a midpoint and a corner are both in range', () => {
        // A crop only 0.6 m wide: at 30 px/unit the top edge is 18 px long, so its
        // midpoint sits 9 px from each top corner — inside the 14 px grab radius.
        viewDefinitionStore.reset();
        viewDefinitionStore.create({
            id: 'vd-grab-2',
            name: 'Narrow Elevation',
            viewType: 'elevation',
            spatial: { sectionVolume: { origin: [0, 0, 0], direction: [0, 0, -1], width: 20, height: 3, near: 0, far: 8 } },
            crop: { enabled: true, region: { min: [-0.3, 0], max: [0.3, 3] }, farClip: { offset: 8 } },
        });
        const pvc = makeCanvas();
        pvc.setSize(800, 600);
        pvc.setViewType('elevation');
        pvc.setSectionAxes('x', true, 1);
        pvc.setFrustum(10, { x: 0, y: 0, z: 1.5 } as unknown as import('@pryzm/renderer-three/three').Vector3);
        (pvc as unknown as { _lastViewId: string })._lastViewId = 'vd-grab-2';
        // Right top corner: H = 0.3 → sx = 409; V = 3 → sy = 255.
        expect(pvc.hitTestCropHandle(409, 255)!.handle).toBe('ne');
        // Exactly on the top midpoint (sx = 400) the midpoint is nearer, so it wins.
        // Corner-first ordering only decides EXACT ties.
        expect(pvc.hitTestCropHandle(400, 255)!.handle).toBe('n');
    });

    it('the hover handle round-trips, and starts null', () => {
        const pvc = setupSectionCanvas('vd-grab-3', 1);
        expect(pvc.getHoveredCropHandle()).toBeNull();
        pvc.setHoveredCropHandle('e');
        expect(pvc.getHoveredCropHandle()).toBe('e');
        pvc.setHoveredCropHandle(null);
        expect(pvc.getHoveredCropHandle()).toBeNull();
    });
});
