/**
 * §FIX-PLAN-TOOL-POINTER-UNREACHABLE (L-7000..L-7005) · C11 · C103 · C104.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE ARM THAT WAS MISSING: A **POINTER EVENT** REACHES THE **ARMED HANDLER**.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Three compounds — pool, balcony, lift — shipped on consecutive days, each with a
 * reachability test that passed, and ALL THREE were unusable by a person. The founder:
 *
 *   "Balcony doesn't preview on wall — and I could not create it."
 *   "Swimming pool — I did not have the mode tool ... I created a few lines but the
 *    creation did not trigger."
 *   "Lift — it should be under Architecture, but could not see it!"
 *
 * The existing suites — `poolReachableThroughComposedRuntime.test.ts`,
 * `liftReachableThroughComposedRuntime.test.ts` — prove the RUNTIME can DISPATCH the
 * command. That is a real and hard-won property (it is what catches a missing
 * `PluginRegistry` descriptor, which threw before anything mutated), and it is NOT the
 * property the founder is reporting on. `liftReachableThroughComposedRuntime.test.ts`
 * says so itself, in its own header:
 *
 *   > "⚠ WHAT THIS FILE DOES **NOT** PROVE … It does NOT prove that a person can click
 *   >  a Lift button and get one."
 *
 * ⭐ THIS FILE PROVES THAT MISSING HALF, AT THE LAYER THE USER TOUCHES. It starts from
 * the REAL palette call (`activatePlanOnlyToolOrExplain`, the function every plan-only
 * palette row invokes), attaches the REAL split-view plan overlay to a canvas, and
 * dispatches REAL DOM `MouseEvent`s at it. Nothing about the pointer path is stubbed:
 * the listeners, the capture phases, the focus gating, the screen→world transform and
 * the handler's own state machine all run. If a click cannot get from the canvas to the
 * handler, no assertion here can pass.
 *
 * ⛔ AND IT IS DELIBERATELY THE **SPLIT-VIEW** OVERLAY. The founder's working layout is
 * 3-D left / plan right, and his console named `SvpPlanToolOverlay` — the split-view
 * pane — every time. A test against the standalone plan overlay would have been green
 * and irrelevant. `SvpPlanToolOverlay` and `PlanViewToolOverlay` are TWO overlays on
 * TWO canvases; ARM E pins that the palette arms whichever is ATTACHED, which is the
 * property that makes "which pane" answerable at all.
 *
 * ─── WHAT THE FIRST RUN MEASURED, BEFORE ANY FIX ───────────────────────────────
 * Recorded because it REFUTES half the diagnosis this lane was briefed with, and a
 * refuted hypothesis is worth more than a fixed one that was never broken:
 *
 *   ARM A was ALREADY GREEN. `armedSurfaces: 1`, `isPlacing(): true`, and one synthetic
 *   `mousedown` produced exactly one `balcony.create`. The handler, the overlay and the
 *   transform were never the defect. The brief's H2 — "the selection path consumes the
 *   click first" — is REFUTED as stated: the two surfaces bind to two different
 *   canvases and never race for one event.
 *
 *   ARM D was RED. `isPlacing()` true → one ToolManager `'none'` notification →
 *   `isPlacing()` FALSE. A plan-only tool disarmed itself with nothing on screen
 *   changing. THAT is what a person experiences as "I could not create it", and it is
 *   one measured cause of `Handler activated: balcony` x11 — a user re-arming a tool
 *   that keeps putting itself away.
 *
 *   ARM B was RED. Nothing suppressed 3-D selection, so with a create tool armed a
 *   click in the 3-D viewport still picked a wall and attached a transform gizmo —
 *   `[WallTransform] gizmo aligned`, verbatim from the founder's console.
 *
 *   ARM C (the pool's mode strip) was ABSENT, not broken: `setActivePoolDrawMode` had
 *   ZERO production writers. Six declared modes, six live handler arms, and no surface
 *   able to select one.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS.
// happy-dom's `HTMLCanvasElement.getContext('2d')` returns **null** (measured), and
// both overlays treat a null context as "cannot build a draw context" and refuse to arm
// the handler at all. So this is not decoration: without it every arm below fails for a
// reason that has nothing to do with the subject. It also doubles as the PREVIEW PROBE —
// ARM A asserts against the calls it records, which is how "doesn't preview on wall"
// becomes a measurable claim rather than a screenshot.
const drawCalls: string[] = [];
(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
    function getContext(): unknown {
        return new Proxy(
            {},
            {
                get:
                    (_t, prop) =>
                        (...args: unknown[]): unknown => {
                            drawCalls.push(String(prop));
                            void args;
                            return undefined;
                        },
                set: () => true,
            },
        );
    };
// §R3-SENTINEL — both overlays refuse to arm a handler until initTools has completed.
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { viewDefinitionStore } from '@pryzm/core-app-model';
import { svpPlanToolOverlay } from '../../SvpPlanToolOverlay';
import { planViewToolOverlay } from '../../PlanViewToolOverlay';
import {
    activatePlanOnlyToolOrExplain,
    endPlanOnlyToolSession,
    activePlanOnlySessionTool,
} from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import { creationModes } from '../elementCreationMatrix';
import { __resetActivePoolDrawModeForTests, resolveActivePoolDrawMode } from '../activePoolDrawMode';
import { __resetActiveBalconyPlacementForTests } from '../activeBalconyPlacement';
import { __resetArmedSelectionForTests } from '../armedSelectionSnapshot';
import { PLAN_TOOL_KEYS } from '../planToolHandlerRegistry';

// ── The world ────────────────────────────────────────────────────────────────
// One 10 x 10 m plate on `level-1` with a wall across it, and a second storey above.
// ⭐ ONE CLICK POINT SERVES ALL THREE FAMILIES: (5.0, 5.4) is 0.4 m from the wall (so
// the balcony hosts and the lift is wall-hosted), and inside the slab (so the lift finds
// its void and the pool finds its host). A test that needed three different worlds could
// not compare the three families' gestures at all.
const VIEW_ID = 'vd-pointer-probe-plan';
const WALL_ID = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H00';
const SLAB_ID = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
const PPU = 50; // screen pixels per world metre — the fake plan canvas's scale

/** world → client px, through the same transform the fake plan canvas exposes. */
const px = (worldX: number, worldZ: number): { clientX: number; clientY: number } => ({
    clientX: worldX * PPU,
    clientY: worldZ * PPU,
});

