// T2.6 — `validateCirculationSequence` tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §19.2).

import { describe, expect, it } from 'vitest';
import {
    validateCirculationSequence,
    type SequencePlacement,
} from '../src/workflows/apartmentLayout/topology/validateCirculationSequence.js';
import type { DoorOpening } from '../src/workflows/apartmentLayout/topology/validateMandatoryAdjacencies.js';
import type { BubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const bubbleOf = (
    rooms: readonly { id: string; type: RoomType }[],
    edges: BubbleGraph['edges'] = [],
    entryId: string | null = null,
): BubbleGraph => ({
    rooms: rooms.map(r => ({ id: r.id, type: r.type, name: r.id, targetAreaM2: 10, isPrivate: false, needsWindow: false })),
    edges, corridorId: null,
    entryId: entryId ?? rooms[0]?.id ?? null,
});

const rect = (x0: number, z0: number, x1: number, z1: number) => ({ x0, z0, x1, z1 });
const place = (id: string, r: ReturnType<typeof rect>): SequencePlacement => ({ id, rect: r });
const door = (a: string, b: string): DoorOpening => ({ type: 'door', betweenRoomIds: [a, b] });

describe('validateCirculationSequence (T2.6)', () => {
    describe('admissible cases', () => {
        it('admits cleanly when entry releases into a LARGER living room', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'L', type: 'living' },
            ], [], 'H');
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 2, 2)),    //   4 m² hall
                place('L', rect(2, 0, 8, 6)),    //  36 m² living
            ], [door('H', 'L')]);
            expect(v.softFindings.length).toBe(0);
        });

        it('admits cleanly when no hall exists (no entry to check)', () => {
            const bubble = bubbleOf([
                { id: 'L', type: 'living' },
                { id: 'K', type: 'kitchen' },
            ]);
            const v = validateCirculationSequence(bubble, [
                place('L', rect(0, 0, 5, 5)),
                place('K', rect(5, 0, 8, 4)),
            ], []);
            // bubble.entryId defaults to L (living) — which IS the largest
            // habitable, so no compression issue against anything.
            expect(v.softFindings.length).toBe(0);
        });

        it('admits when entry has no habitable neighbour (only private rooms)', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'C', type: 'corridor' },   // not habitable
            ], [], 'H');
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 4, 4)),    // 16 m²
                place('C', rect(4, 0, 5, 4)),
            ], [door('H', 'C')]);
            expect(v.softFindings.length).toBe(0);
        });
    });

    describe('SOFT penalties for compression anti-pattern', () => {
        it('penalises a hall LARGER than its living room ("anti-climax")', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'L', type: 'living' },
            ], [], 'H');
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 4, 4)),    // 16 m² oversized hall
                place('L', rect(4, 0, 7, 4)),    // 12 m² compressed living
            ], [door('H', 'L')]);
            expect(v.softFindings.length).toBe(1);
            expect(v.softFindings[0]!.category).toBe('sequence');
            expect(v.softFindings[0]!.metric).toBe('compressionRelease');
            expect(v.softFindings[0]!.reason).toMatch(/larger.*first habitable/);
        });

        it('reports the LARGEST habitable neighbour as the release space', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'D', type: 'dining' },
                { id: 'L', type: 'living' },
            ], [], 'H');
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 5, 5)),    // 25 m² hall
                place('D', rect(5, 0, 8, 3)),    //  9 m² dining
                place('L', rect(0, 5, 5, 9)),    // 20 m² living (largest)
            ], [door('H', 'D'), door('H', 'L')]);
            expect(v.softFindings.length).toBe(1);
            // Penalty compares entry to the LARGEST neighbour (L), not the smaller D.
            expect(v.softFindings[0]!.roomIdB).toBe('L');
        });

        it('delta scales with the size of the mismatch (bounded to 1)', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'L', type: 'living' },
            ], [], 'H');
            // Massive hall vs tiny living: ratio = 100/4 = 25.
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 10, 10)),
                place('L', rect(10, 0, 12, 2)),
            ], [door('H', 'L')]);
            expect(v.softFindings.length).toBe(1);
            expect(v.softFindings[0]!.delta).toBeLessThanOrEqual(1);
            expect(v.softFindings[0]!.delta).toBeGreaterThan(0.5);
        });

        it('always admissible — sequence is SOFT only', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'L', type: 'living' },
            ], [], 'H');
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 10, 10)),
                place('L', rect(10, 0, 11, 1)),
            ], [door('H', 'L')]);
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
        });
    });

    describe('door + bubble-edge inputs both drive adjacency', () => {
        it('respects bubble.edges for open thresholds (hall ↔ living open-plan)', () => {
            const bubble = bubbleOf([
                { id: 'H', type: 'hall' },
                { id: 'L', type: 'living' },
            ], [{ a: 'H', b: 'L', via: 'open' }], 'H');
            const v = validateCirculationSequence(bubble, [
                place('H', rect(0, 0, 4, 4)),
                place('L', rect(4, 0, 7, 4)),
            ], []);   // no realised door — but open threshold is in bubble.edges
            expect(v.softFindings.length).toBe(1);
        });
    });
});
