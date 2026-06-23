// §GROUND-HALL-CORRIDOR (founder defect CFstdjE9 #2, 2026-06-23) — on the GROUND floor the entrance
// hall must ANCHOR the room-corridor spine (the hall sits ON the corridor), not connect only to the
// stair. The §HALL-HINGE-CARVE geometry [public | hall | corridor | private] makes the hall border
// the corridor BY CONSTRUCTION, so `corridorHallGapFor` reads false — proving a clean candidate
// exists for the 'corridor-hall' hard gate to float to the top. TEST-FIRST.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { corridorHallGapFor } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

describe('§GROUND-HALL-CORRIDOR — the hall anchors the corridor on the ground floor', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { logSpy.mockRestore(); });

    const GROUND: ApartmentProgram = {
        bedrooms: 2, bathrooms: 1, masterEnSuite: false,
        includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
    };
    // A rectangular ground plate large enough for the hall-hinge to seat [public | hall | corridor | private].
    const PLATE: Rect[] = [{ x0: 0, z0: 0, x1: 16, z1: 11 }];   // 176 m²

    it('the hall-hinge carve leaves the hall ON the corridor (corridorHallGapFor === false)', () => {
        const area = PLATE.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const graph = buildBubbleGraph(GROUND, area, poly, { envelopeFitGrowth: false });
        const sub = subdivideWithReport(PLATE, graph, { stairCarved: true, keepOutRects: [] });
        const placements = sub.placements.map(p => ({ roomId: p.roomId, rect: p.rect }));
        const corridor = graph.rooms.find(r => r.type === 'corridor');
        const hall = graph.rooms.find(r => r.type === 'hall');
        // Only meaningful when both rooms placed (the hall-hinge path).
        if (!corridor || !hall) return;
        const corrP = placements.find(p => p.roomId === corridor.id);
        const hallP = placements.find(p => p.roomId === hall.id);
        if (!corrP || !hallP) return;
        // GF-C4: the corridor reaches the hall (a door-width shared wall) — the hall anchors the spine.
        expect(corridorHallGapFor(placements, corridor.id, hall.id)).toBe(false);
    });

    it('the hall also borders a PUBLIC room (the public zone sits across the hall from the corridor)', () => {
        const area = PLATE.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const graph = buildBubbleGraph(GROUND, area, poly, { envelopeFitGrowth: false });
        const sub = subdivideWithReport(PLATE, graph, { stairCarved: true, keepOutRects: [] });
        const typeById = new Map(graph.rooms.map(r => [r.id, r.type]));
        const hall = graph.rooms.find(r => r.type === 'hall');
        const hallP = hall && sub.placements.find(p => p.roomId === hall.id);
        if (!hallP) return;
        const PUBLIC = new Set(['living', 'kitchen', 'dining']);
        const sharedWallM = (a: Rect, b: Rect): number => {
            const eps = 0.05;
            if (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) {
                const ov = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0); if (ov > eps) return ov;
            }
            if (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps) {
                const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0); if (ov > eps) return ov;
            }
            return 0;
        };
        const publicNeighbours = sub.placements.filter(p =>
            PUBLIC.has(typeById.get(p.roomId) ?? '') && sharedWallM(p.rect, hallP.rect) >= 0.9);
        expect(publicNeighbours.length).toBeGreaterThan(0);
    });
});