const bus = { executeCommand: vi.fn(async () => ({ ok: true })) };
const toasts: Array<{ message: string; kind?: string }> = [];
let selectionEnabled: boolean[] = [];
let toolSubscribers: Array<(t: string) => void> = [];
let canvas: HTMLCanvasElement;

const planCanvasStub = {
    screenToWorld: (sx: number, sy: number) => ({ worldX: sx / PPU, worldZ: sy / PPU }),
    worldToScreen: (x: number, z: number) => ({ sx: x * PPU, sy: z * PPU }),
    getPixelsPerUnit: () => PPU,
};

function installWorld(): void {
    bus.executeCommand.mockClear();
    toasts.length = 0;
    drawCalls.length = 0;
    selectionEnabled = [];
    toolSubscribers = [];

    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus,
        events: { on: () => ({ dispose: (): void => undefined }), emit: (): void => undefined },
        toasts: { show: (message: string, kind?: string) => { toasts.push({ message, kind }); return { dispose: (): void => undefined }; } },
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
        setEnabled: (v: boolean) => { selectionEnabled.push(v); },
        getSelectedId: () => null,
        selectedObject: undefined,
    };
    w.toolManager = {
        getActiveTool: () => 'none',
        subscribe: (fn: (t: string) => void) => { toolSubscribers.push(fn); return (): void => undefined; },
    };
}

/** Fire the ToolManager's `notify()` — what `deactivateAll()` does on every Escape. */
const notifyToolManager = (tool: string): void => { for (const fn of toolSubscribers) fn(tool); };

/** Enter the pane, so the overlay's hover-focus gate opens exactly as it does live. */
function enterPane(): void {
    canvas.dispatchEvent(new MouseEvent('mouseenter'));
}

function hover(worldX: number, worldZ: number): void {
    window.dispatchEvent(new MouseEvent('mousemove', { ...px(worldX, worldZ), bubbles: true }));
}

function click(worldX: number, worldZ: number): void {
    canvas.dispatchEvent(
        new MouseEvent('mousedown', { button: 0, ...px(worldX, worldZ), bubbles: true }),
    );
}

function dblClick(worldX: number, worldZ: number): void {
    canvas.dispatchEvent(new MouseEvent('dblclick', { ...px(worldX, worldZ), bubbles: true }));
}

/** Every command type the bus was asked for, in order. */
const dispatched = (): string[] => bus.executeCommand.mock.calls.map((c) => String(c[0]));

