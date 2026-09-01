// LANE E7-SE — SWEDEN (SE) · the routing predicate + national bbox (E7-family conventions §6.A;
// the L-613 framework routes on WGS84 point-in-bbox + smallest-box specificity).
//
// ⛔ OVERLAP AUDIT — MEASURED 2026-09-01, and it is the WORST in the repo so far. L-12871 (three
// overlapping country boxes: LT/PL/DE) is OPEN; SWEDEN_BBOX makes it FIVE more pairs, because
// Sweden is 1,570 km long and shares four maritime/land frontiers. Every number below is a
// rectangle intersection computed against the box as it is declared in this repo TODAY, with a
// NAMED real settlement inside each intersection — an overlap stated as "minor" with no witness
// point is the class of claim that rots:
//
//   vs DENMARK_BBOX   (54.4–57.9 / 7.7–15.3, providers/denmarkBbox.ts)      → OVERLAP, MUTUAL.
//        lat[55.3,57.9] × lon[10.9,15.3]. København (55.6761,12.5683) is DANISH and inside
//        SWEDEN_BBOX; Malmö (55.6050,13.0038) is SWEDISH and inside DENMARK_BBOX. The two
//        cities are ~25 km apart across the Öresund: NO axis-aligned box can separate them.
//   vs NORWAY_BBOX    (57.8–71.4 / 4.4–31.3, parcelProviders/countryBbox.ts) → OVERLAP, MUTUAL.
//        lat[57.8,69.1] × lon[10.9,24.2]. Røros (62.5744,11.3842) is NORWEGIAN and inside
//        SWEDEN_BBOX; Kiruna (67.8558,20.2253) is SWEDISH and inside NORWAY_BBOX.
//   vs FINLAND_BBOX   (59.7–70.1 / 20.5–31.6, parcelProviders/mmlParcelProvider.ts) → OVERLAP,
//        MUTUAL. lat[59.7,69.1] × lon[20.5,24.2]. Tornio (65.8482,24.1467) is FINNISH and
//        inside SWEDEN_BBOX; Haparanda (65.8356,24.1345) is SWEDISH and inside FINLAND_BBOX —
//        the two are one bridge apart on the Torne river.
//        ⚠ `mmlParcelProvider.ts:86` states "FINLAND_BBOX does not overlap any". That sentence
//        is FALSIFIED by this box the day it is declared. It is not edited here (barrel
//        protocol — that file is not this lane's), it is REPORTED: impl/lane-e7-se.md §7.
//   vs ESTONIA_BBOX   (57.5–59.7 / 21.7–28.25, countryAdapters/ee/eeJurisdiction.ts) → OVERLAP,
//        ONE-WAY. lat[57.5,59.7] × lon[21.7,24.2]. Kuressaare (58.2528,22.4869) is ESTONIAN and
//        inside SWEDEN_BBOX. No Swedish land is inside ESTONIA_BBOX (Gotland's east coast is
//        ≈19.4°E, west of EE's 21.7°E minimum).
//   vs LITHUANIA_BBOX (53.85–56.5 / 20.9–26.9, countryAdapters/lt/ltJurisdiction.ts) → OVERLAP,
//        ONE-WAY. lat[55.3,56.5] × lon[20.9,24.2]. Klaipėda (55.7033,21.1443) is LITHUANIAN and
//        inside SWEDEN_BBOX. No Swedish land is inside LITHUANIA_BBOX.
//   vs GERMANY_BBOX   (47.2–55.1 / 5.8–15.1)   → NO overlap: 55.1 < 55.3 (Sweden's southern tip,
//        Smygehuk, is 55.3367°N — the box's minLat is set BY that point, not by convenience).
//   vs POLAND_BBOX    (49.0–54.84 / 14.12–24.15) → NO overlap: 54.84 < 55.3.
//
// ⛔ THEREFORE: NO PARCEL PROVIDER IS REGISTERED BY THIS LANE (E7-family conventions §6.D).
// Five of the seven neighbours overlap, and a smallest-box specificity resolver would hand
// København to a Swedish provider on area alone. The registration line is written to
// audit/europe-site-intel/2026-08-31/impl/barrel-additions-se.txt WITH this audit, and it stays
// there until L-12871 has precedence data. In any case the Swedish cadastre is credential-gated
// (see seParcelProvider.ts), so there is nothing to route to yet — but the box would have been
// wrong even if there were.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Sweden (Smygehuk south ≈ 55.3367°N; Treriksröset north ≈ 69.06°N; Kosterhavet west ≈ 10.96°E;
 * Haparanda east ≈ 24.16°E). Coarse rectangle — a proximity gate that only decides WHICH national
 * service to try; the service's own `absent` is the real "nothing here" answer, and per the audit
 * above this box is NOT sufficient on its own to decide nationality anywhere along five frontiers.
 */
