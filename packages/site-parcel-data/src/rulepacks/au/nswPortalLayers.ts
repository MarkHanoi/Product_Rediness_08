// §NSW-LAYERS — the measured ePlanning Portal layer catalogue, as typed data.
//
// Every id and every count below was READ from the live service on 2026-09-03 and is transcribed
// from `docs/04-reference/jurisdictions/au/nsw/phase0-transcripts/` (raw JSON + the scripts that
// produced it). **Re-run the scripts rather than trusting these numbers** — they are here to make
// the layer FAMILIES and their roles explicit in code, not to serve as a census.
//
// SERVICE FAMILY DECISION, RECORDED SO IT IS NOT RE-LITIGATED (PHASE0-REPORT blocker 8):
// Two rival service families on the same host serve the same principal controls —
// `Planning/EPI_Primary_Planning_Layers` (layers 1 FSR / 5 HOB) and
// `ePlanning/Planning_Portal_Principal_Planning` (layers 11 FSR / 14 HOB). **This pack uses the
// `ePlanning/Planning_Portal_*` family**, because it alone has the Local Provisions (~199 feature
// layers) and SEPP (288) siblings the precedence engine needs. A future lane probing the other
// family will measure different ids for the same controls; that is expected, not a defect.
//
// P5-adjacent purity: pure data. No I/O.

/** Base URL of the NSW ePlanning ArcGIS REST root. CRS GDA94 / EPSG:4283. MaxRecordCount 2000. */
export const NSW_EPLANNING_ROOT =
    'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services' as const;

export const NSW_SERVICE = Object.freeze({
    PRINCIPAL: 'ePlanning/Planning_Portal_Principal_Planning',
    LOCAL_PROVISIONS: 'ePlanning/Planning_Portal_Local_Provisions',
    SEPP: 'ePlanning/Planning_Portal_SEPP',
    /** Proposed instruments. ⛔ NEVER mix with in-force controls. */
    PROPOSAL: 'ePlanning/Planning_Proposal_Public',
    /** Superseded versions — the `as_of_date` capability. */
    HISTORIC: 'ePlanningHistoric/Planning_Historic_Combined',
});
export type NswServiceKey = keyof typeof NSW_SERVICE;

/** Layer ids used by this pack. Verified present on the live service 2026-09-03. */
export const NSW_LAYER = Object.freeze({
    // Principal
    LOCAL_ENVIRONMENTAL_PLAN: 8,
    FLOOR_SPACE_RATIO: 11,
    HEIGHT_OF_BUILDINGS: 14,
    MINIMUM_LOT_SIZE: 22,
    LAND_RESERVATION_ACQUISITION: 24,
    MINIMUM_DWELLING_DENSITY: 25,
    FORESHORE_BUILDING_LINE: 26,
    // Local Provisions — vertical
    AIRPORT_BUFFER: 420,
    ALTERNATIVE_BUILDING_HEIGHTS: 422,
    BUILDING_HEIGHT_ALLOWANCE: 429,
    BUILDING_HEIGHT_PLANE: 430,
    INCENTIVE_HEIGHT_OF_BUILDINGS: 485,
    MACQUARIE_PARK_INCENTIVE_HOB: 509,
    METEOROLOGICAL_STATION_HEIGHT_LIMIT: 512,
    FLOOR_HEIGHT_RESTRICTION: 469,
    SUN_ACCESS_PROTECTION: 572,
    SUN_PLANE_PROTECTION: 573,
    OVERSHADOWING: 763,
    ALTERNATIVE_HEIGHT_OF_BUILDINGS: 771,
    // Local Provisions — floor space
    ALTERNATIVE_FSR: 423,
    FSR_INCENTIVE: 470,
    INCENTIVE_FSR: 484,
    MACQUARIE_PARK_INCENTIVE_FSR: 508,
    NON_RESIDENTIAL_FSR: 532,
    COMMUNITY_FACILITY_FLOOR_SPACE: 757,
    UNDERGROUND_FSR: 758,
    ALT_FSR_AFFORDABLE_HOUSING: 772,
    ALT_FSR_EMPLOYMENT: 773,
    NON_RESIDENTIAL_FLOOR_SPACE: 1027,
    // Local Provisions — footprint
    BUILDING_SETBACK: 431,
    LANDSCAPE_AREA: 496,
    RIVER_FRONT_BUILDING_LINE: 553,
});

