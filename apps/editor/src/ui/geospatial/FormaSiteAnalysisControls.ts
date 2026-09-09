/**
 * FormaSiteAnalysisControls.ts — FORMA.5 (SPEC-FORMA-SITE-VIEW.md §6)
 *
 * The "interrogate the site" analysis chrome for the 3D Cesium Forma view:
 * sun · shadow · climate · wind. This is a thin, READ-ONLY consumer surface —
 * it owns NO analysis math. It drives the CesiumViewport's sun light and surfaces
 * the existing climate / wind substrate:
 *
 *   1. Time/season scrubber  — date picker + time-of-day slider + season presets
 *                              + a "shadow study" day-sweep. Moving it calls
 *                              `viewport.setFormaSunTime(date)` → the sun vector
 *                              recomputes → the FORMA.2 soft shadows move live.
 *   2. Climate side-card     — a compact button that opens the existing
 *                              `ClimatePanel` (temperature / sun-path / wind),
 *                              wired to the same runtime. No data is rebuilt.
 *   3. Wind-rose overlay     — a small SVG rose rendered from the site's
 *                              `ClimateStore` `WindRoseAggregate` via the pure
 *                              `windRoseBars` / `windBarEndpoint` helpers (the
 *                              SAME ones the ClimatePanel uses). Graceful
 *                              "no wind data" state when nothing is ingested.
 *
 * BRAND: minimal white + #6600FF chrome (mirrors the FORMA.3 [Plan][3D] toggle).
 * Mounted only while the Forma 3D site view is active; `dispose()` removes every
 * node + drops the sun subscription so nothing leaks on view exit.
 *
 * GRACEFUL DEGRADATION (SPEC §6): a missing viewport, missing runtime, missing
 * site location, or missing climate dataset each degrades to a quiet "no data"
 * state — it never blocks the view or throws.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { ClimateDataset, SiteId } from '@pryzm/schemas';
// §L-621a — the SHARED floating-panel drag utility (same one ClimatePanel /
// DesignParamsPanel / the Buildable-Envelope card use). Re-evaluates the handle on
// each mousedown, so it survives this panel's per-render node swaps.
import { makeDraggable } from '../makeDraggable';
// §UX1-PANEL-DEFAULTS — the start-up open/closed decision for this panel lives in ONE
// table (`layout/panelDefaults.ts`), not in this file's `_userHidden` initialiser. C82 §1.1.
import { panelDefaultOpen, setPanelOpen, isPanelOpen } from '../layout/panelDefaults';
// C06 §7.3 — no raw z-index literals in edited UI chrome; the panel band is a named token.
import { zCss } from '../layout/zLayers';
import {
    openClimatePanel,
    closeClimatePanel,
    isClimatePanelOpen,
    wireClimateRuntime,
} from '../climate/ClimatePanel';
import {
    windRoseBars,
    windBarEndpoint,
    monthlyTempSeries,
} from '../climate/climateChartData';
import { getCurrentSiteOrigin } from '../site/siteDispatch';
// §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — the shared single source of truth
// for Sun/Shadow/Wind. This panel publishes the scrubbed sun time-of-day into it so the
// View Properties panel and the Site Analysis panel never diverge on the sun.
import { environmentAnalysisStore } from '../../engine/views/environmentAnalysisStore';
// §SITE-METRIC-WIND-CONTRAST — the pure OFFLINE bundled-normals ClimateDataset builder
// (lat/lon → 12 monthly normals + a synthesised 16-sector wind rose). Used to give the
// wind-rose PANEL (and its mean/prevailing readout) a real DIRECTIONAL rose the instant
// a site location exists, instead of latching on an EMPTY "Wind data loading…" rose
// while the async ClimateStore ingest lands — the SAME bundled path the metric grid
// already uses, so the panel rose and the map field agree.
import { buildFallbackClimateDataset } from '@pryzm/climate-host';
// §SITE-METRIC-HEATMAP — pure metric availability + legend helpers for the Hektar/
// Forma-style switchable ground heatmap (the math lives in @pryzm/street-analytics).
import {
    siteMetricAvailability,
    siteMetricLegend,
    buildRealWindRose,
    type SiteMetric,
    type MetricAvailability,
} from '../climate/siteMetricGrids';
// §ANALYSIS-REAL-* (ADR-0095) — synchronous peeks of the REAL free-dataset cache (NASA
// POWER climate + WorldPop population) so the panel captions + wind rose report REAL
// provenance when live data has landed, and an honest "estimate" otherwise.
import {
    peekRealClimateBaseline,
    peekRealPopulationSample,
} from '../climate/siteRealData';
// §FACADE-STUDY-SUBJECT (L-596) — the subject type + its user-facing labels. The REFUSAL wording
// lives in that module too, so the panel never invents its own explanation of a missing input.
import type { FacadeStudySubject } from './facadeStudySubject';
// §CADASTRAL-BOUNDARIES (C57 §5.5, lane CADASTRAL-COVERAGE) — the surrounding parcels' boundary
// lines. ⛔ THE FLAG IS NOT ON THE VIEWPORT, unlike every other toggle in this block. The same
// switch is offered on the 2D MapLibre site map, and THIS PANEL IS NOT MOUNTED THERE
// (`formaViewMode !== 'map2d'`), so a viewport-local boolean could not be read by the other chip
// and the two would drift (C59 §2.10 / [[view-region-one-owner]]).
import {
    getCadastralBoundariesEnabled,
    toggleCadastralBoundaries,
    subscribeCadastralBoundaries,
    getCadastralBoundariesVerdict,
    cadastralBoundariesSentence,
    cadastralBoundariesChipEnabled,
    describeCadastralBoundaryReach,
} from '../site/cadastralBoundariesLayer.js';
import { refreshCadastralBoundaries } from './cadastralBoundaries.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ACCENT = '#6600FF';
/** 6 speed-band shades (calm → gust), light→dark on the #6600FF accent. */
const WIND_BAND_COLORS = [
    '#d9cffb', '#b79bf6', '#9569f0', '#7a3eea', '#6600FF', '#4b00bf',
] as const;

/** The minimal subset of CesiumViewport this controller drives (FORMA.5 API). */
export interface FormaSunViewport {
    setFormaSunTime(date: Date): void;
    getFormaSunTime(): Date;
    getFormaSunPosition(): { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean } | null;
    onFormaSunChange(
        fn: (p: { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean; date: Date }) => void,
    ): () => void;
    // A.21.D24 — 3D climate-analysis overlays (OPTIONAL: degrade gracefully when
    // a viewport doesn't implement them, e.g. a test stub or an older build).
    setClimateOverlayDataset?(ds: ClimateDataset | null): void;
    setSunPathOverlay?(on: boolean): void;
    setWindOverlay?(on: boolean): void;
    setHeatOverlay?(on: boolean): void;
    // §SITE-METRIC-HEATMAP — switchable Hektar/Forma-style ground heatmap. Selecting
    // a ground-grid metric (temperature / wind / population) paints it; null clears.
    setSiteMetricOverlay?(metric: SiteMetric | null): void;
    getSiteMetricOverlay?(): SiteMetric | null;
    setSiteMetricSunDay?(day: 'summer' | 'equinox' | 'winter'): void;
    // §FORMA-FACADE-ANALYSIS (ADR-0093) — on-demand sun-hours on the DESIGNED
    // building's outer façade + roof (DEFAULT OFF). Optional: degrade gracefully when
    // the viewport doesn't implement it (test stub / older build).
    setFacadeAnalysis?(on: boolean): void;
    getFacadeAnalysis?(): boolean;
    // §FACADE-STUDY-SUBJECT (L-596) — WHAT the sun study runs on: the DESIGNED BUILDING
    // (default) or the BUILDABLE ENVELOPE (pre-planning). ⚠ The choice is the USER's; the
    // viewport never substitutes one for the other (see L-272 / facadeStudySubject.ts).
    setFacadeStudySubject?(subject: FacadeStudySubject): void;
    getFacadeStudySubject?(): FacadeStudySubject;
    // §CTX-USE-COLOUR (L-599) — colour context buildings by their ACTUAL OSM use. A MODE:
    // turning it off restores the scene's previous appearance exactly.
    setContextUseColouring?(on: boolean): void;
    getContextUseColouring?(): boolean;
    // §TERRAIN-TOGGLE (founder 2026-07-27) — the user TERRAIN ON/OFF control for the 3D Site.
    // OFF detaches the baked terrain (flat ellipsoid ground) so high-relief cities can be studied
    // without terrain; ON re-attaches. Default ON. Optional so older builds / test stubs degrade.
    setFormaTerrainEnabled?(on: boolean): void;
    isFormaTerrainEnabled?(): boolean;
    // §STREET-LIFE (L-12936, founder 2026-09-05: "pedestrians but also street lighting") — the
    // street lamps + pedestrians layer. DEFAULT ON. ⚠ It is SCENERY, not data: mapped OSM lamps are
    // drawn where the baked `furniture` layer has them and the rest is synthesised off the road
    // network, which is why it gets a user switch at all — a study that must show only surveyed
    // objects turns it OFF. Optional so older builds / test stubs degrade to a disabled chip.
    setStreetLifeEnabled?(on: boolean): void;
    isStreetLifeEnabled?(): boolean;
}

/** Season presets → a representative day (UTC midnight) of the current year. */
const SEASON_DAYS: ReadonlyArray<{ label: string; month: number; day: number }> = [
    { label: 'Spring', month: 2, day: 20 }, // Mar 20
    { label: 'Summer', month: 5, day: 21 }, // Jun 21
    { label: 'Autumn', month: 8, day: 22 }, // Sep 22
    { label: 'Winter', month: 11, day: 21 }, // Dec 21
];

export class FormaSiteAnalysisControls {
    private readonly viewport: FormaSunViewport;
    private readonly runtime: PryzmRuntime | null;
    private readonly mountTarget: HTMLElement;

