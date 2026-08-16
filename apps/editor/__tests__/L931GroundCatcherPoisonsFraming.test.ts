/**
 * L-931 — "SELECT A PARCEL AND THE CAMERA SITS TOO FAR" — the MEASUREMENT.
 *
 * ## What the founder's trace actually says
 *
 * ```
 * +10.5ms  _activate3DView          controls.setLookAt(target=0,0,0  dist=8000.0)
 * +12.4ms  §CAM-FRAME-INVARIANT     auto-framed and VERIFIED  dist=6505.4m
 *  later   §3D-FRAME-ON-VIEW-SWITCH framed 3D camera (initTools → zoomToAll)
 *  later   §VIEW-AUTOFRAME          framed main 3D viewport (SplitViewManager → zoomToAll)
 *  LAST    [HomeView]               Returned to default viewpoint
 * ```
 *
 * ### The prime suspect is REFUTED, and this file does not test it
 *
 * `[HomeView] Returned to default viewpoint` is printed by `goToDefaultView()`
 * (`apps/editor/src/ui/layout/NavigationAreaLayout.ts:105`), whose ONLY call site in the
 * entire repository is the `⌂ Home` button in `CameraRailPanel.ts:65`. Nothing schedules
 * it, no event subscribes to it, no view activation invokes it. Its appearance LAST in the
 * trace is the founder pressing Home — the very workaround the report describes ("the user
 * must click to get a usable view"). It is the REMEDY, not the cause, and none of the four
 * framing actors is overridden by it.
 *
 * ### The four actors do not race — they AGREE, on the wrong subject
 *
 * Both numbers in the trace are closed-form consequences of ONE 4 000 m × 4 000 m plane
 * centred on the origin, and this file measures that the plane is really there and really
 * in the framing population:
 *
 *   • `_activate3DView` default framing: `_computeCameraDistance()` = `maxDim × 2`
 *     → 4000 × 2 = **8000.0**, at `bounds.getCenter()` = the origin.
 *   • `§CAM-FRAME-INVARIANT`: `computeFitPose` radius = |(4000,0,4000)|/2 = 2828.43,
 *     distance = (2828.43 / sin 30°) × 1.15 = **6505.4 m**.
 *
 * The plane is `GroundShadowCatcher` (`packages/renderer-three/src/GroundShadowCatcher.ts`,
 * default `size = 4000`), the invisible L0 shadow receiver. Its mesh is a plain
 * `THREE.Mesh` with `userData = { role, pickable, isGroundShadowCatcher }` — no `isHelper`,
 * no `elementType` — so `SceneObjectClassifier.shouldExcludeFromBounds()` lets it straight
 * through into every framing bounds population.
 *
 * That is the L-749 lesson repeating verbatim: *"controls and helpers are part of the
 * bounds population, and nothing about element identity will ever exclude them."* ADR-0305
 * §3 enumerated a type set for three.js controls and helpers; PRYZM's own infrastructure
 * mesh was never added to it.
 *
 * ## Why these assertions are the layer the user experiences
 *
 * `zoomToAll` is driven here for real — the exact function §3D-FRAME-ON-VIEW-SWITCH and
 * §VIEW-AUTOFRAME call — and the assertion reads the camera pose BACK OUT of the controls
 * after the call returns. Not a framing function's return value: the camera's resting
 * distance from the building the user asked to see.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { GroundShadowCatcher } from '@pryzm/renderer-three';
import { SceneBoundsCache, computeBimFitBounds } from '@pryzm/scene-committer';

// ── window shim: SceneBoundsCache and core-app-model register listeners at MODULE scope,
//    so the shim must exist before those modules are evaluated. Hence dynamic imports,
//    warmed once here (transforming the core-app-model graph costs ~20 s cold).
let computeFitPose: typeof import('@pryzm/core-app-model')['computeFitPose'];
let boundsFramedByCamera: typeof import('@pryzm/core-app-model')['boundsFramedByCamera'];
let initViewSetup: typeof import('@app/engine/initViewSetup')['initViewSetup'];

beforeAll(async () => {
    const listeners = new Map<string, Set<() => void>>();
    (globalThis as unknown as { window: unknown }).window = Object.assign(globalThis, {
        addEventListener: (t: string, h: () => void) => {
            if (!listeners.has(t)) listeners.set(t, new Set());
            listeners.get(t)!.add(h);
        },
        removeEventListener: (t: string, h: () => void) => listeners.get(t)?.delete(h),
        dispatchEvent: () => true,
    });
    ({ computeFitPose, boundsFramedByCamera } = await import('@pryzm/core-app-model'));
    ({ initViewSetup } = await import('@app/engine/initViewSetup'));
}, 180_000);

/** The founder's parcel: a ~40 m city lot, its centroid a few metres off the origin. */
const PARCEL_HALF_M = 20;

/**
 * The production scene population after a parcel is selected and a building exists:
 * the real `GroundShadowCatcher` (visible — `RealEnvironmentService` shows it as soon as
 * the scene has a shadow caster, i.e. as soon as the user has geometry) plus BIM meshes
 * at parcel scale.
 */
