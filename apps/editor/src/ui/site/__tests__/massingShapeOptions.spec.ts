/**
 * §RESI-ORCH-MASSING-SHAPES (STR §25.3) — SHAPES THAT ARE REALLY SHAPES, AND REASONS THAT ARE
 * REALLY NUMBERS.
 *
 * ⭐ THE FIVE PROPERTIES THIS SUITE EXISTS TO PIN, in the order they can hurt:
 *   1. **THE RING IS INSIDE THE BUILDABLE FOOTPRINT.** Every candidate is `template ∩ buildable`,
 *      so containment is a property of the operator. If that ever stops holding, PRYZM is drawing a
 *      building outside what the ordinance permits — the one failure that is worse than no answer.
 *   2. **AN L IS NOT A RECTANGLE WITH A LABEL ON IT.** `massingOptionModel`'s header refused to name
 *      these families precisely because an eroded rectangle wearing the word "L" is undetectable to
 *      the user ([[fake-more-capable-than-real]]). So the L and the U are asserted to have a REFLEX
 *      corner; a convex answer fails.
 *   3. **THE SUN NUMBER IS THE SOLAR ENGINE'S OUTPUT, NOT A CONSTANT.** Putting a tall building
 *      immediately south of the site must LOWER it. A decorative label would not move.
 *   4. **A NON-ORTHOGONAL L IS DERIVED OR REFUSED, NEVER INVENTED.** On a rectangle the family is
 *      refused BY NAME; on a plot with a real oblique corner it is produced and its wings are
 *      measurably not perpendicular.
 *   5. **UNKNOWN IS NEVER ZERO.** No lat/lon ⇒ the sun axis is `null` plus a stated note; no
 *      neighbour snapshot ⇒ overlooking and outlook are `null`, not "clear".
 */

import { describe, it, expect } from 'vitest';
import { pointInRingEvenOdd } from '@pryzm/geometry-kernel';

import {
    enumerateMassingShapes,
    MASSING_SHAPE_FAMILIES,
    DEFAULT_WING_DEPTH_M,
    type MassingShapeInputs,
    type MassingShapeOutcome,
    type MassingShapeCandidate,
    type MassingSitingContext,
} from '../massingShapeOptions';

/** A 40 × 25 m orthogonal buildable plate — 1,000 m². Scene XZ, so +z is due SOUTH. */
const RECT = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 25 },
    { x: 0, z: 25 },
];

/**
 * A quadrilateral whose two long boundaries are ~20° off perpendicular to each other — a real
 * oblique corner for the non-orthogonal L to follow.
 */
const OBLIQUE = [
    { x: 0, z: 0 },
    { x: 46, z: 0 },
    { x: 34, z: 30 },
    { x: 0, z: 30 },
];

const BASE: MassingShapeInputs = {
    buildableRing: RECT,
    buildableAreaM2: 1000,
    targetAreaM2: 180,
    siting: null,
};

function outcomes(inputs: MassingShapeInputs): readonly MassingShapeOutcome[] {
    return enumerateMassingShapes(inputs);
}

function candidateFor(inputs: MassingShapeInputs, family: string): MassingShapeCandidate {
    const o = outcomes(inputs).find((x) => (x.ok ? x.candidate.family : x.family) === family);
    if (!o) throw new Error(`no outcome for family ${family}`);
    if (!o.ok) throw new Error(`family ${family} refused: ${o.reason} — ${o.text}`);
    return o.candidate;
}

function inRing(p: { x: number; z: number }, ring: ReadonlyArray<{ x: number; z: number }>): boolean {
    return pointInRingEvenOdd(p.x, p.z, ring.length, (i) => ring[i]!.x, (i) => ring[i]!.z);
}

/** Cross-product sign at each vertex; a REFLEX corner means the ring is not convex. */
function hasReflexCorner(ring: ReadonlyArray<{ x: number; z: number }>): boolean {
    let pos = false;
    let neg = false;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const c = ring[(i + 2) % ring.length]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (cross > 1e-6) pos = true;
        if (cross < -1e-6) neg = true;
    }
    return pos && neg;
}

