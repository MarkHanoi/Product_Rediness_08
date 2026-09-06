// §25.6 GESTURE 1 — THE LITTLE ARROW, DRIVEN.
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.6 · C114 §10 / §11 item 6 · ADR-0380 D4 · P6.
//
// ⭐ WHY THIS IS A BEHAVIOURAL SPEC AND NOT A SOURCE-ASSERTION ONE.
// `spaceEnvelopeProfileEditWire.spec.ts` reads `initTools.ts` as TEXT because that file
// cannot be imported in a unit test. The GIZMO does not have that problem: the builder
// and the drag controller are both importable, THREE runs headless for everything except
// `WebGLRenderer`, and a `Raycaster` needs no GL context at all. So this spec builds a
// real scene, fires real pointer events at a real camera, and asserts what the user's
// hand would produce — which is the difference between "the pieces agree" and "the
// gesture happens" ([[committed-is-not-reachable]]).
//
// ✅ ESTABLISHES: hovering an envelope draws one arrow per face; the arrow is the object
//    the ray hits FIRST, standing off its face; a pointer-down on the arrow starts a drag
//    on THAT face and disables the camera orbit; release re-enables it; the arrow follows
//    the previewed geometry; teardown removes everything.
// ⛔ DOES NOT ESTABLISH: that any pixel is drawn. No `WebGLRenderer` is created, no frame
//    is rendered, and nothing in this family is browser-verified (C114 §14d, unchanged).

import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '@pryzm/renderer-three/three';
import { SpaceEnvelopeFaceGizmoBuilder } from '../SpaceEnvelopeFaceGizmoBuilder';
import { SpaceEnvelopeMeshBuilder } from '../SpaceEnvelopeMeshBuilder';
import {
    installSpaceEnvelopeFaceDrag,
    type DraggableSpaceEnvelope,
} from '../spaceEnvelopeFaceDragController';

/** A 6 × 4 × 3 m room. Side face #1 is the plane x = 6, outward +x. */
const ROOM: DraggableSpaceEnvelope = {
    id: 'Kitchen',
    levelId: 'L0',
    role: 'room',
    name: 'Kitchen',
    withinId: null,
    footprint: [
        { x: 0, z: 0 },
        { x: 6, z: 0 },
        { x: 6, z: 4 },
        { x: 0, z: 4 },
    ],
    baseOffset: 0,
    height: 3,
};

const VIEW_W = 800;
const VIEW_H = 600;

/** A camera looking straight at the centre of side face #1 from outside. */
function cameraLookingAtFace1(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(50, VIEW_W / VIEW_H, 0.1, 500);
    cam.position.set(24, 1.5, 2);
    cam.lookAt(6, 1.5, 2);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

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
        getBoundingClientRect: () => ({
            left: 0, top: 0, width: VIEW_W, height: VIEW_H, right: VIEW_W, bottom: VIEW_H, x: 0, y: 0,
        }),
        setPointerCapture: () => { /* no-op */ },
        releasePointerCapture: () => { /* no-op */ },
    } as unknown as HTMLElement;
    return {
        el,
        fire(type, ev) {
            for (const fn of [...(listeners.get(type) ?? [])]) fn(ev);
        },
        listenerCount(type) {
            return (listeners.get(type) ?? []).length;
        },
    };
}

/** A pointer event carrying only the fields the controller reads. */
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

/** Centre of the viewport — NDC (0, 0), which the camera above aims at face #1. */
const CENTRE = { x: VIEW_W / 2, y: VIEW_H / 2 };

function gizmoMeshes(g: SpaceEnvelopeFaceGizmoBuilder): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    g.root().traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
}

