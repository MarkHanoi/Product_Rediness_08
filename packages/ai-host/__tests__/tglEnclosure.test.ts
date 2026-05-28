// TGL — room-enclosure verification.
//
// Proves the emitted geometry actually ENCLOSES rooms end-to-end:
//   1. each open-plan ZONE is watertight (its boundary is fully walled; intra-zone
//      boundaries are open) — open-plan rooms merge into one detected room;
//   2. no wall end dangles (every endpoint anchors to another wall at a corner or
//      T-junction) — so RoomDetectionEngine's split passes close every cell;
//   3. interior-only emit drops perimeter walls without orphaning doors.

import { describe, expect, it } from 'vitest';
import { emitGeometry } from '../src/workflows/apartmentLayout/tgl/emitGeometry.js';
import { buildLayoutCommands } from '../src/workflows/apartmentLayout/executePlan.js';
import { buildSemanticGraph, type LayoutGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph, type BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
const EPS = 1e-3;

function fixture(program = PROGRAM, poly = RECT): { graph: LayoutGraph; bubble: BubbleGraph } {
    const bubble = buildBubbleGraph(program, 120);
    const placements = subdivide(decomposeToRects(poly), bubble);
    const { segments, openings } = buildWallsAndDoors(placements, bubble);
    const graph = buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L1', seed: 'seed', shellAreaM2: 120 });
    return { graph, bubble };
}

/** Union-find zones over the bubble's 'open' edges (mirrors P4). */
function zonesOf(bubble: BubbleGraph): (a: string, b: string) => boolean {
    const root = new Map<string, string>(bubble.rooms.map(r => [r.id, r.id]));
    const find = (x: string): string => { while (root.get(x)! !== x) x = root.get(x)!; return x; };
    for (const e of bubble.edges) if (e.via === 'open') root.set(find(e.a), find(e.b));
    return (a, b) => find(a) === find(b);
}

const bbox = (poly: readonly Pt[]): Rect => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { x0, z0, x1, z1 };
};

/** Total covered length of [lo,hi] by merged sub-intervals. */
function coverage(lo: number, hi: number, intervals: Array<[number, number]>): number {
    const clipped = intervals
        .map(([a, b]) => [Math.max(lo, Math.min(a, b)), Math.min(hi, Math.max(a, b))] as [number, number])
        .filter(([a, b]) => b - a > EPS)
        .sort((p, q) => p[0] - q[0]);
    let covered = 0, cur = -Infinity;
    for (const [a, b] of clipped) { const s = Math.max(a, cur); if (b > s) covered += b - s; cur = Math.max(cur, b); }
    return covered;
}

