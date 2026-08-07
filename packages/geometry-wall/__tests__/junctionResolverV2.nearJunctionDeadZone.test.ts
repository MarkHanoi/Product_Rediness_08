// §NEAR-JUNCTION-DEAD-ZONE (founder 2026-08-07).
//
// THE defect. §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE (L-146) freezes an existing L corner and
// re-seats a near-coincident newcomer as its OWN T against the MOST-PERPENDICULAR arm. That
// keeps the committed arms byte-identical, but it solves the newcomer against ONE arm only —
// and near a corner the newcomer is inside the solid of BOTH. The arm it was not seated on
// never clips it, so the newcomer's footprint DOUBLES into it. Measured on walls A/B 300 mm
// meeting at the origin with a 200 mm newcomer at 45°: 9,384 mm² of doubled solid at 5 mm off
// the vertex, 7,548 mm² at 20 mm, still 452 mm² at 115 mm — a dead zone running from the
// vertex out to the host half-thickness (150 mm).
//
// WHY NOT THE EXACT-VERTEX Y. Admitting the newcomer and sweeping all three arms about the
// frozen vertex is a perfect partition (0 doubled / 0 uncovered) but MOVES BOTH COMMITTED ARMS
// (measured: A loses 10,748 mm², B loses 10,468 mm²). That is right for a Y — where all three
// arms are solved together for the first time — and wrong here: a newcomer joining an
// ALREADY-COMMITTED junction CONFORMS to it, it does not remodel it. The corner is authored
// history; the guest is the only party with freedom left.
//
// THE CONSTRUCTION. Seat the guest at the frozen corner VERTEX with every frozen arm entered
// as a PASSTHROUGH BARRIER. Barriers join the angular ring and clip the guest, but the sweep
// never writes into a passthrough's own footprint — so the arms are byte-identical BY
// CONSTRUCTION while the guest is clipped by the arm face it actually meets. No tolerance,
// no epsilon, no nudge.
//
// This suite locks, across the FULL dead zone: (a) zero doubled solid against BOTH arms;
// (b) both committed arms byte-identical to the bare-L solve; (c) zero uncovered hole;
// (d) a non-degenerate, non-self-intersecting guest footprint (ADR-0299: refuse, never a
// sliver); (e) the exact-vertex Y and the flag-OFF behaviour are unchanged.

import { describe, it, expect, afterEach } from 'vitest';
import { resolveJunctions, type WallInput, type Pt2 } from '../src/JunctionResolverV2';
import { buildAllFootprints } from '../src/WallFootprint2D';

const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, thickness: 0.30 };
const B: WallInput = { id: 'B', start: { x: 0, z: 0 }, end: { x: 0, z: 6 }, thickness: 0.30 };

/** Offsets spanning the measured dead zone: just outside the 1 mm tight group, out to the
 *  300 mm host's half-thickness. (0 and 1 mm sit INSIDE the tight group — the exact-vertex Y.) */
const DEAD_ZONE_M = [0.005, 0.01, 0.02, 0.05, 0.075, 0.1, 0.115, 0.14];

const STEP = 0.002;
function inPoly(px: number, pz: number, poly: readonly Pt2[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}
function bbox(polys: readonly (readonly Pt2[])[]): [number, number, number, number] {
    const all = polys.flat();
    return [
        Math.min(...all.map(p => p.x)), Math.max(...all.map(p => p.x)),
        Math.min(...all.map(p => p.z)), Math.max(...all.map(p => p.z)),
    ];
}
/** area(P ∩ Q) in mm² by raster sampling. */
function overlapMm2(p: readonly Pt2[], q: readonly Pt2[]): number {
    if (p.length < 3 || q.length < 3) return 0;
    const [x0, x1, z0, z1] = bbox([p, q]);
    let h = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) for (let z = z0 + STEP / 2; z < z1; z += STEP) {
        if (inPoly(x, z, p) && inPoly(x, z, q)) h++;
    }
    return h * STEP * STEP * 1e6;
}
/** area of `bare` covered by NONE of the three solved footprints, in mm² (an uncovered hole). */
function uncoveredMm2(bare: readonly Pt2[], solved: readonly (readonly Pt2[])[]): number {
    const [x0, x1, z0, z1] = bbox([bare, ...solved]);
    let h = 0;
    for (let x = x0 + STEP / 2; x < x1; x += STEP) for (let z = z0 + STEP / 2; z < z1; z += STEP) {
        if (!inPoly(x, z, bare)) continue;
        if (solved.some(s => inPoly(x, z, s))) continue;
        h++;
    }
    return h * STEP * STEP * 1e6;
}
const fingerprint = (poly: readonly Pt2[]): string =>
    poly.map(p => `${Math.round(p.x * 1e9)},${Math.round(p.z * 1e9)}`).join(';');
