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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    emitSpaceEnvelopeFaceMoved,
    installSpaceEnvelopeFaceDragOnSurface,
    SPACE_ENVELOPE_FACE_MOVED_EVENT,
    type SpaceEnvelopeFaceMoveCommitted,
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-DRAG-CONSEQUENCE (lane FACE-DRAG-2, 2026-09-07) — WHAT A COMMITTED MOVE TELLS THE
// REST OF THE APP. Handover ADDENDUM §D.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE RINGS ARE THE POINT, AND THEY ARE WHY THIS IS NOT "just emit the payload". The command's
// own payload is `{face, deltaM}` — RELATIVE to whatever solid the store holds when it runs. A
// wall-follows-envelope handler that saw only the delta could not compute where the wall goes
// without re-deriving the subject's geometry, and a second derivation of one geometry is the
// C84 EI-9 hazard. So both rings travel WITH the event.
//
// ✅ ESTABLISHES: one event per committed gesture, never more; `ringBefore` is the PRE-drag
//    footprint and `ringAfter` is the geometry the commit was asked to write, and they DIFFER by
//    the drag; a no-op gesture raises NOTHING; a throwing listener cannot break the gesture; and
//    the event is raised AFTER the dispatch, never instead of it.
// ⛔ DOES NOT ESTABLISH: that anything consumes it. There are ZERO consumers in the tree today —
//    it is built ahead of the cascade lane so that lane need not reopen this gesture.
describe('§ENVELOPE-DRAG-CONSEQUENCE — the committed-move event', () => {
    let canvas: FakeCanvas;
    let rec: Recorder;
    let dispatched: { spaceEnvelopeId: string; face: SpaceEnvelopeFaceRef; deltaM: number }[];
    let committed: SpaceEnvelopeFaceMoveCommitted[];
    let order: string[];

    const install = (onCommitted?: (ev: SpaceEnvelopeFaceMoveCommitted) => void): (() => void) => {
        canvas = fakeCanvas();
        rec = fakeSurface({ handles: false });
        dispatched = [];
        committed = [];
        order = [];
        return installSpaceEnvelopeFaceDragOnSurface({
            domElement: canvas.el,
            surface: rec.surface,
            surfaceId: 'test-surface',
            getRecord: (id) => (id === ROOM.id ? ROOM : undefined),
            getWorld: () => [ROOM],
            dispatch: (p) => { dispatched.push(p); order.push('dispatch'); },
            onCommitted: onCommitted ?? ((ev) => { committed.push(ev); order.push('committed'); }),
        });
    };

    const fullDrag = (): void => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(200, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));
    };

    it('raises EXACTLY ONE event per committed gesture, carrying BOTH rings and the surface', () => {
        const dispose = install();
        fullDrag();
        expect(dispatched).toHaveLength(1);
        expect(committed).toHaveLength(1);
        const ev = committed[0]!;
        expect(ev.spaceEnvelopeId).toBe('Kitchen');
        expect(ev.face).toEqual(FACE_1);
        expect(ev.deltaM).toBe(dispatched[0]!.deltaM);
        expect(ev.surfaceId).toBe('test-surface');
        // ⭐ `ringBefore` is the PRE-drag footprint, vertex for vertex.
        expect(ev.ringBefore).toEqual(ROOM.footprint);
        dispose();
    });

    it('⭐ `ringAfter` is the ring the commit was asked to write — face #1 moved, the rest held', () => {
        const dispose = install();
        fullDrag();
        const ev = committed[0]!;
        // Face #1 is the plane x = 6, outward +x. A 2 m pull moves ONLY the two vertices on
        // that edge; a `ringAfter` equal to `ringBefore` would mean the event carried the
        // pre-drag solid and the cascade would rebuild a wall exactly where it already was.
        expect(ev.ringAfter).not.toEqual(ev.ringBefore);
        expect(ev.ringAfter).toHaveLength(ROOM.footprint.length);
        const movedX = ev.ringAfter.map((p) => p.x).filter((x) => Math.abs(x - 6) > 1e-6);
        expect(movedX.length).toBeGreaterThan(0);
        // The vertices NOT on the dragged edge are untouched — x = 0 survives.
        expect(ev.ringAfter.some((p) => Math.abs(p.x) < 1e-9)).toBe(true);
        dispose();
    });

    it('⛔ raised AFTER the dispatch, never instead of it', () => {
        const dispose = install();
        fullDrag();
        expect(order).toEqual(['dispatch', 'committed']);
        dispose();
    });

    it('⛔ a NO-OP gesture raises NOTHING — as it dispatches nothing (C113 §6.4)', () => {
        const dispose = install();
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointerup', pointerEvent(0, 0));
        expect(dispatched).toHaveLength(0);
        expect(committed).toHaveLength(0);
        dispose();
    });

    it('⛔ a listener that THROWS cannot break the gesture — the move is already committed', () => {
        const dispose = install(() => { throw new Error('a consequence handler blew up'); });
        expect(() => fullDrag()).not.toThrow();
        expect(dispatched).toHaveLength(1);
        dispose();
    });

    it('the emit helper is total — no sink, a sink with no `emit`, and a throwing sink', () => {
        const seen: { name: string; payload: unknown }[] = [];
        const ev: SpaceEnvelopeFaceMoveCommitted = {
            spaceEnvelopeId: 'Kitchen',
            face: FACE_1,
            deltaM: 2,
            ringBefore: ROOM.footprint,
            ringAfter: ROOM.footprint,
        };
        expect(() => emitSpaceEnvelopeFaceMoved(null, ev)).not.toThrow();
        expect(() => emitSpaceEnvelopeFaceMoved(undefined, ev)).not.toThrow();
        expect(() => emitSpaceEnvelopeFaceMoved({} as never, ev)).not.toThrow();
        expect(() => emitSpaceEnvelopeFaceMoved(
            { emit: () => { throw new Error('listener'); } }, ev,
        )).not.toThrow();
        emitSpaceEnvelopeFaceMoved({ emit: (name, payload) => { seen.push({ name, payload }); } }, ev);
        // ⛔ ONE NAME, asserted against the exported constant rather than a second literal —
        // a spec that re-spelled it would pass while production and consumer disagreed.
        expect(seen).toEqual([{ name: SPACE_ENVELOPE_FACE_MOVED_EVENT, payload: ev }]);
        expect(SPACE_ENVELOPE_FACE_MOVED_EVENT).toBe('pryzm:spaceEnvelope:faceMoved');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-PER-LEVEL — ONE INDEPENDENT ENVELOPE PER STOREY, PINNED SO IT CANNOT SILENTLY
//    BECOME ONE PRISM EXTRUDED OVER N.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Founder: *"also we shall have a independt buildable envleope for each level."*
//
// ⭐ THIS IS A REGRESSION PIN, NOT A NEW FEATURE — AND SAYING SO IS THE POINT. The independence
// the founder asked for is ALREADY how the model works, and this lane's finding was that nothing
// asserted it. Three facts hold it up, and all three are load-bearing:
//   1. `SpaceEnvelope` is seated on ONE storey — `levelId` (`SpaceEnvelope.ts:174`), with its own
//      `footprint` (`:200`), `baseOffset` (`:211`) and `height` (`:218`).
//   2. Authoring emits N records for N storeys in ONE batch — `envelopeAuthoringPlan.ts:22-23`:
//      *"four floors are four records, each on its own `levelId`, minted in ONE batch."*
//   3. The gesture's payload names ONE `spaceEnvelopeId`, and the contextual planner refuses to
//      adapt across storeys — `SpaceEnvelopeContext.ts:640` scopes a level's adaptation to rooms
//      whose `withinId` is that level, and `:689` types a cross-storey neighbour as NOT-A-PEER.
//
// ⛔ WHAT WOULD BREAK IT, AND THEREFORE WHAT THIS TEST EXISTS TO CATCH: any future change that
// re-extrudes the stack from one footprint — a "keep the storeys aligned" convenience, a shared
// ring, a neighbour rule that stops checking `levelId`. Each of those would look right on screen
// for the common case where every storey has the same plate, and would silently destroy the
// setback the founder asked for the moment one storey differed. That is the failure this pins.

/** Four storeys, stacked, each its own record on its own `levelId` — the shape §ENVELOPE-PER-LEVEL
 *  describes and `envelopeAuthoringPlan` mints. Same plate, so a bug that re-extruded the stack
 *  would still LOOK correct — which is exactly why the assertions are on identity, not geometry. */
const STOREYS: DraggableSpaceEnvelope[] = [0, 1, 2, 3].map((i) => ({
    id: `L${i}-envelope`,
    levelId: `L${i}`,
    role: 'level',
    name: `Storey ${i}`,
    withinId: null,
    footprint: ROOM.footprint,
    baseOffset: i * 3,
    height: 3,
}));

describe('⭐ §ENVELOPE-PER-LEVEL — dragging one storey’s face moves THAT storey only', () => {
    let canvas: FakeCanvas;
    let rec: Recorder;
    let dispatched: { spaceEnvelopeId: string; face: SpaceEnvelopeFaceRef; deltaM: number }[];
    let committed: SpaceEnvelopeFaceMoveCommitted[];
    let dispose: () => void;

    beforeEach(() => {
        canvas = fakeCanvas();
        rec = fakeSurface({ handles: false });
        dispatched = [];
        committed = [];
        // ⭐ THE SUBJECT IS STOREY 2 — deliberately not the first or the last, so an
        // off-by-one that always picked the bottom (or the top) of the stack fails here.
        rec.picked = STOREYS[2]!;
        dispose = installSpaceEnvelopeFaceDragOnSurface({
            domElement: canvas.el,
            surface: rec.surface,
            getRecord: (id) => STOREYS.find((r) => r.id === id),
            getWorld: () => STOREYS,
            dispatch: (p) => { dispatched.push(p); },
            onCommitted: (ev) => { committed.push(ev); },
        });
    });

    afterEach(() => { dispose(); });

    it('⛔ EXACTLY ONE dispatch, naming THAT storey — the other three are not re-extruded', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(120, 0));
        canvas.fire('pointerup', pointerEvent(120, 0));

        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]!.spaceEnvelopeId).toBe('L2-envelope');
        // The whole point: no sibling storey is named by any dispatch.
        const named = dispatched.map((d) => d.spaceEnvelopeId);
        for (const other of ['L0-envelope', 'L1-envelope', 'L3-envelope']) {
            expect(named).not.toContain(other);
        }
    });

    it('⛔ the PREVIEW redraws that storey and NO other — a stacked neighbour is not a peer', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(120, 0));

        expect(rec.drawn.length).toBeGreaterThan(0);
        expect([...new Set(rec.drawn.map((r) => r.id))]).toEqual(['L2-envelope']);
    });

    it('⭐ the storey that moved is the storey the consequence names — a setback is per level', () => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(120, 0));
        canvas.fire('pointerup', pointerEvent(120, 0));

        expect(committed).toHaveLength(1);
        expect(committed[0]!.spaceEnvelopeId).toBe('L2-envelope');
        // ⭐ THE RING ACTUALLY DIFFERS — the record for storey 2 is now a different plate from its
        // neighbours', which IS the founder's setback. A pin that only checked ids would pass
        // against an implementation that named one storey and moved nothing.
        expect(committed[0]!.ringAfter).not.toEqual(committed[0]!.ringBefore);
        expect(committed[0]!.ringBefore).toEqual(STOREYS[0]!.footprint);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-PARTITIONS-FOLLOW (lane WALLS-FOLLOW-WIRE, 2026-09-07) — THE ROOMS THE SAME COMMIT
