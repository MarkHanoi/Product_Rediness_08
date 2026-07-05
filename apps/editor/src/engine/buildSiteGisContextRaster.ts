// §FEAT-PLAN-VIEW-GIS (L-104) — build the plan-view GIS context raster.
//
// THE GOAL (founder): a PLAN VIEW that shows the real building on the real-world GIS context
// (the plan-view analogue of the ◉ 3D Site / Globe), on PROJECT NORTH, orthographic. The
// building already projects to plan (the BIM Top view); this composites the GIS CONTEXT that
// sits BENEATH it — a real-world aerial image of the site — as a plan-canvas underlay via the
// EXISTING L-71 pipeline (createPlanCanvasUnderlayFromSiteOverlay). ADR-0115, C12/C19.
//
// REUSE, DO NOT REBUILD: the raster is composited from ESRI World Imagery tiles — the SAME
// keyless, CORS-enabled endpoint the 2D satellite basemap (siteMap2DStyle.ESRI_WORLD_IMAGERY_URL)
// and Cesium already use, so no new provider and no CSP change (raster tiles load under
// `img-src https:`). The tile grid + metric scale are the pure web-mercator math in
// siteGisContextGeometry.ts (headless, unit-tested). This module only does the impure part:
// fetch the tiles, composite them onto a <canvas>, and read back a data URL.
//
// P2: no `import * as THREE` here — this returns a plain data URL; the THREE mutation happens
// in the reused underlay pipeline. P8: one OpenTelemetry span (this is a NEW impure exported
// function that does real work). Fully guarded — a canvas taint / fetch failure returns null,
// never throws, so the "enter plan-view GIS" flow degrades to "building only, no context".

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    computeGisTileGrid,
    chooseGisZoom,
    webMercatorResolution,
    TILE_SIZE_PX,
    type GisTileGrid,
} from '../ui/site/overlay/siteGisContextGeometry';
import { ESRI_WORLD_IMAGERY_URL } from '../ui/geospatial/siteMap2DStyle';

const _tracer = trace.getTracer('pryzm-engine');

export interface SiteGisContextRasterInput {
    readonly centerLat: number;
    readonly centerLon: number;
    /** Ground extent to cover, metres (square). Default 400 m — a generous plot + neighbours. */
    readonly extentMeters?: number;
    /** Max composite canvas edge in pixels (bounds the fetch). Default 1536. */
    readonly maxCanvasPx?: number;
}

export interface SiteGisContextRaster {
    /** The composited GIS context as an image/png data URL. */
    readonly dataUrl: string;
    readonly widthPx: number;
    readonly heightPx: number;
    /** Metric scale = 1 / metresPerPixel (correct real-world size for the underlay). */
    readonly pxPerMeter: number;
}

/** Fill an ESRI World Imagery tile URL ({z}/{y}/{x} order — see siteMap2DStyle header). */
function tileUrl(zoom: number, tileX: number, tileY: number): string {
    return ESRI_WORLD_IMAGERY_URL
        .replace('{z}', String(zoom))
        .replace('{y}', String(tileY))
        .replace('{x}', String(tileX));
}

/** Load one tile as a CORS-clean HTMLImageElement. Resolves null on any error (missing tile,
 *  CORS, network) so a single bad tile leaves a gap instead of failing the whole composite. */
function loadTile(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // required so canvas.toDataURL() is not tainted
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/**
 * Composite a plan-view GIS context raster (ESRI World Imagery) centred on the site origin.
 * Returns the data URL + size + metric scale for the plan-canvas underlay, or null if the
 * scene has no canvas support / every tile failed / the canvas was tainted. Never throws.
 */
export async function buildSiteGisContextRaster(
    input: SiteGisContextRasterInput,
): Promise<SiteGisContextRaster | null> {
    const extentMeters = input.extentMeters && input.extentMeters > 0 ? input.extentMeters : 400;
    const maxCanvasPx = input.maxCanvasPx && input.maxCanvasPx > 0 ? input.maxCanvasPx : 1536;

    const span = _tracer.startSpan('pryzm.siteGis.buildContextRaster', {
        attributes: {
            'pryzm.siteGis.centerLat': input.centerLat,
            'pryzm.siteGis.centerLon': input.centerLon,
            'pryzm.siteGis.extentMeters': extentMeters,
            'pryzm.siteGis.maxCanvasPx': maxCanvasPx,
        },
    });
    try {
        if (!Number.isFinite(input.centerLat) || !Number.isFinite(input.centerLon)) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'bad-center' });
            return null;
        }

        const zoom = chooseGisZoom(input.centerLat, extentMeters, maxCanvasPx);
        // Canvas edge in px = extent / (m/px). chooseGisZoom guarantees this fits maxCanvasPx;
        // clamp defensively so a degenerate resolution can never blow the canvas allocation.
        const res = Math.max(1e-9, webMercatorResolution(input.centerLat, zoom));
        const canvasPx = Math.min(maxCanvasPx, Math.max(256, Math.round(extentMeters / res)));
        const grid: GisTileGrid = computeGisTileGrid(
            input.centerLat,
            input.centerLon,
            zoom,
            canvasPx,
        );
        span.setAttribute('pryzm.siteGis.zoom', zoom);
        span.setAttribute('pryzm.siteGis.tileCount', grid.tiles.length);

        const canvas = document.createElement('canvas');
        canvas.width = grid.canvasWidthPx;
        canvas.height = grid.canvasHeightPx;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-2d-context' });
            return null;
        }

        // Fetch all tiles in parallel; draw each that loaded.
        const loaded = await Promise.all(
            grid.tiles.map(async (t) => ({ t, img: await loadTile(tileUrl(t.zoom, t.tileX, t.tileY)) })),
        );
        let drawn = 0;
        for (const { t, img } of loaded) {
            if (!img) continue;
            ctx.drawImage(img, t.destX, t.destY, TILE_SIZE_PX, TILE_SIZE_PX);
            drawn++;
        }
        span.setAttribute('pryzm.siteGis.tilesDrawn', drawn);
        if (drawn === 0) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-tiles-drawn' });
            return null;
        }

        let dataUrl: string;
        try {
            dataUrl = canvas.toDataURL('image/png');
        } catch (err) {
            // Tainted canvas (a tile without CORS headers) — cannot read back.
            console.warn('[site-gis] toDataURL failed (canvas tainted) — GIS context skipped:', err);
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'canvas-tainted' });
            return null;
        }

        span.setStatus({ code: SpanStatusCode.OK });
        console.log(
            `[site-gis] context raster built — z${zoom}, ${grid.canvasWidthPx}×${grid.canvasHeightPx}px, ` +
            `${drawn}/${grid.tiles.length} tiles, ${grid.pxPerMeter.toFixed(3)} px/m, extent ${extentMeters} m.`,
        );
        return {
            dataUrl,
            widthPx: grid.canvasWidthPx,
            heightPx: grid.canvasHeightPx,
            pxPerMeter: grid.pxPerMeter,
        };
    } catch (err) {
        console.error('[site-gis] buildSiteGisContextRaster failed:', err);
        try { span.recordException(err as Error); } catch { /* ignore */ }
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? 'unknown' });
        return null;
    } finally {
        span.end();
    }
}
