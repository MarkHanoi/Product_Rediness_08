/**
 * L-948 — §RETIRE-RENDERER-DETACHES-LISTENERS
 *
 * "many elements batch created — none visible." Plan view drew all 1,611 walls /
 * 457 doors / 173 windows correctly; the 3D viewport showed only the slab shell.
 * Console, in order:
 *
 *   [initScene] §RENDERER-LIVE-SWAP live swap complete — backend now: webgl-fallback
 *   THREE.TSL: TypeError: Cannot read properties of undefined (reading 'usedTimes')
 *       at NodeManager.delete → RenderObjects#onDispose → RenderObject.dispose
 *       → RenderObject.onMaterialDispose → Material.dispatchEvent → Material.dispose
 *       → disposeShadowMaterial → ShadowNode._reset → ShadowNode.dispose
 *       → AnalyticLightNode.setup
 *   [renderer-three/WebGPURendererAdapter] WebGPU device lost: reason="destroyed"
 *
 * ── THE MECHANISM (all four facts are real three r183 source) ────────────────
 *
 *  1. `RenderObject`'s constructor registers a `'dispose'` listener on BOTH the
 *     material and the geometry it draws
 *     (three/src/renderers/common/RenderObject.js:328-329). Only
 *     `RenderObject.dispose()` removes them again (RenderObject.js:906-907).
 *
 *  2. `RenderObjects.dispose()` — the ONLY teardown `Renderer.dispose()` performs
 *     for render objects (Renderer.js:2369 `this._objects.dispose()`) — is, in
 *     full, `this.chainMaps = {}` (RenderObjects.js:173-177). It never calls
 *     `renderObject.dispose()`. **The listeners survive the renderer.**
 *     Contrast `Geometries.dispose()` (Geometries.js:381-391), which explicitly
 *     walks `_geometryDisposeListeners` and removes every one — upstream three
 *     recognised exactly this hazard for geometries and closed it; the identical
 *     hazard for MATERIALS, which lives one level up in `RenderObjects`, is open.
 *
 *  3. `Renderer.dispose()` then clears the DataMaps those leaked listeners reach
 *     into (`_nodes`, `_pipelines`, `_bindings` — Renderer.js:2371-2373), and
 *     `DataMap.dispose()` is `this.data = new WeakMap()`. So a LATE listener
 *     lands in `NodeManager.delete()`:
 *
 *         const nodeBuilderState = this.get( object ).nodeBuilderState;  // → undefined
 *         nodeBuilderState.usedTimes --;                                 // → TypeError
 *
 *     (three/src/renderers/common/nodes/NodeManager.js:267-268 — the founder's
 *     error, verbatim.)
 *
 *  4. The resources that hold those leaked listeners across a backend swap are
 *     three's own MODULE-GLOBAL caches, which is why one dead renderer is enough
 *     to blank an entire model: `Lighting._weakMap` is keyed by SCENE, not by
 *     renderer (Lighting.js:4), and `shadowMaterialLib` is keyed by LIGHT
 *     (ShadowFilterNode.js:12). PRYZM's live swap deliberately keeps the same
 *     THREE.Scene (initScene.ts §RENDERER-LIVE-SWAP), so the LightsNode, its
 *     AnalyticLightNodes, their ShadowNodes and the shadow NodeMaterial all
 *     outlive the renderer that minted their render objects.
 *
 *  5. `EventDispatcher.dispatchEvent` has no try/catch (EventDispatcher.js:101-126):
 *     a throwing listener aborts the remaining listeners AND propagates to the
 *     caller. The caller here is `AnalyticLightNode.setup()`, which throws BEFORE
 *     its `this.shadowNode = null` (AnalyticLightNode.js:266-270) — so the stale
 *     shadow node is never cleared and the SAME branch throws again on the next
 *     material compile, forever. Every material needing a node build on the new
 *     backend fails to compile ⇒ nothing new is drawn. Plan view, which compiles
 *     no GPU shaders, is unaffected. That is the founder's report exactly.
 *
 * ── WHAT THIS SUITE ASSERTS ─────────────────────────────────────────────────
 * Suite A pins the DEFECT against real three r183 classes (no mocks for any
 * load-bearing step). Suite B asserts the fix: retiring a renderer must dispose
 * its render objects — detaching their material/geometry listeners — WHILE its
 * DataMaps are still intact, and only then dispose the renderer.
 *
 * NOTE ON THE FORBIDDEN FIX: nothing here swallows the `usedTimes` throw. The
 * throw is a SYMPTOM; suppressing it is what turned a crash into "nothing is
 * visible". These tests demand the listener be GONE, not the error be quiet.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import RenderObjects from 'three/src/renderers/common/RenderObjects.js';
import DataMap from 'three/src/renderers/common/DataMap.js';
import { WebGPURendererAdapter } from '../src/adapters/WebGPURendererAdapter.js';

import {
    trackRenderObjectsForRetirement,
    trackedRenderObjectCount,
    disposeTrackedRenderObjects,
    retireRenderer,
} from '../src/rendererRetirement.js';

/* ─── Rig ────────────────────────────────────────────────────────────────────
 *
 * A stand-in for the two fields of a three `Renderer` that matter to renderer
 * retirement: `_objects` (the REAL `RenderObjects`) and `dispose()` (which
 * performs the REAL `RenderObjects.dispose()` + the REAL `DataMap.dispose()` on
 * the node manager, in the order Renderer.js:2369-2372 performs them).
 *
 * `nodes` is a real `DataMap` carrying `NodeManager.delete`'s two load-bearing
 * lines verbatim, so the founder's TypeError is produced by the real data
 * structure in the real post-dispose state rather than asserted from a mock.
 */
