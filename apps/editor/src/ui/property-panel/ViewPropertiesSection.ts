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

export class ViewPropertiesSection {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // §FEAT-REAL-ENVIRONMENT (ADR-0106) — restore persisted environment/post-proc
        // state so a panel rebuild (per selection) keeps the user's choices.
        this._sunMode              = sharedRenderingState.sunMode;
        this._groundShadowsEnabled = sharedRenderingState.groundShadows;
        this._aoEnabled            = sharedRenderingState.aoEnabled;
        this._bloomEnabled         = sharedRenderingState.bloomEnabled;
        this._exposure             = sharedRenderingState.exposure;
    }

    // §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — the sun is REAL: driven from the
    // site lat/lon + time-of-day (same NOAA basis as the Cesium/Forma globe). In
    // 'real+offset' mode the Azimuth/Elevation/Intensity sliders are OFFSETS /
    // multipliers on the real value; in 'manual' they are absolute (legacy studio
    // key). Defaults: real+offset, zero offset, ×1 intensity, noon.
    private _sunMode: 'real+offset' | 'manual' = 'real+offset';
    private _azimuth   = 0;    // offset(deg) in real+offset; absolute(deg) in manual
    private _elevation = 0;    // offset(deg) in real+offset; absolute(deg) in manual
    private _intensity = 1.0;  // multiplier in real+offset; absolute(0–2) in manual
    private _timeHours = 12;   // time-of-day the real sun is solved for
    private _shadowsEnabled = true;
    private _groundShadowsEnabled = true; // §FEAT-GROUND-SHADOW-CATCHER — default ON
    private _aoEnabled      = false;
    private _bloomEnabled   = false;
    private _exposure       = 1.0;

    // §ENV-PANEL-CLIMATE — founder request: heat / wind / population density for ALL views.
    // Optional/defaulted environment fields; existing views are unaffected because every
    // value carries a sensible default and only emits on user interaction.
    private _temperature      = 20;  // °C
    private _humidity         = 50;  // %
    private _windDirection    = 0;   // ° (0 = North)
    private _windSpeed        = 3;   // m/s
    private _populationDensity = 0;  // persons / ha

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'vp-root';
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

        // §FEAT-REAL-ENVIRONMENT-SUN — mode toggle: REAL (ephemeris) + offset vs MANUAL.
        // ON  = real+offset (sliders are offsets on the true solar position);
        // OFF = manual (sliders are absolute — the legacy studio key).
        wrap.appendChild(this._buildToggleRow('Real sun (site + time)', this._sunMode === 'real+offset', (on) => {
            this._sunMode = on ? 'real+offset' : 'manual';
            window.runtime?.events?.emit('pryzm-set-sun-mode', { mode: this._sunMode });
            setSharedPostProcessing({ sunMode: this._sunMode }); // persist across rebuilds
            // Re-emit current slider values so the engine re-solves in the new mode.
            this._applySunDirection();
            this._applySunIntensity();
        }));

        // Time of day — drives the ephemeris in real+offset mode.
        wrap.appendChild(this._buildSliderRow(
            'Time of day', this._timeHours, 0, 24, 0.25, 'h',
            (v) => {
                this._timeHours = v;
                window.runtime?.events?.emit('pryzm-set-sun-time', { hours: v });
            },
        ));

        // Azimuth / Elevation — OFFSETS in real+offset mode, ABSOLUTE in manual.
        // Range spans negative offsets so the sun can be nudged either way.
        wrap.appendChild(this._buildSliderRow(
            'Azimuth', this._azimuth, -180, 180, 1, '°',
            (v) => { this._azimuth   = v; this._applySunDirection(); },
        ));
        wrap.appendChild(this._buildSliderRow(
            'Elevation', this._elevation, -90, 90, 1, '°',
            (v) => { this._elevation = v; this._applySunDirection(); },
        ));
        wrap.appendChild(this._buildSliderRow(
            'Intensity', this._intensity, 0.0, 2.0, 0.05, '×',
            (v) => { this._intensity = v; this._applySunIntensity(); },
        ));

        return wrap;
    }

    // ─── §ENV-PANEL-CLIMATE — Climate / Heat ─────────────────────────────────
    private _buildClimateSettings(): HTMLElement {
        const wrap = document.createElement('div');

        wrap.appendChild(this._buildSliderRow(
            'Temperature', this._temperature, -10, 45, 1, '°C',
            (v) => { this._temperature = v; this._applyClimate(); },
        ));
        wrap.appendChild(this._buildSliderRow(
            'Humidity', this._humidity, 0, 100, 1, '%',
            (v) => { this._humidity = v; this._applyClimate(); },
        ));

        return wrap;
    }

    // ─── §ENV-PANEL-CLIMATE — Wind ───────────────────────────────────────────
    private _buildWindSettings(): HTMLElement {
        const wrap = document.createElement('div');

        wrap.appendChild(this._buildSliderRow(
            'Direction', this._windDirection, 0, 360, 1, '°',
            (v) => { this._windDirection = v; this._applyWind(); },
        ));
        wrap.appendChild(this._buildSliderRow(
            'Speed', this._windSpeed, 0, 30, 0.5, ' m/s',
            (v) => { this._windSpeed = v; this._applyWind(); },
        ));

        return wrap;
    }

    // ─── §ENV-PANEL-CLIMATE — Population Density ──────────────────────────────
    private _buildPopulationSettings(): HTMLElement {
        const wrap = document.createElement('div');

        wrap.appendChild(this._buildSliderRow(
            'Density', this._populationDensity, 0, 100, 1, '/ha',
            (v) => {
                this._populationDensity = v;
                window.runtime?.events?.emit('pryzm-set-population-density', { density: v }); // F.events.14
            },
        ));

        return wrap;
    }

    private _buildShadowSettings(): HTMLElement {
        const wrap = document.createElement('div');
        wrap.appendChild(this._buildToggleRow('Cast shadows', this._shadowsEnabled, (v) => {
            this._shadowsEnabled = v;
            window.runtime?.events?.emit('pryzm-toggle-shadows', { enabled: v }); // F.events.14
        }));
        // §FEAT-GROUND-SHADOW-CATCHER — invisible L0 plane so every element casts a
        // grounded shadow even with no floor slab. Default ON.
        wrap.appendChild(this._buildToggleRow('Ground shadows', this._groundShadowsEnabled, (v) => {
            this._groundShadowsEnabled = v;
            window.runtime?.events?.emit('pryzm-toggle-ground-shadows', { enabled: v });
            setSharedPostProcessing({ groundShadows: v }); // persist across rebuilds
        }));
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

        row.appendChild(topRow);
        row.appendChild(slider);
        return row;
    }

    private _buildToggleRow(
        label:    string,
        checked:  boolean,
        onChange: (v: boolean) => void,
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

        row.appendChild(lbl);
        row.appendChild(toggle);
        return row;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lighting helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _applySunDirection(): void {
        // §FEAT-REAL-ENVIRONMENT-SUN — primary path: hand azimuth/elevation to the
        // RealEnvironmentService as offsets (real+offset) or absolutes (manual). It
        // drives the Pascal KEY LIGHT (the real shadow caster) from the true solar
        // position, so shadows fall at the real sun angle.
        window.runtime?.events?.emit('pryzm-set-sun-offsets', {
            azimuthDeg:   this._azimuth,
            elevationDeg: this._elevation,
        });
        // Manual mode also nudges the legacy OBC ShadowedScene light so viewports
        // without the real-sun service still track the panel. In real+offset mode
        // the key light is authoritative, so we skip the legacy emit to avoid a
        // second, differently-angled directional light fighting the sun.
        if (this._sunMode === 'manual') {
            const azRad = (this._azimuth   * Math.PI) / 180;
            const elRad = (this._elevation * Math.PI) / 180;
            const x =  Math.sin(azRad) * Math.cos(elRad);
            const y =  Math.sin(elRad);
            const z =  Math.cos(azRad) * Math.cos(elRad);
            window.runtime?.events?.emit('pryzm-set-sun-direction', { x, y, z }); // F.events.14
        }
    }

    private _applySunIntensity(): void {
        // Primary: intensity multiplier/absolute → RealEnvironmentService.
        window.runtime?.events?.emit('pryzm-set-sun-offsets', { intensity: this._intensity });
        // Manual mode also drives the legacy OBC light intensity.
        if (this._sunMode === 'manual') {
            window.runtime?.events?.emit('pryzm-set-sun-intensity', { intensity: this._intensity }); // F.events.14
        }
    }

    // ─── §ENV-PANEL-CLIMATE — environment helpers ────────────────────────────
    private _applyClimate(): void {
        window.runtime?.events?.emit('pryzm-set-climate', { // F.events.14
            temperature: this._temperature,
            humidity:    this._humidity,
        });
    }

    private _applyWind(): void {
        window.runtime?.events?.emit('pryzm-set-wind', { // F.events.14
            direction: this._windDirection,
            speed:     this._windSpeed,
        });
    }
}
