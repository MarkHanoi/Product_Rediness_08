// §ENVELOPE-DRAW C5/C6 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE ONE FRAME BOTH SITE ADAPTERS
// CONVERT THROUGH. Pure: no Cesium, no MapLibre, no DOM, no THREE.
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §1 / R5 / R6 · L-13050 · C12 §1.5 · C57 §1.5 · ADR-0115.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE PLAN'S R5 WAS WRONG, AND THIS MODULE EXISTS SO THE CORRECTION CANNOT BE HALF-APPLIED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// R5 said *"the parcel ring is stored θ-free … so the site adapters are θ-free too."* They are NOT.
// BOTH site rasterisers apply θ when they draw a STORED footprint:
//   · `SiteBoundaryMap2D.envelopeFeatureCollection` — `sceneXZToEnu(p.x, p.z, θ)` then
//     `sceneXZToLatLon({x: east, z: −north}, lat0, lon0)`;
//   · `CesiumViewport.renderSpaceEnvelopes` — the same pair into the ENU matrix.
// So the frame a footprint is STORED in is the PROJECT frame, and a drawing fed to the gesture in
// true-north XZ would come back out of the rasteriser rotated by θ: perfect on any site where
// θ = 0, silently wrong at Barcelona's θ ≈ 45°, and MIRRORED across the frame origin on a
// wrong-signed θ. That last one is §PARCEL-SHADE-NOT-MIRRORED (L-10740) — a defect whose own
// success criterion had no term for it and therefore reported CONSISTENT forever.
//
// ⛔ SO THE CONVERSION IS WRITTEN ONCE, HERE, IN BOTH DIRECTIONS, AND EACH ADAPTER CALLS IT AT ITS
// OWN EDGE. Two adapters each rolling `lon = lon0 + x/…` is how one of them ends up with the sign
// of θ flipped and nothing fails. The two functions below are exact inverses of one another and
// are pinned as such by a round-trip spec on a site with θ ≠ 0.
//
//     pointer  →  lat/lon  →  latLonToSceneXZ (ENU: x=east, z=−north)  →  enuToSceneXZ(θ)  →  PROJECT XZ
//     preview  →  PROJECT XZ  →  sceneXZToEnu(θ)  →  sceneXZToLatLon({x: east, z: −north})  →  lat/lon
//
// ⛔ AND THE ORIGIN IS THE ONE AUTHORITY (R6). `resolveSiteFrameOrigin` exists precisely because two
// competing origin authorities produced the founder's *"sometimes shifted"* Barcelona parcel: the
// ring was projected about the geocoded STORE LOCATION while the render built its ENU frame about
// the FROZEN LTP-ENU origin. One call, one origin, both adapters — never a re-read geocode.
//
// ⛔ AND A REFUSAL IS NOT A ZERO. `θ could not be READ` and `θ is 0` are the §L-446 ambiguity, and
// they demand opposite behaviour: the first must refuse to arm, the second draws normally (the
// schema defaults `trueNorth` to 0, so a REACHABLE store answering 0 is a definite answer). This
// module returns a discriminated result carrying the reason, never a silent 0.
//
// ⚠ THE BIM PLAN SURFACE IS NOT THIS FRAME. It draws the AUTHORING frame de-rotated by θ from the
// 2D map BY DESIGN (ADR-0115), so anyone mirroring this port onto that surface must NOT apply the
// conversion above a second time — that is a double rotation, and it looks like a modelling error
// rather than a frame bug, which is why it survives review.

import { trace } from '@opentelemetry/api';
import {
    latLonToSceneXZ,
    resolveSiteFrameOrigin,
    sceneXZToLatLon,
    type LatLon,
} from './boundaryProjection';
import { enuToSceneXZ, sceneXZToEnu } from '../geospatial/sceneEnuFrame';
import type { SceneXZPoint } from './envelopeDrawSurface';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeDrawFrame');

/** The resolved site frame: where the scene origin is on earth, and how far it is rotated from it. */
export interface SiteDrawFrame {
    /** The ONE origin (`resolveSiteFrameOrigin`), never a re-read geocode. */
    readonly origin: LatLon;
    /** θ — `SiteLocation.trueNorth`, radians clockwise, project → true. 0 is a real answer. */
    readonly thetaRad: number;
}