/** The vertical-control family: every layer that can limit how HIGH a building may go. */
export const NSW_VERTICAL_LAYERS: readonly number[] = Object.freeze([
    NSW_LAYER.HEIGHT_OF_BUILDINGS,
    NSW_LAYER.ALTERNATIVE_BUILDING_HEIGHTS,
    NSW_LAYER.ALTERNATIVE_HEIGHT_OF_BUILDINGS,
    NSW_LAYER.INCENTIVE_HEIGHT_OF_BUILDINGS,
    NSW_LAYER.MACQUARIE_PARK_INCENTIVE_HOB,
    NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE,
    NSW_LAYER.BUILDING_HEIGHT_PLANE,
    NSW_LAYER.FLOOR_HEIGHT_RESTRICTION,
    NSW_LAYER.SUN_ACCESS_PROTECTION,
    NSW_LAYER.SUN_PLANE_PROTECTION,
    NSW_LAYER.OVERSHADOWING,
    NSW_LAYER.AIRPORT_BUFFER,
    NSW_LAYER.METEOROLOGICAL_STATION_HEIGHT_LIMIT,
]);

/** The floor-space family. */
export const NSW_FLOOR_SPACE_LAYERS: readonly number[] = Object.freeze([
    NSW_LAYER.FLOOR_SPACE_RATIO,
    NSW_LAYER.ALTERNATIVE_FSR,
    NSW_LAYER.ALT_FSR_AFFORDABLE_HOUSING,
    NSW_LAYER.ALT_FSR_EMPLOYMENT,
    NSW_LAYER.INCENTIVE_FSR,
    NSW_LAYER.FSR_INCENTIVE,
    NSW_LAYER.MACQUARIE_PARK_INCENTIVE_FSR,
    NSW_LAYER.NON_RESIDENTIAL_FSR,
    NSW_LAYER.NON_RESIDENTIAL_FLOOR_SPACE,
    NSW_LAYER.UNDERGROUND_FSR,
    NSW_LAYER.COMMUNITY_FACILITY_FLOOR_SPACE,
]);

/**
 * ⚠ Layers whose value is an ABSOLUTE AHD level rather than a height above ground. Terrain must
 * never be added to a value read from these. Measured: Floor Height Restriction carries flood
 * planning levels (40.9–64.1, Singleton). Principal HOB is per-FEATURE absolute — signalled by
 * `UNITS='m(RL)'` — and is therefore NOT in this list; see `parseNswHeight`.
 */
export const NSW_ABSOLUTE_LEVEL_LAYERS: readonly number[] = Object.freeze([
    NSW_LAYER.FLOOR_HEIGHT_RESTRICTION,
]);

/**
 * ⚠ Layers whose value is an ADDITIVE ALLOWANCE, not a competing maximum.
 *
 * **This list is the single most important guard in the pack.** Measured parcel `152//DP877246`
 * carries HOB 8.5 m plus Building Height Allowance 2.1. `min()` over those two returns **2.1 m** —
 * a garage where an 8.5 m house is permitted. The 2.1 is not a height at all; it is an increment
 * granted under condition. Any resolver that treats every vertical layer as a candidate maximum
 * produces that answer confidently.
 */
export const NSW_ADDITIVE_ALLOWANCE_LAYERS: readonly number[] = Object.freeze([
    NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE,
]);

/**
 * ⚠ Layers that are inclined-plane operators: the polygon says WHERE, and parameters say the angle
 * and origin. Consumed by `geometry/inclinedTop.ts`; never extruded as a prism.
 */
export const NSW_INCLINED_PLANE_LAYERS: readonly number[] = Object.freeze([
    NSW_LAYER.BUILDING_HEIGHT_PLANE,
    NSW_LAYER.SUN_ACCESS_PROTECTION,
    NSW_LAYER.SUN_PLANE_PROTECTION,
]);

