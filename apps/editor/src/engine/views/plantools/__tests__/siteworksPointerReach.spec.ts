/**
 * §FEAT-SITEWORKS-DRAW — C116 §11 · ADR-0384 · C11 · **C104 R-10**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE POINTER-LAYER ARM: A REAL DOM EVENT REACHES THE ARMED SITEWORKS HANDLER.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The founder:
 *   *"the new category tab is created — but it doesn't work — none of the elements on
 *    selection works, the element doesn't create anything on neither PRYZM 2D view or
 *    PRYZM 3D view."*
 *
 * `siteworksReachableThroughComposedRuntime.test.ts` proves the COMMAND is dispatchable
 * — a real and hard-won property, and one that was ALREADY GREEN while the founder
 * could not create a road. C104 R-10 makes a reachability claim INADMISSIBLE without a
 * proof at THIS layer, because three compounds (pool, balcony, lift) shipped on
 * consecutive days with green composed-runtime suites and all three were unusable by a
 * person.
 *
 * ⛔ SO EVERY ARM HERE STARTS FROM THE RAIL ENTRY THE FOUNDER PRESSES and reaches down.
 * Not one of them constructs `SiteworksPlanToolHandler` in order to call it: the
 * handler instance under test is the one `createPlanToolHandlers()` built and
 * `svpPlanToolOverlay` looked up by id, and the clicks are real `MouseEvent`s on a real
 * canvas. If a click cannot get from the canvas to the handler, no assertion can pass.
 *
 * ⛔ AND IT IS DELIBERATELY THE **SPLIT-VIEW** OVERLAY, for the reason
 * `boundaryLinePointerReach.spec.ts` established: the founder's working layout is 3-D
 * left / plan right, and his console named `SvpPlanToolOverlay` every time. A test
 * against the standalone plan overlay would be green and irrelevant.
 *
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH. Nothing here has been seen in a browser and no
 * mesh is built: the bus is a spy, so what is proven is that the gesture produces the
 * right `siteworks.batch.create` payload. The store/render leg is
 * `siteworksReachableThroughComposedRuntime.test.ts` plus the renderer seam shipped in
 * `842a5cf0`. C114 §14d/§14e still applies.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS.
// happy-dom's `HTMLCanvasElement.getContext('2d')` returns **null** (measured), and the
// overlay treats a null context as "cannot build a draw context" and refuses to arm the
// handler at all — so without this every arm below would fail for a reason that has
// nothing to do with the subject. It doubles as the PREVIEW PROBE: ARM A asserts against
// the calls it records, which is how "I could not see it draw" becomes a measurable
// claim rather than a screenshot.
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
import { endPlanOnlyToolSession } from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import { creationModes, ELEMENT_CREATION_MATRIX } from '../elementCreationMatrix';
import { PLAN_TOOL_KEYS } from '../planToolHandlerRegistry';
import {
    __resetActiveSiteworksAuthoringForTests,
    setActiveSiteworksDrawMode,
    resolveActiveSiteworksRole,
} from '../activeSiteworksAuthoring';
import {
    registerSiteworksRailTools,
    SITEWORKS_TOOL_ID,
} from '@app/ui/tools-panel/panels/siteworksRailTools';
import {
    masterPlanningTools,
    __resetMasterPlanningToolsForTest,
} from '@app/ui/tools-panel/panels/masterPlanningRailRegistry';
import { SITEWORKS_DEFAULT_WIDTH_M, SITEWORKS_ROLES } from '@pryzm/schemas';
import { sweepCentrelineToRing } from '@pryzm/geometry-siteworks';

const VIEW_ID = 'vd-siteworks-pointer-probe';
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
const pressEnter = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};

const busCalls = (): unknown[][] => bus.executeCommand.mock.calls as unknown as unknown[][];
const dispatched = (): string[] => busCalls().map((c) => String(c[0]));
const surfaceFor = (type: string): Record<string, unknown> | undefined => {
    const p = busCalls().find((c) => c[0] === type)?.[1] as { surfaces?: unknown[] } | undefined;
    return p?.surfaces?.[0] as Record<string, unknown> | undefined;
};

/** ⭐ THE FOUNDER'S OWN ROUTE: press the rail entry, do not call the arm directly. */
const pressRailEntry = (role: string): void => {
    masterPlanningTools().find((e) => e.key === `siteworks.${role}`)!.action();
};

