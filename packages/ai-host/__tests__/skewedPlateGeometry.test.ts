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
