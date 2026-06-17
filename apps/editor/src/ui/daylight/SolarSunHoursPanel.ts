// ADR-0074 P1b (C21 §10) — Solar "Sun Hours" visual control panel (L5 editor UI).
//
// The on-screen control surface for the renderer-three sun-hours analysis pass
// (computeSunHoursOnModel), closing the gap with the ThatOpen WebGPU solar demo.
// The COMPUTE backend already exists — this panel only drives it.
//
// Layer / architecture:
//   - L5 editor UI. Vanilla DOM (no React), matching the prevailing panel pattern.
//   - It NEVER imports THREE. All geometry/raycast work stays in renderer-three;
//     the panel reaches the compute through the existing legal seam exposed by
//     sunHoursConsole.ts (`computeSunHoursForActiveLevel` / `clearSunHoursForScene`),
//     and imports only THREE-FREE pure helpers (presets, labels, ramp) from
//     @pryzm/renderer-three.
//   - BRAND: white panel + #6600FF accents, grey-on-white text. No black chrome.
//
// CSS prefix: ssh- (Solar Sun Hours). Styles are injected once as a <style> with a
// data-tag guard (this is a standalone additive panel; it does not depend on the
// AppTheme injection pipeline being present).

import {
    DEFAULT_SUN_HOURS_RAMP,
    seasonToDayOfYear,
    clampDayOfYear,
    dayOfYearLabel,
    clampTimeMinutes,
    timeMinutesLabel,
    type SeasonPreset,
    type RampStop,
} from '@pryzm/renderer-three';
import { makeDraggable } from '../makeDraggable.js';
import {
    computeSunHoursForActiveLevel,
    clearSunHoursForScene,
    resolveDefaultSiteLatLng,
    type SunHoursConsoleOptions,
} from './sunHoursConsole.js';

const PRYZM_PURPLE = '#6600FF';
const STYLE_TAG = 'pryzm-solar-sun-hours-styles';

/** Build the CSS gradient string mirroring the heatmap ramp stops EXACTLY. */
export function rampToCssGradient(ramp: ReadonlyArray<RampStop> = DEFAULT_SUN_HOURS_RAMP): string {
    const stops = ramp.map((s) => {
        const r = Math.round(s.color.r * 255);
        const g = Math.round(s.color.g * 255);
        const b = Math.round(s.color.b * 255);
        return `rgb(${r},${g},${b}) ${Math.round(s.t * 100)}%`;
    });
    return `linear-gradient(90deg, ${stops.join(', ')})`;
}

