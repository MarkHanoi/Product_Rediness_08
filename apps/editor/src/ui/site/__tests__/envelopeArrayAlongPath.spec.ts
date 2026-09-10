// §ARRAY-ALONG-PATH — the generator's binding spec (ADR-0386).
//
// ⛔ THESE ASSERT AGAINST THE THING THIS LANE CHANGED, not against a sibling that happens to agree.
// Tonight a spec in this repository measured a NEIGHBOURING code path and stayed green while its
// subject was broken; every case below reads `buildEnvelopeArrayAlongPath`'s own return value.
//
// ⭐ AND IT CARRIES A SCRAMBLE CONTROL (L-586). A generator that ignored the spine entirely — say,
// one that stacked N copies on the prototype — would satisfy "5 copies, right count, right area"
// and fail only the positional cases. The scramble block reverses and perturbs the spine and
// requires the ANSWER TO MOVE; if it does not, the tool is not reading its input.

import { describe, it, expect } from 'vitest';
import {
    buildEnvelopeArrayAlongPath,
    ENVELOPE_ARRAY_MIN_SPACING_M,
    isEnvelopeArrayOrientation,
    type ArrayPoint,
    type EnvelopeArrayInput,
    type EnvelopeArrayPlan,
} from '../envelopeArrayAlongPath';

/** A 10 × 10 m square centred on the origin. Vertex mean = area centroid = (0,0); area = 100 m². */
const SQUARE: readonly ArrayPoint[] = Object.freeze([
    { x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 },
]);

/** An INDEPENDENT shoelace, written here on purpose — the subject must not supply its own check. */
function area(ring: readonly ArrayPoint[]): number {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return Math.abs(s) / 2;
}

function mean(ring: readonly ArrayPoint[]): ArrayPoint {
    return {
        x: ring.reduce((t, p) => t + p.x, 0) / ring.length,
        z: ring.reduce((t, p) => t + p.z, 0) / ring.length,
    };
}

const base = (over: Partial<EnvelopeArrayInput> = {}): EnvelopeArrayInput => ({
    prototypeRing: SQUARE,
    prototypeAreaM2: 100,
    path: [{ x: 0, z: 0 }, { x: 50, z: 0 }],
    requestedSpacingM: 10,
    orientation: 'tangent',
    maxCopies: 23,
    ...over,
});

const ok = (r: ReturnType<typeof buildEnvelopeArrayAlongPath>): EnvelopeArrayPlan => {
    if (!r.ok) throw new Error(`expected a plan, got refusal ${r.reason}: ${r.statement}`);
    return r;
};

describe('§ARRAY-ALONG-PATH — D1: spacing is CENTRE-TO-CENTRE arc length', () => {
    it('places one copy per spacing along a straight spine, at the arc positions asked for', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base()));
        expect(plan.copies).toHaveLength(5);
        expect(plan.copies.map((c) => c.arcPositionM)).toEqual([10, 20, 30, 40, 50]);
        for (const c of plan.copies) {
            expect(mean(c.ring).x).toBeCloseTo(c.arcPositionM, 9);
            expect(mean(c.ring).z).toBeCloseTo(0, 9);
        }
        expect(plan.pathLengthM).toBeCloseTo(50, 9);
        expect(plan.statement).toContain('centre to centre');
    });

    it('measures the spacing as ARC length around a corner, not as straight-line distance', () => {
        // An L: 30 m east then 30 m north. A tool measuring chord distance would put copy 5 at a
        // different place entirely — 50 m of ARC is (30,20), 50 m of CHORD is nowhere near it.
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 30 }],
        })));
        expect(plan.copies).toHaveLength(6);
        expect(plan.pathLengthM).toBeCloseTo(60, 9);
        const c5 = plan.copies[4]!;
        expect(c5.arcPositionM).toBe(50);
        expect(c5.centre.x).toBeCloseTo(30, 9);
        expect(c5.centre.z).toBeCloseTo(20, 9);
    });
});

describe('§ARRAY-ALONG-PATH — D3: the prototype is profile #1 and is never duplicated', () => {
    it('emits no copy at arc 0', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base()));
        expect(plan.copies.every((c) => c.arcPositionM > 0)).toBe(true);
        expect(plan.copies[0]!.index).toBe(1);
        expect(plan.anchorCentre).toEqual({ x: 0, z: 0 });
        // The count sentence names the total INCLUDING the prototype, so the user is never
        // surprised by an off-by-one when the roster fills.
        expect(plan.statement).toContain('6 in total with the first envelope');
    });

    it('measures — and states — a spine whose first vertex is off the prototype centre', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 4, z: 0 }, { x: 54, z: 0 }],
        })));
        expect(plan.anchorOffsetM).toBeCloseTo(4, 9);
        expect(plan.statement).toContain('4 m from the first envelope');
        // ⛔ It is NOT silently re-anchored: the arc origin is still the spine's own first vertex.
        expect(plan.copies[0]!.centre.x).toBeCloseTo(14, 9);
    });
});

