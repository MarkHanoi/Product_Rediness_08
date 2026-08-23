/**
 * §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7935..L-7938) · C105 · C11 · **C104 R-10**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE POINTER-LAYER ARM: A REAL DOM EVENT REACHES THE ARMED HANDLER.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * C104 R-10 makes a reachability claim **INADMISSIBLE** without a proof at this layer,
 * and the reason is measured rather than theoretical: three compounds — pool, balcony,
 * lift — shipped on consecutive days, each with a green composed-runtime suite, and
 * ALL THREE were unusable by a person. `liftReachableThroughComposedRuntime.test.ts`
 * says so in its own header: *"It does NOT prove that a person can click a Lift button
 * and get one."*
 *
 * `boundaryLineReachableThroughComposedRuntime.test.ts` proves the command is
 * DISPATCHABLE — which is what catches a missing `PluginRegistry` descriptor, a real
 * and hard-won property. **THIS file proves the other half**: it starts from the REAL
 * palette call (`activatePlanOnlyToolOrExplain`, the function both palette rows
 * invoke), attaches the REAL split-view plan overlay to a canvas, and dispatches REAL
 * DOM `MouseEvent`s at it. Nothing about the pointer path is stubbed: the listeners,
 * the capture phases, the focus gating, the screen→world transform and the handler's
 * own state machine all run. If a click cannot get from the canvas to the handler, no
 * assertion here can pass.
 *
 * ⛔ AND IT IS DELIBERATELY THE **SPLIT-VIEW** OVERLAY, for the reason
 * `pointerReachesArmedHandler.spec.ts` established: the founder's working layout is
 * 3-D left / plan right, and his console named `SvpPlanToolOverlay` every time. A test
 * against the standalone plan overlay would have been green and irrelevant.
 *
 * ⚠ THIS FILE IS SEPARATE FROM `pointerReachesArmedHandler.spec.ts` ON PURPOSE. That
 * file is owned by the lane fixing the shared plan-only tool SESSION (Escape not
 * ending a plan tool), and two lanes editing one spec on a shared tree is how a fix
 * gets clobbered. The two share no state: Vitest isolates module registries per file.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS.
// happy-dom's `HTMLCanvasElement.getContext('2d')` returns **null** (measured), and
// the overlay treats a null context as "cannot build a draw context" and refuses to
// arm the handler at all — so without this every arm below would fail for a reason
// that has nothing to do with the subject. It doubles as the PREVIEW PROBE: ARM A
// asserts against the calls it records, which is how "I could not see it draw" becomes
// a measurable claim rather than a screenshot.
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
// §R3-SENTINEL — the overlay refuses to arm a handler until initTools has completed.
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { viewDefinitionStore } from '@pryzm/core-app-model';
import { svpPlanToolOverlay } from '../../SvpPlanToolOverlay';
import {
    activatePlanOnlyToolOrExplain,
    endPlanOnlyToolSession,
} from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import { creationModes } from '../elementCreationMatrix';
import { PLAN_TOOL_KEYS } from '../planToolHandlerRegistry';
import {
    __resetActiveBoundaryLineDrawModeForTests,
    setActiveBoundaryLineDrawMode,
    setActiveBoundaryLineHasVolume,
    resolveActiveBoundaryLineDrawMode,
} from '../activeBoundaryLineDrawMode';
import { BOUNDARY_LINE_DRAW_MODES } from '@pryzm/geometry-boundary-line';
import { CREATION_TOOL_SHORTCUTS } from '@app/ui/tools-panel/panels/creationToolShortcuts';

const VIEW_ID = 'vd-boundary-line-pointer-probe';
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

function installWorld(): void {
    bus.executeCommand.mockClear();
    toasts.length = 0;
    drawCalls.length = 0;

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
        stores: {},
    };
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
    w.toolManager = { getActiveTool: () => 'none', subscribe: () => (): void => undefined };
    w.bimManager = { getLevelById: () => ({ elevation: 0 }), getLevels: () => [{ id: 'level-1', elevation: 0 }] };
}

const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };
const hover = (x: number, z: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { ...px(x, z), bubbles: true }));
};
const click = (x: number, z: number): void => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, ...px(x, z), bubbles: true }));
};
const dblClick = (x: number, z: number): void => {
    canvas.dispatchEvent(new MouseEvent('dblclick', { ...px(x, z), bubbles: true }));
};

const busCalls = (): unknown[][] => bus.executeCommand.mock.calls as unknown as unknown[][];
const dispatched = (): string[] => busCalls().map((c) => String(c[0]));
const payloadFor = (type: string): Record<string, unknown> | undefined =>
    busCalls().find((c) => c[0] === type)?.[1] as Record<string, unknown> | undefined;

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — a pointer event reaches the ARMED handler', () => {
    beforeAll(() => {
        // The shared `DrawingModeBar` refuses to render during onboarding
        // (§AUTHORING-CONTEXT-GATE, L-5103) and the default phase is `onboarding-globe`.
        // A test that skipped this would measure the gate, not the strip.
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Boundary-line pointer probe',
            viewType: 'plan',
            spatial: { levelId: 'level-1' },
        });
    });

    beforeEach(() => {
        installWorld();
        __resetActiveBoundaryLineDrawModeForTests();
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
        it('A-1: ⭐ TWO CLICKS AND A DOUBLE-CLICK DRAW A BOUNDARY LINE', () => {
            // THE FOUNDER'S GESTURE, END TO END, THROUGH THE REAL PALETTE CALL.
            expect(activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line')).toBe(true);
            enterPane();

            drawCalls.length = 0;
            click(2, 2);
            hover(8, 2);
            // ⭐ THE PREVIEW IS MEASURABLE: a hover that reached the handler MUST have
            // stroked a path. "It didn't preview" is what the founder reported for the
            // balcony, and this is that claim made falsifiable.
            expect(drawCalls).toContain('stroke');

            click(8, 2);
            expect(dispatched()).toEqual([]);   // an unfinished polyline is not yet a line
            dblClick(8, 2);

            expect(dispatched()).toEqual(['boundaryLine.create']);
            const p = payloadFor('boundaryLine.create')!;
            expect(p.levelId).toBe('level-1');
            expect((p.vertices as unknown[]).length).toBe(2);
            expect(p.closed).toBe(false);
            // ⭐ LINEWORK BY DEFAULT. A line that silently arrived as a 3 m solid would
            // put a wall across the plan the moment the architect set anything out.
            expect(p.hasVolume).toBe(false);
        });

        it('A-2: ⭐ TWO CLICKS ARE ENOUGH — a boundary line is a PATH, not an area', () => {
            // The one place this tool genuinely differs from the pool / slab / balcony,
            // all of which need three vertices. A single 10 m run IS a setting-out line,
            // and requiring a third point would have made the commonest gesture
            // impossible while every test still passed.
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(0, 0);
            click(10, 0);
            dblClick(10, 0);
            expect(dispatched()).toEqual(['boundaryLine.create']);
        });

        it('A-3: ⭐ A CLOSED SHAPE MODE COMMITS ON THE SECOND CLICK, AS A RING', () => {
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            setActiveBoundaryLineDrawMode('rectangular');
            expect(resolveActiveBoundaryLineDrawMode()).toBe('rectangular');

            click(0, 0);
            expect(dispatched()).toEqual([]);
            click(10, 6);

            expect(dispatched()).toEqual(['boundaryLine.create']);
            const p = payloadFor('boundaryLine.create')!;
            // Four corners, CLOSED, and — the load-bearing half — an OPEN loop: the
            // first vertex is NOT repeated at the end. That is the Slab / Pool / Balcony
            // convention, so a ring handed from this family to any of them needs no
            // re-normalisation, and the L0 schema REFUSES a duplicated closing vertex.
            expect(p.closed).toBe(true);
            expect((p.vertices as unknown[]).length).toBe(4);
            const v = p.vertices as Array<{ x: number; z: number }>;
            expect(v[0]!.x === v[3]!.x && v[0]!.z === v[3]!.z).toBe(false);
        });

        it('A-4: ⭐ THE VOLUME BOOL REACHES THE PAYLOAD — the founder`s "could have volume"', () => {
            setActiveBoundaryLineHasVolume(true);
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(0, 0);
            click(10, 0);
            dblClick(10, 0);
            expect(payloadFor('boundaryLine.create')!.hasVolume).toBe(true);
        });

        it('A-5: a mid-draw MODE SWITCH applies to the very next click, without re-arming', () => {
            // §FEAT-PERSISTENT-MODE-BAR: the mode is re-read on every sample, so
            // switching does NOT destroy the in-progress stroke. A tool that re-armed
            // would silently drop the vertices already placed.
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(0, 0);
            setActiveBoundaryLineDrawMode('ortho');
            // Ortho constrains the segment to an axis: a click off-axis lands ON the axis.
            click(10, 3);
            dblClick(10, 3);
            const v = payloadFor('boundaryLine.create')!.vertices as Array<{ x: number; z: number }>;
            expect(v).toHaveLength(2);
            // One of the two coordinates must have been snapped back to the first point.
            expect(v[1]!.x === v[0]!.x || v[1]!.z === v[0]!.z).toBe(true);
        });
    });

    // ── ARM B ────────────────────────────────────────────────────────────────
    describe('ARM B — the declaration, the strip and the registry cannot drift', () => {
        it('B-1: `boundary-line` is a plan-tool key, so BOTH plan surfaces have it', () => {
            // The L-73 parity guarantee: one shared registry, so a tool cannot exist in
            // the main plan view and silently not in the split pane.
            expect(PLAN_TOOL_KEYS as readonly string[]).toContain('boundary-line');
        });

        it('B-2: ⭐ THE DECLARED MODES ARE EXACTLY THE FOUNDER`S SIX', () => {
            const ids = creationModes('boundary-line').map((m) => m.id);
            //   "like the wall, with the same modes for creation — line, ortho,
            //    rectangle, ellipse, curve, circle etc."
            expect(ids).toEqual(expect.arrayContaining([
                'linear', 'ortho', 'curved', 'rectangular', 'circular', 'elliptical',
            ]));
            // ⛔ Compared against the GEOMETRY package's union as a SET, in both
            // directions — never a hand-typed list. One source, so the strip and the
            // generator cannot offer different sets (§FIX-STAIR-SHAPE-DESYNC).
            expect(new Set(ids)).toEqual(new Set(BOUNDARY_LINE_DRAW_MODES));
        });

        it('B-3: every accelerator inside the strip is UNIQUE', () => {
            // A duplicate key makes a pill unreachable by keyboard and silently picks
            // whichever the finder hits first.
            const keys = creationModes('boundary-line').map((m) => m.key.toUpperCase());
            expect(new Set(keys).size).toBe(keys.length);
        });

        it('B-4: the palette shortcut is declared, and collides with nothing', () => {
            // `assertNoShortcutCollisions()` runs at IMPORT time and would throw the
            // editor's own boot on a clash — so this asserts the row EXISTS, which is
            // the half an import-time guard cannot check. A tool rendered with no entry
            // advertises a shortcut it cannot fire (C84 EI-3, smallest possible form).
            expect(CREATION_TOOL_SHORTCUTS['Boundary Line']).toBe('Alt+Shift+N');
            const combos = Object.values(CREATION_TOOL_SHORTCUTS);
            expect(combos.filter((c) => c === 'Alt+Shift+N')).toHaveLength(1);
        });
    });

    // ── ARM C ────────────────────────────────────────────────────────────────
    describe('ARM C — it refuses OUT LOUD rather than silently doing nothing', () => {
        it('C-1: with NO plan surface attached the palette REFUSES, in a toast', () => {
            svpPlanToolOverlay.detach();
            toasts.length = 0;
            expect(activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line')).toBe(false);
            // L-7005 — the refusal reaches a PERSON. `pryzm:toast` had 40+ emitters and
            // (measured) ZERO subscribers; `runtime.toasts` is the slot `initUI.ts` uses
            // for every message the user actually sees.
            expect(toasts).toHaveLength(1);
            expect(toasts[0]!.kind).toBe('error');
            expect(toasts[0]!.message).toMatch(/no plan view is open/i);
            // C16 CA-18 — the reason AND the route back to success.
            expect(toasts[0]!.message).toMatch(/split view/i);
        });

        it('C-2: a single click commits NOTHING — one point is not a line', () => {
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(4, 4);
            dblClick(4, 4);
            // Fails against a handler that commits whatever it has: a one-vertex record
            // would be refused by the L0 schema as a rejected dispatch the user has to
            // decode, instead of simply not being sent.
            expect(dispatched()).toEqual([]);
        });
    });
});
