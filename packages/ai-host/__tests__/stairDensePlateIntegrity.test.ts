// §STAIR-CIRC-STUB + §STAIR-OVERLAP-CLIP regression (founder defects §65.1 + §65.3, 2026-06-11)
// — the DENSE / LARGE plate stair-integrity pass.
//
// TWO founder defects on a DENSE plate (≈180 m² ground, many bedrooms, opposite-edge stair):
//
//  §65.1 KITCHEN-IN-STAIR — a habitable room tiled ACROSS the stair keep-out (the founder saw a
//        ~41 m² "Kitchen" drawn straight over the stair). A room must NEVER overlap the keep-out:
//        only the `stair` room may occupy it. subdivide.ts §STAIR-OVERLAP-CLIP is the HARD net —
//        every non-stair room rect intersecting the keep-out is clipped back clear of it.
//
//  §65.3 STAIR NOT CONNECTED — v142 §STAIR-CIRC-FACE reflected the corridor to the keep-out, but a
//        bbox reflection can't bring a full-width strip (whose long axis is PARALLEL to the keep-out
//        edge, with the private comb in between — the dense-ground topology) across the comb to an
//        OPPOSITE-edge keep-out. The corridor never reaches the stair → the stair's only door lands
//        on a bedroom (`§DIAG-STAIR-CIRC sharesStairWall=NO`). The FIX (enumerate.ts §STAIR-CIRC-STUB
//        + subdivide.ts findCorridorStubToKeepOut): route a PERPENDICULAR corridor STUB through the
//        EMPTY band beside the keep-out and mint it as a DEDICATED `corridor` room wired
//        stub↔corridor (open) + stub↔stair (door), so the stair doors onto circulation.
//
// These tests drive the LITERAL subdivider + the §STAIR-ROOM/§STAIR-CIRC-STUB minting (mirroring the
// production enumerate.ts HOUSE path) + the door pipeline over dense plates whose stair sits on the
// edge OPPOSITE the corridor's natural carve face (the reflection-fails case). They assert, per
// storey: (a) NO habitable room rect overlaps the keep-out (§65.1); (b) the corridor SHARES a
// ≥0.9 m wall with the stair AND the stair's REALISED door lands on circulation, not a bedroom
// (§65.3); deterministic; and the apartment (no keep-out) path stays byte-identical.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideWithReport, findCorridorStubToKeepOut } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import {
    decomposeToRects, subtractRectsFromRects, polygonBBox, rectArea, type Pt, type Rect,
} from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';
import type { ProgramRoom, AdjacencyEdge } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';

const M = 0.05;                 // KEEPOUT_MARGIN_M — matches enumerate.ts
const DOOR_W = 0.9, TOUCH = 1e-3;

const inflate = (k: Rect): Rect => ({ x0: k.x0 - M, z0: k.z0 - M, x1: k.x1 + M, z1: k.z1 + M });

/** Shared axis-aligned wall length (m) between two rects (0 ⇒ no usable shared face). */
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

/** Interior floor overlap area (m²) between two rects. */
function overlapAreaM2(a: Rect, b: Rect): number {
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return ox > TOUCH && oz > TOUCH ? ox * oz : 0;
}

/** A high-z-edge stair keep-out (~3.0 × 2.6 m, centred in x) — OPPOSITE the corridor's natural
 *  carve face, so the §STAIR-CIRC-FACE reflection cannot reach it (the §65.3 case). */
function highEdgeKeepOut(wM: number, hM: number): Rect {
    const cw = 3.0, ch = 2.6;
    const x0 = Math.round((wM * 0.5 - cw / 2) * 100) / 100;
    return { x0, z0: hM - ch, x1: x0 + cw, z1: hM };
}

/** Carve a dense plate exactly as the production HOUSE path does: subtract the INFLATED keep-out,
 *  subdivide (with the §STAIR-CIRC-FACE keep-out hint), then mint the `stair` room AND — when the
 *  corridor still doesn't reach it — the §STAIR-CIRC-STUB corridor stub (enumerate.ts mirror), then
 *  run the door pipeline. Returns everything needed to assert §65.1 + §65.3. */
