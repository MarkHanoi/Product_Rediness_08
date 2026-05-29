// T2.4 — `validateWetCluster` tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// §19.2 T2.4).

import { describe, expect, it } from 'vitest';
import {
    validateWetCluster,
    type WetRoomPlacement,
} from '../src/workflows/apartmentLayout/topology/validateWetCluster.js';
import type { BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const bubbleOf = (rooms: readonly { id: string; type: RoomType }[]): BubbleGraph => ({
    rooms: rooms.map(r => ({ id: r.id, type: r.type, name: r.id, targetAreaM2: 10, isPrivate: false, needsWindow: false })),
    edges: [], corridorId: null, entryId: null,
});

const rect = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });
const place = (id: string, r: ReturnType<typeof rect>): WetRoomPlacement => ({ id, rect: r });

describe('validateWetCluster (T2.4)', () => {
    describe('admissible cases pass cleanly', () => {
        it('no wet rooms ⇒ admits cleanly with no findings', () => {
            const bubble = bubbleOf([
                { id: 'L', type: 'living' },
                { id: 'B', type: 'bedroom' },
            ]);
            const v = validateWetCluster(bubble, [
                place('L', rect(0, 0, 5, 5)),
                place('B', rect(5, 0, 10, 5)),
            ]);
            expect(v.admissible).toBe(true);
            expect(v.softFindings.length).toBe(0);
        });

        it('a single wet room ⇒ no cluster to fragment', () => {
            const bubble = bubbleOf([{ id: 'K', type: 'kitchen' }]);
            const v = validateWetCluster(bubble, [place('K', rect(0, 0, 3, 4))]);
            expect(v.softFindings.length).toBe(0);
        });

        it('two wet rooms sharing a vertical wall ⇒ one cluster, no penalty', () => {
            const bubble = bubbleOf([
                { id: 'K', type: 'kitchen' },
                { id: 'BA', type: 'bathroom' },
            ]);
            // Kitchen + bathroom share their middle wall (x = 3).
            const v = validateWetCluster(bubble, [
                place('K',  rect(0, 0, 3, 4)),
                place('BA', rect(3, 0, 5, 4)),
            ]);
            expect(v.softFindings.length).toBe(0);
        });

        it('three wet rooms chained via shared walls ⇒ still one cluster', () => {
            const bubble = bubbleOf([
                { id: 'K', type: 'kitchen' },
                { id: 'BA', type: 'bathroom' },
                { id: 'U', type: 'utility' },
            ]);
            // K | BA | U  (3 stack-stacked rectangles)
            const v = validateWetCluster(bubble, [
                place('K',  rect(0, 0, 3, 4)),
                place('BA', rect(3, 0, 5, 4)),
                place('U',  rect(5, 0, 7, 4)),
            ]);
            expect(v.softFindings.length).toBe(0);
        });
    });

    describe('SOFT penalties when wet rooms are fragmented', () => {
        it('two non-adjacent wet rooms ⇒ 1 wetFragmentation finding', () => {
            const bubble = bubbleOf([
                { id: 'K', type: 'kitchen' },
                { id: 'BA', type: 'bathroom' },
            ]);
            // Kitchen on the LEFT, bathroom on the RIGHT, separated by a gap.
            const v = validateWetCluster(bubble, [
                place('K',  rect(0, 0, 3, 4)),
                place('BA', rect(6, 0, 9, 4)),    // gap from x=3 to x=6
            ]);
            expect(v.softFindings.length).toBe(1);
            expect(v.softFindings[0]!.metric).toBe('wetFragmentation');
            expect(v.softFindings[0]!.delta).toBeCloseTo(0.5);  // 1/2 wet rooms
            expect(v.softFindings[0]!.reason).toMatch(/2 stack groups/);
        });

        it('three wet rooms in three groups ⇒ 2 findings (numGroups − 1)', () => {
            const bubble = bubbleOf([
                { id: 'K',  type: 'kitchen' },
                { id: 'BA', type: 'bathroom' },
                { id: 'U',  type: 'utility' },
            ]);
            // All three wet rooms separated by gaps.
            const v = validateWetCluster(bubble, [
                place('K',  rect(0, 0, 2, 2)),
                place('BA', rect(5, 0, 7, 2)),
                place('U',  rect(0, 5, 2, 7)),
            ]);
            expect(v.softFindings.length).toBe(2);
            for (const f of v.softFindings) {
                expect(f.delta).toBeCloseTo(1 / 3);
            }
        });

        it('always admissible — wet-cluster fragmentation is SOFT only', () => {
            const bubble = bubbleOf([
                { id: 'K',  type: 'kitchen' },
                { id: 'BA', type: 'bathroom' },
                { id: 'WC', type: 'wc' },
                { id: 'U',  type: 'utility' },
            ]);
            const v = validateWetCluster(bubble, [
                place('K',  rect(0, 0, 2, 2)),
                place('BA', rect(10, 0, 12, 2)),
                place('WC', rect(0, 10, 2, 12)),
                place('U',  rect(10, 10, 12, 12)),
            ]);
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
        });
    });

    describe('ignores non-wet rooms', () => {
        it('a bedroom between two wet rooms still counts as fragmentation', () => {
            const bubble = bubbleOf([
                { id: 'K',  type: 'kitchen' },
                { id: 'B',  type: 'bedroom' },
                { id: 'BA', type: 'bathroom' },
            ]);
            const v = validateWetCluster(bubble, [
                place('K',  rect(0, 0, 3, 4)),
                place('B',  rect(3, 0, 6, 4)),    // bedroom separates the wet rooms
                place('BA', rect(6, 0, 9, 4)),
            ]);
            // Bedroom is NOT wet — kitchen + bathroom are in separate clusters.
            expect(v.softFindings.length).toBe(1);
        });
    });
});
