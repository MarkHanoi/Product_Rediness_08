/**
 * TitleBlockStore — Phase S3 (Sheet Integration)
 *
 * Read-only store of TitleBlock templates.
 * Pre-seeded with standard A0, A1, A3 templates.
 * No mutations needed in Phase S3 — templates are read-only library entries.
 *
 * Contract compliance:
 *   §01 §3.3 — Read-only ElementStore pattern (no write API in Phase S3)
 *   §03 §1.1 — Schema-stable
 *   §05      — Pure data module; no DOM, no Three.js
 *   §07      — No server routes; client-side only
 */

import type { TitleBlockTemplate, TitleBlockFieldZone } from './TitleBlockTypes';

// ── Pre-seeded templates ───────────────────────────────────────────────────────

const A0_TEMPLATE: TitleBlockTemplate = {
    id:          'a0-standard',
    name:        'A0 Standard',
    paperWidth:  1189,
    paperHeight: 841,
    borderWidth: 180,
    fields: [
        { key: 'projectName',    label: 'Project',        x: 1015, y: 220, width: 160, height: 20, fontSize: 10, bold: true },
        { key: 'projectAddress', label: 'Address',        x: 1015, y: 196, width: 160, height: 20, fontSize:  7 },
        { key: 'sheetNumber',    label: 'Sheet No.',      x: 1015, y: 100, width:  80, height: 20, fontSize: 11, bold: true },
        { key: 'sheetName',      label: 'Sheet Title',    x: 1015, y: 76,  width: 160, height: 20, fontSize:  9, bold: true },
        { key: 'scale',          label: 'Scale',          x: 1015, y: 52,  width:  80, height: 16, fontSize:  8 },
        { key: 'date',           label: 'Date',           x: 1100, y: 52,  width:  75, height: 16, fontSize:  8 },
        { key: 'drawnBy',        label: 'Drawn',          x: 1015, y: 36,  width:  50, height: 14, fontSize:  7 },
        { key: 'checkedBy',      label: 'Checked',        x: 1070, y: 36,  width:  50, height: 14, fontSize:  7 },
        { key: 'approvedBy',     label: 'Approved',       x: 1125, y: 36,  width:  50, height: 14, fontSize:  7 },
        { key: 'contractNo',     label: 'Contract No.',   x: 1015, y: 20,  width: 160, height: 14, fontSize:  7 },
        { key: 'revision',       label: 'Rev.',           x: 1155, y: 100, width:  20, height: 20, fontSize: 11, bold: true },
    ],
    revisionZone: { x: 1015, y: 260, width: 160, rowHeight: 14, maxRows: 8 },
};

const A1_TEMPLATE: TitleBlockTemplate = {
    id:          'a1-standard',
    name:        'A1 Standard',
    paperWidth:  841,
    paperHeight: 594,
    borderWidth: 160,
    fields: [
        { key: 'projectName',    label: 'Project',        x: 687, y: 160, width: 140, height: 18, fontSize: 9, bold: true },
        { key: 'projectAddress', label: 'Address',        x: 687, y: 138, width: 140, height: 18, fontSize: 6 },
        { key: 'sheetNumber',    label: 'Sheet No.',      x: 687, y: 80,  width:  70, height: 18, fontSize: 10, bold: true },
        { key: 'sheetName',      label: 'Sheet Title',    x: 687, y: 58,  width: 140, height: 18, fontSize:  8, bold: true },
        { key: 'scale',          label: 'Scale',          x: 687, y: 40,  width:  70, height: 14, fontSize:  7 },
        { key: 'date',           label: 'Date',           x: 757, y: 40,  width:  70, height: 14, fontSize:  7 },
        { key: 'drawnBy',        label: 'Drawn',          x: 687, y: 26,  width:  46, height: 12, fontSize:  6 },
        { key: 'checkedBy',      label: 'Checked',        x: 734, y: 26,  width:  46, height: 12, fontSize:  6 },
        { key: 'approvedBy',     label: 'Approved',       x: 781, y: 26,  width:  46, height: 12, fontSize:  6 },
        { key: 'contractNo',     label: 'Contract No.',   x: 687, y: 12,  width: 140, height: 12, fontSize:  6 },
        { key: 'revision',       label: 'Rev.',           x: 807, y: 80,  width:  20, height: 18, fontSize: 10, bold: true },
    ],
    revisionZone: { x: 687, y: 185, width: 140, rowHeight: 12, maxRows: 6 },
};

