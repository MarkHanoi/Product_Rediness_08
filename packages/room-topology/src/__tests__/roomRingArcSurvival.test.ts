// §FIX-ROOM-RING-ARC-COLLAPSE (L-962) — THE ROOM RING MUST KEEP ITS ARC.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS, AND WHY THE ORACLE IS ANALYTIC
// ─────────────────────────────────────────────────────────────────────────────
// The founder: `Floor -> AUTO` cuts a straight chord where the wall arcs, leaving
// wedge gaps against the curved wall face — `[FloorTool] Floor created: ... with 20
// vertices` in a 19-wall room.
//
// The floor tool re-derives nothing. `FloorTool.ts:1134` reads `room.boundary.polygon`
// verbatim. The ring was already destroyed by
// `RoomDetectionEngine._snapNearbyCorners(combinedInput, 0.30)` — a union-find that
// fuses ANY two endpoints within 300 mm, guarded only by `wallIdx`. A tessellated arc
// arrives as N SEPARATE segments (`wallId_c0`, `_c1`, ...), so consecutive chords are
// eligible, and union-find is TRANSITIVE: a chain of sub-300 mm hops collapses the
// whole arc to a single centroid node.
//
// EVERY EXPECTATION BELOW IS HAND-COMPUTABLE FROM THE GEOMETRY, never captured from
// the code under test:
//
//   • RING COUNT.  A shell of 4 straights + 4 quadratic-Bezier corner arcs at `segs`
//     chords has exactly `4*segs + 4` distinct ring vertices: each arc emits segs+1
//     points, the 8 arc endpoints coincide with the 8 straight endpoints, so
//     4(segs+1) + 8 - 8.
//
//   • AREA.  The region between a quadratic Bezier and its chord is 2/3 of the area of
//     triangle(S, C, E) — Archimedes. With the control AT the sharp corner that triangle
//     has legs r, r, hence area r^2/2, so the Bezier-chord region is r^2/3. The chord
//     itself cuts a triangle of r^2/2 off the sharp rectangle, so each rounded corner
//     removes r^2/2 - r^2/3 = r^2/6, and
//
//         area = W*D - 4*(r^2/6) = W*D - (2/3)*r^2
//
//     That is a closed form. It touches no PRYZM code at all.
//
//   • ARC MIDPOINT.  B(0.5) = S/4 + C/2 + E/4, evaluated in this file.
//
// ⚠ NON-VACUITY. The subject of these arms is the same-wall guard inside
// `_snapNearbyCorners`. The oracles above are a closed-form area, a hand-counted vertex
// total, and a Bezier evaluated locally — the guard cannot move any of them. Watched RED
// before the fix: the r=2 shell returned 4 vertices and 70.391 m2 against an analytic
// 93.333 m2, and the nearest ring vertex to the arc midpoint sat 265 mm away.
//
// ⚠ THE OBVIOUS FIX WOULD HAVE BEEN CATASTROPHIC, WHICH IS WHY ARM 4 IS A SWEEP.
// The slab region tracer is the correct reference implementation, so the reflex is to
// adopt its §ARC-DENSITY authority here — which RAISES density to ARC_MAX_SEGMENTS = 64.
// Denser arc, shorter chords, MORE fusion: the same r=6 shell yields 68 ring vertices at
// 16 segments and 4 at 64. Density must not be raised in room detection until this guard
// is in place, and the sweep is what states that as a measurement rather than a warning.

import { describe, it, expect } from 'vitest';
import { RoomDetectionEngine } from '../RoomDetectionEngine';

type P = { x: number; z: number };

const T = 0.2;

// ── Analytic oracles — no PRYZM code ──────────────────────────────────────────

/** Quadratic Bezier B(t) = (1-t)^2 S + 2(1-t)t C + t^2 E. */
function bez(s: P, c: P, e: P, t: number): P {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    return { x: a * s.x + b * c.x + d * e.x, z: a * s.z + b * c.z + d * e.z };
}

/** Shoelace. */
function area(p: ReadonlyArray<P>): number {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const u = p[i]!, v = p[(i + 1) % p.length]!;
        a += u.x * v.z - v.x * u.z;
    }
    return Math.abs(a) / 2;
}