function productionScene(opts: { withCatcher: boolean }): {
    scene: THREE.Scene;
    modelBounds: THREE.Box3;
    catcher: GroundShadowCatcher;
} {
    const scene = new THREE.Scene();

    const building = new THREE.Mesh(
        new THREE.BoxGeometry(PARCEL_HALF_M, 9, PARCEL_HALF_M),
        new THREE.MeshBasicMaterial(),
    );
    building.name = 'wall_01';
    building.userData = { elementType: 'wall', id: 'w1' };
    building.position.set(0, 4.5, 0);
    building.castShadow = true;
    scene.add(building);
    scene.updateMatrixWorld(true);

    const modelBounds = new THREE.Box3().setFromObject(building);

    const catcher = new GroundShadowCatcher();
    if (opts.withCatcher) {
        catcher.attach(scene);
        catcher.setEnabled(true); // §L-205 caster gate: a caster exists, so the plane is shown
    }
    scene.updateMatrixWorld(true);

    return { scene, modelBounds, catcher };
}

/** A recording stand-in for camera-controls: stores the pose and reads it back. */
function makeControls() {
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();
    return {
        maxDistance: 500,
        minDistance: 0,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async setLookAt(px: number, py: number, pz: number, tx: number, ty: number, tz: number, _anim?: boolean) {
            position.set(px, py, pz);
            target.set(tx, ty, tz);
        },
        getPosition: (out: THREE.Vector3) => out.copy(position),
        getTarget: (out: THREE.Vector3) => out.copy(target),
        update: () => {},
    };
}