const A3_TEMPLATE: TitleBlockTemplate = {
    id:          'a3-standard',
    name:        'A3 Standard',
    paperWidth:  420,
    paperHeight: 297,
    borderWidth: 120,
    fields: [
        { key: 'projectName',    label: 'Project',        x: 305, y: 100, width: 100, height: 14, fontSize: 7, bold: true },
        { key: 'projectAddress', label: 'Address',        x: 305, y: 84,  width: 100, height: 14, fontSize: 5 },
        { key: 'sheetNumber',    label: 'Sheet No.',      x: 305, y: 50,  width:  55, height: 14, fontSize: 8, bold: true },
        { key: 'sheetName',      label: 'Sheet Title',    x: 305, y: 36,  width: 100, height: 14, fontSize: 6, bold: true },
        { key: 'scale',          label: 'Scale',          x: 305, y: 22,  width:  50, height: 12, fontSize: 6 },
        { key: 'date',           label: 'Date',           x: 355, y: 22,  width:  50, height: 12, fontSize: 6 },
        { key: 'drawnBy',        label: 'Drawn',          x: 305, y: 10,  width:  33, height: 10, fontSize: 5 },
        { key: 'checkedBy',      label: 'Checked',        x: 338, y: 10,  width:  33, height: 10, fontSize: 5 },
        { key: 'approvedBy',     label: 'Approved',       x: 372, y: 10,  width:  33, height: 10, fontSize: 5 },
        { key: 'revision',       label: 'Rev.',           x: 361, y: 50,  width:  44, height: 14, fontSize: 8, bold: true },
    ],
    revisionZone: { x: 305, y: 120, width: 100, rowHeight: 10, maxRows: 5 },
};

// ── §TITLE-BLOCK-IS-BLOCK-LOCAL (L-10688) ──────────────────────────────────────
//
// THE FOUNDER, 2026-08-24: *"landscape / vertical (portrait) title block"* —
// recorded earlier as *"portrait title block doesn't exist"*.
//
// ⭐ IT LITERALLY DID NOT EXIST. Measured: this store held THREE templates, all
// LANDSCAPE (A0 1189×841, A1 841×594, A3 420×297). Every one of the four
// surfaces that draws a sheet — `SheetEditorPanel`, `PdfExportService`,
// `SheetExportService` (SVG + HTML), `DxfExportService` — takes the paper size
// from `template.paperWidth/paperHeight` (that is L-10684), and the editor's
// Title Block dropdown is populated from `titleBlockStore.getAll()`. So the
// product had no way to express a portrait sheet at all: not a missing control,
// a missing ROW.
//
// ─── WHY A BUILDER AND NOT SEVEN MORE LITERALS ─────────────────────────────
// The three hand-written templates above place every field in ABSOLUTE mm from
// the PAPER's left edge (`x: 305` on a 420 mm page). That convention is exactly
// what L-10684 is blocked on and what L-10687's unwired S38 system gets right:
// a field belongs to the BLOCK, not to the paper, and the block's position on
// the paper is a separate fact.
//
// ⭐ So the good idea from L-10687 is ADOPTED here rather than the system being
// swapped for it: this builder authors fields in BLOCK-LOCAL mm and converts to
// the absolute convention at the one line marked below. Seven more literals
// would have hard-coded the paper width into seventy field coordinates and made
// the L-10684 re-anchoring seven times larger.
//
// ⛔ THE THREE EXISTING TEMPLATES ARE NOT TOUCHED — not re-generated, not
// re-derived, not "cleaned up". Every sheet the founder has already authored
// carries `titleBlock: 'a1-standard'`, and regenerating those numbers would
// move fields on drawings that already exist. Additive only: new ids, new rows,
// nothing renamed and nothing deleted. `titleBlockStandardFieldPositions.test.ts`
// pins the old three in millimetres precisely so a later lane cannot "tidy"
// them into the builder without the gate going red.

