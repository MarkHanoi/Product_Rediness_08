// §ENVELOPE-DRAW C6 (lane ENVELOPE-DRAW-2, 2026-09-07) — THE 2D SITE MAP ADAPTER (MapLibre).
//
// PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS §3b · L-13050 · L-69 · L-13045 · C16 CA-18 · P2 · P6 · P8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ A PLAN MAP HAS NO VERTICAL AXIS — SAY IT HERE, WHERE SOMEONE WOULD OTHERWISE ADD ONE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-13045 established this as a CAPABILITY CEILING, not an implementation gap: on a pitch-locked
// plan map there is no screen direction that means "up", so the envelope's HEIGHT can never be
// dragged here. This adapter therefore produces a RING and nothing else; the height comes from the
// panel's "Number of floor levels" control, on both site views alike. ⛔ Do not add a height
// gesture to this file — there is nowhere for it to point.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ HOW THIS YIELDS THE MAP'S CLICK LADDER WITHOUT ADDING A SECOND `map.on('click', …)`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `SiteBoundaryMap2D` binds EXACTLY ONE `map.on('click', onClick)`, and `siteMap2DStyleV2.spec.ts`
// pins that count at 1. That is scar tissue, not a style preference: L-69 records a SECOND
// map-click listener (the site-plan overlay's calibration) consuming two clicks as parcel vertices
// — in rectangle mode it COMMITTED a boundary.
//
// ⭐ SO THIS ADAPTER BINDS NO MAP *INPUT* EVENT AT ALL. It attaches CAPTURE-phase DOM listeners to
// `map.getCanvasContainer()` and calls `stopPropagation()` on the click and dblclick it consumes.
// MapLibre synthesises its own `click` FROM that DOM event, on that same container, in the bubble
// phase — so an event stopped in capture never becomes a MapLibre `click`, and the existing
// `onClick` precedence ladder is not merely out-ranked, it is never reached. The binding count
// stays 1, `onClick` stays byte-identical, and there is no second consumer of one click.
//
// ⚠ TWO MAP *RENDER* EVENTS ARE LISTENED TO, AND NEITHER CONSUMES ANYTHING (§ENVELOPE-DRAW-LIVE-DIMS
// L-13308 · §ENVELOPE-ROSTER-ONE-SOURCE L-13309): `move`, while armed, so the live dimension chips
// stay on their segments through a pan or zoom (what MapLibre's own `Marker` listens to); and
// `styledata`, while a profile roster is painted, so a basemap swap cannot wipe the roster. The spec
// pins the event NAMES, so a click / dblclick / mouse / key map binding added here still goes red.
//
// ⭐ AND THIS SIDESTEPS THE ONE GENUINE SURFACE DIFFERENCE THE PLAN CALLED OUT (§3b / R7).
// After a parcel boundary is committed, `freezeDraw()` DETACHES the map's own dblclick, mousemove
// and overlay key handlers, keeping only `click` — and envelope authoring happens exactly when a
// parcel is already committed. The plan's answer was "re-attach them on arm". This adapter never
// borrowed them: it owns its own listeners for their lifetime, so a frozen map and a fresh one arm
// identically. Cesium has no frozen state; now neither surface needs one modelled.
//
// ⛔ PAN STAYS LIVE. `dragPan` is NOT disabled — click-to-place at parcel scale needs panning, and
// `mousedown`/`mousemove`/`mouseup` are deliberately left alone so MapLibre's own drag still runs.
// Only `click` and `dblclick` are consumed, which are the two the gesture needs and the two that
// would otherwise reach the parcel-select ladder.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT IS AND IS NOT COVERED BY A TEST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The map object is taken as a STRUCTURAL type — the six methods this file calls — rather than by
// importing `maplibre-gl`. That keeps the adapter out of the map chunk AND lets the DOM plumbing
// (capture-phase consumption, arm/disarm symmetry, the sink wiring) be exercised headlessly.
// ⛔ IT DOES NOT MAKE THE PROJECTION COVERED. `unproject` is MapLibre's own camera maths; a stand-in
// that returns a number cannot falsify it ([[fake-more-capable-than-real]]). What IS pinned, in
// `siteEnvelopeDrawFrame.spec.ts`, is the lat/lon ⇄ project-XZ conversion this file wraps — the
// half that fails silently and plausibly on a rotated site.

