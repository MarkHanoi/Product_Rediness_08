// §STAIR-SPANNING-CORRIDOR regression (tracker §52 / §52.6 / §55, 2026-06-11).
//
// THE LAST SEALED-ROOM CASE — a STAIR-FRAGMENTED multi-storey GROUND plate. The §55
// single-loaded fix closed the UPPER-storey single-rect seal but left this: on a multi-
// storey GROUND plate the stair keep-out is SUBTRACTED from the buildable area, guillotining
// the plate into ~3-4 sub-rects (a full-width bottom band + a full-width top band + two side
// bands, e.g. areas [39.5, 31.5, 10.9, 9.1] m²). NO single fragment fits the full ground
// programme, so the `§STAIR-CARVE-NO-DROP` decision picked the GENERIC `packMultiRect` (which
// packs each fragment INDEPENDENTLY with NO corridor spine crossing fragment boundaries) over
// the dominant-rect corridor carve (which WOULD drop a room). Result: a private/service room
// (the guest bathroom — `bathroom.accessFrom = ['corridor']` ONLY, so no permitted chain can
// rescue it) lands in a non-corridor fragment, shares no wall with the corridor → SEALED +
// `§TOPO-HARD-REJECT [circulation]`. ANGLE-INDEPENDENT (reproduces axis-aligned).
//
// THE FIX (subdivide.ts §STAIR-SPANNING-CORRIDOR + §SPAN-SPINE-CARVE): when every fragment is
// too SHALLOW for the standard 3-zone whole-programme carve, carve a SPINE BAND with the
// corridor running along the band's LONG axis (a strip on the keep-out cut edge): the
// circulation-DEPENDENT cluster (corridor + hall + private/service rooms) is combed off that
// corridor — each shares a corridor wall — and the deep-needing public rooms (living) take a
// full-depth column abutting the corridor end; the remaining public rooms (kitchen/dining)
// fill the other fragments (they chain to the entry — never need the corridor). NO room is
// dropped and EVERY private/service room reaches the corridor across the fragmented plate.
//
// These tests drive the FULL deterministic pipeline (`enumerateLayouts` — the 8-strategy
// enumerate + §TOPO-HARD-REJECT gate) over the HOUSE GROUND storey (the real production path:
// a `validateHouseStorey` envelope validator keeps the ground a 1-guest-bedroom programme,
// NOT the apartment 2-bed growth) with a CENTRAL stair keep-out that fragments the plate.
// They assert: NO room dropped, circulation ROUTED, and NO `circulation` hard-reject — the
// exact §52.6 land-lock, now closed. Axis-aligned grounds, several aspect ratios.

import { describe, expect, it } from 'vitest';
import { enumerateLayouts } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { validateHouseStorey } from '../src/workflows/houseLayout/houseEnvelope.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { decomposeToRects, subtractRectsFromRects, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

/** The HOUSE GROUND storey programme: the §HOUSE-GROUND-PUBLIC-SET — entrance hall + open-plan
 *  living/kitchen/dining + a guest bedroom + a bathroom + (minted) corridor. The single guest
 *  bedroom is exactly what the multi-storey ground carries (the upper storeys hold the rest). */
const GROUND: ApartmentProgram = {
    bedrooms: 1, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
};

const WEIGHTS: ScoringWeights = {} as ScoringWeights;

/** The house envelope validator → `envelopeFitGrowth = false`, so the ground programme is NOT
 *  re-grown to the apartment 2-bedroom envelope (the apartment path never passes a keep-out, so
 *  this combination is exactly + only the multi-storey-house GROUND path). */
const houseValidator = (args: { program: ApartmentProgram; grossAreaM2: number }) =>
    validateHouseStorey({ program: args.program, grossAreaM2: args.grossAreaM2 });

/** A central stair keep-out (size ≈ a real reserved stair core) that fragments an axis-aligned
 *  ground plate into a frame of shallow sub-rects — the §52.6 topology. */
