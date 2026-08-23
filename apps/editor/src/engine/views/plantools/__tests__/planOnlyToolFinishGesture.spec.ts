/**
 * §FIX-PLAN-TOOL-FINISH-GESTURE (L-9300..L-9309) · C11 §7.6 · C84 · C104 R-10 · C106.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER DREW, AND NOTHING WAS CREATED — TWICE, ON TWO TOOLS, ONE DAY.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   "testing the swimmingpool — it doesn't work still … even with rectangle mode
 *    doesn't work — the swimming pool would not create"
 *   "testing boundary line … doesn't actually work — it doesn't create"
 *
 * Both consoles show `[SvpPlanToolOverlay] Handler activated: <tool>` SEVEN times and
 * not one `*.create` dispatch.
 *
 * ⚠ AND BOTH TOOLS ALREADY HAD A GREEN POINTER-LAYER PROOF ON THE **SAME** SURFACE.
 * `pointerReachesArmedHandler.spec.ts` (pool) and `boundaryLinePointerReach.spec.ts`
 * (boundary line) both drive the REAL `SvpPlanToolOverlay` with REAL DOM events and
 * both get exactly one `create`. 36 assertions, green, and the founder still could not
 * make an element. So "the pointer does not reach the handler" is REFUTED, and this
 * file exists to measure the three things those two harnesses quietly made true that
 * production does not:
 *
 *   ⭐ H1 — THE HARNESS ALWAYS PUT A SLAB UNDER THE POOL.
 *      `pointerReachesArmedHandler.spec.ts:150` installs
 *      `runtime.stores.slab` holding one 10x10 m plate on `level-1`, and every pool
 *      click in it lands INSIDE that plate. `PoolPlanToolHandler._resolveHostSlab`
 *      therefore always found a host. Draw a pool where there is no slab — a terrace
 *      that is only in the legacy store, a garden, an empty plan — and the handler
 *      REFUSES before it dispatches. ARM A measures that: the same gesture, in a world
 *      with no slab, produces ZERO dispatches.
 *
 *   ⭐ H2 — A REFUSAL IS PAINTED ON A CANVAS THE NEXT MOUSE SAMPLE ERASES.
 *      `_refuse()` draws the sentence on the overlay. `SvpPlanToolOverlay._onMouseMove`
 *      begins EVERY sample with `ctx.clearRect(...)` and then calls the handler, which
 *      (points now reset to zero) draws the idle hint or nothing at all. So the reason
 *      survives for one pointer sample — about 16 ms — and the user sees silence.
 *      That is C11 §7.6, "a dead click behind a perfect preview", exactly.
 *
 *   ⭐ H3 — THE FINISH GESTURE IS DROPPED WHENEVER THE POINTER IS NOT OVER THE PANE.
 *      `_onMouseLeave` DELIBERATELY preserves a half-drawn stroke (§T-B1, so a trip to
 *      the toolbar does not evaporate a six-point outline) while setting
 *      `_svpFocused = false`. `_onKeyDown` then returns early on that very flag. The two
 *      features contradict each other inside ONE file: the stroke is kept alive and
 *      Enter — the only key that can finish it — is thrown away. This is the founder's
 *      first complaint ("I create 3 segments and click Enter") word for word.
 *
 * ⛔ WHY THE ASSERTIONS ARE WRITTEN AGAINST BEHAVIOUR AND NOT AGAINST A LOG LINE:
 * a `Handler activated:` line proves ARMING, and arming is the half that was never
 * broken. Every arm below asserts a DISPATCH or a SENTENCE A PERSON CAN READ.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS.
// happy-dom's `HTMLCanvasElement.getContext('2d')` returns **null** (measured), and the
// overlay treats a null context as "cannot build a draw context" and refuses to arm at
// all — so without this every arm below would fail for a reason that has nothing to do
// with the subject.
//
// ⭐ IT RECORDS `fillText` ARGUMENTS, NOT JUST METHOD NAMES. The refusal IS a
// `fillText` call, so "the user was told why" and "the sentence was erased one sample
// later" only become measurable claims if the ARGUMENTS are kept. The sibling harnesses
// record method names alone, which is one reason H2 was invisible to them.
const drawCalls: string[] = [];
const textDrawn: string[] = [];
(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
    function getContext(): unknown {
        return new Proxy(
            {},
            {
                get:
                    (_t, prop) =>
                        (...args: unknown[]): unknown => {
                            const name = String(prop);
                            drawCalls.push(name);
                            if (name === 'fillText' && typeof args[0] === 'string') {
                                textDrawn.push(args[0]);
                            }
                            if (name === 'clearRect') textDrawn.length = 0;
                            return undefined;
                        },
                set: () => true,
            },
        );
    };
// §R3-SENTINEL — the overlay refuses to arm a handler until initTools has completed.
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { viewDefinitionStore } from '@pryzm/core-app-model';
import { svpPlanToolOverlay } from '../../SvpPlanToolOverlay';
import {
    activatePlanOnlyToolOrExplain,
    endPlanOnlyToolSession,
    planOnlyToolModeStore,
} from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import {
    __resetActivePoolDrawModeForTests,
    setActivePoolDrawMode,
} from '../activePoolDrawMode';
import { __resetActiveBoundaryLineDrawModeForTests } from '../activeBoundaryLineDrawMode';
import { __resetArmedSelectionForTests } from '../armedSelectionSnapshot';

const VIEW_ID = 'vd-finish-gesture-probe';
const SLAB_ID = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
const PPU = 50; // screen pixels per world metre — the fake plan canvas's scale

const px = (worldX: number, worldZ: number): { clientX: number; clientY: number } => ({
    clientX: worldX * PPU,
    clientY: worldZ * PPU,
});

const bus = { executeCommand: vi.fn(async () => ({ ok: true })) };
const toasts: Array<{ message: string; kind?: string }> = [];
let canvas: HTMLCanvasElement;

const planCanvasStub = {
    screenToWorld: (sx: number, sy: number) => ({ worldX: sx / PPU, worldZ: sy / PPU }),
    worldToScreen: (x: number, z: number) => ({ sx: x * PPU, sy: z * PPU }),
    getPixelsPerUnit: () => PPU,
};

/**
 * @param withSlab when false, `runtime.stores.slab` is EMPTY — the founder's world if
 *        he draws a pool anywhere that is not over a modelled slab. The sibling
 *        harnesses only ever ran the `true` case.
 */
