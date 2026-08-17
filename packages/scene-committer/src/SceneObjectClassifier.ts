import * as THREE from '@pryzm/renderer-three/three';

/**
 * SceneObjectClassifier
 *
 * Shared, stateless utility for classifying scene objects.
 * Replaces duplicate _isGridObject / _isHelperObject implementations
 * that previously existed in both ViewController and PlanViewService.
 *
 * Contract: 01-BIM-ENGINE-CORE §5 (No Side Effects — pure functions only)
 * C04 §2 — Scene committer scope.
 *
 * Migrated: Wave A16-T3 (S122) — extracted from src/engine/subsystems/core/scene/
 */
export class SceneObjectClassifier {
    /**
     * Returns true if `obj` is part of the OBC SimpleGrid subtree.
     * Walks the parent chain from `obj` up to gridRoot.
     * O(depth) — typically 1-3 steps for grid children.
     */
    static isGridObject(obj: THREE.Object3D, gridRoot: THREE.Object3D | null | undefined): boolean {
        if (!gridRoot) return false;
        let current: THREE.Object3D | null = obj;
        while (current) {
            if (current === gridRoot) return true;
            current = current.parent;
        }
        return false;
    }

    /**
     * Object `type` strings for controls/helpers whose ENTIRE SUBTREE is non-model.
     *
     * Matched on `.type` rather than `instanceof` because three's controls live in
     * `examples/jsm` (not the core namespace this module imports) and because a
     * production bundle MINIFIES the constructor — the founder's probe reported
     * `ctor=ze`. `.type` is set explicitly by three and survives minification.
     */
    private static readonly HELPER_SUBTREE_TYPES: ReadonlySet<string> = new Set([
        'TransformControls',
        'TransformControlsGizmo',
        'TransformControlsPlane',
        'Box3Helper',
        'BoxHelper',
        'ArrowHelper',
        'PlaneHelper',
        'SkeletonHelper',
        'HemisphereLightHelper',
        'AxesHelper',
        'GridHelper',
        'CameraHelper',
        'DirectionalLightHelper',
        'PointLightHelper',
        'SpotLightHelper',
    ]);

    /**
     * Returns true if `obj` is — OR DESCENDS FROM — a Three.js helper, a transform
     * control, or anything explicitly tagged `userData.isHelper = true`.
     *
     * ── §FIX-GIZMO-IN-BOUNDS (L-749) — why the ancestry walk ────────────────────
     *
     * This test used to look ONLY at `obj` itself. `obj.type === 'TransformControlsGizmo'`
     * therefore excluded the gizmo NODE and none of its children — and the children are
     * where the geometry is. The founder's diagnostic probe caught it:
     *
     *   23 object(s) over 1 km. Top contributors:
     *     #1 extent=1575838m verts=19 box=[-1575838,-525279,-525279 → 0,525279,525279]
     *        ctor=ze type=Mesh name="X" elementType=∅ id=∅ userDataKeys=[∅]
     *        ancestry: Object3D ← TransformControlsGizmo ← Object3D ← Scene
     *
     * Those are the axis handles ("X", "Y", "Z") — three.js draws them as effectively
     * infinite picker/helper lines, ~1,575 km each. Their own `.type` is plain `'Mesh'`,
     * their `userData` is empty, and they carry no `elementType` and no `id`, so EVERY
     * filter keyed on element identity sails straight past them. They have been in the
     * scene on every project since transform controls were first constructed.
     *
     * This one defect produced a chain of symptoms that each looked independent: scene
     * bounds ~3,152 km across → default camera framing at 6,542 km → a 14 m near plane
     * that sliced walls the user walked up to (L-747) → and, on a project with no walls,
     * `zoomToAll`'s fallback pass flying the camera to megametres (the "white 3D screen").
     *
     * The lesson generalises past this one object, which is why the check is now a
     * SUBTREE test over a TYPE SET rather than another special case: **controls and
     * helpers are part of the bounds population, and nothing about element identity will
     * ever exclude them.** They are not elements; they must be excluded structurally.
     *
     * O(depth) — a handful of steps; the same shape as {@link isGridObject}.
     */
    static isHelperObject(obj: THREE.Object3D): boolean {
        let current: THREE.Object3D | null = obj;
        // Bounded walk: a scene graph deeper than this is pathological, and an
        // unbounded loop on a cyclic graph would hang the render path.
        for (let hops = 0; current && hops < 64; current = current.parent, hops++) {
            if (current.userData?.isHelper === true) return true;
            if (SceneObjectClassifier.HELPER_SUBTREE_TYPES.has(current.type)) return true;
            // `instanceof` still catches core helpers whose `.type` three leaves as the
            // base class name (e.g. some helpers report 'LineSegments').
            if (current instanceof THREE.AxesHelper ||
                current instanceof THREE.GridHelper ||
                current instanceof THREE.CameraHelper ||
                current instanceof THREE.DirectionalLightHelper ||
                current instanceof THREE.PointLightHelper ||
                current instanceof THREE.SpotLightHelper) {
                return true;
            }
        }
        return false;
    }

