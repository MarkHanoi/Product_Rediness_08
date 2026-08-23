/**
 * §FIX-PLAN-TOOL-ESCAPE-RUNAWAY (L-7800..L-7803) · C11 · C16 CA-18 · C103 · C104.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER: *"Balcony works — but it doesn't have an ESC option. It will create
 * balconies indefinitely."*
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * MEASURED IN HIS OWN LOG, and this is the whole reason the defect is P0 rather than a
 * papercut — Escape was not merely ineffective, it was ineffective while the tool kept
 * building:
 *
 *     [SvpPlanToolOverlay] Handler activated: balcony
 *     …balcony created — slab + floor + 3 handrails…
 *     [EngineBootstrap] Shortcut Escape → deactivateAll
 *     [SvpPlanToolOverlay] Handler activated: balcony      ← RE-ARMS after the Escape
 *     …another balcony created…
 *
 * Element count across the session: **14 → 19 → 24 → 29**. Five members per balcony,
 * three balconies he did not ask for, each undoable only on its own.
 *
 * ─── THE TWO MECHANISMS, BOTH MEASURED BEFORE THIS FILE EXISTED ────────────────
 *
 *   (1) `endPlanOnlyToolSession()` unwound the session CHROME — the mode strip, the
 *       selection suppression, the armed-selection snapshot — and LEFT THE HANDLER
 *       ARMED. Its own header stated that as a deliberate decision: *"⛔ It deliberately
 *       does NOT disarm the plan handler. Escape inside a plan tool means 'cancel this
 *       stroke', not 'put the tool away'."* ⭐ THE PREMISE IS TRUE AND THE CONCLUSION
 *       DOES NOT FOLLOW: the balcony and the lift are SINGLE-CLICK tools that never hold
 *       a stroke, so for them "cancel the stroke" cancels nothing and Escape became a
 *       key with no observable effect whatsoever.
 *
 *   (2) `deactivateAll()` cannot disarm it either, and that is BY DESIGN — L-7002's
 *       guard (`if (this._programmaticTool && tool === 'none') return;`) exists
 *       precisely so a ToolManager `'none'` cannot silently put a plan-only tool away.
 *       So the two forces that could have stopped the runaway were one deliberate no-op
 *       and one deliberate guard, and the `Handler activated: balcony` line AFTER the
 *       Escape is `_onMouseEnter` rebuilding a handler for a tool nothing disarmed.
 *
 * ─── ⛔ WHY THE FIX IS TWO-STAGE AND NOT "ESCAPE DISARMS" ──────────────────────
 * The pool is a MULTI-POINT tool. Collapsing Escape to a bare disarm would destroy a
 * half-drawn outline on the first mis-clicked vertex — the exact stroke-preservation
 * property §T-B1 was built to protect. So Escape keeps BOTH meanings and picks by
 * asking `hasActiveStroke()`, which is already on the `PlanToolHandler` interface:
 *   stage 1 — a stroke is live  → cancel the stroke, tool STAYS ARMED
 *   stage 2 — nothing to cancel → PUT THE TOOL AWAY
 *
 * ⚠ AND THE SAMPLE MUST BE TAKEN BEFORE `cancel()` RUNS. `cancel()` resets `_points`,
 * so a listener that asks afterwards reads a false negative and collapses the two
 * stages into one. ARM C pins that ordering directly, because it is the one part of
 * this fix that a plausible-looking refactor would silently break.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS — happy-dom's
// `getContext('2d')` returns null and both overlays treat that as "cannot build a draw
// context" and refuse to arm at all. Same preamble as `pointerReachesArmedHandler.spec.ts`.
(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
    function getContext(): unknown {
        return new Proxy(
            {},
            { get: () => (): unknown => undefined, set: () => true },
        );
    };
// §R3-SENTINEL — both overlays refuse to arm a handler until initTools has completed.
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { viewDefinitionStore } from '@pryzm/core-app-model';
import { svpPlanToolOverlay } from '../../SvpPlanToolOverlay';
import {
    activatePlanOnlyToolOrExplain,
    endPlanOnlyToolSession,
    activePlanOnlySessionTool,
} from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import { __resetActivePoolDrawModeForTests } from '../activePoolDrawMode';
import { __resetActiveBalconyPlacementForTests } from '../activeBalconyPlacement';
import { __resetArmedSelectionForTests } from '../armedSelectionSnapshot';

const VIEW_ID = 'vd-escape-probe-plan';
const WALL_ID = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H00';
const SLAB_ID = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
const PPU = 50;

const px = (worldX: number, worldZ: number): { clientX: number; clientY: number } => ({
    clientX: worldX * PPU,
    clientY: worldZ * PPU,
});

const bus = { executeCommand: vi.fn(async () => ({ ok: true })) };
let toolSubscribers: Array<(t: string) => void> = [];
let canvas: HTMLCanvasElement;

const planCanvasStub = {
    screenToWorld: (sx: number, sy: number) => ({ worldX: sx / PPU, worldZ: sy / PPU }),
    worldToScreen: (x: number, z: number) => ({ sx: x * PPU, sy: z * PPU }),
    getPixelsPerUnit: () => PPU,
};

function installWorld(): void {
    bus.executeCommand.mockClear();
    toolSubscribers = [];

    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus,
        events: { on: () => ({ dispose: (): void => undefined }), emit: (): void => undefined },
        toasts: { show: () => ({ dispose: (): void => undefined }) },
        stores: {
            slab: {
                getState: () =>
                    new Map<string, unknown>([
                        [SLAB_ID, { levelId: 'level-1', boundary: [
                            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
                        ] }],
                    ]),
            },
        },
    };
    w.wallStore = {
        getAll: () => [
            { id: WALL_ID, levelId: 'level-1', baseLine: [{ x: 0, y: 0, z: 5 }, { x: 10, y: 0, z: 5 }] },
        ],
        getLevels: () => [
            { id: 'level-1', elevation: 0 },
            { id: 'level-2', elevation: 3 },
        ],
    };
    w.bimManager = {
        getLevelById: () => ({ elevation: 0 }),
        getLevels: () => [{ id: 'level-1', elevation: 0 }, { id: 'level-2', elevation: 3 }],
    };
    w.selectionManager = {
        setEnabled: (): void => undefined,
        getSelectedId: () => null,
        selectedObject: undefined,
    };
    w.toolManager = {
        getActiveTool: () => 'none',
        subscribe: (fn: (t: string) => void) => { toolSubscribers.push(fn); return (): void => undefined; },
    };
    // ⭐ THE OVERLAY THE PALETTE ARMS. `activatePlanOnlyTool` walks
    // `window.planViewToolOverlay` and `window.svpPlanToolOverlay`, so the disarm leg
    // (`setActiveTool('none')`) is only exercised if the singleton is reachable there —
    // which is exactly how it is reachable live.
    w.svpPlanToolOverlay = svpPlanToolOverlay;
    w.planViewToolOverlay = undefined;
}

/** Fire the ToolManager's `notify()` — what `deactivateAll()` does on every Escape. */
const notifyToolManager = (tool: string): void => { for (const fn of toolSubscribers) fn(tool); };

