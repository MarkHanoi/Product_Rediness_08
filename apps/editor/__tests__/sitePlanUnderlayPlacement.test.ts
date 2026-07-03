// §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — the pure dual-north math that turns a calibrated
// site-overlay transform into a plan-canvas underlay placement.
//
// THE assertion the founder cares about: a plan placed OFF-AXIS on the (true-north) map must
// come out AXIS-ALIGNED (rotation 0) in plan space — that is what makes it show orthogonally
// so the user can trace walls along its edges. Plus: correct real-world size (pxPerMeter =
// 1/mpp) and the centre re-expressed in the project frame.

import { describe, it, expect } from 'vitest';
import {
    computePlanUnderlayPlacement,
    trueToProjectNorth,
    deriveProjectNorthAngle,
} from '../src/ui/site/overlay/projectTrueNorth';
import type { SitePlanOverlayTransform } from '../src/ui/site/overlay/sitePlanOverlayGeometry';

function transform(partial: Partial<SitePlanOverlayTransform>): SitePlanOverlayTransform {
    return {
        centre: { east: 0, north: 0 },
        metresPerPixel: 0.02,
        rotationRad: 0,
        widthPx: 1200,
        heightPx: 900,
        ...partial,
    };
}

describe('§FEAT-SITE-OVERLAY-PLAN-UNDERLAY — computePlanUnderlayPlacement', () => {
    it('an OFF-AXIS map plan (30° to true north) becomes AXIS-ALIGNED (rotation 0) in plan space', () => {
        const t = transform({ rotationRad: Math.PI / 6 }); // 30° on the true-north map
        const p = computePlanUnderlayPlacement(t);
        // THE goal: orthogonal in plan view regardless of the map orientation.
        expect(p.rotationZ).toBe(0);
        // …and the removed angle is captured as θ (→ SiteLocation.trueNorth for the globe).
        expect(p.projectNorthRad).toBeCloseTo(Math.PI / 6, 9);
    });

    it('applies the calibration scale: pxPerMeter = 1 / metresPerPixel', () => {
        expect(computePlanUnderlayPlacement(transform({ metresPerPixel: 0.02 })).pxPerMeter).toBeCloseTo(50, 9);
        expect(computePlanUnderlayPlacement(transform({ metresPerPixel: 0.25 })).pxPerMeter).toBeCloseTo(4, 9);
    });

    it('re-expresses the overlay centre in the project frame (trueToProjectNorth about origin)', () => {
        const t = transform({ centre: { east: 5, north: -3 }, rotationRad: Math.PI / 6 });
        const p = computePlanUnderlayPlacement(t);
        const theta = deriveProjectNorthAngle(t);
        const expected = trueToProjectNorth({ east: 5, north: -3 }, theta, { east: 0, north: 0 });
        expect(p.positionEast).toBeCloseTo(expected.east, 9);
        expect(p.positionNorth).toBeCloseTo(expected.north, 9);
    });

    it('θ = 0 (axis-aligned map plan) leaves the centre unchanged (identity)', () => {
        const t = transform({ centre: { east: 12, north: 7 }, rotationRad: 0 });
        const p = computePlanUnderlayPlacement(t);
        expect(p.rotationZ).toBe(0);
        expect(p.positionEast).toBeCloseTo(12, 9);
        expect(p.positionNorth).toBeCloseTo(7, 9);
    });

    it('guards a degenerate metres-per-pixel (0) to a finite scale (no Infinity)', () => {
        const p = computePlanUnderlayPlacement(transform({ metresPerPixel: 0 }));
        expect(Number.isFinite(p.pxPerMeter)).toBe(true);
        expect(p.pxPerMeter).toBeGreaterThan(0);
    });
});
