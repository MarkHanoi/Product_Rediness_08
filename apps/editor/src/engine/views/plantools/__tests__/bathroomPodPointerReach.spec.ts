/**
 * §BATH102 — C109 §9 **AXIS 4**, THE POINTER LAYER. (L-11480..L-11486 · C109 R-9 ·
 * C104 R-10 · C11 · C16 CA-18.)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ C109 R-9, VERBATIM: *"A reachability claim for this family is NOT ADMISSIBLE
 *    without a POINTER-LAYER proof … Axis 3 is closed only while a test arms the
 *    tool through the REAL PALETTE FUNCTION and dispatches a REAL DOM `MouseEvent`
 *    at a REAL PLAN OVERLAY, producing exactly one `bathroomPod.create`. Proving the
 *    runtime CAN dispatch is axis 2's job and it is not this one."*
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * That rule was written because three compounds — pool, balcony, lift — shipped on
 * consecutive days, each with a reachability test that passed, and ALL THREE were
 * unusable by a person:
 *
 *   "Balcony doesn't preview on wall — and I could not create it."
 *   "Swimming pool — I did not have the mode tool … the creation did not trigger."
 *   "Lift — it should be under Architecture, but could not see it!"
 *
 * `bathroomPodReachableThroughComposedRuntime.test.ts` proves the RUNTIME can
 * dispatch `bathroomPod.create` off the real composition root. It says so in its own
 * header, and it says what it does not prove. THIS file is the missing half, at the
 * layer the user touches: it starts from `activatePlanOnlyToolOrExplain` — the REAL
 * function the SERVICES palette row invokes — attaches the REAL split-view plan
 * overlay to a canvas, and dispatches REAL DOM `MouseEvent`s at it. Nothing about the
 * pointer path is stubbed: the listeners, the capture phases, the focus gating, the
 * screen→world transform and the handler's own state machine all run. If a click
 * cannot get from the canvas to the handler, no assertion here can pass.
 *
 * ⛔ AND IT IS DELIBERATELY THE **SPLIT-VIEW** OVERLAY, for the reason
 * `pointerReachesArmedHandler.spec.ts` records: the founder's working layout is 3-D
 * left / plan right, and his console named `SvpPlanToolOverlay` every time. A test
 * against the standalone plan overlay would have been green and irrelevant.
 *
 * ─── WHAT IS STUBBED, DECLARED ─────────────────────────────────────────────────
 * The 2-D canvas context (happy-dom's `getContext('2d')` returns **null**, and both
 * overlays treat a null context as "cannot build a draw context" and refuse to arm at
 * all — so without this every arm below would fail for a reason unrelated to the
 * subject). It doubles as the PREVIEW PROBE. And the bus: a `vi.fn()`, because this
 * file's subject is *"does the gesture reach the bus with the right payload"*, not
 * *"does the handler write the store"* — that is the other file's job, on the real
 * composed runtime. Nothing else.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ THE 2-D CONTEXT STUB MUST BE INSTALLED BEFORE THE OVERLAY MODULE LOADS.
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
import {
    activatePlanOnlyToolOrExplain,
    endPlanOnlyToolSession,
} from '@app/ui/create/activatePlanOnlyTool';
import { PLAN_TOOL_KEYS } from '../planToolHandlerRegistry';
import { creationModes, ELEMENT_CREATION_MATRIX } from '../elementCreationMatrix';
import {
    BATHROOM_POD_DEFAULT_MEMBERS,
    bathroomPodMemberCount,
} from '@pryzm/geometry-plumbing';

const VIEW_ID = 'vd-bathroom-pod-pointer-probe';
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
    w.wallStore = { getAll: () => [], getLevels: () => [{ id: 'level-1', elevation: 0 }] };
    w.bimManager = { getLevelById: () => ({ elevation: 0 }), getLevels: () => [{ id: 'level-1', elevation: 0 }] };
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
    w.toolManager = { getActiveTool: () => 'none', subscribe: () => (): void => undefined };
}

/** Enter the pane, so the overlay's hover-focus gate opens exactly as it does live. */
const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };

