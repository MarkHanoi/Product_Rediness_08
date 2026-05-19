/**
 * Public type surface for `@pryzm/plugin-ifc-export`.
 *
 * Phase 3-B Sprint S56 — IFC Tier 1 Export + Pset Round-Trip
 * (`docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §2).
 */

import type { Beam, Column, Door, Slab, Wall, Window } from '@pryzm/plugin-sdk';

/** Scalar value allowed inside an IFC Pset (`IfcPropertySingleValue.NominalValue`). */
export type PsetValue = string | number | boolean | null;

/** A single IFC property set (key = property name, value = scalar). */
export type Pset = Record<string, PsetValue>;

/** A single IFC quantity set (key = quantity name, value = numeric measure). */
export type Qset = Record<string, number>;

/**
 * Side-car metadata describing the IFC origin of a PRYZM element.
 *
 * S55 will land an `IFCMetaStore` in `@pryzm/stores` whose entries match this
 * shape verbatim; this exporter binds against the structural type so the
 * dependency direction stays clean (export → schemas only).
 */
export interface IFCElementMeta {
  /** PRYZM element id (`wall_<ulid>`, `slab_<ulid>`, …) — the join key. */
  pryzmElementId: string;
  /** Original IFC `GloballyUniqueId` (22-char base64). Preserved across round-trips. */
  globalId: string;
  /** Original IFC entity type, e.g. `IFCWALLSTANDARDCASE`. */
  typeName: string;
  name?: string;
  description?: string;
  objectType?: string;
  /** All IFC `IfcPropertySet`s that referenced this element on import. */
  psets: Record<string, Pset>;
  /** All IFC `IfcElementQuantity` sets that referenced this element on import. */
  quantities?: Record<string, Qset>;
  tier: 1 | 2 | 3;
}

/**
 * Minimum surface the exporter needs from an `IFCMetaStore`.
 * Compatible with the S55 implementation that will live in `@pryzm/stores`.
 */
export interface IFCMetaStoreLike {
  get(pryzmElementId: string): IFCElementMeta | undefined;
}

/**
 * In-memory snapshot of all PRYZM Tier 1 elements participating in an export.
 *
 * The orchestrator does not depend on `@pryzm/stores`; callers either build a
 * snapshot themselves or use the `fromStores()` adapter once S55 ships.
 */
export interface ProjectSnapshot {
  /** Optional building storeys; if absent a single default storey is created. */
  levels?: ReadonlyArray<LevelInfo>;
  walls?: ReadonlyArray<Wall>;
  slabs?: ReadonlyArray<Slab>;
  doors?: ReadonlyArray<Door>;
  windows?: ReadonlyArray<Window>;
  columns?: ReadonlyArray<Column>;
  beams?: ReadonlyArray<Beam>;
}

/** Building storey ("level") description for the IFC spatial hierarchy. */
export interface LevelInfo {
  /** PRYZM level id; matches `wall.levelId` / `slab.levelId` / etc. */
  id: string;
  /** Display name, e.g. "Ground Floor". */
  name: string;
  /** Elevation in metres above the building origin. */
  elevation: number;
}

/** Per-export user-supplied identification. */
export interface ProjectMeta {
  /** Project name (`IfcProject.Name`). */
  name: string;
  description?: string;
  /** Authoring application string — defaults to `"PRYZM"`. */
  applicationName?: string;
  /** Application identifier — defaults to `"PRYZM-2"`. */
  applicationIdentifier?: string;
  /** Application version — defaults to `"2.0.0"`. */
  applicationVersion?: string;
  /** Authoring person — defaults to `"PRYZM User"`. */
  personName?: string;
  /** Authoring organisation — defaults to `"PRYZM"`. */
  organizationName?: string;
}

/** Optional configuration accepted by `exportProjectToIFC`. */
export interface ExportOptions {
  /** Override the export timestamp (Unix seconds). Tests use this for byte-stable output. */
  timestamp?: number;
  /** Replace `crypto.randomUUID` for deterministic GlobalId minting in tests. */
  guidProvider?: () => string;
}
