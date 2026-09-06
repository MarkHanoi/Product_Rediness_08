/**
 * §TOBE-ALLOCATION (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.2) — *"We should let the user know
 * that only in first floor he will be able to build 120 sqm."*
 *
 * ⭐ THE FOUNDER'S WORKED EXAMPLE IS THE ACCEPTANCE TEST, and it is asserted literally: plot
 * 1,200 m², ground implantation 200 m², total BRUT 320 m². Take 200 on the ground and the model
 * must say **120 m² remains** — as a number a panel can render and as a sentence a user can read.
 *
 * ⛔ WHAT THIS SUITE IS REALLY GUARDING. A suite that only proved "320 − 200 = 120" would pass
 * over the four failures that make this feature actively harmful:
 *
 *   1. UNKNOWN RENDERED AS ZERO. An ordinance with no FAR and no derived storey count has NO
 *      total — and "0 m² remains" is the opposite advice from "PRYZM does not know". These are
 *      pinned as different values (`null` vs a number) AND different sentences.
 *   2. SILENT CLIPPING. Asking for 400 m² where 120 m² is left must REFUSE with both numbers and
 *      allocate NOTHING — not quietly hand back 120 and let the user believe they got 400.
 *   3. THE WRONG REFUSAL. Over-running the FOOTPRINT and over-running the REMAINDER send the user
 *      to change different things, so they must be distinguishable by reason AND by wording.
 *   4. ORDER-INDEPENDENCE. The first floor's ceiling must reflect what the ground floor already
 *      took. A model that computed every storey against the untouched total would tell the user
 *      they may build 200 m² upstairs when only 120 m² exists — the exact sentence §25.2 asks for,
 *      inverted.
 */

import { describe, it, expect } from 'vitest';

import {
    resolveBrutAllowance,
    buildBrutAllocation,
    ALLOCATION_TOLERANCE_M2,
    type AllocationStorey,
} from '../brutAreaAllocation';

/** The founder's parcel: 1,200 m² plot, 200 m² implantation, 320 m² BRUT (FAR 0.2667). */
const FOUNDER_ALLOWANCE = resolveBrutAllowance({
    permittedFootprintM2: 200,
    maxFAR: 320 / 1200,
    parcelAreaM2: 1200,
    maxFloors: null,
});

const GROUND: AllocationStorey = { levelId: 'L0', name: 'Ground', elevation: 0 };
const FIRST: AllocationStorey = { levelId: 'L1', name: 'Level 1', elevation: 3 };
const SECOND: AllocationStorey = { levelId: 'L2', name: 'Level 2', elevation: 6 };

describe('§25.2 — the founder\'s worked example, asserted literally', () => {
    it('⭐ 1200 m² plot · 200 m² implantation · 320 m² BRUT — taking 200 on the ground leaves 120', () => {
        expect(FOUNDER_ALLOWANCE.groundCeilingM2).toBe(200);
        expect(FOUNDER_ALLOWANCE.totalBrutM2).toBeCloseTo(320, 6);

        const model = buildBrutAllocation(
            FOUNDER_ALLOWANCE,
            [GROUND, FIRST],
            [{ levelId: 'L0', requestedM2: 200 }],
        );

        expect(model.allocatedM2).toBe(200);
        expect(model.remainingM2).toBeCloseTo(120, 6);
        // ⭐ THE SENTENCE THE PANEL RENDERS — the founder's own arithmetic, in words.
        expect(model.statement).toContain('120 m² remains for the floors above');

        // And the first floor's own row must carry 120 as its CEILING, not the 200 the footprint
        // would allow — that is the whole of §25.2's "TELL THEM".
        const first = model.rows.find((r) => r.levelId === 'L1');
        expect(first?.ceilingM2).toBeCloseTo(120, 6);
        expect(first?.ceilingSource).toBe('remaining-brut');
        expect(first?.statement).toContain('120');
    });

    it('the user then picks 120 or 100 on the first floor — both are accepted, and the remainder follows', () => {
        const at120 = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 120 },
        ]);
        expect(at120.allocatedM2).toBeCloseTo(320, 6);
        expect(at120.remainingM2).toBeCloseTo(0, 6);
        expect(at120.statement).toContain('Nothing remains');

        const at100 = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND, FIRST, SECOND], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 100 },
        ]);
        expect(at100.allocatedM2).toBeCloseTo(300, 6);
        expect(at100.remainingM2).toBeCloseTo(20, 6);
        // The storey above now knows it may only take 20.
        expect(at100.rows.find((r) => r.levelId === 'L2')?.ceilingM2).toBeCloseTo(20, 6);
    });

    it('⛔ asking for MORE than remains REFUSES with both numbers and allocates nothing', () => {
        const model = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 180 },
        ]);
        const first = model.rows.find((r) => r.levelId === 'L1')!;
        expect(first.refusal).toBe('exceeds-remaining-brut');
        expect(first.allocatedM2).toBeNull();
        // BOTH numbers, plus the total it was decided from.
        expect(first.statement).toContain('180');
        expect(first.statement).toContain('120');
        expect(first.statement).toContain('320');
        // ⛔ NOT SILENTLY CLIPPED — the refused storey consumed nothing.
        expect(model.allocatedM2).toBe(200);
        expect(model.remainingM2).toBeCloseTo(120, 6);
    });
});