    private root: HTMLElement | null = null;
    private timeSlider: HTMLInputElement | null = null;
    private dateInput: HTMLInputElement | null = null;
    private sunReadout: HTMLElement | null = null;
    private windWrap: HTMLElement | null = null;
    private windNote: HTMLElement | null = null;
    private weatherWrap: HTMLElement | null = null;
    private climateNote: HTMLElement | null = null;
    private studyBtn: HTMLButtonElement | null = null;
    /** §SITE-METRIC-HEATMAP — the metric-switcher chip row + legend host + state. */
    private metricChipRow: HTMLElement | null = null;
    private metricLegendWrap: HTMLElement | null = null;
    private activeMetric: SiteMetric | null = null;
    /** Sun-hours analysis-day preset row + current preset (default summer solstice). */
    private sunDayRow: HTMLElement | null = null;
    private sunDay: 'summer' | 'equinox' | 'winter' = 'summer';
    /** §FORMA-FACADE-ANALYSIS — the "Analyse building façade" toggle row + state. The
     *  toggle is DEFAULT OFF (analysis paints only on the ground); shown only while the
     *  sun-hours heatmap is active (façade priority metric = sun-hours). */
    private facadeRow: HTMLElement | null = null;
    private facadeOn = false;
    /**
     * §FACADE-STUDY-SUBJECT (L-596) — which subject the façade study runs on. DEFAULT 'building'
     * (unchanged behaviour). Rendered as TWO EXPLICIT buttons, never as an automatic fallback:
     * an envelope study and a building façade study answer different questions, and L-272 records
     * what happens when the code decides that for the user.
     */
    private facadeSubject: FacadeStudySubject = 'building';
    /** §CTX-USE-COLOUR (L-599) — the "colour by use" mode row + state. DEFAULT OFF. */
    private useColourRow: HTMLElement | null = null;
    private useColourOn = false;
    /** Guards a single proactive `ensureSiteClimate` per mount (avoid loops). */
    private climateEnsureRequested = false;
    /** §CADASTRAL-BOUNDARIES — unsubscribe from the ONE owner; disposed with the panel. */
    private cadastralBoundariesSub: (() => void) | null = null;
    /** SITE-PANEL-UI — user dismissed the panel (✕). STATIC so the choice persists
     *  across the dispose→new→mount cycle the Forma view does on every Plan/3D
     *  activation (a per-instance field would reset to "shown" on each switch).
     *
     *  §UX1-PANEL-DEFAULTS — this literal WAS `false`, i.e. "open on every start".
     *  It is now seeded from `panelDefaults.PANEL_REGISTRY` ('site-analysis' →
     *  CLOSED) so the start-up state is declared in ONE table rather than in this
     *  file's initialiser, and `show`/`hide` write back so the reopen pill and the
     *  `Reset panel layout` control read the same fact this field does (C82 §1.1:
     *  the pill is this panel's only route back, so the two must never disagree). */
    private static _userHidden = !panelDefaultOpen('site-analysis');

    private sunUnsub: (() => void) | null = null;
    private climateUnsub: (() => void) | null = null;
    private studyTimer: number | null = null;
    /** §L-621a — disposer for the shared makeDraggable listeners on this panel. */
    private dragDispose: (() => void) | null = null;

    constructor(
        viewport: FormaSunViewport,
        runtime: PryzmRuntime | null,
        mountTarget: HTMLElement,
    ) {
        this.viewport = viewport;
        this.runtime = runtime;
        this.mountTarget = mountTarget;
    }

    /** Build + mount the analysis chrome. Idempotent (re-mount removes the old). */
    mount(): void {
        this.dispose();
        // Wire the ClimatePanel singleton to this runtime so the side-card reads
        // the right site/climate state.
        try { wireClimateRuntime(this.runtime); } catch { /* ignore */ }

        const root = document.createElement('div');
        root.className = 'pryzm-forma-analysis';
        root.setAttribute('data-testid', 'forma-analysis-controls');
        Object.assign(root.style, {
            // §UX1-PANEL-CHROME — every literal below that describes DENSITY (width,
            // padding, gap, radius, shadow, type size) now reads the shared
            // `--pryzm-panel-*` tokens in `styles/tokens.ts`, so this panel and the
            // Buildable-Envelope card stop being two independent opinions about what a
            // floating site panel looks like — and so the §UI-DENSITY-SCALE lever
            // reaches them at all (it rewrites the injected stylesheet, which inline
            // literals like the old `232px` / `12px` were never part of). C06 §6.
            // §UX1-PANEL-COLUMN (C06 §7.2) — the BOTTOM slot of the declared right-edge
            // column. Paired with the Buildable-Envelope card's TOP slot; the two tile at
            // 50vh and can no longer overlap (they previously both claimed the full height).
            position: 'absolute', bottom: 'var(--pryzm-panel-col-bottom)', right: '14px',
            zIndex: zCss('panel'),
            width: 'var(--pryzm-panel-width)', display: 'flex', flexDirection: 'column',
            gap: 'var(--pryzm-panel-gap)',
            padding: 'var(--pryzm-panel-pad)',
            background: 'var(--pryzm-panel-surface)',
            borderRadius: 'var(--pryzm-panel-radius)',
            boxShadow: 'var(--pryzm-panel-shadow)',
            border: 'var(--pryzm-panel-border)',
            font: '500 var(--pryzm-panel-font-size-body)/1.35 system-ui, sans-serif',
            color: 'var(--pryzm-panel-ink)',
            // §L-621a — user-RESIZABLE via the same CSS `resize: both` pattern the
            // Buildable-Envelope card uses (GISAreaLayout `ensureEnvelopePanel`). A hard
            // minWidth keeps it from collapsing to a sliver; maxHeight + overflow keep a
            // tall panel (many analysis blocks) on-screen and give the grip something to
            // scroll. `resize` needs a non-visible overflow to take effect.
            minWidth: 'var(--pryzm-panel-min-width)', maxWidth: '92vw',
            maxHeight: 'var(--pryzm-panel-col-max-height-bottom)',
            boxSizing: 'border-box', overflow: 'auto', resize: 'both',
        } satisfies Partial<CSSStyleDeclaration>);

        root.appendChild(this.buildHeader());
        root.appendChild(this.buildSunBlock());
        root.appendChild(this.buildClimateBlock());
        root.appendChild(this.buildWindBlock());
        root.appendChild(this.build3dLayersBlock());
        root.appendChild(this.buildMetricSwitcherBlock());

        this.mountTarget.appendChild(root);
        this.root = root;
        // SITE-PANEL-UI — honour a prior ✕ dismissal when the view re-mounts.
        // ⚠ §PANEL-ABSENT-IS-SKIP-MOUNT WAS APPLIED HERE AND IS WITHDRAWN (L-13297, 2026-09-09).
        // A `panelAbsent('site-analysis')` skip-mount was added here on the same reasoning as the
        // envelope card's, and it was WRONG FOR THE SAME REASON: `setAppPhase('canvas')` fires
        // only when onboarding DISPOSES or a BIM view activates, so the phase is still
        // `'onboarding-globe'` throughout the site-authoring session — and this panel would have
        // stopped mounting on the very surface it belongs to.
        // ⛔ The registry row IS still unenforced for this panel, and that residue is real: it can
        // still appear over the full-bleed globe. But it is a COSMETIC defect the founder has not
        // reported, and shipping a second guard on a phase model that has already broken his
        // panel once would be trading a real regression for a cosmetic fix. It returns when the
        // phase can answer "is the onboarding globe ON SCREEN RIGHT NOW" rather than "has
        // onboarding finished" — those are different questions and only the first one is the rule.
        if (FormaSiteAnalysisControls._userHidden) root.style.display = 'none';

        // §L-621a — MOVABLE by dragging the header (the SAME shared helper ClimatePanel
        // uses). The handle is resolved lazily on each mousedown, so it survives the
        // per-block re-renders; the ✕ is excluded so closing never starts a drag.
        try {
            this.dragDispose = makeDraggable(root, '.fsa-header', ['.fsa-close'], this.runtime);
        } catch (e) {
            console.warn('[forma-analysis] makeDraggable wiring failed (non-fatal):', e);
        }

        // Live readout + slider follow the viewport's solved sun.
        try {
            this.sunUnsub = this.viewport.onFormaSunChange((p) => this.refreshSunReadout(p));
        } catch (e) {
            console.warn('[forma-analysis] onFormaSunChange failed:', e);
        }
        // Refresh the wind rose + weather card when climate / site changes.
        //
        // A.21.D24 — wind-rose firing fix. The handlers below do two distinct jobs:
        //   • `refresh` (climate store) repaints the rose + weather card once a
        //     ClimateDataset lands. This already worked.
        //   • `onSiteChange` (site store + `site.location-changed` event) is the
        //     NEW piece: it repaints AND re-attempts `ensureClimateIfMissing`.
        //     In the house onboarding handoff the panel mounts BEFORE the site's
        //     location is set, so the once-per-mount `ensureClimateIfMissing()` in
        //     `mount()` finds no site, flips its guard, and never retries — the
        //     rose then sits on "No wind data" forever even after the origin lands.
        //     Re-running the ingest when the site/origin arrives ingests the bundled
        //     normals instantly → the climate subscription repaints the rose.
        try {
            const refresh = () => { this.renderWindRose(); this.renderWeatherCard(); this.refreshMetricSwitcher(); };
            const onSiteChange = () => {
                this.climateEnsureRequested = false;
                this.ensureClimateIfMissing();
                refresh();
            };
            const disposers: Array<() => void> = [];
            if (this.runtime) {
                try { disposers.push(this.runtime.climateStore.subscribe(refresh)); } catch { /* ignore */ }
                try { disposers.push(this.runtime.siteModelStore.subscribe(onSiteChange)); } catch { /* ignore */ }
                // Belt-and-suspenders: the LTP-ENU origin fallback (getCurrentSiteOrigin)
                // can resolve a location even when getLocation() still races null, so
                // also listen to the explicit domain event the GIS handoff emits.
                try {
                    const off = this.runtime.events?.on?.('site.location-changed', onSiteChange);
                    if (typeof off === 'function') disposers.push(off);
                } catch { /* ignore */ }
            }
            this.climateUnsub = () => disposers.forEach((d) => { try { d(); } catch { /* ignore */ } });
        } catch { /* ignore */ }

        // Seed from the viewport's current sun datetime + draw the initial rose + weather.
        this.syncControlsFromViewport();
        this.renderWindRose();
        this.renderWeatherCard();
        // A.21.D23 — make CLIMATE · WIND · WEATHER show LIVE: if the site has no
        // climate dataset yet (the panel mounted before / independently of the
        // GISAreaLayout fire-and-forget, or that call raced the location), kick a
        // proactive ingest here so the wind rose + weather card never sit empty
        // when a site IS authored. The climateStore.subscribe() above repaints
        // both the moment the dataset lands (bundled = instant, offline).
        this.ensureClimateIfMissing();
        console.log('[forma-analysis] mounted (sun scrubber + climate card + wind rose + weather).');
    }

