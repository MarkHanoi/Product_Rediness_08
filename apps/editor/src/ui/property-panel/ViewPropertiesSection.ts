/**
 * @file src/ui/property-panel/ViewPropertiesSection.ts
 *
 * Renders the "View Properties" default state for the Property Inspector
 * when no BIM element is selected (Phase 2.2).
 *
 * Sections:
 *   - Sun Settings      (azimuth, elevation, intensity)
 *   - Climate / Heat    (temperature, humidity)        §ENV-PANEL-CLIMATE
 *   - Wind              (direction, speed)              §ENV-PANEL-CLIMATE
 *   - Population Density (density)                      §ENV-PANEL-CLIMATE
 *   - Shadows           (enabled toggle)
 *   - Post-processing   (AO toggle, bloom toggle, exposure)
 *
 * Engine integration — dispatches custom window events read by initUI.ts +
 * initScene.ts (RealEnvironmentService):
 *   §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — the sun is REAL (site + time):
 *   'pryzm-set-sun-mode'       → { mode }       ('real+offset' | 'manual')
 *   'pryzm-set-sun-time'       → { hours }       (0–24 decimal, drives ephemeris)
 *   'pryzm-set-sun-offsets'    → { azimuthDeg?, elevationDeg?, intensity? }
 *                                (offsets/multiplier in real+offset; absolute in manual)
 *   'pryzm-toggle-ground-shadows' → { enabled }  (invisible L0 shadow-catcher)
 *   'pryzm-set-sun-direction'  → { x, y, z }   (manual mode only — legacy OBC light)
 *   'pryzm-set-sun-intensity'  → { intensity }  (manual mode only — legacy OBC light)
 *   'pryzm-toggle-shadows'     → void (toggles current shadow state)
 *   'pryzm-set-climate'        → { temperature, humidity }  (°C, %)  §ENV-PANEL-CLIMATE
 *   'pryzm-set-wind'           → { direction, speed }  (°, m/s)      §ENV-PANEL-CLIMATE
 *   'pryzm-set-population-density' → { density }  (persons/ha)       §ENV-PANEL-CLIMATE
 *
 * Contract compliance:
 *   §05 §3  — CSS prefix vp- registered in viewerPanels.ts VIEW_PROPERTIES_SECTION_STYLES
 *   §05 §6  — Zero bim-* elements; pure native HTML
 *   §05 §7.6— No independent <style> injection
 *   §01 §3.5— No store mutations; renderer changes via Three.js directly
 *   §06 §10.1 — No @thatopen/components imports in UI layer
 */

import { sharedRenderingState, setSharedPostProcessing } from '@pryzm/core-app-model/rendering';
// §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — the SINGLE SOURCE OF TRUTH for
// Sun / Shadow / Wind / Climate / Population. This panel no longer holds a private copy
// of those values (the divergent-copy that made "Site Analysis and VIEW PROPERTIES
// repeat Sun/Shadow/Wind"): it reads from, writes through, and subscribes to the ONE
// `environmentAnalysisStore`, so its values are identical to the Site Analysis panel's.
import { environmentAnalysisStore } from '../../engine/views/environmentAnalysisStore';

