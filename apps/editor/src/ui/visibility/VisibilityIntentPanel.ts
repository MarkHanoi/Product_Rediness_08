/**
 * @file VisibilityIntentPanel.ts
 * @description Wave 14 — F.8.1 — runtime.visibility.evaluate wiring.
 *   Panel for controlling element visibility via the wave-chain evaluator.
 *   Surfaces hide/isolate/show-all affordances.  Phase F stub: evaluates
 *   all elements as visible; Phase 3A (Wave 19, S114-WIRE) wires the real
 *   manifest-honoured evaluation.
 */

import type { VisibilityElement, VisibilityView } from '@pryzm/visibility';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export class VisibilityIntentPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement): void {
        this._el = document.createElement('div');
        this._el.className = 'visibility-intent-panel';
        this._el.innerHTML = '<div class="vip-title">Visibility</div>';
        container.appendChild(this._el);
    }

    /** F.8.1 — runtime.visibility.evaluate wiring.
     *  Evaluates the given elements against the active view's visibility rules. */
    evaluate(
        elements: readonly VisibilityElement[],
        view: VisibilityView,
    ): ReadonlyMap<string, unknown> {
        if (!this._runtime) return new Map();
        // runtime.visibility.evaluate — the canonical wave-chain evaluator
        return this._runtime.visibility.evaluate(elements, view);
    }

    /** Hide all selected elements by dispatching a visibility.hide command. */
    hideSelected(elementIds: readonly string[]): void {
        if (!this._runtime || elementIds.length === 0) return;
        this._runtime.bus.executeCommand('visibility.hide', { elementIds });
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
