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
  /**
   * Deterministic proxy for label footprint (Stage-7 text-overlap): world
   * metres consumed per digit of the measured value. No font metrics — the
   * label half-width is `digitCount · labelCharWidthM / 2` (§SPIKE §9). Kept
   * small by default so ordinary plans do not over-bump.
   */
  readonly labelCharWidthM?: number;
  /**
   * World-metre base outward distance of row 0 used ONLY by the Stage-7
   * geometry-crossing check (the emitted `offsetMm` is sheet-mm, §SPIKE §8).
   */
  readonly stackWorldBaseM?: number;
  /** World-metre outward distance added per stack row for the crossing check. */
  readonly stackWorldSpacingM?: number;
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
  /** World positions of the two primary measured points (Stage-6 placement). */
  readonly p1: PtXZ;
  readonly p2: PtXZ;
}

/**
 * A placed dimension string (post Stage-6). Carries the true outward side + the
 * outward normal (for angled runs the dim sits along the run's own normal,
 * §SPIKE §13) so Stage-7 can reason about overlap and geometry crossings. The
 * side is folded into a SIGNED `offsetMm` at serialisation; `rowIndex` is the
 * outward stack row (mutated deterministically by Stage-7 bump/push).
 */
export interface PlacedString extends PlannedString {
  /** +1 / −1 outward side, chosen so the stack sits away from the centroid. */
  readonly side: 1 | -1;
  /** Unit outward normal of the dim line (points away from the centroid). */
  readonly outwardNormal: PtXZ;
  /** Along-line coordinate of the label centre (grouping / overlap tests). */
  readonly labelCentre: number;
  /** Half the deterministic label footprint, world metres. */
  readonly labelHalfM: number;
  /** Stack-group key `orientation|side|bucket` (strings that share a datum line). */
  readonly groupKey: string;
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface ValidationWarning {
  readonly code:
    | 'opening-undimensioned'
    | 'opening-unsized'        // located but no width dim (DI-2)
    | 'opening-unlocated'      // widthed but no location dim (DI-2)
    | 'open-perimeter'
    | 'overall-mismatch'
    | 'duplicate-string'       // a duplicate survived Stage-7 (QA-4)
    | 'text-overlap-unresolved'
    | 'geometry-crossing'      // dim line crosses geometry, unavoidable (DI-5)
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