describe('the builder — one double-headed arrow per face, in the scene', () => {
    let scene: THREE.Scene;
    let gizmo: SpaceEnvelopeFaceGizmoBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        gizmo = new SpaceEnvelopeFaceGizmoBuilder(scene);
    });

    it('draws nothing until it is given a target', () => {
        expect(gizmo.targetId()).toBeNull();
        expect(gizmo.handleCount()).toBe(0);
    });

    it("⭐ the founder's 'for each face a little arrow' — six faces, six arrows", () => {
        gizmo.setTarget(ROOM);
        expect(gizmo.targetId()).toBe('Kitchen');
        expect(gizmo.handleCount()).toBe(6); // 4 sides + top + bottom
        // Three meshes each: a shaft and TWO heads — the two directions the founder asked
        // for, made visible rather than merely permitted.
        expect(gizmoMeshes(gizmo)).toHaveLength(18);
    });

    it('⛔ every arrow mesh carries the SOLVER\'s face ref, so the pick cannot resolve elsewhere', () => {
        gizmo.setTarget(ROOM);
        const faces = gizmoMeshes(gizmo).map((m) => m.userData['spaceEnvelopeFace']);
        expect(faces.every((f) => f !== undefined)).toBe(true);
        expect(gizmoMeshes(gizmo).every((m) => m.userData['parentId'] === 'Kitchen')).toBe(true);
        // ⛔ NOT `role: 'geometry'` — that value is in SelectionManager.PARENT_RESOLVED_ROLES
        // and would make the handle resolve to its element, so clicking the arrow would
        // SELECT the envelope instead of dragging its face.
        expect(gizmoMeshes(gizmo).every((m) => m.userData['role'] === 'gizmo')).toBe(true);
        expect(gizmoMeshes(gizmo).every((m) => m.userData['selectable'] === false)).toBe(true);
    });

    it('the arrow for the +x face stands OUTSIDE that face, on the face axis', () => {
        gizmo.setTarget(ROOM);
        const node = gizmoMeshes(gizmo).find((m) => {
            const f = m.userData['spaceEnvelopeFace'] as { kind: string; edgeIndex?: number };
            return f.kind === 'side' && f.edgeIndex === 1;
        })!;
        const world = new THREE.Vector3();
        node.getWorldPosition(world);
        expect(world.x).toBeGreaterThan(6);      // outside the x = 6 face
        expect(world.z).toBeCloseTo(2, 3);       // on the face's own centre line
    });

    it('⛔ a record that describes no volume gets NO arrow, never a zero-length one', () => {
        gizmo.setTarget({ id: 'flat', footprint: ROOM.footprint, baseOffset: 0, height: 0 });
        expect(gizmo.handleCount()).toBe(0);
        expect(gizmo.targetId()).toBeNull();
        gizmo.setTarget({ id: 'line', footprint: [{ x: 0, z: 0 }, { x: 1, z: 0 }], baseOffset: 0, height: 3 });
        expect(gizmo.handleCount()).toBe(0);
    });

    it('re-targeting the SAME envelope re-places rather than duplicating', () => {
        gizmo.setTarget(ROOM);
        const before = gizmoMeshes(gizmo)[0]!;
        gizmo.setTarget({ ...ROOM, footprint: [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 4 }, { x: 0, z: 4 }] });
        expect(gizmo.handleCount()).toBe(6);
        expect(gizmoMeshes(gizmo)).toHaveLength(18);
        // The same mesh object, moved — not a replacement.
        expect(gizmoMeshes(gizmo).includes(before)).toBe(true);
    });

    it('the hovered face is lit differently from the rest, and clearing puts it back', () => {
        gizmo.setTarget(ROOM);
        const of = (kind: string, edgeIndex?: number) => gizmoMeshes(gizmo).filter((m) => {
            const f = m.userData['spaceEnvelopeFace'] as { kind: string; edgeIndex?: number };
            return f.kind === kind && (edgeIndex === undefined || f.edgeIndex === edgeIndex);
        });
        gizmo.setActiveFace({ kind: 'side', edgeIndex: 1 });
        const lit = of('side', 1)[0]!.material as THREE.MeshBasicMaterial;
        const dim = of('side', 0)[0]!.material as THREE.MeshBasicMaterial;
        expect(lit).not.toBe(dim);
        gizmo.setActiveFace(null);
        expect(of('side', 1)[0]!.material).toBe(dim);
    });

    it('clear() and dispose() leave nothing behind in the scene', () => {
        gizmo.setTarget(ROOM);
        expect(scene.children.length).toBeGreaterThan(0);
        gizmo.clear();
        expect(gizmo.handleCount()).toBe(0);
        gizmo.dispose();
        expect(scene.children).toHaveLength(0);
    });
});