describe('§ARRAY-ALONG-PATH — D4: a partial fit is stated, never squeezed', () => {
    it('leaves the remainder as leftover and places no extra copy', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 45, z: 0 }],
        })));
        expect(plan.copies).toHaveLength(4);
        expect(plan.leftoverM).toBeCloseTo(5, 9);
        expect(plan.statement).toContain('5 m of spine is left over');
        // The last copy sits at 40 m — NOT nudged to 45 to "use up" the spine.
        expect(plan.copies[3]!.arcPositionM).toBe(40);
    });

    it('reports zero leftover without inventing a sentence about it', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base()));
        expect(plan.leftoverM).toBeCloseTo(0, 9);
        expect(plan.statement).not.toContain('left over');
    });
});

describe('§ARRAY-ALONG-PATH — D2: orientation is a disclosed choice, not a guess', () => {
    it('turns each copy to meet a bending spine when orientation is tangent', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 30 }],
            orientation: 'tangent',
        })));
        expect(plan.pathCurves).toBe(true);
        expect(plan.maxHeadingSwingDeg).toBeCloseTo(90, 6);
        const last = plan.copies[plan.copies.length - 1]!;
        expect(last.rotationRad).toBeCloseTo(Math.PI / 2, 9);
        // A rotation is RIGID — the copy is turned, not resized.
        expect(area(last.ring)).toBeCloseTo(100, 6);
    });

    it('keeps the prototype bearing on every copy when orientation is prototype', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 30 }],
            orientation: 'prototype',
        })));
        expect(plan.pathCurves).toBe(true);
        expect(plan.copies.every((c) => c.rotationRad === 0)).toBe(true);
        // Every copy is a pure TRANSLATION of the prototype.
        const last = plan.copies[plan.copies.length - 1]!;
        const c = mean(last.ring);
        for (let i = 0; i < SQUARE.length; i++) {
            expect(last.ring[i]!.x - c.x).toBeCloseTo(SQUARE[i]!.x, 9);
            expect(last.ring[i]!.z - c.z).toBeCloseTo(SQUARE[i]!.z, 9);
        }
    });

    it('⭐ produces the IDENTICAL drawing under both orientations on a straight spine', () => {
        // This is what licenses the surface to hide the choice: on a straight spine there is
        // nothing to choose, and a control offered there would teach the user the two differ.
        const t = ok(buildEnvelopeArrayAlongPath(base({ orientation: 'tangent' })));
        const p = ok(buildEnvelopeArrayAlongPath(base({ orientation: 'prototype' })));
        expect(t.pathCurves).toBe(false);
        expect(p.pathCurves).toBe(false);
        expect(t.copies.map((c) => c.ring)).toEqual(p.copies.map((c) => c.ring));
        expect(t.statement).toContain('the two orientation options are the same drawing here');
    });

    it('does not call a 0.5° survey wobble a bend', () => {
        const wobble = Math.tan((0.5 * Math.PI) / 180) * 50;
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 25, z: 0 }, { x: 50, z: wobble / 2 }],
        })));
        expect(plan.pathCurves).toBe(false);
    });
});

describe('§ARRAY-ALONG-PATH — the area travels from ONE producer', () => {
    it('carries the prototype figure onto every copy rather than recomputing it', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base({ prototypeAreaM2: 100.25 })));
        // ⛔ 100.25 is deliberately NOT this square's true area. The copies must repeat the figure
        // the producer stated, because a second area routine is how a roster comes to disagree
        // with itself (C84 EI-9). A generator that "helpfully" recomputed would return 100 here.
        expect(plan.copies.every((c) => c.areaM2 === 100.25)).toBe(true);
    });
});

