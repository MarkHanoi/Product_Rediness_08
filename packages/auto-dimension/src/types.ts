// @pryzm/auto-dimension — engine-internal + public data structures (all PURE).
//
// Mirrors §SPIKE §2. All engine-internal geometry is pure `{x,z}` metres.

import type {
  DimensionString,
  DimensionKind,
  DimensionAutoMode,
  DimAnchor,
  DimOrientation,
} from '@pryzm/schemas/annotation/dimension';
// §GA-EDITORIAL-LAYER (L-1620) — SPEC-AUTODIMENSION §12.3's thresholds are OPTIONS, not
// literals buried in the algorithm: "how narrow is a corridor" is a drafting-office
// convention (C34), not the engine's to declare. See editorial.ts.
import type { InteriorDimensionPolicy } from './editorial.js';
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
  /**
   * @deprecated §FIX-AUTODIM-OFFSET-WORLD-SCALE (L-155) — a SHEET-paper gap (mm)
   * reserved for future paper/sheet output (P4 DimStyleTable). It NO LONGER drives
   * the emitted `offsetMm`: the world standoff is now derived from
   * `stackWorldBaseM`/`stackWorldSpacingM` so the dim line stands VISIBLY outside
   * the footprint (a sheet-mm gap ÷1000 hugged the wall).
   */
  readonly baseOffsetMm?: number;
  /** @deprecated §FIX-AUTODIM-OFFSET-WORLD-SCALE (L-155) — see `baseOffsetMm`. */
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
   * World-metre base outward distance of row 0. Drives BOTH the Stage-7
   * geometry-crossing check AND the emitted signed `offsetMm`
   * (§FIX-AUTODIM-OFFSET-WORLD-SCALE, L-155): `offsetMm/1000` = world metres, so
   * the dim line stands `stackWorldBaseM` m outside the footprint (row 0), keeping
   * the crossing check and the rendered position consistent (§SPIKE §8).
   */
  readonly stackWorldBaseM?: number;
  /**
   * World-metre outward distance added per stack row — drives both the crossing
   * check and the emitted `offsetMm` so exterior chains stack progressively
   * further out than opening/location dims and never overlap.
   *
   * @deprecated §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — superseded by
   * `tierGapM`, which is the same idea measured from the FOOTPRINT instead of from each
   * string's own reference line. Still honoured as the tier gap when `tierGapM` is absent,
   * so existing callers keep their spacing.
   */
  readonly stackWorldSpacingM?: number;
  /**
   * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the world-metre gap between
   * dimension TIERS (and the gap between the innermost tier and the footprint).
   *
   * NOT a literal, and not the engine's to invent: it is a PAPER constant (C24 — how far
   * apart two dim lines should look on the printed sheet) converted through the VIEW's
   * drawing scale by `tierGapWorldM(scaleDenominator)`. The executor resolves it from the
   * active view and passes it in; the engine never guesses a millimetre value.
   */
  readonly tierGapM?: number;
  /**
   * §GA-EDITORIAL-LAYER (L-1620) — SPEC-AUTODIMENSION §12.3's construction-critical
   * thresholds. Defaults to `DEFAULT_INTERIOR_POLICY`. Supplied by the caller for the
   * same reason `tierGapM` is: a drafting convention belongs to the drawing standard
   * (C34), not to the planner.
   */
  readonly interiorPolicy?: InteriorDimensionPolicy;
  /**
   * §GA-EDITORIAL-LAYER (L-1621) — SPEC §12.12's fixpoint bound. The pass terminates by
   * construction (every term is monotone — see optimise.ts); this is a belt-and-braces
   * guard, and hitting it is REPORTED as `optimisation-unconverged`, never swallowed.
   */
  readonly maxOptimiseIterations?: number;
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
  /**
   * §GA-EDITORIAL-LAYER (L-1620, SPEC §12.3) — the emitted `autoMode`, when it is not the
   * default `'set-out'`. An interior string that survives the §12.3 filter is re-stamped
   * `'room-bounding'` (the schema's own word) so the drawing can tell an INTERNAL
   * dimension (§12.1 rank 9) from a perimeter one without re-deriving the classification.
   */
  readonly autoMode?: DimensionAutoMode;
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
  /**
   * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — world metres from `p1` to the
   * FOOTPRINT BBOX along `outwardNormal`: the distance this dim line must travel simply
   * to CLEAR the building before any tier gap is added.
   *
   * This is the field that makes rule (a) ("never across the plate") hold on an L-shaped
   * plan. It is 0 for a string whose p1 already sits on the bbox boundary (an ordinary
   * façade chain) and LARGE for the overall on an L-plate, whose reference corner sits
   * mid-plate. Without it the standoff was measured from the string's own reference line,
   * which on a rectangle coincides with the footprint edge BY LUCK — and nowhere else.
   */
  readonly clearanceM: number;
  /**
   * §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — which BUILDING's footprint this
   * string was placed against (L-268 `BuildingFootprint.id`). Two buildings = two
   * independent tier stacks, and the "no dim line crosses the plate" guard must test each
   * string against ITS OWN plate: building A's dimension legitimately sits outside A, and
   * checking it against B's polygon would be a false alarm. Absent for the per-wall
   * fallback (no perimeter, no footprint).
   */
  readonly buildingId?: string;
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
    // §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147) — QA-2 run-partition detection
    // (SPEC §4.4, DI-3/DI-6). A run whose ticks leave part of its façade
    // uncovered, or whose chain segments overlap, is incomplete documentation.
    | 'chain-gap'              // a run interval has no covering chain dim (DI-3/DI-6)
    | 'chain-overlap'          // two chain segments cover the same run interval (QA-2)
    // §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147) — the orthogonal-only invariant
    // (C56 §1.3 DI-7). A cardinal (horizontal/vertical) string whose orientation
    // cannot be honoured as an axis measure would render diagonally.
    | 'non-orthogonal-string'
    | 'no-walls'
    // §FIX-AUTODIM-MULTI-BUILDING (L-268) — a whole BUILDING on the level got no
    // dimensions. Partial coverage must never be silent again: the founder had two
    // footprints, one came back dimensioned, and nothing said the other had been skipped.
    | 'building-undimensioned'
    // §GA-EDITORIAL-LAYER (L-1621, SPEC §12.12) — the readability optimisation ran out of
    // iterations. It cannot happen while every pass stays monotone, which is exactly why
    // it is surfaced: if it ever fires, a pass has stopped being monotone.
    | 'optimisation-unconverged'
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
    /**
     * §FIX-AUTODIM-MULTI-BUILDING (L-268) — how many BUILDINGS (connected wall
     * footprints) the level was partitioned into. Always present; a single building is
     * simply 1. `0` means no closed perimeter was found and the per-wall fallback ran.
     */
    readonly buildingCount: number;
    /**
     * §GA-EDITORIAL-LAYER (L-1620) — enclosures found INSIDE a building: apartment cells,
     * partition loops, stair wells. They are NOT buildings (L-268 counted them as such,
     * which is why `buildingCount` read 13 on a 12-room plate) and SPEC §12.3 governs
     * what, if anything, gets dimensioned inside them.
     */
    readonly roomCount: number;
    /**
     * §GA-EDITORIAL-LAYER (L-1620) — how many interior dimensions survived §12.3. The
     * number the founder judges the drawing by; surfaced so it is never inferred.
     */
    readonly interiorDimCount: number;
  };
  readonly warnings: readonly ValidationWarning[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export interface AutoDimResult {
  readonly strings: readonly DimensionString[];
  readonly report: AutoDimReport;
}