describe('⭐ THE ARROW IS WHAT THE POINTER HITS — the reason the affordance is also the target', () => {
    it('the ray at the face centre meets a GIZMO mesh before the face mesh', () => {
        const scene = new THREE.Scene();
        const meshes = new SpaceEnvelopeMeshBuilder(scene);
        meshes.updateSpaceEnvelope(ROOM);
        const gizmo = new SpaceEnvelopeFaceGizmoBuilder(scene);
        gizmo.setTarget(ROOM);

        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(0, 0), cameraLookingAtFace1());
        const hits = ray.intersectObjects([meshes.groupOf('Kitchen')!, gizmo.root()], true);
        expect(hits.length).toBeGreaterThan(0);
        const first = hits[0]!.object;
        expect(first.userData['elementType']).toBe('SpaceEnvelopeFaceGizmo');
        const face = first.userData['spaceEnvelopeFace'] as { kind: string; edgeIndex: number };
        // ⭐ AND IT IS THE FACE IT IS DRAWN ON. An arrow that resolved to a different face
        // would move the wrong wall while looking entirely correct.
        expect(face).toEqual({ kind: 'side', edgeIndex: 1 });
    });
});

describe('the controller — hover shows the arrows, and the drag they start is the right face', () => {
    let scene: THREE.Scene;
    let meshes: SpaceEnvelopeMeshBuilder;
    let gizmo: SpaceEnvelopeFaceGizmoBuilder;
    let canvas: FakeCanvas;
    let cameraEnabled: boolean;
    let dispatched: { spaceEnvelopeId: string; face: unknown; deltaM: number }[];
    let dispose: () => void;

    beforeEach(() => {
        scene = new THREE.Scene();
        meshes = new SpaceEnvelopeMeshBuilder(scene);
        meshes.updateSpaceEnvelope(ROOM);
        gizmo = new SpaceEnvelopeFaceGizmoBuilder(scene);
        canvas = fakeCanvas();
        cameraEnabled = true;
        dispatched = [];
        const camera = cameraLookingAtFace1();
        dispose = installSpaceEnvelopeFaceDrag({
            domElement: canvas.el,
            camera: () => camera,
            builder: meshes,
            gizmo,
            getRecord: (id) => (id === ROOM.id ? ROOM : undefined),
            getWorld: () => [ROOM],
            dispatch: (p) => { dispatched.push(p); },
            setCameraControlsEnabled: (e) => { cameraEnabled = e; },
        });
    });

    it('⭐ hovering an envelope draws its arrows — the gesture becomes discoverable', () => {
        expect(gizmo.handleCount()).toBe(0);
        canvas.fire('pointermove', pointerEvent(CENTRE.x, CENTRE.y));
        expect(gizmo.targetId()).toBe('Kitchen');
        expect(gizmo.handleCount()).toBe(6);
    });

    it('⛔ hovering EMPTY space clears them — a handle for nothing the user is aiming at', () => {
        canvas.fire('pointermove', pointerEvent(CENTRE.x, CENTRE.y));
        expect(gizmo.targetId()).toBe('Kitchen');
        canvas.fire('pointermove', pointerEvent(2, 2)); // a corner, far off the prism
        expect(gizmo.targetId()).toBeNull();
    });

    it('pointerleave clears them too', () => {
        canvas.fire('pointermove', pointerEvent(CENTRE.x, CENTRE.y));
        canvas.fire('pointerleave', {});
        expect(gizmo.targetId()).toBeNull();
    });

    it('⛔ BREAK 1 — the camera orbit STOPS while a face is dragged, and comes back on release', () => {
        // Every other direct-manipulation drag in this app does this; this one did not,
        // and `stopPropagation` cannot substitute because camera-controls binds the SAME
        // element. The defect is invisible to a spec with no camera, which is why this
        // spec has one.
        expect(cameraEnabled).toBe(true);
        canvas.fire('pointerdown', pointerEvent(CENTRE.x, CENTRE.y));
        expect(cameraEnabled).toBe(false);
        canvas.fire('pointerup', pointerEvent(CENTRE.x, CENTRE.y));
        expect(cameraEnabled).toBe(true);
    });

    it('⛔ a pointercancel hands the camera back too — a frozen camera is the worse failure', () => {
        canvas.fire('pointerdown', pointerEvent(CENTRE.x, CENTRE.y));
        expect(cameraEnabled).toBe(false);
        canvas.fire('pointercancel', pointerEvent(CENTRE.x, CENTRE.y));
        expect(cameraEnabled).toBe(true);
    });

    it('⛔ and so does teardown mid-drag, or the next runtime inherits a dead camera', () => {
        canvas.fire('pointerdown', pointerEvent(CENTRE.x, CENTRE.y));
        expect(cameraEnabled).toBe(false);
        dispose();
        expect(cameraEnabled).toBe(true);
        expect(gizmo.targetId()).toBeNull();
    });

    it('⭐ grabbing the ARROW dispatches a move of the face it is drawn on — exactly one', () => {
        canvas.fire('pointerdown', pointerEvent(CENTRE.x, CENTRE.y));
        // Drag along the screen: the controller projects the ray onto the face's OWN axis,
        // so any pointer travel with a component along +x reads as a delta.
        canvas.fire('pointermove', pointerEvent(CENTRE.x + 160, CENTRE.y));
        canvas.fire('pointerup', pointerEvent(CENTRE.x + 160, CENTRE.y));
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]!.spaceEnvelopeId).toBe('Kitchen');
        expect(dispatched[0]!.face).toEqual({ kind: 'side', edgeIndex: 1 });
    });

    it('⛔ a drag that ended where it started dispatches NOTHING (C113 §6.4)', () => {
        canvas.fire('pointerdown', pointerEvent(CENTRE.x, CENTRE.y));
        canvas.fire('pointerup', pointerEvent(CENTRE.x, CENTRE.y));
        expect(dispatched).toHaveLength(0);
    });

    it('the listeners are all removed on teardown — no double install on the next runtime', () => {
        for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'dblclick']) {
            expect(canvas.listenerCount(t)).toBe(1);
        }
        dispose();
        for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'dblclick']) {
            expect(canvas.listenerCount(t)).toBe(0);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE WIRE — the static links `initTools.ts` cannot be imported to prove
// ═══════════════════════════════════════════════════════════════════════════════
//
// The specs above drive the builder and the controller directly. What they CANNOT reach
// is `initTools.ts`, which constructs a renderer, a camera and thirty tools. So the two
// links that make the whole thing reachable in the running app — the render attachment
// creating the gizmo, and `initTools` passing the camera-controls hook — are read from
// SOURCE, exactly as `spaceEnvelopeProfileEditWire.spec.ts` reads them and for the reason
// it states: *"a missing static link still breaks the chain, and a chain is only as good
// as the link nobody tested."*

describe('the wire — the links a unit test cannot import', () => {
    const EDITOR_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const read = (rel: string): string => fs.readFileSync(path.join(EDITOR_SRC, rel), 'utf8');

    it('attachSpaceEnvelopeRender CONSTRUCTS the gizmo and hands it to the drag', () => {
        const src = read('engine/attachSpaceEnvelopeRender.ts');
        expect(src).toMatch(/gizmo = new SpaceEnvelopeFaceGizmoBuilder\(deps\.scene\)/);
        expect(src).toMatch(/installSpaceEnvelopeFaceDrag\(\{[\s\S]{0,400}?\bgizmo,/);
    });

    it('⛔ and DISPOSES it, or the next runtime inherits a second set of arrows', () => {
        expect(read('engine/attachSpaceEnvelopeRender.ts')).toMatch(/gizmo\?\.dispose\(\)/);
    });

    it('⛔ initTools passes the camera-controls hook — BREAK 1, the orbit that never stopped', () => {
        const init = read('engine/initTools.ts');
        expect(init).toMatch(/setCameraControlsEnabled:\s*\(enabled: boolean\)\s*=>\s*\{/);
        expect(init).toMatch(/world\.camera\?\.controls\)\s*world\.camera\.controls\.enabled = enabled/);
    });

    it('the render attachment forwards that hook rather than inventing its own', () => {
        const src = read('engine/attachSpaceEnvelopeRender.ts');
        expect(src).toMatch(/setCameraControlsEnabled\?:\s*\(enabled: boolean\)\s*=>\s*void/);
        expect(src).toMatch(/setCameraControlsEnabled:\s*deps\.setCameraControlsEnabled/);
    });
});
