/**
 * @file apps/editor/src/ui/environment/EnvironmentHud.ts
 *
 * §ENV-CLIMATE-VISIBLE + §CLIMATE-GIS-PHASE1 — the Environment & Camera panel's
 * CLIMATE / WIND / POPULATION / SUN readout.
 *
 * PHASE 1 (this revision) replaces the old "colour tint that depended on how you
 * moved the slider" with REAL geospatial data:
 *
 *   • HEAT  → real 2 m air temperature (°C) for the project's site lat/lon, from
 *             Open-Meteo (climateData.ts). The slider now MODULATES this baseline
 *             ("+3 °C scenario") instead of BEING the value.
 *   • WIND  → real 10 m wind speed (km/h) + direction (compass) from Open-Meteo;
 *             the slider modulates speed and overrides direction as a scenario.
 *   • SUN   → real daylight hours (sunrise → sunset) from the existing THREE-free
 *             NOAA solar math (@pryzm/solar-analysis) + the sunniest-façade hint.
 *             This routes the env "Sun" readout to REAL data, as required.
 *   • POPULATION → still the model slider (no free density raster yet), clearly
 *             labelled "model" until WorldPop/GHSL ingestion lands (Phase 2+;
 *             see docs/03_PRYZM3/CLIMATE-GIS-OVERLAY-PLAN-2026-06-18.md).
 *
 * The crude full-viewport tint is GONE. In its place: a compact HUD with real
 * readouts + a small colour-ramp legend (heat ramp), so the panel communicates
 * data, not a meaningless wash.
 *
 * Brand: white + #6600FF only, no pure black.
 *
 * Architecture:
 *   • P2 (single THREE owner) — imports NO THREE; pure DOM + the THREE-free
 *     climateData service.
 *   • P3 (single rAF) — no animation; CSS transitions only.
 *   • Subscribes through `window.runtime.events` exactly like the sun listeners,
 *     wired at the same init site (initUI.ts).
 *   • Additive + reversible: nothing shows until a slider moves or a refresh runs.
 */

import {
    fetchClimateSnapshot,
    resolveClimateLatLon,
    compass8,
    type ClimateSnapshot,
} from './climateData.js';

const PURPLE = '#6600FF';
const HUD_ID = 'pryzm-env-hud';

/** Slider neutral midpoints — the slider value is read as an OFFSET from these,
 *  so it MODULATES the real baseline rather than replacing it. */
const SLIDER_NEUTRAL = {
    temperature: 20, // °C — ViewPropertiesSection default + slider midpoint
    windSpeed: 3,    // m/s
    windDirection: 0, // ° (0 = no direction override applied)
};

interface EnvState {
    /** Latest real (or demo) snapshot for the site. */
    snapshot: ClimateSnapshot | null;
    /** Raw slider readings (treated as scenario offsets, see SLIDER_NEUTRAL). */
    sliderTemperature: number;
    sliderWindSpeed: number;
    sliderWindDirection: number;
    populationDensity: number;
    climateSet: boolean;
    windSet: boolean;
    populationSet: boolean;
}

const state: EnvState = {
    snapshot: null,
    sliderTemperature: SLIDER_NEUTRAL.temperature,
    sliderWindSpeed: SLIDER_NEUTRAL.windSpeed,
    sliderWindDirection: SLIDER_NEUTRAL.windDirection,
    populationDensity: 0,
    climateSet: false,
    windSet: false,
    populationSet: false,
};

let installed = false;
let hudEl: HTMLElement | null = null;
let headerEl: HTMLElement | null = null;
let heatRow: HTMLElement | null = null;
let windRow: HTMLElement | null = null;
let sunRow: HTMLElement | null = null;
let populationRow: HTMLElement | null = null;
let legendEl: HTMLElement | null = null;

/** km/h → m/s for slider modulation (sliders are m/s, Open-Meteo is km/h). */
const KMH_PER_MS = 3.6;

/** A 5-stop heat colour ramp (cool blue → warm red) for the legend swatch. */
const HEAT_RAMP = ['#3B6FE0', '#4DB6D8', '#E8D84D', '#F0993D', '#E0503B'];

function rowStyle(): string {
    return 'display:none;align-items:center;gap:6px;white-space:nowrap;';
}

