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

/**
 * §CAM-NEAR-NEVER-CUTS (L-747) — the largest near plane a BIM camera may ever have.
 *
 * FOUNDER EVIDENCE (2026-08-07): *"BEFORE I could get close to elements and they would
 * NEVER sectionate. NOW it creates a camera section which I might not want, because as I
 * get closer to the element it gets sectioned."* Screenshots show walls sliced by a clean
 * flat cut that tracks the viewpoint.
 *
 * That is not a section feature — `CutFill` was `enabled=false` and sets
 * `renderer.clippingPlanes = []` when off. It is NEAR-PLANE CLIPPING. The founder's own
 * activation log printed the value:
 *
 *   §CAM-FRAME-INVARIANT auto-framed …; dist=6515673.6m near=14.02 far=14022863
 *
 * `near = 14.02` metres. Everything within 14 m of the camera is clipped away, and the
 * closer you walk to a wall the more of it disappears — exactly the reported symptom.
 *
 * ## Why the old rule produced it
 *
 * `near = max(0.1, far / 1e6)` is DEPTH-PRECISION reasoning: keep the near/far ratio
 * bounded so the depth buffer stays usable. Sound in isolation, and it only bites when
 * `far` is enormous — which it was, because the globe-scale bounds contamination
 * (§CAM-BIM-SCALE-BOUNDS, L-744) inflated `far` to 14,000 km. So this is the SAME
 * contamination surfacing in a second consumer.
 *
 * ## Why capping is right, and what it costs
 *
 * A precision heuristic must not be allowed to clip the model. In a BIM editor the user
 * can walk up to any surface, and geometry vanishing at arm's length is never an
 * acceptable outcome of a depth-buffer trade — the whole point of the tool is inspecting
 * things closely.
 *
 * The cost is honest and bounded: with `near` pinned at 0.1 m, a very large `far` gives a
 * high near/far ratio and therefore weaker depth precision (possible z-fighting on
 * distant coplanar surfaces). That is a rendering-quality artefact on far-away geometry;
 * clipping is a loss of the geometry the user is actually looking at. We take the
 * artefact. In practice the trade is nearly free: with L-744 rejecting globe-scale
 * bounds, a legitimate scene — including the deliberately-supported 6 km IFC outlier —
 * yields `far` under ~30 km and a ratio around 3e5, which is fine.
 *
 * 0.1 m matches `BimWorld`'s historical default, i.e. the behaviour the founder is
 * correctly describing as "before".
 */
export const MAX_BIM_NEAR_M = 0.1;

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

/** A point in the scene-XZ ground plane, metres (C12 LTP-ENU) — the parcel-ring vertex shape. */
export interface GroundPointXZ {
    readonly x: number;
    readonly z: number;
}

/**
 * §CAM-FRAME-SITE-WHEN-NO-MODEL (L-748) — bounds for a committed SITE RING, so the 3D
 * view can frame the site when there is no BIM geometry yet.
 *
 * ## The gap this closes
 *
 * FOUNDER: *"THE 3D VIEW STILL IS NOT DOING THE CORRECT ZOOM AT START UP. I NEED TO CLICK
 * HOME — THEN I HAVE THE 3D BOUNDARY CORRECT."*
 *
 * On a fresh project the user has committed a parcel boundary but drawn no walls. Every
 * guard behaves correctly and the outcome is still wrong:
 *   • both camera caches legitimately MISS (nothing saved yet);
 *   • scene bounds are legitimately REJECTED (globe-scale contamination, L-744);
 *   • `zoomToFit` legitimately REFUSES ("no BIM-scale geometry to frame").
 * …so framing falls to a hard-coded 50 m about the ORIGIN — and the parcel sits ~13 m off
 * the origin, so the site is not what you are looking at.
 *
 * The precedence was **model → constant**. It must be **model → SITE → constant**: a
 * committed boundary IS the site, and ADR-0300 already ranks it as the best evidence of
 * site extent. The constant remains the honest answer when there is neither.
 *
 * ## Why this takes a LOCAL ring and not `resolveSiteFramingExtent`
 *
 * `siteFramingExtent.ts` is the shared authority for the GEO extent (WGS84 degrees +
 * camera ALTITUDE) that the 2D MapLibre and 3D Cesium panes both frame from. It is the
 * right authority for those two, and the wrong one here: this camera lives in scene-XZ
 * metres, and the parcel ring is ALREADY in that frame (`Parcel.boundary.polygon`,
 * `Pt{x,z}` — C12 LTP-ENU, the same space as walls). Routing a local framing decision
 * through a geodetic extent would add a lossy degrees→metres round trip to reach a number
 * we already hold exactly. One authority per COORDINATE SPACE, not one authority for
 * every camera.
 *
 * @param ring parcel boundary vertices in scene-XZ metres. Needs ≥ 3 to be a polygon.
 * @returns the ring's bounds at ground level, or `null` when the ring cannot describe a
 *          site (too few vertices, non-finite, or globe-scale) — callers must then fall
 *          through to their constant rather than frame something invented.
 *
 * P8: emits `pryzm.camera.bounds_from_site_ring`.
 */
export function boundsFromSiteRing(ring: readonly GroundPointXZ[] | null | undefined): THREE.Box3 | null {
    const span = TRACER.startSpan('pryzm.camera.bounds_from_site_ring');
    try {
        if (!ring || ring.length < 3) {
            span.setAttribute('pryzm.camera.site_ring_vertices', ring?.length ?? 0);
            return null;
        }
        const box = new THREE.Box3();
        for (const p of ring) {
            if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) {
                span.setAttribute('pryzm.camera.site_ring_non_finite', true);
                return null;
            }
            // Ground plane: the ring carries no height and we do not invent one. A flat
            // box still fits correctly — `computeFitPose` floors the radius at
            // MIN_FIT_RADIUS_M and looks down the default (1, 0.65, 1) direction.
            box.expandByPoint(new THREE.Vector3(p.x, 0, p.z));
        }
        if (box.isEmpty()) return null;
        // The same contamination guard the scene-bounds path uses: a ring is site-scale or
        // it is not a site.
        if (isGlobeScaleBounds(box)) {
            span.setAttribute('pryzm.camera.site_ring_globe_scale', true);
            return null;
        }
        const size = box.getSize(new THREE.Vector3());
        span.setAttribute('pryzm.camera.site_ring_vertices', ring.length);
        span.setAttribute('pryzm.camera.site_extent_m', Math.max(size.x, size.z));
        span.setStatus({ code: SpanStatusCode.OK });
        return box;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        return null;
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
        // §CAM-NEAR-NEVER-CUTS (L-747) — a depth-precision heuristic may never clip the
        // model. WAS `Math.max(0.1, far / 1e6)`, which on a 14,000 km far plane produced
        // near = 14.02 m and sliced every wall the user walked up to. See MAX_BIM_NEAR_M.
        const near = Math.min(MAX_BIM_NEAR_M, Math.max(0.1, far / 1e6));

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
