// @vitest-environment happy-dom
//
// §FIX-PLAN-VIEW-PARITY (L-73) — hosted door/window MOVE parity across plan surfaces.
// §FEAT-PLAN-HOSTED-DRAG-HANDLES (founder, 2026-08-07) — the two-arrow affordance,
// the LEFT-EDGE datum fix, one-gesture-one-command, and the live constraint clamp.
//
// The founder reported that a hosted door/window can be dragged "nicely" in the MAIN
// plan view but NOT in the split-view plan pane. Both surfaces drive the SAME
// `planElementDragController` singleton through a `PlanViewInteraction` instance
// (PlanViewManager attaches it to the main canvas; SplitViewManager attaches it to the
// SVP canvas), so the move gesture must dispatch the SAME command regardless of which
// canvas started it — the controller is deliberately canvas-agnostic (planCanvas +
// domCanvas are start-drag arguments). This suite pins that, and pins the properties
// the drag affordance added on top.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanElementDragController } from '@pryzm/core-app-model';

type Pt = { x: number; y: number; z: number };

// Screen mapping: 50 px per metre, origin at (100,100). Inverse used by screenToWorld.
const PX_PER_M = 50;
const OX = 100;
const OY = 100;

/** Host wall from (0,0)→(4,0), 4 m long, on the plan X axis. */
function makeWall(openings: Array<{ id: string; elementId?: string; offset: number; width: number }> = []) {
    return {
        id: 'wall-1',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] as [Pt, Pt],
        openings,
    };
}

/**
 * A hosted opening at LEFT-EDGE offset 1 m, width 1 m, on wall-1.
 * §OPENING-OFFSET-LEFTEDGE-UNIFY — `offset` is the LEFT edge, so this opening
 * spans [1, 2] and its CENTRE sits at 1.5 m along the wall.
 */
function makeOpening(id: string) {
    return { id, wallId: 'wall-1', offset: 1, width: 1 };
}

function installWallStore(
    kind: 'door' | 'window',
    wall: ReturnType<typeof makeWall>,
    opening: ReturnType<typeof makeOpening>,
) {
    const updateDoor   = vi.fn((_id: string, patch: { offset?: number }) => { if (patch.offset != null) opening.offset = patch.offset; });
    const updateWindow = vi.fn((_id: string, patch: { offset?: number }) => { if (patch.offset != null) opening.offset = patch.offset; });
    const ws = {
        getById:   (id: string) => (id === wall.id ? wall : undefined),
        getDoor:   (id: string) => (kind === 'door'   && id === opening.id ? opening : undefined),
        getWindow: (id: string) => (kind === 'window' && id === opening.id ? opening : undefined),
        getAll:    () => [wall],
        updateDoor,
        updateWindow,
    };
    (window as unknown as { wallStore?: unknown }).wallStore = ws;
    return { ws, updateDoor, updateWindow };
}

/**
 * §P6 — the controller's ONLY mutation path is the typed command bus. It used to
 * call `window.commandManager.execute(new Set*OffsetCommand(...))` directly, which
 * the `check:commandmanager` CI ratchet forbids anywhere under `packages/`.
 */
function installBus() {
    const executeCommand = vi.fn(() => Promise.resolve());
    (window as unknown as { runtime?: unknown }).runtime = { bus: { executeCommand } };
    return executeCommand;
}

function makeFakePlanCanvas(openingId: string) {
    return {
        hitTest: (_sx: number, _sy: number, _t?: number): string | null => openingId,
        worldToScreen: (x: number, z: number) => ({ sx: OX + x * PX_PER_M, sy: OY + z * PX_PER_M }),
        screenToWorld: (sx: number, sy: number) => ({ worldX: (sx - OX) / PX_PER_M, worldZ: (sy - OY) / PX_PER_M }),
    };
}

function makeDomCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    document.body.appendChild(c);
    return c;
}

/** Select an element the way SelectionManager exposes it to the plan layer. */
function select(id: string | null) {
    (window as unknown as { selectionManager?: unknown }).selectionManager =
        id ? { selectedObject: { userData: { id } } } : undefined;
}