//    MOVED TRAVEL WITH THE EVENT.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHY THIS FIELD DECIDES WHETHER THE FOUNDER'S ASK IS POSSIBLE AT ALL. A partition is
// `boundedBy` its ROOM envelope — `buildFromDesignPlan.ts:631` writes `envelopeRole: 'room'` on
// every partition's `derivedFrom` — never the level the pointer grabbed. So an event carrying only
// the SUBJECT's two rings can move the perimeter and can NEVER move a partition, however the
// cascade downstream is written. The rooms DO move in the same commit
// (`MutateSpaceEnvelope.ts:238-260` maps `plan.adapted` into the same `produceCommand`); without
// this field their new rings die inside the gesture.
//
// ✅ ESTABLISHES: a level drag that strands a room reports THAT ROOM with a `ringBefore` equal to
//    its PRE-drag footprint and a `ringAfter` that differs; the field is OMITTED (not sent empty)
//    when nothing adapted; and the adapted ring is the one the PREVIEW drew, not a re-derivation.
// ⛔ DOES NOT ESTABLISH: that any wall moves. That is `spaceEnvelopeWallFollow.spec.ts`.

/** The storey plate: 6 × 4 m, face #1 is the plane x = 6, outward +x. */
const HOST_LEVEL: DraggableSpaceEnvelope = {
    id: 'L0-envelope',
    levelId: 'L0',
    role: 'level',
    name: 'Ground',
    withinId: null,
    footprint: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    baseOffset: 0,
    height: 3,
};

