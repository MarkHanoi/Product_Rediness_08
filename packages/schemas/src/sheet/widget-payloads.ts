// Widget payload schemas — shaped, validated payloads for each of the
// 10 sheet-widget kinds (S39 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S39 lines
// 449–522 ("Implementation Detail — Widget Base Class and Sample
// Widgets").
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • The wire shape stays `WidgetSchema` (id, kind, x, y, width, height,
//   payload).  This file shapes the `payload` per-kind so renderers and
//   handlers can parse-and-narrow with confidence.
// • Coordinates inside payloads are RELATIVE to the widget's bounding
//   box (mm, origin = bottom-left, Y up — matches the host transform).
// • Sizes are millimetres.  Lengths/extents are non-negative; text
//   content is unbounded but the editor should soft-cap at ~10 KB per
//   widget for performance.
// • Adding a new kind: (1) extend `WIDGET_KINDS`, (2) add a payload
//   schema below, (3) extend `WidgetPayloadSchema` discriminated union,
//   (4) ship a `Widget` subclass in `plugins/sheets/src/widgets/`.

import { z } from 'zod';

/** All kinds the built-in widget registry handles.  External plugins
 *  can ship widgets with `kind` strings outside this list — the host
 *  falls back to the placeholder renderer for unknown kinds. */
export const WIDGET_KINDS = [
  'text',
  'image',
  'north-arrow',
  'scale-bar',
  'legend',
  'revisions-table',
  'schedule-snapshot',
  'bim-tag',
  'line',
  'region',
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number];

// ── Per-kind payload shapes ─────────────────────────────────────────────────

/** Multi-line text with simple wrapping inside the widget bounds. */
export const TextWidgetPayloadSchema = z.object({
  kind: z.literal('text'),
  text: z.string().default(''),
  fontSize: z.number().finite().positive().default(3.5),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  color: z.string().default('#000000'),
  /** Vertical anchor inside the widget rectangle. */
  vAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
});

/** Image embed — currently a URL ref (R2 in production) with optional
 *  fit mode.  S40's PDF export will require the worker to resolve the
 *  URL to bytes; the editor renders any same-origin URL via Image(). */
export const ImageWidgetPayloadSchema = z.object({
  kind: z.literal('image'),
  /** Source URL or data: URI. */
  src: z.string().min(1),
  /** Optional alt text, used for the placeholder when src can't load. */
  alt: z.string().default(''),
  /** Fit policy inside the widget bounds. */
  fit: z.enum(['contain', 'cover', 'stretch']).default('contain'),
});

/** Compass-rose north arrow rotated `rotation` degrees clockwise from
 *  paper-up.  `rotation` = 0 means the arrow tip points to paper-up. */
export const NorthArrowWidgetPayloadSchema = z.object({
  kind: z.literal('north-arrow'),
  rotation: z.number().finite().default(0),
  /** Stroke + fill colour. */
  color: z.string().default('#000000'),
});

/** Scale bar showing the world distance covered by `widthMm` of paper.
 *  When `viewportId` is set, the host injects the active viewport's
 *  scale; otherwise the explicit `scaleRatio` is used. */
export const ScaleBarWidgetPayloadSchema = z.object({
  kind: z.literal('scale-bar'),
  /** Drawing scale denominator (e.g. 50 → 1:50).  Ignored when
   *  `viewportId` is set and the env supplies a live scale. */
  scaleRatio: z.number().finite().positive().default(100),
  /** Unit shown after the right-hand label ('m', 'mm', 'ft'). */
  unit: z.enum(['m', 'mm', 'ft']).default('m'),
  /** Number of alternating black/white segments. */
  segments: z.number().int().positive().default(5),
  /** Bind to a specific viewport's scale (optional). */
  viewportId: z.string().optional(),
});

/** Legend entry — colour swatch + label. */
export const LegendEntrySchema = z.object({
  label: z.string(),
  color: z.string().default('#000000'),
  /** Optional pattern hint ('solid' | 'hatch' | 'dashed').  Renderers
   *  can ignore unknown values. */
  pattern: z.enum(['solid', 'hatch', 'dashed']).default('solid'),
});

/** Legend — either explicit `entries` or `auto: true` to read from the
 *  model (host injects the list via `WidgetRenderEnv.legendEntries`). */
export const LegendWidgetPayloadSchema = z.object({
  kind: z.literal('legend'),
  title: z.string().default('Legend'),
  entries: z.array(LegendEntrySchema).default([]),
  /** When true, the renderer prefers `env.legendEntries` over `entries`. */
  auto: z.boolean().default(false),
});

/** Single revisions-table row. */
export const RevisionRowSchema = z.object({
  rev: z.string(),
  date: z.string(),
  description: z.string(),
  by: z.string().default(''),
});

export const RevisionsTableWidgetPayloadSchema = z.object({
  kind: z.literal('revisions-table'),
  /** Column headers (default: Rev / Date / Description / By). */
  headers: z.array(z.string()).default(['Rev', 'Date', 'Description', 'By']),
  rows: z.array(RevisionRowSchema).default([]),
});

/** Schedule snapshot — embedded mini-table from a ScheduleStore.  S39
 *  pre-wires the renderer; the actual schedule data flows in S41. */
export const ScheduleSnapshotWidgetPayloadSchema = z.object({
  kind: z.literal('schedule-snapshot'),
  /** Stable id of the schedule definition (lookup key in ScheduleStore). */
  scheduleId: z.string().min(1),
  /** Optional column whitelist (lookup by column key). */
  columns: z.array(z.string()).default([]),
  /** Soft row cap so the widget doesn't blow up its bounds. */
  maxRows: z.number().int().positive().default(20),
  title: z.string().default(''),
});

/** BIM tag — text balloon pointing at a model element inside a viewport. */
export const BimTagWidgetPayloadSchema = z.object({
  kind: z.literal('bim-tag'),
  /** Anchor point on the sheet (mm, sheet origin).  The leader line is
   *  drawn from the widget's bottom-left to this point. */
  anchorX: z.number().finite(),
  anchorY: z.number().finite(),
  /** Tag label (e.g. "W-001" for window 1). */
  label: z.string().default(''),
  /** Optional element id this tag references. */
  elementId: z.string().optional(),
  fontSize: z.number().finite().positive().default(2.8),
  color: z.string().default('#000000'),
});

/** Freehand line annotation between two points (widget-local mm). */
export const LineWidgetPayloadSchema = z.object({
  kind: z.literal('line'),
  x1: z.number().finite().default(0),
  y1: z.number().finite().default(0),
  x2: z.number().finite().default(10),
  y2: z.number().finite().default(0),
  lineWeight: z.number().finite().positive().default(0.35),
  color: z.string().default('#000000'),
  dash: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
});

/** Filled / hatched / outlined rectangle annotation. */
export const RegionWidgetPayloadSchema = z.object({
  kind: z.literal('region'),
  fill: z.string().default('#FFEEAA'),
  stroke: z.string().default('#000000'),
  lineWeight: z.number().finite().positive().default(0.25),
  /** Hatch density in lines/mm (0 = solid fill).  Hatch is 45° lines. */
  hatch: z.number().finite().nonnegative().default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
});

/** Discriminated union over all 10 built-in widget kinds. */
export const WidgetPayloadSchema = z.discriminatedUnion('kind', [
  TextWidgetPayloadSchema,
  ImageWidgetPayloadSchema,
  NorthArrowWidgetPayloadSchema,
  ScaleBarWidgetPayloadSchema,
  LegendWidgetPayloadSchema,
  RevisionsTableWidgetPayloadSchema,
  ScheduleSnapshotWidgetPayloadSchema,
  BimTagWidgetPayloadSchema,
  LineWidgetPayloadSchema,
  RegionWidgetPayloadSchema,
]);

export type TextWidgetPayload = z.infer<typeof TextWidgetPayloadSchema>;
export type ImageWidgetPayload = z.infer<typeof ImageWidgetPayloadSchema>;
export type NorthArrowWidgetPayload = z.infer<typeof NorthArrowWidgetPayloadSchema>;
export type ScaleBarWidgetPayload = z.infer<typeof ScaleBarWidgetPayloadSchema>;
export type LegendEntry = z.infer<typeof LegendEntrySchema>;
export type LegendWidgetPayload = z.infer<typeof LegendWidgetPayloadSchema>;
export type RevisionRow = z.infer<typeof RevisionRowSchema>;
export type RevisionsTableWidgetPayload = z.infer<typeof RevisionsTableWidgetPayloadSchema>;
export type ScheduleSnapshotWidgetPayload = z.infer<typeof ScheduleSnapshotWidgetPayloadSchema>;
export type BimTagWidgetPayload = z.infer<typeof BimTagWidgetPayloadSchema>;
export type LineWidgetPayload = z.infer<typeof LineWidgetPayloadSchema>;
export type RegionWidgetPayload = z.infer<typeof RegionWidgetPayloadSchema>;
export type WidgetPayload = z.infer<typeof WidgetPayloadSchema>;

/** True iff `k` is one of the 10 built-in widget kinds. */
export function isWidgetKind(k: unknown): k is WidgetKind {
  return typeof k === 'string' && (WIDGET_KINDS as readonly string[]).includes(k);
}

/** Parse a raw payload object given its kind.  Throws ZodError on bad
 *  shape.  The kind is injected into the payload before parsing so the
 *  caller doesn't have to embed it twice. */
export function parseWidgetPayload(
  kind: string,
  payload: Record<string, unknown>,
): WidgetPayload {
  if (!isWidgetKind(kind)) {
    throw new Error(`unknown widget kind: ${kind}`);
  }
  return WidgetPayloadSchema.parse({ ...payload, kind });
}
