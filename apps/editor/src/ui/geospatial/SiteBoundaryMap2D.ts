// A.8.c.f — Hektar-style 2D top-down boundary-draw map (MapLibre GL JS).
//
// WHAT THIS IS
// ------------
// The founder's spec replaces the Cesium-3D-globe DRAW surface (SiteBoundaryDrawTool)
// with an elegant 2D PLAN-VIEW map for authoring the parcel boundary, while KEEPING
// Cesium 3D-tiles for the rendered/visualised result. This module mounts a full-
// surface MapLibre map (cream/shadow "Hektar" basemap — see siteMap2DStyle.ts),
// centres it on the geocoded site location, lets the user draw a polygon with the
// mouse, and on close reuses the EXISTING projection + dispatch path:
//
//     drawn lat/lon ring → buildBoundaryFromLatLonRing (boundaryProjection.ts)
//                        → dispatchParcelBoundary (siteDispatch.ts)
//                        → site.setParcelBoundary  (same as SiteBoundaryDrawTool)
//
// So drawing on the 2D map sets the SAME C19 parcel boundary the apartment
// generator consumes (`generateApartmentFromBoundary`). After commit the overlay
// closes and the user can switch to the Cesium 3D view for the rendered result.
//
// DRAW UX (hand-rolled, keyless — no terra-draw dependency for the first cut)
// ---------------------------------------------------------------------------
//   - click          → add a vertex
//   - double-click   → close the loop + commit
//   - Enter          → close the loop + commit
//   - Esc            → cancel (close overlay, no boundary)
//   - drag a handle  → move that vertex (live re-project on commit)
// The in-progress ring + vertex handles render in PRYZM violet (#6600FF) via a
// GeoJSON source updated on every edit.
//
// LAYERING (L7 editor UI): imports `maplibre-gl` (the only site of that dependency),
// the pure projection core (boundaryProjection), and the shared dispatch helper
// (siteDispatch). No THREE / Cesium import — the 2D draw surface is fully
// independent of the Cesium viewer.

import maplibregl, {
    Map as MapLibreMap,
    type MapMouseEvent,
    type StyleSpecification,
    type GeoJSONSource,
} from 'maplibre-gl';
// MapLibre control/attribution chrome. Vite bundles this CSS at the import site;
// it is the canvas controls' baseline styling (the Hektar look is layered on top
// via the cream style + our violet GeoJSON layers).
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildBoundaryFromLatLonRing,
    type LatLon,
} from '../site/boundaryProjection.js';
import { resolveSiteContext, dispatchParcelBoundary, dispatchSiteLocation } from '../site/siteDispatch.js';
import { buildSiteMap2DStyle, buildSatelliteStyle, HEKTAR_PALETTE } from './siteMap2DStyle.js';

const VIOLET = HEKTAR_PALETTE.violet;
const RING_SOURCE = 'pryzm-boundary-ring';
const FILL_LAYER = 'pryzm-boundary-fill';
const LINE_LAYER = 'pryzm-boundary-line';
const VERTEX_LAYER = 'pryzm-boundary-vertices';

export interface SiteBoundaryMap2DOptions {
    /** Where to mount the overlay (the editor #container, same as the geocode box). */
    readonly parent: HTMLElement;
    /** The runtime (for dispatch + toasts). */
    readonly runtime: PryzmRuntime | null;
    /**
     * Initial map centre + frame. Supplied from the geocoded site (geocodeAddress).
     * `bbox` is `[w,s,e,n]` (lon/lat) when available → the map fits it; otherwise it
     * centres on `[lon,lat]` at `zoom`. Falls back to a world view if absent.
     */
    readonly initial?: {
        readonly lat: number;
        readonly lon: number;
        readonly bbox?: [number, number, number, number];
        readonly zoom?: number;
    };
    /**
     * The projection origin for the drawn ring. Defaults to the Site location; if
     * the Site has none yet, the first drawn vertex is used (and recorded as the
     * Site location) — mirrors SiteBoundaryDrawTool.getOrigin.
     */
    readonly getOrigin: () => { lat: number; lon: number } | null;
    /**
     * Render building footprints as a gentle `fill-extrusion` (the founder's "see
     * the building in 3D") instead of the flat near-white plan fill. Off by
     * default — the plan-view look is the tasteful default.
     */
    readonly extrude?: boolean;
    /** Called after a successful commit OR cancel, so the host can dispose. */
    readonly onClose?: () => void;
}

/**
 * Mount the 2D Hektar boundary-draw overlay. Returns a handle with `dispose()`.
 * The overlay covers `parent`, captures pointer events, and renders a close (×)
 * button + a short instruction chip.
 */
