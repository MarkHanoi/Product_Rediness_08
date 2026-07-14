// @pryzm/auto-dimension — ELEVATION strategy: data structures (all PURE).
//
// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A SECOND SNAPSHOT TYPE AND NOT A ROTATED `AutoDimSnapshot`
// ─────────────────────────────────────────────────────────────────────────────
// An elevation dimension is NOT a plan dimension rotated 90°. The plan engine
// measures in the HORIZONTAL (XZ) plane: wall runs, opening positions along a
// wall, room extents — and it derives every station by projecting element
// geometry onto a run axis. An elevation measures the VERTICAL (world-Y) against
// a PROJECTED view: level datums, floor-to-floor rises, opening sill and head
// heights, the parapet/eaves/ridge, and the overall building height.
//
// Its inputs are therefore SCALAR DATUMS (level elevations, sill heights, opening
// heights), not run geometry — which is also why the elevation planner resolves
// its own world points rather than deferring to the geometry-kernel dimension
// evaluator: that evaluator is plan-only (it returns `[worldX_mm, worldZ_mm]`
// pairs and has no notion of world-Y). Nothing is forked: the PACKAGE, the
// `DimensionString` schema, the tracing helper, the report/warning vocabulary,
// the dimension COMMANDS and the render sink are all shared. What differs is the
// MEASUREMENT PLANE and the RULE SET — exactly as L-263 requires (one engine,
// multiple consumers).
//
// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE SPACE — "VIEW H/V", the abstraction that already exists
// ─────────────────────────────────────────────────────────────────────────────
// The platform already has ONE notion of "which way is up" for a vertical view:
// `ViewPlane.isVertical` + `ViewPlane.hWorldAxis` (`packages/core-app-model/src/
// views/ViewPlane.ts`, Contract 24 §3.1), mirrored by `PlanViewCanvas`'s
// `_hWorldAxis` / `_sectionFlipV` / `_hWorldSign`. We reuse it and invent nothing:
//
//   • H  — the canvas HORIZONTAL axis, in world metres. For a vertical view it is
//          world-X or world-Z (whichever `hWorldAxis` names), multiplied by the
//          view's `hSign` so left/right match what is drawn.
//   • V  — the canvas VERTICAL axis, in world metres. For a vertical view it is
//          ALWAYS world-Y (absolute elevation). This is the whole point of the
//          view type, and it is what every rule below measures.
//
// The engine works purely in (H, V). The L5 executor is the only thing that knows
// how to turn an (H, V) pair back into a world (x, y, z) — it owns the ViewPlane.
//
// Layer purity: L2 — no THREE, no DOM, no I/O, no RNG (P2/P4/P5).

import type { DetailLevel } from '@pryzm/schemas/view/detail-level';

// ── Input snapshot ──────────────────────────────────────────────────────────

/** A storey datum. `elevation` is ABSOLUTE world-Y in metres (L-127: never a literal). */
export interface ElevAutoDimLevel {
  readonly id: string;
  readonly name: string;
  /** Absolute world-Y of the finished-floor datum, metres. */
  readonly elevation: number;
}

/**
 * An opening as an ELEVATION sees it: a rectangle in (H, V).
 *
 * `sill`/`head` are ABSOLUTE world-Y (metres) — i.e. the host level's elevation
 * plus the opening's sill height, resolved by the executor from the real element
 * record. The engine never adds a level offset itself, so a mis-levelled opening
 * can never be silently "corrected" into a plausible-looking dimension.
 */
export interface ElevAutoDimOpening {
  readonly id: string;
  readonly kind: 'door' | 'window';
  /** The level the opening's host wall sits on — groups "typical" sill/head chains. */
  readonly levelId: string;
  /** Opening extent along the view's horizontal axis, metres (hMin < hMax). */
  readonly hMin: number;
  readonly hMax: number;
  /** Absolute world-Y of the sill (bottom) and head (top), metres. */
  readonly sill: number;
  readonly head: number;
}

/** What the building's top datum actually IS — the overall-height dim is labelled with it. */
export type ElevTopDatumKind = 'parapet' | 'eaves' | 'ridge' | 'wall-top';