const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };
const leavePane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseleave')); };

const click = (worldX: number, worldZ: number): void => {
    canvas.dispatchEvent(
        new MouseEvent('mousedown', { button: 0, ...px(worldX, worldZ), bubbles: true }),
    );
};

/**
 * A REAL Escape keydown on `window`, bubbling — so BOTH the overlay's capture-phase
 * listener and the session's bubble-phase fallback see it, in the live order.
 */
const escape = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

const dispatched = (): string[] =>
    (bus.executeCommand.mock.calls as unknown as unknown[][]).map((c) => String(c[0]));

describe('§FIX-PLAN-TOOL-ESCAPE-RUNAWAY — Escape puts a plan-only tool away', () => {
    beforeAll(() => {
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Escape probe',
            viewType: 'plan',
            spatial: { levelId: 'level-1' },
        });
    });

    beforeEach(() => {
        installWorld();
        __resetActivePoolDrawModeForTests();
        __resetActiveBalconyPlacementForTests();
        __resetArmedSelectionForTests();

        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        canvas.getBoundingClientRect = (): DOMRect =>
            ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
    });

    afterEach(() => {
        endPlanOnlyToolSession();
        svpPlanToolOverlay.detach();
        canvas.remove();
    });

    // ── ARM A — THE FOUNDER'S REPORT, VERBATIM ───────────────────────────────
    describe('ARM A — a single-click compound stops creating after Escape', () => {
        it('A-1 BALCONY: click creates one; Escape disarms; the NEXT click creates nothing', () => {
            expect(activatePlanOnlyToolOrExplain('balcony', 'Balcony')).toBe(true);
            enterPane();

            click(5.0, 5.4);
            expect(dispatched()).toEqual(['balcony.create']);

            escape();

            // The session is gone AND the tool is disarmed — the two halves the old
            // code separated, which is how the chrome could vanish while the tool
            // kept building.
            expect(activePlanOnlySessionTool()).toBeNull();
            expect(svpPlanToolOverlay.isPlacing()).toBe(false);

            // ⭐⭐ THE ASSERTION THE FOUNDER IS ACTUALLY REPORTING. Before the fix this
            // second click produced a SECOND `balcony.create` — his 14 → 19 → 24 → 29.
            click(2.0, 5.4);
            expect(dispatched()).toEqual(['balcony.create']);
        });

        it('A-2 LIFT: the same, on the other single-click compound', () => {
            expect(activatePlanOnlyToolOrExplain('lift', 'Lift')).toBe(true);
            enterPane();

            click(5.0, 5.4);
            expect(dispatched()).toEqual(['lift.create']);

            escape();
            expect(activePlanOnlySessionTool()).toBeNull();

            click(2.0, 5.4);
            expect(dispatched()).toEqual(['lift.create']);
        });

        it('A-3 the re-arm route is closed: re-entering the pane does NOT rebuild the handler', () => {
            expect(activatePlanOnlyToolOrExplain('balcony', 'Balcony')).toBe(true);
            enterPane();
            escape();

            // ⭐ THIS IS THE `Handler activated: balcony` LINE IN HIS LOG AFTER THE
            // ESCAPE. `_onMouseEnter` re-activates whatever `_activeTool` still names,
            // so leaving the tool armed made the pane itself a re-arm trigger. With the
            // tool disarmed, `'none'` is not in `ACTIVE_TOOL_KEYS` and the first line of
            // `_onMouseEnter` returns.
            leavePane();
            enterPane();
            expect(svpPlanToolOverlay.isPlacing()).toBe(false);

            click(5.0, 5.4);
            expect(dispatched()).toEqual([]);
        });

        it('A-4 a ToolManager deactivateAll() STILL does not disarm it — L-7002 is intact', () => {
            // ⛔ REGRESSION GUARD IN THE OPPOSITE DIRECTION. The cheap "fix" for the
            // runaway is to let `notify('none')` disarm plan-only tools — which would
            // re-open L-7002, where the tool put itself away with nothing on screen
            // changing and the user's next click did nothing. Escape disarms; a
            // ToolManager idle notification must not.
            expect(activatePlanOnlyToolOrExplain('balcony', 'Balcony')).toBe(true);
            enterPane();
            notifyToolManager('none');
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);
            expect(activePlanOnlySessionTool()).toBe('balcony');
        });
    });

    // ── ARM B — THE MULTI-POINT TOOL KEEPS ITS STROKE-CANCEL ─────────────────
    describe('ARM B — Escape is TWO-STAGE for a multi-point tool', () => {
        it('B-1 POOL: the first Escape cancels the outline and KEEPS the tool armed', () => {
            expect(activatePlanOnlyToolOrExplain('pool', 'Swimming Pool')).toBe(true);
            enterPane();

            click(2, 2);
            click(8, 2);
            click(8, 8);
            expect(dispatched()).toEqual([]); // an open polyline is not yet a pool

            escape();

            // Stage 1: the stroke is gone, the tool is NOT. Disarming here would be the
            // §T-B1 stroke-preservation regression — one mis-clicked vertex costing the
            // architect the tool.
            expect(activePlanOnlySessionTool()).toBe('pool');
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);
        });

        it('B-2 POOL: the SECOND Escape — nothing left to cancel — puts the tool away', () => {
            expect(activatePlanOnlyToolOrExplain('pool', 'Swimming Pool')).toBe(true);
            enterPane();

            click(2, 2);
            click(8, 2);
            escape();                                   // stage 1 — cancel the stroke
            expect(activePlanOnlySessionTool()).toBe('pool');

            escape();                                   // stage 2 — put the tool away
            expect(activePlanOnlySessionTool()).toBeNull();
            expect(svpPlanToolOverlay.isPlacing()).toBe(false);
        });
    });

    // ── ARM C — THE ORDERING THAT MAKES ARM B POSSIBLE ───────────────────────
    describe('ARM C — the stroke is sampled BEFORE cancel() wipes it', () => {
        it('C-1 an Escape with a live stroke never reaches the disarm leg', () => {
            // ⚠ THE ONE LINE A PLAUSIBLE REFACTOR BREAKS. If `hasActiveStroke()` is read
            // AFTER `cancel()` — or by any listener downstream of the overlay's
            // capture-phase one — it reads false, stage 2 fires, and the pool loses its
            // tool on the first Escape. B-1 would then fail for a reason that looks like
            // a session bug rather than an ordering bug, so this arm states the ordering
            // as its own claim.
            expect(activatePlanOnlyToolOrExplain('pool', 'Swimming Pool')).toBe(true);
            enterPane();
            click(3, 3);

            escape();

            expect(activePlanOnlySessionTool()).toBe('pool');
            // …and the stroke really WAS cancelled, so this is not "the Escape did
            // nothing at all" passing by accident: the very next Escape now disarms.
            escape();
            expect(activePlanOnlySessionTool()).toBeNull();
        });
    });
});
