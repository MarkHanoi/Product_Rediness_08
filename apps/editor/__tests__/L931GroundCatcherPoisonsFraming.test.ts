/**
 * L-931 — "SELECT A PARCEL AND THE CAMERA SITS TOO FAR" — §CAM-CATCHER-NOT-MODEL.
 *
 * ## What the founder's trace actually said
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
 * framing actors was overridden by it.
 *
 * ### The four actors did not race — they AGREED, on the wrong subject
 *
 * Both numbers in the trace are closed-form consequences of ONE 4 000 m × 4 000 m plane
 * centred on the origin:
 *
 *   • `_activate3DView` default framing: `_computeCameraDistance()` = `maxDim × 2`
 *     → 4000 × 2 = **8000.0**, at `bounds.getCenter()` = the origin.
 *   • `§CAM-FRAME-INVARIANT`: `computeFitPose` radius = |(4000,0,4000)|/2 = 2828.43,
 *     distance = (2828.43 / sin 30°) × 1.15 = **6505.4 m**.
 *
 * The plane is `GroundShadowCatcher` (`packages/renderer-three/src/GroundShadowCatcher.ts`,
 * default `size = 4000`), the invisible L0 shadow receiver. Its mesh was a plain
 * `THREE.Mesh` with `userData = { role, pickable, isGroundShadowCatcher }` — no `isHelper`,
 * no `elementType` — so `SceneObjectClassifier.shouldExcludeFromBounds()` let it straight
 * through into every framing bounds population. The L-749 lesson repeating verbatim
 * (*"nothing about element identity will ever exclude them"*) on PRYZM's own infrastructure
 * rather than three.js's.
 *
 * ## The two fixes these tests guard
 *
 * 1. **§CAM-CATCHER-NOT-MODEL** — `SceneObjectClassifier.isSceneInfrastructure()` excludes
 *    the catcher from the ONE bounds population every framer reads. Declared positively by
 *    the producer (`userData.isSceneInfrastructure`), NOT via `isHelper`, which fifteen
 *    unrelated culling / view-range / panorama passes also read.
 * 2. **§CAM-ONE-FRAMING-AUTHORITY** — `_activate3DView`'s default framing carried its own
 *    `maxDim × 2` policy competing with `computeFitPose()` over the identical input. That
 *    rival policy is deleted; all four actors now route through the single authority, so
 *    the losers defer explicitly instead of racing.
 *
 * ## Why these assertions are the layer the user experiences
 *
 * `zoomToAll` is driven here for real — the exact function §3D-FRAME-ON-VIEW-SWITCH and
 * §VIEW-AUTOFRAME call — and the assertion reads the camera pose BACK OUT of the controls
 * after the call returns. Not a framing function's return value: the camera's resting
 * distance from the site the user asked to see. **MEASURED 6505.4 m before, 122.6 m after.**
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
let boundsFromSiteRing: typeof import('@pryzm/core-app-model')['boundsFromSiteRing'];
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
    ({ computeFitPose, boundsFramedByCamera, boundsFromSiteRing } = await import('@pryzm/core-app-model'));
    ({ initViewSetup } = await import('@app/engine/initViewSetup'));
}, 300_000);

/** The founder's parcel: a ~40 m city lot. */
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
        async setLookAt(px: number, py: number, pz: number, tx: number, ty: number, tz: number, _anim?: boolean) {
            void _anim;
            position.set(px, py, pz);
            target.set(tx, ty, tz);
        },
        getPosition: (out: THREE.Vector3) => out.copy(position),
        getTarget: (out: THREE.Vector3) => out.copy(target),
        update: () => {},
    };
}

