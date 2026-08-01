// C58 §1.5 / C60 §3 — the Córdoba (INE 14021) PGOU-2001 PILOT jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-bbox test used to route a just-committed parcel to the Córdoba
// path (`applyCordobaZoningThenFallback`) rather than the estimated default. Mirrors
// `isInBarcelona` / `isInDenmark`: a loose proximity gate that short-circuits a plot outside the
// covered area before any provider round-trip.
//
// ⚠ WHY THIS BOX IS TIGHT, NOT A METROPOLITAN AREA. Barcelona's box deliberately keeps the whole
// AMB in, because Barcelona coverage is city-wide. Córdoba coverage is NOT: the COACo
// `coaco:ordenanzas` layer is a **2-district pilot** — only the **Sur** and **Noroeste** districts
// (`coaco:distritos` = exactly 2 features), an extent of ≈ 3.4 × 4.8 km around the historic centre.
// A parcel in Córdoba city but OUTSIDE those two districts is NOT covered, and routing it here
// would be a false coverage claim (C60 §3: the site-entry globe must light only what the engine can
// actually answer). So the box is the pilot extent from the pack's WIRING-TODO 4, not the city.
//
// ⚠ AND EVEN INSIDE THIS BOX, THE BBOX AUTHORISES NOTHING. It is a proximity gate. The real answer
// is decided downstream by the dispatcher, and while `sources/VERIFICATION.md` is unsigned the
// dispatcher's honesty gate renders a cited REFUSAL for every parcel here — never a number. Córdoba
// centre ≈ 37.88 N, 4.78 W falls inside the box.
//
// Strategic context — esCordobaPGOU2001.ts (WIRING-TODO 4/5), findings/CALIFICACION-ENDPOINT-PROBE.md,
// C58 §1.5, C60 §3, §CONTEXT-DATA-HONESTY.

/**
 * The COACo Sur + Noroeste pilot extent (the pack's WIRING-TODO 4 bbox). A COARSE proximity claim,
 * NOT an authorisation — the parcel-step refusal/verification gate is the real answer (C60 §3).
 */
export const CORDOBA_BBOX = {
    minLat: 37.8558,
    maxLat: 37.8986,
    minLon: -4.8077,
    maxLon: -4.7691,
} as const;

/** True when a WGS84 point falls within the loose Córdoba Sur + Noroeste pilot bounding box. */
export function isInCordoba(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CORDOBA_BBOX.minLat &&
        lat <= CORDOBA_BBOX.maxLat &&
        lon >= CORDOBA_BBOX.minLon &&
        lon <= CORDOBA_BBOX.maxLon
    );
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CORDOBA-MUNICIPAL-CLOSURE — THE REST OF THE MUNICIPALITY, AND WHY IT NEEDED ITS OWN BOX
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠⚠ THE DEFECT THIS CLOSES, MEASURED 2026-08-01, NOT ASSUMED. `CORDOBA_BBOX` above is the
// 2-district pilot. A parcel in Córdoba but OUTSIDE it matched `isInCordoba === false`, then every
// other jurisdiction predicate in `applyZoning`, and landed on `applyEstimatedZoning`. Its §L-663
// guard asks `resolveRegisteredJurisdictionAt` — and NOTHING claimed the point, because Córdoba's
// only registration was the pilot and there is no Andalucía or Spain-wide registration. `'none'`
// means "genuinely uncovered land — the estimate is honest here", so PRYZM PUBLISHED the generic
// estimated triple (3,0 / 1,5 / 3,0 m, FAR 2,00, coverage 50 %) on the ~92 % of Córdoba's urban
// fabric the pilot does not cover. That is a fabricated envelope on land we have read no article
// about — the exact §CONTEXT-DATA-HONESTY collapse §L-663 was written to end, surviving because
// the hole is in the REGISTRY, not in the chokepoint.
//
// ⚠ REGISTERING A BOX IS NOT CLAIMING COVERAGE — it is the OPPOSITE here. This box carries NO pack
// (`packsByZone` is empty by construction) and its only product is a CITED REFUSAL naming what
// COACo does and does not publish. It is the Catalonia pattern (`esCatalunya.ts`,
// §CATALUNYA-REGIONAL-RUNG) applied one rung down: answer where nothing else does, with a "no",
// so the estimate can never be the answer. Under §JURISDICTION-SPECIFICITY the pilot's `'district'`
// registration out-ranks this `'municipal'` one automatically inside the pilot, with no ordering
// edit anywhere — which is why the pilot box is declared `'district'` in the first place.
//
// PROVENANCE OF THE NUMBERS (the Murcia convention, `murciaBbox.ts`): the extent of **OSM relation
// 343207** — `boundary=administrative`, `admin_level=8`, `ine:municipio=14021` — read live from
// Nominatim on **2026-08-01** as `[37.6658228, 38.0315171, -4.9985994, -4.3514283]`, rounded
// OUTWARD to whole hundredths so the gate can only ever be too generous, never too tight. A
// too-generous coarse gate costs one extra cited refusal; a too-tight one silently drops a real
// Córdoba parcel back onto the fabricated estimate, which is the failure being closed.
//
// ⚠ IT SPILLS, LIKE EVERY BBOX, AND THE SPILL IS BOUNDED BY THE COPY. Córdoba's municipal term is
// ~1 255 km² and irregular; this rectangle necessarily sweeps in parts of Almodóvar del Río,
// Villaviciosa, Obejo, Villafranca and El Carpio. The refusal it produces makes NO claim about any
// municipality's ordinance — it states only what COACo publishes and what PRYZM therefore cannot
// answer — so a spilled click gets a true statement, never a mis-citation (the discipline
// §CATALUNYA-SPILL settles by INE code and this one settles by saying less).

/**
 * The municipal term of Córdoba (INE 14021) — the CLOSURE box, not a coverage claim. Its whole
 * purpose is to make the generic estimated envelope unreachable in Córdoba outside the 2-district
 * pilot, replacing it with a cited "COACo publishes no calificación for this land" refusal.
 */
export const CORDOBA_MUNICIPAL_BBOX = {
    minLat: 37.66,
    maxLat: 38.04,
    minLon: -5.0,
    maxLon: -4.35,
} as const;

/**
 * True when a WGS84 point falls within the loose Córdoba MUNICIPAL bounding box. ⚠ True for the
 * pilot too (the pilot is inside the municipality) — precedence is settled by
 * §JURISDICTION-SPECIFICITY (`'district'` beats `'municipal'`), never by this predicate.
 */
export function isInCordobaMunicipality(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CORDOBA_MUNICIPAL_BBOX.minLat &&
        lat <= CORDOBA_MUNICIPAL_BBOX.maxLat &&
        lon >= CORDOBA_MUNICIPAL_BBOX.minLon &&
        lon <= CORDOBA_MUNICIPAL_BBOX.maxLon
    );
}
