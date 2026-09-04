/**
 * §RESI-ORCH-TARGET-AREA (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §5) — *"I want ~120 m² on the ground
 * floor."*
 *
 * ⭐ WHAT THESE ARMS ARE FOR. §5's ask is not really "solve an inset" — that is the easy half and
 * `insetPolygonPerEdge` already does it. The ask is **the refusal**: *"refuse with BOTH numbers when
 * it exceeds the permitted footprint."* A suite that only proved "a target of 60 m² inside a 100 m²
 * footprint returns a ring" would pass just as happily over the three failures that would make this
 * feature actively harmful:
 *
 *   1. SILENT CLIPPING. Asking for 500 m² on a 92 m² parcel and receiving a 92 m² plate with no
 *      complaint is how a user comes to believe they asked for 500 and got it. So the arms assert
 *      that the over-ask REFUSES, that both numbers appear in the sentence, and that no ring is
 *      returned at all.
 *   2. ECHOING THE TARGET BACK AS THOUGH IT WERE ACHIEVED. An erosion cannot hit an arbitrary area
 *      exactly on an arbitrary polygon; `achievedAreaM2` is measured from the returned ring, and an
 *      arm re-measures that ring independently to make sure the two agree.
 *   3. ONE SENTENCE FOR FIVE DIFFERENT SITUATIONS. "No permitted footprint", "not a number",
 *      "not positive", "over the limit" and "the shape will not shrink that far" demand different
 *      next actions from the user, so they are asserted to be distinguishable — by `reason` AND by
 *      wording, because only the wording reaches the screen.
 */

import { describe, it, expect } from 'vitest';

import {
    solveTargetFootprintArea,
    type TargetFootprintResult,
} from '../targetFootprintAreaSolver';

/** A 20 × 20 m square: 400 m², an easy shape for an erosion to work on. */
const SQUARE = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 20 },
    { x: 0, z: 20 },
];

/** Independent shoelace — deliberately NOT imported from the solver, so an arm that says "the ring
 *  really is that big" is measuring, not restating. */
function area(ring: ReadonlyArray<{ x: number; z: number }>): number {
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twice += a.x * b.z - b.x * a.z;
    }
    return Math.abs(twice) / 2;
}

function refusal(r: TargetFootprintResult) {
    if (r.ok) throw new Error('expected a refusal, got a proposal');
    return r;
}
function proposal(r: TargetFootprintResult) {
    if (!r.ok) throw new Error(`expected a proposal, got refusal ${r.reason}: ${r.statement}`);
    return r;
}

describe('§RESI-ORCH-TARGET-AREA — the refusal §5 actually asks for', () => {
    it('REFUSES an over-ask, and the sentence carries BOTH numbers', () => {
        const r = refusal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: 900,
            }),
        );
        expect(r.reason).toBe('exceeds-permitted-footprint');
        expect(r.targetAreaM2).toBe(900);
        expect(r.permittedAreaM2).toBe(400);
        // Both numbers, in words, on the screen — not just on the object.
        expect(r.statement).toContain('900');
        expect(r.statement).toContain('400');
        // …and the gap, because "how much over?" is the user's next question.
        expect(r.statement).toContain('500');
    });

    it('does NOT quietly clip an over-ask down to what fits', () => {
        const r = solveTargetFootprintArea({
            permittedRing: SQUARE,
            permittedAreaM2: 400,
            targetAreaM2: 900,
        });
        expect(r.ok).toBe(false);
        // No ring is reachable on a refusal — the type says so, and this pins it against a future
        // "helpful" change that attaches the permitted ring to the refusal for convenience.
        expect((r as unknown as { ring?: unknown }).ring).toBeUndefined();
    });

    it('names five DIFFERENT situations with five different sentences', () => {
        const noFootprint = refusal(
            solveTargetFootprintArea({ permittedRing: [], permittedAreaM2: 0, targetAreaM2: 120 }),
        );
        const notANumber = refusal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: 'soon',
            }),
        );
        const notPositive = refusal(
            solveTargetFootprintArea({ permittedRing: SQUARE, permittedAreaM2: 400, targetAreaM2: -5 }),
        );
        const over = refusal(
            solveTargetFootprintArea({ permittedRing: SQUARE, permittedAreaM2: 400, targetAreaM2: 900 }),
        );
        const reasons = [noFootprint.reason, notANumber.reason, notPositive.reason, over.reason];
        expect(new Set(reasons).size).toBe(4);
        const sentences = [
            noFootprint.statement,
            notANumber.statement,
            notPositive.statement,
            over.statement,
        ];
        expect(new Set(sentences).size).toBe(4);
    });

    it('refuses without a permitted footprint, and does NOT invent one to measure against', () => {
        const r = refusal(
            solveTargetFootprintArea({ permittedRing: [], permittedAreaM2: 0, targetAreaM2: 120 }),
        );
        expect(r.reason).toBe('no-permitted-footprint');
        expect(r.permittedAreaM2).toBeNull();
        expect(r.statement).toMatch(/buildable footprint/i);
    });

    it('treats an empty field as "not a number" and still states the ceiling', () => {
        const r = refusal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: null,
            }),
        );
        expect(r.reason).toBe('target-not-a-number');
        // Even a "type something" message carries the permitted figure — a user who can see the
        // ceiling before they type usually never needs to be refused at all.
        expect(r.statement).toContain('400');
    });

    it('decides the LAW refusal before any geometry runs', () => {
        // A degenerate 2-vertex "ring" with a stated permitted area is contradictory input; the
        // no-footprint arm must win, and an over-ask on a real ring must be refused as an over-ask
        // rather than as whatever the erosion would have done first.
        const r = refusal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: 1e9,
            }),
        );
        expect(r.reason).toBe('exceeds-permitted-footprint');
    });
});

