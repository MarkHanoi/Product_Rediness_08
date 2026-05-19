/**
 * SheetExportService — Phase S7 (Sheet Integration)
 *
 * Exports a PRYZM Sheet to a printable format using the browser print API.
 * Uses CSS @media print to render a full-page sheet layout.
 *
 * DOC-3.5: exportToPrint() now injects SVGCompositeRenderer output per viewport
 * so that print output shows real vector linework, wall poche fills, and
 * annotation overlays — not just placeholder boxes.
 *
 * Contract compliance:
 *   §01      — Read-only; no store mutations, no Command routing
 *   §01 §5   — No Three.js scene manipulation; all inputs are read-only from cache
 *   §05      — Uses sh- CSS from AppTheme; no bim-* elements
 *   §05 §4   — Live DOM creation is limited to the temporary print layer,
 *              which is an established pattern in this service (pre-DOC-3.5)
 *   §06      — No platform-layer imports
 *   §07      — No server routes; client-side only
 *
 * Usage:
 *   window.sheetExportService.exportToPrint(sheetId)
 *
 * Registered on window.sheetExportService by EngineBootstrap.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { sheetStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { titleBlockStore } from '@pryzm/core-app-model/views';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import { SVGCompositeRenderer } from './SVGCompositeRenderer';

const PRINT_STYLE_ID = 'pryzm-sheet-print-style';

class SheetExportServiceImpl {

    // ── Phase SC-6: PNG Export ────────────────────────────────────────────────

    /**
     * Exports the sheet as a PNG image and triggers a file download.
     * Captures the visible sheet canvas using html2canvas-like approach via
     * a hidden clone + Canvas 2D composition of existing preview canvases.
     */
    exportToPng(sheetId: string, dpi: number = 150): void {
        const sheet = sheetStore.get(sheetId);
        if (!sheet) {
            console.warn(`[SheetExportService] Sheet '${sheetId}' not found`);
            return;
        }

        // Find the live sheet canvas in the DOM (set by SheetEditorPanel)
        const canvasEl = document.querySelector('.sh-overlay .sh-canvas') as HTMLElement | null;
        if (!canvasEl) {
            console.warn('[SheetExportService] No active sheet canvas found — open the sheet editor first.');
            return;
        }

        const scale  = dpi / 96; // Convert DPI to device pixel ratio
        const w      = canvasEl.offsetWidth;
        const h      = canvasEl.offsetHeight;
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);

        // Draw all existing preview canvases from viewport cards
        const previewCanvases = canvasEl.querySelectorAll<HTMLCanvasElement>('.sh-viewport-preview');
        const parentCanvas    = canvasEl.getBoundingClientRect();

        previewCanvases.forEach(pc => {
            const vpEl = pc.closest('.sh-viewport') as HTMLElement;
            if (!vpEl) return;
            const rect = vpEl.getBoundingClientRect();
            const x    = rect.left - parentCanvas.left;
            const y    = rect.top  - parentCanvas.top;
            try {
                ctx.drawImage(pc, x, y, rect.width, rect.height);
            } catch (_e) {
                // Cross-origin canvas issue — draw placeholder
                ctx.fillStyle = '#e8eaf0';
                ctx.fillRect(x, y, rect.width, rect.height);
            }
        });

        ctx.resetTransform();
        canvas.toBlob(blob => {
            if (!blob) return;
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href     = url;
            link.download = `${sheet.sheetNumber}-${sheet.name.replace(/\s+/g, '_')}.png`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        }, 'image/png');

        console.log(`[SheetExportService] PNG export initiated (${dpi}dpi) for sheet ${sheet.sheetNumber}`);
    }

    // ── Phase SC-6: SVG Export ────────────────────────────────────────────────

    /**
     * Exports the sheet as an SVG document with viewport outlines and title block fields.
     * Triggers a file download. Note: live preview raster content is embedded as placeholders.
     */
    exportToSvg(sheetId: string): void {
        const sheet = sheetStore.get(sheetId);
        if (!sheet) {
            console.warn(`[SheetExportService] Sheet '${sheetId}' not found`);
            return;
        }

        const template = sheet.titleBlock
            ? (titleBlockStore.get(sheet.titleBlock) ?? titleBlockStore.getDefault())
            : titleBlockStore.getDefault();

        const pW = template.paperWidth;
        const pH = template.paperHeight;

        const ns   = 'http://www.w3.org/2000/svg';
        const svgEl = document.createElementNS(ns, 'svg');
        svgEl.setAttribute('xmlns',   ns);
        svgEl.setAttribute('width',   `${pW}mm`);
        svgEl.setAttribute('height',  `${pH}mm`);
        svgEl.setAttribute('viewBox', `0 0 ${pW} ${pH}`);

        // White background
        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('width', `${pW}`); bg.setAttribute('height', `${pH}`);
        bg.setAttribute('fill',  '#ffffff');
        svgEl.appendChild(bg);

        // Border
        const border = document.createElementNS(ns, 'rect');
        border.setAttribute('x', '5'); border.setAttribute('y', '5');
        border.setAttribute('width',  `${pW - 10}`);
        border.setAttribute('height', `${pH - 10}`);
        border.setAttribute('fill',   'none');
        border.setAttribute('stroke', '#1a1a2e');
        border.setAttribute('stroke-width', '0.5');
        svgEl.appendChild(border);

        // Viewport placeholders
        const usableW = pW - template.borderWidth;
        const usableH = pH;
        for (const vp of sheet.viewports) {
            const view  = viewDefinitionStore.get(vp.viewId);
            const vpW   = usableW * 0.4;
            const vpH   = usableH * 0.3;
            const vpX   = (vp.position.x / usableW) * usableW;
            const vpY   = pH - (vp.position.y / usableH) * usableH - vpH;

            const rect = document.createElementNS(ns, 'rect');
            rect.setAttribute('x', `${vpX}`); rect.setAttribute('y', `${vpY}`);
            rect.setAttribute('width', `${vpW}`); rect.setAttribute('height', `${vpH}`);
            rect.setAttribute('fill',   '#f0f2f8');
            rect.setAttribute('stroke', '#3b5bdb');
            rect.setAttribute('stroke-width', '0.5');
            svgEl.appendChild(rect);

            const lbl = document.createElementNS(ns, 'text');
            lbl.setAttribute('x', `${vpX + vpW / 2}`); lbl.setAttribute('y', `${vpY + vpH / 2}`);
            lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '7');
            lbl.setAttribute('fill', '#1e3a8a'); lbl.setAttribute('font-family', 'Arial, sans-serif');
            lbl.textContent = view?.name ?? `View (${vp.viewId.slice(-6)})`;
            svgEl.appendChild(lbl);
        }

        // Title block fields
        const tbX = pW - template.borderWidth;
        for (const field of template.fields) {
            const fieldValues: Record<string, string> = {
                sheetNumber: sheet.sheetNumber,
                sheetName:   sheet.name,
                revision:    sheet.revision || '—',
                date:        sheet.issueDate || new Date().toLocaleDateString('en-GB'),
                issuedBy:    sheet.issuedBy  || '',
            };
            const fieldEl = document.createElementNS(ns, 'text');
            const fx = tbX + (field.x - (pW - template.borderWidth));
            const fy = pH - field.y;
            fieldEl.setAttribute('x',           `${fx}`);
            fieldEl.setAttribute('y',           `${fy}`);
            fieldEl.setAttribute('font-size',   `${field.fontSize ?? 7}`);
            fieldEl.setAttribute('font-family', 'Arial, sans-serif');
            fieldEl.setAttribute('fill',        '#111');
            if (field.bold) fieldEl.setAttribute('font-weight', '700');
            fieldEl.textContent = fieldValues[field.key] ?? '';
            svgEl.appendChild(fieldEl);
        }

        const svgStr = new XMLSerializer().serializeToString(svgEl);
        const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url    = URL.createObjectURL(blob);
        const link   = document.createElement('a');
        link.href     = url;
        link.download = `${sheet.sheetNumber}-${sheet.name.replace(/\s+/g, '_')}.svg`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        console.log(`[SheetExportService] SVG export initiated for sheet ${sheet.sheetNumber}`);
    }

    // ── Phase S7: Print Export ────────────────────────────────────────────────

    /**
     * Triggers the browser print dialog for the given sheet.
     * Builds a temporary hidden print layer with the sheet layout and then
     * calls window.print(). The print layer is removed afterwards.
     */
    exportToPrint(sheetId: string): void {
        const sheet    = sheetStore.get(sheetId);
        if (!sheet) {
            console.warn(`[SheetExportService] Sheet '${sheetId}' not found`);
            return;
        }

        const template = sheet.titleBlock
            ? (titleBlockStore.get(sheet.titleBlock) ?? titleBlockStore.getDefault())
            : titleBlockStore.getDefault();

        // Remove any existing print layer
        const existing = document.getElementById('pryzm-print-layer');
        if (existing) existing.remove();

        // Inject print-only CSS (once)
        if (!document.getElementById(PRINT_STYLE_ID)) {
            const style = document.createElement('style');
            style.id = PRINT_STYLE_ID;
            style.textContent = `
                @media print {
                    body > *:not(#pryzm-print-layer) { display: none !important; }
                    #pryzm-print-layer {
                        display: block !important;
                        position: fixed;
                        inset: 0;
                        background: #fff;
                        z-index: 99999;
                    }
                    #pryzm-print-layer .sh-canvas {
                        width: 100vw !important;
                        height: 100vh !important;
                        box-shadow: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Build print layer
        const printLayer = document.createElement('div');
        printLayer.id    = 'pryzm-print-layer';
        printLayer.style.cssText = 'display:none; position:fixed; inset:0; background:#fff; z-index:99999;';

        const canvas = document.createElement('div');
        canvas.className = 'sh-canvas';
        canvas.style.width   = '100%';
        canvas.style.height  = '100%';
        canvas.style.background = '#fff';

        // Title block
        const tbEl = document.createElement('div');
        tbEl.className = 'sh-titleblock';
        tbEl.style.width = `${(template.borderWidth / template.paperWidth) * 100}%`;

        // Field values
        const fields: Record<string, string> = {
            sheetNumber: sheet.sheetNumber,
            sheetName:   sheet.name,
            revision:    sheet.revision || '—',
            date:        sheet.issueDate || new Date().toLocaleDateString('en-GB'),
            issuedBy:    sheet.issuedBy  || '',
        };

        for (const field of template.fields) {
            const zone = document.createElement('div');
            zone.style.cssText = `
                position: absolute;
                left:   ${((field.x - (template.paperWidth - template.borderWidth)) / template.borderWidth) * 100}%;
                bottom: ${(field.y / template.paperHeight) * 100}%;
                width:  ${(field.width  / template.borderWidth) * 100}%;
                height: ${(field.height / template.paperHeight) * 100}%;
                border: 0.5px solid #aaa;
                padding: 1px 2px;
                box-sizing: border-box;
                overflow: hidden;
                font-family: sans-serif;
            `;

            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-size:6px; color:#888; text-transform:uppercase; letter-spacing:0.3px;';
            lbl.textContent   = field.label;

            const val = document.createElement('div');
            val.style.cssText = `font-size:${field.fontSize ?? 8}px; color:#111; overflow:hidden; white-space:nowrap; ${field.bold ? 'font-weight:700;' : ''}`;
            val.textContent   = fields[field.key] ?? '';

            zone.appendChild(lbl);
            zone.appendChild(val);
            tbEl.appendChild(zone);
        }

        canvas.appendChild(tbEl);

        // DOC-3.5: Viewports — inject SVGCompositeRenderer output when TechnicalDrawing is cached;
        // fall back to labelled placeholder for views not yet projected.
        const usableW = template.paperWidth  - template.borderWidth;
        const usableH = template.paperHeight;

        // Fractional width/height used for positioning (matching pre-DOC-3.5 layout)
        const VP_W_FRAC = 0.30;
        const VP_H_FRAC = 0.25;

        for (const vp of sheet.viewports) {
            const view  = viewDefinitionStore.get(vp.viewId);
            const scale = vp.scale ?? 100;

            // mm dimensions of this viewport's drawing area on the paper
            const vpWMm = usableW * VP_W_FRAC;
            const vpHMm = usableH * VP_H_FRAC;

            // Percentage-based position for the CSS-layout print layer
            const leftPct   = (vp.position.x / usableW) * (100 * (1 - template.borderWidth / template.paperWidth));
            const bottomPct = (vp.position.y / usableH) * 100;

            const vpEl = document.createElement('div');
            vpEl.style.cssText = `
                position: absolute;
                left:   ${leftPct}%;
                bottom: ${bottomPct}%;
                width:  ${VP_W_FRAC * 100}%;
                height: ${VP_H_FRAC * 100}%;
                border: 1.5px solid #2563eb;
                box-sizing: border-box;
                overflow: hidden;
                font-family: sans-serif;
                background: #ffffff;
            `;

            // ── DOC-3.5: Try to embed real vector SVG from the cache ──────────
            const drawing = viewTechnicalDrawingCache.get(vp.viewId);
            if (drawing) {
                const viewBox = {
                    originX:  0,
                    originZ:  0,
                    widthMm:  vpWMm,
                    heightMm: vpHMm,
                    scale,
                };

                const renderer = new SVGCompositeRenderer(viewBox);

                // Wall poche fills
                renderer.buildWallPoche(drawing, { fillColor: '#333333', transparency: 0 } as any, 'A-WALL');

                // Projection linework
                renderer.setTechnicalDrawing(drawing);

                // Annotation overlay
                const annotations = annotationStore.getByView(vp.viewId);
                renderer.setAnnotations(annotations);

                // Render to SVG string and embed as a data URI <img>
                const svgString = renderer.renderToSVGString();
                const b64 = btoa(unescape(encodeURIComponent(svgString)));
                const imgEl = document.createElement('img');
                imgEl.src = `data:image/svg+xml;base64,${b64}`;
                imgEl.style.cssText = 'width:100%; height:100%; object-fit:contain; display:block;';
                imgEl.alt = view?.name ?? vp.viewId;
                vpEl.appendChild(imgEl);

                // Scale label beneath the viewport border
                const scaleLbl = document.createElement('div');
                scaleLbl.style.cssText = `
                    position: absolute;
                    bottom: -14px;
                    left: 0;
                    font-size: 7px;
                    color: #2563eb;
                    font-family: sans-serif;
                `;
                scaleLbl.textContent = `${view?.name ?? ''} 1:${scale}`;
                vpEl.appendChild(scaleLbl);

            } else {
                // ── Fallback placeholder for views not yet projected ──────────
                vpEl.style.display        = 'flex';
                vpEl.style.alignItems     = 'center';
                vpEl.style.justifyContent = 'center';
                vpEl.style.flexDirection  = 'column';

                const lbl = document.createElement('div');
                lbl.style.cssText = 'font-size:9px; font-weight:600; color:#1e3a8a;';
                lbl.textContent   = view?.name ?? `View (${vp.viewId.slice(-6)})`;

                const sub = document.createElement('div');
                sub.style.cssText = 'font-size:7px; color:#6b7280; margin-top:2px;';
                sub.textContent   = `1:${scale}`;

                vpEl.appendChild(lbl);
                vpEl.appendChild(sub);
            }

            canvas.appendChild(vpEl);
        }

        printLayer.appendChild(canvas);
        document.body.appendChild(printLayer);
        printLayer.style.display = 'block';

        // D.7.5 batch #5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('sheet-export-print', () => {
            window.print();
            // Remove after print dialog closes
            setTimeout(() => {
                printLayer.remove();
            }, 1000);
        });

        console.log(`[SheetExportService] Print initiated for sheet ${sheet.sheetNumber} — ${sheet.name}`);
    }
}

export const sheetExportService = new SheetExportServiceImpl();
export type { SheetExportServiceImpl };
