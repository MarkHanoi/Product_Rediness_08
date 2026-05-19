// Sheet schemas — Sheet, Viewport, Widget (S37 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 lines 88–131.
//   • `SheetDto` — sheet metadata + ordered viewports + widgets
//   • `ViewportDto` — view embedded as a positioned, scaled rectangle on
//     the sheet
//   • `WidgetDto` — non-viewport sheet content (text, scale-bar, image,
//     ...). S37 ships the placeholder shape; the 10 concrete widget
//     subtypes land in S39.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure data — NO DOM, NO THREE, NO Node-only globals.  Round-trips
//   through Zod parse on Node (export-worker) and browser identically.
// • All on-paper coordinates are MILLIMETRES from the sheet's bottom-
//   left corner (matches `paper-size.ts`).
// • `seq` is the canonical display order.  Reorder is a patch over the
//   `seq` field of the affected sheet entries; the store sorts by `seq`
//   when listing.  Two sheets MUST NOT have the same `seq`.
// • `revision` and `issue` are free-form strings (e.g. "P1", "C1",
//   "FOR CONSTRUCTION").  Validation of revision policy is a
//   downstream concern (S38 title-block work).
//
// EXIT CRITERIA (S37 sprint plan §"S37 Exit Criteria")
// ─────────────────────────────────────────────────────────────────────────────
// • `SheetSchema.parse(seed)` round-trips for an A1 landscape sheet with
//   one viewport and no widgets.
// • Schema typechecks under `tsc --noEmit` with zero `any`.

import { z } from 'zod';
import { PAPER_SIZES } from './paper-size.js';

// ── Viewport (a view embedded at scale on the sheet) ────────────────────────

export const ViewportSchema = z.object({
  /** Stable id of this viewport on the sheet. */
  id: z.string().min(1),
  /** Id of the 3D, plan, or section view being embedded. */
  viewId: z.string().min(1),
  /** Position on sheet (mm from sheet origin). */
  x: z.number().finite(),
  y: z.number().finite(),
  /** Viewport size on sheet (mm). */
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  /** Drawing scale denominator (e.g. 50 = 1:50; 1 mm on sheet = 50 mm
   *  in world space). */
  scale: z.number().finite().positive(),
  /** Optional crop within the viewport (mm, viewport-local). */
  clippingBox: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
    })
    .optional(),
});

export type ViewportDto = z.infer<typeof ViewportSchema>;

// ── Widget (placeholder shape — 10 widget subtypes land in S39) ─────────────

/** Placeholder widget shape (S37).  S39 replaces this with a discriminated
 *  union over the 10 concrete widget subtypes (text, scale-bar, image, etc.). */
export const WidgetSchema = z.object({
  id: z.string().min(1),
  /** Subtype tag — narrow union of names, fully validated in S39. */
  kind: z.string().min(1),
  /** Position on sheet (mm from sheet origin). */
  x: z.number().finite(),
  y: z.number().finite(),
  /** Widget size on sheet (mm). */
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  /** Free-form widget payload — fully shaped in S39. */
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type WidgetDto = z.infer<typeof WidgetSchema>;

// ── Sheet ───────────────────────────────────────────────────────────────────

export const SheetSchema = z.object({
  id: z.string().min(1),
  /** Display name (free-form). */
  name: z.string().min(1),
  /** Sheet number (e.g. 'A-001') — validated as non-empty here; format
   *  policy is enforced at the handler layer (`intent.ts`). */
  number: z.string().min(1),
  size: z.enum(PAPER_SIZES),
  orientation: z.enum(['landscape', 'portrait']),
  /** Id of the title block bound to this sheet (TitleBlockStore lands
   *  in S38 — for S37 the field is required and stores a
   *  user-supplied opaque id). */
  titleBlockId: z.string().min(1),
  viewports: z.array(ViewportSchema).default([]),
  widgets: z.array(WidgetSchema).default([]),
  /** Revision label (e.g. 'P1', 'C2'). */
  revision: z.string().default(''),
  /** Issue label (e.g. 'FOR REVIEW', 'FOR CONSTRUCTION'). */
  issue: z.string().default(''),
  /** Optional approver name. */
  approvedBy: z.string().optional(),
  /** Display order — see CONTRACT note above. Non-negative integer. */
  seq: z.number().int().nonnegative(),
});

export type SheetData = z.infer<typeof SheetSchema>;
export type SheetId = SheetData['id'];

/** Default-blank title-block id used when the caller does not supply one
 *  (S37 — the real default lands in S38 once `TitleBlockStore` exists). */
export const PLACEHOLDER_TITLE_BLOCK_ID = 'tb-placeholder-s37';