describe('enumerateMassingShapes — the founder\'s worked instruction: 180 m², L, south facing', () => {
    it('returns exactly one outcome per family, in a fixed order, refusals included', () => {
        const got = outcomes(BASE);
        expect(got.map((o) => (o.ok ? o.candidate.family : o.family))).toEqual([...MASSING_SHAPE_FAMILIES]);
    });

    it('hits the 180 m² target within the §5 solver\'s own tolerance for every family it solves', () => {
        for (const o of outcomes(BASE)) {
            if (!o.ok) continue;
            const tol = Math.max(0.25, 180 * 0.0025);
            expect(Math.abs(o.candidate.areaM2 - 180)).toBeLessThanOrEqual(tol);
        }
    });

    it('⭐ every solved ring lies INSIDE the buildable footprint — containment by construction', () => {
        for (const o of outcomes(BASE)) {
            if (!o.ok) continue;
            for (const v of o.candidate.ring) {
                // Vertices sit ON the boundary at clipped edges, so test a point nudged toward the
                // ring's own centroid rather than the vertex itself.
                const cx = o.candidate.ring.reduce((s, p) => s + p.x, 0) / o.candidate.ring.length;
                const cz = o.candidate.ring.reduce((s, p) => s + p.z, 0) / o.candidate.ring.length;
                const probe = { x: v.x + (cx - v.x) * 0.02, z: v.z + (cz - v.z) * 0.02 };
                expect(inRing(probe, RECT)).toBe(true);
            }
            expect(o.candidate.areaM2).toBeLessThanOrEqual(1000 + 1e-6);
        }
    });

    it('⭐ the L and the U are genuinely re-entrant — not a rectangle wearing the letter', () => {
        expect(hasReflexCorner(candidateFor(BASE, 'ell').ring)).toBe(true);
        expect(hasReflexCorner(candidateFor(BASE, 'u-court').ring)).toBe(true);
    });

    it('the I bar is convex — the family is a bar, and it does not pretend otherwise', () => {
        expect(hasReflexCorner(candidateFor(BASE, 'bar-i').ring)).toBe(false);
    });

    it('every candidate discloses the wing depth it assumed, as a note and as a field', () => {
        for (const o of outcomes(BASE)) {
            if (!o.ok) continue;
            expect(o.candidate.wingDepthM).toBe(DEFAULT_WING_DEPTH_M);
            expect(o.candidate.notes.map((n) => n.code)).toContain('wing-depth-assumed');
        }
    });

    it('states which placement won and what the runner-up scored, so the choice is legible', () => {
        const ell = candidateFor(BASE, 'ell');
        expect(ell.placementsConsidered).toBeGreaterThan(1);
        expect(ell.runnerUpSouthFraction).not.toBeNull();
        expect(ell.statement).toContain('placements of this shape that fit');
    });
});

describe('§NON-ORTHO-REFUSAL — a non-orthogonal L is derived from the plot or refused by name', () => {
    it('REFUSES on an orthogonal plot, and says the plot has no such corner', () => {
        const o = outcomes(BASE).find((x) => (x.ok ? x.candidate.family : x.family) === 'ell-non-orthogonal');
        expect(o?.ok).toBe(false);
        if (o && !o.ok) {
            expect(o.reason).toBe('no-non-orthogonal-frame');
            expect(o.text).toContain('will not invent an angle');
        }
    });

    it('PRODUCES one on a plot with a real oblique corner, with non-perpendicular wings', () => {
        const c = candidateFor({ ...BASE, buildableRing: OBLIQUE, buildableAreaM2: 1200 }, 'ell-non-orthogonal');
        expect(hasReflexCorner(c.ring)).toBe(true);
        // Its two longest edges must be measurably off 90° from each other.
        const edges = c.ring.map((p, i) => {
            const q = c.ring[(i + 1) % c.ring.length]!;
            return { dx: q.x - p.x, dz: q.z - p.z, len: Math.hypot(q.x - p.x, q.z - p.z) };
        }).sort((a, b) => b.len - a.len);
        const a0 = edges[0]!;
        const worst = edges.slice(1).map((e) => {
            const cos = Math.abs((a0.dx * e.dx + a0.dz * e.dz) / (a0.len * e.len));
            const ang = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
            return Math.abs(90 - ang);
        }).filter((d) => d < 45);
        expect(Math.max(...worst)).toBeGreaterThan(5);
    });
});

