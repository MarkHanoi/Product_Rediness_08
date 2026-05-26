// TGL P4 — walls + doors tests.
// Contract (SPEC §7): each interior wall references ≤2 spaces; each via:'door'
// edge realised by exactly one opening on the shared wall; door fits (offset+width
// ≤ wall length, clearance); no duplicate wall for a shared boundary.

import { describe, expect, it } from 'vitest';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { buildBubbleGraph, type BubbleGraph, type ProgramRoom } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { ApartmentProgram, RoomType } from '../src/workflows/apartmentLayout/types.js';

const room = (id: string, type: RoomType = 'bedroom'): ProgramRoom =>
    ({ id, type, name: id, targetAreaM2: 20, isPrivate: false, needsWindow: false });

const graphOf = (rooms: ProgramRoom[], edges: BubbleGraph['edges']): BubbleGraph =>
    ({ rooms, edges, corridorId: null, entryId: null });

const segKey = (s: { a: Pt; b: Pt }): string => `${s.a.x},${s.a.z}->${s.b.x},${s.b.z}`;

describe('buildWallsAndDoors (TGL P4)', () => {
    // A | B share the vertical wall x=5 over z∈[0,4].
    const A: RoomPlacement = { roomId: 'A', rect: { x0: 0, z0: 0, x1: 5, z1: 4 } };
    const B: RoomPlacement = { roomId: 'B', rect: { x0: 5, z0: 0, x1: 10, z1: 4 } };

    it('deduplicates a shared boundary into ONE interior wall bounding both rooms', () => {
        const g = graphOf([room('A'), room('B')], []);
        const { segments } = buildWallsAndDoors([A, B], g);
        const shared = segments.filter(s => s.boundsRoomIds.length === 2);
        expect(shared).toHaveLength(1);
        expect([...shared[0]!.boundsRoomIds].sort()).toEqual(['A', 'B']);
        // no two segments occupy the same geometry
        const keys = segments.map(segKey);
        expect(new Set(keys).size).toBe(keys.length);
        // every wall references ≤2 spaces
        for (const s of segments) expect(s.boundsRoomIds.length).toBeLessThanOrEqual(2);
    });

    it('realises a via:door edge as exactly one fitting opening on the shared wall', () => {
        const g = graphOf([room('A'), room('B')], [{ a: 'A', b: 'B', via: 'door' }]);
        const { segments, openings } = buildWallsAndDoors([A, B], g);
        expect(openings).toHaveLength(1);
        const o = openings[0]!;
        const wall = segments.find(s => s.id === o.wallId)!;
        expect([...wall.boundsRoomIds].sort()).toEqual(['A', 'B']);
        const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
        expect(o.offsetM).toBeGreaterThanOrEqual(0);
        expect(o.offsetM + o.widthM).toBeLessThanOrEqual(len + 1e-6);
        expect(o.widthM).toBeGreaterThanOrEqual(0.6);
        expect([...o.betweenRoomIds].sort()).toEqual(['A', 'B']);
    });

    it('omits the shared wall for a via:open (open-plan) edge — no wall, no door', () => {
        const g = graphOf([room('A'), room('B')], [{ a: 'A', b: 'B', via: 'open' }]);
        const { segments, openings } = buildWallsAndDoors([A, B], g);
        expect(segments.some(s => s.boundsRoomIds.length === 2)).toBe(false);
        expect(openings).toHaveLength(0);
    });

    it('skips a door edge whose rooms are not actually adjacent (best-effort)', () => {
        const far: RoomPlacement = { roomId: 'B', rect: { x0: 6, z0: 0, x1: 10, z1: 4 } }; // gap 5..6
        const g = graphOf([room('A'), room('B')], [{ a: 'A', b: 'B', via: 'door' }]);
        const { openings } = buildWallsAndDoors([A, far], g);
        expect(openings).toHaveLength(0);
    });

    it('full pipeline (decompose → bubble → subdivide → walls): dedup + ≤2 spaces + determinism', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const shell = decomposeToRects(poly);
        const g = buildBubbleGraph(program, 120);
        const placements = subdivide(shell, g);
        const out1 = buildWallsAndDoors(placements, g);

        for (const s of out1.segments) expect(s.boundsRoomIds.length).toBeLessThanOrEqual(2);
        const keys = out1.segments.map(segKey);
        expect(new Set(keys).size).toBe(keys.length);                 // no duplicate walls
        expect(out1.openings.every(o => o.wallId)).toBe(true);        // every door hosts on a wall
        // deterministic
        const out2 = buildWallsAndDoors(placements, g);
        expect(JSON.stringify(out1)).toEqual(JSON.stringify(out2));
    });

    it('reconciliation NEVER doors a forbidden pair when a legal route exists (no bedroom-through-bedroom)', () => {
        // Two bedrooms + a corridor in a row: corridor | bed1 | bed2 horizontally.
        // bed2 is adjacent only to bed1 + corridor-via-bed1? No — lay them so bed2
        // touches the corridor too is impossible in a row, so the ONLY way to reach
        // bed2 is via bed1 (forbidden) OR via the corridor if adjacent. We arrange a
        // 2×2 so both bedrooms touch the corridor → the legal route must win.
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 10, z1: 1.2 } };
        const bed1: RoomPlacement = { roomId: 'b1', rect: { x0: 0, z0: 1.2, x1: 5, z1: 5 } };
        const bed2: RoomPlacement = { roomId: 'b2', rect: { x0: 5, z0: 1.2, x1: 10, z1: 5 } };
        const rooms: ProgramRoom[] = [
            { id: 'cor', type: 'corridor', name: 'cor', targetAreaM2: 12, isPrivate: false, needsWindow: false },
            { id: 'b1', type: 'bedroom', name: 'b1', targetAreaM2: 19, isPrivate: true, needsWindow: true },
            { id: 'b2', type: 'bedroom', name: 'b2', targetAreaM2: 19, isPrivate: true, needsWindow: true },
        ];
        const g: BubbleGraph = { rooms, edges: [], corridorId: 'cor', entryId: 'cor' };
        const { openings, compromises } = buildWallsAndDoors([corridor, bed1, bed2], g);
        // No bedroom↔bedroom door — both bedrooms door onto the corridor instead.
        const bedToBed = openings.some(o => {
            const s = new Set(o.betweenRoomIds);
            return s.has('b1') && s.has('b2');
        });
        expect(bedToBed).toBe(false);
        expect(compromises).toBe(0);
        // both bedrooms are reachable (each has a corridor door)
        for (const id of ['b1', 'b2']) {
            expect(openings.some(o => o.betweenRoomIds.includes(id) && o.betweenRoomIds.includes('cor'))).toBe(true);
        }
    });

    it('respects the bathroom privacy cap — a bathroom never gets two doors', () => {
        // corridor | bathroom | bedroom in a row: the bathroom is adjacent to BOTH,
        // but maxDoors(bathroom)=1, so reconciliation gives it ONE door (to the
        // corridor) and routes the bedroom to the corridor — not through the bath.
        const corridor: RoomPlacement = { roomId: 'cor', rect: { x0: 0, z0: 0, x1: 12, z1: 1.2 } };
        const bath: RoomPlacement = { roomId: 'ba', rect: { x0: 0, z0: 1.2, x1: 4, z1: 5 } };
        const bed: RoomPlacement = { roomId: 'bd', rect: { x0: 4, z0: 1.2, x1: 12, z1: 5 } };
        const rooms: ProgramRoom[] = [
            { id: 'cor', type: 'corridor', name: 'cor', targetAreaM2: 14, isPrivate: false, needsWindow: false },
            { id: 'ba', type: 'bathroom', name: 'ba', targetAreaM2: 15, isPrivate: true, needsWindow: false },
            { id: 'bd', type: 'bedroom', name: 'bd', targetAreaM2: 31, isPrivate: true, needsWindow: true },
        ];
        const g: BubbleGraph = { rooms, edges: [], corridorId: 'cor', entryId: 'cor' };
        const { openings } = buildWallsAndDoors([corridor, bath, bed], g);
        const bathDoors = openings.filter(o => o.betweenRoomIds.includes('ba'));
        expect(bathDoors.length).toBeLessThanOrEqual(1);
    });

    it('reconciliation NEVER places a forbidden door pair (hard rule — even if a room ends up sealed)', async () => {
        // The user's explicit constraint: a bedroom must not be reachable only
        // through another bedroom; a bathroom not directly off the entrance hall; etc.
        // Phase 2b is now permitted-only — if the squarified placement can't be
        // connected through legal doors, the room stays sealed and the legality gate
        // in P8 picks a different strategy. Here we assert the invariant directly.
        const { doorAllowedBetween } = await import('../src/workflows/apartmentLayout/rules/programRules.js');
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const g = buildBubbleGraph(program, 176);
        const placements = subdivide(decomposeToRects(poly), g);
        const { openings } = buildWallsAndDoors(placements, g);
        const typeOf = new Map(g.rooms.map(r => [r.id, r.type]));

        for (const o of openings) {
            const [a, b] = o.betweenRoomIds;
            if (!b) continue;
            const ta = typeOf.get(a)!, tb = typeOf.get(b)!;
            expect(doorAllowedBetween(ta, tb), `forbidden door pair ${ta}↔${tb} was placed`).toBe(true);
        }
    });
});
