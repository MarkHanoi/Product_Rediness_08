/**
 * @file src/ui/overlays/OperationModeOverlay.ts
 *
 * Operation Mode Overlay — Phase 5 (PRYZM Selection Toolbar Tools)
 *
 * A small instructional HUD that appears at the top-centre of the canvas
 * during multi-step editing operations (Join, Cut, Mirror, Scale, Offset,
 * Reference Edit). Driven entirely by window events — zero coupling to any
 * specific tool class.
 *
 * CSS prefix: oop-  (Operation Overlay Panel)
 *
 * Events consumed:
 *   bim-operation-instructions  { msg: string | null, operationId?: string }
 *     → Shows instruction text. Pass msg=null to hide.
 *   bim-operation-cancelled     { operationId: string }
 *     → Hides the overlay.
 *   bim-operation-completed     { operationId: string }
 *     → Hides the overlay.
 *   bim-operation-state-changed { operationId: string, active: boolean }
 *     → Updates the operation name badge.
 *   bim-operation-error         { msg: string }
 *     → Shows the overlay in error state for 2 seconds, then reverts.
 *
 * CONTRACT §05 §3   — prefix oop- registered in 05-BIM-UI-ARCHITECTURE-CONTRACT §3
 * CONTRACT §05 §6   — zero bim-* elements; pure native HTML
 * CONTRACT §05 §7.6 — no independent <style> injection; styles live in operationOverlay.ts
 * CONTRACT §01 §2.1 — read-only; never calls commandManager or mutates stores
 *
 * Implementation plan reference: Phase A, Step 3
 * docs/SELECTION-TOOLBAR-TOOLS-IMPLEMENTATION-PLAN.md §4
 */

import type { OperationId } from '@pryzm/input-host';

const OP_LABELS: Record<OperationId | string, string> = {
    join:             'JOIN',
    cut:              'CUT',
    mirror:           'MIRROR',
    copy:             'COPY',
    move:             'MOVE',
    scale:            'SCALE',
    offset:           'OFFSET',
    'reference-edit': 'REFERENCE',
};

export class OperationModeOverlay {
    private readonly _el:         HTMLElement;
    private readonly _msgEl:      HTMLElement;
    private readonly _badgeEl:    HTMLElement;

    private _errorTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentMsg = '';

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private readonly _container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._el      = this._build();
        this._msgEl   = this._el.querySelector('.oop-msg')!      as HTMLElement;
        this._badgeEl = this._el.querySelector('.oop-op-badge')! as HTMLElement;

        this._container.appendChild(this._el);
        this._wireEvents();

        console.log('[OperationModeOverlay] Initialized');
    }

    // ── DOM construction ─────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'oop-overlay';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.setAttribute('aria-label', 'Operation instruction');

        // ESC hint
        const escHint = document.createElement('span');
        escHint.className   = 'oop-esc-hint';
        escHint.textContent = 'ESC';
        overlay.appendChild(escHint);

        // Divider
        const div1 = document.createElement('div');
        div1.className = 'oop-divider';
        overlay.appendChild(div1);

        // Instruction text
        const msg = document.createElement('span');
        msg.className   = 'oop-msg';
        msg.textContent = '';
        overlay.appendChild(msg);

        // Divider
        const div2 = document.createElement('div');
        div2.className = 'oop-divider';
        overlay.appendChild(div2);

        // Operation name badge
        const badge = document.createElement('span');
        badge.className   = 'oop-op-badge';
        badge.textContent = '';
        overlay.appendChild(badge);

        return overlay;
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    private _wireEvents(): void {
        window.addEventListener('bim-operation-instructions', (e: Event) => {
            const { msg, operationId } = (e as CustomEvent<{
                msg: string | null;
                operationId?: string;
            }>).detail;

            if (operationId) this._setBadge(operationId);

            if (msg === null || msg === undefined) {
                this._hide();
            } else {
                this._currentMsg = msg;
                this._setMessage(msg);
                this._show();
            }
        });

        // F.events.10 — bim-operation-cancelled via runtime.events
        window.runtime?.events?.on('bim-operation-cancelled', () => {
            this._hide();
        });

        window.addEventListener('bim-operation-completed', () => {
            this._hide();
        });

        window.addEventListener('bim-operation-state-changed', (e: Event) => {
            const { operationId, active } = (e as CustomEvent<{
                operationId: string;
                active: boolean;
            }>).detail;

            if (active) {
                this._setBadge(operationId);
            }
        });

        window.addEventListener('bim-operation-error', (e: Event) => {
            const { msg } = (e as CustomEvent<{ msg: string }>).detail;
            this._showError(msg);
        });
    }

    // ── State management ─────────────────────────────────────────────────────

    private _show(): void {
        this._el.classList.add('oop-overlay--visible');
    }

    private _hide(): void {
        this._el.classList.remove('oop-overlay--visible', 'oop-overlay--error');
        this._msgEl.textContent   = '';
        this._badgeEl.textContent = '';
        this._currentMsg          = '';
    }

    private _setMessage(msg: string): void {
        this._msgEl.textContent = msg;
        this._el.classList.remove('oop-overlay--error');
    }

    private _setBadge(operationId: string): void {
        this._badgeEl.textContent = OP_LABELS[operationId] ?? operationId.toUpperCase();
    }

    private _showError(msg: string): void {
        this._setMessage(msg);
        this._show();
        this._el.classList.add('oop-overlay--error');

        if (this._errorTimer !== null) clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => {
            this._el.classList.remove('oop-overlay--error');
            // Restore previous message if any
            if (this._currentMsg) {
                this._setMessage(this._currentMsg);
            } else {
                this._hide();
            }
            this._errorTimer = null;
        }, 2500);
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /** Show an instruction message directly (without dispatching an event). */
    showMessage(msg: string, operationId?: string): void {
        this._currentMsg = msg;
        if (operationId) this._setBadge(operationId);
        this._setMessage(msg);
        this._show();
    }

    /** Hide the overlay directly. */
    hide(): void {
        this._hide();
    }

    /** The root DOM element, for external positioning or removal. */
    get element(): HTMLElement {
        return this._el;
    }

    destroy(): void {
        if (this._errorTimer !== null) clearTimeout(this._errorTimer);
        this._el.remove();
    }
}
