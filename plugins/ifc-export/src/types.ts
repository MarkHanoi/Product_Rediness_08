/**
 * Public type surface for `@pryzm/plugin-ifc-export`.
 *
 * Phase 3-B Sprint S56 — IFC Tier 1 Export + Pset Round-Trip
 * (`docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §2).
 */

import type { Beam, Column, Door, Slab, Wall, Window } from '@pryzm/plugin-sdk';

// A.R.3 (Revit round-trip) — bind to the canonical L0 shape via the plugin-sdk
// (L6) facade so this exporter, `ifc-import`, and the L3 `IfcMetaStore`
// (`@pryzm/stores`) all share ONE definition (no more drift between three
// near-identical copies). `IFCElementMeta` is the historical name kept as an
// alias of the canonical `IfcElementMeta` so call-sites need no change.
// Imported with the historical `IFCElementMeta` alias so this file can both USE
// it (e.g. in `IFCMetaStoreLike` below) and re-export it for downstream modules.
import type { IfcElementMeta as IFCElementMeta, Pset, PsetValue, Qset } from '@pryzm/plugin-sdk';
export type { IFCElementMeta, Pset, PsetValue, Qset };

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
