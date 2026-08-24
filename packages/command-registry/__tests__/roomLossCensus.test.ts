/**
 * §ROOM-LOSS-CENSUS (L-10812) — C94 §TOBE.6 **RM-0**.
 *
 * ## WHAT THESE ARMS PIN
 *
 * `ReDetectRoomsCommand` drops every room the fresh detection did not re-claim
 * (`:105-112`), with **no snapshot**, while `undo()` is a no-op and the command is
 * `nonUndoable`. Until this census, that happened with **no record of any kind** — so
 * *"how often does this happen, and to what?"* had no answer, and all three open rulings
 * in C94 §TOBE.8 rested on one console excerpt from one session.
 *
 * ## ⭐⭐ THE ARM THAT MATTERS IS `authored`, NOT THE COUNT
 *
 * *"We lost 40 rooms"* and *"we lost 40 auto-numbered, never-touched rooms"* argue for
 * OPPOSITE answers to R-1. Two arms below exist solely to stop the census reporting the
 * first when it means the second:
 *
 *   · a room carrying ONLY what detection and auto-numbering produced reads
 *     `authored: false` — including its system-minted `Room 00-004` name, its
 *     auto-assigned palette COLOUR, and `occupancyType: 'unclassified'`;
 *   · a room a human touched reads `authored: true` and NAMES the fields.
 *
 * ⛔ The colour arm is the important one. Every detected room has a colour
 * (`RoomDetectionEngine.ts:507`), so counting it would report 100% authored on a model
 * nobody has touched — a check that runs, passes, and could never have failed.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomStore, RoomDetectionEngine } from '@pryzm/room-topology';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import type { CommandContext } from '../src/types';
import {
    classifyRoomLoss,
    formatRoomLossLine,
    roomCensusSuppressed,
    type RoomLossRecord,
} from '../src/rooms/roomLossCensus';
import { isSystemMintedRoomNumber } from '../src/rooms/RoomNumbering';

/**
 * A room exactly as `RoomDetectionEngine.ts:510-542` produces it, then numbered by
 * `assignUniqueRoomNumbers`. Every value here is SYSTEM output — the baseline against
 * which "authored" is measured, transcribed from the engine rather than imagined.
 */
function detectedRoom(over: Record<string, unknown> = {}): any {
    return {
        id: '746ae083-0000-4000-8000-000000000001',
        type: 'room',
        levelId: 'L0',
        parentId: 'L0',
        name: 'Room 00-004',          // auto-minted by assignUniqueRoomNumbers
        roomNumber: '00-004',         // auto-minted
        boundary: { polygon: [] },
        boundingWallIds: ['w1', 'w2', 'w3', 'w4'],
        boundingSlabIds: [],
        boundingColumnIds: [],
        occupancyType: 'unclassified', // :531
        colour: '#8ecae6',             // :507, cycled palette — NEVER evidence
        finishes: {},                  // :533
        properties: {},                // :535
        computed: { area: 85.7 },
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'system', version: 1, detectionVersion: 1 },
        ...over,
    };
}

describe('§ROOM-LOSS-CENSUS — a room nobody touched must not read as authored', () => {
    it('⭐ a purely system-produced room reads authored:false, colour and minted name notwithstanding', () => {
        const r = classifyRoomLoss(detectedRoom());
        expect(r.authored).toBe(false);
        expect(r.authoredFields).toEqual([]);
        // The measured quantities still come through — the census is not empty, it is honest.
        expect(r.areaM2).toBeCloseTo(85.7, 3);
        expect(r.id).toBe('746ae083-0000-4000-8000-000000000001');
        expect(r.levelId).toBe('L0');
    });

    it('⛔ COLOUR IS NEVER EVIDENCE — every detected room has one', () => {
        // If colour counted, this would be `true` for a model nobody has opened.
        expect(classifyRoomLoss(detectedRoom({ colour: '#ff0066' })).authored).toBe(false);
    });

    it('a system-minted NAME is not evidence, at any level/sequence width', () => {
        expect(classifyRoomLoss(detectedRoom({ name: 'Room 00-004' })).authored).toBe(false);
        expect(classifyRoomLoss(detectedRoom({ name: 'Room 100-0004', roomNumber: '100-0004' })).authored).toBe(false);
        expect(classifyRoomLoss(detectedRoom({ name: '', roomNumber: '' })).authored).toBe(false);
        // The bare-number seed the generators write is system output too.
        expect(classifyRoomLoss(detectedRoom({ name: '00-004' })).authored).toBe(false);
    });

    it("'unclassified' occupancy is the detection default, not a classification", () => {
        expect(classifyRoomLoss(detectedRoom({ occupancyType: 'unclassified' })).authored).toBe(false);
    });
});

