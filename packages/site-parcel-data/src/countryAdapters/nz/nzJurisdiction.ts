// LANE NZ-EVERYWHERE — NEW ZEALAND (NZ) · the routing predicate + bbox for the parcel-provider registry.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A BBOX PREDICATE (the TR/AU idiom), NOT `claimsNation`
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// New Zealand has no polygon in `nationalJurisdictionResolver`'s boundary set and is not one of its
// un-modelled neighbours, so `claimsNation('NZ')` can never be true — it would make the row dead
// code. NZ routes on a rectangle, like Turkey and the AU states: the national resolver returns
// `no-national-candidate` (a REFUSAL, not a claim) for every NZ point, and on that refusal the
// registry keeps the bbox-matched set — so this row survives with no change to the resolver.
//
// NO OVERLAP WITH ANY REGISTERED BOX — BY CONSTRUCTION
// ───────────────────────────────────────────────────────────────────────────────────────────────
// NZ sits at 166.0–178.7 E, 47.5–34.3 S. The easternmost registered box is AU-NSW/AU-QLD at 153.7 E
// (Tasman Sea between: ~12° of open water), so no other row can ever match an NZ point and no NZ
// point can match another row — `nzRegistryWiring.test.ts` asserts Auckland/Wellington/Christchurch
// offer exactly ['NZ'] and Sydney/Melbourne/Hobart never contain it. The box deliberately stops WEST
// of the antimeridian: the Chatham Islands (~176.5 W) are outside, matching the bake/terrain bboxes
// (osmium/mercator bboxes cannot wrap) — a `chathams` row is the honest extension if ever needed.
//
// PURE — data + point-in-rectangle. No I/O. Never throws.

/** A WGS84 routing rectangle (mirrors REGION_BBOX's shape — the specificity metric). */
export interface NzBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * New Zealand — both main islands + Stewart Island (Invercargill 46.4 S, Cape Reinga 34.4 S,
 * Fiordland 166.5 E, East Cape 178.6 E). A router, not a boundary and NOT a sovereignty claim —
 * LINZ's own answer (a parcel, or an empty collection) decides whether a parcel exists at the point.
 * Identical to bake.mjs `newzealand` and terrain.mjs NATIONAL_REGIONS `newzealand` (166.0,-47.5,178.7,-34.3).
 */
export const NEW_ZEALAND_BBOX: NzBbox = { minLat: -47.5, maxLat: -34.3, minLon: 166.0, maxLon: 178.7 };

/** True when a WGS84 point should route to the LINZ national cadastre. Pure; never throws. */
export function isInNewZealand(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= NEW_ZEALAND_BBOX.minLat &&
        lat <= NEW_ZEALAND_BBOX.maxLat &&
        lon >= NEW_ZEALAND_BBOX.minLon &&
        lon <= NEW_ZEALAND_BBOX.maxLon
    );
}
