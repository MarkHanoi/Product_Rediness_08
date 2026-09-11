// §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) — the WebGPU viewport goes WHITE after dragging
// envelope faces.
// §GPU-RESOURCE-LIFETIME L1/L2 (ADR-0281 / ADR-0297) · C04 §3.1.2a rules 2 + 7 · C114 §10 ·
// C84 EI-9.
//
//   [RenderPipelineManager] PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' on
//     'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'."  … _renderTransparents …
//
// ⭐ WHAT THIS SPEC DRIVES. The REAL `SpaceEnvelopeMeshBuilder` (prism), the REAL
// `SpaceEnvelopeFaceGizmoBuilder` (arrows) and the REAL face-drag gesture over a REAL THREE scene,
// with every geometry reachable from the scene instrumented on its `dispose` event. The "frame
// boundary" is `drainGpuReleaseQueue()` — the call `RenderPipelineManager.render()` makes first
// thing every frame — and "what the next frame draws" is every visible mesh still reachable from
// the scene. That is the layer the defect lives at: a draw list that reaches a destroyed buffer.
//
// ✅ ESTABLISHES, for the prism, the arrows and the whole gesture (preview → restore → commit):
//    (1) nothing is disposed on the mutation tick; (2) no geometry is ever disposed while its mesh
//    is still reachable from the scene; (3) after the boundary, nothing reachable holds a
//    destroyed geometry; (4) the founder's §I2 path — a `usedTimes` TypeError thrown out of a
//    material dispose, which on WebGPU after a live renderer swap is what THREE's stale
//    `RenderObject.onMaterialDispose` → `NodeManager.delete` does — can no longer strand a
//    destroyed prism in the scene; (5) the label's CanvasTexture and material are released and
//    THREE's shared sprite geometry is not; (6) no envelope producer frees GPU memory by hand.
// ⛔ DOES NOT ESTABLISH: that a WebGPU frame renders. No renderer or device exists in happy-dom;
//    the three-side half of the mechanism is cited by file:line in `spaceEnvelopeGpuRelease.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { SpaceEnvelopeMeshBuilder } from '../SpaceEnvelopeMeshBuilder';
import { SpaceEnvelopeFaceGizmoBuilder } from '../SpaceEnvelopeFaceGizmoBuilder';
import {
    installSpaceEnvelopeFaceDrag,
    type DraggableSpaceEnvelope,
} from '../spaceEnvelopeFaceDragController';
import { releaseSpaceEnvelopeObject } from '../spaceEnvelopeGpuRelease';

/** A 6 × 4 × 3 m room. Side face #1 is the plane x = 6, outward +x. */
const ROOM: DraggableSpaceEnvelope = {
    id: 'Kitchen',
    levelId: 'L1',
    role: 'room',
    name: 'Kitchen',
    withinId: null,
    footprint: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    baseOffset: 0,
    height: 3,
};

/** Side face #1 moved by `d` metres along +x — what `spaceEnvelope.moveFace` commits. */
function movedFace1(r: DraggableSpaceEnvelope, d: number): DraggableSpaceEnvelope {
    return {
        ...r,
        footprint: r.footprint.map((p, i) => (i === 1 || i === 2 ? { x: p.x + d, z: p.z } : p)),
    };
}

const OTHER: DraggableSpaceEnvelope = { ...ROOM, id: 'Bedroom', name: 'Bedroom', levelId: 'L2', baseOffset: 3 };

const isMesh = (o: THREE.Object3D): o is THREE.Mesh => (o as { isMesh?: boolean }).isMesh === true;
const isSprite = (o: THREE.Object3D): o is THREE.Sprite => (o as { isSprite?: boolean }).isSprite === true;

function reachableFrom(obj: THREE.Object3D, scene: THREE.Object3D): boolean {
    for (let n: THREE.Object3D | null = obj; n; n = n.parent) if (n === scene) return true;
    return false;
}