const STYLES = `
.ssh-panel {
  position: fixed; top: 88px; right: 20px; z-index: 4200;
  width: 320px; max-height: 86vh; overflow-y: auto;
  background: #ffffff; color: #444;
  border: 1px solid #e6e0f7; border-radius: 12px;
  box-shadow: 0 16px 48px rgba(102,0,255,0.18);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.ssh-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; cursor: move;
  background: ${PRYZM_PURPLE}; color: #ffffff;
  border-radius: 12px 12px 0 0; font-weight: 650; font-size: 14px; user-select: none;
}
.ssh-close {
  border: none; background: rgba(255,255,255,0.18); color: #ffffff;
  width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 15px; line-height: 1;
}
.ssh-close:hover { background: rgba(255,255,255,0.32); }
.ssh-body { padding: 14px; display: flex; flex-direction: column; gap: 14px; }
.ssh-field { display: flex; flex-direction: column; gap: 6px; }
.ssh-field label { font-size: 11px; font-weight: 650; color: #6b6480; text-transform: uppercase; letter-spacing: .03em; }
.ssh-row { display: flex; align-items: center; gap: 8px; }
.ssh-row input[type=range] { flex: 1 1 auto; accent-color: ${PRYZM_PURPLE}; }
.ssh-readout { min-width: 56px; text-align: right; font-weight: 650; color: ${PRYZM_PURPLE}; font-variant-numeric: tabular-nums; }
.ssh-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ssh-preset {
  padding: 6px 8px; border: 1px solid #e0d8f5; border-radius: 8px; cursor: pointer;
  background: #f7f4ff; color: ${PRYZM_PURPLE}; font-weight: 600; font-size: 11px;
}
.ssh-preset:hover { background: #efe8ff; border-color: ${PRYZM_PURPLE}; }
.ssh-toggles { display: flex; flex-direction: column; gap: 6px; }
.ssh-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #555; }
.ssh-toggle input { accent-color: ${PRYZM_PURPLE}; }
.ssh-actions { display: flex; gap: 8px; }
.ssh-compute {
  flex: 1 1 auto; padding: 10px 12px; border: none; border-radius: 9px; cursor: pointer;
  background: ${PRYZM_PURPLE}; color: #ffffff; font-weight: 700; font-size: 13px; letter-spacing: .02em;
}
.ssh-compute:hover { background: #5200cc; }
.ssh-compute:disabled { opacity: .6; cursor: progress; }
.ssh-clear {
  padding: 10px 12px; border: 1px solid #e0d8f5; border-radius: 9px; cursor: pointer;
  background: #ffffff; color: ${PRYZM_PURPLE}; font-weight: 650; font-size: 12px;
}
.ssh-clear:hover { background: #f7f4ff; }
.ssh-chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ssh-chip {
  background: #f7f4ff; border: 1px solid #e6e0f7; border-radius: 9px;
  padding: 8px 6px; text-align: center;
}
.ssh-chip .ssh-chip-k { font-size: 10px; font-weight: 700; color: #8b82a8; letter-spacing: .04em; }
.ssh-chip .ssh-chip-v { font-size: 18px; font-weight: 800; color: ${PRYZM_PURPLE}; font-variant-numeric: tabular-nums; }
.ssh-chip .ssh-chip-u { font-size: 10px; color: #8b82a8; }
.ssh-legend { display: flex; flex-direction: column; gap: 4px; }
.ssh-legend-bar { height: 12px; border-radius: 6px; border: 1px solid #e6e0f7; }
.ssh-legend-scale { display: flex; justify-content: space-between; font-size: 10px; color: #8b82a8; }
.ssh-status { font-size: 11px; color: #8b82a8; min-height: 14px; }
.ssh-status.ssh-status-err { color: #b00050; }
`;

function injectStyles(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_TAG)) return;
    const el = document.createElement('style');
    el.id = STYLE_TAG;
    el.textContent = STYLES;
    document.head.appendChild(el);
}

const SEASONS: ReadonlyArray<{ key: SeasonPreset; label: string }> = [
    { key: 'summer', label: 'Summer ☀' },
    { key: 'winter', label: 'Winter ❄' },
    { key: 'spring', label: 'Spring 🌱' },
    { key: 'autumn', label: 'Autumn 🍂' },
];

/**
 * The Solar Sun-Hours floating control panel. Construct once and call `mount()` to
 * attach to the document; `close()` / `dispose()` to remove. Singleton-friendly via
 * the module-level `openSolarPanel()` below.
 */
export class SolarSunHoursPanel {
    private root: HTMLElement | null = null;
    private disposeDrag: (() => void) | null = null;

    // Control state.
    private timeMinutes = 12 * 60; // 12:00
    private dayOfYear = 172;       // summer solstice default
    private latDeg: number;
    private exteriorOnly = true;
    private excludeGlass = true;

    // Element refs.
    private timeReadout: HTMLElement | null = null;
    private dayReadout: HTMLElement | null = null;
    private latReadout: HTMLElement | null = null;
    private dayInput: HTMLInputElement | null = null;
    private avgEl: HTMLElement | null = null;
    private maxEl: HTMLElement | null = null;
    private minEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;
    private computeBtn: HTMLButtonElement | null = null;

