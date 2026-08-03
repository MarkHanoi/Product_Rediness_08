// ARAGÓN (ES) — municipal routing predicates for the two capitals PRYZM can answer for.
//
// WHY ONE FILE FOR TWO MUNICIPALITIES. The Catalan pattern is one `<city>Bbox.ts` per
// municipality, and that is right when each arrives on its own schedule. Aragón's two arrive
// together, from one sourcing run, keyed on one shared discovery (§CATASTRO-DGC-NOT-INE below)
// that would otherwise have to be restated in each file. Splitting them would duplicate that
// warning, and a warning that exists twice drifts.
//
// ⚠ THESE BOXES ARE NOT TYPED FROM MEMORY. Every bound is DERIVED from the `georss:polygon`
// Catastro publishes for that municipality in its own INSPIRE ATOM feed — the same authority
// that serves the parcels — then rounded OUTWARD to 2 dp. Measured by
// `tools/aragon-plan-georef/municipal_bbox_from_catastro.py`; the raw values are in
// `tools/aragon-plan-georef/out/municipal_bboxes.json`. A too-generous coarse gate costs one
// wasted round trip; a too-tight one silently drops a real parcel, so the rounding goes outward.
//
// PURITY: L2-pure. Constants + two predicates. No I/O, no THREE, no DOM, no clock.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §CATASTRO-DGC-NOT-INE — A KEY TRAP THAT COSTS EVERY SPANISH PROVINCIAL CAPITAL.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Spain numbers municipalities TWICE, and the two systems disagree exactly where it hurts most.
//
//   INE code      the national statistical code. Huesca = 22125, Zaragoza = 50297. This is what
//                 `composeIneCode()` builds from Catastro's own `<cp>`+`<cm>` reverse-geocode
//                 response, and what the rest of PRYZM routes on.
//
//   Catastro DGC  the Dirección General del Catastro's own municipality number, which is what
//                 its INSPIRE BULK feeds are keyed on. It assigns PROVINCIAL CAPITALS a
//                 900-block number: Huesca = 22901, Zaragoza = 50900, Teruel = 44900.
//
// ⛔ The province-22 ATOM feed lists 202 municipalities, codes 22001..22901, and **22125 is not
//    among them.** A bulk download keyed on the INE code therefore returns HTTP 200 with ZERO
//    matching entries — which reads identically to "the cadastre does not cover Huesca". It is a
//    KEY error, not a coverage fact, and it silently deletes precisely the cities that matter.
//    This probe made that mistake before catching it (§CONTEXT-DATA-HONESTY: failure and empty
//    are the same value unless something forces them apart).
//
// ⇒ Both codes are exported. Route on the INE code; fetch bulk cadastre with the DGC code.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §EDGE-EPSILON — `contains` MUST NEVER BE TIGHTER THAN THE `extent` IT ADVERTISES.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// A naked `lon <= maxLon` looks exact and is not. Any caller that reconstructs an edge point by
// interpolation lands a few ULPs outside the bound: with minLon -0.53 and maxLon -0.33,
// `minLon + (maxLon - minLon) * 6 / 6` evaluates to -0.32999999999999996, because `0.2 * 6 / 6`
// is `0.20000000000000004` in IEEE-754. The point is arithmetically ON the declared boundary and
// was REJECTED by the predicate — caught by `registeredExtentTotality.test.ts`, which exists for
// exactly this.
//
// ⛔ WHY THIS DIRECTION AND NOT THE OTHER. A `contains` tighter than its `extent` is the CÓRDOBA
//    HOLE: the coverage globe draws the box, the chokepoint asks the registry, the registry
//    answers "none", and the generic ESTIMATED triple gets published on land no article was read
//    about. A marginally GENEROUS gate costs one wasted round trip and nothing else. So the
//    tolerance is added, never subtracted.
//
// 1e-9° is ≈ 0.11 mm — some six orders of magnitude below any cadastral survey precision, so it
// cannot move a real routing decision, only a floating-point one.
const EDGE_EPSILON_DEG = 1e-9;

function withinBox(
    box: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    lat: number,
    lon: number,
): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= box.minLat - EDGE_EPSILON_DEG &&
        lat <= box.maxLat + EDGE_EPSILON_DEG &&
        lon >= box.minLon - EDGE_EPSILON_DEG &&
        lon <= box.maxLon + EDGE_EPSILON_DEG
    );
}

/** Bounding box of the término municipal of Huesca — derived from Catastro's ATOM georss bounds. */
export const HUESCA_BBOX = {
    minLat: 42.02,
    maxLat: 42.25,
    minLon: -0.53,
    maxLon: -0.33,
} as const;

/** True when a WGS84 point falls within the loose Huesca bounding box. */
export function isInHuesca(lat: number, lon: number): boolean {
    return withinBox(HUESCA_BBOX, lat, lon);
}

/** The INE code for the municipality of Huesca — the authoritative routing key. */
export const HUESCA_INE_CODE = '22125';

/**
 * Huesca's CATASTRO (DGC) municipality code — required for INSPIRE bulk downloads.
 * ⚠ NOT the INE code. See §CATASTRO-DGC-NOT-INE above.
 */
export const HUESCA_CATASTRO_DGC_CODE = '22901';

/**
 * Bounding box of the término municipal of Zaragoza — derived from Catastro's ATOM georss bounds.
 *
 * ⚠ Zaragoza's term is unusually large (≈ 973 km²) and contains 14 *barrios rurales* that are
 * separate urban nuclei, so this box is coarse by nature. The authoritative answer remains
 * Catastro's `<cp>`+`<cm>` → 50297 via `composeIneCode()` (providers/murciaBbox.ts).
 */
export const ZARAGOZA_BBOX = {
    minLat: 41.44,
    maxLat: 41.94,
    minLon: -1.18,
    maxLon: -0.66,
} as const;

/** True when a WGS84 point falls within the loose Zaragoza bounding box. */
export function isInZaragoza(lat: number, lon: number): boolean {
    return withinBox(ZARAGOZA_BBOX, lat, lon);
}

/** The INE code for the municipality of Zaragoza — the authoritative routing key. */
export const ZARAGOZA_INE_CODE = '50297';

/**
 * Zaragoza's CATASTRO (DGC) municipality code — required for INSPIRE bulk downloads.
 * ⚠ NOT the INE code. See §CATASTRO-DGC-NOT-INE above.
 */
export const ZARAGOZA_CATASTRO_DGC_CODE = '50900';

/**
 * The CRS every Aragonese municipal and cadastral source DECLARES.
 *
 * Established from PUBLISHED DECLARATIONS, not from a fit that looked plausible: Catastro's
 * INSPIRE Buildings WFS `DefaultCRS`, the Catastro ATOM entry for `22901-HUESCA`, the delivered
 * GML's own `srsName`, and IDEAragon's WFS `GetCapabilities` (5,666 layer declarations) all say
 * the same thing. Legal basis for why they agree: Real Decreto 1071/2007, which makes ETRS89 the
 * official geodetic reference system for peninsular Spain.
 *
 * ⚠ NOT SAFE TO GENERALISE TO ALL OF ARAGÓN BY ASSUMPTION. Huesca *province* straddles the UTM
 * zone 30/31 boundary at 0° longitude, and the same Catastro feed really does declare EPSG:25831
 * for its easternmost municipalities. Both capitals here sit west of the meridian. Read the
 * per-municipality declaration; never infer the zone from the region.
 */
export const ARAGON_DECLARED_CRS = 'EPSG:25830' as const;
