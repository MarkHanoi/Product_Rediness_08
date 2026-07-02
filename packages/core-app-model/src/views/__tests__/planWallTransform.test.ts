/**
 * @vitest-environment happy-dom
 *
 * §FIX-PLAN-WALL-TRANSFORM (founder L-43) — plan-view wall MOVE + ROTATE both commit.
 *
 * The 2D plan view is a Canvas2D surface; the 3D TransformControls gizmo that the
 * selection path attaches is not interactive there, so wall move/rotate in plan is
 * owned entirely by `PlanElementDragController`. This suite pins the DECISION that a
 * real plan drag dispatches the SAME `UpdateWallBaselineCommand` the 3D endpoint
 * controller uses (P6 — one mutation path), for BOTH gestures:
 *
 *   • body drag       → MOVE  (translate both endpoints by the grid-snapped delta)
 *   • endpoint drag   → ROTATE/stretch (swing baseLine[endpoint] about the other end)
 *
 * A commit that is a no-op (never dispatched, or dispatched with the pre-drag
 * baseline) would reproduce the founder-reported "dragging has NO effect" bug — so
 * the assertions check both that a command fired and that it carries the moved line.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandType } from '@pryzm/command-registry';
import { PlanElementDragController } from '../PlanElementDragController';

type Pt = { x: number; y: number; z: number };

// Screen mapping: 50 px per metre, origin at (100,100). Inverse used by screenToWorld.
const PX_PER_M = 50;
const OX = 100;
const OY = 100;

function makeFakePlanCanvas() {
    return {
        hitTest: (_sx: number, _sy: number, _t?: number): string | null => 'wall-1',
        worldToScreen: (x: number, z: number) => ({ sx: OX + x * PX_PER_M, sy: OY + z * PX_PER_M }),
        screenToWorld: (sx: number, sy: number) => ({ worldX: (sx - OX) / PX_PER_M, worldZ: (sy - OY) / PX_PER_M }),
    };
}

function makeWall(): { id: string; levelId: string; baseLine: [Pt, Pt]; _renderVersion: number } {
    return {
        id: 'wall-1',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        _renderVersion: 0,
    };
}

function installWallStore(wall: ReturnType<typeof makeWall>) {
    const update = vi.fn((_id: string, patch: Partial<{ baseLine: [Pt, Pt] }>) => {
        if (patch.baseLine) wall.baseLine = patch.baseLine;
    });
    const ws = {
        getById: (id: string) => (id === wall.id ? wall : undefined),
        getDoor: (_id: string) => undefined,
        getWindow: (_id: string) => undefined,
        getAll: () => [wall],
        update,
    };
    (window as unknown as { wallStore?: unknown }).wallStore = ws;
    return { ws, update };
}

/** Grab the last UpdateWallBaselineCommand dispatched through window.commandManager. */
function installCommandManager() {
    const execute = vi.fn();
    (window as unknown as { commandManager?: unknown }).commandManager = { execute };
    return execute;
}

function makeDomCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    document.body.appendChild(c);
    return c;
}

function baselineOf(cmd: unknown): [Pt, Pt] {
    // serialize() exposes the immutable newBaseLine payload without touching privates.
    return (cmd as { serialize: () => { payload: { newBaseLine: [Pt, Pt] } } }).serialize().payload.newBaseLine;
}

describe('§FIX-PLAN-WALL-TRANSFORM — plan-view wall move + rotate commit UpdateWallBaselineCommand', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => {
        ctrl = new PlanElementDragController();
    });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { commandManager?: unknown }).commandManager;
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('a body drag MOVES the wall — dispatches the baseline command with the drag delta', async () => {
        const wall = makeWall();
        const { update } = installWallStore(wall);
        const execute = installCommandManager();
        const planCanvas = makeFakePlanCanvas() as never;
        const dom = makeDomCanvas();

        // Grab the wall MIDDLE (world (2,0) → screen (200,100)) → whole-wall move.
        const hit = ctrl.hitTestDraggable(200, 100, planCanvas)!;
        expect(hit).toEqual({ elementId: 'wall-1', kind: 'wall' });
        expect(ctrl.startDrag(hit, 200, 100, planCanvas, dom)).toBe(true);

        // Drag +1 m in +X (screen +50 px) → past the activation threshold.
        ctrl.onMove(250, 100);
        expect(ctrl.isActivated).toBe(true);
        // Body move mutates the store live (3D mesh follow + neighbour set-out dims).
        expect(update).toHaveBeenCalled();

        await ctrl.onEnd();

        expect(execute).toHaveBeenCalledTimes(1);
        const cmd = execute.mock.calls[0][0];
        expect(cmd.type).toBe(CommandType.UPDATE_WALL_BASELINE);
        expect(cmd.targetIds).toEqual(['wall-1']);
        const bl = baselineOf(cmd);
        expect(bl[0].x).toBeCloseTo(1, 6);
        expect(bl[1].x).toBeCloseTo(5, 6);
        expect(bl[0].z).toBeCloseTo(0, 6);
        expect(bl[1].z).toBeCloseTo(0, 6);
    });

    it('an endpoint drag ROTATES the wall — dispatches the baseline command with one end swung', async () => {
        const wall = makeWall();
        const { update } = installWallStore(wall);
        const execute = installCommandManager();
        const planCanvas = makeFakePlanCanvas() as never;
        const dom = makeDomCanvas();

        // Grab endpoint B (world (4,0) → screen (300,100)) → endpoint rotate/stretch.
        const hit = ctrl.hitTestDraggable(300, 100, planCanvas)!;
        expect(ctrl.startDrag(hit, 300, 100, planCanvas, dom)).toBe(true);

        // Swing B to world (4,2) → screen (300,200): rotates the wall about A=(0,0).
        ctrl.onMove(300, 200);
        expect(ctrl.isActivated).toBe(true);
        // Endpoint rotate is VISUAL-ONLY during the drag — no live store mutation
        // (a >90° swing would otherwise throw BaselineReversalError mid-move).
        expect(update).not.toHaveBeenCalled();

        await ctrl.onEnd();

        expect(execute).toHaveBeenCalledTimes(1);
        const cmd = execute.mock.calls[0][0];
        expect(cmd.type).toBe(CommandType.UPDATE_WALL_BASELINE);
        const bl = baselineOf(cmd);
        // Pivot end A unchanged; end B swung from (4,0) to (4,2) — a genuine rotation,
        // not the pre-drag baseline (which would be the "no effect" bug).
        expect(bl[0].x).toBeCloseTo(0, 6);
        expect(bl[0].z).toBeCloseTo(0, 6);
        expect(bl[1].x).toBeCloseTo(4, 6);
        expect(bl[1].z).toBeCloseTo(2, 6);
    });
});
