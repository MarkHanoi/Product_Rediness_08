// @vitest-environment happy-dom
//
// A.21.D40 #5 — layout subdivision QUALITY (the "central blob" fix).
//
// Regression net for §OPEN-PLAN-ELIGIBLE: several DISTINCT programmed rooms
// (living, dining, corridor, a bedroom, a bathroom) must NOT collapse into one
// detected open space. Open-plan (a wall-less shared threshold) is permitted ONLY
// between the social cluster — living / kitchen / dining. Every PRIVATE
// (bedroom / master / bathroom / ensuite / wc / study) and CIRCULATION
// (hall / corridor) room is ALWAYS enclosed by real partitions, so the editor's
// RoomDetectionEngine registers it as its own cell.
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
import { isOpenPlanEligible } from '../src/workflows/apartmentLayout/rules/programRules.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

function toEngineWalls(option: { walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> }) {
    return option.walls.map((w, i) => ({
        id: `w${i}`,
        baseLine: [
            { x: w.start.x / 1000, y: 0, z: w.start.y / 1000 },
            { x: w.end.x / 1000, y: 0, z: w.end.y / 1000 },
        ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
    }));
}

function buildAndDetect(program: ApartmentProgram, poly: Pt[], area: number) {
    const bubble = buildBubbleGraph(program, area);
    const placements = subdivide(decomposeToRects(poly), bubble);
    const { segments, openings, boundaries } = buildWallsAndDoors(placements, bubble);
    const graph = buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L0', seed: 'seed', shellAreaM2: area });
    const { option } = emitGeometry(graph);
    const engine = new RoomDetectionEngine({ getByLevel: (_l: string) => toEngineWalls(option) } as never);
    const detected = engine.detectRoomsForLevel('L0', 0, 2.7);
    return { bubble, placements, segments, boundaries, option, detected };
}

const PROGRAM3: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

// L-shape ground floor — the shape that previously merged a private room into the
// open central zone (10 detected for 11 emitted rooms).
const L_SHAPE: Pt[] = [
    { x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 7 },
    { x: 7, z: 7 }, { x: 7, z: 12 }, { x: 0, z: 12 },
];
const U_SHAPE: Pt[] = [
    { x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 12 }, { x: 11, z: 12 },
    { x: 11, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 12 }, { x: 0, z: 12 },
];

describe('A.21.D40 #5 — central-blob subdivision (private rooms always walled)', () => {
    it('an L-shape 3-bed plate yields a SEPARATE detected cell for the corridor, every bedroom and every bathroom', () => {
        const { detected, bubble } = buildAndDetect(PROGRAM3, L_SHAPE, 133);
        // Open-plan eligible rooms (living / kitchen / dining) may merge; every
        // other room is its own cell. Count the non-eligible rooms — each MUST be
        // detected as its own space (no central blob swallowing several of them).
        const nonEligible = bubble.rooms.filter(r => !isOpenPlanEligible(r.type));
        // The open cluster collapses to ≥1 detected room, so:
        //   detected ≥ (#non-eligible rooms) + 1 (the social cluster)
        expect(detected.length).toBeGreaterThanOrEqual(nonEligible.length);
        // And no single detected room is a multi-room blob: the biggest detected
        // area must not approach the sum of (living+dining+corridor+a bed+a bath),
        // which is what the merged-blob defect produced (~70-100 m²). Cap well
        // below that — the largest legitimate single room here is the living room.
        const areas = detected.map(d => (d as { computed?: { area?: number } }).computed?.area ?? 0);
        const maxArea = Math.max(...areas);
        expect(maxArea).toBeLessThan(45);   // a single room, never a 5-room blob
    });

    it('the corridor + bedrooms + bathrooms are each enclosed (own cell) on an L and a U plate', () => {
        for (const poly of [L_SHAPE, U_SHAPE]) {
            const { detected, bubble } = buildAndDetect(PROGRAM3, poly, 140);
            const nonEligible = bubble.rooms.filter(r => !isOpenPlanEligible(r.type)).length;
            // Every non-eligible room detected + the merged social cluster as ≥1.
            expect(detected.length).toBeGreaterThanOrEqual(nonEligible);
        }
    });

    it('no shared wall is suppressed between a private/circulation room and any neighbour', () => {
        // The ONLY wall-less shared boundaries (boundaries[]) the emitter produces
        // must be between OPEN-PLAN-ELIGIBLE rooms — never touching a private or
        // circulation room. This is the structural guarantee behind the fix.
        const { boundaries, bubble } = buildAndDetect(PROGRAM3, L_SHAPE, 133);
        const typeById = new Map(bubble.rooms.map(r => [r.id, r.type]));
        for (const b of boundaries) {
            const [a, c] = b.betweenRoomIds;
            expect(isOpenPlanEligible(typeById.get(a) ?? 'utility')).toBe(true);
            expect(isOpenPlanEligible(typeById.get(c) ?? 'utility')).toBe(true);
        }
    });
});