    constructor() {
        // Default latitude from the project site location if reachable, else 51.5.
        let lat = 51.5;
        try { lat = resolveDefaultSiteLatLng().lat; } catch { /* keep default */ }
        this.latDeg = Number.isFinite(lat) ? Math.round(lat * 10) / 10 : 51.5;
    }

    /** True when the panel is currently mounted. */
    isOpen(): boolean { return this.root !== null && this.root.isConnected; }

    /** Attach the panel to `document.body` (idempotent — brings to front if open). */
    mount(): HTMLElement {
        injectStyles();
        if (this.root && this.root.isConnected) return this.root;
        this.root = this.build();
        if (typeof document !== 'undefined') document.body.appendChild(this.root);
        this.disposeDrag = makeDraggable(this.root, '.ssh-header', ['.ssh-close']);
        return this.root;
    }

    /** Remove the panel from the DOM (keeps any painted overlay in the scene). */
    close(): void { this.dispose(); }

    /** Remove the panel + its drag chrome. */
    dispose(): void {
        this.disposeDrag?.();
        this.disposeDrag = null;
        if (this.root && this.root.parentElement) this.root.parentElement.removeChild(this.root);
        this.root = null;
    }

    private build(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'ssh-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Solar Sun Hours');

        panel.appendChild(this.buildHeader());