class NodeManagerLike extends (DataMap as unknown as new () => {
    get(o: object): Record<string, unknown>;
    delete(o: object): unknown;
    dispose(): void;
}) {
    /** RenderObject's constructor asks for this (RenderObject.js:868). Not a decision point. */
    getCacheKey(): number { return 1; }

    // three/src/renderers/common/nodes/NodeManager.js:265-281, verbatim shape.
    override delete(object: object): unknown {
        if ((object as { isRenderObject?: boolean }).isRenderObject) {
            const nodeBuilderState = this.get(object).nodeBuilderState as { usedTimes: number };
            nodeBuilderState.usedTimes--;
        }
        return super.delete(object);
    }
}

interface Rig {
    renderer: { _objects: unknown; contextNode: { id: number; version: number }; dispose(): void; disposed: boolean };
    renderObjects: any;
    nodes: NodeManagerLike;
    order: string[];
    mint(): { ro: any; material: THREE.Material; geometry: THREE.BufferGeometry };
}

function makeRig(): Rig {
    const order: string[] = [];
    const nodes = new NodeManagerLike();
    const geometries = {} as any;
    const pipelines = { delete: () => { /* real Pipelines.delete is guarded; not the throw site */ } } as any;
    const bindings = { deleteForRender: () => { /* ditto */ } } as any;
    const info = { render: {}, memory: {} } as any;

    const renderer: Rig['renderer'] = {
        _objects: null,
        // RenderObject.getDynamicCacheKey reads this (RenderObject.js:884).
        contextNode: { id: 0, version: 0 },
        disposed: false,
        dispose() {
            // Renderer.js:2369-2372 — the real ordering.
            order.push('renderer.dispose');
            (renderer._objects as any).dispose(); // real RenderObjects.dispose()
            nodes.dispose();                      // real DataMap.dispose()
            renderer.disposed = true;
        },
    };

    const renderObjects = new (RenderObjects as any)(
        renderer, nodes, geometries, pipelines, bindings, info,
    );
    renderer._objects = renderObjects;

    let n = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const mint = () => {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.MeshStandardMaterial({ name: `mat-${n++}` });
        const mesh = new THREE.Mesh(geometry, material);
        const lightsNode = {};      // ChainMap keys must be objects
        const renderContext = {};
        const clippingContext = {};
        const ro = renderObjects.get(
            mesh, material, scene, camera, lightsNode, renderContext, clippingContext,
        );
        // What `NodeManager.getForRender` would have recorded on first draw.
        nodes.get(ro).nodeBuilderState = { usedTimes: 1 };
        return { ro, material, geometry };
    };

    return { renderer, renderObjects, nodes, order, mint };
}