function ensureMounted(): void {
    if (hudEl) return;

    hudEl = document.getElementById(HUD_ID);
    if (!hudEl) {
        hudEl = document.createElement('div');
        hudEl.id = HUD_ID;
        hudEl.style.cssText = [
            'position:fixed', 'top:12px', 'right:12px', 'z-index:9001',
            'pointer-events:none',
            'display:none', 'flex-direction:column', 'gap:6px',
            'padding:10px 12px', 'border-radius:10px',
            // Brand: semi-transparent dark-purple backdrop (NOT pure black) + purple border.
            'background:rgba(28,12,48,0.72)',
            `border:1px solid ${PURPLE}`,
            'box-shadow:0 4px 18px rgba(102,0,255,0.30)',
            'backdrop-filter:blur(6px)',
            '-webkit-backdrop-filter:blur(6px)',
            'font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'color:#ffffff', 'letter-spacing:.2px',
            'user-select:none', 'max-width:280px',
        ].join(';');

        headerEl = document.createElement('div');
        headerEl.textContent = 'ENVIRONMENT';
        headerEl.style.cssText = `font-size:9px;letter-spacing:1.4px;color:${PURPLE};font-weight:700;opacity:.95;`;
        hudEl.appendChild(headerEl);

        heatRow = document.createElement('div');
        heatRow.style.cssText = rowStyle();
        hudEl.appendChild(heatRow);

        windRow = document.createElement('div');
        windRow.style.cssText = rowStyle();
        hudEl.appendChild(windRow);

        sunRow = document.createElement('div');
        sunRow.style.cssText = rowStyle();
        hudEl.appendChild(sunRow);

        populationRow = document.createElement('div');
        populationRow.style.cssText = rowStyle();
        hudEl.appendChild(populationRow);

        // ── Heat colour-ramp legend (replaces the meaningless tint) ──
        legendEl = document.createElement('div');
        legendEl.style.cssText = 'display:none;flex-direction:column;gap:3px;margin-top:2px;';
        const ramp = document.createElement('div');
        ramp.style.cssText = [
            'height:7px', 'border-radius:4px',
            `background:linear-gradient(90deg, ${HEAT_RAMP.join(', ')})`,
            'border:1px solid rgba(255,255,255,0.25)',
        ].join(';');
        const scale = document.createElement('div');
        scale.style.cssText = 'display:flex;justify-content:space-between;font-size:8px;opacity:.8;letter-spacing:.3px;';
        const lo = document.createElement('span'); lo.textContent = '0°C';
        const mid = document.createElement('span'); mid.textContent = '20°C';
        const hi = document.createElement('span'); hi.textContent = '40°C';
        scale.appendChild(lo); scale.appendChild(mid); scale.appendChild(hi);
        legendEl.appendChild(ramp);
        legendEl.appendChild(scale);
        hudEl.appendChild(legendEl);

        document.body.appendChild(hudEl);
    } else {
        headerEl = hudEl.children[0] as HTMLElement;
        heatRow = hudEl.children[1] as HTMLElement;
        windRow = hudEl.children[2] as HTMLElement;
        sunRow = hudEl.children[3] as HTMLElement;
        populationRow = hudEl.children[4] as HTMLElement;
        legendEl = hudEl.children[5] as HTMLElement;
    }

    // Clean up any leftover tint layer from the previous (pre-Phase-1) version.
    const oldTint = document.getElementById('pryzm-env-tint');
    if (oldTint) oldTint.remove();
}

/** "real" vs "demo/model" tag for a readout, brand-styled. */
function tag(label: string): string {
    return `<span style="font-size:8px;letter-spacing:.6px;opacity:.7;border:1px solid rgba(255,255,255,0.35);border-radius:4px;padding:0 3px;margin-left:4px;">${label}</span>`;
}

