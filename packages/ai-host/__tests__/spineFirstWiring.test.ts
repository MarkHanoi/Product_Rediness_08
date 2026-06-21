// §SPINE-FIRST P4 wiring — subdivideWithReport({spineFirst:true}) replaces the area-first carve on an
// all-private (upper) storey: every private room + the stair land on the central corridor by
// construction (the founder's broken first floor — bedrooms chained off each other, stair behind a
// bedroom — becomes impossible). Default off stays byte-identical (covered by the full house suite).

import { describe, expect, it, vi, afterEach } from 'vitest';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const DOOR = 0.8;
function sharedWallM(a: Rect, b: Rect): number {
    const eps = 0.05;
    if (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) {
        const ov = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0); if (ov > eps) return ov;
    }
    if (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps) {
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0); if (ov > eps) return ov;
    }
    return 0;
}
/** Shared wall between a room rect and a corridor expressed as cells (run + legs). */
function sharedWithCorridor(roomRect: Rect, cells: readonly Rect[]): number {
    return Math.max(0, ...cells.map(c => sharedWallM(roomRect, c)));
}

// An UPPER storey: bedrooms + baths only (no living/kitchen/dining/hall) → no public rooms.
const UPPER: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};

describe('§SPINE-FIRST P4 — subdivideWithReport({spineFirst:true}) on an upper storey', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    afterEach(() => { logSpy?.mockRestore(); });

    const W = 16, D = 11;
    const PLATE: Rect[] = [{ x0: 0, z0: 0, x1: W, z1: D }];
    const STAIR: Rect = { x0: 13.5, z0: 8.5, x1: 16, z1: 11 };   // top-right corner keep-out

    function run(spineFirst: boolean) {
        const lines: string[] = [];
        logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')); });
        const area = W * D;
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: W, z: 0 }, { x: W, z: D }, { x: 0, z: D }];
        const graph = buildBubbleGraph(UPPER, area, poly, { envelopeFitGrowth: false });
        const sub = subdivideWithReport(PLATE, graph, { spineFirst, keepOutRects: [STAIR] });
        return { graph, sub, lines };
    }

    it('fires the spine-first path and places every private room on the corridor', () => {
        const { graph, sub, lines } = run(true);
        expect(lines.some(l => l.includes('§SPINE-FIRST applied')), `spine-first should fire:\n${lines.join('\n')}`).toBe(true);

        const corridorId = graph.corridorId!;
        const corrP = sub.placements.find(p => p.roomId === corridorId)!;
        expect(corrP).toBeDefined();
        // corridor cells = the run rect (+ a leg, folded into cellPolygonById). For the wall check use
        // the run rect; rooms comb off it by construction.
        const rooms = sub.placements.filter(p => p.roomId !== corridorId);
        const offCorridor = rooms.filter(p => sharedWithCorridor(p.rect, [corrP.rect]) < DOOR);
        expect(offCorridor.map(p => p.roomId), 'every private room shares a door-width corridor wall').toEqual([]);
        expect(sub.droppedRooms).toEqual([]);
    });

    it('default off (spineFirst:false) does NOT fire the spine path', () => {
        const { lines } = run(false);
        expect(lines.some(l => l.includes('§SPINE-FIRST applied'))).toBe(false);
    });
});
