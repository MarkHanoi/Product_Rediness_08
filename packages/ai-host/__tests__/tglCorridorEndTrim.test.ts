// §CORRIDOR-END-TRIM (A.21.D57, 2026-06-08).
//
// Founder rule: "a corridor only needs to span from the entrance to the LAST
// room-door it serves." The §SINGLE-RECT carve builds the corridor strip running
// the FULL length of the shell's long axis (perimeter to perimeter); when the
// corridor-dependent rooms (private/service + the hall/entry) do not reach the far
// end, the corridor OVERSHOOTS into a dead stub against the perimeter wall. This
// suite pins:
//   (1) the trim ends the corridor near the last served (dependent) room and donates
//       the freed perimeter end-band to the adjacent habitable room (→ exterior
//       frontage → windows);
//   (2) the SEALING-SAFETY doctrine that the reverted first attempt (5b472cfb) broke
//       — a trim that would strand any wall-connected room is DISCARDED, so a
//       corridor that genuinely must span the full shell is left UNCHANGED and
//       §EVERY-ROOM-ACCESS holds.
//
// The trim runs inside `subdivideWithReport`'s finalise step behind the SAME
// `roomsWithAnySharedWall` gate used by the D46-redo reshape; here we test the pure
// `trimCorridorToLastDoor` directly (deterministic geometry) plus the full pipeline.

import { describe, expect, it } from 'vitest';
import {
    subdivide, trimCorridorToLastDoor, type RoomPlacement,
} from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { decomposeToRects, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const area = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0);
const byId = (ps: readonly RoomPlacement[], id: string): Rect => ps.find(p => p.roomId === id)!.rect;