import { trace } from '@opentelemetry/api';
import type { ArcVertex2D } from '@pryzm/geometry-slab/boundary-path';
import type {
    EnvelopeDrawDimLabel,
    EnvelopeDrawSink,
    EnvelopeDrawSurface,
    EnvelopeRosterRing,
    SceneXZPoint,
} from './envelopeDrawSurface';
import {
    latLonToProjectXZ,
    projectXZToLatLon,
    resolveSiteDrawFrame,
    type SiteDrawFrame,
} from './siteEnvelopeDrawFrame';

const _tracer = trace.getTracer('pryzm.site.siteEnvelopeDrawMap2D');

const VIOLET_CSS = '#6600FF';

/** Source and layer ids. Namespaced so they cannot collide with the map's own ring layers. */
export const ENVELOPE_DRAW_LINE_SOURCE = 'pryzm-envelope-draw-line';
export const ENVELOPE_DRAW_POINT_SOURCE = 'pryzm-envelope-draw-points';
export const ENVELOPE_DRAW_LINE_LAYER = 'pryzm-envelope-draw-line-layer';
export const ENVELOPE_DRAW_POINT_LAYER = 'pryzm-envelope-draw-point-layer';
// §ENVELOPE-DRAW-SETTLED-RING (L-13148) — the FINISHED perimeter's own source and layers.
// ⛔ ITS OWN SOURCE, NOT THE PREVIEW'S. `clearPreview()` empties the preview sources on every
// exit; sharing them would mean the settled ring is wiped by the very disarm that creates it.
export const ENVELOPE_SETTLED_SOURCE = 'pryzm-envelope-settled';
export const ENVELOPE_SETTLED_FILL_LAYER = 'pryzm-envelope-settled-fill-layer';
export const ENVELOPE_SETTLED_LINE_LAYER = 'pryzm-envelope-settled-line-layer';
// §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — the profile ROSTER's own source and layers. ⛔ Not the
// settled ring's: that one now carries only the spine and is emptied on every arm — the lifetime
// that deleted profile 1 from the map the moment the founder started profile 2.
export const ENVELOPE_ROSTER_SOURCE = 'pryzm-envelope-roster';
export const ENVELOPE_ROSTER_FILL_LAYER = 'pryzm-envelope-roster-fill-layer';
export const ENVELOPE_ROSTER_LINE_LAYER = 'pryzm-envelope-roster-line-layer';
/** §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the DOM overlay the live dimension chips live in. */
export const ENVELOPE_DRAW_DIMS_TESTID = 'pryzm-envelope-draw-dims';

/**
 * The six things this adapter asks of a MapLibre map. A STRUCTURAL type, not an import: it keeps
 * `maplibre-gl` out of this module's graph and makes the DOM half testable without a real map.
 */
export interface EnvelopeDrawMapLike {
    getCanvasContainer(): HTMLElement;
    unproject(point: [number, number]): { lng: number; lat: number };
    getSource(id: string): { setData(data: unknown): void } | undefined;
    addSource(id: string, spec: unknown): void;
    getLayer(id: string): unknown;
    /** `beforeId` is MapLibre's own second argument — used so the roster sits UNDER the live draft. */
    addLayer(spec: unknown, beforeId?: string): void;
    /**
     * §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — lat/lon → container pixels, MapLibre's own. OPTIONAL: a
     * map that cannot project gets a working draw with no chips, never a thrown pointer handler.
     */
    project?(lngLat: [number, number]): { x: number; y: number };
    /**
     * ⚠ THE ONLY TWO MAP EVENTS THIS ADAPTER LISTENS TO, AND NEITHER IS AN INPUT EVENT. `move` keeps
     * the dimension chips on the ground under a pan / zoom (what MapLibre's own `Marker` listens to);
     * `styledata` re-installs the roster after a basemap swap. ⛔ NO click / dblclick / mouse / key /
     * touch binding — that is L-69, and `siteEnvelopeDrawMap2D.spec.ts` pins the names by source text.
     */
    on?(type: 'move' | 'styledata', listener: () => void): unknown;
    off?(type: 'move' | 'styledata', listener: () => void): unknown;
}

export interface SiteEnvelopeDrawMap2DDeps {
    readonly map: EnvelopeDrawMapLike;
    /** The ONE site frame origin (R6) — the same `resolveSiteFrameOrigin` the ring is committed about. */
    readonly getOrigin: () => { lat: number; lon: number } | null;
    /** The site's `SiteLocation`, or `null` when unreachable. ⛔ `null` refuses; it is not θ = 0. */
    readonly getSiteLocation: () => { trueNorth?: number } | null;
}

