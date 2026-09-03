// LANE HU — HUNGARY (HU) · the routing PRE-FILTER predicate + national bbox (E7-family §6.A; the
// L-613 framework routes on WGS84 point-in-bbox + smallest-box specificity, but since L-12871 the
// national DECIDER is `jurisdiction/nationalJurisdictionResolver.ts`, never a rectangle).
//
// ⛔ THIS BOX IS A PRE-FILTER, NOT A ROUTING AUTHORITY. The HU parcel row's `contains` is
// `claimsNation('HU')` (boundary geometry via the national resolver), NEVER `isInHungary`. This
// rectangle exists for exactly two mechanical jobs, the same two every sibling box does:
//   (1) the resolver's CANDIDATE_PREFILTERS cheap inclusive gate (it decides nothing — the ring
//       containment does), once HUN is added to `nationalBoundaries.json` (see §RESOLVER below);
//   (2) the registry's SPECIFICITY metric (`REGION_BBOX['HU']`), a within-country ordering number.
// Re-spelling it as a `contains` predicate would be the L-12871 defect (a smaller box is not a
// stronger claim to sovereignty), so `isInHungary` is deliberately NOT exported into the registry
// row.
//
// §RESOLVER — HU IS NOT YET A MODELLED COUNTRY IN THE NATIONAL RESOLVER (measured 2026-09-03):
// `nationalBoundaries.json` `countries` holds 16 keys and HUN is not one of them (nor is it a
// refusal-only `neighbour`). So `claimsNation('HU')` is FALSE everywhere until the shared resolver
// is extended — the HU registry row is therefore inert-but-SAFE (it can never misroute; a Budapest
// click falls to the universal footprint exactly as it does today). The exact, ready-to-apply
// resolver + boundaries additions — HUN rings, the `['HUN', isInHungary]` prefilter row, AND the
// HRV/SRB/ROU neighbour-integrity requirement (without those three the coastal-rescue would annex
// Croatian/Serbian/Romanian border-band points to HU — the L-12887 failure, and ROU collides with
// the concurrent RO lane) — are handed to the orchestrator in
// `audit/europe-adapters-2/2026-09-02/barrel-additions-hu.txt`. This lane does NOT edit the shared
// resolver or its 1 MB data file: adding a country there is a COORDINATED operation (the prior wave
// landed 5 countries + their neighbour rings in one commit with red-pinned border points), not a
// solo per-lane edit.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Hungary (Szentgotthárd west ≈ 16.11°E; the UA/RO tripoint east ≈ 22.90°E; Kelebia south
 * ≈ 45.74°N; the SK border north ≈ 48.585°N). Coarse rectangle — a PROXIMITY PRE-FILTER that only
 * proposes HU as a candidate to the national resolver; the resolver's boundary geometry, and then
 * the keyless INSPIRE CP service's own answer, are the real deciders. Padded to the theme extent
 * the WFS GetCapabilities declares (15.9466–23.1092 E / 45.6743–48.6417 N, Lechner 2026-09-03).
 */
export const HUNGARY_BBOX: Bbox = { minLat: 45.7, maxLat: 48.6, minLon: 16.1, maxLon: 22.95 };

/**
 * True when a WGS84 point falls inside {@link HUNGARY_BBOX}. Pure; never throws. INTENDED CONSUMER
 * is the national resolver's prefilter table — NOT the parcel registry row (which routes on
 * `claimsNation('HU')`). See the module header on why this is not a routing authority.
 */
export function isInHungary(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= HUNGARY_BBOX.minLat &&
        lat <= HUNGARY_BBOX.maxLat &&
        lon >= HUNGARY_BBOX.minLon &&
        lon <= HUNGARY_BBOX.maxLon
    );
}