describe('L-931 — PRYZM scene infrastructure is out of every framing bounds population', () => {
    it('the framing bounds are the BUILDING, not the 4 km plane (SceneBoundsCache — actors 1 & 2)', () => {
        const { scene, modelBounds } = productionScene({ withCatcher: true });
        const bounds = new SceneBoundsCache(scene, null).getBounds();

        const size = bounds.getSize(new THREE.Vector3());
        const modelSize = modelBounds.getSize(new THREE.Vector3());

        // TOOTH — this measured 4000.0 before §CAM-CATCHER-NOT-MODEL, for a 20 m building.
        expect(modelSize.x).toBeCloseTo(20, 6);
        expect(size.x).toBeCloseTo(20, 6);
        expect(size.z).toBeCloseTo(20, 6);

        // `_activate3DView`'s default framing used to be `maxDim × 2` = 8000.0 about the
        // origin — the founder's exact log line. The rival policy is gone (the default now
        // routes through `computeFitPose`), and the input it read is no longer poisoned.
        expect(Math.max(size.x, size.y, size.z, 10) * 2).toBeLessThan(50);
    });

    it('the single framing authority fits the model at ~34 m, not 6505.4 m', () => {
        const { scene } = productionScene({ withCatcher: true });
        const bounds = new SceneBoundsCache(scene, null).getBounds();

        const pose = computeFitPose(bounds, { fovDeg: 60, aspect: 1.8 })!;
        expect(pose).not.toBeNull();
        // TOOTH — 6505.4 before the fix: (|(4000,0,4000)|/2 / sin 30°) × 1.15.
        expect(pose.distance).toBeGreaterThan(20);
        expect(pose.distance).toBeLessThan(60);
    });

    it('§CAM-FRAME-INVARIANT now verifies the SUBJECT THE USER SELECTED', () => {
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

        // TOOTH — this was the defect's signature: the recovery re-ran its own predicate,
        // passed it against the 4 km plane, and announced "auto-framed and VERIFIED" while
        // the model it exists to protect was sub-pixel. Both must now agree.
        expect(boundsFramedByCamera(cam, bounds)).toBe(true);
        expect(boundsFramedByCamera(cam, modelBounds)).toBe(true);
    });

    it('a scene containing ONLY infrastructure measures EMPTY — so the fit REFUSES', () => {
        const siteOnly = new THREE.Scene();
        const catcher = new GroundShadowCatcher();
        catcher.attach(siteOnly);
        catcher.setEnabled(true);
        siteOnly.updateMatrixWorld(true);

        // TOOTH — 4000.0 before the fix. Empty is the honest answer: there is nothing to
        // frame. `zoomToAll` refuses on empty bounds ("No geometry found in scene") and
        // leaves the camera alone, which the next describe pins. A refusal that names why
        // it cannot help must not be weakened into a made-up extent.
        const fallback = computeBimFitBounds(siteOnly, null);
        expect(fallback.usedBimTypePass).toBe(false);
        expect(fallback.bounds.isEmpty()).toBe(true);
    });

    it('the BIM-typed pass is unchanged — real geometry still frames', () => {
        const { scene } = productionScene({ withCatcher: true });
        const typed = computeBimFitBounds(scene, null);
        expect(typed.usedBimTypePass).toBe(true);
        expect(typed.bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(20, 6);
    });

    /**
     * The brief for this lane asked to "make the default frame the PARCEL", on the reading
     * that the restore-MISS default was a static origin-at-8 km constant that
     * §CAM-FRAME-INVARIANT then had to rescue.
     *
     * REFUTED. The default was never a constant — it read `_getFramingBounds()`, whose
     * precedence has been model → SITE → constant since §CAM-FRAME-SITE-WHEN-NO-MODEL
     * (L-748, ADR-0305 §1). The parcel rung was already written.
     *
     * What was actually broken is that the rung was UNREACHABLE. `_getFramingBounds()`
     * only consults the site ring when the MODEL bounds are empty — and the catcher made
     * them non-empty on every project where ground shadows were on and a caster existed,
     * i.e. every project with geometry. The parcel rung could not fire, so the framing was
     * a correct fit of a 4 km plane instead. Excluding the catcher does not add a parcel
     * default; it lets the existing one run.
     *
     * This walks the exact chain `_getFramingBounds()` walks.
     */
    it('the SITE rung is now REACHABLE: an unauthored project frames the PARCEL, not the origin', () => {
        // A parcel has been committed; nothing drawn. Ground shadows on, catcher attached.
        const scene = new THREE.Scene();
        const catcher = new GroundShadowCatcher();
        catcher.attach(scene);
        catcher.setEnabled(true);
        scene.updateMatrixWorld(true);

        // Rung 1 — MODEL. Empty, now that infrastructure is out of the population.
        // Before the fix this measured 4000 m and short-circuited the precedence here.
        const model = new SceneBoundsCache(scene, null).getBounds();
        expect(model.isEmpty()).toBe(true);

        // Rung 2 — SITE. The founder's parcel: ~246 m², centroid ~12.9 m off the origin.
        const ring = Array.from({ length: 13 }, (_, i) => {
            const a = (i / 13) * Math.PI * 2;
            const r = Math.sqrt(246 / Math.PI);
            return { x: 9.1 + r * Math.cos(a), z: 9.1 + r * Math.sin(a) };
        });
        const site = boundsFromSiteRing(ring)!;
        expect(site).not.toBeNull();

        const pose = computeFitPose(site, { fovDeg: 60, aspect: 1.8 })!;
        // Parcel-scale, and AIMED at the parcel rather than the world origin.
        expect(pose.distance).toBeGreaterThan(5);
        expect(pose.distance).toBeLessThan(120);
        expect(Math.hypot(pose.target.x, pose.target.z)).toBeGreaterThan(10);
    });
});

describe("L-931 — the camera's RESTING pose after the real zoomToAll (actors 3 & 4)", () => {
    /**
     * The founder's actual moment: a parcel has been selected and the 3D site context has
     * loaded, but NOTHING is authored yet. No mesh carries a `BIM_FIT_ELEMENT_TYPES` type,
     * so `computeBimFitBounds` pass 1 finds nothing and `zoomToAll` falls through to the
     * classified all-mesh pass — which is where the 4 km catcher used to live.
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

    it('THE FIX AT THE LAYER THE USER EXPERIENCES: parcel just selected → the camera rests ON the site', async () => {
        const { scene, contentBounds } = parcelJustSelectedScene(true);
        const { position, target } = await restingPoseAfterZoomToAll(scene);

        const contentCentre = contentBounds.getCenter(new THREE.Vector3());

        // TOOTH — MEASURED 6505.4 m before the fix, with the target 44 m off the site.
        // Read off the camera AFTER the actor ran, not from a framing function's return.
        expect(Number(position.distanceTo(target).toFixed(1))).toBe(122.6);
        expect(position.distanceTo(contentCentre)).toBeLessThan(250);
        expect(target.distanceTo(contentCentre)).toBeLessThan(1);
    });

    it('the catcher is now irrelevant to the outcome — with or without it, the same pose', async () => {
        const withIt = await restingPoseAfterZoomToAll(parcelJustSelectedScene(true).scene);
        const withoutIt = await restingPoseAfterZoomToAll(parcelJustSelectedScene(false).scene);

        // The strongest statement of the fix: the 4 km plane no longer participates at all.
        expect(withIt.position.distanceTo(withoutIt.position)).toBeLessThan(1e-6);
        expect(withIt.target.distanceTo(withoutIt.target)).toBeLessThan(1e-6);
    });

    it('an infrastructure-ONLY scene leaves the camera untouched — the refusal is intact', async () => {
        const scene = new THREE.Scene();
        const catcher = new GroundShadowCatcher();
        catcher.attach(scene);
        catcher.setEnabled(true);
        scene.updateMatrixWorld(true);

        const { position, target } = await restingPoseAfterZoomToAll(scene);
        // `zoomToAll` warned and returned; nothing called setLookAt, so the recording
        // controls still read their initial (0,0,0). Silence is the one forbidden outcome
        // — it warns — but inventing a 4 km "fit" was the worse one.
        expect(position.length()).toBe(0);
        expect(target.length()).toBe(0);
    });

    it('a project WITH authored BIM geometry frames the building', async () => {
        const { scene, modelBounds } = productionScene({ withCatcher: true });
        const { position, target } = await restingPoseAfterZoomToAll(scene);

        const modelCentre = modelBounds.getCenter(new THREE.Vector3());
        expect(position.distanceTo(modelCentre)).toBeLessThan(120);
        expect(target.distanceTo(modelCentre)).toBeLessThan(1);
    });
});
