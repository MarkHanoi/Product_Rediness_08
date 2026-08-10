/**
 * §FIX-FLOOR-FINISH-CURVED-COVERAGE (founder 2026-08-10)
 *
 * THE REPORT: Floor tool → "Auto within walls" (AUTO_FROM_ROOM) on a room whose shell has
 * CURVED walls / rounded corners. The finish does not cover the room — there is a visible
 * gap between the finish edge and the wall. Room detection itself was clean
 * (`detectedRooms=1`, `unresolvedLoopBreaks=0`), and the created floor had 41 vertices, so
 * the curve WAS reaching the polygon: the loss was in the centreline → inner-face step.
 *
 * THE ROOT CAUSE, in arithmetic. The finish boundary is each room-ring edge offset inward
 * by its bounding wall's half-thickness, corners mitered. A curved wall reaches the ring as
 * a RUN of short near-collinear chords, each matched to its wall INDEPENDENTLY (200 mm
 * perpendicular, ~10° of direction). One chord that misses gets inset 0 while its
 * neighbours get t/2 — and two offset lines differing by Δ that meet at a turn of θ
 * intersect Δ/sin θ away:
 *
 *     Δ = 0.100 m, θ = 5.6° (a 16-chord quarter arc)  ⇒  0.100 / sin 5.6° = 1.02 m
 *
 * The miter clamp caught the runaway and bevelled; adjacent bevels crossed; `isSimple`
 * rejected the ring as a bow-tie; and the derivation fell all the way through to the
 * last-resort CENTROID SIMILARITY SHRINK — which is not an inset at all. It scales the ring
 * toward its centroid by f = inset/meanR, so the pullback is PROPORTIONAL to distance from
 * the centroid. Measured on a 20 m × 4 m room with 200 mm walls, where the correct pullback
 * is 100 mm everywhere:
 *
 *     f = 0.100 / 3.329 = 0.0300
 *     pullback at the middle = 60 mm   (the finish runs 40 mm INTO the wall)
 *     pullback at the ends   = 540 mm  (a 44 cm GAP — the founder's bug)
 *     area 74.00 m² vs centreline 78.65 m² = −5.9 %, i.e. EXACTLY what the correct inset
 *     loses, so the "≥50 % of source" sanity gate could never see it, and the derivation
 *     logged `boundary=inner-face ✓`.
 *
 * THE FIX, three parts, all in `RoomPolygonUtils`:
 *   1. `_normaliseCurvedRunInsets` — an arc run has ONE bounding wall, therefore ONE inset.
 *      Removes the Δ, hence the runaway, at source.
 *   2. Two-point CHAMFER join instead of the one-point bevel — each emitted point lies
 *      exactly on its own offset line, so every edge of the result stays on the wall face
 *      and adjacent joins cannot cross.
 *   3. The centroid shrink is DELETED; a residual bow-tie is repaired with
 *      `repairToSimplePolygon` (which moves no surviving edge), and the final fail-safe is
 *      the centreline — which errs by half a wall thickness UNDER the wall (invisible),
 *      never by half a metre of bare slab.
 *   Plus `_densifyOffsetArcRuns`: the offset polygon's chords still cut inside the offset
 *   arc by (L/2)·tan(θ/4) — 2.3 mm on a 2 m fillet at 16 chords — so curved runs are
 *   subdivided ALONG the arc until that is ≤ 2 mm. Densification, never outward
 *   displacement: a displaced vertex would sit inside the wall body.
 *
 * The reference inner face here is built from the ANALYTIC offset of the source geometry
 * (straight lines offset by h; the Bézier offset along its exact unit normal at 512
 * samples) — independent of the code under test, per MEMORY §probe-can-be-wrong-three-ways.
 */

import { describe, it, expect } from 'vitest';
import {
    deriveRoomFinishBoundary, insetPolygonToInnerFaces, type RoomFinishWall,
} from '../RoomPolygonUtils';

type P = { x: number; z: number };

const T = 0.2;          // wall thickness
const H = T / 2;        // half thickness = the inner-face pullback
const SEGS = 16;        // the wall schema's default arc tessellation

