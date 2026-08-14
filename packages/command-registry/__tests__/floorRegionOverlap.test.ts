/**
 * §C83-S5 — the PREDICATE suite for "two floor finishes over one floor area".
 *
 * This file proves the rule can FIRE and — the half C83 §5.1(2) marks
 * unskippable — that it can STAY QUIET. A rule proven only able to fire has
 * been proven half a rule; the silence is the property users actually
 * experience, and a validator that interrupts a correct gesture gets muted,
 * which is strictly worse than never having shipped.
 *
 * The SURFACE half — that the refusal reaches the DOM rather than a return
 * value — is `apps/editor/__tests__/FloorFinishGateSurfacing.test.ts`. Neither
 * file is sufficient alone, and that separation is deliberate.
 */

import { describe, it, expect } from 'vitest';
import {
    evaluateFloorFinishPlacement,
    floorRegionRefusalText,
    FLOOR_REGION_REFUSAL_CODES,
    MIN_REPORTABLE_FLOOR_OVERLAP_M2,
    type ExistingFloorRegion,
} from '../src/floors/FloorRegionOverlap';

const L0 = 'level-0';

/** A 6 m × 4 m room-sized ring at the origin. */
function rect(x0: number, z0: number, x1: number, z1: number) {
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}

/** The founder's fixture: one big oak finish over the whole undivided area. */
function bigOakFinish(): ExistingFloorRegion {
    return {
        id: 'floor_big_oak',
        levelId: L0,
        polygon: rect(0, 0, 6, 4),
        label: 'Oak plank',
        systemTypeId: 'ft_oak',
        hostRoomId: 'room_original',
    };
}

describe('§C83-S5 — the rule FIRES on the founder\'s reported sequence', () => {
    it('a new finish drawn inside an already-finished area is REFUSED', () => {
        // Two partitions have just split the area; the user clicks in the new
        // left-hand room and asks for a different finish. The big oak finish
        // still covers it — this is the exact gesture that silently produced an
        // overlapping rival in build 46232e2d.
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 2.5, 4) },
            [bigOakFinish()],
        );

        expect(verdict.valid).toBe(false);
        expect(verdict.violations).toHaveLength(1);
        expect(verdict.violations[0]!.code).toBe('FIN_REGION_ALREADY_FINISHED');
        expect(verdict.violations[0]!.existingFloorId).toBe('floor_big_oak');
        expect(verdict.undetermined).toHaveLength(0);
    });

    it('BOTH numbers are computed — the area claimed twice AND the area asked for', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 2.5, 4) },
            [bigOakFinish()],
        );
        const v = verdict.violations[0]!;
        expect(v.candidateAreaM2).toBeCloseTo(10, 6);   // 2.5 × 4
        expect(v.overlapAreaM2).toBeCloseTo(10, 6);     // fully inside the oak
        expect(v.overlapFraction).toBeCloseTo(1, 6);
    });

    it('the refusal text CARRIES the code and NAMES the existing finish', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 2.5, 4) },
            [bigOakFinish()],
        );
        const text = floorRegionRefusalText(verdict.violations, verdict.offers);

        expect(text).toMatch(/^\[FIN_REGION_ALREADY_FINISHED\]/);
        expect(text).toContain('Oak plank');
        expect(text).toContain('floor_big_oak');
        expect(text).toContain('10.000 m²');
        expect(text).toContain('100 %');
    });

    it('the OFFER is the founder\'s own alternative: change the existing finish', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 2.5, 4) },
            [bigOakFinish()],
        );
        expect(verdict.offers).toHaveLength(1);
        expect(verdict.offers[0]!.kind).toBe('change-existing-finish');
        expect(verdict.offers[0]!.targetFloorId).toBe('floor_big_oak');
        expect(floorRegionRefusalText(verdict.violations, verdict.offers))
            .toContain('change the finish already there');
    });

    it('a PARTIAL overlap fires too, and reports the partial fraction honestly', () => {
        // The candidate straddles the oak's right edge: 1 m of its 3 m width is
        // already finished. The rule must not need total containment.
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(5, 0, 8, 4) },
            [bigOakFinish()],
        );
        expect(verdict.valid).toBe(false);
        const v = verdict.violations[0]!;
        expect(v.candidateAreaM2).toBeCloseTo(12, 6);
        expect(v.overlapAreaM2).toBeCloseTo(4, 6);
        expect(v.overlapFraction).toBeCloseTo(1 / 3, 6);
    });

    it('multiple existing finishes are all named, largest overlap first (deterministic)', () => {
        const small: ExistingFloorRegion = {
            id: 'floor_aaa_small', levelId: L0, polygon: rect(0, 0, 1, 1), label: 'Tile',
        };
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 6, 4) },
            [small, bigOakFinish()],
        );
        expect(verdict.violations.map((v) => v.existingFloorId))
            .toEqual(['floor_big_oak', 'floor_aaa_small']);
        const text = floorRegionRefusalText(verdict.violations, verdict.offers);
        expect(text).toContain('2 finishes already cover');
    });
});

