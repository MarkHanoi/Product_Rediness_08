// §OFFICE-ONBOARDING-WIRE (2026-06-30) — unit tests for the parcel → office-circle
// derivation that wires "Commercial building — office" as a first-class typology.
//
// Pure (no DOM) — the helper is I/O-free, so the default node env is fine. Verifies the
// centroid + fit-radius (largest circle about the centroid that sits inside the plot),
// the closing-duplicate tolerance, and the degenerate-input → null fallback the
// onboarding flow relies on to default to a 22 m radius without blocking.

import { describe, it, expect } from 'vitest';
import {
    deriveOfficeCircleFromParcel,
    isOfficeTypologyId,
    resolveOfficeStoreyCount,
    type ParcelPoint,
} from '../src/ui/office-building/deriveOfficeCircle';

const sq = (s: number): ParcelPoint[] => [
    { x: 0, z: 0 }, { x: s, z: 0 }, { x: s, z: s }, { x: 0, z: s },
];

describe('deriveOfficeCircleFromParcel', () => {
    it('centroid + inscribed radius for a square (radius = half-side)', () => {
        const c = deriveOfficeCircleFromParcel(sq(40));
        expect(c).not.toBeNull();
        expect(c!.cx).toBeCloseTo(20, 6);
        expect(c!.cz).toBeCloseTo(20, 6);
        // Largest circle about the centre of a 40×40 square fits with r = 20.
        expect(c!.radiusM).toBeCloseTo(20, 6);
    });

    it('rectangle radius is clamped to half the SHORTER side', () => {
        // 60 (x) × 30 (z) rectangle → fit radius 15 (half the 30 m side).
        const rect: ParcelPoint[] = [
            { x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 30 }, { x: 0, z: 30 },
        ];
        const c = deriveOfficeCircleFromParcel(rect);
        expect(c).not.toBeNull();
        expect(c!.cx).toBeCloseTo(30, 6);
        expect(c!.cz).toBeCloseTo(15, 6);
        expect(c!.radiusM).toBeCloseTo(15, 6);
    });

    it('tolerates a trailing closing-duplicate vertex (no centroid skew, no zero edge)', () => {
        const closed: ParcelPoint[] = [...sq(20), { x: 0, z: 0 }];
        const c = deriveOfficeCircleFromParcel(closed);
        expect(c).not.toBeNull();
        expect(c!.cx).toBeCloseTo(10, 6);
        expect(c!.cz).toBeCloseTo(10, 6);
        expect(c!.radiusM).toBeCloseTo(10, 6);
    });

    it('derived circle sits INSIDE the plot (radius ≤ centroid distance to every edge)', () => {
        // An L-ish concave quad — the inscribed-about-centroid radius must not poke out.
        const poly: ParcelPoint[] = [
            { x: 0, z: 0 }, { x: 50, z: 0 }, { x: 50, z: 50 }, { x: 0, z: 50 },
        ];
        const c = deriveOfficeCircleFromParcel(poly)!;
        // Distance from centroid (25,25) to each edge of the 50×50 square is 25.
        expect(c.radiusM).toBeLessThanOrEqual(25 + 1e-9);
        expect(c.radiusM).toBeGreaterThan(0);
    });

    it('§OFFICE-DERIVE-FILL — a ~500 m² parcel derives a sensible (not tiny) radius', () => {
        // ~499 m² near-square parcel (≈22.34 m side). The founder saw radius 10 m before;
        // the derived radius should now be sensible (≈ half the side, ~11 m), and the
        // generator's own 10 m min-build floor guarantees a buildable plate either way.
        const side = Math.sqrt(499); // ≈ 22.34
        const c = deriveOfficeCircleFromParcel(sq(side))!;
        expect(c).not.toBeNull();
        // Fills toward the bbox: ≈ side/2 (the largest circle that fits the square).
        expect(c.radiusM).toBeGreaterThanOrEqual(10);
        expect(c.radiusM).toBeCloseTo(side / 2, 4);
    });

    it('§OFFICE-DERIVE-FILL — pushes the radius UP toward the bbox-fit but never past it', () => {
        // A diamond (rotated square) — the centroid-inscribed radius is SMALLER than the
        // bbox half-min-side, so the fill blend lifts it, staying ≤ bboxFit (inside the bbox).
        const half = 20;
        const diamond: ParcelPoint[] = [
            { x: half, z: 0 }, { x: 2 * half, z: half }, { x: half, z: 2 * half }, { x: 0, z: half },
        ];
        const c = deriveOfficeCircleFromParcel(diamond)!;
        const bboxFit = half; // bbox is 40×40 → half-min-side 20
        const inscribed = half / Math.SQRT2; // centroid→edge of a diamond = half/√2 ≈ 14.14
        expect(c.radiusM).toBeGreaterThan(inscribed - 1e-6); // lifted above the raw inscribed
        expect(c.radiusM).toBeLessThanOrEqual(bboxFit + 1e-9); // never past the bbox
    });

    it('returns null for degenerate / unusable input (caller defaults the radius)', () => {
        expect(deriveOfficeCircleFromParcel(null)).toBeNull();
        expect(deriveOfficeCircleFromParcel(undefined)).toBeNull();
        expect(deriveOfficeCircleFromParcel([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBeNull(); // < 3 pts
        // A zero-area collinear ring has no inscribed circle.
        expect(deriveOfficeCircleFromParcel([
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 },
        ])).toBeNull();
    });

    it('ignores non-finite vertices defensively', () => {
        const poly: ParcelPoint[] = [
            { x: 0, z: 0 }, { x: NaN, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }, { x: 0, z: 20 },
        ];
        const c = deriveOfficeCircleFromParcel(poly);
        // The NaN vertex is dropped; the remaining 4 form the 20×20 square → r = 10.
        expect(c).not.toBeNull();
        expect(c!.radiusM).toBeCloseTo(10, 6);
    });
});

describe('isOfficeTypologyId (dispatch routing)', () => {
    it('matches BOTH the picker pack id and the short form', () => {
        // The TypologyPicker emits the registry pack id; the RAC/short form may emit `office`.
        expect(isOfficeTypologyId('office-building')).toBe(true);
        expect(isOfficeTypologyId('office')).toBe(true);
    });

    it('does NOT match the other wired typologies (so their branches keep routing)', () => {
        expect(isOfficeTypologyId('apartment')).toBe(false);
        expect(isOfficeTypologyId('casa-unifamiliar')).toBe(false);
        expect(isOfficeTypologyId('residential-multifamily')).toBe(false);
        expect(isOfficeTypologyId(null)).toBe(false);
        expect(isOfficeTypologyId(undefined)).toBe(false);
        expect(isOfficeTypologyId('')).toBe(false);
    });
});

describe('resolveOfficeStoreyCount', () => {
    it('defaults to the 40-storey demo tower when absent', () => {
        expect(resolveOfficeStoreyCount({})).toBe(40);
        expect(resolveOfficeStoreyCount(null)).toBe(40);
    });

    it('reads stories / floors / levels (in priority order) as number or numeric string', () => {
        expect(resolveOfficeStoreyCount({ floors: 12 })).toBe(12);
        expect(resolveOfficeStoreyCount({ levels: '8' })).toBe(8);
        expect(resolveOfficeStoreyCount({ stories: 25 })).toBe(25);
        // floors wins over levels/stories.
        expect(resolveOfficeStoreyCount({ floors: 5, levels: 9, stories: 30 })).toBe(5);
    });

    it('clamps to [1, 40]', () => {
        expect(resolveOfficeStoreyCount({ floors: 0 })).toBe(40);   // 0 ⇒ ignored ⇒ default
        expect(resolveOfficeStoreyCount({ floors: -3 })).toBe(40);  // <0 ⇒ ignored ⇒ default
        expect(resolveOfficeStoreyCount({ floors: 99 })).toBe(40);  // clamp high
        expect(resolveOfficeStoreyCount({ floors: 1 })).toBe(1);    // clamp low edge
    });
});
