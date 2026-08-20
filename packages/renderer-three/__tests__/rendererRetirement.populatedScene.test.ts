/**
 * L-1410 / L-1411 — §RETIRE-RENDERER-DETACHES-LISTENERS on a POPULATED SCENE, and
 * §RETIRE-ZERO-IS-NOT-ONE-FACT.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The founder opened a project (294 elements, 3,191 meshes, 7 levels) and the 3D
 * viewport was empty. His console showed the §AUTO-WEBGL-HEAVY guard live-swapping
 * the renderer immediately after load, and:
 *
 *   [initScene] §RETIRE-RENDERER-DETACHES-LISTENERS old renderer retired —
 *       3181 render object(s) DETACHED from their materials/geometries (L-948).
 *
 * The leading theory was that those 3,181 ARE the building, that the detach is a
 * ONE-WAY teardown, and that nothing re-attaches them. It is a reasonable reading of
 * the word "detached" — and it is WRONG. This suite is the measurement that says so,
 * driven through the REAL three r183 `RenderObjects` and the REAL `retireRenderer()`
 * against a REAL populated `THREE.Scene`, asserting at the layer the user experiences:
 * **how many scene meshes still hold a live material AND a non-empty geometry.**
 *
 * `RenderObject.dispose()` is, in full (RenderObject.js:904-911):
 *
 *     this.material.removeEventListener( 'dispose', this.onMaterialDispose );
 *     this.geometry.removeEventListener( 'dispose', this.onGeometryDispose );
 *     this.onDispose();          // -> pipelines/bindings/nodes delete + chainMap delete
 *
 * Every one of those operates on the RETIRED RENDERER's own per-object draw state and
 * on the LISTENERS it registered. Not one of them unbinds `mesh.material` or
 * `mesh.geometry`. There is therefore no "re-attach" to look for and none missing: the
 * incoming renderer mints its own draw state on its first frame — and when the incoming
 * renderer is a classic `THREE.WebGLRenderer` (the §L-372B heavy-scene target, which is
 * exactly what the founder swapped to) it mints no `RenderObject` at all; it compiles
 * `WebGLProgram`s from the same materials.
 *
 * ── The second subject: what a `0` from this counter means ──────────────────
 * The same log line has printed 0, 3181, 6936 and 6937 across one day of founder
 * sessions. A prior lane flagged the `0` and could not investigate it, because the line
 * printed ONE word for THREE different states. This project has been wrong about a bare
 * zero repeatedly (a version count, an audit detector, an in-flight guard, a rescue that
 * rescued nothing), so the counter now carries its denominator and its kind.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import RenderObjects from 'three/src/renderers/common/RenderObjects.js';
import DataMap from 'three/src/renderers/common/DataMap.js';

import {
    trackRenderObjectsForRetirement,
    trackedRenderObjectCount,
    mintedRenderObjectCount,
    classifyRetirement,
    describeRetirement,
    retireRenderer,
} from '../src/rendererRetirement.js';

/** `NodeManager.delete`'s two load-bearing lines, verbatim, over a real `DataMap`. */
class NodeManagerLike extends (DataMap as unknown as new () => {
    get(o: object): Record<string, unknown>;
    delete(o: object): unknown;
    dispose(): void;
}) {
    getCacheKey(): number { return 1; }
    override delete(object: object): unknown {
        if ((object as { isRenderObject?: boolean }).isRenderObject) {
            const state = this.get(object).nodeBuilderState as { usedTimes: number };
            state.usedTimes--;
        }
        return super.delete(object);
    }
}

interface Rig {
    renderer: { _objects: unknown; contextNode: { id: number; version: number }; dispose(): void; disposed: boolean };
    scene: THREE.Scene;
    /** Adds `n` real meshes to the scene AND mints a real RenderObject for each. */
    populate(n: number): void;
}

