/**
 * L-956 — "By Region" slab does nothing.
 *
 * THE FOUNDER'S STATE, REPRODUCED EXACTLY. The user picks By Region, the HUD prompts
 * *"By Region Slab: Click an enclosed region"*, they click the garden between the
 * parcel boundary and the building, and no slab appears. Their console shows the two
 * mode sources disagreeing in consecutive lines:
 *
 *     [SlabTool] §SLAB-3D-PREVIEW pointermove tool=REGION_SLAB …
 *     [SlabPlanToolHandler] vertex (mode=linear) …
 *
 * MECHANISM (verified, `file:line` in `activeSlabFamilyMode.ts`'s header): the plan
 * handler read the gesture off the 3D tool INSTANCE and mapped `'NONE'` — the state
 * `ToolManager.deactivateAllInternal()` drives `SlabTool` into at the head of EVERY
 * `activateTool` call — onto `'polyline'`. `SlabTool.exitSketchMode()` does not remove
 * the HUD, so the prompt keeps saying By Region while the click lays a polyline vertex.
 *
 * ⚠ EVERY ASSERTION HERE IS "A SLAB RECORD REACHED THE MUTATION PATH", never a pure
 * function's return value. `traceRegionSketchAtPoint` already returns the correct
 * annulus — that was proven at the computing layer by ADR-0329 and the founder still
 * got nothing, because the DECIDING layer never asked it the question.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const attachCalls: Array<{ slabId: string; sketch: SketchLike }> = [];
vi.mock('../../../initBusHandlers', () => ({
    attachSlabSketchViaLegacyBridge: (p: { slabId: string; sketch: SketchLike }) => {
        attachCalls.push(p);
        return { success: true };
    },
}));

import { SlabPlanToolHandler } from '../SlabPlanToolHandler';
import { __resetActiveSlabDrawModeForTests, setActiveSlabDrawMode, resolveActiveSlabDrawMode } from '../activeSlabDrawMode';
import {
    setActiveSlabFamilyMode,
    resolveActiveSlabFamilyMode,
    resolveSlabReentryMode,
    toSlabFamilyMode,
    __resetActiveSlabFamilyModeForTests,
    type SlabFamilyMode,
} from '../activeSlabFamilyMode';

type SketchLike = { outerLoop: { edges: unknown[] }; innerLoops?: Array<{ edges: SketchEdgeLike[] }> };
type SketchEdgeLike =
    | { type: 'hostReference'; hostId: string; fallback?: { start: P2; end: P2 } }
    | { type: 'freeLine'; start: P2; end: P2 };
type P2 = { x: number; y: number };

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

type SlabRecord = { id: string; levelId: string; polygon: Array<{ x: number; y: number }>; sketch?: SketchLike };

function installHarness(walls: unknown[]) {
    const slabs: SlabRecord[] = [];
    const w = win();
    w.wallStore = { getAll: () => walls };
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
            worldToScreen: (x: number, z: number) => ({ sx: 400 + x * 2, sy: 300 + z * 2 }),
            getPixelsPerUnit: () => 2,
        } as never,
        interaction: {} as never,
        viewDef: { id: 'v1', spatial: { levelId } } as never,
        dpr: 1,
        viewPlane: { isVertical: false } as never,
    } as never;
}

const pt = (worldX: number, worldZ: number) => ({ worldX, worldZ, screenX: 0, screenY: 0 }) as never;

/** Turn a closed ring into the wall records `wallStore.getAll()` actually yields. */
function ringAsWalls(ring: P2[], idPrefix: string) {
    return ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        return { id: `${idPrefix}-${i}`, baseLine: [{ x: a.x, z: a.y }, { x: b.x, z: b.y }] };
    });
}

// ADR-0329's fixture verbatim: a 40 × 40 m parcel with a 20 × 20 m building centred
// inside it. The garden between them is 1200 m², NOT the parcel's 1600.
const PARCEL: P2[]   = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
const BUILDING: P2[] = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }];
const BUILDING_CENTRE: P2 = { x: 20, y: 20 };
const GARDEN_CLICK: P2 = { x: 5, y: 20 };
const PARCEL_AND_BUILDING = [...ringAsWalls(PARCEL, 'parcel'), ...ringAsWalls(BUILDING, 'bldg')];

