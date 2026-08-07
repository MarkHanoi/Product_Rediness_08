/**
 * cameraFraming — §CAM-FRAME-INVARIANT (L-742) — C04 rendering / camera framing.
 *
 * ## Why this module exists
 *
 * PRYZM had TWO independent, disagreeing framing policies:
 *
 *   1. `ViewController._ensureGeometryFramed()` — heuristic "is the camera roughly
 *      aimed at the scene centre?" test, then a fit at `maxDim * 2` metres, with the
 *      perspective camera's `far` plane left hard-wired at 2000 m. On a scene whose
 *      bounds exceed ~1 km (an IFC import whose storeys land at ±800 m, a site/context
 *      mesh, a stray far-away element) the computed fit pose sits BEYOND the far plane
 *      and the viewport renders EMPTY — the founder's "3D view always comes white".
 *   2. `initViewSetup.zoomToAll()` (the Camera → Fit All button) — a type-filtered
 *      bounds pass with the distance clamped to [8, 80] m, which happens to keep the
 *      camera inside the far plane. That is exactly why Fit All "makes the geometry
 *      come back" while opening the view does not.
 *
 * Two policies that disagree is the defect. This module is the ONE framing authority:
 * a single pose computation and a single "is the model actually on screen?" predicate,
 * both pure and unit-testable, both used by the activation path AND by Fit All.
 *
 * ## The invariant (C04 §Camera framing)
 *
 *   Activating a 3D view MUST leave the model on screen. A remembered camera is
 *   restored ONLY if the scene bounds still INTERSECT its frustum (near/far included);
 *   otherwise the view is fitted.
 *
 * Intersection — not containment — is the deliberate product call: a user who zoomed
 * into a door detail still intersects the scene bounds, so their framing is preserved
 * exactly. A camera left over from another scene, another project, a plan-view pose, or
 * one pushed past the far plane intersects nothing, and is replaced by a fit.
 *
 * P8: every exported function emits a span.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/core-app-model.camera-framing', '0.1.0');

/** Default view direction for a fitted 3D pose (matches the historical Fit All look angle). */
const DEFAULT_FIT_DIRECTION = new THREE.Vector3(1, 0.65, 1).normalize();

/** Slack applied to the fit distance so the model does not touch the viewport edge. */
const FIT_MARGIN = 1.15;

/** Smallest bounding radius we will frame — stops a single point collapsing the camera. */
const MIN_FIT_RADIUS_M = 4;

/** The historical perspective far plane. A fit never SHRINKS the depth range below it. */
const BASELINE_FAR_M = 2000;

/* ─── §CAM-BIM-SCALE-BOUNDS (L-744) — the guard L-378 was missing ────────────
 *
 * FOUNDER EVIDENCE (2026-08-07, brand-new project, walls at the origin):
 *
 *   [MultiViewCameraManager] saveSlot("perspective") — position is globe/ECEF-scale
 *     (-2465677, 1173796, -12121197); skipping save (L-378)
 *   _activate3DView — perspective slot MISS
 *   [ViewCameraStateStore] restore("3D") — MISS (0 states cached, keys: [])
 *   _activate3DView — computing default framing
 *   _activate3DView — controls.setLookAt() START (target=0.0,0.0,0.0, dist=6542305.9)
 *   _activate3DView — §CAM-FRAME-INVARIANT auto-framed …; dist=6515673.6m
 *
 * 6,542 km — the Earth's radius — to look at a 5 m wall. The walls DID render; they
 * were sub-pixel.
 *
 * ## Why L-378 could not stop this
 *
 * `L-378` guards the camera pose on SAVE and on RESTORE, and it worked perfectly:
 * it refused to store the ECEF pose. But refusing to save means the slot is EMPTY,
 * and an empty slot sends activation down the DEFAULT-FRAMING path — which derives
 * its distance from SCENE BOUNDS. Nothing guarded the bounds. So L-378 rejected a
 * globe-scale pose and the fallback promptly computed an equivalent one from a
 * different input. **A guard on the stored value is not a guard on the computed
 * value.**
 *
 * ## Why the fix belongs HERE and not in `computeFitPose`
 *
 * `computeFitPose` is deliberately HONEST — it never clamps or trims outliers,
 * because a fit that silently shows something other than what it was asked to frame
 * is the very defect this module exists to remove. Its contract says: *"Callers that
 * want a subset framed must narrow the BOUNDS they pass in, never the pose."*
 *
 * This is that narrowing, made shared and testable rather than re-improvised per
 * call site. Globe-scale bounds are not an "outlier" the user should be shown — they
 * are CONTAMINATION from the Cesium/ECEF world leaking into a local BIM scene, and
 * the honest answer is that they are not part of the model at all.
 */

