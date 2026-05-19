// Title-block rendering + 3 built-in templates (S38 / Phase 2C / ADR-0031).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S38 lines
// 343–417 ("Implementation Detail — Title Block Templates"):
//   • Three built-in templates: Standard (ISO 5457 style), Architectural
//     (US arch style), Minimal.
//   • `renderTitleBlock(ctx, template, projectMeta, sheet, x, y, w, h)`
//     paints the template into the supplied paper-space rectangle.
//   • `resolveFieldValue(field, sheet, projectMeta, now)` — pure
//     function turning a field key into the displayable string.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • The renderer assumes the canvas context is in PAPER-SPACE TRANSFORM:
//   1 unit = 1 mm, Y growing UPWARD (the convention SheetEditorHost
//   establishes before calling drawTitleBlockPlaceholder / renderTitleBlock).
// • Text needs an upright-counter-flip — the renderer handles this
//   internally via `drawTextUpright`.
// • Pure of stores — the host fetches the template + project metadata
//   and passes them in.  This keeps the function trivially testable
//   under node-canvas / OffscreenCanvas surfaces.

import type {
  ProjectMetadata,
  SheetData,
  TitleBlockField,
  TitleBlockTemplate,
} from '@pryzm/plugin-sdk';
import { BUILTIN_TITLE_BLOCK_IDS } from '@pryzm/plugin-sdk';
import { withSheetSpan } from './tracing.js';

// Minimal Canvas2D-like surface so headless (node-canvas) and DOM contexts
// both satisfy the renderer without us depending on lib.dom in the signature.
type Ctx2D = CanvasRenderingContext2D;

// ── Visual constants ────────────────────────────────────────────────────────

const TITLE_BLOCK_FILL = '#FFFFFF';
const TITLE_BLOCK_BORDER = '#000000';
const TITLE_BLOCK_BORDER_WIDTH_MM = 0.35;
const TITLE_BLOCK_LABEL_COLOR = '#666666';
const TITLE_BLOCK_VALUE_COLOR = '#000000';
const TITLE_BLOCK_LABEL_FONT_SCALE = 0.55; // label is 55% of value font size
const TITLE_BLOCK_LABEL_GAP_MM = 0.5;
const LOGO_PLACEHOLDER_FILL = '#F0F0F0';
const LOGO_PLACEHOLDER_TEXT = '#999999';
const FIELD_VALUE_FALLBACK = '—';

// ── Field resolver ──────────────────────────────────────────────────────────

/** Built-in field keys and what they resolve to.  Unknown keys render
 *  literally as `[<key>]` so missing data is visible during template
 *  authoring rather than silent. */
export const TITLE_BLOCK_FIELD_KEYS = [
  'projectName',
  'projectNumber',
  'sheetName',
  'sheetNumber',
  'sheetSize',
  'orientation',
  'revision',
  'issue',
  'approvedBy',
  'drawnBy',
  'checkedBy',
  'client',
  'siteAddress',
  'date',
  'scale',
  'pryzm',
] as const;

export type TitleBlockFieldKey = (typeof TITLE_BLOCK_FIELD_KEYS)[number];

export interface FieldResolutionContext {
  readonly sheet: SheetData;
  readonly projectMeta: ProjectMetadata;
  /** Optional injection of "now" for deterministic test output.  Defaults
   *  to `new Date()` per call. */
  readonly now?: Date;
}

function asNonEmpty(s: string | undefined): string {
  return (typeof s === 'string' && s.length > 0) ? s : FIELD_VALUE_FALLBACK;
}

