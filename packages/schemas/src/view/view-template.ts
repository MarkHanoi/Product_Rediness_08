// PRYZM 2 — ViewTemplate Zod schema (S31 Track C / Phase 2B Supplement §B1).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` §B1
//   • Strategic ADR `[strategic ADR-016]` (drawing engine architecture)
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure data — NO DOM, NO THREE, NO Node-only globals.  Round-trips through
//   Zod parse on Node (bake-worker) and browser identically.
// • `FilterCondition` is a recursive discriminated union (and / or / not
//   wrappers + 6 leaf comparators).  The Zod schema uses `z.lazy` to forward-
//   reference itself.
// • `categoryOverrides` is keyed by `ElementCategory`; absent keys mean
//   "use default (visible, black, 0.25 mm)".
// • System templates (`isSystemTemplate: true`) ship with PRYZM and are
//   read-only for users; user-authored templates are mutable.
//
// EXIT CRITERIA (S31 supplement §B1)
// ─────────────────────────────────────────────────────────────────────────────
// • `ViewTemplateSchema.parse({...})` round-trips for the Architectural-Plan
//   reference template in the supplement (§B1 lines 1170–1216).
// • Recursive filter conditions (`and` / `or` / `not` containing nested
//   leaf comparators) parse and round-trip.
// • Schema typechecks under `tsc --noEmit` with zero `any`.

import { z } from 'zod';

// ── Stroke style (one stroke / line family) ─────────────────────────────────

const STROKE_STYLE_DEFAULT = {
  visible: true,
  weight: 0.25,
  color: '#000000',
  dash: 'solid' as const,
};

export const StrokeStyleSchema = z.object({
  visible: z.boolean().default(STROKE_STYLE_DEFAULT.visible),
  /** Pen weight in millimetres at sheet scale. */
  weight: z.number().nonnegative().default(STROKE_STYLE_DEFAULT.weight),
  /** CSS-hex colour or `'transparent'` (the only non-hex escape we accept). */
  color: z.string().default(STROKE_STYLE_DEFAULT.color),
  dash: z.enum(['solid', 'dashed', 'dotted', 'centerline', 'phantom']).default(STROKE_STYLE_DEFAULT.dash),
});
export type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

// ── Visibility / Graphics override (one element category in one view) ──────

export const CategoryVGSchema = z.object({
  visible: z.boolean().default(true),
  projection: StrokeStyleSchema.default(STROKE_STYLE_DEFAULT),
  cut: StrokeStyleSchema.default(STROKE_STYLE_DEFAULT),
  /** Optional solid fill (hex). */
  fillColor: z.string().optional(),
  /** Predefined hatch name (per SPEC-04 hatch catalog). */
  hatchName: z.string().optional(),
  halftone: z.boolean().default(false),
  /** 0–100; 0 = opaque, 100 = fully transparent. */
  transparency: z.number().min(0).max(100).default(0),
});
export type CategoryVG = z.infer<typeof CategoryVGSchema>;

// ── Filter condition — recursive discriminated union ───────────────────────

export type FilterCondition =
  | { kind: 'pset-equals'; pset: string; property: string; value: string | number | boolean }
  | { kind: 'pset-contains'; pset: string; property: string; value: string }
  | { kind: 'pset-greater'; pset: string; property: string; value: number }
  | { kind: 'pset-less'; pset: string; property: string; value: number }
  | { kind: 'pset-exists'; pset: string; property: string }
  | { kind: 'type-name-is'; typeName: string }
  | { kind: 'and'; conditions: FilterCondition[] }
  | { kind: 'or'; conditions: FilterCondition[] }
  | { kind: 'not'; condition: FilterCondition };

export const FilterConditionSchema: z.ZodType<FilterCondition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('pset-equals'),
      pset: z.string(),
      property: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
      kind: z.literal('pset-contains'),
      pset: z.string(),
      property: z.string(),
      value: z.string(),
    }),
    z.object({
      kind: z.literal('pset-greater'),
      pset: z.string(),
      property: z.string(),
      value: z.number(),
    }),
    z.object({
      kind: z.literal('pset-less'),
      pset: z.string(),
      property: z.string(),
      value: z.number(),
    }),
    z.object({
      kind: z.literal('pset-exists'),
      pset: z.string(),
      property: z.string(),
    }),
    z.object({
      kind: z.literal('type-name-is'),
      typeName: z.string(),
    }),
    z.object({
      kind: z.literal('and'),
      conditions: z.array(FilterConditionSchema),
    }),
    z.object({
      kind: z.literal('or'),
      conditions: z.array(FilterConditionSchema),
    }),
    z.object({
      kind: z.literal('not'),
      condition: FilterConditionSchema,
    }),
  ]),
);