describe('§RESI-ORCH-TARGET-AREA — the proposal', () => {
    it('fits a smaller target inside the permitted footprint', () => {
        const p = proposal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: 100,
            }),
        );
        expect(p.ring.length).toBeGreaterThanOrEqual(3);
        expect(p.insetM).toBeGreaterThan(0);
        // Within the solver's own tolerance of the ask.
        expect(Math.abs(p.achievedAreaM2 - 100)).toBeLessThanOrEqual(1);
    });

    it('reports the area of the ring it actually returned — measured independently', () => {
        const p = proposal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: 144,
            }),
        );
        // The claim and the geometry agree. This is the arm that catches "echo the target back".
        expect(Math.abs(area(p.ring) - p.achievedAreaM2)).toBeLessThan(0.01);
    });

    it('never returns a plate LARGER than the permitted footprint', () => {
        for (const target of [1, 25, 100, 250, 399]) {
            const p = proposal(
                solveTargetFootprintArea({
                    permittedRing: SQUARE,
                    permittedAreaM2: 400,
                    targetAreaM2: target,
                }),
            );
            expect(area(p.ring), `target ${target}`).toBeLessThanOrEqual(400.5);
        }
    });

    it('treats "the whole permitted footprint" as a zero erosion, not a search', () => {
        const p = proposal(
            solveTargetFootprintArea({
                permittedRing: SQUARE,
                permittedAreaM2: 400,
                targetAreaM2: 400,
            }),
        );
        expect(p.insetM).toBe(0);
        expect(p.achievedAreaM2).toBe(400);
        expect(area(p.ring)).toBeCloseTo(400, 6);
    });

    it('says it is a STUDY, never a permit — on every proposal', () => {
        for (const target of [50, 200, 400]) {
            const p = proposal(
                solveTargetFootprintArea({
                    permittedRing: SQUARE,
                    permittedAreaM2: 400,
                    targetAreaM2: target,
                }),
            );
            expect(p.statement.toLowerCase(), `target ${target}`).toMatch(/study|not a permit/);
        }
    });

    it('is deterministic — the same question twice gives byte-identical geometry', () => {
        const a = proposal(
            solveTargetFootprintArea({ permittedRing: SQUARE, permittedAreaM2: 400, targetAreaM2: 137 }),
        );
        const b = proposal(
            solveTargetFootprintArea({ permittedRing: SQUARE, permittedAreaM2: 400, targetAreaM2: 137 }),
        );
        expect(a.insetM).toBe(b.insetM);
        expect(JSON.stringify(a.ring)).toBe(JSON.stringify(b.ring));
    });

    it('is winding-independent — a clockwise ring answers the same as its reverse', () => {
        const cw = [...SQUARE].reverse();
        const a = proposal(
            solveTargetFootprintArea({ permittedRing: SQUARE, permittedAreaM2: 400, targetAreaM2: 121 }),
        );
        const b = proposal(
            solveTargetFootprintArea({ permittedRing: cw, permittedAreaM2: 400, targetAreaM2: 121 }),
        );
        expect(Math.abs(a.achievedAreaM2 - b.achievedAreaM2)).toBeLessThan(1);
    });

    it('never throws, whatever it is handed', () => {
        const junk: unknown[] = [undefined, null, NaN, Infinity, '', 'abc', {}, [], true, false, -0];
        for (const t of junk) {
            expect(
                () =>
                    solveTargetFootprintArea({
                        permittedRing: SQUARE,
                        permittedAreaM2: 400,
                        targetAreaM2: t,
                    }),
                String(t),
            ).not.toThrow();
        }
        expect(() =>
            solveTargetFootprintArea({
                permittedRing: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }],
                permittedAreaM2: 12,
                targetAreaM2: 5,
            }),
        ).not.toThrow();
    });
});