function centralKeepOut(wM: number, hM: number): Rect {
    const cw = 3.0, ch = 2.8;                 // ~ a 3.0 × 2.8 m stair core
    const x0 = Math.round((wM * 0.40) * 100) / 100;
    const z0 = Math.round((hM * 0.38) * 100) / 100;
    return { x0, z0, x1: x0 + cw, z1: z0 + ch };
}

/** Drive `enumerateLayouts` over a fragmented ground plate (the full §TOPO gate) and return the
 *  best candidate's circulation/drop/hard-reject verdict. */
function enumerateGround(wM: number, hM: number, ko: Rect) {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const cands = enumerateLayouts({
        shellPolygon: poly, program: GROUND, levelId: 'L0', seed: 's', weights: WEIGHTS, count: 8,
        keepOutRects: [ko], envelopeValidator: houseValidator,
    });
    // The engine ranks hard-valid above hard-invalid; pick the shipped winner the same way the
    // ranker does (a hard-valid candidate if any exists; else the least-bad).
    const best = cands.find(c => c.hardValid)
        ?? cands.find(c => !c.hardFailedRules.includes('circulation'))
        ?? cands[0];
    return { cands, best };
}

/** Drive `subdivideWithReport` → `buildWallsAndDoors` directly over the fragmented plate (the
 *  literal subdivider unit under test), returning the geometry + the door diagnostics so we can
 *  assert each PRIVATE/SERVICE room geometrically shares a ≥0.9 m corridor wall. */
function subdivideGround(wM: number, hM: number, ko: Rect) {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const area = wM * hM;
    const graph = buildBubbleGraph(GROUND, area, poly, { envelopeFitGrowth: false });
    let rects = decomposeToRects(poly);
    const M = 0.05;                               // KEEPOUT_MARGIN_M (matches enumerate.ts)
    rects = subtractRectsFromRects(rects, [{ x0: ko.x0 - M, z0: ko.z0 - M, x1: ko.x1 + M, z1: ko.z1 + M }]);
    const stairCarved = rects.length > 1;
    const sub = subdivideWithReport(rects, graph, { stairCarved });
    const wd = buildWallsAndDoors(sub.placements, graph, {});
    const typeById = new Map(graph.rooms.map(r => [r.id, r.type]));
    const placedById = new Map(sub.placements.map(p => [p.roomId, p.rect]));
    return { graph, sub, wd, typeById, placedById, rectCount: rects.length };
}

/** The §52.6 land-lock rooms — private/service rooms that NEED a corridor-adjacent wall (the
 *  ones a fragmented plate seals + that trip the circulation hard-reject). */
const NEEDS_CIRCULATION = new Set(['bedroom', 'master', 'bathroom', 'wc', 'study', 'utility', 'storage']);

// The axis-aligned ground plates the §52.6 mechanism reproduces on (the brief's set), each
// fragmented by a central stair keep-out into ≥3 shallow sub-rects.
const PLATES: ReadonlyArray<readonly [number, number]> = [
    [10, 10], [9.8, 10], [11, 9],
];

