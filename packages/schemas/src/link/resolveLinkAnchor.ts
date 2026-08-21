/**
 * resolveLinkAnchor — the PURE decision that places a linked model (ADR-0346 D4).
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────────────
 *
 * **A silent mis-alignment is strictly worse than a refusal.** A linked model that
 * lands quietly at the wrong place looks entirely plausible — it renders, it is
 * measurable, and every dimension drawn to it is wrong. C83's three-way answer
 * (IMPOSSIBLE / INADVISABLE / FINE) is therefore the return type of this function,
 * not a comment about it, and PRYZM always ASKS rather than auto-editing.
 *
 * The three cases, and why each is where it is:
 *
 *   · **FINE** — both projects carry a `SiteModel.location` (C19 §1.3) and the two
 *     origins are near each other. This is the whole reason the feature is
 *     tractable here: two projects on the same parcel already share a datum, so
 *     the transform is DERIVED, not asked for.
 *
 *   · **INADVISABLE** — both located, but implausibly far apart. Something is
 *     probably wrong (a mis-geocode, the wrong project picked), yet "far apart"
 *     is not impossible — a masterplan legitimately links a block 2 km away. So
 *     it asks, and the question carries BOTH numbers: the measured separation and
 *     the threshold it exceeded ([[refusing-half-needs-its-escape-hatch]] — a
 *     refusal whose "yes" branch leads nowhere is a regression with a citation
 *     attached).
 *
 *   · **IMPOSSIBLE** — an origin is missing, so no derivation exists. This does
 *     NOT refuse the link; it refuses AUTO-ALIGNMENT and hands back the explicit
 *     path. Refusing the whole feature here would be too strict (an early-stage
 *     option file often has no site), and placing at the origin would be the
 *     silent mis-alignment this file exists to prevent.
 *
 * ── WHY THE MATH IS FLAT-EARTH, ON PURPOSE ───────────────────────────────────
 *
 * The offset is computed as a local tangent-plane (ENU) displacement about the
 * HOST origin — the same substrate C12 uses for the scene itself (C19 §1.3). Over
 * the distances a linked model is *for* (metres to a few kilometres) the tangent
 * plane is the correct model, and it is the one the rest of the scene already
 * lives in, so the link and the host cannot disagree about where north is.
 *
 * Beyond `FAR_SEPARATION_M` the approximation degrades — which is precisely the
 * band this function declines to auto-place in. The threshold is therefore doing
 * two jobs at once, and both point the same way.
 *
 * P5: pure. No I/O, no THREE, no DOM, no clock — `resolvedAt` is passed IN so the
 * result is deterministic and testable (C73).
 */

import type { LinkAnchor, LinkGeoOrigin, LinkTransform } from './LinkedModelRef.js';

/** WGS84 mean earth radius, metres. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Origins closer than this are auto-aligned without asking. 1 km comfortably
 * covers "the same parcel", "next door" and "across the street", which is the
 * case this feature is for.
 */
export const NEAR_SEPARATION_M = 1_000;

/**
 * Beyond this the answer is INADVISABLE — a question, never a silent placement.
 * 5 km is far enough that a masterplan-scale link is still merely *asked about*,
 * and near enough that a mis-geocoded project (which typically lands hundreds of
 * kilometres away, or at 0°/0°) is caught every time.
 */
export const FAR_SEPARATION_M = 5_000;

/** C83's three-way verdict, as a value. */
export type LinkAnchorVerdict = 'FINE' | 'INADVISABLE' | 'IMPOSSIBLE';

export interface LinkAnchorDecision {
    readonly verdict: LinkAnchorVerdict;
    /**
     * The derived anchor. Present for FINE and INADVISABLE (so the UI can show the
     * user exactly what it WOULD do while it asks). `null` only for IMPOSSIBLE,
     * where no derivation exists — never a zero transform standing in for one.
     */
    readonly anchor: LinkAnchor | null;
    /**
     * Metres between the two origins, or `null` when an origin was missing.
     * **Never `0` for "unknown"** — §CONTEXT-DATA-HONESTY.
     */
    readonly separationM: number | null;
    /**
     * A sentence naming what was refused and why, in the user's terms. Always
     * present for INADVISABLE and IMPOSSIBLE; `null` for FINE. It names BOTH
     * numbers when a threshold was crossed, per C74 (constraint honesty).
     */
    readonly reason: string | null;
}

/**
 * Great-circle metres between two geographic points (haversine).
 * Exported because the UI shows this number in its question, and a second copy
 * of the formula is a second answer to one question (ADR-0331).
 */