function buildDenseStorey(prog: ApartmentProgram, wM: number, hM: number, ko: Rect) {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const graph = buildBubbleGraph(prog, wM * hM, poly, { envelopeFitGrowth: false });
    const koInf = inflate(ko);
    const rects = subtractRectsFromRects(decomposeToRects(poly), [koInf]);
    const sub = subdivideWithReport(rects, graph, {
        stairCarved: rects.length > 1, keepOutRects: [koInf],
    });

    const typeById = new Map<string, string>(graph.rooms.map(r => [r.id, r.type]));
    const circId = graph.corridorId;

    // §STAIR-ROOM — append the `stair` room at the inflated keep-out (enumerate.ts mirror).
    let placements = [...sub.placements, { roomId: 'stair0', rect: koInf }];
    typeById.set('stair0', 'stair');
    const stair: ProgramRoom = {
        id: 'stair0', type: 'stair', name: 'Stair', targetAreaM2: rectArea(koInf),
        isPrivate: false, needsWindow: false,
    };
    const stairEdge: AdjacencyEdge | null = circId ? { a: 'stair0', b: circId, via: 'door' } : null;
    let bubble = {
        ...graph,
        rooms: [...graph.rooms, stair],
        edges: stairEdge ? [...graph.edges, stairEdge] : graph.edges,
    };

    // §STAIR-CIRC-STUB — when the corridor doesn't already reach the stair, route + mint the stub.
    let stubFired = false;
    const corrP = placements.find(p => p.roomId === circId);
    if (corrP && circId && sharedWallLenM(corrP.rect, koInf) < DOOR_W - 1e-9) {
        const stub = findCorridorStubToKeepOut(placements, circId, [koInf], typeById, 1.2, polygonBBox(poly));
        if (stub) {
            stubFired = true;
            const stubRoom: ProgramRoom = {
                id: 'cs0', type: 'corridor', name: 'Stair Corridor', targetAreaM2: rectArea(stub),
                isPrivate: false, needsWindow: false,
            };
            bubble = {
                ...bubble,
                rooms: [...bubble.rooms, stubRoom],
                edges: [...bubble.edges, { a: 'cs0', b: circId, via: 'open' }, { a: 'stair0', b: 'cs0', via: 'door' }],
            };
            placements = [...placements, { roomId: 'cs0', rect: stub }];
            typeById.set('cs0', 'corridor');
        }
    }

    const wd = buildWallsAndDoors(placements, bubble, {});
    const placedById = new Map(placements.map(p => [p.roomId, p.rect]));
    return { graph, bubble, sub, wd, typeById, placedById, koInf, placements, stubFired };
}

/** The TYPES of the stair's realised door partners (excluding the stair itself). */
function stairDoorPartnerTypes(
    wd: ReturnType<typeof buildWallsAndDoors>, typeById: Map<string, string>,
): string[] {
    return wd.openings
        .filter(o => o.type === 'door')
        .map(o => o.betweenRoomIds as readonly [string, string?])
        .filter(([a, b]) => b && (a === 'stair0' || b === 'stair0'))
        .map(([a, b]) => typeById.get(a === 'stair0' ? b! : a) ?? '?');
}

/** Best corridor↔keep-out shared wall over EVERY corridor cell (the L-leg stub is a corridor too). */
function corridorReachM(placedById: Map<string, Rect>, typeById: Map<string, string>, koInf: Rect): number {
    let best = 0;
    for (const [id, rect] of placedById) {
        if (typeById.get(id) === 'corridor') best = Math.max(best, sharedWallLenM(rect, koInf));
    }
    return best;
}

const HABITABLE_NEVER_OVERLAP = (t: string): boolean => t !== 'stair';

/** A canonical UPPER house storey — bedrooms + bathrooms + a minted landing/corridor, NO public. */
const UPPER: ApartmentProgram = {
    bedrooms: 5, bathrooms: 2, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};
/** A canonical dense GROUND storey — open-plan public + a guest bed + bath + minted corridor. */
const GROUND: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
};

// Dense plates whose stair sits on the edge OPPOSITE the corridor's natural carve face — the
// §65.3 reflection-fails topology, on both an UPPER (no-public) and a dense GROUND storey.
const UPPER_PLATES: ReadonlyArray<readonly [number, number]> = [[16, 12], [18, 12], [15, 13], [17, 12]];
const GROUND_PLATES: ReadonlyArray<readonly [number, number]> = [[15, 12], [16, 12], [18, 11], [17, 12]];

