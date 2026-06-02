// A.39.b — entry-sightline perceptual evaluator tests.

import { describe, expect, it } from 'vitest';
import {
    validateEntrySightline,
    type SightlineRoomInput,
    type SightlineDoorInput,
} from '../src/workflows/apartmentLayout/dimensions/validateEntrySightline.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

function room(roomId: string, type: RoomType): SightlineRoomInput {
    return { roomId, type };
}

function door(roomA: string, roomB: string): SightlineDoorInput {
    return { roomA, roomB };
}

/**
 * Build a "sound" 2-bed apartment graph:
 *
 *   exterior → hall (entry) → living → kitchen
 *                         ↘ corridor → master
 *                                   ↘ bedroom
 *                                   ↘ bathroom
 *
 * Depths from hall: living=1, kitchen=2, corridor=1, master=2,
 * bedroom=2, bathroom=2. master/bedroom/bathroom at depth 2 (privacy
 * OK), deepest habitable at depth 2 (sequence OK).
 */
function soundApartmentGraph() {
    const rooms: SightlineRoomInput[] = [
        room('hall', 'hall'),
        room('living', 'living'),
        room('kitchen', 'kitchen'),
        room('corridor', 'corridor'),
        room('master', 'master'),
        room('bedroom', 'bedroom'),
        room('bathroom', 'bathroom'),
    ];
    const doors: SightlineDoorInput[] = [
        door('__exterior__', 'hall'),
        door('hall', 'living'),
        door('living', 'kitchen'),
        door('hall', 'corridor'),
        door('corridor', 'master'),
        door('corridor', 'bedroom'),
        door('corridor', 'bathroom'),
    ];
    return { rooms, doors, entryRoomId: 'hall' };
}

describe('validateEntrySightline — sound apartment', () => {
    it('passes admissibility on the sound 2-bed fixture', () => {
        const v = validateEntrySightline(soundApartmentGraph());
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
        expect(v.softFindings.length).toBe(0);
    });
});

describe('validateEntrySightline — privacy break (HARD)', () => {
    it('HARD-rejects bedroom directly off the hall', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall'), room('bed1', 'bedroom')],
            doors: [
                door('__exterior__', 'hall'),
                door('hall', 'bed1'),
            ],
            entryRoomId: 'hall',
        });
        expect(v.admissible).toBe(false);
        const f = v.hardFindings.find((x) => x.metric === 'privateRoomTooShallow');
        expect(f?.roomId).toBe('bed1');
    });

    it('HARD-rejects master directly off the hall', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall'), room('m', 'master')],
            doors: [door('hall', 'm')],
            entryRoomId: 'hall',
        });
        expect(v.admissible).toBe(false);
    });

    it('HARD-rejects bathroom directly off the entry', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall'), room('ba', 'bathroom')],
            doors: [door('hall', 'ba')],
            entryRoomId: 'hall',
        });
        expect(v.admissible).toBe(false);
    });

    it('HARD-rejects when entry room IS a private room (depth 0)', () => {
        const v = validateEntrySightline({
            rooms: [room('bed1', 'bedroom')],
            doors: [door('__exterior__', 'bed1')],
            entryRoomId: 'bed1',
        });
        expect(v.admissible).toBe(false);
        // bed1 at depth 0 — too shallow.
        expect(v.hardFindings[0]?.roomId).toBe('bed1');
    });

    it('accepts a bedroom at depth 2 (via corridor)', () => {
        const v = validateEntrySightline({
            rooms: [
                room('hall', 'hall'),
                room('corridor', 'corridor'),
                room('bed1', 'bedroom'),
            ],
            doors: [
                door('hall', 'corridor'),
                door('corridor', 'bed1'),
            ],
            entryRoomId: 'hall',
        });
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });

    it('ensuite directly off hall is HARD (privacy break)', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall'), room('e', 'ensuite')],
            doors: [door('hall', 'e')],
            entryRoomId: 'hall',
        });
        expect(v.admissible).toBe(false);
    });
});

describe('validateEntrySightline — entry-is-circulation (SOFT)', () => {
    it('SOFT-flags when entry opens directly into living', () => {
        const v = validateEntrySightline({
            rooms: [room('lv', 'living')],
            doors: [door('__exterior__', 'lv')],
            entryRoomId: 'lv',
        });
        expect(v.admissible).toBe(true);
        const f = v.softFindings.find((x) => x.metric === 'entryNotCirculation');
        expect(f).toBeDefined();
        expect(f?.roomId).toBe('lv');
    });

    it('does NOT flag when entry is a hall', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall')],
            doors: [door('__exterior__', 'hall')],
            entryRoomId: 'hall',
        });
        expect(
            v.softFindings.find((x) => x.metric === 'entryNotCirculation'),
        ).toBeUndefined();
    });

    it('does NOT flag when entry is a corridor', () => {
        const v = validateEntrySightline({
            rooms: [room('c', 'corridor')],
            doors: [door('__exterior__', 'c')],
            entryRoomId: 'c',
        });
        expect(
            v.softFindings.find((x) => x.metric === 'entryNotCirculation'),
        ).toBeUndefined();
    });
});