describe('§FIX-PLAN-VIEW-PARITY (L-73) — hosted door/window drag commits the same command (main == split)', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => { ctrl = new PlanElementDragController(); });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { runtime?: unknown }).runtime;
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('a DOOR drag along the host wall commits door.setOffset with the moved offset', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        const { updateDoor } = installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        // Door spans [1,2] → centre at world (1.5,0) → screen (175,100). Grab it.
        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        expect(hit).toMatchObject({ elementId: 'door-1', kind: 'door' });
        expect(ctrl.startDrag(hit, 175, 100, planCanvas, dom)).toBe(true);

        // Slide the CENTRE to world (2.5,0) → screen (225,100).
        ctrl.onMove(225, 100);
        expect(ctrl.isActivated).toBe(true);
        expect(updateDoor).toHaveBeenCalled();      // live preview mutates the store

        await ctrl.onEnd();

        expect(bus).toHaveBeenCalledTimes(1);
        const [type, payload] = bus.mock.calls[0] as [string, Record<string, number | string>];
        expect(type).toBe('door.setOffset');
        expect(payload.doorId).toBe('door-1');
        // §OPENING-OFFSET-LEFTEDGE-UNIFY — the cursor holds the CENTRE (2.5 m), so
        // the committed LEFT-EDGE offset is 2.5 − width/2 = 2.0. The pre-fix
        // controller stored the centre itself (2.5), landing the door half its
        // width too far along the wall on every single plan drag.
        expect(payload.newOffset).toBeCloseTo(2, 6);
        expect(payload.prevOffset).toBeCloseTo(1, 6);
        expect(door.offset).toBeCloseTo(2, 6);
    });

    it('a WINDOW drag along the host wall commits window.setOffset with the moved offset', async () => {
        const wall = makeWall();
        const win = makeOpening('window-1');
        const { updateWindow } = installWallStore('window', wall, win);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('window-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        expect(hit).toMatchObject({ elementId: 'window-1', kind: 'window' });
        expect(ctrl.startDrag(hit, 175, 100, planCanvas, dom)).toBe(true);

        ctrl.onMove(225, 100);
        expect(ctrl.isActivated).toBe(true);
        expect(updateWindow).toHaveBeenCalled();

        await ctrl.onEnd();

        expect(bus).toHaveBeenCalledTimes(1);
        const [type, payload] = bus.mock.calls[0] as [string, Record<string, number | string>];
        expect(type).toBe('window.setOffset');
        expect(payload.windowId).toBe('window-1');
        expect(payload.newOffset).toBeCloseTo(2, 6);
        expect(win.offset).toBeCloseTo(2, 6);
    });
});

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — one gesture ⇒ exactly one undoable command', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => { ctrl = new PlanElementDragController(); });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { runtime?: unknown }).runtime;
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('coalesces MANY pointer-moves into ONE command carrying the whole delta', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        const { updateDoor } = installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        ctrl.startDrag(hit, 175, 100, planCanvas, dom);

        // Twelve intermediate frames — a realistic drag.
        for (let px = 180; px <= 235; px += 5) ctrl.onMove(px, 100);
        expect(updateDoor.mock.calls.length).toBeGreaterThan(3);   // live preview per frame
        expect(bus).not.toHaveBeenCalled();                        // …but NO command yet

        await ctrl.onEnd();

        // Exactly one undoable step for the whole gesture.
        expect(bus).toHaveBeenCalledTimes(1);
        const payload = bus.mock.calls[0][1] as Record<string, number>;
        // prevOffset is the drag-START value, not the previous frame's — so undo
        // restores the pre-drag position exactly, however many frames occurred.
        expect(payload.prevOffset).toBeCloseTo(1, 6);
        expect(payload.newOffset).toBeCloseTo(door.offset, 6);
    });

    it('undo restores the ORIGINAL offset exactly (prevOffset round-trips)', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        const original = door.offset;
        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        ctrl.startDrag(hit, 175, 100, planCanvas, dom);
        ctrl.onMove(225, 100);
        await ctrl.onEnd();

        const payload = bus.mock.calls[0][1] as Record<string, number>;
        // The command's inverse is `prevOffset`; applying it returns the store to
        // the exact pre-drag value.
        door.offset = payload.prevOffset;
        expect(door.offset).toBe(original);
    });

    it('a sub-threshold click emits NO command (selecting must not be undoable)', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        ctrl.startDrag(hit, 175, 100, planCanvas, dom);
        ctrl.onMove(176, 100);                 // 1 px — below DRAG_THRESHOLD
        expect(ctrl.isActivated).toBe(false);
        await ctrl.onEnd();
        expect(bus).not.toHaveBeenCalled();
    });

    it('emits NO command when the drag ends back where it started', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        ctrl.startDrag(hit, 175, 100, planCanvas, dom);
        ctrl.onMove(225, 100);                 // out…
        ctrl.onMove(175, 100);                 // …and back
        await ctrl.onEnd();
        expect(bus).not.toHaveBeenCalled();
        expect(door.offset).toBeCloseTo(1, 6);
    });
});

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — constraints are enforced DURING the drag', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => { ctrl = new PlanElementDragController(); });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { runtime?: unknown }).runtime;
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('clamps a drag past the wall END to the last legal offset', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        ctrl.startDrag(hit, 175, 100, planCanvas, dom);
        ctrl.onMove(900, 100);                 // way off the end of the 4 m wall
        await ctrl.onEnd();

        // 4 m wall, 1 m opening → the largest legal LEFT-EDGE offset is 3.
        expect(door.offset).toBeCloseTo(3, 6);
        const payload = bus.mock.calls[0][1] as Record<string, number>;
        expect(payload.newOffset).toBeCloseTo(3, 6);
    });

    it('never writes an OVERLAPPING offset into the store — it stops at the neighbour', async () => {
        // A window occupies [2.6, 3.6]. Dragging the door rightward must halt with
        // its right edge at 2.6, i.e. LEFT-EDGE offset 1.6 — and, crucially, the
        // store must NEVER transiently hold an overlapping value. Before this fix
        // the preview wrote the illegal offset every frame and the commit was then
        // refused by canExecute, leaving the store dirty with no undo entry.
        const wall = makeWall([
            { id: 'op-door', elementId: 'door-1', offset: 1, width: 1 },
            { id: 'op-win',  elementId: 'window-9', offset: 2.6, width: 1 },
        ]);
        const door = makeOpening('door-1');
        const { updateDoor } = installWallStore('door', wall, door);
        const bus = installBus();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(175, 100, planCanvas)!;
        ctrl.startDrag(hit, 175, 100, planCanvas, dom);
        for (let px = 180; px <= 260; px += 5) ctrl.onMove(px, 100);

        // Every previewed offset was legal — none overlapped [2.6, 3.6].
        for (const [, patch] of updateDoor.mock.calls as Array<[string, { offset: number }]>) {
            expect(patch.offset + 1).toBeLessThanOrEqual(2.6 + 1e-9);
        }

        await ctrl.onEnd();
        expect(door.offset).toBeCloseTo(1.6, 6);
        // The committed value is legal, so the command cannot be refused.
        const payload = bus.mock.calls[0][1] as Record<string, number>;
        expect(payload.newOffset).toBeCloseTo(1.6, 6);
    });
});

