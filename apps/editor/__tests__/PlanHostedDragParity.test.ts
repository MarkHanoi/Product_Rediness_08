// @vitest-environment happy-dom
//
// §FIX-PLAN-VIEW-PARITY (L-73) — hosted door/window MOVE parity across plan surfaces.
//
// The founder reported that a hosted door/window can be dragged "nicely" in the MAIN
// plan view but NOT in the split-view plan pane. Both surfaces drive the SAME
// `planElementDragController` singleton through a `PlanViewInteraction` instance
// (PlanViewManager attaches it to the main canvas; SplitViewManager attaches it to the
// SVP canvas), so the move gesture must dispatch the SAME command regardless of which
// canvas started it — the controller is deliberately canvas-agnostic (planCanvas +
// domCanvas are start-drag arguments). This suite pins that: a hosted door drag commits
// a SetDoorOffsetCommand, and a window drag a SetWindowOffsetCommand, carrying the moved
// offset — the exact command path the interaction layer invokes on BOTH panes. A no-op
// commit (never dispatched / pre-drag offset) would reproduce "can't move doors in split".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanElementDragController } from '@pryzm/core-app-model';

type Pt = { x: number; y: number; z: number };

// Screen mapping: 50 px per metre, origin at (100,100). Inverse used by screenToWorld.
const PX_PER_M = 50;
const OX = 100;
const OY = 100;

/** Host wall from (0,0)→(4,0), 4 m long, on the plan X axis. */
function makeWall(): { id: string; levelId: string; baseLine: [Pt, Pt] } {
    return { id: 'wall-1', levelId: 'L0', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] };
}

/** A hosted opening (door or window) at offset 1 m, width 1 m, on wall-1. */
function makeOpening(id: string): { id: string; wallId: string; offset: number; width: number } {
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

function installCommandManager() {
    const execute = vi.fn();
    (window as unknown as { commandManager?: unknown }).commandManager = { execute };
    return execute;
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

describe('§FIX-PLAN-VIEW-PARITY (L-73) — hosted door/window drag commits the same command (main == split)', () => {
    let ctrl: PlanElementDragController;

    beforeEach(() => { ctrl = new PlanElementDragController(); });
    afterEach(() => {
        ctrl.cancel();
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { commandManager?: unknown }).commandManager;
        document.querySelectorAll('canvas').forEach((c) => c.remove());
    });

    it('a DOOR drag along the host wall commits SetDoorOffsetCommand with the moved offset', async () => {
        const wall = makeWall();
        const door = makeOpening('door-1');
        const { updateDoor } = installWallStore('door', wall, door);
        const cmExecute = installCommandManager();
        const planCanvas = makeFakePlanCanvas('door-1') as never;
        const dom = makeDomCanvas();

        // Door sits at offset 1 → world (1,0) → screen (150,100). Grab it.
        const hit = ctrl.hitTestDraggable(150, 100, planCanvas)!;
        expect(hit).toEqual({ elementId: 'door-1', kind: 'door' });
        expect(ctrl.startDrag(hit, 150, 100, planCanvas, dom)).toBe(true);

        // Slide to world (2,0) → screen (200,100): offset 1 → 2 m (t=0.5 · 4 m, on the 0.1 m grid).
        ctrl.onMove(200, 100);
        expect(ctrl.isActivated).toBe(true);
        expect(updateDoor).toHaveBeenCalled();      // live preview mutates the store

        await ctrl.onEnd();

        expect(cmExecute).toHaveBeenCalledTimes(1);
        const [cmd, opts] = cmExecute.mock.calls[0];
        expect(cmd.constructor.name).toBe('SetDoorOffsetCommand');
        expect(cmd.targetIds).toEqual(['door-1']);
        expect(opts).toEqual({ source: 'HUMAN_DIRECT' });
        expect(door.offset).toBeCloseTo(2, 6);       // committed offset moved from 1 → 2
    });

    it('a WINDOW drag along the host wall commits SetWindowOffsetCommand with the moved offset', async () => {
        const wall = makeWall();
        const win = makeOpening('window-1');
        const { updateWindow } = installWallStore('window', wall, win);
        const cmExecute = installCommandManager();
        const planCanvas = makeFakePlanCanvas('window-1') as never;
        const dom = makeDomCanvas();

        const hit = ctrl.hitTestDraggable(150, 100, planCanvas)!;
        expect(hit).toEqual({ elementId: 'window-1', kind: 'window' });
        expect(ctrl.startDrag(hit, 150, 100, planCanvas, dom)).toBe(true);

        ctrl.onMove(200, 100);
        expect(ctrl.isActivated).toBe(true);
        expect(updateWindow).toHaveBeenCalled();

        await ctrl.onEnd();

        expect(cmExecute).toHaveBeenCalledTimes(1);
        const [cmd, opts] = cmExecute.mock.calls[0];
        expect(cmd.constructor.name).toBe('SetWindowOffsetCommand');
        expect(cmd.targetIds).toEqual(['window-1']);
        expect(opts).toEqual({ source: 'HUMAN_DIRECT' });
        expect(win.offset).toBeCloseTo(2, 6);
    });
});
