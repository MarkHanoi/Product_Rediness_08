// scopeAnchor.ts — §SITE-SCOPE-ANCHOR-IS-THE-PARCEL (L-13086; C12 §13.1; ADR-0382) — WHERE THE
// SLAB IS CENTRED, decided once, purely, and with the reason printed.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ASK, AND WHAT WAS ACTUALLY WRONG (falsified BEFORE anything was built — lane SCOPE-ANCHOR)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Founder 2026-09-07: *"the 3d view should not change the scope as you move on the view — not
// anymore — now it always would center statically the scope depending on the parcel that has been
// selected on plan view"*.
//
// That sentence contains TWO requirements and they had two different states, so they are recorded
// separately rather than closed with one plausible fix:
//
//   1. "should not change as you move" — REAL, and ALREADY FIXED one commit earlier by lane
//      SCOPE-CUT-2 (`ff60ce85`). `maybeRefreshContextOnPan` called
//      `loadContextBuildings(camLat, camLon, true)`; that method sets `contextBuildingsAt` and then
//      arms `applySiteScopeClip(lat, lon)`, which is what raises the globe cut, the slab side and
//      every per-layer geometric clip (`scopeClipperFor`). So the whole slab followed the camera.
//      It is now pinned, and `siteScopeGlobeCutHonesty.spec.ts` ARM H holds that line to its text.
//
//   2. "always centre statically on the PARCEL" — NOT closed, and this module is that half.
//      ⛔ EVERY OTHER TRIGGER OF A SCOPE REBUILD WAS ENUMERATED BEFORE CONCLUDING THIS, because an
//      anchor built for a drift that does not exist is a new defect wearing a founder quote:
//        · `camera.moveEnd` → `maybeRefreshContextOnPan`  — pinned (above). CAMERA-driven.
//        · terrain settle   → `rebuildSiteScopeClipForBase` — `siteScopeClipAt ?? contextBuildingsAt`.
//        · scope slider     → `setContextScope`             — `contextBuildingsAt`.
//        · terrain ON/OFF   → `setFormaTerrainEnabled`      — `contextBuildingsAt ?? formaMassingOrigin`.
//        · photoreal restore→ `readSiteLocation()`          — LTP-ENU origin, address only as fallback.
//        · massing render   → `renderFormaMassing`          — the LTP-ENU origin.
//        · `site.location-changed` → **the RAW EVENT ADDRESS**.   ⬅ THE ONE LIVE GAP.
//      Only the last one re-centres the slab on a point that is not the site frame. And the SAME
//      handler, eleven lines above it, already refuses to do this for the CAMERA — §L-259 defect
//      (ii), *"the camera must follow the BUILDING whenever one is placed — the building IS the
//      site"* — and even measures `originSeparationMeters(formaMassingOrigin, loc)` to print how
//      far apart the two are. The camera got that fix in June; the SCOPE never did. So after a
//      post-commit address edit the slab jumps to the address while the parcel and the building
//      stay put, and the parcel can sit off-centre in — or outside — its own scope.
//
// ⭐ AND THE ANCHOR IS THE PARCEL, NOT THE FRAME ORIGIN, WHICH ARE NOT THE SAME POINT.
// `parcelFrameOrigin` (boundaryProjection.ts) deliberately returns the ring's **FIRST VERTEX**, so
// the always-on project-origin datum lands ON the boundary at scene (0,0) — correct for that datum
// and NOT correct as a centre. `CesiumViewport`'s own §SITE-FRAME-PROBE names this exact split
// ("the anchor-vs-parcel-centroid split") and prints `offsetFromOrigin` in metres for it. A slab
// centred on a corner of the parcel is off by the parcel's own first-vertex→centroid distance:
// tens of metres on a city lot, but a large rural or industrial parcel is hundreds. This module
// prefers the AREA CENTROID and falls back to the frame origin, saying which it used.
//
// PURE. No Cesium, no THREE, no DOM, no store. It imports `originSeparationMeters` from
// `globeGroundAnchor.ts` — the module that already owns the L-259 anchor decisions and has zero
// imports of its own, so the graph stays a DAG — rather than minting a second distance function.

import { originSeparationMeters, type LatLon } from './globeGroundAnchor';

/** `[lon, lat]` — the tile readers' / `committedParcelLonLat` vertex convention. */
export type LonLatPair = readonly [lon: number, lat: number];

