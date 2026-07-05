// §FEAT-PLAN-VIEW-GIS (L-104) — pure web-mercator tile geometry for the plan-view GIS
// context underlay. HEADLESS: no THREE, no DOM, no maplibre, no fetch — pure math, a
// sibling to sitePlanOverlayGeometry.ts / projectTrueNorth.ts, so every formula below is
// unit-testable (P2/P4/P5 untouched).
//
// WHY THIS EXISTS (ADR-0115, C12/C19)
// -----------------------------------
// The founder wants a PLAN VIEW that shows the real building on the real-world GIS context
// (the plan-view analogue of the ◉ 3D Site / Globe view), on PROJECT NORTH, orthographic.
// The building already projects to plan (the BIM Top view); the missing piece is the GIS
// CONTEXT raster beneath it. This module computes the web-mercator tile grid + the metric
// scale (px/m) for an ESRI World Imagery composite centred on the site origin, and the
// project-north rotation the underlay mesh needs so true-north imagery seats under the
// project-north building. The impure raster fetch/composite lives in the engine layer
// (buildSiteGisContextRaster.ts, with its OTel span); the plan-canvas placement reuses the
// existing L-71 createPlanCanvasUnderlayFromSiteOverlay pipeline.
//
// SPANLESS CONVENTION: these are pure L5 headless geo-math helpers in the same family the
// ADR-0115 P8 note explicitly carves out (projectTrueNorth.ts / sitePlanOverlayGeometry.ts
// add no spans). The exported IMPURE builder that does real work DOES add a span.

import { normalizeAngle } from './projectTrueNorth';

/** Web-mercator tile pixel size (standard slippy-map / ESRI World Imagery 256-px tiles). */
export const TILE_SIZE_PX = 256;

/** Ground resolution (metres per pixel) at a given latitude + web-mercator zoom.
 *  156543.03392 m/px is the equatorial resolution at zoom 0 for 256-px tiles;
 *  it shrinks with cos(lat) and halves each zoom level. */
export function webMercatorResolution(latDeg: number, zoom: number): number {
    const latRad = (latDeg * Math.PI) / 180;
    return (156543.03392804097 * Math.cos(latRad)) / Math.pow(2, zoom);
}

/** A global pixel coordinate in the web-mercator pixel plane (0 … TILE_SIZE·2^zoom). */
export interface WorldPixel {
    readonly px: number;
    readonly py: number;
}

/** Project a lon/lat to its global web-mercator pixel coordinate at `zoom`. */
export function lonLatToWorldPixel(lonDeg: number, latDeg: number, zoom: number): WorldPixel {
    const mapSize = TILE_SIZE_PX * Math.pow(2, zoom);
    const x = (lonDeg + 180) / 360;
    const sinLat = Math.sin((latDeg * Math.PI) / 180);
    // Clamp to the web-mercator valid range so extreme latitudes don't produce ±Infinity.
    const clamped = Math.min(Math.max(sinLat, -0.9999), 0.9999);
    const y = 0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI);
    return { px: x * mapSize, py: y * mapSize };
}

/**
 * Choose the highest web-mercator zoom whose composite of the requested metric extent still
 * fits inside `maxCanvasPx` (so the fetch stays bounded), clamped to the ESRI native cap.
 * A larger zoom = sharper imagery but more pixels; we pick the sharpest that fits.
 */
export function chooseGisZoom(
    latDeg: number,
    extentMeters: number,
    maxCanvasPx: number,
    maxZoom = 19,
    minZoom = 1,
): number {
    for (let z = maxZoom; z >= minZoom; z--) {
        const res = webMercatorResolution(latDeg, z); // m/px
        const neededPx = extentMeters / res;
        if (neededPx <= maxCanvasPx) return z;
    }
    return minZoom;
}

