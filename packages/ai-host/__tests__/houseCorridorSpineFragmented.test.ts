// §52.6 / ADR-0072 — corridor-spine adjacency on a STAIR-FRAGMENTED (L/T/U) plate.
//
// THE DEFECT (live, 16.7×14.0 m rotated L-plate, corner stair):
//   §DIAG-RECTS stairCarved=true rects=[77.8, 71.0, 15.8, 11.6, 8.8] dominantFrac=0.42
//   §DIAG-BRANCH path=carve → DROPPED bedroom
//   r5(bedroom) → NO DOOR ✗ ; §DIAG-CIRCULATION-REACH sealed=[r5(bedroom)]
// The stair keep-out + plate concavity fracture the buildable area into TWO comparable
// arms (77.8 / 71.0 m²) — NO dominant rect. The §STAIR-OBSTACLE-CARVE runs the corridor
// spine in the dominant arm ONLY, so rooms allocated to the other arm are never
// corridor-adjacent → land-locked → SEALED. No tiling makes one corridor adjacent to the
// entrance AND every private room (the §52.6 dominant-carve-drops vs generic-seals dilemma).
//
// THIS TEST is the EXECUTABLE CONTRACT for ADR-0072 P3c (corridor spine on a fragmented plate).
// It reproduces the two-comparable-band fracture and asserts the engine seals/strands NO
// habitable room and that every private/service room shares a ≥ door-width wall with the
// corridor. GREEN since P3c-a (§52.6) — `coalesceFullEdgeRects` re-joins the collinear stair
// bands into one rect (149 m², dominantFrac 0.80) so the dominant carve spines the whole
// programme (0 drops, 0 seals). Mirrors the tglNoSealedRoom.test.ts harness.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

/** Rooms that NEED a circulation door — a seal/land-lock on these is the real harm. */
const NEEDS_CIRCULATION = new Set(['bedroom', 'master', 'bathroom', 'wc', 'study', 'utility', 'storage']);

/** The ground-storey house programme from the live log (§DIAG-BUBBLE r0..r6): hall + open-plan
 *  living/kitchen/dining + 1 bedroom + 1 bathroom + corridor. */
const GROUND: ApartmentProgram = {
    bedrooms: 1, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
};

/** Drive subdivide → walls/doors on a MULTI-RECT stair-fragmented plate and return the
 *  engine's seal/unrouted diagnostics + a geometric corridor-adjacency check per room. */
function layoutFragmented(rects: readonly Rect[], keepOut: readonly Rect[], program: ApartmentProgram) {
    // bbox over all rects = the plate the bubble graph sizes against.
    const x1 = Math.max(...rects.map(r => r.x1)), z1 = Math.max(...rects.map(r => r.z1));
    const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: x1, z: 0 }, { x: x1, z: z1 }, { x: 0, z: z1 }];
    const graph = buildBubbleGraph(program, area, poly, { envelopeFitGrowth: false });
    const sub = subdivideWithReport(rects, graph, { stairCarved: true, keepOutRects: keepOut });
    const wd = buildWallsAndDoors(sub.placements, graph, {});
    const typeById = new Map(graph.rooms.map(r => [r.id, r.type]));
    const placedById = new Map(sub.placements.map(p => [p.roomId, p.rect]));
    return { graph, sub, wd, typeById, placedById };
}

describe('§52.6 / ADR-0072 — corridor spine links every room on a stair-fragmented L-plate', () => {
    // Two comparable arms (78 / 71 m²) + three stair-clearance slivers → dominantFrac≈0.42,
    // matching the live §DIAG-RECTS. A corner stair keep-out sits in the small-rect corner.
    const ARMS: Rect[] = [
        { x0: 0, z0: 0, x1: 13, z1: 6 },        // 78.0  — dominant arm
        { x0: 0, z0: 6, x1: 13, z1: 11.46 },    // 71.0  — second arm (rooms here get orphaned today)
        { x0: 13, z0: 0, x1: 16, z1: 5.3 },     // 15.9
        { x0: 13, z0: 5.3, x1: 16, z1: 9.3 },   // 12.0
        { x0: 13, z0: 9.3, x1: 16, z1: 12.3 },  //  9.0
    ];
    const KEEPOUT: Rect[] = [{ x0: 14, z0: 9.5, x1: 16, z1: 12.3 }];   // ~stair core

    it('seals/strands NO habitable room (reproduces the live land-locked bedroom)', () => {
        const { wd, typeById } = layoutFragmented(ARMS, KEEPOUT, GROUND);
        const sealed = wd.sealedRoomIds.filter(id => (typeById.get(id) ?? '') !== 'stair');
        const unrouted = wd.unroutedToCirculationRoomIds.filter(id => (typeById.get(id) ?? '') !== 'stair');
        expect(sealed, `sealed: ${sealed.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);
        expect(unrouted, `unrouted: ${unrouted.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);
    });

    it('every private/service room shares a ≥ door-width wall with the corridor (the spine invariant)', () => {
        const { graph, placedById } = layoutFragmented(ARMS, KEEPOUT, GROUND);
        const corridor = graph.rooms.find(r => r.type === 'corridor');
        expect(corridor, 'a corridor was minted').toBeDefined();
        const corr = placedById.get(corridor!.id);
        expect(corr, 'corridor was placed').toBeDefined();
        const DOOR_W = 0.9, TOUCH = 1e-3;
        const sharesCorridorWall = (r: Rect): boolean => {
            if (Math.abs(r.x1 - corr!.x0) <= TOUCH || Math.abs(r.x0 - corr!.x1) <= TOUCH)
                if (Math.min(r.z1, corr!.z1) - Math.max(r.z0, corr!.z0) >= DOOR_W) return true;
            if (Math.abs(r.z1 - corr!.z0) <= TOUCH || Math.abs(r.z0 - corr!.z1) <= TOUCH)
                if (Math.min(r.x1, corr!.x1) - Math.max(r.x0, corr!.x0) >= DOOR_W) return true;
            return false;
        };
        for (const room of graph.rooms) {
            if (!NEEDS_CIRCULATION.has(room.type)) continue;
            const rect = placedById.get(room.id);
            expect(rect, `${room.type} ${room.id} was placed (not dropped)`).toBeDefined();
            expect(
                sharesCorridorWall(rect!),
                `${room.type} ${room.id} shares NO corridor wall — it would ship SEALED (§52.6 spine gap)`,
            ).toBe(true);
        }
    });
});
