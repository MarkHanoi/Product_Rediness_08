/**
 * PdfExportService — DOC-3.4
 *
 * Full vector PDF export path for a PRYZM Sheet.
 *
 * Pipeline per viewport:
 *   1. `composeViewportSvg()` — THE one producer of "a view on a sheet"
 *      (§SHEET-ONE-VIEWPORT-PRODUCER, L-1630). It reads the cached
 *      TechnicalDrawing, frames it from its own content bounds, and composes
 *      linework + poche + annotations into an SVG string. The sheet EDITOR
 *      consumes the same call, which is what stops the placed view and the
 *      exported view drifting apart (C06 §13.3).
 *   3. Parse the SVG string to a live DOM SVGSVGElement.
 *   4. Embed the SVGSVGElement into the jsPDF document at the viewport's
 *      paper-space position using svg2pdf.js — all lines, text, and fills
 *      become native PDF vector objects (zoom to 1000 % — no rasterisation).
 *
 * Sheet assembly:
 *   - Paper size and title block position are read from TitleBlockStore.
 *   - A thin sheet border and all TitleBlock fields are drawn directly via
 *     the jsPDF text/line API so they are searchable in Acrobat.
 *   - Viewports with no cached TechnicalDrawing are drawn as dashed
 *     placeholder rectangles (the sheet is still saved — partial output is
 *     better than failure).
 *
 * Contract compliance:
 *   §01 §5  — No Three.js scene manipulation; all inputs are read-only.
 *   §01 §2  — Export triggered via ExportSheetCommand (Class B non-undoable).
 *   §05 §4  — Browser DOM usage is limited to DOMParser (string → SVGElement),
 *             which is a pure parse operation with no side-effects on the live DOM.
 *   §07     — Client-side only; no server routes.
 *
 * Usage (via ExportSheetCommand):
 *   window.pdfExportService.exportSheet(sheetId)
 *
 * Registered on window.pdfExportService by initUI.ts.
 */

import { jsPDF }     from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

import { sheetStore }                from '@pryzm/core-app-model';
import { titleBlockStore } from '@pryzm/core-app-model/views';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { viewportPreviewRenderer, fitLetterbox } from '@pryzm/core-app-model/presentation';
import { composeForPlacement, viewportPaperRect } from './ViewportSvgComposer';
import { chromeFor } from './SheetRenderTarget';
import { resolveTitleBlockValues } from './TitleBlockValues';
import type { TitleBlockContext, TitleBlockSheet } from './TitleBlockValues';
import { applyPdfProvenanceAbsence } from '../provenanceAbsence';

/**
 * §SHEET-PDF-CARRIES-THE-3D (L-3803) — view types that have no vector form and
 * never will. `SheetProjectionOrchestrator` excludes them from projection by
 * design, so `viewTechnicalDrawingCache` is empty for them by construction, not
 * by accident. They are the RASTER leg; everything else is the vector leg.
 */
const RASTER_VIEW_TYPES = new Set(['3d', 'render', 'walkthrough']);

// ── Layout constants ──────────────────────────────────────────────────────────

/** Default viewport paper-space size when not stored on the SheetViewport (mm). */
const DEFAULT_VP_WIDTH_MM  = 120;
const DEFAULT_VP_HEIGHT_MM = 90;

/** Sheet border margin from paper edge (mm). */
const BORDER_MARGIN = 5;

