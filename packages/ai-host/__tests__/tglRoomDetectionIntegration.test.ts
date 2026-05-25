// @vitest-environment happy-dom
//
// TGL — END-TO-END room-detection integration.
//
// Feeds D-TGL's emitted geometry (shell perimeter + interior partitions) to the
// REAL editor room engine (`@pryzm/room-topology` RoomDetectionEngine) and asserts
// it detects the expected rooms. This is the definitive proof that the offline
// generator produces a detectable layout — not just geometrically watertight, but
// reconstructable by the same engine the editor runs after the build batch.
//
// happy-dom is required because RoomDetectionEngine transitively imports
// core-app-model (UiPreferences), which touches `window` at module load.

import { describe, expect, it } from 'vitest';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { emitGeometry } from '../src/workflows/apartmentLayout/tgl/emitGeometry.js';
import { buildSemanticGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

/** Minimal WallStore shape the engine reads: getByLevel → walls with baseLine. */
function mockWallStore(walls: Array<{ id: string; baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] }>) {
    return { getByLevel: (_lvl: string) => walls } as unknown as ConstructorParameters<typeof RoomDetectionEngine>[0];
}

/** Build the full post-build wall set (shell perimeter = exterior + interior) for a program. */
function builtWalls(program: ApartmentProgram, poly: Pt[]) {
    const bubble = buildBubbleGraph(program, 120);
    const placements = subdivide(decomposeToRects(poly), bubble);
    const { segments, openings } = buildWallsAndDoors(placements, bubble);
    const graph = buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L0', seed: 'seed', shellAreaM2: 120 });
    // FULL emit = exterior (the shell) + interior partitions — exactly the editor's
    // wall set after building D-TGL (interior) onto the existing shell (exterior).
    const { option } = emitGeometry(graph);
    return { option, expectedSpaces: graph.nodes.filter(n => n.kind === 'Space').length };
}

describe('D-TGL → RoomDetectionEngine (end-to-end)', () => {
    it('the real room engine detects MULTIPLE rooms from D-TGL geometry', () => {
        const { option } = builtWalls(PROGRAM, RECT);
        const walls = option.walls.map((w, i) => ({
            id: `w${i}`,
            baseLine: [
                { x: w.start.x / 1000, y: 0, z: w.start.y / 1000 },
                { x: w.end.x / 1000, y: 0, z: w.end.y / 1000 },
            ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
        }));

        const engine = new RoomDetectionEngine(mockWallStore(walls));
        const rooms = engine.detectRoomsForLevel('L0', 0, 2.7);

        // A 2-bed/1-bath open-plan layout → 1 public (open-plan) zone + master +
        // bedroom + ensuite + bathroom. The engine must find clearly MORE than one.
        expect(rooms.length).toBeGreaterThan(1);
        expect(rooms.length).toBeGreaterThanOrEqual(4);
        for (const r of rooms) expect(r.id).toBeTruthy();
    });

    it('a closed single-bedroom program yields several distinct rooms', () => {
        const program: ApartmentProgram = { bedrooms: 1, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: false, livingRoom: true, entranceHall: true };
        const { option } = builtWalls(program, RECT);
        const walls = toEngineWalls(option);
        const engine = new RoomDetectionEngine(mockWallStore(walls));
        const rooms = engine.detectRoomsForLevel('L0', 0, 2.7);
        expect(rooms.length).toBeGreaterThanOrEqual(3);
    });

    it('detects multiple rooms across shapes + programs (no disconnected partitions)', () => {
        const L: Pt[] = [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 7 }, { x: 7, z: 7 }, { x: 7, z: 12 }, { x: 0, z: 12 }];
        const cases: Array<{ program: ApartmentProgram; poly: Pt[]; min: number }> = [
            { program: PROGRAM, poly: L, min: 4 },                                   // 2-bed on an L-shape
            { program: { bedrooms: 3, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
              poly: [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 11 }, { x: 0, z: 11 }], min: 6 }, // 3-bed rectangle
        ];
        for (const c of cases) {
            const { option } = builtWalls(c.program, c.poly);
            const engine = new RoomDetectionEngine(mockWallStore(toEngineWalls(option)));
            const rooms = engine.detectRoomsForLevel('L0', 0, 2.7);
            expect(rooms.length).toBeGreaterThanOrEqual(c.min);
        }
    });
});

function toEngineWalls(option: { walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> }) {
    return option.walls.map((w, i) => ({
        id: `w${i}`,
        baseLine: [
            { x: w.start.x / 1000, y: 0, z: w.start.y / 1000 },
            { x: w.end.x / 1000, y: 0, z: w.end.y / 1000 },
        ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
    }));
}