const hover = (worldX: number, worldZ: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { ...px(worldX, worldZ), bubbles: true }));
};

const click = (worldX: number, worldZ: number): void => {
    canvas.dispatchEvent(
        new MouseEvent('mousedown', { button: 0, ...px(worldX, worldZ), bubbles: true }),
    );
};

const key = (init: KeyboardEventInit): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
};

const busCalls = (): unknown[][] => bus.executeCommand.mock.calls as unknown as unknown[][];
const dispatched = (): string[] => busCalls().map((c) => String(c[0]));
const payloadFor = (type: string): Record<string, unknown> | undefined =>
    busCalls().find((c) => c[0] === type)?.[1] as Record<string, unknown> | undefined;

/** Draw a room by its two opposite corners, through REAL pointer events. */
function dragRoom(x1: number, z1: number, x2: number, z2: number): void {
    click(x1, z1);
    hover(x2, z2);
    click(x2, z2);
}

describe('§BATH102 — C109 R-9: a pointer event on the REAL plan overlay creates a pod', () => {
    beforeAll(() => {
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'Bathroom pod pointer probe',
            viewType: 'plan',
            spatial: { levelId: 'level-1' },
        });
    });

    beforeEach(() => {
        installWorld();
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

    // ── ARM A — the whole gesture, palette → pointer → ONE command ───────────
    describe('ARM A — palette row → armed handler → two clicks → ONE bathroomPod.create', () => {
        it('A-1 the SERVICES row arms the tool on the attached plan surface', () => {
            // ⭐ THE REAL PALETTE FUNCTION. `CreateRailPanel`'s Bathroom Pod row calls
            // exactly this, with exactly this label. A test that called
            // `svpPlanToolOverlay.setActiveTool('bathroom-pod')` directly would prove
            // the overlay works and say nothing about whether a person can reach it.
            expect(activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod')).toBe(true);
            enterPane();
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);
        });

        it('A-2 the first click does NOT create; hovering PREVIEWS the solved module', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();

            click(2, 2);
            expect(dispatched(), 'one corner is not a room').toEqual([]);

            drawCalls.length = 0;
            hover(4.6, 4.1); // a 2.60 x 2.10 m room
            // ⭐ THE PREVIEW IS THE SOLVER'S OWN ANSWER, MADE MEASURABLE. The handler
            // fills and strokes the room ring AND one ring per solved member, all
            // from `solveBathroomPodLayout` — the SAME function the command runs. A
            // hover that reached the handler therefore MUST have filled and stroked.
            expect(drawCalls).toContain('fill');
            expect(drawCalls).toContain('stroke');
        });

        it('A-3 the second click dispatches EXACTLY ONE bathroomPod.create', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            dragRoom(2, 2, 4.6, 4.1);

            // ⛔ EXACTLY ONE. C16 §8.6 B-6 — one gesture is one command, so one undo
            // entry. Two dispatches here would mean two records and two Ctrl+Zs.
            expect(dispatched()).toEqual(['bathroomPod.create']);
        });

        it('A-4 the payload carries the ROOM THE ARCHITECT DREW, not a default', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            dragRoom(2, 2, 4.6, 4.1);

            const p = payloadFor('bathroomPod.create')!;
            const room = p.room as { clearWidth: number; clearDepth: number; origin: { x: number; z: number }; rotation: number };
            // ⭐ C109 R-10 — this asserts an EXPLICIT value is HONOURED (the rectangle
            // the pointer drew), never that a dimension equals a documented default.
            expect(room.clearWidth).toBeCloseTo(2.6, 6);
            expect(room.clearDepth).toBeCloseTo(2.1, 6);
            expect(room.origin.x).toBeCloseTo(2, 6);
            expect(room.origin.z).toBeCloseTo(2, 6);
            expect(room.rotation).toBeCloseTo(0, 6);
            expect(p.levelId).toBe('level-1');
        });

        it('A-5 every id is PRE-MINTED and branded, one per NORMALISED member (CA-2)', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            dragRoom(2, 2, 4.6, 4.1);

            const p = payloadFor('bathroomPod.create')!;
            expect(String(p.podId)).toMatch(/^bathroomPod_[0-9A-HJKMNP-TV-Z]{26}$/);
            const ids = p.memberIds as string[];
            // ⛔ THE COUNT IS ASKED OF THE GEOMETRY PACKAGE, never typed here — a
            // hand-typed number would be a second statement of one the normaliser
            // owns, and wrong the moment a pod declares two accessories.
            expect(ids.length).toBe(bathroomPodMemberCount(BATHROOM_POD_DEFAULT_MEMBERS));
            // ⭐ EVERY MEMBER IS A `plumbing` ID (C109 §2 / R-2) — the family that
            // already owns sanitaryware, not a pod-private brand.
            for (const id of ids) expect(id).toMatch(/^plumbing_[0-9A-HJKMNP-TV-Z]{26}$/);
            expect(new Set(ids).size, 'ids must be unique').toBe(ids.length);
        });
    });

    // ── ARM B — the modifiers reach the PAYLOAD, not just a variable ─────────
    describe('ARM B — SPACE picks the wet wall, H flips the hand', () => {
        it('B-1 SPACE rotates the room frame, and the CLICK PATH carries it', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            click(2, 2);
            // ⭐ THE §LIFT94 LESSON: a placement modifier nobody is told about is,
            // from the user's side, indistinguishable from one that does not exist —
            // which is exactly how the lift's SPACE was reported. Here it is measured
            // through the same window keydown a person's SPACE produces.
            key({ code: 'Space', key: ' ' });
            hover(4.6, 4.1);
            click(4.6, 4.1);

            const room = payloadFor('bathroomPod.create')!.room as { rotation: number; clearWidth: number; clearDepth: number };
            expect(room.rotation).toBeCloseTo(Math.PI / 2, 6);
            // Turn 1 makes the max-X edge the wet wall, so width and depth SWAP.
            expect(room.clearWidth).toBeCloseTo(2.1, 6);
            expect(room.clearDepth).toBeCloseTo(2.6, 6);
        });

        it('B-2 four SPACE presses return to the original frame', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            click(2, 2);
            for (let i = 0; i < 4; i++) key({ code: 'Space', key: ' ' });
            click(4.6, 4.1);
            expect((payloadFor('bathroomPod.create')!.room as { rotation: number }).rotation)
                .toBeCloseTo(0, 6);
        });

        it('B-3 H flips handedness and it reaches the payload', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            click(2, 2);
            expect(dispatched()).toEqual([]);
            key({ key: 'h' });
            click(4.6, 4.1);
            expect(payloadFor('bathroomPod.create')!.handedness).toBe('right');
        });
    });

    // ── ARM C — the refusal reaches a PERSON ────────────────────────────────
    describe('ARM C — C109 §5.4 / C16 CA-18: the refusal names both numbers', () => {
        it('C-1 a room too narrow still DISPATCHES, and the bus reason is surfaced', async () => {
            // ⭐ THE SPLIT THAT MATTERS. The TOOL does not second-guess the solver: it
            // dispatches and lets `canExecute` refuse, so there is ONE definition of
            // "does not fit" rather than a tool-side copy that could disagree with it
            // (C84 EI-1). What the tool owns is making the reason READABLE.
            bus.executeCommand.mockImplementationOnce(async () => {
                throw new Error(
                    'bathroomPod.create: canExecute rejected — This bathroom pod needs 2.27 m of ' +
                    'clear wall (shower 1.00 + 0.10 + WC 0.42 + 0.10 + basin 0.65, including ' +
                    'clearances); this room offers 1.40 m. Widen the room to 2.27 m, or remove ' +
                    'the shower from the module.',
                );
            });

            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            toasts.length = 0;
            dragRoom(2, 2, 3.4, 4.1); // 1.40 m wide
            expect(dispatched()).toEqual(['bathroomPod.create']);

            // Let the rejected promise settle.
            await Promise.resolve();
            await Promise.resolve();

            // ⛔ L-9301 — A REFUSAL PAINTED ON THE PREVIEW CANVAS IS ERASED ~16 ms
            // LATER by the next mousemove's `clearRect`. That is the whole of "the
            // swimming pool would not create". So the reason MUST reach the toast
            // channel, which is `runtime.toasts` — the one `initUI` renders.
            const refusal = toasts.find((t) => t.kind === 'error');
            expect(refusal, 'the refusal must reach a PERSON, not just the canvas').toBeDefined();
            expect(refusal!.message).toMatch(/needs 2\.27 m of clear wall/);
            expect(refusal!.message).toMatch(/offers 1\.40 m/);
            expect(refusal!.message).toMatch(/Widen the room|remove the shower/i);
        });

        it('C-2 a successful placement CONFIRMS BY NAME (L-9305)', async () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            toasts.length = 0;
            dragRoom(2, 2, 4.6, 4.1);
            await Promise.resolve();
            await Promise.resolve();

            // Until a render path exists for this family (axis 7, L-11484), a
            // confirmation is the ONLY signal separating "created" from "silently
            // refused" — and shipping the two apart is what turned a correct refusal
            // into three founder reports.
            const ok = toasts.find((t) => t.kind === 'info' && /Bathroom pod placed/.test(t.message));
            expect(ok, 'a created pod must say so').toBeDefined();
            expect(ok!.message).toMatch(/2\.60 × 2\.10 m/);
        });

        it('C-3 with NO plan surface attached the palette REFUSES OUT LOUD', () => {
            svpPlanToolOverlay.detach();
            toasts.length = 0;
            expect(activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod')).toBe(false);
            expect(toasts.length).toBe(1);
            expect(toasts[0]!.kind).toBe('error');
            expect(toasts[0]!.message).toMatch(/no plan view is open/i);
            // C16 CA-18 — the reason AND the route back to success.
            expect(toasts[0]!.message).toMatch(/split view/i);
        });
    });

    // ── ARM D — Escape, and the two-stage gesture ───────────────────────────
    describe('ARM D — Escape cancels the stroke before it puts the tool away', () => {
        it('D-1 Escape mid-drag clears the anchor and the tool STAYS ARMED', () => {
            activatePlanOnlyToolOrExplain('bathroom-pod', 'Bathroom Pod');
            enterPane();
            click(2, 2);
            key({ key: 'Escape' });

            // Stage 1 of the CAD two-stage rule: a mis-clicked first corner must not
            // cost the architect the tool (`planOnlyToolEscape`'s contract).
            expect(svpPlanToolOverlay.isPlacing()).toBe(true);
            // …and the anchor is gone, so the next two clicks start a NEW room rather
            // than closing a rectangle from a corner the architect abandoned.
            dragRoom(2, 2, 4.6, 4.1);
            expect(dispatched()).toEqual(['bathroomPod.create']);
        });
    });

    // ── ARM E — the registry and the matrix both know it ────────────────────
    describe('ARM E — declared in the ONE registry and the ONE matrix', () => {
        it('E-1 `bathroom-pod` is a plan-tool key on BOTH surfaces (L-73 parity)', () => {
            expect(PLAN_TOOL_KEYS as readonly string[]).toContain('bathroom-pod');
        });

        it('E-2 the matrix declares it PLAN-ONLY with NO modes, and the strip agrees', () => {
            const row = ELEMENT_CREATION_MATRIX.find((c) => c.tool === 'bathroom-pod');
            expect(row, 'every plan tool key must be accounted for in the matrix').toBeDefined();
            expect(row!.views).toEqual(['plan']);
            // ⛔ C84 EI-3 — no mode strip, because the arrangement is DERIVED by the
            // solver and never chosen. `creationModes` is the ONE declaration the bar
            // reads, so an empty list here is what makes "no strip" a property rather
            // than an omission.
            expect(creationModes('bathroom-pod')).toEqual([]);
        });
    });
});
