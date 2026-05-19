/**
 * PdfExportService — DOC-3.4
 *
 * Full vector PDF export path for a PRYZM Sheet.
 *
 * Pipeline per viewport:
 *   1. Retrieve cached TechnicalDrawing (ViewTechnicalDrawingCache).
 *   2. Feed it into SVGCompositeRenderer together with AnnotationStore data
 *      to produce a fully-composited SVG string (linework + poche + annotations).
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
import { annotationStore }           from '@pryzm/plugin-annotations';
import { SVGCompositeRenderer }      from './SVGCompositeRenderer';
import { TechnicalDrawingBounds } from '@pryzm/core-app-model/views';

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
     */
    async exportSheet(sheetId: string): Promise<boolean> {
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

            // ── Compute actual viewport bounds from drawing geometry ───────────
            // Prefer DrawingViewport.bbox (OBC v3.4 API); falls back to
            // LineSegments traversal via TechnicalDrawingBounds.compute().
            let vpW = DEFAULT_VP_WIDTH_MM;
            let vpH = DEFAULT_VP_HEIGHT_MM;
            let originX = 0;
            let originZ = 0;

            if (drawing) {
                const bounds = TechnicalDrawingBounds.compute(drawing);
                if (bounds) {
                    const mm = TechnicalDrawingBounds.toMm(bounds, scale, 0.5);
                    vpW = Math.max(mm.widthMm,  DEFAULT_VP_WIDTH_MM);
                    vpH = Math.max(mm.heightMm, DEFAULT_VP_HEIGHT_MM);
                    originX = bounds.minX - mm.padX;
                    originZ = bounds.minZ - mm.padZ;
                    console.log(
                        `[PdfExportService] bbox-driven viewport for viewId=${vp.viewId}: ` +
                        `${vpW.toFixed(1)}×${vpH.toFixed(1)}mm at 1:${scale}`,
                    );
                } else {
                    console.warn(
                        `[PdfExportService] TechnicalDrawingBounds returned null for viewId=${vp.viewId} — ` +
                        `falling back to ${DEFAULT_VP_WIDTH_MM}×${DEFAULT_VP_HEIGHT_MM}mm defaults`,
                    );
                }
            }

            // SheetViewport.position is the centre of the viewport (mm).
            // jsPDF Y origin is top, so convert sheet canvas bottom-up → top-down.
            const vpX = Math.max(BORDER_MARGIN, vp.position.x - vpW / 2);
            const vpY = Math.max(BORDER_MARGIN, pH - (vp.position.y + vpH / 2));

            if (!drawing) {
                // Placeholder for views not yet projected
                console.warn(
                    `[PdfExportService] No TechnicalDrawing for viewId=${vp.viewId} — placeholder rendered`,
                );
                this._drawViewportPlaceholder(pdf, vpX, vpY, vpW, vpH, vp.viewId);
                continue;
            }

            // Build SVGCompositeRenderer for this viewport
            const viewBox = {
                originX,
                originZ,
                widthMm:  vpW,
                heightMm: vpH,
                scale,
            };

            const renderer = new SVGCompositeRenderer(viewBox);

            // Wall poche fills
            renderer.buildWallPoche(drawing, DEFAULT_POCHE_VG as any, 'A-WALL');

            // Projection linework from TechnicalDrawing
            renderer.setTechnicalDrawing(drawing);

            // Annotation overlay
            const annotations = annotationStore.getByView(vp.viewId);
            renderer.setAnnotations(annotations);

            // Render to SVG string
            const svgString = renderer.renderToSVGString();

            // Parse SVG string → live DOM SVGSVGElement (DOMParser is pure; no live-DOM side-effect)
            const svgEl = this._parseSvg(svgString);
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

            // Viewport border
            pdf.setDrawColor('#3b5bdb');
            pdf.setLineWidth(0.35);
            pdf.rect(vpX, vpY, vpW, vpH);

            // Viewport label beneath the border
            const viewLabel = `1:${scale}`;
            pdf.setFontSize(5);
            pdf.setTextColor('#3b5bdb');
            pdf.text(viewLabel, vpX + 1, vpY + vpH + 3);
        }

        // ── Title block fields ─────────────────────────────────────────────────
        this._drawTitleBlock(pdf, sheet, template, pW, pH);

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
        sheet: { sheetNumber: string; name: string; revision?: string; issueDate?: string; issuedBy?: string },
        template: { paperWidth: number; paperHeight: number; borderWidth: number; fields: any[] },
        pW: number,
        pH: number,
    ): void {
        const tbX0 = pW - template.borderWidth;

        // Build field values map
        const fieldValues: Record<string, string> = {
            sheetNumber: sheet.sheetNumber,
            sheetName:   sheet.name,
            revision:    sheet.revision   || '—',
            date:        sheet.issueDate  || new Date().toLocaleDateString('en-GB'),
            issuedBy:    sheet.issuedBy   || '',
        };

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

        pdf.setFontSize(5);
        pdf.setTextColor('#94a3b8');
        pdf.text(
            `View not yet projected (${viewId.slice(-8)})`,
            x + w / 2,
            y + h / 2,
            { align: 'center' },
        );
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