const ROOM_WALLS = ringAsWalls([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], 'w');

function shoelace(ring: ReadonlyArray<P2>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
}

function pointInPolygon(p: P2, ring: ReadonlyArray<P2>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        if ((a.y > p.y) !== (b.y > p.y) &&
            p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

/** The hole ring, as the geometry producer resolves it: host edges at centre-line. */
function innerRingOf(sketch: SketchLike, index = 0): P2[] {
    const loop = sketch.innerLoops?.[index];
    if (!loop) return [];
    const byId = new Map(PARCEL_AND_BUILDING.map(w => [w.id, w]));
    return loop.edges.map((e) => {
        if (e.type === 'freeLine') return e.start;
        const live = byId.get(e.hostId);
        if (live) return { x: live.baseLine[0]!.x, y: live.baseLine[0]!.z };
        return e.fallback!.start;
    });
}

let handler: SlabPlanToolHandler;

beforeEach(() => {
    attachCalls.length = 0;
    __resetActiveSlabDrawModeForTests();
    __resetActiveSlabFamilyModeForTests();
});

afterEach(() => {
    handler?.deactivate();
    vi.restoreAllMocks();
});

describe('L-956 — the chosen gesture must survive the 3D tool being torn down', () => {
    it("THE FOUNDER'S CLICK: By Region chosen, SlabTool reset to NONE — the click still commits a slab", () => {
        const slabs = installHarness(ROOM_WALLS);
        // The user picked By Region.
        setActiveSlabFamilyMode('region');
        // …and `ToolManager.deactivateAllInternal()` has since run `exitSketchMode()`,
        // which sets `activeTool = 'NONE'` and leaves `#sketch-hud` on screen still
        // prompting "By Region Slab: Click an enclosed region".
        win().slabTool = { toolMode: 'NONE' };

        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onMouseMove(pt(3, 2));
        handler.onClick(pt(3, 2));

        // BEFORE THE FIX this is 0 and the click logged `vertex (mode=linear)`.
        expect(slabs).toHaveLength(1);
        expect(slabs[0]!.polygon.length).toBeGreaterThanOrEqual(3);
    });

    it('the tool singleton not being on window at all is not a vote for polyline either', () => {
        const slabs = installHarness(ROOM_WALLS);
        setActiveSlabFamilyMode('region');
        win().slabTool = undefined;

        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onMouseMove(pt(3, 2));
        handler.onClick(pt(3, 2));

        expect(slabs).toHaveLength(1);
    });

    it('THE GARDEN ANNULUS (ADR-0329) reaches the record: 1200 m², and the building is NOT buried', async () => {
        const slabs = installHarness(PARCEL_AND_BUILDING);
        setActiveSlabFamilyMode('region');
        win().slabTool = { toolMode: 'NONE' };

        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onMouseMove(pt(GARDEN_CLICK.x, GARDEN_CLICK.y));
        handler.onClick(pt(GARDEN_CLICK.x, GARDEN_CLICK.y));

        expect(slabs).toHaveLength(1);

        // The sketch attach rides `slab.create`'s promise (`_commitSlab`'s `.then`),
        // so drain the microtask queue before reading it. Asserting synchronously here
        // would report "no hole" for a purely temporal reason — the exact
        // failure-and-emptiness confusion §CONTEXT-DATA-HONESTY warns about.
        await Promise.resolve(); await Promise.resolve();

        // The OUTER boundary that reached `slab.create` is the parcel.
        const outer = slabs[0]!.polygon.map(p => ({ x: p.x, y: p.y }));
        expect(shoelace(outer)).toBeCloseTo(1600, 3);

        // …and the HOLE reached the record through the sketch, which is what makes the
        // net area 1200 and what lets the hole follow the building's walls. Asserted on
        // the payload the bridge received, not on the tracer's return.
        expect(attachCalls).toHaveLength(1);
        expect(attachCalls[0]!.slabId).toBe(slabs[0]!.id);
        const sketch = attachCalls[0]!.sketch;
        expect(sketch.innerLoops ?? []).toHaveLength(1);

        const hole = innerRingOf(sketch);
        expect(shoelace(hole)).toBeCloseTo(400, 3);
        expect(pointInPolygon(BUILDING_CENTRE, hole)).toBe(true);
        expect(shoelace(outer) - shoelace(hole)).toBeCloseTo(1200, 3);

        // Every hole edge references a BUILDING wall by id — a copied coordinate ring
        // could not follow the building, which is the whole point of ADR-0329 D3.
        const hostIds = (sketch.innerLoops![0]!.edges)
            .filter((e): e is Extract<SketchEdgeLike, { type: 'hostReference' }> => e.type === 'hostReference')
            .map(e => e.hostId);
        expect(hostIds).toHaveLength(4);
        expect(hostIds.every(id => id.startsWith('bldg-'))).toBe(true);
    });

    it('a click INSIDE the building still yields the building, with no holes — ADR-0329 changed nothing there', async () => {
        const slabs = installHarness(PARCEL_AND_BUILDING);
        setActiveSlabFamilyMode('region');
        win().slabTool = { toolMode: 'NONE' };

        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onMouseMove(pt(BUILDING_CENTRE.x, BUILDING_CENTRE.y));
        handler.onClick(pt(BUILDING_CENTRE.x, BUILDING_CENTRE.y));

        expect(slabs).toHaveLength(1);
        await Promise.resolve(); await Promise.resolve();
        expect(shoelace(slabs[0]!.polygon.map(p => ({ x: p.x, y: p.y })))).toBeCloseTo(400, 3);
        expect(attachCalls).toHaveLength(1);
        expect(attachCalls[0]!.sketch.innerLoops ?? []).toHaveLength(0);
    });
});

describe('L-956 — the two "mode" axes are independent and must stay so', () => {
    it('choosing a GESTURE does not disturb the CONSTRAINT, and vice versa', () => {
        setActiveSlabDrawMode('ortho');
        setActiveSlabFamilyMode('region');
        expect(resolveActiveSlabDrawMode()).toBe('ortho');
        expect(resolveActiveSlabFamilyMode()).toBe('region');

        setActiveSlabDrawMode('curved');
        expect(resolveActiveSlabFamilyMode()).toBe('region');
    });

    it('EVERY declared gesture survives a set/resolve round-trip', () => {
        // The regression this exists for: `_getMode()`'s final `return 'polyline'`
        // swallowed 'NONE' and undefined alike, so three of the five gestures could be
        // silently rewritten to polyline. Asserting the FULL set — not only the ones
        // that used to work — is the point (L-692's lesson, restated by L-699).
        for (const m of ['2point', 'polyline', 'region', 'hollow', 'pickWalls'] as SlabFamilyMode[]) {
            setActiveSlabFamilyMode(m);
            expect(resolveActiveSlabFamilyMode(), `gesture "${m}" did not survive`).toBe(m);
        }
    });

    it('a CONSTRAINT passed where a gesture is expected means "polyline", and never erases the gesture', () => {
        expect(toSlabFamilyMode('linear')).toBe('polyline');
        expect(toSlabFamilyMode('ortho')).toBe('polyline');
        expect(toSlabFamilyMode('curved')).toBe('polyline');
        expect(toSlabFamilyMode('sketch')).toBe('2point');
        expect(toSlabFamilyMode('REGION_SLAB')).toBeNull();
        expect(toSlabFamilyMode(undefined)).toBeNull();

        setActiveSlabFamilyMode('region');
        setActiveSlabFamilyMode(42);
        setActiveSlabFamilyMode(undefined);
        expect(resolveActiveSlabFamilyMode()).toBe('region');
    });

    it('re-entering the tool restores the GESTURE last chosen — the promise the bottom bar made', () => {
        // `BottomActionMenu` passed `resolveActiveSlabDrawMode()`, whose type is
        // `linear|ortho|curved`, while its comment claimed "every mode, including
        // 2-Point / By Region / Hollow / Pick Walls, stays reachable". It structurally
        // could not be true: re-entry after By Region gave a polyline slab.
        setActiveSlabFamilyMode('region');
        expect(resolveSlabReentryMode('linear')).toBe('region');

        setActiveSlabFamilyMode('hollow');
        expect(resolveSlabReentryMode('ortho')).toBe('hollow');

        // …and inside the polyline family the CONSTRAINT is what must be restored.
        setActiveSlabFamilyMode('polyline');
        expect(resolveSlabReentryMode('curved')).toBe('curved');
    });
});