/** Round to 0.1 mm — a drafting tolerance, and it keeps the emitted templates
 *  readable and exactly assertable in a test. */
function _mm(v: number): number {
    return Math.round(v * 10) / 10;
}

/**
 * Author one right-hand-strip title block from BLOCK-LOCAL geometry.
 *
 * The strip is full paper height and `blockWidth` wide, flush to the paper's
 * right edge — which is the shape all four consumers already draw
 * (`tbX0 = paperWidth - borderWidth`). That is why this needs no consumer
 * change: only the numbers are new.
 *
 * The row rhythm is proportional to `blockWidth` (s = blockWidth / 120, the A3
 * strip being the reference), so an A4 block is not an A0 block's text shrunk
 * onto a smaller page — every field keeps its ratio to the strip it sits in.
 */
function buildStripTitleBlock(
    id:          string,
    name:        string,
    paperWidth:  number,
    paperHeight: number,
    blockWidth:  number,
): TitleBlockTemplate {
    const s     = blockWidth / 120;
    const pad   = 5 * s;
    const w     = blockWidth - 2 * pad;
    const third = (w - 4 * s) / 3;
    const half  = (w - 4 * s) / 2;

    // ⭐ THE ONE CONVERSION from block-local to the absolute convention the
    // live template shape uses. When L-10684 re-anchors the fields, this line
    // is what changes — not seventy coordinates.
    const abs = (localX: number): number => _mm(paperWidth - blockWidth + localX);

    const fields: TitleBlockFieldZone[] = [
        { key: 'projectName',    label: 'Project',      x: abs(pad),                      y: _mm(108 * s), width: _mm(w),        height: _mm(14 * s), fontSize: _mm(7 * s), bold: true },
        { key: 'projectAddress', label: 'Address',      x: abs(pad),                      y: _mm(90  * s), width: _mm(w),        height: _mm(14 * s), fontSize: _mm(5 * s) },
        { key: 'sheetNumber',    label: 'Sheet No.',    x: abs(pad),                      y: _mm(70  * s), width: _mm(0.58 * w), height: _mm(14 * s), fontSize: _mm(8 * s), bold: true },
        { key: 'revision',       label: 'Rev.',         x: abs(pad + 0.62 * w),           y: _mm(70  * s), width: _mm(0.38 * w), height: _mm(14 * s), fontSize: _mm(8 * s), bold: true },
        { key: 'sheetName',      label: 'Sheet Title',  x: abs(pad),                      y: _mm(52  * s), width: _mm(w),        height: _mm(14 * s), fontSize: _mm(6 * s), bold: true },
        { key: 'scale',          label: 'Scale',        x: abs(pad),                      y: _mm(36  * s), width: _mm(half),     height: _mm(12 * s), fontSize: _mm(6 * s) },
        { key: 'date',           label: 'Date',         x: abs(pad + half + 4 * s),       y: _mm(36  * s), width: _mm(half),     height: _mm(12 * s), fontSize: _mm(6 * s) },
        { key: 'drawnBy',        label: 'Drawn',        x: abs(pad),                      y: _mm(22  * s), width: _mm(third),    height: _mm(10 * s), fontSize: _mm(5 * s) },
        { key: 'checkedBy',      label: 'Checked',      x: abs(pad + third + 2 * s),      y: _mm(22  * s), width: _mm(third),    height: _mm(10 * s), fontSize: _mm(5 * s) },
        { key: 'approvedBy',     label: 'Approved',     x: abs(pad + 2 * (third + 2 * s)),y: _mm(22  * s), width: _mm(third),    height: _mm(10 * s), fontSize: _mm(5 * s) },
        { key: 'contractNo',     label: 'Contract No.', x: abs(pad),                      y: _mm(8   * s), width: _mm(w),        height: _mm(10 * s), fontSize: _mm(5 * s) },
    ];

    return {
        id,
        name,
        paperWidth,
        paperHeight,
        borderWidth: blockWidth,
        fields,
        revisionZone: { x: abs(pad), y: _mm(128 * s), width: _mm(w), rowHeight: _mm(10 * s), maxRows: 5 },
    };
}