const emptyFC = (): unknown => ({ type: 'FeatureCollection', features: [] });

/** The 2D Site Map (MapLibre) implementation of the envelope-draw port. */
export class SiteEnvelopeDrawMap2D implements EnvelopeDrawSurface {
    readonly surfaceId = 'site-map-2d' as const;

    private readonly deps: SiteEnvelopeDrawMap2DDeps;
    private sink: EnvelopeDrawSink | null = null;
    /** The frame LATCHED at arm — one origin and one θ for the whole gesture (R6). */
    private frame: SiteDrawFrame | null = null;
    private detach: Array<() => void> = [];

    // ── §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the live chips (a DOM overlay; see `paintDimChips`). ──
    private dimOverlay: HTMLDivElement | null = null;
    private readonly dimChips: Array<{ el: HTMLDivElement; lngLat: [number, number] | null }> = [];
    /** Re-seats the chips on every camera change — bound on arm, unbound on disarm. */
    private readonly onCameraMove = (): void => { this.layoutDimChips(); };

    // ── §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — what the roster source currently holds. ─────────
    /** The last roster FeatureCollection pushed, or `null` when nothing is painted. */
    private rosterData: unknown = null;
    /** Re-installs the roster after `setStyle` destroyed it — bound only while a roster is painted. */
    private readonly onStyleData = (): void => { this.restoreRosterAfterStyleSwap(); };
    private styleListening = false;

    constructor(deps: SiteEnvelopeDrawMap2DDeps) {
        this.deps = deps;
    }

    /** C16 CA-18 — why this surface would refuse right now, or `null`. See the port's docstring. */
    cannotArmReason(): string | null {
        let container: HTMLElement | null = null;
        try { container = this.deps.map.getCanvasContainer(); } catch { container = null; }
        if (!container) {
            return 'The 2D Site Map is registered but its canvas is gone (the map was disposed or '
                + 'is mid-remount), so it cannot take a drawing right now. Re-open the 2D Site Map '
                + 'and press Draw again.';
        }
        const resolved = resolveSiteDrawFrame(this.deps.getOrigin(), this.deps.getSiteLocation());
        return resolved.ok ? null : `On the 2D Site Map: ${resolved.reason}`;
    }

    // ── SCREEN → GROUND ─────────────────────────────────────────────────────────────────────

    groundPointFromPointer(clientX: number, clientY: number): SceneXZPoint | null {
        const frame = this.frame ?? this.resolveFrameNow();
        if (!frame) return null;
        try {
            const container = this.deps.map.getCanvasContainer();
            const rect = container.getBoundingClientRect();
            const ll = this.deps.map.unproject([clientX - rect.left, clientY - rect.top]);
            if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return null;
            return latLonToProjectXZ({ lat: ll.lat, lon: ll.lng }, frame);
        } catch {
            // ⛔ A plan map has no sky and no terrain gaps, so unlike Cesium there is no legitimate
            // "not over ground" here — a throw means the map is mid-teardown, not that the user
            // aimed badly. Returning null lets the rubber-band lift rather than freeze.
            return null;
        }
    }

    private resolveFrameNow(): SiteDrawFrame | null {
        const r = resolveSiteDrawFrame(this.deps.getOrigin(), this.deps.getSiteLocation());
        return r.ok ? r.frame : null;
    }

    // ── THE PREVIEW ─────────────────────────────────────────────────────────────────────────