describe('§25.2 — the two allowances are different questions', () => {
    it('⛔ over-running the FOOTPRINT is a different refusal from over-running the REMAINDER', () => {
        // 400 m² exceeds BOTH the 200 m² footprint and the 320 m² total. The footprint refusal
        // must win, because "no storey may overhang the buildable footprint" is what the user has
        // to change; being told about a BRUT total would send them to fix the wrong thing.
        const model = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND], [
            { levelId: 'L0', requestedM2: 400 },
        ]);
        const ground = model.rows[0]!;
        expect(ground.refusal).toBe('exceeds-footprint-ceiling');
        expect(ground.statement).toContain('400');
        expect(ground.statement).toContain('200');
        expect(ground.statement).toContain('overhang');
    });

    it('the FAR route and the geometry route are both carried, and the SMALLER binds', () => {
        // FAR says 320; 200 m² over 4 storeys says 800. FAR binds.
        const farBinds = resolveBrutAllowance({
            permittedFootprintM2: 200, maxFAR: 320 / 1200, parcelAreaM2: 1200, maxFloors: 4,
        });
        expect(farBinds.totalSource).toBe('far');
        expect(farBinds.totalBrutM2).toBeCloseTo(320, 6);
        expect(farBinds.geometryRouteM2).toBeCloseTo(800, 6);

        // FAR says 2400; 200 m² over 2 storeys says 400. Geometry binds, and says so.
        const geomBinds = resolveBrutAllowance({
            permittedFootprintM2: 200, maxFAR: 2, parcelAreaM2: 1200, maxFloors: 2,
        });
        expect(geomBinds.totalSource).toBe('far-capped-by-geometry');
        expect(geomBinds.totalBrutM2).toBeCloseTo(400, 6);
        expect(geomBinds.farRouteM2).toBeCloseTo(2400, 6);
        expect(geomBinds.statement).toContain('2400');
        expect(geomBinds.statement).toContain('400');
    });

    it('⚠ footprint × storeys is labelled as a GEOMETRIC product, never as a stated BRUT limit', () => {
        const noFar = resolveBrutAllowance({
            permittedFootprintM2: 355, maxFAR: null, parcelAreaM2: 612, maxFloors: 4,
        });
        expect(noFar.totalSource).toBe('footprint-times-storeys');
        expect(noFar.totalBrutM2).toBeCloseTo(1420, 6);
        expect(noFar.statement).toContain('publishes no floor-area ratio');
        expect(noFar.statement).toContain('what the massing can HOLD');
    });
});