    /**
     * `userData.role` values PRYZM sets on its OWN scene infrastructure — meshes that
     * exist to support rendering and are not, and can never become, part of the model.
     *
     * Kept as a role set rather than a name/type test because these are PRYZM's objects:
     * the producer declares what they are, positively, at construction. That is the
     * opposite of the L-749 situation, where the offenders (three.js control handles) had
     * EMPTY userData and could only be caught structurally by `.type` ancestry.
     */
    private static readonly INFRASTRUCTURE_ROLES: ReadonlySet<string> = new Set([
        'ground-shadow-catcher',
    ]);

    /**
     * Returns true if `obj` is — or descends from — PRYZM scene infrastructure: a mesh the
     * renderer needs but that is not model content.
     *
     * ── §CAM-CATCHER-NOT-MODEL (L-931) — why this exists ────────────────────────
     *
     * FOUNDER, 2026-08-16, production: *"select a parcel and the camera sits TOO FAR — I
     * must click to get a usable view."* Their trace:
     *
     *   _activate3DView          controls.setLookAt(target=0,0,0  dist=8000.0)
     *   §CAM-FRAME-INVARIANT     auto-framed and VERIFIED  dist=6505.4m
     *
     * Both numbers are closed-form consequences of ONE object. `GroundShadowCatcher` is a
     * 4000 x 4000 m invisible `ShadowMaterial` plane centred on the origin (the L0 contact-
     * shadow receiver, ADR-0106). It made the framing bounds exactly 4 000 m across, so:
     *
     *   `_computeCameraDistance()` = maxDim x 2       = 4000 x 2            = 8000.0
     *   `computeFitPose`  radius = |(4000,0,4000)|/2  = 2828.43
     *                     distance = (2828.43 / sin 30 deg) x 1.15          = 6505.4
     *
     * Nothing was racing and nothing overrode anything: all four framing actors agreed,
     * honestly framing a subject the user never selected. The camera was a correct fit of
     * the wrong thing — which is why `§CAM-FRAME-INVARIANT` re-ran its own predicate,
     * found the (4 km) bounds framed, and announced VERIFIED.
     *
     * The catcher's mesh is a plain `THREE.Mesh`; its `userData` carries `role`,
     * `pickable` and `isGroundShadowCatcher`, but no `elementType` and no `isHelper`. So
     * every existing arm of {@link shouldExcludeFromBounds} sailed past it — exactly the
     * L-749 lesson (*"nothing about element identity will ever exclude them"*) recurring on
     * PRYZM's own infrastructure instead of three.js's.
     *
     * ## Why the fix is here and not on the catcher's `userData.isHelper`
     *
     * Tagging the catcher `isHelper` would have been one line, and it would have moved
     * FIFTEEN other subsystems that read that flag — frustum culling, level-scoped
     * culling, view-range filtering, crop regions, panorama capture. `isHelper` means
     * "not real, hide/skip me" far beyond bounds, and the catcher must keep rendering and
     * keep receiving the sun shadow (L-112 / L-205). The defect is in the BOUNDS
     * population, so the fix belongs in the bounds classifier and nowhere else.
     *
     * Ancestry-walked, like {@link isHelperObject}: infrastructure may be grouped.
     * `userData.isSceneInfrastructure === true` is the open door for the next such mesh,
     * so its author does not have to edit this set.
     */
    static isSceneInfrastructure(obj: THREE.Object3D): boolean {
        let current: THREE.Object3D | null = obj;
        for (let hops = 0; current && hops < 64; current = current.parent, hops++) {
            if (current.userData?.isSceneInfrastructure === true) return true;
            const role = current.userData?.role;
            if (typeof role === 'string' && SceneObjectClassifier.INFRASTRUCTURE_ROLES.has(role)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true if this object is a preview/cursor/ghost mesh that
     * tools place temporarily during interactive placement.
     */
    static isPreviewObject(obj: THREE.Object3D): boolean {
        return obj.userData?.isPreview === true;
    }

    /**
     * Returns true if this object represents a BimLevel (level plane).
     * Level planes should be excluded from camera framing bounds.
     */
    static isBimLevelObject(obj: THREE.Object3D): boolean {
        return obj.userData?.elementType === 'BimLevel';
    }

    /**
     * Returns true if this object represents a BimGrid (structural grid line).
     * Grid elements should be excluded from camera framing bounds.
     */
    static isBimGridElement(obj: THREE.Object3D): boolean {
        return obj.userData?.elementType === 'BimGrid';
    }

    /**
     * Returns true if this object should be excluded from scene bounds computation.
     * Consolidates all exclusion checks into one call.
     */
    static shouldExcludeFromBounds(
        obj: THREE.Object3D,
        gridRoot: THREE.Object3D | null | undefined
    ): boolean {
        return SceneObjectClassifier.isGridObject(obj, gridRoot) ||
               SceneObjectClassifier.isHelperObject(obj) ||
               SceneObjectClassifier.isSceneInfrastructure(obj) ||   // §CAM-CATCHER-NOT-MODEL (L-931)
               SceneObjectClassifier.isPreviewObject(obj) ||
               SceneObjectClassifier.isBimLevelObject(obj) ||
               SceneObjectClassifier.isBimGridElement(obj);
    }
}
