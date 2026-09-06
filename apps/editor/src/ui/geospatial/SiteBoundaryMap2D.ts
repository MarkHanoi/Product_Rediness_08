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
    parcelFrameOrigin,
    latLonToSceneXZ,
    type LatLon,
} from '../site/boundaryProjection.js';
import { resolveSiteContext, dispatchParcelBoundary, dispatchSiteLocation, dispatchSiteTrueNorth, dispatchClearParcelBoundary, canCommitParcelBoundary } from '../site/siteDispatch.js';
// §L-536-THETA-RESET — the SAME pure derivation `dispatchParcelBoundary` uses, so the θ this
// surface publishes cannot drift from the θ the ring is de-rotated by. See commit() below.
import { deriveProjectNorthAngleFromParcel } from '../site/overlay/projectTrueNorth.js';
import {
    // §MAP2D-PASTEL (L-12938 · STR-2D-SITE-MAP-CARTOGRAPHY §4 Stage M1) — this surface now
    // renders the PASTEL masterplan style. `buildFormaMap2DStyle` (v1) and `FORMA_PALETTE`
    // stay exported for their other callers and their existing pins; only the call moves.
    buildFormaMap2DStyleV2,
    PASTEL_SOURCES,
    buildSatelliteStyle,
    HEKTAR_PALETTE,
    FORMA_PALETTE,
    FORMA_PALETTE_V2,
    FORMA_BOUNDARY_DASH,
    FORMA_BOUNDARY_WIDTH,
    CONTEXT_BUILDINGS_SOURCE,
    CONTEXT_BUILDINGS_FILL_LAYER,
} from './siteMap2DStyle.js';
// MAP-DATA-OVERTURE — keyless OSM/Overture context-building loader.
import { fetchContextBuildings } from './contextBuildings.js';
// §OFFICIAL-FOOTPRINTS (L-12939) — the PURE draw decider shared with the 3D massing. The plan draws
// whole-building OUTLINES; the massing draws the register's PARTS. Drawing parts on a plan would
// show every building's internal divisions as separate structures — a masterplan drawing full of
// seams that do not exist on the ground.
import { shouldDrawInPlan, summariseOfficialFootprints } from './officialFootprint.js';
// §MAP2D-PASTEL (L-12938) — the OTHER baked context collections (roads, water areas +
// waterways, parks, landuse, rail, mapped trees + synthesised canopies) converted to the
// GeoJSON the pastel style's sources expect. It reads the SAME per-bbox memoised caches
// `contextLayerWarm.warmAllContextLayers()` fills for the 3D Site, so the 2D map adds NO
// network reads: one read, two renderers.
import { loadPastelContextGeoJson } from './pastelContextGeoJson.js';
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
    type EnterCanvasUnderlayParams,
} from '../site/overlay/SitePlanOverlayController.js';
// §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — drop the calibrated plan into the editor canvas
// as a live underlay (reuses the FloorPlanUnderlayTool + CREATE_UNDERLAY pipeline).
import { createPlanCanvasUnderlayFromSiteOverlay } from '../../engine/createSiteOverlayUnderlay.js';
// §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — the flow's own terminal
// "Finish → 3D + plan split view" transition (previously owned ONLY by the onboarding wizard).
import { onSitePlanPlacementCommitted } from '../site/overlay/enterCanvasWithSitePlan.js';
// §PARCEL-SELECT (L-380 P1 / L-384) — provider-agnostic "select a real cadastral parcel"
// data layer. The selected parcel commits through the SAME buildBoundaryFromLatLonRing →
// dispatchParcelBoundary path a DRAWN boundary uses. When NO provider is supplied the
// select mode renders an honest "connecting to cadastral data" placeholder card (the UI
// is complete + demoable ahead of the data wiring); when a provider IS supplied (Catastro)
// it fetches the real parcel. `dispatchClearParcelBoundary` powers the C19 §1.4-safe redraw.
import type { ParcelFeature, ParcelProvider } from '../site/parcel/index.js';
// §L-1581 (C06 §13.3) — THE ONE parcel-card producer. This file used to build the card
// inline (`showParcelCard` / `showStubParcelCard`, ~160 lines of DOM in a closure), which is
// why the founder's "panel for each parcel with data" lived and died with this modal and was
// reachable from nowhere else. The card now comes from a shared builder that the GIS rail
// panel mounts too, so the two surfaces cannot disagree about whether a ring is a legal
// cadastral parcel — the §GIS-ENVELOPE-REHOST (L-1362) precedent applied to the parcel card.
import {
    buildParcelCard,
    parcelFeatureToCardModel,
    parcelFeatureToProvenance,
} from '../site/parcel/parcelCard.js';
// §L-1580 (C57 §1.9) — the ROUTING table's own row for the click point. `parcelProvider`
// here is the generic registry, whose label is deliberately generic ("Cadastral parcel /
// building footprint"); §1.9 requires the ATTRIBUTION of the provider that actually
// answered, and the jurisdiction row is where that string and its region code live. Pure
// routing — no network, no side effect.
import { resolveParcelAttribution } from '../site/parcel/parcelRegistry.js';
import {
    assessParcelSize,
    parcelSizeReviewText,
    PARCEL_SIZE_REVIEW_TESTID,
} from '../site/parcel/parcelSizeReview.js';
// §L-12912 (lane PT-BELVERDE-LOTS) — when the cadastre's answer is a HOLDING (Belverde: a 766 ha
// prédio under a house) and an OSM footprint exists under the click, the footprint is the primary
// candidate and the holding stays one deliberate click away. Pure decision + the footprint
// provider the registry already falls back to; nothing is substituted silently.
import {
    chooseParcelCandidate,
    PARCEL_CANDIDATE_WHY_TESTID,
    PARCEL_USE_HOLDING_TESTID,
    type ParcelCandidateChoice,
} from '../site/parcel/parcelCandidateChoice.js';
import { footprintParcelProvider } from '../site/parcel/FootprintParcelProvider.js';
// §STARTUP-SELECT-IS-NOT-DWELL (L-12931) — the mark that splits the user's dwell on the 2D map
// from the machine cost of turning her click into a 3D render. A MARK, never a gate.
import { markStartupPhase } from '../../engine/startupBudget.js';
import type { ParcelProvenance } from '@pryzm/schemas';

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

// ── §PARCEL-SELECT (L-380 P1) — real-cadastral-parcel highlight ────────────────
// In "Select parcel" mode a map click fetches the REAL parcel under the cursor and
// paints it in PRYZM violet (#6600FF) — an 8% fill + a solid violet outline —
// distinct from the DRAW tool's dashed-green boundary. Its own geojson source so it
// survives a basemap swap (re-added in installRingLayers).
const PARCEL_SELECT_SOURCE = 'pryzm-parcel-select';
const PARCEL_SELECT_FILL_LAYER = 'pryzm-parcel-select-fill';
const PARCEL_SELECT_LINE_LAYER = 'pryzm-parcel-select-line';
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
    /**
     * §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — OVERLAY-ONLY mode: the map is opened purely
     * to place + calibrate a site-plan overlay (the PDF/image import use case), NOT to trace a
     * parcel. When true the boundary DRAW tool is DISARMED (map clicks add no vertices / never
     * commit a boundary) and the draw-mode strip + instruction chip are hidden — the site-plan
     * overlay panel + its 2-point calibration are the only interactions. This is how the
     * founder's "just place the image + go straight to the canvas" path avoids the boundary /
     * generate coupling entirely. The other branches (draw-plot) are unaffected (default false).
     */
    readonly overlayOnly?: boolean;
    /**
     * §PARCEL-SELECT (L-380 P1) — the parcel data source for the "Select parcel"
     * map mode. Defaults to `defaultParcelProvider` (Barcelona / Catastro). Injectable
     * so tests / future jurisdictions (ÖREB, Plandata) swap the source without
     * touching this component. The "Select parcel" mode is OPT-IN this phase; DRAW
     * stays the default mode (the default-mode question is a founder decision).
     */
    readonly parcelProvider?: ParcelProvider;
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
/**
 * §VIEW-PANEL-PER-PANE (founder 2026-09-06) — the map's handle, NAMED so the basemap
 * swap can leave this file without being re-implemented.
 *
 * ⭐ `setBasemap` is NOT a new capability. It is `swapBasemap`, the A.8.c.f.4 function the
 * corner `Map | Satellite` chip has driven since 2026-06-03, exposed on the handle. The
 * founder's *"the 2d map satellite and non-satellite option is MASKED FOR ANOTHER PANEL"*
 * is a REACHABILITY complaint, not a missing feature: the capability existed and only the
 * chip inside the map could reach it. The corner chip is UNCHANGED and still works — a
 * route is added here, never removed (C19 §5.6 clause 4).
 */
export interface SiteBoundaryMap2DHandle {
    readonly element: HTMLElement;
    dispose(): void;
    rearm(): void;
    /** Swap the MapLibre style (cream vector ⇄ ESRI satellite raster). Idempotent. */
    setBasemap(next: 'map' | 'satellite'): void;
    /** Which basemap is live right now — a READING off this map, not a remembered command. */
    getBasemap(): 'map' | 'satellite';
}