        const body = document.createElement('div');
        body.className = 'ssh-body';
        body.appendChild(this.buildTimeField());
        body.appendChild(this.buildDayField());
        body.appendChild(this.buildPresets());
        body.appendChild(this.buildLatField());
        body.appendChild(this.buildToggles());
        body.appendChild(this.buildActions());
        body.appendChild(this.buildChips());
        body.appendChild(this.buildLegend());
        this.statusEl = el('div', 'ssh-status', 'Ready — set a time + day, then Compute.');
        body.appendChild(this.statusEl);
        panel.appendChild(body);
        return panel;
    }

    private buildHeader(): HTMLElement {
        const h = document.createElement('div');
        h.className = 'ssh-header';
        const title = document.createElement('span');
        title.textContent = 'Solar — Sun Hours';
        const close = document.createElement('button');
        close.className = 'ssh-close';
        close.type = 'button';
        close.textContent = '×';
        close.title = 'Close';
        close.addEventListener('click', () => this.close());
        h.appendChild(title);
        h.appendChild(close);
        return h;
    }

    private buildTimeField(): HTMLElement {
        const field = el('div', 'ssh-field');
        field.appendChild(el('label', undefined, 'Time of day'));
        const row = el('div', 'ssh-row');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '240';   // 04:00
        input.max = '1320';  // 22:00
        input.step = '15';
        input.value = String(this.timeMinutes);
        this.timeReadout = el('span', 'ssh-readout', timeMinutesLabel(this.timeMinutes));
        input.addEventListener('input', () => {
            this.timeMinutes = clampTimeMinutes(Number(input.value));
            if (this.timeReadout) this.timeReadout.textContent = timeMinutesLabel(this.timeMinutes);
        });
        row.appendChild(input);
        row.appendChild(this.timeReadout);
        field.appendChild(row);
        return field;
    }

    private buildDayField(): HTMLElement {
        const field = el('div', 'ssh-field');
        field.appendChild(el('label', undefined, 'Day of year'));
        const row = el('div', 'ssh-row');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '1';
        input.max = '365';
        input.step = '1';
        input.value = String(this.dayOfYear);
        this.dayInput = input;
        this.dayReadout = el('span', 'ssh-readout', dayOfYearLabel(this.dayOfYear));
        input.addEventListener('input', () => {
            this.dayOfYear = clampDayOfYear(Number(input.value));
            if (this.dayReadout) this.dayReadout.textContent = dayOfYearLabel(this.dayOfYear);
        });
        row.appendChild(input);
        row.appendChild(this.dayReadout);
        field.appendChild(row);
        return field;
    }

    private buildPresets(): HTMLElement {
        const field = el('div', 'ssh-field');
        field.appendChild(el('label', undefined, 'Solstice / equinox'));
        const grid = el('div', 'ssh-presets');
        for (const s of SEASONS) {
            const btn = document.createElement('button');
            btn.className = 'ssh-preset';
            btn.type = 'button';
            btn.textContent = s.label;
            btn.addEventListener('click', () => this.setDay(seasonToDayOfYear(s.key)));
            grid.appendChild(btn);
        }
        field.appendChild(grid);
        return field;
    }

    private buildLatField(): HTMLElement {
        const field = el('div', 'ssh-field');
        field.appendChild(el('label', undefined, 'Latitude'));
        const row = el('div', 'ssh-row');
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '-66';
        input.max = '66';
        input.step = '0.5';
        input.value = String(this.latDeg);
        this.latReadout = el('span', 'ssh-readout', `${this.latDeg.toFixed(1)}°`);
        input.addEventListener('input', () => {
            this.latDeg = Number(input.value);
            if (this.latReadout) this.latReadout.textContent = `${this.latDeg.toFixed(1)}°`;
        });
        row.appendChild(input);
        row.appendChild(this.latReadout);
        field.appendChild(row);
        return field;
    }

    private buildToggles(): HTMLElement {
        const field = el('div', 'ssh-field');
        const wrap = el('div', 'ssh-toggles');
        wrap.appendChild(this.toggle('Exterior surfaces only', this.exteriorOnly, (v) => { this.exteriorOnly = v; }));
        wrap.appendChild(this.toggle('Exclude glass / glazing', this.excludeGlass, (v) => { this.excludeGlass = v; }));
        field.appendChild(wrap);
        return field;
    }

    private toggle(label: string, initial: boolean, onChange: (v: boolean) => void): HTMLElement {
        const row = document.createElement('label');
        row.className = 'ssh-toggle';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = initial;
        cb.addEventListener('change', () => onChange(cb.checked));
        row.appendChild(cb);
        row.appendChild(document.createTextNode(label));
        return row;
    }

    private buildActions(): HTMLElement {
        const row = el('div', 'ssh-actions');
        const compute = document.createElement('button');
        compute.className = 'ssh-compute';
        compute.type = 'button';
        compute.textContent = 'COMPUTE SUN HOURS';
        compute.addEventListener('click', () => this.compute());
        this.computeBtn = compute;
        const clear = document.createElement('button');
        clear.className = 'ssh-clear';
        clear.type = 'button';
        clear.textContent = 'Clear';
        clear.addEventListener('click', () => this.clear());
        row.appendChild(compute);
        row.appendChild(clear);
        return row;
    }

    private buildChips(): HTMLElement {
        const grid = el('div', 'ssh-chips');
        const { wrap: a, val: av } = this.chip('AVG');
        const { wrap: b, val: bv } = this.chip('MAX');
        const { wrap: c, val: cv } = this.chip('MIN');
        this.avgEl = av; this.maxEl = bv; this.minEl = cv;
        grid.appendChild(a); grid.appendChild(b); grid.appendChild(c);
        return grid;
    }

    private chip(key: string): { wrap: HTMLElement; val: HTMLElement } {
        const wrap = el('div', 'ssh-chip');
        wrap.appendChild(el('div', 'ssh-chip-k', key));
        const val = el('div', 'ssh-chip-v', '—');
        wrap.appendChild(val);
        wrap.appendChild(el('div', 'ssh-chip-u', 'hours'));
        return { wrap, val };
    }

    private buildLegend(): HTMLElement {
        const field = el('div', 'ssh-field');
        field.appendChild(el('label', undefined, 'Sun hours'));
        const legend = el('div', 'ssh-legend');
        const bar = el('div', 'ssh-legend-bar');
        bar.style.background = rampToCssGradient(DEFAULT_SUN_HOURS_RAMP);
        const scale = el('div', 'ssh-legend-scale');
        scale.appendChild(el('span', undefined, '0h'));
        scale.appendChild(el('span', undefined, 'max'));
        legend.appendChild(bar);
        legend.appendChild(scale);
        field.appendChild(legend);
        return field;
    }

    /** Set the day-of-year (from a preset) + sync the slider + readout. */
    private setDay(day: number): void {
        this.dayOfYear = clampDayOfYear(day);
        if (this.dayInput) this.dayInput.value = String(this.dayOfYear);
        if (this.dayReadout) this.dayReadout.textContent = dayOfYearLabel(this.dayOfYear);
    }

    private setStatus(text: string, isError = false): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.classList.toggle('ssh-status-err', isError);
    }

    /** Run the compute via the existing console seam + populate the result chips. */
    private compute(): void {
        if (this.computeBtn) this.computeBtn.disabled = true;
        this.setStatus('Computing sun hours…');
        // Defer one frame so the disabled/working state paints first.
        const run = (): void => {
            const opts: SunHoursConsoleOptions = {
                dayOfYear: this.dayOfYear,
                latDeg: this.latDeg,
                centerTimeMinutes: this.timeMinutes,
                exteriorOnly: this.exteriorOnly,
                excludeGlass: this.excludeGlass,
                paint: true,
            };
            try {
                const res = computeSunHoursForActiveLevel(opts);
                if (!res) {
                    this.setStatus('No result — open a project + build/generate geometry first (see console).', true);
                } else {
                    const r = res.result;
                    if (this.avgEl) this.avgEl.textContent = r.avgSunHours.toFixed(2);
                    if (this.maxEl) this.maxEl.textContent = r.maxSunHours.toFixed(2);
                    if (this.minEl) this.minEl.textContent = r.minSunHours.toFixed(2);
                    this.setStatus(
                        `${res.meshCount} surfaces · ${res.sunSampleCount} sun samples · painted=${res.painted}.`,
                    );
                }
            } catch (e) {
                this.setStatus(`Compute failed: ${(e as Error).message ?? e}`, true);
            } finally {
                if (this.computeBtn) this.computeBtn.disabled = false;
            }
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => window.requestAnimationFrame(run));
        } else {
            run();
        }
    }

    private clear(): void {
        try {
            const n = clearSunHoursForScene();
            if (this.avgEl) this.avgEl.textContent = '—';
            if (this.maxEl) this.maxEl.textContent = '—';
            if (this.minEl) this.minEl.textContent = '—';
            this.setStatus(`Cleared overlay on ${n} mesh(es).`);
        } catch (e) {
            this.setStatus(`Clear failed: ${(e as Error).message ?? e}`, true);
        }
    }
}