/**
 * §L-378 / §CAM-BIM-SCALE-BOUNDS — distance from the world origin (metres) beyond
 * which a position is ECEF / globe-scale rather than BIM-editor-scale.
 *
 * The Cesium / Forma 3D-site view drives the SHARED OBC THREE camera to ECEF
 * coordinates (Earth radius ≈ 6.37M units; observed return poses sit ~12.5M out). A
 * local BIM scene never exceeds a few km, so 1,000 km is a safe, unambiguous ceiling:
 * every legitimate BIM camera and every legitimate BIM bounding box passes, and every
 * globe-scale value is rejected.
 *
 * Single source of truth: `MultiViewCameraManager` (save/restore guard, L-378) and
 * the framing authority (bounds guard, L-744) MUST agree, or one will admit exactly
 * what the other rejects — which is how L-744 happened.
 */
export const GLOBE_SCALE_LIMIT_M = 1_000_000;

/**
 * True when `(x, y, z)` is an ECEF / globe-scale position — see {@link GLOBE_SCALE_LIMIT_M}.
 *
 * P8: emits `pryzm.camera.is_globe_scale_position`.
 */
export function isGlobeScalePosition(x: number, y: number, z: number): boolean {
    const span = TRACER.startSpan('pryzm.camera.is_globe_scale_position');
    try {
        const globe = !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)
            || Math.abs(x) > GLOBE_SCALE_LIMIT_M
            || Math.abs(y) > GLOBE_SCALE_LIMIT_M
            || Math.abs(z) > GLOBE_SCALE_LIMIT_M;
        span.setAttribute('pryzm.camera.globe_scale', globe);
        span.setStatus({ code: SpanStatusCode.OK });
        return globe;
    } finally {
        span.end();
    }
}

/**
 * §CAM-BIM-SCALE-BOUNDS (L-744) — true when `bounds` cannot describe a local BIM
 * model: either a corner sits at ECEF distance from the origin, or the box SPANS a
 * globe-scale extent.
 *
 * Both tests are needed and they catch different contamination:
 *   • a corner test catches a single ECEF-positioned object dragging the box out;
 *   • an EXTENT test catches the founder's case, where the box straddles the origin
 *     (`target=0.0,0.0,0.0`) and every corner test on the CENTRE would pass while the
 *     box is still 3,271 km across.
 *
 * Empty bounds are NOT globe-scale — they are simply empty, which callers already
 * handle. P8: emits `pryzm.camera.is_globe_scale_bounds`.
 */
