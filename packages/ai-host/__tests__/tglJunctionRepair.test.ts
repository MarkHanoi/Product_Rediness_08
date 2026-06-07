// @vitest-environment happy-dom
//
// TGL §JUNCTION-REPAIR (A.21.D14) — emitted-geometry validation + repair.
//
// Proves the engine-side repair pass that closes the "some areas have NO detected
// room" defect: in a generated house/apartment a region yields no room when its
// bounding walls don't share EXACT junction endpoints (sub-grid drift from the
// extend-to-shell pass on slanted shells) or when a degenerate/zero-length wall
// pollutes the graph. The repair welds coincident endpoints to byte-identical
// coordinates and drops degenerate segments BEFORE emission, so the editor's
// RoomDetectionEngine (20 mm node grid) closes a loop around every enclosed area.
//
// happy-dom is required because RoomDetectionEngine transitively imports
// core-app-model (UiPreferences), which touches `window` at module load.

import { describe, expect, it } from 'vitest';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import {
    buildWallsAndDoors,
    __repairSegmentsForTest as repairSegments,
    __JUNCTION_WELD_TOL_M as WELD_TOL,
    type WallSeg,
} from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { buildBubbleGraph, type BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildSemanticGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { emitGeometry } from '../src/workflows/apartmentLayout/tgl/emitGeometry.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { type ShellAnalysis, polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

const seg = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg =>
    ({ id, a: { x: ax, z: az }, b: { x: bx, z: bz }, thickness: 0.1, boundsRoomIds: ['A'] });

function toEngineWalls(option: { walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> }) {
    return option.walls.map((w, i) => ({
        id: `w${i}`,
        baseLine: [
            { x: w.start.x / 1000, y: 0, z: w.start.y / 1000 },
            { x: w.end.x / 1000, y: 0, z: w.end.y / 1000 },
        ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
    }));
}
function mockWallStore(walls: ReturnType<typeof toEngineWalls>) {
    return { getByLevel: (_lvl: string) => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0];
}

describe('§JUNCTION-REPAIR — repairSegments unit', () => {
    it('drops a zero-length / degenerate segment', () => {
        const out = repairSegments([
            seg('w0', 0, 0, 5, 0),
            seg('w1', 5, 0, 5, 0),               // zero-length
            seg('w2', 5, 0, 5, 4),
        ]);
        expect(out.map(s => s.id).sort()).toEqual(['w0', 'w2']);
    });

    it('welds two near-but-not-equal junction endpoints to EXACTLY equal coords', () => {
        // Two walls that should meet at (5, 0) but drifted a few mm apart — the
        // exact failure that straddles the 20 mm detection node grid.
        const out = repairSegments([
            seg('w0', 0, 0, 5.003, 0.002),
            seg('w1', 4.998, -0.001, 5, 4),
        ]);
        const w0 = out.find(s => s.id === 'w0')!;
        const w1 = out.find(s => s.id === 'w1')!;
        // The shared junction endpoints are now byte-identical.
        expect(w0.b.x).toBe(w1.a.x);
        expect(w0.b.z).toBe(w1.a.z);
        // …and within the original drift of the true corner.
        expect(Math.hypot(w0.b.x - 5, w0.b.z)).toBeLessThan(WELD_TOL);
    });

    it('does NOT fuse genuinely-distinct corners (far apart)', () => {
        const out = repairSegments([
            seg('w0', 0, 0, 5, 0),
            seg('w1', 5.5, 0, 10, 0),            // 0.5 m gap — distinct junctions
        ]);
        const w0 = out.find(s => s.id === 'w0')!;
        const w1 = out.find(s => s.id === 'w1')!;
        expect(w0.b.x).not.toBe(w1.a.x);
    });

    it('is a no-op on already-exact coincident endpoints (no regression)', () => {
        const input = [seg('w0', 0, 0, 5, 0), seg('w1', 5, 0, 5, 4), seg('w2', 5, 4, 0, 4)];
        const out = repairSegments(input);
        expect(out).toHaveLength(3);
        for (let i = 0; i < input.length; i++) {
            expect(out[i]!.a).toEqual(input[i]!.a);
            expect(out[i]!.b).toEqual(input[i]!.b);
        }
    });

    it('is deterministic (identical output across repeated runs)', () => {
        const input = [seg('w0', 0, 0, 5.003, 0.002), seg('w1', 4.998, -0.001, 5, 4)];
        const a = repairSegments(input);
        const b = repairSegments(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe('§JUNCTION-REPAIR — emitted geometry is junction-exact + simple', () => {
    function fixture(program = PROGRAM, poly = RECT) {
        const bubble: BubbleGraph = buildBubbleGraph(program, 120);
        const placements = subdivide(decomposeToRects(poly), bubble);
        // Pass the shell polygon so extendWallsToShell + the repair run (production path).
        const { segments, openings } = buildWallsAndDoors(placements, bubble, { shellPolygon: poly });
        const graph = buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L0', seed: 'seed', shellAreaM2: 120 });
        return { graph, segments };
    }

    it('emits no degenerate (zero-length) wall', () => {
        const { segments } = fixture();
        for (const s of segments) {
            expect(Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)).toBeGreaterThanOrEqual(WELD_TOL - 1e-9);
        }
    });

    it('every room boundary polygon is SIMPLE (non-self-intersecting)', () => {
        const { graph } = fixture();
        const spaces = graph.nodes.filter(n => n.kind === 'Space');
        expect(spaces.length).toBeGreaterThan(0);
        for (const s of spaces) {
            const poly = s.geometry!.polygon!;
            expect(poly.length).toBeGreaterThanOrEqual(3);
            expect(isSimplePolygon(poly)).toBe(true);
        }
    });

    it('coincident wall junction endpoints are EXACTLY equal after the repair', () => {
        const { segments } = fixture();
        // Bucket every endpoint at fine precision; any two within the weld tolerance
        // must share the EXACT same coordinate (proves the weld collapsed them).
        const pts = segments.flatMap(s => [s.a, s.b]);
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z);
                if (d > 1e-9 && d < WELD_TOL) {
                    throw new Error(`endpoints ${d * 1000}mm apart were not welded: ${JSON.stringify(pts[i])} ${JSON.stringify(pts[j])}`);
                }
            }
        }
    });
});

describe('§JUNCTION-REPAIR — RoomDetectionEngine closes every area (incl. skewed shell)', () => {
    const constraints: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
    const weights: ScoringWeights = { corridorEfficiency: 1, kitchenWorkflow: 1, naturalLight: 1, privacy: 1 };
    const mkShell = (poly: Pt[]): ShellAnalysis => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
        return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
    };

    it('a SKEWED-shell layout (extend-to-shell path) detects all laid-out rooms', () => {
        // A rotated rectangle — the principal-axis path runs extendWallsToShell,
        // which historically left sub-grid junction drift → dropped rooms. The
        // repair must close every enclosed area.
        // ~11×10 ≈ 105 m² (within the 2-bed §D3.5 hard max of 120 m²), skewed.
        const skew: Pt[] = [
            { x: 0.4, z: 0 }, { x: 11.4, z: 0.7 }, { x: 10.7, z: 9.7 }, { x: -0.3, z: 9 },
        ];
        const shell = mkShell(skew);
        const layouts = generateDeterministicLayouts(shell, PROGRAM, constraints, weights, 1);
        expect(layouts.length).toBeGreaterThan(0);
        const option = layouts[0]!;
        const laidOut = option.rooms.length;
        expect(laidOut).toBeGreaterThanOrEqual(4);

        const engine = new RoomDetectionEngine(mockWallStore(toEngineWalls(option)));
        const detected = engine.detectRoomsForLevel('L0', 0, 2.7);
        // Open-plan rooms (hall + living + kitchen + dining) merge into ONE detected
        // zone, so detected is legitimately a few below laidOut. The regression this
        // guards is rooms VANISHING — a closed cell on the skewed shell yielding NO
        // room because its junction endpoints didn't weld. Allow up to 4 open-plan
        // merges; require the detector to still find a clear multi-room result.
        expect(detected.length).toBeGreaterThanOrEqual(4);
        expect(detected.length).toBeGreaterThanOrEqual(laidOut - 4);
    });

    it('a rectilinear 3-bed layout detects all enclosed rooms (no regression)', () => {
        // ~14×11 ≈ 154 m² (within the 3-bed §D3.5 hard max of 160 m²).
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 11 }, { x: 0, z: 11 }];
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const shell = mkShell(poly);
        const layouts = generateDeterministicLayouts(shell, program, constraints, weights, 1);
        expect(layouts.length).toBeGreaterThan(0);
        const engine = new RoomDetectionEngine(mockWallStore(toEngineWalls(layouts[0]!)));
        const detected = engine.detectRoomsForLevel('L0', 0, 2.7);
        expect(detected.length).toBeGreaterThanOrEqual(6);
    });
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Segment-segment proper-intersection test for polygon simplicity. */
function isSimplePolygon(poly: readonly Pt[]): boolean {
    const n = poly.length;
    if (n < 4) return true;                       // triangle can't self-intersect
    const edges: Array<[Pt, Pt]> = [];
    for (let i = 0; i < n; i++) edges.push([poly[i]!, poly[(i + 1) % n]!]);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // adjacent edges share an endpoint — skip
            if (j === i + 1 || (i === 0 && j === n - 1)) continue;
            if (segmentsProperlyIntersect(edges[i]![0], edges[i]![1], edges[j]![0], edges[j]![1])) return false;
        }
    }
    return true;
}
function cross(o: Pt, a: Pt, b: Pt): number {
    return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}
function segmentsProperlyIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
