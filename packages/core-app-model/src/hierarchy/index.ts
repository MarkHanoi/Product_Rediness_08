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