export class ViewPropertiesSection {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // §FEAT-REAL-ENVIRONMENT (ADR-0106) — restore persisted POST-PROCESSING state so a
        // panel rebuild (per selection) keeps the user's choices. Sun / Shadow / Wind /
        // Climate / Population state now lives in the shared `environmentAnalysisStore`
        // singleton, which outlives panel rebuilds — no per-instance restore needed.
        this._aoEnabled            = sharedRenderingState.aoEnabled;
        this._bloomEnabled         = sharedRenderingState.bloomEnabled;
        this._exposure             = sharedRenderingState.exposure;
    }

    // §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625) — the shared analysis environment is
    // the SINGLE SOURCE OF TRUTH; this getter is the only way this panel reads it.
    private get _env() { return environmentAnalysisStore.getState(); }

    // Post-processing is NOT a shared-environment property (it is the GPU render finish,
    // meaningful only for the BIM 3D view — see `viewPropertyModel.ts`), so it stays a
    // local field persisted via `sharedRenderingState`.
    private _aoEnabled      = false;
    private _bloomEnabled   = false;
    private _exposure       = 1.0;

    /** Live-sync closures (one per control) re-read the shared store on notification. */
    private readonly _syncFns: Array<() => void> = [];

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'vp-root';
        // §L-625 — keep every control's displayed value in lock-step with the shared
        // store, so a Sun/Shadow/Wind change made in the Site Analysis panel is reflected
        // here live. Self-disposes when this panel is replaced (leak-safe, no dispose hook).
        this._syncFns.length = 0;
        const unsubscribe = environmentAnalysisStore.subscribe(() => {
            if (!root.isConnected) { unsubscribe(); return; }
            for (const fn of this._syncFns) { try { fn(); } catch { /* ignore */ } }
        });
        root.appendChild(this._buildSection('SUN SETTINGS',        true,  this._buildSunSettings()));
        root.appendChild(this._buildSection('CLIMATE / HEAT',      false, this._buildClimateSettings()));
        root.appendChild(this._buildSection('WIND',                false, this._buildWindSettings()));
        root.appendChild(this._buildSection('POPULATION DENSITY',  false, this._buildPopulationSettings()));
        root.appendChild(this._buildSection('SHADOWS',             true,  this._buildShadowSettings()));
        root.appendChild(this._buildSection('POST-PROCESSING',     false, this._buildPostProcessing()));
        return root;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Section builders
    // ─────────────────────────────────────────────────────────────────────────

    private _buildSection(title: string, open: boolean, content: HTMLElement): HTMLElement {
        const details = document.createElement('details');
        details.className = 'vp-accordion';
        if (open) details.open = true;

        const summary = document.createElement('summary');
        summary.className   = 'vp-accordion-header';
        summary.textContent = title;
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'vp-accordion-body';
        body.appendChild(content);
        details.appendChild(body);

        return details;
    }

    private _buildSunSettings(): HTMLElement {
        const wrap = document.createElement('div');
        const store = environmentAnalysisStore;

        // §FEAT-REAL-ENVIRONMENT-SUN — mode toggle: REAL (ephemeris) + offset vs MANUAL.
        // ON  = real+offset (sliders are offsets on the true solar position);
        // OFF = manual (sliders are absolute — the legacy studio key).
        // §L-625 — routed through the shared store (single source of truth); the store
        // emits the mode event, persists it, and re-emits the current sun so the engine
        // re-solves in the new mode — the identical behaviour, in ONE place.
        wrap.appendChild(this._buildToggleRow('Real sun (site + time)', this._env.sun.mode === 'real+offset', (on) => {
            store.setSunMode(on ? 'real+offset' : 'manual', 'view-properties');
        }, () => this._env.sun.mode === 'real+offset'));

        // Time of day — drives the ephemeris in real+offset mode.
        wrap.appendChild(this._buildSliderRow(
            'Time of day', this._env.sun.timeHours, 0, 24, 0.25, 'h',
            (v) => store.setSunTime(v, 'view-properties'),
            () => this._env.sun.timeHours,
        ));

        // Azimuth / Elevation — OFFSETS in real+offset mode, ABSOLUTE in manual.
        // Range spans negative offsets so the sun can be nudged either way.
        wrap.appendChild(this._buildSliderRow(
            'Azimuth', this._env.sun.azimuthDeg, -180, 180, 1, '°',
            (v) => store.setSunOffsets({ azimuthDeg: v }, 'view-properties'),
            () => this._env.sun.azimuthDeg,
        ));
        wrap.appendChild(this._buildSliderRow(
            'Elevation', this._env.sun.elevationDeg, -90, 90, 1, '°',
            (v) => store.setSunOffsets({ elevationDeg: v }, 'view-properties'),
            () => this._env.sun.elevationDeg,
        ));
        wrap.appendChild(this._buildSliderRow(
            'Intensity', this._env.sun.intensity, 0.0, 2.0, 0.05, '×',
            (v) => store.setSunOffsets({ intensity: v }, 'view-properties'),
            () => this._env.sun.intensity,
        ));

        return wrap;
    }

    // ─── §ENV-PANEL-CLIMATE — Climate / Heat (§L-625 shared store) ────────────
    private _buildClimateSettings(): HTMLElement {
        const wrap = document.createElement('div');
        const store = environmentAnalysisStore;

        wrap.appendChild(this._buildSliderRow(
            'Temperature', this._env.climate.temperatureC, -10, 45, 1, '°C',
            (v) => store.setClimate({ temperatureC: v }, 'view-properties'),
            () => this._env.climate.temperatureC,
        ));
        wrap.appendChild(this._buildSliderRow(
            'Humidity', this._env.climate.humidityPct, 0, 100, 1, '%',
            (v) => store.setClimate({ humidityPct: v }, 'view-properties'),
            () => this._env.climate.humidityPct,
        ));

        return wrap;
    }

    // ─── §ENV-PANEL-CLIMATE — Wind (§L-625 shared store) ──────────────────────
    private _buildWindSettings(): HTMLElement {
        const wrap = document.createElement('div');
        const store = environmentAnalysisStore;

        wrap.appendChild(this._buildSliderRow(
            'Direction', this._env.wind.directionDeg, 0, 360, 1, '°',
            (v) => store.setWind({ directionDeg: v }, 'view-properties'),
            () => this._env.wind.directionDeg,
        ));
        wrap.appendChild(this._buildSliderRow(
            'Speed', this._env.wind.speedMs, 0, 30, 0.5, ' m/s',
            (v) => store.setWind({ speedMs: v }, 'view-properties'),
            () => this._env.wind.speedMs,
        ));

        return wrap;
    }

    // ─── §ENV-PANEL-CLIMATE — Population Density (§L-625 shared store) ─────────
    private _buildPopulationSettings(): HTMLElement {
        const wrap = document.createElement('div');
        const store = environmentAnalysisStore;

        wrap.appendChild(this._buildSliderRow(
            'Density', this._env.population.densityPerHa, 0, 100, 1, '/ha',
            (v) => store.setPopulation(v, 'view-properties'),
            () => this._env.population.densityPerHa,
        ));

        return wrap;
    }

    private _buildShadowSettings(): HTMLElement {
        const wrap = document.createElement('div');
        const store = environmentAnalysisStore;
        wrap.appendChild(this._buildToggleRow('Cast shadows', this._env.shadows.cast, (v) => {
            store.setShadowCast(v, 'view-properties');
        }, () => this._env.shadows.cast));
        // §FEAT-GROUND-SHADOW-CATCHER — invisible L0 plane so every element casts a
        // grounded shadow even with no floor slab. Default ON.
        wrap.appendChild(this._buildToggleRow('Ground shadows', this._env.shadows.ground, (v) => {
            store.setGroundShadows(v, 'view-properties');
        }, () => this._env.shadows.ground));
        return wrap;
    }

    private _buildPostProcessing(): HTMLElement {
        const wrap = document.createElement('div');

        wrap.appendChild(this._buildToggleRow('Ambient Occlusion', this._aoEnabled, (v) => {
            this._aoEnabled = v;
            window.runtime?.events?.emit('pryzm-set-ao', { enabled: v }); // F.events.14
            setSharedPostProcessing({ aoEnabled: v }); // 8C — persist across panel rebuilds
        }));
        wrap.appendChild(this._buildToggleRow('Bloom', this._bloomEnabled, (v) => {
            this._bloomEnabled = v;
            window.runtime?.events?.emit('pryzm-set-bloom', { enabled: v }); // F.events.14
            setSharedPostProcessing({ bloomEnabled: v });
        }));
        wrap.appendChild(this._buildSliderRow(
            'Exposure', this._exposure, 0.1, 3.0, 0.1, '',
            (v) => {
                this._exposure = v;
                window.runtime?.events?.emit('pryzm-set-exposure', { exposure: v }); // F.events.14
                setSharedPostProcessing({ exposure: v });
            },
        ));

        return wrap;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Control builders
    // ─────────────────────────────────────────────────────────────────────────

    private _buildSliderRow(
        label:    string,
        value:    number,
        min:      number,
        max:      number,
        step:     number,
        unit:     string,
        onChange: (v: number) => void,
        /** §L-625 — optional shared-store reader; registers a live-sync closure so the
         *  slider tracks a change made from the other panel. */
        readValue?: () => number,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'vp-row';

        const topRow = document.createElement('div');
        topRow.className = 'vp-row-top';

        const lbl = document.createElement('span');
        lbl.className   = 'vp-label';
        lbl.textContent = label;

        const valDisplay = document.createElement('span');
        valDisplay.className   = 'vp-value';
        valDisplay.textContent = value.toFixed(step < 1 ? 2 : 0) + unit;

        topRow.appendChild(lbl);
        topRow.appendChild(valDisplay);

        const slider = document.createElement('input');
        slider.type      = 'range';
        slider.className = 'vp-slider';
        slider.min       = String(min);
        slider.max       = String(max);
        slider.step      = String(step);
        slider.value     = String(value);

        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            valDisplay.textContent = v.toFixed(step < 1 ? 2 : 0) + unit;
            onChange(v);
        });

        if (readValue) {
            this._syncFns.push(() => {
                const v = readValue();
                // Don't fight a value the user is actively dragging into place.
                if (parseFloat(slider.value) !== v) {
                    slider.value = String(v);
                    valDisplay.textContent = v.toFixed(step < 1 ? 2 : 0) + unit;
                }
            });
        }

        row.appendChild(topRow);
        row.appendChild(slider);
        return row;
    }

    private _buildToggleRow(
        label:    string,
        checked:  boolean,
        onChange: (v: boolean) => void,
        /** §L-625 — optional shared-store reader for live cross-panel sync. */
        readChecked?: () => boolean,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'vp-row vp-row--toggle';

        const lbl = document.createElement('label');
        lbl.className   = 'vp-label';
        lbl.textContent = label;

        const toggle = document.createElement('input');
        toggle.type      = 'checkbox';
        toggle.className = 'vp-toggle';
        toggle.checked   = checked;
        toggle.addEventListener('change', () => onChange(toggle.checked));

        if (readChecked) {
            this._syncFns.push(() => { toggle.checked = readChecked(); });
        }

        row.appendChild(lbl);
        row.appendChild(toggle);
        return row;
    }
}