// ── Portrait templates (L-10688) — the founder's ask #3 ────────────────────────
//
// ISO A sizes rotated: width < height. Nothing above changes; these are new
// rows with new ids, immediately selectable in the editor's Title Block
// dropdown (which reads `getAll()`) and honoured by the editor canvas, the PDF,
// the SVG/HTML print path and the DXF, because all four read paperWidth /
// paperHeight from the template they are handed.

const A0_PORTRAIT = buildStripTitleBlock('a0-portrait', 'A0 Portrait',  841, 1189, 180);
const A1_PORTRAIT = buildStripTitleBlock('a1-portrait', 'A1 Portrait',  594,  841, 160);
const A2_PORTRAIT = buildStripTitleBlock('a2-portrait', 'A2 Portrait',  420,  594, 140);
const A3_PORTRAIT = buildStripTitleBlock('a3-portrait', 'A3 Portrait',  297,  420, 110);
const A4_PORTRAIT = buildStripTitleBlock('a4-portrait', 'A4 Portrait',  210,  297,  90);

// ── Landscape gaps (L-10688) — A2 and A4 had no template either ────────────────
//
// Measured alongside the portrait gap and fixed in the same pass: the Paper
// dropdown offers A0–A4, but only A0/A1/A3 had a title block, so choosing A2 or
// A4 fell back to `getDefault()` (A1) and silently produced an A1 sheet. Same
// defect family as L-10684 — a control offering a value the system cannot
// honour.

const A2_LANDSCAPE = buildStripTitleBlock('a2-standard', 'A2 Standard', 594, 420, 140);
const A4_LANDSCAPE = buildStripTitleBlock('a4-standard', 'A4 Standard', 297, 210,  90);

// ── TitleBlockStore ────────────────────────────────────────────────────────────

class TitleBlockStoreImpl {
    private _templates: Map<string, TitleBlockTemplate> = new Map([
        // ⛔ The original three keep their positions AND their numbers — see
        // §TITLE-BLOCK-IS-BLOCK-LOCAL above. Appending, never reordering.
        ['a0-standard', A0_TEMPLATE],
        ['a1-standard', A1_TEMPLATE],
        ['a3-standard', A3_TEMPLATE],
        ['a2-standard', A2_LANDSCAPE],
        ['a4-standard', A4_LANDSCAPE],
        ['a0-portrait', A0_PORTRAIT],
        ['a1-portrait', A1_PORTRAIT],
        ['a2-portrait', A2_PORTRAIT],
        ['a3-portrait', A3_PORTRAIT],
        ['a4-portrait', A4_PORTRAIT],
    ]);

    getAll(): TitleBlockTemplate[] {
        return [...this._templates.values()].map(t => JSON.parse(JSON.stringify(t)));
    }

    get(templateId: string): TitleBlockTemplate | undefined {
        const t = this._templates.get(templateId);
        return t ? JSON.parse(JSON.stringify(t)) : undefined;
    }

    has(templateId: string): boolean {
        return this._templates.has(templateId);
    }

    /**
     * Returns the default template (A1 Standard).
     * Used when a sheet has no explicit titleBlock set.
     */
    getDefault(): TitleBlockTemplate {
        return JSON.parse(JSON.stringify(A1_TEMPLATE));
    }
}

export const titleBlockStore = new TitleBlockStoreImpl();
export type { TitleBlockStoreImpl };

// VIEW-SYSTEM-AUDIT-2026 F5.5 — register with StoreRegistry (read-only library).
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('title-block', titleBlockStore as unknown as import('../StoreRegistry').BimStore);
