// @pryzm/auto-dimension — engine-internal + public data structures (all PURE).
//
// Mirrors §SPIKE §2. All engine-internal geometry is pure `{x,z}` metres.

import type {
  DimensionString,
  DimensionKind,
  DimAnchor,
  DimOrientation,
} from '@pryzm/schemas/annotation/dimension';
import type { PtXZ } from './geometry.js';

// ── Input snapshot (built by the editor executor from the live stores) ──────

/** An opening embedded on a wall (the C15 metric-offset model, `Wall.ts:33-44`). */
export interface AutoDimOpening {
  /** The door/window element id (references stay live via this id). */
  readonly id: string;
  readonly kind: 'door' | 'window';
  /** Distance along the wall baseline from start, in metres. */
  readonly offset: number;
  /** Opening width, in metres. */
  readonly width: number;
}

/** A wall as the engine sees it — a straight baseline + metadata. */
export interface AutoDimWall {
  readonly id: string;
  readonly a: PtXZ;
  readonly b: PtXZ;
  readonly thickness: number;
  readonly levelId?: string;
  readonly openings: readonly AutoDimOpening[];
}

export interface AutoDimSnapshot {
  readonly walls: readonly AutoDimWall[];
}

export interface AutoDimOptions {
  /** View the emitted DimensionStrings belong to (schema-required, branded). */
  readonly viewId: string;
  /** Level scope stamped onto every string. */
  readonly levelId?: string;
  /** Deterministic id factory (default monotonic — same input → same ids). */
  readonly idFactory?: () => string;
  /** mm offset of the innermost (row-0) dimension line. */
  readonly baseOffsetMm?: number;
  /** mm gap added per outward stack row. */
  readonly rowSpacingMm?: number;
  /** Endpoint-cluster band, metres (mirrors JunctionResolverV2 0.20 m). */
  readonly snapEpsilonM?: number;
  /** Sub-threshold segments are skipped/merged (mirrors WallOccupancy 0.05 m). */
  readonly minSegmentM?: number;
}

// ── Engine-internal types (pure) ────────────────────────────────────────────

/** A node in the connectivity graph — a clustered endpoint / junction. */
export interface DimNode {
  readonly id: string;
  readonly point: PtXZ;
  /** Representative element+anchor for referencing this corner (lowest wall id). */
  readonly ref: TickRef;
}

/** One maximal run of collinear, end-to-end walls along a perimeter façade. */
export interface WallRun {
  readonly id: string;
  readonly axisDir: PtXZ;      // canonical unit direction
  readonly origin: PtXZ;       // station datum (run start)
  readonly members: readonly string[];
  /** Ordered junction node refs along the run (chain corner ticks). */
  readonly nodeRefs: readonly TickRef[];
  readonly length: number;
  readonly isExterior: boolean;
  readonly orientation: DimOrientation;
}

/** An element+anchor tick with its 1-D station along a run axis. */
export interface TickRef {
  readonly elementId: string;
  readonly anchor: DimAnchor;
  readonly station: number;
}

/** A planned but id-less dimension string (pre-serialisation). */
export interface PlannedString {
  readonly kind: DimensionKind;
  readonly orientation: DimOrientation;
  readonly refs: readonly TickRef[];  // ≥2, ordered by station
  readonly axisId: string;
  readonly rank: number;              // 1 overall … 4 location
  readonly rowIndex: number;          // outward stack row
  readonly stationSpan: readonly [number, number];
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface ValidationWarning {
  readonly code:
    | 'opening-undimensioned'
    | 'open-perimeter'
    | 'overall-mismatch'
    | 'no-walls'
    | 'degenerate-run';
  readonly detail: string;
}

export interface AutoDimReport {
  readonly coverage: {
    readonly wallCount: number;
    readonly openingCount: number;
    readonly openingsDimensioned: number;
    readonly stringCount: number;
    readonly runCount: number;
  };
  readonly warnings: readonly ValidationWarning[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export interface AutoDimResult {
  readonly strings: readonly DimensionString[];
  readonly report: AutoDimReport;
}