describe('§FEAT-PLAN-HOSTED-DRAG-HANDLES — the two arrows', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => { ctrl = new PlanElementDragController(); });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { runtime?: unknown }).runtime;
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('appear only for a SELECTED hosted opening', () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const planCanvas = makeFakePlanCanvas('door-1') as never;

        select(null);
        expect(ctrl.handleLayoutFor(planCanvas)).toBeNull();

        select('door-1');
        const layout = ctrl.handleLayoutFor(planCanvas)!;
        expect(layout.handles).toHaveLength(2);
    });

    it('grabbing an arrow starts the SAME 1-D drag as grabbing the symbol body', () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        select('door-1');

        const layout = ctrl.handleLayoutFor(planCanvas)!;
        const end = layout.handles[1];
        const hit = ctrl.hitTestDraggable(end.tipSx, end.tipSy, planCanvas)!;

        // A hosted opening has ONE degree of freedom, so the grab point records
        // which affordance was used but cannot change what the drag MEANS.
        expect(hit).toEqual({ elementId: 'door-1', kind: 'door', grabbed: 'end' });
    });

    it('the arrows win the hit-test against the wall linework underneath them', () => {
        // `hitTest` here always returns the door id, so this pins the ORDERING:
        // the handle branch must resolve before the body branch and report which
        // arrow was grabbed, otherwise the affordance silently degrades to a body
        // drag and the `grabbed` side is lost.
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        select('door-1');

        const layout = ctrl.handleLayoutFor(planCanvas)!;
        const start = layout.handles[0];
        expect(ctrl.hitTestDraggable(start.tipSx, start.tipSy, planCanvas)?.grabbed).toBe('start');

        // Away from both arrows → the body branch, still draggable.
        expect(ctrl.hitTestDraggable(layout.centreSx, layout.centreSy, planCanvas))
            .toMatchObject({ elementId: 'door-1', kind: 'door', grabbed: 'body' });
    });

    it('are suppressed while a drag is live (the overlay owns the feedback then)', () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();
        select('door-1');

        expect(ctrl.handleLayoutFor(planCanvas)).not.toBeNull();
        ctrl.startDrag({ elementId: 'door-1', kind: 'door' }, 175, 100, planCanvas, dom);
        expect(ctrl.handleLayoutFor(planCanvas)).toBeNull();
    });

    it('vanish when the store no longer holds the selected id (project-switch probe)', () => {
        // §6897f0cc project-scope isolation. The affordance keeps NO long-lived
        // state — it is derived per frame — so a project switch that empties the
        // store makes it disappear with no teardown hook required.
        const wall = makeWall();
        const door = makeOpening('door-1');
        installWallStore('door', wall, door);
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        select('door-1');
        expect(ctrl.handleLayoutFor(planCanvas)).not.toBeNull();

        (window as unknown as { wallStore?: unknown }).wallStore = {
            getById: () => undefined, getDoor: () => undefined, getWindow: () => undefined,
        };
        expect(ctrl.handleLayoutFor(planCanvas)).toBeNull();
    });
});
