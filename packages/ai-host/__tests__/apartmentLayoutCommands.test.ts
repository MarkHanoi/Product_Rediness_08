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

    // T1.W-C wiring (2026-05-30) — engine windows on EXTERNAL walls resolve
    // to existing shell wall ids when opts.shellWalls is provided.
    describe('T1.W-C shell-window dispatch (when opts.shellWalls is provided)', () => {
        const baseOpts = {
            ...OPTS,
            shellWalls: [{ id: 'shell-south', start: { x: 0, z: 0 }, end: { x: 5, z: 0 } }],
        };
        // Plan-mm option carries an EXTERNAL wall along the south facade,
        // and a window on it. The new partition walls in option.walls[1..]
        // are unrelated.
        const winOption = (over: Partial<LayoutOption> = {}): LayoutOption => option({
            walls: [
                { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, isExternal: true },
                { start: { x: 0, y: 2000 }, end: { x: 5000, y: 2000 } },
            ],
            doors: [],
            windows: [{
                wallRef: 0, offset: 1000, width: 1500, height: 1300,
                sillHeight: 900, roomType: 'bedroom', name: 'Bedroom Window',
            }],
            ...over,
        });

        it('emits a wall.createOpening hosted on the EXISTING shell wall id', () => {
            const set = buildLayoutCommands(winOption(), baseOpts, counterMinter());
            expect(set.shellWindowOpeningCommands).toHaveLength(1);
            const p = set.shellWindowOpeningCommands[0]!.payload as { wallId: string; opening: { type: string } };
            expect(p.wallId).toBe('shell-south');             // EXISTING id, not 'wall_1'
            expect(p.opening.type).toBe('window');
        });

        it('emits a window.batch.create dispatched to the shell wall id', () => {
            const set = buildLayoutCommands(winOption(), baseOpts, counterMinter());
            expect(set.shellWindowBatch!.command).toBe('window.batch.create');
            const windows = (set.shellWindowBatch!.payload as { windows: Array<{ wallId: string; systemTypeId?: string }> }).windows;
            expect(windows[0]!.wallId).toBe('shell-south');
            expect(windows[0]!.systemTypeId).toBe('wt-timber-casement');   // bedroom
        });

        it('opts.shellWalls omitted → no shell-window commands emitted', () => {
            const set = buildLayoutCommands(winOption(), OPTS, counterMinter());
            expect(set.shellWindowOpeningCommands).toHaveLength(0);
            expect(set.shellWindowBatch).toBeNull();
            expect(set.shellWindowIds).toHaveLength(0);
        });

        it('no match (shell-wall list missing the south facade) → window dropped silently', () => {
            const set = buildLayoutCommands(winOption(), {
                ...OPTS,
                shellWalls: [{ id: 'shell-east', start: { x: 5, z: 0 }, end: { x: 5, z: 4 } }],
            }, counterMinter());
            expect(set.shellWindowOpeningCommands).toHaveLength(0);
            expect(set.shellWindowBatch).toBeNull();
        });

        it('window on an INTERIOR wall is NOT routed via shellWindow* (legacy path)', () => {
            // The window targets walls[1] (interior). shellWindow* should be empty;
            // the normal windowOpening/window batch path handles it.
            const set = buildLayoutCommands(winOption({
                windows: [{ wallRef: 1, offset: 500, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom' }],
            }), baseOpts, counterMinter());
            expect(set.shellWindowOpeningCommands).toHaveLength(0);
            expect(set.windowOpeningCommands.length).toBeGreaterThan(0);
        });

        it('reversed shell wall → offset flips along the wall length', () => {
            const set = buildLayoutCommands(winOption({
                windows: [{ wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900 }],
            }), {
                ...OPTS,
                shellWalls: [{ id: 'shell-rev', start: { x: 5, z: 0 }, end: { x: 0, z: 0 } }],
            }, counterMinter());
            // wallLen 5 m; window at 1.0 + 1.5 = reversed offset = 2.5 m.
            const op = set.shellWindowOpeningCommands[0]!.payload as { opening: { offset: number } };
            expect(op.opening.offset).toBeCloseTo(2.5, 6);
        });

        it('totalElementCount includes shellWindowIds', () => {
            const set = buildLayoutCommands(winOption(), baseOpts, counterMinter());
            // Walls created = 1 (the interior wall — external dropped via skipExteriorWalls=false here),
            // but with no skipExteriorWalls the external wall is kept; 2 walls + 0 doors + 0
            // normal windows + 1 shell window = 3.
            const expected = (set.wallBatch.payload as { walls: unknown[] }).walls.length
                + set.doorIds.length + set.windowIds.length + set.shellWindowIds.length;
            expect(set.totalElementCount).toBe(expected);
        });

        it('per-room finish — bathroom shell window → wt-upvc-casement (privacy)', () => {
            const set = buildLayoutCommands(winOption({
                windows: [{ wallRef: 0, offset: 1000, width: 600, height: 600, sillHeight: 1700, roomType: 'bathroom' }],
            }), baseOpts, counterMinter());
            const windows = (set.shellWindowBatch!.payload as { windows: Array<{ systemTypeId?: string }> }).windows;
            expect(windows[0]!.systemTypeId).toBe('wt-upvc-casement');
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

    // T1.D wiring (2026-06-08) — the resolved per-room door finish MUST ride the
    // DOOR OPENING, because the LIVE build path (ApartmentLayoutExecutor /
    // HouseLayoutExecutor → CreateWallOpeningsBatchCommand →
    // CreateWallOpeningCommand) reads the finish from `opening.systemTypeId`
    // (resolved against doorSystemTypeStore) — it never dispatches the
    // door.batch.create payload. These tests pin the opening, the field the
    // renderer actually consumes, to a REAL `dt-*` catalogue id.
    describe('T1.D per-room door finish lands on the OPENING (live build path)', () => {
        const getOpeningSysType = (set: ReturnType<typeof buildLayoutCommands>) =>
            (set.openingCommands[0]!.payload as { opening: { systemTypeId?: string } }).opening.systemTypeId;

        it('bathroom door opening → dt-white-primed (privacy) on the OPENING', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'corridor', roomTypeB: 'bathroom' }],
            }), OPTS, counterMinter());
            expect(getOpeningSysType(set)).toBe('dt-white-primed');
        });

        it('living↔kitchen door opening → dt-glazed-timber (half-light) on the OPENING', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'living', roomTypeB: 'kitchen' }],
            }), OPTS, counterMinter());
            expect(getOpeningSysType(set)).toBe('dt-glazed-timber');
        });

        it('bedroom↔corridor door opening → dt-solid-timber default on the OPENING', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: 'corridor', roomTypeB: 'bedroom' }],
            }), OPTS, counterMinter());
            expect(getOpeningSysType(set)).toBe('dt-solid-timber');
        });

        it('door WITHOUT room types stamps the canonical real dt-solid-timber on the OPENING', () => {
            // The global fallback string 'solid-timber' is NOT a real
            // doorSystemTypeStore id; the opening must carry the REAL
            // 'dt-solid-timber' so CreateWallOpeningCommand resolves a finish
            // (never an unknown id that would be silently dropped).
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900 }],   // no room types
            }), OPTS, counterMinter());
            expect(getOpeningSysType(set)).toBe('dt-solid-timber');
        });

        it('explicit doorSystemTypeId="" → OPENING omits systemTypeId (handler default)', () => {
            const set = buildLayoutCommands(option({
                doors: [{ wallRef: 0, offset: 2000, width: 900 }],
            }), { ...OPTS, doorSystemTypeId: '' }, counterMinter());
            expect(getOpeningSysType(set)).toBeUndefined();
        });

        it('every door-opening + door-batch systemTypeId is a REAL dt-* catalogue id', () => {
            // Guards the "wall.createOpening / door.batch.create reject unknown
            // systemTypeId" failure: any id emitted by the wiring across the full
            // room-pair space must be one of the DoorSystemTypeStore built-ins.
            const KNOWN_DOOR_IDS = new Set([
                'dt-solid-timber', 'dt-white-primed', 'dt-glazed-timber',
                'dt-glazed-aluminium', 'dt-fire-rated-60', 'dt-fire-rated-30',
                'dt-steel-industrial', 'dt-aluminium-commercial',
            ]);
            const types = ['master', 'bedroom', 'living', 'kitchen', 'dining', 'bathroom',
                           'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility'] as const;
            for (const a of types) for (const b of types) {
                const set = buildLayoutCommands(option({
                    doors: [{ wallRef: 0, offset: 2000, width: 900, roomTypeA: a, roomTypeB: b }],
                }), OPTS, counterMinter());
                const openId = getOpeningSysType(set);
                expect(openId && KNOWN_DOOR_IDS.has(openId), `opening id ${openId} for ${a}↔${b}`).toBe(true);
                const batchId = (set.doorBatch!.payload as { doors: Array<{ systemTypeId?: string }> }).doors[0]!.systemTypeId;
                expect(batchId && KNOWN_DOOR_IDS.has(batchId), `batch id ${batchId} for ${a}↔${b}`).toBe(true);
            }
        });
    });

    // T1.D/T1.W END-TO-END (2026-06-08) — a single realistic layout assigns the
    // architecturally-correct REAL catalogue ids per room WITHOUT user input:
    // bathroom window obscure/privacy, kitchen window vent, living glazed door.
    describe('end-to-end per-room scheme (single layout, no user input)', () => {
        const houseOption = (): LayoutOption => ({
            summary: 'e2e', corridorWidthMin: 1000, rooms: [],
            walls: [
                { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, isExternal: true },  // south facade
                { start: { x: 0, y: 0 }, end: { x: 0, y: 4000 } },                    // partition 1
                { start: { x: 3000, y: 0 }, end: { x: 3000, y: 4000 } },              // partition 2
            ],
            doors: [
                { wallRef: 1, offset: 1500, width: 900, roomTypeA: 'living', roomTypeB: 'kitchen' },  // glazed
                { wallRef: 2, offset: 1500, width: 800, roomTypeA: 'corridor', roomTypeB: 'bathroom' }, // privacy
            ],
            windows: [
                { wallRef: 1, offset: 500, width: 600, height: 600, sillHeight: 1700, roomType: 'bathroom' }, // privacy uPVC
                { wallRef: 2, offset: 500, width: 1200, height: 1200, sillHeight: 1000, roomType: 'kitchen' }, // tilt-turn
            ],
        });

        it('living↔kitchen door is glazed; bathroom door is privacy; bathroom window privacy uPVC; kitchen window tilt-turn', () => {
            const set = buildLayoutCommands(houseOption(), OPTS, counterMinter());
            // Doors (opening = live field):
            const doorOpenings = set.openingCommands.map(
                op => (op.payload as { opening: { systemTypeId?: string } }).opening.systemTypeId,
            );
            expect(doorOpenings).toContain('dt-glazed-timber');   // living↔kitchen (glazed door)
            expect(doorOpenings).toContain('dt-white-primed');    // corridor↔bathroom (privacy)
            // Windows (opening = live field):
            const winOpenings = set.windowOpeningCommands.map(
                op => (op.payload as { opening: { systemTypeId?: string } }).opening.systemTypeId,
            );
            expect(winOpenings).toContain('wt-upvc-casement');    // bathroom (privacy / obscure-class)
            expect(winOpenings).toContain('wt-upvc-tilt-turn');   // kitchen (ventilation)
        });
    });
});