/** A room seated in it, hard against the face that will be dragged INWARD. */
const SEATED_ROOM: DraggableSpaceEnvelope = {
    id: 'Kitchen-in-L0',
    levelId: 'L0',
    role: 'room',
    name: 'Kitchen',
    withinId: 'L0-envelope',
    footprint: [{ x: 2, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 2, z: 4 }],
    baseOffset: 0,
    height: 3,
};

describe('⭐ §ENVELOPE-PARTITIONS-FOLLOW — the committed event names the rooms that moved with it', () => {
    let canvas: FakeCanvas;
    let rec: Recorder;
    let committed: SpaceEnvelopeFaceMoveCommitted[];
    let dispose: () => void;

    const install = (world: DraggableSpaceEnvelope[], subject: DraggableSpaceEnvelope): void => {
        canvas = fakeCanvas();
        rec = fakeSurface({ handles: false });
        rec.picked = subject;
        committed = [];
        dispose = installSpaceEnvelopeFaceDragOnSurface({
            domElement: canvas.el,
            surface: rec.surface,
            getRecord: (id) => world.find((r) => r.id === id),
            getWorld: () => world,
            dispatch: () => { /* the store is not written in this fixture */ },
            onCommitted: (ev) => { committed.push(ev); },
        });
    };

    afterEach(() => { dispose(); });

    /** Face #1 pulled INWARD (−x): the level shrinks past the room, so the room must follow. */
    const dragInward = (pixels: number): void => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(-pixels, 0));
        canvas.fire('pointerup', pointerEvent(-pixels, 0));
    };

    it('⭐ a level face pulled in past a room reports THAT ROOM, with both of its rings', () => {
        install([HOST_LEVEL, SEATED_ROOM], HOST_LEVEL);
        dragInward(200);

        expect(committed).toHaveLength(1);
        const ev = committed[0]!;
        expect(ev.spaceEnvelopeId).toBe('L0-envelope');
        expect(ev.adapted).toBeDefined();
        expect(ev.adapted!.map((a) => a.envelopeId)).toEqual(['Kitchen-in-L0']);

        const room = ev.adapted![0]!;
        // ⭐ `ringBefore` IS THE PRE-DRAG FOOTPRINT, VERTEX FOR VERTEX. The store is never written
        // in this fixture, so a `ringBefore` that had come from a post-commit read would still be
        // this — which is why the NEXT assertion, that the two rings DIFFER, is the load-bearing
        // one: it is what fails if the capture ever silently starts returning the moved ring.
        expect(room.ringBefore).toEqual(SEATED_ROOM.footprint);
        expect(room.ringAfter).not.toEqual(room.ringBefore);
        expect(room.ringAfter).toHaveLength(SEATED_ROOM.footprint.length);
        // The room's own far edge (x = 2) is untouched; only the edge that met the level moved.
        expect(room.ringAfter.some((q) => Math.abs(q.x - 2) < 1e-9)).toBe(true);
        expect(room.ringAfter.every((q) => q.x <= 6 - 1e-9 + 1e-6)).toBe(true);
    });

    it('⭐ the reported ring IS the ring the PREVIEW drew — one plan, never two derivations', () => {
        install([HOST_LEVEL, SEATED_ROOM], HOST_LEVEL);
        dragInward(200);

        const room = committed[0]!.adapted![0]!;
        // The LAST preview drawn for that room is the one the commit was asked to write.
        const drawnForRoom = rec.drawn.filter((r) => r.id === 'Kitchen-in-L0');
        expect(drawnForRoom.length).toBeGreaterThan(0);
        expect(drawnForRoom[drawnForRoom.length - 1]!.footprint)
            .toEqual(room.ringAfter.map((q) => ({ x: q.x, z: q.z })));
    });

    it('⛔ nothing adapted ⇒ the field is OMITTED, never an empty array', () => {
        // Pulled OUTWARD: the room is still contained, so `SpaceEnvelopeContext.ts:422` skips it
        // and NO room moves. That is the model's answer, not a gap — and "no room moved" must not
        // arrive looking like "this surface does not report rooms" (§CONTEXT-DATA-HONESTY).
        install([HOST_LEVEL, SEATED_ROOM], HOST_LEVEL);
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(200, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));

        expect(committed).toHaveLength(1);
        expect(committed[0]!.ringAfter).not.toEqual(committed[0]!.ringBefore);
        expect(committed[0]!.adapted).toBeUndefined();
    });

    it('⛔ a lone envelope with no rooms at all reports no adapted set', () => {
        install([HOST_LEVEL], HOST_LEVEL);
        dragInward(150);
        expect(committed).toHaveLength(1);
        expect(committed[0]!.adapted).toBeUndefined();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-FACE-DRAG-PER-LEVEL (lane FACE-DRAG-BUTTON, L-13236) — THE PER-STOREY SUBJECT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Founder: *"SO THE USER COULD SELECT A LEVEL AND DRAG THE FACES OF EACH VOLUME PER LEVEL"*.
//
// ⛔ THE ARM THAT MATTERS MOST IS THE PERMISSIVE ONE. A focus RESTRICTS and must never ENABLE: with
// no focus the gesture has to behave exactly as it did before this lane existed, or the button
// would have silently turned a live gesture into a mode that only works after someone finds it —
// a reachability regression wearing a feature's clothes. Both directions are pinned below.
//
// ⛔ AND THE GUARD IS PINNED HERE, IN THE CORE, RATHER THAN IN EACH ADAPTER. That is the whole
// reason it was written here: three surfaces would otherwise be three copies of one restriction,
// and a copy that drifted would let the arrows stand on a storey the pick refuses — an affordance
// that lies (C84 EI-9).

/** A second storey stacked on the same footprint — the neighbour a mis-grab lands on. */
const UPSTAIRS: DraggableSpaceEnvelope = { ...ROOM, id: 'Upstairs', baseOffset: 3 };

describe('⭐ the per-storey FOCUS restricts the pick — and, unfocused, restricts nothing', () => {
    let canvas: FakeCanvas;
    let rec: Recorder;
    let dispatched: { spaceEnvelopeId: string; face: SpaceEnvelopeFaceRef; deltaM: number }[];
    let edited: string[];
    let focus: { spaceEnvelopeId: string } | null;
    let dispose: () => void;

    const install = (opts?: { throwingFocus?: boolean }): void => {
        canvas = fakeCanvas();
        rec = fakeSurface({ handles: true });
        dispatched = [];
        edited = [];
        focus = null;
        const world = [ROOM, UPSTAIRS];
        dispose = installSpaceEnvelopeFaceDragOnSurface({
            domElement: canvas.el,
            surface: rec.surface,
            getRecord: (id) => world.find((r) => r.id === id),
            getWorld: () => world,
            dispatch: (p) => { dispatched.push(p); },
            onProfileEdit: (id) => { edited.push(id); },
            readFocus: opts?.throwingFocus
                ? () => { throw new Error('the focus slot blew up'); }
                : () => focus,
        });
    };

    beforeEach(() => { install(); });
    afterEach(() => { dispose(); });

    const fullDrag = (): void => {
        canvas.fire('pointerdown', pointerEvent(0, 0));
        canvas.fire('pointermove', pointerEvent(200, 0));
        canvas.fire('pointerup', pointerEvent(200, 0));
    };

    it('⛔ NO FOCUS ⇒ NO RESTRICTION — every envelope is grabbable exactly as before this lane', () => {
        rec.picked = UPSTAIRS;
        fullDrag();
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]!.spaceEnvelopeId).toBe('Upstairs');
    });

    it('⭐ the FOCUSED storey drags — one gesture, one dispatch (C114 §6a)', () => {
        focus = { spaceEnvelopeId: 'Upstairs' };
        rec.picked = UPSTAIRS;
        fullDrag();
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]!.spaceEnvelopeId).toBe('Upstairs');
    });

    it('⛔ a grab that lands on ANOTHER storey is DROPPED — this is the whole point of "per level"', () => {
        // Five storeys share one footprint; from a low camera the face of Level 2 and the face of
        // Level 3 occupy the same pixels. Without this, the founder aims at the storey he selected
        // and moves the one above it — and the result looks like a working drag.
        focus = { spaceEnvelopeId: 'Kitchen' };
        rec.picked = UPSTAIRS;
        fullDrag();
        expect(dispatched).toHaveLength(0);
        // ⛔ AND THE CAMERA IS NEVER TAKEN. A drop that still suspended navigation would leave the
        // globe frozen with no gesture running to hand it back.
        expect(rec.camera).toEqual([]);
    });

    it('⛔ and the DOUBLE-CLICK obeys the same focus — no editing a storey you deselected', () => {
        focus = { spaceEnvelopeId: 'Kitchen' };
        rec.picked = UPSTAIRS;
        canvas.fire('dblclick', pointerEvent(0, 0));
        expect(edited).toEqual([]);
        rec.picked = ROOM;
        canvas.fire('dblclick', pointerEvent(0, 0));
        expect(edited).toEqual(['Kitchen']);
    });

    it('⭐ the FOCUSED storey keeps its arrows when the pointer is over nothing', () => {
        // The founder pressed *Drag face* in a panel on the other side of the screen. A
        // hover-only affordance would blink his selection away the instant he moved the pointer to
        // aim at it — i.e. the selection would be invisible exactly while he was acting on it.
        focus = { spaceEnvelopeId: 'Kitchen' };
        rec.pickNothing = true;
        canvas.fire('pointermove', pointerEvent(10, 10));
        expect(rec.handleTargets[rec.handleTargets.length - 1]).toBe('Kitchen');
        // …and leaving the canvas entirely does not drop them either.
        canvas.fire('pointerleave', {});
        expect(rec.handleTargets[rec.handleTargets.length - 1]).toBe('Kitchen');
    });

    it('⛔ UNFOCUSED, hovering nothing still CLEARS the handles — the old behaviour is untouched', () => {
        rec.picked = ROOM;
        canvas.fire('pointermove', pointerEvent(10, 10));   // hover ON — handles appear
        expect(rec.handleTargets[rec.handleTargets.length - 1]).toBe('Kitchen');
        rec.pickNothing = true;
        canvas.fire('pointermove', pointerEvent(10, 10));   // hover OFF — handles go
        expect(rec.handleTargets[rec.handleTargets.length - 1]).toBeNull();
    });

    it('⛔ a THROWING focus reader does NOT restrict, and does not kill the gesture', () => {
        // Restricting on a slot that could not be read would make every face un-grabbable while
        // looking like a working selection — failure and emptiness arriving as the same value.
        install({ throwingFocus: true });
        rec.picked = UPSTAIRS;
        expect(() => fullDrag()).not.toThrow();
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]!.spaceEnvelopeId).toBe('Upstairs');
    });
});
