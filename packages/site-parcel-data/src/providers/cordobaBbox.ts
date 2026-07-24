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
