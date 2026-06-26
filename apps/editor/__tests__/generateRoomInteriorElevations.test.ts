// §DOC-ROOM-INTERIOR-ELEVATIONS — generator dispatch-contract test (2026-06-26).
//
// Asserts the editor trigger (a) resolves the chosen scope over the live room store,
// (b) dispatches one `view.createDefinition` (viewType 'elevation') per room wall via
// the command bus (P6), (c) wraps the dispatch in ONE batchCoordinator.runBatch (one
// undo, C24.1 §1.2), and (d) is idempotent on the stable view id.
//
// We mock the @pryzm/core-app-model + @pryzm/ai-host barrels (the real ones pull in
// @thatopen/ui / THREE which the node test env lacks) and drive a fake runtime bus.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let storedViews: Array<{ id: string }> = [];
let rooms: Array<{ id: string; name: string; levelId: string; boundary: { polygon: Array<{ x: number; z: number }> } }> = [];
let batchCalls = 0;

vi.mock('@pryzm/core-app-model', () => ({
    viewDefinitionStore: { getAll: () => storedViews },
    storeRegistry: { getStoreForType: (t: string) => (t === 'room' ? { getAll: () => rooms } : undefined) },
    batchCoordinator: { runBatch: (fn: () => void) => { batchCalls += 1; fn(); } },
}));

vi.mock('@pryzm/ai-host', () => ({
    computeRoomInteriorElevationMarks: (poly: Array<{ x: number; z: number }>) => {
        if (!poly || poly.length < 3) return [];
        return [
            { wall: 'N', facing: { x: 0, z: 1 } },
            { wall: 'S', facing: { x: 0, z: -1 } },
            { wall: 'E', facing: { x: 1, z: 0 } },
            { wall: 'W', facing: { x: -1, z: 0 } },
        ];
    },
    roomCropRegion: (poly: Array<{ x: number; z: number }>, margin = 0.5) => {
        if (!poly || poly.length < 3) return null;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of poly) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
        if (!(maxX > minX) || !(maxZ > minZ)) return null;
        return { minX: minX - margin, minZ: minZ - margin, maxX: maxX + margin, maxZ: maxZ + margin };
    },
}));

import { generateRoomInteriorElevations } from '../src/ui/documentation/generateRoomInteriorElevations.js';

interface BusCall { type: string; payload: any }
function makeRuntime() {
    const calls: BusCall[] = [];
    const toasts: Array<{ message: string; severity: string }> = [];
    return {
        calls, toasts,
        runtime: {
            bus: { executeCommand: (type: string, payload: unknown) => { calls.push({ type, payload }); } },
            events: { emit: (_k: string, p: unknown) => { toasts.push(p as { message: string; severity: string }); } },
        } as any,
    };
}

const SQUARE = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];

function setRooms(): void {
    rooms = [
        { id: 'r1', name: 'Living', levelId: 'lvl-0', boundary: { polygon: SQUARE } },
        { id: 'r2', name: 'Study', levelId: 'lvl-1', boundary: { polygon: SQUARE } },
    ];
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.bimManager = { getLevels: () => [
        { id: 'lvl-0', name: 'Ground', elevation: 0 },
        { id: 'lvl-1', name: 'Level 1', elevation: 3 },
    ] };
}

beforeEach(() => { storedViews = []; rooms = []; batchCalls = 0; });
afterEach(() => { vi.restoreAllMocks(); delete (globalThis as any).window; });

describe('§DOC-ROOM-INTERIOR-ELEVATIONS — generateRoomInteriorElevations', () => {
    it('all rooms → 4 elevation views per room, all in ONE runBatch', () => {
        setRooms();
        const { calls, runtime } = makeRuntime();
        const created = generateRoomInteriorElevations(runtime, { kind: 'all' });

        expect(created).toBe(8); // 2 rooms × 4 walls
        expect(batchCalls).toBe(1); // one undo unit
        expect(calls.every(c => c.type === 'view.createDefinition')).toBe(true);
        expect(calls.every(c => c.payload.viewType === 'elevation')).toBe(true);
        expect(calls.map(c => c.payload.id)).toContain('vd-room-elev-r1-N');
        expect(calls.map(c => c.payload.id)).toContain('vd-room-elev-r2-W');
    });

    it('this-level scope → only rooms on that level (4 views)', () => {
        setRooms();
        const { calls, runtime } = makeRuntime();
        const created = generateRoomInteriorElevations(runtime, { kind: 'level', levelId: 'lvl-1' });
        expect(created).toBe(4);
        expect(calls.map(c => c.payload.id)).toEqual([
            'vd-room-elev-r2-N', 'vd-room-elev-r2-S', 'vd-room-elev-r2-E', 'vd-room-elev-r2-W',
        ]);
    });

    it('specific-room scope → exactly that room (4 views)', () => {
        setRooms();
        const { calls, runtime } = makeRuntime();
        const created = generateRoomInteriorElevations(runtime, { kind: 'room', roomId: 'r1' });
        expect(created).toBe(4);
        expect(calls.every(c => c.payload.id.startsWith('vd-room-elev-r1-'))).toBe(true);
    });

    it('carries projectionDirection + crop onto each payload', () => {
        setRooms();
        const { calls, runtime } = makeRuntime();
        generateRoomInteriorElevations(runtime, { kind: 'room', roomId: 'r1' });
        const north = calls.find(c => c.payload.id === 'vd-room-elev-r1-N')!;
        expect(north.payload.spatial.projectionDirection).toEqual({ x: 0, y: 0, z: 1 });
        expect(north.payload.crop.enabled).toBe(true);
        expect(north.payload.crop.region.min).toEqual([-0.5, -0.5]);
    });

    it('is idempotent — skips views that already exist', () => {
        setRooms();
        storedViews = [{ id: 'vd-room-elev-r1-N' }, { id: 'vd-room-elev-r1-S' }];
        const { runtime } = makeRuntime();
        const created = generateRoomInteriorElevations(runtime, { kind: 'room', roomId: 'r1' });
        expect(created).toBe(2); // only E + W remain
    });

    it('warns (no dispatch) when there are no rooms', () => {
        (globalThis as any).window = { bimManager: { getLevels: () => [] } };
        rooms = [];
        const { calls, runtime, toasts } = makeRuntime();
        expect(generateRoomInteriorElevations(runtime, { kind: 'all' })).toBe(0);
        expect(calls.length).toBe(0);
        expect(toasts[0]?.severity).toBe('warn');
    });
});