    /** Remove every node, stop any running shadow study, drop subscriptions. */
    dispose(): void {
        this.stopShadowStudy();
        // §L-621a — drop the drag listeners before the node is removed.
        if (this.dragDispose) { try { this.dragDispose(); } catch { /* ignore */ } this.dragDispose = null; }
        if (this.sunUnsub) { try { this.sunUnsub(); } catch { /* ignore */ } this.sunUnsub = null; }
        if (this.climateUnsub) { try { this.climateUnsub(); } catch { /* ignore */ } this.climateUnsub = null; }
        // §CADASTRAL-BOUNDARIES — drop the subscription to the ONE owner. ⛔ The FLAG is NOT
        // cleared here, unlike the viewport overlays below: it is shared with the 2D site map, and
        // turning it off because this panel unmounted would silently switch off a layer the user
        // asked for in the other view. Unmounting a chip is not the user changing their mind.
        if (this.cadastralBoundariesSub) {
            try { this.cadastralBoundariesSub(); } catch { /* ignore */ }
            this.cadastralBoundariesSub = null;
        }
        // A.21.D24 — turn off any active 3D overlays so they don't linger when the
        // panel is removed (e.g. switching to the 2D map view). The viewport keeps
        // running; only this panel's overlay layers are cleared.
        try {
            this.viewport.setSunPathOverlay?.(false);
            this.viewport.setWindOverlay?.(false);
            this.viewport.setHeatOverlay?.(false);
            // §SITE-METRIC-HEATMAP — clear any active ground heatmap on view exit.
            this.viewport.setSiteMetricOverlay?.(null);
            // §FORMA-FACADE-ANALYSIS — clear the façade study on view exit.
            this.viewport.setFacadeAnalysis?.(false);
            // §CTX-USE-COLOUR (L-599) — leave the scene EXACTLY as we found it. The mode is
            // analysis chrome, so unmounting it must restore the base massing appearance rather
            // than leaving a coloured city behind with no legend to explain it.
            this.viewport.setContextUseColouring?.(false);
        } catch { /* ignore */ }
        try { if (isClimatePanelOpen()) closeClimatePanel(); } catch { /* ignore */ }
        if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
        this.root = null;
        this.timeSlider = null;
        this.dateInput = null;
        this.sunReadout = null;
        this.windWrap = null;
        this.windNote = null;
        this.weatherWrap = null;
        this.climateNote = null;
        this.studyBtn = null;
        this.metricChipRow = null;
        this.metricLegendWrap = null;
        this.sunDayRow = null;
        this.facadeRow = null;
        this.facadeOn = false;
        this.facadeSubject = 'building';
        this.useColourRow = null;
        this.useColourOn = false;
        this.activeMetric = null;
        this.climateEnsureRequested = false;
    }

    // ── Proactive climate load (A.21.D23) ────────────────────────────────────

    /**
     * If a site is authored but no ClimateDataset is resolvable yet, run the
     * L5 `ensureSiteClimate` adapter once. Bundled offline normals land
     * instantly (no network) so the wind rose + weather card populate; the
     * live measured upgrade then arrives in the background. The store
     * subscription wired in `mount()` repaints both on ingest. No-ops when
     * there is no runtime, no site, or a dataset already exists.
     */
    private ensureClimateIfMissing(): void {
        if (this.climateEnsureRequested) return;
        const rt = this.runtime;
        if (!rt) return;
        // Already have data → no ingest needed, but STILL repaint. §A.21.D40(#6):
        // a dataset can already be present here because `GISAreaLayout.mountFormaAnalysis`
        // fires a standalone `ensureSiteClimate(runtime)` IN PARALLEL with constructing
        // these controls; if that ingest's `climateStore._notify()` fired in the gap
        // BEFORE this panel subscribed, the subscription repaint was missed and the
        // synchronous mount-render painted the empty state. Repaint now (idempotent)
        // so the rose + weather card + 3D overlay never latch empty over live data.
        if (this.resolveDataset()) { this.renderWindRose(); this.renderWeatherCard(); return; }
        // Attempt when a site OR a resolvable location exists. §A.21.D33(f):
        // the house/onboarding handoff can set the LTP-ENU origin (map shows
        // lat/lon) BEFORE a Site aggregate is created — `ensureSiteClimate` now
        // creates the Site from that origin so the dataset can key to it. Only
        // skip when there is genuinely no location anywhere (empty state correct).
        let hasLocation = false;
        try {
            const loc = rt.siteModelStore.getLocation?.();
            hasLocation = !!(loc && (loc.latitude !== 0 || loc.longitude !== 0));
        } catch { hasLocation = false; }
        if (!hasLocation) {
            const ltp = getCurrentSiteOrigin();
            hasLocation = !!(ltp && (ltp.lat !== 0 || ltp.lon !== 0));
        }
        if (!hasLocation) {
            try { hasLocation = !!rt.siteModelStore.getSite(); } catch { /* ignore */ }
        }
        if (!hasLocation) return;
        this.climateEnsureRequested = true;
        import('../climate/ensureSiteClimate')
            .then(({ ensureSiteClimate }) => ensureSiteClimate(rt))
            .then((ok) => {
                console.log(`[forma-analysis] proactive ensureSiteClimate → ${ok ? 'dataset present' : 'no location/site'}.`);
                // §A.21.D39(#7) — explicitly repaint after the async ingest settles.
                // On the generate-house → Forma flow the Site/location were set long
                // before this view opened, so NO further site/location event fires to
                // re-trigger the climateStore.subscribe() repaint. ensureSiteClimate
                // here AUTO-CREATES the Site (when only an LTP origin existed) and
                // ingests the bundled dataset; resolveDataset() is null until that
                // Site exists, so paint NOW that it does — otherwise the rose stays on
                // "No wind data" even though the dataset landed. Also re-feeds the 3D
                // wind/heat overlays via renderWindRose → syncOverlayDataset.
                if (ok) { this.renderWindRose(); this.renderWeatherCard(); }
                // If ensureSiteClimate could not key a Site yet (e.g. projectId not
                // resolvable at this instant), allow ONE more attempt the next time a
                // site/location signal arrives rather than latching the guard forever.
                else { this.climateEnsureRequested = false; }
            })
            .catch((e) => {
                console.warn('[forma-analysis] ensureSiteClimate failed:', e);
                this.climateEnsureRequested = false;
            });
    }

    // ── Header (title + close ✕) ─────────────────────────────────────────────

    /** SITE-PANEL-UI — a compact header bar with the panel title and a close ✕.
     *  ✕ hides the panel (display:none) and remembers the choice so re-entering
     *  the Forma view keeps it hidden until the toolbar toggle re-opens it. */
    private buildHeader(): HTMLElement {
        const header = document.createElement('div');
        // §L-621a — `.fsa-header` is the makeDraggable grip (wired in mount()); `cursor:move`
        // advertises the drag affordance, matching ClimatePanel's `.clm-header`.
        header.className = 'fsa-header';
        Object.assign(header.style, {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '8px', marginBottom: '2px', cursor: 'move',
        } satisfies Partial<CSSStyleDeclaration>);
        const title = document.createElement('div');
        title.textContent = 'Site analysis';
        Object.assign(title.style, {
            font: '600 var(--pryzm-panel-font-size-title)/1 system-ui',
            color: 'var(--pryzm-panel-ink)', letterSpacing: '0.01em',
        } satisfies Partial<CSSStyleDeclaration>);
        const close = document.createElement('button');
        close.type = 'button';
        // §L-621a — keep the historic class (existing selectors) AND add `.fsa-close` so it
        // is in makeDraggable's exclude list — a click on ✕ closes, never starts a drag.
        close.className = 'pryzm-forma-analysis-close fsa-close';
        close.setAttribute('data-testid', 'forma-analysis-close');
        close.title = 'Hide site analysis';
        close.setAttribute('aria-label', 'Hide site analysis');
        close.textContent = '✕';
        Object.assign(close.style, {
            appearance: 'none', cursor: 'pointer', border: 'none', borderRadius: '6px',
            background: 'transparent', color: '#8a83a6', font: '700 14px/1 system-ui',
            padding: '2px 6px', lineHeight: '1',
        } satisfies Partial<CSSStyleDeclaration>);
        close.addEventListener('mouseenter', () => { close.style.background = '#f1ebff'; close.style.color = ACCENT; });
        close.addEventListener('mouseleave', () => { close.style.background = 'transparent'; close.style.color = '#8a83a6'; });
        close.addEventListener('click', () => this.hide());
        header.appendChild(title);
        header.appendChild(close);
        return header;
    }

    /** SITE-PANEL-UI — show the panel (clears the user-hidden flag). */
    show(): void {
        FormaSiteAnalysisControls._userHidden = false;
        setPanelOpen('site-analysis', true);
        if (this.root) this.root.style.display = 'flex';
    }

    /** SITE-PANEL-UI — hide the panel via ✕ or the toolbar toggle. */
    hide(): void {
        FormaSiteAnalysisControls._userHidden = true;
        setPanelOpen('site-analysis', false);
        if (this.root) this.root.style.display = 'none';
    }

    /** §UX1-PANEL-DEFAULTS — re-seat this panel on `Reset panel layout`: back to the
     *  declared default AND back to its authored geometry (the panel is draggable +
     *  `resize: both`, so a user who parked it off-screen needs the size/position
     *  cleared too, not just the visibility). */
    static applyPanelLayoutReset(instance: FormaSiteAnalysisControls | null): void {
        FormaSiteAnalysisControls._userHidden = !isPanelOpen('site-analysis');
        const root = instance?.root;
        if (!root) return;
        root.style.display = FormaSiteAnalysisControls._userHidden ? 'none' : 'flex';
        root.style.left = '';
        root.style.top = '';
        root.style.width = '';
        root.style.height = '';
    }

    /** SITE-PANEL-UI — toggle visibility; returns the new visible state. */
    toggle(): boolean {
        if (this.isVisible()) { this.hide(); return false; }
        this.show();
        return true;
    }

    /** SITE-PANEL-UI — true when the panel exists and is not display:none. */
    isVisible(): boolean {
        return !!this.root && this.root.style.display !== 'none';
    }

    // ── Sun / shadow scrubber ────────────────────────────────────────────────