describe('§C83-S5 SILENCE — the negative controls C83 §5.1(2) will not let me skip', () => {
    it('drawing a finish in a room that has NONE is completely silent', () => {
        // The headline silence case from the brief. No existing finish at all.
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 6, 4) },
            [],
        );
        expect(verdict.valid).toBe(true);
        expect(verdict.violations).toHaveLength(0);
        expect(verdict.undetermined).toHaveLength(0);
        expect(verdict.offers).toHaveLength(0);
    });

    it('two ADJACENT finishes sharing an edge are silent — this is the normal case', () => {
        // After the L-240 inner-face inset, two rooms either side of one
        // partition produce finishes that meet but do not overlap. If this
        // fires, every correctly-drawn plan in the product screams.
        const left: ExistingFloorRegion = { id: 'floor_left', levelId: L0, polygon: rect(0, 0, 3, 4) };
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(3, 0, 6, 4) },
            [left],
        );
        expect(verdict.valid).toBe(true);
        expect(verdict.violations).toHaveLength(0);
    });

    it('two finishes separated by a partition\'s thickness are silent', () => {
        const left: ExistingFloorRegion = { id: 'floor_left', levelId: L0, polygon: rect(0, 0, 2.9, 4) };
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(3.1, 0, 6, 4) },
            [left],
        );
        expect(verdict.valid).toBe(true);
    });

    it('a finish on ANOTHER LEVEL is silent — every storey of every tower depends on this', () => {
        const upstairs: ExistingFloorRegion = {
            id: 'floor_l1', levelId: 'level-1', polygon: rect(0, 0, 6, 4), label: 'Oak plank',
        };
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 6, 4) },
            [upstairs],
        );
        expect(verdict.valid).toBe(true);
        expect(verdict.violations).toHaveLength(0);
    });

    it('a finish does NOT refuse ITSELF when its own boundary is re-proposed', () => {
        // The floor-side form of canPlace's excludeId self-conflict defect. A
        // boundary edit re-checks the same ring; without the exclusion it would
        // refuse a 100 % overlap with itself, and the follow-the-wall re-projection
        // (§C79-5.2) would become unusable.
        const verdict = evaluateFloorFinishPlacement(
            { id: 'floor_big_oak', levelId: L0, polygon: rect(0, 0, 6, 4) },
            [bigOakFinish()],
        );
        expect(verdict.valid).toBe(true);
        expect(verdict.violations).toHaveLength(0);
    });

    it('a distant finish is silent (the bounding-box arm is a real answer, not a skip)', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(100, 100, 106, 104) },
            [bigOakFinish()],
        );
        expect(verdict.valid).toBe(true);
        expect(verdict.undetermined).toHaveLength(0);
    });

    it('NEAR-MISS: an overlap one tolerance BELOW the declared floor is silent', () => {
        // 6 m × 1 mm = 0.006 m², under MIN_REPORTABLE_FLOOR_OVERLAP_M2.
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 3.999, 6, 8) },
            [bigOakFinish()],
        );
        expect(MIN_REPORTABLE_FLOOR_OVERLAP_M2).toBe(0.01);
        expect(verdict.valid).toBe(true);
    });

    it('NEAR-MISS: an overlap just ABOVE the declared floor DOES fire', () => {
        // 6 m × 5 mm = 0.03 m², over the floor. The pair above and this one are
        // the tolerance's two sides, so the number is pinned by behaviour.
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 3.995, 6, 8) },
            [bigOakFinish()],
        );
        expect(verdict.valid).toBe(false);
        expect(verdict.violations[0]!.overlapAreaM2).toBeCloseTo(0.03, 4);
    });
});

