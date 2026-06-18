/**
 * @file apps/editor/src/ui/environment/EnvironmentHud.ts
 *
 * §ENV-CLIMATE-VISIBLE — founder request: the Environment & Camera panel's
 * CLIMATE / WIND / POPULATION sliders emitted typed runtime events but nothing
 * listened, so "nothing visible on any of the views". This module gives those
 * three events the SMALLEST sensible *visible* behaviour, mirroring the working
 * SUN wiring (apps/editor/src/engine/initUI.ts — `pryzm-set-sun-direction`
 * listener block, which subscribes via `window.runtime.events.on(...)`).
 *
 * What it draws (all on a single shared DOM overlay mounted on document.body,
 * so it is visible across EVERY view — 3D, plan and globe share one body):
 *
 *   • CLIMATE / HEAT  → HUD badge `🌡 {temp}°C · {humidity}% RH`
 *                       + a subtle full-viewport scene tint: warm/amber as the
 *                         temperature rises, cool/blue as it falls. The tint is a
 *                         very low-opacity DOM gradient layer (NOT a post-effect,
 *                         NOT a THREE light change) so it is fully reversible and
 *                         never touches sun/shadow behaviour (P2-safe).
 *   • WIND            → HUD badge `🧭 {direction}° · {speed} m/s`
 *                       + a small compass arrow that rotates to the direction.
 *   • POPULATION      → HUD badge `👥 {density} /ha`.
 *
 * Brand: white + #6600FF only, no pure black (semi-transparent dark-purple
 * backdrop, never #000).
 *
 * Architecture:
 *   • P2 (single THREE owner) — this file imports NO THREE; it is pure DOM.
 *   • It subscribes through `window.runtime.events`, exactly like the sun
 *     listeners, and is wired at the same init site (initUI.ts).
 *   • Additive + low-risk: default state shows nothing until a slider moves.
 */

const PURPLE = '#6600FF';
const HUD_ID = 'pryzm-env-hud';
const TINT_ID = 'pryzm-env-tint';

interface EnvState {
    temperature: number;
    humidity: number;
    windDirection: number;
    windSpeed: number;
    populationDensity: number;
    climateSet: boolean;
    windSet: boolean;
    populationSet: boolean;
}

const state: EnvState = {
    temperature: 20,
    humidity: 50,
    windDirection: 0,
    windSpeed: 3,
    populationDensity: 0,
    climateSet: false,
    windSet: false,
    populationSet: false,
};

let installed = false;
let hudEl: HTMLElement | null = null;
let climateRow: HTMLElement | null = null;
let windRow: HTMLElement | null = null;
let populationRow: HTMLElement | null = null;
let windArrow: HTMLElement | null = null;
let tintEl: HTMLElement | null = null;

/** Map a temperature (°C) to a subtle tint colour: cool-blue → neutral → warm-amber. */
function tintForTemperature(tempC: number): { color: string; alpha: number } {
    // Clamp to the slider's range (-10 … 45 °C). 20 °C ≈ neutral.
    const t = Math.max(-10, Math.min(45, tempC));
    const neutral = 20;
    if (Math.abs(t - neutral) < 0.5) return { color: PURPLE, alpha: 0 };
    if (t > neutral) {
        // Warm: amber. Intensity scales toward the hot end.
        const k = (t - neutral) / (45 - neutral); // 0 … 1
        return { color: '#FF9A3D', alpha: 0.05 + 0.13 * k };
    }
    // Cool: blue. Intensity scales toward the cold end.
    const k = (neutral - t) / (neutral - -10); // 0 … 1
    return { color: '#4D9AFF', alpha: 0.05 + 0.13 * k };
}