/**
 * The façade the elevation looks at, in view (H, V) space.
 *
 * Every field is a MEASURED value resolved from the model by the executor
 * (L-127 dimensional truth). The engine adds no defaults for any of them —
 * a missing datum is a warning, never an invented number.
 */
export interface ElevAutoDimSnapshot {
  /** Façade extent along the view's horizontal axis, metres (hMin < hMax). */
  readonly hMin: number;
  readonly hMax: number;
  /** The base datum — normally the lowest level's finished-floor elevation. Metres, world-Y. */
  readonly baseElevation: number;
  /** The highest point of the envelope visible in this view. Metres, world-Y. */
  readonly topElevation: number;
  /** What `topElevation` IS. Drives the overall-height dim's label. */
  readonly topDatumKind: ElevTopDatumKind;
  /** Storey datums, any order — the engine sorts ascending. */
  readonly levels: readonly ElevAutoDimLevel[];
  /** Openings visible on this façade. May be empty. */
  readonly openings: readonly ElevAutoDimOpening[];
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface ElevAutoDimOptions {
  /** View the emitted DimensionStrings belong to (schema-required, branded). */
  readonly viewId: string;
  /** Deterministic id factory (default monotonic — same input → byte-identical output). */
  readonly idFactory?: () => string;
  /**
   * View INTENT (P7 / C09): the view's detail level gates WHICH rules fire.
   * This is the `auto-dimension × elevation × LOD` cell of the L-262 matrix —
   * see `ELEVATION_RULES_BY_DETAIL_LEVEL`. Defaults to `'fine'` (LOD 300), the
   * project default (`DEFAULT_DETAIL_LEVEL`, L-252).
   */
  readonly detailLevel?: DetailLevel;
  /** World-metre standoff of stack row 0 from the façade edge. */
  readonly stackWorldBaseM?: number;
  /** World-metre standoff added per outward stack row. */
  readonly stackWorldSpacingM?: number;
  /** Vertical spans below this are not dimensioned (slivers). Metres. */
  readonly minSegmentM?: number;
  /** Datums within this band are treated as coincident. Metres. */
  readonly snapEpsilonM?: number;
  /**
   * §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — the TIER GAP for the horizontal stack below
   * the façade, world metres. Same meaning, same provenance as the plan engine's
   * `AutoDimOptions.tierGapM` (L-281): a PAPER constant (C24) converted through the VIEW's
   * drawing scale by `tierGapWorldM(scale)`, supplied by the executor. The engine never
   * invents a millimetre value.
   */
  readonly tierGapM?: number;
}

// ── Output ──────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — THE OTHER HALF OF THE ELEVATION SET
// ─────────────────────────────────────────────────────────────────────────────
// AN ELEVATION DIMENSION SET IS TWO CHAINS, NOT ONE. L-263 built the genuinely-new
// VERTICAL rule set (sill / head / floor-to-floor / overall height) and left the
// horizontal axis IMPLICIT — and implicit means ABSENT. The founder's elevation came
// back with correct vertical chains and NOT ONE horizontal dimension: no opening widths,
// no spacing between openings, no distance to the façade ends, no overall façade length.
//
// The horizontal chain is NOT the plan chain rotated. It measures ALONG THE FAÇADE PLANE,
// in the view's own H axis — the same H the vertical rules already station themselves at
// (`ViewPlane.hWorldAxis` × `hSign`). There is no second notion of "along": the snapshot
// is already in (H, V), and this axis is the H it was always expressed in.
//
// Its dim lines are stacked BELOW the façade (V descending), so a horizontal dimension can
// never cross the building silhouette — the same rule L-281 established for plan, applied
// to the axis it was always meant to cover.

/** The normative rule that produced a HORIZONTAL segment. */
export type ElevHDimRule =
  | 'facade-overall'   // EH-1: hMin → hMax, the whole façade length (outermost tier)
  | 'facade-chain';    // EH-2: the station chain — end · width · gap · width · end

/**
 * A resolved HORIZONTAL elevation dimension in view (H, V) space.
 *
 * The mirror of `ElevDimSegment`, on the other axis: the two MEASURED points are
 * `(h1, v)` and `(h2, v)` — both at the same vertical station `v` (the façade BASE datum,
 * so the witness lines drop from the base down to the dim line) — and the dim LINE is
 * drawn at `lineV`, below the building.
 *
 * `offsetV = lineV − v` is the signed perpendicular offset the renderer consumes. NOTE the
 * sign convention is the mirror of `ElevDimSegment.offsetH` (`h − lineH`) and that is not
 * an inconsistency to be tidied away: it is dictated by the renderer, which offsets a dim
 * line along `leftPerp(measurementDir)`. For a VERTICAL measure that perpendicular is −H;
 * for a HORIZONTAL one it is +V. Each field is defined as "what you add to the measured
 * point to reach the line", which is the only definition that survives contact with the
 * renderer.
 */
export interface ElevHDimSegment {
  readonly id: string;
  readonly rule: ElevHDimRule;
  /** Vertical station of the two measured points, metres (world-Y) — the façade base. */
  readonly v: number;
  /** Vertical station of the dimension LINE, metres (world-Y). Below the façade. */
  readonly lineV: number;
  /** Signed perpendicular offset from geometry to dim line (`lineV − v`), metres. */
  readonly offsetV: number;
  /** Left measured station, metres (view H). */
  readonly h1: number;
  /** Right measured station, metres (view H). `h2 > h1`. */
  readonly h2: number;
  /** The measured value, metres. Always `h2 − h1` — derived, never a literal. */
  readonly valueM: number;
  /** Documentation rank (1 = overall façade … 2 = chain). */
  readonly rank: number;
  /** Outward stack row (the TIER, from the L-281 model). */
  readonly rowIndex: number;
  /** −1 → the dim line is BELOW the façade. (+1 reserved for an above-façade stack.) */
  readonly side: 1 | -1;
  /** Model records this segment measures (openings). L-127 provenance. */
  readonly referenceIds: readonly string[];
  readonly label?: string;
}

/** The normative rule that produced a segment — see `ELEVATION_RULE_SET`. */
export type ElevDimRule =
  | 'overall-height'   // EV-1: base datum → top datum
  | 'floor-to-floor'   // EV-2: level datum → next level datum (or → top datum)
  | 'opening-sill'     // EV-3a: host level datum → opening sill
  | 'opening-head';    // EV-3b: opening sill → opening head (the opening's own height)

/**
 * A resolved elevation dimension in view (H, V) space — everything the L5
 * executor needs to build a `linear-dim` annotation without re-deriving geometry.
 *
 * The two MEASURED points are `(h, v1)` and `(h, v2)`: both sit at the same
 * horizontal station `h` (the geometry the dim references — a façade edge or an
 * opening jamb), and the dim LINE is drawn at `lineH`. `offsetH = h − lineH` is
 * exactly the signed perpendicular offset the plan renderer already consumes
 * (`AnnotationGeometry2D.offset`), so the witness/extension lines run from the
 * real geometry out to the dimension line — the same machinery as plan, no new
 * renderer.
 */
export interface ElevDimSegment {
  readonly id: string;
  readonly rule: ElevDimRule;
  /** Horizontal station of the two measured points, metres (view H). */
  readonly h: number;
  /** Horizontal station of the dimension LINE, metres (view H). */
  readonly lineH: number;
  /** Signed perpendicular offset from geometry to dim line (`h − lineH`), metres. */
  readonly offsetH: number;
  /** Lower measured elevation, metres (world-Y). */
  readonly v1: number;
  /** Upper measured elevation, metres (world-Y). `v2 > v1`. */
  readonly v2: number;
  /** The measured value, metres. Always `v2 − v1` — derived, never a literal. */
  readonly valueM: number;
  /** Documentation rank (1 = overall … 3 = opening) — lower = further out. */
  readonly rank: number;
  /** Outward stack row on its side. */
  readonly rowIndex: number;
  /** +1 → the dim line is to the RIGHT of the façade, −1 → to the LEFT. */
  readonly side: 1 | -1;
  /** Model records this segment measures (levels and/or openings). L-127 provenance. */
  readonly referenceIds: readonly string[];
  /** Human label for the datum this segment lands on (e.g. 'Level 2', 'ridge'). */
  readonly label?: string;
}
