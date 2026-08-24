/**
 * SheetPaperResolution — §SHEET-PAPER-IS-THE-SHEETS (L-10684)
 *
 * THE ONE DEFINITION of how big an issued sheet is, and where the title block's
 * fields land on it.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 * The founder set `Paper: A0` and `Title Block: A3 Standard`, and PRYZM exported
 * a **420 × 297 mm** page. Measured: all four surfaces that draw a sheet — the
 * editor canvas, the PDF, the SVG/print path and the DXF — read
 * `template.paperWidth/paperHeight`. `SheetDefinition.paperSize` was
 *
 *   · WRITE-DEAD — the editor patched a key `SheetStore.update()` did not handle
 *     and `UpdateSheetPatch` did not declare, behind an `as any` at the call
 *     site; the one working writer, `SheetStore.setPaperSize`, had ZERO callers.
 *     ⭐ A cast silencing a store that cannot accept the write is exactly how
 *     "I picked A0 and got A3" survives: the type system was told to stop
 *     asking.
 *   · READ-DEAD — its only readers were a dropdown's selected state and an info
 *     label.
 *
 * So the Paper control was not the authority over anything. It was disclosed
 * (the export warned by name) but the authority was never moved, because the
 * title block's field coordinates are ABSOLUTE millimetres from the PAPER's left
 * edge (`x: 305` on a 420 mm page) — preferring the sheet's paper size without
 * re-anchoring them would have thrown every field off the sheet.
 *
 * ─── THE RESOLUTION ────────────────────────────────────────────────────────
 * ⭐ THE RE-ANCHORING IS A TRANSFORM EVERY CONSUMER ALREADY PERFORMED INLINE.
 * `SheetEditorPanel`, `PdfExportService`, `SheetExportService` and
 * `DxfExportService` each compute `field.x - (paperWidth - borderWidth)` to get
 * a field's offset within the strip. That IS the block-local coordinate. All
 * this module does is complete the round trip — subtract the template's own
 * paper width, add the ACTUAL one — in one place instead of four.
 *
 * ⛔ AND IT IS THE IDENTITY WHEN NOTHING CHANGED. When the resolved paper equals
 * the template's own paper (which is every sheet authored before this change,
 * and every sheet whose Paper matches its title block), `titleBlockFieldsOnPaper`
 * returns the same millimetres it was given. That is the migration-safety
 * property, and `sheetPaperAuthority.test.ts` asserts it field by field for
 * `a1-standard` — the template every already-authored sheet references.
 *
 * ─── SIZE FROM THE SHEET, ORIENTATION FROM THE TITLE BLOCK ─────────────────
 * `SheetDefinition.paperSize` names a SIZE ('A0'), never an orientation. The
 * title block names an ORIENTATION (a3-portrait is 297 × 420). Neither is
 * redundant, so neither is discarded: the size comes from the sheet and the
 * orientation from the template. `Paper: A0` + `Title Block: A3 Portrait` is an
 * A0 sheet in portrait — 841 × 1189 — which is the only reading under which both
 * controls mean something.
 *
 * ─── WHEN THE SHEET'S PAPER IS REFUSED ─────────────────────────────────────
 * ⛔ A paper the block does not fit on is not honoured — it is REFUSED BY NAME,
 * with both numbers, and the template's own paper is used. Silently drawing a
 * 180 mm title block on a 210 mm-wide A4 page, or fields at y = 260 mm on a
 * 210 mm-tall one, would put the block off the page: a worse outcome than the
 * defect being fixed. This preserves the disclosure L-10684 already shipped and
 * gives it a real reason instead of "the title block wins".
 *
 * Pure data module: no DOM, no THREE, no I/O.
 */

import { PAPER_SIZES } from './TitleBlockTypes';
import type { TitleBlockTemplate, TitleBlockFieldZone } from './TitleBlockTypes';
import type { PaperSize } from './SheetDefinitionTypes';

/** Just enough of a sheet to resolve its paper. Keeps this callable from a test
 *  and from the export worker without constructing a whole SheetDefinition. */
export interface PaperBearingSheet {
    paperSize?: PaperSize | undefined;
}

export interface ResolvedSheetPaper {
    /** Paper width in millimetres. */
    widthMm:  number;
    /** Paper height in millimetres. */
    heightMm: number;
    /** Which side won. `'template'` means the sheet named nothing usable, or
     *  named something the title block does not fit on. */
    source:   'sheet' | 'template';
    /** Set ONLY when the sheet named a size that was refused — carries both
     *  numbers so the refusal can be printed rather than guessed at. */
    refusal?: string;
}

/**
 * Vertical extent the template's own content occupies, measured from the paper
 * bottom. A block whose fields reach 372 mm cannot go on a 210 mm page.
 */
export function titleBlockContentTopMm(template: TitleBlockTemplate): number {
    let top = 0;
    for (const f of template.fields) top = Math.max(top, f.y + f.height);
    const rz = template.revisionZone;
    if (rz) top = Math.max(top, rz.y + rz.rowHeight * rz.maxRows);
    return top;
}

