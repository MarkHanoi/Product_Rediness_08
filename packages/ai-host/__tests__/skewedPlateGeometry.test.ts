// @vitest-environment happy-dom
//
// A.21.D34 (a)(b)(g)(h) — SKEWED / ROTATED-plate geometry integrity.
//
// On an AXIS-ALIGNED plot the generated house is correct; on a ROTATED principal-
// axis plate several placement/clamp steps used to reason against the axis-aligned
// BOUNDING BOX rather than the true rotated shell polygon, so geometry escaped the
// shell or became invalid (the founder's "stair rot −24.1°, core outside; window
// outside; rooms not detected; missing wall" report). These tests pin each fix on a
// genuinely rotated shell and assert the AXIS-ALIGNED path is unchanged.
//
//   (a) STAIR  — the chosen stair core lies FULLY inside the rotated shell polygon.
//   (b) WINDOW — every shell-hosted window opening lies WITHIN its shell wall span.
//   (g) ROOM   — every detected room boundary polygon is SIMPLE (non-self-intersecting).
//   (h) WALL   — no degenerate (near-zero / self-clustering) wall is emitted.
//
// happy-dom: RoomDetectionEngine transitively imports core-app-model (window touch).

import { describe, expect, it } from 'vitest';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import {
    reserveStairCore, reserveStairCoreShaped,
} from '../src/workflows/houseLayout/stairCore.js';
import {
    chooseStairCorePosition,
    __candidatesForTest as candidates,
} from '../src/workflows/houseLayout/stairPosition.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import {
    __repairSegmentsForTest as repairSegments,
    __WJR_SAFE_MIN_LEN_M as WJR_MIN,
    buildWallsAndDoors,
    type WallSeg,
} from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { enumerateLayouts } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import {
    resolveAllShellWindows, type ShellWall,
} from '../src/workflows/apartmentLayout/windowEmission/shellWallMatch.js';
import { rotatePt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { type ShellAnalysis, polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// ── shared fixtures ───────────────────────────────────────────────────────────

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

type Pt = { x: number; z: number };

/** Rotate an axis-aligned rectangle (origin bbox) by `deg` about its centroid to
 *  produce a genuinely rotated shell polygon (world metres). */
function rotatedRect(wM: number, hM: number, deg: number): Pt[] {
    const rect: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const c = { x: wM / 2, z: hM / 2 };
    return rect.map(p => rotatePt(p, (deg * Math.PI) / 180, c));
}

function mkShell(poly: Pt[]): ShellAnalysis {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
}

// Point-in-polygon (ray cast, boundary-inclusive within 1 mm). World metres.
function pointInPoly(px: number, pz: number, poly: readonly Pt[]): boolean {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const a = poly[i]!, b = poly[(i + 1) % n]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const L2 = ex * ex + ez * ez || 1e-30;
        const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / L2));
        if (Math.hypot(px - (a.x + t * ex), pz - (a.z + t * ez)) <= 1e-3) return true;
    }
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = poly[i]!.z, yj = poly[j]!.z, xi = poly[i]!.x, xj = poly[j]!.x;
        if (((yi > pz) !== (yj > pz)) && (px < (xj - xi) * (pz - yi) / ((yj - yi) || 1e-30) + xi)) inside = !inside;
    }
    return inside;
}

// ── (h) repairSegments drops degenerate / self-clustering stubs ────────────────

