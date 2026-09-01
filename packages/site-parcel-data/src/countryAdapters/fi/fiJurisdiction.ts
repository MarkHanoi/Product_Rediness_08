// E7-FI — FINLAND (FI) · the routing predicate + bbox.
//
// ⛔ THIS MODULE MINTS NOTHING. It ADOPTS and re-exports the EXISTING authority.
//
// The §6-A convention (impl/e7-family-extraction-verdict.md) says each country adapter carries
// `interface Bbox` + `<COUNTRY>_BBOX` + `isIn<Country>`, copying the shape from
// `ee/eeJurisdiction.ts`. For Finland that instruction is SUPERSEDED by §6-B ("NEVER MINT A
// RIVAL") and by the standing review rule this lane was briefed with, because Finland's
// predicate ALREADY EXISTS and is BETTER than a fresh rectangle would be:
//
//   `parcelProviders/mmlParcelProvider.ts:167` — FINLAND_BBOX
//   `parcelProviders/mmlParcelProvider.ts:177` — ALAND_EXCLUSION
//   `parcelProviders/mmlParcelProvider.ts:183` — isInFinland  (= FINLAND_BBOX minus Åland)
//
// ⭐ THE ÅLAND SUBTRACTION IS THE REASON THIS MATTERS, NOT A STYLE PREFERENCE. Åland
// (Ahvenanmaa) is a separate jurisdiction with its own land registry by statute, and the
// existing predicate subtracts it. A copy-pasted plain rectangle in this directory would
// silently route Mariehamn to the Finnish national services — a wrong-jurisdiction answer that
// parses clean. `sourceRegistry/fi.ts` records the same caveat on the MML row
// ("national, Åland excluded (separate jurisdiction)").
//
// ⚠ AND THIS WOULD HAVE BEEN RECURRENCE SIX. `impl/e7-family-extraction-verdict.md` §7 records
// that `eeJurisdiction.ts`, `ltJurisdiction.ts` and `plJurisdiction.ts` each duplicate
// `parcelProviders/countryBbox.ts`'s `CountryBbox` + `within()` byte-for-byte, making
// recurrences three, four and five of a drift already logged twice
// (`agenziaEntrateParcelProvider.ts:595`, `dgtParcelProvider.ts:67`). Finland is the first
// country in the wave where the predicate ALREADY EXISTED, so copying the sibling shape here
// would have been the cheapest and most invisible recurrence yet. It is refused.
//
// OVERLAP AUDIT (the registry rule — check before registering; measured 2026-09-01):
//   • FINLAND_BBOX minLat 59.7 vs ESTONIA_BBOX maxLat 59.7 — they TOUCH at the 59.7°N edge and
//     do not overlap in the interior (`ee/eeJurisdiction.ts` states the same audit from the
//     other side: "Tallinn 59.44°N is well inside EE; Helsinki 60.17°N is inside FI").
//   • FINLAND_BBOX minLon 20.5 vs LITHUANIA_BBOX maxLon 26.9 / maxLat 56.5 — no latitude
//     overlap at all (LT maxLat 56.5 < FI minLat 59.7).
//   • NORWAY_BBOX (`countryBbox.ts:56`, minLat 57.8 maxLat 71.4, minLon 4.4 maxLon 31.3)
//     OVERLAPS FINLAND_BBOX across the whole Finnish north — this is the SAME class of defect
//     as L-12871 (LT/PL/DE), and it is NOT resolved here. Norway is not currently registered in
//     `parcelProviders/registry.ts` for a Finnish point, so nothing mis-routes today, but the
//     boxes DO overlap and a future NO registration would need precedence.
//   ⛔ NO PARCEL PROVIDER IS REGISTERED BY THIS LANE (L-12871 is OPEN). `mmlParcelProvider.ts`
//     already carries its own `TODO(orchestrator)` registration note at line 67; that note, not
//     this file, is the FI registration seat. See impl/barrel-additions-fi.txt.

export {
    ALAND_EXCLUSION,
    FINLAND_BBOX,
    isInFinland,
} from '../../parcelProviders/mmlParcelProvider.js';
