// @vitest-environment happy-dom
//
// §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) + §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — the engine
// bridge that turns the calibrated site-plan raster into a plan-canvas underlay.
//
// Proves the load-bearing facts the founder's "Finish → nothing" bug hinged on:
//   • the underlay MESH is created via FloorPlanUnderlayTool (this is what actually renders —
//     it does NOT depend on the CREATE_UNDERLAY command succeeding);
//   • it is placed at the calibrated size + project-frame centre + AXIS-ALIGNED (rotationZ 0);
//   • CREATE_UNDERLAY is dispatched through the bus (P6, undoable);
//   • a bus failure (CommandBusError) does NOT abort the underlay — the mesh still exists;
//   • a not-ready scene degrades to false (never throws into the "enter canvas" flow).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks (hoisted so the vi.mock factories can reference them) ─────────────────
const h = vi.hoisted(() => {
    const createSpy = vi.fn(async () => { /* async texture load */ });
    const disposeSpy = vi.fn();
    const meshState = {
        mesh: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            updateMatrixWorld: () => {},
        },
    };
    class FakeUnderlayTool {
        create = createSpy;
        getState() { return meshState; }
        dispose = disposeSpy;
        constructor(_s: unknown, _c: unknown, _d: unknown) {
            if (typeof window !== 'undefined') (window as unknown as { floorPlanUnderlayTool?: unknown }).floorPlanUnderlayTool = this;
        }
    }
    class FakeCreateUnderlayCommand {
        type = 'CREATE_UNDERLAY';
        constructor(public input: unknown) {}
        execute() { return { success: true }; }
    }
    return { createSpy, disposeSpy, meshState, FakeUnderlayTool, FakeCreateUnderlayCommand };
});
vi.mock('@pryzm/input-host', () => ({ FloorPlanUnderlayTool: h.FakeUnderlayTool }));
vi.mock('@pryzm/command-registry', () => ({ CreateUnderlayCommand: h.FakeCreateUnderlayCommand }));

const { createSpy, disposeSpy, meshState } = h;

import { createPlanCanvasUnderlayFromSiteOverlay } from '../src/engine/createSiteOverlayUnderlay';

const INPUT = {
    dataUrl: 'data:image/png;base64,AAAA',
    widthPx: 1200,
    heightPx: 900,
    pxPerMeter: 50,          // 1/0.02
    positionEast: 5.83,
    positionNorth: -0.1,
    rotationZ: 0,            // axis-aligned / project north
    fileName: 'survey.pdf',
};

let execSpy: ReturnType<typeof vi.fn>;
let emitSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    createSpy.mockClear(); disposeSpy.mockClear();
    meshState.mesh.position = { x: 0, y: 0, z: 0 };
    meshState.mesh.rotation = { x: 0, y: 0, z: 0 };
    (meshState.mesh as unknown as { userData: Record<string, unknown> }).userData = {};
    execSpy = vi.fn(async () => {});
    emitSpy = vi.fn();
    const w = window as unknown as Record<string, unknown>;
    w['scene'] = {};
    w['camera'] = {};
    w['renderer'] = { domElement: document.createElement('canvas') };
    w['runtime'] = { bus: { executeCommand: execSpy }, events: { emit: emitSpy } };
    w['projectContext'] = { activeLevelId: null };
    w['bimManager'] = undefined;
    delete w['floorPlanUnderlayTool'];
    delete w['__pryzmRemoveUnderlayInternal'];
    delete w['__pryzmRecreateUnderlayInternal'];
});

describe('§FEAT-SITE-OVERLAY-PLAN-UNDERLAY — createPlanCanvasUnderlayFromSiteOverlay', () => {
    it('creates the underlay mesh at the calibrated size, project-frame centre, AXIS-ALIGNED', async () => {
        const ok = await createPlanCanvasUnderlayFromSiteOverlay(INPUT);
        expect(ok).toBe(true);
        // The mesh (what actually renders) was created with the calibration scale + size.
        expect(createSpy).toHaveBeenCalledTimes(1);
        const params = createSpy.mock.calls[0]?.[0] ?? (createSpy.mock.calls as unknown as { instances: unknown[] });
        // create() is called with `this` bound; assert via the recorded call arg.
        const arg = (createSpy.mock.calls[0] as unknown as unknown[])[0] as { blobUrl: string; pxPerMeter: number; widthPx: number; heightPx: number };
        expect(arg.blobUrl).toBe(INPUT.dataUrl);
        expect(arg.pxPerMeter).toBe(50);
        expect(arg.widthPx).toBe(1200);
        expect(arg.heightPx).toBe(900);
        void params;
        // Placed at project-frame centre (world Z = −North) + AXIS-ALIGNED (rotation 0).
        expect(meshState.mesh.position.x).toBeCloseTo(5.83, 6);
        expect(meshState.mesh.position.z).toBeCloseTo(0.1, 6); // −(−0.1)
        expect(meshState.mesh.rotation.z).toBe(0);
    });

    it('dispatches CREATE_UNDERLAY through the bus (P6, undoable)', async () => {
        await createPlanCanvasUnderlayFromSiteOverlay(INPUT);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(execSpy.mock.calls[0][0]).toBe('CREATE_UNDERLAY');
    });

    it('§L-88: emits pryzm-floor-plan-underlay-placed (registers in Import Manager + triggers persistence)', async () => {
        await createPlanCanvasUnderlayFromSiteOverlay(INPUT);
        const placed = emitSpy.mock.calls.find((c) => c[0] === 'pryzm-floor-plan-underlay-placed');
        expect(placed).toBeTruthy();
        expect(placed![1].fileName).toBe('survey.pdf'); // labels the Import Manager row + persistence
        // The file name is also stamped on the mesh (so UnderlayPersistence.captureCurrentState reads it).
        expect((meshState.mesh as unknown as { userData: { fileName?: string } }).userData.fileName).toBe('survey.pdf');
    });

    it('a CREATE_UNDERLAY bus failure does NOT abort the underlay — the mesh still exists', async () => {
        execSpy = vi.fn(async () => { throw new Error('CommandBusError: no handler'); });
        (window as unknown as Record<string, unknown>)['runtime'] = { bus: { executeCommand: execSpy } };
        const ok = await createPlanCanvasUnderlayFromSiteOverlay(INPUT);
        expect(ok).toBe(true);              // still succeeded — the mesh is what renders
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(meshState.mesh.position.x).toBeCloseTo(5.83, 6);
    });

    it('degrades to false (no throw) when the BIM scene is not ready', async () => {
        (window as unknown as Record<string, unknown>)['renderer'] = undefined;
        const ok = await createPlanCanvasUnderlayFromSiteOverlay(INPUT);
        expect(ok).toBe(false);
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('registers undo/redo hooks so the command is recoverable', async () => {
        await createPlanCanvasUnderlayFromSiteOverlay(INPUT);
        expect(typeof (window as unknown as { __pryzmRemoveUnderlayInternal?: unknown }).__pryzmRemoveUnderlayInternal).toBe('function');
        expect(typeof (window as unknown as { __pryzmRecreateUnderlayInternal?: unknown }).__pryzmRecreateUnderlayInternal).toBe('function');
    });
});
