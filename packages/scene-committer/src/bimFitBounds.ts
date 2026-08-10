import * as THREE from '@pryzm/renderer-three/three';
import { SceneObjectClassifier } from './SceneObjectClassifier.js';
import { withSpanSync } from './otel.js';

/**
 * bimFitBounds — §PLAN-FIT-BIM-ONLY (L-814) — the ONE "fit the camera to the model"
 * bounds collection, shared by every camera-fit consumer.
 *
 * ## Why this exists
 *
 * `initViewSetup.zoomToAll()` (Camera → Fit All) and
 * `SplitViewManager._fitCamTargetToScene()` (plan-pane camera fit) each traversed the
 * scene with their OWN notion of "what is the model". Fit All filtered to BIM element
 * types; the plan fit filtered NOTHING — every mesh in the scene, including
 * georeferenced site/context content and three.js helper lines, was averaged into the
 * plan camera target. One mesh placed far from the site origin therefore dragged the
 * target megametres out, §PLAN-CAMTARGET-SANITY (L-481) refused it every frame, and
 * the console filled with hundreds of identical refusals (the L-814 production
 * symptom: plan view open with 3D Site context, target (114525, -1577006, 135718)).
 *
 * Two independent notions of "is this part of the model" is exactly the defect shape
 * L-749 already named — that fix routed both zoomToAll passes through
 * `SceneObjectClassifier`; this one extracts the WHOLE collection so the plan fit and
 * Fit All can never disagree again.
 *
 * ## The two passes
 *
 *   1. BIM-typed pass — only meshes whose `userData.elementType` / `userData.type` is
 *      an authored BIM element type ({@link BIM_FIT_ELEMENT_TYPES}). Context tiles,
 *      terrain, site underlays and gizmos carry no BIM element type, so they are
 *      structurally outside this population no matter where they sit in the graph.
 *   2. Fallback pass — when pass 1 finds nothing (e.g. a fresh project), any visible
 *      mesh that `SceneObjectClassifier.shouldExcludeFromBounds` does not reject.
 *      This can still admit a far-origin context mesh — callers keep their
 *      plausibility guards as defense-in-depth (L-481 / §PLAN-CAMTARGET-REFUSE-AT-
 *      PRODUCER), and the `farthestIncluded` diagnostics name the offender.
 *
 * Contract: C04 §5 (viewport & camera — framing reads the model, not the scene).
 * P8: `computeBimFitBounds` emits `pryzm.scene.compute_bim_fit_bounds`.
 */

/**
 * Authored BIM element types eligible for camera fitting. Moved verbatim from
 * `initViewSetup.zoomToAll()`'s local `BIM_TYPES_FIT` so the plan-pane fit and Fit All
 * share ONE allow-list (§PLAN-FIT-BIM-ONLY, L-814).
 */
export const BIM_FIT_ELEMENT_TYPES: ReadonlySet<string> = new Set([
    'wall', 'slab', 'furniture', 'column', 'beam', 'roof',
    'curtainwall', 'curtain-wall', 'door', 'window',
    'stair', 'stairs', 'railing', 'plumbing', 'ceiling', 'floor',
]);

/** Diagnostics for the mesh that sits farthest from the origin among those INCLUDED. */
export interface FarthestIncludedMesh {
    /** World-space XZ distance from the origin, metres. */
    distanceM: number;
    /** Ancestry chain, outermost-first (`GIS_BIM_ROOT › Group › Wall_12`), ≤5 levels. */
    ancestry: string;
}

export interface BimFitBoundsResult {
    /** World-space bounds of the fit population. Empty when the scene has no candidates. */
    bounds: THREE.Box3;
    /** True when the BIM-typed pass produced the bounds; false = fallback pass (or empty). */
    usedBimTypePass: boolean;
    /** The farthest-from-origin mesh actually INCLUDED in `bounds`, or null when empty. */
    farthestIncluded: FarthestIncludedMesh | null;
}

/**
 * §PLAN-FIT-DIAG-MEASURED-NOTHING (L-604) — name a mesh AND the ancestors it hangs off,
 * innermost-last. The leaf name alone is not the answer when the coordinate-space error
 * lives on a parent's matrix (e.g. GIS_BIM_ROOT's ECEF eastNorthUpToFixedFrame), which
 * is the normal case. Capped at 5 levels so the log line stays readable.
 */
export function describeMeshAncestry(obj: THREE.Object3D, root?: THREE.Object3D | null): string {
    return withSpanSync('pryzm.scene.describe_mesh_ancestry', {}, () => {
        const parts: string[] = [];
        let cursor: THREE.Object3D | null = obj;
        let depth = 0;
        while (cursor && cursor !== root && depth < 5) {
            parts.unshift(cursor.name || cursor.type || '(unnamed)');
            cursor = cursor.parent;
            depth++;
        }
        return parts.join(' › ') || '(unnamed)';
    });
}

/**
 * Collect the world-space bounds of the AUTHORED BIM content in `scene` — the bounds a
 * camera fit is allowed to read. See the module doc for the two-pass policy.
 *
 * @param scene    the scene (or subtree root) to collect from.
 * @param gridRoot optional OBC grid root, excluded structurally (may be null — the OBC
 *                 grid is line geometry and never in the Mesh population anyway).
 */
export function computeBimFitBounds(
    scene: THREE.Object3D,
    gridRoot: THREE.Object3D | null = null,
): BimFitBoundsResult {
    return withSpanSync('pryzm.scene.compute_bim_fit_bounds', {}, (span) => {
        const worldPos = new THREE.Vector3();
        const tmp = new THREE.Box3();

        const collect = (requireBimType: boolean): { box: THREE.Box3; farthest: FarthestIncludedMesh | null } => {
            const box = new THREE.Box3();
            let farthest: FarthestIncludedMesh | null = null;
            scene.traverse((obj: THREE.Object3D) => {
                if (!(obj as THREE.Mesh).isMesh) return;
                if (!obj.visible) return;
                if (SceneObjectClassifier.shouldExcludeFromBounds(obj, gridRoot)) return;
                if (requireBimType) {
                    const t = String(obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
                    if (!BIM_FIT_ELEMENT_TYPES.has(t)) return;
                }
                tmp.setFromObject(obj);
                if (tmp.isEmpty()) return;
                box.union(tmp);
                // §PLAN-FIT-DIAG-MEASURED-NOTHING (L-604) — WORLD space, matching the box.
                obj.getWorldPosition(worldPos);
                const d = Math.hypot(worldPos.x, worldPos.z);
                if (!farthest || d > farthest.distanceM) {
                    farthest = { distanceM: d, ancestry: describeMeshAncestry(obj, scene) };
                }
            });
            return { box, farthest };
        };

        const bimPass = collect(true);
        const usedBimTypePass = !bimPass.box.isEmpty();
        const chosen = usedBimTypePass ? bimPass : collect(false);

        span.setAttribute('pryzm.scene.fit_bim_type_pass', usedBimTypePass);
        span.setAttribute('pryzm.scene.fit_bounds_empty', chosen.box.isEmpty());
        return {
            bounds: chosen.box,
            usedBimTypePass,
            farthestIncluded: chosen.farthest,
        };
    });
}
