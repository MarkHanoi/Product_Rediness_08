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
    Marker as MapLibreMarker,
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
    latLonToSceneXZ,
    type LatLon,
} from '../site/boundaryProjection.js';
import { resolveSiteContext, dispatchParcelBoundary, dispatchSiteLocation } from '../site/siteDispatch.js';
import {
    buildFormaMap2DStyle,
    buildSatelliteStyle,
    HEKTAR_PALETTE,
    FORMA_PALETTE,
    FORMA_BOUNDARY_DASH,
    FORMA_BOUNDARY_WIDTH,
    CONTEXT_BUILDINGS_SOURCE,
    CONTEXT_BUILDINGS_FILL_LAYER,
} from './siteMap2DStyle.js';
// MAP-DATA-OVERTURE — keyless OSM/Overture context-building loader.
import { fetchContextBuildings } from './contextBuildings.js';
// A.21.D60 — pure relative-right-angle (orthogonal-to-previous-edge) draw aid.
import { resolveOrthoSnap, ORTHO_SNAP_TOLERANCE_DEG } from './orthoSnap.js';

// FORMA.1 — the in-progress + drawn site boundary renders in dashed Forma green
// (SPEC-FORMA-SITE-VIEW §3), replacing the old PRYZM violet so it reads against
// the quiet off-white Forma basemap and matches the eventual 3D site boundary.
// The vertex handles keep PRYZM violet (HEKTAR_PALETTE.violet) for brand
// affordance — the editable handles are UI chrome, not the boundary line itself.
const BOUNDARY_GREEN = FORMA_PALETTE.boundary;
const BOUNDARY_FILL = FORMA_PALETTE.boundaryFill;
const VIOLET = HEKTAR_PALETTE.violet;
const RING_SOURCE = 'pryzm-boundary-ring';
const FILL_LAYER = 'pryzm-boundary-fill';
const LINE_LAYER = 'pryzm-boundary-line';
const VERTEX_LAYER = 'pryzm-boundary-vertices';

// ── A.8.c.g — snap-to-footprint ────────────────────────────────────────────────
// On mousemove during draw we query the rendered building footprints in a small
// box around the cursor and snap the next vertex to the nearest building CORNER
// (vertex) or, failing that, the nearest point on a building EDGE, then fall back
// to closing-the-loop on the in-progress ring's own first vertex. The snap target
// is shown as a tasteful violet ring so the user sees exactly where the click will
// land. Threshold is in screen pixels so it feels constant at every zoom.
const SNAP_SOURCE = 'pryzm-boundary-snap';
const SNAP_LAYER = 'pryzm-boundary-snap-indicator';
/** Snap activation radius in screen pixels (founder: "snap in corners"). */
const SNAP_PX = 12;
/** Half-size (px) of the queryRenderedFeatures box around the cursor — cheap. */
const SNAP_QUERY_HALF_PX = 14;
/** The building fill layer ids we probe for footprint geometry (flat + 3D +
 *  the MAP-DATA-OVERTURE richer OSM/Overture context overlay). */
const BUILDING_QUERY_LAYERS = ['buildings-fill', 'buildings-3d', CONTEXT_BUILDINGS_FILL_LAYER];

// ── A.21.D9 — live edge-dimension labels ─────────────────────────────────────
// Founder ask ("when defining the boundaries could add dimensions?"): show each
// edge's length in metres at its midpoint AS the user draws, including a live
// label on the in-progress segment from the last placed vertex to the cursor.
// Lengths reuse the SAME local-equirectangular projection the area readout uses
// (latLonToSceneXZ): project both endpoints about a per-edge origin and take the
// Euclidean XZ distance — invariant to the origin choice at parcel scale.
const VIOLET_TEXT = '#6600FF';

/** Euclidean length (metres) of a lat/lon segment via the boundary projection. */
function edgeMetres(a: LatLon, b: LatLon): number {
    // Project both endpoints about `a` (any common origin gives the same length).
    const pa = latLonToSceneXZ(a, a.lat, a.lon); // → {0,0}
    const pb = latLonToSceneXZ(b, a.lat, a.lon);
    return Math.hypot(pb.x - pa.x, pb.z - pa.z);
}