/** Either a frame, or the reason there is none — in the words a user can act on. */
export type SiteDrawFrameResult =
    | { readonly ok: true; readonly frame: SiteDrawFrame }
    | { readonly ok: false; readonly reason: string };

/**
 * Resolve the frame a drawn perimeter is expressed in, or REFUSE with a reason and a route back.
 *
 * @param origin what `resolveSiteFrameOrigin` (or a host that already called it) yielded.
 * @param location the site's `SiteLocation`, or `null` when the store could not be reached.
 *        ⛔ `null` is NOT `{trueNorth: 0}` — see the §L-446 note in the header.
 */
export function resolveSiteDrawFrame(
    origin: { lat: number; lon: number } | null | undefined,
    location: { trueNorth?: number } | null | undefined,
): SiteDrawFrameResult {
    const span = _tracer.startSpan('pryzm.site.resolveSiteDrawFrame');
    try {
        if (!origin || (origin.lat === 0 && origin.lon === 0)) {
            span.setAttribute('pryzm.envelopeDraw.frame', 'no-origin');
            return {
                ok: false,
                reason:
                    'PRYZM cannot place a drawn perimeter on this site yet: no site frame ORIGIN is '
                    + 'resolvable (no LTP-ENU origin, no geocoded site location, no geocode frame). '
                    + 'Search for the address or select the parcel first — a footprint drawn about a '
                    + 'guessed origin is a claim about the wrong land.',
            };
        }
        if (!location) {
            span.setAttribute('pryzm.envelopeDraw.frame', 'no-theta');
            return {
                ok: false,
                reason:
                    'PRYZM cannot place a drawn perimeter on this site yet: the site store is '
                    + 'unreachable, so θ (the project-north angle) could not be READ. ⚠ That is NOT '
                    + 'the same as θ = 0 — assuming zero would draw a correctly-shaped perimeter at '
                    + 'the wrong BEARING on any rotated site. Open the project’s site view and try again.',
            };
        }
        const raw = location.trueNorth;
        const thetaRad = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
        span.setAttribute('pryzm.envelopeDraw.thetaRad', thetaRad);
        return { ok: true, frame: { origin: { lat: origin.lat, lon: origin.lon }, thetaRad } };
    } finally {
        span.end();
    }
}

/**
 * The pointer's edge: WGS84 lat/lon → PROJECT-frame scene-XZ metres. This is what an adapter hands
 * the gesture, and it is the frame the footprint is committed in.
 */
export function latLonToProjectXZ(ll: LatLon, frame: SiteDrawFrame): SceneXZPoint {
    // `latLonToSceneXZ` yields the TRUE-north ENU pair packed as {x: east, z: −north}.
    const enu = latLonToSceneXZ(ll, frame.origin.lat, frame.origin.lon);
    const p = enuToSceneXZ(enu.x, -enu.z, frame.thetaRad);
    return { x: p.x, z: p.z };
}

/**
 * The preview's edge: PROJECT-frame scene-XZ metres → WGS84 lat/lon. Exact inverse of
 * {@link latLonToProjectXZ}, and the SAME pair both rasterisers already use for a stored footprint —
 * which is what makes the in-progress rubber-band land exactly where the committed envelope will.
 */
export function projectXZToLatLon(p: SceneXZPoint, frame: SiteDrawFrame): LatLon {
    const { east, north } = sceneXZToEnu(p.x, p.z, frame.thetaRad);
    return sceneXZToLatLon({ x: east, z: -north }, frame.origin.lat, frame.origin.lon);
}

/**
 * The origin read, in the ONE precedence, for a caller that has the raw three sources.
 * A thin pass-through to `resolveSiteFrameOrigin` so an adapter never re-implements the ladder.
 */
export function resolveDrawOrigin(
    ltpOrigin: { lat: number; lon: number } | null | undefined,
    storeLocation: { latitude: number; longitude: number } | null | undefined,
    geocodeFrame: { lat: number; lon: number } | null | undefined,
): { lat: number; lon: number } | null {
    return resolveSiteFrameOrigin(ltpOrigin, storeLocation, geocodeFrame);
}