describe('§ARRAY-ALONG-PATH — refusals name both numbers and the route back', () => {
    const cases: Array<[string, Partial<EnvelopeArrayInput>, string, string]> = [
        ['no prototype', { prototypeRing: null }, 'no-prototype', 'Draw one profile'],
        ['degenerate prototype', { prototypeRing: [{ x: 0, z: 0 }, { x: 0, z: 0 }] },
            'degenerate-prototype', 'at least 3'],
        ['unstated area', { prototypeAreaM2: null }, 'no-prototype-area', 'never stated'],
        ['no spine', { path: [] }, 'no-path', 'Draw the spine'],
        ['dead spine', { path: [{ x: 1, z: 1 }, { x: 1, z: 1 }] }, 'degenerate-path', 'same spot'],
        ['spacing text', { requestedSpacingM: 'wide' }, 'spacing-not-a-number', 'not a number'],
        ['spacing zero', { requestedSpacingM: 0 }, 'spacing-not-positive', 'on top of the first'],
        ['spacing under floor', { requestedSpacingM: 0.05 }, 'spacing-below-floor', 'never refused'],
        ['spacing past the spine', { requestedSpacingM: 80 }, 'spacing-exceeds-path', '80 m'],
        ['roster full', { maxCopies: 0 }, 'no-room-for-copies', 'no room'],
    ];
    for (const [name, over, reason, phrase] of cases) {
        it(`refuses "${name}" as ${reason}`, () => {
            const r = buildEnvelopeArrayAlongPath(base(over));
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.reason).toBe(reason);
            expect(r.statement).toContain(phrase);
        });
    }

    it('names BOTH figures when the spacing outruns the spine', () => {
        const r = buildEnvelopeArrayAlongPath(base({ requestedSpacingM: 80 }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.statement).toContain('50 m long');
        expect(r.statement).toContain('80 m');
    });

    it('states the floor as a degeneracy guard and NOT as an overlap opinion', () => {
        const r = buildEnvelopeArrayAlongPath(base({ requestedSpacingM: 0.05 }));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.statement).toContain(`${ENVELOPE_ARRAY_MIN_SPACING_M} m floor`);
        expect(r.statement).toContain('advisory');
    });
});

describe('§ARRAY-ALONG-PATH — truncation carries both numbers', () => {
    it('places what the roster can hold and says what it could not', () => {
        const plan = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 200, z: 0 }],
            maxCopies: 4,
        })));
        expect(plan.copies).toHaveLength(4);
        expect(plan.truncatedBy).toBe(16);
        expect(plan.statement).toContain('20 would fit');
        expect(plan.statement).toContain('room for 4');
    });
});

describe('§ARRAY-ALONG-PATH — ⭐ SCRAMBLE CONTROL (L-586)', () => {
    it('moves every copy when the spine is reversed', () => {
        // ⚠ THE LEGS ARE DELIBERATELY UNEQUAL (37 / 29). A SYMMETRIC L is the wrong control here
        // and this spec was written with one first: on 30/30 the copy at the corner sits at the
        // same arc position from either end, so a genuinely correct generator moves 5 of 6 and the
        // "every copy moves" assertion fails for a reason that is geometry, not a defect. Naming
        // that beats loosening the assertion — a control that has to be weakened to pass is not a
        // control any more.
        const forward = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 37, z: 0 }, { x: 37, z: 29 }],
        })));
        const reversed = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 37, z: 29 }, { x: 37, z: 0 }, { x: 0, z: 0 }],
        })));
        expect(forward.copies).toHaveLength(reversed.copies.length);
        const differing = forward.copies.filter((c, i) => {
            const o = reversed.copies[i]!;
            return Math.hypot(c.centre.x - o.centre.x, c.centre.z - o.centre.z) > 1e-6;
        });
        // Every one of the six must move — a generator ignoring the spine would move none.
        expect(differing).toHaveLength(forward.copies.length);
    });

    it('moves the answer when the spine is perturbed, and does not when it is not', () => {
        const control = ok(buildEnvelopeArrayAlongPath(base()));
        const perturbed = ok(buildEnvelopeArrayAlongPath(base({
            path: [{ x: 0, z: 0 }, { x: 25, z: 14 }, { x: 50, z: 0 }],
        })));
        expect(perturbed.pathLengthM).toBeGreaterThan(control.pathLengthM);
        expect(perturbed.copies[0]!.centre.z).not.toBeCloseTo(control.copies[0]!.centre.z, 3);
        // …and the identity leg: the same input twice is the same answer (no hidden state).
        const again = ok(buildEnvelopeArrayAlongPath(base()));
        expect(again.copies.map((c) => c.centre)).toEqual(control.copies.map((c) => c.centre));
    });

    it('moves the copies when the SPACING changes, so the frequency is really read', () => {
        const ten = ok(buildEnvelopeArrayAlongPath(base({ requestedSpacingM: 10 })));
        const twelve = ok(buildEnvelopeArrayAlongPath(base({ requestedSpacingM: 12 })));
        expect(ten.copies).toHaveLength(5);
        expect(twelve.copies).toHaveLength(4);
        expect(twelve.copies[0]!.centre.x).toBeCloseTo(12, 9);
    });
});

describe('§ARRAY-ALONG-PATH — the orientation guard', () => {
    it('classifies only the two named orientations', () => {
        expect(isEnvelopeArrayOrientation('tangent')).toBe(true);
        expect(isEnvelopeArrayOrientation('prototype')).toBe(true);
        expect(isEnvelopeArrayOrientation('follow')).toBe(false);
        expect(isEnvelopeArrayOrientation(null)).toBe(false);
    });
});
