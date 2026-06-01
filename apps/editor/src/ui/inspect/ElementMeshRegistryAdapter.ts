// C27 INS-α-8 — ElementMeshRegistry adapter (apps/editor / L7 transitional).
//
// Concrete `ElementMeshRegistry` (duck-typed interface from
// `@pryzm/renderer-three/IsolationAnimator`) that bridges from a THREE
// scene to the mesh sets the animator writes opacity onto.  The animator
// itself stays L4-pure (no THREE import); this adapter ALSO stays
// THREE-import-free by duck-typing the scene argument — it only requires
// a `traverse(fn)` callable OR a `children[]` array on each scene/object
// node, plus a writable `material.opacity` / `material.transparent` /
// `visible` on each mesh.
//
// Wiring contract:
//   - Each mesh that participates in an element identity must carry
//     `userData.elementId` (the convention already used across the
//     monorepo, e.g. `geometry-curtain-wall/CurtainPanelBuilder.ts`,
//     `core-app-model/presentation/VisibilityRuleEngine.ts`).
//   - Adapter is read-only on the scene graph.  It NEVER mutates
//     userData / parents / children.  The only writes happen inside the
//     animator itself (per C27 §1.4 single-owner rule).
//
// L7 file, narrow scope — α-9 will promote this into a proper L4
// package once the registry surface stabilises (see IsolationAnimator.ts
// §α-8 plan).  Until then it lives here so the dev modal can demonstrate
// the end-to-end pipeline without a composeRuntime change.
//
// References:
//   - C27-BIM3-INSPECT-MODEL.md §1.3 (isolation engine boundary), §5.4
//   - packages/renderer-three/src/IsolationAnimator.ts (ElementMeshRegistry
//     interface this file implements).

import type { ElementMeshRegistry, MeshLike } from '@pryzm/renderer-three';

/**
 * Minimal scene-like shape consumed by the adapter.  Duck-typed: any
 * object with EITHER a `traverse(fn)` method (the THREE.Scene shape) OR a
 * `children[]` array is acceptable.  When neither is present the adapter
 * silently treats the scene as empty — the animator then has no meshes
 * to write into and the fade pipeline becomes a no-op.
 */
export interface SceneLike {
    traverse?: (fn: (obj: unknown) => void) => void;
    children?: ReadonlyArray<unknown>;
}

/** Options for `ElementMeshRegistryAdapter`. */
export interface ElementMeshRegistryAdapterOptions {
    /**
     * `userData` key holding the element id on each participating mesh.
     * Defaults to `'elementId'` — the monorepo convention.  Override for
     * tests or alternative naming schemes.
     */
    readonly elementIdKey?: string;
}

/** Duck-typed mesh node — must look like THREE.Mesh enough for the animator. */
interface MeshNode extends MeshLike {
    readonly userData?: Record<string, unknown>;
    readonly isMesh?: boolean;
    readonly type?: string;
}

/**
 * Concrete `ElementMeshRegistry` over a THREE scene (or any duck-typed
 * scene-like graph).  Traverses on every `getMeshesForElement` /
 * `listElementIds` call — cheap for the dev modal use case and keeps the
 * adapter stateless (no cache invalidation surface to maintain).  A
 * future α-9 promotion may bolt on an indexed cache fed by the scene
 * committer; the public surface stays stable.
 *
 * L7 living code; THREE-import-free (duck-typed only — preserves the L4
 * P2 boundary even though this file is above L4).
 */
export class ElementMeshRegistryAdapter implements ElementMeshRegistry {
    private readonly _scene: SceneLike;
    private readonly _elementIdKey: string;

    constructor(scene: SceneLike, opts: ElementMeshRegistryAdapterOptions = {}) {
        this._scene = scene;
        this._elementIdKey = opts.elementIdKey ?? 'elementId';
    }

    /**
     * Walk the scene and collect every mesh whose
     * `userData[elementIdKey]` matches `elementId`.  Returns a frozen
     * snapshot so the animator cannot accidentally mutate the array
     * (defensive — the animator does not today, but freezing is cheap
     * and makes the contract explicit).
     */
    getMeshesForElement(elementId: string): ReadonlyArray<MeshLike> {
        const out: MeshLike[] = [];
        this._walk((obj) => {
            if (!isMeshLike(obj)) return;
            const node = obj as MeshNode;
            const ud = node.userData;
            if (!ud) return;
            const id = ud[this._elementIdKey];
            if (typeof id === 'string' && id === elementId) {
                out.push(node);
            }
        });
        return Object.freeze(out);
    }

    /**
     * Walk the scene once and collect every distinct
     * `userData[elementIdKey]` value present on a mesh-like node.  Meshes
     * without an element id are skipped.  Result order matches scene
     * traversal order (stable across consecutive calls for the same
     * scene).
     */
    listElementIds(): ReadonlyArray<string> {
        const seen = new Set<string>();
        this._walk((obj) => {
            if (!isMeshLike(obj)) return;
            const node = obj as MeshNode;
            const ud = node.userData;
            if (!ud) return;
            const id = ud[this._elementIdKey];
            if (typeof id === 'string' && id.length > 0) seen.add(id);
        });
        return Object.freeze([...seen]);
    }

    // ── Internal traversal ───────────────────────────────────────────────────

    /**
     * Walk the scene, preferring the THREE.Scene-style `traverse(fn)` API
     * when present, otherwise recursing over `children[]`.  Every error
     * inside the visitor is swallowed (the visitor itself is internal —
     * any throw indicates a bug we want to surface in development; we
     * still don't want to abort the whole traversal on one bad node).
     */
    private _walk(visit: (obj: unknown) => void): void {
        const scene = this._scene as SceneLike | null | undefined;
        if (scene === null || scene === undefined) return;
        if (typeof scene.traverse === 'function') {
            try {
                scene.traverse((obj) => {
                    try { visit(obj); }
                    catch { /* defensive — one bad node should not abort */ }
                });
                return;
            } catch {
                // Fall through to the children-array path on traverse error.
            }
        }
        if (Array.isArray(scene.children)) {
            this._walkChildren(scene.children, visit);
        }
    }

    /** Recursive `children[]` walker for non-traversable scene-likes. */
    private _walkChildren(
        children: ReadonlyArray<unknown>,
        visit: (obj: unknown) => void,
    ): void {
        for (const child of children) {
            try { visit(child); }
            catch { /* defensive — see _walk */ }
            if (child !== null && typeof child === 'object') {
                const grand = (child as { children?: unknown }).children;
                if (Array.isArray(grand)) this._walkChildren(grand, visit);
            }
        }
    }
}

/**
 * Duck-typed mesh check: a node is mesh-like when it carries the THREE
 * `isMesh: true` flag OR exposes the `material.opacity` shape the
 * animator writes to.  Either signal is enough — α-9 may tighten this
 * once a renderer-three-side type guard becomes available.
 */
function isMeshLike(obj: unknown): boolean {
    if (obj === null || typeof obj !== 'object') return false;
    const rec = obj as Record<string, unknown>;
    if (rec['isMesh'] === true) return true;
    const mat = rec['material'];
    if (mat !== null && typeof mat === 'object'
        && typeof (mat as Record<string, unknown>)['opacity'] === 'number') {
        return true;
    }
    return false;
}
