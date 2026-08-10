/**
 * §PLAN-FIT-BIM-ONLY (L-814) — the camera-fit bounds population is AUTHORED BIM
 * content, not "every mesh in the scene".
 *
 * PRODUCTION EVIDENCE (2026-08-10, plan view open with 3D Site context): hundreds of
 * `§PLAN-CAMTARGET-SANITY (L-481) REFUSED an implausible plan camera target
 * (114525.76, -1577006.42, 135718.26)` per session. The producer was
 * `SplitViewManager._fitCamTargetToScene`, which expanded a Box3 over EVERY mesh —
 * including georeferenced site/context content sitting megametres from the site
 * origin — and handed the contaminated centre to the plan camera on every frame.
 *
 * `computeBimFitBounds` is the shared fix: pass 1 admits only meshes carrying a BIM
 * `userData.elementType` (context tiles / terrain / underlays / gizmos carry none),
 * with a classified all-mesh fallback when no BIM-typed content exists.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeBimFitBounds, describeMeshAncestry } from '../src/bimFitBounds';

function bimMesh(elementType: string, x: number, z: number, size = 2): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
    m.userData.elementType = elementType;
    m.position.set(x, 0, z);
    m.updateMatrixWorld(true);
    return m;
}

function plainMesh(name: string, x: number, y: number, z: number, size = 100): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
    m.name = name;
    m.position.set(x, y, z);
    m.updateMatrixWorld(true);
    return m;
}

describe('§PLAN-FIT-BIM-ONLY (L-814) — computeBimFitBounds', () => {
    it('fits BIM content only when a georeferenced context mesh sits megametres out', () => {
        const scene = new THREE.Scene();
        // Authored BIM content near the site origin.
        scene.add(bimMesh('wall', 5, 3));
        scene.add(bimMesh('slab', -4, 8));
        // The production offender's shape: context content far from the site origin
        // (georeferenced / ECEF-offset), carrying NO BIM element type.
        const context = plainMesh('context-tile-terrain', 114525, -1577006, 135718, 500);
        scene.add(context);
        scene.updateMatrixWorld(true);

        const { bounds, usedBimTypePass, farthestIncluded } = computeBimFitBounds(scene);

        expect(usedBimTypePass).toBe(true);
        const center = bounds.getCenter(new THREE.Vector3());
        // Target derived from these bounds is plausible: BIM content only, near the origin.
        expect(Math.abs(center.x)).toBeLessThan(20);
        expect(Math.abs(center.z)).toBeLessThan(20);
        expect(Math.abs(bounds.min.y)).toBeLessThan(20);
        // The context mesh is not merely "not dominant" — it is not in the population at all.
        expect(bounds.max.x).toBeLessThan(1_000);
        expect(farthestIncluded).not.toBeNull();
        expect(farthestIncluded!.distanceM).toBeLessThan(1_000);
        expect(farthestIncluded!.ancestry).not.toContain('context-tile-terrain');
    });

    it('re-parented context under a huge parent matrix (GIS_BIM_ROOT shape) stays excluded', () => {
        const scene = new THREE.Scene();
        scene.add(bimMesh('wall', 2, 2));
        const gisRoot = new THREE.Group();
        gisRoot.name = 'GIS_BIM_ROOT';
        const leaf = plainMesh('terrain-patch', 0.4, 0, 1.2, 50); // small LOCAL position…
        gisRoot.add(leaf);
        gisRoot.position.set(4_000_000, -1_500_000, 4_000_000);   // …huge PARENT transform
        scene.add(gisRoot);
        scene.updateMatrixWorld(true);

        const { bounds, usedBimTypePass } = computeBimFitBounds(scene);
        expect(usedBimTypePass).toBe(true);
        expect(bounds.max.length()).toBeLessThan(1_000);
    });

    it('falls back to classified all-mesh bounds when no BIM-typed content exists', () => {
        const scene = new THREE.Scene();
        const untyped = plainMesh('legacy-import', 10, 0, -6, 4);
        scene.add(untyped);
        scene.updateMatrixWorld(true);

        const { bounds, usedBimTypePass, farthestIncluded } = computeBimFitBounds(scene);
        expect(usedBimTypePass).toBe(false);
        expect(bounds.isEmpty()).toBe(false);
        const center = bounds.getCenter(new THREE.Vector3());
        expect(center.x).toBeCloseTo(10, 3);
        expect(center.z).toBeCloseTo(-6, 3);
        expect(farthestIncluded!.ancestry).toContain('legacy-import');
    });

    it('excludes helpers/gizmos even in the fallback pass (L-749 regression)', () => {
        const scene = new THREE.Scene();
        const gizmo = new THREE.Object3D();
        gizmo.type = 'TransformControlsGizmo';
        const handle = new THREE.Mesh(
            new THREE.BoxGeometry(1_575_838, 1e-4, 1e-4),
            new THREE.MeshBasicMaterial(),
        );
        handle.name = 'X';
        gizmo.add(handle);
        scene.add(gizmo);
        const untyped = plainMesh('shed', 3, 0, 3, 4);
        scene.add(untyped);
        scene.updateMatrixWorld(true);

        const { bounds } = computeBimFitBounds(scene);
        expect(bounds.isEmpty()).toBe(false);
        expect(bounds.max.x).toBeLessThan(100);
    });

    it('returns empty bounds for an empty scene', () => {
        const { bounds, usedBimTypePass, farthestIncluded } = computeBimFitBounds(new THREE.Scene());
        expect(bounds.isEmpty()).toBe(true);
        expect(usedBimTypePass).toBe(false);
        expect(farthestIncluded).toBeNull();
    });

    it('invisible meshes are not part of the fit population', () => {
        const scene = new THREE.Scene();
        scene.add(bimMesh('wall', 1, 1));
        const hiddenFar = bimMesh('wall', 500_000, 0);
        hiddenFar.visible = false;
        scene.add(hiddenFar);
        scene.updateMatrixWorld(true);

        const { bounds } = computeBimFitBounds(scene);
        expect(bounds.max.x).toBeLessThan(100);
    });

    it('describeMeshAncestry names the parent chain innermost-last', () => {
        const scene = new THREE.Scene();
        const root = new THREE.Group();
        root.name = 'GIS_BIM_ROOT';
        const leaf = plainMesh('Wall_12', 0, 0, 0, 1);
        root.add(leaf);
        scene.add(root);
        expect(describeMeshAncestry(leaf, scene)).toBe('GIS_BIM_ROOT › Wall_12');
    });
});
