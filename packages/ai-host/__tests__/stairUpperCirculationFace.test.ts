// §STAIR-CIRC-FACE regression (founder defect 2026-06-11, tracker §52.6 — the UPPER-storey
// stair land-lock).
//
// THE DEFECT (founder, with the node inspector as proof): on the FIRST floor the upper stair's
// node read "Not on circulation ✗ (served through Bedroom 3)" — the stair's ONLY door was onto a
// BEDROOM, so you reach the vertical-circulation core THROUGH a habitable room. Root cause: a
// multi-storey UPPER storey carves its corridor/landing against ONE face of the buildable plate,
// but the stair keep-out was SUBTRACTED on whichever edge the stair core sits — frequently the
// OPPOSITE edge from the corridor face. The corridor then never reaches the stair → the door
// pipeline can host no corridor↔stair door → the stair is served through the bedroom that wraps
// it. Same class as the §52.6 ground land-lock, but for the STAIR on the upper storey.
//
// THE FIX (subdivide.ts §STAIR-CIRC-FACE): pass the stair keep-out(s) into `subdivideWithReport`.
//   (1) On a keep-out storey PREFER the single-loaded (one-FACE) corridor over the double-loaded
//       (centre-strip) carve — a centre strip can never reach an EDGE keep-out, a face strip can.
//   (2) After the carve, REFLECT the placement set within its own bbox to bring the corridor face
//       to the keep-out edge. Reflection is area-, shape- and tiling-preserving, so no room
//       changes size and nothing is dropped — it only swaps WHICH edge each zone lands on.
// The corridor then shares a wall with the stair keep-out, so `wallsAndDoors` §STAIR-ROOM-DOOR
// (which only ever reroutes the stair onto a corridor/hall wall — stair.accessFrom = corridor/
// hall) places the stair's door onto CIRCULATION, never a bedroom.
//
// These tests drive the literal subdivider + door pipeline over an UPPER-storey programme
// (bedrooms + bath + a minted landing/corridor, NO public rooms — the §NO-PUBLIC carve path)
// with a stair keep-out on the HIGH-z edge (opposite the corridor's natural carve face). They
// assert, on every plate: WITHOUT the hint the corridor does NOT reach the stair (the bug
// surface); WITH it the corridor SHARES a ≥0.9 m wall with the stair keep-out AND the stair's
// REALISED door lands on the corridor (not a bedroom); no room dropped; deterministic.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { decomposeToRects, subtractRectsFromRects, rectArea, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';
import type { ProgramRoom, AdjacencyEdge } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';

/** A canonical UPPER house storey programme: bedrooms + bathroom + a minted landing/corridor,
 *  NO kitchen / living / dining / hall (SPEC-CASA §3 — upper storeys are private). */
const UPPER: ApartmentProgram = {
    bedrooms: 3, bathrooms: 1, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};

const M = 0.05;             // KEEPOUT_MARGIN_M — matches enumerate.ts
const DOOR_W = 0.9, TOUCH = 1e-3;

/** Inflate a keep-out by KEEPOUT_MARGIN_M (the SAME inflation enumerate.ts applies before it
 *  subtracts the core from the plate AND before it fills the region with the `stair` room). */
function inflate(ko: Rect): Rect {
    return { x0: ko.x0 - M, z0: ko.z0 - M, x1: ko.x1 + M, z1: ko.z1 + M };
}

/** The shared axis-aligned wall length (m) between two rects (0 ⇒ no usable shared face). */
function sharedWallLenM(a: Rect, b: Rect): number {
    if (Math.abs(a.x1 - b.x0) <= M || Math.abs(a.x0 - b.x1) <= M) {
        const zOv = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (zOv > TOUCH) return zOv;
    }
    if (Math.abs(a.z1 - b.z0) <= M || Math.abs(a.z0 - b.z1) <= M) {
        const xOv = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (xOv > TOUCH) return xOv;
    }
    return 0;
}

/** Carve an UPPER-storey plate with a stair keep-out, mirroring enumerate.ts: subtract the
 *  INFLATED keep-out from the plate, subdivide (with or without the §STAIR-CIRC-FACE hint),
 *  then APPEND the `stair` room + its placement (filling the same inflated region) and run the
 *  door pipeline — exactly as the production HOUSE path does. */