export function mountSiteBoundaryMap2D(
    opts: SiteBoundaryMap2DOptions,
): { dispose: () => void; readonly element: HTMLElement } {
    const { parent, runtime, getOrigin, onClose } = opts;

    // ── Overlay shell ─────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'pryzm-gis-map2d';
    Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '20',
        background: HEKTAR_PALETTE.cream,
    } satisfies Partial<CSSStyleDeclaration>);

    const mapEl = document.createElement('div');
    Object.assign(mapEl.style, {
        position: 'absolute',
        inset: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    overlay.appendChild(mapEl);

    // Instruction chip.
    const chip = document.createElement('div');
    chip.textContent = 'Click each corner · double-click or Enter to close · Esc to cancel';
    Object.assign(chip.style, {
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '21',
        background: 'rgba(255,255,255,0.92)',
        border: `1px solid ${VIOLET}`,
        borderRadius: '20px',
        padding: '6px 16px',
        font: '13px/1.4 system-ui, sans-serif',
        color: '#2a2438',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    overlay.appendChild(chip);

    // Close (×) button.
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close boundary map');
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: '21',
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.92)',
        color: '#2a2438',
        cursor: 'pointer',
        font: '16px/1 system-ui, sans-serif',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
    } satisfies Partial<CSSStyleDeclaration>);
    overlay.appendChild(closeBtn);

    // ── A.8.c.f.4 — Map ↔ Satellite basemap toggle (top-right, under the × ) ────
    // On-brand white + #6600FF segmented control. Clicking a segment swaps the
    // MapLibre style (cream vector ↔ ESRI satellite raster) via map.setStyle below.
    const toggle = document.createElement('div');
    toggle.className = 'pryzm-gis-basemap-toggle';
    Object.assign(toggle.style, {
        position: 'absolute',
        top: '52px',
        right: '12px',
        zIndex: '21',
        display: 'flex',
        gap: '0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        font: '12px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    function makeSegBtn(label: string, mode: 'map' | 'satellite'): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.dataset['mode'] = mode;
        b.setAttribute('aria-label', `${label} basemap`);
        Object.assign(b.style, {
            border: 'none',
            padding: '7px 12px',
            cursor: 'pointer',
            background: 'transparent',
            color: '#2a2438',
            font: 'inherit',
            fontWeight: '600',
        } satisfies Partial<CSSStyleDeclaration>);
        return b;
    }
    const mapBtn = makeSegBtn('Map', 'map');
    const satBtn = makeSegBtn('Satellite', 'satellite');
    toggle.appendChild(mapBtn);
    toggle.appendChild(satBtn);
    overlay.appendChild(toggle);

    /** Paint the active segment in violet, the inactive one white. */
    function paintToggle(): void {
        for (const b of [mapBtn, satBtn]) {
            const active = b.dataset['mode'] === basemap;
            b.style.background = active ? VIOLET : 'transparent';
            b.style.color = active ? '#ffffff' : '#2a2438';
            b.setAttribute('aria-pressed', String(active));
        }
    }
    paintToggle();

    parent.appendChild(overlay);

    // ── State ─────────────────────────────────────────────────────────────────
    const vertices: LatLon[] = [];
    let draggingIdx: number | null = null;
    let disposed = false;
    // A.8.c.f.4 — active basemap. Default = the Hektar cream vector look; the
    // corner toggle swaps to keyless ESRI satellite raster to fill OSM building-
    // footprint coverage gaps.
    let basemap: 'map' | 'satellite' = 'map';

    function toast(message: string, severity: 'info' | 'success' | 'error'): void {
        runtime?.events?.emit('pryzm:toast', { message, severity });
    }

    // ── Map ───────────────────────────────────────────────────────────────────
    const style = buildSiteMap2DStyle({
        extrude: opts.extrude ?? false,
    }) as unknown as StyleSpecification;

    // Centre + initial zoom. When a geocoded location is supplied we open AT the
    // plot (zoom ~16-17), never the world view — the fitBounds on 'load' below
    // then frames the exact bbox when one is available.
    const center: [number, number] = opts.initial
        ? [opts.initial.lon, opts.initial.lat]
        : [0, 0];
    const initialZoom = opts.initial
        ? (opts.initial.zoom ?? 16)
        : 1;
    const map = new MapLibreMap({
        container: mapEl,
        style,
        center,
        zoom: initialZoom,
        attributionControl: { compact: true },
        // Plan view: keep it flat + north-up (no pitch/rotate) for the draw,
        // unless 3D extrusion was requested (then allow a gentle pitch/rotate).
        pitchWithRotate: opts.extrude ?? false,
        dragRotate: opts.extrude ?? false,
        pitch: opts.extrude ? 45 : 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // ── Ring rendering (violet GeoJSON: fill + line + vertex handles) ──────────
    function ringFeatureCollection(): GeoJSON.FeatureCollection {
        const coords = vertices.map((v) => [v.lon, v.lat] as [number, number]);
        const features: GeoJSON.Feature[] = [];
        if (coords.length >= 2) {
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: [...coords, coords[0]!] },
                properties: {},
            });
        }
        if (coords.length >= 3) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: { kind: 'fill' },
            });
        }
        for (let i = 0; i < coords.length; i++) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coords[i]! },
                properties: { kind: 'vertex', idx: i },
            });
        }
        return { type: 'FeatureCollection', features };
    }

    function refreshRing(): void {
        const src = map.getSource(RING_SOURCE) as GeoJSONSource | undefined;
        if (src) src.setData(ringFeatureCollection());
    }

    function installRingLayers(): void {
        // Idempotent: setStyle() wipes all added sources/layers, so after a
        // basemap swap this re-adds them. Guard against the (load-time) case where
        // they are already present.
        if (map.getSource(RING_SOURCE)) {
            refreshRing();
            return;
        }
        map.addSource(RING_SOURCE, { type: 'geojson', data: ringFeatureCollection() });
        map.addLayer({
            id: FILL_LAYER,
            type: 'fill',
            source: RING_SOURCE,
            filter: ['==', ['get', 'kind'], 'fill'],
            paint: { 'fill-color': VIOLET, 'fill-opacity': 0.12 },
        });
        map.addLayer({
            id: LINE_LAYER,
            type: 'line',
            source: RING_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: { 'line-color': VIOLET, 'line-width': 3 },
        });
        map.addLayer({
            id: VERTEX_LAYER,
            type: 'circle',
            source: RING_SOURCE,
            filter: ['==', ['get', 'kind'], 'vertex'],
            paint: {
                'circle-radius': 6,
                'circle-color': VIOLET,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
            },
        });
    }

    // ── Draw interactions ─────────────────────────────────────────────────────
    function onClick(e: MapMouseEvent): void {
        if (disposed) return;
        // Ignore the click that ends a vertex-drag.
        if (draggingIdx !== null) return;
        vertices.push({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        refreshRing();
        console.log(`[gis] map2d vertex ${vertices.length} @ ${e.lngLat.lat.toFixed(6)}, ${e.lngLat.lng.toFixed(6)}`);
    }

    function onDblClick(e: MapMouseEvent): void {
        e.preventDefault();
        // The dblclick fires after two single clicks already added two vertices;
        // they are the intended last corner (duplicated) — drop one before commit.
        if (vertices.length >= 2) vertices.pop();
        refreshRing();
        commit();
    }

    // Vertex drag-to-edit.
    function onMouseDownVertex(e: MapMouseEvent & { features?: GeoJSON.Feature[] }): void {
        const f = e.features?.[0];
        const idx = f?.properties?.['idx'];
        if (typeof idx !== 'number') return;
        e.preventDefault();
        draggingIdx = idx;
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
    }
    function onMouseMove(e: MapMouseEvent): void {
        if (draggingIdx === null) return;
        vertices[draggingIdx] = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        refreshRing();
    }
    function onMouseUp(): void {
        if (draggingIdx === null) return;
        draggingIdx = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
        // Swallow the trailing click that the drag would otherwise register.
        setTimeout(() => { /* draggingIdx already cleared; click guard handled above */ }, 0);
    }

    const keyListener = (ev: KeyboardEvent): void => {
        if (disposed) return;
        if (ev.key === 'Enter') {
            ev.preventDefault();
            commit();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            cancel();
        }
    };

    // ── A.8.c.f.4 — basemap swap (preserves the draw across setStyle) ──────────
    // setStyle() tears down EVERY source + layer + re-fires 'style.load' /
    // 'styledata'. We re-add the violet boundary source + draw layers in that
    // event (installRingLayers, idempotent — it reads the live `vertices` array,
    // so in-progress + committed vertices survive) and re-apply the camera. The
    // draw→commit path is untouched: it operates on `vertices` + map-overlay
    // layers only; the commit (boundaryProjection → dispatchParcelBoundary) never
    // reads the basemap. So toggling mid-draw loses nothing.
    function swapBasemap(next: 'map' | 'satellite'): void {
        if (disposed || next === basemap) return;
        basemap = next;
        paintToggle();
        // Capture the current camera so the swap doesn't snap the view.
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();
        const style =
            next === 'satellite'
                ? (buildSatelliteStyle() as unknown as StyleSpecification)
                : (buildSiteMap2DStyle({ extrude: opts.extrude ?? false }) as unknown as StyleSpecification);
        // diff:false forces a full reload so the new source set replaces cleanly.
        map.setStyle(style, { diff: false });
        // Re-add the boundary draw + restore the camera once the new style loads.
        map.once('style.load', () => {
            if (disposed) return;
            installRingLayers();
            map.jumpTo({ center, zoom, bearing, pitch });
            console.log(`[gis] map2d: basemap → ${next}; boundary draw re-added (${vertices.length} vertices)`);
        });
    }
    mapBtn.addEventListener('click', () => swapBasemap('map'));
    satBtn.addEventListener('click', () => swapBasemap('satellite'));

    // ── Commit / cancel ───────────────────────────────────────────────────────
    function commit(): void {
        if (disposed) return;
        if (vertices.length < 3) {
            toast(`Need at least 3 corners (have ${vertices.length}).`, 'error');
            console.warn('[gis] map2d: <3 vertices, not closing');
            return;
        }

        const fromSite = getOrigin();
        const origin = fromSite ?? { lat: vertices[0]!.lat, lon: vertices[0]!.lon };
        console.log('[gis] map2d: projecting about origin', origin, fromSite ? '(from Site location)' : '(from first vertex)');

        const built = buildBoundaryFromLatLonRing(vertices, origin.lat, origin.lon);
        console.log(`[gis] map2d: ${built.polygon.length} XZ pts`, built.polygon, built.edgeClassifications);

        const ctx = resolveSiteContext(runtime);
        if (!ctx) { dispose(); return; }

        // Record the projection origin as the Site location if it had none (so the
        // apartment generator + future site intelligence share the SAME frame).
        if (!fromSite) {
            dispatchSiteLocation(ctx, { latitude: origin.lat, longitude: origin.lon, siteAddress: null });
        }

        const ok = dispatchParcelBoundary(ctx, {
            polygon: built.polygon,
            edgeClassifications: built.edgeClassifications,
        });
        if (ok) {
            const area = signedAreaAbs(built.polygon);
            ctx.toast(
                `Site boundary set — ${built.polygon.length} corners (~${area.toFixed(0)} m²). ` +
                `Switch to the 3D view to see it, or run pryzmGenerateApartmentFromBoundary().`,
                'success',
            );
        }
        dispose();
    }

    function cancel(): void {
        if (disposed) return;
        console.log('[gis] map2d: boundary draw cancelled');
        toast('Boundary draw cancelled.', 'info');
        dispose();
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        window.removeEventListener('keydown', keyListener);
        try { map.remove(); } catch { /* map may already be torn down */ }
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        console.log('[gis] map2d: disposed');
        onClose?.();
    }

    // ── Wiring ────────────────────────────────────────────────────────────────
    closeBtn.addEventListener('click', () => cancel());
    window.addEventListener('keydown', keyListener);

    map.on('load', () => {
        installRingLayers();
        // Defect 1 — land on THEIR plot, not the world. Prefer the geocode bbox
        // (frames the whole feature); fall back to a centred zoom on the point.
        const bbox = opts.initial?.bbox;
        const valid =
            bbox && bbox[2] > bbox[0] && bbox[3] > bbox[1] &&
            Number.isFinite(bbox[0]) && Number.isFinite(bbox[1]) &&
            Number.isFinite(bbox[2]) && Number.isFinite(bbox[3]);
        if (valid && bbox) {
            const [w, s, e, n] = bbox;
            // maxZoom 18 so a tiny single-building bbox still shows context.
            map.fitBounds([[w, s], [e, n]], { padding: 80, maxZoom: 18, duration: 0 });
            console.log('[gis] map2d: fit to geocode bbox', bbox);
        } else if (opts.initial) {
            map.jumpTo({ center: [opts.initial.lon, opts.initial.lat], zoom: opts.initial.zoom ?? 16 });
            console.log('[gis] map2d: centred on point', opts.initial.lat, opts.initial.lon);
        }
        map.on('click', onClick);
        map.on('dblclick', onDblClick);
        map.on('mousedown', VERTEX_LAYER, onMouseDownVertex);
        map.on('mousemove', onMouseMove);
        map.on('mouseup', onMouseUp);
        // Hover affordance over vertices.
        map.on('mouseenter', VERTEX_LAYER, () => { map.getCanvas().style.cursor = 'grab'; });
        map.on('mouseleave', VERTEX_LAYER, () => { if (draggingIdx === null) map.getCanvas().style.cursor = ''; });
        console.log('[gis] map2d: ready — Hektar cream/shadow boundary-draw map mounted');
    });

    return { element: overlay, dispose };
}

/** Absolute shoelace area of an XZ ring (m²) — for the commit toast. */
function signedAreaAbs(ring: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}