export function mountSiteBoundaryMap2D(
    opts: SiteBoundaryMap2DOptions,
): SiteBoundaryMap2DHandle {
    const { parent, runtime, getOrigin, onClose, onCommit } = opts;
    // §PARCEL-SELECT (L-380 P1 / L-384) — the parcel data source for the "Select parcel"
    // mode. NULL = data not wired for this deployment → the select UI is fully built but
    // renders an honest "connecting to cadastral data" placeholder card (draw still works).
    const parcelProvider: ParcelProvider | null = opts.parcelProvider ?? null;

    // ── Overlay shell ─────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'pryzm-gis-map2d';
    Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        // §DRAW-MAP-ABOVE-CESIUM (2026-06-03): 20 → 40 so the draw surface is
        // unambiguously above the Cesium globe canvas during the draw step.
        zIndex: '40',
        // §MAP2D-PASTEL (L-12938) — the v2 warm-paper land, so the chrome behind and
        // during load matches the pastel basemap rather than v1's cooler off-white.
        background: FORMA_PALETTE_V2.land,
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
    // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — no boundary to trace in overlay-only mode,
    // so the "click two corners" instruction would be misleading. Hide it.
    if (opts.overlayOnly) chip.style.display = 'none';
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
    // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — in overlay-only import
    // mode the map's own ✕ is redundant chrome (and closing via it would orphan the onboarding
    // wizard banner). The onboarding "← Back" is the single cancel path; hide the map ✕.
    if (opts.overlayOnly) closeBtn.style.display = 'none';
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

    // ── §PARCEL-SELECT (L-380 P1) — "Select parcel / Draw boundary" mode toggle ──
    // Top-left segmented control (brand white + #6600FF). DRAW is the DEFAULT mode
    // (the select mode is OPT-IN this phase — the default-mode question is a founder
    // decision, not silently changed here). In SELECT mode a map click fetches the
    // REAL cadastral parcel; in DRAW mode the existing Rectangle/Linear/… tools run.
    const interToggle = document.createElement('div');
    interToggle.className = 'pryzm-gis-interaction-toggle';
    Object.assign(interToggle.style, {
        position: 'absolute',
        // §FIX-PARCEL-TOGGLE-BOTTOM-RIGHT (2026-08-05, founder request) — moved off the top-left
        // corner (previously top:64px/left:64px, itself a fix for an EARLIER clip-behind-the-logo
        // bug, §FIX-PARCEL-TOGGLE-CLIP/L-384 — the top-left placement is preserved in git history,
        // not lost) down to bottom-right, decluttering the map's top edge. Kept clear of the
        // manual-admin-zone panel (`ManualAdminZonePanel.ts`, `right:16px; bottom:16px`, ~260px
        // wide) by sitting well above it rather than beside/under it — this toggle is short
        // (~140px wide, one row tall), so stacking vertically avoids ever needing to reason about
        // two floating elements' horizontal widths colliding.
        bottom: '340px',
        right: '16px',
        zIndex: '22',
        display: 'flex',
        gap: '0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${VIOLET}`,
        background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)',
        font: '12px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    function makeInterBtn(label: string, mode: 'select' | 'draw'): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.dataset['inter'] = mode;
        b.setAttribute('data-testid', `parcel-${mode}-mode-btn`);
        b.setAttribute('aria-label', `${label} mode`);
        Object.assign(b.style, {
            border: 'none',
            padding: '7px 12px',
            cursor: 'pointer',
            background: 'transparent',
            color: '#2a2438',
            font: 'inherit',
            fontWeight: '600',
        } satisfies Partial<CSSStyleDeclaration>);
        b.addEventListener('click', () => setInteractionMode(mode));
        return b;
    }
    const selectModeBtn = makeInterBtn('Select parcel', 'select');
    const drawModeBtn = makeInterBtn('Draw boundary', 'draw');
    interToggle.appendChild(selectModeBtn);
    interToggle.appendChild(drawModeBtn);
    // Not applicable in overlay-only mode (no boundary/parcel there).
    if (opts.overlayOnly) interToggle.style.display = 'none';
    overlay.appendChild(interToggle);

    // ── §PARCEL-SELECT — the parcel info card (ref / address / area + actions) ────
    // Hidden until a parcel is selected. Brand white + #6600FF. Shows the factual
    // cadastral data (L-373: factual PARCEL geometry — no estimated-data badge needed
    // yet; the zoning/envelope estimate arrives in P2/P3) + a source attribution, and
    // commits the ring through the EXISTING draw→commit path via "Use this parcel".
    //
    // §L-1581 — this element is now a HOST, not the card. It carries only the overlay
    // GEOMETRY (where the floating card sits on the map); every fact row, every honesty
    // label and every string inside it is produced by `buildParcelCard`, which the GIS rail
    // panel mounts as well. The `data-testid` moved onto the produced card so both surfaces
    // are addressed by the same selector.
    const parcelCard = document.createElement('div');
    parcelCard.className = 'pryzm-gis-parcel-card pryzm-gis-parcel-host';
    parcelCard.style.display = 'none';
    overlay.appendChild(parcelCard);

    // ── §L-384 — undo / redo vertex affordance (bottom-left pill) ────────────────
    // Ctrl+Z / Ctrl+Y also drive these (keyListener). Shown only for the vertex-by-
    // vertex polygon modes (rectangle/circle/ellipse commit in two clicks). Disabled
    // states mirror availability so the affordance is never a dead button.
    const editBar = document.createElement('div');
    editBar.className = 'pryzm-gis-undo-redo';
    Object.assign(editBar.style, {
        position: 'absolute', bottom: '18px', left: '12px', zIndex: '22',
        display: 'none', gap: '0', borderRadius: '8px', overflow: 'hidden',
        border: `1px solid ${VIOLET}`, background: 'rgba(255,255,255,0.92)',
        boxShadow: '0 2px 10px rgba(60,52,40,0.18)', font: '14px/1 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    function makeEditBtn(glyph: string, label: string, testid: string): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = glyph; b.title = label;
        b.setAttribute('aria-label', label); b.setAttribute('data-testid', testid);
        Object.assign(b.style, {
            border: 'none', padding: '7px 12px', cursor: 'pointer', background: 'transparent',
            color: VIOLET, font: 'inherit', fontWeight: '700',
        } satisfies Partial<CSSStyleDeclaration>);
        return b;
    }
    const undoBtn = makeEditBtn('↶', 'Undo last corner (Ctrl+Z)', 'boundary-undo-btn');
    const redoBtn = makeEditBtn('↷', 'Redo corner (Ctrl+Y)', 'boundary-redo-btn');
    undoBtn.addEventListener('click', () => undoVertex());
    redoBtn.addEventListener('click', () => redoVertex());
    editBar.appendChild(undoBtn);
    editBar.appendChild(redoBtn);
    if (opts.overlayOnly) editBar.style.display = 'none';
    overlay.appendChild(editBar);

    // ── §L-384 — "Redraw boundary" (shown after a committed boundary) ────────────
    // The C19 §1.4 boundary is an immutable one-shot; this triggers the CLEAR-then-
    // recreate path (dispatchClearParcelBoundary → re-arm the draw), NOT a mutation.
    const redrawBtn = document.createElement('button');
    redrawBtn.type = 'button';
    redrawBtn.textContent = '↺ Redraw boundary';
    redrawBtn.setAttribute('data-testid', 'boundary-redraw-btn');
    Object.assign(redrawBtn.style, {
        position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '23', display: 'none', padding: '8px 16px', borderRadius: '20px',
        border: `1px solid ${VIOLET}`, background: VIOLET, color: '#ffffff', cursor: 'pointer',
        font: '600 13px/1 system-ui, sans-serif', boxShadow: '0 2px 10px rgba(60,52,40,0.22)',
    } satisfies Partial<CSSStyleDeclaration>);
    redrawBtn.addEventListener('click', () => rearmDraw());
    if (opts.overlayOnly) redrawBtn.style.display = 'none';
    overlay.appendChild(redrawBtn);

    // ── §SITE-PLAN-OVERLAY — "Overlay plan/PDF" entry ────────────────────────────
    // §FIX-DUPLICATE-OVERLAY-ENTRY (2026-08-05, founder request) — this used to be a SEPARATE
    // floating top-left button duplicating the "Upload plan / PDF" action the Site plan overlay
    // panel itself already shows (`SitePlanOverlayController.ts renderPanel()`'s `locating` state,
    // top-right card) — two buttons for one action, cluttering the top-left corner. Removed the
    // standalone button entirely; the panel (already visible/mounted) is now the single entry
    // point. `overlayController` itself is untouched — still declared/used below for the
    // boundary-commit re-entry path (`enterCanvasWithSitePlan.ts`), unaffected by this UI-only
    // removal.

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
    // ⚠ §FIX-SHAPE-VOCABULARY (L-1322) — RENAMED from `SiteBoundaryGesture`, which is
    // the EXPORTED name of a DIFFERENT type in `@pryzm/geometry-slab` carrying
    // DIFFERENT members (`linear | ortho | curved` — note `ortho`, not `orthogonal`).
    // Two types, one name, one concept, no relation: a reader who greps the name found
    // two answers and no way to tell which governed. C84 EI-8 names *shape* explicitly.
    //
    // ⚠ This is the SITE-BOUNDARY tool's own gesture list and is deliberately NOT
    // unified with the element vocabulary: it draws a PARCEL on a map in lat/lon, not a
    // plate boundary in model space, and its `circle`/`ellipse` are map-projected. The
    // fix here is the NAME, not a merge — merging two things because they share three
    // words is how the five spellings happened.
    type SiteBoundaryGesture = 'rectangle' | 'linear' | 'orthogonal' | 'curved' | 'circle' | 'ellipse';
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

    const MODE_DEFS: ReadonlyArray<{ key: string; label: string; mode: SiteBoundaryGesture }> = [
        { key: 'R', label: 'Rectangle',  mode: 'rectangle'  },
        { key: 'L', label: 'Linear',     mode: 'linear'     },
        { key: 'O', label: 'Orthogonal', mode: 'orthogonal' },
        { key: 'C', label: 'Curved',     mode: 'curved'     },
        // §CIRCLE-BOUNDARY — key 'I' (C is taken by Curved); two-point circle.
        { key: 'I', label: 'Circle',     mode: 'circle'     },
        // §ELLIPSE-BOUNDARY — key 'E'; two-point centre + bounding-box corner.
        { key: 'E', label: 'Ellipse',    mode: 'ellipse'    },
    ];
    const modeBtns = new Map<SiteBoundaryGesture, HTMLButtonElement>();
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
    // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — the Rectangle/Linear/Ortho/Curved draw
    // strip has no purpose in overlay-only mode (drawing is disarmed). Hide it.
    if (opts.overlayOnly) modeBar.style.display = 'none';
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
    let uiMode: SiteBoundaryGesture = 'rectangle';
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
    // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — true only for the duration of THIS map's own
    // `commit()`. `dispatchParcelBoundary` emits `site.parcel-boundary-set` synchronously, so
    // without this re-entrancy guard our own commit would trip the external-boundary listener
    // and log a "committed WITHOUT going through this map" warning about ourselves.
    let committingLocally = false;
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

    // §PARCEL-SELECT (L-380 P1) — interaction mode. In 'select', map clicks fetch the real
    // cadastral parcel instead of adding draw vertices.
    //
    // §UX-PARCEL-SELECT-DEFAULT (founder 2026-08-06: "select PARCEL SELECTION by default instead
    // of DRAW — although the user could select DRAW later if wanted") — SELECT IS NOW THE DEFAULT.
    // It was `'draw'` because select was opt-in while the cadastral providers were being built;
    // that phase is over (`parcelProvider: defaultParcelProvider` is wired at the mount site, and
    // `showParcelCard` renders REAL parcels for every connected region). Selecting a legal parcel
    // is also the better default on the merits: it yields a surveyed boundary instead of a
    // hand-traced approximation, which is what every downstream envelope/edificabilitat
    // computation is actually entitled to reason about.
    //
    // ⚠ THE USER IS NEVER TRAPPED BY THIS, which is the only reason it is safe to default to a
    // path that depends on third-party coverage. Where no provider answers, `showStubParcelCard`
    // states plainly that cadastral data is not connected, disables "Use this parcel", and offers
    // "Draw instead" (§L-384) — and the mode toggle itself is always present. That honest-degrade
    // path already existed; this change only decides which mode is armed first.
    //
    // ⚠ EXCEPT for `overlayOnly` (the PDF / site-plan import flow), where there is no parcel to
    // pick and the draw tool is the entire point of the surface.
    let interactionMode: 'draw' | 'select' = opts.overlayOnly ? 'draw' : 'select';
    // The currently highlighted parcel (null = none selected). Committed via "Use this parcel".
    let selectedParcel: ParcelFeature | null = null;
    /**
     * §L-12912 (PT-BELVERDE-LOTS) — the OVERSIZE cadastral answer displaced from `selectedParcel`
     * by a footprint candidate (Belverde: the 766 ha prédio, while the house outline is what the
     * card leads with). Kept so "Use the 766 ha holding anyway" can still commit it through the
     * one commit path. Cleared wherever `selectedParcel` is — a later click or a drawn boundary
     * can never inherit a previous click's holding.
     */
    let oversizeHolding: ParcelFeature | null = null;
    /**
     * §L-1580 (C57 §1.4) — the provenance of the parcel being committed, captured at the
     * moment "Use this parcel" is pressed.
     *
     * WHY A SEPARATE VARIABLE. `useSelectedParcel()` clears `selectedParcel` BEFORE it calls
     * `commit()` (it drops the violet highlight so the committed ring renders through the
     * normal green path). By the time `commit()` reaches `dispatchParcelBoundary` the feature
     * is already gone — so reading it there would silently record NOTHING on exactly the path
     * that has provenance to record. It is cleared again after the commit so a later DRAWN
     * boundary can never inherit a previous selection's attribution.
     */
    let pendingParcelProvenance: ParcelProvenance | null = null;
    // Guards against overlapping fetches while one click's parcel is still loading.
    let parcelFetchInFlight = false;

    // §L-384 — vertex redo stack (polygon draw): vertices removed by undo, restored by
    // redo. Any NEW vertex placement clears it (standard undo/redo semantics).
    const redoStack: LatLon[] = [];

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

    // §MAP2D-PASTEL (L-12938) — the pastel context push (roads / water / parks / landuse /
    // rail / trees). Its own abort + debounce + key, deliberately NOT shared with the
    // buildings fetch above: one cancelling the other would silently blank whole layers.
    let pastelAbort: AbortController | null = null;
    let pastelDebounce: ReturnType<typeof setTimeout> | null = null;
    let pastelLastKey = '';

    function toast(message: string, severity: 'info' | 'success' | 'error'): void {
        runtime?.events?.emit('pryzm:toast', { message, severity });
    }

    // ── Map ───────────────────────────────────────────────────────────────────
    // FORMA.1 — DEFAULT to the Autodesk-Forma minimal-vector basemap (off-white
    // land, light-grey roads, pale blue-grey water, abstract building fills). The
    // satellite raster style stays available via the corner toggle.
    const style = buildFormaMap2DStyleV2({
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
        // §PARCEL-SELECT (L-380 P1) — the selected real-parcel highlight (violet fill
        // + solid violet outline). Empty until a parcel is selected; re-added here so
        // it survives a basemap swap, then repainted from `selectedParcel`.
        map.addSource(PARCEL_SELECT_SOURCE, { type: 'geojson', data: emptyFC() });
        map.addLayer({
            id: PARCEL_SELECT_FILL_LAYER,
            type: 'fill',
            source: PARCEL_SELECT_SOURCE,
            paint: { 'fill-color': VIOLET, 'fill-opacity': 0.10 },
        });
        map.addLayer({
            id: PARCEL_SELECT_LINE_LAYER,
            type: 'line',
            source: PARCEL_SELECT_SOURCE,
            paint: { 'line-color': VIOLET, 'line-width': 2.5 },
        });
        refreshParcelHighlight();
    }

    /** An empty FeatureCollection (the snap indicator's resting state). */
    function emptyFC(): GeoJSON.FeatureCollection {
        return { type: 'FeatureCollection', features: [] };
    }

    // ── §PARCEL-SELECT (L-380 P1) — real-parcel selection ──────────────────────

    /** Push the selected parcel's ring (or nothing) into the violet highlight source. */
    function refreshParcelHighlight(): void {
        const src = map.getSource(PARCEL_SELECT_SOURCE) as GeoJSONSource | undefined;
        if (!src) return;
        if (!selectedParcel || selectedParcel.ring.length < 3) { src.setData(emptyFC()); return; }
        const coords = selectedParcel.ring.map((p) => [p.lon, p.lat] as [number, number]);
        src.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                properties: {},
            }],
        });
    }

    /** Hide + empty the parcel info card. */
    function hideParcelCard(): void {
        parcelCard.style.display = 'none';
        parcelCard.replaceChildren();
    }

    /**
     * §L-1581 — render the parcel info card by MOUNTING the one producer.
     *
     * This function used to build ~90 lines of DOM inline. Everything it decided — which
     * rows exist, whether a footprint gets a warning, which area basis is shown, how the
     * source is attributed — now lives in `parcelCard.ts`, which the GIS rail panel also
     * mounts. The map contributes only its two ACTIONS, because those are genuinely
     * map-specific (they drive this modal's commit and its draw mode); the FACTS are not.
     */
    function showParcelCard(parcel: ParcelFeature, footprint: ParcelFeature | null = null): ParcelCandidateChoice {
        parcelCard.replaceChildren();
        // §L-12912 — the label is the cadastre that ACTUALLY answered (resolved from the parcel's
        // own `source`), not this host's generic registry label "Cadastral parcel / building
        // footprint" — which is what the Belverde card printed. Same resolver as the commit.
        const labelOf = (f: ParcelFeature): string | null =>
            resolveParcelAttribution(f, parcelProvider?.label ?? null).label;
        const cadastralModel = parcelFeatureToCardModel(parcel, labelOf(parcel));
        // §L-12912 — a fetched ring above the review ceiling (a 766 ha prédio under a house) is a
        // CANDIDATE, not "your parcel". Lane PT-BELVERDE-LOTS: when an OSM footprint exists under
        // the click, THAT is the primary candidate (titled as a house outline, never as a parcel —
        // C57 §1.5 / §1.9); otherwise Draw is primary. Either way the holding stays one deliberate
        // click away with both numbers in view (C83 §1.2) — it is never disabled and never hidden.
        const size = assessParcelSize(cadastralModel);
        const choice = chooseParcelCandidate({ cadastral: parcel, size, footprint });
        selectedParcel = choice.shown;
        oversizeHolding = choice.holding;
        try { refreshParcelHighlight(); } catch { /* style may be swapping */ }

        const shownModel = choice.shown === parcel ? cadastralModel : parcelFeatureToCardModel(choice.shown, labelOf(choice.shown));
        const draw = {
            label: choice.primary === 'cadastral' ? 'Draw instead' : 'Draw my lot instead  →',
            testId: 'parcel-draw-btn',
            variant: choice.primary === 'draw' ? 'primary' as const : 'secondary' as const,
            onClick: () => setInteractionMode('draw'),
        };
        const holdingHa = size.areaM2 !== null ? Math.round(size.areaM2 / 10_000) : null;
        const holdingTitle = holdingHa !== null
            ? `Commits the whole ${holdingHa} ha parcel as your site. `
              + 'If you clicked a house, its lot is not in the published cadastre — draw it instead.'
            : undefined;

        if (choice.primary === 'footprint') {
            // The house outline leads; the holding is a NAMED secondary commit through the same path.
            const useFootprint = {
                label: 'Use my house outline  →',
                testId: 'parcel-use-btn',
                variant: 'primary' as const,
                title: 'Commits the OSM building outline as a STARTING boundary. It is the building, '
                    + 'not the land: adjust it or draw your lot for the legal line.',
                onClick: () => useSelectedParcel(),
            };
            const useHolding = {
                label: choice.useHoldingLabel ?? 'Use the holding anyway',
                testId: PARCEL_USE_HOLDING_TESTID,
                variant: 'secondary' as const,
                title: holdingTitle,
                onClick: () => {
                    if (!oversizeHolding) return;
                    selectedParcel = oversizeHolding;
                    useSelectedParcel();
                },
            };
            const holdingBanner = parcelSizeReviewText(size, cadastralModel);
            parcelCard.appendChild(buildParcelCard(shownModel, {
                title: choice.cardTitle ?? undefined,
                leadNotes: [
                    ...(choice.why ? [{ text: choice.why, testId: PARCEL_CANDIDATE_WHY_TESTID }] : []),
                    // Keep the displaced holding's own size-review banner in view: the footprint on
                    // the card is `within`, and the warning must not vanish with the ring it judged.
                    ...(holdingBanner ? [{ text: holdingBanner, testId: PARCEL_SIZE_REVIEW_TESTID }] : []),
                ],
                actions: [useFootprint, useHolding, draw],
            }));
        } else {
            const use = {
                label: choice.primary === 'draw'
                    ? (choice.useHoldingLabel ?? 'Use this large parcel anyway')
                    : 'Use this parcel  →',
                testId: 'parcel-use-btn',
                variant: choice.primary === 'draw' ? 'secondary' as const : 'primary' as const,
                title: choice.primary === 'draw' ? holdingTitle : undefined,
                onClick: () => useSelectedParcel(),
            };
            parcelCard.appendChild(buildParcelCard(shownModel, {
                leadNotes: choice.why ? [{ text: choice.why, testId: PARCEL_CANDIDATE_WHY_TESTID, tone: 'note' }] : [],
                actions: choice.primary === 'draw' ? [draw, use] : [use, draw],
            }));
        }
        parcelCard.style.display = 'block';
        return choice;
    }

    /**
     * §L-384 — the honest "cadastral data not wired yet" card, shown when this map was
     * constructed with NO parcel provider at all.
     *
     * §L-1581 REWROTE THIS. It used to render SAMPLE VALUES — a placeholder referencia, a
     * placeholder half-a-thousand-square-metre area and a placeholder zone — behind a
     * "connecting to cadastral data" banner. That is a fabricated fact wearing a warning
     * label, and it is the shape C84 EI-1b forbids: a reader who skims past the banner
     * reads the placeholder area as this plot's area. (The literal strings are deliberately
     * NOT quoted here — a source-scanning test asserts they are gone from this file.)
     * The honest card for "we have no provider" is a STATED ABSENCE with no numbers in it
     * at all, and the escape hatch ("Draw instead") intact so the user is never trapped.
     */
    function showStubParcelCard(): void {
        parcelCard.replaceChildren();
        parcelCard.appendChild(buildParcelCard(null, {
            absentText:
                'No cadastral data source is connected for this location, so nothing about this '
                + 'plot has been looked up. No reference, address or area is shown because none '
                + 'is known — not because they are zero. Draw the boundary instead; you can '
                + 'select a real parcel wherever a cadastre is reachable.',
            actions: [
                {
                    label: 'Use this parcel  →',
                    testId: 'parcel-use-btn',
                    variant: 'primary',
                    disabled: true,
                    title: 'Nothing has been looked up here — there is no parcel to commit. Draw instead.',
                    onClick: () => { /* disabled — see title */ },
                },
                {
                    label: 'Draw instead',
                    variant: 'secondary',
                    onClick: () => setInteractionMode('draw'),
                },
            ],
        }));
        parcelCard.style.display = 'block';
        chip.textContent = 'No cadastral source is connected here — draw the boundary instead · Esc to cancel';
    }

    /** Highlight the active interaction-mode segment (violet). */
    function paintInteractionToggle(): void {
        for (const b of [selectModeBtn, drawModeBtn]) {
            const active = b.dataset['inter'] === interactionMode;
            b.style.background = active ? VIOLET : 'transparent';
            b.style.color = active ? '#ffffff' : '#2a2438';
            b.setAttribute('aria-pressed', String(active));
        }
    }

    /**
     * Switch between DRAW and SELECT interaction modes. DRAW restores the draw-mode
     * strip + instruction; SELECT hides them, clears any in-progress draw, and arms
     * the parcel picker. Clears the parcel highlight/card when leaving SELECT.
     */
    function setInteractionMode(next: 'draw' | 'select'): void {
        if (disposed || committed || next === interactionMode) return;
        interactionMode = next;
        // Clear any in-progress draw so the two modes never bleed.
        rectCornerA = null; circleCentre = null; ellipseCentre = null;
        vertices.length = 0; snapTarget = null; cursorLL = null;
        try { refreshRing(); } catch { /* style may be swapping */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        try { refreshRadiusLabel(); } catch { /* ignore */ }

        if (next === 'select') {
            modeBar.style.display = 'none';
            chip.textContent = 'Click a plot to select its real cadastral parcel · Esc to cancel';
        } else {
            // Back to DRAW — drop the parcel highlight + card (+ any displaced holding, §L-12912).
            selectedParcel = null;
            oversizeHolding = null;
            try { refreshParcelHighlight(); } catch { /* ignore */ }
            hideParcelCard();
            if (!opts.overlayOnly) modeBar.style.display = '';
            refreshModeChrome();
        }
        paintInteractionToggle();
        refreshEditBar();
        try { map.getCanvas().style.cursor = next === 'select' ? 'crosshair' : ''; } catch { /* ignore */ }
        console.log(`[gis] map2d: interaction mode → ${next}`);
    }

    /**
     * §PARCEL-SELECT — on a click in SELECT mode, fetch the real parcel under the
     * cursor via the provider (same-origin proxy) and render its violet highlight +
     * info card. A miss shows a clean "no parcel here" toast and does NOT break the
     * draw path. Guarded against overlapping fetches + teardown.
     */
    function handleParcelSelectClick(e: MapMouseEvent): void {
        if (disposed || committed || parcelFetchInFlight) return;
        const { lng, lat } = e.lngLat;
        // §L-384 — DATA NOT WIRED for this deployment: render the honest placeholder card
        // (the full select UI is present + demoable; the real fetch lands with the parcel
        // provider, L-380 P0/P1). Never a silent no-op — the user sees exactly what's pending.
        if (!parcelProvider) { showStubParcelCard(); return; }
        parcelFetchInFlight = true;
        chip.textContent = 'Fetching parcel…';
        try { map.getCanvas().style.cursor = 'progress'; } catch { /* ignore */ }
        void parcelProvider.fetchParcelAtPoint(lng, lat).then((parcel) => {
            // §L-12912 — the in-flight guard is released in the FINAL `.then` below, after the
            // optional footprint lookup, so a second click cannot race a half-rendered card.
            if (disposed || committed || interactionMode !== 'select') { parcelFetchInFlight = false; return; }
            try { map.getCanvas().style.cursor = 'crosshair'; } catch { /* ignore */ }
            if (!parcel) {
                parcelFetchInFlight = false;
                selectedParcel = null;
                oversizeHolding = null;
                refreshParcelHighlight();
                hideParcelCard();
                chip.textContent = 'Click a plot to select its real cadastral parcel · Esc to cancel';
                toast('No parcel found here — try again or draw manually.', 'info');
                return;
            }
            // §L-12912 (PT-BELVERDE-LOTS) — an OVERSIZE cadastral answer earns one more lookup: the
            // OSM footprint under the same click, so the card can lead with the house outline
            // instead of a village-sized holding. `within` answers render immediately as before;
            // the footprint provider never throws and a null is the honest "nothing smaller here".
            const preview = assessParcelSize(parcelFeatureToCardModel(parcel));
            const footprintP: Promise<ParcelFeature | null> = preview.status === 'oversize'
                ? footprintParcelProvider.fetchParcelAtPoint(lng, lat).catch((err: unknown) => {
                    console.warn('[gis] §L-12912 footprint lookup for an oversize holding failed (non-fatal):', err);
                    return null;
                })
                : Promise.resolve(null);
            if (preview.status === 'oversize') chip.textContent = 'Large holding — looking for the building outline under your click…';
            return footprintP.then((footprint) => {
                parcelFetchInFlight = false;
                if (disposed || committed || interactionMode !== 'select') return;
                const choice = showParcelCard(parcel, footprint);
                chip.textContent = choice.chip;
                console.log(
                    `[gis] §L-12912 parcel candidate: primary=${choice.primary}` +
                    (choice.holding ? ` holding=${choice.holding.refcat} (${Math.round(choice.holding.areaM2)} m²)` : '') +
                    (choice.primary === 'footprint' ? ` footprint=${choice.shown.refcat}` : ''),
                );
            });
        }).catch((err) => {
            parcelFetchInFlight = false;
            console.warn('[gis] parcel fetch failed (non-fatal):', err);
            if (!disposed) toast('Parcel lookup failed — try again or draw manually.', 'error');
        });
    }

    /**
     * §PARCEL-SELECT — commit the selected parcel as the site boundary through the
     * EXACT path a DRAWN boundary uses: load the ring into `vertices` and call
     * `commit()` (buildBoundaryFromLatLonRing → dispatchSiteLocation? → dispatchParcelBoundary
     * → site.parcel-boundary-set). No one-off path — generation consumes it unchanged.
     */
    function useSelectedParcel(): void {
        if (disposed || committed || !selectedParcel) return;
        const ring = selectedParcel.ring;
        if (ring.length < 3) { toast('Selected parcel has no usable boundary.', 'error'); return; }
        // §STARTUP-SELECT-IS-NOT-DWELL (L-12931) — THE GESTURE. Everything before this line is the
        // user dwelling on the 2D map; `parcel:selected → parcel:committed → envelope:dispatched`
        // is the machine leg the founder times as "selection on 2d to render on 3d". The full
        // reading (why `parcel:committed +159845ms` is NOT 160 s of work) is in `startupBudget.ts`.
        markStartupPhase('parcel:selected'); // §STARTUP-BUDGET
        // §L-1580 — capture the attribution BEFORE `selectedParcel` is dropped two lines below.
        //
        // The per-jurisdiction row is resolved at the parcel's OWN first vertex and its OWN
        // `source`, not at the map centre: a click near a national border routes by point, and
        // attributing the parcel to the country the viewport happens to be centred on would be a
        // wrong attribution that still looks well-formed. §L-12912: the SAME resolver the card
        // used before the commit (`resolveParcelAttribution`), so what was shown and what is
        // stored cannot differ; a footprint fallback never inherits a cadastre's label.
        const attribution = resolveParcelAttribution(selectedParcel, parcelProvider?.label ?? null);
        pendingParcelProvenance = parcelFeatureToProvenance(selectedParcel, {
            providerLabel: attribution.label,
            jurisdictionId: attribution.regionCode,
        });
        vertices.length = 0;
        for (const p of ring) vertices.push({ lat: p.lat, lon: p.lon });
        // Drop the violet parcel highlight — the committed boundary now renders through
        // the normal green ring path, identical to a drawn boundary.
        selectedParcel = null;
        oversizeHolding = null; // §L-12912 — a later draw never inherits this click's holding
        try { refreshParcelHighlight(); } catch { /* ignore */ }
        hideParcelCard();
        refreshRing();
        commit();
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
                    // §OFFICIAL-FOOTPRINTS (L-12939) — drop the register's PARTS from the PLAN
                    // only. Filtered here rather than with a maplibre layer `filter` because
                    // `official` is a nested object on the feature, so a style expression reaching
                    // into it would be a second, silently-divergent copy of the same rule.
                    const planFeatures = collection.features.filter((f) => shouldDrawInPlan(f.properties.official));
                    const official = summariseOfficialFootprints(
                        collection.features.map((f) => ({ official: f.properties.official })),
                    );
                    live.setData({ type: 'FeatureCollection', features: planFeatures } as unknown as GeoJSON.FeatureCollection);
                    // Counts SEPARATED BY SOURCE (C57 §1.9) — a single total cannot tell "the
                    // register landed" from "we are still drawing OSM", which is exactly the
                    // question being asked when a 2020 house is missing from the map.
                    console.log(`[gis] map2d: context buildings → ${planFeatures.length} footprint(s) drawn`
                        + (official.parts > 0 || official.buildings > 0 ? ` · ${official.line}` : ''));
                }
            });
        };
        if (immediate) { run(); return; }
        if (ctxDebounce) clearTimeout(ctxDebounce);
        ctxDebounce = setTimeout(run, 350);
    }

    // ── §MAP2D-PASTEL (L-12938) — fill the pastel style's baked-context sources. ──
    // STR-2D-SITE-MAP-CARTOGRAPHY §4 Stage M1. The style declares seven EMPTY GeoJSON
    // sources; this fills them from the same memoised readers the 3D Site uses. Debounced
    // and centre-keyed exactly like `loadContextBuildings`, and a no-op on the satellite
    // raster style (which declares none of these sources).
    //
    // ⛔ PRESENTATION ONLY. It adds no map handler, mutates no `vertices`, and touches
    // neither the parcel click path nor the boundary-draw/commit path. A failure leaves
    // every source at its empty resting state and the OpenFreeMap base layers alone carry
    // the map — the picture degrades to today's, never to a hole.
    function loadPastelContext(immediate = false): void {
        if (disposed) return;
        const run = (): void => {
            if (disposed) return;
            if (!map.getSource(PASTEL_SOURCES.roads)) return; // satellite style — skip.
            const c = map.getCenter();
            // Same ~0.005° centre key as the buildings fetch: same area ⇒ no re-push.
            const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
            if (key === pastelLastKey) return;
            pastelLastKey = key;
            pastelAbort?.abort();
            pastelAbort = new AbortController();
            const signal = pastelAbort.signal;
            void loadPastelContextGeoJson(c.lat, c.lng, signal)
                .then((push) => {
                    if (disposed || signal.aborted) return;
                    let pushed = 0;
                    for (const [sourceId, fc] of Object.entries(push.bySource)) {
                        const src = map.getSource(sourceId) as GeoJSONSource | undefined;
                        if (!src) continue;
                        src.setData(fc);
                        pushed++;
                    }
                    // C57 §1.5 — the summary separates MAPPED trees from SYNTHESISED canopies
                    // and names a failed read as a failure, never as an empty neighbourhood.
                    console.log(
                        `[gis] map2d §MAP2D-PASTEL: ${pushed}/7 baked context source(s) pushed — ${push.summary}`,
                    );
                })
                .catch((e) => {
                    console.warn(
                        '[gis] map2d §MAP2D-PASTEL: context push FAILED (non-fatal) — the sources stay ' +
                            'empty because the read failed, not because the area is empty:',
                        e,
                    );
                });
        };
        if (immediate) { run(); return; }
        if (pastelDebounce) clearTimeout(pastelDebounce);
        pastelDebounce = setTimeout(run, 350);
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
        // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — OVERLAY-ONLY mode: the boundary draw
        // tool is disarmed. Map clicks never add a vertex / commit a boundary; only the
        // site-plan overlay panel + its 2-point calibration (which listens on its OWN map
        // handler) respond. This is the founder's "place the plan → straight to canvas,
        // no boundary, no generate" path.
        if (opts.overlayOnly) return;
        // §FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE (L-69) — while the site-plan overlay is
        // capturing its two 2-point-calibration clicks, the DRAW tool must YIELD: otherwise
        // this handler consumed the two clicks as parcel vertices (rectangle/circle mode
        // even COMMITTED a boundary → forced the generate flow), so the calibration never
        // captured its points. The overlay's own map-click listener still fires and records
        // the points; we simply don't add vertices / commit here for the duration.
        if (overlayController?.isCalibrating?.()) return;
        // §PARCEL-SELECT (L-380 P1) — in SELECT mode a click fetches the real parcel
        // instead of adding a draw vertex. The draw tools below never run in this mode.
        if (interactionMode === 'select') { handleParcelSelectClick(e); return; }
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
        // §L-384 — a new vertex invalidates the redo stack; refresh the undo/redo pill.
        redoStack.length = 0;
        refreshEditBar();
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
        if (disposed) return;
        // Ignore shortcuts while typing in a field (e.g. the geocode box).
        const t = ev.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

        // §L-384 — after a COMMITTED boundary the map is frozen (O.7.2.b) but still
        // mounted; ESC = RE-DRAW (clear-then-recreate of the immutable C19 §1.4 boundary)
        // so a mis-drawn plot is never a dead end. All other keys are inert while frozen.
        if (committed) {
            if (ev.key === 'Escape') { ev.preventDefault(); rearmDraw(); }
            return;
        }

        // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — OVERLAY-ONLY
        // mode: the boundary draw tool is disarmed, so Enter (commit-loop), undo/redo and
        // the R/L/O/C/I/E mode-switch keys must be inert. Escape still tears the map down.
        if (opts.overlayOnly && ev.key !== 'Escape') return;

        // §L-384 — Ctrl/Cmd+Z undoes the last polygon vertex; Ctrl/Cmd+Y (or Ctrl+Shift+Z)
        // redoes it. Reuses the editor's undo/redo key convention (initUI.ts:2914+).
        if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
            const k = ev.key.toLowerCase();
            if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); undoVertex(); return; }
            if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); redoVertex(); return; }
        }

        if (ev.key === 'Enter') {
            ev.preventDefault();
            // §RECT-BOUNDARY / §CIRCLE-BOUNDARY / §ELLIPSE-BOUNDARY — Enter is a
            // polygon-only close. Rectangle + circle + ellipse commit on the second
            // click; a stray Enter must not commit the live preview shape.
            if (drawMode === 'rectangle' || drawMode === 'circle' || drawMode === 'ellipse') return;
            commit();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            // §L-384 — ESC first CLEARS an in-progress draw (stay on the map so the user
            // can restart cleanly); a second ESC with nothing drawn cancels the surface.
            if (clearInProgressDraw()) {
                toast('Draw cleared — click to start again.', 'info');
            } else {
                cancel();
            }
            return;
        }
        // §BND-MODE-STRIP — single-key mode shortcuts (R/L/O/C), mirroring the wall
        // HUD. Plain keys only (no modifier) so they don't clash with browser combos.
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
        // §PARCEL-SELECT — the draw-mode letter shortcuts don't apply in SELECT mode.
        if (interactionMode === 'select') return;
        const mode: SiteBoundaryGesture | undefined = {
            r: 'rectangle', l: 'linear', o: 'orthogonal', c: 'curved', i: 'circle', e: 'ellipse',
        }[ev.key.toLowerCase()] as SiteBoundaryGesture | undefined;
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
                : (buildFormaMap2DStyleV2({ extrude: opts.extrude ?? false }) as unknown as StyleSpecification);
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
            if (next === 'map') {
                ctxLastKey = ''; loadContextBuildings(true);
                // §MAP2D-PASTEL (L-12938) — the swap recreated empty pastel sources too.
                pastelLastKey = ''; loadPastelContext(true);
            }
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
    function setDrawMode(next: SiteBoundaryGesture): void {
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
        redoStack.length = 0;
        refreshEditBar();
        console.log(`[gis] map2d: draw mode → ${next} (geometry=${drawMode}, ortho=${orthoEnabled})`);
    }
    // Initial paint — Rectangle is the default (founder "for now"); the strip's key
    // shortcuts (R/L/O/C) are handled by the overlay key listener (keyListener).
    paintModeStrip();
    refreshModeChrome();
    // §UX-PARCEL-SELECT-DEFAULT — the initial CHROME must agree with the initial MODE. Both the
    // geometry strip and the instruction chip above were written when 'draw' was the only possible
    // opening state; with SELECT as the default they would otherwise open showing the rectangle
    // draw tool while clicks silently went to the parcel picker. `setInteractionMode` cannot do
    // this for us — it early-returns when the requested mode is already current — so the select
    // branch's chrome is applied here explicitly, in the same order it applies it.
    if (interactionMode === 'select') {
        modeBar.style.display = 'none';
        chip.textContent = 'Click a plot to select its real cadastral parcel · Esc to cancel';
        try { map.getCanvas().style.cursor = 'crosshair'; } catch { /* map style may still be loading */ }
    }
    paintInteractionToggle();

    // ── Commit / cancel ───────────────────────────────────────────────────────

    /**
     * O.7.2.b — FREEZE the draw without disposing the map. Detach every draw
     * interaction (so no further vertices/drags), drop the keyboard listener, and
     * make the overlay non-interactive for drawing (hide the instruction chip; turn
     * the × into a no-op visually — the host owns teardown now). The map + violet
     * boundary stay rendered so the "Generate with AI?" confirm step appears over a
     * live cream plan map. Idempotent.
     */
    // ── §L-384 — vertex undo/redo + ESC-clear + re-draw after commit ─────────────

    /** Show/enable the undo/redo pill for the vertex-by-vertex (polygon) draw modes. */
    function refreshEditBar(): void {
        const usable = !committed && !opts.overlayOnly && interactionMode === 'draw' && drawMode === 'polygon';
        editBar.style.display = usable ? 'flex' : 'none';
        const setEnabled = (b: HTMLButtonElement, on: boolean): void => {
            b.disabled = !on;
            b.style.opacity = on ? '1' : '0.35';
            b.style.cursor = on ? 'pointer' : 'not-allowed';
        };
        setEnabled(undoBtn, usable && vertices.length > 0);
        setEnabled(redoBtn, usable && redoStack.length > 0);
    }

    /** Undo the last placed polygon vertex (onto the redo stack). */
    function undoVertex(): void {
        if (committed || drawMode !== 'polygon' || vertices.length === 0) return;
        const v = vertices.pop()!;
        redoStack.push(v);
        snapTarget = null;
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        refreshRing();
        refreshEditBar();
        console.log(`[gis] §L-384 undo vertex → ${vertices.length} left`);
    }

    /** Redo the last undone polygon vertex. */
    function redoVertex(): void {
        if (committed || drawMode !== 'polygon' || redoStack.length === 0) return;
        vertices.push(redoStack.pop()!);
        refreshRing();
        refreshEditBar();
        console.log(`[gis] §L-384 redo vertex → ${vertices.length} placed`);
    }

    /**
     * §L-384 — ESC while drawing: clear the IN-PROGRESS draw (all placed vertices +
     * any rectangle/circle/ellipse anchor) WITHOUT tearing down the map, so the user
     * can restart cleanly. Returns true when there was something to clear.
     */
    function clearInProgressDraw(): boolean {
        const had = vertices.length > 0 || rectCornerA !== null || circleCentre !== null || ellipseCentre !== null;
        vertices.length = 0;
        rectCornerA = null; circleCentre = null; ellipseCentre = null;
        redoStack.length = 0;
        snapTarget = null; cursorLL = null;
        try { refreshRing(); } catch { /* ignore */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        try { refreshRadiusLabel(); } catch { /* ignore */ }
        refreshEditBar();
        return had;
    }

    /** Attach the map draw interaction handlers (idempotent-ish; used at load + re-arm). */
    function attachDrawHandlers(): void {
        map.on('click', onClick);
        map.on('dblclick', onDblClick);
        map.on('mousedown', VERTEX_LAYER, onMouseDownVertex);
        map.on('mousemove', onMouseMove);
        map.on('mouseup', onMouseUp);
        map.on('mouseenter', VERTEX_LAYER, () => { map.getCanvas().style.cursor = 'grab'; });
        map.on('mouseleave', VERTEX_LAYER, () => { if (draggingIdx === null) map.getCanvas().style.cursor = ''; });
    }

    /**
     * §L-384 — RE-DRAW after a committed boundary. The C19 §1.4 parcel polygon is an
     * IMMUTABLE one-shot, so this does a clean CLEAR-then-recreate: it dispatches
     * `site.replace` (via dispatchClearParcelBoundary) to empty the committed boundary,
     * then un-freezes THIS live map (O.7.2.b kept it mounted) — re-attaching the draw
     * handlers + restoring the chrome so a fresh boundary can be authored + committed.
     * NEVER mutates the immutable polygon. Idempotent-safe.
     */
    function rearmDraw(): void {
        if (disposed) return;
        // 1) Clear the committed C19 boundary through the canonical site.replace path.
        try {
            const ctx = resolveSiteContext(runtime);
            if (ctx) dispatchClearParcelBoundary(ctx);
        } catch (e) { console.warn('[gis] §L-384 rearmDraw: clear failed (non-fatal):', e); }

        // 2) Un-freeze the map + reset all draw state.
        committed = false;
        vertices.length = 0;
        rectCornerA = null; circleCentre = null; ellipseCentre = null;
        redoStack.length = 0;
        snapTarget = null; cursorLL = null;
        selectedParcel = null;

        // 3) Restore chrome.
        redrawBtn.style.display = 'none';
        chip.style.display = '';
        closeBtn.style.display = '';
        if (!opts.overlayOnly && interactionMode === 'draw') modeBar.style.display = '';
        if (!opts.overlayOnly) interToggle.style.display = '';
        try { refreshRing(); } catch { /* ignore */ }
        try { refreshSnapIndicator(); } catch { /* ignore */ }
        try { refreshParcelHighlight(); } catch { /* ignore */ }
        try { refreshDimLabels(); } catch { /* ignore */ }
        hideParcelCard();
        refreshModeChrome();
        refreshEditBar();

        // 4) Re-attach the draw interaction + key listener (freezeDraw detached them).
        if (!opts.overlayOnly) attachDrawHandlers();
        window.removeEventListener('keydown', keyListener); // avoid a double bind
        window.addEventListener('keydown', keyListener);
        console.log('[gis] §L-384 draw re-armed after clear — ready to author a new boundary.');
    }

    /**
     * §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC (ADR-0299 §Decision 4) — THE STORE IS THE TRUTH.
     *
     * `committed` is a LOCAL flag that only this map's own `commit()` used to set. Any boundary
     * authored elsewhere while this map is live — the onboarding draw watchdog, "Skip drawing",
     * `createSiteFromRect`, a collaborator's sync — left the surface ARMED and LYING: the chip
     * still read "Click two opposite corners", the select/draw toggle was still up, and the ONE
     * affordance that can recover ("↺ Redraw boundary") was still hidden. That is the founder's
     * screenshot — a surface in two states at once, with no way forward.
     *
     * This re-derives the local state from the C19 store and freezes if a boundary is committed,
     * so the surface can never advertise an interaction it cannot honour. Idempotent (freezeDraw
     * early-returns when already frozen) and safe to call from an event, from a refusal, or at
     * mount time.
     */
    function syncCommittedFromStore(cause: string): void {
        if (disposed || committed || committingLocally) return;
        let committedVertices = 0;
        try {
            const ctx = resolveSiteContext(runtime ?? null);
            committedVertices = ctx?.store.getSite()?.parcel?.boundary?.polygon?.length ?? 0;
        } catch (e) {
            console.warn('[gis] map2d §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC: store read failed (non-fatal):', e);
            return;
        }
        if (committedVertices < 1) return;
        console.warn(
            `[gis] map2d §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — a parcel boundary (${committedVertices} corners) was ` +
            `committed WITHOUT going through this map (cause="${cause}"). Freezing the draw/select surface so it ` +
            'stops offering an interaction C19 §1.4 will reject, and revealing "↺ Redraw boundary" as the way out.',
        );
        freezeDraw();
    }

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
        // §PARCEL-SELECT — the select/draw toggle + parcel card are pre-commit affordances.
        interToggle.style.display = 'none';
        hideParcelCard();
        // §L-384 — the undo/redo pill is a draw affordance; drop it. Offer RE-DRAW instead
        // (clear-then-recreate of the immutable C19 boundary) so a mis-drawn plot isn't a trap.
        editBar.style.display = 'none';
        if (!opts.overlayOnly) redrawBtn.style.display = 'block';
        console.log('[gis] map2d: boundary committed — draw frozen, cream map + boundary kept alive (dispose deferred to generate-time); Redraw available (§L-384).');
    }

    function commit(): void {
        if (disposed || committed) return;
        if (vertices.length < 3) {
            toast(`Need at least 3 corners (have ${vertices.length}).`, 'error');
            console.warn('[gis] map2d: <3 vertices, not closing');
            return;
        }

        const ctx = resolveSiteContext(runtime);
        // No site context = a genuine failure; we can't set a boundary, so tear down.
        if (!ctx) { dispose(); return; }

        // §FIX-BOUNDARY-COMMIT-REFUSE (ADR-0299 §Decision 1 + 2) — REFUSE BEFORE MUTATING.
        // The C19 §1.4 parcel polygon is a one-shot. If something ELSE authored a boundary
        // while this map was live (the onboarding draw watchdog's default plot, "Skip
        // drawing", `createSiteFromRect`), this commit is impossible by construction — and
        // everything below it mutates: `dispatchSiteLocation` REBASES the LTP-ENU origin onto
        // the new ring and SUCCEEDS, `dispatchParcelBoundary` is then rejected, and the old
        // code froze the surface + fired `onCommit()` anyway. That combination is the wedge
        // the founder hit: the drawn parcel silently discarded, the frame moved out from under
        // the boundary still committed, and the draw frozen on a commit that never happened.
        //
        // Refuse loudly, change NOTHING, stay armed, and surface the one legal route
        // (CLEAR-then-recreate). `syncCommittedFromStore()` has normally already frozen this
        // surface the moment the external boundary landed, so reaching here means the event
        // never arrived — hence the console.error, not a quiet return.
        const verdict = canCommitParcelBoundary(ctx);
        if (!verdict.ok) {
            console.error(
                '[gis] map2d §FIX-BOUNDARY-COMMIT-REFUSE — REFUSING this commit: ' + verdict.message +
                ' Nothing was mutated (no origin rebase, no boundary write). Reason=' + verdict.reason,
            );
            toast(
                'This site already has a parcel boundary. Press “↺ Redraw boundary” to clear it, then draw or select again.',
                'error',
            );
            // Make the way out visible — the external author never showed it (§L-384 normally
            // reveals it in freezeDraw()). Without this the user has no affordance at all.
            syncCommittedFromStore('refused-commit');
            return;
        }
        // From here on the mutations are ours — suppress the external-boundary listener so it
        // does not report our own synchronous `site.parcel-boundary-set` as somebody else's.
        committingLocally = true;

        // §L-635 (C57 §1.3 / §4, C19 §1.3, C12 §1.5) — ORIGIN-ON-PARCEL. Anchor the LTP-ENU frame
        // origin to the PARCEL's own location (its first vertex, `parcelFrameOrigin`) and project the
        // ring about that SAME point, so the boundary lands at world origin and the always-on
        // project-origin datum sphere sits ON the boundary. C57 §1.3 / §4 REQUIRE dispatchSiteLocation
        // to set the origin BEFORE the ring projects; the old `fromSite ?? firstVertex` precedence
        // projected about a possibly-STALE / far-away geocoded anchor and set the location only after,
        // so a parcel selected or drawn away from the initial geocode landed dist(anchor, parcel) —
        // up to hundreds of km — from origin, off the datum (the founder-reported regression). Set at
        // commit time, before any boundary exists (C19 §1.4 — never a retroactive recentre); the
        // render frame (getFormaOrigin) then reads this SAME origin, so ring and ENU frame cannot
        // diverge (C12 §1.5 / SEAM-2, L-604). Any geocoded street address (C22 PII) is preserved.
        const priorAnchor = getOrigin();
        const origin = parcelFrameOrigin(vertices) ?? { lat: vertices[0]!.lat, lon: vertices[0]!.lon };
        if (priorAnchor) {
            console.log('[gis] map2d: §L-635 anchoring origin to parcel first vertex', origin,
                '— prior site anchor', priorAnchor, 'no longer used for the ring projection.');
        }
        const existingAddress = ctx.store.getSite()?.location?.siteAddress ?? null;
        dispatchSiteLocation(ctx, { latitude: origin.lat, longitude: origin.lon, siteAddress: existingAddress });

        const built = buildBoundaryFromLatLonRing(vertices, origin.lat, origin.lon);
        console.log(`[gis] map2d: ${built.polygon.length} XZ pts`, built.polygon, built.edgeClassifications);

        // §L-536-THETA-RESET — θ MUST be written on EVERY parcel commit, INCLUDING θ = 0.
        //
        // MEASURED, not assumed (probe: scratchpad/probe-l536-frames.mts + probe-l536-zero.mts,
        // 800 real Catastro parcels). The frame chain itself is exact: map lat/lon →
        // buildBoundaryFromLatLonRing → θ de-rotation (dispatchParcelBoundary) → θ re-application
        // (CesiumViewport.toCartesian) round-trips to 1e-14 m with identical vertex counts. So the
        // 2D map and the 3D Site CANNOT disagree — **provided the θ written at commit is the θ read
        // at render.**
        //
        // `dispatchParcelBoundary` guards BOTH the de-rotation AND the θ write behind
        // `if (projectNorthRad !== 0)`. On the θ = 0 branch it therefore leaves the ring in the TRUE
        // frame *and leaves `SiteLocation.trueNorth` at whatever it already was*. On a FRESH site
        // that is harmless (trueNorth defaults to 0). After §L-384 "Redraw" — or any re-selection —
        // it is not: `dispatchClearParcelBoundary` clears the boundary but NOT θ, so a previously
        // selected parcel's θ (±45° everywhere in the Cerdà grid) survives and is then re-applied
        // by the 3D Site to a ring that was never de-rotated. Same origin, same vertex count,
        // bearing off by ~45° — which on a 17–43 vertex cadastral outline does not read as "rotated",
        // it reads as A DIFFERENT SHAPE. That is L-536's signature.
        //
        // θ = 0 exactly is not exotic in Barcelona: 9 of 800 probed parcels (1.1%), because the
        // Eixample *xamfrà* (the 45° chamfered corner) is the LONGEST edge of a corner parcel and
        // is axis-aligned to true north — so `deriveProjectNorthAngleFromParcel` folds it to 0.
        // Rare per-parcel, certain to recur across sessions: exactly an intermittent, thrice-reported
        // defect.
        //
        // FIX HERE, NOT IN THE ENGINE: θ is DERIVED FROM the parcel, so committing a parcel must
        // publish that parcel's θ unconditionally. We call the SAME pure derivation on the SAME
        // input `dispatchParcelBoundary` is about to use, and fill only the branch it skips — so
        // when θ ≠ 0 nothing changes at all (it writes the identical value a line later). The
        // structural fix (making the write unconditional inside `dispatchParcelBoundary`, and
        // checking its currently-ignored return value) belongs in `siteDispatch.ts`, which is owned
        // by another agent this session — see the L-536 audit row.
        const thetaForCommit = deriveProjectNorthAngleFromParcel(built.polygon);
        if (thetaForCommit === 0 && ctx.store.getSite()) {
            console.log(
                '[gis] §L-536-THETA-RESET — this parcel squares to true north (θ = 0), so ' +
                    'dispatchParcelBoundary will skip the θ write. Publishing θ = 0 explicitly so a ' +
                    'PREVIOUS parcel’s project north cannot survive a redraw and rotate this ring on ' +
                    'the 3D Site.',
            );
            dispatchSiteTrueNorth(ctx, 0);
        }

        // §L-1580 (C57 §1.4) — the ring and its attribution commit in ONE command. A DRAWN
        // boundary passes `null`: it has no cadastral source, and stamping one would be a
        // fabricated fact. The variable is consumed here and cleared immediately, so a
        // subsequent draw cannot inherit a previous selection's provenance.
        const provenanceForCommit = pendingParcelProvenance;
        pendingParcelProvenance = null;
        const ok = dispatchParcelBoundary(ctx, {
            polygon: built.polygon,
            edgeClassifications: built.edgeClassifications,
        }, provenanceForCommit);
        // §FIX-BOUNDARY-COMMIT-REFUSE (ADR-0299 §Decision 2 — "callers MUST NOT log a recovery
        // they did not perform"). `freezeDraw()` + `onCommit()` used to run UNCONDITIONALLY, so a
        // rejected dispatch still froze the surface and advanced the onboarding flow to the
        // "Generate with AI?" confirm — reporting a commit that did not happen. A failed dispatch
        // now leaves the draw ARMED so the user can retry, and does NOT advance the host.
        committingLocally = false;
        if (!ok) {
            console.error(
                '[gis] map2d §FIX-BOUNDARY-COMMIT-REFUSE — site.setParcelBoundary dispatch FAILED. ' +
                'NOT freezing the draw and NOT signalling onCommit: the boundary on screen is not ' +
                'the committed one. The draw stays armed so the user can retry.',
            );
            // The store is the truth — if something else did land a boundary, freeze honestly.
            syncCommittedFromStore('failed-dispatch');
            return;
        }
        const area = signedAreaAbs(built.polygon);
        ctx.toast(
            `Site boundary set — ${built.polygon.length} corners (~${area.toFixed(0)} m²).`,
            'success',
        );
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
        // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — drop the boundary listener (leak-free teardown).
        try { boundarySub?.dispose(); } catch { /* ignore */ }
        boundarySub = null;
        // §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR — a disposed map is not a drawable surface.
        try { delete (window as unknown as { pryzmBoundaryDrawSurfaceReadyAt?: number }).pryzmBoundaryDrawSurfaceReadyAt; } catch { /* ignore */ }
        // A.21.D9 — remove all pooled dimension-label markers.
        for (const m of dimMarkers) { try { m.remove(); } catch { /* ignore */ } }
        dimMarkers.length = 0;
        // §CIRCLE-BOUNDARY — remove the live radius readout marker.
        if (radiusMarker) { try { radiusMarker.remove(); } catch { /* ignore */ } radiusMarker = null; }
        // MAP-DATA-OVERTURE — cancel any in-flight context fetch + pending debounce.
        try { ctxAbort?.abort(); } catch { /* ignore */ }
        if (ctxDebounce) { clearTimeout(ctxDebounce); ctxDebounce = null; }
        // §MAP2D-PASTEL (L-12938) — cancel the pastel push + its pending debounce.
        try { pastelAbort?.abort(); } catch { /* ignore */ }
        if (pastelDebounce) { clearTimeout(pastelDebounce); pastelDebounce = null; }
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

    // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — watch for a boundary committed by ANY other path
    // while this surface is live, and freeze honestly the moment it lands. This is what
    // stops the founder's "two states at once" screenshot from ever being reachable: the
    // draw/select chrome comes down and "↺ Redraw boundary" comes up as soon as the C19
    // one-shot is spent, whoever spent it. `committingLocally` suppresses our own commit.
    // Also run ONCE at mount: the split can be re-mounted over an already-committed site.
    let boundarySub: { dispose: () => void } | null = null;
    try {
        boundarySub = (runtime ?? null)?.events?.on(
            'site.parcel-boundary-set',
            () => syncCommittedFromStore('external-commit-event'),
        ) ?? null;
    } catch (e) {
        console.warn('[gis] map2d §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC: could not subscribe (non-fatal):', e);
    }
    syncCommittedFromStore('mount');

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
        // §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D (L-194) — OVERLAY-ONLY mode:
        // do NOT attach ANY boundary-draw interaction. The map exists solely to place + calibrate
        // the site-plan overlay (whose controller binds its OWN map 'click' handler for the
        // 2-point calibration, mounted below). Never attaching the draw handlers is the definitive
        // "disarm": no vertex can ever be added, no boundary can ever be committed, and no
        // "Generate with AI?" confirm can ever be triggered from this map. (onClick also
        // early-returns on overlayOnly as belt-and-braces.) The draw-plot branch attaches as before.
        // §FIX-MAP2D-EXTERNAL-BOUNDARY-SYNC — `!committed` added: mounting over a site that
        // ALREADY has a committed C19 boundary must not arm a draw the store will reject.
        if (!opts.overlayOnly && !committed) {
            // §L-384 — factored so the RE-DRAW path (rearmDraw) can re-attach after a freeze.
            attachDrawHandlers();
        }
        // §L-384 — reflect the initial undo/redo affordance state (draw + polygon mode).
        refreshEditBar();
        // MAP-DATA-OVERTURE — populate context footprints now + on every pan/zoom.
        loadContextBuildings(true);
        map.on('moveend', () => loadContextBuildings(false));
        // §MAP2D-PASTEL (L-12938) — the baked context layers on the same cadence.
        loadPastelContext(true);
        map.on('moveend', () => loadPastelContext(false));

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
                // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — THE FLOW OWNS ITS OWN
                // TERMINAL TRANSITION. Emitting the event alone was the bug: its ONLY subscriber
                // was an ephemeral listener inside the onboarding wizard's overlay branch, so
                // every other entry into this panel (the always-on Plan + Site (GIS) launcher —
                // C06 §7 — the map's "Overlay plan / PDF" button, or a re-entry on an already
                // onboarded project) pressed "✓ Finish", created the underlay… and fired the
                // event into an EMPTY BUS. The user stayed on the map. We still emit (the
                // onboarding wizard listens so it can dispose itself), and then we perform the
                // landing ourselves — idempotent, so the two callers land ONCE.
                onPlacementCommitted: () => {
                    void onSitePlanPlacementCommitted(runtime ?? null);
                },
                // §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — drop the calibrated plan into the
                // editor canvas as a live underlay (correct location + size, axis-aligned to
                // project north for orthogonal plan-view tracing). Reuses the existing
                // FloorPlanUnderlayTool + CREATE_UNDERLAY pipeline. §FIX-SITE-OVERLAY-ENTER-CANVAS
                // (L-78) — RETURN the promise so the controller AWAITS it before the host frames
                // the canvas on the (now-existing) underlay.
                onEnterCanvas: (params: EnterCanvasUnderlayParams) =>
                    createPlanCanvasUnderlayFromSiteOverlay(params).then(() => undefined),
            });
            // §SITE-PLAN-OVERLAY — window hook so the onboarding "Overlay a plan/PDF"
            // choice can open the upload picker after the draw map mounts.
            (window as unknown as { pryzmOpenSitePlanOverlay?: () => void }).pryzmOpenSitePlanOverlay =
                () => overlayController?.promptUpload();
        } catch (err) {
            console.warn('[site-overlay] controller mount failed (non-fatal):', err);
        }

        // §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299) — stamp the moment the draw surface
        // became genuinely usable. The onboarding idle timer starts its clock from THIS, never
        // from when its step rendered: charging our own load time (the observed 25 s tiles stall)
        // to the user's patience is what made the old watchdog fire on people who had not yet
        // been shown a map. Cleared in dispose() so a torn-down map never reads as ready.
        if (!opts.overlayOnly) {
            (window as unknown as { pryzmBoundaryDrawSurfaceReadyAt?: number }).pryzmBoundaryDrawSurfaceReadyAt = Date.now();
        }
        console.log('[gis] map2d: ready — Forma minimal-vector boundary-draw map mounted');
    });

    // §VIEW-PANEL-PER-PANE — the SAME `swapBasemap` the corner chip calls (it is the click
    // handler two lines below its definition), handed out rather than copied. There is one
    // basemap implementation in this app and this is it.
    return {
        element: overlay,
        dispose,
        rearm: rearmDraw,
        setBasemap: (next) => swapBasemap(next),
        getBasemap: () => basemap,
    };
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
