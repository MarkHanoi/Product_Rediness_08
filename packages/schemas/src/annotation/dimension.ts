// PRYZM 2 — Auto-Dimensions schema (S31 Track C / Phase 2B Supplement §A1).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` §A1
//   • Strategic ADR `[strategic ADR-016]` (drawing engine architecture)
//   • Strategic ADR `[strategic ADR-018]` (Auto-Dim cut tier — survives all scenarios)
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • `DimensionString` is the persisted shape for an auto- or manually-authored
//   dimension on a plan / elevation / section / RCP view.  It is distinct
//   from `elements/Dimension.ts` which models PRYZM 1's existing first-class
//   dimension element (kept for backward compatibility through M36 GA).
// • Pure data — NO DOM, NO THREE.  Round-trips through Zod parse on Node
//   (bake-worker) and browser identically (bake-worker test mandate).
// • All 6 `kind` values (`linear-element`, `linear-chain`, `overall`,
//   `angular`, `radius`, `diameter`) parse and round-trip through
//   `DimensionStringSchema.parse` (S31 exit criterion).
//
// EXIT CRITERIA (S31)
// ─────────────────────────────────────────────────────────────────────────────
// • DimensionStringSchema.parse({...}) round-trips for all 6 kind values.
// • Schema in CI typecheck (zero `any`).
// • `apps/bench/baseline.json` includes `dimension-schema` bench
//   (parse 1000 items < 5 ms).

import { z } from 'zod';

// ── Local primitives (mirror packages/schemas/src/base/primitives.ts shape;
//     branded strings keep cross-store references compile-time-safe without
//     pulling defineElement which would mark this as a first-class node). ──

/** Branded element-id reference (any element family). */
export const ElementIdSchema = z
  .string()
  .min(1)
  .brand('ElementId');
export type ElementIdRef = z.infer<typeof ElementIdSchema>;

/** Branded level-id reference. */
export const LevelIdSchema = z
  .string()
  .min(1)
  .brand('LevelId');
export type LevelIdRef = z.infer<typeof LevelIdSchema>;

/** Branded view-id reference. */
export const ViewIdSchema = z
  .string()
  .min(1)
  .brand('ViewId');
export type ViewIdRef = z.infer<typeof ViewIdSchema>;

// ── Typed DimensionString ID ────────────────────────────────────────────────
export const DimensionStringIdSchema = z
  .string()
  .min(1)
  .brand('DimensionStringId');
export type DimensionStringId = z.infer<typeof DimensionStringIdSchema>;

// ── Reference anchor — where on an element the witness line attaches ──────
export const DimAnchorSchema = z.enum([
  'start',         // element start point (wall start, beam start)
  'end',           // element end point
  'center',        // midpoint of element
  'face-outer',    // outer face of element (outside face of wall)
  'face-inner',    // inner face of element (inside face of wall)
  'centerline',    // analytical centerline (for walls: mid of layer stack)
  'top',           // top of element (columns, walls: topmost Z)
  'bottom',        // base of element
  'left',          // leftmost X in element local frame
  'right',         // rightmost X in element local frame
]);
export type DimAnchor = z.infer<typeof DimAnchorSchema>;

export const DimensionReferenceSchema = z.object({
  elementId: ElementIdSchema,
  anchor: DimAnchorSchema,
});
export type DimensionReference = z.infer<typeof DimensionReferenceSchema>;

// ── Orientation ──────────────────────────────────────────────────────────────
export const DimOrientationSchema = z.enum([
  'horizontal',   // measures horizontal distance (plan view)
  'vertical',     // measures vertical distance (elevation/section)
  'aligned',      // measures along the element axis (true length)
  'angular',      // measures the angle between two references
]);
export type DimOrientation = z.infer<typeof DimOrientationSchema>;

// ── Arrowhead styles ────────────────────────────────────────────────────────
export const ArrowheadStyleSchema = z.enum([
  'tick',          // diagonal tick (architectural default)
  'open-arrow',    // open chevron
  'filled-arrow',  // filled triangle
  'dot',           // filled circle
  'none',          // no terminus
]);
export type ArrowheadStyle = z.infer<typeof ArrowheadStyleSchema>;