export type ScopeAnchorSource =
    /** The committed parcel ring's AREA centroid — the answer the founder's sentence asks for. */
    | 'parcel-centroid'
    /** No usable ring, but the site frame origin is at this site: the parcel's first vertex. */
    | 'parcel-frame-origin'
    /** Nothing anchored here — the caller's own point stands, and the note says why. */
    | 'requested';

export interface ScopeAnchorInput {
    /** What the caller would have centred the scope on with no anchor (an address, a load centre). */
    readonly requested: LatLon;
    /** The committed parcel ring as `[lon, lat]` (`CesiumViewport.committedParcelLonLat`), if any. */
    readonly parcelRingLonLat?: ReadonlyArray<LonLatPair> | null;
    /** The LTP-ENU site frame origin (`formaMassingOrigin`) — the parcel's FIRST VERTEX, if any. */
    readonly frameOrigin?: LatLon | null;
    /**
     * "Is this the same site?" answered with the ONE number that already means it: the scope's own
     * circumscribing radius. A candidate inside the slab we are about to cut IS this site; one
     * outside it is a DIFFERENT site whose anchor has simply not been re-seated yet, and adopting
     * that would rebuild the layers at the previous parcel — §CTX-RESEAT-ANCHOR-IS-CURRENT-SITE
     * (L-12964), *"no layer may be rebuilt at another site"*. No new constant is minted for this.
     */
    readonly sameSiteRadiusM: number;
}

export interface ScopeAnchorDecision {
    readonly lat: number;
    readonly lon: number;
    readonly source: ScopeAnchorSource;
    /** Metres between `requested` and the adopted anchor. 0 when `requested` won. */
    readonly movedM: number;
    /** The sentence the caller prints. Always states which point won AND what it beat. */
    readonly note: string;
}

/** A lat/lon that can be centred on at all: finite, and not the null-island 0,0. */
function usable(p: LatLon | null | undefined): p is LatLon {
    return (
        !!p &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        !(p.lat === 0 && p.lon === 0)
    );
}

/**
 * The AREA centroid (shoelace) of a `[lon, lat]` ring, in degrees.
 *
 * ⭐ WHY THE SHOELACE IN RAW DEGREES IS EXACT HERE, AND NOT AN APPROXIMATION. Converting
 * `[lon, lat]` to local metres is `east = (lon − lon₀)·k·cos φ`, `north = (lat − lat₀)·k` — an
 * AFFINE map at parcel scale. An affine map commutes with the centroid (centroid of the image is
 * the image of the centroid), so the degree-space area centroid IS the metric area centroid mapped
 * back. No cos-latitude weighting is needed and adding one would not improve it.
 *
 * ⛔ NOT THE VERTEX MEAN. A real cadastral ring digitises one physical boundary as several
 * near-collinear vertices (the founder's Córdoba `2947201UG4924N` does exactly this — see
 * `boundaryProjection.ts`), so a vertex mean is pulled toward whichever edge was surveyed in most
 * detail. A degenerate ring (zero signed area: collinear, or every vertex repeated) has no area
 * centroid, and THAT is the only case where the vertex mean is used — it is the honest answer for a
 * shape with no interior, not a shortcut. Fewer than 3 usable vertices ⇒ `null`, never a zero.
 */