/** True iff `template`'s strip and content fit on a `widthMm × heightMm` page. */
export function titleBlockFitsPaper(
    template: TitleBlockTemplate,
    widthMm:  number,
    heightMm: number,
): boolean {
    // The strip must leave a drawing area, not merely fit.
    if (template.borderWidth >= widthMm) return false;
    return titleBlockContentTopMm(template) <= heightMm;
}

/**
 * How big is this sheet, really.
 *
 * Precedence: the sheet's own `paperSize` (at the template's orientation) →
 * the template's paper. `'custom'` and any unknown key fall through to the
 * template, because "custom" names no dimensions and inventing some would be
 * the placeholder-that-looks-like-data failure in a new place.
 */
export function resolveSheetPaper(
    sheet:    PaperBearingSheet | null | undefined,
    template: TitleBlockTemplate,
): ResolvedSheetPaper {
    const fromTemplate: ResolvedSheetPaper = {
        widthMm:  template.paperWidth,
        heightMm: template.paperHeight,
        source:   'template',
    };

    const key = sheet?.paperSize;
    if (!key || key === 'custom') return fromTemplate;

    const named = PAPER_SIZES[key];
    if (!named) return fromTemplate;

    // Orientation comes from the title block, size from the sheet. PAPER_SIZES
    // is tabulated landscape, so a portrait template swaps the pair.
    const templateIsPortrait = template.paperHeight > template.paperWidth;
    const widthMm  = templateIsPortrait ? Math.min(named.width, named.height) : Math.max(named.width, named.height);
    const heightMm = templateIsPortrait ? Math.max(named.width, named.height) : Math.min(named.width, named.height);

    if (!titleBlockFitsPaper(template, widthMm, heightMm)) {
        return {
            ...fromTemplate,
            refusal:
                `Paper '${key}' (${widthMm}×${heightMm}mm) cannot carry title block ` +
                `'${template.name}' — the block is ${template.borderWidth}mm wide and its ` +
                `content reaches ${titleBlockContentTopMm(template)}mm. ` +
                `Sheet drawn at the title block's own ${template.paperWidth}×${template.paperHeight}mm instead.`,
        };
    }

    // An exact match is not a "sheet wins" case worth reporting — it is the
    // same paper by two routes.
    if (widthMm === template.paperWidth && heightMm === template.paperHeight) return fromTemplate;

    return { widthMm, heightMm, source: 'sheet' };
}

/**
 * Where the title-block strip starts, on the paper actually being drawn.
 *
 * The strip is flush to the right edge and full height — the shape all four
 * consumers already draw.
 */
export function titleBlockStripLeftMm(template: TitleBlockTemplate, paperWidthMm: number): number {
    return paperWidthMm - template.borderWidth;
}

/**
 * The template's fields, re-anchored to `paperWidthMm`.
 *
 * ⛔ THE IDENTITY CASE IS THE IMPORTANT ONE. When `paperWidthMm` equals the
 * template's own paper width the returned `x` values are bit-identical to the
 * authored ones, because the shift is `paperWidthMm - template.paperWidth` = 0.
 * Every sheet authored before L-10684 renders exactly as it did.
 *
 * `y` is untouched: the strip is full height and its content is bottom-anchored,
 * so a taller page simply leaves more empty strip above — which is where a title
 * block belongs on any paper.
 */
export function titleBlockFieldsOnPaper(
    template:     TitleBlockTemplate,
    paperWidthMm: number,
): TitleBlockFieldZone[] {
    const shift = paperWidthMm - template.paperWidth;
    if (shift === 0) return template.fields;
    return template.fields.map(f => ({ ...f, x: f.x + shift }));
}

/** The revision zone, re-anchored the same way. `undefined` stays `undefined`. */
export function titleBlockRevisionZoneOnPaper(
    template:     TitleBlockTemplate,
    paperWidthMm: number,
): TitleBlockTemplate['revisionZone'] {
    const rz = template.revisionZone;
    if (!rz) return undefined;
    const shift = paperWidthMm - template.paperWidth;
    return shift === 0 ? rz : { ...rz, x: rz.x + shift };
}

/**
 * Everything a drawing surface needs, resolved once.
 *
 * Consumers should call THIS rather than reading `template.paperWidth` — that
 * read is what made the Paper dropdown ornamental.
 */
export interface SheetPaperPlacement extends ResolvedSheetPaper {
    /** Left edge of the title-block strip on the resolved paper (mm). */
    stripLeftMm:   number;
    /** Fields re-anchored to the resolved paper. */
    fields:        TitleBlockFieldZone[];
    revisionZone:  TitleBlockTemplate['revisionZone'];
}

export function placeSheetOnPaper(
    sheet:    PaperBearingSheet | null | undefined,
    template: TitleBlockTemplate,
): SheetPaperPlacement {
    const paper = resolveSheetPaper(sheet, template);
    return {
        ...paper,
        stripLeftMm:  titleBlockStripLeftMm(template, paper.widthMm),
        fields:       titleBlockFieldsOnPaper(template, paper.widthMm),
        revisionZone: titleBlockRevisionZoneOnPaper(template, paper.widthMm),
    };
}