export const SWEDEN_BBOX: Bbox = { minLat: 55.3, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 };

/** True when a WGS84 point falls inside {@link SWEDEN_BBOX}. Pure; never throws. */
export function isInSweden(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SWEDEN_BBOX.minLat &&
        lat <= SWEDEN_BBOX.maxLat &&
        lon >= SWEDEN_BBOX.minLon &&
        lon <= SWEDEN_BBOX.maxLon
    );
}

/**
 * The overlap audit as DATA, so a test can assert it instead of a reader having to trust the
 * header comment. Each row names the neighbouring box, whether the rectangles intersect, and a
 * witness point that is inside SWEDEN_BBOX while belonging to the OTHER country (or null when
 * the boxes are disjoint). `mutual` records whether Swedish territory also falls inside theirs.
 */
export const SWEDEN_BBOX_OVERLAP_AUDIT: readonly {
    readonly neighbour: string;
    readonly box: Bbox;
    readonly overlaps: boolean;
    readonly mutual: boolean;
    readonly witnessInsideSweden: { readonly name: string; readonly lat: number; readonly lon: number } | null;
}[] = [
    {
        neighbour: 'DENMARK_BBOX',
        box: { minLat: 54.4, maxLat: 57.9, minLon: 7.7, maxLon: 15.3 },
        overlaps: true,
        mutual: true,
        witnessInsideSweden: { name: 'København (DK)', lat: 55.6761, lon: 12.5683 },
    },
    {
        neighbour: 'NORWAY_BBOX',
        box: { minLat: 57.8, maxLat: 71.4, minLon: 4.4, maxLon: 31.3 },
        overlaps: true,
        mutual: true,
        witnessInsideSweden: { name: 'Røros (NO)', lat: 62.5744, lon: 11.3842 },
    },
    {
        neighbour: 'FINLAND_BBOX',
        box: { minLat: 59.7, maxLat: 70.1, minLon: 20.5, maxLon: 31.6 },
        overlaps: true,
        mutual: true,
        witnessInsideSweden: { name: 'Tornio (FI)', lat: 65.8482, lon: 24.1467 },
    },
    {
        neighbour: 'ESTONIA_BBOX',
        box: { minLat: 57.5, maxLat: 59.7, minLon: 21.7, maxLon: 28.25 },
        overlaps: true,
        mutual: false,
        witnessInsideSweden: { name: 'Kuressaare (EE)', lat: 58.2528, lon: 22.4869 },
    },
    {
        neighbour: 'LITHUANIA_BBOX',
        box: { minLat: 53.85, maxLat: 56.5, minLon: 20.9, maxLon: 26.9 },
        overlaps: true,
        mutual: false,
        witnessInsideSweden: { name: 'Klaipėda (LT)', lat: 55.7033, lon: 21.1443 },
    },
    {
        neighbour: 'GERMANY_BBOX',
        box: { minLat: 47.2, maxLat: 55.1, minLon: 5.8, maxLon: 15.1 },
        overlaps: false,
        mutual: false,
        witnessInsideSweden: null,
    },
    {
        neighbour: 'POLAND_BBOX',
        box: { minLat: 49.0, maxLat: 54.84, minLon: 14.12, maxLon: 24.15 },
        overlaps: false,
        mutual: false,
        witnessInsideSweden: null,
    },
];
