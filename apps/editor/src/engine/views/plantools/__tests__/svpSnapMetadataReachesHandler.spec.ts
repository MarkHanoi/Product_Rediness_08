// @vitest-environment happy-dom
//
// §ADPT34-A-SNAP-MUST-SURVIVE-THE-HANDOFF — L-10660 · L-10661 · C107 §2.3 · C84 EI-2.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE SPLIT-VIEW PLAN PANE DREW THE SNAP AND NEVER DELIVERED IT.
// ═══════════════════════════════════════════════════════════════════════════════
//
// MEASURED at f159ed7a, before the fix. `SvpPlanToolOverlay` has TWO sites that build
// the `WorldPoint` handed to an armed handler:
//
//     :627  (mousemove)  pt = { worldX: snapResult.worldX, worldZ: snapResult.worldZ };
//     :778  (_toWorld,   if (snap) return { worldX: snap.worldX, worldZ: snap.worldZ };
//            the CLICK path — `_onMouseDown` resolves through it at :597)
//
// Both dropped `snapType` and `sourceId` on the floor. `PlanViewToolOverlay._toWorld`
// (:542-549) carries BOTH. So the two plan surfaces handed their handlers structurally
// DIFFERENT points, and the split pane's were always anonymous.
//
// ── WHY THAT IS NOT COSMETIC ────────────────────────────────────────────────────
//
// `isStrongSnap(pt)` (`PlanToolHandler.ts:193`) is `!!pt.snapType && pt.snapType !== 'nearest'`.
// With `snapType` undefined it is PERMANENTLY FALSE in the split pane. It has exactly one
// consumer — `WallPlanToolHandler` — which guards THREE branches with it (:733, :750, :758).
// All three are L-935's fix: *"an explicit object snap always wins"* over ortho, angle-step
// and alignment inference. `PlanToolHandler.ts:180` states that rule as the handler contract.
//
// So L-935 — a founder-reported production defect whose committed end point landed 636 mm
// from where he clicked — was fixed in the main plan view and remained LIVE in the split
// pane. And the split pane is the founder's working layout: `boundaryLinePointerReach.spec.ts`
// records *"his console named `SvpPlanToolOverlay` every time"*.
//
// ⛔ THE SHAPE OF THE BUG IS THE POINT, AND IT IS L-73 ONE LAYER DOWN. `planToolHandlerRegistry`
// unified the handler SET across both plan surfaces "BY CONSTRUCTION, so it can never drift
// again" — and it did exactly that. What it did NOT unify is the CONTEXT the handlers are
// handed. Two overlays constructing the same value by hand is the same standing hazard the
// registry's own header warns about, moved from the map to the payload.
//
// ⚠ The snap was VISIBLE the whole time: `_lastSnapInfo` (:621-627) still fed the snap
// indicator and tooltip, so the pane rendered a midpoint glyph under the cursor while the
// committed geometry obeyed ortho. DRAWN but not DELIVERED — which is why no amount of
// looking at the screen would have found it.
//
// ── WHAT THIS FILE PROVES, AND AT WHICH LAYER ───────────────────────────────────
//
// C104 R-10: a reachability claim is INADMISSIBLE without a pointer-layer proof. This runs
// the REAL `svpPlanToolOverlay` singleton, attached to a REAL canvas, and dispatches REAL
// DOM `MouseEvent`s. The listeners, capture phases, arming path and the handler's own
// `activate()` all run.
//
// ⚠ HONEST SCOPE — the ONE thing stubbed is `PlanSnapEngine.querySnap`, and it is stubbed
// deliberately: the engine's own candidate generation is NOT what was broken, and standing up
// real wall geometry would measure the engine rather than the handoff. The seam under test is
// exactly the overlay's construction of the `WorldPoint` FROM a snap result, so the snap
// result is supplied and everything downstream of it is real.
//
// ⚠ ARM D is the arm that would have caught this in the first place, and it is written
// against the DECLARED contract rather than against today's field list, so it keeps holding
// when a field is added.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ⚠ MUST precede the overlay import: happy-dom's `getContext('2d')` returns null, and the
// overlay treats a null 2-D context as "cannot build a draw context" and refuses to arm the
// handler at all — every arm below would then fail for an unrelated reason.
(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext =
    function getContext(): unknown {
        return new Proxy({}, { get: () => (): undefined => undefined, set: () => true });
    };
// §R3-SENTINEL — the overlay refuses to arm a handler until initTools has completed.
(window as unknown as { __pryzmInitComplete: boolean }).__pryzmInitComplete = true;

import { PlanSnapEngine, viewDefinitionStore } from '@pryzm/core-app-model';
import { svpPlanToolOverlay } from '../../SvpPlanToolOverlay';
import { WallPlanToolHandler } from '../WallPlanToolHandler';
import { isStrongSnap, type WorldPoint } from '../PlanToolHandler';
import { setAppPhase } from '@app/ui/layout/panelDefaults';

const VIEW_ID = 'vd-svp-snap-metadata-probe';
const PPU = 50; // screen pixels per world metre

/** The snap the engine resolves — a wall MIDPOINT, the exact case L-935 was reported for. */
const SNAP = { worldX: 3.949434, worldZ: -0.634011, snapType: 'midpoint' as const, sourceId: 'wall-L935-host' };

let canvas: HTMLCanvasElement;
let seen: WorldPoint[] = [];

const planCanvasStub = {
    screenToWorld: (sx: number, sy: number) => ({ worldX: sx / PPU, worldZ: sy / PPU }),
    worldToScreen: (x: number, z: number) => ({ sx: x * PPU, sy: z * PPU }),
    getPixelsPerUnit: () => PPU,
};

function installWorld(): void {
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus: { executeCommand: vi.fn(async () => ({ ok: true })) },
        events: { on: () => ({ dispose: (): void => undefined }), emit: (): void => undefined },
        toasts: { show: () => ({ dispose: (): void => undefined }) },
        stores: {},
    };
    w.selectionManager = { setEnabled: () => undefined, getSelectedId: () => null, selectedObject: undefined };
    w.toolManager = { getActiveTool: () => 'none', subscribe: () => (): void => undefined };
    w.bimManager = { getLevelById: () => ({ elevation: 0 }), getLevels: () => [{ id: 'level-1', elevation: 0 }] };
}