/** One source tile to fetch + where to draw it on the destination canvas. */
export interface GisTilePlacement {
    /** Tile x index (column) in the {z}/{y}/{x} slippy scheme. */
    readonly tileX: number;
    /** Tile y index (row). */
    readonly tileY: number;
    readonly zoom: number;
    /** Destination pixel offset (top-left) to draw this 256-px tile at on the canvas. */
    readonly destX: number;
    readonly destY: number;
}

/** The full plan-view GIS composite spec: which tiles, the canvas size, and the metric scale. */
export interface GisTileGrid {
    readonly zoom: number;
    readonly canvasWidthPx: number;
    readonly canvasHeightPx: number;
    /** Metric scale of the composite = 1 / metresPerPixel (correct real-world size). */
    readonly pxPerMeter: number;
    /** Tiles to fetch + their destination offsets (top-left origin). */
    readonly tiles: readonly GisTilePlacement[];
    /** The site origin's pixel position on the canvas (== canvas centre by construction). */
    readonly originCanvasX: number;
    readonly originCanvasY: number;
}

/**
 * Compute the web-mercator tile grid for a square `canvasPx`-sized GIS composite centred on
 * (centerLat, centerLon) at `zoom`. The canvas is centred exactly on the site origin so the
 * plan-canvas underlay can be placed at positionEast/North = 0 (origin = canvas centre) and
 * the building sits over its true geographic location.
 */
export function computeGisTileGrid(
    centerLat: number,
    centerLon: number,
    zoom: number,
    canvasPx: number,
): GisTileGrid {
    const centre = lonLatToWorldPixel(centerLon, centerLat, zoom);
    const half = canvasPx / 2;
    // The canvas window in GLOBAL pixel space (centred on the origin pixel).
    const winMinX = centre.px - half;
    const winMinY = centre.py - half;
    const winMaxX = centre.px + half;
    const winMaxY = centre.py + half;

    const firstTileX = Math.floor(winMinX / TILE_SIZE_PX);
    const firstTileY = Math.floor(winMinY / TILE_SIZE_PX);
    const lastTileX = Math.floor((winMaxX - 1e-6) / TILE_SIZE_PX);
    const lastTileY = Math.floor((winMaxY - 1e-6) / TILE_SIZE_PX);

    const n = Math.pow(2, zoom);
    const tiles: GisTilePlacement[] = [];
    for (let ty = firstTileY; ty <= lastTileY; ty++) {
        for (let tx = firstTileX; tx <= lastTileX; tx++) {
            // Wrap X around the antimeridian; skip Y outside the valid tile range.
            const wrappedX = ((tx % n) + n) % n;
            if (ty < 0 || ty >= n) continue;
            tiles.push({
                tileX: wrappedX,
                tileY: ty,
                zoom,
                destX: tx * TILE_SIZE_PX - winMinX,
                destY: ty * TILE_SIZE_PX - winMinY,
            });
        }
    }

    return {
        zoom,
        canvasWidthPx: canvasPx,
        canvasHeightPx: canvasPx,
        pxPerMeter: 1 / webMercatorResolution(centerLat, zoom),
        tiles,
        originCanvasX: half,
        originCanvasY: half,
    };
}

/**
 * The plan-canvas underlay mesh rotation (radians about world-Y) that seats a TRUE-NORTH GIS
 * raster under the PROJECT-NORTH building. A satellite composite is true-north-up by
 * construction; `trueToProjectNorth` = R(θ) rotates true-frame content CCW by θ into the
 * project frame, and FloorPlanUnderlayTool's `mesh.rotation.z` rotates the raster CCW viewed
 * from +Y down — so the underlay rotationZ is exactly +θ. θ = 0 ⇒ identity (no rotation),
 * byte-identical to a north-aligned site (ADR-0070/0115 discipline). Contrast the L-71 PDF
 * path, whose content DEFINES project north (rotationZ = 0); GIS imagery is true-framed.
 */
export function computeGisContextUnderlayRotationZ(thetaRad: number): number {
    return normalizeAngle(thetaRad);
}
