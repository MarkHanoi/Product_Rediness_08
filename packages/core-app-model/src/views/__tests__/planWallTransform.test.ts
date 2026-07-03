/**
 * @vitest-environment happy-dom
 *
 * §FIX-PLAN-WALL-TRANSFORM (founder L-43) — plan-view wall MOVE + ROTATE both commit.
 * §FIX-PLAN-WALL-MOVE-UNDO-UNIFY (L-51) — that commit now routes through the BUS.
 *
 * The 2D plan view is a Canvas2D surface; the 3D TransformControls gizmo that the
 * selection path attaches is not interactive there, so wall move/rotate in plan is
 * owned entirely by `PlanElementDragController`. This suite pins the DECISION that a
 * real plan drag commits the wall through the SAME bus path the 3D transform gizmo
 * and the plan Move/Align tools use (`wall.updateBaseline`, P6 — one mutation path),
 * for BOTH gestures:
 *
 *   • body drag       → MOVE  (translate both endpoints by the grid-snapped delta)
 *   • endpoint drag   → ROTATE/stretch (swing baseLine[endpoint] about the other end)
 *
 * L-51: the commit used to go through `commandManager.execute(UpdateWallBaselineCommand)`
 * directly — landing ONLY on the commandManager stack while a 3D-gizmo move landed on
 * the CommandBus ring buffer, so interleaved plan+3D moves undid out of order (the two
 * stacks have independent cursors — ADR-051). It now dispatches `wall.updateBaseline`
 * on the bus (which bridges to commandManager for the WallRebuildCoordinator), so plan
 * and 3D moves share the unified ring-buffer timeline. A commit that is a no-op (never
 * dispatched, or dispatched with the pre-drag baseline) would reproduce the founder
 * "dragging has NO effect" bug — the assertions check both that the command fired on
 * the bus and that it carries the moved line.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

/**
 * commandManager must be present (onEnd early-returns without it — it still owns
 * door/window offset commits), but the WALL commit no longer flows through it: L-51
 * routes wall through the bus. Returns the spy so tests can assert it is NOT called
 * for a wall.
 */
function installCommandManager() {
    const execute = vi.fn();
    (window as unknown as { commandManager?: unknown }).commandManager = { execute };
    return execute;
}

/** Install the runtime bus the plan wall commit now dispatches on (§L-51). */
function installRuntimeBus() {
    const executeCommand = vi.fn(() => Promise.resolve());
    (window as unknown as { runtime?: unknown }).runtime = { bus: { executeCommand } };
    return executeCommand;
}

function makeDomCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    document.body.appendChild(c);
    return c;
}

/** The plain payload the bus receives: { wallId, newBaseLine, prevBaseLine }. */
function busWallCall(spy: ReturnType<typeof installRuntimeBus>) {
    const call = spy.mock.calls.find((c) => c[0] === 'wall.updateBaseline');
    expect(call, 'expected a wall.updateBaseline bus dispatch').toBeDefined();
    return call![1] as { wallId: string; newBaseLine: [Pt, Pt]; prevBaseLine: [Pt, Pt] };
}

describe('§FIX-PLAN-WALL-TRANSFORM / §FIX-PLAN-WALL-MOVE-UNDO-UNIFY — plan wall move+rotate commit on the bus', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => {
        ctrl = new PlanElementDragController();
    });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { commandManager?: unknown }).commandManager;
        delete (window as unknown as { runtime?: unknown }).runtime;
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('a body drag MOVES the wall — dispatches wall.updateBaseline on the BUS with the drag delta', async () => {
        const wall = makeWall();
        const { update } = installWallStore(wall);
        const cmExecute = installCommandManager();
        const busExecute = installRuntimeBus();
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

        // §L-51: the wall commit is on the BUS (unified ring-buffer timeline), NOT
        // the divergent commandManager stack.
        expect(busExecute).toHaveBeenCalledTimes(1);
        expect(cmExecute).not.toHaveBeenCalled();
        const payload = busWallCall(busExecute);
        expect(payload.wallId).toBe('wall-1');
        expect(payload.newBaseLine[0].x).toBeCloseTo(1, 6);
        expect(payload.newBaseLine[1].x).toBeCloseTo(5, 6);
        expect(payload.newBaseLine[0].z).toBeCloseTo(0, 6);
        expect(payload.newBaseLine[1].z).toBeCloseTo(0, 6);
    });

    it('an endpoint drag ROTATES the wall — dispatches wall.updateBaseline on the BUS with one end swung', async () => {
        const wall = makeWall();
        const { update } = installWallStore(wall);
        const cmExecute = installCommandManager();
        const busExecute = installRuntimeBus();
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

        expect(busExecute).toHaveBeenCalledTimes(1);
        expect(cmExecute).not.toHaveBeenCalled();
        const payload = busWallCall(busExecute);
        // Pivot end A unchanged; end B swung from (4,0) to (4,2) — a genuine rotation,
        // not the pre-drag baseline (which would be the "no effect" bug).
        expect(payload.newBaseLine[0].x).toBeCloseTo(0, 6);
        expect(payload.newBaseLine[0].z).toBeCloseTo(0, 6);
        expect(payload.newBaseLine[1].x).toBeCloseTo(4, 6);
        expect(payload.newBaseLine[1].z).toBeCloseTo(2, 6);
    });

    it('§L-51 — carries the pre-drag baseline as prevBaseLine so the ring-buffer inverse is exact', async () => {
        const wall = makeWall();
        installWallStore(wall);
        installCommandManager();
        const busExecute = installRuntimeBus();
        const planCanvas = makeFakePlanCanvas() as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(200, 100, planCanvas)!;
        ctrl.startDrag(hit, 200, 100, planCanvas, dom);
        ctrl.onMove(250, 100);
        await ctrl.onEnd();

        const payload = busWallCall(busExecute);
        // prevBaseLine is the authored line before the drag (0,0)-(4,0) — the bus
        // handler's inverse patch restores exactly this on undo.
        expect(payload.prevBaseLine[0].x).toBeCloseTo(0, 6);
        expect(payload.prevBaseLine[1].x).toBeCloseTo(4, 6);
    });
});
