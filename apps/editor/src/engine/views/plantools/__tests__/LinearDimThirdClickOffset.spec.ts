// @vitest-environment happy-dom
//
// §FIX-DIM-3RD-CLICK-OFFSET-PLACEMENT (L-176) — the 3rd click of the manual linear
// dimension tool sets the placement standoff.
//
// Regression guard: the perpendicular distance of the 3rd click from the A–B
// measurement line MUST become the committed annotation's `geometry2D.offset`
// (WORLD metres, L-155) — the exact standoff the live preview renders — so the
// placed dimension lands where the preview showed it, with NO post-create drag.
// Previously the committed line diverged from the preview, forcing the founder to
// drag the dim afterwards.
//
// The heavy `@pryzm/plugin-annotations` barrel (THREE/DOM at load) is mocked to the
// exact exports the handler uses, with a REAL pass-through `makeAnnotationElement`
// so `geometry2D.offset` flows verbatim into the captured CreateAnnotationCommand.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pryzm/schemas', () => ({
    createId: (prefix: string) => `${prefix}_TEST`,
}));

vi.mock('@pryzm/plugin-annotations', () => {
    class CreateAnnotationCommand {
        constructor(public annotation: any) {}
    }
    class LinearDimOptionsBar {
        unit = 'mm';
        preferredFaceType = 'face:exterior';
        show() {}
        hide() {}
        cycleFaceType() {}
    }
    return {
        CreateAnnotationCommand,
        LinearDimOptionsBar,
        makeAnnotationElement: (
            id: string,
            kind: string,
            viewId: string,
            references: any[],
            geometry2D: any,
            parameters: any,
        ) => ({ id, type: kind, ownerViewId: viewId, references, geometry2D, parameters }),
        makePointRef: (v: { x: number; z: number }) => ({ kind: 'point', x: v.x, z: v.z }),
        makeWallFaceRef: (wallId: string, faceType: string, param: number) => ({
            kind: 'wallface', wallId, faceType, param,
        }),
        // Returns the hit point AS the face point (on the wall face) with the
        // chosen wall's id — enough to drive _findNearestWallHit + the parallel
        // constraint projection without the real geometry kernel.
        detectWallFace: (hitPt: { x: number; z: number }, wall: { id: string }) => ({
            wallId: wall.id,
            faceType: 'face:exterior',
            param: 0.5,
            facePoint: { x: hitPt.x, y: 0, z: hitPt.z },
            faceNormal: { x: 1, y: 0, z: 0 },
        }),
        wallFaceSignedOffset: () => 0.1,
        computeWallCoreOffsets: () => ({ exteriorFinish: 0, interiorFinish: 0 }),
        formatDimension: (d: number) => `${d}`,
    };
});

import { LinearDimPlanToolHandler } from '../LinearDimPlanToolHandler';

// ── Canvas / plan-view stubs (draw calls are no-ops in the test) ───────────────
function makeCanvasCtx() {
    return {
        setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
        setLineDash: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
        stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        fillRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 10 }),
        strokeStyle: '', lineWidth: 0, fillStyle: '', font: '', textAlign: '', textBaseline: '',
    };
}

function makeCtx(walls: any[]) {
    return {
        overlayCanvas: { width: 800, height: 600 },
        baseCanvas: { width: 800, height: 600 },
        ctx: makeCanvasCtx(),
        planCanvas: {
            worldToScreen: (x: number, z: number) => ({ sx: x * 100, sy: z * 100 }),
            getPixelsPerUnit: () => 100,
        },
        dpr: 1,
        viewDef: { id: 'view-1', spatial: { levelId: 'level-1' } },
        wallStore: {
            getAll: () => walls,
            getById: (id: string) => walls.find(w => w.id === id),
        },
    } as any;
}

function capture() {
    let annotation: any = null;
    (window as any).commandManager = { execute: (cmd: any) => { annotation = cmd.annotation; } };
    return () => annotation;
}