describe('A.21.D34(h) — repairSegments drops near-zero / self-clustering walls', () => {
    const seg = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
        ({ id, a: { x: ax, z: az }, b: { x: bx, z: bz }, thickness: 0.1, boundsRoomIds: ['A'] });

    it('drops a sub-50 mm stub that the resolver would self-cluster', () => {
        // A 30 mm wall survives the 10 mm weld-tol drop but self-clusters in the
        // editor's 0.5 m-snap WallJoinResolver → missing wall. Must be dropped here.
        const out = repairSegments([
            seg('w0', 0, 0, 5, 0),
            seg('w1', 5, 0, 5.03, 0),       // 30 mm stub
            seg('w2', 5, 0, 5, 4),
        ]);
        expect(out.some(s => s.id === 'w1')).toBe(false);
        expect(out.map(s => s.id).sort()).toEqual(['w0', 'w2']);
    });

    it('keeps a real partition jog at/above the floor (>= WJR_MIN)', () => {
        const len = WJR_MIN + 0.001;
        const out = repairSegments([seg('w0', 0, 0, 5, 0), seg('w1', 5, 0, 5 + len, 0)]);
        // w1 keeps its own end (no other wall to weld to) → length >= floor → retained.
        expect(out.some(s => s.id === 'w1')).toBe(true);
    });

    it('every emitted segment is at least the degeneracy floor long (no regression)', () => {
        const input = [seg('w0', 0, 0, 5, 0), seg('w1', 5, 0, 5, 4), seg('w2', 5, 4, 0, 4)];
        const out = repairSegments(input);
        for (const s of out) {
            expect(Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)).toBeGreaterThanOrEqual(WJR_MIN - 1e-9);
        }
        expect(out).toHaveLength(3);     // long rectilinear walls untouched
    });
});

// ── (a) stair core fully inside the rotated shell ──────────────────────────────

