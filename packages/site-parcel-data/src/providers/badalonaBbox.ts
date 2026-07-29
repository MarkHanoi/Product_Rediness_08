// Envelope Phase 2 (cont.) — Badalona (INE 08015): the THIRD Catalan municipality, wired to extend
// the "add-a-city = data at five slots" proof (S2 predicate + S5 registration + one L5 branch).
// Mirrors lhospitaletBbox.ts exactly; the only per-city facts are the INE code + the core bbox.
//
// PURE + tiny: a WGS84 point-in-bbox test that routes a just-committed parcel to the Badalona path
// (`applyBadalonaZoningThenFallback`) rather than to Barcelona or the estimated default. Same object
// the dispatcher routes on (C57 §"one predicate" / C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine), imported by `registry.ts` as the jurisdiction's extent.
//
// ⚠⚠ WHY THIS BOX IS TIGHT — AND MUST BE CHECKED **BEFORE** `isInBarcelona`. Badalona sits INSIDE
// the loose Barcelona metropolitan box (`BARCELONA_BBOX`, 41.2–41.6 N / 1.9–2.4 E, which keeps the
// whole AMB in), so a Badalona parcel would otherwise be swallowed by the Barcelona branch and
// stamped with Barcelona's `es-08019` packs + height tables — a confident mis-citation on another
// municipality's land. Two things keep Barcelona (and L'Hospitalet) byte-identical:
//   1. the dispatcher tests `isInBadalona` (and `isInLHospitalet`) BEFORE `isInBarcelona`, so only
//      each own core is peeled off; every Barcelona parcel still falls through unchanged;
//   2. this box is drawn CONSERVATIVELY around Badalona's core, EAST of the Besòs (Barcelona's
//      Sant Martí/Sant Adrià are all west of `minLon` here, ≈2.20–2.21 E), so it cannot shadow a
//      Barcelona reference point, and it is disjoint from the L'Hospitalet box (SW, 2.085–2.125 E).
//      A tight box that under-covers is honest (a missed Badalona strip falls back to Barcelona/
//      estimated, itself gated); an over-wide box that eats Barcelona would be a regression.
//
// ⚠ AND EVEN INSIDE THIS BOX, THE BBOX AUTHORISES NOTHING. It is a proximity gate; the answer is
// decided downstream, and while `BADALONA_ENVELOPE_VERIFIED` is false (it is) the dispatcher renders
// a cited REFUSAL for every parcel here — never a fabricated number. Badalona centre ≈ 41.450 N,
// 2.247 E falls comfortably inside the box.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md (S2), ENVELOPE-IMPLEMENTATION-PLAN.md §1
// Phase 2, C57 §"one predicate", C58 §1.5, C60 §3, §CONTEXT-DATA-HONESTY.

/**
 * A CONSERVATIVE bounding box around Badalona's core, kept EAST of the Besòs (clear of Barcelona's
 * easternmost districts + Sant Adrià) and disjoint from the L'Hospitalet box, so it never shadows a
 * Barcelona or L'Hospitalet parcel. A COARSE proximity claim, NOT an authorisation (C60 §3).
 */
export const BADALONA_BBOX = {
    minLat: 41.420,
    maxLat: 41.470,
    minLon: 2.228,
    maxLon: 2.268,
} as const;

/** True when a WGS84 point falls within the conservative Badalona core bounding box. */
export function isInBadalona(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= BADALONA_BBOX.minLat &&
        lat <= BADALONA_BBOX.maxLat &&
        lon >= BADALONA_BBOX.minLon &&
        lon <= BADALONA_BBOX.maxLon
    );
}
