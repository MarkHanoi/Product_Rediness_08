/**
 * §FIX-GIZMO-IN-BOUNDS (L-749) — controls and helpers are not part of the model.
 *
 * FOUNDER EVIDENCE. The §CAM-BIM-SCALE-BOUNDS revision-2 probe named the object that had
 * been poisoning scene bounds on every project:
 *
 *   23 object(s) over 1 km. Top contributors:
 *     #1 extent=1575838m verts=19 box=[-1575838,-525279,-525279 → 0,525279,525279]
 *        ctor=ze type=Mesh name="X" elementType=∅ id=∅ userDataKeys=[∅]
 *        ancestry: Object3D ← TransformControlsGizmo ← Object3D ← Scene
 *
 * The TransformControls axis handles. three.js draws the pickers/helpers as effectively
 * infinite lines — ~1,575 km each, 23 of them. It was never a Cesium leftover and never
 * anything to do with the globe handback: it has been in the scene since transform
 * controls were first constructed, on every project.
 *
 * ## Why every existing filter missed it
 *
 *   * `.type` is plain `'Mesh'` — only the PARENT is `TransformControlsGizmo`, and the old
 *     `isHelperObject` tested `obj` alone, so it excluded the gizmo node (which owns no
 *     geometry) and none of its children (which own all of it).
 *   * `userData` is EMPTY — no `elementType`, no `id`, no `isHelper`. Every filter keyed
 *     on element identity sails straight past it. That is not an oversight in one filter;
 *     it is what a CONTROL looks like, and controls must be excluded structurally.
 *   * the constructor is minified (`ze`), so matching on constructor name is not viable
 *     in production. `.type` is set explicitly by three and survives minification.
 *
 * ## The chain of symptoms this ONE object produced
 *
 *   scene bounds ~3,152 km across
 *     → default camera framing at 6,542 km (L-744)
 *     → near = far/1e6 = 14.02 m, slicing every wall the user walked up to (L-747)
 *     → on a project with no walls, `zoomToAll`'s fallback pass framed the GIZMO and flew
 *       the camera to megametres: "the boundary appears briefly then it's gone", and the
 *       white 3D screen.
 *
 * Each was reported as a separate bug. All of them are this.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SceneObjectClassifier } from '../src/SceneObjectClassifier';

/**
 * Rebuild the founder's exact ancestry:
 *   Mesh("X") ← Object3D ← TransformControlsGizmo ← Object3D ← Scene
 * with a genuine three.js-scale helper line so the extent is realistic.
 */
function foundersGizmoHandle(): { scene: THREE.Scene; handle: THREE.Mesh } {
    const scene = new THREE.Scene();
    const controlsRoot = new THREE.Object3D();
    const gizmo = new THREE.Object3D();
    gizmo.type = 'TransformControlsGizmo';       // three sets this explicitly
    const layer = new THREE.Object3D();
    const handle = new THREE.Mesh(
        new THREE.BoxGeometry(1_575_838, 1e-4, 1e-4),
        new THREE.MeshBasicMaterial(),
    );
    handle.name = 'X';                            // the axis handle's name
    layer.add(handle);
    gizmo.add(layer);
    controlsRoot.add(gizmo);
    scene.add(controlsRoot);
    return { scene, handle };
}

describe('SceneObjectClassifier — the TransformControls subtree is excluded from bounds', () => {
    it("EXCLUDES the founder's axis handle (Mesh, empty userData, gizmo ancestor)", () => {
        const { handle } = foundersGizmoHandle();

        // TOOTH: before the ancestry walk this returned FALSE — the handle's own `.type`
        // is 'Mesh' and its userData is empty, so nothing about the OBJECT identified it.
        expect(SceneObjectClassifier.isHelperObject(handle)).toBe(true);
        expect(SceneObjectClassifier.shouldExcludeFromBounds(handle, null)).toBe(true);
    });

    it('the handle really is globe-scale, so missing it really does poison bounds', () => {
        const { handle } = foundersGizmoHandle();
        const box = new THREE.Box3().setFromObject(handle);
        expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(1_000_000);
    });

    it('excludes the gizmo NODE itself as well as its descendants', () => {
        const { scene } = foundersGizmoHandle();
        const gizmo = scene.getObjectByProperty('type', 'TransformControlsGizmo')!;
        expect(SceneObjectClassifier.isHelperObject(gizmo)).toBe(true);
    });

    it('excludes TransformControls and TransformControlsPlane subtrees too', () => {
        for (const t of ['TransformControls', 'TransformControlsPlane']) {
            const root = new THREE.Object3D();
            root.type = t;
            const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
            root.add(child);
            expect(SceneObjectClassifier.isHelperObject(child)).toBe(true);
        }
    });

    it('excludes DESCENDANTS of the core helpers, not just the helper node', () => {
        // Same defect shape, different class: a helper's children own the geometry.
        const axes = new THREE.AxesHelper(5);
        const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        axes.add(child);
        expect(SceneObjectClassifier.isHelperObject(axes)).toBe(true);
        expect(SceneObjectClassifier.isHelperObject(child)).toBe(true);
    });

    it('excludes descendants of a userData.isHelper subtree (selection highlight + its edges)', () => {
        const highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        highlight.userData.isHelper = true;
        const edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
        highlight.add(edges);
        expect(SceneObjectClassifier.isHelperObject(edges)).toBe(true);
    });

    it('still INCLUDES real BIM geometry — the guard must not eat the model', () => {
        const scene = new THREE.Scene();
        const level = new THREE.Object3D();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), new THREE.MeshBasicMaterial());
        wall.userData = { elementType: 'wall', id: 'wall_1' };
        level.add(wall);
        scene.add(level);

        expect(SceneObjectClassifier.isHelperObject(wall)).toBe(false);
        expect(SceneObjectClassifier.shouldExcludeFromBounds(wall, null)).toBe(false);
    });

    it('includes a wall even when a gizmo is a SIBLING elsewhere in the scene', () => {
        // Ancestry, not proximity: attaching the gizmo to the same scene must not
        // disqualify unrelated geometry.
        const { scene } = foundersGizmoHandle();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), new THREE.MeshBasicMaterial());
        wall.userData = { elementType: 'wall', id: 'wall_1' };
        scene.add(wall);
        expect(SceneObjectClassifier.shouldExcludeFromBounds(wall, null)).toBe(false);
    });

    it('terminates on a cyclic parent chain rather than hanging the render path', () => {
        const a = new THREE.Object3D();
        const b = new THREE.Object3D();
        a.parent = b;
        b.parent = a;                       // pathological, but must not spin forever
        expect(SceneObjectClassifier.isHelperObject(a)).toBe(false);
    });
});

describe('SceneObjectClassifier — the bounds population after the fix', () => {
    it("a scene of ONLY controls yields empty bounds, not a 3,152 km box", () => {
        // This is the founder's brand-new project: a boundary (line geometry, not Mesh)
        // and 23 gizmo handles. The bounds pass must find NOTHING, so the caller falls
        // through to the site framing (L-748) instead of framing the gizmo.
        const { scene } = foundersGizmoHandle();
        const box = new THREE.Box3();
        scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (SceneObjectClassifier.shouldExcludeFromBounds(obj, null)) return;
            box.union(new THREE.Box3().setFromObject(obj));
        });
        expect(box.isEmpty()).toBe(true);
    });
});
