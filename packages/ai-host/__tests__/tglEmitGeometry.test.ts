// TGL P9 — geometry emission tests.
// Contract (SPEC §7): every Space/Wall/Door in the graph appears in the
// LayoutOption; mm conversion exact (×1000); door GUID is index-aligned (C15).

import { describe, expect, it } from 'vitest';
import { emitGeometry } from '../src/workflows/apartmentLayout/tgl/emitGeometry.js';
import { enumerateLayouts } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { buildSemanticGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { buildLayoutCommands } from '../src/workflows/apartmentLayout/executePlan.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

function fixtureGraph() {
    const bubble = buildBubbleGraph(PROGRAM, 120);
    const placements = subdivide(decomposeToRects(RECT), bubble);
    const { segments, openings } = buildWallsAndDoors(placements, bubble);
    return buildSemanticGraph(placements, segments, openings, bubble, { levelId: 'L1', seed: 'seed', shellAreaM2: 120 });
}

describe('emitGeometry (TGL P9)', () => {
    it('emits every Space, Wall and Door from the graph', () => {
        const g = fixtureGraph();
        const { option, wallGuids, doorGuids, spaceGuids } = emitGeometry(g);
        expect(option.rooms.length).toBe(g.nodes.filter(n => n.kind === 'Space').length);
        expect(option.walls.length).toBe(g.nodes.filter(n => n.kind === 'Wall').length);
        expect(option.doors.length).toBe(g.nodes.filter(n => n.kind === 'Door').length);
        expect(spaceGuids.length).toBe(option.rooms.length);
        expect(wallGuids.length).toBe(option.walls.length);
        expect(doorGuids.length).toBe(option.doors.length);
    });

    it('names every room + door, carries room centroids, and flags perimeter walls', () => {
        const g = fixtureGraph();
        const { option } = emitGeometry(g);
        // rooms: semantic names + centroids + use-occupancy
        for (const r of option.rooms) {
            expect(r.name.length).toBeGreaterThan(0);
            expect(r.centroid).toBeDefined();
            expect(r.occupancy).toBeTruthy();
            expect(r.occupancy).not.toBe('unclassified');
        }
        expect(option.rooms.some(r => /living/i.test(r.name))).toBe(true);
        expect(option.rooms.some(r => /bedroom|master/i.test(r.name))).toBe(true);
        // occupancy mapped to editor RoomOccupancyType strings
        expect(option.rooms.some(r => r.occupancy === 'living-room')).toBe(true);
        expect(option.rooms.some(r => r.occupancy === 'bedroom')).toBe(true);
        // doors: named by the rooms they connect
        for (const d of option.doors) expect(d.name && d.name.length).toBeGreaterThan(0);
        // walls: both perimeter (isExternal) and interior present
        expect(option.walls.some(w => w.isExternal === true)).toBe(true);
        expect(option.walls.some(w => !w.isExternal)).toBe(true);
    });

    it('converts metres → millimetres exactly (×1000)', () => {
        const g = fixtureGraph();
        const wallNodes = g.nodes.filter(n => n.kind === 'Wall');
        const { option } = emitGeometry(g);
        option.walls.forEach((w, i) => {
            const bl = wallNodes[i]!.geometry!.baseLine!;
            expect(w.start.x).toBeCloseTo(bl[0].x * 1000, 6);
            expect(w.start.y).toBeCloseTo(bl[0].z * 1000, 6);    // plan-y = world-z
            expect(w.end.x).toBeCloseTo(bl[1].x * 1000, 6);
            expect(w.end.y).toBeCloseTo(bl[1].z * 1000, 6);
        });
    });

    it('door GUIDs are index-aligned and each resolves a valid host wall (C15)', () => {
        const g = fixtureGraph();
        const { option, doorGuids } = emitGeometry(g);
        const doorNodeGuids = g.nodes.filter(n => n.kind === 'Door').map(n => n.guid);
        expect(doorGuids).toEqual(doorNodeGuids);
        for (const d of option.doors) {
            expect(d.wallRef).toBeGreaterThanOrEqual(0);
            expect(d.wallRef).toBeLessThan(option.walls.length);
            expect(d.width).toBeGreaterThan(0);
        }
    });

    it('feeds the existing buildLayoutCommands without dropping walls/doors', () => {
        const g = fixtureGraph();
        const { option } = emitGeometry(g);
        let n = 0;
        const mint = (p: string) => `${p}-${n++}`;
        const set = buildLayoutCommands(option, { levelId: 'L1' }, mint);
        expect(set.wallIds.length).toBe(option.walls.length);     // no wall dropped (≥ min length)
        expect(set.doorIds.length).toBe(option.doors.length);     // no door dropped (all fit)
        expect(set.warnings).toEqual([]);
    });

    it('round-trips from the P8 enumerator and is deterministic', () => {
        const out = enumerateLayouts({ shellPolygon: RECT, program: PROGRAM, levelId: 'L1', seed: 'seed', weights: WEIGHTS, count: 1 });
        const a = emitGeometry(out[0]!.graph);
        const b = emitGeometry(out[0]!.graph);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
        expect(a.option.rooms.length).toBeGreaterThan(0);
        expect(a.option.walls.length).toBeGreaterThan(0);
    });
});