/** Tiny DOM helper: create an element with an optional class + text. */
function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// ─── singleton open/close + console wiring ───────────────────────────────────

let singleton: SolarSunHoursPanel | null = null;

/** Open (or focus) the Solar Sun-Hours panel. Returns the panel instance. */
export function openSolarSunHoursPanel(): SolarSunHoursPanel {
    if (!singleton) singleton = new SolarSunHoursPanel();
    singleton.mount();
    return singleton;
}

/** Close the Solar Sun-Hours panel if open. */
export function closeSolarSunHoursPanel(): void {
    singleton?.close();
}

declare global {
    interface Window {
        pryzmOpenSolarPanel?: () => void;
        pryzmCloseSolarPanel?: () => void;
    }
}

/** Install the `window.pryzmOpenSolarPanel()` / `pryzmCloseSolarPanel()` console
 *  openers (consistent with the existing `window.pryzm*` pattern). Idempotent. */
export function installSolarPanelConsole(): void {
    if (typeof window === 'undefined') return;
    window.pryzmOpenSolarPanel = () => { openSolarSunHoursPanel(); };
    window.pryzmCloseSolarPanel = () => closeSolarSunHoursPanel();
    console.log('[sun-hours] §DIAG-SUN-HOURS panel ready — run pryzmOpenSolarPanel() to open the Solar — Sun Hours control panel.');
}
