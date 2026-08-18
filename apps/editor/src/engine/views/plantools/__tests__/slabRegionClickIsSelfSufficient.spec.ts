/**
 * L-959 — "By Region" RESOLVED the region and still created nothing.
 *
 * L-956 closed the mode propagation: the founder's log now reads
 * `gesture=region constraint=linear` and `§REGION-HOST-ATTRIBUTION region traced: 9
 * host-referenced edge(s) … 31 free edge(s)`. The tracer succeeds — and there is NO
 * `CREATE_SLAB` anywhere in the log.
 *
 * MEASURED CAUSE (probe, before any fix):
 *     PROBE-A afterHover=SET  afterChurn=null  slabs=0
 * `onMouseMove` set `_candidateRegion`; one activate/deactivate cycle nulled it; the
 * click then saw `null` and built nothing.
 *
 * ⭐ THAT CYCLE IS L-956'S OWN CHURN, ONE LAYER UP. `deactivateAllInternal()` runs at
 * the head of every `activateTool` call. L-956 moved the GESTURE into a
 * surface-independent store so it survives; `_candidateRegion` never got the same
 * treatment. FIXING THE MODE MOVED THE VICTIM, NOT THE CHURN — which is the
 * generalisable half: ANY per-instance state a plan handler carries across a
 * hover→click gesture is exposed to it.
 *
 * ⚠ THE CURVED THEORY IS REFUTED, and these tests keep it refuted:
 *     PROBE-B candidateLen=60  slabs=1
 * A region whose outer boundary is curved (31 curved free edges in the founder's
 * report) commits perfectly well WITHOUT the churn. `curved=31` was a red herring;
 * neither `_commitSlab` nor the sketch path rejects curved free edges.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const attachCalls: Array<{ slabId: string; sketch: unknown }> = [];
vi.mock('../../../initBusHandlers', () => ({
    attachSlabSketchViaLegacyBridge: (p: { slabId: string; sketch: unknown }) => {
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

function installHarness(walls: unknown[]) {
    const slabs: SlabRecord[] = [];
    const toasts: Toast[] = [];
    const w = win();
    w.wallStore = { getAll: () => walls };
    w.slabTool = { toolMode: 'NONE' };
    w.slabSystemTypeStore = { getById: () => null };
    w.runtime = {
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

/** Two disjoint rooms, so "the region at the click point" is a distinguishable answer. */
const ROOM_A = ringAsWalls([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], 'a');
const ROOM_B = ringAsWalls([{ x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 20, y: 20 }], 'b');

/** The founder's shape: a CURVED outer boundary enclosing a straight building. */
const CURVED_PARCEL = [
    { id: 'p-0', baseLine: [{ x: 0, z: 0 }, { x: 40, z: 0 }], curve: { control: { x: 20, z: -8 }, segments: 16 } },
    { id: 'p-1', baseLine: [{ x: 40, z: 0 }, { x: 40, z: 40 }] },
    { id: 'p-2', baseLine: [{ x: 40, z: 40 }, { x: 0, z: 40 }], curve: { control: { x: 20, z: 48 }, segments: 16 } },
    { id: 'p-3', baseLine: [{ x: 0, z: 40 }, { x: 0, z: 0 }] },
];
const BUILDING = ringAsWalls([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], 'bldg');

let handler: SlabPlanToolHandler;
beforeEach(() => {
    attachCalls.length = 0;
    __resetActiveSlabDrawModeForTests();
    __resetActiveSlabFamilyModeForTests();
    setActiveSlabFamilyMode('region');
});
afterEach(() => { handler?.deactivate(); vi.restoreAllMocks(); });

describe('L-959 — the region CLICK resolves its own region', () => {
    it('THE FOUNDER CLICK: hover, then an activate/deactivate cycle, then click — still commits', () => {
        const { slabs } = installHarness(ROOM_A);
        handler = new SlabPlanToolHandler();

        handler.activate(makeCtx());
        handler.onMouseMove(pt(3, 2));      // hover traces the region
        handler.deactivate();               // the churn that wiped it
        handler.activate(makeCtx());
        handler.onClick(pt(3, 2));

        // BEFORE THE FIX: 0 — `_candidateRegion` was null and the `if` did nothing.
        expect(slabs).toHaveLength(1);
        expect(shoelace(slabs[0]!.polygon)).toBeCloseTo(24, 3);
    });

    it('a click with NO PRIOR HOVER AT ALL commits — the gesture no longer depends on hover state', () => {
        const { slabs } = installHarness(ROOM_A);
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(3, 2));          // no onMouseMove, ever
        expect(slabs).toHaveLength(1);
    });

    it('the slab is the region under the CLICK, not the region under the last hover', () => {
        // Before this fix the committed ring came from whatever the cursor last
        // hovered, so a cursor that moved between hover and click built the wrong
        // room. Re-tracing at the click point makes ring and sketch one trace.
        const { slabs } = installHarness([...ROOM_A, ...ROOM_B]);
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onMouseMove(pt(3, 2));      // hover room A (6 x 4 = 24 m2)
        handler.onClick(pt(30, 10));        // click room B (20 x 20 = 400 m2)

        expect(slabs).toHaveLength(1);
        expect(shoelace(slabs[0]!.polygon)).toBeCloseTo(400, 3);
    });

    it('CURVED free edges still commit — the curved=31 theory stays refuted', () => {
        const { slabs } = installHarness([...CURVED_PARCEL, ...BUILDING]);
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(5, 20));         // the garden, bounded by curved parcel edges
        expect(slabs).toHaveLength(1);
        expect(slabs[0]!.polygon.length).toBeGreaterThan(3);
    });
});

describe('L-959 — a region click that cannot resolve MUST say so', () => {
    it('REFUSES OUT LOUD, on the toast channel, naming what was measured', () => {
        const { slabs, toasts } = installHarness(ROOM_A);
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(500, 500));      // nowhere near any wall

        expect(slabs).toHaveLength(0);      // correctly builds nothing…
        expect(toasts).toHaveLength(1);     // …and correctly SAYS SO.
        expect(toasts[0]!.severity).toBe('warning');
        // The refusal carries the measurement, per WallRake's rule — not a bare
        // "failed", and not the old line's misattribution.
        expect(toasts[0]!.message).toContain('500.00');
        expect(toasts[0]!.message).toContain('4 wall(s)');
        expect(toasts[0]!.message).toMatch(/Polyline/);
    });

    it('the refusal is retired by moving somewhere that DOES resolve', () => {
        const { toasts } = installHarness(ROOM_A);
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(500, 500));
        expect(toasts).toHaveLength(1);
        expect((handler as unknown as { _refusalHint: string | null })._refusalHint).not.toBeNull();

        handler.onMouseMove(pt(3, 2));      // back over a real region
        expect((handler as unknown as { _refusalHint: string | null })._refusalHint).toBeNull();
    });

    it('a SUCCESSFUL region click emits no refusal', () => {
        const { slabs, toasts } = installHarness(ROOM_A);
        handler = new SlabPlanToolHandler();
        handler.activate(makeCtx());
        handler.onClick(pt(3, 2));
        expect(slabs).toHaveLength(1);
        expect(toasts).toHaveLength(0);
    });
});
