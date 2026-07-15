// @vitest-environment happy-dom
//
// §FIX-ELEVATION-MARK-MOVE-ORIGIN (L-305) — the founder can move the elevation mark's LINE
// and resize its crop, but he could NOT pick up the ORIGIN circle and reposition the whole
// marker. The fix adds a fifth grab — 'origin' — a TRANSLATE handle on the circle glyph that
// moves BOTH halves of the mark (the annotation glyph AND the linked-view section volume) as
// ONE gesture = ONE undo entry (C16).
//
// The mark is TWO things that share one anchor, and the real failure mode is DECOUPLING: a
// fix that moves only the volume leaves the glyph behind; a fix that fires two commands leaves
// two undo entries. The assertions with teeth are therefore:
//   (1) CO-MOVE — after the move, the annotation's anchor point and the linked view's volume
//       origin end at the SAME translated point (a volume-only fix fails this).
//   (2) PURE TRANSLATION — direction / width / height / near / far are byte-identical; only the
//       origin moved (a fix that rotated or rescaled would pass a naive "origin changed" test
//       but fails this).
//   (3) ONE UNDO — a single undo restores BOTH the glyph and the volume (a two-command fix
//       restores only one).
//   (4) REGRESSION FENCE — the four resize handles (depth/width/cut-plane) are unaffected: a
//       resize grab never enters the origin path and never touches the annotation store.
//
// Maps C16 (one gesture = one undo), C24/C09 (the mark is a view + an annotation), P6
// (commands are the only mutation path), L-267 (the origin grab WRITES — not a rubber band).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewSectionVolume } from '@pryzm/core-app-model';
import { annotationStore, type AnnotationElement } from '@pryzm/plugin-annotations';
import { PlanViewInteraction } from '../src/engine/views/PlanViewInteraction';
import { MoveMarkOriginCommand } from '../src/engine/views/MoveMarkOriginCommand';

const PX = 50;
const OX = 100;
const OY = 100;
const w2s = (wx: number, wz: number) => ({ sx: OX + wx * PX, sy: OY + wz * PX });

const PLAN_ID = 'vd-plan';
const ELEV_ID = 'vd-elev-south';

/** South-elevation volume anchored at world origin, facing −Z, 6 m wide × 3 m tall, 8 m deep. */
function seedVolume(originX = 0, originZ = 0): ViewSectionVolume {
    return { origin: [originX, 0, originZ], direction: [0, 0, -1], width: 6, height: 3, near: 0, far: 8 };
}

function seedElevationView(): void {
    viewDefinitionStore.reset();
    viewDefinitionStore.create({
        id: ELEV_ID,
        name: 'South Elevation',
        viewType: 'elevation',
        spatial: {
            sectionVolume: seedVolume(),
            cropRegion: { minX: -3, minZ: -8, maxX: 3, maxZ: 0 },
            sectionPlane: { normal: [0, 0, -1], constant: 0 },
        },
        crop: { enabled: true, region: { min: [-3, 0], max: [3, 3] }, farClip: { offset: 8 } },
    } as never);
}

/** Elevation mark: modelPoints = [anchor, dirEndpoint]; anchor is the origin circle glyph. */
function makeElevMark(): AnnotationElement {
    const now = Date.now();
    return {
        id: 'ann-elev-mark',
        type: 'elevation-mark',
        ownerViewId: PLAN_ID,
        references: [],
        geometry2D: { modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }], offset: 0 },
        style: {},
        parameters: { linkedViewId: ELEV_ID, facingDirection: { x: 0, y: 0, z: -1 }, position: { x: 0, y: 0, z: 0 } },
        isDriving: false,
        createdAt: now,
        updatedAt: now,
    } as AnnotationElement;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK A — MoveMarkOriginCommand: the one compound command that moves both stores.
