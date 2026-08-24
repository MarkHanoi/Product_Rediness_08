/**
 * §FIX-BOUNDARY-LINE-ENTER-CLOSES (founder, 2026-08-24) — L-10501 · C106 · C84 EI-9.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER PRESSED ENTER AND GOT AN OPEN PATH. VERBATIM:
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *   "I tried to create it the same way I would create a wall — I started to define
 *    the lines in plan view, and once I was happy, to connect back to the first
 *    point I clicked ENTER, but the line did not connect as a wall does."
 *
 * He was right, and the mechanism was one argument: `onKeyDown`'s Enter branch called
 * `this._commit(false)`. EVERY Enter produced `closed: false`, however many vertices
 * had been clicked — so the one gesture that exists to close a loop was the one that
 * guaranteed it stayed open.
 *
 * ─── WHAT THIS FILE ASSERTS, AND WHY IT IS THE PAYLOAD AND NOT THE DISPATCH ────
 * The lane brief was explicit: *"Prove it: draw 4 points, press Enter, assert a CLOSED
 * ring — not just 'a command dispatched.'"* That distinction is the whole point. The
 * BROKEN code dispatched `boundaryLine.create` on Enter perfectly happily; a test that
 * asserted `dispatched()` contains `'boundaryLine.create'` would have been GREEN
 * against the bug. Every case below reads `closed` out of the payload.
 *
 * ⚠ AND IT DRIVES THE REAL PATH. Real palette call → real split-view overlay → real DOM
 * `MouseEvent`s → a real `KeyboardEvent` on `window`. The overlay's Enter routing is
 * itself gated (`hasActiveStroke()`, the form-field guard, the capture phase), and
 * §FIX-PLAN-TOOL-FINISH-GESTURE records that this exact gate once swallowed Enter on
 * the SPLIT pane while the main plan surface worked — which is the pane the founder
 * uses. Calling `handler.onKeyDown()` directly would pass while the product stayed
 * broken; that is `[[committed-is-not-reachable]]`, and this file refuses it.
 *
 * ⛔ SEPARATE FROM `boundaryLinePointerReach.spec.ts` ON PURPOSE — that file's own
 * header states the rule (two lanes editing one spec on a shared tree is how a fix gets
 * clobbered), and nine sibling lanes are live. Vitest isolates module registries per
 * file, so the two share no state.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS — happy-dom's
// `getContext('2d')` returns null and the overlay then refuses to arm at all, so every
// case below would fail for a reason with nothing to do with the subject. It doubles as
// the HINT PROBE: ARM C reads the text this handler paints.
const drawCalls: string[] = [];
const filledText: string[] = [];
(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
    function getContext(): unknown {
        return new Proxy({}, {
            get: (_t, prop) => (...args: unknown[]): unknown => {
                drawCalls.push(String(prop));
                if (prop === 'fillText' && typeof args[0] === 'string') filledText.push(args[0]);
                return undefined;
            },
            set: () => true,
        });
    };
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { viewDefinitionStore } from '@pryzm/core-app-model';
import { svpPlanToolOverlay } from '../../SvpPlanToolOverlay';
import {
    activatePlanOnlyToolOrExplain,
    endPlanOnlyToolSession,
} from '@app/ui/create/activatePlanOnlyTool';
import { setAppPhase } from '@app/ui/layout/panelDefaults';
import { __resetActiveBoundaryLineDrawModeForTests } from '../activeBoundaryLineDrawMode';

const VIEW_ID = 'vd-boundary-line-enter-closes';
const PPU = 50;

const px = (worldX: number, worldZ: number): { clientX: number; clientY: number } => ({
    clientX: worldX * PPU,
    clientY: worldZ * PPU,
});

const bus = { executeCommand: vi.fn(async () => ({ ok: true })) };
let canvas: HTMLCanvasElement;

const planCanvasStub = {
    screenToWorld: (sx: number, sy: number) => ({ worldX: sx / PPU, worldZ: sy / PPU }),
    worldToScreen: (x: number, z: number) => ({ sx: x * PPU, sy: z * PPU }),
    getPixelsPerUnit: () => PPU,
};

function installWorld(): void {
    bus.executeCommand.mockClear();
    drawCalls.length = 0;
    filledText.length = 0;
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus,
        events: { on: () => ({ dispose: (): void => undefined }), emit: (): void => undefined },
        toasts: { show: () => ({ dispose: (): void => undefined }) },
        stores: {},
    };
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
    w.toolManager = { getActiveTool: () => 'none', subscribe: () => (): void => undefined };
    w.bimManager = { getLevelById: () => ({ elevation: 0 }), getLevels: () => [{ id: 'level-1', elevation: 0 }] };
}

const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };
const click = (x: number, z: number): void => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, ...px(x, z), bubbles: true }));
};
const dblClick = (x: number, z: number): void => {
    canvas.dispatchEvent(new MouseEvent('dblclick', { ...px(x, z), bubbles: true }));
};
const hover = (x: number, z: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { ...px(x, z), bubbles: true }));
};
/** A REAL key event on `window` — the exact channel `SvpPlanToolOverlay` listens on. */
const pressEnter = (): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};

const busCalls = (): unknown[][] => bus.executeCommand.mock.calls as unknown as unknown[][];
const dispatched = (): string[] => busCalls().map((c) => String(c[0]));
const created = (): Record<string, unknown> | undefined =>
    busCalls().find((c) => c[0] === 'boundaryLine.create')?.[1] as Record<string, unknown> | undefined;

