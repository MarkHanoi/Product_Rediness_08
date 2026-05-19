/**
 * SourceChainTooltip — Master Implementation Plan Wave 5 / Stage B4.
 *
 * Per journeys §13 B4, the small per-row source pill (and the Per-Element
 * Editor's provenance block) need to show the full precedence chain on hover:
 *
 *   System default     (lineWeight 0.18)
 *   → Intent base      (lineWeight 0.18)
 *   → Intent · plan    (lineWeight 0.50)   ← profile patch
 *   → Override (this view) (lineWeight 0.70)
 *
 * Each row is a `SourceContribution` from `resolveWithSourceChain`. The
 * tooltip is built once per hover and removed on `mouseleave` — this keeps
 * us out of the React-style imperative DOM diffing the rest of the panel
 * uses.
 *
 * Pure presentation. No store reads. Caller passes the chain.
 */

import type { ElementStateAppearance } from '@pryzm/core-app-model';
import type { IntentFieldSource, SourceContribution } from '@pryzm/core-app-model/presentation';

const ORIGIN_LABELS: Record<IntentFieldSource, string> = {
    'system-default': 'System default',
    'intent':         'Intent base',
    'profile':        'Intent · profile',
    'override':       'Override (this view)',
};

/**
 * Pretty-print the slice of an `ElementStateAppearance` that's most useful
 * in a tooltip — line weight + colour. The plan's example focuses on
 * `lineWeight` so we lead with that.
 */
function describeAppearance(value: ElementStateAppearance): string {
    if (!value || !value.line) return '—';
    const w = typeof value.line.weight === 'number' ? `${value.line.weight.toFixed(2)} mm` : '—';
    const c = value.line.colour ?? '—';
    return `lineWeight ${w} · colour ${c}`;
}

/**
 * Builds the tooltip element from the chain. Returns a detached `<div>` —
 * the caller is responsible for inserting it into the DOM and removing it
 * on `mouseleave`. This module owns the visual contract only.
 */
export function renderSourceChainTooltip(chain: SourceContribution[], runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderSourceChainTooltip */): HTMLElement {
    void runtime; /* B-runtime-void renderSourceChainTooltip — TODO(C.3.x): once runtime.intent.resolveWithSourceChain is wired, the tooltip can subscribe to layer changes for live refresh */
    const root = document.createElement('div');
    root.className = 'vi-chain-tooltip';
    root.setAttribute('role', 'tooltip');

    const title = document.createElement('div');
    title.className = 'vi-chain-tooltip__title';
    title.textContent = 'Source chain';
    root.appendChild(title);

    const list = document.createElement('ol');
    list.className = 'vi-chain-tooltip__list';

    chain.forEach((entry, idx) => {
        const item = document.createElement('li');
        item.className = `vi-chain-tooltip__item vi-chain-tooltip__item--${entry.origin}`;
        if (idx === chain.length - 1) {
            item.classList.add('vi-chain-tooltip__item--final');
        }

        const originSpan = document.createElement('span');
        originSpan.className = 'vi-chain-tooltip__origin';
        originSpan.textContent = ORIGIN_LABELS[entry.origin] ?? entry.origin;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'vi-chain-tooltip__value';
        valueSpan.textContent = ` — ${describeAppearance(entry.value)}`;

        item.appendChild(originSpan);
        item.appendChild(valueSpan);
        list.appendChild(item);
    });

    root.appendChild(list);
    return root;
}

/**
 * Convenience binder — attaches a hover-show / leave-hide pattern to any
 * element. The chain is recomputed lazily so callers don't pay the cost
 * unless the user actually hovers.
 *
 * Returns a teardown function so callers can detach when their parent
 * panel is destroyed.
 */
export function attachSourceChainTooltip(
    target: HTMLElement,
    getChain: () => SourceContribution[],
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime attachSourceChainTooltip */,
): () => void {
    void runtime; /* B-runtime-void attachSourceChainTooltip — TODO(C.3.x): runtime is forwarded to renderSourceChainTooltip below once C lands */
    let tip: HTMLElement | null = null;

    const onEnter = () => {
        if (tip) return;
        const chain = getChain();
        if (!chain || chain.length === 0) return;
        tip = renderSourceChainTooltip(chain);
        const rect = target.getBoundingClientRect();
        tip.style.position = 'fixed';
        tip.style.top  = `${rect.bottom + 6}px`;
        tip.style.left = `${rect.left}px`;
        tip.style.zIndex = '10000';
        document.body.appendChild(tip);
    };
    const onLeave = () => {
        if (tip) {
            tip.remove();
            tip = null;
        }
    };

    target.addEventListener('mouseenter', onEnter);
    target.addEventListener('mouseleave', onLeave);
    target.addEventListener('focus',      onEnter);
    target.addEventListener('blur',       onLeave);

    return () => {
        target.removeEventListener('mouseenter', onEnter);
        target.removeEventListener('mouseleave', onLeave);
        target.removeEventListener('focus',      onEnter);
        target.removeEventListener('blur',       onLeave);
        onLeave();
    };
}
