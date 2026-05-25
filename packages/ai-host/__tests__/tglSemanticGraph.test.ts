// TGL P5 — semantic graph tests.
// Contract (SPEC §7): connected via CONNECTS_THROUGH+ADJACENT_TO from entry;
// every Space has ≥1 BOUNDS wall; every Door has FILLS→Opening→HOSTED_BY→Wall
// (C15 chain intact); GUIDs unique + deterministic across two runs.

import { describe, expect, it } from 'vitest';
import { buildSemanticGraph, nodesOfKind, edgesOfKind, type LayoutGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';
import { buildWallsAndDoors } from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { subdivide } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { decomposeToRects, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

function buildFixture(): { g: LayoutGraph; entrySourceId: string } {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
    const shell = decomposeToRects(poly);
    const bubble = buildBubbleGraph(PROGRAM, 120);
    const placements = subdivide(shell, bubble);
    const { segments, openings } = buildWallsAndDoors(placements, bubble);
    const g = buildSemanticGraph(placements, segments, openings, bubble, {
        levelId: 'level-1', seed: 'fixture-seed', shellAreaM2: 120,
    });
    return { g, entrySourceId: bubble.entryId! };
}

/** BFS over the permeability + spatial-adjacency graph (ADJACENT_TO + CONNECTS_THROUGH). */
function reachableSpaces(g: LayoutGraph, startGuid: string): Set<string> {
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
        (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
        (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
    };
    for (const e of g.edges) if (e.kind === 'ADJACENT_TO' || e.kind === 'CONNECTS_THROUGH') link(e.from, e.to);
    const seen = new Set<string>([startGuid]);
    const queue = [startGuid];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    return seen;
}

describe('buildSemanticGraph (TGL P5)', () => {
    it('every Space has ≥1 BOUNDS wall', () => {
        const { g } = buildFixture();
        const bounded = new Set(edgesOfKind(g, 'BOUNDS').map(e => e.to));
        for (const s of nodesOfKind(g, 'Space')) expect(bounded.has(s.guid)).toBe(true);
    });

    it('is connected from the entry via ADJACENT_TO + CONNECTS_THROUGH', () => {
        const { g, entrySourceId } = buildFixture();
        const entry = nodesOfKind(g, 'Space').find(s => s.sourceId === entrySourceId)!;
        const reached = reachableSpaces(g, entry.guid);
        const spaceGuids = nodesOfKind(g, 'Space').map(s => s.guid);
        for (const sg of spaceGuids) expect(reached.has(sg)).toBe(true);
    });

    it('keeps the C15 cascade intact: Door → FILLS → Opening → HOSTED_BY → Wall', () => {
        const { g } = buildFixture();
        const fills = edgesOfKind(g, 'FILLS');
        const hosted = new Map(edgesOfKind(g, 'HOSTED_BY').map(e => [e.from, e.to]));
        const openingGuids = new Set(nodesOfKind(g, 'Opening').map(n => n.guid));
        const wallGuids = new Set(nodesOfKind(g, 'Wall').map(n => n.guid));
        for (const door of nodesOfKind(g, 'Door')) {
            const fill = fills.find(e => e.from === door.guid);
            expect(fill).toBeDefined();                          // Door → FILLS → Opening
            expect(openingGuids.has(fill!.to)).toBe(true);
            const wall = hosted.get(fill!.to);
            expect(wall).toBeDefined();                          // Opening → HOSTED_BY → Wall
            expect(wallGuids.has(wall!)).toBe(true);
        }
    });

    it('GUIDs are unique', () => {
        const { g } = buildFixture();
        const guids = g.nodes.map(n => n.guid);
        expect(new Set(guids).size).toBe(guids.length);
    });

    it('is deterministic — two runs produce an identical graph', () => {
        const a = buildFixture().g;
        const b = buildFixture().g;
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('Level CONTAINS every Space', () => {
        const { g } = buildFixture();
        const level = nodesOfKind(g, 'Level')[0]!;
        const contained = new Set(edgesOfKind(g, 'CONTAINS').filter(e => e.from === level.guid).map(e => e.to));
        for (const s of nodesOfKind(g, 'Space')) expect(contained.has(s.guid)).toBe(true);
    });
});