export function geoSeparationM(a: LinkGeoOrigin, b: LinkGeoOrigin): number {
    const toRad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * toRad;
    const dLon = (b.longitude - a.longitude) * toRad;
    const lat1 = a.latitude * toRad;
    const lat2 = b.latitude * toRad;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The source origin expressed as an East/North displacement in the HOST's local
 * tangent plane, plus the vertical difference and the true-north delta.
 *
 * Sign convention matches the scene frame the rest of the app uses
 * (`createSiteOverlayUnderlay.ts:124-125` — `x = east`, `z = -north`); this
 * function returns east/north and the RENDERER applies the `z = -north` flip, so
 * the flip lives in exactly one place.
 */
export function enuOffset(host: LinkGeoOrigin, source: LinkGeoOrigin): LinkTransform {
    const toRad = Math.PI / 180;
    const meanLat = ((host.latitude + source.latitude) / 2) * toRad;
    const east = (source.longitude - host.longitude) * toRad * EARTH_RADIUS_M * Math.cos(meanLat);
    const north = (source.latitude - host.latitude) * toRad * EARTH_RADIUS_M;
    return {
        east,
        north,
        elevation: source.elevationAsl - host.elevationAsl,
        // Both models are authored about their OWN true north. Placing the source
        // in the host's frame means rotating by the DIFFERENCE, not by either value.
        rotationY: source.trueNorth - host.trueNorth,
    };
}

/**
 * Decide how — or whether — to auto-place a linked model.
 *
 * @param hostOrigin   the host project's `SiteModel.location`, or `null` if it has no site
 * @param sourceOrigin the source project's `SiteModel.location`, or `null` if it has no site
 * @param resolvedAt   UTC ISO-8601 timestamp, passed in so this stays deterministic (C73)
 */
export function resolveLinkAnchor(
    hostOrigin: LinkGeoOrigin | null,
    sourceOrigin: LinkGeoOrigin | null,
    resolvedAt: string,
): LinkAnchorDecision {
    if (hostOrigin === null) {
        return {
            verdict: 'IMPOSSIBLE',
            anchor: null,
            separationM: null,
            reason:
                'This project has no site location, so there is no coordinate frame to place a '
                + 'linked model in. Set the project site first (C19 §1.3), or place the link by hand.',
        };
    }
    if (sourceOrigin === null) {
        return {
            verdict: 'IMPOSSIBLE',
            anchor: null,
            separationM: null,
            reason:
                'The linked project has no site location, so its position cannot be derived from the '
                + 'shared parcel. Place it by hand instead — it will NOT be placed at the origin, '
                + 'because a guess that looks right is worse than no placement.',
        };
    }

    const separationM = geoSeparationM(hostOrigin, sourceOrigin);
    const anchor: LinkAnchor = {
        mode: 'shared-geo-origin',
        transform: enuOffset(hostOrigin, sourceOrigin),
        hostOrigin,
        sourceOrigin,
        separationM,
        resolvedAt,
    };

    if (separationM > FAR_SEPARATION_M) {
        return {
            verdict: 'INADVISABLE',
            anchor,
            separationM,
            // BOTH numbers, per C74 — the measurement and the rule it broke.
            reason:
                `The two projects' site origins are ${formatMetres(separationM)} apart, which is `
                + `beyond the ${formatMetres(FAR_SEPARATION_M)} auto-align limit. That usually means one `
                + 'of them is geocoded somewhere unintended. Confirm to place it anyway, or place it by hand.',
        };
    }

    if (separationM > NEAR_SEPARATION_M) {
        // Between NEAR and FAR: derivable, plausible, and worth SAYING out loud.
        // Still FINE — a masterplan block across a park is a normal link — but the
        // UI shows the distance so the user is never surprised by where it landed.
        return { verdict: 'FINE', anchor, separationM, reason: null };
    }

    return { verdict: 'FINE', anchor, separationM, reason: null };
}

/** Metres rendered the way the UI shows them. Kept beside the thresholds it formats. */
export function formatMetres(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

/**
 * Build the anchor record for a HAND-PLACED link. Used when {@link resolveLinkAnchor}
 * returned IMPOSSIBLE, or when the user overrides a derived placement.
 *
 * `sourceOrigin` stays `null` when there was none — the absence is the fact, and
 * recording a zero here would re-introduce exactly the ambiguity this module exists
 * to remove.
 */
export function explicitAnchor(
    transform: LinkTransform,
    hostOrigin: LinkGeoOrigin | null,
    sourceOrigin: LinkGeoOrigin | null,
    resolvedAt: string,
): LinkAnchor {
    return {
        mode: 'explicit',
        transform,
        hostOrigin,
        sourceOrigin,
        separationM:
            hostOrigin !== null && sourceOrigin !== null
                ? geoSeparationM(hostOrigin, sourceOrigin)
                : null,
        resolvedAt,
    };
}
