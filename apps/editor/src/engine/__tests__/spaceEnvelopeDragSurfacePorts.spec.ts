// §ENVELOPE-DRAG-PORTS (L-13045) — THE GESTURE, DRIVEN WITH NO RENDERER AT ALL.
// C114 §10 · ADR-0380 D4 · P2 · P6 · C84 EI-9 · C113 §6.4.
//
// ⭐ WHY THIS SPEC IS THE POINT OF THE EXTRACTION, NOT A SIDE EFFECT OF IT.
// `spaceEnvelopeFaceGizmo.spec.ts` already drives the whole gesture on THREE — a real
// scene, a real camera, a real `Raycaster` — and it stays the proof that the THREE path
// still works. What it CANNOT establish is the claim the extraction actually makes: that
// the gesture is independent of the renderer. A test that needs a `Scene` to run cannot
// tell you a Cesium adapter is possible.
//
// This file imports NOTHING from THREE. It hands `installSpaceEnvelopeFaceDragOnSurface` a
// hand-written surface of four functions and gets the founder's §2.4 gesture — the
// `maximumBuildable` refusal, the contextual planner, the neighbour preview, the 1e-3 m
// no-op drop, the single dispatch and the camera restore — with no renderer in the process.
// That is what makes the next surface a ~150–250 line adapter instead of a third copy of
// all of the above (C84 EI-9).
//
// ⚠ AND IT COVERS THE ONE BRANCH THE THREE SPEC STRUCTURALLY CANNOT REACH.
// `rayInSceneFrame` may answer `null`. THREE never does — `setFromCamera` always produces a
// ray — but Cesium's `camera.getPickRay` can return nothing, and the difference between
// HOLDING the face and moving it to a number nothing produced is the whole reason the port
// is nullable. That branch is exercised here and nowhere else.
//
// ✅ ESTABLISHES: the gesture runs on a surface with no renderer; the four ports are called
//    in the right order with the right arguments; a null ray holds; a `maximumBuildable`
//    grab is refused BY NAME; a sub-millimetre drag dispatches nothing and restores; a real
//    drag dispatches exactly once; the camera comes back on release, on cancel and on
//    teardown; and the handles port is genuinely optional.
// ⛔ DOES NOT ESTABLISH: that any pixel is drawn on any surface, or that the gesture works
//    in a browser. Nothing in this family is browser-verified, including on bim-3d
//    (C114 §14d, `:456` / `:522` / `:591`) — unchanged by this lane.

import { beforeEach, describe, expect, it } from 'vitest';
import {
    installSpaceEnvelopeFaceDragOnSurface,
    type DraggableSpaceEnvelope,
    type DragPointerLike,
    type FacePick,
    type SceneRay,
    type SpaceEnvelopeDragSurface,
} from '../spaceEnvelopeDragSurface';
import type { SpaceEnvelopeFaceRef } from '@pryzm/geometry-space-envelope';

/** A 6 × 4 × 3 m room. Side face #1 is the plane x = 6, outward +x. */
const ROOM: DraggableSpaceEnvelope = {
    id: 'Kitchen',
    levelId: 'L0',
    role: 'room',
    name: 'Kitchen',
    withinId: null,
    footprint: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    baseOffset: 0,
    height: 3,
};

/** The same volume, but the SOLVED zoning study — not draggable, by name (ADR-0380 D2). */
const STUDY: DraggableSpaceEnvelope = { ...ROOM, id: 'Study', role: 'maximumBuildable' };

const FACE_1: SpaceEnvelopeFaceRef = { kind: 'side', edgeIndex: 1 };
/** The centre of face #1: x = 6, mid-height, mid-edge. Where the grab lands. */
const GRAB = { x: 6, y: 1.5, z: 2 };

interface FakeCanvas {
    readonly el: HTMLElement;
    fire(type: string, ev: Record<string, unknown>): void;
    listenerCount(type: string): number;
}

function fakeCanvas(): FakeCanvas {
    const listeners = new Map<string, ((e: unknown) => void)[]>();
    const el = {
        addEventListener(type: string, fn: (e: unknown) => void) {
            const arr = listeners.get(type) ?? [];
            arr.push(fn);
            listeners.set(type, arr);
        },
        removeEventListener(type: string, fn: (e: unknown) => void) {
            const arr = listeners.get(type) ?? [];
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
            listeners.set(type, arr);
        },
        setPointerCapture: () => { /* no-op */ },
        releasePointerCapture: () => { /* no-op */ },
    } as unknown as HTMLElement;
    return {
        el,
        fire(type, ev) { for (const fn of [...(listeners.get(type) ?? [])]) fn(ev); },
        listenerCount(type) { return (listeners.get(type) ?? []).length; },
    };
}

function pointerEvent(clientX: number, clientY: number): Record<string, unknown> {
    return {
        button: 0,
        pointerId: 1,
        clientX,
        clientY,
        stopPropagation: () => { /* no-op */ },
        preventDefault: () => { /* no-op */ },
    };
}