export function isGlobeScaleBounds(bounds: THREE.Box3): boolean {
    const span = TRACER.startSpan('pryzm.camera.is_globe_scale_bounds');
    try {
        if (bounds.isEmpty()) {
            span.setAttribute('pryzm.camera.bounds_empty', true);
            span.setStatus({ code: SpanStatusCode.OK });
            return false;
        }
        const { min, max } = bounds;
        const cornerOut =
            isGlobeScalePosition(min.x, min.y, min.z) || isGlobeScalePosition(max.x, max.y, max.z);
        // Extent test — the founder's exact shape: centred on the origin, 3,271 km wide.
        const size = bounds.getSize(new THREE.Vector3());
        const extentOut =
            !Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)
            || Math.max(size.x, size.y, size.z) > GLOBE_SCALE_LIMIT_M;

        const globe = cornerOut || extentOut;
        span.setAttribute('pryzm.camera.globe_scale_corner', cornerOut);
        span.setAttribute('pryzm.camera.globe_scale_extent', extentOut);
        span.setStatus({ code: SpanStatusCode.OK });
        return globe;
    } finally {
        span.end();
    }
}

/** A fitted pose: where to put the camera and the depth range that keeps it rendering. */
export interface FitPose {
    /** World-space camera position. */
    position: THREE.Vector3;
    /** World-space look-at target (the bounds centre). */
    target: THREE.Vector3;
    /** Distance from `position` to `target`. */
    distance: number;
    /** Near plane that MUST be applied with this pose. */
    near: number;
    /**
     * Far plane that MUST be applied with this pose.
     *
     * This is the field that fixes the white viewport: an honest fit of a large or
     * outlier-bearing scene puts the camera further out than the default 2000 m far
     * plane, and every fragment is then depth-clipped away.
     */
    far: number;
}

export interface FitPoseOptions {
    /** Vertical field of view in DEGREES (THREE.PerspectiveCamera.fov). Default 60. */
    fovDeg?: number;
    /** Viewport aspect (width / height). Default 1. Narrow panes need a longer pull-back. */
    aspect?: number;
    /** Unit view direction from target towards the camera. Default (1, 0.65, 1) normalised. */
    direction?: THREE.Vector3;
}

/**
 * Compute the camera pose that frames `bounds` in a perspective camera, together with
 * the near/far range that pose requires.
 *
 * ## Extreme / outlier bounds
 *
 * The fit is HONEST: it never clamps, drops, or trims outliers. If an import places a
 * storey 6 km up, the fit frames a 6 km scene and widens `far` to match, so the user
 * SEES the outlier and can act on it. Silently clamping would reproduce the exact class
 * of defect this module exists to remove — a camera that claims to frame the model while
 * showing something else. Callers that want a subset framed must narrow the BOUNDS they
 * pass in (as Fit All does by filtering to BIM element types), never the pose.
 *
 * @returns `null` when `bounds` is empty or non-finite — callers must leave the camera alone.
 *
 * P8: emits `pryzm.camera.compute_fit_pose`.
 */
