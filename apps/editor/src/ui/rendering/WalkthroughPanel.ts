/**
 * @file src/ui/rendering/WalkthroughPanel.ts
 * @description Minimal walkthrough HUD overlay.
 *
 * CONTRACT compliance (05-BIM-UI-ARCHITECTURE-CONTRACT):
 *  - Prefix: `fw-`  (first-person walkthrough — all CSS in AppTheme.ts under fw- block)
 *  - NO bim-* web components (§7.8).
 *  - UI-only; zero writes to ElementStores.
 *  - Mounted to document.body as a floating overlay (same pattern as other panels).
 *
 * Shows a small on-screen hint while walk mode is active and is
 * hidden when walk mode is inactive.
 */

import { panelManager } from '../PanelManager';

export class WalkthroughPanel {
    private _el: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el = this._build();
        panelManager.register('panel:walkthrough', () => this.hide());
    }

    getElement(): HTMLElement { return this._el; }
    show(): void { panelManager.notifyOpened('panel:walkthrough'); this._el.style.display = 'flex'; }
    hide(): void { panelManager.notifyClosed('panel:walkthrough'); this._el.style.display = 'none'; }

    // ── Build ──────────────────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const el = document.createElement('div');
        el.id        = 'pryzm-walkthrough-hud';
        el.className = 'fw-hud';

        el.innerHTML = `
            <div class="fw-hud-badge">
                🚶 Walk Mode Active
            </div>
            <div class="fw-hud-hint">
                WASD / Arrow Keys to move &nbsp;•&nbsp; Mouse to look &nbsp;•&nbsp; <kbd class="fw-kbd">ESC</kbd> to exit
            </div>
        `;

        return el;
    }
}

// ── Factory / mount helpers (matches pattern in other panels) ──────────────────

let _instance: WalkthroughPanel | null = null;

export function mountWalkthroughPanel(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime mountWalkthroughPanel */): WalkthroughPanel {
    void runtime; /* B-runtime-void mountWalkthroughPanel — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    if (_instance) return _instance;
    _instance = new WalkthroughPanel();
    container.appendChild(_instance.getElement());
    return _instance;
}

export function getWalkthroughPanel(): WalkthroughPanel {
    if (!_instance) throw new Error('[WalkthroughPanel] Not mounted yet.');
    return _instance;
}