/** Human-readable names, for citations and refusal messages. */
export const NSW_LAYER_NAMES: Readonly<Record<number, string>> = Object.freeze({
    [NSW_LAYER.LOCAL_ENVIRONMENTAL_PLAN]: 'Local Environmental Plan',
    [NSW_LAYER.FLOOR_SPACE_RATIO]: 'Floor Space Ratio Map',
    [NSW_LAYER.HEIGHT_OF_BUILDINGS]: 'Height of Buildings Map',
    [NSW_LAYER.MINIMUM_LOT_SIZE]: 'Minimum Lot Size Map',
    [NSW_LAYER.LAND_RESERVATION_ACQUISITION]: 'Land Reservation Acquisition Map',
    [NSW_LAYER.MINIMUM_DWELLING_DENSITY]: 'Minimum Dwelling Density Area Map',
    [NSW_LAYER.FORESHORE_BUILDING_LINE]: 'Foreshore Building Line Map',
    [NSW_LAYER.AIRPORT_BUFFER]: 'Airport Buffer Map',
    [NSW_LAYER.ALTERNATIVE_BUILDING_HEIGHTS]: 'Alternative Building Heights Map',
    [NSW_LAYER.BUILDING_HEIGHT_ALLOWANCE]: 'Building Height Allowance Map',
    [NSW_LAYER.BUILDING_HEIGHT_PLANE]: 'Building Height Plane Map',
    [NSW_LAYER.INCENTIVE_HEIGHT_OF_BUILDINGS]: 'Incentive Height of Buildings Map',
    [NSW_LAYER.MACQUARIE_PARK_INCENTIVE_HOB]:
        'Macquarie Park Corridor Precinct Incentive Height of Buildings Map',
    [NSW_LAYER.METEOROLOGICAL_STATION_HEIGHT_LIMIT]: 'Meteorological Station Height Limit Map',
    [NSW_LAYER.FLOOR_HEIGHT_RESTRICTION]: 'Floor Height Restriction Map',
    [NSW_LAYER.SUN_ACCESS_PROTECTION]: 'Sun Access Protection Map',
    [NSW_LAYER.SUN_PLANE_PROTECTION]: 'Sun Plane Protection Map',
    [NSW_LAYER.OVERSHADOWING]: 'Overshadowing Map',
    [NSW_LAYER.ALTERNATIVE_HEIGHT_OF_BUILDINGS]: 'Alternative Height of Buildings Map',
    [NSW_LAYER.ALTERNATIVE_FSR]: 'Alternative Floor Space Ratio Map',
    [NSW_LAYER.FSR_INCENTIVE]: 'Floor Space Ratio Incentive Map',
    [NSW_LAYER.INCENTIVE_FSR]: 'Incentive Floor Space Ratio Map',
    [NSW_LAYER.MACQUARIE_PARK_INCENTIVE_FSR]:
        'Macquarie Park Corridor Precinct Incentive Floor Space Ratio Map',
    [NSW_LAYER.NON_RESIDENTIAL_FSR]: 'Non-Residential Floor Space Ratio Map',
    [NSW_LAYER.COMMUNITY_FACILITY_FLOOR_SPACE]: 'Community Facility Floor Space Map',
    [NSW_LAYER.UNDERGROUND_FSR]: 'Underground Floor Space Ratio Map',
    [NSW_LAYER.ALT_FSR_AFFORDABLE_HOUSING]:
        'Alternative Floor Space Ratio Map - Affordable Housing Sites',
    [NSW_LAYER.ALT_FSR_EMPLOYMENT]: 'Alternative Floor Space Ratio Map - Employment Sites',
    [NSW_LAYER.NON_RESIDENTIAL_FLOOR_SPACE]: 'Non-Residential Floor Space Map',
    [NSW_LAYER.BUILDING_SETBACK]: 'Building Setback Map',
    [NSW_LAYER.LANDSCAPE_AREA]: 'Landscape Area Map',
    [NSW_LAYER.RIVER_FRONT_BUILDING_LINE]: 'River Front Building Line Map',
});

export function nswLayerName(layerId: number): string {
    return NSW_LAYER_NAMES[layerId] ?? `ePlanning layer ${layerId}`;
}

export function isNswAdditiveAllowance(layerId: number): boolean {
    return NSW_ADDITIVE_ALLOWANCE_LAYERS.includes(layerId);
}
export function isNswInclinedPlaneLayer(layerId: number): boolean {
    return NSW_INCLINED_PLANE_LAYERS.includes(layerId);
}
export function isNswAbsoluteLevelLayer(layerId: number): boolean {
    return NSW_ABSOLUTE_LEVEL_LAYERS.includes(layerId);
}
