// A.25.1 — Living Design Parameters panel (the FIRST slice of the founder's
// "parameter sliders that influence the generated layout, re-running generation
// LIVE" vision).
//
// A small floating, draggable card (brand: white + #6600FF) with four 0..1
// design sliders — Daylight / Privacy / Kitchen workflow / Compactness. Each
// maps (via the PURE ai-host `designParamsToScoringWeights`) to ONE existing
// D-TGL `ScoringWeights` axis. On change the panel:
//   1. writes the sliders to the session stash (`setActiveDesignParams`), which
//      `gatherLayoutPayload` reads to override the payload's scoringWeights, and
//   2. debounced, re-triggers the EXISTING apartment-generate path
//      (`triggerApartmentLayout`) so the layout options re-rank LIVE. No new
//      generate path is invented (reuses the §11 trigger end-to-end).
//
// RULES (mirrors ClimatePanel idiom):
//   - UI-only. NEVER writes to any store directly (P6) — it only sets the
//     session stash + calls the existing trigger, which dispatches commands.
//   - No THREE imports. No Anthropic / fetch calls of its own.
//   - Styles live in AppTheme (DESIGN_PARAMS_PANEL_STYLES), never inline <style>.
//   - CSP-safe: addEventListener only, no inline handlers.
//
// References:
//   - docs/03-execution/plans/master-execution-tracker.md A.25.1
//   - packages/ai-host designParamsToScoringWeights (pure mapping + tests)

import { injectAppTheme } from '../styles/AppTheme';
import { makeDraggable } from '../makeDraggable';
import { DEFAULT_DESIGN_PARAMS, type DesignParams } from '@pryzm/ai-host';
import { setActiveDesignParams } from './activeDesignParams.js';
import { triggerApartmentLayout } from './apartmentLayoutTrigger.js';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime | null;

/** Debounce window for the live re-generate so dragging a slider doesn't spam
 *  the generate pipeline — only the settled value re-runs generation. */
const REGEN_DEBOUNCE_MS = 450;

/** The four sliders, in render order. `key` indexes DesignParams. */
const SLIDERS: ReadonlyArray<{ key: keyof DesignParams; label: string; hint: string }> = [
    { key: 'daylight',    label: 'Daylight',        hint: 'favour windowed / sun-facing rooms' },
    { key: 'privacy',     label: 'Privacy',         hint: 'bedrooms deep from the entrance' },
    { key: 'kitchen',     label: 'Kitchen workflow', hint: 'kitchen next to dining + a window' },
    { key: 'compactness', label: 'Compactness',     hint: 'minimise corridor / circulation' },
];

// ── Module-load singleton state ───────────────────────────────────────────────

let _runtime: Runtime = null;
let _panel: HTMLElement | null = null;
let _statusEl: HTMLElement | null = null;
let _params: DesignParams = { ...DEFAULT_DESIGN_PARAMS };
let _regenTimer: ReturnType<typeof setTimeout> | null = null;
/** When false, the panel updates the stash for the NEXT manual generate but does
 *  NOT auto-re-generate on drag. Lets the user opt out of the live behaviour. */
let _liveOnDrag = true;

