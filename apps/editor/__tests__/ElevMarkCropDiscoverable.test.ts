// @vitest-environment happy-dom
//
// §FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — the plan elevation/section mark carries
// crop-drag handles, but they were an invisible ~10px target that never won over the
// mark body, so "every interaction just opened the elevation". This suite pins the
// three behaviours the fix depends on:
//
//   1. HIT PRIORITY — the renderer's hitTestScopeHandle returns a crop handle when the
//      cursor is over one (within tolerance) for a SELECTED mark, and null over the box
//      interior / when nothing is selected — so a handle grab wins in PlanViewInteraction
//      (which hit-tests scope handles BEFORE the mark body) and body clicks still fall
//      through to select.
//   2. NAVIGATE RULE — navigation to the linked view fires ONLY on double-click; a single
//      click selects the mark (revealing the handles) and never navigates.
//   3. CROP MUTATION IS P6 — dragging a handle dispatches the `view.setCrop` command
//      through the runtime bus, never a direct store write.
//
// Maps C06 / DOC-2.x (views + plan interaction) and P6 (commands are the only mutation
// path). Kept in apps/editor (L5) so it can import the L4 renderer + L7 annotation store.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    planViewAnnotationRenderer,
    viewDefinitionStore,
} from '@pryzm/core-app-model';
import { annotationStore, type AnnotationElement } from '@pryzm/plugin-annotations';
import { PlanViewInteraction } from '../src/engine/views/PlanViewInteraction';

// ── Screen mapping: 50 px/m, origin at (100,100). worldToScreen maps z↓ so the plan
//    scope box lays out predictably; screenToWorld is its inverse. ─────────────────
const PX = 50;
const OX = 100;
const OY = 100;
const w2s = (wx: number, wz: number) => ({ sx: OX + wx * PX, sy: OY + wz * PX });

const PLAN_ID = 'vd-plan';
const ELEV_ID = 'vd-elev-south';

/** A South-elevation mark anchored at the world origin, facing −Z, linked to ELEV_ID. */
function makeElevMark(): AnnotationElement {
    const now = Date.now();
    return {
        id: 'ann-elev-mark',
        type: 'elevation-mark',
        ownerViewId: PLAN_ID,
        references: [],
        geometry2D: { modelPoints: [{ x: 0, y: 0, z: 0 }], offset: 0 },
        style: {},
        parameters: { linkedViewId: ELEV_ID, facingDirection: { x: 0, y: 0, z: -1 } },
        isDriving: false,
        createdAt: now,
        updatedAt: now,
    } as AnnotationElement;
}

/** Seed the elevation view with a symmetric ±3 m crop, 8 m deep (no sectionVolume). */
function seedElevationView(): void {
    viewDefinitionStore.reset();
    viewDefinitionStore.create({
        id: ELEV_ID,
        name: 'South Elevation',
        viewType: 'elevation',
        spatial: {},
        crop: { enabled: true, region: { min: [-3, 0], max: [3, 3] }, farClip: { offset: 8 } },
    } as never);
}