function makeRig(): Rig {
    const nodes = new NodeManagerLike();
    const renderer: Rig['renderer'] = {
        _objects: null,
        contextNode: { id: 0, version: 0 },
        disposed: false,
        dispose() {
            // Renderer.js:2369-2372 — the real ordering.
            (renderer._objects as { dispose(): void }).dispose();
            nodes.dispose();
            renderer.disposed = true;
        },
    };
    const renderObjects = new (RenderObjects as unknown as new (...a: unknown[]) => {
        get(...a: unknown[]): { isRenderObject: boolean };
        dispose(): void;
    })(
        renderer, nodes, {},
        { delete: () => { /* real Pipelines.delete is guarded */ } },
        { deleteForRender: () => { /* ditto */ } },
        { render: {}, memory: {} },
    );
    renderer._objects = renderObjects;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    let n = 0;

    const addMesh = (): THREE.Mesh => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
        );
        const material = new THREE.MeshStandardMaterial({ name: `mat-${n++}` });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        return mesh;
    };

    return {
        renderer,
        scene,
        populate(count: number) {
            for (let i = 0; i < count; i++) {
                const mesh = addMesh();
                const ro = renderObjects.get(mesh, mesh.material, scene, camera, {}, {}, {});
                // What `NodeManager.getForRender` records on the first draw.
                nodes.get(ro).nodeBuilderState = { usedTimes: 1 };
            }
        },
    };
}

/**
 * THE USER-FACING QUANTITY: scene meshes that still hold a live material AND a
 * non-empty position attribute. DERIVED by traversal — never a hand-listed set of
 * element types, which is this week's most-repeated defect here.
 */
function meshesWithLiveBindings(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
        const mat = mesh.material as THREE.Material | THREE.Material[] | null | undefined;
        const hasMaterial = Array.isArray(mat) ? mat.length > 0 && mat.every(Boolean) : !!mat;
        const pos = mesh.geometry?.getAttribute?.('position') as { count?: number } | undefined;
        if (hasMaterial && pos && (pos.count ?? 0) > 0) n++;
    });
    return n;
}

/** Total `'dispose'` listeners across every scene material + geometry. */
function sceneDisposeListeners(scene: THREE.Scene): number {
    let n = 0;
    const count = (t: unknown): number =>
        (t as { _listeners?: Record<string, unknown[]> } | null)?._listeners?.dispose?.length ?? 0;
    scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
        n += count(mesh.material);
        n += count(mesh.geometry);
    });
    return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite A — the founder's scale, and the theory it refutes.
// ─────────────────────────────────────────────────────────────────────────────

