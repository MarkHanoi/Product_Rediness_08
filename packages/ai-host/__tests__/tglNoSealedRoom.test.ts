// §NO-SEAL-SINGLE-LOAD regression (tracker §55, 2026-06-11).
//
// THE DEFECT: a generated house shipped a SEALED room (a bedroom with NO door) +
// `§TOPO-HARD-REJECT [circulation]`. On a single rectangular plate this is the
// SUBDIVIDER's fault: the §NO-PUBLIC double-loaded corridor carve (and the 3-zone
// §EVERY-ROOM-ACCESS comb) bail to a squarified treemap when the comb is infeasible,
// and squarify buries back-row rooms behind front-row rooms with NO wall shared with
// the corridor → `buildWallsAndDoors` can host no door → the room ships SEALED /
// unrouted. bedroom↔bedroom is forbidden, so the door-placement multihop reroute
// (which is already exhaustive over every PERMITTED shared wall) cannot rescue a
// truly land-locked room — door placement cannot manufacture a wall.
//
// THE FIX (subdivide.ts §NO-SEAL-SINGLE-LOAD): when the double-loaded carve / comb is
// infeasible, fall back to a SINGLE-LOADED corridor — a strip on ONE face with EVERY
// private room combed off it as one row, so every private room shares a wall with the
// corridor and is never sealed. The single private zone keeps the FULL plate depth
// (minus the strip), so the comb fits a much wider range of plates than the halved
// double-loaded split.
//
// These tests assert the SUBDIVIDER + door pipeline produce ZERO sealed / unrouted
// HABITABLE rooms on a single rectangular plate — both the houseLayoutInvariants
// private program and the §55 ~98 m² 4-room repro. (The stair MAY legitimately be a
// dead-end core, so a `stair` room is excluded; here the single-rect programs carry no
// stair keep-out, so the room sets are stair-free anyway.)
//
// SCOPE NOTE (rigorous honesty): this gates the SINGLE-RECT subdivider seal — the
// literal §55 root in subdivide.ts. A stair keep-out that FRAGMENTS the plate into
// multiple sub-rects (the multi-storey end-to-end path) is a SEPARATE coupling
// (tracker §52 / §52.6: the dominant-rect-carve-drops-vs-generic-packing-seals
// dilemma) that this single-function fix does not close; that remains §52 work.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideWithReport } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

/** Drive the single-rectangle subdivide → walls/doors pipeline for one plate + program
 *  and return the engine's own SEALED + UNROUTED diagnostics + the room types, plus a
 *  geometric corridor-adjacency check per room (a door can only be hosted on a shared
 *  corridor wall ≥ a door width). */
function layoutSingleRect(wM: number, hM: number, program: ApartmentProgram) {
    const area = wM * hM;
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    // envelopeFitGrowth:false — match the HOUSE path (a pre-sized storey programme is
    // not re-inflated to the apartment envelope); deterministic, no RNG.
    const graph = buildBubbleGraph(program, area, poly, { envelopeFitGrowth: false });
    const rect: Rect = { x0: 0, z0: 0, x1: wM, z1: hM };
    const sub = subdivideWithReport([rect], graph);
    const wd = buildWallsAndDoors(sub.placements, graph, {});
    const typeById = new Map(graph.rooms.map(r => [r.id, r.type]));
    const placedById = new Map(sub.placements.map(p => [p.roomId, p.rect]));
    return { graph, sub, wd, typeById, placedById };
}

/** A private/service room NEEDS a circulation door (the engine's needsCirculationAccess
 *  set); these are the rooms a seal/land-lock actually harms. */
const NEEDS_CIRCULATION = new Set(['bedroom', 'master', 'bathroom', 'wc', 'study', 'utility', 'storage']);

/** The houseLayoutInvariants private program, as it lands on an upper storey: bedrooms +
 *  baths + ensuite + a corridor, NO public rooms (the §NO-PUBLIC double-loaded path). */
const UPPER_PRIVATE: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};

/** The §55 ~98 m² 4-room repro: corridor + 2 bedrooms + 1 bathroom, NO public rooms. */
const REPRO_4ROOM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: false,
    includeKitchen: false, livingRoom: false, openPlanKitchenDining: false, entranceHall: false,
};