describe('§FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — hit priority', () => {
    beforeEach(() => {
        annotationStore.clear();
        seedElevationView();
        annotationStore.add(makeElevMark());
        // Select the mark so the renderer offers its scope handles.
        (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId = 'ann-elev-mark';
    });
    afterEach(() => {
        delete (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId;
        annotationStore.clear();
        viewDefinitionStore.reset();
    });

    // Scope geometry for the seeded mark (facing −Z, ±3 m wide, 8 m deep):
    //   left width handle  = world(-3,-4) → screen(-50, -100) → (  ..); computed below.
    const hit = (sx: number, sy: number) =>
        planViewAnnotationRenderer.hitTestScopeHandle(PLAN_ID, sx, sy, w2s, 14);

    it('returns the width handle when the cursor is over it', () => {
        // left width handle: midpoint of a(-3,0)–farA(-3,-8) = world(-3,-4) → screen(-50,-100).
        const left = w2s(-3, -4);
        const r = hit(left.sx, left.sy);
        expect(r).not.toBeNull();
        expect(r!.handle).toBe('width-left');
        expect(r!.linkedViewId).toBe(ELEV_ID);
    });

    it('returns the depth handle at the far-edge midpoint', () => {
        // depth handle: midpoint of farA(-3,-8)–farB(3,-8) = world(0,-8) → screen(100,-300).
        const depth = w2s(0, -8);
        const r = hit(depth.sx, depth.sy);
        expect(r).not.toBeNull();
        expect(r!.handle).toBe('depth');
    });

    it('returns the cut-plane handle along the near cut line', () => {
        // cut line a(-3,0)–b(3,0); midpoint world(0,0) → screen(100,100).
        const cut = w2s(0, 0);
        const r = hit(cut.sx, cut.sy);
        expect(r).not.toBeNull();
        expect(r!.handle).toBe('cut-plane');
    });

    it('returns null in the box INTERIOR so a body click falls through to select', () => {
        // world(0,-4) is dead-centre of the scope box, > tolerance from every handle
        // and from the cut line → no handle → PlanViewInteraction proceeds to body-select.
        const interior = w2s(0, -4);
        expect(hit(interior.sx, interior.sy)).toBeNull();
    });

    it('returns null when NO mark is selected (handles only exist once selected)', () => {
        delete (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId;
        const left = w2s(-3, -4);
        expect(hit(left.sx, left.sy)).toBeNull();
    });

    it('setHoveredScopeHandle is a pure affordance flag (no throw, no mutation)', () => {
        expect(() => planViewAnnotationRenderer.setHoveredScopeHandle('depth')).not.toThrow();
        expect(() => planViewAnnotationRenderer.setHoveredScopeHandle(null)).not.toThrow();
        // The crop region is untouched by a hover.
        expect(viewDefinitionStore.get(ELEV_ID)!.crop!.region!.max[0]).toBe(3);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction-level: navigate rule + P6 crop dispatch through PlanViewInteraction.
// ─────────────────────────────────────────────────────────────────────────────

interface FakePlanCanvas {
    hitTestLevelHead: ReturnType<typeof vi.fn>;
    hitTestLevel: ReturnType<typeof vi.fn>;
    hitTestScopeHandle: ReturnType<typeof vi.fn>;
    hitTestCropHandle: ReturnType<typeof vi.fn>;
    hitTestAnnotation: ReturnType<typeof vi.fn>;
    hitTestGridDim: ReturnType<typeof vi.fn>;
    hitTestGrid: ReturnType<typeof vi.fn>;
    hitTest: ReturnType<typeof vi.fn>;
    screenToWorld: (sx: number, sy: number) => { worldX: number; worldZ: number };
    worldToScreen: (wx: number, wz: number) => { sx: number; sy: number };
    setSelectedGridId: ReturnType<typeof vi.fn>;
    setSnapIndicator: ReturnType<typeof vi.fn>;
    clearSnapIndicator: ReturnType<typeof vi.fn>;
    setHoveredElementId: ReturnType<typeof vi.fn>;
    setHoveredScopeHandle: ReturnType<typeof vi.fn>;
}

function makeFakePlanCanvas(): FakePlanCanvas {
    return {
        hitTestLevelHead: vi.fn(() => null),
        hitTestLevel: vi.fn(() => null),
        hitTestScopeHandle: vi.fn(() => null),
        hitTestCropHandle: vi.fn(() => null),
        hitTestAnnotation: vi.fn(() => null),
        hitTestGridDim: vi.fn(() => null),
        hitTestGrid: vi.fn(() => null),
        hitTest: vi.fn(() => null),
        screenToWorld: (sx: number, sy: number) => ({ worldX: (sx - OX) / PX, worldZ: (sy - OY) / PX }),
        worldToScreen: (wx: number, wz: number) => w2s(wx, wz),
        setSelectedGridId: vi.fn(),
        setSnapIndicator: vi.fn(),
        clearSnapIndicator: vi.fn(),
        setHoveredElementId: vi.fn(),
        setHoveredScopeHandle: vi.fn(),
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

describe('§FIX-ELEV-MARK-CROP-DISCOVERABLE (L-154) — navigate rule + P6 crop dispatch', () => {
    let interaction: PlanViewInteraction;
    let canvas: HTMLCanvasElement;
    let planCanvas: FakePlanCanvas;
    let bus: ReturnType<typeof vi.fn>;
    let events: ReturnType<typeof vi.fn>;
    let activate: ReturnType<typeof vi.fn>;
    let setActiveViewDefinitionId: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        annotationStore.clear();
        seedElevationView();
        annotationStore.add(makeElevMark());

        bus = vi.fn(() => Promise.resolve());
        events = vi.fn();
        activate = vi.fn(() => Promise.resolve());
        setActiveViewDefinitionId = vi.fn();
        (window as unknown as { runtime?: unknown }).runtime = { bus: { executeCommand: bus }, events: { emit: events } };
        (window as unknown as { viewController?: unknown }).viewController = { setActiveViewDefinitionId, activate };
        delete (window as unknown as { toolManager?: unknown }).toolManager;
        delete (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId;

        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        planCanvas = makeFakePlanCanvas();
        interaction = new PlanViewInteraction();
        interaction.attach(canvas, planCanvas as never, PLAN_ID);
    });

    afterEach(() => {
        interaction.detach();
        canvas.remove();
        annotationStore.clear();
        viewDefinitionStore.reset();
        delete (window as unknown as { runtime?: unknown }).runtime;
        delete (window as unknown as { viewController?: unknown }).viewController;
        delete (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId;
    });

    it('a single click on the mark body SELECTS it and does NOT navigate', () => {
        planCanvas.hitTestAnnotation.mockReturnValue('ann-elev-mark');
        down(canvas, 300, 300);
        up(300, 300);

        expect((window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId).toBe('ann-elev-mark');
        expect(activate).not.toHaveBeenCalled();
        expect(setActiveViewDefinitionId).not.toHaveBeenCalled();
        // A single click must never dispatch view.setCrop either.
        expect(bus.mock.calls.some(([type]) => type === 'view.setCrop')).toBe(false);
    });

    it('a DOUBLE-click on the mark NAVIGATES to the linked elevation view', () => {
        planCanvas.hitTestAnnotation.mockReturnValue('ann-elev-mark');
        canvas.dispatchEvent(new MouseEvent('dblclick', { button: 0, clientX: 300, clientY: 300, bubbles: true, cancelable: true }));

        expect(setActiveViewDefinitionId).toHaveBeenCalledWith(ELEV_ID);
        expect(activate).toHaveBeenCalledTimes(1);
    });

    it('a double-click on a NON-linked annotation does not navigate', () => {
        // A plain dimension with no linkedViewId must not trigger navigation.
        annotationStore.clear();
        annotationStore.add({
            ...makeElevMark(),
            id: 'ann-dim',
            type: 'linear-dim',
            parameters: {},
        } as AnnotationElement);
        planCanvas.hitTestAnnotation.mockReturnValue('ann-dim');
        canvas.dispatchEvent(new MouseEvent('dblclick', { button: 0, clientX: 300, clientY: 300, bubbles: true, cancelable: true }));

        expect(activate).not.toHaveBeenCalled();
    });

    it('dragging a crop handle dispatches view.setCrop (P6), not a direct store write', () => {
        // The fake canvas reports a width-right handle grab (the mark is selected in
        // production; here we assert the drag→command wiring downstream of the hit-test).
        planCanvas.hitTestScopeHandle.mockReturnValue({ annotationId: 'ann-elev-mark', linkedViewId: ELEV_ID, handle: 'width-right' });
        const updateSpy = vi.spyOn(annotationStore, 'update');

        down(canvas, 250, 100);   // grab the handle
        move(300, 100);           // drag outward
        up(300, 100);             // commit

        const setCropCalls = bus.mock.calls.filter(([type]) => type === 'view.setCrop');
        expect(setCropCalls.length).toBeGreaterThan(0);
        const [, payload] = setCropCalls[0] as [string, { viewId: string; crop: unknown }];
        expect(payload.viewId).toBe(ELEV_ID);
        expect(payload.crop).toBeTruthy();
        // Crop editing must NOT write the annotation store directly (P6 — bus only).
        expect(updateSpy).not.toHaveBeenCalled();
    });
});