export function wireDesignParamsRuntime(rt: Runtime): void {
    _runtime = rt;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Open the panel (creating it on first call). Re-applies the current sliders. */
export function openDesignParamsPanel(runtime: Runtime = null): void {
    if (runtime) _runtime = runtime;
    if (!_panel) {
        _panel = _build();
        document.body.appendChild(_panel);
    }
    // Make sure the stash reflects the panel's current state on open.
    setActiveDesignParams(_params);
    _panel.style.display = 'flex';
}

/** Hide the panel (kept in the DOM for cheap re-open). */
export function closeDesignParamsPanel(): void {
    if (_panel) _panel.style.display = 'none';
}

/** Toggle visibility. */
export function toggleDesignParamsPanel(runtime: Runtime = null): void {
    if (_panel && _panel.style.display !== 'none') closeDesignParamsPanel();
    else openDesignParamsPanel(runtime);
}

export function isDesignParamsPanelOpen(): boolean {
    return !!_panel && _panel.style.display !== 'none';
}

/** Test/HMR hygiene — tear the panel down. */
export function disposeDesignParamsPanel(): void {
    if (_regenTimer !== null) { clearTimeout(_regenTimer); _regenTimer = null; }
    if (_panel?.parentElement) _panel.parentElement.removeChild(_panel);
    _panel = null;
    _statusEl = null;
}

/** Register the DevTools console toggle. */
export function installDesignParamsConsoleTrigger(runtime: Runtime): void {
    if (runtime) _runtime = runtime;
    (window as unknown as { pryzmToggleDesignParams?: () => void }).pryzmToggleDesignParams =
        () => toggleDesignParamsPanel(_runtime);
    console.log('[design-params] console command ready — run pryzmToggleDesignParams() to open the Living Design Parameters panel.');
}

// ── Build ─────────────────────────────────────────────────────────────────────

function _build(): HTMLElement {
    injectAppTheme();
    const el = document.createElement('div');
    el.className = 'dpp-panel';
    el.style.display = 'none';

    // Header (drag handle).
    const header = document.createElement('div');
    header.className = 'dpp-header';
    header.style.cursor = 'move';
    const title = document.createElement('span');
    title.className = 'dpp-title';
    title.textContent = '🎚 Living Design Parameters';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dpp-close';
    close.title = 'Close';
    close.textContent = '✕';
    close.addEventListener('click', () => closeDesignParamsPanel());
    header.appendChild(title);
    header.appendChild(close);

    // Body.
    const body = document.createElement('div');
    body.className = 'dpp-body';

    const hint = document.createElement('div');
    hint.className = 'dpp-hint';
    hint.textContent = 'Bias the layout scorer. Drag a slider to re-rank the generated layouts live.';
    body.appendChild(hint);

    for (const s of SLIDERS) body.appendChild(_sliderRow(s));

    // Footer: status + live toggle + reset.
    const footer = document.createElement('div');
    footer.className = 'dpp-footer';
    const status = document.createElement('span');
    status.className = 'dpp-status';
    _statusEl = status;

    const liveBtn = document.createElement('button');
    liveBtn.type = 'button';
    liveBtn.className = 'dpp-btn dpp-btn--ghost';
    const syncLiveLabel = () => { liveBtn.textContent = _liveOnDrag ? 'Live: on' : 'Live: off'; };
    syncLiveLabel();
    liveBtn.addEventListener('click', () => { _liveOnDrag = !_liveOnDrag; syncLiveLabel(); });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'dpp-btn dpp-btn--ghost';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => _reset());

    footer.appendChild(status);
    footer.appendChild(liveBtn);
    footer.appendChild(resetBtn);
    body.appendChild(footer);

    el.appendChild(header);
    el.appendChild(body);

    try { makeDraggable(el, '.dpp-header', ['.dpp-close'], _runtime); }
    catch (e) { console.warn('[design-params] makeDraggable wiring failed (non-fatal):', e); }

    return el;
}

function _sliderRow(s: { key: keyof DesignParams; label: string; hint: string }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dpp-row';

    const head = document.createElement('div');
    head.className = 'dpp-row-head';
    const label = document.createElement('span');
    label.className = 'dpp-label';
    label.textContent = s.label;
    label.title = s.hint;
    const value = document.createElement('span');
    value.className = 'dpp-value';
    const renderValue = () => { value.textContent = `${Math.round(_params[s.key] * 100)}%`; };
    renderValue();
    head.appendChild(label);
    head.appendChild(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'dpp-slider';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(Math.round(_params[s.key] * 100));
    slider.setAttribute('aria-label', s.label);
    // 'input' fires continuously while dragging → update value label + stash
    // immediately, but DEBOUNCE the (expensive) re-generate.
    slider.addEventListener('input', () => {
        _params = { ..._params, [s.key]: Number(slider.value) / 100 };
        renderValue();
        setActiveDesignParams(_params);
        _scheduleRegen();
    });

    row.appendChild(head);
    row.appendChild(slider);
    return row;
}

// ── Behaviour ──────────────────────────────────────────────────────────────────

function _reset(): void {
    _params = { ...DEFAULT_DESIGN_PARAMS };
    setActiveDesignParams(_params);
    // Re-render the slider positions + value labels by rebuilding the body.
    if (_panel) {
        const old = _panel;
        const wasOpen = old.style.display !== 'none';
        disposeDesignParamsPanel();
        _panel = _build();
        document.body.appendChild(_panel);
        if (wasOpen) _panel.style.display = 'flex';
    }
    _scheduleRegen();
}

/** Debounced live re-generate via the EXISTING trigger. */
function _scheduleRegen(): void {
    if (!_liveOnDrag) {
        _setStatus('Saved — applies on next generate.');
        return;
    }
    if (_regenTimer !== null) clearTimeout(_regenTimer);
    _setStatus('Re-generating…');
    _regenTimer = setTimeout(() => {
        _regenTimer = null;
        try {
            // Reuse the existing §11 trigger end-to-end. gatherLayoutPayload reads
            // the design-params stash we just set → the new scoringWeights flow
            // into options.scoringWeights → the scorer re-ranks the options.
            triggerApartmentLayout(_runtime);
            _setStatus('');
        } catch (e) {
            console.warn('[design-params] live re-generate failed (non-fatal):', e);
            _setStatus('Re-generate failed — see console.');
        }
    }, REGEN_DEBOUNCE_MS);
}

function _setStatus(text: string): void {
    if (_statusEl) _statusEl.textContent = text;
}