describe('§ROOM-LOSS-CENSUS — a room a human touched must say so, and name what', () => {
    it('⭐ an authored NAME is caught and named', () => {
        const r = classifyRoomLoss(detectedRoom({ name: 'Kitchen' }));
        expect(r.authored).toBe(true);
        expect(r.authoredFields).toContain('name');
    });

    it.each([
        ['occupancyType', { occupancyType: 'residential' }],
        ['department', { department: 'Clinical' }],
        ['programmeArea', { programmeArea: 12 }],
        ['occupancyLoad', { occupancyLoad: 4 }],
        ['finishes', { finishes: { floor: { materialName: 'Oak', materialColor: '#c19a6b' } } }],
        ['properties', { properties: { costCode: 'A-12' } }],
        ['ifcData', { ifcData: { globalId: '3vB2p...' } }],
        ['revitId', { revitId: '884201' }],
        ['phase', { phase: 'existing' }],
    ])('%s is authorship evidence on its own', (field, over) => {
        const r = classifyRoomLoss(detectedRoom(over));
        expect(r.authored).toBe(true);
        expect(r.authoredFields).toContain(field);
    });

    it('reports EVERY authored field, so a total can be audited rather than believed', () => {
        const r = classifyRoomLoss(detectedRoom({
            name: 'Operating Theatre 2', occupancyType: 'healthcare', department: 'Surgery', revitId: '9001',
        }));
        expect(r.authoredFields.slice().sort())
            .toEqual(['department', 'name', 'occupancyType', 'revitId']);
    });

    it('⚠ a human-typed number is caught ONLY when it escapes the minted shape — and understating is the safe direction', () => {
        expect(isSystemMintedRoomNumber('00-004')).toBe(true);     // minted shape wins
        expect(isSystemMintedRoomNumber('G.101')).toBe(false);     // unmistakably typed
        expect(classifyRoomLoss(detectedRoom({ roomNumber: 'G.101' })).authoredFields).toContain('roomNumber');
        // ⛔ The conservative case, pinned deliberately: a human who types a number that
        // happens to match the minted shape is read as SYSTEM. The census UNDERSTATES
        // authorship. An overstated count would argue for persistent identity (C94 R-1)
        // on evidence that was never there; an understated one cannot.
        expect(classifyRoomLoss(detectedRoom({ roomNumber: '00-009' })).authoredFields).not.toContain('roomNumber');
    });
});

describe('§ROOM-LOSS-CENSUS — the line reports both numbers and never omits either', () => {
    const authored = (): RoomLossRecord => classifyRoomLoss(detectedRoom({ name: 'Kitchen' }));
    const plain = (): RoomLossRecord => classifyRoomLoss(detectedRoom({ id: 'bbbb', name: 'Room 00-005' }));

    it('states the dropped count, the AUTHORED count, and the area in m²', () => {
        const line = formatRoomLossLine('L0', [authored(), plain()]);
        expect(line).toContain('§ROOM-LOSS-CENSUS');
        expect(line).toContain("level='L0'");
        expect(line).toContain('2 room(s) dropped');
        expect(line).toContain('1 carrying authored data');
        expect(line).toContain('85.7 m2');
        expect(line).toContain('Kitchen');
        expect(line).toContain('authored[name]');
        expect(line).toContain('authored[none]');
    });

    it('⭐ states authored=0 EXPLICITLY — "no authored rooms were lost" is a result, not a blank', () => {
        // Under C94 R-1 this reading is the one that ARGUES FOR leaving derivation alone,
        // so it must be printed, not omitted. A blank reads as "fine" (C84 EI-1b).
        const line = formatRoomLossLine('L0', [plain()]);
        expect(line).toContain('0 carrying authored data');
    });

    it('says the loss is not undoable, because that is the fact the user needs', () => {
        expect(formatRoomLossLine('L0', [authored()])).toContain('NOT restorable by undo');
    });

    it('is ONE line for N rooms — per-element churn is a measured main-thread cost', () => {
        const line = formatRoomLossLine('L0', [authored(), plain(), authored()]);
        expect(line.split('\n')).toHaveLength(1);
        expect(line).toContain('3 room(s) dropped');
    });
});

