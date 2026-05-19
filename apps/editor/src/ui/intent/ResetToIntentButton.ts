/**
 * ResetToIntentButton — Master Implementation Plan Wave 5 / Stage P2.
 *
 * The small `↻` button that lives on every Intent-derived row in the
 * Properties panel. Clicking it clears the per-row override and the field
 * re-resolves through the intent + profile + system-default chain — the
 * source pill on the same row should flip from `Override` back to whichever
 * layer the resolver lands on.
 *
 * Disabled state: when the row's resolver source is anything other than
 * `'override'`, the button is shown but disabled (greyed) — there's nothing
 * to reset. This keeps row geometry consistent across rows without forcing
 * conditional layout.
 *
 * Wired by Wave 5.5 when the four Properties-panel section builders
 * (`_buildViewRangeSection` / `_buildCropSection` / `_buildUnderlaySection`
 * / `_buildOutputSection`) consume the new resolver helpers.
 */

import type { IntentFieldSource } from '@pryzm/core-app-model/presentation';

export interface ResetToIntentButtonOptions {
    /** Current resolver source for this row. The button is disabled unless this is 'override'. */
    source:    IntentFieldSource;
    /** Click handler — fired only when the button is enabled. */
    onReset:   () => void;
    /** Optional row label, used in the aria-label and tooltip. */
    fieldName?: string;
}

export function renderResetToIntentButton(opts: ResetToIntentButtonOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderResetToIntentButton */): HTMLButtonElement {
    void runtime; /* B-runtime-void renderResetToIntentButton — TODO(C.3.x): route the override-clear command through runtime.bus.executeCommand once runtime.intent is wired */
    const { source, onReset, fieldName } = opts;
    const enabled = source === 'override';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `vi-reset-btn${enabled ? '' : ' vi-reset-btn--disabled'}`;
    btn.disabled = !enabled;

    btn.textContent = '↻';

    const aria = fieldName
        ? (enabled ? `Reset ${fieldName} to intent default` : `${fieldName} is at intent default`)
        : (enabled ? 'Reset to intent default' : 'At intent default');
    btn.setAttribute('aria-label', aria);
    btn.title = aria;

    if (enabled) {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            onReset();
        });
    }
    return btn;
}
