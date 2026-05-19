/**
 * @file src/ui/property-panel/ViewPropertiesSection.ts
 *
 * Renders the "View Properties" default state for the Property Inspector
 * when no BIM element is selected (Phase 2.2).
 *
 * Sections:
 *   - Sun Settings      (azimuth, elevation, intensity)
 *   - Shadows           (enabled toggle)
 *   - Post-processing   (AO toggle, bloom toggle, exposure)
 *
 * Engine integration — dispatches custom window events read by initUI.ts:
 *   'pryzm-set-sun-direction'  → { x, y, z }   (Three.js normalised vector)
 *   'pryzm-set-sun-intensity'  → { intensity }  (0 – 2 scale)
 *   'pryzm-toggle-shadows'     → void (toggles current shadow state)
 *
 * Contract compliance:
 *   §05 §3  — CSS prefix vp- registered in viewerPanels.ts VIEW_PROPERTIES_SECTION_STYLES
 *   §05 §6  — Zero bim-* elements; pure native HTML
 *   §05 §7.6— No independent <style> injection
 *   §01 §3.5— No store mutations; renderer changes via Three.js directly
 *   §06 §10.1 — No @thatopen/components imports in UI layer
 */

export class ViewPropertiesSection {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _azimuth   = 225;
    private _elevation = 60;
    private _intensity = 0.8;
    private _shadowsEnabled = true;
    private _aoEnabled      = false;
    private _bloomEnabled   = false;
    private _exposure       = 1.0;

    build(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'vp-root';
        root.appendChild(this._buildSection('SUN SETTINGS',    true,  this._buildSunSettings()));
        root.appendChild(this._buildSection('SHADOWS',         true,  this._buildShadowSettings()));
        root.appendChild(this._buildSection('POST-PROCESSING', false, this._buildPostProcessing()));
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

        wrap.appendChild(this._buildSliderRow(
            'Azimuth', this._azimuth, 0, 360, 1, '°',
            (v) => { this._azimuth   = v; this._applySunDirection(); },
        ));
        wrap.appendChild(this._buildSliderRow(
            'Elevation', this._elevation, 0, 90, 1, '°',
            (v) => { this._elevation = v; this._applySunDirection(); },
        ));
        wrap.appendChild(this._buildSliderRow(
            'Intensity', this._intensity, 0.1, 2.0, 0.05, '',
            (v) => {
                this._intensity = v;
                window.runtime?.events?.emit('pryzm-set-sun-intensity', { intensity: v }); // F.events.14
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
        return wrap;
    }

    private _buildPostProcessing(): HTMLElement {
        const wrap = document.createElement('div');

        wrap.appendChild(this._buildToggleRow('Ambient Occlusion', this._aoEnabled, (v) => {
            this._aoEnabled = v;
            window.runtime?.events?.emit('pryzm-set-ao', { enabled: v }); // F.events.14
        }));
        wrap.appendChild(this._buildToggleRow('Bloom', this._bloomEnabled, (v) => {
            this._bloomEnabled = v;
            window.runtime?.events?.emit('pryzm-set-bloom', { enabled: v }); // F.events.14
        }));
        wrap.appendChild(this._buildSliderRow(
            'Exposure', this._exposure, 0.1, 3.0, 0.1, '',
            (v) => {
                this._exposure = v;
                window.runtime?.events?.emit('pryzm-set-exposure', { exposure: v }); // F.events.14
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
        const azRad = (this._azimuth   * Math.PI) / 180;
        const elRad = (this._elevation * Math.PI) / 180;
        const x =  Math.sin(azRad) * Math.cos(elRad);
        const y =  Math.sin(elRad);
        const z =  Math.cos(azRad) * Math.cos(elRad);
        window.runtime?.events?.emit('pryzm-set-sun-direction', { x, y, z }); // F.events.14
    }
}
