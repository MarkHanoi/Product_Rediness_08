/**
 * @file src/ui/intent/IntentSourcePill.ts
 *
 * Wave 2 — UI/UX §1.1
 * Renders the small pill that lives in the Properties-panel intent spine and
 * communicates the *source* of the current state of a view, in plain terms:
 *
 *   - Pure intent       — view shows whatever the bound VisibilityIntent says.
 *   - Customised        — local overrides are layered on top of the intent.
 *   - No intent assigned — view is unbound; Intent Editor will create one.
 *
 * The pill is purely presentational and stateless. Callers pass the resolved
 * status; this module owns the visual contract (tokens + glyph + label).
 */

import { ICON_INTENT, ICON_PIN, ICON_WARNING, makeIcon } from '../icons/ViewerIconSet';

export type IntentSourceState = 'pure' | 'customised' | 'unbound';

export interface IntentSourcePillOptions {
    state: IntentSourceState;
    /** Optional override count, shown in parentheses for 'customised'. */
    overrideCount?: number;
    /** Optional click handler — when set, the pill becomes a button. */
    onClick?: () => void;
}

const COPY: Record<IntentSourceState, { label: string; tone: string; icon: string }> = {
    pure:       { label: 'Pure intent',         tone: 'vi-pill--ok',    icon: ICON_INTENT },
    customised: { label: 'Customised',          tone: 'vi-pill--warn',  icon: ICON_PIN    },
    unbound:    { label: 'No intent assigned',  tone: 'vi-pill--error', icon: ICON_WARNING },
};

export function renderIntentSourcePill(opts: IntentSourcePillOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderIntentSourcePill */): HTMLElement {
    void runtime; /* B-runtime-void renderIntentSourcePill — TODO(C.3.x): once runtime.intent is wired, the pill copy can subscribe to runtime.intent.layerChanged for live re-derivation instead of caller re-render */
    const { state, overrideCount, onClick } = opts;
    const { label, tone, icon } = COPY[state];

    const el = document.createElement(onClick ? 'button' : 'span');
    el.className = `vi-pill ${tone}`;
    el.setAttribute('role', onClick ? 'button' : 'status');
    el.setAttribute('aria-label', `View intent state: ${label}`);

    el.appendChild(makeIcon(icon, { className: 'vi-pill__icon' }));

    const text = document.createElement('span');
    text.className = 'vi-pill__label';
    text.textContent = state === 'customised' && overrideCount
        ? `${label} (${overrideCount})`
        : label;
    el.appendChild(text);

    if (onClick) {
        (el as HTMLButtonElement).type = 'button';
        el.addEventListener('click', onClick);
    }

    return el;
}

/** Pure helper — derive the source state from an OverrideLayer. */
export function deriveIntentSourceState(layer: {
    isolateActive: boolean;
    visibilityOverrides: ReadonlyArray<unknown>;
    graphicOverrides:    ReadonlyArray<unknown>;
} | null | undefined, hasIntent: boolean): IntentSourceState {
    if (!hasIntent) return 'unbound';
    if (!layer) return 'pure';
    const customised = layer.isolateActive
        || layer.visibilityOverrides.length > 0
        || layer.graphicOverrides.length    > 0;
    return customised ? 'customised' : 'pure';
}

/** Pure helper — total override count across all collections. */
export function countOverrides(layer: {
    visibilityOverrides: ReadonlyArray<unknown>;
    graphicOverrides:    ReadonlyArray<unknown>;
} | null | undefined): number {
    if (!layer) return 0;
    return layer.visibilityOverrides.length + layer.graphicOverrides.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 5 / Stage P2 — per-row field source pill
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The per-row, dense variant of the source pill. Distinct from the global
 * `IntentSourcePill` above — the global one shows the spine-level state
 * ('pure' / 'customised' / 'unbound'); this one shows where a single row's
 * value came from in the resolver chain
 * (system-default / intent / profile / override).
 *
 * Wired by Wave 5.5 when the four Properties-panel section builders consume
 * the new `resolveViewRange` / `resolveCrop` / `resolveUnderlay` /
 * `resolveOutput` helpers from `IntentRuleResolver`.
 */
import type { IntentFieldSource } from '@pryzm/core-app-model/presentation';

const FIELD_SOURCE_LABELS: Record<IntentFieldSource, string> = {
    'system-default': 'Default',
    'intent':         'Intent',
    'profile':        'Profile',
    'override':       'Override',
};

const FIELD_SOURCE_ARIA: Record<IntentFieldSource, string> = {
    'system-default': 'Resolved from the system default — neither the intent nor this view declares this field.',
    'intent':         'Resolved from the bound intent.',
    'profile':        'Resolved from the intent\'s view-type profile.',
    'override':       'Overridden on this view — click reset to fall back to the intent default.',
};

export interface FieldSourcePillOptions {
    source: IntentFieldSource;
    /** Optional field name — included in the aria-label for screen readers. */
    fieldName?: string;
    /** Optional click handler (e.g. open the Per-Element Editor's provenance block). */
    onClick?: () => void;
}

/**
 * Renders the per-row pill. The DOM contract is intentionally compact so the
 * pill fits next to a numeric input on the same row without wrapping.
 */
export function renderFieldSourcePill(opts: FieldSourcePillOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderFieldSourcePill */): HTMLElement {
    void runtime; /* B-runtime-void renderFieldSourcePill — TODO(C.3.x): once runtime.intent.resolveWithSourceChain is wired, the pill could re-derive on layer change instead of caller re-render */
    const { source, fieldName, onClick } = opts;
    const label = FIELD_SOURCE_LABELS[source] ?? source;

    const el = document.createElement(onClick ? 'button' : 'span');
    el.className = `vi-field-pill vi-field-pill--${source}`;
    el.textContent = label;

    const aria = fieldName
        ? `${fieldName}: ${FIELD_SOURCE_ARIA[source]}`
        : FIELD_SOURCE_ARIA[source];
    el.setAttribute('aria-label', aria);
    el.title = aria;

    if (onClick) {
        (el as HTMLButtonElement).type = 'button';
        el.addEventListener('click', onClick);
    }
    return el;
}
