// §27 / §61 — Per-room OFFLINE daylight analytic pass — public barrel.
//
// The numeric core of the SPIKE-DAYLIGHT-SUN-PENETRATION recommendation ("ask B"):
// a pure, deterministic, renderer-INDEPENDENT per-room daylight / insolation
// metric. Data source for the §27 DAYLIGHT-GRAPH + an input axis for the §59
// kitchen "natural-light" scorecard. Pure L2: zero THREE / Cesium / DOM.

export {
    computeRoomDaylight,
    computeBuildingDaylight,
    defaultSunSamples,
    sunDirection,
} from './daylightAnalysis.js';

export type {
    Pt2,
    WindowAperture,
    RoomDaylightInput,
    SunSample,
    WindowContribution,
    RoomDaylightResult,
    BuildingDaylightResult,
    DaylightOptions,
} from './types.js';
