// L-380 P0 — Parcel Data Layer: the provider-agnostic PARCEL interface.
//
// WHY THIS EXISTS
// ---------------
// The founder's "select a real parcel" feature turns a map click into the REAL
// cadastral geometry of the plot under the cursor. Different jurisdictions expose
// that geometry through totally different services (Spain = Catastro OVC + INSPIRE
// WFS; Denmark = Datafordeler Matriklen [API-key gated]; Switzerland = geodienste /
// api3.geo.admin EGRID). Mirroring the L-374 Context-Engine provider pattern, this
// module defines ONE minimal interface so each jurisdiction is a drop-in adapter
// and the map UI (SiteBoundaryMap2D) stays jurisdiction-agnostic.
//
// PILOT DECISION (L-380, founder-directed reassessment 2026-07-17)
// ----------------------------------------------------------------
// Denmark has the ONLY structured/open ZONING (Plandata.dk, anonymous WFS) — but
// its PARCEL source (Datafordeler Matriklen WFS) requires an API-key/OAuth, and
// Norway's cadastral geometry needs a business application. Spain's Catastro is the
// only KEYLESS parcel source (OVC reverse-geocode + INSPIRE WFS, live-verified), so
// the FIRST parcel adapter is `CatastroParcelProvider` (Barcelona pilot). Denmark
// is the zoning-rich P2 target (a `DkZoningProvider` slots onto the same seam).
//
// LAYERING — this is a PURE fetch+parse provider (no THREE / Cesium / DOM), exactly
// like `geocodeAddress.ts` next door: it is liftable to an L2 `@pryzm/site-parcel-
// data` package verbatim once a second adapter lands (kept in the editor app for now
// to avoid net-new package plumbing during the P0/P1 slice — flagged for review).

import type { LatLon } from '../boundaryProjection.js';

/** A fetched cadastral parcel, normalised to a WGS84 lat/lon ring. */
export interface ParcelFeature {
    /** The parcel boundary as a WGS84 lat/lon ring (outer ring; not necessarily
     *  closed — `buildBoundaryFromLatLonRing` drops a duplicate closing vertex). */
    readonly ring: ReadonlyArray<LatLon>;
    /** The jurisdiction's parcel identifier (Spain: referencia catastral). */
    readonly refcat: string;
    /** Parcel area in m² (from the source's published areaValue when available). */
    readonly areaM2: number;
    /** Postal-ish address / locator string when the source supplies one. */
    readonly address?: string | null;
    /** Provenance tag — which provider/source produced this (L-373 credibility). */
    readonly source: string;
}

/**
 * Provider-agnostic parcel data source. Each jurisdiction implements this once.
 * All network access goes through the same-origin server proxy (never browser →
 * gov endpoint directly), so no CSP `connect-src` change is needed.
 */
export interface ParcelProvider {
    /** Stable provider id / provenance tag (e.g. `'catastro'`). */
    readonly id: string;
    /** Human-facing source label for the info card / attribution. */
    readonly label: string;
    /**
     * Resolve the real cadastral parcel at a WGS84 point (the map click), or null
     * when there is no parcel there / the source is unavailable. MUST never throw —
     * a miss falls back to manual draw.
     */
    fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null>;
}