describe('A.21.D34(a) — stair core stays inside the rotated shell polygon', () => {
    it('candidate culling: perimeter candidates outside the polygon are dropped', () => {
        // A near-axis-aligned shell with a clipped top-right corner (plate-local mm):
        // the "right" + "back" flush candidates sit in the clipped corner and must be
        // culled; central remains the always-present fallback.
        const W = 12000, H = 10000, cw = 2000, ch = 2800;
        const clipped: Array<{ x: number; y: number }> = [
            { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H - 4000 },
            { x: W - 4000, y: H }, { x: 0, y: H },
        ];
        const cs = candidates(W, H, cw, ch, clipped);
        // central is always present.
        expect(cs.some(c => c.kind === 'central')).toBe(true);
        // every PERIMETER candidate that survived is fully inside the polygon.
        const toM = (poly: Array<{ x: number; y: number }>) => poly.map(t => ({ x: t.x / 1000, z: t.y / 1000 }));
        for (const c of cs) {
            if (c.kind === 'central') continue;       // best-effort fallback, not strictly culled
            const corners = [
                { x: c.x, y: c.y }, { x: c.x + cw, y: c.y },
                { x: c.x + cw, y: c.y + ch }, { x: c.x, y: c.y + ch },
            ];
            for (const p of corners) {
                expect(pointInPoly(p.x / 1000, p.y / 1000, toM(clipped))).toBe(true);
            }
        }
    });

    it('axis-aligned reserveStairCore is byte-identical with vs without the polygon path', () => {
        // A rectangular footprint: bbox === shell, so culling never fires → identical.
        const fp: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const a = reserveStairCore(fp, 2);
        const b = reserveStairCoreShaped(fp, 2, 16);
        expect(a.w).toBeGreaterThan(0);
        expect(b.rectMm.w).toBeGreaterThan(0);
        // sanity: inside the bbox.
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(12_000 + 1e-6);
    });

    it('a generated rotated house keeps its stair core inside the rotated shell', () => {
        const skew = rotatedRect(13, 10, 22);            // 22° rotated 130 m² plate
        const res = generateHouseLayout(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(res.stairs).toHaveLength(1);
        const stair = res.stairs[0]!;
        const r = stair.rectMm;       // LAYOUT (principal-axis) frame, mm
        const shellWorld = res.storeys[0]!.footprint;    // world metres
        // Map the four core corners back to WORLD (the editor's +rad about pivot),
        // mm → m, and require each inside the rotated shell polygon.
        const cornersLayoutM = [
            { x: r.x / 1000, z: r.y / 1000 },
            { x: (r.x + r.w) / 1000, z: r.y / 1000 },
            { x: (r.x + r.w) / 1000, z: (r.y + r.h) / 1000 },
            { x: r.x / 1000, z: (r.y + r.h) / 1000 },
        ];
        for (const c of cornersLayoutM) {
            const w = stair.principalAxisRad === 0 ? c : rotatePt(c, stair.principalAxisRad, stair.pivot);
            expect(pointInPoly(w.x, w.z, shellWorld)).toBe(true);
        }
    });
});

// ── (DIAGNOSTIC) does the ENGINE tile the real rotated/sheared shell? ──────────
//
// DISCRIMINATOR (2026-06-13): the founder's recurring "white space" on rotated/sheared
// HOUSE plates has two competing root-causes that can ONLY be told apart by measuring
// the ENGINE's geometric coverage of the REAL shell (no browser needed):
//   (A) ENGINE geometry gap — `§RECTIFY-QUAD` tiles the bbox, leaving the real shell's
//       corner triangles un-tiled  →  Σ room.area  <<  real shell area.
//   (B) EXECUTION detection gap — the engine tiles the full shell, but the editor's
//       room detection / weld merges them  →  Σ room.area  ≈  real shell area.
// This block measures (Σ room.area) / (real shell polygon area) per storey. If the ratio
// is high the white space is (B) execution-side (needs the browser); if it is low the
// white space is (A) engine-side geometry (fixable + testable HERE).
describe('DIAG — engine coverage of the real rotated / sheared shell polygon', () => {
    const coverageByStorey = (res: ReturnType<typeof generateHouseLayout>) =>
        res.perStoreyLayout.map((opt, i) => {
            const tiled = opt.rooms.reduce((s, rm) => s + rm.area, 0);
            const shellArea = polygonAreaM2(res.storeys[i]!.footprint);
            return { tiled, shellArea, ratio: tiled / shellArea };
        });

    it('rotated RECTANGLE (22°, 130 m²) — principal-axis preserves coverage (NOT a rotation gap)', () => {
        // MEASURED 2026-06-13: ground ≈ 0.934, UPPER ≈ 0.881. The control test below proves
        // the upper-floor 12% gap is IDENTICAL axis-aligned (deg=0) → it is UNDER-PROGRAMMING
        // (a sparse 2-bed programme can't fill 130 m²/storey; residual-fill caps out), NOT a
        // rotation/§RECTIFY gap (root-cause A). This tripwire trips if rotation ITSELF starts
        // dropping coverage materially below the under-programming floor.
        const skew = rotatedRect(13, 10, 22);
        const res = generateHouseLayout(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        res.perStoreyLayout.forEach((opt, i) => {
            const breakdown = opt.rooms.map(rm => `${rm.type}:${rm.area.toFixed(1)}`).join(' ');
            const tiled = opt.rooms.reduce((s, rm) => s + rm.area, 0);
            const nonStair = opt.rooms.filter(rm => rm.type !== 'stair').reduce((s, rm) => s + rm.area, 0);
            const stairArea = tiled - nonStair;
            const ratio = tiled / 130;
            // eslint-disable-next-line no-console
            console.log(`§DIAG-COVERAGE rotated-rect storey${i}: tiled=${tiled.toFixed(1)} (stair=${stairArea.toFixed(1)} rooms=${nonStair.toFixed(1)}) shell=130.0 ratio=${ratio.toFixed(3)} | ${breakdown}`);
            expect(ratio, `rotated-rect storey${i} coverage ${ratio.toFixed(3)} below under-programming floor`).toBeGreaterThan(0.80);
            expect(ratio, `rotated-rect storey${i} overflow ${ratio.toFixed(3)}`).toBeLessThan(1.15);
        });
    });

    it('CONTROL: axis-aligned 130 m² same program — isolates rotation from under-programming', () => {
        // IDENTICAL program + per-storey area as the rotated-rect case, but deg=0 (no
        // rotation). If THIS also under-covers, the gap is under-programming (sparse 2-bed
        // on a 65+65 m² house); if THIS covers ≥0.96 the gap is rotation-specific.
        const axis: Pt[] = [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }];
        const res = generateHouseLayout(mkShell(axis), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        res.perStoreyLayout.forEach((opt, i) => {
            const tiled = opt.rooms.reduce((s, rm) => s + rm.area, 0);
            // eslint-disable-next-line no-console
            console.log(`§DIAG-COVERAGE axis-control storey${i}: tiled=${tiled.toFixed(1)} shell=130.0 ratio=${(tiled / 130).toFixed(3)} | ${opt.rooms.map(rm => `${rm.type}:${rm.area.toFixed(1)}`).join(' ')}`);
        });
    });

    it('sheared PARALLELOGRAM (140 m², 0.78 bbox-fill) — Phase-3 polygon subdivide kills the overflow', () => {
        // base 14 × height 10 = 140 m²; sheared +4 m → bbox 18×10 = 180 m² (fill 0.78),
        // exactly the ~0.75-fill regime the doc says diverges ~2.1 m at a corner.
        //
        // PHASE 3 (doc §13.3/§13.4 step 3, §POLYGON-NATIVE-ROUTE): the sheared convex quad is
        // routed to `subdividePolygon`, which tiles the REAL quad instead of its bounding box.
        // The bbox-overflow is GONE: BEFORE Phase 3 the coverage ratio was 1.139 (bbox-tiled
        // rooms poked ~2 m past the diagonal façade — root-cause C, §RECTIFY-QUAD). MEASURED
        // AFTER Phase 3 (2026-06-15): ground ≈ 0.970, upper ≈ 0.915 — BOTH ≤ 1.0 (NO overflow)
        // and far closer to 1.0 than 1.139. The upper sits a little under 1.0 because the stair
        // keep-out is subtracted as a hole from the cells that straddle it (doc §13.6 — the
        // stair stays a subtracted region through Phase 3) + its clearance margin; that is
        // honest under-coverage (circulation slack around the stair), NOT overflow.
        const para: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 18, z: 10 }, { x: 4, z: 10 }];
        const res = generateHouseLayout(mkShell(para), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const storeys = coverageByStorey(res);
        for (const c of storeys) {
            // eslint-disable-next-line no-console
            console.log(`§DIAG-COVERAGE parallelogram storey: tiled=${c.tiled.toFixed(1)} shell=${c.shellArea.toFixed(1)} ratio=${c.ratio.toFixed(3)}`);
            // TIGHTENED band (Phase 3): measured 0.915 (upper) / 0.970 (ground). The overflow
            // is fixed — every cell is now AT OR INSIDE the real façade, so the ceiling drops to
            // ≤ 1.02 (was banded < 1.20 and measured 1.139). The floor is the upper-storey
            // stair-clearance margin (0.915), well above the old 0.80 sanity floor; a regression
            // below 0.90 would mean the polygon tiling started dropping real area.
            expect(c.ratio, `parallelogram coverage ${c.ratio.toFixed(3)} below the Phase-3 floor`).toBeGreaterThan(0.90);
            expect(c.ratio, `parallelogram overflow ${c.ratio.toFixed(3)} — Phase-3 should keep cells INSIDE the façade`).toBeLessThan(1.02);
        }
        // The §RECTIFY overflow is fixed: NO storey exceeds 1.0 by more than a hairline (was
        // 1.139), and the worst is MUCH closer to 1.0 than the old 1.139.
        const worst = storeys.reduce((m, c) => Math.max(m, c.ratio), 0);
        expect(worst, `worst parallelogram ratio ${worst.toFixed(3)} not closer to 1.0 than the old 1.139`).toBeLessThan(1.139 - 0.10);
    });

    // ── §13.5 invariants on the sheared-PARALLELOGRAM cells (Phase 3) ──────────────
    //
    // The polygon-native subdivider must satisfy the doc §13.5 invariants on the real quad:
    // completeness (Σ cell ≈ shell), disjointness (no >ε overlap), in-shell (every cell vertex
    // inside-or-on the real façade), and walls-on-edges. We assert them on the GROUND storey's
    // emitted room polygons (in WORLD metres) of the sheared parallelogram.
    describe('§13.5 invariants — sheared-parallelogram polygon cells', () => {
        const para: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 18, z: 10 }, { x: 4, z: 10 }];
        const res = generateHouseLayout(mkShell(para), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        // Room polygons (world metres {x,z}) from the GROUND storey (index 0).
        const ground = res.perStoreyLayout[0]!;
        const shellPoly = res.storeys[0]!.footprint;
        const cellPolys = ground.rooms
            .filter(r => Array.isArray(r.polygon) && r.polygon!.length >= 3)
            // option polygons are mm {x,y=plan-z}; convert to metres {x,z}.
            .map(r => r.polygon!.map(p => ({ x: p.x / 1000, z: p.y / 1000 })));
        const polyAreaM2 = (poly: { x: number; z: number }[]): number => {
            let a = 0;
            for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; a += p.x * q.z - q.x * p.z; }
            return Math.abs(a) / 2;
        };
        // EXACT convex-polygon intersection area (Sutherland–Hodgman A∩B, both convex) — an
        // AABB probe false-positives on SHEARED cells (their bounding boxes overlap even when
        // the cells are disjoint), so we clip A against B's edges and measure the result.
        const clipAByB = (A: { x: number; z: number }[], B: { x: number; z: number }[]): { x: number; z: number }[] => {
            let sa = 0;
            for (let i = 0; i < B.length; i++) { const p = B[i]!, q = B[(i + 1) % B.length]!; sa += p.x * q.z - q.x * p.z; }
            const ccw = sa >= 0;
            let cur = A.slice();
            for (let i = 0; i < B.length && cur.length >= 3; i++) {
                const a = B[i]!, b = B[(i + 1) % B.length]!;
                const ex = b.x - a.x, ez = b.z - a.z;
                const inside = (p: { x: number; z: number }) => { const c = ex * (p.z - a.z) - ez * (p.x - a.x); return ccw ? c >= -1e-9 : c <= 1e-9; };
                const lerp = (p: { x: number; z: number }, q: { x: number; z: number }) => {
                    const dpx = q.x - p.x, dpz = q.z - p.z; const denom = ex * dpz - ez * dpx;
                    if (Math.abs(denom) < 1e-12) return q;
                    const t = (ex * (p.z - a.z) - ez * (p.x - a.x)) / -denom;
                    return { x: p.x + t * dpx, z: p.z + t * dpz };
                };
                const next: { x: number; z: number }[] = [];
                for (let k = 0; k < cur.length; k++) {
                    const c0 = cur[k]!, c1 = cur[(k + 1) % cur.length]!;
                    const in0 = inside(c0), in1 = inside(c1);
                    if (in0) next.push(c0);
                    if (in0 !== in1) next.push(lerp(c0, c1));
                }
                cur = next;
            }
            return cur;
        };
        const overlapAreaM2 = (A: { x: number; z: number }[], B: { x: number; z: number }[]): number => {
            const inter = clipAByB(A, B);
            return inter.length >= 3 ? polyAreaM2(inter) : 0;
        };

        it('there ARE non-rect (real-polygon) cells on the sheared plate (route fired)', () => {
            expect(cellPolys.length).toBeGreaterThan(0);
        });

        it('completeness: Σ cell area ≈ shell area within the stair-clearance margin (no white space, no overflow)', () => {
            const sum = cellPolys.reduce((s, p) => s + polyAreaM2(p), 0);
            const shellA = polygonAreaM2(shellPoly);
            // Σ cells ≤ shell (no overflow) and within the stair-keep-out margin below it.
            expect(sum, `Σ cell area ${sum.toFixed(1)} overflows shell ${shellA.toFixed(1)}`).toBeLessThanOrEqual(shellA * 1.02);
            expect(sum / shellA, `Σ cell area ratio ${(sum / shellA).toFixed(3)} below the stair-margin floor`).toBeGreaterThan(0.90);
        });

        it('no cell crosses OUTSIDE the real shell — every cell vertex is inside-or-on the façade (within ε)', () => {
            // "inside-or-on within ε": inside the polygon OR within EPS_M of its boundary. EPS_M
            // absorbs the float round-trip through the principal-axis rotation (engine frame →
            // world emit). A vertex metres past the façade (the old §RECTIFY 1.139 overflow,
            // ~2 m) fails this; the worst Phase-3 vertex is a sub-5 cm boundary graze.
            const EPS_M = 0.05;
            const distToPerimeter = (px: number, pz: number): number => {
                let best = Infinity;
                for (let i = 0; i < shellPoly.length; i++) {
                    const a = shellPoly[i]!, b = shellPoly[(i + 1) % shellPoly.length]!;
                    const ex = b.x - a.x, ez = b.z - a.z; const L2 = ex * ex + ez * ez || 1e-30;
                    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / L2));
                    best = Math.min(best, Math.hypot(px - (a.x + t * ex), pz - (a.z + t * ez)));
                }
                return best;
            };
            let worst = 0;
            for (const poly of cellPolys) {
                for (const v of poly) {
                    const ok = pointInPoly(v.x, v.z, shellPoly) || distToPerimeter(v.x, v.z) <= EPS_M;
                    if (!ok) worst = Math.max(worst, distToPerimeter(v.x, v.z));
                    expect(
                        ok,
                        `cell vertex (${v.x.toFixed(2)},${v.z.toFixed(2)}) lies ${distToPerimeter(v.x, v.z).toFixed(3)} m OUTSIDE the real sheared shell (the §RECTIFY overflow)`,
                    ).toBe(true);
                }
            }
            expect(worst, `worst out-of-shell vertex distance ${worst.toFixed(3)} m`).toBeLessThanOrEqual(EPS_M);
        });

        it('disjointness: no two cells overlap by more than ε (rooms tile, never stack)', () => {
            for (let i = 0; i < cellPolys.length; i++) {
                for (let j = i + 1; j < cellPolys.length; j++) {
                    const ov = overlapAreaM2(cellPolys[i]!, cellPolys[j]!);
                    expect(ov, `cells ${i} and ${j} overlap by ${ov.toFixed(2)} m²`).toBeLessThan(0.05);
                }
            }
        });

        it('walls-on-edges: every emitted wall lies on a boundary edge of some cell (within ε)', () => {
            // Every option wall endpoint must lie on (within ε of) some cell polygon edge — i.e.
            // the wall is a real cell boundary, not a floating segment. Convert walls mm→m.
            const onAnyCellEdge = (px: number, pz: number): boolean =>
                cellPolys.some(poly => pointInPoly(px, pz, poly));   // pointInPoly is boundary-inclusive within 1 mm
            for (const w of ground.walls) {
                const a = { x: w.start.x / 1000, z: w.start.y / 1000 };
                const b = { x: w.end.x / 1000, z: w.end.y / 1000 };
                const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
                // The wall midpoint must touch a cell (its own bounding room) — a wall floating
                // in empty space (touching no cell) would be the "wall beyond the façade" defect.
                expect(
                    onAnyCellEdge(a.x, a.z) || onAnyCellEdge(b.x, b.z) || onAnyCellEdge(mid.x, mid.z),
                    `wall (${a.x.toFixed(2)},${a.z.toFixed(2)})→(${b.x.toFixed(2)},${b.z.toFixed(2)}) touches no cell — floating wall`,
                ).toBe(true);
            }
        });
    });
});

