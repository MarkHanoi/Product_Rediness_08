// Title-block schemas — TitleBlockField, TitleBlockTemplate, ProjectMetadata
// (S38 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S38 lines
// 343–417 ("Implementation Detail — Title Block Templates"):
//   • `TitleBlockField` — one labelled value placed at (x, y) inside the
//     title-block frame, mm-relative to the title block's bottom-left.
//   • `TitleBlockTemplate` — id, name, ordered list of fields, optional
//     logo area, list of border lines, default on-sheet layout.
//   • `ProjectMetadata` — the project-level fields a title block draws
//     from (project name, number, drawn-by, checked-by).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure data — NO DOM, NO THREE.  Round-trips through Zod parse on
//   Node (export-worker) and browser identically.
// • All on-paper coordinates are MILLIMETRES from the title block's
//   bottom-left corner.
// • `defaultLayout` carries the conventional placement of the title
//   block on the sheet (mm from sheet bottom-left).  `SheetEditorHost`
//   uses it when no per-sheet override is set.
// • The 3 built-in templates ('standard', 'architectural', 'minimal')
//   ship in `plugins/sheets/src/title-block.ts` (keeping concrete
//   geometry out of the schema package).  This file defines the SHAPE
//   only.

import { z } from 'zod';

// ── Field placed inside a title-block frame ─────────────────────────────────

/** Vertical anchor for `y` — measured from title block bottom or top. */
export const TitleBlockYAnchorSchema = z.enum(['bottom', 'top']);
export type TitleBlockYAnchor = z.infer<typeof TitleBlockYAnchorSchema>;

/** Horizontal alignment of the field's text relative to its `x` position. */
export const TitleBlockTextAlignSchema = z.enum(['left', 'center', 'right']);
export type TitleBlockTextAlign = z.infer<typeof TitleBlockTextAlignSchema>;

export const TitleBlockFieldSchema = z.object({
  /** Resolution key — e.g. 'projectName', 'sheetNumber', 'date'.  See
   *  `resolveFieldValue` in `plugins/sheets/src/title-block.ts` for the
   *  resolved set; an unknown key renders `[<key>]` so missing data is
   *  visible rather than silent. */
  key: z.string().min(1),
  /** Display label rendered above the value (e.g. 'Project Name'). */
  label: z.string().default(''),
  /** Optional override value — when present overrides the resolved key
   *  (useful for static labels: a "PRYZM 2" branding line that does not
   *  bind to project metadata). */
  value: z.string().optional(),
  /** Position within the title block (mm from bottom-left). */
  x: z.number().finite(),
  y: z.number().finite(),
  /** Maximum text width in mm.  The renderer does not wrap — long
   *  values are truncated with an ellipsis. */
  width: z.number().finite().positive(),
  /** Font size in mm.  Conventionally 2–6 mm for printed output. */
  fontSize: z.number().finite().positive(),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  align: TitleBlockTextAlignSchema.default('left'),
  /** Anchor for `y`.  `'bottom'` (default) means y grows upward from
   *  the bottom edge of the title block.  `'top'` is convenient when a
   *  template is keyed off the title-block top edge. */
  yAnchor: TitleBlockYAnchorSchema.default('bottom'),
});

export type TitleBlockField = z.infer<typeof TitleBlockFieldSchema>;

// ── Border lines (drawn before fields) ──────────────────────────────────────

export const TitleBlockBorderLineSchema = z.object({
  /** Start point in title-block-local mm. */
  startX: z.number().finite(),
  startY: z.number().finite(),
  /** End point in title-block-local mm. */
  endX: z.number().finite(),
  endY: z.number().finite(),
  /** Line weight in mm (typically 0.18–0.5 mm for printed sheets). */
  lineWeight: z.number().finite().positive().default(0.25),
});

export type TitleBlockBorderLine = z.infer<typeof TitleBlockBorderLineSchema>;

// ── Logo area (optional, declarative) ───────────────────────────────────────

export const TitleBlockLogoAreaSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export type TitleBlockLogoArea = z.infer<typeof TitleBlockLogoAreaSchema>;