function isoDate(d: Date): string {
  // YYYY-MM-DD without timezone shenanigans.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Resolve one field's display value.  When `field.value` is set it
 *  takes precedence (used for static labels like a "PRYZM 2" branding
 *  line that does not bind to project metadata). */
export function resolveFieldValue(
  field: TitleBlockField,
  ctx: FieldResolutionContext,
): string {
  if (typeof field.value === 'string' && field.value.length > 0) return field.value;

  const { sheet, projectMeta } = ctx;
  const now = ctx.now ?? new Date();

  switch (field.key as TitleBlockFieldKey) {
    case 'projectName':   return asNonEmpty(projectMeta.name);
    case 'projectNumber': return asNonEmpty(projectMeta.number);
    case 'sheetName':     return asNonEmpty(sheet.name);
    case 'sheetNumber':   return asNonEmpty(sheet.number);
    case 'sheetSize':     return sheet.size;
    case 'orientation':   return sheet.orientation;
    case 'revision':      return asNonEmpty(sheet.revision);
    case 'issue':         return asNonEmpty(sheet.issue);
    case 'approvedBy':    return asNonEmpty(sheet.approvedBy);
    case 'drawnBy':       return asNonEmpty(projectMeta.drawnBy);
    case 'checkedBy':     return asNonEmpty(projectMeta.checkedBy);
    case 'client':        return asNonEmpty(projectMeta.client);
    case 'siteAddress':   return asNonEmpty(projectMeta.siteAddress);
    case 'date':          return isoDate(now);
    case 'scale':         return sheet.viewports[0] ? `1:${sheet.viewports[0].scale}` : 'AS NOTED';
    case 'pryzm':         return 'PRYZM 2';
  }
  // Unknown key — surface visibly so template authors notice.
  return `[${field.key}]`;
}

// ── Renderer ────────────────────────────────────────────────────────────────

/** Draw text upright on a Y-mirrored paper-space context. */
function drawTextUpright(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  sizeMm: number,
  color: string,
  align: 'left' | 'center' | 'right',
  weight: 'normal' | 'bold',
  maxWidthMm?: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = `${weight} ${sizeMm}px sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = align;
  if (maxWidthMm !== undefined) {
    ctx.fillText(text, 0, 0, maxWidthMm);
  } else {
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

/** Render a title-block template into the given paper-space rectangle.
 *  The caller is responsible for setting the paper-space transform on
 *  `ctx` before calling (matches `SheetEditorHost.renderInto` contract). */
export function renderTitleBlock(
  ctx: Ctx2D,
  template: TitleBlockTemplate,
  projectMeta: ProjectMetadata,
  sheet: SheetData,
  x: number,
  y: number,
  width: number,
  height: number,
  now?: Date,
): void {
  withSheetSpan('pryzm.sheet.titleblock.render', () => {
    // 1. Background + outer border.
    ctx.fillStyle = TITLE_BLOCK_FILL;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = TITLE_BLOCK_BORDER;
    ctx.lineWidth = TITLE_BLOCK_BORDER_WIDTH_MM;
    ctx.strokeRect(x, y, width, height);

    // 2. Border lines (header rules, internal dividers).
    for (const line of template.borderLines) {
      ctx.beginPath();
      ctx.lineWidth = line.lineWeight;
      ctx.strokeStyle = TITLE_BLOCK_BORDER;
      ctx.moveTo(x + line.startX, y + line.startY);
      ctx.lineTo(x + line.endX, y + line.endY);
      ctx.stroke();
    }

    // 3. Logo area (placeholder rectangle until the project supplies one).
    if (template.logoArea) {
      const lx = x + template.logoArea.x;
      const ly = y + template.logoArea.y;
      ctx.fillStyle = LOGO_PLACEHOLDER_FILL;
      ctx.fillRect(lx, ly, template.logoArea.width, template.logoArea.height);
      ctx.strokeStyle = TITLE_BLOCK_BORDER;
      ctx.lineWidth = 0.18;
      ctx.strokeRect(lx, ly, template.logoArea.width, template.logoArea.height);
      drawTextUpright(
        ctx,
        'LOGO',
        lx + template.logoArea.width / 2,
        ly + template.logoArea.height / 2 - 1.5,
        Math.min(template.logoArea.width, template.logoArea.height) * 0.25,
        LOGO_PLACEHOLDER_TEXT,
        'center',
        'normal',
      );
    }

    // 4. Fields — label above value, both upright.
    const fieldCtx: FieldResolutionContext = { sheet, projectMeta, ...(now ? { now } : {}) };
    for (const field of template.fields) {
      const value = resolveFieldValue(field, fieldCtx);
      // Compute screen-space anchor.
      const fieldY =
        field.yAnchor === 'top'
          ? y + height - field.y
          : y + field.y;
      const fieldX = x + field.x;

      // Optional label, drawn just above the value (so y-anchor sits at
      // the value baseline).
      if (field.label.length > 0) {
        drawTextUpright(
          ctx,
          field.label.toUpperCase(),
          fieldX,
          fieldY + field.fontSize + TITLE_BLOCK_LABEL_GAP_MM,
          field.fontSize * TITLE_BLOCK_LABEL_FONT_SCALE,
          TITLE_BLOCK_LABEL_COLOR,
          field.align,
          'normal',
          field.width,
        );
      }
      drawTextUpright(
        ctx,
        value,
        fieldX,
        fieldY,
        field.fontSize,
        TITLE_BLOCK_VALUE_COLOR,
        field.align,
        field.fontWeight,
        field.width,
      );
    }
  });
}

/** Compute the (x, y, w, h) rectangle on the sheet for a template's
 *  default layout, given the sheet's mm dimensions.  Sheet-editor-host
 *  uses this to position the title block. */
export function computeTitleBlockRect(
  template: TitleBlockTemplate,
  sheetWidthMm: number,
  sheetHeightMm: number,
): { x: number; y: number; width: number; height: number } {
  const { anchor, insetX, insetY, width, height } = template.defaultLayout;
  let x = insetX;
  let y = insetY;
  switch (anchor) {
    case 'bottom-left':  x = insetX;                          y = insetY; break;
    case 'bottom-right': x = sheetWidthMm - insetX - width;   y = insetY; break;
    case 'top-left':     x = insetX;                          y = sheetHeightMm - insetY - height; break;
    case 'top-right':    x = sheetWidthMm - insetX - width;   y = sheetHeightMm - insetY - height; break;
  }
  return { x, y, width, height };
}

// ── Built-in templates ──────────────────────────────────────────────────────

/** ISO 5457-style title block — bottom-right strip, 180 × 60 mm.  The
 *  "default" PRYZM 2 sheet template. */
const STANDARD_TEMPLATE: TitleBlockTemplate = {
  id: BUILTIN_TITLE_BLOCK_IDS.standard,
  name: 'Standard',
  description: 'ISO 5457 title block — 180 × 60 mm, bottom-right.',
  defaultLayout: {
    anchor: 'bottom-right',
    insetX: 10,
    insetY: 10,
    width: 180,
    height: 60,
  },
  borderLines: [
    // Horizontal divider separating sheet metadata (top) from project info
    // (middle) and revision/date (bottom).
    { startX: 0,   startY: 40, endX: 180, endY: 40, lineWeight: 0.25 },
    { startX: 0,   startY: 20, endX: 180, endY: 20, lineWeight: 0.25 },
    // Vertical dividers in the middle band.
    { startX: 90,  startY: 20, endX: 90,  endY: 40, lineWeight: 0.25 },
    // Vertical dividers in the bottom band.
    { startX: 60,  startY: 0,  endX: 60,  endY: 20, lineWeight: 0.25 },
    { startX: 120, startY: 0,  endX: 120, endY: 20, lineWeight: 0.25 },
  ],
  fields: [
    // Top band — sheet name + sheet number.
    { key: 'sheetName',   label: 'Sheet Name',   x: 4,   y: 50, width: 130, fontSize: 4.5, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'sheetNumber', label: 'Sheet Number', x: 176, y: 46, width: 60,  fontSize: 7,   fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
    // Middle band — project name (left) + project number (right).
    { key: 'projectName',   label: 'Project',     x: 4,  y: 26, width: 80, fontSize: 4, fontWeight: 'normal', align: 'left', yAnchor: 'bottom' },
    { key: 'projectNumber', label: 'Project No.', x: 94, y: 26, width: 80, fontSize: 4, fontWeight: 'normal', align: 'left', yAnchor: 'bottom' },
    // Bottom band — drawn-by (left), checked-by (mid), date+revision (right).
    { key: 'drawnBy',   label: 'Drawn',    x: 4,   y: 6,  width: 50, fontSize: 3.5, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'checkedBy', label: 'Checked',  x: 64,  y: 6,  width: 50, fontSize: 3.5, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'date',      label: 'Date',     x: 124, y: 12, width: 52, fontSize: 3.5, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'revision',  label: 'Rev',      x: 176, y: 6,  width: 30, fontSize: 4.5, fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
  ],
};

/** US-architectural title block — 200 × 80 mm with logo area. */
const ARCHITECTURAL_TEMPLATE: TitleBlockTemplate = {
  id: BUILTIN_TITLE_BLOCK_IDS.architectural,
  name: 'Architectural',
  description: 'US arch title block — 200 × 80 mm, bottom-right, with logo + client.',
  defaultLayout: {
    anchor: 'bottom-right',
    insetX: 10,
    insetY: 10,
    width: 200,
    height: 80,
  },
  logoArea: { x: 4, y: 60, width: 40, height: 16 },
  borderLines: [
    // Header divider.
    { startX: 0, startY: 56, endX: 200, endY: 56, lineWeight: 0.3 },
    // Sheet number band divider.
    { startX: 0, startY: 32, endX: 200, endY: 32, lineWeight: 0.25 },
    // Bottom band divider.
    { startX: 0, startY: 16, endX: 200, endY: 16, lineWeight: 0.25 },
    // Vertical separators in the bottom band.
    { startX: 50,  startY: 0,  endX: 50,  endY: 16, lineWeight: 0.2 },
    { startX: 100, startY: 0,  endX: 100, endY: 16, lineWeight: 0.2 },
    { startX: 150, startY: 0,  endX: 150, endY: 16, lineWeight: 0.2 },
    // Vertical separator in the top band (logo area divider).
    { startX: 48,  startY: 56, endX: 48,  endY: 80, lineWeight: 0.25 },
  ],
  fields: [
    // Top band — project + client + site.
    { key: 'projectName', label: 'Project', x: 52,  y: 70, width: 145, fontSize: 4.5, fontWeight: 'bold',   align: 'left',  yAnchor: 'bottom' },
    { key: 'client',      label: 'Client',  x: 52,  y: 64, width: 145, fontSize: 3.5, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'siteAddress', label: 'Site',    x: 52,  y: 58, width: 145, fontSize: 3,   fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    // Middle band — sheet name (large) + sheet number (large bold right).
    { key: 'sheetName',   label: 'Sheet Name',   x: 4,   y: 42, width: 130, fontSize: 6, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'sheetNumber', label: 'Sheet Number', x: 196, y: 38, width: 60,  fontSize: 9, fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
    // Sub-band — issue + scale.
    { key: 'issue', label: 'Issue', x: 4,   y: 22, width: 100, fontSize: 3.5, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'scale', label: 'Scale', x: 196, y: 22, width: 60,  fontSize: 4,   fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
    // Bottom band — drawn / checked / approved / date / revision.
    { key: 'drawnBy',    label: 'Drawn',    x: 4,   y: 4, width: 44, fontSize: 3, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'checkedBy',  label: 'Checked',  x: 54,  y: 4, width: 44, fontSize: 3, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'approvedBy', label: 'Approved', x: 104, y: 4, width: 44, fontSize: 3, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'date',       label: 'Date',     x: 154, y: 4, width: 28, fontSize: 3, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'revision',   label: 'Rev',      x: 196, y: 4, width: 16, fontSize: 4, fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
  ],
};

/** Compact bottom-right title block — 120 × 30 mm, just the essentials. */
const MINIMAL_TEMPLATE: TitleBlockTemplate = {
  id: BUILTIN_TITLE_BLOCK_IDS.minimal,
  name: 'Minimal',
  description: 'Compact 120 × 30 mm title block — sheet number, name, revision.',
  defaultLayout: {
    anchor: 'bottom-right',
    insetX: 5,
    insetY: 5,
    width: 120,
    height: 30,
  },
  borderLines: [
    { startX: 0, startY: 15, endX: 120, endY: 15, lineWeight: 0.25 },
    { startX: 90, startY: 0, endX: 90, endY: 15, lineWeight: 0.25 },
  ],
  fields: [
    { key: 'sheetName',   label: '',             x: 4,   y: 19, width: 112, fontSize: 4, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'sheetNumber', label: '',             x: 116, y: 19, width: 60,  fontSize: 6, fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
    { key: 'date',        label: 'Date',         x: 4,   y: 4,  width: 80,  fontSize: 3, fontWeight: 'normal', align: 'left',  yAnchor: 'bottom' },
    { key: 'revision',    label: 'Rev',          x: 116, y: 4,  width: 26,  fontSize: 4, fontWeight: 'bold',   align: 'right', yAnchor: 'bottom' },
  ],
};

/** Frozen list of built-in templates seeded into `TitleBlockStore` at boot. */
export const BUILTIN_TITLE_BLOCK_TEMPLATES: ReadonlyArray<TitleBlockTemplate> = Object.freeze([
  STANDARD_TEMPLATE,
  ARCHITECTURAL_TEMPLATE,
  MINIMAL_TEMPLATE,
]);

/** Lookup helper — `getBuiltinTitleBlock('standard')`.  Returns `undefined`
 *  for unknown ids; callers should always resolve via the TitleBlockStore
 *  in production code (templates can be user-added in S62). */
export function getBuiltinTitleBlock(id: string): TitleBlockTemplate | undefined {
  for (const t of BUILTIN_TITLE_BLOCK_TEMPLATES) if (t.id === id) return t;
  return undefined;
}