/** The founder's gesture: arm the tool, then click a square. */
function drawSquare(): void {
    expect(activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line')).toBe(true);
    enterPane();
    click(0, 0);
    click(10, 0);
    click(10, 10);
    click(0, 10);
}

describe('§FIX-BOUNDARY-LINE-ENTER-CLOSES — ENTER closes the ring, as a wall does', () => {
    beforeAll(() => {
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Boundary-line ENTER probe',
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

    // ── ARM A — the founder's exact report ───────────────────────────────────
    describe('ARM A — four points, ENTER, a CLOSED ring', () => {
        it('A-1: ⭐ FOUR POINTS + ENTER → `closed: true` (the founder`s report, pinned)', () => {
            drawSquare();
            expect(dispatched()).toEqual([]);   // four clicks alone commit nothing
            pressEnter();

            expect(dispatched()).toEqual(['boundaryLine.create']);
            const p = created()!;
            // ⭐ THE ASSERTION THAT FAILS AGAINST THE BUG. The broken handler dispatched
            // this same command with this same vertex list — only `closed` was wrong.
            expect(p.closed).toBe(true);
        });

        it('A-2: ⭐ the ring keeps all FOUR vertices and does NOT repeat the first', () => {
            drawSquare();
            pressEnter();
            const p = created()!;
            const v = p.vertices as Array<{ x: number; z: number }>;
            // Four clicks → four vertices. A close that pushed the origin back on would
            // read FIVE, and the L0 schema's third refine REFUSES a repeated closing
            // vertex outright (*"must be an OPEN loop"*) — so that mistake would surface
            // as a bus rejection the architect has to decode, not as a closed ring.
            expect(v).toHaveLength(4);
            expect(v[0]!.x === v[3]!.x && v[0]!.z === v[3]!.z).toBe(false);
            // The square he actually clicked, in world metres — not a re-derived one.
            expect(v.map((q) => [q.x, q.z])).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
        });

        it('A-3: ⭐ THREE points is a ring too — the schema`s floor, not a taste', () => {
            // `BoundaryLine`'s second refine: *"A closed boundary line needs at least 3
            // vertices."* The predicate asks the same number, so a closeable-looking
            // gesture can never produce a record the bus then rejects.
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(0, 0);
            click(6, 0);
            click(3, 5);
            pressEnter();
            expect(created()!.closed).toBe(true);
        });
    });

    // ── ARM B — the half that must NOT change ────────────────────────────────
    describe('ARM B — an OPEN path is still reachable, and still first-class', () => {
        it('B-1: ⭐ TWO points + ENTER stays OPEN — a chain is not a loop', () => {
            // The previous behaviour, preserved EXACTLY where it was right. Two vertices
            // cannot enclose anything, so finishing is the only correct reading — and
            // `MIN_PATH_VERTS` is 2 precisely because *"a single 10 m run is a perfectly
            // good setting-out line"*. A fix that closed everything would have destroyed
            // the commonest gesture this tool has.
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(0, 0);
            click(10, 0);
            pressEnter();
            expect(dispatched()).toEqual(['boundaryLine.create']);
            expect(created()!.closed).toBe(false);
        });

        it('B-2: ⭐ DOUBLE-CLICK finishes FOUR points OPEN — the two gestures differ', () => {
            // ⛔ THE ONE PLACE THIS TOOL MUST NOT COPY THE WALL.
            // `WallPlanToolHandler.onDoubleClick` CLOSES, because a wall chain has no
            // meaningful open form. A boundary line's open form is first-class, so if
            // double-click closed too there would be NO gesture left that finishes an
            // open path of three or more points. Enter closes; double-click finishes.
            drawSquare();
            dblClick(0, 10);
            expect(dispatched()).toEqual(['boundaryLine.create']);
            expect(created()!.closed).toBe(false);
            expect((created()!.vertices as unknown[])).toHaveLength(4);
        });

        it('B-3: ONE point + ENTER commits NOTHING — neither a ring nor a chain', () => {
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(4, 4);
            pressEnter();
            expect(dispatched()).toEqual([]);
        });
    });

    // ── ARM C — C84 EI-9: the close resets, and the hint tells the truth ─────
    describe('ARM C — the close leaves NO dirty state, and names the right key', () => {
        it('C-1: ⭐ a second ENTER after a close dispatches NOTHING (C84 EI-9)', () => {
            // `CurtainWallTool`'s `C`-key alias carried exactly this bug: it drew the ring
            // and omitted the `_polySegmentCount = 0` reset, so the tool's own counter
            // stayed dirty. A close that draws the ring but leaves state behind is a
            // HALF-fix, and the next key press is where it shows.
            drawSquare();
            pressEnter();
            expect(dispatched()).toEqual(['boundaryLine.create']);
            pressEnter();
            pressEnter();
            expect(dispatched()).toEqual(['boundaryLine.create']);   // still exactly one
        });

        it('C-2: ⭐ the on-screen hint NAMES ENTER as the CLOSE key once a ring is possible', () => {
            // C87 §13.8's lesson, applied: `CurtainWallTool` rendered a button labelled
            // `↵` while ENTER was bound to *finish* and the real closing key was `C`,
            // advertised nowhere — *"a control that names the wrong key is worse than no
            // control: it teaches the user the feature is broken."* The hint and the
            // binding ask THE SAME predicate here, so they cannot disagree.
            activatePlanOnlyToolOrExplain('boundary-line', 'Boundary Line');
            enterPane();
            click(0, 0);
            click(10, 0);
            filledText.length = 0;
            hover(10, 4);
            // Two vertices: no ring yet, so ENTER must NOT be advertised as closing.
            expect(filledText.join(' | ')).not.toMatch(/Enter to CLOSE/);

            click(10, 10);
            filledText.length = 0;
            hover(4, 10);
            // Three vertices: a ring is now possible, and the hint says so.
            expect(filledText.join(' | ')).toMatch(/Enter to CLOSE/i);
        });
    });
});
