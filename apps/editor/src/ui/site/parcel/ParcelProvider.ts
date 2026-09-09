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

/** How the parcel corresponds to what was requested. L-640 Phase 1: built ONLY from
 *  categorical FACTS (kind, areaSource, geometryComplete, click-inside) — never from an
 *  invented numeric cutoff (that would violate the C58 §16 explainability the feature serves).
 *  `high` never occurs on a derived-area or footprint-fallback parcel. */
export type ParcelMatchTier = 'high' | 'medium' | 'low';

/** Whether `areaOfficialM2` came from the source's registry (INSPIRE `areaValue`) or was
 *  derived by shoelace from the ring. The C57 §2.1 honesty distinction (KV-3). */
export type ParcelAreaSource = 'registry-declared' | 'derived-from-ring';

/** §L-640 Phase 1 — cadastral confidence, honesty-gated. Raw numeric fields are shipped for
 *  transparency + future calibration; the tiered `match` is derived ONLY from categorical facts. */
export interface ParcelConfidence {
    /** Fact-based tier (see ParcelMatchTier). */
    readonly match: ParcelMatchTier;
    /** Did the source publish an official registry area, or did we shoelace the ring? */
    readonly areaSource: ParcelAreaSource;
    /** The source's registry-declared area (INSPIRE `areaValue`), or null if unpublished. */
    readonly areaOfficialM2: number | null;
    /** Area computed from the polygon ring (shoelace) — always present. */
    readonly areaSigM2: number;
    /** |official − sig| / official, or null when no official area to compare. Shipped RAW;
     *  NOT tiered on (no calibrated "agree" cutoff exists yet — a stated Phase-1 limitation). */
    readonly areaDeltaPct: number | null;
    /** Distance (m) from the query point to the parcel (Spain OVC `_Distancia`), or null for
     *  point-in-polygon / ref-query providers. Shipped RAW; distance sub-tiers withheld (no data). */
    readonly pointToParcelM: number | null;
    /** Nearest vs 2nd-nearest candidate gap (m), or null. Shipped RAW; only single-vs-multiple
     *  candidate COUNT is used as a fact — no margin cutoff (a stated Phase-1 limitation). */
    readonly candidateMarginM: number | null;
    /** The ring parsed cleanly (closed-able, ≥3 distinct vertices). A boolean fact. */
    readonly geometryComplete: boolean;
}

/** §L-640 Phase 1 — pure geometry diagnostics derived from the ring (no source, honesty-safe). */
export interface ParcelGeometryMetrics {
    readonly areaSigM2: number;
    readonly perimeterM: number;
    readonly centroid: LatLon;
    readonly bbox: { readonly west: number; readonly south: number; readonly east: number; readonly north: number };
    readonly vertexCount: number;
    /** Polsby–Popper compactness 4πA/P² ∈ (0,1]; 1 = a circle. */
    readonly compactness: number;
}

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
    /** §L-640 Phase 1 — pure geometry diagnostics (optional; present when computed). */
    readonly metrics?: ParcelGeometryMetrics;
    /** §L-640 Phase 1 — cadastral confidence (optional; present when computed). */
    readonly confidence?: ParcelConfidence;
    /** §L-12893 — the source's own MUNICIPALITY identity for this parcel: Spain = the OVC
     *  `loine` `<cp>` province code (`'30'` = Murcia province). With `catastroCm` it composes
     *  to the INE municipality code via `composeIneCode` (`@pryzm/site-parcel-data`) — the
     *  municipality test of record, which municipal routing decides from where a parcel
     *  resolves (bbox = pre-filter only, L-12871 sub-nationally). Null/absent = unknown,
     *  never a guess (L-616). */
    readonly catastroCp?: string | null;
    /** §L-12893 — the OVC `loine` `<cm>` municipality-within-province code (`'30'` composes
     *  with cp `'30'` to INE `30030`, Murcia — NOT `'3030'`; see `composeIneCode`). */
    readonly catastroCm?: string | null;
}

/**
 * ⭐⭐ §UPSTREAM-UNREACHABLE-IS-NOT-A-MISS — THE ONE HONEST LOOKUP SHAPE, FOR EVERY PROVIDER.
 *
 * ⛔ THE THREE OUTCOMES ARE NOT RANKED, THEY ARE DIFFERENT:
 *   · `ok`          — the source answered with a parcel.
 *   · `miss`        — the source answered, and it holds no parcel here. An ANSWER about the land.
 *   · `unreachable` — nobody answered (offline, proxy 5xx, non-JSON, upstream timeout). NOT an
 *                     answer, and never to be rendered as one. `reason` carries which.
 *
 * ⚠ WHY IT LIVES HERE AND NOT IN ONE ADAPTER. It was minted in `CatastroParcelProvider.ts`
 * (L-13057 for the refcat lookup, L-13295 for the click lookup) and stayed there, so exactly ONE
 * of five providers could tell an outage from an empty plot — and the map's `parcelProvider` is
 * the ROUTING REGISTRY, never `catastroParcelProvider` itself, so the one honest branch that
 * existed was UNREACHABLE IN PRODUCTION (§L-13299). One rule, two implementations, with the
 * honest copy behind an identity check that can never be true. The shape is hoisted onto the
 * INTERFACE so a dishonest provider cannot compile.
 */
