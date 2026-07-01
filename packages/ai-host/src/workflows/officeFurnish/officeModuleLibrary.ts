// Office furnish — the MODULE TYPE vocabulary + occupancy estimator (Phase-1 seam for §5/§6/§8).
//
// SPEC §5 redesigns the interior fit-out as a MODULAR system of reusable office modules (not
// individually-placed random desks). SPEC §8 drives all quantities from an occupancy estimate.
// Phase 1 ships only the TYPE vocabulary + the occupancy estimator so downstream code + tests can
// reference the modular vocabulary; the concrete placement engine (SPEC §5/§6/§7) lands in Phase 2.
//
// PURE + DETERMINISTIC, zero THREE / DOM / I/O (L2). P8: the estimator is a trivial pure function
// (no exported side-effecting boundary), so it carries no span — consistent with the other pure
// L2 planner helpers in this workflow package.

/** The reusable fit-out module kinds (SPEC §5/§6). Phase 2 realises each as a placement recipe. */
export type OfficeModuleKind =
    | 'single-workstation'   // desk · chair · computer
    | 'linear-workstation'   // multiple desks in a row + cable mgmt
    | 'bench-workstation'    // two rows back-to-back + shared power spine
    | 'collaborative-block'  // sofas · coffee table · whiteboard · screens
    | 'meeting-room-block'   // meeting table · chairs · TV · whiteboard
    | 'executive-office'     // large desk · visitor chairs · meeting table (glazed §6)
    | 'phone-booth'          // small acoustic room · desk · chair (glazed §6)
    | 'kitchen-block'        // cabinetry · island · appliances · high table
    | 'breakout-block';      // sofas · lounge chairs · plants

/**
 * SPEC §8 — estimate occupancy from USABLE floor area. ~1 workstation occupant per 10 m² NIA is a
 * mid-density workplace target (Gensler/BCO benchmarks range ~8–12 m²/person); we use 10 as the
 * planning default. Everything downstream (desks · meeting rooms · phone booths · toilets · kitchen
 * size · collaboration areas · lockers) scales from this. PURE + deterministic.
 */
export function estimateOccupancy(usableAreaM2: number, areaPerPersonM2 = 10): number {
    if (!(usableAreaM2 > 0) || !(areaPerPersonM2 > 0)) return 0;
    return Math.max(0, Math.round(usableAreaM2 / areaPerPersonM2));
}
