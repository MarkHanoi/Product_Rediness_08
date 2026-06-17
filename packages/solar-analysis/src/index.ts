// ADR-0074 (P1 L2 core) — @pryzm/solar-analysis public surface.
//
// PURE, THREE-FREE algorithmic core of the GPU solar sun-hours feature:
//   1. generateSunSamples — deterministic SunSample[] from the NOAA solar-position
//      math (replicated from core-app-model RealSunService; kept in sync).
//   2. accumulateSunHours — per-surface sun-hours given an INJECTED occlusion
//      oracle (the renderer-three GPU shadow pass supplies the real one later).
//
// DEFERRED NEXT SLICE (NOT in this package): packages/renderer-three owns the GPU
// shadow-map occlusion `IsOccluded` oracle + the heatmap overlay material that
// paints `SunHoursResult` onto the real mesh (P2 single THREE owner).

// ── Types ────────────────────────────────────────────────────────────────────
export type {
    Vec3,
    SunSample,
    SunSampleOptions,
    SolarSurface,
    IsOccluded,
    SurfaceSunHours,
    SunHoursResult,
} from './types.js';

// ── Sun-position math (THREE-free NOAA replica of RealSunService) ─────────────
export {
    computeSolarPositionRad,
    sunDirectionFromAltAz,
    RAD_TO_DEG,
    DEG_TO_RAD,
} from './solarPosition.js';

// ── Sun-sample generation ──────────────────────────────────────────────────
export {
    generateSunSamples,
    dateFromDayAndMinute,
    dayOfYearOf,
    marchEquinoxDayOfYear,
    juneSolsticeDayOfYear,
    septemberEquinoxDayOfYear,
    decemberSolsticeDayOfYear,
} from './sunSamples.js';

// ── Sun-hours accumulation ──────────────────────────────────────────────────
export {
    accumulateSunHours,
    type AccumulateOptions,
} from './sunHours.js';

// ── Per-room solar heat gain ("real heat", C21 §10.10) ───────────────────────
export {
    accumulateRoomHeatGain,
    DEFAULT_SHGC,
    type RoomGlazingElement,
    type RoomGlazing,
    type RoomHeatGain,
    type RoomHeatGainResult,
    type RoomHeatGainOptions,
} from './roomHeatGain.js';
