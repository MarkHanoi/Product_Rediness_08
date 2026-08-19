// @vitest-environment happy-dom
/**
 * §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — the selection path must not free
 * GPU resources inside the click handler.
 *
 * ── THE FOUNDER'S SYMPTOM (production 2026-08-18, alongside L-981) ────────────
 *   [runtime-composer/EventBus] listener for "bim-selection-changed" threw:
 *   TypeError: Cannot read properties of undefined (reading 'usedTimes')
 *       at NodeManager.delete  (vendor-three)
 *       … at RenderObject.onMaterialDispose
 *       … at Material.dispatchEvent … at Material.dispose
 *       … at Object3D.traverse            ← a scene traverse disposing as it goes
 *   emit → unselectAll → select → performSelection
 * and then, twelve times:
 *   [ViewportCrashGuard] §I3 suppressed non-fatal GPU internal (window.onerror) 1/12
 *
 * `usedTimes` undefined inside three's renderer bookkeeping means a material was
 * disposed while the renderer still held a RenderObject for it — the same fault
 * class as L-981's "Destroyed texture [ShadowDepthTexture] used in a submit", one
 * abstraction layer up. `unselectAll()` is named in that stack, and `unselectAll()`
 * reaches `clearHighlight()`, which traversed the detached highlight subtree and
 * called `dispose()` on every geometry and material as it went — synchronously,
 * inside the click handler, with the previous frame's command buffer potentially
 * still in flight.
 *
 * ── WHAT WAS THERE BEFORE, AND WHY IT WAS NOT ENOUGH ─────────────────────────
 * §SELECT-CLEARHIGHLIGHT-DISPOSE-GUARD already routed these through
 * `safeDisposeMaterial` / `safeDisposeGeometry`. Those helpers SWALLOW the
 * `usedTimes` TypeError. Swallowing is not ordering: the resource is still freed
 * while the renderer references it, and the throw is merely the LOUDEST possible
 * outcome — the quiet one is a corrupted program cache and a mesh that stops
 * drawing. The guard stopped the pick from aborting; it never closed the window.
 *
 * ── THE ORDERING THESE TESTS PIN ─────────────────────────────────────────────
 * ADR-0297 INVARIANT L2, the authority this repo already declares: DETACH now,
 * RELEASE at the frame boundary the renderer owns. `scheduleGpuRelease()` enqueues;
 * `RenderPipelineManager.render()` drains at the top of a frame, after the previous
 * submit returned and before this frame opens an encoder. This is the SAME queue
 * every fragment builder already uses — not a fifth local workaround.
 *
 * The teeth are NOT "dispose was called". They are "dispose was called AFTER the
 * click handler returned, NEVER during it" — every test asserts zero disposals
 * immediately after the synchronous call, and exactly one after the drain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { SelectionManager } from '../src/SelectionManager.js';

// ── Minimal structural fakes (mirrors SelectionManager.gizmoReattach.test.ts) ──

function makeWorld(scene: THREE.Scene) {
    const threeRenderer = {
        domElement: { clientWidth: 100, clientHeight: 100 },
        capabilities: { maxTextureSize: 4096 },
        getRenderTarget: () => null,
        setRenderTarget: () => {},
        render: () => {},
        readRenderTargetPixels: () => {},
    };
    return {
        scene: { three: scene },
        renderer: { three: threeRenderer },
    } as unknown as ConstructorParameters<typeof SelectionManager>[0];
}

function makeCamera() {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 5);
    return { three: cam } as unknown as ConstructorParameters<typeof SelectionManager>[1];
}

function makeTransformControls() {
    const tc = {
        object: null as THREE.Object3D | null,
        attach: vi.fn(),
        detach: vi.fn(),
        addEventListener: vi.fn(),
    };
    tc.attach.mockImplementation((o: THREE.Object3D) => { tc.object = o; });
    tc.detach.mockImplementation(() => { tc.object = null; });
    return tc;
}

function makeDom(): HTMLElement {
    return {
        style: {},
        addEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as unknown as HTMLElement;
}

function makeManager(scene: THREE.Scene): SelectionManager {
    return new SelectionManager(
        makeWorld(scene),
        makeCamera(),
        makeDom(),
        makeTransformControls() as unknown as ConstructorParameters<typeof SelectionManager>[3],
        () => {},
    );
}

/**
 * The highlight subtree exactly as `_buildGeometryHighlight()` mints it: a Group of
 * clones, each carrying `userData.sharedGeometry = true` for the clones that reuse a
 * LIVE element's buffers, plus one highlight-OWNED mesh with its own geometry.
 */