describe('L-931 — the 4 km ground shadow catcher is inside every framing bounds population', () => {
    it('the catcher IS the 4 000 m subject the four actors frame (SceneBoundsCache — actors 1 & 2)', () => {
        const { scene, modelBounds } = productionScene({ withCatcher: true });
        const bounds = new SceneBoundsCache(scene, null).getBounds();

        const size = bounds.getSize(new THREE.Vector3());
        const modelSize = modelBounds.getSize(new THREE.Vector3());

        // MEASURED, not asserted-as-desired: the building is 20 m across; the bounds the
        // camera frames are 4 000 m across. 200× the model.
        expect(modelSize.x).toBeCloseTo(20, 6);
        expect(size.x).toBeCloseTo(4000, 6);
        expect(size.z).toBeCloseTo(4000, 6);

        // `_activate3DView`'s default framing is `maxDim × 2` about `bounds.getCenter()` —
        // the founder's `dist=8000.0` at `target=0.0,0.0,0.0`, reproduced exactly.
        const maxDim = Math.max(size.x, size.y, size.z, 10);
        expect(maxDim * 2).toBeCloseTo(8000.0, 6);
    });

    it("§CAM-FRAME-INVARIANT's fit reproduces the founder's dist=6505.4 m to the decimal", () => {
        const { scene } = productionScene({ withCatcher: true });
        const bounds = new SceneBoundsCache(scene, null).getBounds();

        const pose = computeFitPose(bounds, { fovDeg: 60, aspect: 1.8 })!;
        expect(pose).not.toBeNull();
        expect(Number(pose.distance.toFixed(1))).toBe(6505.4);
    });

    it('§CAM-FRAME-INVARIANT VERIFIES this pose — because it verifies the WRONG subject', () => {
        const { scene, modelBounds } = productionScene({ withCatcher: true });
        const bounds = new SceneBoundsCache(scene, null).getBounds();

        const cam = new THREE.PerspectiveCamera(60, 1.8, 0.1, 20000);
        const pose = computeFitPose(bounds, { fovDeg: cam.fov, aspect: cam.aspect })!;
        cam.position.copy(pose.position);
        cam.lookAt(pose.target);
        cam.near = pose.near;
        cam.far = pose.far;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);

        // The recovery's own predicate passes — against the 4 km plane.
        expect(boundsFramedByCamera(cam, bounds)).toBe(true);
        // Against the thing the user asked to see, it fails. That is the defect: a
        // verification that confirms the framing of a subject nobody selected.
        expect(boundsFramedByCamera(cam, modelBounds)).toBe(false);
    });

    it('the BIM-typed pass is clean; the FALLBACK pass (parcel-only project) admits the catcher', () => {
        const { scene } = productionScene({ withCatcher: true });

        // Pass 1 — authored BIM types only. Correct today.
        const typed = computeBimFitBounds(scene, null);
        expect(typed.usedBimTypePass).toBe(true);
        expect(typed.bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(20, 6);

        // A parcel-only project (site chosen, nothing drawn yet) has no BIM-typed mesh, so
        // `zoomToAll` falls through to the classified all-mesh pass — which is where the
        // catcher lands and where the 4 km subject comes from.
        const siteOnly = new THREE.Scene();
        const catcher = new GroundShadowCatcher();
        catcher.attach(siteOnly);
        catcher.setEnabled(true);
        siteOnly.updateMatrixWorld(true);

        const fallback = computeBimFitBounds(siteOnly, null);
        expect(fallback.usedBimTypePass).toBe(false);
        expect(fallback.bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(4000, 6);
    });
});

describe("L-931 — the camera's RESTING pose after the real zoomToAll (actors 3 & 4)", () => {
    /**
     * The founder's actual moment: a parcel has been selected and the 3D site context has
     * loaded, but NOTHING is authored yet. No mesh carries a `BIM_FIT_ELEMENT_TYPES` type,
     * so `computeBimFitBounds` pass 1 finds nothing and `zoomToAll` falls through to the
     * classified all-mesh pass — where the 4 km catcher lives.
     *
     * The catcher is VISIBLE here because §L-205's caster gate shows it as soon as the
     * scene holds any shadow-casting mesh, and `PascalSceneLighting` flags context
     * geometry as a caster like anything else.
     */
    function parcelJustSelectedScene(withCatcher: boolean) {
        const scene = new THREE.Scene();

        // Site-context neighbour block ~60 m from the parcel — carries no BIM elementType.
        const neighbour = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial());
        neighbour.name = 'context_building_7';
        neighbour.position.set(60, 7, 20);
        neighbour.castShadow = true;
        scene.add(neighbour);

        // The parcel's own footprint underlay, at the site origin.
        const parcelPad = new THREE.Mesh(
            new THREE.BoxGeometry(2 * PARCEL_HALF_M, 0.05, 2 * PARCEL_HALF_M),
            new THREE.MeshBasicMaterial(),
        );
        parcelPad.name = 'parcel_footprint';
        parcelPad.position.set(0, 0.02, 0);
        scene.add(parcelPad);
        scene.updateMatrixWorld(true);

        const contentBounds = new THREE.Box3()
            .setFromObject(neighbour)
            .union(new THREE.Box3().setFromObject(parcelPad));

        const catcher = new GroundShadowCatcher();
        if (withCatcher) {
            catcher.attach(scene);
            catcher.setEnabled(true);
        }
        scene.updateMatrixWorld(true);
        return { scene, contentBounds };
    }

    /**
     * Drives `initViewSetup().zoomToAll()` — the exact function both
     * §3D-FRAME-ON-VIEW-SWITCH (initTools.ts:2172) and §VIEW-AUTOFRAME (SplitViewManager)
     * call — then reads the pose back OUT of the controls. This is the camera's RESTING
     * state after the actor has finished, not a framing function's return value.
     */
    async function restingPoseAfterZoomToAll(scene: THREE.Scene) {
        // Pre-seed every default view id so `initViewSetup` never constructs an OBC.View.
        const list = new Map<string, unknown>(
            ['3D', 'Ground Floor', 'Top', 'Front', 'Left', 'Right', 'Back'].map(id => [id, { id }]),
        );
        const components = { get: () => ({ list }) };

        const controls = makeControls();
        const cam = new THREE.PerspectiveCamera(60, 1.8, 0.1, 2000);
        const world = { scene: { three: scene }, camera: { three: cam, controls } };
        const viewController = { multiViewCameraManager: { seedPerspectiveSlot: () => {} } };

        const { zoomToAll } = initViewSetup({ components, world, viewController } as never);
        await zoomToAll(false);

        const position = new THREE.Vector3();
        const target = new THREE.Vector3();
        controls.getPosition(position);
        controls.getTarget(target);
        return { position, target };
    }

    it('MEASURED: parcel just selected — the camera rests 6.5 km away, aimed at the plane', async () => {
        const { scene, contentBounds } = parcelJustSelectedScene(true);
        const { position, target } = await restingPoseAfterZoomToAll(scene);

        const contentCentre = contentBounds.getCenter(new THREE.Vector3());

        // The founder's complaint, as a number, read off the camera after the actor ran.
        expect(Number(position.distanceTo(target).toFixed(1))).toBe(6505.4);
        expect(position.distanceTo(contentCentre)).toBeGreaterThan(6000);
        // …and it is not even AIMED at the site: the target is the 4 km plane's centre.
        expect(target.distanceTo(contentCentre)).toBeGreaterThan(20);
    });

    it('the same production call frames the site once the catcher is out of the population', async () => {
        const { scene, contentBounds } = parcelJustSelectedScene(false);
        const { position, target } = await restingPoseAfterZoomToAll(scene);

        const contentCentre = contentBounds.getCenter(new THREE.Vector3());
        expect(position.distanceTo(contentCentre)).toBeLessThan(250);
        expect(target.distanceTo(contentCentre)).toBeLessThan(1);
    });

    it('a project WITH authored BIM geometry never took the fallback — pass 1 was always clean', async () => {
        const { scene, modelBounds } = productionScene({ withCatcher: true });
        const { position, target } = await restingPoseAfterZoomToAll(scene);

        const modelCentre = modelBounds.getCenter(new THREE.Vector3());
        expect(position.distanceTo(modelCentre)).toBeLessThan(120);
        expect(target.distanceTo(modelCentre)).toBeLessThan(1);
    });
});
