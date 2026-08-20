import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
    StairPathToolController,
    setActiveStairDrawMode,
    resolveActiveStairDrawMode,
    resetStairToolConfig,
    DEFAULT_STAIR_DRAW_MODE,
} from '@pryzm/geometry-stair';
import { DrawingModeBar } from '@app/ui/DrawingModeBar';
import {
    creationModes,
    creationModeIds,
    creationShapes,
    twoAxisCapabilities,
} from '../elementCreationMatrix';

/**
 * §FEAT-STAIR-CREATION-MODES (founder, 2026-08-19) — L-1450 / L-1451.
 *
 * THE FOUNDER, verbatim:
 *   "I want the stairs to have the possibility to decide if the creation is
 *    ORTHOGONAL or LINE ... use the UI/UX as the walls: MODE + STAIR TYPE."
 *
 * -- WHAT THIS SUITE ASSERTS, AND WHY IT IS NOT A RENDER TEST -----------------
 *
 * A picker that renders is worth nothing; five families already learned that here.
 * Every mode assertion below drives the REAL production chain end to end --
 *
 *   the real `DrawingModeBar` pill  (the component `ToolsAreaLayout` mounts)
 *     -> the production `onSelect`  (`setActiveStairDrawMode`, byte-for-byte)
 *     -> the shared `StairToolConfigStore`
 *     -> `resolveActiveStairDrawMode()` as the `drawingModeProvider`
 *        (byte-for-byte what `StairPathPlanToolHandler` now passes)
 *     -> the real `StairPathToolController`
 *     -> the real `CreateStairCommand` it dispatches
 *
 * -- and then asserts THE RESULTING STAIR'S FLIGHT DIRECTIONS. Not that a pill has
 * a class. The command payload is the last thing before the store, so if these pass,
 * a click on the pill demonstrably changed the geometry the architect gets.
 *
 * -- THE DEFECT THIS CLOSES WAS REACHABILITY, NOT ABSENCE ---------------------
 *
 * Both modes were already BUILT on both surfaces. `StairCreationController` (3-D)
 * snapped to 90 degrees BY DEFAULT; `StairPathToolController._snapTo90` (plan) did
 * the identical thing but only while SHIFT was HELD; and `StairToolConfigStore`
 * already carried `mode?: 'linear' | 'ortho'`. What did not exist was a picker on
 * either surface, a plan-side READ of that field, or a declaration of the axis --
 * so the capability was committed, shipped, and reachable by nobody, under a matrix
 * row that already claimed `modeSource: 'shared'`.
 */

// The plan controller builds a Canvas2D overlay. happy-dom has no 2-D context, so
// the renderer throws at construction -- a test-environment gap, not a behaviour.
// Everything asserted below is world-space arithmetic that never touches the ctx.
beforeAll(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
        () => new Proxy({}, { get: () => () => undefined });
});

interface CapturedStair {
    input: {
        shape: string;
        flights: Array<{ direction: { x: number; y: number; z: number } }>;
        startPosition: { x: number; y: number; z: number };
    };
}

/**
 * The production wiring, assembled exactly as the two shipped call sites do it:
 * the bar's `onSelect` from `ToolsAreaLayout.activateStairPathTool`, and the
 * controller's `drawingModeProvider` from `StairPathPlanToolHandler._activate`.
 */
function mountStairTool(bar: DrawingModeBar, shape: 'I' | 'L') {
    const dispatched: CapturedStair[] = [];
    const refusals: string[] = [];

    bar.show({
        label: 'Mode:',
        modes: creationModes('stair-path'),
        initialMode: resolveActiveStairDrawMode(),
        onSelect: (id) => setActiveStairDrawMode(id),
    });

    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    const ctrl = new StairPathToolController({
        container: document.body,
        coordinateCanvas: canvas,
        planViewCanvas: {
            worldToScreen: (x: number, z: number) => ({ x, y: z }),
            screenToWorld: (x: number, y: number) => ({ x, z: y }),
        } as never,
        commandManager: { execute: (c: unknown) => dispatched.push(c as CapturedStair) },
        baseLevelId: 'L0',
        topLevelId: 'L1',
        baseLevelElevation: 0,
        topLevelElevation: 3,
        width: 1.2,
        initialShape: shape,
        drawingModeProvider: () => resolveActiveStairDrawMode(),
        onInvalid: (m: string) => refusals.push(m),
    });
    ctrl.activate();
    return { ctrl, dispatched, refusals };
}

/** Let the controller's auto-finish (`setTimeout(_finish, 0)`) run. */
const settle = () => new Promise((r) => setTimeout(r, 60));

const pill = (id: string) =>
    document.querySelector<HTMLButtonElement>('.wdh-bar .wdh-btn[data-mode="' + id + '"]')!;

