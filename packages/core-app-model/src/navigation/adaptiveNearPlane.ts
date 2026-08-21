/**
 * adaptiveNearPlane — §CAM-NEAR-SCALES-WITH-STANDOFF (L-2070) — C04 rendering / camera.
 *
 * ## The defect this exists to remove
 *
 * FOUNDER REPORT (2026-08-21, production `071a7b2c`, WebGL):
 *
 *   *"Lately when I zoom in — sometimes too much (not even to a wall) — the window
 *    disappears."*
 *
 * His screenshot: the camera is close to a façade, the **wall surface is a flat
 * white/grey field**, two window-shaped rectangles float in it, and the green ground
 * plane shows through them.
 *
 * That picture is the exact signature of NEAR-PLANE CLIPPING against a DOUBLE-SIDED
 * wall, and the double-sidedness is what makes it read as "the wall turned into a flat
 * field" rather than "a hole":
 *
 *   - PRYZM wall materials are `THREE.DoubleSide` (`WallFragmentBuilder` sets it in five
 *     places). A wall is therefore a SOLID with two drawable faces.
 *   - Put the eye 5 cm from one face of a 0.3 m wall. The near face sits at view-depth
 *     0.05 m, the far face at 0.35 m.
 *   - With `near = 0.1` the near face is CLIPPED and the far face still draws — a flat,
 *     evenly-lit field exactly where the wall was.
 *   - The window OPENING is a hole through both faces, so it shows whatever is beyond:
 *     the ground plane. The window's own glass/frame meshes sit at mid-thickness
 *     (~0.15 m), beyond `near`, so they survive as floating rectangles.
 *
 * ## Why `near = 0.1` was not enough, even after L-747
 *
 * L-747 (`MAX_BIM_NEAR_M`) capped `near` at 0.1 m to stop a globe-scale `far` producing a
 * 14 m near plane. That fixed the catastrophic case and left the residual one: **0.1 m is
 * still a clip plane, and nothing stops the eye getting closer than 0.1 m to a surface.**
 *
 * `BimWorld` arms `controls.minDistance = 0.2`, but camera-controls' `minDistance` is the
 * distance from the eye to the ORBIT TARGET — not to geometry. Three ordinary things put
 * the eye inside 0.1 m of a wall while that constraint is fully satisfied:
 *
 *   1. **Orbiting a target inside a room.** At `minDistance = 0.2` the eye sweeps a 0.2 m
 *      sphere around a point in mid-air; that sphere passes through the walls, the floor
 *      and the ceiling of any real room.
 *   2. **Dollying toward a distant target.** The target is the building centre 15 m away;
 *      the eye travels toward it and crosses the façade en route. `minDistance` is
 *      measured against the target, so it never fires.
 *   3. **Level explode.** Geometry moves 10 m per level while the camera stands still, so
 *      a surface can arrive at the eye without any navigation at all.
 *
 * ## The policy
 *
 * `near` scales with the camera's STANDOFF from the model — the distance from the eye to
 * the model's world AABB, which is **0 whenever the eye is inside the building**:
 *
 *   - standoff 0 (inside / touching)  → `NEAR_INSPECT_M` (1 cm)
 *   - standoff ≥ `NEAR_RAMP_STANDOFF_M` (20 m) → `MAX_BIM_NEAR_M` (10 cm) — **exactly
 *     today's value**, so nothing about aerial / site-scale viewing changes.
 *   - linear in between.
 *
 * ⚠ **Standoff, not target distance.** Keying on `controls.distance` would NOT fix the
 * founder's case: dollying toward a target 15 m away leaves `distance ≈ 15` at the moment
 * the eye is 5 cm from the façade, so a target-keyed rule would still clip. This is the
 * one substitution that looks equivalent and is not — do not make it.
 *
 * ## The cost, stated honestly
 *
 * A smaller `near` is a WORSE depth-buffer distribution. At `near = 0.01` and `far = 2000`
 * the ratio is 2e5 (today: 2e4), i.e. ~10× coarser depth quantisation on distant coplanar
 * surfaces — and only while the eye is within 20 m of the model, which is precisely when
 * the distant geometry is least important. `MAX_DEPTH_RATIO` bounds it so a large `far`
 * cannot compound the loss. C04's own doctrine, written at L-747, decides the trade:
 * *"a precision heuristic may never clip the model … clipping is a loss of the geometry
 * the user is actually looking at. We take the artefact."*
 *
 * ## What this module does NOT do — read before trusting it
 *
 * It does not GUARANTEE freedom from clipping. Nothing here constrains the eye's distance
 * to geometry; it only makes the clip plane 10× smaller, so the window in which a surface
 * vanishes shrinks from "within 10 cm" to "within 1 cm". A guarantee needs camera–geometry
 * collision (a depth probe or a swept query per frame), which is a separate piece of work.
 * ⛔ Do not describe this as "clipping is fixed".
 *
 * P3: this module never schedules a frame. `installAdaptiveNearPlane` binds to
 * camera-controls events that the existing frame scheduler already drives.
 *
 * P8: `installAdaptiveNearPlane` and `applyAdaptiveNearPlane` emit spans.
 * `nearForStandoff` deliberately does NOT — it is called on every camera-controls
 * `update`, i.e. up to 60×/s during a drag, and a span per call would make the tracer the
 * dominant cost of navigating. The two callers that CAN emit one do.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import { MAX_BIM_NEAR_M } from './cameraFraming.js';

const TRACER = trace.getTracer('@pryzm/core-app-model.adaptive-near-plane', '0.1.0');

/**
 * The smallest near plane a BIM camera may have — 1 cm.
 *
 * Chosen against the thing being inspected rather than against the depth buffer: a door
 * handle, a window reveal and a skirting board are all things a user leans in on, and a
 * 1 cm clip plane keeps every one of them drawable at a realistic inspection distance.
 * Below ~1 mm the depth distribution degrades fast enough to trade one visible artefact
 * for another, which is why this is a floor and not "as small as possible".
 */
