// §PARCEL-VISIBLE-EVERYWHERE (L-13016, founder 2026-09-06) — THE COMMITTED PARCEL, IN WGS84,
// ONCE.
//
// THE DEFECT THIS MODULE EXISTS FOR
// --------------------------------
// Founder: *"When a parcel is selected, the parcel should be HIGHLIGHTED no matter the view
// selected. I was in split view (2D satellite + 3D), then went into a single view — 2D site view —
// and the parcel was NOT highlighted, although the data was on the right hand side."*
//
// The model HAD the ring the whole time (`site.parcel-boundary-set … area(m²)= 4177.83
// provenance=cadastral/catastro refcat=1218101DF3811G`). What no surface had was a way to ask for
// it in the frame a MAP draws in. `Parcel.boundary.polygon` is scene-XZ METRES in the PROJECT
// frame (C19 §2.3, ADR-0115: the authoring plan is de-rotated by θ from the map by design); a
// MapLibre source and a camera extent both want WGS84 degrees. So every surface that wanted to
// draw the committed parcel had to perform the same two-step conversion, and — measured
// 2026-09-06 — none of them did, which is why `SiteBoundaryMap2D` mounted over an already
// committed site drew nothing at all: `syncCommittedFromStore()` FREEZES the draw surface from
// the store but never PAINTS from it, and the map's own `vertices` array is empty on any mount
// that did not itself perform the commit.
//
// ⛔ ONE PROJECTION, NOT THREE. `SiteBoundaryMap2D.envelopeFeatureCollection` already documents
// why this pair may not be hand-rolled per call site: *"A hand-rolled `lon = lon0 + x/…` here
// would be correct at θ = 0 and silently WRONG at Barcelona's θ ≈ 45° — and a wrong-signed θ lands
// the footprint MIRRORED across the frame origin, which is §PARCEL-SHADE-NOT-MIRRORED (L-10740):
// a defect whose own success criterion had no term for it and therefore reported CONSISTENT
// forever."* That argument applies verbatim to the PARCEL ring, so the conversion lives here and
// each surface asks rather than re-derives:
//
//     scene-XZ (PROJECT frame) --sceneXZToEnu(x, z, θ)--> ENU east/north (TRUE frame)
//     ENU east/north --sceneXZToLatLon({x: east, z: -north}, lat0, lon0)--> WGS84
//
// ── THREE ARMS, BECAUSE "NO PARCEL" AND "COULD NOT PLACE IT" ARE DIFFERENT FACTS ────────────
// ⛔ `absent` IS NOT `refused`, and collapsing them is the §CONTEXT-DATA-HONESTY defect this repo
// treats as first-class (failure and emptiness rendering as one value). A surface holding
// `absent` should say nothing — no parcel is committed and there is nothing to show. A surface
// holding `refused` is holding a REAL 28-corner ring it cannot honestly place, because the frame
// origin or θ could not be read, and drawing it about a guessed origin would be a legal claim
// about the wrong land (C57 §1.5). The caller must be able to tell those apart, so they are
// different variants carrying different sentences and neither is an empty array.
//
// PURE apart from the two reads it is handed. No DOM, no MapLibre, no Cesium, no THREE.
// C12: WGS84 degrees out. P4: no globals — the caller supplies the store and the origin.

import { trace } from '@opentelemetry/api';
import { sceneXZToEnu } from '../geospatial/sceneEnuFrame';
import { sceneXZToLatLon, type LatLon } from './boundaryProjection';

const _tracer = trace.getTracer('pryzm.site.committedParcelRing');

/** The narrowest read this module needs. Structural, so a test can hand it a literal. */
export interface CommittedParcelSource {
    getSite?: () => {
        parcel?: { boundary?: { polygon?: ReadonlyArray<{ x: number; z: number }> } | null } | null;
        location?: { trueNorth?: number } | null;
    } | null;
}

/**
 * The answer, in three arms. See the header: `absent` and `refused` must never print the same
 * sentence, and neither is an empty ring.
 */
export type CommittedParcelRing =
    | {
        readonly kind: 'ring';
        /** The committed C19 ring in WGS84, in the store's own vertex order. `length >= 3`. */
        readonly ring: readonly LatLon[];
        /** θ used for the projection, radians. Carried so a log can say WHY the ring sits where it does. */
        readonly thetaRad: number;
    }
    | { readonly kind: 'absent'; readonly reason: string }
    | { readonly kind: 'refused'; readonly reason: string };

