// LANE HR — CROATIA (HR) · the routing PRE-FILTER predicate + bbox (the sibling shape the EE
// adapter established: eeJurisdiction.ts's ESTONIA_BBOX + isInEstonia).
//
// ⛔ THIS BOX IS A PRE-FILTER, NEVER A ROUTING AUTHORITY (L-12871 / L-12887). CROATIA_BBOX
// {42.2–46.56 N, 13.4–19.45 E} is a coarse rectangle that OVERLAPS the boxes of its
// neighbours and of Italy — a rectangle is not a border:
//   • ITALY_BBOX (lon 6.6–18.5) covers the whole Croatian mainland — a Zagreb/Split point is
//     inside BOTH boxes; smallest-box would misroute across the Adriatic.
//   • Croatia's LAND neighbours SI · HU · RS · BA · ME all share long borders that no
//     rectangle separates (Nova Gorica ↔ Šempeter, Osijek ↔ the HU/RS bank, Dubrovnik ↔ the
//     BA Neum corridor).
// So the parcel registry routes Croatia on `claimsNation('HR')` — the national-jurisdiction
// resolver's boundary-geometry claim — NOT on this box. This file mints NO routing authority;
// it exists only as (a) the specificity metric the registry needs for every row and (b) the
// candidate pre-filter the resolver consults before deciding on real geometry.
//
// ⚠ DECLARED FOLLOW-UP (lane HR findings §Resolver): the national resolver's boundary set
// (`jurisdiction/data/nationalBoundaries.json`) models 16 claimable countries + 16 refusal-only
// neighbours; HRV is in NEITHER yet. Until HRV country geometry (+ HR's land-neighbour refusal
// geometry HUN/SRB/BIH/MNE; SVN is already a neighbour) is added to that set and `['HRV',
// isInCroatia]` to `CANDIDATE_PREFILTERS`, `claimsNation('HR')` is FALSE everywhere and the HR
// registry row is correct-by-construction but INERT (it can never misroute — the resolver can
// never emit regionCode 'HR' without the geometry). That wiring is a shared-decider lane with
// its own red-pin border tests; see audit/europe-adapters-2/2026-09-02/barrel-additions-hr.txt.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Croatia (mainland + Adriatic islands: Istria/Savudrija west ≈ 13.5°E; Ilok east ≈ 19.43°E;
 * Prevlaka/Palagruža south ≈ 42.2°N; Međimurje north ≈ 46.55°N). Coarse rectangle — a proximity
 * gate that only narrows the resolver's candidate set; the resolver's boundary geometry, and the
 * cadastre's own `absent`, are the real "which country / no parcel here" answers.
 */
export const CROATIA_BBOX: Bbox = { minLat: 42.2, maxLat: 46.56, minLon: 13.4, maxLon: 19.45 };

/**
 * True when a WGS84 point falls inside the coarse Croatia rectangle. Pure; never throws.
 * ⛔ Do NOT route on this alone — it is the resolver's pre-filter, not a sovereignty claim.
 */
export function isInCroatia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CROATIA_BBOX.minLat &&
        lat <= CROATIA_BBOX.maxLat &&
        lon >= CROATIA_BBOX.minLon &&
        lon <= CROATIA_BBOX.maxLon
    );
}