export function computeFitPose(bounds: THREE.Box3, options: FitPoseOptions = {}): FitPose | null {
    const span = TRACER.startSpan('pryzm.camera.compute_fit_pose');
    try {
        if (bounds.isEmpty()) {
            span.setAttribute('pryzm.camera.bounds_empty', true);
            return null;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        if (![center.x, center.y, center.z, size.x, size.y, size.z].every(Number.isFinite)) {
            span.setAttribute('pryzm.camera.bounds_non_finite', true);
            return null;
        }

        const radius = Math.max(size.length() / 2, MIN_FIT_RADIUS_M);

        // Half-angle that actually constrains the fit: the narrower of the vertical and
        // horizontal half-FOVs. On a tall, narrow split pane the horizontal one wins.
        const fovDeg = options.fovDeg ?? 60;
        const aspect = options.aspect && options.aspect > 0 ? options.aspect : 1;
        const halfV = THREE.MathUtils.degToRad(fovDeg) / 2;
        const halfH = Math.atan(Math.tan(halfV) * aspect);
        const halfAngle = Math.max(Math.min(halfV, halfH), 0.05);

        const distance = (radius / Math.sin(halfAngle)) * FIT_MARGIN;

        const dir = (options.direction ?? DEFAULT_FIT_DIRECTION).clone().normalize();
        const position = center.clone().addScaledVector(dir, distance);

        // Depth range that keeps the whole model inside the frustum. `far` must clear the
        // BACK of the bounding sphere, not just its centre.
        const far = Math.max(BASELINE_FAR_M, (distance + radius) * 1.5);
        const near = Math.max(0.1, far / 1e6);

        span.setAttribute('pryzm.camera.fit_distance_m', distance);
        span.setAttribute('pryzm.camera.fit_radius_m', radius);
        span.setAttribute('pryzm.camera.fit_far_m', far);
        span.setStatus({ code: SpanStatusCode.OK });
        return { position, target: center, distance, near, far };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        return null;
    } finally {
        span.end();
    }
}

/** Inputs to the departing-view camera-persistence decision. */
export interface DepartingCameraContext {
    /**
     * True when the departing view was rendered by the Canvas2D plan-view pipeline
     * (PlanViewManager) rather than by the shared OBC 3D camera.
     */
    departingViewIsCanvas2D: boolean;
}

/**
 * §CAM-SLOT-CANVAS2D (L-742) — may the departing view's OBC camera pose be persisted?
 *
 * A Canvas2D plan / elevation / section view has no OBC camera. Its viewpoint is the 2D
 * canvas's own pan/zoom; the shared OBC camera is never touched while it is active. Saving
 * that camera on departure therefore records the pose of whatever view came BEFORE — the
 * founder's log shows one identical position written under five consecutive different view
 * keys.
 *
 * It is worse than useless. `MultiViewCameraManager.slotForViewMode()` recognises only
 * 'Top' / 'FloorPlan' / 'Ceiling' / 'ceiling-plan' / 'Section' / 'Elevation' and falls
 * through to `'perspective'` for anything else — and a per-level Canvas2D view's mode
 * string is its ViewDefinition id ('level-ifc-159'). So every departure from a Canvas2D
 * plan view wrote a stale, often ORTHOGRAPHIC-PLAN pose into the PERSPECTIVE slot,
 * destroying the user's real 3D camera. That is why the 3D view was unframed "even if last
 * time it was opened it was framed".
 *
 * P8: emits `pryzm.camera.should_persist_departing`.
 */
export function shouldPersistDepartingCamera(ctx: DepartingCameraContext): boolean {
    const span = TRACER.startSpan('pryzm.camera.should_persist_departing');
    try {
        const persist = !ctx.departingViewIsCanvas2D;
        span.setAttribute('pryzm.camera.departing_canvas2d', ctx.departingViewIsCanvas2D);
        span.setAttribute('pryzm.camera.persist', persist);
        span.setStatus({ code: SpanStatusCode.OK });
        return persist;
    } finally {
        span.end();
    }
}

/**
 * True when `bounds` intersects `camera`'s view frustum — i.e. at least part of the model
 * is actually on screen, INCLUDING the near/far depth test.
 *
 * This is the predicate behind the framing invariant. It is deliberately an INTERSECTION
 * test, not a containment test:
 *
 *   - a user zoomed into a detail intersects the bounds → their camera is preserved;
 *   - a camera restored from another scene, a plan-view pose replayed on a perspective
 *     camera, or a pose pushed past the far plane intersects nothing → the caller fits.
 *
 * Returns `false` for empty bounds (nothing to see) so callers treat "nothing framed" the
 * same way they treat "nothing on screen" — but note that a caller with an EMPTY scene
 * should skip framing altogether rather than fit to nothing.
 *
 * P8: emits `pryzm.camera.bounds_visible`.
 */
export function boundsVisibleToCamera(camera: THREE.Camera, bounds: THREE.Box3): boolean {
    const span = TRACER.startSpan('pryzm.camera.bounds_visible');
    try {
        if (bounds.isEmpty()) {
            span.setAttribute('pryzm.camera.bounds_empty', true);
            return false;
        }

        camera.updateMatrixWorld();
        const projScreen = new THREE.Matrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse,
        );
        const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreen);
        const visible = frustum.intersectsBox(bounds);

        span.setAttribute('pryzm.camera.bounds_visible', visible);
        span.setStatus({ code: SpanStatusCode.OK });
        return visible;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        // Fail OPEN (report "not visible") so the caller fits: a camera we cannot verify
        // is exactly the camera that produced the white viewport.
        return false;
    } finally {
        span.end();
    }
}