const enterPane = (): void => { canvas.dispatchEvent(new MouseEvent('mouseenter')); };
const hover = (x: number, z: number): void => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x * PPU, clientY: z * PPU, bubbles: true }));
};
const click = (x: number, z: number): void => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: x * PPU, clientY: z * PPU, bubbles: true }));
};

describe('§ADPT34-A-SNAP-MUST-SURVIVE-THE-HANDOFF — the SVP pane delivers the snap it drew', () => {
    beforeAll(() => {
        setAppPhase('canvas');
        viewDefinitionStore.create({
            id: VIEW_ID,
            name: 'SVP snap-metadata probe',
            viewType: 'plan',
            spatial: { levelId: 'level-1' },
        });
    });

    beforeEach(() => {
        installWorld();
        seen = [];
        // Capture every WorldPoint the armed handler is handed, at the handler boundary.
        vi.spyOn(WallPlanToolHandler.prototype, 'onMouseMove').mockImplementation(function (pt: WorldPoint) { seen.push(pt); });
        vi.spyOn(WallPlanToolHandler.prototype, 'onClick').mockImplementation(function (pt: WorldPoint) { seen.push(pt); });

        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        canvas.getBoundingClientRect = (): DOMRect =>
            ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        svpPlanToolOverlay.attach(canvas, planCanvasStub as never, VIEW_ID);
        svpPlanToolOverlay.setActiveTool('wall');
        enterPane();
    });

    afterEach(() => {
        svpPlanToolOverlay.setActiveTool('none');
        svpPlanToolOverlay.detach();
        canvas.remove();
        vi.restoreAllMocks();
    });

    // ── ARM A — the HOVER path (:627) ───────────────────────────────────────────
    it('A: a hover over a snapped midpoint reaches the handler WITH its snap identity', () => {
        vi.spyOn(PlanSnapEngine.prototype, 'querySnap').mockReturnValue(SNAP);

        hover(1, 1);

        expect(seen.length).toBeGreaterThan(0);
        const pt = seen[seen.length - 1]!;
        // The point itself is the SNAPPED one — that much always worked.
        expect(pt.worldX).toBeCloseTo(SNAP.worldX, 9);
        expect(pt.worldZ).toBeCloseTo(SNAP.worldZ, 9);
        // ⭐ AND IT NOW CARRIES WHAT IT SNAPPED TO. Both of these were `undefined` pre-fix.
        expect(pt.snapType).toBe('midpoint');
        expect(pt.snapSourceId).toBe('wall-L935-host');
    });

    // ── ARM B — the CLICK path (:778, reached via `_onMouseDown` :597) ───────────
    it('B: a click resolves through `_toWorld` and carries the same identity', () => {
        // The COMMIT path. A fix that only patched the hover site would leave the
        // committed geometry exactly as wrong as before while the preview looked right.
        vi.spyOn(PlanSnapEngine.prototype, 'querySnap').mockReturnValue(SNAP);

        click(1, 1);

        expect(seen.length).toBeGreaterThan(0);
        const pt = seen[seen.length - 1]!;
        expect(pt.snapType).toBe('midpoint');
        expect(pt.snapSourceId).toBe('wall-L935-host');
    });

    // ── ARM C — THE CONSEQUENCE, in the vocabulary the handler actually uses ─────
    it('C: ⭐ `isStrongSnap` is TRUE in the split pane — L-935\'s three branches are live again', () => {
        // This is the assertion that matters. `isStrongSnap` is the predicate guarding
        // `WallPlanToolHandler`'s ortho / angle-step / alignment-inference branches, and it
        // was unconditionally false in this pane for every point ever delivered.
        vi.spyOn(PlanSnapEngine.prototype, 'querySnap').mockReturnValue(SNAP);

        hover(1, 1);
        click(1, 1);

        expect(seen.length).toBeGreaterThanOrEqual(2);
        for (const pt of seen) expect(isStrongSnap(pt)).toBe(true);
    });

    // ── ARM D — INERTNESS, and the two cases that MUST stay weak ────────────────
    it('D: with no snap, and with the low-priority `nearest` fallback, nothing is claimed', () => {
        // The fix must not manufacture strength. `nearest` is excluded BY NAME from
        // `isStrongSnap`, and a bare cursor point carries no snapType at all — free-hand
        // ortho drawing must be byte-identical to pre-fix.
        vi.spyOn(PlanSnapEngine.prototype, 'querySnap').mockReturnValue(null);
        hover(2, 2);
        const bare = seen[seen.length - 1]!;
        expect(bare.snapType).toBeUndefined();
        expect(isStrongSnap(bare)).toBe(false);

        seen = [];
        vi.spyOn(PlanSnapEngine.prototype, 'querySnap')
            .mockReturnValue({ worldX: 2, worldZ: 2, snapType: 'nearest', sourceId: undefined });
        hover(2, 2);
        const weak = seen[seen.length - 1]!;
        expect(weak.snapType).toBe('nearest');
        expect(isStrongSnap(weak)).toBe(false);
    });

    // ── ARM E — THE PARITY RULE, stated so it cannot silently rot again ─────────
    it('E: ⭐ EVERY field the snap engine resolves survives to the handler — the L-73 hazard, one layer down', () => {
        // Written against the CONTRACT ("what the engine resolved reaches the handler"),
        // not against a hand-copied field list, so adding a field to `SnapResult` keeps this
        // arm meaningful instead of quietly passing. THIS is the arm whose absence let two
        // overlays construct one value two different ways for as long as they have existed.
        const resolved = { worldX: 7.5, worldZ: -2.25, snapType: 'endpoint' as const, sourceId: 'slab-42' };
        vi.spyOn(PlanSnapEngine.prototype, 'querySnap').mockReturnValue(resolved);

        hover(3, 3);
        const pt = seen[seen.length - 1]!;

        expect({
            worldX:   pt.worldX,
            worldZ:   pt.worldZ,
            snapType: pt.snapType,
            sourceId: pt.snapSourceId,
        }).toEqual(resolved);
    });
});