/**
 * ⭐ THE WHOLE ADAPTER, IN THIRTY LINES — which is the measurement this file exists to make.
 *
 * A ray from far out on +z pointing back along −z crosses the face-1 axis (+x through GRAB)
 * at right angles, so `clientX` maps straight to a metre reading along that axis: the drag
 * delta is `(clientX - startX) / PIXELS_PER_M`. No projection matrix, no renderer, no scene
 * graph — which is the whole measurement.
 */
const PIXELS_PER_M = 100;

interface Recorder {
    readonly surface: SpaceEnvelopeDragSurface;
    readonly drawn: DraggableSpaceEnvelope[];
    readonly restored: string[];
    readonly camera: boolean[];
    readonly handleTargets: (string | null)[];
    readonly activeFaces: (SpaceEnvelopeFaceRef | null)[];
    /** Make the next `rayInSceneFrame` answer `null`, as Cesium's pick ray can. */
    blindRay: boolean;
    /** Make the next `pickFace` answer `null`, as empty space does. */
    pickNothing: boolean;
    /** Which record the pick resolves to. */
    picked: DraggableSpaceEnvelope;
}

function fakeSurface(opts: { handles: boolean }): Recorder {
    const rec: Recorder = {
        surface: undefined as unknown as SpaceEnvelopeDragSurface,
        drawn: [],
        restored: [],
        camera: [],
        handleTargets: [],
        activeFaces: [],
        blindRay: false,
        pickNothing: false,
        picked: ROOM,
    };
    let handleTarget: string | null = null;

    const surface: SpaceEnvelopeDragSurface = {
        rayInSceneFrame(ev: DragPointerLike): SceneRay | null {
            if (rec.blindRay) return null;
            return {
                // ⚠ PERPENDICULAR to the drag axis, never parallel to it: a ray down the
                // axis carries no information and `closestPointOnFaceAxis` correctly answers
                // null, which would make this fixture measure the hold branch by accident.
                origin: { x: GRAB.x + ev.clientX / PIXELS_PER_M, y: GRAB.y, z: 1000 },
                direction: { x: 0, y: 0, z: -1 },
            };
        },
        pickFace(_ev: DragPointerLike): FacePick | null {
            if (rec.pickNothing) return null;
            return { id: rec.picked.id, face: FACE_1, point: { ...GRAB } };
        },
        previewDraw(record) { rec.drawn.push(record); },
        previewRestore(id) { rec.restored.push(id); },
        setCameraEnabled(enabled) { rec.camera.push(enabled); },
        ...(opts.handles
            ? {
                handles: {
                    targetId: () => handleTarget,
                    setTarget: (r: DraggableSpaceEnvelope | null) => {
                        handleTarget = r?.id ?? null;
                        rec.handleTargets.push(handleTarget);
                    },
                    setActiveFace: (f: SpaceEnvelopeFaceRef | null) => { rec.activeFaces.push(f); },
                },
            }
            : {}),
    };
    (rec as { surface: SpaceEnvelopeDragSurface }).surface = surface;
    return rec;
}

