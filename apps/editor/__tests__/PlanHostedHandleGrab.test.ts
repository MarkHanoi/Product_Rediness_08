// @vitest-environment happy-dom
//
// §FIX-PLAN-HOSTED-HANDLE-GRAB (founder, 2026-08-07) — "I see the new arrows, but I
// don't seem to be able to SELECT them and DRAG them."
//
// §FEAT-PLAN-HOSTED-DRAG-HANDLES shipped the affordance and unit-tested the geometry
// (hostedDragParam.test.ts) and the controller (PlanHostedDragParity.test.ts) — but
// NOTHING tested the seam that actually delivers a pointer to them: the
// `PlanViewInteraction` mousedown → `hitTestDraggable` → `startDrag` wiring, which is
// what both plan surfaces (main pane and split-view pane) really use.
//
// This suite drives the WHOLE gesture through that seam: a real DOM mousedown on the
// arrow glyph, real mousemoves, a real mouseup — and asserts the opening moved via
// exactly ONE bus command. A handle that is painted but not reachable fails here.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanViewInteraction } from '../src/engine/views/PlanViewInteraction';
import { planElementDragController } from '@pryzm/core-app-model';

type Pt = { x: number; y: number; z: number };

const PX = 50;   // px per metre
const OX = 100;
const OY = 100;

const VIEW_ID = 'vd-plan';

/** Host wall (0,0)→(4,0). Opening spans LEFT-EDGE [1,2] m. */
function makeWall(openings: Array<{ id: string; elementId?: string; offset: number; width: number }>) {
    return {
        id: 'wall-1',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] as [Pt, Pt],
        openings,
    };
}

function installStores() {
    const opening = { id: 'win-1', wallId: 'wall-1', offset: 1, width: 1 };
    const wall = makeWall([{ id: 'op-1', elementId: 'win-1', offset: 1, width: 1 }]);
    const ws = {
        getById:   (id: string) => (id === wall.id ? wall : undefined),
        getDoor:   (_id: string) => undefined,
        getWindow: (id: string) => (id === opening.id ? opening : undefined),
        getAll:    () => [wall],
        update:    vi.fn(),
        updateWindow: vi.fn((_id: string, patch: { offset?: number }) => {
            if (patch.offset != null) opening.offset = patch.offset;
        }),
    };
    (window as unknown as { wallStore?: unknown }).wallStore = ws;
    return { ws, wall, opening };
}

function installBus() {
    const executeCommand = vi.fn(() => Promise.resolve());
    (window as unknown as { runtime?: unknown }).runtime = {
        bus: { executeCommand },
        events: { emit: vi.fn(), on: vi.fn() },
    };
    return executeCommand;
}

function makeFakePlanCanvas(bodyHitId: string | null) {
    return {
        // The REAL plan canvas returns the HOST WALL here for a click near the arrows
        // (founder log: "Element selected via plan view click: wall_01KZ…"), so this
        // fake reproduces the arbitration the handles have to win.
        hitTest: vi.fn((_sx: number, _sy: number, _t?: number) => bodyHitId),
        hitTestLevelHead: vi.fn(() => null),
        hitTestLevel: vi.fn(() => null),
        hitTestScopeHandle: vi.fn(() => null),
        hitTestCropHandle: vi.fn(() => null),
        hitTestAnnotation: vi.fn(() => null),
        hitTestGridDim: vi.fn(() => null),
        hitTestGrid: vi.fn(() => null),
        worldToScreen: (x: number, z: number) => ({ sx: OX + x * PX, sy: OY + z * PX }),
        screenToWorld: (sx: number, sy: number) => ({ worldX: (sx - OX) / PX, worldZ: (sy - OY) / PX }),
        setSelectedGridId: vi.fn(),
        setSnapIndicator: vi.fn(),
        clearSnapIndicator: vi.fn(),
        setHoveredElementId: vi.fn(),
        setHoveredScopeHandle: vi.fn(),
        viewPlaneFrame: () => ({ plane: 'plan' }),
    };
}

