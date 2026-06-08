// §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08 — RE-DONE with the sealing fix).
//
// Founder rule: "a corridor is a RECTANGLE — one dimension 0.9–1.2 m, the OTHER
// ≈2–6 m." Corridors were generated FAT (a near-square squarified blob, or a live
// 17.8 m² band). This suite pins the physiognomy contract AND the invariant that
// the reverted first attempt (5b472cfb) broke: narrowing the corridor must NEVER
// SEAL a room the corridor served (it disconnected the dining room → no door).
//
// The fix: (a) the corridor's STRIP width is enforced by `reshapeCorridorStrip`,
// which narrows the corridor's SHORT axis only and donates the freed band to
// neighbours that already abut it — it never shortens the LONG axis (the reverted
// length-trim is what stranded a room); (b) `subdivideWithReport`'s finalise step
// runs the reshape behind a SEALING-SAFETY GATE — the reshape is accepted only when
// it leaves every previously-wall-connected room still connected, else the
// unreshaped placements ship. Physiognomy is best-effort; §EVERY-ROOM-ACCESS wins.

import { describe, expect, it } from 'vitest';
import {
    subdivide, reshapeCorridorStrip, type RoomPlacement,
} from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { decomposeToRects, type Pt, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { roomRule } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const short = (r: Rect): number => Math.min(r.x1 - r.x0, r.z1 - r.z0);
const long = (r: Rect): number => Math.max(r.x1 - r.x0, r.z1 - r.z0);
const area = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0);

describe('§CORRIDOR-PHYSIOGNOMY — the programRules contract', () => {
    it('the corridor declares a narrow short-side cap and an advisory long band', () => {
        const c = roomRule('corridor');
        expect(c.maxShortSideM).toBeCloseTo(1.2, 6);   // strip width
        expect(c.minShortSideM).toBeCloseTo(1.0, 6);   // Part-M floor
        expect(c.minLongSideM).toBeCloseTo(2.0, 6);
        expect(c.maxLongSideM).toBeCloseTo(6.0, 6);
        // The short cap is BELOW the long floor — the corridor is a strip by rule.
        expect(c.maxShortSideM!).toBeLessThan(c.minLongSideM!);
    });

    it('only the corridor caps its short side — habitable rooms stay uncapped', () => {
        for (const t of ['living', 'kitchen', 'bedroom', 'master', 'dining', 'bathroom'] as const) {
            expect(roomRule(t).maxShortSideM, `${t} must not cap its short side`).toBeUndefined();
        }
    });
});

describe('§CORRIDOR-PHYSIOGNOMY — reshapeCorridorStrip (pure)', () => {
    const maxShort = roomRule('corridor').maxShortSideM!;

    it('narrows a FAT near-square corridor cell into a strip, donating the freed band', () => {
        // A fat 4 m × 4 m corridor with a neighbour spanning its full top edge.
        const before: RoomPlacement[] = [
            { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 4, z1: 4 } },
            { roomId: 'a', rect: { x0: 0, z0: 4, x1: 4, z1: 8 } },
        ];
        const after = reshapeCorridorStrip(before, 'cor');
        const cor = after.find(p => p.roomId === 'cor')!.rect;
        const a = after.find(p => p.roomId === 'a')!.rect;
        // Corridor is now a strip at the cap width.
        expect(short(cor)).toBeCloseTo(maxShort, 6);
        expect(long(cor)).toBeCloseTo(4, 6);
        // The neighbour grew DOWN to swallow the freed band — no gap, no overlap.
        expect(a.z0).toBeCloseTo(maxShort, 6);
        // Total area conserved (corridor strip + grown neighbour == original two cells).
        expect(area(cor) + area(a)).toBeCloseTo(4 * 4 + 4 * 4, 6);
    });

    it('is a NO-OP when the corridor is already a strip (short side ≤ cap)', () => {
        const before: RoomPlacement[] = [
            { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 12, z1: 1.2 } },
            { roomId: 'a', rect: { x0: 0, z0: 1.2, x1: 12, z1: 6 } },
        ];
        const after = reshapeCorridorStrip(before, 'cor');
        expect(after).toEqual(before);
    });

    it('KEEPS the original cell when the freed band has no neighbour to absorb it', () => {
        // A fat corridor whose freed band abuts only the VOID (no neighbour on the
        // top edge). Narrowing would leave a hole, so the reshape declines.
        const before: RoomPlacement[] = [
            { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 4, z1: 4 } },
            { roomId: 'a', rect: { x0: 6, z0: 0, x1: 10, z1: 4 } },   // disjoint, no shared edge
        ];
        const after = reshapeCorridorStrip(before, 'cor');
        expect(after).toEqual(before);
    });

    it('null corridorId / absent corridor ⇒ identity', () => {
        const ps: RoomPlacement[] = [{ roomId: 'a', rect: { x0: 0, z0: 0, x1: 4, z1: 4 } }];
        expect(reshapeCorridorStrip(ps, null)).toEqual(ps);
        expect(reshapeCorridorStrip(ps, 'nope')).toEqual(ps);
    });
});

