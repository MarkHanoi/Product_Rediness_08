// §DOC-AI-COMMAND-WIRE (2026-06-24) — guards the fix for the two dead Documentation
// AI commands ("Floor plan per level" / "Building elevations").
//
// Before the fix those buttons were authored as autoSend NL `query` strings that
// QueryEngine has no pattern for → they fell through to "I'm not sure how to help
// with that yet." and created NOTHING. They are now direct actions that dispatch the
// registered `view.createDefinition` bus verb — exactly what these tests assert.
//
// We mock the @pryzm/core-app-model + @pryzm/ai-host barrels (real ones pull in
// @thatopen/ui / THREE which the node test env lacks) and drive a fake runtime bus so
// the test is a pure dispatch-contract check.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocked stores ──────────────────────────────────────────────────────────────
let storedViews: Array<{ id: string; viewType: string; spatial: { levelId?: string } }> = [];
let rooms: Array<{ id: string; name: string; levelId: string; boundary: { polygon: Array<{ x: number; z: number }> } }> = [];

vi.mock('@pryzm/core-app-model', () => ({
    viewDefinitionStore: {
        getAll: () => storedViews,
        getByLevel: (levelId: string) => storedViews.filter(v => v.spatial.levelId === levelId),
    },
    storeRegistry: {
        getStoreForType: (t: string) => (t === 'room' ? { getAll: () => rooms } : undefined),
    },
}));

// Pure ai-host helpers — reimplement the deterministic shape the real ones return.
vi.mock('@pryzm/ai-host', () => ({
    planDocumentationSet: () => [],
    computeBuildingElevationMarks: (footprint: Array<{ x: number; z: number }>) => {
        if (!footprint || footprint.length < 3) return [];
        return [
            { direction: 'N', facing: { x: 0, z: -1 }, label: 'North Elevation' },
            { direction: 'S', facing: { x: 0, z: 1 }, label: 'South Elevation' },
            { direction: 'E', facing: { x: -1, z: 0 }, label: 'East Elevation' },
            { direction: 'W', facing: { x: 1, z: 0 }, label: 'West Elevation' },
        ];
    },
}));

import {
    generateFloorPlansPerLevel,
    generateBuildingElevations,
} from '../src/ui/documentation/generateDocumentationSet.js';

// ── Fake runtime bus ─────────────────────────────────────────────────────────
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

function setLevels(levels: Array<{ id: string; name: string; elevation: number }>): void {
    (globalThis as any).window = (globalThis as any).window ?? {};
    (globalThis as any).window.bimManager = { getLevels: () => levels };
}

beforeEach(() => {
    storedViews = [];
    rooms = [];
});
afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).window;
});

describe('§DOC-AI-COMMAND-WIRE — Floor plan per level', () => {
    it('dispatches one view.createDefinition (viewType plan) per level', () => {
        setLevels([
            { id: 'lvl-0', name: 'Ground', elevation: 0 },
            { id: 'lvl-1', name: 'Level 1', elevation: 3 },
        ]);
        const { calls, runtime } = makeRuntime();
        const created = generateFloorPlansPerLevel(runtime);

        expect(created).toBe(2);
        expect(calls.map(c => c.type)).toEqual(['view.createDefinition', 'view.createDefinition']);
        expect(calls.map(c => c.payload.viewType)).toEqual(['plan', 'plan']);
        expect(calls.map(c => c.payload.spatial.levelId)).toEqual(['lvl-0', 'lvl-1']);
        expect(calls.map(c => c.payload.id)).toEqual(['vd-doc-plan-lvl-0', 'vd-doc-plan-lvl-1']);
    });

    it('is idempotent — skips levels whose plan view already exists', () => {
        setLevels([{ id: 'lvl-0', name: 'Ground', elevation: 0 }]);
        storedViews = [{ id: 'vd-doc-plan-lvl-0', viewType: 'plan', spatial: { levelId: 'lvl-0' } }];
        const { calls, runtime } = makeRuntime();
        expect(generateFloorPlansPerLevel(runtime)).toBe(0);
        expect(calls.length).toBe(0);
    });

    it('warns (no dispatch) when the model has no levels', () => {
        setLevels([]);
        const { calls, runtime, toasts } = makeRuntime();
        expect(generateFloorPlansPerLevel(runtime)).toBe(0);
        expect(calls.length).toBe(0);
        expect(toasts[0]?.severity).toBe('warn');
    });
});

describe('§DOC-AI-COMMAND-WIRE — Building elevations', () => {
    it('dispatches the four N/S/E/W elevation views with projectionDirection', () => {
        setLevels([{ id: 'lvl-0', name: 'Ground', elevation: 0 }]);
        rooms = [{
            id: 'r1', name: 'Living', levelId: 'lvl-0',
            boundary: { polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }] },
        }];
        const { calls, runtime } = makeRuntime();
        const created = generateBuildingElevations(runtime);

        expect(created).toBe(4);
        expect(calls.every(c => c.type === 'view.createDefinition')).toBe(true);
        expect(calls.every(c => c.payload.viewType === 'elevation')).toBe(true);
        expect(calls.map(c => c.payload.id)).toEqual([
            'vd-doc-elev-N', 'vd-doc-elev-S', 'vd-doc-elev-E', 'vd-doc-elev-W',
        ]);
        // North looks toward -Z; West looks toward +X — projectionDirection carried through.
        expect(calls[0].payload.spatial.projectionDirection).toEqual({ x: 0, y: 0, z: -1 });
        expect(calls[3].payload.spatial.projectionDirection).toEqual({ x: 1, y: 0, z: 0 });
    });

    it('warns when there is no footprint (no rooms) yet', () => {
        setLevels([{ id: 'lvl-0', name: 'Ground', elevation: 0 }]);
        rooms = [];
        const { calls, runtime, toasts } = makeRuntime();
        expect(generateBuildingElevations(runtime)).toBe(0);
        expect(calls.length).toBe(0);
        expect(toasts[0]?.severity).toBe('warn');
    });

    it('is idempotent — skips elevations that already exist', () => {
        setLevels([{ id: 'lvl-0', name: 'Ground', elevation: 0 }]);
        rooms = [{
            id: 'r1', name: 'Living', levelId: 'lvl-0',
            boundary: { polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }] },
        }];
        storedViews = [
            { id: 'vd-doc-elev-N', viewType: 'elevation', spatial: {} },
            { id: 'vd-doc-elev-S', viewType: 'elevation', spatial: {} },
        ];
        const { runtime } = makeRuntime();
        expect(generateBuildingElevations(runtime)).toBe(2); // only E + W remain
    });
});