describe('§C83-S5 — "not checked" is NEVER reported as "checked and clear"', () => {
    it('a degenerate CANDIDATE is undetermined, not a pass and not a refusal', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }] },
            [bigOakFinish()],
        );
        expect(verdict.valid).toBe(true);              // nothing is refused …
        expect(verdict.violations).toHaveLength(0);
        expect(verdict.undetermined).toHaveLength(1);  // … but the gap is REPORTED
        expect(verdict.undetermined[0]!.reason).toBe('CANDIDATE_REGION_DEGENERATE');
        expect(verdict.undetermined[0]!.existingFloorId).toBeNull();
    });

    it('a zero-area CANDIDATE is undetermined', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 6, z: 0 }] },
            [bigOakFinish()],
        );
        expect(verdict.undetermined[0]!.reason).toBe('CANDIDATE_REGION_DEGENERATE');
    });

    it('a degenerate EXISTING finish is undetermined ABOUT THAT ONE, and the rest still evaluate', () => {
        const broken: ExistingFloorRegion = { id: 'floor_broken', levelId: L0, polygon: [{ x: 1, z: 1 }] };
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 2.5, 4) },
            [broken, bigOakFinish()],
        );
        expect(verdict.undetermined).toHaveLength(1);
        expect(verdict.undetermined[0]!.existingFloorId).toBe('floor_broken');
        expect(verdict.undetermined[0]!.reason).toBe('EXISTING_REGION_DEGENERATE');
        // The healthy comparison is unaffected — an unanswerable pair must not
        // suppress an answerable one.
        expect(verdict.valid).toBe(false);
        expect(verdict.violations[0]!.existingFloorId).toBe('floor_big_oak');
    });

    it('a self-intersecting EXISTING ring is undetermined, never a refusal', () => {
        // The boolean REFUSES on a bow-tie. C83 §5.3: a question nobody answered
        // may not refuse anything.
        const bowtie: ExistingFloorRegion = {
            id: 'floor_bowtie',
            levelId: L0,
            polygon: [{ x: 0, z: 0 }, { x: 4, z: 4 }, { x: 4, z: 0 }, { x: 0, z: 4 }],
        };
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(1, 1, 3, 3) },
            [bowtie],
        );
        expect(verdict.violations).toHaveLength(0);
        expect(verdict.valid).toBe(true);
        expect(verdict.undetermined).toHaveLength(1);
        expect(verdict.undetermined[0]!.reason).toBe('REGION_BOOLEAN_REFUSED');
    });

    it('a non-finite ordinate is undetermined, never NaN-through', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: [{ x: 0, z: 0 }, { x: Number.NaN, z: 0 }, { x: 3, z: 3 }] },
            [bigOakFinish()],
        );
        expect(verdict.undetermined[0]!.reason).toBe('CANDIDATE_REGION_DEGENERATE');
        expect(verdict.violations).toHaveLength(0);
    });
});

describe('§C83-S5 — the refusal vocabulary obeys §1.4\'s structural rules', () => {
    it('the roster is the closed union, exactly', () => {
        expect([...FLOOR_REGION_REFUSAL_CODES]).toEqual(['FIN_REGION_ALREADY_FINISHED']);
    });

    it('a refusal with NO violations is reported AS unidentified, never smoothed over', () => {
        const text = floorRegionRefusalText([], []);
        expect(text).toMatch(/^\[FIN_UNIDENTIFIED\]/);
        expect(text).toContain('that omission is the defect');
    });

    it('every rendered refusal begins with its code in brackets', () => {
        const verdict = evaluateFloorFinishPlacement(
            { levelId: L0, polygon: rect(0, 0, 2.5, 4) },
            [bigOakFinish()],
        );
        for (const code of FLOOR_REGION_REFUSAL_CODES) {
            expect(floorRegionRefusalText(verdict.violations, verdict.offers))
                .toMatch(new RegExp(`^\\[${code}\\]`));
        }
    });
});