describe('the refusals carry BOTH numbers, and nothing is silently dropped', () => {
    it('no target area ⇒ every family refuses by name, naming the buildable footprint', () => {
        const got = outcomes({ ...BASE, targetAreaM2: null });
        expect(got).toHaveLength(MASSING_SHAPE_FAMILIES.length);
        for (const o of got) {
            expect(o.ok).toBe(false);
            if (!o.ok) {
                expect(o.reason).toBe('no-target-area');
                expect(o.text).toContain('1000 m²');
            }
        }
    });

    it('a target beyond the buildable footprint refuses with BOTH numbers and the gap', () => {
        const got = outcomes({ ...BASE, targetAreaM2: 1400 });
        for (const o of got) {
            expect(o.ok).toBe(false);
            if (!o.ok) {
                expect(o.reason).toBe('target-exceeds-buildable');
                expect(o.text).toContain('1400 m²');
                expect(o.text).toContain('1000 m²');
                expect(o.text).toContain('400 m²');
            }
        }
    });

    it('a degenerate footprint refuses every family rather than returning an empty list', () => {
        const got = outcomes({ ...BASE, buildableRing: [{ x: 0, z: 0 }], buildableAreaM2: 0 });
        expect(got).toHaveLength(MASSING_SHAPE_FAMILIES.length);
        expect(got.every((o) => !o.ok && o.reason === 'no-buildable-footprint')).toBe(true);
    });

    it('never throws on garbage input', () => {
        expect(() => enumerateMassingShapes({
            buildableRing: [{ x: Number.NaN, z: 0 }, { x: 1, z: 2 }, { x: 3, z: 4 }],
            buildableAreaM2: Number.NaN,
            targetAreaM2: Number.POSITIVE_INFINITY,
            siting: null,
        })).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ THE REASONS ARE COMPUTED. This is the half the lane brief singles out.
// ─────────────────────────────────────────────────────────────────────────────

/** Barcelona-ish latitude — a real northern-hemisphere site, so "south" is the sunny side. */
const BCN = { latDeg: 41.39, lngDeg: 2.17 };

function siting(over: Partial<MassingSitingContext> = {}): MassingSitingContext {
    return {
        latDeg: BCN.latDeg,
        lngDeg: BCN.lngDeg,
        neighbours: [],
        neighbourSnapshotTaken: true,
        originLabel: 'test',
        ...over,
    };
}

/** A 30 m tall slab immediately SOUTH of the plate (scene +z is south). */
const SOUTH_TOWER = {
    ring: [
        { x: -10, z: 32 },
        { x: 50, z: 32 },
        { x: 50, z: 60 },
        { x: -10, z: 60 },
    ],
    heightM: 30,
};

describe('the sun axis is the solar engine\'s real output', () => {
    it('is null with a stated note when no site lat/lon reached the engine', () => {
        const c = candidateFor(BASE, 'bar-i');
        const sun = c.reasons.find((r) => r.key === 'sun-facade')!;
        expect(sun.normalised).toBeNull();
        expect(sun.display).toBeNull();
        expect(c.notes.map((n) => n.code)).toContain('sun-not-computed');
    });

    it('is a real fraction in [0,1] once a site lat/lon is supplied', () => {
        const c = candidateFor({ ...BASE, siting: siting() }, 'bar-i');
        const sun = c.reasons.find((r) => r.key === 'sun-facade')!;
        expect(sun.normalised).not.toBeNull();
        expect(sun.normalised!).toBeGreaterThan(0);
        expect(sun.normalised!).toBeLessThanOrEqual(1);
        expect(sun.display).toContain('equinox daylight');
    });

    it('⭐ DROPS when a 30 m building is put immediately south — the number moves with the geometry', () => {
        const clear = candidateFor({ ...BASE, siting: siting() }, 'bar-i');
        const shaded = candidateFor(
            { ...BASE, siting: siting({ neighbours: [SOUTH_TOWER] }) },
            'bar-i',
        );
        const a = clear.reasons.find((r) => r.key === 'sun-facade')!.normalised!;
        const b = shaded.reasons.find((r) => r.key === 'sun-facade')!.normalised!;
        expect(b).toBeLessThan(a);
    });

    it('EXCLUDES a neighbour with no height, and says how many it excluded', () => {
        const c = candidateFor(
            { ...BASE, siting: siting({ neighbours: [{ ring: SOUTH_TOWER.ring, heightM: null }] }) },
            'bar-i',
        );
        const note = c.notes.find((n) => n.code === 'neighbour-heights-missing');
        expect(note).toBeDefined();
        expect(note!.text).toContain('1 of 1');
        // …and the sun figure is the unshaded one, because the unknown-height neighbour was dropped
        // rather than given an assumed height.
        const withHeight = candidateFor({ ...BASE, siting: siting({ neighbours: [SOUTH_TOWER] }) }, 'bar-i');
        expect(c.reasons.find((r) => r.key === 'sun-facade')!.normalised!)
            .toBeGreaterThan(withHeight.reasons.find((r) => r.key === 'sun-facade')!.normalised!);
    });
});

describe('the siting axes are unknown-or-measured, never zero-for-unknown', () => {
    it('overlooking and outlook are null with no neighbour snapshot, and say so', () => {
        const c = candidateFor(BASE, 'bar-i');
        expect(c.reasons.find((r) => r.key === 'overlooking')!.normalised).toBeNull();
        expect(c.reasons.find((r) => r.key === 'open-outlook')!.normalised).toBeNull();
        expect(c.notes.map((n) => n.code)).toContain('no-neighbour-data');
    });

    it('an EMPTY captured snapshot is a MEASURED zero overlooking, not an unknown', () => {
        const c = candidateFor({ ...BASE, siting: siting({ neighbours: [] }) }, 'bar-i');
        expect(c.reasons.find((r) => r.key === 'overlooking')!.normalised).toBe(0);
        expect(c.notes.map((n) => n.code)).not.toContain('no-neighbour-data');
    });

    it('a neighbour in front of the façade raises the overlooked share above zero', () => {
        const c = candidateFor({ ...BASE, siting: siting({ neighbours: [SOUTH_TOWER] }) }, 'bar-i');
        expect(c.reasons.find((r) => r.key === 'overlooking')!.normalised!).toBeGreaterThan(0);
    });

    it('⭐ the sea half of §25.3 is named as NOT SCORED wherever an outlook figure is printed', () => {
        const c = candidateFor({ ...BASE, siting: siting({ neighbours: [SOUTH_TOWER] }) }, 'bar-i');
        const note = c.notes.find((n) => n.code === 'sea-view-not-scored');
        expect(note).toBeDefined();
        expect(note!.text).toContain('SEA view');
    });

    it('south-facing façade is always measured — it needs no data source to be present', () => {
        for (const o of outcomes(BASE)) {
            if (!o.ok) continue;
            const south = o.candidate.reasons.find((r) => r.key === 'south-facade')!;
            expect(south.normalised).not.toBeNull();
            expect(south.display).toContain('% of');
        }
    });

    it('street frontage and forecourt are derived, and the compass heuristic is disclosed', () => {
        const c = candidateFor(BASE, 'bar-i');
        expect(c.notes.map((n) => n.code)).toContain('frontage-is-heuristic');
        const frontage = c.reasons.find((r) => r.key === 'street-frontage')!;
        const forecourt = c.reasons.find((r) => r.key === 'forecourt')!;
        expect(frontage.display).not.toBeNull();
        expect(forecourt.display).not.toBeNull();
        expect(forecourt.display!).toContain('bays at 12.5 m²');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ §LARGEST-FIT (L-13037) — a shape BEFORE a size. When no ground-floor area has been named,
// each family is solved at the largest outline that fits, SAYS so, and carries no invented target.
// ─────────────────────────────────────────────────────────────────────────────

const LARGEST: MassingShapeInputs = { ...BASE, targetAreaM2: null, whenNoTarget: 'largest-fit' };

describe('§LARGEST-FIT — no named area ⇒ each family at its own ceiling, and it says so', () => {
    it('⛔ the DEFAULT is still refusal — a caller that omits `whenNoTarget` sees no behaviour change', () => {
        for (const o of outcomes({ ...BASE, targetAreaM2: null })) {
            expect(o.ok).toBe(false);
            if (!o.ok) expect(o.reason).toBe('no-target-area');
        }
    });

    it('produces I, L and U on the rectangle, each sized to its largest fit, with a null target', () => {
        for (const fam of ['bar-i', 'ell', 'u-court'] as const) {
            const c = candidateFor(LARGEST, fam);
            expect(c.sizedBy).toBe('largest-fit');
            expect(c.targetAreaM2).toBeNull();
            expect(c.areaM2).toBeGreaterThan(100);
            expect(c.areaM2).toBeLessThanOrEqual(1000 + 1e-6);
        }
    });

    it('⭐ the I bar is the LARGEST bar — the full 40 m long side at the 8 m wing depth, 320 m²', () => {
        const bar = candidateFor(LARGEST, 'bar-i');
        expect(Math.abs(bar.areaM2 - 40 * DEFAULT_WING_DEPTH_M)).toBeLessThan(1);
    });

    it('the L and U at largest fit are still genuinely re-entrant and still inside the outline', () => {
        for (const fam of ['ell', 'u-court'] as const) {
            const c = candidateFor(LARGEST, fam);
            expect(hasReflexCorner(c.ring)).toBe(true);
            const cx = c.ring.reduce((s, p) => s + p.x, 0) / c.ring.length;
            const cz = c.ring.reduce((s, p) => s + p.z, 0) / c.ring.length;
            for (const v of c.ring) {
                expect(inRing({ x: v.x + (cx - v.x) * 0.02, z: v.z + (cz - v.z) * 0.02 }, RECT)).toBe(true);
            }
        }
    });

    it('⛔ carries `sized-to-largest-fit` with BOTH numbers and the action — never a silent default', () => {
        const ell = candidateFor(LARGEST, 'ell');
        const n = ell.notes.find((x) => x.code === 'sized-to-largest-fit');
        expect(n).toBeTruthy();
        expect(n!.severity).toBe('warning');
        expect(n!.text).toContain('1000 m²');                          // the footprint it fits
        expect(n!.text).toContain(`${ell.areaM2.toFixed(0)} m²`);       // the size it landed at
        expect(n!.text).toContain('Propose a ground floor');            // the action that sizes it
        expect(n!.text).toContain('not a size PRYZM chose');
        expect(ell.statement).toContain('largest');
    });

    it('a named area does NOT carry that note — the two sizings are different facts', () => {
        const ell = candidateFor(BASE, 'ell');
        expect(ell.sizedBy).toBe('target');
        expect(ell.targetAreaM2).toBe(180);
        expect(ell.notes.some((x) => x.code === 'sized-to-largest-fit')).toBe(false);
    });

    it('the non-orthogonal L is STILL refused by name on the rectangle at largest fit', () => {
        const o = outcomes(LARGEST).find((x) => !x.ok && x.family === 'ell-non-orthogonal');
        expect(o).toBeTruthy();
        if (o && !o.ok) expect(o.reason).toBe('no-non-orthogonal-frame');
    });

    it('is deterministic at largest fit too', () => {
        expect(JSON.stringify(outcomes(LARGEST))).toBe(JSON.stringify(outcomes(LARGEST)));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ §WING-WIDTH-MEASURED (L-13037) — "COHERENT SHAPES … never ship a sliver". The wing that is
// BUILT is template ∩ outline; on an irregular outline it thins. It is measured, and a sliver is
// refused with its numbers.
// ─────────────────────────────────────────────────────────────────────────────

/** A 40 × 1.5 m strip — 60 m². Everything placed in it is 1.5 m wide. */
const STRIP = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 1.5 },
    { x: 0, z: 1.5 },
];

/**
 * A 40 × 25 m plate with a notch: the south band z ∈ [17, 23.5] is cut away for x < 30, leaving a
 * 1.5 m strip along the south boundary for 30 m. A bar hugging that boundary is 8 m wide for its
 * last 10 m and 1.5 m wide for the 30 m before — a sliver in its body.
 */
const NOTCHED = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 25 },
    { x: 0, z: 25 },
    { x: 0, z: 23.5 },
    { x: 30, z: 23.5 },
    { x: 30, z: 17 },
    { x: 0, z: 17 },
];

describe('§WING-WIDTH-MEASURED — a wing is measured on the BUILT outline, and a sliver is refused', () => {
    it('⛔ on a 1.5 m strip every family that can be placed is REFUSED as a sliver, with the numbers', () => {
        const got = outcomes({ buildableRing: STRIP, buildableAreaM2: 60, targetAreaM2: 50, siting: null });
        const bar = got.find((o) => !o.ok && o.family === 'bar-i');
        expect(bar).toBeTruthy();
        if (bar && !bar.ok) {
            expect(bar.reason).toBe('family-wings-sliver');
            expect(bar.text).toContain('1.5 m');            // the measured width
            expect(bar.text).toContain('below the 2 m minimum');
            expect(bar.text).toContain('will not ship a sliver');
            expect(bar.text).toContain('50 m²');            // the area it reached only on paper
        }
        // Nothing on the strip may come back as a shipped candidate.
        expect(got.some((o) => o.ok)).toBe(false);
    });

    it('…and at largest fit the same strip is refused the same way — size does not launder width', () => {
        const got = outcomes({
            buildableRing: STRIP, buildableAreaM2: 60, targetAreaM2: null, whenNoTarget: 'largest-fit', siting: null,
        });
        const bar = got.find((o) => !o.ok && o.family === 'bar-i');
        expect(bar).toBeTruthy();
        if (bar && !bar.ok) expect(bar.reason).toBe('family-wings-sliver');
    });

    it('⭐ on the notched plate the sliver PLACEMENT is excluded and COUNTED; a full-width bar is shipped', () => {
        const bar = candidateFor({
            buildableRing: NOTCHED, buildableAreaM2: 805, targetAreaM2: null, whenNoTarget: 'largest-fit', siting: null,
        }, 'bar-i');
        // The winner holds its width — it is the bar on the intact north side.
        expect(bar.narrowestWingM).not.toBeNull();
        expect(bar.narrowestWingM!).toBeGreaterThanOrEqual(DEFAULT_WING_DEPTH_M - 0.2);
        // The south-hugging bar (1.5 m for 30 m of its body) was excluded, and the exclusion is printed.
        expect(bar.sliverPlacementsExcluded).toBeGreaterThan(0);
        const n = bar.notes.find((x) => x.code === 'sliver-placements-excluded');
        expect(n).toBeTruthy();
        expect(n!.text).toContain('thinner than 2 m');
        expect(bar.statement).toContain('excluded as slivers');
    });

    it('a shape on the plain rectangle measures its full wing depth and carries NO width note', () => {
        const ell = candidateFor(BASE, 'ell');
        expect(ell.narrowestWingM).not.toBeNull();
        expect(ell.narrowestWingM!).toBeGreaterThanOrEqual(DEFAULT_WING_DEPTH_M - 0.2);
        expect(ell.sliverPlacementsExcluded).toBe(0);
        expect(ell.notes.some((x) => x.code === 'wings-thin' || x.code === 'wings-sliver')).toBe(false);
    });

    it('⛔ the measured width is a number or null, never 0 standing in for "not measured"', () => {
        for (const o of outcomes(BASE)) {
            if (!o.ok) continue;
            if (o.candidate.narrowestWingM !== null) expect(o.candidate.narrowestWingM).toBeGreaterThan(0);
        }
    });
});

describe('determinism (C58 §1.1 — deterministic, no AI/ML/LLM)', () => {
    it('two runs of the same inputs are byte-identical', () => {
        const a = JSON.stringify(outcomes({ ...BASE, siting: siting({ neighbours: [SOUTH_TOWER] }) }));
        const b = JSON.stringify(outcomes({ ...BASE, siting: siting({ neighbours: [SOUTH_TOWER] }) }));
        expect(a).toBe(b);
    });
});
