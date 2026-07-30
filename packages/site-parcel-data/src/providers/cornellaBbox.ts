// Envelope Phase 2 (cont.) — Cornellà de Llobregat (INE 08073): the FIFTH Catalan municipality, wired
// to extend the "add-a-city = data at five slots" proof (S2 predicate + S5 registration + one L5 branch).
// Mirrors santBoiBbox.ts exactly; the only per-city facts are the INE code + the core bbox.
//
// PURE + tiny: a WGS84 point-in-bbox test that routes a just-committed parcel to the Cornellà path
// (`applyCornellaZoningThenFallback`) rather than to Barcelona or the estimated default. Same object
// the dispatcher routes on (C57 §"one predicate" / C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine), imported by `registry.ts` as the jurisdiction's extent.
//
// ⚠⚠ WHY THIS BOX IS TIGHT — AND MUST BE CHECKED **BEFORE** `isInBarcelona`. Cornellà sits INSIDE
// the loose Barcelona metropolitan box (`BARCELONA_BBOX`, 41.2–41.6 N / 1.9–2.4 E, which keeps the
// whole AMB in), so a Cornellà parcel would otherwise be swallowed by the Barcelona branch and
// stamped with Barcelona's `es-08019` packs + height tables — a confident mis-citation on another
// municipality's land. Two things keep Barcelona (and Sant Boi, L'Hospitalet, Badalona) byte-identical:
//   1. the dispatcher tests `isInCornella` (and `isInSantBoi`, `isInLHospitalet`, `isInBadalona`)
//      BEFORE `isInBarcelona`, so only each own core is peeled off; every Barcelona parcel still falls
//      through unchanged;
//   2. this box is drawn CONSERVATIVELY around Cornellà's core, in the NARROW gap on the east bank of
//      the Llobregat BETWEEN Sant Boi (to the west) and L'Hospitalet (to the east): its `minLon`
//      ≈ 2.060 E sits clear of the Sant Boi box (2.020–2.058 E) and its `maxLon` ≈ 2.082 E sits clear
//      of the L'Hospitalet box (2.085–2.125 E), and it is far west of central Barcelona's Sants
//      ≈ 2.138 E / Eixample ≈ 2.165 E and of the Badalona box (NE, 2.228–2.268 E). So it cannot shadow
//      a Barcelona reference point and is disjoint from every already-wired city box. A tight box that
//      under-covers is honest (a missed Cornellà strip falls back to Barcelona/estimated, itself
//      gated); an over-wide box that eats a neighbour would be a regression.
//
// ⚠ AND EVEN INSIDE THIS BOX, THE BBOX AUTHORISES NOTHING. It is a proximity gate; the answer is
// decided downstream, and while `CORNELLA_ENVELOPE_VERIFIED` is false (it is) the dispatcher renders
// a cited REFUSAL for every parcel here — never a fabricated number. Cornellà centre ≈ 41.360 N,
// 2.070 E falls comfortably inside the box.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md (S2), ENVELOPE-IMPLEMENTATION-PLAN.md §1
// Phase 2, C57 §"one predicate", C58 §1.5, C60 §3, §CONTEXT-DATA-HONESTY.

/**
 * A CONSERVATIVE bounding box around Cornellà de Llobregat's core, kept in the narrow gap on the EAST
 * bank of the Llobregat BETWEEN Sant Boi (west) and L'Hospitalet (east), so it never shadows a
 * Barcelona parcel and is disjoint from every already-wired city box. A COARSE proximity claim, NOT
 * an authorisation (C60 §3).
 */
export const CORNELLA_BBOX = {
    minLat: 41.345,
    maxLat: 41.372,
    minLon: 2.060,
    maxLon: 2.082,
} as const;

/** True when a WGS84 point falls within the conservative Cornellà de Llobregat core bounding box. */
export function isInCornella(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CORNELLA_BBOX.minLat &&
        lat <= CORNELLA_BBOX.maxLat &&
        lon >= CORNELLA_BBOX.minLon &&
        lon <= CORNELLA_BBOX.maxLon
    );
}
