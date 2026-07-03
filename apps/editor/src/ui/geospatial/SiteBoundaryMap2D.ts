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
import { resolveSiteContext, dispatchParcelBoundary, dispatchSiteLocation, dispatchSiteTrueNorth } from '../site/siteDispatch.js';
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
// PW.2 (§DIAG-PARTY-WALL) — capture neighbour footprints for the layout pipeline.
import { setNeighbourFootprints } from '../site/neighbourFootprintStore.js';
// A.21.D60 — pure relative-right-angle (orthogonal-to-previous-edge) draw aid.
import { resolveOrthoSnap } from './orthoSnap.js';
// §RECT-BOUNDARY — pure two-corner → axis-aligned CCW rectangle corner builder.
import { rectCornersFromOpposite } from './rectBoundary.js';
// §CIRCLE-BOUNDARY — pure centre+radius → closed CCW N-gon circle corner builder.
import {
    circleCornersFromCentreRadius,
    circleRadiusMetres,
    fmtRadiusMetres,
    snapRadiusToRound,
} from './circleBoundary.js';
// §ELLIPSE-BOUNDARY — pure centre+two-radii → closed CCW N-gon ellipse corner builder.
// Center → bounding-box corner: the corner's projected X offset = the semi-major
// (East/X) radius, its Y offset = the semi-minor (North/Z) radius. One drag / two
// clicks, mirroring the circle's commit seam (ADR-0082 ellipse stretch).
import {
    ellipseCornersFromCentreRadii,
    ellipseAxisRadiusMetres,
    fmtRadiiMetres,
    snapRadiusToRound as snapEllipseRadiusToRound,
} from './ellipseBoundary.js';
// §SITE-PLAN-OVERLAY — georeferenced client-plan (PDF/image) overlay controller.
import {
    mountSitePlanOverlayController,
    type SitePlanOverlayControllerHandle,
} from '../site/overlay/SitePlanOverlayController.js';

/** §BND-90-DEFAULT-ON — forgiving lock band (deg) for freehand map drawing (was the
 *  8° ORTHO_SNAP_TOLERANCE_DEG, too tight to hit by hand now the lock is default-on). */
