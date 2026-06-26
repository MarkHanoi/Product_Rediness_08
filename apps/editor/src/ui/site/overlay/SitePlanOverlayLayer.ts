// §SITE-PLAN-OVERLAY (MapLibre layer) — renders the calibrated client plan as a
// georeferenced raster on the 2D site map, UNDER the violet boundary-draw layers, so the
// user traces the parcel against BOTH the plan AND the basemap.
//
// WHY MAPLIBRE `image` SOURCE (and not a THREE plane)
// ---------------------------------------------------
// MapLibre natively renders a raster anchored to four geographic corners via an `image`
// source (`{ type: 'image', url, coordinates: [TL,TR,BR,BL] }`) + a `raster` layer with a
// `raster-opacity` paint. That is EXACTLY the georeferenced-overlay primitive we need, and
// crucially it does NOT touch the WebGPU device that the legacy THREE-texture underlay
// crashes on — MapLibre manages its own GL context and tiles the image safely. So the site
// overlay is robust by construction: an oversized source can only ever cost MapLibre
// memory, never lose the BIM renderer's device.
//
// The four corners come from the pure geometry (overlayCornerLatLons) so move/scale/rotate
// just recompute coordinates and call `source.setCoordinates()` — no re-decode.
//
// L7 editor UI: imports maplibre types only for the Map handle it is GIVEN (it does not
// create a map). No THREE, no schema.

import type { Map as MapLibreMap, ImageSource } from 'maplibre-gl';
import {
    toMapLibreCoordinates,
    type SitePlanOverlayTransform,
} from './sitePlanOverlayGeometry';

const OVERLAY_SOURCE = 'pryzm-site-plan-overlay';
const OVERLAY_LAYER = 'pryzm-site-plan-overlay-raster';

/** The id of the FIRST boundary-draw layer, so the overlay is inserted BENEATH it. */
const BENEATH_LAYER = 'pryzm-boundary-fill';

export interface SitePlanOverlayLayerInit {
    readonly map: MapLibreMap;
    readonly dataUrl: string;
    readonly transform: SitePlanOverlayTransform;
    readonly originLat: number;
    readonly originLon: number;
    readonly opacity: number;
    readonly visible: boolean;
}

/**
 * Imperative controller for the overlay raster on a given MapLibre map. Idempotent: it
 * adds the source+layer once and thereafter mutates them. All calls are guarded against a
 * removed/disposed map so late events (e.g. a transform after the draw map closed) no-op.
 */
export class SitePlanOverlayLayer {
    private map: MapLibreMap | null;
    private originLat: number;
    private originLon: number;
    private transform: SitePlanOverlayTransform;
    private disposed = false;

    constructor(init: SitePlanOverlayLayerInit) {
        this.map = init.map;
        this.originLat = init.originLat;
        this.originLon = init.originLon;
        this.transform = init.transform;
        this.install(init.dataUrl, init.opacity, init.visible);
    }

    private install(dataUrl: string, opacity: number, visible: boolean): void {
        const map = this.map;
        if (!map) return;
        try {
            const coordinates = toMapLibreCoordinates(this.transform, this.originLat, this.originLon);
            if (!map.getSource(OVERLAY_SOURCE)) {
                map.addSource(OVERLAY_SOURCE, { type: 'image', url: dataUrl, coordinates });
            }
            if (!map.getLayer(OVERLAY_LAYER)) {
                const beneath = map.getLayer(BENEATH_LAYER) ? BENEATH_LAYER : undefined;
                map.addLayer(
                    {
                        id: OVERLAY_LAYER,
                        type: 'raster',
                        source: OVERLAY_SOURCE,
                        paint: {
                            'raster-opacity': clamp01(opacity),
                            'raster-fade-duration': 0,
                            'raster-resampling': 'linear',
                        },
                        layout: { visibility: visible ? 'visible' : 'none' },
                    },
                    beneath,
                );
            }
        } catch (err) {
            console.warn('[site-overlay] install failed (non-fatal):', err);
        }
    }

    /** Re-anchor the raster to a new transform (move/scale/rotate). */
    setTransform(transform: SitePlanOverlayTransform): void {
        this.transform = transform;
        this.refreshCoordinates();
    }

    /** Re-anchor after the site origin changed (geocode/location update). */
    setOrigin(originLat: number, originLon: number): void {
        this.originLat = originLat;
        this.originLon = originLon;
        this.refreshCoordinates();
    }

    private refreshCoordinates(): void {
        const map = this.map;
        if (!map || this.disposed) return;
        try {
            const src = map.getSource(OVERLAY_SOURCE) as ImageSource | undefined;
            if (!src?.setCoordinates) return;
            src.setCoordinates(toMapLibreCoordinates(this.transform, this.originLat, this.originLon));
        } catch (err) {
            console.warn('[site-overlay] setCoordinates failed (non-fatal):', err);
        }
    }

    setOpacity(opacity: number): void {
        const map = this.map;
        if (!map || this.disposed) return;
        try {
            if (map.getLayer(OVERLAY_LAYER)) {
                map.setPaintProperty(OVERLAY_LAYER, 'raster-opacity', clamp01(opacity));
            }
        } catch (err) {
            console.warn('[site-overlay] setOpacity failed (non-fatal):', err);
        }
    }

    setVisible(visible: boolean): void {
        const map = this.map;
        if (!map || this.disposed) return;
        try {
            if (map.getLayer(OVERLAY_LAYER)) {
                map.setLayoutProperty(OVERLAY_LAYER, 'visibility', visible ? 'visible' : 'none');
            }
        } catch (err) {
            console.warn('[site-overlay] setVisible failed (non-fatal):', err);
        }
    }

    /** Replace the raster image (e.g. user picked a different PDF page). */
    setImage(dataUrl: string, transform: SitePlanOverlayTransform): void {
        const map = this.map;
        if (!map || this.disposed) return;
        this.transform = transform;
        try {
            const src = map.getSource(OVERLAY_SOURCE) as ImageSource | undefined;
            if (src?.updateImage) {
                src.updateImage({
                    url: dataUrl,
                    coordinates: toMapLibreCoordinates(this.transform, this.originLat, this.originLon),
                });
            }
        } catch (err) {
            console.warn('[site-overlay] setImage failed (non-fatal):', err);
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        const map = this.map;
        this.map = null;
        if (!map) return;
        try {
            if (map.getLayer(OVERLAY_LAYER)) map.removeLayer(OVERLAY_LAYER);
            if (map.getSource(OVERLAY_SOURCE)) map.removeSource(OVERLAY_SOURCE);
        } catch (err) {
            console.warn('[site-overlay] dispose failed (non-fatal):', err);
        }
    }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.min(1, Math.max(0, v));
}