const NO_PARCEL =
    'No parcel boundary is committed for this project, so there is no plot outline to draw. '
    + 'This is the resting state, not a failure.';

/**
 * THE committed-parcel read. Total; never throws.
 *
 * @param source the C19 site store (`runtime.siteModelStore`), or anything with the same two reads
 * @param origin the site frame origin resolved through `resolveSiteFrameOrigin` — the ONE origin
 *               authority both the ring WRITE and the render READ use (§SEAM-2, L-604 / C12 §1.5).
 *               ⛔ Do NOT pass a geocode point directly: the LTP origin freezes under a committed
 *               boundary while the store location keeps moving, and the difference slides the
 *               parcel by dist(store, LTP).
 */
export function readCommittedParcelRing(
    source: CommittedParcelSource | null | undefined,
    origin: { lat: number; lon: number } | null | undefined,
): CommittedParcelRing {
    const span = _tracer.startSpan('pryzm.site.readCommittedParcelRing');
    try {
        let site: ReturnType<NonNullable<CommittedParcelSource['getSite']>> | null = null;
        try {
            site = source?.getSite?.() ?? null;
        } catch (e) {
            span.setAttribute('pryzm.committedParcel.kind', 'refused');
            return {
                kind: 'refused',
                reason:
                    'PRYZM could not read the site store, so it cannot tell whether a parcel is '
                    + `committed. This is a gap in PRYZM, not a finding about the plot (${String(e)}).`,
            };
        }

        const polygon = site?.parcel?.boundary?.polygon ?? null;
        if (!polygon || polygon.length < 3) {
            span.setAttribute('pryzm.committedParcel.kind', 'absent');
            return { kind: 'absent', reason: NO_PARCEL };
        }

        if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) {
            span.setAttribute('pryzm.committedParcel.kind', 'refused');
            return {
                kind: 'refused',
                reason:
                    `A parcel boundary of ${polygon.length} corners IS committed, but no site frame `
                    + 'ORIGIN is resolvable, so PRYZM will not place it. A plot outline drawn about a '
                    + 'guessed origin is a claim about the wrong land (C57 §1.5), so nothing is drawn.',
            };
        }

        // θ — the SAME `SiteLocation.trueNorth` every other rasteriser reads. ⚠ A MISSING location
        // is a REFUSAL, not θ = 0: a correctly-shaped ring at the wrong BEARING is the §L-446
        // ambiguity, and on Barcelona (θ ≈ 45°) it looks entirely plausible. A REACHABLE location
        // with `trueNorth: 0` is a definite answer — the schema defaults it — and draws normally.
        const location = site?.location ?? null;
        if (!location) {
            span.setAttribute('pryzm.committedParcel.kind', 'refused');
            return {
                kind: 'refused',
                reason:
                    `A parcel boundary of ${polygon.length} corners IS committed, but the site LOCATION `
                    + 'could not be read, so θ (SiteLocation.trueNorth) is unknown. ⚠ That is NOT the same '
                    + 'as θ = 0: assuming 0 would draw a correctly-shaped plot at the wrong BEARING on '
                    + 'any rotated site. Nothing is drawn.',
            };
        }
        const thetaRad = Number.isFinite(location.trueNorth) ? (location.trueNorth as number) : 0;

        const ring: LatLon[] = [];
        for (const p of polygon) {
            if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) continue;
            const { east, north } = sceneXZToEnu(p.x, p.z, thetaRad);
            ring.push(sceneXZToLatLon({ x: east, z: -north }, origin.lat, origin.lon));
        }
        if (ring.length < 3) {
            span.setAttribute('pryzm.committedParcel.kind', 'refused');
            return {
                kind: 'refused',
                reason:
                    `The committed boundary has ${polygon.length} corners but only ${ring.length} of them `
                    + 'carry finite coordinates, so PRYZM will not draw a partial plot outline.',
            };
        }
        span.setAttribute('pryzm.committedParcel.kind', 'ring');
        span.setAttribute('pryzm.committedParcel.vertices', ring.length);
        return { kind: 'ring', ring, thetaRad };
    } finally {
        span.end();
    }
}
