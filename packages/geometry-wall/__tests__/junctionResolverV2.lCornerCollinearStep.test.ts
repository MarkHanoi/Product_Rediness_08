// §FIX-WALL-LCORNER-COLLINEAR-STEP (founder 2026-08-06, L-6xx) — a THIRD wall that
// co-terminates EXACTLY on an existing L-corner vertex and is COLLINEAR with one of the
// two arms must not dissolve that corner.
//
// THE FOUNDER'S CASE (screenshot): a thick vertical wall B and a thick horizontal wall A
// form an L at their shared corner vertex. A THIN wall C arrives from the opposite side,
// collinear with A, and terminates at that same corner. The junction renders with a stray
// DIAGONAL / triangular sliver across the outer corner, the thin wall does not butt cleanly
// on the thick wall's face, and the corner reads as overlapping outlines rather than one
// welded solid.
//
// GEOMETRIC ROOT CAUSE (reproduced below): the ring sweep admits C as a full ring member,
// so A and B compute their outer corners against the THIN newcomer's offset edges instead of
// against each other. Because A and C are collinear their facing offset edge-lines are
// PARALLEL and separated by (halfT_A − halfT_C) — the §V2-NEAR-PARALLEL-CAP guard therefore
// skips that adjacent pair, the angular ring never closes, and both A and B retract their
// outer mitre corner to the junction centre. The exterior corner square is left with an
// uncovered wedge of (halfT_A − halfT_C) × halfT_B, and C's asymmetric cap (mitred against B
// on one side, square-capped at the centreline on the collinear side) is the stray diagonal.
//
// THE INVARIANT (C11 — creating an element must not mutate existing ones; ADR-0055 §FIX-WALL-
// 3RD-AT-LCORNER-IMMUTABLE): the pre-existing L-corner is FROZEN byte-identically and the
// newcomer adapts — it butts FLAT on the face it meets. Same contract L-146 already enforces
// for a newcomer a few mm off the vertex; this closes the EXACTLY-on-the-vertex hole.

import { describe, it, expect, afterEach } from 'vitest';
import { resolveJunctions, type WallInput } from '../src/JunctionResolverV2';
import { buildAllFootprints, type WallFootprint } from '../src/WallFootprint2D';

type P = { x: number; z: number };

const THICK = 0.30;
const THIN = 0.10;

const W = (id: string, sx: number, sz: number, ex: number, ez: number, t: number): WallInput =>
    ({ id, start: { x: sx, z: sz }, end: { x: ex, z: ez }, thickness: t });

// The founder's L: corner vertex at the origin. A runs RIGHT (+x), B runs DOWN (−z).
const A = () => W('A', 0, 0, 5, 0, THICK);
const B = () => W('B', 0, 0, 0, -5, THICK);

function footprints(walls: WallInput[]): Map<string, WallFootprint> {
    const fps = buildAllFootprints(walls, resolveJunctions(walls));
    return new Map(fps.map(f => [f.id, f]));
}

function polyOf(walls: WallInput[], id: string): readonly P[] {
    const f = footprints(walls).get(id);
    expect(f, `footprint ${id}`).toBeTruthy();
    return f!.polygon;
}

const fmt = (p: readonly P[]): string =>
    p.map(q => `(${q.x.toFixed(4)},${q.z.toFixed(4)})`).join(' ');

function signedArea(p: readonly P[]): number {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const q = p[i]!, r = p[(i + 1) % p.length]!;
        a += q.x * r.z - r.x * q.z;
    }
    return a / 2;
}

function segProperlyCrosses(a: P, b: P, c: P, d: P): boolean {
    const o = (p: P, q: P, r: P) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) &&
           ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
}

function selfIntersects(p: readonly P[]): boolean {
    const n = p.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segProperlyCrosses(p[i]!, p[(i + 1) % n]!, p[j]!, p[(j + 1) % n]!)) return true;
    }
    return false;
}