/** Closed form: a W x D rectangle with four quadratic-Bezier corners of leg r. */
function analyticShellArea(W: number, D: number, r: number): number {
    return W * D - (2 / 3) * r * r;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface Shell { walls: any[]; arcs: Array<{ s: P; c: P; e: P }> }

/** W x D shell: 4 straight walls + 4 quadratic-Bezier corner walls of leg r. */
function roundedShell(W: number, D: number, r: number, segs: number): Shell {
    const straights: Array<[P, P]> = [
        [{ x: r, z: 0 }, { x: W - r, z: 0 }],
        [{ x: W, z: r }, { x: W, z: D - r }],
        [{ x: W - r, z: D }, { x: r, z: D }],
        [{ x: 0, z: D - r }, { x: 0, z: r }],
    ];
    const arcs: Array<{ s: P; c: P; e: P }> = [
        { s: { x: W - r, z: 0 }, c: { x: W, z: 0 }, e: { x: W, z: r } },
        { s: { x: W, z: D - r }, c: { x: W, z: D }, e: { x: W - r, z: D } },
        { s: { x: r, z: D }, c: { x: 0, z: D }, e: { x: 0, z: D - r } },
        { s: { x: 0, z: r }, c: { x: 0, z: 0 }, e: { x: r, z: 0 } },
    ];
    const walls: any[] = [];
    straights.forEach(([a, b], i) => walls.push({
        id: `s${i}`, levelId: 'L0', thickness: T, height: 3,
        baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
    }));
    arcs.forEach((a, i) => walls.push({
        id: `a${i}`, levelId: 'L0', thickness: T, height: 3,
        baseLine: [{ x: a.s.x, y: 0, z: a.s.z }, { x: a.e.x, y: 0, z: a.e.z }],
        curve: { control: { x: a.c.x, y: 0, z: a.c.z }, segments: segs },
    }));
    return { walls, arcs };
}

/** A plain rectangle of 4 straight walls. */
function rectShell(W: number, D: number): any[] {
    const c: P[] = [{ x: 0, z: 0 }, { x: W, z: 0 }, { x: W, z: D }, { x: 0, z: D }];
    return c.map((a, i) => {
        const b = c[(i + 1) % 4]!;
        return {
            id: `r${i}`, levelId: 'L0', thickness: T, height: 3,
            baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
        };
    });
}

function fakeStore(walls: any[]) {
    return { getByLevel: () => walls, getAll: () => walls, get: (id: string) => walls.find(w => w.id === id) } as any;
}

function detect(walls: any[]) {
    return new RoomDetectionEngine(fakeStore(walls)).detectRoomsForLevel('L0', 0, 3);
}

function ringOf(walls: any[]): P[] {
    const rooms = detect(walls);
    return (rooms[0]?.boundary?.polygon ?? []) as P[];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('L-962 — the room ring must keep its arc', () => {

    // ── ARM 1 — NON-REGRESSION: straight rooms are untouched ──────────────────
    it('ARM 1 — a straight-walled room is byte-identical (the 300mm snap still applies to it)', () => {
        const ring = ringOf(rectShell(12, 8));
        expect(ring.length).toBe(4);
        expect(area(ring)).toBeCloseTo(96, 6);
        // The four corners, exactly — no quantisation, no drift.
        const sorted = [...ring].sort((a, b) => (a.x - b.x) || (a.z - b.z));
        expect(sorted.map(p => [p.x, p.z])).toEqual([[0, 0], [0, 8], [12, 0], [12, 8]]);
    });

    // ── ARM 2 — the 300mm corner snap MUST STILL FUSE GENUINE near-miss corners.
    // This is the guard against over-widening the fix: had I excluded too much from
    // the union-find, this room would stop closing and detection would return 0.
    it('ARM 2 — a genuine 150mm near-miss corner between DIFFERENT walls still snaps closed', () => {
        const walls = rectShell(12, 8);
        // Pull one wall 150 mm short of its corner — well inside the 300 mm snap.
        walls[0].baseLine[1] = { x: 11.85, y: 0, z: 0 };
        const rooms = detect(walls);
        expect(rooms.length).toBe(1);
        expect(area(rooms[0]!.boundary.polygon as P[])).toBeGreaterThan(90);
    });

    // ── ARM 3 — THE DEFECT: ring vertices lie ON the arc, not on its chord ────
    it('ARM 3 — a ring vertex sits ON the arc midpoint, not 265mm away on the collapsed ring', () => {
        const { walls, arcs } = roundedShell(12, 8, 2, 16);
        const ring = ringOf(walls);

        for (const a of arcs) {
            const mid = bez(a.s, a.c, a.e, 0.5);           // analytic, local to this file
            const nearest = Math.min(...ring.map(p => Math.hypot(p.x - mid.x, p.z - mid.z)));
            // Under the collapse the ring is a bare 4-vertex quad whose corners land near
            // the arc centroid: measured nearest vertex 265 mm away, i.e. 53x this bound.
            expect(nearest).toBeLessThan(0.005);
        }
    });

    // ── ARM 4 — THE AREA. This is the assertion that reaches a drawing ────────
    it('ARM 4 — a curved room reports its true area (closed form, not a captured value)', () => {
        const { walls } = roundedShell(12, 8, 2, 16);
        const ring = ringOf(walls);
        const truth = analyticShellArea(12, 8, 2);          // 96 - (2/3)*4 = 93.3333
        // The ring is INSCRIBED in the arc, so it may under-report slightly; it must
        // never over-report, and never by the 24.6% the collapse produced (70.391 m2).
        expect(area(ring)).toBeLessThanOrEqual(truth + 1e-6);
        expect(area(ring)).toBeGreaterThan(truth * 0.999);
    });

    // ── ARM 5 — THE SWEEP. No chord length may collapse the ring ──────────────
    // The defect was INVISIBLE at 589 mm and TOTAL at 147 mm. A single-case assertion
    // would have passed at 16 segments on a large radius and proved nothing.
    describe('ARM 5 — sweep: no arc chord length collapses the ring', () => {
        const CASES: Array<[string, number, number, number, number]> = [
            // label,                       W,  D, r, segs   (chord = (pi*r/2)/segs)
            ['chord ~589mm (above snap)',   24, 16, 6, 16],
            ['chord ~349mm (above snap)',   24, 16, 6, 27],
            ['chord ~248mm (below snap)',   24, 16, 6, 38],
            ['chord ~196mm (founder scale)', 12, 8, 2, 16],
            ['chord ~147mm (below snap)',   24, 16, 6, 64],
            ['chord ~98mm  (tight curves)', 12, 8, 1, 16],
        ];

        for (const [label, W, D, r, segs] of CASES) {
            it(label, () => {
                const { walls } = roundedShell(W, D, r, segs);
                const ring = ringOf(walls);
                // Hand-counted: 4 arcs x (segs+1) points, 8 endpoints shared with the straights.
                expect(ring.length).toBe(4 * segs + 4);
                const truth = analyticShellArea(W, D, r);
                expect(area(ring)).toBeLessThanOrEqual(truth + 1e-6);
                expect(area(ring)).toBeGreaterThan(truth * 0.999);
            });
        }
    });
});