/** Fallback poche VG style — used when the viewport has no VG model bound. */
const DEFAULT_POCHE_VG = { fillColor: '#333333', transparency: 0 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// PdfExportService
// ─────────────────────────────────────────────────────────────────────────────

class PdfExportServiceImpl {

    // ── Initialisation ────────────────────────────────────────────────────────

    /**
     * Bind any engine-level resources needed by the export service.
     * No OBC Components are required for PDF export (unlike DXF), but the
     * init() hook is kept for architectural parity with DxfExportService so
     * initUI.ts can call both services the same way.
     */
    init(_components: unknown): void {
        console.log('[PdfExportService] Initialised');
    }

    // ── Public Export API ─────────────────────────────────────────────────────

    /**
     * Export a sheet to a vector PDF and trigger a browser file download.
     *
     * The returned Promise resolves to `true` when the PDF was generated and
     * download was triggered, or `false` when export could not proceed (sheet
     * not found, zero viewports, etc.).
     *
     * @param sheetId — SheetDefinition.id to export.
     * @param ctx — §SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806). The facts a title
     *   block needs that do not live on the sheet: project name, site address,
     *   and the sign-off names. OPTIONAL, and omitting it renders those fields
     *   EMPTY — which is the founder's rule ("a field with no source must render
     *   EMPTY, never a placeholder that looks like data") and is deliberately
     *   the failure mode of forgetting. There is no argument to this function
     *   that causes an invented value to be printed.
     */
    async exportSheet(sheetId: string, ctx: TitleBlockContext = {}): Promise<boolean> {
        const sheet = sheetStore.get(sheetId);
        if (!sheet) {
            console.warn(`[PdfExportService] Sheet '${sheetId}' not found`);
            return false;
        }

        // ── Paper size from TitleBlock template ───────────────────────────────
        const template = sheet.titleBlock
            ? (titleBlockStore.get(sheet.titleBlock) ?? titleBlockStore.getDefault())
            : titleBlockStore.getDefault();

        const pW = template.paperWidth;   // mm
        const pH = template.paperHeight;  // mm

        // ── jsPDF document ────────────────────────────────────────────────────
        const orientation = pW >= pH ? 'landscape' : 'portrait';
        const pdf = new jsPDF({
            orientation,
            unit:   'mm',
            format: [pW, pH],
        });

        // ── Sheet border ──────────────────────────────────────────────────────
        pdf.setDrawColor('#1a1a2e');
        pdf.setLineWidth(0.5);
        pdf.rect(BORDER_MARGIN, BORDER_MARGIN, pW - 2 * BORDER_MARGIN, pH - 2 * BORDER_MARGIN);

        // ── Title block panel border ──────────────────────────────────────────
        const tbW  = template.borderWidth;   // right-side panel width (mm)
        const tbX0 = pW - tbW;
        pdf.setLineWidth(0.35);
        pdf.line(tbX0, BORDER_MARGIN, tbX0, pH - BORDER_MARGIN);

        // ── Viewport rendering ────────────────────────────────────────────────
        let resolvedCount = 0;

        for (const vp of sheet.viewports) {
            const scale = vp.scale ?? 100;

            const drawing = viewTechnicalDrawingCache.get(vp.viewId);

            // §SHEET-ONE-VIEWPORT-PRODUCER (L-1630) — framing + composition are no
            // longer computed here. They are computed once, in
            // `composeViewportSvg`, which the sheet EDITOR consumes too, so the
            // placed view and the exported view cannot disagree about linework
            // or size.
            //
            // §SHEET-PDF-PLACES-THE-VIEWPORT (L-1874) — routed through
            // `composeForPlacement` rather than calling the composer directly,
            // because this call site had SILENTLY DROPPED `cropWorldM`. A
            // viewport the founder cropped on the sheet exported uncropped and
            // at a different size: one producer, honoured by one of its two
            // consumers, which is exactly the divergence L-1630 existed to end.
            const composed = composeForPlacement(vp, {
                minWidthMm:  DEFAULT_VP_WIDTH_MM,
                minHeightMm: DEFAULT_VP_HEIGHT_MM,
                paddingM:    0.5,
                pocheStyle:  DEFAULT_POCHE_VG as never,
            });

            // ── Viewport size comes from the composition, never a default ──────
            const rect = viewportPaperRect(vp, composed.resolved
                ? composed
                : { widthMm: DEFAULT_VP_WIDTH_MM, heightMm: DEFAULT_VP_HEIGHT_MM });
            const vpW = rect.widthMm;
            const vpH = rect.heightMm;

            if (drawing && composed.resolved) {
                console.log(
                    `[PdfExportService] composed viewport for viewId=${vp.viewId}: ` +
                    `${vpW.toFixed(1)}×${vpH.toFixed(1)}mm at 1:${scale}` +
                    `${composed.cropped ? ' (cropped)' : ''}`,
                );
            } else if (drawing) {
                console.warn(
                    `[PdfExportService] composition returned '${composed.reason}' for viewId=${vp.viewId} — ` +
                    `falling back to ${DEFAULT_VP_WIDTH_MM}×${DEFAULT_VP_HEIGHT_MM}mm defaults`,
                );
            }

            // ── §SHEET-PDF-PLACES-THE-VIEWPORT (L-1874) — BOTTOM-LEFT CORNER ──
            //
            // This read `vp.position` as the viewport's CENTRE — `position.x -
            // vpW/2` — on the authority of a doc comment in
            // `SheetDefinitionTypes` that no writer in the product agrees with.
            // The sheet editor renders `left = position.x`, and its drop handler
            // subtracts half the composed size precisely so that the STORED
            // value is a corner. So the PDF placed every viewport off by half
            // its own size in both axes; for the founder's elevation that is
            // four metres of paper, and it is why his South Elevation landed
            // somewhere he never put it.
            //
            // jsPDF's Y origin is the TOP of the page; the sheet's is the
            // BOTTOM. The flip is the only conversion this surface owns.
            const vpX = Math.max(BORDER_MARGIN, rect.leftMm);
            const vpY = Math.max(BORDER_MARGIN, pH - rect.bottomMm - vpH);

            if (!drawing) {
                // ── §SHEET-PDF-CARRIES-THE-3D (L-3803) — THE RASTER LEG ──────
                //
                // The founder: *"the PDF does not contain the 3D view — page
                // size is right, the 3D viewport is missing from the output."*
                //
                // THE DEFECT WAS THAT THIS BRANCH HAD NO ELSE. `3d` / `render` /
                // `walkthrough` are excluded from projection by design, so
                // `drawing` is ALWAYS undefined for them and every 3D viewport
                // fell out here into a labelled empty rectangle. The 3D was not
                // lost converting SVG to PDF — it was never handed to it.
                //
                // ⚠ A HYPOTHESIS WAS REFUTED ON THE WAY HERE, AND THAT IS WORTH
                // MORE THAN THE FIX. The suspicion was a second, rival viewport
                // producer inside the PDF ("bbox-driven viewport"). FALSE — that
                // string is a stale log message. Re-measured rather than taken
                // on trust: this file imports `composeForPlacement` and calls it
                // above. There is ONE producer and C06 §13.3 holds, so the sheet
                // and the PDF CANNOT disagree about composition. The gap is a
                // MISSING RASTER LEG in a surface that has only ever had a
                // vector one — a different defect with a different fix, and
                // hunting the rival would have found nothing.
                const isRaster = RASTER_VIEW_TYPES.has(
                    (viewDefinitionStore.get(vp.viewId)?.viewType ?? '') as string,
                );
                if (isRaster && this._drawRasterViewport(pdf, vpX, vpY, vpW, vpH, vp.viewId)) {
                    resolvedCount++;
                    this._drawViewportChrome(pdf, vpX, vpY, vpW, vpH, scale);
                    continue;
                }

                // §SHEET-PDF-PLACES-THE-VIEWPORT (L-1874) — a 3D view has no
                // vector drawing and never will. Drawing an unlabelled dashed
                // rectangle made that read as a broken export. The placeholder
                // NAMES the reason on the page.
                console.warn(
                    `[PdfExportService] No TechnicalDrawing for viewId=${vp.viewId} — labelled placeholder rendered`,
                );
                this._drawViewportPlaceholder(pdf, vpX, vpY, vpW, vpH, vp.viewId);
                continue;
            }

            // Parse the composed SVG → live DOM SVGSVGElement
            // (DOMParser is pure; no live-DOM side-effect)
            const svgEl = this._parseSvg(composed.svg);
            if (!svgEl) {
                console.warn(`[PdfExportService] SVG parse failed for viewId=${vp.viewId} — placeholder rendered`);
                this._drawViewportPlaceholder(pdf, vpX, vpY, vpW, vpH, vp.viewId);
                continue;
            }

            // Embed SVG as native vector content via svg2pdf
            try {
                await svg2pdf(svgEl, pdf, {
                    x:      vpX,
                    y:      vpY,
                    width:  vpW,
                    height: vpH,
                });
                resolvedCount++;
            } catch (err) {
                console.error(`[PdfExportService] svg2pdf failed for viewId=${vp.viewId}:`, err);
                this._drawViewportPlaceholder(pdf, vpX, vpY, vpW, vpH, vp.viewId);
            }

            this._drawViewportChrome(pdf, vpX, vpY, vpW, vpH, scale);
        }

        // ── Title block fields ─────────────────────────────────────────────────
        this._drawTitleBlock(pdf, sheet, template, pW, pH, ctx);

        // PV-04 / C75 §7.7 — a flattened sheet PDF carries no ValueProvenance
        // mapping; the absence is recorded BY NAME in the document metadata
        // rather than silently stripped. See export/provenanceAbsence.ts.
        applyPdfProvenanceAbsence(pdf);

        // ── Save / Download ────────────────────────────────────────────────────
        const filename = `${sheet.sheetNumber}-${sheet.name.replace(/\s+/g, '_')}.pdf`;
        pdf.save(filename);

        console.log(
            `[PdfExportService] PDF export complete — ${sheet.sheetNumber} "${sheet.name}"` +
            ` (${resolvedCount}/${sheet.viewports.length} viewports with linework)`,
        );

        return true;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Draw title block fields directly using jsPDF's text API so the content
     * is fully searchable and selectable in PDF readers.
     */
    private _drawTitleBlock(
        pdf: jsPDF,
        sheet: TitleBlockSheet,
        template: { paperWidth: number; paperHeight: number; borderWidth: number; fields: any[] },
        pW: number,
        pH: number,
        ctx: TitleBlockContext,
    ): void {
        const tbX0 = pW - template.borderWidth;

        // §SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806) — ONE producer for these
        // values. This map used to be built inline here, and identically (and
        // identically WRONGLY) in `SheetEditorPanel` and the other export
        // services: five keys against a template declaring eleven, so PROJECT,
        // ADDRESS, SCALE, DRAWN, CHECKED, APPROVED and CONTRACT No. all rendered
        // blank — the founder's screenshot. The sixth key, `issuedBy`, matched
        // no template field key at all and was dead.
        //
        // Note `revision` no longer falls back to '—'. Under the founder's rule
        // a field with no source renders EMPTY; a dash is a mark a reader can
        // mistake for a revision code.
        const fieldValues = resolveTitleBlockValues(sheet, ctx);

        for (const field of template.fields) {
            // TitleBlock coordinates: x is absolute mm from paper left, y is from paper bottom.
            // jsPDF y is from paper top.
            const fx = tbX0 + (field.x - tbX0);
            const fy = pH - field.y;

            const value = fieldValues[field.key] ?? '';
            if (!value) continue;

            // Cell border
            pdf.setDrawColor('#cccccc');
            pdf.setLineWidth(0.18);
            if (field.width && field.height) {
                pdf.rect(fx, fy - field.height, field.width, field.height);
            }

            // Label (small, grey)
            pdf.setFontSize(4);
            pdf.setTextColor('#888888');
            pdf.text(field.label ?? '', fx + 0.8, fy - field.height + 2.5);

            // Value
            const fontSize = field.fontSize ?? 7;
            pdf.setFontSize(fontSize);
            pdf.setTextColor('#111111');
            if (field.bold) pdf.setFont('helvetica', 'bold');
            pdf.text(value, fx + 0.8, fy - field.height * 0.3);
            pdf.setFont('helvetica', 'normal');
        }

        // PRYZM watermark (bottom-left of title block)
        pdf.setFontSize(5);
        pdf.setTextColor('#aaaaaa');
        pdf.text(
            'Generated by PRYZM BIM',
            tbX0 + 1,
            pH - BORDER_MARGIN - 1,
        );
    }

    /**
     * §SHEET-CHROME-IS-NOT-THE-DRAWING (L-3804) — the viewport frame and its
     * `1:50` label, drawn ONLY IF THIS TARGET DRAWS THEM.
     *
     * The founder: *"the blue viewport border and the `{3D} … 1:50` label bar
     * are on-screen editing affordances. They must not print."*
     *
     * They were being drawn UNCONDITIONALLY — `pdf.setDrawColor('#3b5bdb')`,
     * `pdf.rect(...)`, then the label — at the bottom of the viewport loop, on
     * every export. A blue rectangle on an issued drawing is not decoration: a
     * reader cannot distinguish it from a section box, a match line or a detail
     * bubble, all of which are real annotation that MEANS something. Printing
     * the editor's furniture puts marks on a construction document that nobody
     * drew and nothing in the model backs.
     *
     * The decision is delegated to `chromeFor('print')` rather than deleted
     * outright, because the founder asked for an explicit render-target
     * distinction and not a hidden flag: the policy lives in ONE module both
     * surfaces read, so a future affordance has an obvious home and cannot be
     * added as "chrome, probably fine to print". Deleting these lines would
     * have satisfied the symptom and left the next affordance to repeat it.
     *
     * This is a no-op today for every call site, since this service always
     * exports for print. It is kept as a call rather than removed so that the
     * chrome is EXPLICITLY DECLINED at the point it would have been drawn — an
     * absence with a reason attached, which a reader can check, rather than an
     * absence that looks like an oversight.
     */
    private _drawViewportChrome(
        pdf: jsPDF,
        x: number, y: number, w: number, h: number,
        scale: number,
    ): void {
        const chrome = chromeFor('print');

        if (chrome.frame) {
            pdf.setDrawColor('#3b5bdb');
            pdf.setLineWidth(0.35);
            pdf.rect(x, y, w, h);
        }

        if (chrome.scaleLabel) {
            pdf.setFontSize(5);
            pdf.setTextColor('#3b5bdb');
            pdf.text(`1:${scale}`, x + 1, y + h + 3);
        }
    }

    /**
     * §SHEET-PDF-CARRIES-THE-3D (L-3803) — place a 3D capture on the page.
     *
     * Returns `true` when a frame was actually embedded, `false` when there is
     * none to embed — the caller then falls through to the labelled placeholder.
     * A boolean rather than a throw because "the user has not opened the 3D view
     * this session" is an ordinary state, not an error, and it must produce the
     * placeholder that NAMES it rather than aborting the export of the other
     * viewports on the sheet.
     *
     * ─── WHY THE IMAGE IS FITTED, NOT STRETCHED ────────────────────────────
     * Same rule as the screen (§SHEET-3D-LETTERBOX-IS-PAPER, L-3801), through
     * the SAME function: `fitLetterbox` is imported rather than reimplemented,
     * so the PDF and the sheet cannot disagree about where inside its rect the
     * capture sits. Stretching to fill would falsify the view.
     *
     * ⭐ AND ON PAPER THE BARS COST NOTHING. The screen has to PAINT the
     * remainder to stop it being scene-coloured; here, not drawing is already
     * paper. So the letterboxed 3D lands on white with no fill at all — which
     * is the outcome L-3801 had to construct on the screen, arrived at for
     * free.
     */
    private _drawRasterViewport(
        pdf: jsPDF,
        x: number, y: number, w: number, h: number,
        viewId: string,
    ): boolean {
        const capture = viewportPreviewRenderer.resolve3DCapture();
        if (!capture) {
            console.warn(
                `[PdfExportService] viewId=${viewId} is a raster view but no 3D frame has been ` +
                'captured this session — placeholder rendered. Open the 3D view once before exporting.',
            );
            return false;
        }

        // §SHEET-3D-SNAPSHOT-IS-DATED (L-1875) — the badge is screen chrome and
        // is suppressed in print (`chromeFor('print').snapshotBadge === false`),
        // but the STALENESS DOES NOT STOP MATTERING just because the badge is
        // not drawn. It changes channel: logged here, at the moment of export,
        // naming the age of the frame that went onto the page. Recorded as an
        // open question (L-3805) rather than settled quietly — a dated capture
        // on an issued drawing is a provenance question, not a styling one.
        if (capture.capturedAt !== null) {
            const ageMs = Date.now() - capture.capturedAt;
            console.warn(
                `[PdfExportService] viewId=${viewId} embedded a 3D SNAPSHOT captured ` +
                `${Math.round(ageMs / 1000)}s ago, not a live frame — the 3D surface was not ` +
                'renderable at export time (the sheet editor hides it, L-1470).',
            );
        }

        const fit = fitLetterbox(capture.canvas.width, capture.canvas.height, w, h);

        try {
            // PNG rather than JPEG: a 3D view of a building is large flat areas
            // and hard edges, which is exactly what JPEG's ringing artefacts are
            // worst on, and those artefacts would read as geometry.
            const dataUrl = capture.canvas.toDataURL('image/png');
            pdf.addImage(dataUrl, 'PNG', x + fit.dx, y + fit.dy, fit.dw, fit.dh);
        } catch (err) {
            // A tainted (cross-origin) canvas throws on toDataURL. That is a
            // real possibility for a WebGL surface and must degrade to the
            // named placeholder, never to a silent blank rectangle.
            console.error(
                `[PdfExportService] 3D capture for viewId=${viewId} could not be read ` +
                '(canvas may be tainted) — placeholder rendered:', err,
            );
            return false;
        }

        console.log(
            `[PdfExportService] embedded 3D raster for viewId=${viewId}: ` +
            `${fit.dw.toFixed(1)}×${fit.dh.toFixed(1)}mm in a ${w.toFixed(1)}×${h.toFixed(1)}mm ` +
            `viewport (${(fit.barFraction * 100).toFixed(0)}% paper margin)`,
        );
        return true;
    }

    /**
     * Draw a dashed placeholder rectangle for viewports whose TechnicalDrawing
     * has not yet been cached (view not yet projected).
     */
    private _drawViewportPlaceholder(
        pdf: jsPDF,
        x: number, y: number, w: number, h: number,
        viewId: string,
    ): void {
        pdf.setDrawColor('#94a3b8');
        pdf.setLineWidth(0.25);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.rect(x, y, w, h);
        pdf.setLineDashPattern([], 0);

        // §SHEET-PDF-PLACES-THE-VIEWPORT (L-1874) — SAY WHICH ABSENCE THIS IS.
        //
        // This always printed "View not yet projected", which is true for an
        // elevation whose projection has not run and FALSE for a 3D view, which
        // will never have one: `3d`, `render` and `walkthrough` are excluded
        // from vector projection by design, so no amount of waiting produces
        // linework for them. Printing "not yet" for a "never" is what made the
        // founder's empty dashed box read as a broken export rather than as a
        // capability boundary [context-data-honesty].
        const view  = viewDefinitionStore.get(viewId);
        const isRasterOnly = view
            ? ['3d', 'render', 'walkthrough'].includes(view.viewType as string)
            : false;
        const name = view?.name ?? viewId.slice(-8);
        const reason = isRasterOnly
            ? `${name} — 3D views have no vector drawing`
            : `${name} — not yet projected`;

        pdf.setFontSize(5);
        pdf.setTextColor('#94a3b8');
        pdf.text(reason, x + w / 2, y + h / 2, { align: 'center' });
    }

    /**
     * Parse an SVG string to a live SVGSVGElement using DOMParser.
     * Returns `null` if the parse fails or the result is not an SVG element.
     *
     * DOMParser is a pure parser — it does not attach the element to the
     * live document, so this satisfies §05 §4 (no live-DOM side-effects).
     */
    private _parseSvg(svgString: string): SVGSVGElement | null {
        try {
            const parser = new DOMParser();
            const doc    = parser.parseFromString(svgString, 'image/svg+xml');
            const root   = doc.documentElement;
            if (root.nodeName !== 'svg') {
                console.warn('[PdfExportService] DOMParser produced non-SVG root:', root.nodeName);
                return null;
            }
            return root as unknown as SVGSVGElement;
        } catch (err) {
            console.error('[PdfExportService] DOMParser threw:', err);
            return null;
        }
    }
}

export const pdfExportService = new PdfExportServiceImpl();
export type { PdfExportServiceImpl };
