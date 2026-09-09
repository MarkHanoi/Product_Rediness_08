/**
 * @pryzm/core-app-model — hierarchy sub-barrel (Wave 10 Task 2 W10-A)
 */

export type {
    HierarchyNodeType,
    SyncState,
    PlannedData,
    HierarchyMetadata,
    HierarchyEntityBase,
    SiteData,
    BuildingData,
    LevelData,
    UnitData,
    AnyHierarchyEntity,
} from './HierarchyTypes.js';

// ── Sprint G P9-W10 (2026-05-10) — HierarchyStore ────────────────────────────
export { HierarchyStore, hierarchyStore } from './HierarchyStore.js';

// ── ADR-0328 — the DERIVED `partOf` projection over the store above ──────────
export {
    PartOfProjection,
    partOfProjection,
    derivePartOfEdges,
    partOfCitizens,
    readHierarchySubstrate,
} from './PartOfProjection.js';
export type {
    PartOfSubstrateNode,
    PartOfSubstrateRoom,
    PartOfSubstrateSnapshot,
    DerivedPartOfEdge,
    PartOfProjectionStats,
    PartOfRefusalReason,
    PartOfParentQuery,
    PartOfMembersQuery,
} from './PartOfProjection.js';

// ── ADR-0385 — the ONE resolver for "which building is this element in" ──────
// hierarchyStore is the authority for containment; SpaceEnvelope.group is the
// massing-stage authoring axis that projects into it. The IFC exporter and BOTH
// inspect trees call THIS, so they cannot disagree (C84 EI-9).
export {
    DEFAULT_BUILDING_ID,
    DEFAULT_BUILDING_NAME,
    UNREADABLE_SUBSTRATE,
    readBuildingSubstrate,
    resolveLevelBuilding,
    resolveElementBuilding,
    buildBuildingRoster,
} from './BuildingResolver.js';
export type {
    BuildingSubstrate,
    BuildingSubstrateBuilding,
    BuildingSubstrateLevel,
    BuildingResolution,
    BuildingResolutionKind,
    BuildingRoster,
    RosterBuilding,
} from './BuildingResolver.js';

// ── ADR-0385 §2 point 1 — the WRITE half: a massing group PROJECTS into the
// hierarchy store. Derived at read, reconciled by DIFF, never accumulated, and
// scoped to the ids it owns so a hand-authored building can never be reaped.
export {
    PROJECTED_ID_PREFIX,
    PROJECTED_SITE_ID,
    PROJECTED_SITE_NAME,
    UNREADABLE_MASSING_SUBSTRATE,
    projectedBuildingId,
    projectedLevelId,
    isProjectedHierarchyId,
    readMassingGroupSubstrate,
    deriveMassingHierarchy,
    planMassingGroupProjection,
    applyMassingGroupProjection,
} from './MassingGroupProjection.js';
export type {
    MassingGroupMemberView,
    MassingGroupSnapshot,
    MassingGroupSubstrate,
    MassingDerivationContext,
    MassingHierarchyDerivation,
    MassingProjectionPlan,
    MassingProjectionReport,
    ProjectedBuildingSpec,
    ProjectedLevelSpec,
    ProjectedSiteSpec,
    ProjectionClock,
    ProjectionExistingNode,
    ProjectionUpdate,
} from './MassingGroupProjection.js';
