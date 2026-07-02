// §FEAT-PROJECT-TRUE-NORTH (core) — the dual-north rigid transform between the
// PROJECT-NORTH authoring frame and the TRUE-NORTH world/globe frame. HEADLESS:
// no THREE, no DOM, no MapLibre — pure math, sibling to sitePlanOverlayGeometry.ts,
// so every formula below is unit-testable (P2/P4/P5 untouched).
//
// WHY THIS EXISTS  (ADR-0114, composing ADR-0070 + ADR-059)
// ---------------------------------------------------------
// The founder's rule (Revit's "Project North vs True North"):
//   - The uploaded site-plan underlay (PDF/image) defines PROJECT NORTH — its own
//     orthogonal axis. The PRYZM plan view ALWAYS edits in this frame, so walls the
//     user draws parallel to the underlay read as axis-aligned.
//   - The 3D site / globe view places the model at its geolocation, ROTATED to TRUE
//     NORTH so it sits correctly on the earth.
//
// TWO DISTINCT ANGLES — keep them separate in the model (founder reinforcement):
//   1. `underlayRotationRad` — the underlay's INTERACTIVE on-canvas orientation (the
//      move/rotate/scale gizmo). The user rotates the raster to align its features to
//      the plan's orthogonal axis; THAT alignment is what DEFINES project north. It is
//      part of the overlay placement transform and persists with it (Part A).
//   2. `projectNorthRad` = θ — the PROJECT → TRUE-NORTH rotation captured when the
//      underlay is GEOLOCATED on the true-north basemap. This is what the 3D globe
//      applies to sit the model on the earth, and is mirrored onto
//      `SiteLocation.trueNorth` (radians, C12). Distinct from #1 so a later plan-frame
//      re-rotate of the raster never silently moves true north, and vice-versa.
//
// In the plan view the underlay is rendered AXIS-ALIGNED (its rotation removed —
// `overlayInProjectFrame`), because the plan view IS the project frame; the globe
// re-applies θ.
//
// SIGN CONVENTION (identical to sitePlanOverlayGeometry.overlayCornersEastNorth)
// -----------------------------------------------------------------------------
// A clockwise rotation by θ (viewed North-up, East-right) maps a PROJECT-frame offset
// (E,N) about the base into the TRUE-north/world frame by:
//     E' =  E·cosθ + N·sinθ
//     N' = −E·sinθ + N·cosθ
// `projectToTrueNorth` applies exactly this (so the plan-frame geometry rotates onto
// the map/globe the same way the underlay raster does). `trueToProjectNorth` is its
// exact inverse. On θ = 0 BOTH are the identity, so an axis-aligned site is
// byte-identical to today (ADR-0070 byte-identity discipline).

import type { EastNorth, SitePlanOverlayTransform } from './sitePlanOverlayGeometry';

/** Normalise any angle (radians) into the canonical (−π, π] range. */
export function normalizeAngle(rad: number): number {
    if (!Number.isFinite(rad)) return 0;
    let r = rad % (2 * Math.PI);
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r <= -Math.PI) r += 2 * Math.PI;
    return r;
}

/**
 * The project→true-north angle θ captured from an overlay placed + rotated on the
 * TRUE-NORTH basemap. On that surface the underlay's on-canvas rotation IS measured
 * relative to true north, so θ equals the placement's `rotationRad` (normalised).
 * The model still stores this as a DISTINCT field from the underlay's own rotation
 * (see the file header) so the two never alias.
 */
export function deriveProjectNorthAngle(transform: SitePlanOverlayTransform): number {
    return normalizeAngle(transform.rotationRad);
}

/**
 * Rotate a point expressed in the PROJECT-NORTH frame into the TRUE-NORTH / world
 * frame, about `base` (metres East/North — the shared site origin). Clockwise by θ,
 * matching the overlay raster's own placement so plan geometry lands on the globe
 * exactly where the underlay does. θ = 0 ⇒ identity.
 */