function area(p: ReadonlyArray<P>): number {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
        const a = p[i]!, b = p[(i + 1) % p.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return Math.abs(s) / 2;
}

function bezPt(s: P, c: P, e: P, t: number): P {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    return { x: a * s.x + b * c.x + d * e.x, z: a * s.z + b * c.z + d * e.z };
}

/** Exact unit tangent of the quadratic Bézier at t: B'(t) = 2(1−t)(C−S) + 2t(E−C). */
function bezTangent(s: P, c: P, e: P, t: number): P {
    const x = 2 * (1 - t) * (c.x - s.x) + 2 * t * (e.x - c.x);
    const z = 2 * (1 - t) * (c.z - s.z) + 2 * t * (e.z - c.z);
    const l = Math.hypot(x, z) || 1;
    return { x: x / l, z: z / l };
}

function bezPolyline(s: P, c: P, e: P, n: number): P[] {
    const out: P[] = [];
    for (let i = 0; i <= n; i++) out.push(bezPt(s, c, e, i / n));
    return out;
}

/** Shortest distance from `p` to a closed polyline — the true perpendicular. */
function distToPath(p: P, path: ReadonlyArray<P>): number {
    let best = Infinity;
    for (let i = 0; i < path.length; i++) {
        const a = path[i]!, b = path[(i + 1) % path.length]!;
        const abx = b.x - a.x, abz = b.z - a.z;
        const l2 = abx * abx + abz * abz;
        let t = l2 < 1e-18 ? 0 : ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
        if (d < best) best = d;
    }
    return best;
}

// ── The founder's shape class: a 12 m × 8 m shell with 2 m rounded corners ─────────────
// Four straight walls, four quadratic-Bézier corner walls (control at the sharp corner —
// the standard rounded-corner construction), CCW in world X-Z.
const STRAIGHTS: Array<[P, P]> = [
    [{ x: 2, z: 0 }, { x: 10, z: 0 }],
    [{ x: 12, z: 2 }, { x: 12, z: 6 }],
    [{ x: 10, z: 8 }, { x: 2, z: 8 }],
    [{ x: 0, z: 6 }, { x: 0, z: 2 }],
];
const ARCS: Array<{ s: P; c: P; e: P }> = [
    { s: { x: 10, z: 0 }, c: { x: 12, z: 0 }, e: { x: 12, z: 2 } },
    { s: { x: 12, z: 6 }, c: { x: 12, z: 8 }, e: { x: 10, z: 8 } },
    { s: { x: 2, z: 8 }, c: { x: 0, z: 8 }, e: { x: 0, z: 6 } },
    { s: { x: 0, z: 2 }, c: { x: 0, z: 0 }, e: { x: 2, z: 0 } },
];

const SHELL_WALLS: RoomFinishWall[] = [
    ...STRAIGHTS.map(([a, b]) => ({ baseLine: [a, b], thickness: T })),
    ...ARCS.map(a => ({ baseLine: [a.s, a.e], thickness: T, curve: { control: a.c, segments: SEGS } })),
];

/** The room ring exactly as `RoomDetectionEngine` emits it (arcs at `curve.segments`). */
const SHELL_RING: P[] = (() => {
    const ring: P[] = [];
    for (let k = 0; k < 4; k++) {
        ring.push({ ...STRAIGHTS[k]![0] });
        const a = ARCS[k]!;
        const pts = bezPolyline(a.s, a.c, a.e, SEGS);
        for (let i = 1; i < pts.length - 1; i++) ring.push(pts[i]!);
    }
    return ring;
})();

/** The centreline PATH at high density — the wall centres, for distance measurements. */
const SHELL_CENTRELINE_DENSE: P[] = (() => {
    const path: P[] = [];
    for (let k = 0; k < 4; k++) {
        path.push({ ...STRAIGHTS[k]![0] });
        const a = ARCS[k]!;
        const pts = bezPolyline(a.s, a.c, a.e, 512);
        for (let i = 1; i < pts.length - 1; i++) path.push(pts[i]!);
    }
    return path;
})();

/**
 * THE INDEPENDENT REFERENCE: the true inner face, built by offsetting each source element
 * inward by H along its ANALYTIC normal (not by chord-offsetting a tessellation). For a CCW
 * ring the interior is to the LEFT of travel, so the inward normal of a unit tangent (tx,tz)
 * is (−tz, tx).
 */
const SHELL_TRUE_INNER: P[] = (() => {
    const out: P[] = [];
    for (let k = 0; k < 4; k++) {
        const [s0, s1] = STRAIGHTS[k]!;
        const l = Math.hypot(s1.x - s0.x, s1.z - s0.z);
        const tx = (s1.x - s0.x) / l, tz = (s1.z - s0.z) / l;
        out.push({ x: s0.x - tz * H, z: s0.z + tx * H });
        out.push({ x: s1.x - tz * H, z: s1.z + tx * H });
        const a = ARCS[k]!;
        for (let i = 1; i < 512; i++) {
            const t = i / 512;
            const p = bezPt(a.s, a.c, a.e, t);
            const u = bezTangent(a.s, a.c, a.e, t);
            out.push({ x: p.x - u.z * H, z: p.z + u.x * H });
        }
    }
    return out;
})();

describe('§FIX-FLOOR-FINISH-CURVED-COVERAGE — the auto floor finish covers the room to the wall inner faces', () => {
    it('STRAIGHT rectangular room: the finish area IS the inner-face area (exact)', () => {
        // 6 m × 4 m room on 200 mm walls ⇒ inner face 5.8 × 3.8 = 22.04 m², exactly.
        const rect: P[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];
        const walls: RoomFinishWall[] = [
            { baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], thickness: T },
            { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }], thickness: T },
            { baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }], thickness: T },
            { baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }], thickness: T },
        ];
        const finish = deriveRoomFinishBoundary(rect, walls);
        expect(finish).toHaveLength(4);
        expect(area(finish)).toBeCloseTo((6 - T) * (4 - T), 10);
        for (const v of finish) expect(distToPath(v, rect)).toBeCloseTo(H, 10);
    });

    it("ROUNDED-CORNER SHELL (the founder's shape): the finish covers ≥99.5% of the true inner face", () => {
        const finish = deriveRoomFinishBoundary(SHELL_RING, SHELL_WALLS);
        const truth = area(SHELL_TRUE_INNER);
        const got = area(finish);
        // Coverage, not just "smaller than the centreline" — the centroid shrink passed that.
        expect(got / truth).toBeGreaterThanOrEqual(0.995);
        // …and it must not spill past the inner face into the wall either.
        expect(got / truth).toBeLessThanOrEqual(1.005);
    });

    it('ROUNDED-CORNER SHELL: no finish vertex lies inside the wall body', () => {
        const finish = deriveRoomFinishBoundary(SHELL_RING, SHELL_WALLS);
        // The wall body is everything within H of the wall centreline. Tolerance 1 mm: the
        // source ring is itself a chorded approximation of the arc, so a vertex offset from
        // one of its chords can sit a fraction of the chord sagitta short of the true face.
        for (const v of finish) {
            expect(distToPath(v, SHELL_CENTRELINE_DENSE)).toBeGreaterThan(H - 0.001);
        }
    });

    it('ROUNDED-CORNER SHELL: the pullback is CONSTANT — this is an inset, not a shrink', () => {
        // The defect signature was a pullback proportional to distance from the centroid.
        // A true inset holds it at the wall half-thickness on every edge, everywhere.
        const finish = deriveRoomFinishBoundary(SHELL_RING, SHELL_WALLS);
        const d = finish.map(v => distToPath(v, SHELL_CENTRELINE_DENSE));
        const min = Math.min(...d), max = Math.max(...d);
        expect(min).toBeGreaterThan(H - 0.005);
        expect(max).toBeLessThan(H + 0.005);
    });

    it('ELONGATED room with a curved end: never the 540 mm centroid-shrink gap', () => {
        // The 20 m × 4 m fixture the shrink was measured on. Whatever route the derivation
        // takes, no point of the finish may sit further than H + 5 mm from the wall face,
        // and no point may be inside the wall body.
        const arcA = { s: { x: 18, z: 0 }, c: { x: 20, z: 0 }, e: { x: 20, z: 2 } };
        const arcB = { s: { x: 20, z: 2 }, c: { x: 20, z: 4 }, e: { x: 18, z: 4 } };
        // Traced-ring form (shared nodes duplicated at the tangent joins) — the shape that
        // drove the pre-fix code into the centroid shrink, measured at 60 … 540 mm here.
        const ring: P[] = [{ x: 0, z: 0 }, { x: 18, z: 0 }];
        for (const p of bezPolyline(arcA.s, arcA.c, arcA.e, SEGS)) ring.push(p);
        for (const p of bezPolyline(arcB.s, arcB.c, arcB.e, SEGS)) ring.push(p);
        ring.push({ x: 18, z: 4 }, { x: 0, z: 4 });

        const walls: RoomFinishWall[] = [
            { baseLine: [{ x: 0, z: 0 }, { x: 18, z: 0 }], thickness: T },
            { baseLine: [arcA.s, arcA.e], thickness: T, curve: { control: arcA.c, segments: SEGS } },
            { baseLine: [arcB.s, arcB.e], thickness: T, curve: { control: arcB.c, segments: SEGS } },
            { baseLine: [{ x: 18, z: 4 }, { x: 0, z: 4 }], thickness: T },
            { baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }], thickness: T },
        ];

        const dense: P[] = [{ x: 0, z: 0 }, { x: 18, z: 0 }];
        for (const p of bezPolyline(arcA.s, arcA.c, arcA.e, 512).slice(1, -1)) dense.push(p);
        dense.push({ x: 20, z: 2 });
        for (const p of bezPolyline(arcB.s, arcB.c, arcB.e, 512).slice(1, -1)) dense.push(p);
        dense.push({ x: 18, z: 4 }, { x: 0, z: 4 });

        const finish = deriveRoomFinishBoundary(ring, walls);
        const d = finish.map(v => distToPath(v, dense));
        // Pre-fix this fixture produced 60 mm … 540 mm. The corners legitimately miter out
        // to H·√2 = 141 mm, so bound the spread by that rather than by H alone.
        expect(Math.min(...d)).toBeGreaterThan(H - 0.005);
        expect(Math.max(...d)).toBeLessThan(H * Math.SQRT2 + 0.005);
    });

    // ── The two fixtures that actually reproduce the founder's failure ────────────────
    //
    // The ring above is IDEALISED: each wall contributes its interior samples only. A ring
    // the planar face-tracer really produces is a concatenation of wall SUB-SEGMENTS, so
    // the node SHARED by a straight wall and its fillet appears in both — the ring carries
    // near-duplicate vertices at every tangent join. Measured on the pre-fix code, that one
    // difference is enough to run the whole cascade:
    //     miter runaway → bevel → bow-tie → collinear-collapse retry → bow-tie again
    //     → CENTROID SHRINK: pullback 64 … 104 mm where it must be 100 mm everywhere.
    // On the 20 m × 4 m variant below the same shrink produced 60 … 540 mm.

    /** The shell ring as the tracer emits it: shared nodes duplicated at every join. */
    const TRACED_RING: P[] = (() => {
        const ring: P[] = [];
        for (let k = 0; k < 4; k++) {
            ring.push({ ...STRAIGHTS[k]![0] });
            ring.push({ ...STRAIGHTS[k]![1] });
            const a = ARCS[k]!;
            for (const p of bezPolyline(a.s, a.c, a.e, SEGS)) ring.push(p);
        }
        return ring;
    })();

    it('TRACED ring (shared nodes duplicated): a TRUE inset, not the centroid shrink', () => {
        const finish = insetPolygonToInnerFaces(TRACED_RING.map(v => ({ ...v })), TRACED_RING.map(() => H));
        const d = finish.map(v => distToPath(v, SHELL_CENTRELINE_DENSE));
        // The shrink's signature is a pullback that VARIES with distance from the centroid.
        expect(Math.min(...d)).toBeGreaterThan(H - 0.005);
        expect(Math.max(...d)).toBeLessThan(H + 0.005);
        expect(area(finish) / area(SHELL_TRUE_INNER)).toBeGreaterThanOrEqual(0.995);
    });

    it('a mis-matched chord in an arc run cannot distort the finish (one arc ⇒ one inset)', () => {
        // A curved wall is matched CHORD BY CHORD, within 200 mm and ~10°. A trimmed wall's
        // centreline is re-fitted here through its POST-trim endpoints, which is a different
        // curve from the PRE-trim one room detection walked (see curvedWallTessellation.ts
        // §FIX-CURVED-WALL-PRETRIM-FRAME), so individual chords DO miss and fall to inset 0.
        // Two offset lines differing by Δ = 100 mm at a turn of 5.6° intersect 1.02 m away —
        // the runaway that starts the cascade. After the fix the run's own inset is restored
        // first, so the result is byte-identical however many chords miss.
        const baseline = insetPolygonToInnerFaces(SHELL_RING.map(v => ({ ...v })), SHELL_RING.map(() => H));
        for (const misses of [[5], [5, 6], [5, 20], [3, 5, 7]]) {
            const insets = SHELL_RING.map(() => H);
            for (const m of misses) insets[m % SHELL_RING.length] = 0;
            const finish = insetPolygonToInnerFaces(SHELL_RING.map(v => ({ ...v })), insets);
            expect(finish).toEqual(baseline);
            const d = finish.map(v => distToPath(v, SHELL_CENTRELINE_DENSE));
            expect(Math.min(...d)).toBeGreaterThan(H - 0.005);
            expect(Math.max(...d)).toBeLessThan(H + 0.005);
        }
    });

    it('a door gap on a STRAIGHT wall still reaches the centreline (threshold preserved)', () => {
        // The curved-run normalisation must NOT touch collinear door subdivisions: adjacent
        // rooms' finishes meet under the threshold, which is the whole point of the 0 inset.
        const rect: P[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];
        const walls: RoomFinishWall[] = [
            {
                baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], thickness: T,
                openings: [{ type: 'door', offset: 3, width: 0.9 }],
            },
            { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }], thickness: T },
            { baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }], thickness: T },
            { baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }], thickness: T },
        ];
        const finish = deriveRoomFinishBoundary(rect, walls);
        // At least one vertex on the door run sits ON the centreline (z ≈ 0), not at z = H.
        const onThreshold = finish.filter(v => Math.abs(v.z) < 1e-6 && v.x > 2 && v.x < 4);
        expect(onThreshold.length).toBeGreaterThanOrEqual(2);
    });
});
