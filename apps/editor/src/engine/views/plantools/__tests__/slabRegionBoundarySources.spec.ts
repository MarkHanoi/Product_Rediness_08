/**
 * §FIX-REGION-BOUNDARY-SOURCES — "what encloses this point?" is not "which WALLS enclose it".
 *
 * L-959's refusal did its job and named its inputs:
 *
 *     region click REFUSED — No enclosed region at this point. The walls around
 *     (6.90, -88.73) do not close a loop — 13 wall(s) on this level were searched.
 *
 * ⚠ FIRST, THE REFUTATION. The hover path was NOT searching a wider edge set than the
 * click path. Both call the SAME `_findRegionAtPoint`, which read `wallStore` and
 * nothing else — the two paths never diverged here. And the hover log's `curved=35`
 * free edges are not a parcel boundary: `curvedFallbacks` counts chords of CURVED
 * WALLS, which cannot carry a wall id because `WallFaceResolver` resolves a host edge
 * to one straight segment (`SlabRegionTracer.ts:278-290`). They came from `wallStore`
 * like everything else.
 *
 * THE REAL DEFECT IS THAT BOTH PATHS WERE WALL-ONLY. The garden is bounded OUTSIDE by
 * the parcel boundary — not a wall — so it cannot close, and the refusal was CORRECT
 * against an edge set that was simply too small. ADR-0329's own fixture had to model
 * the parcel AS WALLS to make the annulus reachable; in a real project it is not.
 *
 * These tests drive the three sources through the ONE assembler, at the layer that
 * COMMITS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const attachCalls: Array<{ slabId: string; sketch: { innerLoops?: unknown[] } }> = [];
vi.mock('../../../initBusHandlers', () => ({
    attachSlabSketchViaLegacyBridge: (p: { slabId: string; sketch: { innerLoops?: unknown[] } }) => {
        attachCalls.push(p); return { success: true };
    },
}));

import { SlabPlanToolHandler } from '../SlabPlanToolHandler';
import { __resetActiveSlabDrawModeForTests } from '../activeSlabDrawMode';
import { setActiveSlabFamilyMode, __resetActiveSlabFamilyModeForTests } from '../activeSlabFamilyMode';

const ctx2d: Record<string, unknown> = new Proxy({}, {
    get: (_t, p) => {
        if (p === 'canvas') return undefined;
        if (p === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8 });
        return () => {};
    },
    set: () => true,
});
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: unknown } } })
    .HTMLCanvasElement.prototype.getContext = () => ctx2d;

const win = () => (globalThis as unknown as { window: Record<string, unknown> }).window;

type P2 = { x: number; y: number };
type Toast = { message: string; severity: string };
type SlabRecord = { id: string; polygon: Array<{ x: number; y: number }> };

function installHarness(opts: {
    walls?: unknown[];
    slabs?: unknown[];
    parcel?: Array<{ x: number; z: number }> | null;
}) {
    const slabs: SlabRecord[] = [];
    const toasts: Toast[] = [];
    const w = win();
    w.wallStore = { getAll: () => opts.walls ?? [] };
    w.slabStore = { getAll: () => opts.slabs ?? [] };
    w.slabTool = { toolMode: 'NONE' };
    w.slabSystemTypeStore = { getById: () => null };
    w.runtime = {
        siteModelStore: {
            getParcelBoundary: () => (opts.parcel ? { polygon: opts.parcel } : null),
        },
        events: { emit: (k: string, p: Toast) => { if (k === 'pryzm:toast') toasts.push(p); } },
        bus: {
            executeCommand: (verb: string, payload: SlabRecord) => {
                if (verb === 'slab.create') slabs.push(payload);
                return Promise.resolve({ success: true });
            },
        },
    };
    return { slabs, toasts };
}

function makeCtx() {
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = 800; overlayCanvas.height = 600;
    return {
        overlayCanvas, baseCanvas: document.createElement('canvas'),
        ctx: overlayCanvas.getContext('2d') as CanvasRenderingContext2D,
        planCanvas: {
            worldToScreen: (x: number, z: number) => ({ sx: 400 + x * 2, sy: 300 + z * 2 }),
            getPixelsPerUnit: () => 2,
        } as never,
        interaction: {} as never,
        viewDef: { id: 'v1', spatial: { levelId: 'lvl-1' } } as never,
        dpr: 1, viewPlane: { isVertical: false } as never,
    } as never;
}
const pt = (worldX: number, worldZ: number) => ({ worldX, worldZ, screenX: 0, screenY: 0 }) as never;

function ringAsWalls(ring: P2[], idPrefix: string) {
    return ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        return { id: `${idPrefix}-${i}`, baseLine: [{ x: a.x, z: a.y }, { x: b.x, z: b.y }] };
    });
}
function shoelace(ring: ReadonlyArray<{ x: number; y: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
}

// The founder's site, at his real coordinates — far from origin on purpose.
const OZ = -90;
const PARCEL_RING = [
    { x: 0, z: OZ - 20 }, { x: 40, z: OZ - 20 }, { x: 40, z: OZ + 20 }, { x: 0, z: OZ + 20 },
];
const BUILDING = ringAsWalls(
    [{ x: 10, y: OZ - 10 }, { x: 30, y: OZ - 10 }, { x: 30, y: OZ + 10 }, { x: 10, y: OZ + 10 }],
    'bldg',
);
const GARDEN_CLICK = { x: 5, z: OZ };            // between parcel edge and building
const ROOM = ringAsWalls([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], 'w');

let handler: SlabPlanToolHandler;
beforeEach(() => {
    attachCalls.length = 0;
    __resetActiveSlabDrawModeForTests();
    __resetActiveSlabFamilyModeForTests();
    setActiveSlabFamilyMode('region');
});
afterEach(() => { handler?.deactivate(); vi.restoreAllMocks(); });

describe('the region search sees every boundary source, not only walls', () => {
    it("THE FOUNDER'S GARDEN: parcel boundary outside, building walls inside — the annulus commits", async () => {
        const { slabs, toasts } = installHarness({ walls: BUILDING, parcel: PARCEL_RING });
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(GARDEN_CLICK.x, GARDEN_CLICK.z));

        // BEFORE: refused — the parcel boundary was not in the search at all.
        expect(toasts).toHaveLength(0);
        expect(slabs).toHaveLength(1);

        // Outer ring is the parcel (40 x 40 = 1600)…
        expect(shoelace(slabs[0]!.polygon)).toBeCloseTo(1600, 3);
        // …and the building is the HOLE, so the garden is 1200, not 1600 (ADR-0329).
        await Promise.resolve(); await Promise.resolve();
        expect(attachCalls).toHaveLength(1);
        expect(attachCalls[0]!.sketch.innerLoops ?? []).toHaveLength(1);
    });

    it('A SLAB EDGE bounds a region exactly as a wall does — the terrace case', async () => {
        // A podium slab sitting INSIDE the parcel, with no walls anywhere. The strip
        // between the parcel boundary and the podium edge is a real region a user
        // expects to click inside, and neither of its two boundaries is a wall.
        //
        // ⚠ DELIBERATELY NOT COINCIDENT WITH THE PARCEL. A slab sharing edges with the
        // parcel ring is a DIFFERENT question — overlapping collinear edges — and the
        // planar walk does not split a face on a lone chord. That case is a NAMED GAP
        // recorded in this lane report, not something this test launders into a pass.
        const podium = [{
            id: 'slab-podium',
            position: { x: 0, y: 0, z: 0 },
            // NB local {x, y=Z} + position, per SlabColumnCoupling's canonical conversion.
            polygon: [
                { x: 10, y: OZ - 10 }, { x: 30, y: OZ - 10 },
                { x: 30, y: OZ + 10 }, { x: 10, y: OZ + 10 },
            ],
        }];
        const { slabs, toasts } = installHarness({ walls: [], slabs: podium, parcel: PARCEL_RING });
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(5, OZ));

        expect(toasts).toHaveLength(0);
        expect(slabs).toHaveLength(1);
        expect(shoelace(slabs[0]!.polygon)).toBeCloseTo(1600, 3);   // outer = parcel
        await Promise.resolve(); await Promise.resolve();
        expect(attachCalls[0]!.sketch.innerLoops ?? []).toHaveLength(1); // hole = the podium
    });

    it('A PLAIN WALL-BOUNDED ROOM is unchanged — no parcel, no slabs', () => {
        const { slabs, toasts } = installHarness({ walls: ROOM });
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(3, 2));

        expect(toasts).toHaveLength(0);
        expect(slabs).toHaveLength(1);
        expect(shoelace(slabs[0]!.polygon)).toBeCloseTo(24, 3);
    });

    it('a slab COINCIDENT with its room does not turn the room into a sliver', () => {
        // The realistic regression risk of widening the edge set: a room that already
        // has a slab contributes its outline twice. The click must still yield the
        // room, not a zero-area artefact of the duplicated edges.
        const coincident = [{
            id: 'slab-room',
            position: { x: 0, y: 0, z: 0 },
            polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
        }];
        const { slabs } = installHarness({ walls: ROOM, slabs: coincident });
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(3, 2));

        expect(slabs).toHaveLength(1);
        expect(shoelace(slabs[0]!.polygon)).toBeCloseTo(24, 3);
    });
});

describe('the refusal names every source it searched', () => {
    it('reports walls, slab edges AND whether a parcel boundary was present', () => {
        const { slabs, toasts } = installHarness({ walls: ROOM });
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(5000, 5000));

        expect(slabs).toHaveLength(0);
        expect(toasts).toHaveLength(1);
        const m = toasts[0]!.message;
        expect(m).toContain('4 wall(s)');
        expect(m).toContain('0 slab edge(s)');
        // ⭐ The line that would have saved four founder reports: it says the parcel
        // boundary was not in the search, instead of only that nothing was found.
        expect(m).toContain('parcel boundary ABSENT');
    });

    it('says PRESENT, with a count, when a boundary is loaded', () => {
        const { toasts } = installHarness({ walls: ROOM, parcel: PARCEL_RING });
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(5000, 5000));
        expect(toasts[0]!.message).toContain('parcel boundary present (4 edge(s))');
    });

    it('a parcel store that THROWS is reported ABSENT, never silently searched smaller', () => {
        const { toasts } = installHarness({ walls: ROOM });
        (win().runtime as { siteModelStore: { getParcelBoundary: () => never } }).siteModelStore = {
            getParcelBoundary: () => { throw new Error('site model not loaded'); },
        };
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(5000, 5000));
        expect(toasts[0]!.message).toContain('parcel boundary ABSENT');
    });
});