describe('§CORRIDOR-PHYSIOGNOMY — the SEALING-SAFETY guarantee (the re-done fix)', () => {
    const gen = (program: ApartmentProgram, poly: Pt[], areaM2: number) => {
        const shell = decomposeToRects(poly);
        const g = buildBubbleGraph(program, areaM2);
        const placements = subdivide(shell, g);
        const out = buildWallsAndDoors(placements, g, { shellPolygon: poly });
        const typeOf = new Map(g.rooms.map(r => [r.id, r.type]));
        return { placements, out, typeOf, g };
    };

    // The EXACT 2-bed fixture from doorMinimums.test.ts §EVERY-ROOM-ACCESS — the
    // room the reverted attempt sealed (the dining room) MUST keep its access.
    it('the doorMinimums 2-bed fixture: corridor is a narrow strip AND no room is sealed', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const { placements, out, typeOf, g } = gen(program, poly, 120);

        // (a) the corridor reads as a NARROW STRIP — short side at/under the cap.
        const cor = placements.find(p => typeOf.get(p.roomId) === 'corridor')!;
        expect(short(cor.rect)).toBeLessThanOrEqual(roomRule('corridor').maxShortSideM! + 1e-6);

        // (b) NO sealed room — the §EVERY-ROOM-ACCESS invariant the revert broke.
        expect(out.sealedRoomIds).toEqual([]);

        // (c) every room is reachable (a door OR an open-plan boundary).
        const doored = new Set<string>();
        for (const o of out.openings) if (o.type === 'door') for (const id of o.betweenRoomIds) if (id) doored.add(id);
        const inBoundary = new Set<string>();
        for (const b of out.boundaries) for (const id of b.betweenRoomIds) inBoundary.add(id);
        for (const r of g.rooms) {
            expect(doored.has(r.id) || inBoundary.has(r.id), `room ${r.id} (${typeOf.get(r.id)}) sealed`).toBe(true);
        }
    });

    it('the dining room specifically retains a door or open boundary', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const { out, typeOf, g } = gen(program, poly, 120);
        const dining = g.rooms.find(r => r.type === 'dining')!;
        const hasDoor = out.openings.some(o => o.type === 'door' && o.betweenRoomIds.includes(dining.id));
        const hasBoundary = out.boundaries.some(b => b.betweenRoomIds.includes(dining.id));
        expect(hasDoor || hasBoundary, 'dining must keep access').toBe(true);
        expect(typeOf.get(dining.id)).toBe('dining');
    });

    it('a 3-bed apartment: corridor stays a strip and the placement is deterministic', () => {
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const a = gen(program, poly, 176);
        const b = gen(program, poly, 176);
        expect(JSON.stringify(a.placements)).toEqual(JSON.stringify(b.placements));
        const cor = a.placements.find(p => a.typeOf.get(p.roomId) === 'corridor')!;
        expect(short(cor.rect)).toBeLessThanOrEqual(roomRule('corridor').maxShortSideM! + 1e-6);
    });
});