function installWorld(withSlab: boolean): void {
    bus.executeCommand.mockClear();
    toasts.length = 0;
    drawCalls.length = 0;
    textDrawn.length = 0;

    const slabs = new Map<string, unknown>();
    if (withSlab) {
        slabs.set(SLAB_ID, {
            levelId: 'level-1',
            boundary: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 30 }, { x: 0, z: 30 }],
        });
    }

    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus,
        events: { on: () => ({ dispose: (): void => undefined }), emit: (): void => undefined },
        toasts: {
            show: (message: string, kind?: string) => {
                toasts.push({ message, kind });
                return { dispose: (): void => undefined };
            },
        },
        stores: { slab: { getState: () => slabs } },
    };
    w.slabStore = undefined;
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
    w.toolManager = { getActiveTool: () => 'none', subscribe: () => (): void => undefined };
    w.bimManager = { getLevelById: () => ({ elevation: 0 }), getLevels: () => [{ id: 'level-1', elevation: 0 }] };
    w.planViewManager = undefined;
}

const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };
const leavePane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseleave')); };
const hover = (x: number, z: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { ...px(x, z), bubbles: true }));
};
const click = (x: number, z: number): void => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, ...px(x, z), bubbles: true }));
};
const pressEnter = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
};

const dispatched = (): string[] =>
    (bus.executeCommand.mock.calls as unknown as unknown[][]).map((c) => String(c[0]));