/**
 * Minimum share of the viewport the model must cover to count as FRAMED.
 *
 * Frustum intersection alone is not enough. A restored plan-view pose parked 900 m above
 * the building technically contains it — as a sub-pixel speck. The founder's report is
 * explicit that this is a failure: *"It is NOT FOCUSED or ZOOMED on the elements."*
 * 8 % of the viewport's larger axis is well below any deliberate framing and well above
 * "a dot", so it separates the two without second-guessing the user.
 */
export const MIN_FRAMED_SCREEN_FRACTION = 0.08;

/**
 * §CAM-FRAME-INVARIANT (L-742) — the ACTIVATION predicate: is the model both on screen and
 * big enough to be the subject of the view?
 *
 * Two conditions, in order:
 *   1. the bounds intersect the frustum (`boundsVisibleToCamera`, near/far included);
 *   2. the bounds project to at least `minScreenFraction` of the viewport's larger axis.
 *
 * (2) is what makes this a FRAMING test rather than a visibility test, and it is why a
 * deliberate zoom-in survives: nose-in on a door projects the scene bounds far LARGER than
 * the viewport, which passes trivially. Only cameras that show the model as a speck — or
 * not at all — are replaced by a fit.
 *
 * When the camera sits inside (or straddles) the bounds, corners fall behind the image
 * plane; that is as framed as it gets, so it returns true without projecting.
 *
 * P8: emits `pryzm.camera.bounds_framed`.
 */
export function boundsFramedByCamera(
    camera: THREE.Camera,
    bounds: THREE.Box3,
    minScreenFraction: number = MIN_FRAMED_SCREEN_FRACTION,
): boolean {
    const span = TRACER.startSpan('pryzm.camera.bounds_framed');
    try {
        if (!boundsVisibleToCamera(camera, bounds)) {
            span.setAttribute('pryzm.camera.framed', false);
            span.setAttribute('pryzm.camera.reason', 'not-in-frustum');
            return false;
        }

        const min = bounds.min;
        const max = bounds.max;
        const v = new THREE.Vector3();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < 8; i++) {
            v.set(
                (i & 1) ? max.x : min.x,
                (i & 2) ? max.y : min.y,
                (i & 4) ? max.z : min.z,
            );
            // View space: negative z is in front of the camera.
            v.applyMatrix4(camera.matrixWorldInverse);
            if (v.z >= 0) {
                // A corner is at or behind the image plane — the camera is inside/among the
                // model. Nothing is more "framed" than that.
                span.setAttribute('pryzm.camera.framed', true);
                span.setAttribute('pryzm.camera.reason', 'camera-inside-bounds');
                return true;
            }
            v.applyMatrix4(camera.projectionMatrix);   // applyMatrix4 divides by w
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
        }

        // NDC spans 2 units per axis; clamp so off-screen overhang does not inflate the
        // measurement beyond "fills the viewport".
        const spanX = (Math.min(maxX, 1) - Math.max(minX, -1)) / 2;
        const spanY = (Math.min(maxY, 1) - Math.max(minY, -1)) / 2;
        const coverage = Math.max(spanX, spanY);
        const framed = coverage >= minScreenFraction;

        span.setAttribute('pryzm.camera.screen_coverage', coverage);
        span.setAttribute('pryzm.camera.framed', framed);
        span.setStatus({ code: SpanStatusCode.OK });
        return framed;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        return false;   // fail towards fitting — see boundsVisibleToCamera
    } finally {
        span.end();
    }
}