/** Geographic midpoint (good enough at parcel scale) of two lat/lon points. */
function midLatLon(a: LatLon, b: LatLon): [number, number] {
    return [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2];
}

/** Format a length in metres to a sensible precision (1 decimal). */
function fmtMetres(m: number): string {
    return `${m.toFixed(1)} m`;
}

/** Build a brand-styled dimension chip element (white bg, violet text, no black). */
function makeDimChip(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
        background: 'rgba(255,255,255,0.95)',
        border: `1px solid ${VIOLET_TEXT}`,
        borderRadius: '6px',
        padding: '2px 7px',
        font: '600 12px/1.2 system-ui, sans-serif',
        color: VIOLET_TEXT,
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 4px rgba(60,52,40,0.22)',
        pointerEvents: 'none',
        userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    return el;
}

/** A resolved snap target: the lng/lat to commit + what kind of feature it is. */
interface SnapTarget {
    readonly lon: number;
    readonly lat: number;
    // A.21.D60 — `'ortho'` = the relative right-angle lock (orthogonal to the
    // previous edge), distinct from the building corner/edge/loop snaps.
    readonly kind: 'corner' | 'edge' | 'loop' | 'ortho';
}

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
    /**
     * Called after CANCEL (Esc / ×), so the host can drop its handle. NOT called on
     * commit — O.7.2.b keeps the cream map + boundary alive after commit; teardown
     * then happens only at generate-time via the returned `dispose()`.
     */
    readonly onClose?: () => void;
    /**
     * O.7.2.b — called after a successful boundary COMMIT (Enter / double-click).
     * The map is NOT disposed: it stays mounted showing the drawn boundary while the
     * onboarding "Generate with AI?" confirm step renders OVER it. The host uses this
     * to advance the flow; it must dispose the map ONLY at generate-time (via the
     * handle's `dispose()` or `window.pryzmCloseBoundaryMap2D`).
     */
    readonly onCommit?: () => void;
}

/**
 * Mount the 2D Hektar boundary-draw overlay. Returns a handle with `dispose()`.
 * The overlay covers `parent`, captures pointer events, and renders a close (×)
 * button + a short instruction chip.
 *
 * O.7.2.b — `commit()` FREEZES (not disposes): it sets the boundary, detaches the
 * draw handlers, and leaves the cream map + violet boundary rendered so the
 * "Generate with AI?" confirm step appears over a live plan map. Call `dispose()`
 * (or `window.pryzmCloseBoundaryMap2D`) at generate-time to tear it down.
 */