/**
 * Watches every geometry that is reachable from the scene at the moment `watch()` runs, and
 * records — AT DISPOSE TIME — whether the mesh that draws it was still reachable. That is the
 * one question that decides whether a frame can reach a destroyed buffer.
 */
class LifetimeProbe {
    disposeCount = 0;
    readonly disposedWhileReachable: string[] = [];
    private readonly _disposed = new WeakSet<object>();
    private readonly _watched = new WeakSet<object>();

    constructor(private readonly _scene: THREE.Scene) {}

    watch(): void {
        this._scene.traverse((o) => {
            if (!isMesh(o)) return;
            const g = o.geometry;
            if (!g || this._watched.has(g)) return;
            this._watched.add(g);
            g.addEventListener('dispose', () => {
                this.disposeCount += 1;
                this._disposed.add(g);
                if (reachableFrom(o, this._scene)) this.disposedWhileReachable.push(o.name || o.uuid);
            });
        });
    }

    /** What the next frame would draw with a destroyed geometry. Must always be empty. */
    drawnWithDestroyedGeometry(): string[] {
        const out: string[] = [];
        const visit = (o: THREE.Object3D): void => {
            if (!o.visible) return;
            if (isMesh(o) && this._disposed.has(o.geometry)) out.push(o.name || o.uuid);
            for (const c of o.children) visit(c);
        };
        visit(this._scene);
        return out;
    }
}

/** THREE's `RenderObject.onMaterialDispose` → `NodeManager.delete` on a torn-down record. */
const USED_TIMES = "Cannot read properties of undefined (reading 'usedTimes')";

beforeEach(() => {
    // A release queued by another suite must not be counted here.
    drainGpuReleaseQueue();
});

