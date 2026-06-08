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
    /** Guards a single proactive `ensureSiteClimate` per mount (avoid loops). */
    private climateEnsureRequested = false;

    private sunUnsub: (() => void) | null = null;
    private climateUnsub: (() => void) | null = null;
    private studyTimer: number | null = null;

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
            position: 'absolute', bottom: '16px', right: '14px', zIndex: '31',
            width: '232px', display: 'flex', flexDirection: 'column', gap: '10px',
            padding: '12px', background: '#ffffff', borderRadius: '12px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '500 12px/1.35 system-ui, sans-serif', color: '#2a2240',
        } satisfies Partial<CSSStyleDeclaration>);

        root.appendChild(this.buildSunBlock());
        root.appendChild(this.buildClimateBlock());
        root.appendChild(this.buildWindBlock());
        root.appendChild(this.build3dLayersBlock());

        this.mountTarget.appendChild(root);
        this.root = root;

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
            const refresh = () => { this.renderWindRose(); this.renderWeatherCard(); };
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
        if (this.sunUnsub) { try { this.sunUnsub(); } catch { /* ignore */ } this.sunUnsub = null; }
        if (this.climateUnsub) { try { this.climateUnsub(); } catch { /* ignore */ } this.climateUnsub = null; }
        // A.21.D24 — turn off any active 3D overlays so they don't linger when the
        // panel is removed (e.g. switching to the 2D map view). The viewport keeps
        // running; only this panel's overlay layers are cleared.
        try {
            this.viewport.setSunPathOverlay?.(false);
            this.viewport.setWindOverlay?.(false);
            this.viewport.setHeatOverlay?.(false);
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
        try { this.viewport.setFormaSunTime(this.currentScrubDate()); } catch (e) {
            console.warn('[forma-analysis] setFormaSunTime failed:', e);
        }
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
            this.climateNote.textContent = `Source ${ds.source}.`;
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
        ): void => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            const enabled = typeof apply === 'function';
            let on = false;
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
                    try { apply!(on); } catch (e) { console.warn('[forma-analysis] overlay toggle failed:', e); }
                });
            } else {
                b.disabled = true;
                b.title = 'This view does not support 3D overlays.';
            }
            row.appendChild(b);
        };

        mkToggle('☀ Sun path', this.viewport.setSunPathOverlay?.bind(this.viewport));
        mkToggle('🌬 Wind', this.viewport.setWindOverlay?.bind(this.viewport));
        mkToggle('🌡 Heat', this.viewport.setHeatOverlay?.bind(this.viewport));

        block.appendChild(row);
        block.appendChild(this.smallNote(
            supported
                ? 'Toggle 3D overlays onto the site. Sun-path needs no climate; wind/heat need climate data.'
                : 'Open the 3D / Plan Forma view to see 3D overlays.',
        ));
        return block;
    }

    /** A.21.D24 — push the current ClimateDataset to the viewport so its 3D
     *  wind/heat overlays draw from the same data as the rose/weather card. */
    private syncOverlayDataset(): void {
        try { this.viewport.setClimateOverlayDataset?.(this.resolveDataset()); } catch { /* ignore */ }
    }

    private renderWindRose(): void {
        const wrap = this.windWrap;
        // A.21.D24 — keep the 3D wind/heat overlays fed with the latest dataset.
        this.syncOverlayDataset();
        if (!wrap) return;
        wrap.replaceChildren();
        const ds = this.resolveDataset();
        if (!ds) {
            if (this.windNote) this.windNote.textContent = 'No wind data — set a site + load climate.';
            wrap.appendChild(this.windRoseSvg([], 0));
            return;
        }
        const chart = windRoseBars(ds.windRose);
        wrap.appendChild(this.windRoseSvg(chart.bars, chart.maxFrequency));
        if (this.windNote) {
            this.windNote.textContent = chart.maxFrequency > 0
                ? `Mean ${chart.meanSpeedMps.toFixed(1)} m/s · gust ${chart.p99SpeedMps.toFixed(1)} m/s. Bars point FROM prevailing.`
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