describe('§STAIR-OVERLAP-CLIP (§65.1): NO habitable room rect overlaps the stair keep-out on a dense plate', () => {
    for (const [w, h] of [...UPPER_PLATES, ...GROUND_PLATES]) {
        const prog = UPPER_PLATES.some(([pw, ph]) => pw === w && ph === h) ? UPPER : GROUND;
        it(`${w}×${h} (${prog === UPPER ? 'upper' : 'ground'}) — only the stair occupies the keep-out`, () => {
            const { placements, typeById, koInf } = buildDenseStorey(prog, w, h, highEdgeKeepOut(w, h));
            for (const p of placements) {
                const t = typeById.get(p.roomId) ?? '';
                if (!HABITABLE_NEVER_OVERLAP(t)) continue;
                const ov = overlapAreaM2(p.rect, koInf);
                expect(
                    ov,
                    `${w}×${h}: ${t} ${p.roomId} overlaps the stair keep-out by ${ov.toFixed(2)} m² — §65.1 (a room drawn across the stair)`,
                ).toBeLessThanOrEqual(1e-2);
            }
        });
    }
});

describe('§STAIR-CIRC-STUB (§65.3): the dense-plate stair shares a corridor wall + doors onto circulation', () => {
    for (const [w, h] of UPPER_PLATES) {
        it(`${w}×${h} upper storey — the corridor reaches the stair (≥0.9 m) AND the stair doors onto circulation, not a bedroom`, () => {
            const { wd, typeById, placedById, koInf, stubFired } = buildDenseStorey(UPPER, w, h, highEdgeKeepOut(w, h));
            // The reflection could not reach this opposite-edge keep-out, so the stub fired.
            expect(stubFired, `${w}×${h}: the §STAIR-CIRC-STUB should fire (reflection cannot reach an opposite-edge keep-out)`).toBe(true);
            const reach = corridorReachM(placedById, typeById, koInf);
            expect(reach, `${w}×${h}: corridor shares only ${reach.toFixed(2)} m with the stair — §65.3 sharesStairWall=NO`).toBeGreaterThanOrEqual(DOOR_W);
            const partners = stairDoorPartnerTypes(wd, typeById);
            expect(partners.length, `${w}×${h}: the stair got a door`).toBeGreaterThan(0);
            for (const t of partners) {
                expect(
                    ['corridor', 'hall'].includes(t),
                    `${w}×${h}: the stair's door is onto "${t}" — it must be reached FROM circulation, not through a habitable room (§65.3)`,
                ).toBe(true);
            }
            expect(wd.sealedRoomIds, `${w}×${h}: stair sealed`).not.toContain('stair0');
        });
    }

    for (const [w, h] of GROUND_PLATES) {
        it(`${w}×${h} dense ground — the corridor reaches the stair (≥0.9 m) AND the stair doors onto circulation`, () => {
            const { wd, typeById, placedById, koInf, stubFired } = buildDenseStorey(GROUND, w, h, highEdgeKeepOut(w, h));
            expect(stubFired, `${w}×${h}: the §STAIR-CIRC-STUB should fire`).toBe(true);
            const reach = corridorReachM(placedById, typeById, koInf);
            expect(reach, `${w}×${h}: corridor shares ${reach.toFixed(2)} m with the stair — §65.3`).toBeGreaterThanOrEqual(DOOR_W);
            const partners = stairDoorPartnerTypes(wd, typeById);
            expect(partners.length, `${w}×${h}: the stair got a door`).toBeGreaterThan(0);
            for (const t of partners) {
                expect(['corridor', 'hall'].includes(t), `${w}×${h}: stair door onto "${t}" (must be circulation)`).toBe(true);
            }
            expect(wd.sealedRoomIds, `${w}×${h}: stair sealed`).not.toContain('stair0');
        });
    }
});

describe('§STAIR-CIRC-STUB / §STAIR-OVERLAP-CLIP: determinism + apartment byte-identity', () => {
    it('is deterministic (same dense plate → identical placements + stair door partners)', () => {
        const a = buildDenseStorey(UPPER, 16, 12, highEdgeKeepOut(16, 12));
        const b = buildDenseStorey(UPPER, 16, 12, highEdgeKeepOut(16, 12));
        expect(JSON.stringify(a.placements)).toEqual(JSON.stringify(b.placements));
        expect(JSON.stringify(stairDoorPartnerTypes(a.wd, a.typeById)))
            .toEqual(JSON.stringify(stairDoorPartnerTypes(b.wd, b.typeById)));
    });

    it('the apartment path (NO keep-out) is byte-identical — the clip + stub are no-ops without a keep-out', () => {
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];
        const apt: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: false,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const graph = buildBubbleGraph(apt, 108, poly, {});
        const rects = decomposeToRects(poly);
        const withEmpty = subdivideWithReport(rects, graph, { keepOutRects: [] });
        const without = subdivideWithReport(rects, graph, {});
        expect(JSON.stringify(withEmpty.placements)).toEqual(JSON.stringify(without.placements));
    });
});