export function mountSiteBoundaryMap2D(
    opts: SiteBoundaryMap2DOptions,
): { dispose: () => void; readonly element: HTMLElement } {
    const { parent, runtime, getOrigin, onClose, onCommit } = opts;

    // ── Overlay shell ─────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'pryzm-gis-map2d';
    Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        // §DRAW-MAP-ABOVE-CESIUM (2026-06-03): 20 → 40 so the draw surface is
        // unambiguously above the Cesium globe canvas during the draw step.
        zIndex: '40',
        // FORMA.1 — off-white land matches the Forma basemap behind/during load.
        background: FORMA_PALETTE.land,
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

    // ── A.21.D60 — "⟂ Orthogonal to previous edge" toggle (bottom-centre HUD) ────
    // Compact brand white + #6600FF checkbox shown ONLY while drawing (removed on
    // commit/cancel via freezeDraw/dispose). Default ON. Toggling flips `orthoEnabled`
    // and recomputes the live snap so the rubber-band preview updates immediately.
    const orthoHud = document.createElement('label');
    orthoHud.className = 'pryzm-gis-ortho-toggle';
    Object.assign(orthoHud.style, {
        position: 'absolute',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '21',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255,255,255,0.94)',
        border: `1px solid ${VIOLET}`,
        borderRadius: '20px',
        padding: '7px 14px',
        font: '600 12px/1 system-ui, sans-serif',
        color: '#2a2438',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    const orthoBox = document.createElement('input');
    orthoBox.type = 'checkbox';
    orthoBox.checked = true;   // default ON (matches `orthoEnabled` initial value, declared below)
    orthoBox.setAttribute('aria-label', 'Lock new edges orthogonal to the previous edge');
    Object.assign(orthoBox.style, {
        width: '15px',
        height: '15px',
        accentColor: VIOLET,
        cursor: 'pointer',
        margin: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    const orthoText = document.createElement('span');
    // U+27C2 PERPENDICULAR — the right-angle affordance the founder asked for.
    orthoText.textContent = '⟂ Orthogonal to previous edge';
    orthoHud.appendChild(orthoBox);
    orthoHud.appendChild(orthoText);
    overlay.appendChild(orthoHud);

    // A.8.c.f.4 — active basemap. Default = the Hektar cream vector look; the corner
    // toggle swaps to keyless ESRI satellite raster to fill OSM coverage gaps.
    // §TDZ-FIX (2026-06-03): MUST be declared BEFORE paintToggle() is called below —
    // it was declared further down, so paintToggle()'s read of `basemap` threw
    // `ReferenceError: Cannot access 'basemap' before initialization` synchronously
    // inside mountSiteBoundaryMap2D → the cream 2D map never attached and the Cesium
    // globe showed underneath during the draw step (founder-flagged regression).
    let basemap: 'map' | 'satellite' = 'map';

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
    // O.7.2.b — set true by commit(). The map + boundary stay rendered, but draw
    // handlers are detached and the instruction/Esc/close affordances are frozen so
    // no further vertices can be added. The map is disposed ONLY later, at
    // generate-time, via dispose().
    let committed = false;
    // A.8.c.g — the live snap target under the cursor (null = no snap; click uses
    // the raw lngLat). Updated on every mousemove while drawing.
    let snapTarget: SnapTarget | null = null;
    // A.21.D60 — relative right-angle lock: when ON (default), the SECOND+ edges
    // snap to the nearest 90 degrees off the PREVIOUS edge's direction (any base
    // rotation), so the user draws a clean rectilinear plot. The corner snap (above)
    // always takes priority; this engages only when no corner snap is in range.
    let orthoEnabled = true;

    // A.21.D9 — pooled HTML markers for the edge-dimension labels. Index 0..n-1
    // are the PLACED edges (vertex i → i+1, wrapping); the last marker (when a
    // cursor position is known) is the LIVE segment (last vertex → cursor). We
    // grow the pool as needed and hide the surplus rather than re-creating chips
    // on every pointermove.
    const dimMarkers: MapLibreMarker[] = [];
    // The current cursor lng/lat (raw or snapped) for the live in-progress edge.
    let cursorLL: LatLon | null = null;

    // MAP-DATA-OVERTURE — context-building fetch state. We fetch the richer OSM
    // footprints for the current map centre and feed them into the geojson source
    // (CONTEXT_BUILDINGS_SOURCE). `ctxAbort` cancels an in-flight fetch on a new
    // request / dispose; `ctxDebounce` coalesces moveend bursts; `ctxLastKey`
    // avoids refetching the same ~tile. Fully guarded — failure leaves the source
    // empty (today's behaviour).
    let ctxAbort: AbortController | null = null;
    let ctxDebounce: ReturnType<typeof setTimeout> | null = null;
    let ctxLastKey = '';

    function toast(message: string, severity: 'info' | 'success' | 'error'): void {
        runtime?.events?.emit('pryzm:toast', { message, severity });
    }

    // ── Map ───────────────────────────────────────────────────────────────────
    // FORMA.1 — DEFAULT to the Autodesk-Forma minimal-vector basemap (off-white
    // land, light-grey roads, pale blue-grey water, abstract building fills). The
    // satellite raster style stays available via the corner toggle.
    const style = buildFormaMap2DStyle({
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
        refreshDimLabels();
    }

    /**
     * A.21.D9 — render the live edge-dimension labels. One violet chip at the
     * midpoint of every PLACED edge, plus (while drawing, with a known cursor) a
     * chip on the in-progress segment from the last vertex to the cursor. Pooled
     * markers are reused; surplus chips are detached. Once committed (frozen) only
     * the placed edges are shown — no live cursor segment.
     */
    function refreshDimLabels(): void {
        if (disposed) return;
        // Build the list of segments to label: placed edges + the live segment.
        const segs: Array<{ a: LatLon; b: LatLon }> = [];
        const n = vertices.length;
        // Placed edges. When the ring is "closed" (≥3 vertices) we label the
        // closing edge (last → first) too so every drawn edge has a dimension.
        const placedEdges = n >= 3 ? n : Math.max(0, n - 1);
        for (let i = 0; i < placedEdges; i++) {
            segs.push({ a: vertices[i]!, b: vertices[(i + 1) % n]! });
        }
        // Live in-progress segment: last placed vertex → cursor (draw mode only).
        if (!committed && n >= 1 && cursorLL) {
            segs.push({ a: vertices[n - 1]!, b: cursorLL });
        }

        // Grow the marker pool to cover every segment.
        while (dimMarkers.length < segs.length) {
            const m = new MapLibreMarker({ element: makeDimChip(), anchor: 'center' });
            m.setLngLat([0, 0]).addTo(map);
            dimMarkers.push(m);
        }
        // Position + fill the chips we need; hide the surplus.
        for (let i = 0; i < dimMarkers.length; i++) {
            const marker = dimMarkers[i]!;
            const el = marker.getElement();
            const seg = segs[i];
            if (!seg) { el.style.display = 'none'; continue; }
            const metres = edgeMetres(seg.a, seg.b);
            // Skip a zero-length live segment (cursor sitting on the last vertex).
            if (metres < 0.05) { el.style.display = 'none'; continue; }
            el.style.display = '';
            el.textContent = fmtMetres(metres);
            marker.setLngLat(midLatLon(seg.a, seg.b));
        }
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
            // FORMA.1 — faint green fill rgba(45,106,79,0.08) (SPEC §3).
            paint: { 'fill-color': BOUNDARY_FILL },
        });
        map.addLayer({
            id: LINE_LAYER,
            type: 'line',
            source: RING_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            // FORMA.1 — dashed green boundary, 8px on / 6px off, 2px (SPEC §3).
            paint: {
                'line-color': BOUNDARY_GREEN,
                'line-width': FORMA_BOUNDARY_WIDTH,
                'line-dasharray': [...FORMA_BOUNDARY_DASH],
            },
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
        // A.8.c.g — snap indicator: a hollow violet ring drawn at the live snap
        // target. Empty until a snap is active (refreshSnapIndicator sets the data).
        map.addSource(SNAP_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addLayer({
            id: SNAP_LAYER,
            type: 'circle',
            source: SNAP_SOURCE,
            paint: {
                'circle-radius': 9,
                'circle-color': 'rgba(102,0,255,0.18)',
                'circle-stroke-color': VIOLET,
                'circle-stroke-width': 2.5,
            },
        });
    }

    /** An empty FeatureCollection (the snap indicator's resting state). */
    function emptyFC(): GeoJSON.FeatureCollection {
        return { type: 'FeatureCollection', features: [] };
    }

    // ── MAP-DATA-OVERTURE — load richer OSM/Overture footprints for the centre. ──
    // Fetches around the current map centre and pushes the result into the geojson
    // source so the plan shows dense surrounding buildings. Debounced + keyed so a
    // pan within the same area doesn't refetch. Never throws (loader degrades to an
    // empty collection on failure). No-op on the satellite raster style (the source
    // doesn't exist there).
    function loadContextBuildings(immediate = false): void {
        if (disposed) return;
        const run = (): void => {
            if (disposed) return;
            const src = map.getSource(CONTEXT_BUILDINGS_SOURCE) as GeoJSONSource | undefined;
            if (!src) return; // satellite style has no context source — skip.
            const c = map.getCenter();
            // Key on the centre rounded to ~0.005° (the fetch grid) — same area = skip.
            const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
            if (key === ctxLastKey) return;
            ctxLastKey = key;
            // Cancel any in-flight fetch; start a fresh one.
            ctxAbort?.abort();
            ctxAbort = new AbortController();
            const signal = ctxAbort.signal;
            void fetchContextBuildings(c.lat, c.lng, signal).then((collection) => {
                if (disposed || signal.aborted) return;
                const live = map.getSource(CONTEXT_BUILDINGS_SOURCE) as GeoJSONSource | undefined;
                if (live) {
                    live.setData(collection as unknown as GeoJSON.FeatureCollection);
                    console.log(`[gis] map2d: context buildings → ${collection.features.length} footprint(s).`);
                }
            });
        };
        if (immediate) { run(); return; }
        if (ctxDebounce) clearTimeout(ctxDebounce);
        ctxDebounce = setTimeout(run, 350);
    }

    /** Push the current snap target (or nothing) into the indicator source. */
    function refreshSnapIndicator(): void {
        const src = map.getSource(SNAP_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        if (!snapTarget) { src.setData(emptyFC()); return; }
        src.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [snapTarget.lon, snapTarget.lat] },
                properties: { kind: snapTarget.kind },
            }],
        });
    }

    // ── A.8.c.g — snap resolution ─────────────────────────────────────────────
    // Squared pixel distance between two screen points.
    function pxDist2(ax: number, ay: number, bx: number, by: number): number {
        const dx = ax - bx, dy = ay - by;
        return dx * dx + dy * dy;
    }

    /**
     * Flatten any (Multi)Polygon / (Multi)LineString feature geometry into a list
     * of rings, each an array of [lon,lat] positions. Points are ignored.
     */
    function ringsOf(geom: GeoJSON.Geometry): number[][][] {
        switch (geom.type) {
            case 'Polygon': return geom.coordinates as number[][][];
            case 'MultiPolygon': return (geom.coordinates as number[][][][]).flat();
            case 'LineString': return [geom.coordinates as number[][]];
            case 'MultiLineString': return geom.coordinates as number[][][];
            default: return [];
        }
    }

    /**
     * Resolve the best snap target for a cursor at screen point `pt`. Priority:
     *   1. building CORNER (a footprint vertex within SNAP_PX)
     *   2. building EDGE (nearest point on a footprint segment within SNAP_PX)
     *   3. closing-the-loop on our OWN first vertex within SNAP_PX (always works,
     *      and the documented fallback when the footprint geometry isn't queryable)
     * Returns null when nothing is within range (the click then uses raw lngLat).
     */
    function resolveSnap(pt: { x: number; y: number }): SnapTarget | null {
        const thr2 = SNAP_PX * SNAP_PX;
        let bestCorner: { lon: number; lat: number; d2: number } | null = null;
        let bestEdge: { lon: number; lat: number; d2: number } | null = null;

        let feats: GeoJSON.Feature[] = [];
        try {
            // Only probe the layers that actually exist in the active style (the
            // satellite raster style has neither building layer → empty result).
            const layers = BUILDING_QUERY_LAYERS.filter((l) => map.getLayer(l));
            if (layers.length > 0) {
                const box: [[number, number], [number, number]] = [
                    [pt.x - SNAP_QUERY_HALF_PX, pt.y - SNAP_QUERY_HALF_PX],
                    [pt.x + SNAP_QUERY_HALF_PX, pt.y + SNAP_QUERY_HALF_PX],
                ];
                feats = map.queryRenderedFeatures(box, { layers });
            }
        } catch { feats = []; /* defensive: never let snapping break draw */ }

        for (const f of feats) {
            for (const ring of ringsOf(f.geometry)) {
                for (let i = 0; i < ring.length; i++) {
                    const a = ring[i]!;
                    const ap = map.project([a[0]!, a[1]!]);
                    // Corner candidate.
                    const cd2 = pxDist2(pt.x, pt.y, ap.x, ap.y);
                    if (cd2 <= thr2 && (!bestCorner || cd2 < bestCorner.d2)) {
                        bestCorner = { lon: a[0]!, lat: a[1]!, d2: cd2 };
                    }
                    // Edge candidate (segment a→b, in screen space).
                    const b = ring[(i + 1) % ring.length]!;
                    const bp = map.project([b[0]!, b[1]!]);
                    const vx = bp.x - ap.x, vy = bp.y - ap.y;
                    const len2 = vx * vx + vy * vy;
                    if (len2 > 0) {
                        let t = ((pt.x - ap.x) * vx + (pt.y - ap.y) * vy) / len2;
                        t = Math.max(0, Math.min(1, t));
                        const ex = ap.x + t * vx, ey = ap.y + t * vy;
                        const ed2 = pxDist2(pt.x, pt.y, ex, ey);
                        if (ed2 <= thr2 && (!bestEdge || ed2 < bestEdge.d2)) {
                            // Unproject the nearest screen point back to lng/lat.
                            const ll = map.unproject([ex, ey]);
                            bestEdge = { lon: ll.lng, lat: ll.lat, d2: ed2 };
                        }
                    }
                }
            }
        }

        if (bestCorner) return { lon: bestCorner.lon, lat: bestCorner.lat, kind: 'corner' };
        if (bestEdge) return { lon: bestEdge.lon, lat: bestEdge.lat, kind: 'edge' };

        // Fallback — close-the-loop snap to our own first vertex.
        if (vertices.length >= 3) {
            const first = vertices[0]!;
            const fp = map.project([first.lon, first.lat]);
            if (pxDist2(pt.x, pt.y, fp.x, fp.y) <= thr2) {
                return { lon: first.lon, lat: first.lat, kind: 'loop' };
            }
        }
        return null;
    }

    /**
     * A.21.D60 — resolve the relative right-angle snap for the cursor at screen
     * point `pt`, using the previous committed edge (vertex n-2 → n-1) as the
     * reference axis. Projects those vertices to screen, runs the PURE
     * `resolveOrthoSnap`, then unprojects the snapped screen point back to lng/lat.
     * Returns null when ortho is OFF, fewer than 2 vertices are placed (no previous
     * edge), the cursor is outside the angular tolerance, or the input is
     * degenerate. NEVER throws — defensive against project/unproject during a style
     * swap. The building corner/edge/loop snap (resolveSnap) takes priority; this is
     * only consulted when that returns null.
     */
    function resolveOrthoSnapTarget(pt: { x: number; y: number }): SnapTarget | null {
        if (!orthoEnabled || vertices.length < 2) return null;
        try {
            const prevStart = vertices[vertices.length - 2]!;
            const prevEnd = vertices[vertices.length - 1]!;
            const ps = map.project([prevStart.lon, prevStart.lat]);
            const pe = map.project([prevEnd.lon, prevEnd.lat]);
            const snapped = resolveOrthoSnap(
                { x: ps.x, y: ps.y },
                { x: pe.x, y: pe.y },
                { x: pt.x, y: pt.y },
                ORTHO_SNAP_TOLERANCE_DEG,
            );
            if (!snapped) return null;
            const ll = map.unproject([snapped.x, snapped.y]);
            if (!Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) return null;
            return { lon: ll.lng, lat: ll.lat, kind: 'ortho' };
        } catch {
            return null; // never let the draw break.
        }
    }

    // ── Draw interactions ─────────────────────────────────────────────────────
    function onClick(e: MapMouseEvent): void {
        if (disposed || committed) return;
        // Ignore the click that ends a vertex-drag.
        if (draggingIdx !== null) return;
        // A.8.c.g — commit the snapped position when a snap is active, else raw.
        const snap = snapTarget;
        const lat = snap ? snap.lat : e.lngLat.lat;
        const lon = snap ? snap.lon : e.lngLat.lng;
        vertices.push({ lat, lon });
        // Clear the snap so it doesn't linger over the just-placed vertex.
        snapTarget = null;
        refreshSnapIndicator();
        refreshRing();
        console.log(
            `[gis] map2d vertex ${vertices.length} @ ${lat.toFixed(6)}, ${lon.toFixed(6)}` +
            (snap ? ` (snapped: ${snap.kind})` : ''),
        );
    }

    function onDblClick(e: MapMouseEvent): void {
        if (disposed || committed) return;
        e.preventDefault();
        // The dblclick fires after two single clicks already added two vertices;
        // they are the intended last corner (duplicated) — drop one before commit.
        if (vertices.length >= 2) vertices.pop();
        refreshRing();
        commit();
    }

    // Vertex drag-to-edit.
    function onMouseDownVertex(e: MapMouseEvent & { features?: GeoJSON.Feature[] }): void {
        if (disposed || committed) return;
        const f = e.features?.[0];
        const idx = f?.properties?.['idx'];
        if (typeof idx !== 'number') return;
        e.preventDefault();
        draggingIdx = idx;
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
    }
    function onMouseMove(e: MapMouseEvent): void {
        if (disposed || committed) return;
        if (draggingIdx !== null) {
            vertices[draggingIdx] = { lat: e.lngLat.lat, lon: e.lngLat.lng };
            refreshRing();
            return;
        }
        // A.8.c.g — not dragging: resolve a snap target under the cursor and show
        // (or hide) the violet snap indicator. Lightweight — one small box query.
        // A.21.D60 — the building corner/edge/loop snap takes PRIORITY; only when it
        // finds nothing do we fall back to the relative right-angle (ortho) lock, so
        // the user can still land exactly on a real corner when one is in range.
        const next = resolveSnap(e.point) ?? resolveOrthoSnapTarget(e.point);
        // A.21.D9 — track the cursor (snapped position when a snap is active, else
        // the raw lngLat) so the live in-progress edge label follows the pointer.
        cursorLL = next
            ? { lat: next.lat, lon: next.lon }
            : { lat: e.lngLat.lat, lon: e.lngLat.lng };
        refreshDimLabels();
        const changed =
            (next === null) !== (snapTarget === null) ||
            (next !== null && snapTarget !== null &&
                (next.lon !== snapTarget.lon || next.lat !== snapTarget.lat));
        if (changed) {
            snapTarget = next;
            refreshSnapIndicator();
            // Only assert the snap cursor; leave the default/grab cursor (managed by
            // the vertex hover handlers) untouched when there is no snap.
            if (next) map.getCanvas().style.cursor = 'crosshair';
            else if (map.getCanvas().style.cursor === 'crosshair') {
                map.getCanvas().style.cursor = '';
            }
        }
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
        if (disposed || committed) return;
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
                : (buildFormaMap2DStyle({ extrude: opts.extrude ?? false }) as unknown as StyleSpecification);
        // diff:false forces a full reload so the new source set replaces cleanly.
        map.setStyle(style, { diff: false });
        // Re-add the boundary draw + restore the camera once the new style loads.
        map.once('style.load', () => {
            if (disposed) return;
            installRingLayers();
            map.jumpTo({ center, zoom, bearing, pitch });
            // MAP-DATA-OVERTURE — the swap recreates an EMPTY context source (map
            // style) or none (satellite). Force a refetch so the footprints come
            // back after switching back to the Forma vector basemap.
            if (next === 'map') { ctxLastKey = ''; loadContextBuildings(true); }
            console.log(`[gis] map2d: basemap → ${next}; boundary draw re-added (${vertices.length} vertices)`);
        });
    }
    mapBtn.addEventListener('click', () => swapBasemap('map'));
    satBtn.addEventListener('click', () => swapBasemap('satellite'));

    // A.21.D60 — toggle the relative right-angle lock. Recompute the live snap from
    // the LAST cursor position so the rubber-band preview + indicator update at once
    // (without waiting for the next pointermove). Guarded — never throws.
    orthoBox.addEventListener('change', () => {
        if (disposed || committed) return;
        orthoEnabled = orthoBox.checked;
        console.log(`[gis] map2d: orthogonal-to-previous-edge lock ${orthoEnabled ? 'ON' : 'OFF'}`);
        // Re-resolve at the current cursor (if known) so turning it off frees the
        // preview immediately and turning it on snaps it immediately.
        if (!cursorLL) return;
        try {
            const pt = map.project([cursorLL.lon, cursorLL.lat]);
            const next = resolveSnap(pt) ?? resolveOrthoSnapTarget(pt);
            snapTarget = next;
            cursorLL = next ? { lat: next.lat, lon: next.lon } : cursorLL;
            refreshSnapIndicator();
            refreshDimLabels();
        } catch { /* style may be swapping — ignore */ }
    });

    // ── Commit / cancel ───────────────────────────────────────────────────────

    /**
     * O.7.2.b — FREEZE the draw without disposing the map. Detach every draw
     * interaction (so no further vertices/drags), drop the keyboard listener, and
     * make the overlay non-interactive for drawing (hide the instruction chip; turn
     * the × into a no-op visually — the host owns teardown now). The map + violet
     * boundary stay rendered so the "Generate with AI?" confirm step appears over a
     * live cream plan map. Idempotent.
     */
    function freezeDraw(): void {
        if (committed) return;
        committed = true;
        // Detach map draw handlers (handlers also early-return on `committed`, so this
        // is belt-and-braces against any in-flight event).
        try {
            map.off('click', onClick);
            map.off('dblclick', onDblClick);
            map.off('mousedown', VERTEX_LAYER, onMouseDownVertex);
            map.off('mousemove', onMouseMove);
            map.off('mouseup', onMouseUp);
        } catch { /* map may be mid-teardown — defensive */ }
        // Drop the global key listener (Enter/Esc) — the confirm step owns input now.
        window.removeEventListener('keydown', keyListener);
        // Clear any lingering snap indicator + draw cursor.
        snapTarget = null;
        // A.21.D9 — drop the live in-progress edge label; keep the placed-edge
        // dimensions so the committed boundary still reads its lengths.
        cursorLL = null;
        try { refreshSnapIndicator(); } catch { /* style may be swapping */ }
        try { refreshDimLabels(); } catch { /* style may be swapping */ }
        try { map.getCanvas().style.cursor = ''; } catch { /* ignore */ }
        // Freeze the chrome: the instruction chip + close (×) no longer apply (the
        // overlay is now a passive backdrop for the confirm step). Hide them so the
        // user isn't tempted to keep drawing/cancelling.
        chip.style.display = 'none';
        closeBtn.style.display = 'none';
        // A.21.D60 — the ortho toggle is a draw-only affordance; remove it on commit.
        orthoHud.style.display = 'none';
        console.log('[gis] map2d: boundary committed — draw frozen, cream map + boundary kept alive (dispose deferred to generate-time).');
    }

    function commit(): void {
        if (disposed || committed) return;
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
        // No site context = a genuine failure; we can't set a boundary, so tear down.
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
                `Site boundary set — ${built.polygon.length} corners (~${area.toFixed(0)} m²).`,
                'success',
            );
        }
        // O.7.2.b — FREEZE, don't dispose: keep the cream map + boundary alive so the
        // "Generate with AI?" confirm step renders over a live plan map. The host
        // (onboarding flow) disposes the map only when the user picks "Generate".
        freezeDraw();
        onCommit?.();
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
        // A.21.D9 — remove all pooled dimension-label markers.
        for (const m of dimMarkers) { try { m.remove(); } catch { /* ignore */ } }
        dimMarkers.length = 0;
        // MAP-DATA-OVERTURE — cancel any in-flight context fetch + pending debounce.
        try { ctxAbort?.abort(); } catch { /* ignore */ }
        if (ctxDebounce) { clearTimeout(ctxDebounce); ctxDebounce = null; }
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
        // MAP-DATA-OVERTURE — populate context footprints now + on every pan/zoom.
        loadContextBuildings(true);
        map.on('moveend', () => loadContextBuildings(false));
        console.log('[gis] map2d: ready — Forma minimal-vector boundary-draw map mounted');
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