function carveUpper(wM: number, hM: number, ko: Rect, withHint: boolean) {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const area = wM * hM;
    const graph = buildBubbleGraph(UPPER, area, poly, { envelopeFitGrowth: false });

    const koInf = inflate(ko);
    let rects = decomposeToRects(poly);
    rects = subtractRectsFromRects(rects, [koInf]);
    const stairCarved = rects.length > 1;

    const sub = subdivideWithReport(rects, graph, {
        stairCarved,
        ...(withHint ? { keepOutRects: [koInf] } : {}),
    });

    // Append the `stair` room + its placement at the inflated keep-out region (enumerate.ts
    // §STAIR-ROOM), connected to the corridor it serves. The geometric door is realised only
    // when the stair shares a real wall with the corridor — exactly what the fix guarantees.
    const stair: ProgramRoom = {
        id: 'stair0', type: 'stair', name: 'Stair',
        targetAreaM2: rectArea(koInf), isPrivate: false, needsWindow: false,
    };
    const stairEdge: AdjacencyEdge | null = graph.corridorId
        ? { a: 'stair0', b: graph.corridorId, via: 'door' }
        : null;
    const graphWithStair = {
        ...graph,
        rooms: [...graph.rooms, stair],
        edges: stairEdge ? [...graph.edges, stairEdge] : graph.edges,
    };
    const placements = [...sub.placements, { roomId: 'stair0', rect: koInf }];

    const wd = buildWallsAndDoors(placements, graphWithStair, {});
    const typeById = new Map(graphWithStair.rooms.map(r => [r.id, r.type]));
    const placedById = new Map(placements.map(p => [p.roomId, p.rect]));
    return { graph: graphWithStair, sub, wd, typeById, placedById, koInf, rectCount: rects.length };
}

/** The door partner TYPES of the stair in the built layout (excluding the stair itself). */
function stairDoorPartnerTypes(
    wd: ReturnType<typeof buildWallsAndDoors>,
    typeById: Map<string, string>,
): string[] {
    return wd.openings
        .filter(o => o.type === 'door')
        .map(o => o.betweenRoomIds as readonly [string, string?])
        .filter(([a, b]) => b && (a === 'stair0' || b === 'stair0'))
        .map(([a, b]) => typeById.get(a === 'stair0' ? b! : a) ?? '?');
}

/** Build the high-z-edge stair keep-out (~3.0 × 2.6 m, centred in x) for a plate. */
function highEdgeKeepOut(wM: number, hM: number): Rect {
    const cw = 3.0, ch = 2.6;
    const x0 = Math.round((wM * 0.5 - cw / 2) * 100) / 100;
    return { x0, z0: hM - ch, x1: x0 + cw, z1: hM };
}

// Upper plates whose UPPER programme (3 bed + 1 bath + landing) fits with NO drop and whose
// carve lays the corridor on a FACE the §STAIR-CIRC-FACE reflection can bring to the keep-out.
const PLATES: ReadonlyArray<readonly [number, number]> = [
    [12, 9], [13, 9], [12, 10], [14, 9], [13, 10], [12, 8.5], [15, 9],
];