function down(canvas: HTMLElement, x: number, y: number): void {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}
function move(x: number, y: number): void {
    window.dispatchEvent(new MouseEvent('mousemove', { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}
function up(x: number, y: number): void {
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

function select(id: string | null) {
    (window as unknown as { selectionManager?: unknown }).selectionManager =
        id ? { selectedObject: { userData: { id } } } : undefined;
}

describe('§FIX-PLAN-HOSTED-HANDLE-GRAB — the painted arrow must be grabbable through PlanViewInteraction', () => {
    let interaction: PlanViewInteraction;
    let canvas: HTMLCanvasElement;
    let planCanvas: ReturnType<typeof makeFakePlanCanvas>;
    let bus: ReturnType<typeof installBus>;
    let stores: ReturnType<typeof installStores>;

    beforeEach(() => {
        stores = installStores();
        bus = installBus();
        select('win-1');
        delete (window as unknown as { toolManager?: unknown }).toolManager;
        delete (window as unknown as { __underlayScaleActive?: unknown }).__underlayScaleActive;

        canvas = document.createElement('canvas');
        canvas.width = 400; canvas.height = 300;
        document.body.appendChild(canvas);
        planCanvas = makeFakePlanCanvas('wall-1');
        interaction = new PlanViewInteraction();
        interaction.attach(canvas, planCanvas as never, VIEW_ID);
    });

    afterEach(() => {
        interaction.detach();
        planElementDragController.cancel();
        document.querySelectorAll('canvas').forEach((c) => c.remove());
        delete (window as unknown as { wallStore?: unknown }).wallStore;
        delete (window as unknown as { runtime?: unknown }).runtime;
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
    });

    // The opening spans [1,2] m → start edge world(1,0) = screen(150,100),
    // end edge world(2,0) = screen(200,100). The START arrow points −X with a 6 px
    // gap and 15 px length, so its glyph runs screen x ∈ [129,144] at y = 100.
    const START_ARROW_X = 138;
    const END_ARROW_X   = 212;   // end arrow glyph runs x ∈ [206,221]

    it('mousedown on the start arrow arms the drag (cold canvas — no prior pointer traffic)', () => {
        down(canvas, START_ARROW_X, 100);
        expect(planElementDragController.isDragging).toBe(true);
    });

    // ── THE FOUNDER'S DEFECT ────────────────────────────────────────────────
    // The real gesture is never "cold". The arrows only EXIST once the opening is
    // selected, so every grab is necessarily: click the opening → MOVE THE POINTER
    // to the arrow → press. That intervening pointer move is what killed it: the
    // window-level `mousemove` handler promotes `_isDragging` past a 5 px threshold
    // WITHOUT REGARD TO WHETHER A BUTTON IS DOWN, and the next `mousedown` reads that
    // stale flag as a precondition (`if (!this._isDragging …)`) before it will even
    // hit-test the handles. Reaching for an affordance therefore disarms it.
    it('THE DEFECT: after the pointer travels to the arrow, pressing it must still arm the drag', () => {
        // 1. The user clicks the opening body to select it — this is what makes the
        //    arrows appear at all.
        down(canvas, 175, 100);
        up(175, 100);
        // 2. The user moves the pointer onto the arrow they can now see (>5 px).
        move(START_ARROW_X, 100);
        // 3. …and presses it.
        down(canvas, START_ARROW_X, 100);

        expect(planElementDragController.isDragging).toBe(true);
    });

    it('THE DEFECT: the whole reach-then-drag gesture moves the opening via ONE command', async () => {
        down(canvas, 175, 100);
        up(175, 100);
        move(END_ARROW_X, 100);          // reach for the arrow
        down(canvas, END_ARROW_X, 100);  // grab it
        move(END_ARROW_X + 50, 100);     // +1 m along the host
        up(END_ARROW_X + 50, 100);
        await Promise.resolve();
        await Promise.resolve();

        const offsetCalls = bus.mock.calls.filter(([type]) => type === 'window.setOffset');
        expect(offsetCalls.length).toBe(1);
        expect((offsetCalls[0][1] as { newOffset: number; prevOffset: number }).newOffset).toBeGreaterThan(1);
    });

    it('dragging the end arrow moves the opening and commits ONE command', async () => {
        down(canvas, END_ARROW_X, 100);
        move(END_ARROW_X + 50, 100);   // +1 m along the host
        up(END_ARROW_X + 50, 100);
        await Promise.resolve();
        await Promise.resolve();

        const offsetCalls = bus.mock.calls.filter(([type]) => type === 'window.setOffset');
        expect(offsetCalls.length).toBe(1);
        expect((offsetCalls[0][1] as { newOffset: number; prevOffset: number }).newOffset).toBeGreaterThan(1);
    });

    it('hovering the arrow shows a grab cursor — the affordance advertises itself', () => {
        move(START_ARROW_X, 100);
        expect(canvas.style.cursor).toBe('grab');
    });

    it('the cursor promise is honoured: the same hit-test drives hover AND press', () => {
        move(START_ARROW_X, 100);
        expect(canvas.style.cursor).toBe('grab');
        down(canvas, START_ARROW_X, 100);
        expect(planElementDragController.isDragging).toBe(true);
    });

    it('the grabbed side is reported, so the affordance is genuinely a HANDLE grab', () => {
        const hit = planElementDragController.hitTestDraggable(START_ARROW_X, 100, planCanvas as never);
        expect(hit).toMatchObject({ elementId: 'win-1', kind: 'window', grabbed: 'start' });
    });
});