    /**
     * ⛔ THE SOURCES ARE (RE-)INSTALLED LAZILY, ON EVERY ARM AND ON EVERY DRAW. The founder can
     * toggle the basemap (cream vector ⇄ satellite raster) mid-session, and `setStyle` DESTROYS
     * every source and layer the previous style carried. A preview installed once at construction
     * would vanish on the first toggle and the tool would look broken with nothing in the log.
     */
    private ensureLayers(): boolean {
        try {
            const map = this.deps.map;
            if (!map.getSource(ENVELOPE_DRAW_LINE_SOURCE)) {
                map.addSource(ENVELOPE_DRAW_LINE_SOURCE, { type: 'geojson', data: emptyFC() });
            }
            if (!map.getSource(ENVELOPE_DRAW_POINT_SOURCE)) {
                map.addSource(ENVELOPE_DRAW_POINT_SOURCE, { type: 'geojson', data: emptyFC() });
            }
            if (!map.getLayer(ENVELOPE_DRAW_LINE_LAYER)) {
                map.addLayer({
                    id: ENVELOPE_DRAW_LINE_LAYER,
                    type: 'line',
                    source: ENVELOPE_DRAW_LINE_SOURCE,
                    paint: { 'line-color': VIOLET_CSS, 'line-width': 2.5 },
                });
            }
            if (!map.getLayer(ENVELOPE_DRAW_POINT_LAYER)) {
                map.addLayer({
                    id: ENVELOPE_DRAW_POINT_LAYER,
                    type: 'circle',
                    source: ENVELOPE_DRAW_POINT_SOURCE,
                    paint: {
                        'circle-radius': 4.5,
                        'circle-color': VIOLET_CSS,
                        'circle-stroke-color': '#ffffff',
                        'circle-stroke-width': 1.5,
                    },
                });
            }
            return true;
        } catch (e) {
            console.warn('[site][envelope-draw][2d] preview layers could not be installed:', e);
            return false;
        }
    }