function ensureMounted(): void {
    if (hudEl && tintEl) return;

    // ── Tint layer (behind the HUD, over the canvas; ignores pointer events) ──
    tintEl = document.getElementById(TINT_ID);
    if (!tintEl) {
        tintEl = document.createElement('div');
        tintEl.id = TINT_ID;
        tintEl.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9000',
            'pointer-events:none', 'opacity:0',
            'transition:background-color .35s ease, opacity .35s ease',
            'background-color:transparent',
            'mix-blend-mode:multiply',
        ].join(';');
        document.body.appendChild(tintEl);
    }

    // ── HUD badge (top-right corner) ──
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
            'user-select:none',
        ].join(';');

        const header = document.createElement('div');
        header.textContent = 'ENVIRONMENT';
        header.style.cssText = `font-size:9px;letter-spacing:1.4px;color:${PURPLE};font-weight:700;opacity:.95;`;
        hudEl.appendChild(header);

        climateRow = document.createElement('div');
        climateRow.style.cssText = 'display:none;align-items:center;gap:6px;';
        hudEl.appendChild(climateRow);

        windRow = document.createElement('div');
        windRow.style.cssText = 'display:none;align-items:center;gap:6px;';
        // Compass arrow — a small rotating gnomon.
        windArrow = document.createElement('span');
        windArrow.textContent = '↑';
        windArrow.style.cssText = [
            'display:inline-flex', 'align-items:center', 'justify-content:center',
            'width:16px', 'height:16px', 'border-radius:50%',
            `border:1px solid ${PURPLE}`, 'color:#ffffff', 'font-size:11px',
            'transition:transform .25s ease', 'transform:rotate(0deg)',
        ].join(';');
        const windText = document.createElement('span');
        windText.className = 'pryzm-env-wind-text';
        windRow.appendChild(windArrow);
        windRow.appendChild(windText);
        hudEl.appendChild(windRow);

        populationRow = document.createElement('div');
        populationRow.style.cssText = 'display:none;align-items:center;gap:6px;';
        hudEl.appendChild(populationRow);

        document.body.appendChild(hudEl);
    } else {
        climateRow = hudEl.children[1] as HTMLElement;
        windRow = hudEl.children[2] as HTMLElement;
        populationRow = hudEl.children[3] as HTMLElement;
        windArrow = windRow.querySelector('span') as HTMLElement;
    }
}

function render(): void {
    ensureMounted();
    if (!hudEl) return;

    const anyVisible = state.climateSet || state.windSet || state.populationSet;
    hudEl.style.display = anyVisible ? 'flex' : 'none';

    if (climateRow) {
        if (state.climateSet) {
            climateRow.style.display = 'flex';
            climateRow.textContent =
                `🌡 ${Math.round(state.temperature)}°C · ${Math.round(state.humidity)}% RH`;
        } else {
            climateRow.style.display = 'none';
        }
    }

    if (windRow && windArrow) {
        if (state.windSet) {
            windRow.style.display = 'flex';
            // Meteorological convention: direction = where the wind comes FROM.
            // Arrow points toward where it blows TO (dir + 180).
            windArrow.style.transform = `rotate(${state.windDirection + 180}deg)`;
            const textEl = windRow.querySelector('.pryzm-env-wind-text') as HTMLElement | null;
            if (textEl) {
                textEl.textContent =
                    `🧭 ${Math.round(state.windDirection)}° · ${state.windSpeed.toFixed(1)} m/s`;
            }
        } else {
            windRow.style.display = 'none';
        }
    }

    if (populationRow) {
        if (state.populationSet) {
            populationRow.style.display = 'flex';
            populationRow.textContent = `👥 ${Math.round(state.populationDensity)} /ha`;
        } else {
            populationRow.style.display = 'none';
        }
    }

    // ── Scene tint follows temperature (only once climate is set) ──
    if (tintEl) {
        if (state.climateSet) {
            const { color, alpha } = tintForTemperature(state.temperature);
            tintEl.style.backgroundColor = color;
            tintEl.style.opacity = String(alpha);
        } else {
            tintEl.style.opacity = '0';
        }
    }
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

    events.on('pryzm-set-climate', ({ temperature, humidity }: { temperature: number; humidity: number }) => {
        state.temperature = temperature;
        state.humidity = humidity;
        state.climateSet = true;
        render();
    });

    events.on('pryzm-set-wind', ({ direction, speed }: { direction: number; speed: number }) => {
        state.windDirection = direction;
        state.windSpeed = speed;
        state.windSet = true;
        render();
    });

    events.on('pryzm-set-population-density', ({ density }: { density: number }) => {
        state.populationDensity = density;
        state.populationSet = true;
        render();
    });
}