/** How many `'dispose'` listeners `target` currently carries. */
function disposeListenerCount(target: object): number {
    const listeners = (target as { _listeners?: Record<string, unknown[]> })._listeners;
    return listeners?.dispose?.length ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite A — the defect, pinned against real three r183.
// ─────────────────────────────────────────────────────────────────────────────

describe('L-948 · three r183 leaves a retired renderer listening on live materials', () => {
    it('RenderObject registers a dispose listener on its material AND geometry', () => {
        const rig = makeRig();
        const { material, geometry } = rig.mint();

        expect(disposeListenerCount(material)).toBe(1);
        expect(disposeListenerCount(geometry)).toBe(1);
    });

    it('RenderObjects.dispose() does NOT remove them — the listener outlives the renderer', () => {
        const rig = makeRig();
        const { ro, material, geometry } = rig.mint();

        rig.renderer.dispose(); // real RenderObjects.dispose() + real DataMap.dispose()

        expect(rig.renderer.disposed).toBe(true);
        // THE LEAK. This is not a wish — it is what three r183 does today.
        expect(material.hasEventListener('dispose', ro.onMaterialDispose)).toBe(true);
        expect(geometry.hasEventListener('dispose', ro.onGeometryDispose)).toBe(true);
    });

    it("a later material.dispose() re-enters the dead renderer and throws the founder's TypeError", () => {
        const rig = makeRig();
        const { material } = rig.mint();
        rig.renderer.dispose();

        // The LIVE renderer's own listener, registered after the dead one.
        let liveListenerRan = false;
        material.addEventListener('dispose', () => { liveListenerRan = true; });

        // three's shadow NodeMaterial is module-global (ShadowFilterNode.js:12), so
        // this is precisely what `disposeShadowMaterial(light)` does after a swap.
        expect(() => material.dispose()).toThrowError(/usedTimes/);

        // And EventDispatcher.dispatchEvent has no try/catch: the LIVE renderer's
        // listener never ran, so the live renderer is left holding a render object
        // for a material it was never told was disposed.
        expect(liveListenerRan).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B — the fix: retire the renderer's render objects BEFORE its DataMaps go.
// ─────────────────────────────────────────────────────────────────────────────

describe('L-948 · §RETIRE-RENDERER-DETACHES-LISTENERS', () => {
    it('tracking reports the render objects a renderer has minted', () => {
        const rig = makeRig();
        expect(trackRenderObjectsForRetirement(rig.renderer)).toBe(true);

        expect(trackedRenderObjectCount(rig.renderer)).toBe(0);
        rig.mint();
        rig.mint();
        expect(trackedRenderObjectCount(rig.renderer)).toBe(2);
    });

    it('retireRenderer detaches every material/geometry dispose listener', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        const a = rig.mint();
        const b = rig.mint();

        expect(retireRenderer(rig.renderer)).toBe(2);

        expect(a.material.hasEventListener('dispose', a.ro.onMaterialDispose)).toBe(false);
        expect(a.geometry.hasEventListener('dispose', a.ro.onGeometryDispose)).toBe(false);
        expect(b.material.hasEventListener('dispose', b.ro.onMaterialDispose)).toBe(false);
        expect(disposeListenerCount(a.material)).toBe(0);
        expect(rig.renderer.disposed).toBe(true);
    });

    it("after retirement a later material.dispose() is clean and the LIVE renderer still hears it", () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        const { material } = rig.mint();

        retireRenderer(rig.renderer);

        let liveListenerRan = false;
        material.addEventListener('dispose', () => { liveListenerRan = true; });

        // No throw — so AnalyticLightNode.setup() completes, `shadowNode = null`
        // lands, and the next material compiles instead of re-throwing forever.
        expect(() => material.dispose()).not.toThrow();
        expect(liveListenerRan).toBe(true);
    });

    it('disposes render objects BEFORE renderer.dispose() clears the DataMaps (INVARIANT L2 ordering)', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        const { ro } = rig.mint();

        const seen: string[] = [];
        const realDispose = ro.dispose.bind(ro);
        ro.dispose = () => { seen.push('renderObject.dispose'); realDispose(); };

        retireRenderer(rig.renderer);

        expect(seen).toEqual(['renderObject.dispose']);
        expect(rig.order).toEqual(['renderer.dispose']);
        // The render object was torn down while `nodes` still held its state — so
        // its own teardown found `nodeBuilderState` and never reached the throw.
        expect(rig.renderer.disposed).toBe(true);
    });

    it('a render object disposed during normal churn leaves the tracking set', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        const { ro } = rig.mint();
        rig.mint();
        expect(trackedRenderObjectCount(rig.renderer)).toBe(2);

        ro.dispose(); // what RenderObjects.get() does on a material-version change
        expect(trackedRenderObjectCount(rig.renderer)).toBe(1);
    });

    it('is idempotent — installing twice does not double-wrap or double-count', () => {
        const rig = makeRig();
        expect(trackRenderObjectsForRetirement(rig.renderer)).toBe(true);
        expect(trackRenderObjectsForRetirement(rig.renderer)).toBe(true);
        rig.mint();
        expect(trackedRenderObjectCount(rig.renderer)).toBe(1);
        expect(retireRenderer(rig.renderer)).toBe(1);
        expect(disposeTrackedRenderObjects(rig.renderer)).toBe(0);
    });

    it('degrades safely on a renderer with no RenderObjects (classic THREE.WebGLRenderer)', () => {
        let disposed = false;
        const classic = { dispose: () => { disposed = true; } };

        // A classic WebGLRenderer has no `_objects`; there is nothing to track…
        expect(trackRenderObjectsForRetirement(classic)).toBe(false);
        expect(trackedRenderObjectCount(classic)).toBe(0);
        // …but retirement must still dispose it. (Its own onMaterialDispose is
        // guarded upstream — WebGLRenderer.js:1136-1140 checks `programs !== undefined`
        // — so the classic path never produced this throw.)
        expect(retireRenderer(classic)).toBe(0);
        expect(disposed).toBe(true);
    });

    it('null / undefined / a renderer without dispose() are all no-ops, never throws', () => {
        expect(() => retireRenderer(null)).not.toThrow();
        expect(() => retireRenderer(undefined)).not.toThrow();
        expect(retireRenderer({})).toBe(0);
        expect(trackRenderObjectsForRetirement(null)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite C — REACHABILITY. A helper nobody calls fixes nothing (§COMMITTED ≠ REACHABLE).
// ─────────────────────────────────────────────────────────────────────────────

describe('L-948 · the retirement seam is actually reached', () => {
    it("WebGPURendererAdapter.dispose() retires — the REAL method body, not a grep", () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        const { ro, material } = rig.mint();

        // The constructor is private and needs a real GPU canvas, so build the
        // instance directly and run the REAL `dispose()` body against it.
        const adapter = Object.create(WebGPURendererAdapter.prototype) as {
            _removeContextHandlers: (() => void) | null;
            _lostCallbacks: Set<() => void>;
            _restoredCallbacks: Set<() => void>;
            threeRenderer: unknown;
            dispose(): void;
        };
        adapter._removeContextHandlers = null;
        adapter._lostCallbacks = new Set();
        adapter._restoredCallbacks = new Set();
        adapter.threeRenderer = rig.renderer;

        adapter.dispose();

        expect(rig.renderer.disposed).toBe(true);
        // If dispose() still called `threeRenderer.dispose()` directly, this listener
        // would still be attached and the next material.dispose() would throw.
        expect(material.hasEventListener('dispose', ro.onMaterialDispose)).toBe(false);
        expect(() => material.dispose()).not.toThrow();
    });

    /**
     * The other two retirement sites — the ADR-0077 live backend swap
     * (`initScene.swapRendererBackend`) and the ADR-0089 device-loss rebuild
     * (`createRenderer`'s `gpuDevice.lost` handler) — are closures inside app-level
     * boot code that cannot be constructed headlessly. This is a STATIC wiring guard,
     * and it is honest about being one: it proves the call site NAMES the seam and
     * carries no bare `renderer.dispose()` alongside it. It does NOT prove the branch
     * executes in a browser. Treat a failure here as a regression, never a green here
     * as a behavioural proof.
     */
    it('the live-swap and device-loss retirement sites route through retireRenderer (static wiring guard)', () => {
        const here = fileURLToPath(new URL('.', import.meta.url));
        const read = (rel: string) => readFileSync(here + rel, 'utf8');

        const initScene = read('../../../apps/editor/src/engine/initScene.ts');
        const createRenderer = read('../../../apps/editor/src/rendering/createRenderer.ts');

        // ADR-0077 live backend swap.
        // §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) widened this import to bring in the
        // classification helpers alongside the seam, so assert the SYMBOL is imported
        // from the package rather than pinning one exact import-list spelling.
        const retireImport = initScene
            .split(String.fromCharCode(10))
            .find((l) => l.startsWith('import ') && l.includes('@pryzm/renderer-three') && l.includes('retireRenderer'));
        expect(retireImport, 'initScene must import retireRenderer from @pryzm/renderer-three').toBeTruthy();
        expect(initScene).toContain('retireRenderer(oldRenderer)');
        expect(initScene).not.toContain('(oldRenderer as any).dispose?.()');

        // ADR-0089 device-loss rebuild.
        expect(createRenderer).toContain('retireRenderer');
        expect(createRenderer).toContain('retireRenderer(threeRenderer)');
        expect(createRenderer).not.toContain('(threeRenderer as any).dispose?.()');
    });
});