    private buildSunBlock(): HTMLElement {
        const block = this.sectionBlock('☀ Sun & shadow');

        // Date row.
        const dateRow = document.createElement('div');
        Object.assign(dateRow.style, { display: 'flex', alignItems: 'center', gap: '6px' });
        const date = document.createElement('input');
        date.type = 'date';
        date.className = 'pryzm-forma-date';
        Object.assign(date.style, {
            flex: '1', border: '1px solid #e3dcfa', borderRadius: '6px',
            padding: '4px 6px', font: 'inherit', color: '#2a2240',
        } satisfies Partial<CSSStyleDeclaration>);
        date.addEventListener('change', () => this.onDateChange());
        this.dateInput = date;
        dateRow.appendChild(date);
        block.appendChild(dateRow);

        // Season presets.
        const seasons = document.createElement('div');
        Object.assign(seasons.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });
        for (const s of SEASON_DAYS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = s.label;
            Object.assign(b.style, {
                flex: '1', minWidth: '44px', appearance: 'none', cursor: 'pointer',
                border: '1px solid #e3dcfa', borderRadius: '6px', background: '#faf8ff',
                color: ACCENT, font: '600 11px/1 system-ui', padding: '5px 4px',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { b.style.background = '#f1ebff'; });
            b.addEventListener('mouseleave', () => { b.style.background = '#faf8ff'; });
            b.addEventListener('click', () => this.applySeason(s.month, s.day));
            seasons.appendChild(b);
        }
        block.appendChild(seasons);

        // Time-of-day slider.
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1439'; // minutes of day
        slider.step = '5';
        slider.className = 'pryzm-forma-time';
        Object.assign(slider.style, { width: '100%', accentColor: ACCENT, cursor: 'pointer' });
        slider.addEventListener('input', () => this.onTimeSlide());
        this.timeSlider = slider;
        block.appendChild(slider);

        // Readout + shadow-study toggle.
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' });
        const readout = document.createElement('span');
        readout.className = 'pryzm-forma-sun-readout';
        Object.assign(readout.style, { color: '#6b6486', font: '500 11px/1.2 system-ui' });
        readout.textContent = '—';
        this.sunReadout = readout;
        const study = document.createElement('button');
        study.type = 'button';
        study.className = 'pryzm-forma-shadow-study';
        study.title = 'Sweep the day to study shadows';
        study.textContent = '▶ Study';
        Object.assign(study.style, {
            appearance: 'none', cursor: 'pointer', border: 'none', borderRadius: '6px',
            background: ACCENT, color: '#fff', font: '600 11px/1 system-ui', padding: '6px 9px',
        } satisfies Partial<CSSStyleDeclaration>);
        study.addEventListener('click', () => this.toggleShadowStudy());
        this.studyBtn = study;
        row.appendChild(readout);
        row.appendChild(study);
        block.appendChild(row);

        return block;
    }

    /** Read the viewport's current sun datetime into the date input + slider. */
    private syncControlsFromViewport(): void {
        let d: Date;
        try { d = this.viewport.getFormaSunTime(); } catch { d = new Date(); }
        if (this.dateInput) this.dateInput.value = toDateInputValue(d);
        if (this.timeSlider) this.timeSlider.value = String(d.getUTCHours() * 60 + d.getUTCMinutes());
        const pos = (() => { try { return this.viewport.getFormaSunPosition(); } catch { return null; } })();
        this.refreshSunReadout(pos ? { ...pos, date: d } : null);
    }

    private currentScrubDate(): Date {
        // Compose the date (from the date input) + time-of-day (from the slider),
        // interpreted in UTC so it matches `solarSample`'s UTC contract.
        const base = this.dateInput?.value
            ? new Date(`${this.dateInput.value}T00:00:00.000Z`)
            : new Date();
        const minutes = this.timeSlider ? Number(this.timeSlider.value) : 600;
        const d = new Date(base.getTime());
        d.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        return d;
    }

    private pushSunTime(): void {
        const date = this.currentScrubDate();
        try { this.viewport.setFormaSunTime(date); } catch (e) {
            console.warn('[forma-analysis] setFormaSunTime failed:', e);
        }
        // §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — the sun is a SHARED
        // analysis property with ONE source of truth. This panel is the PRODUCER of the
        // sun time-of-day: publish the scrubbed hour into `environmentAnalysisStore` so
        // the BIM View Properties panel's sun follows the site scrubber (and never shows
        // a divergent second copy). One-directional (produce, don't subscribe-writeback)
        // so the Cesium scrubber can never enter a feedback loop with the store.
        try {
            const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
            environmentAnalysisStore.setSunTime(hours, 'site-analysis');
        } catch { /* ignore — the store never blocks the viewport */ }
    }

    private onDateChange(): void { this.stopShadowStudy(); this.pushSunTime(); }
    private onTimeSlide(): void { this.stopShadowStudy(); this.pushSunTime(); }

    private applySeason(month: number, day: number): void {
        this.stopShadowStudy();
        const year = new Date().getUTCFullYear();
        const d = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        if (this.dateInput) this.dateInput.value = toDateInputValue(d);
        this.pushSunTime();
    }

    private refreshSunReadout(
        p: { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean; date: Date } | null,
    ): void {
        if (!this.sunReadout) return;
        if (!p || !p.isAboveHorizon) {
            this.sunReadout.textContent = p ? 'night (below horizon)' : '—';
            return;
        }
        this.sunReadout.textContent = `alt ${p.altitudeDeg.toFixed(0)}° · az ${p.azimuthDeg.toFixed(0)}°`;
    }

    // ── Shadow study (hourly day sweep) ──────────────────────────────────────

    private toggleShadowStudy(): void {
        if (this.studyTimer != null) {
            this.stopShadowStudy();
        } else {
            this.startShadowStudy();
        }
    }

    /** Step the time-of-day slider across the daylight day, advancing the sun so
     *  the user watches the shadows sweep. Loops; stopped by any manual edit. */
    private startShadowStudy(): void {
        if (this.studyBtn) this.studyBtn.textContent = '■ Stop';
        const STEP_MIN = 15;       // sun advance per tick
        const TICK_MS = 90;        // wall-clock per tick
        let minutes = this.timeSlider ? Number(this.timeSlider.value) : 360;
        if (minutes >= 19 * 60 || minutes <= 5 * 60) minutes = 6 * 60; // restart at dawn
        const tick = () => {
            minutes += STEP_MIN;
            if (minutes > 19 * 60) minutes = 6 * 60; // loop dawn→dusk
            if (this.timeSlider) this.timeSlider.value = String(minutes);
            this.pushSunTime();
            this.studyTimer = window.setTimeout(tick, TICK_MS);
        };
        this.studyTimer = window.setTimeout(tick, TICK_MS);
    }

    private stopShadowStudy(): void {
        if (this.studyTimer != null) { clearTimeout(this.studyTimer); this.studyTimer = null; }
        if (this.studyBtn) this.studyBtn.textContent = '▶ Study';
    }

    // ── Climate side-card (reuse the existing ClimatePanel) ──────────────────

    private buildClimateBlock(): HTMLElement {
        const block = this.sectionBlock('🌦 Weather & comfort');

        // Live weather/temperature card (monthly temp band + design temps + HDD/CDD).
        const card = document.createElement('div');
        card.className = 'pryzm-forma-weather-card';
        this.weatherWrap = card;
        block.appendChild(card);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pryzm-forma-climate-open';
        btn.textContent = 'Open full climate card';
        Object.assign(btn.style, {
            width: '100%', appearance: 'none', cursor: 'pointer', border: `1px solid ${ACCENT}`,
            borderRadius: '7px', background: '#faf8ff', color: ACCENT,
            font: '600 12px/1 system-ui', padding: '8px',
        } satisfies Partial<CSSStyleDeclaration>);
        btn.addEventListener('mouseenter', () => { btn.style.background = '#f1ebff'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = '#faf8ff'; });
        btn.addEventListener('click', () => {
            try { openClimatePanel(this.runtime); } catch (e) {
                console.warn('[forma-analysis] openClimatePanel failed:', e);
            }
        });
        block.appendChild(btn);

        const note = this.smallNote('');
        this.climateNote = note;
        block.appendChild(note);
        return block;
    }

    /**
     * Render the live weather/temperature card from the site's ClimateDataset:
     * a compact monthly temperature band (min/avg/max), the ASHRAE design temps,
     * and annual heating/cooling degree-days. Graceful empty state when no
     * dataset is resolvable yet.
     */
    private renderWeatherCard(): void {
        const card = this.weatherWrap;
        if (!card) return;
        card.replaceChildren();
        const ds = this.resolveDataset();
        if (!ds) {
            if (this.climateNote) {
                this.climateNote.textContent =
                    'Temperature, sun-path & wind appear once a site location is set and climate data loads.';
            }
            return;
        }

        // Monthly temperature band (12-month min/avg/max sparkline).
        if ((ds.monthlyNormals ?? []).length > 0) {
            card.appendChild(this.tempBandSvg(ds));
        }

        // Design temps + degree-days chips.
        const stats = document.createElement('div');
        Object.assign(stats.style, {
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '6px',
        } satisfies Partial<CSSStyleDeclaration>);
        const dt = ds.designTemps;
        const dd = ds.degreeDays;
        stats.appendChild(this.statChip('Heating design', `${dt.heating99_6C.toFixed(0)}°C`));
        stats.appendChild(this.statChip('Cooling design', `${dt.cooling0_4C.toFixed(0)}°C`));
        stats.appendChild(this.statChip('HDD (18°C)', `${Math.round(dd.hddBase18)}`));
        stats.appendChild(this.statChip('CDD (18°C)', `${Math.round(dd.cddBase18)}`));
        card.appendChild(stats);

        if (this.climateNote) {
            // §CLIMATE-ESTIMATED-BADGE (founder 2026-06-17) — the 'fallback-defaults'
            // tier is a GENERIC regional climate-zone template (the bundled offline
            // normals that land instantly with no network), not measured data. Tag it
            // as estimated so the user knows it's plausible-but-generic until live
            // Open-Meteo/PVGIS upgrades it in the background; the 'epw'/'noaa-normals'
            // tiers show the real source name.
            this.climateNote.textContent = ds.source === 'fallback-defaults'
                ? 'Estimated — regional default (live data loading…).'
                : `Source ${ds.source}.`;
        }
    }