describe('§ROOM-LOSS-CENSUS — suppressed on replay paths, never on a live edit', () => {
    const g = globalThis as unknown as {
        __pryzmProjectLoadActive?: boolean; __pryzmBuildingGenActive?: boolean;
    };

    it('a live edit is NOT suppressed', () => {
        delete g.__pryzmProjectLoadActive; delete g.__pryzmBuildingGenActive;
        expect(roomCensusSuppressed()).toBe(false);
    });

    it('§LOAD-REDETECT-FREEZE and §GEN-LOG-GATING both suppress it', () => {
        g.__pryzmProjectLoadActive = true;
        expect(roomCensusSuppressed()).toBe(true);
        delete g.__pryzmProjectLoadActive;

        g.__pryzmBuildingGenActive = true;
        expect(roomCensusSuppressed()).toBe(true);
        delete g.__pryzmBuildingGenActive;

        expect(roomCensusSuppressed()).toBe(false);
    });
});

describe('§ROOM-LOSS-CENSUS — it cannot break the drop it observes', () => {
    it('a malformed record is classified, never thrown on', () => {
        // A census that threw would abort the drop loop and turn an honesty fix into a
        // data-loss bug. Every access in `classifyRoomLoss` is guarded for this reason.
        expect(() => classifyRoomLoss({} as never)).not.toThrow();
        const r = classifyRoomLoss({} as never);
        expect(r.areaM2).toBe(0);
        expect(r.authored).toBe(false);
    });
});

/**
 * ⭐⭐ THE ARM THAT IS RED ON HEAD FOR A BEHAVIOURAL REASON, not merely because a new
 * module is absent. It drives the REAL `ReDetectRoomsCommand` against the REAL
 * `RoomStore` and the REAL `RoomDetectionEngine`, loses a room the way the founder lost
 * one — by opening its boundary — and asserts the loss is REPORTED.
 *
 * On HEAD the room is removed at `:107` and nothing is emitted at all: no console line,
 * no `info` on the result. That is the defect, and it is what these two arms fail on.
 */
const LEVEL = 'L0';

function wallOf(id: string, s: [number, number], e: [number, number]): unknown {
    return {
        id, type: 'wall',
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 2.7, thickness: 0.2, baseOffset: 0, levelId: LEVEL,
        childrenIds: [], openings: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
    };
}

const bimManagerStub = {
    getLevelById: (id: string) => (id === LEVEL ? { id, elevation: 0, height: 2.7 } : undefined),
    getLevels: () => [{ id: LEVEL, elevation: 0, height: 2.7 }],
    registerElement: () => {}, unregisterElement: () => {},
};

/** One 8 m x 6 m room; `walls` is mutable so a boundary can be opened mid-test. */
function liveHarness() {
    const walls: unknown[] = [
        wallOf('w-south', [0, 0], [8, 0]),
        wallOf('w-east', [8, 0], [8, 6]),
        wallOf('w-north', [8, 6], [0, 6]),
        wallOf('w-west', [0, 6], [0, 0]),
    ];
    const wallStore = {
        getByLevel: (l: string) => (l === LEVEL ? walls : []),
        getById: (id: string) => walls.find((w: any) => w.id === id),
        getAll: () => walls,
        subscribe: () => () => {},
    };
    const roomStore = new RoomStore(null, bimManagerStub as never);
    const ctx = { stores: { roomStore, wallStore }, bimManager: bimManagerStub } as unknown as CommandContext;
    new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);   // seed, as a first detection would
    return { walls, roomStore, ctx };
}