export type ParcelLookupOutcome =
    | { readonly status: 'ok'; readonly parcel: ParcelFeature }
    | { readonly status: 'miss' }
    | { readonly status: 'unreachable'; readonly reason: string };


/**
 * ⭐⭐ §AREA-IS-A-DECLARED-CAPABILITY (C57 §1.14) — THE FOUR FACTS AN AREA QUERY CAN CARRY.
 *
 * The overlay in C57 §5.5 draws the boundary lines of the parcels AROUND the selected one. That is
 * a different question from `fetchParcelOutcomeAtPoint`, and most cadastres cannot answer it: an
 * ArcGIS `identify` leg (CH, the AU/US rows) is a POINT service by construction, and no retry, no
 * key and no wider box will ever make it enumerate an area.
 *
 * ⛔ THE THREE STATUSES ARE NOT RANKED, THEY ARE DIFFERENT — and the one this type exists for is
 * the middle one:
 *   · `ok`          — the source enumerated the area. `parcels` MAY BE EMPTY: an answered-and-empty
 *                      area is a FACT about the land, and the overlay says so.
 *   · `unsupported` — this cadastre publishes NO area query at all. A durable statement about the
 *                      SOURCE, not about the land and not about today. It will not improve on retry,
 *                      so the chip is disabled with this `reason` rather than left spinning.
 *   · `unreachable` — it does publish one, and it did not answer. Transient; the chip stays live.
 *
 * ⛔ IF `unsupported` AND AN EMPTY `ok` RENDER THE SAME BLANK MAP, THAT IS §CONTEXT-DATA-HONESTY
 * (L-581 / L-616) SHIPPED AGAIN AT OVERLAY SCALE — "this country has no boundary service" and
 * "there are no parcels here" are the two values that must never coincide.
 */
export type ParcelAreaOutcome =
    | {
        readonly status: 'ok';
        readonly parcels: ReadonlyArray<ParcelFeature>;
        /**
         * ⚠ A FOURTH FACT, AND IT RIDES ON `ok`. Every area service caps its answer (`COUNT=`,
         * `count=`, a bbox ceiling). "That is all of them" and "that is all we asked for" are
         * different claims about the same drawing. A provider that cannot tell reports `true` —
         * the conservative arm, because under-claiming completeness is safe and over-claiming it
         * tells the user a boundary does not exist when it was merely not requested.
         */
        readonly truncated: boolean;
    }
    | { readonly status: 'unsupported'; readonly reason: string }
    | { readonly status: 'unreachable'; readonly reason: string };

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
     * ⛔ A NARROWING VIEW OF `fetchParcelOutcomeAtPoint`, NEVER A SECOND FETCH. Kept because many
     * callers genuinely do not need the distinction; every implementer MUST derive it from the
     * three-arm lookup below rather than running its own request, or the two will drift.
     *
     * Resolves the real cadastral parcel at a WGS84 point (the map click), or null when there is
     * no parcel there **or** the source did not answer — the flattening this signature forces, and
     * the reason any caller that renders a sentence to a user must call the honest one instead.
     * MUST never throw.
     */
    fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null>;
    /**
     * THE honest lookup: the same request, with `miss` and `unreachable` kept apart
     * (§CONTEXT-DATA-HONESTY — a FAILURE and an EMPTINESS must never share a value). Required, not
     * optional: an optional arm would re-create "some providers are honest, some are not", which is
     * the defect this interface change exists to remove. MUST never throw.
     */
    fetchParcelOutcomeAtPoint(lon: number, lat: number): Promise<ParcelLookupOutcome>;
    /**
     * C57 §1.14 — every parcel whose geometry falls within `radiusM` of the point, for the
     * boundary-lines overlay. **REQUIRED, not optional.** An optional method would re-create
     * exactly the split the three-arm lookup above was hoisted onto this interface to remove:
     * *some providers are honest, some are silent*. A cadastre that cannot enumerate an area
     * returns `{ status: 'unsupported' }` and says why — which is a real answer, and the only one
     * that lets a chip render "this cadastre publishes no boundary query" instead of a blank map.
     *
     * `radiusM` is bounded by the caller against the SITE SCOPE and a measured payload ceiling
     * (C57 §1.14.5) — never by the camera. MUST never throw.
     */
    fetchParcelsInArea(lon: number, lat: number, radiusM: number): Promise<ParcelAreaOutcome>;
}