function inside(pt: P, poly: readonly P[]): boolean {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        if ((a.z > pt.z) !== (b.z > pt.z) &&
            pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
}

/**
 * Sample the L's OUTER CORNER SQUARE (the halfT × halfT box the two arms must jointly fill)
 * and report, per sample, how many footprints cover it. `void` = 0 covers (a hole — the
 * founder's open corner); `overlap` = ≥2 covers (doubled outlines).
 */
function cornerCoverage(
    fps: readonly WallFootprint[],
    box: { x0: number; x1: number; z0: number; z1: number },
    step = 0.002,
): { voids: number; overlaps: number; total: number; firstVoid: P | null } {
    let voids = 0, overlaps = 0, total = 0;
    let firstVoid: P | null = null;
    for (let x = box.x0 + step / 2; x < box.x1; x += step) {
        for (let z = box.z0 + step / 2; z < box.z1; z += step) {
            const p = { x, z };
            total++;
            let n = 0;
            for (const f of fps) if (f.polygon.length && inside(p, f.polygon)) n++;
            if (n === 0) { voids++; if (!firstVoid) firstVoid = p; }
            if (n >= 2) overlaps++;
        }
    }
    return { voids, overlaps, total, firstVoid };
}

/** Grid-sampled overlap area (m²) between two footprints. */
function overlapArea(a: readonly P[], b: readonly P[], step = 0.002): number {
    if (!a.length || !b.length) return 0;
    const x0 = Math.max(Math.min(...a.map(p => p.x)), Math.min(...b.map(p => p.x)));
    const x1 = Math.min(Math.max(...a.map(p => p.x)), Math.max(...b.map(p => p.x)));
    const z0 = Math.max(Math.min(...a.map(p => p.z)), Math.min(...b.map(p => p.z)));
    const z1 = Math.min(Math.max(...a.map(p => p.z)), Math.max(...b.map(p => p.z)));
    if (x1 <= x0 || z1 <= z0) return 0;
    let n = 0;
    for (let x = x0 + step / 2; x < x1; x += step)
        for (let z = z0 + step / 2; z < z1; z += step)
            if (inside({ x, z }, a) && inside({ x, z }, b)) n++;
    return n * step * step;
}

afterEach(() => {
    delete (globalThis as { __pryzmWallV2LCornerCollinearStep?: boolean })
        .__pryzmWallV2LCornerCollinearStep;
});

describe('§FIX-WALL-LCORNER-COLLINEAR-STEP — a 3rd wall collinear-into an L-corner vertex', () => {

    // ── The founder's exact screenshot topology ───────────────────────────────
    describe('FOUNDER CASE — thin C arrives from the LEFT, collinear with arm A', () => {
        const walls = () => [A(), B(), W('C', -4, 0, 0, 0, THIN)];

        it('leaves the existing A+B L-corner BYTE-IDENTICAL to the bare 2-wall L', () => {
            const bare = footprints([A(), B()]);
            const withC = footprints(walls());
            for (const id of ['A', 'B']) {
                expect(fmt(withC.get(id)!.polygon), `wall ${id} mitre must be immutable`)
                    .toBe(fmt(bare.get(id)!.polygon));
            }
        });

        it('leaves NO VOID in the L outer corner square (the founder\'s open corner)', () => {
            const fps = [...footprints(walls()).values()];
            // The outer corner square the two THICK arms must jointly fill.
            const cov = cornerCoverage(fps, { x0: -0.15, x1: 0.15, z0: -0.15, z1: 0.15 });
            expect(
                cov.voids,
                `uncovered samples in the corner square (first at ${JSON.stringify(cov.firstVoid)})`,
            ).toBe(0);
        });

        it('butts C FLAT on wall B\'s outer face — no stray diagonal, no centreline tongue', () => {
            const c = polyOf(walls(), 'C');
            // A flat butt is a 4-vertex rectangle: no pivot vertex was inserted.
            expect(c.length, `C polygon should be a flat 4-gon butt, got ${fmt(c)}`).toBe(4);
            // Every vertex sits at or before B's outer face (x = −halfT_B): C must NOT
            // penetrate the corner solid, and must not stop short of it either.
            const maxX = Math.max(...c.map(p => p.x));
            expect(maxX, `C's cap must land exactly on B's outer face, got ${fmt(c)}`)
                .toBeCloseTo(-THICK / 2, 6);
            // The cap is perpendicular — both cap vertices at the SAME x (no diagonal).
            const capXs = c.filter(p => Math.abs(p.x - maxX) < 1e-9);
            expect(capXs.length, `C's cap must be a flat perpendicular edge, got ${fmt(c)}`).toBe(2);
        });

        it('produces no overlapping outlines and no degenerate polygon', () => {
            const fps = [...footprints(walls()).values()];
            for (const f of fps) {
                expect(f.invalid ?? false, `${f.id} must not be flagged invalid`).toBe(false);
                expect(signedArea(f.polygon), `${f.id} signed area must be positive`).toBeGreaterThan(0);
                expect(selfIntersects(f.polygon), `${f.id} must not self-intersect`).toBe(false);
            }
            for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
                expect(
                    overlapArea(fps[i]!.polygon, fps[j]!.polygon),
                    `${fps[i]!.id}/${fps[j]!.id} footprints must not overlap`,
                ).toBeLessThan(1e-4);
            }
        });

        it('is deterministic and idempotent across repeated resolves', () => {
            const first = fmt([...footprints(walls()).values()].flatMap(f => f.polygon));
            for (let i = 0; i < 3; i++) {
                expect(fmt([...footprints(walls()).values()].flatMap(f => f.polygon))).toBe(first);
            }
        });

        it('is insensitive to wall input ORDER (the newcomer may be authored first)', () => {
            const canonical = footprints(walls());
            const reordered = footprints([W('C', -4, 0, 0, 0, THIN), B(), A()]);
            for (const id of ['A', 'B', 'C']) {
                expect(fmt(reordered.get(id)!.polygon), `wall ${id} under reordered input`)
                    .toBe(fmt(canonical.get(id)!.polygon));
            }
        });
    });

    // ── The mirrored variant: C collinear with the OTHER arm ──────────────────
    describe('MIRROR — thin C arrives from ABOVE, collinear with arm B', () => {
        const walls = () => [A(), B(), W('C', 0, 4, 0, 0, THIN)];

        it('freezes the A+B corner and butts C flat on A\'s outer face', () => {
            const bare = footprints([A(), B()]);
            const withC = footprints(walls());
            for (const id of ['A', 'B']) {
                expect(fmt(withC.get(id)!.polygon), `wall ${id} mitre must be immutable`)
                    .toBe(fmt(bare.get(id)!.polygon));
            }
            const c = withC.get('C')!.polygon;
            expect(c.length, `C should be a flat 4-gon butt, got ${fmt(c)}`).toBe(4);
            expect(Math.min(...c.map(p => p.z)), `C must butt on A's outer face, got ${fmt(c)}`)
                .toBeCloseTo(THICK / 2, 6);
        });

        it('leaves no void in the corner square', () => {
            const fps = [...footprints(walls()).values()];
            const cov = cornerCoverage(fps, { x0: -0.15, x1: 0.15, z0: -0.15, z1: 0.15 });
            expect(cov.voids, `first void at ${JSON.stringify(cov.firstVoid)}`).toBe(0);
        });
    });

    // ── Regression guards: cases that are ALREADY clean must be byte-unchanged ──
    describe('no-regression — already-clean junctions are byte-unchanged', () => {
        it('EQUAL-thickness collinear 3rd wall (no step) is untouched', () => {
            // Equal thickness ⇒ the collinear pair's offset edges are COINCIDENT, not stepped,
            // so the ring closes and the existing 3-way solve already tiles cleanly.
            const walls = [A(), B(), W('C', -4, 0, 0, 0, THICK)];
            const before = { // pinned from the pre-fix implementation
                A: '(0.1500,-0.1500) (5.0000,-0.1500) (5.0000,0.1500) (0.0000,0.1500) (0.0000,0.0000)',
                B: '(-0.1500,-0.1500) (-0.1500,-5.0000) (0.1500,-5.0000) (0.1500,-0.1500) (0.0000,0.0000)',
                C: '(-4.0000,-0.1500) (-0.1500,-0.1500) (0.0000,0.0000) (0.0000,0.1500) (-4.0000,0.1500)',
            };
            const fps = footprints(walls);
            for (const [id, want] of Object.entries(before)) {
                expect(fmt(fps.get(id)!.polygon), `equal-thickness ${id}`).toBe(want);
            }
        });

        it('a genuine 45° 3-way Y (no collinear pair) still tiles cleanly and is unchanged', () => {
            const walls = [A(), B(), W('C', -3, 3, 0, 0, THIN)];
            const fps = [...footprints(walls).values()];
            // All three share the corner pivot and tile the corner with no void / no overlap.
            const cov = cornerCoverage(fps, { x0: -0.15, x1: 0.15, z0: -0.15, z1: 0.15 });
            expect(cov.voids, `Y first void at ${JSON.stringify(cov.firstVoid)}`).toBe(0);
            for (const f of fps) {
                expect(f.polygon.length, `${f.id} keeps its 5-vertex pivot footprint`).toBe(5);
                expect(signedArea(f.polygon)).toBeGreaterThan(0);
            }
        });

        it('a 4-way X junction is byte-unchanged', () => {
            const walls = [
                W('A', 0, 0, 5, 0, THICK), W('B', 0, 0, -5, 0, THICK),
                W('C', 0, 0, 0, 5, THIN), W('D', 0, 0, 0, -5, THIN),
            ];
            const fps = footprints(walls);
            expect(fmt(fps.get('A')!.polygon))
                .toBe('(0.0500,-0.1500) (5.0000,-0.1500) (5.0000,0.1500) (0.0500,0.1500) (0.0000,0.0000)');
            expect(fmt(fps.get('C')!.polygon))
                .toBe('(0.0500,0.1500) (0.0500,5.0000) (-0.0500,5.0000) (-0.0500,0.1500) (0.0000,0.0000)');
        });

        it('the plain 2-wall L is byte-unchanged', () => {
            const fps = footprints([A(), B()]);
            expect(fmt(fps.get('A')!.polygon))
                .toBe('(0.1500,-0.1500) (5.0000,-0.1500) (5.0000,0.1500) (-0.1500,0.1500) (0.0000,0.0000)');
            expect(fmt(fps.get('B')!.polygon))
                .toBe('(-0.1500,0.1500) (-0.1500,-5.0000) (0.1500,-5.0000) (0.1500,-0.1500) (0.0000,0.0000)');
        });

        it('a mid-span T (thin C onto B\'s body, far from the corner) is unchanged', () => {
            const fps = footprints([A(), B(), W('C', -4, -0.5, 0, -0.5, THIN)]);
            expect(fmt(fps.get('C')!.polygon))
                .toBe('(-4.0000,-0.5500) (-0.1500,-0.5500) (-0.1500,-0.4500) (-4.0000,-0.4500)');
            const bare = footprints([A(), B()]);
            expect(fmt(fps.get('A')!.polygon)).toBe(fmt(bare.get('A')!.polygon));
            expect(fmt(fps.get('B')!.polygon)).toBe(fmt(bare.get('B')!.polygon));
        });

        it('the L-146 near-vertex newcomer (5 mm off) is unchanged', () => {
            const fps = footprints([A(), B(), W('C', -4, -0.005, 0, -0.005, THIN)]);
            expect(fmt(fps.get('C')!.polygon))
                .toBe('(-4.0000,-0.0550) (-0.1500,-0.0550) (-0.1500,0.0450) (-4.0000,0.0450)');
        });
    });

    it('escape hatch __pryzmWallV2LCornerCollinearStep = false restores the pre-fix solve', () => {
        (globalThis as { __pryzmWallV2LCornerCollinearStep?: boolean })
            .__pryzmWallV2LCornerCollinearStep = false;
        const c = polyOf([A(), B(), W('C', -4, 0, 0, 0, THIN)], 'C');
        // Pre-fix: a 5-vertex asymmetric cap carrying the centreline pivot (the stray diagonal).
        expect(fmt(c))
            .toBe('(-4.0000,-0.0500) (-0.1500,-0.0500) (0.0000,0.0000) (0.0000,0.0500) (-4.0000,0.0500)');
    });
});