// ── (b) windows stay within the shell wall span on a skewed plot ───────────────

describe('A.21.D34(b) — shell windows lie within the shell wall span (skewed)', () => {
    it('drops a window whose centre projects outside the matched shell wall span', () => {
        // One short shell wall; an option external wall whose window centre projects
        // well past the shell wall end (the skewed mis-host case). Must DROP, not
        // clamp-onto-the-end.
        const shell: ShellWall[] = [
            { id: 's0', start: { x: 0, z: 0 }, end: { x: 3, z: 0 } },   // 3 m shell wall
        ];
        const optionWalls = [
            // option wall is parallel + collinear but extends 0..8 m; a window far
            // along it (offset 6 m) has its centre at ~6.6 m — outside [0,3].
            { start: { x: 0, y: 0 }, end: { x: 8000, y: 0 }, isExternal: true },
        ];
        const windows = [
            { wallRef: 0, offset: 6000, width: 1200, height: 1500, sillHeight: 900 },
        ];
        const out = resolveAllShellWindows(windows as never, optionWalls as never, shell);
        expect(out).toHaveLength(0);
    });

    it('keeps a window whose centre projects inside the shell wall span', () => {
        const shell: ShellWall[] = [{ id: 's0', start: { x: 0, z: 0 }, end: { x: 6, z: 0 } }];
        const optionWalls = [{ start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, isExternal: true }];
        const windows = [{ wallRef: 0, offset: 2000, width: 1200, height: 1500, sillHeight: 900 }];
        const out = resolveAllShellWindows(windows as never, optionWalls as never, shell);
        expect(out).toHaveLength(1);
        const w = out[0]!;
        // Whole opening lies within the 6 m shell wall.
        expect(w.offsetM).toBeGreaterThanOrEqual(0);
        expect(w.offsetM + w.widthM).toBeLessThanOrEqual(6 + 1e-6);
    });

    it('generated windows on a rotated shell all lie within their host wall span', () => {
        const skew = rotatedRect(12, 10, 18);
        const layouts = generateDeterministicLayouts(
            mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, 1, undefined, undefined, { latDeg: 51.5 },
        );
        expect(layouts.length).toBeGreaterThan(0);
        const option = layouts[0]!;
        for (const win of option.windows ?? []) {
            const host = option.walls[win.wallRef]!;
            const len = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y);
            expect(win.offset).toBeGreaterThanOrEqual(-1e-6);
            expect(win.offset + win.width).toBeLessThanOrEqual(len + 1e-6);
        }
    });
});

