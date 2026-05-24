/**
 * SaveUndoRedoHUD — Always-visible top-left Save / Undo / Redo controls
 *
 * CSS prefix: surh- (Save Undo Redo HUD)
 * CONTRACT §05 §3 — prefix claimed
 * CONTRACT §05 §6 — zero bim-* / @thatopen/ui elements; pure native HTML
 * CONTRACT §05 §7.6 — styles injected via AppTheme.ts SURH_STYLES constant
 * CONTRACT §06 §3 — additive component; no existing code modified
 *
 * Positioned fixed at top-left, to the right of the 52px vb-panel spine.
 * Dispatches pryzm-hub-action { action:'save' } for Save.
 * Uses commandManager for Undo / Redo.
 */

export const SURH_STYLES = `
/* ── Save / Undo / Redo HUD (surh-) ──────────────────────────────────── */
.surh-bar {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    pointer-events: auto;
    background: var(--app-panel-bg, #ffffff);
    border-radius: 24px;
    padding: 3px 4px;
    box-shadow: var(--app-shadow-card);
    user-select: none;
    box-sizing: border-box;
}

.surh-btn {
    width: 30px;
    height: 100%;
    min-height: 28px;
    border: none;
    background: transparent;
    color: var(--app-text-2, #5a6a85);
    cursor: pointer;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
    font-family: var(--app-font);
    box-sizing: border-box;
}

.surh-btn:hover {
    background: var(--app-violet-soft, rgba(102,0,255,0.08));
    color: var(--app-accent, #6600FF);
}

.surh-btn:active {
    transform: scale(0.91);
}

.surh-btn svg {
    display: block;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.surh-divider {
    width: 1px;
    height: 14px;
    align-self: center;
    background: rgba(0,0,0,0.10);
    margin: 0 1px;
    flex-shrink: 0;
}
`;

const SAVE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
</svg>`;

const UNDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7v5h5"/>
    <path d="M3.51 12A9 9 0 1 0 5 5.07"/>
</svg>`;

const REDO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 7v5h-5"/>
    <path d="M20.49 12A9 9 0 1 1 19 5.07"/>
</svg>`;

// Phase B.9 (S73-WIRE) — runtime threading per S72 §16.2 row B.9.
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export class SaveUndoRedoHUD {
    readonly element: HTMLElement;

    /** Phase B.9 (S73-WIRE) — runtime threaded by parent (Layout.ts);
     *  `public readonly`, optional with default `null` for legacy boot. */
    public readonly runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
        const bar = document.createElement('div');
        bar.className = 'surh-bar';

        const saveBtn = this._makeBtn('Save project (Ctrl+S)', SAVE_ICON, () => {
            window.runtime?.events?.emit('pryzm-hub-action', { action: 'save' }); // F.events.15
        });

        const divider = document.createElement('div');
        divider.className = 'surh-divider';

        // §OI-054 (2026-05-24) — route the buttons through the SINGLE unified undo
        // path (C03 §4.6 U-5). Previously this called `runtime.undoStack.undo()`
        // (snapshot stack, non-functional) or, when `runtime` was null, ONLY
        // `commandManager.undo()` — which NEVER consults the CommandBus ring buffer,
        // so the undo BUTTON could not undo plan-view (bus-only) elements ("UNDO:
        // history empty" — the live bug). performUndo() is ring-buffer-first with a
        // commandManager fallback, identical to the keyboard Ctrl+Z, so button and
        // keyboard can never diverge again.
        const undoBtn = this._makeBtn('Undo (Ctrl+Z)', UNDO_ICON, () => {
            void import('../engine/undo/performUndoRedo.js').then(m => m.performUndo());
        });

        const redoBtn = this._makeBtn('Redo (Ctrl+Y)', REDO_ICON, () => {
            void import('../engine/undo/performUndoRedo.js').then(m => m.performRedo());
        });

        bar.appendChild(saveBtn);
        bar.appendChild(divider);
        bar.appendChild(undoBtn);
        bar.appendChild(redoBtn);

        this.element = bar;
    }

    private _makeBtn(title: string, iconHtml: string, onClick: () => void): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'surh-btn';
        btn.title = title;
        btn.innerHTML = iconHtml;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }
}