describe('validateEntrySightline — depth too deep (SOFT)', () => {
    it('SOFT-flags habitable destination at depth > 4', () => {
        // Chain: hall → c1 → c2 → c3 → c4 → master (depth 5)
        const v = validateEntrySightline({
            rooms: [
                room('hall', 'hall'),
                room('c1', 'corridor'),
                room('c2', 'corridor'),
                room('c3', 'corridor'),
                room('c4', 'corridor'),
                room('m', 'master'),
            ],
            doors: [
                door('hall', 'c1'),
                door('c1', 'c2'),
                door('c2', 'c3'),
                door('c3', 'c4'),
                door('c4', 'm'),
            ],
            entryRoomId: 'hall',
        });
        // Still admissible (no privacy break — master IS at depth 5).
        expect(v.admissible).toBe(true);
        const f = v.softFindings.find((x) => x.metric === 'destinationTooDeep');
        expect(f).toBeDefined();
        expect(f?.roomId).toBe('m');
    });

    it('does NOT flag when deepest habitable is at depth 4', () => {
        // Chain: hall → c1 → c2 → c3 → master (depth 4)
        const v = validateEntrySightline({
            rooms: [
                room('hall', 'hall'),
                room('c1', 'corridor'),
                room('c2', 'corridor'),
                room('c3', 'corridor'),
                room('m', 'master'),
            ],
            doors: [
                door('hall', 'c1'),
                door('c1', 'c2'),
                door('c2', 'c3'),
                door('c3', 'm'),
            ],
            entryRoomId: 'hall',
        });
        expect(
            v.softFindings.find((x) => x.metric === 'destinationTooDeep'),
        ).toBeUndefined();
    });

    it('considers the DEEPEST habitable when there are multiple', () => {
        // hall → corridor → bedroom (depth 2)
        // hall → corridor → corridor2 → corridor3 → corridor4 → master (depth 5)
        const v = validateEntrySightline({
            rooms: [
                room('hall', 'hall'),
                room('c1', 'corridor'),
                room('bed', 'bedroom'),
                room('c2', 'corridor'),
                room('c3', 'corridor'),
                room('c4', 'corridor'),
                room('m', 'master'),
            ],
            doors: [
                door('hall', 'c1'),
                door('c1', 'bed'),
                door('c1', 'c2'),
                door('c2', 'c3'),
                door('c3', 'c4'),
                door('c4', 'm'),
            ],
            entryRoomId: 'hall',
        });
        const f = v.softFindings.find((x) => x.metric === 'destinationTooDeep');
        expect(f?.roomId).toBe('m'); // deepest
    });
});

describe('validateEntrySightline — degenerate inputs', () => {
    it('returns empty findings when entry room is not in rooms list', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall')],
            doors: [],
            entryRoomId: 'nope',
        });
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
        expect(v.softFindings.length).toBe(0);
    });

    it('handles disconnected rooms (unreachable from entry)', () => {
        // Detached bedroom — BFS won't reach it, no finding.
        const v = validateEntrySightline({
            rooms: [
                room('hall', 'hall'),
                room('orphan', 'bedroom'),
            ],
            doors: [],
            entryRoomId: 'hall',
        });
        expect(v.admissible).toBe(true);
        // Orphan room can't trigger privacy break because BFS never sees it.
        expect(v.hardFindings.length).toBe(0);
    });

    it('exterior pseudo-node is filtered out of the graph', () => {
        const v = validateEntrySightline({
            rooms: [room('hall', 'hall')],
            doors: [door('__exterior__', 'hall')],
            entryRoomId: 'hall',
        });
        // Hall reachable at depth 0, no other rooms — should be clean.
        expect(v.hardFindings.length).toBe(0);
    });
});

describe('validateEntrySightline — result shape', () => {
    it('every finding has metric / reason / roomId / delta', () => {
        const v = validateEntrySightline({
            rooms: [room('lv', 'living'), room('bed', 'bedroom')],
            doors: [
                door('__exterior__', 'lv'),
                door('lv', 'bed'),
            ],
            entryRoomId: 'lv',
        });
        for (const f of [...v.hardFindings, ...v.softFindings]) {
            expect(f.metric.length).toBeGreaterThan(0);
            expect(f.reason.length).toBeGreaterThan(0);
            expect(f.roomId.length).toBeGreaterThan(0);
            expect(f.delta).toBeGreaterThanOrEqual(0);
            expect(f.delta).toBeLessThanOrEqual(1);
        }
    });
});