export function parcelCentroidLonLat(ring: ReadonlyArray<LonLatPair> | null | undefined): LatLon | null {
    if (!ring || ring.length < 3) return null;
    let n = ring.length;
    // Drop a repeated closing vertex — it contributes a zero-length edge and biases the mean.
    {
        const a = ring[0]!;
        const b = ring[n - 1]!;
        if (a[0] === b[0] && a[1] === b[1]) n--;
    }
    if (n < 3) return null;

    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    let sumLon = 0;
    let sumLat = 0;
    for (let i = 0; i < n; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % n]!;
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
        const cross = p[0] * q[1] - q[0] * p[1];
        twiceArea += cross;
        cx += (p[0] + q[0]) * cross;
        cy += (p[1] + q[1]) * cross;
        sumLon += p[0];
        sumLat += p[1];
    }
    if (Math.abs(twiceArea) > 1e-14) {
        const lon = cx / (3 * twiceArea);
        const lat = cy / (3 * twiceArea);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    // Degenerate: no interior. The vertex mean is the centre of a line, which is what this is.
    const lon = sumLon / n;
    const lat = sumLat / n;
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/**
 * §SITE-SCOPE-ANCHOR-IS-THE-PARCEL — decide where the scope is centred.
 *
 * The ladder, strongest first: committed parcel AREA CENTROID → site frame origin (the parcel's
 * first vertex) → the caller's own point. A candidate is adopted ONLY when it is within
 * `sameSiteRadiusM` of `requested`; beyond that it belongs to a different site and `requested`
 * stands (see `sameSiteRadiusM`).
 *
 * ⛔ NEVER FABRICATES. An unusable `requested` (non-finite, or 0,0) is returned UNCHANGED so the
 * caller's existing refusal — `applySiteScopeClip`'s *"no usable origin … the scope is centred on
 * the site frame origin, never on 0,0"* — is the thing that speaks. Substituting a parcel here
 * would convert a loud refusal into a quiet, plausible answer, which is the one outcome
 * §CONTEXT-DATA-HONESTY forbids. Deterministic; never throws.
 */
export function resolveScopeAnchor(input: ScopeAnchorInput): ScopeAnchorDecision {
    const req = input.requested;
    // Read the raw pair BEFORE the type guard: `usable` narrows `req` to `never` on the false
    // branch, and the refusal below has to be able to NAME the value it is refusing.
    const rawCentre = `${String((req as { lat?: unknown } | null)?.lat)},${String((req as { lon?: unknown } | null)?.lon)}`;
    const keepRequested = (source: ScopeAnchorSource, note: string): ScopeAnchorDecision => ({
        lat: req.lat,
        lon: req.lon,
        source,
        movedM: 0,
        note,
    });

    if (!usable(req)) {
        return keepRequested(
            'requested',
            `the requested centre (${rawCentre}) is not a usable origin — ` +
                'returned UNCHANGED so the caller\'s own refusal reports it; an anchor must never ' +
                'stand in for a missing origin.',
        );
    }

    const radius = Number.isFinite(input.sameSiteRadiusM) && input.sameSiteRadiusM > 0
        ? input.sameSiteRadiusM
        : 0;
    if (radius <= 0) {
        return keepRequested(
            'requested',
            `no same-site radius was supplied (${String(input.sameSiteRadiusM)}), so "is this the ` +
                'same site?" cannot be answered — the requested centre stands.',
        );
    }

    const centroid = parcelCentroidLonLat(input.parcelRingLonLat);
    const candidates: ReadonlyArray<{ readonly at: LatLon | null; readonly source: ScopeAnchorSource; readonly what: string }> = [
        { at: usable(centroid) ? centroid : null, source: 'parcel-centroid', what: 'the committed parcel\'s area centroid' },
        { at: usable(input.frameOrigin) ? input.frameOrigin : null, source: 'parcel-frame-origin', what: 'the site frame origin (the parcel\'s first vertex)' },
    ];

    let rejected: string | null = null;
    for (const c of candidates) {
        if (!c.at) continue;
        const sep = originSeparationMeters(req, c.at);
        if (!Number.isFinite(sep)) continue;
        if (sep > radius) {
            // Record the FIRST rejection only: it is the strongest candidate and therefore the one
            // whose distance explains the decision.
            rejected ??=
                `${c.what} is ${sep.toFixed(0)} m away — beyond the ${radius.toFixed(0)} m scope, so ` +
                'it belongs to a DIFFERENT site whose anchor has not been re-seated yet ' +
                '(§CTX-RESEAT-ANCHOR-IS-CURRENT-SITE, L-12964)';
            continue;
        }
        return {
            lat: c.at.lat,
            lon: c.at.lon,
            source: c.source,
            movedM: sep,
            note:
                `centred on ${c.what} (${c.at.lat.toFixed(5)},${c.at.lon.toFixed(5)}), ` +
                `${sep.toFixed(1)} m from the requested ${req.lat.toFixed(5)},${req.lon.toFixed(5)} ` +
                '— §SITE-SCOPE-ANCHOR-IS-THE-PARCEL.',
        };
    }

    return keepRequested(
        'requested',
        rejected !== null
            ? `${rejected}; the requested ${req.lat.toFixed(5)},${req.lon.toFixed(5)} stands.`
            : `no committed parcel and no site frame origin to anchor to — the requested ` +
              `${req.lat.toFixed(5)},${req.lon.toFixed(5)} IS the centre here (this is the ` +
              'pre-parcel case, and it is correct, not a fallback to nothing).',
    );
}
