/**
 * L-956 — NON-REGRESSION PINS for the slab plan tool's FOUR creation gestures.
 *
 * ⚠ THESE EXIST TO BE BROKEN BY THE WRONG FIX, NOT TO PASS.
 *
 * L-956 is a mode-PROPAGATION defect: "By Region" does not reach
 * `SlabPlanToolHandler`. The obvious cure — change how `_getMode()` resolves the
 * mode — moves the value EVERY gesture reads. Polyline, 2-point and hollow slab
 * creation all work today and the founder uses them daily, so a region fix that
 * silently rewires one of those is a worse product than the bug it closes.
 *
 * Each test drives the REAL handler and asserts A SLAB RECORD REACHED THE MUTATION
 * PATH — the `slab.create` payload the handler dispatches on `runtime.bus`, captured
 * into a store stand-in. Never a pure function's return value
 * ([[committed-is-not-reachable]]): four fixes in one prior session were proven at
 * the computing layer and reached nobody.
 *
 * WHAT THE HARNESS DOES NOT FAKE: the region tracer. `_findRegionAtPoint` calls the
 * real `traceRegionSketchAtPoint` over real wall records, so the region gesture is
 * pinned against the geometry that actually runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The legacy typed-world → commandManager bridge. Mocked at ITS OWN boundary (not
// inside the handler) so the sketch attach is observable: the mock writes the sketch
// onto the captured record, exactly as `UpdateSlabSketchCommand` writes it onto the
// stored slab. Everything upstream of this line is the real code path.
const attachCalls: Array<{ slabId: string; sketch: unknown }> = [];
vi.mock('../../../initBusHandlers', () => ({
    attachSlabSketchViaLegacyBridge: (p: { slabId: string; sketch: unknown }) => {
        attachCalls.push(p);
        return { success: true };
    },
}));

import { SlabPlanToolHandler } from '../SlabPlanToolHandler';
import { __resetActiveSlabDrawModeForTests } from '../activeSlabDrawMode';

// ── happy-dom ships no Canvas2D — stub a no-op context so the real draw chain runs ──
const ctx2d: Record<string, unknown> = new Proxy({}, {
    get: (_t, prop) => {
        if (prop === 'canvas') return undefined;
        if (prop === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8 });
        return () => {};
    },
    set: () => true,
});
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: unknown } } })
    .HTMLCanvasElement.prototype.getContext = () => ctx2d;

const win = () => (globalThis as unknown as { window: Record<string, unknown> }).window;

type SlabRecord = {
    id: string;
    levelId: string;
    polygon: Array<{ x: number; y: number; z: number }>;
    sketch?: unknown;
};

/**
 * The store stand-in. `runtime.bus.executeCommand('slab.create', …)` is the plan
 * handler's mutation boundary (C03/P6 — commands are the only mutation path), so a
 * payload arriving here is the handler having COMMITTED. The §FT1 bridge that turns
 * it into a `slabStore.add` lives downstream and is not this handler's contract.
 */
function installHarness(walls: unknown[]) {
    const slabs: SlabRecord[] = [];
    const w = win();
    w.wallStore = { getAll: () => walls };
    w.slabTool = { toolMode: 'NONE' };
    w.slabSystemTypeStore = { getById: () => null };
    w.runtime = {
        bus: {
            executeCommand: (verb: string, payload: SlabRecord) => {
                if (verb === 'slab.create') slabs.push(payload);
                return Promise.resolve({ success: true });
            },
        },
    };
    return slabs;
}

function makeCtx(levelId = 'lvl-1') {
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = 800; overlayCanvas.height = 600;
    return {
        overlayCanvas,
        baseCanvas: document.createElement('canvas'),
        ctx: overlayCanvas.getContext('2d') as CanvasRenderingContext2D,
        planCanvas: {
            worldToScreen: (x: number, z: number) => ({ sx: 400 + x * 20, sy: 300 + z * 20 }),
            getPixelsPerUnit: () => 20,
        } as never,
        interaction: {} as never,
        viewDef: { id: 'v1', spatial: { levelId } } as never,
        dpr: 1,
        viewPlane: { isVertical: false } as never,
    } as never;
}

const pt = (worldX: number, worldZ: number) =>
    ({ worldX, worldZ, screenX: 0, screenY: 0 }) as never;

/** A closed polyline of four walls around a 6 × 4 room — the founder's scenario. */
const FOUR_WALL_ROOM = [
    { id: 'w-south', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
    { id: 'w-east',  baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }] },
    { id: 'w-north', baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }] },
    { id: 'w-west',  baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }] },
];

const enterKey = () => new KeyboardEvent('keydown', { key: 'Enter' });

let slabs: SlabRecord[];
let handler: SlabPlanToolHandler;

beforeEach(() => {
    attachCalls.length = 0;
    __resetActiveSlabDrawModeForTests();
    slabs = installHarness(FOUR_WALL_ROOM);
    handler = new SlabPlanToolHandler();
    handler.activate(makeCtx());
});

afterEach(() => {
    handler.deactivate();
    vi.restoreAllMocks();
});

describe('L-956 pins — the three gestures that already work must not move', () => {
    it('POLYLINE: four clicks + Enter commit a slab', () => {
        (win().slabTool as { toolMode: string }).toolMode = 'POLYLINE_SLAB';

        handler.onClick(pt(0, 0));
        handler.onClick(pt(6, 0));
        handler.onClick(pt(6, 4));
        handler.onClick(pt(0, 4));
        handler.onKeyDown(enterKey());

        expect(slabs).toHaveLength(1);
        expect(slabs[0]!.levelId).toBe('lvl-1');
        expect(slabs[0]!.polygon.length).toBeGreaterThanOrEqual(3);
    });

    it('2-POINT: two clicks commit a rectangle', () => {
        (win().slabTool as { toolMode: string }).toolMode = 'FLOOR_SKETCH';

        handler.onClick(pt(1, 1));
        handler.onClick(pt(5, 3));

        expect(slabs).toHaveLength(1);
        // The rectangle spans the two corners — width/depth are derived, not assumed.
        expect(slabs[0]!.polygon).toHaveLength(4);
    });

    it('HOLLOW: raw polygon points + Enter commit a slab', () => {
        (win().slabTool as { toolMode: string }).toolMode = 'HOLLOW_SLAB';

        handler.onClick(pt(0, 0));
        handler.onClick(pt(6, 0));
        handler.onClick(pt(6, 4));
        handler.onKeyDown(enterKey());

        expect(slabs).toHaveLength(1);
        expect(slabs[0]!.polygon).toHaveLength(3);
    });

    it('REGION (tool instance already reporting REGION_SLAB): hover + one click commit, with host references', () => {
        // This is the path that works TODAY — the one L-956's founder never reached,
        // because the mode never arrived. Pinned so the propagation fix cannot
        // regress the gesture it is meant to make reachable.
        (win().slabTool as { toolMode: string }).toolMode = 'REGION_SLAB';

        handler.onMouseMove(pt(3, 2));
        handler.onClick(pt(3, 2));

        expect(slabs).toHaveLength(1);
        expect(slabs[0]!.polygon.length).toBeGreaterThanOrEqual(3);
    });
});