describe('§STAIR-SPANNING-CORRIDOR: a stair-fragmented multi-storey GROUND plate seals no habitable room (tracker §52.6 / §55)', () => {
    for (const [w, h] of PLATES) {
        const ko = centralKeepOut(w, h);

        it(`${w}×${h} central-stair ground — fragments the plate (≥3 sub-rects), then EVERY private/service room shares a ≥0.9 m corridor wall (no seal)`, () => {
            const { graph, sub, wd, typeById, placedById, rectCount } = subdivideGround(w, h, ko);

            // Pre-condition: the keep-out actually FRAGMENTED the plate (the §52.6 topology) —
            // otherwise this isn't the case under test.
            expect(rectCount, `${w}×${h}: the central stair must fragment the plate into ≥3 sub-rects`).toBeGreaterThanOrEqual(3);

            // (a) NO requested room dropped (the no-drop guarantee — the fix must not trade a
            // seal for a drop, the failure mode of every prior revert).
            expect(sub.droppedRooms.map(d => d.type), `${w}×${h} dropped rooms`).toEqual([]);

            // (b) the engine's own diagnostics: NO sealed/unrouted PRIVATE/SERVICE room (the
            // stair is excluded — a legitimate dead-end core; here the ground carries no stair
            // room, so the sets are stair-free anyway).
            const unroutedHabitable = wd.unroutedToCirculationRoomIds.filter(id => (typeById.get(id) ?? '') !== 'stair');
            expect(unroutedHabitable, `${w}×${h} unrouted: ${unroutedHabitable.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);
            const sealedNeedsCirc = wd.sealedRoomIds.filter(id => NEEDS_CIRCULATION.has(typeById.get(id) ?? ''));
            expect(sealedNeedsCirc, `${w}×${h} sealed private/service: ${sealedNeedsCirc.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);

            // (c) the geometric guarantee the fix delivers: EVERY private/service room SHARES a
            // wall ≥ a door width with the ONE connected corridor — so a door CAN be hosted
            // (the §52.6 "the corridor must reach every private room across the fragments").
            const corridor = graph.rooms.find(r => r.type === 'corridor');
            expect(corridor, `${w}×${h}: a corridor was minted`).toBeDefined();
            const corrRect = placedById.get(corridor!.id);
            expect(corrRect, `${w}×${h}: corridor was placed`).toBeDefined();
            const DOOR_W = 0.9, TOUCH = 1e-3;
            const sharesCorridorWall = (r: Rect): boolean => {
                if (Math.abs(r.x1 - corrRect!.x0) <= TOUCH || Math.abs(r.x0 - corrRect!.x1) <= TOUCH) {
                    if (Math.min(r.z1, corrRect!.z1) - Math.max(r.z0, corrRect!.z0) >= DOOR_W) return true;
                }
                if (Math.abs(r.z1 - corrRect!.z0) <= TOUCH || Math.abs(r.z0 - corrRect!.z1) <= TOUCH) {
                    if (Math.min(r.x1, corrRect!.x1) - Math.max(r.x0, corrRect!.x0) >= DOOR_W) return true;
                }
                return false;
            };
            for (const room of graph.rooms) {
                if (!NEEDS_CIRCULATION.has(room.type)) continue;
                const rect = placedById.get(room.id);
                expect(rect, `${w}×${h}: ${room.type} ${room.id} was placed (not dropped)`).toBeDefined();
                expect(
                    sharesCorridorWall(rect!),
                    `${w}×${h}: ${room.type} ${room.id} shares NO ≥${DOOR_W} m corridor wall — it would ship SEALED`,
                ).toBe(true);
            }
        });

        it(`${w}×${h} central-stair ground — the FULL pipeline routes circulation with NO §TOPO-HARD-REJECT [circulation] and NO drops`, () => {
            const { best } = enumerateGround(w, h, ko);
            expect(best, `${w}×${h}: the engine produced a candidate`).toBeDefined();
            // The shipped winner reaches every habitable room (circulationRouted) …
            expect(best!.circulationRouted, `${w}×${h}: circulation routed (no land-locked room)`).toBe(true);
            // … never trips the founder's §TOPO-HARD-REJECT [circulation] gate …
            expect(best!.hardFailedRules, `${w}×${h}: hard-failed rules`).not.toContain('circulation');
            // … and drops no room.
            expect(best!.droppedRooms ?? [], `${w}×${h}: dropped rooms`).toHaveLength(0);
        });
    }

    // Determinism: same plate → identical sealed/unrouted diagnostics (no RNG, ADR-0061).
    it('is deterministic (same fragmented plate → identical sealed/unrouted sets)', () => {
        const ko = centralKeepOut(10, 10);
        const a = subdivideGround(10, 10, ko);
        const b = subdivideGround(10, 10, ko);
        expect(JSON.stringify(a.wd.sealedRoomIds)).toEqual(JSON.stringify(b.wd.sealedRoomIds));
        expect(JSON.stringify(a.wd.unroutedToCirculationRoomIds)).toEqual(JSON.stringify(b.wd.unroutedToCirculationRoomIds));
        expect(JSON.stringify(a.sub.placements)).toEqual(JSON.stringify(b.sub.placements));
    });
});
