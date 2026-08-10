import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
// §CAM-FRAME-INVARIANT (L-742) — the single framing authority shared with ViewController.
import { computeFitPose } from '@pryzm/core-app-model';
// §FIX-GIZMO-IN-BOUNDS (L-749) / §PLAN-FIT-BIM-ONLY (L-814) — ONE authority for
// "is this part of the model", INCLUDING the BIM-type allow-list pass. The collection
// formerly inlined here is now shared with SplitViewManager's plan-pane camera fit.
import { computeBimFitBounds } from '@pryzm/scene-committer';

/**
 * Registers default OBC views (3D, plans, elevations) and creates the
 * zoomToAll() camera-fit function.
 * Extracted from engineLauncher.ts Task 5.2.
 */
export function initViewSetup(params: { components: any; world: any; viewController: any }): {
    zoomToAll: (animate?: boolean) => Promise<void>;
} {
    const { components, world, viewController } = params;

    // ── Register default views ────────────────────────────────────────────────
    const viewsList = components.get(OBC.Views);
    const defaultViews = [
        { id: '3D', type: '3D View' },
        { id: 'Ground Floor', type: 'Floor Plan' },
        { id: 'Top', type: 'Floor Plan' },
        { id: 'Front', type: 'Elevation' },
        { id: 'Left', type: 'Elevation' },
        { id: 'Right', type: 'Elevation' },
        { id: 'Back', type: 'Elevation' },
    ];
    for (const viewInfo of defaultViews) {
        if (!viewsList.list.has(viewInfo.id)) {
            const view = new OBC.View(components);
            (view as any).id = viewInfo.id;
            view.world = world;
            (view as any).position  = new THREE.Vector3();
            (view as any).direction = new THREE.Vector3();
            if (viewInfo.id === 'Top') {
                (view as any).position.set(0, 50, 0);
                (view as any).direction.set(0, -1, 0);
            } else if (viewInfo.id === 'Front') {
                (view as any).position.set(0, 0, 50);
                (view as any).direction.set(0, 0, -1);
            } else if (viewInfo.id === 'Right') {
                (view as any).position.set(50, 0, 0);
                (view as any).direction.set(-1, 0, 0);
            } else if (viewInfo.id === '3D') {
                (view as any).position.set(20, 20, 20);
                (view as any).direction.set(-1, -1, -1).normalize();
            }
            viewsList.list.set(view.id, view);
        }
    }
    window.runtime?.events?.emit('update-views', {}); // F.events.10

    // ── zoomToAll ─────────────────────────────────────────────────────────────
    const zoomToAll = async (animate = true) => {
        // §FIX-GIZMO-IN-BOUNDS (L-749) / §PLAN-FIT-BIM-ONLY (L-814) — classification AND
        // collection are SHARED, not re-implemented.
        //
        // L-749 routed both passes here through `SceneObjectClassifier` after the
        // TransformControls axis handles (~1,575 km helper lines with EMPTY userData)
        // were framed as "the model" by the fallback pass — the white 3D screen.
        //
        // L-814 went one step further: the plan-pane fit (`SplitViewManager.
        // _fitCamTargetToScene`) still had its OWN unfiltered traversal, so a
        // georeferenced site/context mesh dragged the PLAN camera target megametres out
        // while Fit All stayed correct — two disagreeing collections, same defect shape.
        // `computeBimFitBounds` (scene-committer) is now the ONE collection both use:
        // pass 1 = BIM element types only, fallback = classified all-mesh.
        //
        // gridRoot is null here: this traversal only visits `THREE.Mesh`, and the OBC grid
        // is line geometry, so it was never in this population and nothing changes by
        // passing null. The helper/control exclusion does not depend on it.
        const { bounds: box } = computeBimFitBounds(world.scene.three, null);

        if (box.isEmpty()) {
            console.warn('[zoomToAll] No geometry found in scene');
            return;
        }

        // §CAM-FRAME-INVARIANT (L-742) — one framing authority. Fit All and 3D-view
        // activation now compute the SAME pose through computeFitPose(). Previously this
        // function used its own policy (distance clamped to [8, 80] m, far plane untouched)
        // while ViewController used another (maxDim × 2, far plane left at 2000 m). Two
        // disagreeing policies is what made Fit All the only thing that "brought the
        // geometry back": its clamp kept the camera inside the far plane by accident, and
        // its 80 m ceiling silently refused to fit anything bigger than a house.
        const cam = world.camera.three as THREE.PerspectiveCamera;
        const pose = computeFitPose(box, {
            fovDeg: cam?.isPerspectiveCamera ? cam.fov : 60,
            aspect: cam?.isPerspectiveCamera ? cam.aspect : 1,
        });
        if (!pose) {
            console.warn('[zoomToAll] bounds could not be framed (empty/non-finite)');
            return;
        }
        const { position: cameraPos, target: center, distance } = pose;

        // The depth range travels WITH the pose — an honest fit of a large model sits
        // outside the default 2000 m far plane and would otherwise render nothing.
        if (cam?.isPerspectiveCamera) {
            cam.near = pose.near;
            cam.far  = pose.far;
            cam.updateProjectionMatrix();
        }

        const prevMax = world.camera.controls.maxDistance;
        const animMax = distance * 1.1;
        if (world.camera.controls.maxDistance < animMax) {
            world.camera.controls.maxDistance = animMax;
        }

        await world.camera.controls.setLookAt(
            cameraPos.x, cameraPos.y, cameraPos.z,
            center.x, center.y, center.z,
            animate,
        );
        viewController.multiViewCameraManager.seedPerspectiveSlot(cameraPos, center);

        setTimeout(() => {
            // Never re-clamp BELOW the distance we just fitted at, or the constraint pass
            // would pull the camera back in and undo the fit on a large model.
            world.camera.controls.maxDistance = Math.max(prevMax, animMax);
            (world as any)._reapplyCameraConstraints?.();
        }, 600);
    };

    return { zoomToAll };
}