// ── Default layout on the sheet ─────────────────────────────────────────────

/** Where the title block sits on the sheet (mm from sheet bottom-left).
 *  `anchor` describes which corner the (x,y) refers to so a template can
 *  declare "bottom-right corner inset 10 mm from each edge" without
 *  hard-coding sheet sizes. */
export const TitleBlockLayoutSchema = z.object({
  anchor: z.enum(['bottom-left', 'bottom-right', 'top-left', 'top-right']).default('bottom-right'),
  /** Inset of the anchor corner from the matching sheet edges (mm). */
  insetX: z.number().finite().nonnegative().default(10),
  insetY: z.number().finite().nonnegative().default(10),
  /** Title-block size in mm. */
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export type TitleBlockLayout = z.infer<typeof TitleBlockLayoutSchema>;

// ── Template ────────────────────────────────────────────────────────────────

export const TitleBlockTemplateSchema = z.object({
  /** Stable id (e.g. 'standard', 'architectural', 'minimal').  Built-in
   *  templates use lowercase short names; user-supplied templates land
   *  via the Plugin SDK in S62 under prefix-namespaced ids. */
  id: z.string().min(1),
  /** Human-readable display name shown in the title-block picker. */
  name: z.string().min(1),
  /** Description for the picker tooltip.  Free-form string. */
  description: z.string().default(''),
  /** Field list rendered in declaration order. */
  fields: z.array(TitleBlockFieldSchema).default([]),
  /** Optional logo placement region (renderer paints a placeholder
   *  rectangle until the project supplies a logo image). */
  logoArea: TitleBlockLogoAreaSchema.optional(),
  /** Border lines drawn before fields (header rules, separators, ...). */
  borderLines: z.array(TitleBlockBorderLineSchema).default([]),
  /** Default on-sheet placement.  Sheet editor falls back to this when
   *  the sheet has no explicit override. */
  defaultLayout: TitleBlockLayoutSchema,
});

export type TitleBlockTemplate = z.infer<typeof TitleBlockTemplateSchema>;
export type TitleBlockTemplateId = TitleBlockTemplate['id'];

// ── Project metadata (resolved into title block fields) ─────────────────────

/** Pure-data project metadata supplied to the title-block renderer.
 *  Fields are intentionally optional — the resolver substitutes a clear
 *  '—' for missing data rather than a crash. */
export const ProjectMetadataSchema = z.object({
  /** Project display name (e.g. 'Riverside Apartments'). */
  name: z.string().default(''),
  /** Project number (e.g. '24-017'). */
  number: z.string().default(''),
  /** Author / draughter name. */
  drawnBy: z.string().default(''),
  /** Reviewer name. */
  checkedBy: z.string().default(''),
  /** Client name (organisation). */
  client: z.string().default(''),
  /** Free-form site address printed in the title block. */
  siteAddress: z.string().default(''),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

/** Convenience constant — empty project metadata used by tests and the
 *  initial editor state before a project is loaded. */
export const EMPTY_PROJECT_METADATA: ProjectMetadata = Object.freeze({
  name: '',
  number: '',
  drawnBy: '',
  checkedBy: '',
  client: '',
  siteAddress: '',
});

// ── Built-in template id constants (definitions live in plugin) ─────────────
//
// Constants sit here so the schema package is the single source of truth
// for the names that flow through `SheetData.titleBlockId`.

export const BUILTIN_TITLE_BLOCK_IDS = {
  standard: 'standard',
  architectural: 'architectural',
  minimal: 'minimal',
} as const;

export type BuiltinTitleBlockId =
  (typeof BUILTIN_TITLE_BLOCK_IDS)[keyof typeof BUILTIN_TITLE_BLOCK_IDS];

/** Default built-in id used when CreateSheet doesn't specify one (S38
 *  replaces the S37 placeholder).  We keep the placeholder symbol for
 *  back-compat with S37 sheets persisted in event logs. */
export const DEFAULT_TITLE_BLOCK_ID: BuiltinTitleBlockId =
  BUILTIN_TITLE_BLOCK_IDS.standard;
