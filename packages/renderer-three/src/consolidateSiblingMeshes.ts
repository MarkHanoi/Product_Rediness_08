/**
 * @file packages/renderer-three/src/consolidateSiblingMeshes.ts
 *
 * §MESH110-CONSOLIDATE (L-11567 #1) — collapse an element's same-material
 * SIBLING meshes into one mesh per bucket. ONE implementation, owned by the
 * THREE owner (P2), so door / lighting / any future family share it instead of
 * each growing a private merge with its own quirks (the L-11564 lesson: two
 * copies of one fact agree until the day only one is edited).
 *
 * THE MEASUREMENT THAT FORCED IT (§PERF105): a door was 13-15 meshes typical
 * and ~30 worst (3 hinges + 4 handle parts, unmerged), a fixture 4-8, furniture
 * 8-20 — on a heavy-scene guard that swaps the renderer backend at 1000 scene
 * meshes. The founder crossed it with ONE door create. Every one of those
 * parts is a separate draw submission of IDENTICAL material state.
 *
 * THE BUCKET KEY is (direct parent, material uuid, castShadow, receiveShadow,
 * visible, renderOrder, caller key) and each term is load-bearing:
 *   · direct parent — a part inside a posed sub-group merges only with its
 *     siblings, so the sub-group's own transform (a tilting head, a swing
 *     pivot) survives untouched; nothing is ever re-parented;
 *   · material uuid — the merged mesh binds the SAME material object, so a
 *     pooled/cloned material's ownership contract is unchanged;
 *   · castShadow / receiveShadow — a builder's per-part shadow intent is
 *     preserved EXACTLY: a caster never merges with a non-caster;
 *   · visible / renderOrder — an invisible or re-ordered part never joins an
 *     ordinary one;
 *   · caller key — `keyOf(mesh)` lets a builder keep semantically distinct
 *     parts apart (a door's `role`, which its plan projector reads).
 *
 * Each member's LOCAL matrix is baked into a geometry clone, so the merged mesh
 * sits at the parent origin with identical world geometry — rotation included
 * (a re-seated post on a curved host bakes its `rotation.y`). Buckets of ONE
 * are left completely untouched: original geometry object, `.parameters`,
 * position — a single-part assertion downstream keeps its meaning. A failed
 * merge declines that bucket and drops nothing: behaviour over beauty.
 *
 * ⚠ GEOMETRY OWNERSHIP: the ORIGINAL geometries of a merged bucket are released
 * through `safeDisposeGeometry` (which honours the ADR-0281 L1 shared-resource
 * stamp, so a pooled geometry is never freed). A caller whose parts hold a
 * geometry it does not own must `skip` them. Materials are NEVER disposed here.
 *
 * ⚠ TRIANGLE-NEUTRAL by construction: `mergeGeometries` concatenates; the
 * triangle census is unchanged and only the submission count falls. That is
 * the whole point — fewer draws, not less detail.
 */

import * as THREE from './three-re-export';
import { mergeGeometries } from './addons/BufferGeometryUtils.js';
import { safeDisposeGeometry } from './safeDispose.js';

export interface ConsolidateSiblingMeshesOptions {
    /** Return `true` to leave a mesh untouched (never bucketed, never merged). */
    readonly skip?: (mesh: THREE.Mesh) => boolean;
    /**
     * Extra bucket term so semantically distinct parts stay apart even when
     * they share a material (e.g. a door's `userData.role`). Default: `''`.
     */
    readonly keyOf?: (mesh: THREE.Mesh) => string;
    /** `name` given to every merged mesh. Default `'merged'`. */
    readonly mergedName?: string;
}

export interface ConsolidateSiblingMeshesReport {
    /** Meshes under `root` before the pass (every mesh, skipped ones included). */
    readonly before: number;
    /** Meshes under `root` after the pass. */
    readonly after: number;
    /** Buckets merged (each replaced ≥2 meshes with 1). */
    readonly merged: number;
    /** Buckets of ≥2 that could not merge and were left as-is. */
    readonly declined: number;
}

/**
 * Collapse same-bucket sibling meshes under `root` into one mesh per bucket.
 * Idempotent: a second pass finds only singletons and changes nothing.
 */
export function consolidateSiblingMeshes(
    root: THREE.Object3D,
    options: ConsolidateSiblingMeshesOptions = {},
): ConsolidateSiblingMeshesReport {
    const skip = options.skip;
    const keyOf = options.keyOf;
    const mergedName = options.mergedName ?? 'merged';

    // Collect FIRST, by direct parent, mutating nothing during the traverse.
    const byParent = new Map<THREE.Object3D, THREE.Mesh[]>();
    let before = 0;
    root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        before++;
        const m = child as THREE.Mesh;
        if ((m as THREE.InstancedMesh).isInstancedMesh) return;   // aggregates are never merged
        if (Array.isArray(m.material)) return;                    // multi-material: decline
        if (skip?.(m)) return;
        const parent = m.parent;
        if (!parent) return;
        const list = byParent.get(parent);
        if (list) list.push(m);
        else byParent.set(parent, [m]);
    });

    let merged = 0;
    let declined = 0;
    let removed = 0;

    for (const [parent, meshes] of byParent) {
        // Insertion order (traversal order) keeps the merged geometry
        // deterministic build-to-build.
        const buckets = new Map<string, THREE.Mesh[]>();
        for (const m of meshes) {
            const mat = m.material as THREE.Material;
            const key =
                `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|` +
                `${m.visible ? 1 : 0}|${m.renderOrder}|${keyOf?.(m) ?? ''}`;
            const b = buckets.get(key);
            if (b) b.push(m);
            else buckets.set(key, [m]);
        }

        for (const bucket of buckets.values()) {
            if (bucket.length < 2) continue;                      // singles stay untouched

            const baked: THREE.BufferGeometry[] = [];
            for (const m of bucket) {
                m.updateMatrix();
                const g = m.geometry.clone();
                g.applyMatrix4(m.matrix);
                baked.push(g);
            }

            let mergedGeo: THREE.BufferGeometry | null;
            try {
                mergedGeo = mergeGeometries(baked, false);
            } catch {
                mergedGeo = null;
            }
            for (const g of baked) g.dispose();                   // mergeGeometries copied
            if (!mergedGeo) {
                declined++;
                continue;                                         // originals untouched
            }

            const proto = bucket[0]!;
            const mesh = new THREE.Mesh(mergedGeo, proto.material as THREE.Material);
            mesh.name          = mergedName;
            mesh.castShadow    = proto.castShadow;
            mesh.receiveShadow = proto.receiveShadow;
            mesh.visible       = proto.visible;
            mesh.renderOrder   = proto.renderOrder;
            mesh.layers.mask   = proto.layers.mask;
            mesh.frustumCulled = proto.frustumCulled;
            // A SHALLOW copy of the prototype's userData: the caller's key terms
            // (role …) are identical across the bucket by construction, and the
            // builder's later stamping pass sees one mesh where it saw many.
            mesh.userData = { ...proto.userData };

            for (const m of bucket) {
                parent.remove(m);
                safeDisposeGeometry(m.geometry);                  // honours the L1 shared stamp
                removed++;
            }
            parent.add(mesh);
            merged++;
        }
    }

    return { before, after: before - removed + merged, merged, declined };
}