const areaMm2 = (poly: readonly Pt2[]): number => Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length]!; return s + p.x * q.z - q.x * p.z;
}, 0) / 2) * 1e6;
function selfIntersects(poly: readonly Pt2[]): boolean {
    const n = poly.length; if (n < 4) return false;
    const cr = (o: Pt2, a: Pt2, b: Pt2) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const hit = (p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2) => {
        const d1 = cr(p3, p4, p1), d2 = cr(p3, p4, p2), d3 = cr(p1, p2, p3), d4 = cr(p1, p2, p4);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
        if (hit(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return true;
    }
    return false;
}

const flag = () => (globalThis as { __pryzmWallV2NearJunctionDeadZone?: boolean });
afterEach(() => { delete flag().__pryzmWallV2NearJunctionDeadZone; });

function solve(offsetM: number) {
    const C: WallInput = { id: 'C', start: { x: offsetM, z: 0 }, end: { x: 3, z: 3 }, thickness: 0.20 };
    const bare = buildAllFootprints([A, B], resolveJunctions([A, B]));
    const three = buildAllFootprints([A, B, C], resolveJunctions([A, B, C]));
    const g = (fps: typeof bare, id: string) => fps.find(f => f.id === id)!.polygon;
    return {
        bareA: g(bare, 'A'), bareB: g(bare, 'B'),
        A: g(three, 'A'), B: g(three, 'B'), C: g(three, 'C'),
    };
}

describe('JunctionResolverV2 — §NEAR-JUNCTION-DEAD-ZONE', () => {
    for (const d of DEAD_ZONE_M) {
        it(`newcomer ${(d * 1000).toFixed(0)}mm off the frozen corner: zero doubled solid, arms untouched`, () => {
            const s = solve(d);

            // (a) THE FIX — the guest doubles into NEITHER arm. Pre-fix this read up to 9,384 mm²
            //     against the arm the single-host T-seat did not use.
            expect(overlapMm2(s.C, s.A)).toBe(0);
            expect(overlapMm2(s.C, s.B)).toBe(0);

            // (b) THE GUARD — both committed arms are byte-identical to the bare-L solve. The
            //     guest conforms to the committed corner; it does not remodel it.
            expect(fingerprint(s.A)).toBe(fingerprint(s.bareA));
            expect(fingerprint(s.B)).toBe(fingerprint(s.bareB));

            // (c) no uncovered hole opened in either committed arm.
            expect(uncoveredMm2(s.bareA, [s.A, s.B, s.C])).toBe(0);
            expect(uncoveredMm2(s.bareB, [s.A, s.B, s.C])).toBe(0);

            // (d) ADR-0299 — the clip must never emit a degenerate sliver.
            expect(s.C.length).toBeGreaterThanOrEqual(4);
            expect(selfIntersects(s.C)).toBe(false);
            expect(areaMm2(s.C)).toBeGreaterThan(500_000);   // ≈ full 200mm × ~4.2m guest body
        });
    }

    it('flag OFF restores the dead zone (documents the defect)', () => {
        flag().__pryzmWallV2NearJunctionDeadZone = false;
        const s = solve(0.02);
        // The pre-fix single-host T-seat leaves substantial doubled solid through the OTHER arm…
        expect(overlapMm2(s.C, s.B)).toBeGreaterThan(5_000);
        // …while still keeping the committed arms byte-identical (L-146 was never wrong about that).
        expect(fingerprint(s.A)).toBe(fingerprint(s.bareA));
        expect(fingerprint(s.B)).toBe(fingerprint(s.bareB));
    });

    it('the EXACT-vertex 3-way Y is UNCHANGED by this fix (flag ON == flag OFF)', () => {
        // At the vertex there is no outsider, so L-146 never fires and this seat is never reached.
        // The arms DO move there — correctly: all three are solved together for the first time.
        flag().__pryzmWallV2NearJunctionDeadZone = true;
        const on = solve(0);
        flag().__pryzmWallV2NearJunctionDeadZone = false;
        const off = solve(0);
        expect(fingerprint(on.A)).toBe(fingerprint(off.A));
        expect(fingerprint(on.B)).toBe(fingerprint(off.B));
        expect(fingerprint(on.C)).toBe(fingerprint(off.C));
        // …and it remains a clean partition: no doubled solid, no uncovered hole.
        expect(overlapMm2(on.C, on.A)).toBe(0);
        expect(overlapMm2(on.C, on.B)).toBe(0);
        expect(uncoveredMm2(on.bareA, [on.A, on.B, on.C])).toBe(0);
    });
});