describe('⛔ UNKNOWN IS NEVER ZERO — the §CONTEXT-DATA-HONESTY arm', () => {
    it('no FAR and no storey count ⇒ remaining is null, and the sentence refuses to guess', () => {
        const allowance = resolveBrutAllowance({
            permittedFootprintM2: 200, maxFAR: null, parcelAreaM2: 1200, maxFloors: null,
        });
        expect(allowance.totalBrutM2).toBeNull();
        expect(allowance.totalAbsentReason).toBe('no-far-no-storeys');
        // The GROUND ceiling still exists — one unknown does not erase the other answer.
        expect(allowance.groundCeilingM2).toBe(200);

        const model = buildBrutAllocation(allowance, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 150 },
        ]);
        expect(model.allocatedM2).toBe(150);
        // ⛔ null, NOT 0.
        expect(model.remainingM2).toBeNull();
        expect(model.statement).toContain('does not know the TOTAL');
        expect(model.statement).not.toContain('0 m² remains');

        const first = model.rows.find((r) => r.levelId === 'L1')!;
        expect(first.ceilingSource).toBe('footprint-ceiling-total-unknown');
        expect(first.ceilingM2).toBe(200);
        expect(first.statement).toContain('does not know the total');
    });

    it('no permitted footprint ⇒ neither allowance, and the sentence says it is a GAP not a finding', () => {
        const allowance = resolveBrutAllowance({
            permittedFootprintM2: null, maxFAR: 1, parcelAreaM2: 1200, maxFloors: 3,
        });
        expect(allowance.totalBrutM2).toBeNull();
        expect(allowance.groundCeilingM2).toBeNull();
        expect(allowance.totalAbsentReason).toBe('no-permitted-footprint');
        expect(allowance.statement).toContain('NOT a finding that nothing may be built');

        const model = buildBrutAllocation(allowance, [GROUND], []);
        expect(model.rows[0]!.ceilingM2).toBeNull();
        expect(model.rows[0]!.ceilingSource).toBe('unknown');
        expect(model.remainingM2).toBeNull();
    });

    it('zero remaining IS a finding and reads differently from unknown', () => {
        const model = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 120 },
        ]);
        expect(model.remainingM2).toBeCloseTo(0, 6);
        expect(model.statement).toContain('Nothing remains for further floors');
        expect(model.statement).not.toContain('does not know');
    });
});

describe('the input is classified, never trusted', () => {
    it('garbage in a storey field refuses by its own reason and allocates nothing', () => {
        const model = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 'not a number' },
            { levelId: 'L1', requestedM2: -5 },
        ]);
        expect(model.rows[0]!.refusal).toBe('not-a-number');
        expect(model.rows[1]!.refusal).toBe('not-positive');
        expect(model.allocatedM2).toBe(0);
        // Still tells the user what COULD go there — a refusal that withholds the ceiling makes
        // the next attempt another guess.
        expect(model.rows[0]!.statement).toContain('200');
    });

    it('a request naming a storey the project does not have is COUNTED, never silently dropped', () => {
        const model = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND], [
            { levelId: 'L0', requestedM2: 100 },
            { levelId: 'L9-does-not-exist', requestedM2: 50 },
        ]);
        expect(model.unknownStoreyRequests).toBe(1);
        expect(model.allocatedM2).toBe(100);
    });

    it('never throws on hostile input', () => {
        expect(() => buildBrutAllocation(
            resolveBrutAllowance({
                permittedFootprintM2: Number.NaN, maxFAR: Number.POSITIVE_INFINITY,
                parcelAreaM2: -1, maxFloors: 0,
            }),
            [{ levelId: '', name: null, elevation: null }],
            [{ levelId: '', requestedM2: {} }],
        )).not.toThrow();
    });
});

describe('order is load-bearing: the lower storey is subtracted first', () => {
    it('storeys are processed lowest-first regardless of the order they are passed in', () => {
        const shuffled = buildBrutAllocation(FOUNDER_ALLOWANCE, [SECOND, FIRST, GROUND], [
            { levelId: 'L0', requestedM2: 200 },
        ]);
        expect(shuffled.rows.map((r) => r.levelId)).toEqual(['L0', 'L1', 'L2']);
        expect(shuffled.rows[1]!.ceilingM2).toBeCloseTo(120, 6);
    });

    it('an unelevated storey sorts last, deterministically', () => {
        const model = buildBrutAllocation(
            FOUNDER_ALLOWANCE,
            [{ levelId: 'Z', name: null, elevation: null }, GROUND],
            [],
        );
        expect(model.rows.map((r) => r.levelId)).toEqual(['L0', 'Z']);
    });
});

describe('the tolerance is one number, shared with the staleness gate', () => {
    it('a request within tolerance of the remainder is ACCEPTED, not refused on float wobble', () => {
        const model = buildBrutAllocation(FOUNDER_ALLOWANCE, [GROUND, FIRST], [
            { levelId: 'L0', requestedM2: 200 },
            { levelId: 'L1', requestedM2: 120 + ALLOCATION_TOLERANCE_M2 * 0.9 },
        ]);
        expect(model.rows[1]!.refusal).toBeNull();
    });
});