describe('D-TGL room enclosure', () => {
    it('each room edge is sealed by a wall, OR open only to a same-zone (open-plan) neighbour', () => {
        const { graph, bubble } = fixture();
        const inSameZone = zonesOf(bubble);
        const spaces = graph.nodes.filter(n => n.kind === 'Space');
        const rectOf = new Map(spaces.map(s => [s.guid, bbox(s.geometry!.polygon!)]));
        const idOf = new Map(spaces.map(s => [s.guid, s.sourceId]));
        const walls = graph.nodes.filter(n => n.kind === 'Wall').map(n => n.geometry!.baseLine!);
        const horiz = walls.filter(([a, b]) => Math.abs(a.z - b.z) < EPS);
        const vert = walls.filter(([a, b]) => Math.abs(a.x - b.x) < EPS);

        for (const s of spaces) {
            const r = rectOf.get(s.guid)!;
            const myId = idOf.get(s.guid)!;
            // intervals where this edge opens onto a SAME-ZONE neighbour (legit gap)
            const openOnLine = (orient: 'h' | 'v', coord: number): Array<[number, number]> => {
                const out: Array<[number, number]> = [];
                for (const t of spaces) {
                    if (t === s || !inSameZone(myId, idOf.get(t.guid)!)) continue;
                    const o = rectOf.get(t.guid)!;
                    if (orient === 'h' && (Math.abs(o.z0 - coord) < EPS || Math.abs(o.z1 - coord) < EPS)) out.push([o.x0, o.x1]);
                    else if (orient === 'v' && (Math.abs(o.x0 - coord) < EPS || Math.abs(o.x1 - coord) < EPS)) out.push([o.z0, o.z1]);
                }
                return out;
            };
            const edges: Array<{ orient: 'h' | 'v'; coord: number; lo: number; hi: number }> = [
                { orient: 'h', coord: r.z0, lo: r.x0, hi: r.x1 },
                { orient: 'h', coord: r.z1, lo: r.x0, hi: r.x1 },
                { orient: 'v', coord: r.x0, lo: r.z0, hi: r.z1 },
                { orient: 'v', coord: r.x1, lo: r.z0, hi: r.z1 },
            ];
            for (const e of edges) {
                const wallIntervals: Array<[number, number]> = (e.orient === 'h' ? horiz : vert)
                    .filter(([a]) => Math.abs((e.orient === 'h' ? a.z : a.x) - e.coord) < EPS)
                    .map(([a, b]) => (e.orient === 'h' ? [a.x, b.x] : [a.z, b.z]) as [number, number]);
                const covered = coverage(e.lo, e.hi, [...wallIntervals, ...openOnLine(e.orient, e.coord)]);
                expect(covered).toBeGreaterThanOrEqual(e.hi - e.lo - EPS);   // sealed or open-to-zone
            }
        }
    });

    it('no dangling wall ends: every endpoint anchors to another wall (corner or T-junction)', () => {
        // RoomDetectionEngine closes a cell only if every wall endpoint shares a
        // corner with, or lies on the interior of (≤0.5 m), another wall (it then
        // splits the host at the T-junction). Prove zero dangling ends.
        const { graph } = fixture();
        const walls = graph.nodes.filter(n => n.kind === 'Wall').map(n => n.geometry!.baseLine!);
        const T_MARGIN = 0.05, T_THRESH = 0.5;
        const distToSeg = (p: Pt, a: Pt, b: Pt): { d: number; t: number } => {
            const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
            if (len2 < 1e-12) return { d: Math.hypot(p.x - a.x, p.z - a.z), t: 0 };
            const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
            const cx = a.x + Math.max(0, Math.min(1, t)) * dx, cz = a.z + Math.max(0, Math.min(1, t)) * dz;
            return { d: Math.hypot(p.x - cx, p.z - cz), t };
        };
        const coincides = (p: Pt, q: Pt): boolean => Math.hypot(p.x - q.x, p.z - q.z) < 0.02;
        const anchored = (p: Pt, selfIdx: number): boolean => walls.some(([a, b], j) => {
            if (j === selfIdx) return false;
            if (coincides(p, a) || coincides(p, b)) return true;
            const { d, t } = distToSeg(p, a, b);
            return d < T_THRESH && t > T_MARGIN && t < 1 - T_MARGIN;
        });
        walls.forEach(([a, b], i) => {
            expect(anchored(a, i)).toBe(true);
            expect(anchored(b, i)).toBe(true);
        });
    });

    it('preview emits ALL walls (perimeter flagged); build skips exterior, keeps all doors', () => {
        const { graph } = fixture();
        const { option } = emitGeometry(graph);
        const exterior = option.walls.filter(w => w.isExternal === true).length;
        const interior = option.walls.filter(w => !w.isExternal).length;
        expect(exterior).toBeGreaterThan(0);                 // preview shows the perimeter
        expect(interior).toBeGreaterThan(0);

        // Build with skipExteriorWalls → only interior partitions are created, every
        // door survives (hosted on interior walls) and references a built wall.
        // §COLLINEAR-MERGE folds collinear adjacent segments into single passthrough
        // walls — wallIds.length ≤ interior (every interior segment is REPRESENTED;
        // none is dropped). The merge emits an informational warning; no `dropped`
        // warning is allowed.
        let n = 0;
        const set = buildLayoutCommands(option, { levelId: 'L0', skipExteriorWalls: true }, () => `id-${n++}`);
        expect(set.wallIds.length).toBeGreaterThan(0);
        expect(set.wallIds.length).toBeLessThanOrEqual(interior);
        expect(set.doorIds.length).toBe(option.doors.length);
        expect(set.warnings.filter(w => w.includes('dropped'))).toEqual([]);
    });
});
