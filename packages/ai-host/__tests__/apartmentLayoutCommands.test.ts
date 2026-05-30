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

    // T1.W-B wiring (2026-05-30) — emitted windows flow through to commands.
    describe('T1.W-B window dispatch (when LayoutOption carries windows[])', () => {
        const winOption = (over: Partial<LayoutOption> = {}) => option({
            // A 4-wall partition box; window hosts on wallRef 1.
            walls: [
                { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },
                { start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 } },
            ],
            doors: [],     // no doors — keep the test focused
            windows: [{
                wallRef: 1, offset: 500, width: 1500, height: 1300,
                sillHeight: 900, roomType: 'bedroom', name: 'Bedroom Window',
            }],
            ...over,
        });

        it('emits one wall.createOpening (type: window) per window on its host wall', () => {
            const set = buildLayoutCommands(winOption(), OPTS, counterMinter());
            expect(set.windowOpeningCommands).toHaveLength(1);
            const op = set.windowOpeningCommands[0]!;
            expect(op.command).toBe('wall.createOpening');
            const p = op.payload as { wallId: string; opening: { type: string; elementId: string; width: number; sillHeight: number } };
            expect(p.opening.type).toBe('window');
            expect(p.opening.width).toBeCloseTo(1.5, 6);
            expect(p.opening.sillHeight).toBeCloseTo(0.9, 6);
        });

        it('emits one window.batch.create with C15 cascade ids (opening.elementId === window id)', () => {
            const set = buildLayoutCommands(winOption(), OPTS, counterMinter());
            expect(set.windowBatch!.command).toBe('window.batch.create');
            const windows = (set.windowBatch!.payload as { windows: Array<{ id: string; wallId: string; openingId: string }> }).windows;
            expect(windows).toHaveLength(1);
            const opPayload = set.windowOpeningCommands[0]!.payload as { opening: { id: string; elementId: string } };
            expect(opPayload.opening.elementId).toBe(windows[0]!.id);
            expect(windows[0]!.openingId).toBe(opPayload.opening.id);
        });

        it('per-room window system-type — bedroom → wt-timber-casement', () => {
            const set = buildLayoutCommands(winOption(), OPTS, counterMinter());
            const windows = (set.windowBatch!.payload as { windows: Array<{ systemTypeId?: string }> }).windows;
            expect(windows[0]!.systemTypeId).toBe('wt-timber-casement');
        });

        it('per-room window system-type — bathroom → wt-upvc-casement (privacy)', () => {
            const set = buildLayoutCommands(winOption({
                windows: [{ wallRef: 1, offset: 500, width: 600, height: 600, sillHeight: 1700, roomType: 'bathroom' }],
            }), OPTS, counterMinter());
            const windows = (set.windowBatch!.payload as { windows: Array<{ systemTypeId?: string }> }).windows;
            expect(windows[0]!.systemTypeId).toBe('wt-upvc-casement');
        });

        it('per-room window system-type — kitchen → wt-upvc-tilt-turn', () => {
            const set = buildLayoutCommands(winOption({
                windows: [{ wallRef: 1, offset: 500, width: 1200, height: 1200, sillHeight: 1000, roomType: 'kitchen' }],
            }), OPTS, counterMinter());
            const windows = (set.windowBatch!.payload as { windows: Array<{ systemTypeId?: string }> }).windows;
            expect(windows[0]!.systemTypeId).toBe('wt-upvc-tilt-turn');
        });

        it('no windows in the option → windowBatch is null + windowOpeningCommands is empty', () => {
            const set = buildLayoutCommands(option(), OPTS, counterMinter());
            expect(set.windowBatch).toBeNull();
            expect(set.windowOpeningCommands).toHaveLength(0);
            expect(set.windowIds).toHaveLength(0);
        });

        it('totalElementCount includes windows', () => {
            const set = buildLayoutCommands(winOption(), OPTS, counterMinter());
            // 2 walls + 0 doors + 1 window = 3
            expect(set.totalElementCount).toBe(3);
        });

        it('window without roomType omits systemTypeId (handler default)', () => {
            const set = buildLayoutCommands(winOption({
                windows: [{ wallRef: 1, offset: 500, width: 1500, height: 1300, sillHeight: 900 }],
            }), OPTS, counterMinter());
            const windows = (set.windowBatch!.payload as { windows: Array<{ systemTypeId?: string }> }).windows;
            expect(windows[0]!.systemTypeId).toBeUndefined();
        });
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