const onScreen = (): string => textDrawn.join(' | ');

describe('§FIX-PLAN-TOOL-FINISH-GESTURE — the founder drew and nothing was created', () => {
    beforeAll(() => {
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Finish-gesture probe',
            viewType: 'plan',
            spatial: { levelId: 'level-1' },
        });
    });

    beforeEach(() => {
        __resetActivePoolDrawModeForTests();
        __resetActiveBoundaryLineDrawModeForTests();
        __resetArmedSelectionForTests();
        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        canvas.getBoundingClientRect = (): DOMRect =>
            ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    });

    afterEach(() => {
        endPlanOnlyToolSession();
        svpPlanToolOverlay.detach();
        canvas.remove();
    });

    // ── ARM A — H1: the pool refuses when there is no slab under it ──────────
    describe('ARM A — a pool drawn where there is no slab', () => {
        it('A-1: ⭐ RECTANGLE MODE OVER EMPTY GROUND DISPATCHES NOTHING — the founder`s report', () => {
            installWorld(false);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            expect(activatePlanOnlyToolOrExplain('pool', 'Swimming Pool')).toBe(true);
            enterPane();
            setActivePoolDrawMode('rectangular');

            click(2, 2);
            click(8, 6);

            // The gesture is complete and correct. There is simply nowhere to cut.
            expect(dispatched()).toEqual([]);
        });

        it('A-2: the SAME gesture over a slab DOES dispatch — so the gesture is not the defect', () => {
            installWorld(true);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            setActivePoolDrawMode('rectangular');

            click(2, 2);
            click(8, 6);

            expect(dispatched()).toEqual(['pool.create']);
        });

        it('A-3: ⭐ THE REFUSAL REACHES A PERSON — a toast, not a canvas the next sample wipes', () => {
            installWorld(false);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            setActivePoolDrawMode('rectangular');
            toasts.length = 0;

            click(2, 2);
            click(8, 6);

            // C16 CA-18 — the reason AND the route back to success.
            const errs = toasts.filter((t) => t.kind === 'error');
            expect(errs.length).toBeGreaterThan(0);
            expect(errs.map((t) => t.message).join(' ')).toMatch(/slab/i);
        });

        it('A-4: ⭐ THE REFUSAL SURVIVES THE NEXT POINTER SAMPLE (H2)', () => {
            installWorld(false);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            setActivePoolDrawMode('rectangular');

            click(2, 2);
            click(8, 6);
            expect(onScreen()).toMatch(/slab/i);

            // ONE mouse sample — the overlay clears the canvas at the head of every one.
            hover(9, 7);
            // Before §FIX-PLAN-TOOL-FINISH-GESTURE this was the idle hint and the reason
            // was gone in ~16 ms, which is indistinguishable from "nothing happened".
            expect(onScreen()).toMatch(/slab/i);
        });
    });

    // ── ARM B — H3: Enter finishes a preserved stroke ────────────────────────
    describe('ARM B — Enter, when the pointer has left the pane', () => {
        it('B-1: ⭐ POOL — 3 SEGMENTS, POINTER OFF THE PANE, ENTER CLOSES THE RING', () => {
            installWorld(true);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();

            // The founder's gesture: "if I create 3 segments on preview and click Enter
            // the 4th should connect with the first point".
            click(2, 2);
            click(10, 2);
            click(10, 8);
            click(2, 8);

            // §T-B1 keeps the half-drawn outline alive across an excursion to the
            // toolbar — and until now threw the only key that could finish it away.
            leavePane();
            pressEnter();

            expect(dispatched()).toEqual(['pool.create']);
            const payload = (bus.executeCommand.mock.calls as unknown as unknown[][])[0]![1] as
                { boundary: unknown[] };
            // FOUR vertices — the ring closes back to the first point implicitly, which
            // is the "4th segment" he asked for. The first vertex is NOT repeated: that
            // is the slab / boundary-line convention and the L0 schema refuses a
            // duplicated closing vertex.
            expect(payload.boundary).toHaveLength(4);
        });

        it('B-2: ⭐ BOUNDARY LINE — same gesture, same key, same result', () => {
            installWorld(true);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();

            click(0, 0);
            click(10, 0);
            click(10, 6);

            leavePane();
            pressEnter();

            expect(dispatched()).toEqual(['boundaryLine.create']);
        });

        it('B-3: Enter still works with the pointer ON the pane (no regression)', () => {
            installWorld(true);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            click(2, 2);
            click(10, 2);
            click(10, 8);
            pressEnter();
            expect(dispatched()).toEqual(['pool.create']);
        });

        it('B-4: ⛔ Enter with NO stroke and no hover creates nothing', () => {
            installWorld(true);
            svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
            activatePlanOnlyToolOrExplain('pool', 'Swimming Pool');
            enterPane();
            leavePane();
            pressEnter();
            expect(dispatched()).toEqual([]);
        });
    });

    // ── ARM C — the per-MODE census ──────────────────────────────────
    //
    // ⭐ ⛔ "THE TOOL WORKS NOW" IS NOT A MEASUREMENT. The founder was told the pool
    // worked three times. Each mode gets its own gesture and its own assertion, so a
    // report can say WHICH of the six create and which do not — and so a mode that
    // stops committing fails BY NAME rather than hiding behind the other five.
    //
    // ⚠ THE MODE IS SET THROUGH THE SESSION'S OWN STORE TABLE, NOT BY CALLING THE
    // SETTER DIRECTLY. That distinction is the whole of L-9302: before this lane
    // `PLAN_ONLY_MODE_STORES` had no `boundary-line` row, so
    // `setActiveBoundaryLineDrawMode` had ZERO production writers and the existing
    // spec's `rectangular` arm was green while the mode was unreachable on every
    // screen. Driving the mode through `planOnlyToolModeStore(tool)` measures the
    // channel a person actually has.
    describe('ARM C — every declared mode, per tool, measured one at a time', () => {
        /** Set the mode the way the mode strip does — through the session's store table. */
        const setMode = (tool: string, mode: string): void => {
            const store = planOnlyToolModeStore(tool);
            expect(store, `no mode store for ${tool} — its strip cannot be mounted`).toBeTruthy();
            store!.write(mode);
            expect(store!.read()).toBe(mode);
        };

        /** The open modes finish on Enter; the closed loops commit on the second click. */
        const LOOP_MODES = ['rectangular', 'circular', 'elliptical'] as const;

        for (const [tool, label, command] of [
            ['pool', 'Swimming Pool', 'pool.create'],
            ['boundary-line', 'Boundary Line', 'boundaryLine.create'],
        ] as const) {
            for (const mode of ['linear', 'ortho', 'curved', ...LOOP_MODES] as const) {
                it(`C — ${tool} / ${mode} commits`, () => {
                    installWorld(true);
                    svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
                    expect(activatePlanOnlyToolOrExplain(tool, label)).toBe(true);
                    enterPane();
                    setMode(tool, mode);

                    if ((LOOP_MODES as readonly string[]).includes(mode)) {
                        // Two opposite corners / centre + rim. `boundaryLoopVertices()`
                        // is the shared generator, so all three share one gesture.
                        click(2, 2);
                        expect(dispatched()).toEqual([]);
                        click(12, 9);
                    } else if (mode === 'curved') {
                        // The wall tool's three-click arc: vertex → arc MIDPOINT → arc END.
                        click(2, 2);
                        click(7, 5);
                        click(12, 2);
                        pressEnter();
                    } else {
                        // linear / ortho — an open polyline the architect closes.
                        click(2, 2);
                        click(12, 2);
                        click(12, 9);
                        pressEnter();
                    }

                    expect(dispatched()).toEqual([command]);
                });
            }
        }
    });
});