export function projectToTrueNorth(pt: EastNorth, thetaRad: number, base: EastNorth): EastNorth {
    const dE = pt.east - base.east;
    const dN = pt.north - base.north;
    const cos = Math.cos(thetaRad);
    const sin = Math.sin(thetaRad);
    return {
        east: base.east + (dE * cos + dN * sin),
        north: base.north + (-dE * sin + dN * cos),
    };
}

/**
 * Inverse of {@link projectToTrueNorth}: map a TRUE-NORTH / world point back into the
 * PROJECT-NORTH authoring frame about `base`. Used to convert a real-world / globe
 * position into the orthogonal plan frame the user edits in. θ = 0 ⇒ identity.
 */
export function trueToProjectNorth(pt: EastNorth, thetaRad: number, base: EastNorth): EastNorth {
    const dE = pt.east - base.east;
    const dN = pt.north - base.north;
    const cos = Math.cos(thetaRad);
    const sin = Math.sin(thetaRad);
    return {
        east: base.east + (dE * cos - dN * sin),
        north: base.north + (dE * sin + dN * cos),
    };
}

/**
 * Rotate a FREE VECTOR (a direction / delta, no base translation) from the
 * project-north frame to true-north. This is what the globe applies to the whole
 * model's local axes so a wall drawn along project-X sits at true-north angle θ.
 */
export function projectVectorToTrueNorth(vec: EastNorth, thetaRad: number): EastNorth {
    const cos = Math.cos(thetaRad);
    const sin = Math.sin(thetaRad);
    return { east: vec.east * cos + vec.north * sin, north: -vec.east * sin + vec.north * cos };
}

/**
 * Re-express an overlay transform in the PROJECT-NORTH frame: the underlay is rendered
 * AXIS-ALIGNED (rotationRad = 0) in the plan view, because the plan view IS the project
 * frame. Centre + scale + size are unchanged. The removed rotation is exactly the θ
 * the globe re-applies. This is the plan-view consumer of the dual-north model.
 */
export function overlayInProjectFrame(transform: SitePlanOverlayTransform): SitePlanOverlayTransform {
    return { ...transform, rotationRad: 0 };
}

/**
 * The geolocation + dual-north record captured when the user presses "Use this
 * placement". Durable, pure data. Keeps the TWO angles distinct (founder rule):
 * the underlay's own on-canvas orientation AND the project→true-north θ.
 */
export interface UnderlayGeolocation {
    /** Geo-anchor the project frame is built about (the LTP-ENU / site origin). */
    readonly originLat: number;
    readonly originLon: number;
    /** Overlay centre in metres East/North of the origin (the project base point). */
    readonly base: EastNorth;
    /** The underlay's INTERACTIVE on-canvas orientation (Part A rotate gizmo), radians. */
    readonly underlayRotationRad: number;
    /** Project → true-north rotation θ (radians, C12) — mirrors SiteLocation.trueNorth. */
    readonly projectNorthRad: number;
    /** Real metres per source pixel — the calibration scale carried for round-trips. */
    readonly metresPerPixel: number;
}

/**
 * Capture the durable {@link UnderlayGeolocation} from a live overlay placement + its
 * geo-anchor. Pure — no side effects. The caller persists it and dispatches θ to the
 * model via `site.updateLocation` (P6 mutation path).
 *
 * `thetaRad` (project→true-north) defaults to the underlay's on-canvas rotation because
 * the current overlay surface IS the true-north basemap (the two coincide at capture),
 * but it is a SEPARATE parameter + field so a future plan-canvas surface can set the
 * underlay orientation and the geolocation θ independently.
 */
export function captureUnderlayGeolocation(
    transform: SitePlanOverlayTransform,
    originLat: number,
    originLon: number,
    thetaRad: number = deriveProjectNorthAngle(transform),
): UnderlayGeolocation {
    return {
        originLat,
        originLon,
        base: { east: transform.centre.east, north: transform.centre.north },
        underlayRotationRad: normalizeAngle(transform.rotationRad),
        projectNorthRad: normalizeAngle(thetaRad),
        metresPerPixel: transform.metresPerPixel,
    };
}
