// LANE E6-PL — POLAND (PL) · the routing predicate + bbox, on the EE shape
// (`countryAdapters/ee/eeJurisdiction.ts`): a WGS84 point-in-bbox proximity gate that only
// decides WHICH national service to try. The service's own `absent` is the real
// "no parcel here" answer — never this rectangle.
//
// ⚠ OVERLAP AUDIT (the registry rule — run BEFORE registering, and MEASURED here, not assumed).
// Registered boxes read 2026-09-01 (`parcelProviders/countryBbox.ts` + the per-provider files):
// SPAIN, FRANCE, NETHERLANDS, NORWAY, GERMANY, NRW, SWITZERLAND, SAUDI_ARABIA, ITALY,
// PORTUGAL, FINLAND, plus the sub-national boxes (Brussels, Flanders, Wallonia, England,
// Scotland, and the US city boxes). Against POLAND_BBOX:
//
//   • GERMANY_BBOX {47.2..55.1, 5.8..15.1} OVERLAPS this box in the strip
//     lon 14.12..15.1 × lat 49.0..54.83 — REAL German territory (Frankfurt (Oder) 14.55°E,
//     Görlitz 14.99°E) sits inside it. Area: PL ≈ 5.83 × 10.08 ≈ 58.8 deg², DE ≈ 7.9 × 9.3
//     ≈ 73.5 deg², so a smallest-box specificity resolver would route that strip to POLAND —
//     WRONGLY for the German side of the Oder/Nysa. ⛔ THIS ADAPTER IS THEREFORE NOT
//     REGISTERED in `parcelProviders/registry.ts` (that file is out of this lane's scope, and
//     registering behind a known-wrong overlap would be the defect, not the fix). Whoever
//     wires it must add an explicit precedence rule or a border-aware predicate FIRST.
//   • FINLAND {59.7..70.1} · NORWAY {57.8..71.4} · EE {57.5..59.7} — no latitude overlap.
//   • NETHERLANDS {3.3..7.3°E} · SWITZERLAND · ITALY · IBERIA — no longitude overlap.
//   • Czechia, Slovakia, Ukraine, Belarus, Lithuania, Kaliningrad — UNREGISTERED today, so
//     this box is unopposed along those borders too; the same caveat applies in reverse when
//     any of them is registered.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Poland (mainland; no overseas territory). Extremes: north Jastrzębia Góra ≈ 54.84°N,
 * south Opołonek ≈ 49.00°N, west Osinów Dolny ≈ 14.12°E, east Zosin ≈ 24.15°E. Coarse
 * rectangle, deliberately — see the overlap audit above before routing on it.
 */
export const POLAND_BBOX: Bbox = { minLat: 49.0, maxLat: 54.84, minLon: 14.12, maxLon: 24.15 };

/** True when a WGS84 point should route to the Polish national services. Pure; never throws. */
export function isInPoland(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= POLAND_BBOX.minLat &&
        lat <= POLAND_BBOX.maxLat &&
        lon >= POLAND_BBOX.minLon &&
        lon <= POLAND_BBOX.maxLon
    );
}