/** The one payload dispatched for `type`, or `undefined`. */
const payloadFor = (type: string): Record<string, unknown> | undefined =>
    bus.executeCommand.mock.calls.find((c) => c[0] === type)?.[1] as Record<string, unknown> | undefined;

describe('§FIX-PLAN-TOOL-POINTER-UNREACHABLE — a pointer event reaches the ARMED handler', () => {
    beforeAll(() => {
        // The shared `DrawingModeBar` refuses to render during onboarding
        // (§AUTHORING-CONTEXT-GATE, L-5103) and the default phase is `onboarding-globe`.
        // A test that skipped this would measure the gate, not the strip.
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Pointer probe',
            viewType: 'floor-plan',
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

    // ── ARM A ────────────────────────────────────────────────────────────────
    describe('ARM A — palette click → armed handler → pointer → ONE command', () => {
        it('A-1 BALCONY: hover a wall PREVIEWS, and one click creates the compound', () => {
            expect(activatePlanOnlyToolOrExplain('balcony', 'Balcony')).toBe(true);
            enterPane();

            drawCalls.length = 0;
            hover(5.0, 5.4);
            // ⭐ THE FOUNDER'S "doesn't preview on wall", MADE MEASURABLE. The hosted
            // preview is built by `balconyRectangle()` — the SAME function the commit
            // passes to the bus — and drawn as a filled, stroked ring. A hover that
            // reached the handler therefore MUST have filled and stroked a path.
            expect(drawCalls).toContain('fill');
            expect(drawCalls).toContain('stroke');

            click(5.0, 5.4);
            expect(dispatched()).toEqual(['balcony.create']);

            const p = payloadFor('balcony.create')!;
            expect(p.hostWallId).toBe(WALL_ID);
            expect(p.levelId).toBe('level-1');
            // Four corners, and one railing id per FREE edge — asked of the geometry,
            // never assumed. A hosted balcony has three free edges; the fourth is the
            // facade the room opens through.
            expect((p.boundary as unknown[]).length).toBe(4);
            expect((p.railingIds as unknown[]).length).toBe(3);
        });

        it('A-2 POOL: three clicks and a double-click cut a pool into the slab under them', () => {
            expect(activatePlanOnlyToolOrExplain('pool', 'Swimming Pool')).toBe(true);
            enterPane();

            click(2, 2);
            hover(8, 2);
            click(8, 2);
            click(8, 8);
            expect(dispatched()).toEqual([]); // an open polyline is not yet a pool
            dblClick(8, 8);

            expect(dispatched()).toEqual(['pool.create']);
            const p = payloadFor('pool.create')!;
            // ⭐ THE HOST IS THE SLAB THE OUTLINE SITS ON — resolved from GEOMETRY, which
            // is the gesture the founder described ("draw it on the terrace").
            expect(p.hostSlabId).toBe(SLAB_ID);
            expect((p.boundary as unknown[]).length).toBe(3);
            expect((p.wallIds as unknown[]).length).toBe(3);
        });

        it('A-3 LIFT: one click places the C104 compound serving this storey and up', () => {
            expect(activatePlanOnlyToolOrExplain('lift', 'Lift')).toBe(true);
            enterPane();

            drawCalls.length = 0;
            hover(5.0, 5.4);
            expect(drawCalls).toContain('stroke'); // the shaft footprint + its diagonals

            click(5.0, 5.4);
            expect(dispatched()).toEqual(['lift.create']);

            const p = payloadFor('lift.create')!;
            // ⛔ `lift.create`, NOT the legacy massing `CreateVerticalCirculationCommand`.
            // That divergence is L-5709 and the palette row now names the compound.
            expect(p.enclosureType).toBe('wall-hosted');
            expect(p.hostWallId).toBe(WALL_ID);
            // THE STOREY QUESTION: the active level and every level above it.
            expect((p.servedLevels as Array<{ levelId: string }>).map((l) => l.levelId))
                .toEqual(['level-1', 'level-2']);
            // One landing door per served storey; four enclosure sides; five cabin parts.
            expect((p.landingDoorIds as unknown[]).length).toBe(2);
            expect((p.enclosureIds as unknown[]).length).toBe(4);
            expect((p.cabinPartIds as unknown[]).length).toBe(5);
            // The base storey's slab is voided; the storey with no slab names none, and
            // says so by OMITTING the key rather than carrying `undefined`.
            const served = p.servedLevels as Array<{ levelId: string; slabId?: string }>;
            expect(served[0]!.slabId).toBe(SLAB_ID);
            expect('slabId' in served[1]!).toBe(false);
        });
    });

    // ── ARM B ────────────────────────────────────────────────────────────────
    describe('ARM B — an armed create tool SUPPRESSES ordinary 3-D selection', () => {
        it('B-1 arming disables selection, and ending the session gives it back', () => {
            // ⭐ THE FOUNDER'S CONSOLE: `[PickResolver] §97 click hit type=wall … gpu-pick`
            // followed by `[WallTransform] gizmo aligned`, WHILE the balcony was armed.
            // `ToolManager.activateTool` has disabled selection for every 3-D tool since
            // forever (ToolManager.ts:551); a plan-only tool never reaches the ToolManager,
            // so it was the one armed tool that left the 3-D viewport selecting.
            expect(selectionEnabled).toEqual([]);
            activatePlanOnlyToolOrExplain('balcony', 'Balcony');
            expect(selectionEnabled).toEqual([false]);

            endPlanOnlyToolSession();
            expect(selectionEnabled).toEqual([false, true]);
        });

        it('B-2 Escape ends the session and restores selection', () => {
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            expect(activePlanOnlySessionTool()).toBe('pool');
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(activePlanOnlySessionTool()).toBeNull();
            expect(selectionEnabled).toEqual([false, true]);
        });

        it('B-3 a REAL 3-D tool taking over stands the session down', () => {
            activatePlanOnlyToolOrExplain('balcony', 'Balcony');
            // `ToolManager.activateTool` fires this and disables selection itself; the
            // session must stand down rather than fight it for the flag.
            window.dispatchEvent(new CustomEvent('tool:activated', { detail: 'wall' }));
            expect(activePlanOnlySessionTool()).toBeNull();
        });
    });

    // ── ARM C ────────────────────────────────────────────────────────────────
    describe('ARM C — the POOL has a mode strip, and it is the founder’s five shapes', () => {
        it('C-1 the strip renders, and its pills are exactly the declared modes', () => {
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            const bar = document.querySelector('.wdh-bar[data-dmb="1"]');
            expect(bar, 'the pool must have a mode strip on screen').not.toBeNull();

            const pills = [...bar!.querySelectorAll<HTMLButtonElement>('.wdh-btn')].map(
                (b) => b.dataset.mode,
            );
            // ⛔ Compared against the DECLARATION, never a hand-typed list: one source,
            // so the strip and the matrix cannot drift into offering different sets.
            expect(pills).toEqual(creationModes('pool').map((m) => m.id));
            // The founder's words, checked literally: "like the wall: linear, ortho —
            // but also circular, ellipse, rectangular".
            expect(pills).toEqual(
                expect.arrayContaining(['linear', 'ortho', 'rectangular', 'circular', 'elliptical']),
            );
        });

        it('C-2 every accelerator inside the strip is UNIQUE', () => {
            // §FIX-STAIR-SHAPE-DESYNC's neighbouring hazard: `L` meaning Linear on one
            // axis and L-shape on another. Within ONE strip a duplicate key makes a pill
            // unreachable by keyboard and silently picks whichever the finder hits first.
            for (const tool of ['pool', 'balcony']) {
                const keys = creationModes(tool).map((m) => m.key.toUpperCase());
                expect(new Set(keys).size, `${tool} has a duplicate accelerator`).toBe(keys.length);
            }
        });

        it('C-3 picking a pill WRITES THE SHARED STORE and does not re-arm the tool', () => {
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            expect(resolveActivePoolDrawMode()).toBe('linear');

            const circular = document.querySelector<HTMLButtonElement>('.wdh-btn[data-mode="circular"]');
            expect(circular).not.toBeNull();
            circular!.click();

            // ⭐ THE WHOLE POINT OF A PERSISTENT STRIP: the mode changed and the tool was
            // NOT re-activated, so a half-drawn outline would have survived. Re-arming is
            // what `DrawingModeBar` exists to avoid (§FEAT-PERSISTENT-MODE-BAR).
            expect(resolveActivePoolDrawMode()).toBe('circular');
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);

            // …and the new mode reaches the CLICK PATH, not just a variable: circular
            // commits on the SECOND click (centre, then rim), never on a double-click.
            click(5, 5);
            expect(dispatched()).toEqual([]);
            click(7, 5);
            expect(dispatched()).toEqual(['pool.create']);
            // A ring, not a triangle — `boundaryLoopVertices` generated it.
            expect((payloadFor('pool.create')!.boundary as unknown[]).length).toBeGreaterThan(8);
        });
    });

    // ── ARM D ────────────────────────────────────────────────────────────────
    describe('ARM D — the ToolManager cannot silently disarm a plan-only tool', () => {
        it('D-1 a ToolManager "none" notification leaves the armed tool armed', () => {
            activatePlanOnlyToolOrExplain('balcony', 'Balcony');
            enterPane();
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);

            // MEASURED RED BEFORE THE GUARD: this flipped `isPlacing()` to false, and the
            // user's next click did nothing with nothing on screen having changed.
            notifyToolManager('none');
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);

            click(5.0, 5.4);
            expect(dispatched()).toEqual(['balcony.create']);
        });

        it('D-2 a ToolManager notification naming a REAL tool still takes over', () => {
            activatePlanOnlyToolOrExplain('balcony', 'Balcony');
            enterPane();
            notifyToolManager('wall');
            // The wall tool genuinely owns the surface now. The guard is narrow on
            // purpose: it ignores `'none'` (which says nothing about this overlay) and
            // nothing else.
            click(5.0, 5.4);
            expect(dispatched()).not.toContain('balcony.create');
        });

        it('D-3 re-arming the SAME tool does not destroy an in-progress outline', () => {
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            click(2, 2);
            click(8, 2);

            // The founder clicked the palette row again to check it had "taken" —
            // `Handler activated: balcony` x11 is what that looks like in a console.
            // Before the idempotence guard this tore the handler down and the two
            // vertices evaporated.
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');

            click(8, 8);
            dblClick(8, 8);
            expect(dispatched()).toEqual(['pool.create']);
            expect((payloadFor('pool.create')!.boundary as unknown[]).length).toBe(3);
        });
    });

    // ── ARM E ────────────────────────────────────────────────────────────────
    describe('ARM E — WHICH SURFACE arms, and what happens when none is attached', () => {
        it('E-1 the palette arms the ATTACHED plan surface, and the other stays inert', () => {
            // The founder's layout is 3-D left / plan right: only the SPLIT-VIEW overlay
            // is attached, and his console named only `SvpPlanToolOverlay`. The palette
            // must arm whichever surface is live rather than one it was written against.
            expect(planViewToolOverlay.isAttached()).toBe(false);
            expect(svpPlanToolOverlay.isAttached()).toBe(true);
            activatePlanOnlyToolOrExplain('lift', 'Lift');
            enterPane();
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);
            expect(planViewToolOverlay.isPlacing()).toBe(false);
        });

        it('E-2 with NO plan surface attached the palette REFUSES OUT LOUD, in a toast', () => {
            svpPlanToolOverlay.detach();
            toasts.length = 0;
            expect(activatePlanOnlyToolOrExplain('balcony', 'Balcony')).toBe(false);

            // ⭐ L-7005 — THE REFUSAL REACHES A PERSON. It used to be emitted on
            // `pryzm:toast`, a channel with 40+ emitters and (measured)
            // ZERO subscribers, which is a refusal nobody CAN read. It now goes through
            // `runtime.toasts`, the slot `initUI.ts` uses for every message the user
            // actually sees.
            expect(toasts.length).toBe(1);
            expect(toasts[0]!.kind).toBe('error');
            expect(toasts[0]!.message).toMatch(/no plan view is open/i);
            // C16 CA-18 — the reason AND the route back to success.
            expect(toasts[0]!.message).toMatch(/split view/i);
        });

        it('E-3 a successful arm NAMES THE PANE — the answer to "I could not create it"', () => {
            toasts.length = 0;
            activatePlanOnlyToolOrExplain('balcony', 'Balcony');
            expect(toasts.length).toBe(1);
            expect(toasts[0]!.kind).toBe('info');
            expect(toasts[0]!.message).toMatch(/PLAN pane/);
        });
    });

    // ── ARM F ────────────────────────────────────────────────────────────────
    describe('ARM F — the registry knows all three, on BOTH plan surfaces', () => {
        it('F-1 pool, balcony and lift are all plan-tool keys', () => {
            for (const key of ['pool', 'balcony', 'lift']) {
                expect(PLAN_TOOL_KEYS as readonly string[], `${key} must be a plan tool`).toContain(key);
            }
        });
    });
});
