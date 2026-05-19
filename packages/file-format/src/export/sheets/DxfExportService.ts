/**
 * DxfExportService — DOC-3.2 + DOC-4.6
 *
 * Full DXF export path for a PRYZM Sheet.
 *
 * Assembles a multi-viewport DXF from:
 *   1. Cached TechnicalDrawing per viewport   (ViewTechnicalDrawingCache)
 *   2. Ephemeral annotation injection         (AnnotationDxfBridge)
 *   3. Paper space layout from TitleBlock     (TitleBlockStore)
 *   4. OBC DxfManager serialisation          (dxfManager.exporter.export())
 *   5. DOC-4.6 — HATCH entity injection       (HatchPatternLibrary + PocheFillBuilder)
 *
 * BUG-FIX (DOC-3.2-FIX-1): The OBC DxfExporter requires the `viewport` field
 * of each DxfViewportEntry to be a real `OBC.DrawingViewport` class instance
 * (which has a `clipLine()` method used for geometry clipping). Passing a plain
 * object literal causes `TypeError: this._viewport.clipLine is not a function`.
 * Fixed by creating a `new OBC.DrawingViewport(config)` per viewport using
 * bounds derived from `TechnicalDrawingBounds.toViewportConfig()`.
 *
 * Annotations are injected ephemerally into each TechnicalDrawing via a
 * nested `withEphemeralAnnotations()` chain so that all viewports' annotations
 * are simultaneously active when the single `export()` call fires, and all
 * ephemeral items are disposed in the `finally` blocks of each nesting level.
 *
 * DOC-4.6 — Hatch injection:
 *   After the OBC DXF string is generated, `_injectHatchEntities()` post-
 *   processes the string by:
 *     1. Walking each viewport's TechnicalDrawing 'A-WALL' layer for geometry.
 *     2. Using PocheFillBuilder to reconstruct closed wall polygons.
 *     3. Looking up the VG fill pattern via the registered _hatchStyleProvider.
 *     4. Building DXF HATCH entities with HatchPatternLibrary.buildDxfHatchEntity().
 *     5. Injecting them before the final `0\nENDSEC` of the ENTITIES section.
 *
 *   Call setHatchStyleProvider() (e.g. from initUI.ts) to wire in VG data:
 *     dxfExportService.setHatchStyleProvider((category) =>
 *         vgGovernanceStore.resolveStyle(modelId, category).style
 *     );
 *
 * Contract compliance:
 *   §01 §5  — No store mutations; TechnicalDrawings are read-only here.
 *             Ephemeral OBC items are disposed in the `finally` chain.
 *   §01 §2  — Export is triggered via ExportSheetCommand (§01 §2.2 Class B).
 *   §02     — Level/spatial data is already embedded in TechnicalDrawing cache;
 *             no BimManager queries here.
 *   §05     — No DOM side-effects except the file download trigger.
 *   §07     — No server routes.
 *
 * Usage (via ExportSheetCommand):
 *   window.dxfExportService.exportSheet(sheetId)
 *
 * Registered on window.dxfExportService by initUI.ts.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { sheetStore }               from '@pryzm/core-app-model';
import { titleBlockStore } from '@pryzm/core-app-model/views';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { annotationDxfBridge, AnnotationDxfBridgeOptions } from './AnnotationDxfBridge';
import { PocheFillBuilder } from '@pryzm/core-app-model/views';
import { HatchPatternLibrary }       from './HatchPatternLibrary';
import type { VGCategoryStyle }      from '@pryzm/core-app-model';
import { TechnicalDrawingBounds } from '@pryzm/core-app-model/views';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Default viewport half-extent in drawing-space metres when no geometry is
 * found. Covers a 60 m × 40 m footprint at 1:100, producing a 600 × 400 mm
 * viewport — large enough to contain most architectural drawings.
 */
const DEFAULT_VP_HALF_EXTENT_M = 30;

/** Paper margin used when computing drawing-area slot coordinates. */
const PAPER_MARGIN_MM = 5;

