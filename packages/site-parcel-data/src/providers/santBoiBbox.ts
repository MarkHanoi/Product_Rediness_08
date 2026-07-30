// Envelope Phase 2 (cont.) — Sant Boi de Llobregat (INE 08200): the FOURTH Catalan municipality, wired
// to extend the "add-a-city = data at five slots" proof (S2 predicate + S5 registration + one L5 branch).
// Mirrors badalonaBbox.ts exactly; the only per-city facts are the INE code + the core bbox.
//
// PURE + tiny: a WGS84 point-in-bbox test that routes a just-committed parcel to the Sant Boi path
// (`applySantBoiZoningThenFallback`) rather than to Barcelona or the estimated default. Same object
// the dispatcher routes on (C57 §"one predicate" / C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine), imported by `registry.ts` as the jurisdiction's extent.
//
// ⚠⚠ WHY THIS BOX IS TIGHT — AND MUST BE CHECKED **BEFORE** `isInBarcelona`. Sant Boi sits INSIDE
// the loose Barcelona metropolitan box (`BARCELONA_BBOX`, 41.2–41.6 N / 1.9–2.4 E, which keeps the
// whole AMB in), so a Sant Boi parcel would otherwise be swallowed by the Barcelona branch and
// stamped with Barcelona's `es-08019` packs + height tables — a confident mis-citation on another
// municipality's land. Two things keep Barcelona (and L'Hospitalet, and Badalona) byte-identical:
//   1. the dispatcher tests `isInSantBoi` (and `isInLHospitalet`, `isInBadalona`) BEFORE
//      `isInBarcelona`, so only each own core is peeled off; every Barcelona parcel still falls
//      through unchanged;
//   2. this box is drawn CONSERVATIVELY around Sant Boi's core, on the EAST bank of the Llobregat and
//      WEST of L'Hospitalet (its `maxLon` ≈ 2.058 E sits clear of the L'Hospitalet box, 2.085–2.125 E,
//      and far west of central Barcelona's Sants ≈ 2.138 E / Eixample ≈ 2.165 E), so it cannot shadow
//      a Barcelona or L'Hospitalet reference point, and it is disjoint from the Badalona box (NE,
//      2.228–2.268 E). A tight box that under-covers is honest (a missed Sant Boi strip falls back to
//      Barcelona/estimated, itself gated); an over-wide box that eats Barcelona would be a regression.
//
// ⚠ AND EVEN INSIDE THIS BOX, THE BBOX AUTHORISES NOTHING. It is a proximity gate; the answer is
// decided downstream, and while `SANT_BOI_ENVELOPE_VERIFIED` is false (it is) the dispatcher renders
// a cited REFUSAL for every parcel here — never a fabricated number. Sant Boi centre ≈ 41.344 N,
// 2.038 E falls comfortably inside the box.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md (S2), ENVELOPE-IMPLEMENTATION-PLAN.md §1
// Phase 2, C57 §"one predicate", C58 §1.5, C60 §3, §CONTEXT-DATA-HONESTY.

/**
 * A CONSERVATIVE bounding box around Sant Boi de Llobregat's core, kept on the EAST bank of the
 * Llobregat and WEST of L'Hospitalet, so it never shadows a Barcelona or L'Hospitalet parcel and is
 * disjoint from the Badalona box. A COARSE proximity claim, NOT an authorisation (C60 §3).
 */
export const SANT_BOI_BBOX = {
    minLat: 41.328,
    maxLat: 41.358,
    minLon: 2.020,
    maxLon: 2.058,
} as const;

/** True when a WGS84 point falls within the conservative Sant Boi de Llobregat core bounding box. */
export function isInSantBoi(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SANT_BOI_BBOX.minLat &&
        lat <= SANT_BOI_BBOX.maxLat &&
        lon >= SANT_BOI_BBOX.minLon &&
        lon <= SANT_BOI_BBOX.maxLon
    );
}
