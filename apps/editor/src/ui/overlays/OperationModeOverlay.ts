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

    /**
     * §FIX-OP-REFUSAL-VISIBLE (L-813, §CONTEXT-DATA-HONESTY) — a hide request that
     * lands while an error is on screen is SUPPRESSED until the error's own timer
     * elapses.
     *
     * THE BUG THIS CLOSES. Every operation tool reports a command refusal as
     *     `this._showError(info); this._complete();`
     * `_complete()` synchronously fires `bim-operation-instructions {msg:null}` AND
     * `bim-operation-completed`, both of which called `_hide()` — which cleared the
     * error class and the message text in the SAME TICK the error was set. So the
     * whole family of correct, well-worded refusals ("Walls are parallel", "Walls are
     * already joined at this corner", "Join rejected: too close to parallel", "Cut
     * would produce a wall shorter than 0.1 m", WALL_NOT_FOUND) rendered for ~0 ms.
     * A refusal and a success were literally the same observable: nothing. That is
     * the single reason "the wall edit tools do nothing" was so hard to diagnose.
     *
     * The error still auto-clears after its 2.5 s window (see `_showError`), which
     * then performs the deferred hide — so nothing gets stuck on screen.
     */
    private _hide(): void {
        if (this._errorTimer !== null) {
            // An error is currently displayed — defer the hide to the error timer.
            this._hideDeferredByError = true;
            return;
        }
        this._hideNow();
    }

    /** Unconditional hide — the error-suppression path in `_hide()` calls this. */
    private _hideNow(): void {
        this._hideDeferredByError = false;
        this._el.classList.remove('oop-overlay--visible', 'oop-overlay--error');
        this._msgEl.textContent   = '';
        this._badgeEl.textContent = '';
        this._currentMsg          = '';
    }

    /** True when a hide was requested while an error was on screen. */
    private _hideDeferredByError = false;

    private _setMessage(msg: string): void {
        this._msgEl.textContent = msg;
        this._el.classList.remove('oop-overlay--error');
    }

    private _setBadge(operationId: string): void {
        this._badgeEl.textContent = OP_LABELS[operationId] ?? operationId.toUpperCase();
    }

    private _showError(msg: string): void {
        // §FIX-OP-REFUSAL-VISIBLE — snapshot the pre-error instruction BEFORE
        // `_setMessage` and before any `_complete()`-driven hide can wipe it, so the
        // restore below is correct even when the tool tears itself down immediately.
        const priorMsg = this._currentMsg;
        this._hideDeferredByError = false;
        this._setMessage(msg);
        this._show();
        this._el.classList.add('oop-overlay--error');

        if (this._errorTimer !== null) clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => {
            this._errorTimer = null;
            this._el.classList.remove('oop-overlay--error');
            // A hide arrived while the error was displayed (the normal case: the tool
            // calls _complete() right after reporting the refusal) — honour it now.
            if (this._hideDeferredByError || !priorMsg) {
                this._hideNow();
                return;
            }
            // Otherwise the operation is still running: restore its instruction.
            this._currentMsg = priorMsg;
            this._setMessage(priorMsg);
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
