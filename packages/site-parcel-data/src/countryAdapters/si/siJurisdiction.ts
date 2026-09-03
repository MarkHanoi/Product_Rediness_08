// LANE SI — SLOVENIA (SI) · the candidate PRE-FILTER bbox + predicate for the national resolver.
//
// ⛔ THE BBOX IS A PRE-FILTER, NEVER THE DECIDER (L-12871). Routing SI is `claimsNation('SI')` in
// `parcelProviders/registry.ts` — the national-jurisdiction resolver's boundary-geometry claim, at
// the dataset's measured 1500 m tolerance — never this rectangle. This box exists for exactly two
// jobs, both of which the EE/LT/PL/SE jurisdiction files establish:
//   1. it is the resolver's cheap candidate pre-filter — `nationalJurisdictionResolver.ts`
//      registers `['SVN', isInSlovenia]` so a point that CANNOT be Slovenian is discarded before
//      the point-in-polygon test runs (that file's CANDIDATE_PREFILTERS contract);
//   2. it is the registry row's SPECIFICITY metric (`REGION_BBOX['SI']` → area), used only to
//      order rows WITHIN one claimed country / on the national-refusal fall-through.
//
// ⭐ WHY SI IS A `claimsNation` COUNTRY AND NOT AN AU-STYLE BBOX ROW. Australia (lane AU-OPEN) uses
// a bare bbox `contains` because it sits at lon 112–154°E where NO prefilter can match, so the
// resolver returns `no-national-candidate` and the registry keeps the bbox set. Slovenia is the
// opposite: it is wedged between ITALY (a modelled country) and AUSTRIA/CROATIA/HUNGARY, and its
// territory falls inside ITALY_BBOX along the west (Trieste/Gorizia band). A bare bbox row would
// therefore have to fight ITALY on area alone — exactly the smallest-box defect L-12871 removed.
// SI is promoted into the resolver's boundary set instead (SVN moved from refusal-only neighbour to
// a claimable country; Croatia + Hungary added as the new refusal-only neighbours SI now abuts), so
// the border is decided on geometry. See the resolver header and `data/nationalBoundaries.json`.
//
// ⛔ OVERLAP AUDIT — MEASURED 2026-09-03 against the boxes as declared in this repo today, each with
// a NAMED witness settlement inside the intersection (an overlap stated without a witness is the
// class of claim that rots — the SE lane's rule):
//
//   vs ITALY_BBOX  (35.3–47.2 / 6.6–18.6, agenziaEntrateParcelProvider.ts) → OVERLAP, MUTUAL.
//        The whole SI west sits in ITALY_BBOX (Koper 45.5481,13.7302 · Nova Gorica 45.9553,13.6493
//        are Slovenian and inside it); Trieste (45.6495,13.7768) and Gorizia (45.9401,13.6207) are
//        Italian and inside SLOVENIA_BBOX. No axis-aligned box separates Gorizia from Nova Gorica —
//        they are one street apart. The resolver's polygon claim + 1500 m tolerance is what tells
//        them apart (measured: Nova Gorica → SI, Gorizia → within-dataset-tolerance-of-rival refusal).
//   vs AUSTRIA     (no modelled bbox; AUT is a refusal-only neighbour) → the north edge (Klagenfurt
//        46.6247,14.3050 · Graz just above the box) is Austrian; the resolver refuses those
//        `claimed-by-unmodelled-neighbour`.
//   vs CROATIA     (no modelled bbox; HRV added as a refusal-only neighbour by this lane) → the
//        south/east (Zagreb 45.8150,15.9819 · the Kolpa/Sotla river band) is Croatian; without the
//        HRV neighbour the coarse SVN polygon annexed 7/10 border-hugging Croatian points to SI
//        (measured), so HRV+HUN were added — see the resolver + boundary-set change.
//   vs HUNGARY     (no modelled bbox; HUN added as a refusal-only neighbour by this lane) → the far
//        NE (Rédics/Bajánsenye band) is Hungarian; refused `claimed-by-unmodelled-neighbour`.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Slovenia (Adriatic SW ≈ 45.42°N; Goričko NE ≈ 46.88°N; Istria/Koper W ≈ 13.38°E; Prekmurje
 * E ≈ 16.61°E). Coarse rectangle — a proximity PRE-FILTER that only narrows the resolver's
 * candidate set and orders registry rows; the resolver's polygon geometry and the KN WFS's own
 * `absent` are the real "which country" / "nothing here" answers, not this box.
 */
export const SLOVENIA_BBOX: Bbox = { minLat: 45.4, maxLat: 46.9, minLon: 13.35, maxLon: 16.65 };

/** True when a WGS84 point falls inside {@link SLOVENIA_BBOX}. Pure; never throws. Pre-filter only. */
export function isInSlovenia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SLOVENIA_BBOX.minLat &&
        lat <= SLOVENIA_BBOX.maxLat &&
        lon >= SLOVENIA_BBOX.minLon &&
        lon <= SLOVENIA_BBOX.maxLon
    );
}

/**
 * The overlap audit as DATA, so a test asserts it instead of trusting the header. Each row names a
 * neighbouring box/country, whether they intersect, and a witness inside SLOVENIA_BBOX that belongs
 * to the OTHER country (or null when disjoint). `mutual` records whether Slovenian territory also
 * falls inside theirs. Only ITALY has a modelled routing bbox; AUT/HRV/HUN participate as the
 * resolver's refusal-only neighbours (AUT pre-existing; HRV+HUN added by this lane).
 */
export const SLOVENIA_BBOX_OVERLAP_AUDIT: readonly {
    readonly neighbour: string;
    readonly modelledBbox: boolean;
    readonly overlaps: boolean;
    readonly mutual: boolean;
    readonly witnessInsideSlovenia: { readonly name: string; readonly lat: number; readonly lon: number } | null;
}[] = [
    {
        neighbour: 'ITALY_BBOX',
        modelledBbox: true,
        overlaps: true,
        mutual: true,
        witnessInsideSlovenia: { name: 'Trieste (IT)', lat: 45.6495, lon: 13.7768 },
    },
    {
        neighbour: 'AUSTRIA (refusal-only neighbour)',
        modelledBbox: false,
        overlaps: true,
        mutual: true,
        witnessInsideSlovenia: { name: 'Klagenfurt (AT)', lat: 46.6247, lon: 14.305 },
    },
    {
        neighbour: 'CROATIA (refusal-only neighbour, added by lane SI)',
        modelledBbox: false,
        overlaps: true,
        mutual: true,
        witnessInsideSlovenia: { name: 'Zagreb (HR)', lat: 45.815, lon: 15.9819 },
    },
    {
        neighbour: 'HUNGARY (refusal-only neighbour, added by lane SI)',
        modelledBbox: false,
        overlaps: true,
        mutual: true,
        witnessInsideSlovenia: { name: 'Rédics (HU)', lat: 46.63, lon: 16.46 },
    },
];