describe('§STAIR-CIRC-FACE: the UPPER-storey stair reaches the landing/corridor, never served through a bedroom (founder 2026-06-11)', () => {
    for (const [w, h] of PLATES) {
        const ko = highEdgeKeepOut(w, h);

        it(`${w}×${h} upper storey — WITHOUT the hint the corridor does NOT reach the stair (the founder bug surface)`, () => {
            const { graph, placedById, koInf } = carveUpper(w, h, ko, false);
            const corridor = graph.rooms.find(r => r.type === 'corridor');
            expect(corridor, `${w}×${h}: a landing/corridor is minted upstairs`).toBeDefined();
            const reach = sharedWallLenM(placedById.get(corridor!.id)!, koInf);
            // The default carve never puts the corridor against the keep-out edge → the stair
            // would be served through the bedroom wrapping it (exactly the founder's defect).
            expect(reach, `${w}×${h}: WITHOUT the hint the corridor unexpectedly reaches the stair`).toBeLessThan(DOOR_W);
        });

        it(`${w}×${h} upper storey — WITH the hint the corridor SHARES a ≥0.9 m wall with the stair AND no room is dropped`, () => {
            const { graph, sub, placedById, koInf } = carveUpper(w, h, ko, true);
            const corridor = graph.rooms.find(r => r.type === 'corridor')!;

            // Reflection is shape/area/tiling-preserving → never trades a seal for a drop.
            expect(sub.droppedRooms.map(d => d.type), `${w}×${h} dropped rooms`).toEqual([]);

            const reach = sharedWallLenM(placedById.get(corridor.id)!, koInf);
            expect(
                reach,
                `${w}×${h}: corridor shares only ${reach.toFixed(2)} m with the stair keep-out — the stair can't door onto circulation`,
            ).toBeGreaterThanOrEqual(DOOR_W);
        });

        it(`${w}×${h} upper storey — the stair's REALISED door lands on circulation, NOT a bedroom`, () => {
            const { wd, typeById } = carveUpper(w, h, ko, true);
            const partners = stairDoorPartnerTypes(wd, typeById);
            expect(partners.length, `${w}×${h}: the stair got a door`).toBeGreaterThan(0);
            // EVERY stair door partner is circulation (corridor/hall) — never a bedroom/master/bath.
            for (const t of partners) {
                expect(
                    ['corridor', 'hall'].includes(t),
                    `${w}×${h}: the stair's door is onto "${t}" — it must be reached FROM circulation, not through a habitable room`,
                ).toBe(true);
            }
            // And the engine's own diagnostics never report the stair unrouted/sealed.
            expect(wd.unroutedToCirculationRoomIds, `${w}×${h}: stair unrouted`).not.toContain('stair0');
            expect(wd.sealedRoomIds, `${w}×${h}: stair sealed`).not.toContain('stair0');
        });
    }

    it('the §STAIR-CIRC-FACE hint flips the corridor onto the stair edge (mechanism: 0 → ≥0.9 m)', () => {
        // The clearest single demonstration: same plate, hint off vs on. Off → the corridor sits
        // on the FAR face from the keep-out (reach 0, the bug); on → it lands on the keep-out edge.
        const [w, h] = [12, 9];
        const ko = highEdgeKeepOut(w, h);
        const corrId = carveUpper(w, h, ko, true).graph.rooms.find(r => r.type === 'corridor')!.id;
        const without = carveUpper(w, h, ko, false);
        const withHint = carveUpper(w, h, ko, true);
        const reachWithout = sharedWallLenM(without.placedById.get(corrId)!, without.koInf);
        const reachWith = sharedWallLenM(withHint.placedById.get(corrId)!, withHint.koInf);
        expect(reachWithout, 'without the hint the corridor does not reach the stair').toBeLessThan(DOOR_W);
        expect(reachWith, 'with the hint the corridor reaches the stair (≥ a door width)').toBeGreaterThanOrEqual(DOOR_W);
    });

    it('the apartment path (NO keep-out) is byte-identical (the hint is a no-op)', () => {
        // No keep-out ⇒ no §STAIR-CIRC-FACE orientation ⇒ identical placements with/without the
        // (empty) hint — the ADR-0061 byte-identical guarantee for the apartment.
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];
        const apt: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: false,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const graph = buildBubbleGraph(apt, 108, poly, {});
        const rects = decomposeToRects(poly);
        const a = subdivideWithReport(rects, graph, {});
        const b = subdivideWithReport(rects, graph, { keepOutRects: [] });
        expect(JSON.stringify(a.placements)).toEqual(JSON.stringify(b.placements));
    });

    it('is deterministic (same upper plate → identical placements + stair door partners)', () => {
        const [w, h] = [13, 9];
        const ko = highEdgeKeepOut(w, h);
        const a = carveUpper(w, h, ko, true);
        const b = carveUpper(w, h, ko, true);
        expect(JSON.stringify(a.sub.placements)).toEqual(JSON.stringify(b.sub.placements));
        expect(JSON.stringify(stairDoorPartnerTypes(a.wd, a.typeById)))
            .toEqual(JSON.stringify(stairDoorPartnerTypes(b.wd, b.typeById)));
    });
});