describe('FEAT-STAIR-CREATION-MODES -- the stair gains the WALL second axis', () => {
    let bar: DrawingModeBar;

    beforeEach(() => {
        document.body.innerHTML = '';
        resetStairToolConfig();
        bar = new DrawingModeBar();
    });
    afterEach(() => bar.dismiss());

    describe('THE TWO AXES ARE SEPARATE -- the trap this whole change exists to avoid', () => {
        it('MODE is linear/ortho and SHAPE is I/L/U/C -- and they never share a control', () => {
            // Before this change both stair rows declared `modes: STAIR_SHAPE_MODES`,
            // i.e. the four SHAPES were sitting in the MODE slot. A bar built from
            // that declaration would have shown four buttons that describe the
            // RESULT while the founder was asking for the buttons that describe the
            // GESTURE. That is one strip whose letters mean two different things.
            for (const tool of ['stair', 'stair-path']) {
                // 'bywall' is an ACTION on the MODE axis (it derives the sketch), not a
                // shape. It joins the strip; it does not join the shape picker.
                expect(creationModeIds(tool)).toEqual(['linear', 'ortho', 'bywall']);
                expect(creationShapes(tool).map((s) => s.id)).toEqual(['I', 'L', 'U', 'C']);

                const modeIds = new Set(creationModes(tool).map((m) => m.id));
                for (const shape of creationShapes(tool)) {
                    expect(
                        modeIds.has(shape.id),
                        tool + ': shape "' + shape.id + '" leaked into the mode bar',
                    ).toBe(false);
                }
            }
        });

        it('CURVED stays a SHAPE and is deliberately NOT a mode (C98 s16, stated open)', () => {
            // A `curved` MODE plus a `C` SHAPE would put one letter on one bar
            // meaning two things. Shipping two honest modes and a written OPEN
            // QUESTION beats shipping three and a conflation.
            expect(creationModeIds('stair-path')).not.toContain('curved');
            expect(creationShapes('stair-path').map((s) => s.id)).toContain('C');
        });

        it('stair is the ONLY two-axis family -- nobody else acquired a shapes list', () => {
            expect(twoAxisCapabilities().map((c) => c.tool)).toEqual(['stair', 'stair-path']);
        });

        it('REGRESSION PIN: splitting the axes changed NO other family mode set', () => {
            // The matrix is a SHARED declaration five families read. A "harmless"
            // refactor of an enumerated authority is exactly where one change
            // becomes five regressions.
            expect(creationModeIds('wall')).toEqual(
                ['linear', 'ortho', 'curved', 'byslab', 'rectangular', 'circular', 'elliptical']);
            expect(creationModeIds('slab')).toEqual(
                ['linear', 'ortho', 'curved', '2point', 'circular', 'elliptical', 'region', 'hollow', 'pickWalls']);
            expect(creationModeIds('floor')).toEqual(
                ['linear', 'ortho', 'curved', 'rectangle', 'circular', 'elliptical', 'auto']);
            expect(creationModeIds('ceiling')).toEqual(creationModeIds('floor'));
            expect(creationModeIds('railing')).toEqual(
                ['linear', 'ortho', 'curved', 'byslab', 'square', 'circular', 'ellipse']);
            // ...and none of them gained a shapes axis they never asked for.
            for (const tool of ['wall', 'slab', 'floor', 'ceiling', 'railing']) {
                expect(creationShapes(tool)).toEqual([]);
            }
        });

        it('the stair bar reuses the WALL Linear/Ortho declarations, not retyped copies', () => {
            // Identity, not deep-equality: drift in a label or an accelerator between
            // the wall bar and the stair bar is impossible if it is the same object.
            const wallModes = creationModes('wall');
            // Only the two SHARED modes are wall's objects. 'bywall' is the stair's own
            // action — wall's equivalent is 'byslab', a different source geometry and
            // therefore correctly a different declaration (C84 EI-8: one vocabulary per
            // concept, not one word for two concepts).
            for (const m of creationModes('stair-path').filter((x) => !x.isAction)) {
                expect(wallModes, 'stair re-declared "' + m.id + '" instead of reusing wall').toContain(m);
            }
            const byWalls = creationModes('stair-path').find((m) => m.id === 'bywall')!;
            expect(byWalls.isAction).toBe(true);
            expect(byWalls.key).toBe('W');
            expect(wallModes.some((m) => m.id === 'bywall')).toBe(false);
        });
    });

    describe('THE MODE REACHES THE GEOMETRY -- a real pill, a real stair', () => {
        it('ORTHOGONAL: a diagonal click produces an AXIS-ALIGNED flight', async () => {
            const { ctrl, dispatched } = mountStairTool(bar, 'I');

            pill('ortho').click();
            expect(resolveActiveStairDrawMode()).toBe('ortho');

            ctrl.feedClick(0, 0);
            ctrl.feedMove(6, 0.9);
            ctrl.feedClick(6, 0.9);      // 8.5 degrees off the X axis
            await settle();

            expect(dispatched).toHaveLength(1);
            const dir = dispatched[0].input.flights[0].direction;
            expect(dir.x).toBeCloseTo(1, 9);
            expect(dir.z).toBeCloseTo(0, 9);   // the 0.9 m of drift is gone
            ctrl.deactivate(); ctrl.destroy();
        });

        it('LINEAR: the SAME click produces a flight that follows the mouse exactly', async () => {
            const { ctrl, dispatched } = mountStairTool(bar, 'I');

            pill('linear').click();
            expect(resolveActiveStairDrawMode()).toBe('linear');

            ctrl.feedClick(0, 0);
            ctrl.feedMove(6, 0.9);
            ctrl.feedClick(6, 0.9);
            await settle();

            expect(dispatched).toHaveLength(1);
            const dir = dispatched[0].input.flights[0].direction;
            // 0.9 / hypot(6, 0.9) -- the drift SURVIVES, which is the whole difference.
            expect(dir.z).toBeCloseTo(0.9 / Math.hypot(6, 0.9), 6);
            expect(dir.z).toBeGreaterThan(0.1);
            ctrl.deactivate(); ctrl.destroy();
        });

        it('the keyboard accelerator reaches the geometry too, not just the highlight', async () => {
            const { ctrl, dispatched } = mountStairTool(bar, 'I');

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
            expect(resolveActiveStairDrawMode()).toBe('ortho');

            ctrl.feedClick(0, 0);
            ctrl.feedMove(6, 0.9);
            ctrl.feedClick(6, 0.9);
            await settle();

            expect(dispatched[0].input.flights[0].direction.z).toBeCloseTo(0, 9);
            ctrl.deactivate(); ctrl.destroy();
        });
    });

    describe('MODE IS LIVE -- switching MID-DRAW keeps the point already placed', () => {
        it('a switch applies to the very NEXT click, and the started run survives it', async () => {
            // THE FOUNDER'S ACTUAL REQUIREMENT, and the reason `onSelect` must never
            // call an `activate*` function: `ToolManager.activateTool` runs
            // `deactivateAllInternal()`, which would destroy the half-drawn stair.
            // If the switch went through activation, `startPosition` below would not
            // be the point the architect actually clicked -- there would be no stair
            // at all.
            const { ctrl, dispatched, refusals } = mountStairTool(bar, 'I');

            pill('linear').click();
            ctrl.feedClick(2, 1);                 // the run STARTS here, in linear

            pill('ortho').click();                // mid-draw, after a point is placed
            expect(resolveActiveStairDrawMode()).toBe('ortho');

            ctrl.feedMove(8, 1.9);
            ctrl.feedClick(8, 1.9);               // the next click must now snap
            await settle();

            expect(refusals).toEqual([]);
            expect(dispatched).toHaveLength(1);
            const stair = dispatched[0].input;

            // The point placed BEFORE the switch survived, unmoved and unre-snapped.
            expect(stair.startPosition.x).toBeCloseTo(2, 9);
            expect(stair.startPosition.z).toBeCloseTo(1, 9);
            // ...and the new mode governed the click AFTER it: the 0.9 m of drift is
            // gone, which it would not be had the mode only been read at activation.
            expect(stair.flights[0].direction.x).toBeCloseTo(1, 9);
            expect(stair.flights[0].direction.z).toBeCloseTo(0, 9);
            ctrl.deactivate(); ctrl.destroy();
        });
    });

    describe('the DEFAULT -- one element may not have two of them', () => {
        it('with no pill ever clicked, both surfaces resolve the SAME mode', () => {
            // MEASURED BEFORE THIS: 3-D defaulted to ortho (`_drawingMode = 'ortho'`),
            // plan defaulted to free-hand (ortho only while SHIFT was held). One
            // element, two surfaces, opposite defaults, and no control on either.
            expect(resolveActiveStairDrawMode()).toBe(DEFAULT_STAIR_DRAW_MODE);
            expect(DEFAULT_STAIR_DRAW_MODE).toBe('ortho');
        });

        it('an out-of-union value is IGNORED -- a SHAPE id can never become a mode', () => {
            setActiveStairDrawMode('linear');
            setActiveStairDrawMode('L');      // the other axis, arriving by mistake
            expect(resolveActiveStairDrawMode()).toBe('linear');
        });
    });
});