export const NEAR_INSPECT_M = 0.01;

/**
 * The standoff at which `near` has ramped all the way back to `MAX_BIM_NEAR_M`.
 *
 * 20 m is a little over the width of a typical building footprint, so a user who has
 * pulled back far enough to see a whole building gets exactly the depth range PRYZM has
 * always used, and the reduced range is confined to close inspection.
 */
export const NEAR_RAMP_STANDOFF_M = 20;

/**
 * Bound on `far / near`.
 *
 * The floor above is stated in metres, but the depth buffer cares about the RATIO. A
 * scene whose `far` was widened to frame a distant import must not silently multiply the
 * precision loss. ⚠ This guard is SUBORDINATE to the clip guard: it may raise `near`, but
 * never above `MAX_BIM_NEAR_M`, because L-747 established that a precision heuristic may
 * not be allowed to clip the model.
 */
export const MAX_DEPTH_RATIO = 2e5;

/** Relative change below which the projection matrix is not rebuilt. */
const NEAR_EPSILON_REL = 1e-3;

/**
 * The near plane for a given standoff from the model, in metres.
 *
 * @param standoffM  Distance from the eye to the model's world AABB; `0` when the eye is
 *                   inside the model. Negative and non-finite inputs are treated as `0`
 *                   (the safest end of the ramp) rather than rejected.
 * @param farM       The camera's current far plane, used only by the ratio bound. Omit or
 *                   pass a non-finite value to skip that bound.
 * @returns A near plane in `[NEAR_INSPECT_M, MAX_BIM_NEAR_M]`.
 */
export function nearForStandoff(standoffM: number, farM?: number): number {
    const standoff = Number.isFinite(standoffM) && standoffM > 0 ? standoffM : 0;

    const t = Math.min(standoff / NEAR_RAMP_STANDOFF_M, 1);
    const ramped = NEAR_INSPECT_M + (MAX_BIM_NEAR_M - NEAR_INSPECT_M) * t;

    // Ratio bound — may only RAISE near, and never past the L-747 ceiling.
    const ratioFloor = Number.isFinite(farM) && (farM as number) > 0
        ? (farM as number) / MAX_DEPTH_RATIO
        : 0;

    return Math.min(MAX_BIM_NEAR_M, Math.max(NEAR_INSPECT_M, ramped, ratioFloor));
}

/**
 * Standoff from a camera position to a model AABB, in metres. `0` when inside.
 *
 * Returns `null` when the bounds carry no geometry — the caller must then leave the
 * camera alone rather than guess, because an empty scene gives no evidence about how
 * close anything is.
 */
export function standoffFromBounds(
    bounds: THREE.Box3 | null | undefined,
    eye: THREE.Vector3,
): number | null {
    if (!bounds || bounds.isEmpty()) return null;
    const d = bounds.distanceToPoint(eye);
    return Number.isFinite(d) ? d : null;
}