describe('§ROOM-LOSS-CENSUS — driven end-to-end through the real command', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('⛔ RED ON HEAD: an AUTHORED room lost to an opened boundary is reported, with its area', () => {
        const { walls, roomStore, ctx } = liveHarness();
        const seeded = roomStore.getByLevel(LEVEL);
        expect(seeded).toHaveLength(1);
        const id = seeded[0]!.id;
        const area = seeded[0]!.computed.area;
        expect(area).toBeGreaterThan(40);           // the real 8x6 polygon, inner faces

        // The user names it. This is the meaning that is about to be destroyed.
        roomStore.update(id, { name: 'Kitchen' } as never);
        expect(roomStore.getById(id)!.name).toBe('Kitchen');

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Open the boundary — exactly the founder's gesture, reduced to its effect.
        walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
        const result = new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        // The loss really happened — the census is not reporting a hypothetical.
        expect(roomStore.getById(id)).toBeUndefined();

        const line = warn.mock.calls.map(c => String(c[0])).find(t => t.includes('§ROOM-LOSS-CENSUS'));
        expect(line).toBeDefined();
        expect(line).toContain('1 room(s) dropped');
        expect(line).toContain('1 carrying authored data');
        expect(line).toContain('Kitchen');
        expect(line).toContain('authored[name]');
        expect(line).toContain(`${area.toFixed(1)} m2`);
        expect(line).toContain('NOT restorable by undo');

        // ...and it rides out on the RESULT too, so a reader need not scrape the console.
        expect(result.info?.some(t => t.includes('§ROOM-LOSS-CENSUS'))).toBe(true);
    });

    it('a NEVER-TOUCHED room lost the same way reports authored=0 — the reading that argues the other way', () => {
        const { walls, roomStore, ctx } = liveHarness();
        expect(roomStore.getByLevel(LEVEL)).toHaveLength(1);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        const line = warn.mock.calls.map(c => String(c[0])).find(t => t.includes('§ROOM-LOSS-CENSUS'));
        expect(line).toBeDefined();
        expect(line).toContain('1 room(s) dropped');
        expect(line).toContain('0 carrying authored data');
        expect(line).toContain('authored[none]');
    });

    it('a re-detect that loses NOTHING says nothing at all — silence is the healthy case', () => {
        const { roomStore, ctx } = liveHarness();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        expect(roomStore.getByLevel(LEVEL)).toHaveLength(1);
        expect(warn.mock.calls.map(c => String(c[0])).some(t => t.includes('§ROOM-LOSS-CENSUS'))).toBe(false);
        expect(result.info).toBeUndefined();
    });

    it('§LOAD-REDETECT-FREEZE — a restore drops rooms wholesale and must NOT be counted as user loss', () => {
        const { walls, roomStore, ctx } = liveHarness();
        const id = roomStore.getByLevel(LEVEL)[0]!.id;
        const g = globalThis as unknown as { __pryzmProjectLoadActive?: boolean };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        g.__pryzmProjectLoadActive = true;
        try {
            walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
            const result = new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
            // The drop still happens and the fact is still CARRIED on the result...
            expect(roomStore.getById(id)).toBeUndefined();
            expect(result.info?.some(t => t.includes('§ROOM-LOSS-CENSUS'))).toBe(true);
            // ...but the console stays quiet. Suppression is about log volume, never
            // about withholding the fact from a reader that asked for it.
            expect(warn.mock.calls.map(c => String(c[0])).some(t => t.includes('§ROOM-LOSS-CENSUS'))).toBe(false);
        } finally {
            delete g.__pryzmProjectLoadActive;
        }
    });
});
