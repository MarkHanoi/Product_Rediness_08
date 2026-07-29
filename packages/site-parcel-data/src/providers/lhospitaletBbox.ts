// Envelope Phase 2 (ENVELOPE-IMPLEMENTATION-PLAN §1) — the L'Hospitalet de Llobregat
// (INE 08101) jurisdiction test (bbox). The SECOND Catalan municipality, wired to PROVE the
// "add-a-city = data at five slots" claim (S2 predicate + S5 registration + one L5 branch).
//
// PURE + tiny: a WGS84 point-in-bbox test used to route a just-committed parcel to the
// L'Hospitalet path (`applyLHospitaletZoningThenFallback`) rather than to Barcelona or the
// estimated default. It is the SAME object the dispatcher routes on (C57 §"one predicate" /
// C58 §1.5 — jurisdiction selection lives in adapters/data, never in the engine), imported by
// `registry.ts` as the jurisdiction's `extent`/`contains`, never restated.
//
// ⚠⚠ WHY THIS BOX IS TIGHT — AND MUST BE CHECKED **BEFORE** `isInBarcelona`. L'Hospitalet is
// physically INSIDE the loose Barcelona metropolitan box (`BARCELONA_BBOX`, 41.2–41.6 N /
// 1.9–2.4 E, which "deliberately keeps the whole AMB in"), so an L'Hospitalet parcel would
// otherwise be swallowed by the Barcelona branch and stamped with Barcelona's `es-08019` packs
// and height tables — a confident mis-citation on another municipality's land (the exact harm the
// honesty model forbids). Two things keep Barcelona byte-identical:
//   1. the dispatcher tests `isInLHospitalet` FIRST and returns, so only L'Hospitalet's own core
//      is peeled off; every Barcelona parcel still falls through to `isInBarcelona` unchanged;
//   2. this box is drawn CONSERVATIVELY around L'Hospitalet's core and stays clear of central
//      Barcelona (Sants ≈ 2.138 E, Eixample ≈ 2.165 E are all east of `maxLon` here), so it
//      cannot shadow a Barcelona reference point. Same reasoning as `cordobaBbox.ts`: a tight box
//      that under-covers is honest (a missed L'Hospitalet strip falls back to Barcelona/estimated,
//      itself gated), whereas an over-wide box that eats Barcelona is a regression.
//
// ⚠ AND EVEN INSIDE THIS BOX, THE BBOX AUTHORISES NOTHING. It is a proximity gate. The real answer
// is decided downstream by the dispatcher, and while `LHOSPITALET_ENVELOPE_VERIFIED` is false (it
// is — no human has verified that any L'Hospitalet clau's numbers/geometry equal Barcelona's) the
// dispatcher renders a cited REFUSAL for every parcel here — never a fabricated number.
// L'Hospitalet centre ≈ 41.359 N, 2.100 E falls comfortably inside the box.
//
// Strategic context — ENVELOPE-REPLICATION-STANDARD.md (S2), ENVELOPE-IMPLEMENTATION-PLAN.md §1
// Phase 2, C57 §"one predicate", C58 §1.5, C60 §3, §CONTEXT-DATA-HONESTY.

/**
 * A CONSERVATIVE bounding box around L'Hospitalet de Llobregat's core, deliberately kept west of
 * central Barcelona (Sants/Eixample) so it never shadows a Barcelona parcel. A COARSE proximity
 * claim, NOT an authorisation — the parcel-step verification gate is the real answer (C60 §3).
 */
export const LHOSPITALET_BBOX = {
    minLat: 41.335,
    maxLat: 41.385,
    minLon: 2.085,
    maxLon: 2.125,
} as const;

/** True when a WGS84 point falls within the conservative L'Hospitalet core bounding box. */
export function isInLHospitalet(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= LHOSPITALET_BBOX.minLat &&
        lat <= LHOSPITALET_BBOX.maxLat &&
        lon >= LHOSPITALET_BBOX.minLon &&
        lon <= LHOSPITALET_BBOX.maxLon
    );
}