    /** A compact min/avg/max monthly temperature band as an SVG sparkline. */
    private tempBandSvg(ds: ClimateDataset): SVGSVGElement {
        const series = monthlyTempSeries(ds);
        const W = 208;
        const H = 56;
        const padX = 2;
        const padY = 6;
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', String(W));
        svg.setAttribute('height', String(H));
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        const lo = series.minC;
        const hi = series.maxC;
        const span = hi - lo || 1;
        const plotW = W - padX * 2;
        const plotH = H - padY * 2;
        const xAt = (i: number): number => padX + (series.points.length <= 1 ? 0 : (i / (series.points.length - 1)) * plotW);
        const yAt = (c: number): number => padY + (1 - (c - lo) / span) * plotH;

        // min→max range band (thin vertical bars per month).
        for (let i = 0; i < series.points.length; i++) {
            const p = series.points[i]!;
            const x = xAt(i);
            const bar = document.createElementNS(SVG_NS, 'line');
            bar.setAttribute('x1', x.toFixed(1));
            bar.setAttribute('y1', yAt(p.minC).toFixed(1));
            bar.setAttribute('x2', x.toFixed(1));
            bar.setAttribute('y2', yAt(p.maxC).toFixed(1));
            bar.setAttribute('stroke', '#d9cffb');
            bar.setAttribute('stroke-width', '5');
            bar.setAttribute('stroke-linecap', 'round');
            svg.appendChild(bar);
        }

        // average polyline (accent).
        const pts = series.points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.avgC).toFixed(1)}`).join(' ');
        const poly = document.createElementNS(SVG_NS, 'polyline');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', ACCENT);
        poly.setAttribute('stroke-width', '2');
        poly.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(poly);

        // min / max y-axis labels.
        svg.appendChild(text(W - 2, padY + 6, `${hi.toFixed(0)}°`, '#9a92b5', 'end'));
        svg.appendChild(text(W - 2, H - 2, `${lo.toFixed(0)}°`, '#9a92b5', 'end'));
        return svg;
    }

    /** One labelled stat chip (label on top, value below) for the weather grid. */
    private statChip(label: string, value: string): HTMLElement {
        const chip = document.createElement('div');
        Object.assign(chip.style, {
            display: 'flex', flexDirection: 'column', gap: '1px',
            background: '#faf8ff', border: '1px solid #ece7fb', borderRadius: '6px',
            padding: '4px 6px',
        } satisfies Partial<CSSStyleDeclaration>);
        const l = document.createElement('span');
        l.textContent = label;
        Object.assign(l.style, { font: '500 9px/1.1 system-ui', color: '#8a83a6' });
        const v = document.createElement('span');
        v.textContent = value;
        Object.assign(v.style, { font: '700 12px/1.1 system-ui', color: ACCENT });
        chip.appendChild(l);
        chip.appendChild(v);
        return chip;
    }

    // ── Wind-rose overlay ────────────────────────────────────────────────────

    private buildWindBlock(): HTMLElement {
        const block = this.sectionBlock('🧭 Wind rose');
        const wrap = document.createElement('div');
        Object.assign(wrap.style, { display: 'flex', justifyContent: 'center' });
        this.windWrap = wrap;
        block.appendChild(wrap);
        const note = this.smallNote('');
        this.windNote = note;
        block.appendChild(note);
        return block;
    }

    // ── 3D analysis layers (A.21.D24) ────────────────────────────────────────

    /**
     * A.21.D24 — toggle chips for the 3D Cesium climate-analysis overlays
     * (sun-path arc · wind streaks · heat tint). Each chip flips a viewport
     * overlay layer; the buttons degrade to disabled when the viewport doesn't
     * implement the overlay API. White + #6600FF chrome.
     */
    private build3dLayersBlock(): HTMLElement {
        const block = this.sectionBlock('🗺 3D site analysis');
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });

        const supported =
            typeof this.viewport.setSunPathOverlay === 'function' ||
            typeof this.viewport.setWindOverlay === 'function' ||
            typeof this.viewport.setHeatOverlay === 'function';

        const mkToggle = (
            label: string,
            apply: ((on: boolean) => void) | undefined,
            /** §CLIMATE-OVERLAY-DATA-WIRING — wind/heat need a ClimateDataset
             *  pushed to the viewport BEFORE they can draw. When true, toggling
             *  ON first guarantees the dataset (auto-create Site + bundled ingest
             *  if missing) and pushes whatever is already resolved, so the layer
             *  never starves on first paint; the store-subscription repaint then
             *  feeds it the moment a fresh ingest lands. */
            needsClimate = false,
            /** §TERRAIN-TOGGLE — start the toggle in the ON state (for layers that are ON by
             *  default, e.g. 3D-Site terrain), so the button reflects reality at first paint. */
            initialOn = false,
        ): void => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            const enabled = typeof apply === 'function';
            let on = initialOn;
            const paint = () => {
                b.style.background = on ? ACCENT : '#faf8ff';
                b.style.color = on ? '#ffffff' : (enabled ? ACCENT : '#bdb6d6');
            };
            Object.assign(b.style, {
                flex: '1', minWidth: '60px', appearance: 'none',
                cursor: enabled ? 'pointer' : 'not-allowed',
                border: '1px solid #e3dcfa', borderRadius: '6px',
                font: '600 11px/1 system-ui', padding: '6px 4px',
            } satisfies Partial<CSSStyleDeclaration>);
            paint();
            if (enabled) {
                b.addEventListener('click', () => {
                    on = !on;
                    paint();
                    // §CLIMATE-OVERLAY-DATA-WIRING — before lighting the wind/heat
                    // layer, make sure the viewport actually has the dataset. This
                    // is the narrow gap that left them blank ("NO DATASET"): the
                    // dataset is pushed only by renderWindRose→syncOverlayDataset,
                    // which may not have fired (or resolveDataset() was null on the
                    // mount tick). ensureClimateIfMissing() creates the Site +
                    // ingests the bundled regional default if absent; syncOverlayDataset()
                    // pushes any already-resolved dataset NOW so the layer draws on
                    // the same click. If the ingest is still in flight the
                    // climateStore.subscribe() repaint feeds it within a tick.
                    if (on && needsClimate) {
                        // If we have NO dataset yet, clear the once-per-mount guard so
                        // ensureClimateIfMissing actually re-attempts the Site-create +
                        // bundled ingest (the guard may have latched on a mount tick
                        // where no location/Site was resolvable yet).
                        if (!this.resolveDataset()) this.climateEnsureRequested = false;
                        try { this.ensureClimateIfMissing(); } catch { /* ignore */ }
                        this.syncOverlayDataset();
                    }
                    try { apply!(on); } catch (e) { console.warn('[forma-analysis] overlay toggle failed:', e); }
                });
            } else {
                b.disabled = true;
                b.title = 'This view does not support 3D overlays.';
            }
            row.appendChild(b);
        };

        mkToggle('☀ Sun path', this.viewport.setSunPathOverlay?.bind(this.viewport));
        mkToggle('🌬 Wind', this.viewport.setWindOverlay?.bind(this.viewport), true);
        mkToggle('🌡 Heat', this.viewport.setHeatOverlay?.bind(this.viewport), true);
        // §TERRAIN-TOGGLE (founder 2026-07-27) — Terrain (3D Site) ON/OFF. ON by default (terrain
        // everywhere, per L-631); flip OFF to detach the baked terrain and study the flat-ground
        // scene in high-relief cities (Madrid/Zürich). Live, no reload.
        mkToggle(
            '⛰ Terrain',
            this.viewport.setFormaTerrainEnabled?.bind(this.viewport),
            false,
            this.viewport.isFormaTerrainEnabled?.() ?? true,
        );
        // §STREET-LIFE (L-12936, founder 2026-09-05) — street lamps + pedestrians ON/OFF. ON by
        // default (the same shape as Terrain), and honoured on the settled-base rebuild. OFF clears
        // both instanced primitives immediately; ON rebuilds them in place, no reload.
        // ⚠ The note below says these objects are SCENERY in the UI itself, not only in the console
        // (§CONTEXT-DATA-HONESTY, C57 §1.5/§1.9): mapped lamps come from the baked `furniture`
        // layer, everything else is generated off the road network and must never be read as survey.
        mkToggle(
            '🚶 Street life',
            this.viewport.setStreetLifeEnabled?.bind(this.viewport),
            false,
            this.viewport.isStreetLifeEnabled?.() ?? true,
        );

        // ── §CADASTRAL-BOUNDARIES (C57 §5.5) — the founder's parcel-lines toggle ────────────
        //
        // ⛔ NOT VIA `mkToggle`, AND THAT IS THE POINT RATHER THAN AN EXCEPTION. `mkToggle` is a
        // shared factory behind five shipped toggles (Sun path / Wind / Heat / Terrain / Street
        // life); it holds its own `on` boolean and is fire-and-forget. Both properties are wrong
        // here and neither could be changed without touching all five:
        //   · the state must come from the ONE OWNER, not from a closure variable, or this chip
        //     and the 2D map's chip drift apart (C59 §2.10);
        //   · the answer is ASYNCHRONOUS and can be `unsupported` — the chip has to be able to say
        //     "this cadastre publishes no area query" instead of lighting up over nothing.
        // So this one chip is built explicitly, and the shared factory is left untouched.
        const boundariesBtn = document.createElement('button');
        boundariesBtn.type = 'button';
        boundariesBtn.textContent = '▦ Parcel lines';
        boundariesBtn.setAttribute('data-testid', 'forma-cadastre-boundaries-chip');
        Object.assign(boundariesBtn.style, {
            flex: '1', minWidth: '60px', appearance: 'none',
            border: '1px solid #e3dcfa', borderRadius: '6px',
            font: '600 11px/1 system-ui', padding: '6px 4px',
        } satisfies Partial<CSSStyleDeclaration>);

        // Its OWN note, live. The block's shared `smallNote` below is static prose about the five
        // factory toggles; this layer's state is a fetched VERDICT and has to be able to change
        // after the click that caused it.
        const boundariesNote = this.smallNote('');
        boundariesNote.setAttribute('data-testid', 'forma-cadastre-boundaries-note');

        const paintBoundaries = (): void => {
            const on = getCadastralBoundariesEnabled();
            const verdict = getCadastralBoundariesVerdict();
            const usable = cadastralBoundariesChipEnabled(verdict);
            boundariesBtn.style.background = on ? ACCENT : '#faf8ff';
            boundariesBtn.style.color = on ? '#ffffff' : (usable ? ACCENT : '#bdb6d6');
            boundariesBtn.style.cursor = usable ? 'pointer' : 'not-allowed';
            boundariesBtn.disabled = !usable;
            boundariesBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            // ⭐ TWO SENTENCES, AND THE SECOND ONE IS THE HONEST ONE. The verdict says what the
            // register answered; the REACH says which views will actually draw it. A chip that
            // reports "showing 43 boundaries" in a view that does not draw them is the
            // [[committed-is-not-reachable]] failure rendered as a claim to the user.
            const reach = describeCadastralBoundaryReach();
            boundariesNote.textContent = `${cadastralBoundariesSentence(verdict)} ${reach.sentence}`;
        };

        boundariesBtn.addEventListener('click', () => {
            const on = toggleCadastralBoundaries();
            paintBoundaries();
            if (!on) return;
            const centre = this.siteLatLon();
            if (!centre) {
                // ⛔ NO PLOT, NO QUERY — and SAY so rather than firing at 0,0. `refreshCadastral-
                // Boundaries` would answer `unreachable` for an invalid centre, which is true but
                // blames the register for something PRYZM has not supplied.
                boundariesNote.textContent =
                    'PRYZM does not know where your plot is yet, so it cannot look up the '
                    + 'surrounding parcel boundaries. Pick a location or select a parcel first.';
                return;
            }
            void refreshCadastralBoundaries(centre.lat, centre.lon).then(paintBoundaries);
        });

        row.appendChild(boundariesBtn);
        paintBoundaries();
        // Repaint on every change from the ONE owner — including changes made by the OTHER chip.
        this.cadastralBoundariesSub?.();
        this.cadastralBoundariesSub = subscribeCadastralBoundaries(paintBoundaries);

        block.appendChild(row);
        block.appendChild(boundariesNote);
        block.appendChild(this.smallNote(
            supported
                ? 'Toggle 3D overlays onto the site. Sun-path needs no climate; wind/heat need climate data. Terrain is a 3D-Site layer — off = flat ground. Street life = lamps + people; mapped lamps are real, the rest is scenery.'
                : 'Open the 3D / Plan Forma view to see 3D overlays.',
        ));
        return block;
    }

    /** A.21.D24 — push the current ClimateDataset to the viewport so its 3D
     *  wind/heat overlays draw from the same data as the rose/weather card. */
    private syncOverlayDataset(): void {
        try { this.viewport.setClimateOverlayDataset?.(this.resolveDataset()); } catch { /* ignore */ }
    }

    // ── §SITE-METRIC-HEATMAP — Hektar/Forma-style metric switcher ────────────────
    //
    // ONE colour-binned analytical heatmap at a time over the side-3D site view —
    // the Forma "module" pattern: pick a metric, the massing/site colours by it, a
    // gradient legend appears. ALL metrics — incl. sun hours — paint as a GROUND
    // heatmap via the viewport overlay path so they all render in the side-3D view
    // (which shows no BIM mesh). Sun hours integrates direct sun over the analysis
    // day with a pure shadow-ray test; temperature / wind / population read the
    // street-analytics grids. Metrics with no data source are shown but DISABLED.

    private metricSupported(): boolean {
        return typeof this.viewport.setSiteMetricOverlay === 'function';
    }

    /** True when a site lat/lon is known (sun-hours needs the sun position). §ANALYSIS-
     *  REAL-* — delegates to the shared `siteLatLon()` (also used by the real-data peeks). */
    private hasLocation(): boolean {
        return this.siteLatLon() != null;
    }

    private currentAvailability(): MetricAvailability[] {
        return siteMetricAvailability(!!this.resolveDataset(), this.hasLocation());
    }

    private buildMetricSwitcherBlock(): HTMLElement {
        const block = this.sectionBlock('🎨 Analysis heatmap');
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });
        this.metricChipRow = row;
        block.appendChild(row);

        // Sun-day preset row (only shown while the sun-hours heatmap is active).
        const sunDay = document.createElement('div');
        Object.assign(sunDay.style, { display: 'none', gap: '4px', marginTop: '4px' });
        this.sunDayRow = sunDay;
        block.appendChild(sunDay);

        // §FORMA-FACADE-ANALYSIS — the "Analyse building façade" toggle (default OFF;
        // shown only while sun-hours is the active metric).
        const facade = document.createElement('div');
        Object.assign(facade.style, { display: 'none', marginTop: '4px' });
        this.facadeRow = facade;
        block.appendChild(facade);

        // §CTX-USE-COLOUR (L-599) — the "colour context by use" MODE. Independent of the
        // sun-hours metric (it describes the neighbourhood, not a climate field), so it is
        // always shown when the viewport supports it.
        const useColour = document.createElement('div');
        Object.assign(useColour.style, { marginTop: '6px' });
        this.useColourRow = useColour;
        block.appendChild(useColour);

        const legend = document.createElement('div');
        this.metricLegendWrap = legend;
        block.appendChild(legend);

        this.renderMetricChips();
        this.renderSunDayRow();
        this.renderFacadeToggle();
        this.renderUseColourToggle();
        block.appendChild(this.smallNote(
            this.metricSupported()
                ? 'Pick one metric to colour the site. Sun hours = direct-sun shadow study; others read climate + OSM.'
                : 'Open the 3D Forma view to colour the site by a metric.',
        ));
        return block;
    }

    /** §SITE-METRIC-HEATMAP — the sun-hours analysis-day presets (Summer / Equinox /
     *  Winter, Forma pattern). Shown only while the sun-hours heatmap is active;
     *  each button drives `viewport.setSiteMetricSunDay()` → the heatmap repaints. */
    private renderSunDayRow(): void {
        const row = this.sunDayRow;
        if (!row) return;
        row.replaceChildren();
        if (this.activeMetric !== 'sunHours') { row.style.display = 'none'; return; }
        row.style.display = 'flex';
        const presets: ReadonlyArray<{ key: 'summer' | 'equinox' | 'winter'; label: string }> = [
            { key: 'summer', label: 'Summer' },
            { key: 'equinox', label: 'Equinox' },
            { key: 'winter', label: 'Winter' },
        ];
        for (const p of presets) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = p.label;
            const isOn = this.sunDay === p.key;
            Object.assign(b.style, {
                flex: '1', minWidth: '48px', appearance: 'none', cursor: 'pointer',
                border: `1px solid ${isOn ? ACCENT : '#e3dcfa'}`, borderRadius: '6px',
                background: isOn ? ACCENT : '#faf8ff', color: isOn ? '#fff' : ACCENT,
                font: '600 10px/1 system-ui', padding: '5px 4px',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('click', () => {
                this.sunDay = p.key;
                try { this.viewport.setSiteMetricSunDay?.(p.key); } catch { /* ignore */ }
                this.renderSunDayRow();
            });
            row.appendChild(b);
        }
    }

    /** §FORMA-FACADE-ANALYSIS — the "Analyse building façade" toggle (DEFAULT OFF).
     *  Shown only while the sun-hours heatmap is active (façade priority = sun-hours);
     *  ON also colours the designed building's outer façade + roof by sun-hours with
     *  the SAME ramp. Degrades to disabled when the viewport can't paint façades. */
    private renderFacadeToggle(): void {
        const row = this.facadeRow;
        if (!row) return;
        row.replaceChildren();
        const supported = typeof this.viewport.setFacadeAnalysis === 'function';
        // Only meaningful for the sun-hours metric (the priority façade metric).
        if (this.activeMetric !== 'sunHours') { row.style.display = 'none'; return; }
        row.style.display = 'block';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-testid', 'forma-facade-toggle');
        const paint = () => {
            btn.textContent = this.facadeOn ? '🏢 Façade analysis: ON' : '🏢 Analyse building façade';
            btn.style.background = this.facadeOn ? ACCENT : '#faf8ff';
            btn.style.color = this.facadeOn ? '#ffffff' : (supported ? ACCENT : '#bdb6d6');
        };
        Object.assign(btn.style, {
            width: '100%', appearance: 'none', cursor: supported ? 'pointer' : 'not-allowed',
            border: `1px solid ${this.facadeOn ? ACCENT : '#e3dcfa'}`, borderRadius: '6px',
            font: '600 11px/1 system-ui', padding: '6px 4px',
        } satisfies Partial<CSSStyleDeclaration>);
        paint();
        if (supported) {
            btn.title = 'Colour the designed building’s façade + roof by direct sun-hours';
            btn.addEventListener('click', () => {
                this.facadeOn = !this.facadeOn;
                paint();
                try { this.viewport.setFacadeAnalysis?.(this.facadeOn); }
                catch (e) { console.warn('[forma-analysis] façade toggle failed:', e); }
            });
        } else {
            btn.disabled = true;
            btn.title = 'This view does not support façade analysis.';
        }
        row.appendChild(btn);

        // §FACADE-STUDY-SUBJECT (L-596) — the SUBJECT picker, rendered only when the study is ON.
        //
        // 🔴 TWO EXPLICIT BUTTONS, NOT A FALLBACK. The founder asked to *"run this façade study on
        // the envelope for pre-planning"* — a legitimate request for the same geometry L-272
        // records as a defect. The difference is that the user CHOOSES it here and the result is
        // badged as an ENVELOPE study in the viewport for as long as it paints. If the chosen
        // subject is unavailable the viewport REFUSES and says which input is missing; it never
        // quietly studies the other one.
        if (!supported || !this.facadeOn) return;
        const subjectSupported = typeof this.viewport.setFacadeStudySubject === 'function';
        if (!subjectSupported) return;
        const subjectRow = document.createElement('div');
        Object.assign(subjectRow.style, { display: 'flex', gap: '4px', marginTop: '4px' } satisfies Partial<CSSStyleDeclaration>);
        const subjects: ReadonlyArray<{ key: FacadeStudySubject; label: string; title: string }> = [
            {
                key: 'building', label: 'Building',
                title: 'Sun on the DESIGNED building’s own façade + roof.',
            },
            {
                key: 'envelope', label: 'Envelope',
                title: 'Pre-planning: sun on the faces of the BUILDABLE ENVELOPE, before any '
                    + 'building is designed. A different question from the building study — the '
                    + 'result is labelled as an envelope study in the view.',
            },
        ];
        for (const s of subjects) {
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('data-testid', `forma-facade-subject-${s.key}`);
            b.textContent = s.label;
            b.title = s.title;
            const isOn = this.facadeSubject === s.key;
            Object.assign(b.style, {
                flex: '1', appearance: 'none', cursor: 'pointer',
                border: `1px solid ${isOn ? ACCENT : '#e3dcfa'}`, borderRadius: '6px',
                background: isOn ? ACCENT : '#faf8ff', color: isOn ? '#fff' : ACCENT,
                font: '600 10px/1 system-ui', padding: '5px 4px',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('click', () => {
                this.facadeSubject = s.key;
                try { this.viewport.setFacadeStudySubject?.(s.key); }
                catch (e) { console.warn('[forma-analysis] façade subject switch failed:', e); }
                this.renderFacadeToggle();
            });
            subjectRow.appendChild(b);
        }
        row.appendChild(subjectRow);
        row.appendChild(this.smallNote(
            this.facadeSubject === 'envelope'
                ? 'Studying the BUILDABLE ENVELOPE — the legal volume, not a designed building.'
                : 'Studying the designed building’s own façade.',
        ));
    }

    /**
     * §CTX-USE-COLOUR (L-599) — the "colour context buildings by use" MODE toggle (DEFAULT OFF).
     *
     * MEASURED before it was designed (16,187 buildings, live tiles): 91.0% carry a meaningful use
     * tag — the opposite of the height situation — which is why this may be coloured at all. The
     * remaining 9% are left UNCOLOURED in the scene and named in the legend, because a colour reads
     * as a fact. The legend itself is drawn by the viewport (it counts what is actually on screen).
     */
    private renderUseColourToggle(): void {
        const row = this.useColourRow;
        if (!row) return;
        row.replaceChildren();
        const supported = typeof this.viewport.setContextUseColouring === 'function';
        if (!supported) { row.style.display = 'none'; return; }
        row.style.display = 'block';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-testid', 'forma-context-use-toggle');
        const paint = () => {
            btn.textContent = this.useColourOn ? '🎨 Building use: ON' : '🎨 Colour context by use';
            btn.style.background = this.useColourOn ? ACCENT : '#faf8ff';
            btn.style.color = this.useColourOn ? '#ffffff' : ACCENT;
            btn.style.border = `1px solid ${this.useColourOn ? ACCENT : '#e3dcfa'}`;
        };
        Object.assign(btn.style, {
            width: '100%', appearance: 'none', cursor: 'pointer',
            borderRadius: '6px', font: '600 11px/1 system-ui', padding: '6px 4px',
        } satisfies Partial<CSSStyleDeclaration>);
        paint();
        btn.title = 'Colour surrounding buildings by what OSM says they ARE (residential, retail, '
            + 'office…). Buildings with no recorded use stay uncoloured. This is ACTUAL use — not '
            + 'the zoning code for what the land MAY be.';
        btn.addEventListener('click', () => {
            this.useColourOn = !this.useColourOn;
            paint();
            try { this.viewport.setContextUseColouring?.(this.useColourOn); }
            catch (e) { console.warn('[forma-analysis] use-colour toggle failed:', e); }
        });
        row.appendChild(btn);
    }

    /** (Re)build the chip row from the current data availability. */
    private renderMetricChips(): void {
        const row = this.metricChipRow;
        if (!row) return;
        row.replaceChildren();
        const supported = this.metricSupported();
        const avail = this.currentAvailability();
        const ACCENT_ON = ACCENT;
        for (const a of avail) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.setAttribute('data-metric', a.metric);
            chip.textContent = a.label;
            const isOn = this.activeMetric === a.metric;
            const enabled = supported && a.available;
            Object.assign(chip.style, {
                flex: '1', minWidth: '64px', appearance: 'none',
                cursor: enabled ? 'pointer' : 'not-allowed',
                border: `1px solid ${isOn ? ACCENT_ON : '#e3dcfa'}`,
                borderRadius: '6px',
                background: isOn ? ACCENT_ON : '#faf8ff',
                color: isOn ? '#ffffff' : (enabled ? ACCENT_ON : '#bdb6d6'),
                font: '600 11px/1.1 system-ui', padding: '6px 4px',
            } satisfies Partial<CSSStyleDeclaration>);
            if (!enabled) {
                chip.disabled = true;
                chip.title = a.reason ?? 'No data source wired';
            } else {
                chip.title = a.metric === 'sunHours'
                    ? 'Colour the site by direct sun-hours (shadow study)'
                    : a.metric === 'daylight'
                        ? 'Colour the site by Vertical Sky Component — % of sky visible vs the massing + OSM context (right-to-light)'
                        : a.metric === 'population'
                            ? 'Colour the site by an OSM footprint-density proxy (GFA = footprint × floors) — not census data'
                            : `Colour the site by ${a.label.toLowerCase()}`;
                chip.addEventListener('click', () => this.selectMetric(a.metric));
            }
            row.appendChild(chip);
        }
    }

    /** Toggle a metric on (off when re-clicking the active one). */
    private selectMetric(metric: SiteMetric): void {
        const next = this.activeMetric === metric ? null : metric;
        this.activeMetric = next;

        // §SITE-METRIC-HEATMAP — ALL metrics (incl. sun hours) now paint as a GROUND
        // heatmap in the side-3D view via the SAME viewport overlay path, so they all
        // render. (The BIM-mesh `pryzmComputeSunHours` raycast is a separate pass for
        // the BIM view — not used here, since the Cesium view shows no BIM mesh.)
        // temperature/wind first need a climate dataset; sun hours/population do not.
        if (next === 'temperature' || next === 'wind') {
            if (!this.resolveDataset()) this.climateEnsureRequested = false;
            try { this.ensureClimateIfMissing(); } catch { /* ignore */ }
            this.syncOverlayDataset();
        }
        try { this.viewport.setSiteMetricOverlay?.(next); } catch (e) { console.warn('[forma-analysis] metric overlay failed:', e); }

        // §FORMA-FACADE-ANALYSIS — leaving sun-hours clears the façade study (the
        // viewport already clears on the metric switch; keep the UI state in sync).
        if (next !== 'sunHours' && this.facadeOn) {
            this.facadeOn = false;
            try { this.viewport.setFacadeAnalysis?.(false); } catch { /* ignore */ }
        }

        // Show the sun-day preset row + façade toggle only while sun-hours is active.
        this.renderSunDayRow();
        this.renderFacadeToggle();
        this.renderMetricChips();
        this.renderMetricLegend();
    }

    /** Repaint the chip enabled-state + legend when data availability changes. */
    private refreshMetricSwitcher(): void {
        // If the active metric just lost its data, drop it cleanly.
        if (this.activeMetric) {
            const a = this.currentAvailability().find((m) => m.metric === this.activeMetric);
            if (a && !a.available) {
                this.activeMetric = null;
                try { this.viewport.setSiteMetricOverlay?.(null); } catch { /* ignore */ }
            }
        }
        this.renderMetricChips();
        this.renderMetricLegend();
    }

    /** Draw the gradient legend for the active metric (or clear when none). */
    private renderMetricLegend(): void {
        const wrap = this.metricLegendWrap;
        if (!wrap) return;
        wrap.replaceChildren();
        if (!this.activeMetric) return;
        const legend = siteMetricLegend(this.activeMetric, this.resolveDataset());
        if (!legend) return;

        const title = document.createElement('div');
        title.textContent = legend.title;
        Object.assign(title.style, { font: '600 10px/1.2 system-ui', color: '#6b6486', margin: '4px 0 2px' });
        wrap.appendChild(title);

        const bar = document.createElement('div');
        Object.assign(bar.style, {
            height: '10px', borderRadius: '5px', border: '1px solid #ece7fb',
            background: `linear-gradient(to right, ${legend.stops.join(', ')})`,
        } satisfies Partial<CSSStyleDeclaration>);
        wrap.appendChild(bar);

        const labels = document.createElement('div');
        Object.assign(labels.style, {
            display: 'flex', justifyContent: 'space-between',
            font: '500 9px/1.2 system-ui', color: '#8a83a6', marginTop: '1px',
        } satisfies Partial<CSSStyleDeclaration>);
        const lo = document.createElement('span');
        lo.textContent = legend.lowLabel;
        const hi = document.createElement('span');
        hi.textContent = legend.highLabel;
        labels.appendChild(lo);
        labels.appendChild(hi);
        wrap.appendChild(labels);

        // §SITE-METRIC-DATA-SOURCE-NOTE (founder 2026-06-30) — a one-line provenance
        // caption under the legend so the data source is never ambiguous. Population is
        // an OSM building-footprint × floor-count DENSITY PROXY, NOT census/WorldPop;
        // temperature/wind read the (possibly bundled/estimated) climate normals.
        const note = this.metricSourceNote(this.activeMetric);
        if (note) {
            const cap = document.createElement('div');
            cap.textContent = note;
            cap.title = note;
            Object.assign(cap.style, {
                font: '400 9px/1.3 system-ui', color: '#8a83a6', marginTop: '3px',
            } satisfies Partial<CSSStyleDeclaration>);
            wrap.appendChild(cap);
        }
    }

    /** §SITE-METRIC-DATA-SOURCE-NOTE — a short provenance caption for the active metric
     *  so its data source / limitations are explicit in the panel (and as a tooltip). */
    private metricSourceNote(metric: SiteMetric): string | null {
        // §ANALYSIS-REAL-* (ADR-0095) — when the real free-dataset cache has landed for
        // this site, the caption reports the REAL source; otherwise it reads the honest
        // estimate provenance (and NEVER claims a synthetic fallback).
        const ll = this.siteLatLon();
        const realClim = ll ? peekRealClimateBaseline(ll.lat, ll.lon) : null;
        const realPop = ll ? peekRealPopulationSample(ll.lat, ll.lon) : null;
        switch (metric) {
            case 'population':
                return realPop
                    ? `Real data · WorldPop 100 m gridded population (${realPop.personsPerHa.toFixed(0)} p/ha at this site). ` +
                        'Distributed within the plot by OSM built mass; monuments/open ground read honestly low.'
                    : 'Estimate unavailable — WorldPop not reachable; showing OSM built-density proxy ' +
                        '(footprint × floors), NOT measured residents.';
            case 'temperature':
                // §ANALYSIS-REAL-TEMPERATURE — base air temp is REAL NASA POWER T2M
                // climatology when landed; the UHI ΔT is the spatial modulation on top.
                return realClim
                    ? `Real data · NASA POWER T2M air-temp climatology (~${realClim.warmAirTempC.toFixed(0)}°C warm-season base) ` +
                        '+ urban-heat-island ΔT from OSM built density. Dense zones read hotter, open/green cooler.'
                    : 'Estimate — regional climate normal + urban-heat-island ΔT from OSM built density ' +
                        '(NASA POWER not yet reachable). Dense zones read hotter, open/green cooler.';
            case 'wind':
                // §ANALYSIS-REAL-WIND — base freestream (speed + prevailing direction) is
                // REAL NASA POWER when landed; only the Lawson pedestrian-comfort modelling
                // is an estimate on top of the real regional wind.
                return realClim
                    ? `Real base wind · NASA POWER (~${realClim.windMeanMs.toFixed(1)} m/s, from ${this.compass(realClim.windFromDeg)}) ` +
                        '+ estimated Lawson pedestrian shelter/exposure. Sheltered zones read calmer, exposed windier.'
                    : 'Estimate — Lawson pedestrian-comfort proxy over a regional wind-rose baseline ' +
                        '(NASA POWER not yet reachable). Sheltered zones read calmer, exposed windier.';
            case 'sunHours':
                return 'Direct-beam sun-hours on the analysis day, shadowed by the massing + ' +
                    'OSM context (pure analytic shadow study).';
            case 'daylight':
                // §SITE-METRIC-DAYLIGHT-VSC — Vertical Sky Component: % of the sky
                // hemisphere visible at each cell, obstructed by the massing + OSM
                // context. Open-site datum ≈ 40 %; right-to-light flags < ~27 %.
                return 'Vertical Sky Component: % of sky visible, obstructed by the massing + ' +
                    'OSM context (analytic sky sweep). Open ≈ 40%; right-to-light concern < ~27%.';
            default:
                return null;
        }
    }

    /** §ANALYSIS-REAL-WIND — 8-point compass abbreviation for a FROM-direction (deg). */
    private compass(deg: number): string {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
    }

    private renderWindRose(): void {
        const wrap = this.windWrap;
        // A.21.D24 — keep the 3D wind/heat overlays fed with the latest dataset.
        this.syncOverlayDataset();
        if (!wrap) return;
        wrap.replaceChildren();
        // §SITE-METRIC-WIND-CONTRAST — resolve to bundled regional normals when the live
        // ClimateStore dataset hasn't landed but a location exists, so the rose shows a
        // real DIRECTIONAL wind (mean + prevailing) the moment the site has a location —
        // never an empty "Wind data loading…" rose while the map already paints a field.
        const ds = this.resolveDatasetOrFallback();
        // §ANALYSIS-REAL-WIND (ADR-0095) — when the REAL NASA POWER freestream has landed
        // for this site, plot the REAL prevailing direction + mean/gust (buildRealWindRose)
        // instead of the synthesised regional-normals rose. The rose is then real data;
        // only the pedestrian-comfort MAP modelling stays an estimate.
        const ll = this.siteLatLon();
        const realClim = ll ? peekRealClimateBaseline(ll.lat, ll.lon) : null;
        if (realClim) {
            const realRose = buildRealWindRose(realClim.windMeanMs, realClim.windFromDeg, realClim.windGustMs);
            const chart = windRoseBars(realRose);
            wrap.appendChild(this.windRoseSvg(chart.bars, chart.maxFrequency));
            if (this.windNote) {
                this.windNote.textContent =
                    `Real data · NASA POWER. Mean ${realClim.windMeanMs.toFixed(1)} m/s · gust ` +
                    `${realClim.windGustMs.toFixed(1)} m/s · prevailing from ${this.compass(realClim.windFromDeg)}. ` +
                    'Bars point FROM prevailing.';
            }
            return;
        }
        if (!ds) {
            // Genuinely no dataset AND no location to derive one from → quiet prompt.
            if (this.windNote) this.windNote.textContent = 'Wind data loading… (set a site location if the map is empty).';
            wrap.appendChild(this.windRoseSvg([], 0));
            return;
        }
        const chart = windRoseBars(ds.windRose);
        wrap.appendChild(this.windRoseSvg(chart.bars, chart.maxFrequency));
        if (this.windNote) {
            // Tag the bundled 'fallback-defaults' tier as estimated (regional default).
            const estPrefix = ds.source === 'fallback-defaults' ? 'Estimated · ' : '';
            this.windNote.textContent = chart.maxFrequency > 0
                ? `${estPrefix}Mean ${chart.meanSpeedMps.toFixed(1)} m/s · gust ${chart.p99SpeedMps.toFixed(1)} m/s. Bars point FROM prevailing.`
                : 'Wind-rose aggregate empty — needs an EPW with hourly wind.';
        }
    }

    private windRoseSvg(
        bars: ReturnType<typeof windRoseBars>['bars'],
        maxFreq: number,
    ): SVGSVGElement {
        const SIZE = 150;
        const R = 60;
        const cx = SIZE / 2;
        const cy = SIZE / 2;
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', String(SIZE));
        svg.setAttribute('height', String(SIZE));
        svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

        for (const frac of [0.5, 1]) {
            svg.appendChild(circle(cx, cy, R * frac, '#ece7fb'));
        }
        svg.appendChild(line(cx - R, cy, cx + R, cy, '#ece7fb'));
        svg.appendChild(line(cx, cy - R, cx, cy + R, '#ece7fb'));
        svg.appendChild(text(cx, cy - R - 2, 'N', '#9a92b5'));

        // Stacked speed-band bars: each sector's bar is split into the 6
        // Beaufort-ish speed bins, light→dark accent (calm→gust). The bar's
        // full length is scaled by the sector's total frequency; each segment's
        // length is its share of that sector's hours. North is up.
        for (const bar of bars) {
            if (bar.frequency <= 0) continue;
            const end = windBarEndpoint(bar.sectorDeg, bar.frequency, maxFreq, R);
            const fullLen = Math.hypot(end.x, end.y);
            const rad = (bar.sectorDeg * Math.PI) / 180;
            const ux = Math.sin(rad);
            const uy = -Math.cos(rad);
            const sectorTotal = bar.speedBinHours.reduce((a, h) => a + h, 0) || 1;
            let r0 = 0;
            for (let b = 0; b < bar.speedBinHours.length; b++) {
                const share = bar.speedBinHours[b]! / sectorTotal;
                if (share <= 0) continue;
                const r1 = r0 + share * fullLen;
                const ln = document.createElementNS(SVG_NS, 'line');
                ln.setAttribute('x1', (cx + ux * r0).toFixed(2));
                ln.setAttribute('y1', (cy + uy * r0).toFixed(2));
                ln.setAttribute('x2', (cx + ux * r1).toFixed(2));
                ln.setAttribute('y2', (cy + uy * r1).toFixed(2));
                ln.setAttribute('stroke', WIND_BAND_COLORS[b] ?? ACCENT);
                ln.setAttribute('stroke-width', '6');
                ln.setAttribute('stroke-linecap', 'butt');
                svg.appendChild(ln);
                r0 = r1;
            }
        }
        return svg;
    }

    // ── Shared helpers ───────────────────────────────────────────────────────

    private resolveDataset(): ClimateDataset | null {
        const rt = this.runtime;
        if (!rt) return null;
        try {
            const site = rt.siteModelStore.getSite();
            if (!site) return null;
            return rt.climateStore.resolveSite(site.id as SiteId) ?? null;
        } catch {
            return null;
        }
    }

    /**
     * §SITE-METRIC-WIND-CONTRAST — resolve a dataset for the WIND-ROSE panel, falling
     * back to OFFLINE bundled regional normals (a real non-empty rose with a non-zero
     * mean speed + prevailing direction) when the live ClimateStore dataset hasn't
     * landed yet but a site LOCATION exists. This is the SAME bundled path the metric
     * GRID already uses (`resolveGridDataset` in siteMetricGrids), so the panel rose no
     * longer latches on an empty "Wind data loading…" state while the map already paints
     * a real directional wind field. Returns null only when there is genuinely no
     * dataset AND no location to derive one from. PURE (given the coordinates).
     */
    private resolveDatasetOrFallback(): ClimateDataset | null {
        const live = this.resolveDataset();
        if (live) return live;
        const ll = this.siteLatLon();
        if (!ll) return null;
        try {
            const token = climateToken(ll.lat, ll.lon);
            return buildFallbackClimateDataset({
                id: `climate:${token}`,
                siteRef: `site-bundled-${token}`,
                lat: ll.lat,
                lon: ll.lon,
            });
        } catch {
            return null;
        }
    }

    /** Best-effort site lat/lon for the bundled-normals fallback (store location → LTP
     *  origin). Returns null when no real location is known. */
    private siteLatLon(): { lat: number; lon: number } | null {
        const rt = this.runtime;
        try {
            const loc = rt?.siteModelStore.getLocation?.();
            if (loc && (loc.latitude !== 0 || loc.longitude !== 0)) {
                return { lat: loc.latitude, lon: loc.longitude };
            }
        } catch { /* fall through to the LTP origin */ }
        const ltp = getCurrentSiteOrigin();
        if (ltp && (ltp.lat !== 0 || ltp.lon !== 0)) return { lat: ltp.lat, lon: ltp.lon };
        return null;
    }

    private sectionBlock(titleText: string): HTMLElement {
        const block = document.createElement('div');
        Object.assign(block.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
        const t = document.createElement('div');
        t.textContent = titleText;
        Object.assign(t.style, { font: '700 11px/1 system-ui', color: '#3a3357', letterSpacing: '0.02em' });
        block.appendChild(t);
        return block;
    }

    private smallNote(textContent: string): HTMLElement {
        const n = document.createElement('div');
        n.textContent = textContent;
        Object.assign(n.style, { font: '400 10px/1.3 system-ui', color: '#8a83a6' });
        return n;
    }
}

// ── Pure DOM/SVG mini-helpers ─────────────────────────────────────────────────

/** §SITE-METRIC-WIND-CONTRAST — a stable 16-char base-36 token from a lat/lon pair
 *  (FNV-1a over the rounded coordinates), used to mint a schema-valid bundled climate
 *  dataset id (`climate:[A-Za-z0-9]{16,32}`) without colons/dots. Mirrors `coordToken`
 *  in siteMetricGrids so the panel rose keys to the SAME bundled dataset as the map. */
function climateToken(lat: number, lon: number): string {
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    const hash = (seed: number): string => {
        let h = seed >>> 0;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(36).padStart(8, '0').slice(-8);
    };
    return (hash(0x811c9dc5) + hash(0x9e3779b1)).slice(0, 16);
}

function toDateInputValue(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function circle(cx: number, cy: number, r: number, stroke: string): SVGCircleElement {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', '1');
    return c;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string): SVGLineElement {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', '1');
    return l;
}

function text(
    x: number,
    y: number,
    content: string,
    fill: string,
    anchor: 'start' | 'middle' | 'end' = 'middle',
): SVGTextElement {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('font-size', '9');
    t.setAttribute('fill', fill);
    t.setAttribute('text-anchor', anchor);
    t.textContent = content;
    return t;
}