/**
 * Apply the standoff-scaled near plane to a perspective camera.
 *
 * ORTHOGRAPHIC CAMERAS ARE LEFT UNTOUCHED. Plan / elevation / section views run an
 * orthographic projection whose depth range is `near = -1000, far = 1000` (BimWorld's
 * `projection.onChanged` handler) — a signed range that encodes "everything in front of
 * and behind the camera", not a metric standoff. Feeding this policy into it would move
 * the near plane from -1000 to +0.01 and clip away the entire drawing.
 *
 * @returns the near plane now on the camera, or `null` when nothing was applied
 *          (non-perspective camera, no camera, or bounds with no geometry).
 */
export function applyAdaptiveNearPlane(
    camera: THREE.Camera | null | undefined,
    bounds: THREE.Box3 | null | undefined,
): number | null {
    const persp = camera as THREE.PerspectiveCamera | null | undefined;
    if (!persp?.isPerspectiveCamera) return null;

    const eye = persp.getWorldPosition(new THREE.Vector3());
    const standoff = standoffFromBounds(bounds, eye);
    if (standoff === null) return null;

    const next = nearForStandoff(standoff, persp.far);
    const current = persp.near;

    if (Number.isFinite(current) && Math.abs(next - current) <= Math.abs(next) * NEAR_EPSILON_REL) {
        // Unchanged within tolerance — do not rebuild the projection matrix. This runs on
        // every camera-controls `update`, so the no-op path is the common one.
        return current;
    }

    const span = TRACER.startSpan('pryzm.camera.apply_adaptive_near_plane');
    try {
        persp.near = next;
        persp.updateProjectionMatrix();
        span.setAttribute('pryzm.camera.standoff_m', standoff);
        span.setAttribute('pryzm.camera.near_m', next);
        span.setAttribute('pryzm.camera.far_m', persp.far);
        span.setStatus({ code: SpanStatusCode.OK });
        return next;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        return null;
    } finally {
        span.end();
    }
}

/** The camera-controls event surface this binding needs. Structural, so tests can fake it. */
export interface AdaptiveNearControlsLike {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
}

/** Handle returned by {@link installAdaptiveNearPlane}. */
export interface AdaptiveNearPlaneBinding {
    /** Recompute and apply immediately. Returns the applied near, or `null`. */
    refresh(): number | null;
    /** Detach every listener. Idempotent. */
    dispose(): void;
}

/**
 * Camera-controls events this binds to.
 *
 * `update` is the workhorse — camera-controls fires it on every frame in which the camera
 * actually changed, including the damping tail and programmatic `setLookAt`. The other
 * three cover the boundaries: `wake` when motion begins, `rest`/`sleep` so the final pose
 * is adapted even if the last `update` was coalesced away.
 *
 * P3: none of these schedules a frame. They are emitted from the existing loop.
 */
const BOUND_EVENTS = ['update', 'wake', 'rest', 'sleep'] as const;

/**
 * Bind the standoff-scaled near plane to a live camera + camera-controls pair.
 *
 * `getCamera` is a THUNK, not a camera: OBC's `OrthoPerspectiveCamera` REPLACES
 * `world.camera.three` with a new object when the projection changes (initScene:3745), so
 * a captured reference goes stale on the first plan-view switch and this would silently
 * adapt a camera nobody renders.
 */
export function installAdaptiveNearPlane(opts: {
    getCamera: () => THREE.Camera | null | undefined;
    getModelBounds: () => THREE.Box3 | null | undefined;
    controls: AdaptiveNearControlsLike;
}): AdaptiveNearPlaneBinding {
    const span = TRACER.startSpan('pryzm.camera.install_adaptive_near_plane');
    let disposed = false;

    const refresh = (): number | null => {
        if (disposed) return null;
        try {
            return applyAdaptiveNearPlane(opts.getCamera(), opts.getModelBounds());
        } catch {
            // A camera policy may never break navigation. Failing to shrink the near
            // plane costs a clipped wall; throwing here costs the whole control loop.
            return null;
        }
    };

    const listener = (): void => { refresh(); };

    try {
        for (const evt of BOUND_EVENTS) opts.controls.addEventListener(evt, listener);
        refresh();
        span.setAttribute('pryzm.camera.adaptive_near_events', BOUND_EVENTS.length);
        span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
    } finally {
        span.end();
    }

    return {
        refresh,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            for (const evt of BOUND_EVENTS) {
                try { opts.controls.removeEventListener(evt, listener); } catch { /* detached */ }
            }
        },
    };
}