describe('L-1411 - the retire does NOT unbind the building (the founder 3,181)', () => {
    it('every scene mesh keeps a live material + geometry across a REAL retireRenderer', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        rig.populate(3181); // the founder's exact detach count

        const before = meshesWithLiveBindings(rig.scene);
        expect(before).toBe(3181);
        expect(trackedRenderObjectCount(rig.renderer)).toBe(3181);
        // Two listeners per render object (material + geometry), RenderObject.js:328-329.
        expect(sceneDisposeListeners(rig.scene)).toBe(6362);

        const detached = retireRenderer(rig.renderer);
        expect(detached).toBe(3181);
        expect(rig.renderer.disposed).toBe(true);

        // THE MEASUREMENT. "Detached" removed the RETIRED RENDERER's subscriptions —
        // it did not take one mesh's material or geometry away.
        expect(meshesWithLiveBindings(rig.scene)).toBe(3181);
        expect(rig.scene.children).toHaveLength(3181);
        // …and the only thing that went away is the dead renderer's listeners.
        expect(sceneDisposeListeners(rig.scene)).toBe(0);
    });

    it('the L-948 symptom is gone: a later material.dispose() no longer throws', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        rig.populate(64);
        retireRenderer(rig.renderer);

        const first = rig.scene.children[0] as THREE.Mesh;
        expect(() => (first.material as THREE.Material).dispose()).not.toThrow();
    });

    it('the incoming CLASSIC renderer needs no re-attach — it mints no render objects', () => {
        // The §L-372B heavy-scene swap target is a classic THREE.WebGLRenderer. It has
        // no `_objects`, so there is nothing for this seam to track and nothing for a
        // hypothetical "re-attach" to restore: it compiles WebGLPrograms from the same
        // materials the scene still holds (asserted above).
        const classic = { dispose: () => { /* real WebGLRenderer.dispose */ } };
        expect(trackRenderObjectsForRetirement(classic)).toBe(false);
        expect(classifyRetirement(classic)).toBe('mints-none');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B — §RETIRE-ZERO-IS-NOT-ONE-FACT. Three states, three readings.
// ─────────────────────────────────────────────────────────────────────────────

describe('L-1410 - a 0 from the retirement counter must say WHICH zero', () => {
    it('mints-none — a classic renderer: 0 is complete, nothing was ever attached', () => {
        const classic = { dispose: () => { /* no-op */ } };
        const kind = classifyRetirement(classic);
        const minted = mintedRenderObjectCount(classic);
        expect(kind).toBe('mints-none');
        expect(retireRenderer(classic)).toBe(0);
        expect(describeRetirement(classic, 0, minted, kind)).toMatch(/MINTS NO render objects/);
        expect(describeRetirement(classic, 0, minted, kind)).toMatch(/nothing was ever attached/);
    });

    it('untracked — owns RenderObjects but was never instrumented: the sweep looked in the wrong place', () => {
        const rig = makeRig();
        // Deliberately NOT instrumented, but it really does mint render objects…
        rig.populate(120);
        expect(classifyRetirement(rig.renderer)).toBe('untracked');

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        const kind = classifyRetirement(rig.renderer);
        const detached = retireRenderer(rig.renderer);
        warn.mockRestore();

        expect(detached).toBe(0);
        // …so the 240 listeners it registered are STILL attached. That is the L-948 leak,
        // and it is the one `0` that must never read like the classic-renderer `0`.
        expect(sceneDisposeListeners(rig.scene)).toBe(240);
        expect(describeRetirement(rig.renderer, detached, 0, kind)).toMatch(/UNTRACKED/);
        expect(describeRetirement(rig.renderer, detached, 0, kind)).toMatch(/wrong\s*place/);
    });

    it('tracked + never minted — 0 is complete and must NOT read as a leak', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        const kind = classifyRetirement(rig.renderer);
        expect(kind).toBe('tracked');
        expect(mintedRenderObjectCount(rig.renderer)).toBe(0);
        expect(retireRenderer(rig.renderer)).toBe(0);
        expect(describeRetirement(rig.renderer, 0, 0, kind)).toMatch(/never minted/);
    });

    it('the mint counter is MONOTONIC — the denominator survives the sweep that empties the set', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        rig.populate(10);
        expect(mintedRenderObjectCount(rig.renderer)).toBe(10);
        expect(trackedRenderObjectCount(rig.renderer)).toBe(10);

        const detached = retireRenderer(rig.renderer);
        expect(detached).toBe(10);
        expect(trackedRenderObjectCount(rig.renderer)).toBe(0);
        expect(mintedRenderObjectCount(rig.renderer)).toBe(10);
        expect(describeRetirement(rig.renderer, detached, 10, 'tracked'))
            .toBe('10 detached of 10 minted (tracked)');
    });

    it('THE PREVIOUSLY SILENT ZERO: tracked, minted > 0, but 0 detachable — now loud', () => {
        const rig = makeRig();
        trackRenderObjectsForRetirement(rig.renderer);
        rig.populate(7);
        // Drain the tracking set the way a completed retirement does…
        expect(retireRenderer(rig.renderer)).toBe(7);

        // …then retire again. Tracked, minted 7, detachable 0. Before L-1410 this
        // produced a bare "0 render object(s) detached" — indistinguishable from a
        // correct classic-renderer retirement — and warned about nothing.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* capture */ });
        expect(retireRenderer(rig.renderer)).toBe(0);
        const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
        warn.mockRestore();

        expect(mintedRenderObjectCount(rig.renderer)).toBe(7);
        expect(messages).toContain('§RETIRE-ZERO-IS-NOT-ONE-FACT');
        expect(messages).toMatch(/minted 7 render object\(s\) but had 0 detachable/);
    });
});
