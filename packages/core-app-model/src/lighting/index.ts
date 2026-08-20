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


// ── §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) ─────────────────────────────
// The LOD-200 luminaire MATRIX: twenty generic architectural, exterior and
// life-safety families authored as short rows of independent facts, with reach,
// optical form, efficacy, efficacy class, floor-seating, the photometry rows and
// the type-picker rows all DERIVED from them. Adding a twenty-first luminaire is
// one row there and zero lines anywhere else.
export type {
    Lod200FixtureRow, Lod200FixtureId, Lod200Archetype, Lod200Face,
    Lod200Location, Lod200EfficacyClass, Lod200PhotometryRow,
} from './Lod200FixtureCatalogue.js';
export {
    LOD200_FIXTURE_ROWS,
    LOD200_FIXTURE_IDS,
    LOD200_FLOOR_MOUNTED_IDS,
    EFFICACY_BANDS,
    lod200Row,
    reachForLumens,
    formForFace,
    efficacyLmPerW,
    efficacyClassFor,
    minIpForLocation,
    lod200BodyColor,
    lod200BodyAppearance,
    isGeneralLightingFixture,
    photometryRowsForLod200,
    lod200TypeDefinitionRows,
} from './Lod200FixtureCatalogue.js';

export type { LightBudgetCandidate, LightBudgetSelection } from './LiveLightBudget.js';
export {
    LIVE_LIGHT_BUDGET_BY_TIER,
    DEFAULT_LIVE_LIGHT_BUDGET,
    liveLightBudgetForTier,
    selectLiveLights,
} from './LiveLightBudget.js';