// ── ViewFilter — name + categories + recursive condition + per-filter VG ──

export const ViewFilterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Element categories the filter applies to (empty array = all categories). */
  categories: z.array(z.string()).default([]),
  condition: FilterConditionSchema,
  overrides: CategoryVGSchema.partial().default({}),
  enabled: z.boolean().default(true),
});
export type ViewFilter = z.infer<typeof ViewFilterSchema>;

// ── ViewRange — top clip / cut plane / bottom clip + view depth ────────────

const VIEW_RANGE_DEFAULT = {
  topClipOffset: 2300,
  cutPlaneOffset: 1200,
  bottomClipOffset: -300,
  viewDepth: 'unlimited' as const,
};

export const ViewRangeSchema = z.object({
  /** Top clip offset above level base (mm). */
  topClipOffset: z.number().default(VIEW_RANGE_DEFAULT.topClipOffset),
  /** Cut plane offset above level base (mm). */
  cutPlaneOffset: z.number().default(VIEW_RANGE_DEFAULT.cutPlaneOffset),
  /** Bottom clip offset (mm).  Negative = below the level base. */
  bottomClipOffset: z.number().default(VIEW_RANGE_DEFAULT.bottomClipOffset),
  /** `'unlimited'` or a numeric depth in mm. */
  viewDepth: z.union([z.literal('unlimited'), z.number().positive()]).default(VIEW_RANGE_DEFAULT.viewDepth),
});
export type ViewRange = z.infer<typeof ViewRangeSchema>;

// ── ElementCategory — taxonomy keys for category overrides ────────────────

export const ElementCategorySchema = z.enum([
  'Wall',
  'Slab',
  'Door',
  'Window',
  'Roof',
  'CurtainWall',
  'Column',
  'Beam',
  'Stair',
  'Handrail',
  'Ceiling',
  'Room',
  'Grid',
  'Level',
  'Furniture',
  'Structural',
  'MEP',
  'MEPElectrical',
  'MEPPlumbing',
  'MEPMechanical',
  'Annotation',
  'Dimension',
  'Tag',
  'Section',
  'Elevation',
  'Callout',
]);
export type ElementCategory = z.infer<typeof ElementCategorySchema>;

// ── ViewType — the kind of view a template targets ─────────────────────────

export const ViewTypeSchema = z.enum([
  'plan',
  'rcp',
  'section',
  'elevation',
  'detail',
  'schedule',
  '3d',
]);
export type ViewType = z.infer<typeof ViewTypeSchema>;

// ── ViewTemplate ────────────────────────────────────────────────────────────

export const ViewTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  discipline: z.enum(['Architectural', 'Structural', 'MEP', 'Coordination']).optional(),
  /** The kind of view this template applies to (plan, section, elevation…). */
  viewType: ViewTypeSchema.optional(),
  // Per-category visibility/graphics overrides.  Absent keys mean default.
  // Uses `partialRecord` because Zod v4's `z.record(enum, value)` builds a
  // COMPLETE map — every enum key must be present at parse time, which is
  // not what we want here.  `partialRecord` allows any subset of enum keys.
  categoryOverrides: z.partialRecord(ElementCategorySchema, CategoryVGSchema).default({}),
  /** Ordered list of view filters; first match wins (per resolver priority). */
  filters: z.array(ViewFilterSchema).default([]),
  /** Optional view range (only meaningful for plan / RCP / section views). */
  viewRange: ViewRangeSchema.optional(),
  detailLevel: z.enum(['Coarse', 'Medium', 'Fine']).default('Medium'),
  displayStyle: z
    .enum(['Wireframe', 'HiddenLine', 'Shaded', 'ConsistentColors', 'Realistic'])
    .default('HiddenLine'),
  /** Annotation-category visibility map (keyed by free-form name). */
  annotationCategories: z.record(z.string(), z.boolean()).default({}),
  /** True = ships with PRYZM and is read-only for end users. */
  isSystemTemplate: z.boolean().default(false),
});
export type ViewTemplate = z.infer<typeof ViewTemplateSchema>;
