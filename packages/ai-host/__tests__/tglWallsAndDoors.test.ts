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

    it('reconciliation guarantees every room is reachable from the entry (no sealed rooms)', () => {
        const program: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const poly: Pt[] = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }];
        const g = buildBubbleGraph(program, 176);
        const placements = subdivide(decomposeToRects(poly), g);
        const { openings } = buildWallsAndDoors(placements, g);

        // permeability graph: open thresholds + door openings
        const adj = new Map<string, Set<string>>();
        const link = (a: string, b: string) => {
            (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
            (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
        };
        for (const e of g.edges) if (e.via === 'open') link(e.a, e.b);
        for (const o of openings) if (o.betweenRoomIds[1]) link(o.betweenRoomIds[0], o.betweenRoomIds[1]);

        const start = g.entryId ?? g.rooms[0]!.id;
        const seen = new Set([start]); const q = [start];
        while (q.length) { const c = q.shift()!; for (const n of adj.get(c) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
        for (const r of g.rooms) expect(seen.has(r.id)).toBe(true);    // EVERY room reachable
    });
});