/** DXF layer where HATCH entities are placed. */
const HATCH_LAYER = 'A-WALL-PATT';

// ── DxfExportService ────────────────────────────────────────────────────────

class DxfExportServiceImpl {

    private _components: OBC.Components | null = null;

    /**
     * DOC-4.6 — Optional VG style provider for hatch pattern resolution.
     */
    private _hatchStyleProvider:
        ((category: string) => Partial<VGCategoryStyle> | undefined) | null = null;

    // ── Initialisation ──────────────────────────────────────────────────────

    init(components: OBC.Components): void {
        this._components = components;
        console.log('[DxfExportService] Initialised');
    }

    // ── DOC-4.6 — Hatch style provider ─────────────────────────────────────

    setHatchStyleProvider(
        fn: (category: string) => Partial<VGCategoryStyle> | undefined,
    ): void {
        this._hatchStyleProvider = fn;
    }

    // ── Public Export API ───────────────────────────────────────────────────

    /**
     * Export a sheet to DXF and trigger a browser file download.
     *
     * DOC-3.2-FIX-1: Each viewport now uses a real `OBC.DrawingViewport`
     * instance so that `DxfExporter._clipSegment()` can call `clipLine()` on it
     * without throwing `TypeError: this._viewport.clipLine is not a function`.
     *
     * @param sheetId — SheetDefinition.id to export.
     */
    exportSheet(sheetId: string): boolean {
        if (!this._components) {
            console.error('[DxfExportService] Not initialised — call init(components) first');
            return false;
        }

        const sheet = sheetStore.get(sheetId);
        if (!sheet) {
            console.warn(`[DxfExportService] Sheet '${sheetId}' not found`);
            return false;
        }

        const template = sheet.titleBlock
            ? (titleBlockStore.get(sheet.titleBlock) ?? titleBlockStore.getDefault())
            : titleBlockStore.getDefault();

        const paperWidthMm  = template.paperWidth;
        const paperHeightMm = template.paperHeight;

        // OBC paper options — margin is the uniform border from all four edges.
        const paper = {
            widthMm:  paperWidthMm,
            heightMm: paperHeightMm,
            margin:   PAPER_MARGIN_MM,
        };

        // Collect viewports that have a cached TechnicalDrawing
        const resolvedViewports: Array<{
            drawing:     OBC.TechnicalDrawing;
            obcViewport: OBC.DrawingViewport;
            viewId:      string;
            scale:       number;
            slotX:       number; // mm from top-left of drawing area
            slotY:       number; // mm from top-left of drawing area
        }> = [];

        for (const vp of sheet.viewports) {
            const drawing = viewTechnicalDrawingCache.get(vp.viewId);
            if (!drawing) {
                console.warn(
                    `[DxfExportService] No TechnicalDrawing cached for viewId=${vp.viewId} ` +
                    `(sheet ${sheet.sheetNumber} — "${sheet.name}") — viewport skipped`,
                );
                continue;
            }

            const scale = vp.scale ?? 100;

            // ── Build OBC.DrawingViewport with correct geometry bounds ────────
            //
            // DOC-3.2-FIX-1: OBC.DrawingViewport is a class with a clipLine()
            // method. We must pass an instance, not a plain object. The config
            // uses drawing-space metres (left/right = world X, top/bottom = world Z
            // in the OBC convention where bbox.z = -top, bbox.maxZ = -bottom).
            //
            // TechnicalDrawingBounds.toViewportConfig() maps:
            //   left   = minX - padding
            //   right  = maxX + padding
            //   top    = minZ - padding   (OBC bbox.min.z = -top = maxZ + padding)
            //   bottom = maxZ + padding   (OBC bbox.max.z = -bottom = -maxZ - padding)
            //
            // This correctly clips geometry whose world-Z spans [minZ, maxZ].
            const bounds = TechnicalDrawingBounds.compute(drawing);
            let obcVpCfg: { left: number; right: number; top: number; bottom: number; scale: number };

            if (bounds) {
                obcVpCfg = TechnicalDrawingBounds.toViewportConfig(bounds, scale, 0.5);
                console.log(
                    `[DxfExportService] DrawingViewport for viewId=${vp.viewId}: ` +
                    `L=${obcVpCfg.left.toFixed(2)} R=${obcVpCfg.right.toFixed(2)} ` +
                    `T=${obcVpCfg.top.toFixed(2)} B=${obcVpCfg.bottom.toFixed(2)} at 1:${scale}`,
                );
            } else {
                // No geometry found — use a large default extent to avoid clipping.
                const h = DEFAULT_VP_HALF_EXTENT_M;
                obcVpCfg = { left: -h, right: h, top: -h, bottom: h, scale };
                console.warn(
                    `[DxfExportService] TechnicalDrawingBounds returned null for viewId=${vp.viewId} — ` +
                    `using default ±${h} m extent`,
                );
            }

            // Create the real DrawingViewport instance (class with clipLine method).
            const obcViewport = new OBC.DrawingViewport({
                ...obcVpCfg,
                name: `vp-${vp.viewId}`,
            });

            // Viewport size in mm on paper (derived from drawing-space extent ÷ scale × 1000)
            const vpWidthMm  = (obcVpCfg.right - obcVpCfg.left) * 1000 / scale;
            const vpHeightMm = (obcVpCfg.bottom - obcVpCfg.top) * 1000 / scale;

            // ── Compute paper-space slot position ─────────────────────────────
            //
            // vp.position = centre of viewport in mm from left/bottom of full sheet.
            // OBC's x/y in DxfViewportEntry = mm from top-left of the drawing area
            // (which starts PAPER_MARGIN_MM inside each paper edge).
            //
            // Convert:
            //   slotX = leftEdge_from_sheet_left - margin
            //   slotY = topEdge_from_sheet_top   - margin
            //
            // sheet origin is bottom-left; OBC origin is top-left, so:
            //   topEdge_from_sheet_top = paperH - position.y - vpHeightMm/2
            const leftEdge = vp.position.x - vpWidthMm  / 2;
            const topEdge  = paperHeightMm - vp.position.y - vpHeightMm / 2;

            const slotX = Math.max(0, leftEdge - PAPER_MARGIN_MM);
            const slotY = Math.max(0, topEdge  - PAPER_MARGIN_MM);

            resolvedViewports.push({
                drawing, obcViewport, viewId: vp.viewId, scale, slotX, slotY,
            });
        }

        if (resolvedViewports.length === 0) {
            console.warn(
                `[DxfExportService] No cached TechnicalDrawings found for sheet '${sheetId}'. ` +
                `Open the relevant plan/section views first to trigger projection, then re-export.`,
            );
            return false;
        }

        // Build OBC DxfDrawingEntry array. Each entry = one TechnicalDrawing with
        // one viewport slot (paper-space position + OBC DrawingViewport instance).
        const allEntries: any[] = resolvedViewports.map(rv => ({
            drawing: rv.drawing,
            viewports: [{
                x:        rv.slotX,
                y:        rv.slotY,
                viewport: rv.obcViewport,
            }],
        }));

        const components = this._components;
        let dxfString: string | null = null;

        this._nestAnnotationsAndExport(
            resolvedViewports,
            0,
            components,
            () => {
                try {
                    const dxfManager = components.get(OBC.DxfManager);
                    dxfString = dxfManager.exporter.export(
                        allEntries,
                        paper as any,
                    );
                } catch (err) {
                    console.error('[DxfExportService] DxfExporter.export() failed:', err);
                }
            },
        );

        if (!dxfString) {
            console.error('[DxfExportService] DXF generation failed — no output produced');
            return false;
        }

        if (this._hatchStyleProvider) {
            dxfString = this._injectHatchEntities(dxfString, resolvedViewports);
        }

        const filename = `${sheet.sheetNumber}-${sheet.name.replace(/\s+/g, '_')}.dxf`;
        this._triggerDownload(dxfString, filename, 'application/dxf');

        console.log(
            `[DxfExportService] DXF export complete — ` +
            `sheet=${sheet.sheetNumber} viewports=${resolvedViewports.length} ` +
            `paper=${paperWidthMm}×${paperHeightMm}mm`,
        );

        return true;
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    /**
     * DOC-4.6 — Post-process the OBC-generated DXF string by appending HATCH
     * entities for wall poche polygons that carry a non-solid fill pattern.
     */
    private _injectHatchEntities(
        dxf: string,
        viewports: Array<{ drawing: OBC.TechnicalDrawing; scale: number }>,
    ): string {
        const provider = this._hatchStyleProvider;
        if (!provider) return dxf;

        const wallStyle   = provider('wall');
        const fillPattern = wallStyle?.fillPattern;
        if (!fillPattern || fillPattern === 'solid') return dxf;

        const dxfPatternName = HatchPatternLibrary.getDxfPatternName(fillPattern);
        const patternScale   = 1.0;

        const hatchBlocks: string[] = [];
        let hatchCount = 0;

        for (const { drawing } of viewports) {
            const layers = (drawing as any)?.layers;
            if (!layers) continue;

            const layer = layers?.get?.('A-WALL') ?? layers?.get?.('a-wall');
            if (!layer) continue;

            const geo: THREE.BufferGeometry | undefined =
                (layer as any).geometry ??
                (layer as any).mesh?.geometry ??
                (layer as any).line?.geometry ??
                undefined;

            if (!geo) continue;

            const polygons = PocheFillBuilder.fromGeometry(geo, '#000000', 1);

            for (const poly of polygons) {
                const vertices = poly.points.split(' ').map(pair => {
                    const [x, z] = pair.split(',').map(Number);
                    return { x, z };
                }).filter(v => isFinite(v.x) && isFinite(v.z));

                if (vertices.length < 3) continue;

                const entity = HatchPatternLibrary.buildDxfHatchEntity(
                    vertices,
                    HATCH_LAYER,
                    dxfPatternName,
                    patternScale,
                );

                if (entity) {
                    hatchBlocks.push(entity);
                    hatchCount++;
                }
            }
        }

        if (hatchCount === 0) return dxf;

        const injected = this._injectBeforeLastEndsec(dxf, hatchBlocks.join('\n'));

        console.log(
            `[DxfExportService] DOC-4.6 — injected ${hatchCount} HATCH entities ` +
            `(pattern=${dxfPatternName} layer=${HATCH_LAYER})`,
        );

        return injected;
    }

    private _injectBeforeLastEndsec(dxf: string, block: string): string {
        const marker = '\n0\nENDSEC';
        const idx    = dxf.lastIndexOf(marker);
        if (idx < 0) {
            console.warn('[DxfExportService] Could not find ENDSEC marker — HATCH injection skipped');
            return dxf;
        }
        return dxf.slice(0, idx) + '\n' + block + dxf.slice(idx);
    }

    /**
     * Recursively nest `withEphemeralAnnotations()` calls so that all viewports'
     * annotations are active simultaneously when `DxfExporter.export()` fires.
     */
    private _nestAnnotationsAndExport(
        viewports: Array<{ drawing: OBC.TechnicalDrawing; viewId: string }>,
        index: number,
        components: OBC.Components,
        exportCallback: () => void,
    ): void {
        if (index >= viewports.length) {
            exportCallback();
            return;
        }

        const { drawing, viewId } = viewports[index];
        const options: AnnotationDxfBridgeOptions = { components, drawing, viewId };

        annotationDxfBridge.withEphemeralAnnotations(options, () => {
            this._nestAnnotationsAndExport(viewports, index + 1, components, exportCallback);
        });
    }

    /**
     * Trigger a browser file download for a text payload.
     */
    private _triggerDownload(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
}

export const dxfExportService = new DxfExportServiceImpl();
export type { DxfExportServiceImpl };
