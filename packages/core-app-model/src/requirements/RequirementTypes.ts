/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Store layer — new Class A store)
 * File:             src/core/requirements/RequirementTypes.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §3.1–§3.3
 *                   05-BIM-UI-ARCHITECTURE-CONTRACT §3 (prefix: req-)
 *
 * P9-W6 (2026-05-10) — lifted to packages/core-app-model/src/requirements/.
 * Zero cross-subsystem imports — completely self-contained.
 *
 * TypeScript types for the RequirementStore — the dRofus-style space-
 * programming brief. A RoomRequirement holds all 5 sections (Spatial,
 * Physics, Finishes, Assets, Safety) for one room or space programme entry.
 *
 * Design rules:
 *   - Plain-JSON serialisable (no THREE.js, no class instances).
 *   - All fields optional after the required identity fields so partial
 *     updates via UpdateRequirementCommand can omit unchanged sections.
 *   - `templateId` references a TemplateDefinition ID for inherited values.
 *   - `overriddenFields` tracks which parameters were manually overridden
 *     so Global Fix propagation can skip those rows (Override Protection).
 */

// ── Identity ─────────────────────────────────────────────────────────────────

export type RequirementStatus = 'active' | 'archived' | 'draft';

// ── Parameter sections ────────────────────────────────────────────────────────

export interface SpatialRequirements {
  targetArea_m2: number;
  areaTolerance_pct: number;
  clearHeight_mm: number;
  aspectRatioMax?: number;
}

export interface PhysicsRequirements {
  stc_db: number;
  lux_task: number;
  ach: number;
  targetTemp_c?: number;
  tempTolerance_c?: number;
}

export interface FinishRequirements {
  floorFinish: string;
  wallFinish: string;
  ceilingType: string;
  skirtingHeight_mm?: number;
}

export interface AssetRequirements {
  requiredAssets: string[];       // asset IDs from AssetCatalogStore
  powerSockets: number;
  dataPorts: number;
  plumbingFixtures: number;
}

export interface SafetyRequirements {
  maxEgressDist_m: number;
  turningCircle_mm: number;
  sprinklerCount: number;
  fireRating_min?: number;
}

export interface RequirementParameters {
  spatial: SpatialRequirements;
  physics: PhysicsRequirements;
  finishes: FinishRequirements;
  assets: AssetRequirements;
  safety: SafetyRequirements;
}

export interface RequirementMetadata {
  createdAt: number;
  modifiedAt: number;
  createdBy: string;
  version: number;
}

// ── Root type ─────────────────────────────────────────────────────────────────

export interface RoomRequirement {
  id: string;                          // stable UUID
  type: 'RoomRequirement';
  roomId: string;                      // links to RoomData.id in RoomStore
  levelId: string;                     // spatial context
  name: string;                        // display name, e.g. "OR-101"
  department?: string;
  templateId?: string;                 // assigned TemplateDefinition ID
  status: RequirementStatus;
  /** Fields that have been manually overridden (bypass Global Fix propagation). */
  overriddenFields: string[];
  parameters: RequirementParameters;
  metadata: RequirementMetadata;
}

// ── Partial update payload (used by UpdateRequirementCommand) ─────────────────

export type RequirementParamUpdate = {
  name?: string;
  department?: string;
  templateId?: string;
  status?: RequirementStatus;
  overriddenFields?: string[];
  parameters?: Partial<{
    spatial: Partial<SpatialRequirements>;
    physics: Partial<PhysicsRequirements>;
    finishes: Partial<FinishRequirements>;
    assets: Partial<AssetRequirements>;
    safety: Partial<SafetyRequirements>;
  }>;
};