const ORTHO_SNAP_WIDE_DEG = 22;

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

    // Instruction chip. Text is mode-dependent (see refreshChip below): the
    // §RECT-BOUNDARY rectangle mode shows "Click two opposite corners"; the legacy
    // polygon mode keeps the vertex-by-vertex instruction.
    const chip = document.createElement('div');
    chip.textContent = 'Click two opposite corners · Esc to cancel';
    Object.assign(chip.style, {
        position: 'absolute',
        // §DRAW-TOOLBAR-OFFSET (2026-06-24) — top bumped 12px → 92px so this
        // centred instruction pill clears BOTH the Author/Inspect/Data mode-tab
        // row (top:6px) and the boundary mode strip below it (now at top:52px).
        top: '92px',
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

    // ── §SITE-PLAN-OVERLAY — "Overlay plan/PDF" entry button ─────────────────────
    // Opens the file picker on the site-plan overlay controller (mounted on map load).
    // Brand white + #6600FF. Sits under the basemap toggle, left of the panel.
    const overlayBtn = document.createElement('button');
    overlayBtn.type = 'button';
    overlayBtn.textContent = '📄 Overlay plan / PDF';
    overlayBtn.setAttribute('data-testid', 'site-overlay-open-btn');
    Object.assign(overlayBtn.style, {
        position: 'absolute',
        top: '92px',
        left: '12px',
        zIndex: '21',
        padding: '7px 12px',
        borderRadius: '8px',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.95)',
        color: VIOLET,
        cursor: 'pointer',
        font: '600 12px/1 system-ui, sans-serif',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
    } satisfies Partial<CSSStyleDeclaration>);
    overlayBtn.addEventListener('click', () => overlayController?.promptUpload());
    overlay.appendChild(overlayBtn);

    // ── §BND-MODE-STRIP — boundary-draw MODE toolbar (mirrors WallDrawingHUD) ────
    // The founder's spec: present the boundary draw modes as a floating wall-style
    // pill strip — `MODE: [R Rectangle] [L Linear] [O Orthogonal] [C Curved] · ESC`
    // — with single-key shortcuts, exactly like the wall-creation HUD. We REUSE the
    // global `.wdh-*` CSS (drawingHuds.ts, injected via AppTheme) so the pill shape,
    // active-state violet (#6600FF), keyboard badge, and ESC hint match 1:1 — no new
    // styling. Each pill maps to the EXISTING boundary-draw plumbing:
    //   R Rectangle  → drawMode='rectangle' (§RECT-BOUNDARY two-corner; the default
    //                  + most-finished mode the residential/house generators expect)
    //   L Linear     → drawMode='polygon', orthoEnabled=false (free polyline)
    //   O Orthogonal → drawMode='polygon', orthoEnabled=true  (A.21.D60 90°-lock)
    //   C Curved     → no spline/arc boundary geometry exists yet → graceful
    //                  fallback to Linear polygon + a toast (pill still shown, marked).
    //   I Circle     → §CIRCLE-BOUNDARY two-point (centre + circumference); emits a
    //                  closed 64-gon polygon down the SAME commit path as Rectangle.
    //   E Ellipse    → §ELLIPSE-BOUNDARY two-point (centre + bounding-box corner): the
    //                  corner's projected X offset = semi-major (East) radius, Y offset
    //                  = semi-minor (North) radius; emits a closed 64-gon down the SAME
    //                  commit path (ADR-0082 ellipse stretch — tower massing).
    //
    // §FILLET-BOUNDARY — TODO (ADR-0082 arc/fillet stretch): a "Fillet" pill that lets
    // the user round an EXISTING boundary corner into a tangent arc WITHOUT redrawing.
    // The PURE engine is already shipped + unit-tested (`filletBoundary.ts`:
    // `filletCornerArc(prev, corner, next, radiusMetres, segments)` → arc vertices to
    // splice in place of the corner, with `maxFilletRadiusMetres` clamping the radius so
    // the arc fits within the two edges). What remains is the corner-pick INTERACTION:
    // (1) require a committed parcel boundary (read it back from the C19 SiteModelStore
    // or re-draw it into `vertices`); (2) hit-test the cursor against the boundary
    // vertices to pick a corner; (3) drag a fillet radius with a live `fmtFilletRadiusMetres`
    // readout; (4) splice `filletCornerArc(...).arc` into the ring at the corner index and
    // re-commit via the SAME `buildBoundaryFromLatLonRing → dispatchParcelBoundary` path.
    // Deferred (not half-built) because the corner-pick + boundary-readback UI is a
    // distinct interaction from the two-click draw modes here.
    //
    // The bar is `position:absolute` inside the overlay (the overlay is the editor
    // #container, also absolute) so it floats at the top-centre of the draw surface.
    type BoundaryDrawMode = 'rectangle' | 'linear' | 'orthogonal' | 'curved' | 'circle' | 'ellipse';
    const modeBar = document.createElement('div');
    modeBar.className = 'wdh-bar';
    modeBar.setAttribute('data-bnd-mode-bar', '1');
    // Override the global `.wdh-bar` fixed positioning so the strip is anchored to
    // THIS overlay (which may not cover the full window), not the viewport.
    // §DRAW-TOOLBAR-OFFSET (2026-06-24) — top bumped 12px → 52px so this
    // top-centre strip clears the Author/Inspect/Data mode-tab row (the
    // `.wmb-toplevel-wrapper` at top:6px, ~34px tall) instead of overlapping it.
    Object.assign(modeBar.style, {
        position: 'absolute',
        top: '52px',
        zIndex: '21',
    } satisfies Partial<CSSStyleDeclaration>);

    const modeLbl = document.createElement('span');
    modeLbl.className = 'wdh-mode-lbl';
    modeLbl.textContent = 'Mode:';
    modeBar.appendChild(modeLbl);

    const MODE_DEFS: ReadonlyArray<{ key: string; label: string; mode: BoundaryDrawMode }> = [
        { key: 'R', label: 'Rectangle',  mode: 'rectangle'  },
        { key: 'L', label: 'Linear',     mode: 'linear'     },
        { key: 'O', label: 'Orthogonal', mode: 'orthogonal' },
        { key: 'C', label: 'Curved',     mode: 'curved'     },
        // §CIRCLE-BOUNDARY — key 'I' (C is taken by Curved); two-point circle.
        { key: 'I', label: 'Circle',     mode: 'circle'     },
        // §ELLIPSE-BOUNDARY — key 'E'; two-point centre + bounding-box corner.
        { key: 'E', label: 'Ellipse',    mode: 'ellipse'    },
    ];
    const modeBtns = new Map<BoundaryDrawMode, HTMLButtonElement>();
    for (const d of MODE_DEFS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wdh-btn';
        btn.dataset['bndmode'] = d.mode;
        btn.innerHTML = `<span class="wdh-key">${d.key}</span><span class="wdh-lbl">${d.label}</span>`;
        btn.title = `Switch to ${d.label} draw mode (${d.key})`;
        btn.addEventListener('click', () => setDrawMode(d.mode));
        modeBar.appendChild(btn);
        modeBtns.set(d.mode, btn);
    }

    const escHint = document.createElement('span');
    escHint.className = 'wdh-esc';
    escHint.textContent = 'ESC to cancel';
    modeBar.appendChild(escHint);
    overlay.appendChild(modeBar);

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
    // §BND-MODE-STRIP — the user-facing draw mode (4 pills). Rectangle is the DEFAULT
    // (founder "for now" + most-finished): first click records corner A, the second
    // commits an axis-aligned rectangle. `linear`/`orthogonal`/`curved` are all the
    // legacy vertex-by-vertex polygon draw (Enter / dbl-click to close), differing
    // only in the 90°-lock + the curved fallback note (see setDrawMode).
    let uiMode: BoundaryDrawMode = 'rectangle';
    // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — the INTERNAL geometry mode
    // the draw handlers branch on. Four shapes exist: a two-corner axis-aligned
    // rectangle, a two-point circle (centre + circumference → N-gon), a two-point
    // ellipse (centre + bounding-box corner → N-gon), or a vertex-by-vertex polygon.
    // The six UI pills collapse onto these (+ the ortho flag below).
    let drawMode: 'rectangle' | 'polygon' | 'circle' | 'ellipse' = 'rectangle';
    // §RECT-BOUNDARY — the first clicked corner in rectangle mode (null = awaiting
    // the first click). The live rubber-band rectangle previews from here to the
    // cursor; the second click commits.
    let rectCornerA: LatLon | null = null;
    // §CIRCLE-BOUNDARY — the clicked circle CENTRE (null = awaiting the first click).
    // Once set, the live circle previews from this centre out to the cursor radius;
    // the second click commits the closed N-gon. The radius readout chip tracks it.
    let circleCentre: LatLon | null = null;
    // §ELLIPSE-BOUNDARY — the clicked ellipse CENTRE (null = awaiting the first click).
    // Once set, the live ellipse previews from this centre out to the cursor
    // (bounding-box corner: |Δx| = semi-major / East radius, |Δz| = semi-minor /
    // North radius); the second click commits the closed N-gon. The radii readout
    // chip tracks it.
    let ellipseCentre: LatLon | null = null;
    let draggingIdx: number | null = null;
    let disposed = false;
    // §SITE-PLAN-OVERLAY — the georeferenced client-plan overlay controller, mounted on
    // map load (so the MapLibre map handle exists). Null until then / after dispose.
    let overlayController: SitePlanOverlayControllerHandle | null = null;
    // O.7.2.b — set true by commit(). The map + boundary stay rendered, but draw
    // handlers are detached and the instruction/Esc/close affordances are frozen so
    // no further vertices can be added. The map is disposed ONLY later, at
    // generate-time, via dispose().
    let committed = false;
    // A.8.c.g — the live snap target under the cursor (null = no snap; click uses
    // the raw lngLat). Updated on every mousemove while drawing.
    let snapTarget: SnapTarget | null = null;
    // A.21.D60 / §BND-90 — relative right-angle lock: when ON (user OPT-IN), the
    // SECOND+ edges snap to the nearest 90 degrees off the PREVIOUS edge's direction
    // (any base rotation), so the user draws a clean rectilinear plot. The corner snap
    // (above) always takes priority; this engages only when no corner snap is in range.
    // §BND-90-DEFAULT-ON (founder 2026-06-08): the FIRST edge is ALWAYS free (the snap
    // guard requires ≥2 vertices — see resolveOrthoSnapTarget); the 90° lock is now ON by
    // DEFAULT so the user draws the first line at any site rotation, then every subsequent
    // edge auto-snaps orthogonal → a clean rectilinear plot. This is the critical upstream
    // fix: a non-rectangular plot (drawn freehand) classifies as T-U-SHAPE (§DIAG-SHAPE),
    // which fragments the stair carve and forces room drops (§FEASIBILITY-ALLOC). The user
    // can uncheck the toggle for a genuinely non-rectilinear site.
    let orthoEnabled = true;

    // A.21.D9 — pooled HTML markers for the edge-dimension labels. Index 0..n-1
    // are the PLACED edges (vertex i → i+1, wrapping); the last marker (when a
    // cursor position is known) is the LIVE segment (last vertex → cursor). We
    // grow the pool as needed and hide the surplus rather than re-creating chips
    // on every pointermove.
    const dimMarkers: MapLibreMarker[] = [];
    // The current cursor lng/lat (raw or snapped) for the live in-progress edge.
    let cursorLL: LatLon | null = null;
    // §CIRCLE-BOUNDARY — a single pooled chip showing the LIVE radius (centre→cursor)
    // while drawing a circle, mirroring the line tool's length labels. Created lazily
    // on the first circle draw; positioned at the circumference point under the cursor.
    let radiusMarker: MapLibreMarker | null = null;

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
        // §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — a circle/ellipse is a 64-gon; labelling
        // all 64 chords is noise. The radius readout chip (refreshRadiusLabel) is the
        // affordance, so suppress per-edge dimensions in those modes (segs empty → hidden).
        const n = drawMode === 'circle' || drawMode === 'ellipse' ? 0 : vertices.length;
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
                // PW.2 (§DIAG-PARTY-WALL) — capture neighbour footprints for the
                // layout pipeline (resolveBlindFacades → party/blind-wall detection).
                // The 2D draw map is often the FIRST surface to fetch (onboarding
                // draw, before Cesium mounts), so capturing here primes the store.
                setNeighbourFootprints(c.lat, c.lng, collection);
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

        // Fallback — close-the-loop snap to our own first vertex (polygon mode only;
        // in rectangle mode `vertices` holds the 4 live preview corners, so this
        // would wrongly snap corner B back onto corner A).
        if (drawMode === 'polygon' && vertices.length >= 3) {
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
                // §BND-90-DEFAULT-ON — widen the lock band from 8° to 22° so freehand
                // mouse-drawing on the map reliably snaps each edge orthogonal (8° is too
                // tight to hit by hand). A deliberate non-rectilinear edge (>22° off square)
                // still draws free; the user can also uncheck the ⟂ toggle entirely.
                ORTHO_SNAP_WIDE_DEG,
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

    /**
     * §RECT-BOUNDARY — build the live 4-corner axis-aligned rectangle from corner A
     * to the given second corner and write it into `vertices` (reusing the polygon
     * render path: fill + line + handles). Returns false when the two corners are
     * degenerate (same lat OR lon → zero area), leaving `vertices` as just [A].
     */
    function setRectVertices(a: LatLon, b: LatLon): boolean {
        const corners = rectCornersFromOpposite(a, b);
        vertices.length = 0;
        if (!corners) {
            vertices.push({ lat: a.lat, lon: a.lon });
            return false;
        }
        vertices.push(...corners);
        return true;
    }

    /**
     * §CIRCLE-BOUNDARY — build the live closed N-gon circle from `centre` out to a
     * circumference point (`edge`, the cursor) and write it into `vertices` (reusing
     * the polygon fill/line/handle render path). The radius is the projected metric
     * distance centre→edge, snapped to round numbers (0.5 m) when close. Returns
     * false for a degenerate (≈ zero) radius, leaving `vertices` as just [centre].
     */
    function setCircleVertices(centre: LatLon, edge: LatLon): boolean {
        const rawR = circleRadiusMetres(centre, edge);
        const r = snapRadiusToRound(rawR);
        vertices.length = 0;
        const corners = r > 0.05 ? circleCornersFromCentreRadius(centre, r) : null;
        if (!corners) {
            vertices.push({ lat: centre.lat, lon: centre.lon });
            return false;
        }
        vertices.push(...corners);
        return true;
    }

    /**
     * §ELLIPSE-BOUNDARY — build the live closed N-gon ellipse from `centre` out to a
     * bounding-box corner (`corner`, the cursor) and write it into `vertices` (reusing
     * the polygon fill/line/handle render path). The semi-major (East/X) radius is the
     * projected |Δx| centre→corner, the semi-minor (North/Z) is |Δz|, each snapped to
     * round numbers (0.5 m) when close. Returns false for a degenerate (≈ zero) radius
     * on either axis, leaving `vertices` as just [centre].
     */
    function setEllipseVertices(centre: LatLon, corner: LatLon): boolean {
        const rawRx = ellipseAxisRadiusMetres(centre, corner, 'x');
        const rawRy = ellipseAxisRadiusMetres(centre, corner, 'z');
        const rx = snapEllipseRadiusToRound(rawRx);
        const ry = snapEllipseRadiusToRound(rawRy);
        vertices.length = 0;
        const corners = rx > 0.05 && ry > 0.05 ? ellipseCornersFromCentreRadii(centre, rx, ry) : null;
        if (!corners) {
            vertices.push({ lat: centre.lat, lon: centre.lon });
            return false;
        }
        vertices.push(...corners);
        return true;
    }

    /**
     * §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — show/refresh the live radius readout chip
     * at the point under the cursor while drawing a circle (`R 12.5 m`) or an ellipse
     * (`Rx 20.0 × Ry 12.5 m`). Hidden when no circle/ellipse is in progress (no centre
     * / wrong mode / frozen). The chip reuses the SAME pooled `radiusMarker` (only one
     * radial mode is active at a time).
     */
    function refreshRadiusLabel(): void {
        if (disposed) return;
        // §ELLIPSE-BOUNDARY — two-axis readout while dragging the bounding-box corner.
        if (!committed && drawMode === 'ellipse' && ellipseCentre && cursorLL) {
            const rx = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, cursorLL, 'x'));
            const ry = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, cursorLL, 'z'));
            if (!radiusMarker) {
                radiusMarker = new MapLibreMarker({ element: makeDimChip(), anchor: 'center' });
                radiusMarker.setLngLat([0, 0]).addTo(map);
            }
            const el = radiusMarker.getElement();
            if (rx < 0.05 || ry < 0.05) { el.style.display = 'none'; return; }
            el.style.display = '';
            el.textContent = fmtRadiiMetres(rx, ry);
            radiusMarker.setLngLat([cursorLL.lon, cursorLL.lat]);
            return;
        }
        const active = !committed && drawMode === 'circle' && circleCentre && cursorLL;
        if (!active) {
            if (radiusMarker) radiusMarker.getElement().style.display = 'none';
            return;
        }
        const rawR = circleRadiusMetres(circleCentre!, cursorLL!);
        const r = snapRadiusToRound(rawR);
        if (!radiusMarker) {
            radiusMarker = new MapLibreMarker({ element: makeDimChip(), anchor: 'center' });
            radiusMarker.setLngLat([0, 0]).addTo(map);
        }
        const el = radiusMarker.getElement();
        if (r < 0.05) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.textContent = fmtRadiusMetres(r);
        // Position at the circumference point (the cursor) so the readout tracks the
        // dragged radius like the line tool's length label tracks the segment end.
        radiusMarker.setLngLat([cursorLL!.lon, cursorLL!.lat]);
    }

    function onClick(e: MapMouseEvent): void {
        if (disposed || committed) return;
        // Ignore the click that ends a vertex-drag.
        if (draggingIdx !== null) return;
        // A.8.c.g — commit the snapped position when a snap is active, else raw.
        const snap = snapTarget;
        const lat = snap ? snap.lat : e.lngLat.lat;
        const lon = snap ? snap.lon : e.lngLat.lng;

        // §RECT-BOUNDARY — rectangle mode: first click = corner A; second = corner B
        // → IMMEDIATE commit of the axis-aligned rectangle.
        if (drawMode === 'rectangle') {
            if (!rectCornerA) {
                rectCornerA = { lat, lon };
                vertices.length = 0;
                vertices.push({ lat, lon }); // show a handle at corner A
                snapTarget = null;
                refreshSnapIndicator();
                refreshRing();
                console.log(`[gis] map2d rect corner A @ ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
            const ok = setRectVertices(rectCornerA, { lat, lon });
            snapTarget = null;
            refreshSnapIndicator();
            refreshRing();
            if (!ok) {
                console.warn('[gis] map2d rect: degenerate second corner (zero-area) — pick a corner with both lat and lon offset');
                toast('Pick the OPPOSITE corner (not on the same line).', 'error');
                return;
            }
            console.log(
                `[gis] map2d rect corner B @ ${lat.toFixed(6)}, ${lon.toFixed(6)} → 4-corner axis-aligned rectangle, committing`,
            );
            commit();
            return;
        }

        // §CIRCLE-BOUNDARY — circle mode: first click = CENTRE; second = a point on
        // the circumference → IMMEDIATE commit of the closed N-gon polygon.
        if (drawMode === 'circle') {
            if (!circleCentre) {
                circleCentre = { lat, lon };
                vertices.length = 0;
                vertices.push({ lat, lon }); // show a handle at the centre
                snapTarget = null;
                refreshSnapIndicator();
                refreshRing();
                refreshRadiusLabel();
                console.log(`[gis] map2d circle centre @ ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
            const ok = setCircleVertices(circleCentre, { lat, lon });
            snapTarget = null;
            refreshSnapIndicator();
            refreshRing();
            if (!ok) {
                console.warn('[gis] map2d circle: zero-radius — click further from the centre');
                toast('Click further from the centre to set a radius.', 'error');
                return;
            }
            const r = snapRadiusToRound(circleRadiusMetres(circleCentre, { lat, lon }));
            console.log(
                `[gis] map2d circle radius ${r.toFixed(2)} m @ ${lat.toFixed(6)}, ${lon.toFixed(6)} → ${vertices.length}-gon, committing`,
            );
            commit();
            return;
        }

        // §ELLIPSE-BOUNDARY — ellipse mode: first click = CENTRE; second = a
        // bounding-box corner (|Δx| = East radius, |Δz| = North radius) → IMMEDIATE
        // commit of the closed N-gon polygon.
        if (drawMode === 'ellipse') {
            if (!ellipseCentre) {
                ellipseCentre = { lat, lon };
                vertices.length = 0;
                vertices.push({ lat, lon }); // show a handle at the centre
                snapTarget = null;
                refreshSnapIndicator();
                refreshRing();
                refreshRadiusLabel();
                console.log(`[gis] map2d ellipse centre @ ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                return;
            }
            const ok = setEllipseVertices(ellipseCentre, { lat, lon });
            snapTarget = null;
            refreshSnapIndicator();
            refreshRing();
            if (!ok) {
                console.warn('[gis] map2d ellipse: zero-radius on an axis — pick a corner offset on BOTH axes');
                toast('Pick a corner offset from the centre on BOTH axes.', 'error');
                return;
            }
            const rx = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, { lat, lon }, 'x'));
            const ry = snapEllipseRadiusToRound(ellipseAxisRadiusMetres(ellipseCentre, { lat, lon }, 'z'));
            console.log(
                `[gis] map2d ellipse Rx ${rx.toFixed(2)} × Ry ${ry.toFixed(2)} m @ ${lat.toFixed(6)}, ${lon.toFixed(6)} → ${vertices.length}-gon, committing`,
            );
            commit();
            return;
        }

        // Polygon mode (legacy): each click adds a vertex.
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
        // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — rectangle + circle +
        // ellipse modes commit on the second single click; the close-the-loop
        // double-click is a polygon-only affordance.
        if (drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse') { e.preventDefault(); return; }
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
        // §RECT-BOUNDARY — rectangle mode is axis-aligned by construction, so the
        // relative-right-angle (ortho) snap doesn't apply (and would make the live
        // rect jitter, since it'd read the preview rect's own edges). Keep the
        // building corner/edge snap so corner B can land on a real footprint corner.
        // §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — circle + ellipse modes (like rectangle)
        // are radial/box-defined by construction, so the relative-right-angle (ortho)
        // snap doesn't apply. Keep the building corner/edge snap so the centre /
        // circumference / box corner can land on a real footprint.
        const next =
            drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse'
                ? resolveSnap(e.point)
                : (resolveSnap(e.point) ?? resolveOrthoSnapTarget(e.point));
        // A.21.D9 — track the cursor (snapped position when a snap is active, else
        // the raw lngLat) so the live in-progress edge label follows the pointer.
        cursorLL = next
            ? { lat: next.lat, lon: next.lon }
            : { lat: e.lngLat.lat, lon: e.lngLat.lng };
        // §RECT-BOUNDARY — live rubber-band rectangle: once corner A is placed,
        // preview the axis-aligned rectangle from A to the cursor via the SAME
        // fill/line/vertex render path the committed boundary uses.
        if (drawMode === 'rectangle' && rectCornerA) {
            setRectVertices(rectCornerA, cursorLL);
            refreshRing();
        }
        // §CIRCLE-BOUNDARY — live rubber-band circle: once the centre is placed,
        // preview the N-gon from the centre out to the cursor radius via the SAME
        // render path. The radius readout chip follows the circumference point.
        if (drawMode === 'circle' && circleCentre) {
            setCircleVertices(circleCentre, cursorLL);
            refreshRing();
        }
        // §ELLIPSE-BOUNDARY — live rubber-band ellipse: once the centre is placed,
        // preview the N-gon from the centre out to the cursor (bounding-box corner)
        // via the SAME render path. The two-axis radii readout follows the cursor.
        if (drawMode === 'ellipse' && ellipseCentre) {
            setEllipseVertices(ellipseCentre, cursorLL);
            refreshRing();
        }
        refreshDimLabels();
        refreshRadiusLabel();
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
        // Ignore shortcuts while typing in a field (e.g. the geocode box).
        const t = ev.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        if (ev.key === 'Enter') {
            ev.preventDefault();
            // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — Enter is a
            // polygon-only close. Rectangle + circle + ellipse commit on the second
            // click; a stray Enter must not commit the live preview shape.
            if (drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse') return;
            commit();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            cancel();
            return;
        }
        // §BND-MODE-STRIP — single-key mode shortcuts (R/L/O/C), mirroring the wall
        // HUD. Plain keys only (no modifier) so they don't clash with browser combos.
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const mode: BoundaryDrawMode | undefined = {
            r: 'rectangle', l: 'linear', o: 'orthogonal', c: 'curved', i: 'circle', e: 'ellipse',
        }[ev.key.toLowerCase()] as BoundaryDrawMode | undefined;
        if (mode) {
            ev.preventDefault();
            setDrawMode(mode);
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

    // ── §BND-MODE-STRIP — boundary-draw mode strip (Rectangle/Linear/Ortho/Curved) ─
    /** Highlight the active mode pill (the `.wdh-btn--active` violet state). */
    function paintModeStrip(): void {
        for (const [mode, btn] of modeBtns) {
            const active = mode === uiMode;
            btn.classList.toggle('wdh-btn--active', active);
            btn.setAttribute('aria-pressed', String(active));
        }
    }
    /** Update the instruction chip text for the active UI mode. */
    function refreshModeChrome(): void {
        switch (uiMode) {
            case 'rectangle':
                chip.textContent = 'Click two opposite corners · Esc to cancel';
                break;
            case 'linear':
                chip.textContent = 'Click each corner (free angles) · double-click or Enter to close · Esc to cancel';
                break;
            case 'orthogonal':
                chip.textContent = '⟂ 90°-locked · click each corner · double-click or Enter to close · Esc to cancel';
                break;
            case 'curved':
                // §BND-MODE-STRIP — no curved/arc boundary geometry yet → falls back to
                // a straight polyline; tell the user so the result isn't a surprise.
                chip.textContent = 'Curved not available yet — drawing straight segments · double-click or Enter to close · Esc';
                break;
            case 'circle':
                // §CIRCLE-BOUNDARY — click centre, then a point on the circumference.
                chip.textContent = 'Click the centre, then a point on the edge (radius shown) · Esc to cancel';
                break;
            case 'ellipse':
                // §ELLIPSE-BOUNDARY — click centre, then a bounding-box corner (two radii shown).
                chip.textContent = 'Click the centre, then a corner of the bounding box (Rx × Ry shown) · Esc to cancel';
                break;
        }
    }
    /**
     * Switch the user-facing draw mode (one of the four pills) and resolve it onto
     * the two internal geometry modes (+ the ortho flag), resetting any in-progress
     * draw so the modes don't bleed.
     *   rectangle  → geometry 'rectangle'
     *   linear     → geometry 'polygon', orthoEnabled=false
     *   orthogonal → geometry 'polygon', orthoEnabled=true
     *   curved     → geometry 'polygon' (straight fallback) + one-time toast; no
     *                spline/arc boundary builder exists yet (reported as missing).
     */
    function setDrawMode(next: BoundaryDrawMode): void {
        if (disposed || committed || next === uiMode) return;
        uiMode = next;
        switch (next) {
            case 'rectangle':
                drawMode = 'rectangle';
                break;
            case 'linear':
                drawMode = 'polygon';
                orthoEnabled = false;
                break;
            case 'orthogonal':
                drawMode = 'polygon';
                orthoEnabled = true;
                break;
            case 'curved':
                // Graceful fallback: behave as a free polyline until a spline/arc
                // boundary builder lands. The downstream contract is unchanged.
                drawMode = 'polygon';
                orthoEnabled = false;
                toast('Curved boundaries aren’t available yet — drawing straight segments.', 'info');
                break;
            case 'circle':
                // §CIRCLE-BOUNDARY — two-point centre+radius → closed 64-gon polygon.
                drawMode = 'circle';
                break;
            case 'ellipse':
                // §ELLIPSE-BOUNDARY — two-point centre + bounding-box corner → 64-gon.
                drawMode = 'ellipse';
                break;
        }
        // Reset the in-progress draw (clears corner A / circle+ellipse centre / partial polygon).
        rectCornerA = null;
        circleCentre = null;
        ellipseCentre = null;
        vertices.length = 0;
        snapTarget = null;
        cursorLL = null;
        try { refreshRing(); } catch { /* style may be swapping */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        try { refreshRadiusLabel(); } catch { /* ignore */ }
        paintModeStrip();
        refreshModeChrome();
        console.log(`[gis] map2d: draw mode → ${next} (geometry=${drawMode}, ortho=${orthoEnabled})`);
    }
    // Initial paint — Rectangle is the default (founder "for now"); the strip's key
    // shortcuts (R/L/O/C) are handled by the overlay key listener (keyListener).
    paintModeStrip();
    refreshModeChrome();

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
        // §CIRCLE-BOUNDARY — drop the live radius readout (the circle is committed).
        try { refreshRadiusLabel(); } catch { /* style may be swapping */ }
        try { map.getCanvas().style.cursor = ''; } catch { /* ignore */ }
        // Freeze the chrome: the instruction chip + close (×) no longer apply (the
        // overlay is now a passive backdrop for the confirm step). Hide them so the
        // user isn't tempted to keep drawing/cancelling.
        chip.style.display = 'none';
        closeBtn.style.display = 'none';
        // §BND-MODE-STRIP — the mode toolbar is a draw-only affordance; remove it on commit.
        modeBar.style.display = 'none';
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
        // §CIRCLE-BOUNDARY — remove the live radius readout marker.
        if (radiusMarker) { try { radiusMarker.remove(); } catch { /* ignore */ } radiusMarker = null; }
        // MAP-DATA-OVERTURE — cancel any in-flight context fetch + pending debounce.
        try { ctxAbort?.abort(); } catch { /* ignore */ }
        if (ctxDebounce) { clearTimeout(ctxDebounce); ctxDebounce = null; }
        // §SITE-PLAN-OVERLAY — tear down the overlay panel + raster (persistence kept).
        try { overlayController?.dispose(); } catch { /* ignore */ }
        overlayController = null;
        try { delete (window as unknown as { pryzmOpenSitePlanOverlay?: () => void }).pryzmOpenSitePlanOverlay; } catch { /* ignore */ }
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

        // §SITE-PLAN-OVERLAY — mount the client-plan overlay controller now the map is
        // ready. It renders the calibrated raster UNDER the violet draw layers and owns
        // the upload + move/scale/rotate/opacity/calibrate panel. The boundary tracing
        // itself stays the existing draw tool — the overlay only sits beneath it.
        try {
            const ctx = resolveSiteContext(runtime ?? null);
            overlayController = mountSitePlanOverlayController({
                map,
                parent: overlay,
                getOrigin,
                projectId: ctx?.projectId ?? null,
                toast: (message, severity) => {
                    (runtime ?? null)?.events?.emit('pryzm:toast', { message, severity });
                },
                // §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — commit the underlay placement as
                // Project North: mirror θ onto SiteLocation.trueNorth via the P6 command
                // path so the 3D globe/site view sits the model at true north.
                onCommitProjectNorth: (thetaRad: number) => {
                    const c = resolveSiteContext(runtime ?? null);
                    if (c) dispatchSiteTrueNorth(c, thetaRad);
                },
                // §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — the placement commit is the
                // wizard's "proceed" action. Emit an event the onboarding listens for to
                // advance Step 2 → the boundary-trace / plot step (L-38: a geolocated plan
                // is a valid located plot — no mandatory boundary trace to move forward).
                onPlacementCommitted: () => {
                    try { (runtime ?? null)?.events?.emit('site.overlay-placement-committed', {}); } catch { /* non-fatal */ }
                },
            });
            // §SITE-PLAN-OVERLAY — window hook so the onboarding "Overlay a plan/PDF"
            // choice can open the upload picker after the draw map mounts.
            (window as unknown as { pryzmOpenSitePlanOverlay?: () => void }).pryzmOpenSitePlanOverlay =
                () => overlayController?.promptUpload();
        } catch (err) {
            console.warn('[site-overlay] controller mount failed (non-fatal):', err);
        }

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