describe('§NO-SEAL-SINGLE-LOAD: a single rectangular plate seals NO habitable room (tracker §55)', () => {
    // The 13 × 10 m plate from houseLayoutInvariants.test.ts (the founder CI plate).
    it('the 13×10 plate (private upper programme) — every habitable room has a door, none sealed', () => {
        const { wd, typeById } = layoutSingleRect(13, 10, UPPER_PRIVATE);
        const sealedHabitable = wd.sealedRoomIds.filter(id => {
            const t = typeById.get(id) ?? '';
            return t !== 'stair' && t !== 'ensuite';   // ensuite reached via its master (architectural exception)
        });
        const unroutedHabitable = wd.unroutedToCirculationRoomIds.filter(id => (typeById.get(id) ?? '') !== 'stair');
        expect(sealedHabitable, `sealed: ${sealedHabitable.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);
        expect(unroutedHabitable, `unrouted: ${unroutedHabitable.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);
    });

    // The ~98 m² 4-room repro at several aspect ratios (each is the live failing case
    // BEFORE the fix: "§NO-PUBLIC-CARVE comb infeasible (sideA=FAIL sideB=FAIL) — fell
    // back to squarify" with a sealed bedroom/bathroom).
    //
    // The first block (square-ish plates) is served by the double-loaded carve; the
    // SHALLOW block (18×5.5 … 22×4.6) is where the double-loaded carve / comb is
    // INFEASIBLE (the halved sides are too shallow for a 2.6 m bedroom, or the short
    // axis can't host two zones at all) — BEFORE the §NO-SEAL-SINGLE-LOAD fix these
    // squarified and SEALED a bedroom/bathroom. They are the cases that actually GUARD
    // the fix (probe-verified: each prints "§NO-SEAL-SINGLE-LOAD ... rescued").
    for (const [w, h] of [
        [9.8, 10], [10, 9.8], [14, 7], [7, 14], [8, 12.25], [12.25, 8],   // double-loaded path
        [18, 5.5], [16, 6], [14, 5.2], [20, 5], [22, 4.6],                // single-loaded rescue path
    ] as const) {
        it(`~98 m² 4-room repro ${w}×${h} — corridor reaches every private room (no seal)`, () => {
            const { wd, sub, typeById, placedById, graph } = layoutSingleRect(w, h, REPRO_4ROOM);
            const droppedTypes = sub.droppedRooms.map(d => d.type);

            // (a) the engine's own diagnostics: no sealed / unrouted habitable room.
            const sealedHabitable = wd.sealedRoomIds.filter(id => (typeById.get(id) ?? '') !== 'stair');
            const unroutedHabitable = wd.unroutedToCirculationRoomIds.filter(id => (typeById.get(id) ?? '') !== 'stair');
            expect(sealedHabitable, `${w}×${h} sealed: ${sealedHabitable.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);
            expect(unroutedHabitable, `${w}×${h} unrouted: ${unroutedHabitable.map(id => `${id}(${typeById.get(id)})`)}`).toHaveLength(0);

            // (b) the geometric guarantee the fix actually delivers: every private/service
            // room SHARES A WALL (≥ a door width) with the corridor — so a door CAN be
            // hosted (the §55 "the corridor must reach EVERY private room").
            const corridor = graph.rooms.find(r => r.type === 'corridor');
            expect(corridor, 'a corridor was minted').toBeDefined();
            const corrRect = placedById.get(corridor!.id);
            expect(corrRect, 'corridor was placed').toBeDefined();
            const DOOR_W = 0.9, TOUCH = 1e-3;
            const sharesCorridorWall = (r: Rect): boolean => {
                // vertical shared edge (x coincides, z overlaps ≥ a door width)
                if (Math.abs(r.x1 - corrRect!.x0) <= TOUCH || Math.abs(r.x0 - corrRect!.x1) <= TOUCH) {
                    if (Math.min(r.z1, corrRect!.z1) - Math.max(r.z0, corrRect!.z0) >= DOOR_W) return true;
                }
                // horizontal shared edge
                if (Math.abs(r.z1 - corrRect!.z0) <= TOUCH || Math.abs(r.z0 - corrRect!.z1) <= TOUCH) {
                    if (Math.min(r.x1, corrRect!.x1) - Math.max(r.x0, corrRect!.x0) >= DOOR_W) return true;
                }
                return false;
            };
            for (const room of graph.rooms) {
                if (!NEEDS_CIRCULATION.has(room.type)) continue;
                const rect = placedById.get(room.id);
                expect(rect, `${room.type} ${room.id} was placed (not dropped)`).toBeDefined();
                expect(
                    sharesCorridorWall(rect!),
                    `${w}×${h}: ${room.type} ${room.id} shares NO corridor wall — it would ship SEALED`,
                ).toBe(true);
            }

            // (c) no requested room was dropped (the no-drop guarantee — the fix must not
            // trade a seal for a drop).
            expect(droppedTypes, `${w}×${h} dropped rooms`).toEqual([]);
        });
    }

    // Determinism: same plate → identical seal/unrouted diagnostics (no RNG, ADR-0061).
    it('is deterministic (same plate → identical sealed/unrouted sets)', () => {
        const a = layoutSingleRect(9.8, 10, REPRO_4ROOM);
        const b = layoutSingleRect(9.8, 10, REPRO_4ROOM);
        expect(JSON.stringify(a.wd.sealedRoomIds)).toEqual(JSON.stringify(b.wd.sealedRoomIds));
        expect(JSON.stringify(a.wd.unroutedToCirculationRoomIds)).toEqual(JSON.stringify(b.wd.unroutedToCirculationRoomIds));
    });
});

// Ensure roomRule import is exercised (corridor floor sanity) — keeps the import honest
// and documents that the corridor strip is at least a real corridor width.
describe('§NO-SEAL-SINGLE-LOAD sanity', () => {
    it('the corridor strip width is at least the corridor min short side', () => {
        const { placedById, graph } = layoutSingleRect(9.8, 10, REPRO_4ROOM);
        const corridor = graph.rooms.find(r => r.type === 'corridor')!;
        const r = placedById.get(corridor.id)!;
        const shortSide = Math.min(r.x1 - r.x0, r.z1 - r.z0);
        expect(shortSide).toBeGreaterThanOrEqual(roomRule('corridor').minShortSideM - 1e-6);
    });
});
