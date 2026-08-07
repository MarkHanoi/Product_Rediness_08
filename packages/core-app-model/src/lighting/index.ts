/**
 * @pryzm/core-app-model — lighting sub-barrel
 *
 * Sprint M (2026-05-10): LightingTypes extracted from
 * src/engine/subsystems/lighting/ to this package.
 */

export type {
    LightingFixtureType,
    DownlightParams,
    PendantParams,
    LinearLedParams,
    PendantPebbleParams,
    PendantCeramicBellParams,
    PendantConicalParams,
    FloorWoodPostParams,
    FloorArcBrassParams,
    TableTerracottaParams,
    FloorTripodBlackParams,
    LightEmissionConfig,
    LightingData,
} from './LightingTypes.js';

export { FLOOR_MOUNTED_FIXTURES } from './LightingTypes.js';

// §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — the photometric authority for every
// artificial fixture, and the bounded live-light budget that keeps it affordable.
export type { FixturePhotometry, FurnitureLampKind, LightingConstructionForm } from './FixturePhotometry.js';
export {
    LIGHTING_FIXTURE_PHOTOMETRY,
    FURNITURE_LAMP_PHOTOMETRY,
    FALLBACK_PHOTOMETRY,
    SCENE_CANDELA_PER_REAL_CANDELA,
    FIXTURE_DAY_MULTIPLIER,
    FIXTURE_NIGHT_MULTIPLIER,
    FIXTURE_LIGHT_ROLE,
    photometryForFixture,
    photometryForFurnitureLamp,
    constructionFormFor,
    candelaFromLumens,
    beamSolidAngleSr,
    sceneIntensityFor,
    lensEmissiveFor,
    kelvinToLinearRgb,
    kelvinToHex,
} from './FixturePhotometry.js';

export type { LightBudgetCandidate, LightBudgetSelection } from './LiveLightBudget.js';
export {
    LIVE_LIGHT_BUDGET_BY_TIER,
    DEFAULT_LIVE_LIGHT_BUDGET,
    liveLightBudgetForTier,
    selectLiveLights,
} from './LiveLightBudget.js';