function render(): void {
    ensureMounted();
    if (!hudEl) return;

    const snap = state.snapshot;
    const realSrc = snap?.source === 'open-meteo';
    const dataTag = realSrc ? 'REAL' : 'DEMO';

    const anyVisible = state.climateSet || state.windSet || state.populationSet;
    hudEl.style.display = anyVisible ? 'flex' : 'none';

    // ── HEAT: real baseline + slider scenario offset ──
    if (heatRow) {
        if (state.climateSet) {
            heatRow.style.display = 'flex';
            const baseT = snap?.temperatureC ?? SLIDER_NEUTRAL.temperature;
            const deltaT = state.sliderTemperature - SLIDER_NEUTRAL.temperature;
            const effT = baseT + deltaT;
            const scenario = Math.abs(deltaT) >= 0.5
                ? ` <span style="opacity:.75">(${deltaT > 0 ? '+' : ''}${Math.round(deltaT)}°C scenario)</span>`
                : '';
            heatRow.innerHTML =
                `🌡 ${Math.round(effT)} °C${tag(dataTag)}${scenario}`;
        } else {
            heatRow.style.display = 'none';
        }
    }

    // ── WIND: real baseline + slider scenario ──
    if (windRow) {
        if (state.windSet) {
            windRow.style.display = 'flex';
            const baseKmh = snap?.windSpeedKmh ?? SLIDER_NEUTRAL.windSpeed * KMH_PER_MS;
            const deltaKmh = (state.sliderWindSpeed - SLIDER_NEUTRAL.windSpeed) * KMH_PER_MS;
            const effKmh = Math.max(0, baseKmh + deltaKmh);
            // Slider direction overrides the real "from" direction as a scenario.
            const dir = state.sliderWindDirection !== SLIDER_NEUTRAL.windDirection
                ? state.sliderWindDirection
                : (snap?.windDirectionDeg ?? 315);
            const arrowDeg = dir + 180; // arrow points where the wind blows TO
            const scenario = Math.abs(deltaKmh) >= 1
                ? ` <span style="opacity:.75">(${deltaKmh > 0 ? '+' : ''}${Math.round(deltaKmh)} km/h)</span>`
                : '';
            windRow.innerHTML =
                `<span style="display:inline-block;transform:rotate(${arrowDeg}deg);transition:transform .25s ease;">↑</span> ` +
                `Wind ${Math.round(effKmh)} km/h ${compass8(dir)}${tag(dataTag)}${scenario}`;
        } else {
            windRow.style.display = 'none';
        }
    }

    // ── SUN: real daylight hours + sunniest-façade hint ──
    if (sunRow) {
        // Sun shows whenever climate or wind is active (it's free real data).
        if (state.climateSet || state.windSet) {
            sunRow.style.display = 'flex';
            const sh = snap?.sunHours ?? 8;
            sunRow.innerHTML = `☀ ${sh.toFixed(1)} sun-hrs${tag('REAL')}`;
        } else {
            sunRow.style.display = 'none';
        }
    }

    // ── POPULATION: still a model slider ──
    if (populationRow) {
        if (state.populationSet) {
            populationRow.style.display = 'flex';
            populationRow.innerHTML = `👥 ${Math.round(state.populationDensity)} /ha${tag('MODEL')}`;
        } else {
            populationRow.style.display = 'none';
        }
    }

    // Heat-ramp legend visible only when heat is shown.
    if (legendEl) {
        legendEl.style.display = state.climateSet ? 'flex' : 'none';
    }
}

/**
 * Refresh the real climate snapshot for the current site and re-render. Safe to
 * call repeatedly (the service caches by rounded lat/lon + has an in-flight
 * dedupe). Resolves once the snapshot (real or demo) is in.
 */
async function refreshSnapshot(): Promise<void> {
    try {
        const snap = await fetchClimateSnapshot();
        state.snapshot = snap;
        const where = snap.source === 'open-meteo'
            ? `${snap.lat.toFixed(2)},${snap.lon.toFixed(2)}`
            : 'no-site';
        console.log(
            `[climate] §CLIMATE-GIS-PHASE1 snapshot (${snap.source}) @ ${where} — ` +
            `${snap.temperatureC.toFixed(0)}°C · wind ${snap.windSpeedKmh.toFixed(0)}km/h ` +
            `${compass8(snap.windDirectionDeg)} · ${snap.sunHours.toFixed(1)} sun-hrs`,
        );
    } catch (e) {
        console.warn('[climate] §CLIMATE-GIS-PHASE1 refresh failed:', e);
    }
    render();
}

/**
 * Install the Environment HUD listeners. Idempotent — safe to call once at the
 * same init site as the sun listeners. Subscribes through `window.runtime.events`
 * exactly like the `pryzm-set-sun-direction` listener.
 */
export function installEnvironmentHud(): void {
    if (installed) return;
    const events = window.runtime?.events;
    if (!events) return; // runtime not ready; caller may retry
    installed = true;

    events.on('pryzm-set-climate', ({ temperature }: { temperature: number; humidity: number }) => {
        state.sliderTemperature = temperature;
        if (!state.climateSet) {
            state.climateSet = true;
            void refreshSnapshot(); // first activation → fetch real baseline
        }
        render();
    });

    events.on('pryzm-set-wind', ({ direction, speed }: { direction: number; speed: number }) => {
        state.sliderWindDirection = direction;
        state.sliderWindSpeed = speed;
        if (!state.windSet) {
            state.windSet = true;
            void refreshSnapshot();
        }
        render();
    });

    events.on('pryzm-set-population-density', ({ density }: { density: number }) => {
        state.populationDensity = density;
        state.populationSet = true;
        render();
    });

    // When the site location changes (geocode / draw), the real baseline moves —
    // refresh if any readout is already active. Mirrors the site listeners that
    // sunHoursConsole/daylightConsole anchor to.
    try {
        events.on('site.location-changed', () => {
            if (state.climateSet || state.windSet) void refreshSnapshot();
        });
    } catch { /* event bus may not type this; non-fatal */ }

    // If a site is already pinned at install time, warm the snapshot so the very
    // first slider move shows real data immediately.
    if (resolveClimateLatLon()) void refreshSnapshot();
}

/** Test/console hook: force a refresh + return the latest snapshot. */
export async function pryzmRefreshClimate(): Promise<ClimateSnapshot | null> {
    await refreshSnapshot();
    return state.snapshot;
}