// ─────────────────────────────────────────────────────────────────────────────
describe('§FIX-ELEVATION-MARK-MOVE-ORIGIN (L-305) — compound command', () => {
    beforeEach(() => {
        annotationStore.clear();
        seedElevationView();
        annotationStore.add(makeElevMark());
    });
    afterEach(() => {
        annotationStore.clear();
        viewDefinitionStore.reset();
    });

    // A translate of (dx=2, dz=1). For a South elevation the H axis is world-X (|dir.z| ≥ |dir.x|),
    // so the crop's absolute world-H window shifts by dx=2; its vertical window is invariant.
    function buildTarget() {
        return {
            annotationId: 'ann-elev-mark',
            viewId: ELEV_ID,
            nextModelPoints: [{ x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 0 }],
            nextPosition: { x: 2, y: 0, z: 1 },
            nextSectionVolume: seedVolume(2, 1),
            nextCropRegion: { minX: -1, minZ: -7, maxX: 5, maxZ: 1 },
            nextSectionPlane: { normal: [0, 0, -1] as [number, number, number], constant: 1 },
            nextCrop: { enabled: true, region: { min: [-1, 0] as [number, number], max: [5, 3] as [number, number] }, farClip: { offset: 8 } },
        };
    }

    it('CO-MOVE: after execute, the glyph anchor and the volume origin end at the SAME point', () => {
        new MoveMarkOriginCommand(buildTarget()).execute();

        const vol = viewDefinitionStore.get(ELEV_ID)!.spatial.sectionVolume!;
        const anchor = annotationStore.getById('ann-elev-mark')!.geometry2D.modelPoints![0];
        // The failure this pins: moving the volume WITHOUT moving the glyph (or vice-versa).
        expect(vol.origin).toEqual([2, 0, 1]);
        expect(anchor.x).toBe(vol.origin[0]);
        expect(anchor.z).toBe(vol.origin[2]);
    });

    it('PURE TRANSLATION: direction / width / height / near / far are byte-identical', () => {
        new MoveMarkOriginCommand(buildTarget()).execute();
        const vol = viewDefinitionStore.get(ELEV_ID)!.spatial.sectionVolume!;
        expect(vol.direction).toEqual([0, 0, -1]);
        expect(vol.width).toBe(6);
        expect(vol.height).toBe(3);
        expect(vol.near).toBe(0);
        expect(vol.far).toBe(8);
        // The direction endpoint kept its offset from the anchor (facing preserved).
        const pts = annotationStore.getById('ann-elev-mark')!.geometry2D.modelPoints!;
        expect(pts[1].x - pts[0].x).toBe(0);
        expect(pts[1].z - pts[0].z).toBe(-1);
    });

    it('crop: the absolute world-H window shifts with the origin; the vertical window is invariant', () => {
        new MoveMarkOriginCommand(buildTarget()).execute();
        const crop = viewDefinitionStore.get(ELEV_ID)!.crop!;
        expect(crop.region!.min[0]).toBe(-1);   // -3 + 2
        expect(crop.region!.max[0]).toBe(5);    //  3 + 2
        expect(crop.region!.min[1]).toBe(0);    // vertical extent untouched by a plan translate
        expect(crop.region!.max[1]).toBe(3);
    });

    it('ONE UNDO restores BOTH the glyph and the volume to their pre-drag positions', () => {
        const cmd = new MoveMarkOriginCommand(buildTarget());
        cmd.execute();
        cmd.undo();

        const vol = viewDefinitionStore.get(ELEV_ID)!.spatial.sectionVolume!;
        const anchor = annotationStore.getById('ann-elev-mark')!.geometry2D.modelPoints![0];
        const crop = viewDefinitionStore.get(ELEV_ID)!.crop!;
        // A two-command fix would restore only one of these on a single undo — this is the teeth.
        expect(vol.origin).toEqual([0, 0, 0]);
        expect(anchor.x).toBe(0);
        expect(anchor.z).toBe(0);
        expect(crop.region!.min[0]).toBe(-3);
        expect(crop.region!.max[0]).toBe(3);
    });

    it('redo (re-execute) after undo re-applies the exact move', () => {
        const cmd = new MoveMarkOriginCommand(buildTarget());
        cmd.execute();
        cmd.undo();
        cmd.execute();   // redo path in CommandManager re-runs execute()
        expect(viewDefinitionStore.get(ELEV_ID)!.spatial.sectionVolume!.origin).toEqual([2, 0, 1]);
        expect(annotationStore.getById('ann-elev-mark')!.geometry2D.modelPoints![0].x).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK B — PlanViewInteraction: the origin grab wins, commits ONE undo entry, and
//           leaves the resize handles untouched.
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

describe('§FIX-ELEVATION-MARK-MOVE-ORIGIN (L-305) — interaction wiring', () => {
    let interaction: PlanViewInteraction;
    let canvas: HTMLCanvasElement;
    let planCanvas: FakePlanCanvas;
    let bus: ReturnType<typeof vi.fn>;
    let cmExec: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        annotationStore.clear();
        seedElevationView();
        annotationStore.add(makeElevMark());

        bus = vi.fn(() => Promise.resolve());
        // commandManager.execute applies the command (so the compound move actually happens)
        // AND lets us count undo entries: one call === one undo entry.
        cmExec = vi.fn((cmd: { execute(): unknown }) => cmd.execute());
        (window as unknown as { runtime?: unknown }).runtime = { bus: { executeCommand: bus }, events: { emit: vi.fn() } };
        (window as unknown as { commandManager?: unknown }).commandManager = { execute: cmExec };
        delete (window as unknown as { toolManager?: unknown }).toolManager;
        delete (window as unknown as { selectionManager?: unknown }).selectionManager;
        (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId = 'ann-elev-mark';

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
        delete (window as unknown as { commandManager?: unknown }).commandManager;
        delete (window as unknown as { __pryzmSelectedAnnotationId?: string }).__pryzmSelectedAnnotationId;
    });

    it('grabbing the origin circle and dragging commits ONE undo entry that CO-MOVES glyph + volume', () => {
        // Origin circle is at world(0,0) → screen(100,100). Grab it, drag to world(2,1) → screen(200,150).
        down(canvas, 100, 100);
        move(200, 150);
        up(200, 150);

        // ONE undo entry — the whole gesture collapses to a single compound command.
        expect(cmExec).toHaveBeenCalledTimes(1);
        // The origin path does NOT go through the view bus commit (that is the resize path).
        expect(bus.mock.calls.some(([type]) => type === 'view.updateDefinition')).toBe(false);

        const vol = viewDefinitionStore.get(ELEV_ID)!.spatial.sectionVolume!;
        const anchor = annotationStore.getById('ann-elev-mark')!.geometry2D.modelPoints![0];
        // Moved by exactly (2,1) AND co-located — the decoupling failure would break this.
        expect(vol.origin[0]).toBeCloseTo(2, 3);
        expect(vol.origin[2]).toBeCloseTo(1, 3);
        expect(anchor.x).toBeCloseTo(vol.origin[0], 3);
        expect(anchor.z).toBeCloseTo(vol.origin[2], 3);
        // Pure translation: direction/width unchanged.
        expect(vol.direction).toEqual([0, 0, -1]);
        expect(vol.width).toBe(6);
    });

    it('REGRESSION FENCE: a resize-handle grab never enters the origin path', () => {
        // The renderer reports a width-right handle under the cursor → the origin grab must
        // yield, and the commit must flow through the existing bus path, not commandManager.
        planCanvas.hitTestScopeHandle.mockReturnValue({ annotationId: 'ann-elev-mark', linkedViewId: ELEV_ID, handle: 'width-right' });
        const annUpdateSpy = vi.spyOn(annotationStore, 'update');

        down(canvas, 250, 100);   // grab the (reported) width handle
        move(300, 100);
        up(300, 100);

        // Origin compound command NOT used; the resize path still commits through the bus.
        expect(cmExec).not.toHaveBeenCalled();
        expect(bus.mock.calls.filter(([type]) => type === 'view.updateDefinition').length).toBe(1);
        // A width resize must not translate the annotation glyph.
        expect(annUpdateSpy).not.toHaveBeenCalled();
    });

    it('a click that does not move the origin pushes NO undo entry (no-op guard)', () => {
        down(canvas, 100, 100);
        up(100, 100);   // same point — zero delta
        expect(cmExec).not.toHaveBeenCalled();
    });
});
