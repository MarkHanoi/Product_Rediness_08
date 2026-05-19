/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Data Platform — IFC Hierarchy
 * File:             src/core/hierarchy/HierarchyTypes.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Pure data types for the IFC-aligned 7-level spatial hierarchy.
 * No THREE.js, no DOM, no store imports — types only.
 * All fields are JSON-serialisable primitives or nested plain objects.
 *
 * IFC alignment:
 *   Site      → IfcSite
 *   Building  → IfcBuilding
 *   Level     → IfcBuildingStorey  [bridges to BimManager level via bimLevelId]
 *   Unit      → IfcZone
 *   Room      → IfcSpace           [existing RoomStore, extended with unitId in PRE-STEP 4]
 *   Element   → IfcElement         [existing element stores]
 *   Hosted    → IfcElement         [doors/windows in existing stores]
 *
 * @see docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § Phase 1-A
 */

// ── Node type discriminator ────────────────────────────────────────────────────

export type HierarchyNodeType = 'site' | 'building' | 'level' | 'unit';

// ── Sync state ─────────────────────────────────────────────────────────────────

/**
 * SyncState represents the alignment between a node's template requirements
 * and its current model data. Computed exclusively by SyncStateEngine.
 * Never written directly by commands or users.
 *
 * Priority (highest wins during evaluation):
 *   conflict > derived > partial > synced > planned-only > no-template
 */
export type SyncState =
  | 'no-template'   // Grey       — no template assigned to this node
  | 'planned-only'  // Light grey — template assigned; no corresponding model data yet
  | 'partial'       // Blue       — model entity exists; some requirements unmet but no hard conflict
  | 'synced'        // Green      — all template requirements met within tolerance
  | 'conflict'      // Red        — model value contradicts a non-derived template requirement
  | 'derived';      // Orange     — user explicitly flagged all conflicting deviations via MarkPropertyDerivedCommand

// ── Planned data ───────────────────────────────────────────────────────────────

/**
 * PlannedData — user-entered intended values for a hierarchy node.
 * These are compared against actual model data by SyncStateEngine.
 * Updated via UpdateHierarchyNodeCommand only.
 */
export interface PlannedData {
  targetArea?: number;     // m² — programme target area
  targetCount?: number;    // e.g. number of rooms intended for a unit
  description?: string;
  customProperties: Record<string, string | number | boolean | null>;
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export interface HierarchyMetadata {
  createdAt: number;   // Unix ms
  modifiedAt: number;  // Unix ms
  createdBy: string;
  version: number;     // monotonically incremented on every update
}

// ── Base entity ────────────────────────────────────────────────────────────────

/**
 * HierarchyEntityBase — shared fields for all 4 hierarchy node types.
 * Specific types extend this with their own FK fields (siteId, buildingId, etc.).
 */
export interface HierarchyEntityBase {
  id: string;                // UUID v4
  type: HierarchyNodeType;
  name: string;
  code?: string;             // short alphanumeric identifier, e.g. "B1", "L01", "APT-1A"
  description?: string;
  parentId?: string;         // set by the store for hierarchical traversal
  templateId?: string;       // assigned TemplateDefinition.id — set via AssignTemplateToNodeCommand
  plannedData: PlannedData;
  /**
   * syncState — COMPUTED by SyncStateEngine. NEVER written by users or commands.
   * Commands must use hierarchyStore.setSyncState() which is restricted to SyncStateEngine.
   * Default on creation: 'no-template'.
   */
  syncState: SyncState;
  metadata: HierarchyMetadata;
}

// ── Concrete node types ────────────────────────────────────────────────────────

export interface SiteData extends HierarchyEntityBase {
  type: 'site';
  address?: string;
  country?: string;
  coordinates?: { lat: number; lng: number };
  grossSiteArea?: number;    // m²
  planningRef?: string;
}

export interface BuildingData extends HierarchyEntityBase {
  type: 'building';
  siteId: string;             // FK → SiteData.id
  grossInternalArea?: number; // m²
  numberOfStoreys?: number;
  buildingUse?: string;       // e.g. "Residential", "Mixed use", "Commercial"
  yearOfCompletion?: number;
  ifcGuid?: string;
}

export interface LevelData extends HierarchyEntityBase {
  type: 'level';
  buildingId: string;         // FK → BuildingData.id
  /**
   * bimLevelId — bridges to the BimManager level system (elevation, height, name).
   * Verified against ctx.bimManager.getLevelById(bimLevelId) in CreateHierarchyLevelCommand.
   */
  bimLevelId: string;
  grossFloorArea?: number;    // m²
  levelNumber?: string;       // e.g. "00", "01", "B1"
  levelFunction?: string;     // e.g. "Residential", "Podium", "Plant"
}

export interface UnitData extends HierarchyEntityBase {
  type: 'unit';
  levelId: string;            // FK → LevelData.id (NOT bimLevelId — use the hierarchy id)
  unitType?: string;          // e.g. "1-bed", "studio", "penthouse"
  unitNumber?: string;        // e.g. "1A", "PH2"
  grossUnitArea?: number;     // m²
  numberOfRooms?: number;     // informational; actual count derived from roomStore at runtime
  department?: string;        // organisational grouping, e.g. "Residential", "ICU"
}

// ── Union type ─────────────────────────────────────────────────────────────────

export type AnyHierarchyEntity = SiteData | BuildingData | LevelData | UnitData;