// ── Witness-line style ──────────────────────────────────────────────────────
//
// NOTE — Zod v4 nested-default behaviour: `.default({})` on the OUTER schema
// only applies when input is `undefined`; the value supplied to `.default()`
// is taken as-is and is NOT re-parsed through the schema (this changed
// between Zod v3 and v4).  We therefore pass the FULL shape as the outer
// default so callers omitting the key get the same shape they would by
// constructing the object explicitly.
const WITNESS_LINE_STYLE_DEFAULT = { offset: 1, extension: 2, weight: 0.18 } as const;
export const WitnessLineStyleSchema = z.object({
  /** mm gap between element and the start of the witness line. */
  offset: z.number().default(WITNESS_LINE_STYLE_DEFAULT.offset),
  /** mm extension beyond the dimension line. */
  extension: z.number().default(WITNESS_LINE_STYLE_DEFAULT.extension),
  /** mm pen weight. */
  weight: z.number().default(WITNESS_LINE_STYLE_DEFAULT.weight),
});
export type WitnessLineStyle = z.infer<typeof WitnessLineStyleSchema>;

// ── Unit format ─────────────────────────────────────────────────────────────
export const UnitFormatSchema = z.object({
  unit: z.enum(['mm', 'cm', 'm', 'ft', 'ft-in', 'in']),
  decimalPlaces: z.number().int().min(0).max(4).default(0),
  suppressTrailingZeros: z.boolean().default(true),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
});
export type UnitFormat = z.infer<typeof UnitFormatSchema>;

// ── DimensionString kind discriminator ──────────────────────────────────────
export const DimensionKindSchema = z.enum([
  'linear-element',  // single element: wall length, opening width
  'linear-chain',    // chain across multiple elements — multiple references
  'overall',         // single overall span (typically auto-generated from chain)
  'angular',         // angle between two line references
  'radius',          // arc radius
  'diameter',        // circular element diameter
]);
export type DimensionKind = z.infer<typeof DimensionKindSchema>;

// ── Auto-mode discriminator (which `produceDimensions` mode emitted this) ──
export const DimensionAutoModeSchema = z.enum([
  'per-element',
  'room-bounding',
  'selection',
  'elevation',
  'section',
  'rcp',
  // DOC-AUTO DS5 (2026-06-09) — a SET-OUT plan: every wall opening dimensioned by its
  // OFFSET from the host wall's start (the "set-out" datum) + its width, plus the wall's
  // overall length. The classic builder's setting-out drawing. See
  // docs/03-execution/plans/AUTO-DOCUMENTATION-SHEETS-PLAN.md §5 DS5.
  'set-out',
]);
export type DimensionAutoMode = z.infer<typeof DimensionAutoModeSchema>;

// ── Core DimensionString ────────────────────────────────────────────────────
export const DimensionStringSchema = z.object({
  id: DimensionStringIdSchema,
  kind: DimensionKindSchema,
  references: z.array(DimensionReferenceSchema).min(2),
  orientation: DimOrientationSchema,
  /** Distance from geometry to the dimension line, in mm at sheet scale. */
  offsetMm: z.number().default(8),
  viewId: ViewIdSchema,
  levelId: LevelIdSchema.optional(),
  /** User-pinned value in mm; null = auto. */
  override: z.number().nullable().default(null),
  /** e.g. "CLR:" prefix. */
  label: z.string().optional(),
  textStyleRef: z.string().default('default-dim'),
  witnessLines: WitnessLineStyleSchema.default(WITNESS_LINE_STYLE_DEFAULT),
  arrowheads: ArrowheadStyleSchema.default('tick'),
  /** Inherits project settings when omitted. */
  unitFormat: UnitFormatSchema.optional(),
  /** True when produced by `DimensionProducer` (S33). */
  isAutoGenerated: z.boolean().default(false),
  /** Which auto mode emitted this dimension (if auto-generated). */
  autoMode: DimensionAutoModeSchema.optional(),
});
export type DimensionString = z.infer<typeof DimensionStringSchema>;

// ── Evaluated result (NOT persisted — derived every render by the
//     DimensionEvaluator at S33). ────────────────────────────────────────────
export interface EvaluatedDimension {
  readonly id: DimensionStringId;
  /** Display string e.g. "3200" or "10'-6\"". */
  readonly valueText: string;
  /** Raw numerical value in mm. */
  readonly valueMm: number;
  /** Witness-line endpoint A in plan-view world coords (mm). */
  readonly p1World: readonly [number, number];
  /** Witness-line endpoint B in plan-view world coords (mm). */
  readonly p2World: readonly [number, number];
  /** World-Y of the dimension line for horizontal dims (or X for vertical). */
  readonly lineY: number;
  /** Witness-line tick point A (mm). */
  readonly witnessP1: readonly [number, number];
  /** Witness-line tick point B (mm). */
  readonly witnessP2: readonly [number, number];
  /** True when `override` is set (the displayed value differs from geometry). */
  readonly isOverride: boolean;
  /** True when geometry and override disagree by > 5 % (UI flag). */
  readonly isFlagged: boolean;
}