function makeHighlightGroup() {
    const group = new THREE.Group();
    group.userData.isHelper = true;

    // A clone sharing the real element's geometry — must NEVER be disposed.
    const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
    const sharedMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const shared = new THREE.Mesh(sharedGeo, sharedMat);
    shared.userData.sharedGeometry = true;
    group.add(shared);

    // A highlight-owned mesh: both its geometry and material are ours to release.
    const ownedGeo = new THREE.BoxGeometry(1, 1, 1);
    const ownedMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const owned = new THREE.Mesh(ownedGeo, ownedMat);
    group.add(owned);

    return { group, sharedGeo, sharedMat, ownedGeo, ownedMat };
}

/** Attach a highlight subtree the way applyHighlight() leaves the manager. */
function seedHighlight(mgr: SelectionManager, scene: THREE.Scene, group: THREE.Group) {
    scene.add(group);
    (mgr as unknown as { highlightMesh: THREE.Object3D | null }).highlightMesh = group;
}

describe('SelectionManager §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002)', () => {
    let scene: THREE.Scene;
    let mgr: SelectionManager;

    beforeEach(() => {
        drainGpuReleaseQueue(); // isolate the shared frame-boundary queue
        scene = new THREE.Scene();
        mgr = makeManager(scene);
    });

    it('unselectAll() DETACHES the highlight immediately but frees NOTHING synchronously', () => {
        const { group, sharedMat, ownedGeo, ownedMat } = makeHighlightGroup();
        seedHighlight(mgr, scene, group);

        const spies = [
            vi.spyOn(ownedGeo, 'dispose'),
            vi.spyOn(ownedMat, 'dispose'),
            vi.spyOn(sharedMat, 'dispose'),
        ];

        mgr.unselectAll();

        // Detached from the scene graph NOW — it draws no more this frame.
        expect(scene.children).not.toContain(group);
        // TOOTH: the old path disposed here, inside the click handler, while the
        // previous frame's command buffer may still reference these resources.
        for (const s of spies) expect(s).not.toHaveBeenCalled();
        // …and the release is queued for the frame owner instead.
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('the frame-boundary drain then releases the highlight-owned resources exactly once', () => {
        const { group, ownedGeo, ownedMat } = makeHighlightGroup();
        seedHighlight(mgr, scene, group);
        const geoSpy = vi.spyOn(ownedGeo, 'dispose');
        const matSpy = vi.spyOn(ownedMat, 'dispose');

        mgr.unselectAll();
        drainGpuReleaseQueue(); // what RenderPipelineManager.render() does at the top of a frame

        expect(geoSpy).toHaveBeenCalledTimes(1); // released — no leak
        expect(matSpy).toHaveBeenCalledTimes(1); // exactly once — no double-free
    });

    it('geometry SHARED with a live element is never released, at the boundary or before', () => {
        // The pre-existing §SELECT-HIGHLIGHT-GEOMETRY rule, preserved. Disposing a
        // `sharedGeometry` clone would destroy the REAL element's buffers — a far
        // worse defect than the one being fixed, and the one thing a naive
        // "schedule the whole subtree" conversion would have broken.
        const { group, sharedGeo } = makeHighlightGroup();
        seedHighlight(mgr, scene, group);
        const sharedSpy = vi.spyOn(sharedGeo, 'dispose');

        mgr.unselectAll();
        expect(sharedSpy).not.toHaveBeenCalled();
        drainGpuReleaseQueue();
        expect(sharedSpy).not.toHaveBeenCalled();
    });

    it('a shared overlay material is released exactly once even when several clones carry it', () => {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
        for (let i = 0; i < 3; i++) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
            m.userData.sharedGeometry = true; // only the MATERIAL is ours here
            group.add(m);
        }
        seedHighlight(mgr, scene, group);
        const matSpy = vi.spyOn(mat, 'dispose');

        mgr.unselectAll();
        drainGpuReleaseQueue();

        expect(matSpy).toHaveBeenCalledTimes(1); // deduped, as before
    });

    it('marquee highlights are released at the boundary too, not in the handler', () => {
        const geo = new THREE.BufferGeometry();
        const mat = new THREE.LineBasicMaterial({ color: 0xff8800 });
        const wire = new THREE.LineSegments(geo, mat);
        wire.userData.isMarqueeHL = true;
        scene.add(wire);
        (mgr as unknown as { _marqueeHighlightMeshes: THREE.Object3D[] })
            ._marqueeHighlightMeshes = [wire];

        const geoSpy = vi.spyOn(geo, 'dispose');
        const matSpy = vi.spyOn(mat, 'dispose');

        mgr.unselectAll();
        expect(scene.children).not.toContain(wire);
        expect(geoSpy).not.toHaveBeenCalled();
        expect(matSpy).not.toHaveBeenCalled();

        drainGpuReleaseQueue();
        expect(geoSpy).toHaveBeenCalledTimes(1);
        expect(matSpy).toHaveBeenCalledTimes(1);
    });

    it('unselectAll() on an empty selection queues nothing and throws nothing', () => {
        expect(() => mgr.unselectAll()).not.toThrow();
        expect(pendingGpuReleaseCount()).toBe(0);
    });
});