// Feed a full A → B → offset gesture: two picks then a mousemove + click to place.
function placeDim(
    h: LinearDimPlanToolHandler,
    a: { worldX: number; worldZ: number },
    b: { worldX: number; worldZ: number },
    third: { worldX: number; worldZ: number },
) {
    h.onMouseMove(a as any); h.onClick(a as any);          // ref A
    h.onMouseMove(b as any); h.onClick(b as any);          // ref B → DEFINE_OFFSET
    h.onMouseMove(third as any);                            // live offset (preview)
    h.onClick(third as any);                                // commit at the 3rd click
}

describe('§FIX-DIM-3RD-CLICK-OFFSET-PLACEMENT (L-176)', () => {
    beforeEach(() => { (window as any).commandManager = undefined; (window as any).wallStore = undefined; });

    it('point-ref dim: committed offset = perpendicular distance of the 3rd click', () => {
        const getAnn = capture();
        const h = new LinearDimPlanToolHandler();
        h.activate(makeCtx([]));                            // no walls → free point refs

        // A→B along +X (line z=0). Normal is (0,1); a click at z=3 is 3 m off the line.
        placeDim(h, { worldX: 0, worldZ: 0 }, { worldX: 4, worldZ: 0 }, { worldX: 2, worldZ: 3 });

        const ann = getAnn();
        expect(ann).toBeTruthy();
        expect(ann.type).toBe('linear-dim');
        expect(ann.geometry2D.offset).toBeCloseTo(3, 6);   // world metres, NOT a default
        expect(ann.geometry2D.modelPoints).toEqual([
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
        ]);
    });

    it('offset tracks the click, not a fixed default (two clicks → two offsets)', () => {
        const h = new LinearDimPlanToolHandler();

        const getA = capture();
        h.activate(makeCtx([]));
        placeDim(h, { worldX: 0, worldZ: 0 }, { worldX: 4, worldZ: 0 }, { worldX: 2, worldZ: 1.25 });
        expect(getA().geometry2D.offset).toBeCloseTo(1.25, 6);

        const getB = capture();
        h.activate(makeCtx([]));
        placeDim(h, { worldX: 0, worldZ: 0 }, { worldX: 4, worldZ: 0 }, { worldX: 2, worldZ: -2.5 });
        expect(getB().geometry2D.offset).toBeCloseTo(-2.5, 6);
    });

    it('parallel-wall dim: offset measured from the resolved (perpendicular) line matches preview', () => {
        const wallA = { id: 'wallA', levelId: 'level-1', thickness: 0.2, layers: [], height: 3,
            baseLine: [{ x: 0, z: 0 }, { x: 0, z: 10 }] };
        const wallB = { id: 'wallB', levelId: 'level-1', thickness: 0.2, layers: [], height: 3,
            baseLine: [{ x: 5, z: 0 }, { x: 5, z: 10 }] };

        const getAnn = capture();
        const h = new LinearDimPlanToolHandler();
        h.activate(makeCtx([wallA, wallB]));

        // Click near each parallel wall at DIFFERENT z (2 vs 8). The constraint
        // projects onto the baselines → resolved line (0,2)→(5,8).
        // Choose the 3rd click as measureA + n * 2 so the standoff is exactly 2 m.
        const mA = { x: 0, z: 2 }, mB = { x: 5, z: 8 };
        const dx = mB.x - mA.x, dz = mB.z - mA.z;
        const len = Math.hypot(dx, dz);
        const nx = -dz / len, nz = dx / len;
        const third = { worldX: mA.x + nx * 2, worldZ: mA.z + nz * 2 };

        placeDim(h, { worldX: 0.1, worldZ: 2 }, { worldX: 4.9, worldZ: 8 }, third);

        const ann = getAnn();
        expect(ann).toBeTruthy();
        // Committed modelPoints are the resolved (baseline-projected) A–B line…
        expect(ann.geometry2D.modelPoints[0].x).toBeCloseTo(0, 6);
        expect(ann.geometry2D.modelPoints[0].z).toBeCloseTo(2, 6);
        expect(ann.geometry2D.modelPoints[1].x).toBeCloseTo(5, 6);
        expect(ann.geometry2D.modelPoints[1].z).toBeCloseTo(8, 6);
        // …and the standoff equals the 3rd-click distance from THAT line.
        expect(ann.geometry2D.offset).toBeCloseTo(2, 6);
    });
});