describe('§CORRIDOR-END-TRIM — trimCorridorToLastDoor (pure geometry)', () => {
    // A horizontal corridor spine z∈[4,5.2], running x∈[0,10] (perimeter to
    // perimeter). The DEPENDENT (private) rooms — bedA, bedB — only reach x=6.
    // Above the corridor: a public LIVING room spanning the full x∈[0,10]. Below it,
    // past x=6, an empty perimeter stub the corridor wastes.
    //
    //   living : x∈[0,10], z∈[0,4]            (public, NOT corridor-dependent)
    //   cor    : x∈[0,10], z∈[4,5.2]          (the full-span strip)
    //   bedA   : x∈[0,3],  z∈[5.2,10]         (dependent, abuts cor over x∈[0,3])
    //   bedB   : x∈[3,6],  z∈[5.2,10]         (dependent, abuts cor over x∈[3,6])
    //   endRm  : x∈[6,10], z∈[5.2,10]         (public, own façade z=10; abuts cor x∈[6,10])
    const base = (): RoomPlacement[] => [
        { roomId: 'living', rect: { x0: 0, z0: 0,   x1: 10, z1: 4 } },
        { roomId: 'cor',    rect: { x0: 0, z0: 4,   x1: 10, z1: 5.2 } },
        { roomId: 'bedA',   rect: { x0: 0, z0: 5.2, x1: 3,  z1: 10 } },
        { roomId: 'bedB',   rect: { x0: 3, z0: 5.2, x1: 6,  z1: 10 } },
        { roomId: 'endRm',  rect: { x0: 6, z0: 5.2, x1: 10, z1: 10 } },
    ];
    // Only the bedrooms depend on the corridor; living + endRm have their own façade.
    const dep = new Set(['bedA', 'bedB']);

    it('ends the corridor near the LAST dependent room when rooms do not reach the far end', () => {
        const after = trimCorridorToLastDoor(base(), 'cor', dep);
        const cor = byId(after, 'cor');
        // The last dependent room (bedB) ends at x=6; the corridor is trimmed to that
        // extent + a small end clearance — it no longer runs to x=10.
        expect(cor.x1).toBeGreaterThan(6 - 1e-6);
        expect(cor.x1).toBeLessThan(7);                 // far short of the original x=10
        expect(cor.x0).toBeCloseTo(0, 6);               // entrance end untouched
        expect(cor.z0).toBeCloseTo(4, 6);               // strip width unchanged
        expect(cor.z1).toBeCloseTo(5.2, 6);
    });

    it('donates the freed perimeter end-band to the adjacent habitable room (frontage gain)', () => {
        const before = base();
        const after = trimCorridorToLastDoor(before, 'cor', dep);
        const corBefore = byId(before, 'cor');
        const corAfter = byId(after, 'cor');
        const freed = area(corBefore) - area(corAfter);
        expect(freed).toBeGreaterThan(0);
        // The freed band was absorbed by exactly one neighbour; total area conserved.
        const totalBefore = before.reduce((s, p) => s + area(p.rect), 0);
        const totalAfter = after.reduce((s, p) => s + area(p.rect), 0);
        expect(totalAfter).toBeCloseTo(totalBefore, 6);
        // The donee grew into the corridor's vacated short-face span (reaches the
        // corridor's far short edge — the exterior frontage in the carve frame).
        const grown = after.filter((p, i) => area(p.rect) > area(before[i]!.rect) + 1e-6);
        expect(grown.length).toBe(1);
        const donee = grown[0]!;
        // The donee now spans across where the corridor was (z reaches 4 or 5.2).
        expect(donee.rect.z0 === 5.2 || donee.rect.z1 === 4 || donee.rect.z0 === 4 || donee.rect.z1 === 5.2)
            .toBe(true);
    });

    it('no overlaps after the trim+donation (valid tiling preserved)', () => {
        const after = trimCorridorToLastDoor(base(), 'cor', dep);
        for (let i = 0; i < after.length; i++) {
            for (let j = i + 1; j < after.length; j++) {
                const a = after[i]!.rect, b = after[j]!.rect;
                const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
                const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
                expect(ox <= 1e-6 || oz <= 1e-6,
                    `${after[i]!.roomId} overlaps ${after[j]!.roomId}`).toBe(true);
            }
        }
    });

    it('BASELINE: when a dependent room reaches the far end, the corridor is UNCHANGED', () => {
        // Make bedB span to the perimeter (x=10): the corridor genuinely must run
        // full-length. No trim.
        const ps: RoomPlacement[] = [
            { roomId: 'living', rect: { x0: 0, z0: 0,   x1: 10, z1: 4 } },
            { roomId: 'cor',    rect: { x0: 0, z0: 4,   x1: 10, z1: 5.2 } },
            { roomId: 'bedA',   rect: { x0: 0, z0: 5.2, x1: 5,  z1: 10 } },
            { roomId: 'bedB',   rect: { x0: 5, z0: 5.2, x1: 10, z1: 10 } },
        ];
        const after = trimCorridorToLastDoor(ps, 'cor', new Set(['bedA', 'bedB']));
        expect(after).toEqual(ps);
    });

    it('declines (identity) when the freed band has no neighbour to absorb it (no gap)', () => {
        // bedB reaches x=6; living also stops at x=6; past x=6 the corridor abuts the
        // VOID on both faces. Trimming would leave the freed band donated to nobody.
        const ps: RoomPlacement[] = [
            { roomId: 'living', rect: { x0: 0, z0: 0,   x1: 6,  z1: 4 } },
            { roomId: 'cor',    rect: { x0: 0, z0: 4,   x1: 10, z1: 5.2 } },
            { roomId: 'bedA',   rect: { x0: 0, z0: 5.2, x1: 3,  z1: 10 } },
            { roomId: 'bedB',   rect: { x0: 3, z0: 5.2, x1: 6,  z1: 10 } },
        ];
        const after = trimCorridorToLastDoor(ps, 'cor', new Set(['bedA', 'bedB']));
        // The freed band x∈[6.3,10] has no abutter that tiles it → no donation → no
        // trim (never leave a hole). Identity.
        expect(after).toEqual(ps);
    });

    it('respects the corridor minLongSideM floor (never trims below a real spine)', () => {
        // A short corridor whose dependent room sits near its start: trimming to the
        // served extent would leave a sub-floor stub. The trim declines.
        const minLong = roomRule('corridor').minLongSideM!;     // 2.0 m
        const ps: RoomPlacement[] = [
            { roomId: 'living', rect: { x0: 0, z0: 0,   x1: 8, z1: 4 } },
            { roomId: 'cor',    rect: { x0: 0, z0: 4,   x1: 8, z1: 5.2 } },
            // dependent room covers only x∈[0,1] → needHi=1 → trimmedHi≈1.3 < minLong.
            { roomId: 'bed',    rect: { x0: 0, z0: 5.2, x1: 1, z1: 10 } },
            { roomId: 'endRm',  rect: { x0: 1, z0: 5.2, x1: 8, z1: 10 } },
        ];
        const after = trimCorridorToLastDoor(ps, 'cor', new Set(['bed']));
        const cor = byId(after, 'cor');
        expect(cor.x1 - cor.x0).toBeGreaterThanOrEqual(minLong - 1e-6);
    });

    it('null / absent corridor ⇒ identity', () => {
        const ps: RoomPlacement[] = [{ roomId: 'a', rect: { x0: 0, z0: 0, x1: 4, z1: 4 } }];
        expect(trimCorridorToLastDoor(ps, null)).toEqual(ps);
        expect(trimCorridorToLastDoor(ps, 'nope')).toEqual(ps);
    });

    it('no dependent set ⇒ conservative identity (every abutter pins the span)', () => {
        // Without a dependent set, EVERY abutter is treated as corridor-dependent, so
        // the union equals the full abutter span and nothing is freed.
        const after = trimCorridorToLastDoor(base(), 'cor');
        expect(after).toEqual(base());
    });
});

describe('§CORRIDOR-END-TRIM — full pipeline (sealing-safety + determinism)', () => {
    const gen = (program: ApartmentProgram, poly: Pt[], areaM2: number) => {
        const shell = decomposeToRects(poly);
        const g = buildBubbleGraph(program, areaM2);
        const placements = subdivide(shell, g);
        const out = buildWallsAndDoors(placements, g, { shellPolygon: poly });
        const typeOf = new Map(g.rooms.map(r => [r.id, r.type]));
        return { placements, out, typeOf, g };
    };

    it('the 2-bed fixture: NO sealed room and every room keeps access (the revert guarantee)', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const { out, g, typeOf } = gen(program, poly, 120);
        expect(out.sealedRoomIds).toEqual([]);
        const doored = new Set<string>();
        for (const o of out.openings) if (o.type === 'door') for (const id of o.betweenRoomIds) if (id) doored.add(id);
        const inBoundary = new Set<string>();
        for (const b of out.boundaries) for (const id of b.betweenRoomIds) inBoundary.add(id);
        for (const r of g.rooms) {
            expect(doored.has(r.id) || inBoundary.has(r.id), `room ${r.id} (${typeOf.get(r.id)}) sealed`).toBe(true);
        }
    });

    it('a 3-bed apartment: deterministic placement (identical input → identical output)', () => {
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const a = gen(program, poly, 176);
        const b = gen(program, poly, 176);
        expect(JSON.stringify(a.placements)).toEqual(JSON.stringify(b.placements));
    });
});
