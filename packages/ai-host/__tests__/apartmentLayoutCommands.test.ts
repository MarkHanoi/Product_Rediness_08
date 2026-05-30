// Apartment Layout — command-set builder tests (SPEC §12, A6-wire).
//
// Pure: a deterministic id-minter proves the pre-minted-id design (no read-back),
// the C15 cascade contract (opening.elementId === door id), and units (metres).

import { describe, expect, it } from 'vitest';
import { buildLayoutCommands } from '../src/workflows/apartmentLayout/executePlan.js';
import type { LayoutOption } from '../src/workflows/apartmentLayout/types.js';

const OPTS = { levelId: 'L0', wallTypeId: 'partition', wallHeightM: 2.7, wallThicknessM: 0.1 };

function option(over: Partial<LayoutOption> = {}): LayoutOption {
    return {
        summary: 's', rooms: [], corridorWidthMin: 1000,
        walls: [
            { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },
            { start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 } },
        ],
        doors: [{ wallRef: 0, offset: 2000, width: 900 }],
        ...over,
    };
}

/** Deterministic minter: wall_1, opening_1, door_1, ... per prefix. */
function counterMinter() {
    const n: Record<string, number> = {};
    return (prefix: string): string => {
        n[prefix] = (n[prefix] ?? 0) + 1;
        return `${prefix}_${n[prefix]}`;
    };
}

describe('buildLayoutCommands (A6-wire)', () => {
    it('emits wall.batch.create with pre-minted ids + metres', () => {
        const set = buildLayoutCommands(option(), OPTS, counterMinter());
        expect(set.wallBatch.command).toBe('wall.batch.create');
        const payload = set.wallBatch.payload as { walls: Array<{ id: string; baseLine: unknown; height: number }>; levelId: string };
        expect(payload.levelId).toBe('L0');
        expect(payload.walls).toHaveLength(2);
        expect(payload.walls[0]!.id).toBe('wall_1');
        expect(payload.walls[1]!.id).toBe('wall_2');
        expect(set.wallIds).toEqual(['wall_1', 'wall_2']);
    });

    it('emits one wall.createOpening per door, hosted on the pre-minted wall id', () => {
        const set = buildLayoutCommands(option(), OPTS, counterMinter());
        expect(set.openingCommands).toHaveLength(1);
        const op = set.openingCommands[0]!;
        expect(op.command).toBe('wall.createOpening');
        const p = op.payload as { wallId: string; opening: { id: string; type: string; elementId: string; offset: number; width: number; height: number; sillHeight: number } };
        expect(p.wallId).toBe('wall_1');                 // door.wallRef 0 → first wall id
        expect(p.opening.type).toBe('door');
        expect(p.opening.offset).toBeCloseTo(2.0, 6);    // mm → m
        expect(p.opening.width).toBeCloseTo(0.9, 6);
        expect(p.opening.height).toBe(2.1);
        expect(p.opening.sillHeight).toBe(0);
    });

    it('opening.elementId === the door id (C15 cascade contract)', () => {
        const set = buildLayoutCommands(option(), OPTS, counterMinter());
        const op = set.openingCommands[0]!.payload as { opening: { id: string; elementId: string } };
        const doors = (set.doorBatch!.payload as { doors: Array<{ id: string; wallId: string; openingId: string }> }).doors;
        expect(op.opening.elementId).toBe(doors[0]!.id);  // opening.elementId === door.id
        expect(doors[0]!.openingId).toBe(op.opening.id);  // door.openingId === opening.id
        expect(doors[0]!.wallId).toBe('wall_1');
    });

    it('door.batch.create carries all doors; null when there are none', () => {
        const set = buildLayoutCommands(option(), OPTS, counterMinter());
        expect(set.doorBatch!.command).toBe('door.batch.create');
        expect((set.doorBatch!.payload as { doors: unknown[] }).doors).toHaveLength(1);

        const noDoors = buildLayoutCommands(option({ doors: [] }), OPTS, counterMinter());
        expect(noDoors.doorBatch).toBeNull();
    });

    it('totalElementCount = walls + doors; warnings propagate from the plan', () => {
        const set = buildLayoutCommands(option(), OPTS, counterMinter());
        expect(set.totalElementCount).toBe(3);           // 2 walls + 1 door
        const dropped = buildLayoutCommands(option({ doors: [{ wallRef: 9, offset: 1, width: 900 }] }), OPTS, counterMinter());
        expect(dropped.doorBatch).toBeNull();
        expect(dropped.warnings.some(w => /out of range/.test(w))).toBe(true);
    });

    it('drops a door whose host wall was degenerate (no opening/door emitted)', () => {
        const set = buildLayoutCommands(option({
            walls: [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }], // 10mm → dropped
            doors: [{ wallRef: 0, offset: 1, width: 5 }],
        }), OPTS, counterMinter());
        expect((set.wallBatch.payload as { walls: unknown[] }).walls).toHaveLength(0);
        expect(set.openingCommands).toHaveLength(0);
        expect(set.doorBatch).toBeNull();
    });

    // T1.D wiring (2026-05-30) — per-pair door finish resolver consumed.
    describe('T1.D per-pair door finish (when LayoutDoor carries roomTypeA/B)', () => {
        const getDoorSysType = (set: ReturnType<typeof buildLayoutCommands>) =>
            (set.doorBatch!.payload as { doors: Array<{ systemTypeId?: string }> }).doors[0]!.systemTypeId;

        it('bathroom door → dt-white-primed (privacy)', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'corridor', roomTypeB: 'bathroom' }],
            }), OPTS, counterMinter());
            expect(getDoorSysType(set)).toBe('dt-white-primed');
        });

        it('kitchen door → dt-glazed-timber (half-light sight line)', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'living', roomTypeB: 'kitchen' }],
            }), OPTS, counterMinter());
            expect(getDoorSysType(set)).toBe('dt-glazed-timber');
        });

        it('bedroom ↔ corridor → dt-solid-timber (editor default residential)', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'corridor', roomTypeB: 'bedroom' }],
            }), OPTS, counterMinter());
            expect(getDoorSysType(set)).toBe('dt-solid-timber');
        });

        it('wet-room rule beats kitchen rule (kitchen ↔ bathroom is privacy door)', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'kitchen', roomTypeB: 'bathroom' }],
            }), OPTS, counterMinter());
            expect(getDoorSysType(set)).toBe('dt-white-primed');
        });

        it('door WITHOUT room types falls back to the global stampDoorSysType', () => {
            // Legacy path: no roomTypeA/B → keeps the existing `solid-timber`
            // global default (executePlan.DEFAULT_DOOR_SYSTEM_TYPE_ID). No
            // regression vs pre-T1.D behaviour.
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900 }],   // no room types
            }), OPTS, counterMinter());
            expect(getDoorSysType(set)).toBe('solid-timber');
        });
    });
});