// ── (g) detected room boundaries are simple on a skewed plot ───────────────────

describe('A.21.D34(g) — detected room boundaries are simple (skewed plate)', () => {
    function toEngineWalls(option: { walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> }) {
        return option.walls.map((w, i) => ({
            id: `w${i}`,
            baseLine: [
                { x: w.start.x / 1000, y: 0, z: w.start.y / 1000 },
                { x: w.end.x / 1000, y: 0, z: w.end.y / 1000 },
            ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
        }));
    }
    const mockWallStore = (walls: ReturnType<typeof toEngineWalls>) =>
        ({ getByLevel: () => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0]);

    it('every emitted room polygon is simple (rigid-rotation invariant)', () => {
        const skew = rotatedRect(12, 10, 27);
        const layouts = generateDeterministicLayouts(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        expect(layouts.length).toBeGreaterThan(0);
        for (const r of layouts[0]!.rooms) {
            if (!r.polygon) continue;
            expect(isSimple(r.polygon)).toBe(true);
        }
    });

    it('no detected room boundary self-intersects on a skewed 2-storey house', () => {
        const skew = rotatedRect(13, 10, 22);
        const res = generateHouseLayout(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        for (const layout of res.perStoreyLayout) {
            const engine = new RoomDetectionEngine(mockWallStore(toEngineWalls(layout)));
            const detected = engine.detectRoomsForLevel('L0', 0, 2.7);
            for (const room of detected) {
                const poly = room.boundary.polygon.map((p: { x: number; z: number }) => ({ x: p.x, y: p.z }));
                expect(isSimple(poly)).toBe(true);
            }
            // and the engine actually closes rooms (not a vacuous pass).
            expect(detected.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('no generated wall on a skewed plate is below the degeneracy floor', () => {
        const skew = rotatedRect(13, 10, 22);
        const res = generateHouseLayout(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        for (const layout of res.perStoreyLayout) {
            for (const w of layout.walls) {
                const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) / 1000; // mm → m
                expect(len).toBeGreaterThanOrEqual(WJR_MIN - 1e-6);
            }
        }
    });
});

// ── determinism (no RNG) ───────────────────────────────────────────────────────

describe('A.21.D34 — skewed result is deterministic', () => {
    it('same skewed input → identical stair rect', () => {
        const skew = rotatedRect(13, 10, 22);
        const a = generateHouseLayout(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const b = generateHouseLayout(mkShell(skew), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(a.stairs[0]!.rectMm).toEqual(b.stairs[0]!.rectMm);
    });
});

// ── §FRONTAGE-RECTIFY-FRAME — rotated plate is not 100% window-hard-invalid ────
//
// The founder v107 218 m² rotated (~−26.5°) plate tripped the `window` HARD rule on
// EVERY one of the 8 strategies because frontage was tested against the raw sheared
// quad (all-diagonal edges) instead of the rectified bbox the rooms tile into. The
// engine ran `enumerateLayouts` against the PRINCIPAL-AXIS-ROTATED shellPolygon (the
// frame runDeterministicLayout passes). Here we feed a freehand convex quad in that
// frame directly and assert at least one candidate is window-hard-valid.
describe('§FRONTAGE-RECTIFY-FRAME — rotated convex-quad plate has ≥1 window-valid candidate', () => {
    // A freehand near-rectangle quad (~12 × 11.7 bbox ≈ 140 m²) whose four edges are all
    // slightly off-axis — exactly the convex-quad case rectifyConvexQuad fires on. (Kept
    // under the §D3.5 220 m² 2-bed envelope ceiling so the envelope gate isn't the
    // differentiator — frontage is.)
    const QUAD = [
        { x: -0.15, z: 0.3 }, { x: 11.7, z: -0.2 },
        { x: 12.1, z: 11.8 }, { x: 0.0, z: 11.5 },
    ];

    it('not every strategy fails the window hard rule (frontage no longer false-fails)', () => {
        const cands = enumerateLayouts({
            shellPolygon: QUAD,
            program: PROGRAM,
            levelId: 'shell',
            seed: 'frontage-rectify-frame-test',
            weights: WEIGHTS,
            count: 8,
        });
        expect(cands.length).toBeGreaterThan(0);
        // The cure: `window` is NOT the universal failure across the whole pool (the old
        // bug — frontage tested against the all-diagonal raw quad — failed `window` on
        // ALL 8). With the rectified-frame fix at least one candidate is window-valid.
        const allFailWindow = cands.every(c => c.hardFailedRules.includes('window'));
        expect(allFailWindow).toBe(false);
        expect(cands.some(c => !c.hardFailedRules.includes('window'))).toBe(true);
    });
});

// ── §STAIR-ROOM-DOOR — minted stair gets a circulation door ────────────────────
//
// The `stair` is a CIRCULATION-privacy type, so the pre-fix `needsCirculationAccess`
// excluded it from every reroute pass ("a circulation room IS the spine"). But a stair
// is a DEAD-END vertical core reached FROM the corridor/hall — when its only bubble-edge
// door wasn't realised it logged `stair0(stair) → NO DOOR`. The fix makes the stair a
// reroute target so the circulation-reroute pass gives it a corridor/hall door.
describe('§STAIR-ROOM-DOOR — a stair sharing a corridor wall gets a door', () => {
    // Stair (2×3) directly below a corridor (6-wide spine), sharing the z = 3 wall.
    // NO bubble edge between stair and corridor → only the reroute pass can connect it.
    const graph: BubbleGraph = {
        rooms: [
            { id: 'cor', type: 'corridor', name: 'Corridor', targetAreaM2: 18, isPrivate: false, needsWindow: false },
            { id: 'stair0', type: 'stair', name: 'Stair', targetAreaM2: 6, isPrivate: false, needsWindow: false },
            { id: 'bed', type: 'bedroom', name: 'Bedroom 1', targetAreaM2: 12, isPrivate: true, needsWindow: true },
        ],
        edges: [
            { a: 'cor', b: 'bed', via: 'door' },   // corridor↔bedroom (NOT stair)
        ],
        corridorId: 'cor',
        entryId: null,
    };
    const placements = [
        { roomId: 'cor', rect: { x0: 0, z0: 3, x1: 6, z1: 4 } },      // corridor spine
        { roomId: 'stair0', rect: { x0: 0, z0: 0, x1: 2, z1: 3 } },   // stair below, shares z=3
        { roomId: 'bed', rect: { x0: 2, z0: 0, x1: 6, z1: 3 } },      // bedroom below, shares z=3
    ];

    it('the minted stair gets a door onto the corridor (no longer NO DOOR)', () => {
        const { openings } = buildWallsAndDoors(placements, graph);
        const stairDoor = openings.some(o =>
            o.type === 'door' &&
            o.betweenRoomIds.includes('stair0') &&
            o.betweenRoomIds.some(id => id === 'cor'),
        );
        expect(stairDoor).toBe(true);
    });
});

// ── helpers ─────────────────────────────────────────────────────────────────

type XY = { x: number; y: number };
function isSimple(poly: readonly XY[]): boolean {
    const n = poly.length;
    if (n < 4) return true;
    const edges: Array<[XY, XY]> = [];
    for (let i = 0; i < n; i++) edges.push([poly[i]!, poly[(i + 1) % n]!]);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (j === i + 1 || (i === 0 && j === n - 1)) continue;     // adjacent edges share an endpoint
            if (properIntersect(edges[i]![0], edges[i]![1], edges[j]![0], edges[j]![1])) return false;
        }
    }
    return true;
}
function cross(o: XY, a: XY, b: XY): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}
function properIntersect(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