    drawPreview(
        committed: readonly ArcVertex2D[],
        tail: readonly ArcVertex2D[],
        closeRing: boolean,
        dims: readonly EnvelopeDrawDimLabel[] = [],
    ): void {
        const frame = this.frame;
        if (!frame) return;
        // §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the chips are DOM, not a map layer, so they paint even
        // in the instant a style swap has taken the preview sources away.
        this.paintDimChips(dims, frame);
        if (!this.ensureLayers()) return;
        try {
            const toLngLat = (p: ArcVertex2D): [number, number] => {
                const ll = projectXZToLatLon(p, frame);
                return [ll.lon, ll.lat];
            };
            const all = [...committed, ...tail].map(toLngLat);
            const line = all.length >= 2
                ? {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: closeRing && all.length >= 3 ? [...all, all[0]!] : all,
                        },
                    }],
                }
                : emptyFC();
            this.deps.map.getSource(ENVELOPE_DRAW_LINE_SOURCE)?.setData(line);
            this.deps.map.getSource(ENVELOPE_DRAW_POINT_SOURCE)?.setData({
                type: 'FeatureCollection',
                features: committed.map(toLngLat).map((c) => ({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'Point', coordinates: c },
                })),
            });
        } catch (e) {
            console.warn('[site][envelope-draw][2d] preview draw failed (non-fatal):', e);
        }
    }

    clearPreview(): void {
        try {
            this.deps.map.getSource(ENVELOPE_DRAW_LINE_SOURCE)?.setData(emptyFC());
            this.deps.map.getSource(ENVELOPE_DRAW_POINT_SOURCE)?.setData(emptyFC());
        } catch { /* style swapped or map disposed — the sources went with it */ }
        // §ENVELOPE-DRAW-LIVE-DIMS — the chips belong to the draft and end with it.
        this.removeDimChips();
    }

    // ── §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — THE CHIPS ─────────────────────────────────────────
    //
    // ⚠ DOM CHIPS, NOT A MapLibre `symbol` LAYER: text in a symbol layer needs the style's `glyphs`,
    // and the SATELLITE basemap (`buildSatelliteStyle`) carries none — every chip would silently
    // vanish on the founder's toggle. A DOM chip needs no font atlas, and it is the same element the
    // parcel draw on this very map already uses for its dimensions (`SiteBoundaryMap2D.makeDimChip`):
    // white, PRYZM-purple border and text. The LIVE chip is inverted (purple, white text) so the
    // length under the pointer reads first. ⛔ Never black.
    //
    // ⭐ POSITIONED LIKE A MapLibre `Marker`: `map.project(lngLat)` into the canvas container, re-run
    // on the map's `move` while armed (bound in `arm`, unbound in `disarm`), so a chip stays on its
    // segment through a pan or a zoom — and the draw keeps panning live on purpose.

    private ensureDimOverlay(): HTMLDivElement | null {
        if (this.dimOverlay && this.dimOverlay.isConnected) return this.dimOverlay;
        let container: HTMLElement;
        try { container = this.deps.map.getCanvasContainer(); } catch { return null; }
        if (!container) return null;
        const el = document.createElement('div');
        el.setAttribute('data-testid', ENVELOPE_DRAW_DIMS_TESTID);
        Object.assign(el.style, {
            position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'hidden', zIndex: '3',
        } satisfies Partial<CSSStyleDeclaration>);
        container.appendChild(el);
        this.dimOverlay = el;
        return el;
    }

    private paintDimChips(dims: readonly EnvelopeDrawDimLabel[], frame: SiteDrawFrame): void {
        try {
            // ⚠ A map that cannot project keeps a working draw with no chips — never a thrown handler.
            if (dims.length === 0 || typeof this.deps.map.project !== 'function') {
                for (const c of this.dimChips) { c.el.style.display = 'none'; c.lngLat = null; }
                return;
            }
            const overlay = this.ensureDimOverlay();
            if (!overlay) return;
            while (this.dimChips.length < dims.length) {
                const el = document.createElement('div');
                Object.assign(el.style, {
                    position: 'absolute', left: '0', top: '0',
                    borderRadius: '6px', padding: '2px 7px',
                    font: '600 12px/1.2 system-ui, sans-serif',
                    whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
                    boxShadow: '0 1px 4px rgba(102,0,255,0.22)',
                } satisfies Partial<CSSStyleDeclaration>);
                overlay.appendChild(el);
                this.dimChips.push({ el, lngLat: null });
            }
            for (let i = 0; i < this.dimChips.length; i++) {
                const chip = this.dimChips[i]!;
                const dim = dims[i];
                if (dim === undefined) { chip.el.style.display = 'none'; chip.lngLat = null; continue; }
                const ll = projectXZToLatLon(dim.at, frame);
                chip.lngLat = [ll.lon, ll.lat];
                chip.el.textContent = dim.text;
                chip.el.setAttribute('data-dim-kind', dim.kind);
                const live = dim.kind === 'live';
                chip.el.style.background = live ? VIOLET_CSS : 'rgba(255,255,255,0.95)';
                chip.el.style.color = live ? '#ffffff' : VIOLET_CSS;
                // The implied closing edge reads as implied — dashed — like the preview's own closure.
                chip.el.style.border = `1px ${dim.kind === 'closing' ? 'dashed' : 'solid'} ${VIOLET_CSS}`;
                chip.el.style.display = '';
            }
            this.layoutDimChips();
        } catch (e) {
            console.warn('[site][envelope-draw][2d] dimension chips could not be drawn (non-fatal):', e);
        }
    }

    /** Re-seat every visible chip on its segment. Runs on each preview and on each camera `move`. */
    private layoutDimChips(): void {
        const map = this.deps.map;
        if (typeof map.project !== 'function') return;
        for (const chip of this.dimChips) {
            if (chip.lngLat === null) continue;
            try {
                const p = map.project(chip.lngLat);
                chip.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
            } catch { chip.el.style.display = 'none'; }
        }
    }

    private removeDimChips(): void {
        for (const c of this.dimChips) { try { c.el.remove(); } catch { /* already detached */ } }
        this.dimChips.length = 0;
        try { this.dimOverlay?.remove(); } catch { /* already detached */ }
        this.dimOverlay = null;
    }

    /**
     * ⭐ §ENVELOPE-DRAW-SETTLED-RING (L-13148) — the closed perimeter stays on the map after the
     * gesture ends. See the port's note for why this is a second channel and not a longer-lived
     * preview.
     *
     * ⚠ IT RESOLVES ITS OWN FRAME, for the same reason the 3-D adapter does: `this.frame` is
     * nulled by `disarm()`, and the finish disarms before it paints.
     */
    drawSettledRing(ring: readonly SceneXZPoint[], closed = true): void {
        // ⭐ §ARRAY-ALONG-PATH (ADR-0386 D6) — the MINIMUM MOVES WITH THE SHAPE. Three vertices to
        // enclose anything; two to be a run. Keeping the hard 3 here would have dropped every
        // straight two-point spine silently, which is the shape this repo logs as "the fix landed
        // and the founder still reports it".
        if (ring.length < (closed ? 3 : 2)) { this.clearSettledRing(); return; }
        const frame = this.frame ?? this.resolveFrameNow();
        if (!frame) {
            console.warn(
                '[site][envelope-draw][2d] §ENVELOPE-DRAW-SETTLED-RING the perimeter was stored but '
                + 'the site frame origin is no longer resolvable, so it is not drawn. The create '
                + 'panel still holds it.',
            );
            return;
        }
        if (!this.ensureSettledLayers()) return;
        try {
            const coords = ring.map((pt) => {
                const ll = projectXZToLatLon(pt, frame);
                return [ll.lon, ll.lat] as [number, number];
            });
            this.deps.map.getSource(ENVELOPE_SETTLED_SOURCE)?.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    properties: {},
                    // ⭐ A SPINE IS A LineString, NOT A CLOSED RING. The existing `fill` layer
                    // simply renders nothing for one and the `line` layer draws it, so the open
                    // case needs no third layer — and a spine pushed through the Polygon branch
                    // would be painted as a filled shape that does not exist.
                    geometry: closed
                        // GeoJSON polygons close explicitly — first vertex repeated last.
                        ? { type: 'Polygon', coordinates: [[...coords, coords[0]!]] }
                        : { type: 'LineString', coordinates: coords },
                }],
            });
        } catch (e) {
            console.warn('[site][envelope-draw][2d] settled-ring draw failed (non-fatal):', e);
        }
    }

    /** Idempotent; safe when the style was swapped and the source went with it. */
    clearSettledRing(): void {
        try { this.deps.map.getSource(ENVELOPE_SETTLED_SOURCE)?.setData(emptyFC()); }
        catch { /* style swapped or map disposed */ }
    }

    /** The settled ring's source + two layers, installed lazily for the same reason as the preview's. */
    private ensureSettledLayers(): boolean {
        try {
            const map = this.deps.map;
            if (!map.getSource(ENVELOPE_SETTLED_SOURCE)) {
                map.addSource(ENVELOPE_SETTLED_SOURCE, { type: 'geojson', data: emptyFC() });
            }
            if (!map.getLayer(ENVELOPE_SETTLED_FILL_LAYER)) {
                map.addLayer({
                    id: ENVELOPE_SETTLED_FILL_LAYER,
                    type: 'fill',
                    source: ENVELOPE_SETTLED_SOURCE,
                    paint: { 'fill-color': VIOLET_CSS, 'fill-opacity': 0.13 },
                });
            }
            if (!map.getLayer(ENVELOPE_SETTLED_LINE_LAYER)) {
                map.addLayer({
                    id: ENVELOPE_SETTLED_LINE_LAYER,
                    type: 'line',
                    source: ENVELOPE_SETTLED_SOURCE,
                    paint: { 'line-color': VIOLET_CSS, 'line-width': 2.5 },
                });
            }
            return true;
        } catch (e) {
            console.warn('[site][envelope-draw][2d] settled-ring layers could not be installed:', e);
            return false;
        }
    }

    // ── ⭐⭐ §ENVELOPE-ROSTER-ONE-SOURCE (L-13309) — EVERY ROSTER PROFILE, KEPT ON THE MAP ─────────
    //
    // The founder: *"When the user adds another profile - the previous profile gets deleted from the
    // view - then it is still there - but we dont render"*. The registry calls this with the WHOLE
    // roster on every roster change, so what is painted here is a function of the roster and of
    // nothing else — never of which gesture ran last or which pane won its first click.

    /** P8: `pryzm.site.envelopeDrawMap2D.drawProfileRoster`. `[]` removes the roster paint. */
    drawProfileRoster(rings: readonly EnvelopeRosterRing[]): void {
        const span = _tracer.startSpan('pryzm.site.envelopeDrawMap2D.drawProfileRoster');
        try {
            span.setAttribute('pryzm.envelopeDraw.rings', rings.length);
            const drawable = rings.filter((r) => r.ring.length >= 3);
            if (drawable.length === 0) { this.clearProfileRoster(); return; }
            // ⚠ Its OWN frame, like `drawSettledRing` — the roster repaints when nothing is armed.
            const frame = this.frame ?? this.resolveFrameNow();
            if (!frame) {
                console.warn(
                    '[site][envelope-draw][2d] §ENVELOPE-ROSTER-ONE-SOURCE the profile roster holds '
                    + `${drawable.length} ring(s) but the site frame origin is not resolvable, so none is `
                    + 'drawn on the map. The roster still holds them and the panel still lists them.',
                );
                return;
            }
            this.rosterData = {
                type: 'FeatureCollection',
                features: drawable.map((r) => {
                    const coords = r.ring.map((pt) => {
                        const ll = projectXZToLatLon(pt, frame);
                        return [ll.lon, ll.lat] as [number, number];
                    });
                    return {
                        type: 'Feature',
                        properties: { profileIds: r.profileIds.join(','), label: r.label },
                        // GeoJSON polygons close explicitly — first vertex repeated last.
                        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]!]] },
                    };
                }),
            };
            this.pushRoster();
            this.listenForStyleReload(true);
        } catch (e) {
            console.warn('[site][envelope-draw][2d] profile-roster draw failed (non-fatal):', e);
        } finally {
            span.end();
        }
    }

    /** Idempotent. Empties the roster source and stops watching for style reloads. */
    clearProfileRoster(): void {
        this.rosterData = null;
        this.listenForStyleReload(false);
        try { this.deps.map.getSource(ENVELOPE_ROSTER_SOURCE)?.setData(emptyFC()); }
        catch { /* style swapped or map disposed */ }
    }

    /** Install (if missing) and fill the roster source from the cached collection. */
    private pushRoster(): void {
        if (this.rosterData === null) return;
        if (!this.ensureRosterLayers()) return;
        try { this.deps.map.getSource(ENVELOPE_ROSTER_SOURCE)?.setData(this.rosterData); }
        catch (e) { console.warn('[site][envelope-draw][2d] roster source write failed (non-fatal):', e); }
    }

    /**
     * ⚠ THE ROSTER OUTLIVES EVERY GESTURE, so unlike the preview it cannot wait for the next draw to
     * re-install itself. `setStyle` (the Map ⇄ Satellite toggle) destroys every source; `styledata`
     * fires once the new style is in, and the roster is put back from the cache. A no-op while the
     * source is still present, so the style's other `styledata` beats cost one lookup each.
     */
    private restoreRosterAfterStyleSwap(): void {
        if (this.rosterData === null) return;
        try { if (this.deps.map.getSource(ENVELOPE_ROSTER_SOURCE)) return; }
        catch { return; }
        this.pushRoster();
    }

    private listenForStyleReload(on: boolean): void {
        const map = this.deps.map;
        try {
            if (on && !this.styleListening && typeof map.on === 'function') {
                map.on('styledata', this.onStyleData);
                this.styleListening = true;
            } else if (!on && this.styleListening) {
                if (typeof map.off === 'function') map.off('styledata', this.onStyleData);
                this.styleListening = false;
            }
        } catch { /* map disposed — nothing left to watch */ }
    }

    /**
     * The roster's source + fill + outline — the settled ring's look, which the founder called
     * "perfect" on this plan. ⭐ UNDER the live draft: when the preview's line layer already exists
     * the roster is inserted beneath it, so the line being drawn is never tinted by a finished fill.
     */
    private ensureRosterLayers(): boolean {
        try {
            const map = this.deps.map;
            if (!map.getSource(ENVELOPE_ROSTER_SOURCE)) {
                map.addSource(ENVELOPE_ROSTER_SOURCE, { type: 'geojson', data: emptyFC() });
            }
            const beforeId = map.getLayer(ENVELOPE_DRAW_LINE_LAYER) ? ENVELOPE_DRAW_LINE_LAYER : undefined;
            if (!map.getLayer(ENVELOPE_ROSTER_FILL_LAYER)) {
                map.addLayer({
                    id: ENVELOPE_ROSTER_FILL_LAYER,
                    type: 'fill',
                    source: ENVELOPE_ROSTER_SOURCE,
                    paint: { 'fill-color': VIOLET_CSS, 'fill-opacity': 0.13 },
                }, beforeId);
            }
            if (!map.getLayer(ENVELOPE_ROSTER_LINE_LAYER)) {
                map.addLayer({
                    id: ENVELOPE_ROSTER_LINE_LAYER,
                    type: 'line',
                    source: ENVELOPE_ROSTER_SOURCE,
                    paint: { 'line-color': VIOLET_CSS, 'line-width': 2.5 },
                }, beforeId);
            }
            return true;
        } catch (e) {
            console.warn('[site][envelope-draw][2d] roster layers could not be installed:', e);
            return false;
        }
    }

    // ── ARM / DISARM ────────────────────────────────────────────────────────────────────────

    /** P8: `pryzm.site.envelopeDrawMap2D.arm`. */
    arm(sink: EnvelopeDrawSink): boolean {
        const span = _tracer.startSpan('pryzm.site.envelopeDrawMap2D.arm');
        try {
            let container: HTMLElement;
            try { container = this.deps.map.getCanvasContainer(); }
            catch { return false; }
            if (!container) return false;

            const resolved = resolveSiteDrawFrame(this.deps.getOrigin(), this.deps.getSiteLocation());
            if (!resolved.ok) {
                console.warn(`[site][envelope-draw][2d] REFUSING to arm — ${resolved.reason}`);
                span.setAttribute('pryzm.envelopeDraw.armed', false);
                return false;
            }
            this.disarm();
            this.frame = resolved.frame;
            this.sink = sink;
            this.ensureLayers();

            // ⛔ CAPTURE PHASE + stopPropagation — see the header. MapLibre listens on THIS
            // container in the bubble phase, so an event consumed here never becomes a MapLibre
            // `click` and the map's single `onClick` ladder is never reached. That is how the
            // gesture takes the surface WITHOUT a second `map.on('click', …)` (L-69).
            const onClick = (ev: MouseEvent): void => {
                if (!this.sink) return;
                ev.stopPropagation();
                ev.preventDefault();
                const p = this.groundPointFromPointer(ev.clientX, ev.clientY);
                if (!p) {
                    console.warn('[site][envelope-draw][2d] the map could not resolve that point — '
                        + 'no corner was placed.');
                    return;
                }
                this.sink.onPoint(p);
            };
            const onDblClick = (ev: MouseEvent): void => {
                if (!this.sink) return;
                ev.stopPropagation();
                ev.preventDefault();
                this.sink.onFinish();
            };
            const onMove = (ev: MouseEvent): void => {
                // ⛔ NOT consumed. A move must still reach MapLibre or panning and its own hover
                // cues die — and the gesture only needs to WATCH it.
                this.sink?.onMove(this.groundPointFromPointer(ev.clientX, ev.clientY));
            };
            const onKey = (ev: KeyboardEvent): void => {
                if (!this.sink) return;
                if (ev.key === 'Enter') { ev.preventDefault(); this.sink.onFinish(); }
                else if (ev.key === 'Escape') { ev.preventDefault(); this.sink.onCancel(); }
                else if (ev.key === 'Backspace') { ev.preventDefault(); this.sink.onUndo(); }
            };

            container.addEventListener('click', onClick, true);
            container.addEventListener('dblclick', onDblClick, true);
            container.addEventListener('mousemove', onMove, true);
            window.addEventListener('keydown', onKey);
            container.style.cursor = 'crosshair';

            this.detach = [
                () => container.removeEventListener('click', onClick, true),
                () => container.removeEventListener('dblclick', onDblClick, true),
                () => container.removeEventListener('mousemove', onMove, true),
                () => window.removeEventListener('keydown', onKey),
                () => { container.style.cursor = ''; },
            ];

            // ⭐ §ENVELOPE-DRAW-LIVE-DIMS (L-13308) — the chips follow the camera. `move` is a RENDER
            // event, not an input: it consumes nothing and reaches no click ladder (L-69), and it is
            // released with the gesture through the same detach list as every DOM listener above.
            const map = this.deps.map;
            if (typeof map.on === 'function') {
                map.on('move', this.onCameraMove);
                this.detach.push(() => { if (typeof map.off === 'function') map.off('move', this.onCameraMove); });
            }

            console.log(
                `[site][envelope-draw][2d] armed · origin ${resolved.frame.origin.lat.toFixed(6)},`
                + `${resolved.frame.origin.lon.toFixed(6)} · θ=${resolved.frame.thetaRad.toFixed(4)} rad. `
                + 'Click corners; double-click or Enter closes; Backspace undoes; Esc cancels. '
                + 'Pan stays live; the map’s own click ladder is yielded for the duration. '
                + '⚠ Height is NOT drawn here — a plan map has no vertical axis (L-13045); the '
                + 'storey count on the panel supplies it.',
            );
            span.setAttribute('pryzm.envelopeDraw.armed', true);
            span.setAttribute('pryzm.envelopeDraw.thetaRad', resolved.frame.thetaRad);
            return true;
        } catch (e) {
            console.warn('[site][envelope-draw][2d] arm failed (non-fatal):', e);
            return false;
        } finally {
            span.end();
        }
    }

    /** Idempotent. Restores the map's own click ladder by removing the capture listeners. */
    disarm(): void {
        const span = _tracer.startSpan('pryzm.site.envelopeDrawMap2D.disarm');
        try {
            const wasArmed = this.sink !== null;
            this.sink = null;
            this.frame = null;
            for (const off of this.detach) {
                try { off(); } catch { /* container already gone */ }
            }
            this.detach = [];
            this.clearPreview();
            span.setAttribute('pryzm.envelopeDraw.wasArmed', wasArmed);
        } finally {
            span.end();
        }
    }
}
