// §L-430 slice 2b — the SCENE ⇄ ENU frame boundary, headless and testable.
//
// WHY THIS MODULE EXISTS
// ----------------------
// `CesiumViewport.ts` is ~8 000 lines bound to Cesium + the DOM, so the frame mapping that
// lives inside it cannot be unit-tested. That mapping — scene-XZ metres → ENU (east, north)
// — is ALSO the exact place ADR-0115 §Remaining #2 ("globe applies θ to the placed model")
// has to be implemented. Leaving it open-coded in ~15 sites inside an untestable file is how
// a double-rotation defect gets shipped: one site migrated, one missed, and the building
// lands on the globe at the wrong bearing with nothing failing.
//
// So the mapping is extracted here as pure functions, tested directly, and the viewport
// becomes a caller. No THREE, no Cesium, no DOM.
//
// THE TWO FRAMES
// --------------
//   SCENE-XZ  — what the user authors in. Once L-430 lands, this is the PROJECT-NORTH frame:
//               the parcel's dominant edge is axis-aligned so walls are orthogonal.
//   ENU       — East/North/Up metres about the site origin, TRUE north, what the globe and
//               every geospatial consumer expect.
//
// The base mapping (unchanged, project-wide) is `east = x`, `north = −z`. On top of that,
// θ (project→true, clockwise; `SiteLocation.trueNorth`) rotates the authored frame back onto
// the earth. Rotation is about the SITE ORIGIN, which is also the scene origin, so the
// free-vector form is exact — no separate base term is needed.
//
// θ = 0 ⇒ pure identity ⇒ byte-identical to the pre-L-430 behaviour (ADR-0070 byte-identity).
// Every un-rotated site therefore keeps its existing globe placement to the last bit.

// ─────────────────────────────────────────────────────────────────────────────────────────
// MIGRATION INVENTORY — READ BEFORE ENABLING THE θ PRODUCER (L-430 slice 3)
// ─────────────────────────────────────────────────────────────────────────────────────────
// θ is still 0 everywhere in production: nothing derives a non-zero project north yet, so
// every mapping below is currently the identity and the globe is byte-identical to before.
// That is the ONLY reason a partial migration is safe. The moment slice 3 writes a non-zero
// θ to `SiteLocation.trueNorth`, every site still open-coding `east = x, north = −z` places
// its geometry at the OLD bearing while the migrated sites rotate — the building splits
// across two frames. Nothing throws; it just looks subtly wrong.
//
// MIGRATED (routes through `sceneXZToEnu`):
//   • CesiumViewport.renderFormaMassing → the `toCartesian(x, z, up)` closure — the primary
//     path that places the authored building + boundary + envelope on the globe.
//
// NOT YET MIGRATED — each must be converted (or consciously exempted) before slice 3:
//   • `enuToLatLon(east, north)` closure in the terrain-sampling path, and its callers that
//     pass `(p.x, -p.z)` over the boundary ring + the centroid/extent maths beside it.
//   • `sceneRingToMetric` — flips a scene ring to the metric frame for door/opening work.
//   • The boundary/rect centroid helpers returning `{ east: cx, north: -cz }`.
//   • The glTF real-model placement (scene → ENU + the Z_UP_TO_X_UP heading correction) —
//     note this one needs `projectHeadingToTrueBearingDeg` too, not just a position rotate.
//   • The §GLOBE-HEADING-90 scene→ENU heading path.
//   • The GLSL shader that computes `float east = p.x; float north = -p.z;` on the GPU —
//     θ cannot be applied per-fragment cheaply; pass it as a uniform or pre-rotate the
//     vertex data on the CPU.
//
// EXEMPT (already TRUE-north sources — rotating them would DOUBLE-rotate):
//   • Terrain samples, OSM/Overpass context geometry, the sun anchor, and anything else whose
//     east/north came from lat/lon rather than from authored scene coordinates. This is why θ
//     is applied here at the scene boundary and NOT inside `enuToCartesian`, which is shared
//     by both authored and world-sourced inputs.
// ─────────────────────────────────────────────────────────────────────────────────────────

import {
    projectVectorToTrueNorth,
    trueVectorToProjectNorth,
} from '../site/overlay/projectTrueNorth';

/** ENU offset from the site origin, metres. True north. */
export interface EnuEastNorth {
    readonly east: number;
    readonly north: number;
}

/** A point in the authoring scene, metres. Project north (once θ ≠ 0). */
export interface SceneXZ {
    readonly x: number;
    readonly z: number;
}

/**
 * Scene-XZ (PROJECT frame) → ENU east/north (TRUE frame) about the site origin.
 *
 * This is the single frame boundary for placing authored geometry on the globe. Callers that
 * previously wrote `east = x, north = -z` inline must route through here, or their geometry
 * will sit at the wrong bearing once θ ≠ 0 while everything else rotates correctly.
 *
 * @param projectNorthRad θ, radians clockwise (`SiteLocation.trueNorth`). 0 ⇒ identity.
 */
export function sceneXZToEnu(x: number, z: number, projectNorthRad = 0): EnuEastNorth {
    const base = { east: x, north: -z };
    return projectNorthRad === 0 ? base : projectVectorToTrueNorth(base, projectNorthRad);
}

/**
 * Inverse of {@link sceneXZToEnu}: ENU east/north (TRUE frame) → scene-XZ (PROJECT frame).
 * Used where the globe hands a real-world position back to the authoring scene (terrain
 * sampling, context-building centroids, boundary round-trips).
 */
export function enuToSceneXZ(east: number, north: number, projectNorthRad = 0): SceneXZ {
    const p = projectNorthRad === 0
        ? { east, north }
        : trueVectorToProjectNorth({ east, north }, projectNorthRad);
    return { x: p.east, z: -p.north };
}

/**
 * Bearing helper: a heading measured in the PROJECT frame (degrees clockwise from the
 * scene's −Z / "up" axis) expressed as a TRUE-north compass bearing. glTF model headings and
 * the Cesium entity orientations need this — rotating a model's POSITION without its HEADING
 * leaves it correctly placed but wrongly facing, which reads as a subtle modelling error
 * rather than a frame bug, so it is easy to miss.
 */
export function projectHeadingToTrueBearingDeg(headingDeg: number, projectNorthRad = 0): number {
    const deg = headingDeg + (projectNorthRad * 180) / Math.PI;
    return ((deg % 360) + 360) % 360;
}