afterEach(() => {
    drainGpuReleaseQueue();
    vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE PRISM — SpaceEnvelopeMeshBuilder, the object the founder's frame died on
// ═══════════════════════════════════════════════════════════════════════════════

describe('§ENVELOPE-EDIT-GPU-LIFETIME — the prism (SpaceEnvelopeMeshBuilder)', () => {
    let scene: THREE.Scene;
    let builder: SpaceEnvelopeMeshBuilder;
    let probe: LifetimeProbe;
    let oldFaces: number;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new SpaceEnvelopeMeshBuilder(scene);
        builder.updateSpaceEnvelope(ROOM);
        probe = new LifetimeProbe(scene);
        probe.watch();
        oldFaces = builder.groupOf(ROOM.id)!.children.filter(isMesh).length;
        expect(oldFaces).toBe(6); // 4 sides + top + bottom — the fixture is what it claims
    });

    it('a redraw (every drag frame, every commit) disposes NOTHING on the mutation tick', () => {
        builder.updateSpaceEnvelope(movedFace1(ROOM, 1));
        expect(probe.disposeCount).toBe(0);
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
        drainGpuReleaseQueue(); // ← the frame boundary
        expect(probe.disposeCount).toBe(oldFaces);
    });

    it('⛔ no face geometry is ever disposed while its mesh is still reachable from the scene', () => {
        builder.updateSpaceEnvelope(movedFace1(ROOM, 1));
        drainGpuReleaseQueue();
        expect(probe.disposedWhileReachable).toEqual([]);
    });

    it('⭐ the next frame draws no destroyed geometry — and there is ONE prism per id', () => {
        for (let d = 0.25; d <= 1.5; d += 0.25) builder.updateSpaceEnvelope(movedFace1(ROOM, d));
        drainGpuReleaseQueue();
        expect(probe.drawnWithDestroyedGeometry()).toEqual([]);
        expect(scene.children.filter((c) => c.name === `spaceEnvelope:${ROOM.id}`)).toHaveLength(1);
    });

    it("⭐⭐ THE FOUNDER'S PATH — a §I2 `usedTimes` throw out of the material cannot strand a destroyed prism", () => {
        const stale = builder.groupOf(ROOM.id)!;
        const faceMaterial = (stale.children.find(isMesh)!).material as THREE.Material;
        // Exactly what three's stale `RenderObject.onMaterialDispose` does after a live renderer
        // swap: `NodeManager.delete` reads `.usedTimes` off a torn-down record and throws.
        faceMaterial.addEventListener('dispose', () => { throw new TypeError(USED_TIMES); });

        expect(() => builder.updateSpaceEnvelope(movedFace1(ROOM, 1))).not.toThrow();
        expect(reachableFrom(stale, scene)).toBe(false);
        expect(builder.groupOf(ROOM.id)).not.toBe(stale);

        expect(() => drainGpuReleaseQueue()).not.toThrow(); // the boundary swallows §I2
        expect(probe.drawnWithDestroyedGeometry()).toEqual([]);
        // …and the NEXT redraw is not trapped behind a stale `_groups` entry.
        expect(() => builder.updateSpaceEnvelope(movedFace1(ROOM, 2))).not.toThrow();
        drainGpuReleaseQueue();
        expect(scene.children.filter((c) => c.name === `spaceEnvelope:${ROOM.id}`)).toHaveLength(1);
    });

    it('removeSpaceEnvelope (reap + teardown) detaches now and releases at the boundary', () => {
        builder.removeSpaceEnvelope(ROOM.id);
        expect(scene.children.filter((c) => c.name === `spaceEnvelope:${ROOM.id}`)).toHaveLength(0);
        expect(probe.disposeCount).toBe(0);
        drainGpuReleaseQueue();
        expect(probe.disposeCount).toBe(oldFaces);
        expect(probe.disposedWhileReachable).toEqual([]);
    });

    it('the faces share ONE material, and it is released exactly once — never n + 2 times', () => {
        const mat = (builder.groupOf(ROOM.id)!.children.find(isMesh)!).material as THREE.Material;
        const spy = vi.spyOn(mat, 'dispose');
        builder.removeSpaceEnvelope(ROOM.id);
        expect(spy).not.toHaveBeenCalled();
        drainGpuReleaseQueue();
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE LABEL — the one sprite in an envelope group
// ═══════════════════════════════════════════════════════════════════════════════

/** happy-dom has no 2-D canvas; hand the label a context that accepts every call. */
function withFakeCanvas2d<T>(fn: () => T): T {
    const realCreate = document.createElement.bind(document);
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (
        tag === 'canvas'
            ? ({ width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement)
            : realCreate(tag)
    )) as typeof document.createElement);
    try { return fn(); } finally { spy.mockRestore(); }
}

describe('§ENVELOPE-EDIT-GPU-LIFETIME — the label sprite', () => {
    it("releases the label's own CanvasTexture + material, and NEVER three's shared sprite geometry", () => {
        const scene = new THREE.Scene();
        const builder = new SpaceEnvelopeMeshBuilder(scene);
        withFakeCanvas2d(() => builder.updateSpaceEnvelope(ROOM));
        const label = builder.groupOf(ROOM.id)!.children.find(isSprite);
        expect(label, 'precondition: a named room draws a label').toBeDefined();
        const spriteMaterial = label!.material as THREE.SpriteMaterial;
        const map = spriteMaterial.map!;
        const materialSpy = vi.spyOn(spriteMaterial, 'dispose');
        const mapSpy = vi.spyOn(map, 'dispose');
        const sharedGeometryDisposed = vi.fn();
        label!.geometry.addEventListener('dispose', sharedGeometryDisposed);
        try {
            withFakeCanvas2d(() => builder.updateSpaceEnvelope(movedFace1(ROOM, 1)));
            expect(materialSpy).not.toHaveBeenCalled(); // nothing on the tick
            expect(mapSpy).not.toHaveBeenCalled();
            drainGpuReleaseQueue();
            expect(materialSpy).toHaveBeenCalledTimes(1);
            expect(mapSpy).toHaveBeenCalledTimes(1);
            // ⛔ Every other label in the app draws with this geometry (three Sprite.js:69-93).
            expect(sharedGeometryDisposed).not.toHaveBeenCalled();
        } finally {
            label!.geometry.removeEventListener('dispose', sharedGeometryDisposed);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE ARROWS — SpaceEnvelopeFaceGizmoBuilder, the other translucent indexed producer
// ═══════════════════════════════════════════════════════════════════════════════

describe('§ENVELOPE-EDIT-GPU-LIFETIME — the arrows (SpaceEnvelopeFaceGizmoBuilder)', () => {
    // HARDENING, not the crash path. The old `clear()` freed and detached in one synchronous
    // tick, which no frame can observe, and a geometry dispose cannot raise §I2 (three's
    // `RenderObject.onGeometryDispose` only nulls its attribute cache). Only the prism could
    // strand a destroyed object. These tests pin that the arrows follow the family's one order
    // all the same.
    let scene: THREE.Scene;
    let gizmo: SpaceEnvelopeFaceGizmoBuilder;
    let probe: LifetimeProbe;

    beforeEach(() => {
        scene = new THREE.Scene();
        gizmo = new SpaceEnvelopeFaceGizmoBuilder(scene);
        gizmo.setTarget(ROOM);
        probe = new LifetimeProbe(scene);
        probe.watch();
    });

    it('re-targeting another envelope releases the old arrows only after they have left the scene', () => {
        gizmo.setTarget(OTHER);
        expect(probe.disposeCount).toBe(0);
        drainGpuReleaseQueue();
        expect(probe.disposeCount).toBe(12); // 4 arrows × (shaft + 2 heads)
        expect(probe.disposedWhileReachable).toEqual([]);
        expect(probe.drawnWithDestroyedGeometry()).toEqual([]);
    });

    it('hover-leave (setTarget(null)) follows the same order', () => {
        gizmo.setTarget(null);
        expect(probe.disposeCount).toBe(0);
        drainGpuReleaseQueue();
        expect(probe.disposedWhileReachable).toEqual([]);
        expect(gizmo.handleCount()).toBe(0);
    });

    it('dispose() takes the root out now and releases the two shared materials at the boundary', () => {
        const mats = new Set<THREE.Material>();
        gizmo.root().traverse((o) => { if (isMesh(o)) mats.add(o.material as THREE.Material); });
        gizmo.setActiveFace({ kind: 'side', edgeIndex: 1 }); // puts the ACTIVE material in use too
        gizmo.root().traverse((o) => { if (isMesh(o)) mats.add(o.material as THREE.Material); });
        expect(mats.size).toBe(2);
        const spies = [...mats].map((m) => vi.spyOn(m, 'dispose'));
        gizmo.dispose();
        expect(scene.children).toHaveLength(0);
        for (const s of spies) expect(s).not.toHaveBeenCalled();
        drainGpuReleaseQueue();
        for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
        expect(probe.disposedWhileReachable).toEqual([]);
    });

    it('⛔ a §I2 throw out of a shared arrow material cannot abort the teardown', () => {
        let shared: THREE.Material | null = null;
        gizmo.root().traverse((o) => { if (isMesh(o) && !shared) shared = o.material as THREE.Material; });
        shared!.addEventListener('dispose', () => { throw new TypeError(USED_TIMES); });
        expect(() => gizmo.dispose()).not.toThrow();
        expect(scene.children).toHaveLength(0);
        expect(() => drainGpuReleaseQueue()).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE GESTURE — every envelope-edit producer on one face drag, as the founder did it
// ═══════════════════════════════════════════════════════════════════════════════

const VIEW_W = 800;
const VIEW_H = 600;
const CENTRE = { x: VIEW_W / 2, y: VIEW_H / 2 };

function cameraLookingAtFace1(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(50, VIEW_W / VIEW_H, 0.1, 500);
    cam.position.set(24, 1.5, 2);
    cam.lookAt(6, 1.5, 2);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
}

function fakeCanvas() {
    const listeners = new Map<string, ((e: unknown) => void)[]>();
    const el = {
        addEventListener(type: string, fn: (e: unknown) => void) {
            listeners.set(type, [...(listeners.get(type) ?? []), fn]);
        },
        removeEventListener(type: string, fn: (e: unknown) => void) {
            listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: VIEW_W, height: VIEW_H, right: VIEW_W, bottom: VIEW_H, x: 0, y: 0 }),
        setPointerCapture: () => { /* no-op */ },
        releasePointerCapture: () => { /* no-op */ },
    } as unknown as HTMLElement;
    return {
        el,
        fire(type: string, x: number, y: number) {
            const ev = { button: 0, pointerId: 1, clientX: x, clientY: y, stopPropagation: () => {}, preventDefault: () => {} };
            for (const fn of [...(listeners.get(type) ?? [])]) fn(ev);
        },
    };
}

describe('§ENVELOPE-EDIT-GPU-LIFETIME — the gesture: hover → grab → preview × n → commit redraw', () => {
    it('⭐ across the whole gesture nothing is disposed while reachable, and the next frame draws nothing destroyed', () => {
        const scene = new THREE.Scene();
        const builder = new SpaceEnvelopeMeshBuilder(scene);
        const gizmo = new SpaceEnvelopeFaceGizmoBuilder(scene);
        let current: DraggableSpaceEnvelope = ROOM;
        builder.updateSpaceEnvelope(current);
        const canvas = fakeCanvas();
        const camera = cameraLookingAtFace1();
        const dispatched: number[] = [];
        const disposeDrag = installSpaceEnvelopeFaceDrag({
            domElement: canvas.el,
            camera: () => camera,
            builder,
            gizmo,
            getRecord: (id) => (id === current.id ? current : undefined),
            getWorld: () => [current],
            // The store's own `subscribeDirty` redraw, which is what the commit really does.
            dispatch: (p) => {
                dispatched.push(p.deltaM);
                current = movedFace1(current, p.deltaM);
                builder.updateSpaceEnvelope(current);
            },
        });
        const probe = new LifetimeProbe(scene);
        const step = (type: string, dx: number): void => { probe.watch(); canvas.fire(type, CENTRE.x + dx, CENTRE.y); probe.watch(); };

        step('pointermove', 0);     // hover — the arrows appear
        step('pointerdown', 0);     // grab
        step('pointermove', 60);    // preview redraw
        step('pointermove', 120);   // preview redraw
        step('pointermove', 160);   // preview redraw
        step('pointerup', 160);     // ONE dispatch → the committed redraw

        expect(dispatched).toHaveLength(1);
        expect(probe.disposeCount, 'nothing may be freed on a pointer event').toBe(0);
        drainGpuReleaseQueue(); // ← the frame boundary
        expect(probe.disposeCount).toBeGreaterThan(0);
        expect(probe.disposedWhileReachable).toEqual([]);
        expect(probe.drawnWithDestroyedGeometry()).toEqual([]);
        expect(scene.children.filter((c) => c.name === `spaceEnvelope:${ROOM.id}`)).toHaveLength(1);

        disposeDrag();
        gizmo.dispose();
        drainGpuReleaseQueue();
        expect(probe.disposedWhileReachable).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE HELPER — one order, for every producer
// ═══════════════════════════════════════════════════════════════════════════════

describe('§ENVELOPE-EDIT-GPU-LIFETIME — releaseSpaceEnvelopeObject', () => {
    it('detaches on the call and frees nothing until the boundary', () => {
        const scene = new THREE.Scene();
        const group = new THREE.Group();
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshBasicMaterial();
        group.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo.clone(), mat));
        scene.add(group);
        const geoSpy = vi.spyOn(geo, 'dispose');
        const matSpy = vi.spyOn(mat, 'dispose');
        releaseSpaceEnvelopeObject(group, { disposeMaterials: true });
        expect(group.parent).toBeNull();
        expect(geoSpy).not.toHaveBeenCalled();
        expect(matSpy).not.toHaveBeenCalled();
        drainGpuReleaseQueue();
        expect(geoSpy).toHaveBeenCalledTimes(1);
        expect(matSpy).toHaveBeenCalledTimes(1); // shared by both meshes — released ONCE
    });

    it('disposeMaterials:false leaves the caller-owned materials alone unless handed in', () => {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial();
        group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
        const matSpy = vi.spyOn(mat, 'dispose');
        releaseSpaceEnvelopeObject(group, { disposeMaterials: false });
        drainGpuReleaseQueue();
        expect(matSpy).not.toHaveBeenCalled();
        releaseSpaceEnvelopeObject(new THREE.Group(), { disposeMaterials: false, ownedMaterials: [mat] });
        drainGpuReleaseQueue();
        expect(matSpy).toHaveBeenCalledTimes(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// THE GATE — no envelope-edit producer frees GPU memory by hand
// ═══════════════════════════════════════════════════════════════════════════════
//
// ⭐ WHY THIS EXISTS. `casterReleaseChokepoint.test.ts` ARM C is the repo's "no builder frees a mesh
// in place" gate, and it could not see this defect on TWO axes: POPULATION (it sweeps only
// `packages/geometry-*`; these builders live in `apps/editor/src/engine`) and FORM (its regex is
// `\.(geometry|materials?)\.dispose\(\)`, and the envelope code wrote `mesh.geometry?.dispose?.()`,
// `g.dispose()` and `(… as THREE.Material)?.dispose?.()`). This arm closes both for the family.

describe('§ENVELOPE-EDIT-GPU-LIFETIME — the gate', () => {
    const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const PRODUCERS = [
        'SpaceEnvelopeMeshBuilder.ts',
        'SpaceEnvelopeFaceGizmoBuilder.ts',
        'attachSpaceEnvelopeRender.ts',
        'spaceEnvelopeDragSurface.ts',
        'spaceEnvelopeDragSurfaceThree.ts',
        'spaceEnvelopeFaceDragController.ts',
        'spaceEnvelopeWallFollow.ts',
        'spaceEnvelopeWallFollowComposition.ts',
        'spaceEnvelopeWallFollowPlan.ts',
    ];
    const code = (rel: string): string => fs.readFileSync(path.join(ENGINE, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('no producer calls a GPU dispose() of its own — only the builder teardown methods', () => {
        // `gizmo?.dispose()` is `SpaceEnvelopeFaceGizmoBuilder.dispose`, which itself goes
        // through the helper; nothing else may call `.dispose(` in these files.
        const ALLOWED_RECEIVERS = new Set(['gizmo']);
        const offenders: string[] = [];
        for (const rel of PRODUCERS) {
            const src = code(rel);
            for (const m of src.matchAll(/([A-Za-z_$][\w$]*|\))\s*\??\.\s*dispose\s*(?:\?\.)?\s*\(/g)) {
                if (!ALLOWED_RECEIVERS.has(m[1]!)) offenders.push(`${rel}: ${m[0]}`);
            }
        }
        expect(offenders, 'route the teardown through releaseSpaceEnvelopeObject() — detach first, release at the frame boundary').toEqual([]);
    });

    it('…nor reaches past the helper to the release funnel directly (one order, written once)', () => {
        const bypass = PRODUCERS.filter((rel) => /\b(scheduleGpuRelease|safeDispose\w*|detachAndReleaseChildren)\s*\(/.test(code(rel)));
        expect(bypass).toEqual([]);
    });

    it('the helper DETACHES before it schedules anything', () => {
        const src = code('spaceEnvelopeGpuRelease.ts');
        const body = src.slice(src.indexOf('export function releaseSpaceEnvelopeObject'));
        const detachAt = body.indexOf('removeFromParent()');
        const releaseAt = body.indexOf('scheduleGpuRelease(');
        expect(detachAt).toBeGreaterThan(-1);
        expect(releaseAt).toBeGreaterThan(detachAt);
    });
});