describe('⭐ the gesture runs with NO renderer — four functions and it works', () => {
    let canvas: FakeCanvas;
    let rec: Recorder;
    let dispatched: { spaceEnvelopeId: string; face: SpaceEnvelopeFaceRef; deltaM: number }[];
    let refusals: string[];
    let previews: { deltaM: number; label: string }[];
    let world: DraggableSpaceEnvelope[];
    let dispose: () => void;

    const install = (opts: { handles: boolean } = { handles: true }): void => {
        canvas = fakeCanvas();
        rec = fakeSurface(opts);
        dispatched = [];
        refusals = [];
        previews = [];
        world = [ROOM];
        dispose = installSpaceEnvelopeFaceDragOnSurface({
            domElement: canvas.el,
            surface: rec.surface,
            getRecord: (id) => world.find((r) => r.id === id) ?? (id === STUDY.id ? STUDY : undefined),
            getWorld: () => world,
            dispatch: (p) => { dispatched.push(p); },
            onRefusal: (m) => { refusals.push(m); },
            onPreview: (deltaM, label) => { previews.push({ deltaM, label }); },
            onProfileEdit: () => { /* asserted separately */ },
        });
    };

    beforeEach(() => { install(); });

    it('a full drag dispatches EXACTLY ONE moveFace, of the grabbed face', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(150, 0));
        canvas.fire('pointermove', pointerEvent(200, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));

        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]!.spaceEnvelopeId).toBe('Kitchen');
        expect(dispatched[0]!.face).toEqual(FACE_1);
        // 200 px at 100 px/m — the sign follows the face's own outward axis.
        expect(Math.abs(dispatched[0]!.deltaM)).toBeCloseTo(2, 5);
    });

    it('⛔ the preview NEVER writes — it draws, and the store is untouched until release', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(150, 0));
        expect(rec.drawn.length).toBeGreaterThan(0);
        expect(dispatched).toHaveLength(0);
        expect(previews.length).toBeGreaterThan(0);
    });

    it('⛔ a sub-millimetre drag dispatches NOTHING and restores the record (C113 §6.4)', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointerup', pointerEvent(0, 0));
        expect(dispatched).toHaveLength(0);
        expect(rec.restored).toContain('Kitchen');
    });

    it('⭐ a NULL ray HOLDS the face — the branch THREE can never produce, and Cesium can', () => {
        // `setFromCamera` always yields a ray; `camera.getPickRay` need not. A surface that
        // guessed instead of answering null would move the face to a number nothing
        // produced, and it would look entirely plausible.
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(150, 0));
        const drawnAfterRealMove = rec.drawn.length;
        expect(drawnAfterRealMove).toBeGreaterThan(0);

        rec.blindRay = true;
        canvas.fire('pointermove', pointerEvent(600, 0));
        expect(rec.drawn).toHaveLength(drawnAfterRealMove); // nothing redrawn

        rec.blindRay = false;
        canvas.fire('pointerup', pointerEvent(600, 0));
        // The committed delta is the last one the surface COULD answer — 150 px, not 600.
        expect(Math.abs(dispatched[0]!.deltaM)).toBeCloseTo(1.5, 5);
    });

    it('⛔ grabbing a maximumBuildable study is REFUSED BY NAME, not silently ignored', () => {
        rec.picked = STUDY;
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(200, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));
        expect(dispatched).toHaveLength(0);
        expect(refusals).toHaveLength(1);
        expect(refusals[0]).toMatch(/maximum buildable/i);
        // ⛔ AND THE CAMERA WAS NEVER TAKEN. A refused grab that suspended navigation would
        // leave the user unable to orbit until they clicked something else.
        expect(rec.camera).toHaveLength(0);
    });

    it('⛔ a face of an envelope the store does not hold refuses to drag', () => {
        rec.picked = { ...ROOM, id: 'ghost' };
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));
        expect(dispatched).toHaveLength(0);
        expect(rec.camera).toHaveLength(0);
    });

    it('the camera is suspended for the gesture and handed back on release', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        expect(rec.camera).toEqual([false]);
        canvas.fire('pointerup', pointerEvent(200, 0));
        expect(rec.camera).toEqual([false, true]);
    });

    it('⛔ pointercancel hands the camera back too — a frozen camera is the worse failure', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointercancel', pointerEvent(50, 0));
        expect(rec.camera).toEqual([false, true]);
    });

    it('⛔ and so does teardown mid-drag, or the next runtime inherits a dead camera', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        dispose();
        expect(rec.camera).toEqual([false, true]);
    });

    it('every listener is removed on teardown — no double install on the next runtime', () => {
        for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'dblclick']) {
            expect(canvas.listenerCount(t)).toBe(1);
        }
        dispose();
        for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'dblclick']) {
            expect(canvas.listenerCount(t)).toBe(0);
        }
    });

    it('hover targets the handles through the SAME pick, and empty space clears them', () => {
        canvas.fire('pointermove', pointerEvent(10, 10));
        expect(rec.handleTargets.at(-1)).toBe('Kitchen');
        rec.pickNothing = true;
        canvas.fire('pointermove', pointerEvent(10, 10));
        expect(rec.handleTargets.at(-1)).toBeNull();
    });

    it('⭐ the handles port is OPTIONAL — the gesture works without any affordance', () => {
        // A surface may ship the drag before it ships the arrows. That is a regression in
        // DISCOVERABILITY, not in behaviour, and the core must not require the port.
        install({ handles: false });
        expect(rec.surface.handles).toBeUndefined();
        canvas.fire('pointermove', pointerEvent(10, 10)); // hover with no handles: no throw
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(200, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));
        expect(dispatched).toHaveLength(1);
    });

    it('the double-click resolves through the SAME pick as the drag', () => {
        const opened: string[] = [];
        canvas = fakeCanvas();
        rec = fakeSurface({ handles: true });
        dispose = installSpaceEnvelopeFaceDragOnSurface({
            domElement: canvas.el,
            surface: rec.surface,
            getRecord: () => ROOM,
            dispatch: () => { /* unused */ },
            onProfileEdit: (id) => { opened.push(id); },
        });
        canvas.fire('dblclick', pointerEvent(10, 10));
        expect(opened).toEqual(['Kitchen']);

        // ⛔ And a double-click on empty space is left ALONE, so the other double-click
        // paths (slab profile edit, SelectionManager) are untouched by this listener.
        rec.pickNothing = true;
        canvas.fire('dblclick', pointerEvent(10, 10));
        expect(opened).toEqual(['Kitchen']);
    });
});