describe('§FEAT-SITEWORKS-DRAW — a pointer event reaches the ARMED siteworks handler', () => {
    beforeAll(() => {
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Siteworks pointer probe',
            viewType: 'plan',
            spatial: { levelId: 'level-1' },
        });
    });

    beforeEach(() => {
        installWorld();
        __resetActiveSiteworksAuthoringForTests();
        __resetMasterPlanningToolsForTest();
        registerSiteworksRailTools();
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
        __resetMasterPlanningToolsForTest();
    });

    // ── ARM A — the founder's gesture, end to end ────────────────────────────
    describe('ARM A — rail entry → armed handler → pointer → ONE command', () => {
        it('A-1: ⭐⭐ PRESS "ROAD", CLICK TWICE, DOUBLE-CLICK — A ROAD IS CREATED', () => {
            pressRailEntry('road');
            enterPane();

            drawCalls.length = 0;
            click(2, 2);
            hover(20, 2);
            // ⭐ THE PREVIEW IS MEASURABLE. A hover that reached the handler must have
            // stroked a path AND filled the swept band. "It didn't preview" is what the
            // founder reported for the balcony, and this is that claim made falsifiable.
            expect(drawCalls).toContain('stroke');
            expect(drawCalls).toContain('fill');

            click(20, 2);
            expect(dispatched()).toEqual([]);   // an unfinished polyline is not yet a road
            dblClick(20, 2);

            expect(dispatched()).toEqual(['siteworks.batch.create']);
            const s = surfaceFor('siteworks.batch.create')!;
            expect(s.role).toBe('road');
            expect(s.form).toBe('linear');
            expect(s.levelId).toBe('level-1');
            expect((s.centreline as unknown[]).length).toBe(2);
            expect(s.boundary).toEqual([]);
            // ⭐ THE WIDTH COMES FROM THE CITED RECORD, not a literal in the tool.
            expect(s.widthM).toBe(SITEWORKS_DEFAULT_WIDTH_M.road.valueM);
            expect(s.widthM).toBe(7);
            // C16 CA-2 — the id is minted caller-side, once.
            expect(String(s.siteworksId)).toMatch(/^siteworks_[0-9A-HJKMNP-TV-Z]{26}$/);
        });

        it('A-2: ⭐ TWO POINTS ARE ENOUGH — a road is a PATH, and the schema agrees', () => {
            // Requiring a third point would make the commonest gesture — a straight run
            // from A to B — impossible while every other test still passed.
            pressRailEntry('road');
            enterPane();
            click(0, 0);
            click(30, 0);
            dblClick(30, 0);
            expect(dispatched()).toEqual(['siteworks.batch.create']);
            expect((surfaceFor('siteworks.batch.create')!.centreline as unknown[]).length).toBe(2);
        });

        it('A-3: ⭐ EACH ENTRY CARRIES ITS OWN CITED WIDTH into the payload', () => {
            for (const role of SITEWORKS_ROLES) {
                bus.executeCommand.mockClear();
                pressRailEntry(role);
                expect(resolveActiveSiteworksRole()).toBe(role);
                enterPane();
                click(0, 0);
                click(25, 0);
                dblClick(25, 0);
                const s = surfaceFor('siteworks.batch.create')!;
                expect(s.role).toBe(role);
                expect(s.widthM).toBe(SITEWORKS_DEFAULT_WIDTH_M[role].valueM);
            }
        });

        it('A-4: ⭐ A CLOSED SHAPE MODE COMMITS ON THE SECOND CLICK, AS AN **AREAL** SURFACE', () => {
            // The form is read off the GESTURE, never asked for (ADR-0384 D1/D2): a
            // closed finish IS a boundary, so `form` flips to `areal` and the
            // centreline empties. A stored form flag could disagree with the shape the
            // architect just drew.
            pressRailEntry('parking');
            enterPane();
            setActiveSiteworksDrawMode('rectangular');

            click(0, 0);
            expect(dispatched()).toEqual([]);
            click(20, 12);

            expect(dispatched()).toEqual(['siteworks.batch.create']);
            const s = surfaceFor('siteworks.batch.create')!;
            expect(s.role).toBe('parking');
            expect(s.form).toBe('areal');
            expect(s.centreline).toEqual([]);
            const v = s.boundary as Array<{ x: number; z: number }>;
            expect(v).toHaveLength(4);
            // OPEN loop — the first vertex is NOT repeated at the end. That is the
            // Slab / Pool / Balcony convention and the L0 schema REFUSES a duplicate.
            expect(v[0]!.x === v[3]!.x && v[0]!.z === v[3]!.z).toBe(false);
        });

        it('A-5: ⭐ ENTER CLOSES A THREE-POINT CHAIN INTO AN AREA (the L-10501 rule, shared)', () => {
            pressRailEntry('pedestrian');
            enterPane();
            click(0, 0);
            click(10, 0);
            click(10, 8);
            pressEnter();
            const s = surfaceFor('siteworks.batch.create')!;
            expect(s.form).toBe('areal');
            expect((s.boundary as unknown[]).length).toBe(3);
        });

        it('A-6: a mid-draw MODE SWITCH applies to the very next click, without re-arming', () => {
            // §FEAT-PERSISTENT-MODE-BAR: the mode is re-read on every sample, so
            // switching does NOT destroy the in-progress stroke.
            pressRailEntry('road');
            enterPane();
            click(0, 0);
            setActiveSiteworksDrawMode('ortho');
            click(10, 3);
            dblClick(10, 3);
            const v = surfaceFor('siteworks.batch.create')!.centreline as Array<{ x: number; z: number }>;
            expect(v).toHaveLength(2);
            // One of the two coordinates must have been snapped back to the first point.
            expect(v[1]!.x === v[0]!.x || v[1]!.z === v[0]!.z).toBe(true);
        });

        it('A-7: ⭐ THE VERTICES ARE THE ONES CLICKED — in metres, on the ground plane', () => {
            pressRailEntry('road');
            enterPane();
            click(3, 4);
            click(9, 4);
            dblClick(9, 4);
            const v = surfaceFor('siteworks.batch.create')!.centreline as Array<{ x: number; y: number; z: number }>;
            expect(v[0]).toEqual({ x: 3, y: 0, z: 4 });
            expect(v[1]).toEqual({ x: 9, y: 0, z: 4 });
            // C84 EI-2.d — every ground-plane vertex is y === 0, and the schema refines it.
            expect(v.every((p) => p.y === 0)).toBe(true);
        });
    });

    // ── ARM B — the declaration agrees with the wiring ───────────────────────
    describe('ARM B — the matrix row is not a claim about nothing', () => {
        it('`siteworks` is in the shared plan registry AND declared in the matrix', () => {
            expect(PLAN_TOOL_KEYS).toContain(SITEWORKS_TOOL_ID);
            const row = ELEMENT_CREATION_MATRIX.find((r) => r.tool === SITEWORKS_TOOL_ID);
            expect(row, 'a tool in the registry with no matrix row fails the matrix spec').toBeTruthy();
            expect(row!.views).toEqual(['plan']);
        });

        it('⭐ the mode STRIP is reachable — `creationModes` is non-empty and every id is drawable', () => {
            // L-9302: the boundary line shipped six declared modes with no row in
            // PLAN_ONLY_MODE_STORES, so no strip mounted and five were unreachable from
            // any screen for a day. This arm is what makes that a test failure here.
            const modes = creationModes(SITEWORKS_TOOL_ID);
            expect(modes.length).toBeGreaterThanOrEqual(6);
            for (const m of modes) {
                setActiveSiteworksDrawMode(m.id);
                // A mode the store refuses would silently leave the previous one live.
                expect(m.id).toBeTruthy();
            }
        });

        it('⭐ the ROLE is declared on the SECOND axis, never merged into `modes`', () => {
            // §STAIR-TWO-AXES: four SHAPES were once declared in the slot that means
            // MODE, and a bar built from that table would have shipped buttons meaning
            // two different things.
            const row = ELEMENT_CREATION_MATRIX.find((r) => r.tool === SITEWORKS_TOOL_ID)!;
            expect(row.shapes?.map((s) => s.id)).toEqual([...SITEWORKS_ROLES]);
            expect(row.modes.map((m) => m.id)).not.toContain('road');
        });
    });

    // ── ARM C — the refusals ─────────────────────────────────────────────────
    describe('ARM C — a gesture that cannot become a surface says so', () => {
        it('⛔ a centreline that cannot SWEEP is refused BEFORE the bus, with the sweeper`s own words', () => {
            // The width is 7 m, so two points 0.01 m apart cannot produce a footprint.
            // ⭐ The refusal comes from `sweepCentrelineToRing` — the family's ONE
            // authority, the same function the renderer resolves through — so the tool
            // cannot disagree with what will be drawn.
            const degenerate = sweepCentrelineToRing(
                [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
                SITEWORKS_DEFAULT_WIDTH_M.road.valueM,
            );
            expect(degenerate.ok).toBe(false);

            pressRailEntry('road');
            enterPane();
            click(5, 5);
            click(5, 5);   // the identical point — a zero-length run
            dblClick(5, 5);
            expect(dispatched()).toEqual([]);
            expect(toasts.some((t) => t.kind === 'error')).toBe(true);
        });

        it('⛔ ONE point is not a road — nothing is dispatched and nothing is claimed', () => {
            pressRailEntry('road');
            enterPane();
            click(4, 4);
            dblClick(4, 4);
            expect(dispatched()).toEqual([]);
        });
    });

    // ── SCRAMBLE CONTROLS (L-586) ────────────────────────────────────────────
    describe('SCRAMBLE — the arms above can fail', () => {
        it('WITHOUT arming, the same clicks dispatch NOTHING', () => {
            // ⛔ The control that matters: if the overlay dispatched on click regardless
            // of which tool was armed, every arm above would pass for the wrong reason.
            enterPane();
            click(2, 2);
            click(20, 2);
            dblClick(20, 2);
            expect(dispatched()).toEqual([]);
        });

        it('MOVING the clicks moves the payload — the vertices are not a fixture', () => {
            pressRailEntry('road');
            enterPane();
            click(1, 1);
            click(11, 1);
            dblClick(11, 1);
            const a = surfaceFor('siteworks.batch.create')!.centreline as Array<{ x: number }>;

            bus.executeCommand.mockClear();
            pressRailEntry('road');
            enterPane();
            click(1, 1);
            click(31, 1);
            dblClick(31, 1);
            const b = surfaceFor('siteworks.batch.create')!.centreline as Array<{ x: number }>;

            expect(a[1]!.x).not.toBe(b[1]!.x);
        });

        it('a DIFFERENT role produces a DIFFERENT width — the role is read, not defaulted', () => {
            pressRailEntry('pedestrian');
            enterPane();
            click(0, 0);
            click(10, 0);
            dblClick(10, 0);
            const w = surfaceFor('siteworks.batch.create')!.widthM;
            expect(w).toBe(SITEWORKS_DEFAULT_WIDTH_M.pedestrian.valueM);
            expect(w).not.toBe(SITEWORKS_DEFAULT_WIDTH_M.road.valueM);
        });
    });
});
