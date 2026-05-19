/**
 * @file src/ui/ConfirmDialog.ts
 *
 * Async confirm dialog that matches the PRYZM design system (violet palette).
 * Replaces native window.confirm() so the browser never shows the
 * "An embedded page at … says" header.
 *
 * CONTRACT §05 §2 — Styling is injected exclusively via AppTheme.ts (cdlg- prefix).
 * This file contains DOM logic only, zero inline styles.
 *
 * Usage:
 *   import { pryzmConfirm } from '../ui/ConfirmDialog';
 *   const ok = await pryzmConfirm({ title: 'Delete Element', elementName: 'WALL:001' });
 *   if (ok) { ... }
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';

export interface ConfirmDialogOptions {
    title?: string;
    message?: string;
    elementName?: string;
    confirmLabel?: string;
    cancelLabel?: string;
}

/**
 * Opens a PRYZM-styled confirm modal and resolves with `true` when the user
 * clicks the destructive action, or `false` when they cancel / press Escape.
 */
export function pryzmConfirm(options: ConfirmDialogOptions = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime pryzmConfirm */): Promise<boolean> {
    // F.12.1 Wave 14 — runtime.bus.executeCommand dialog.opened wiring.
    // Fires a bus event so Phase E modals can track opens without polling the DOM.
    runtime?.bus.executeCommand('dialog.opened', { kind: 'confirm', title: options.title ?? 'Confirm Action' });
    const {
        title        = 'Confirm Action',
        message      = 'Are you sure you want to proceed?',
        elementName,
        confirmLabel = 'Delete',
        cancelLabel  = 'Cancel',
    } = options;

    return new Promise<boolean>((resolve) => {
        // ── Build overlay ──────────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'cdlg-overlay';

        // ── Card ───────────────────────────────────────────────────────────
        const card = document.createElement('div');
        card.className = 'cdlg-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'cdlg-title');

        // ── Header ─────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'cdlg-header';
        header.innerHTML = `
            <div class="cdlg-header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
            </div>
            <div>
                <p class="cdlg-header-title" id="cdlg-title">${_esc(title)}</p>
                <p class="cdlg-header-subtitle">IFC Import</p>
            </div>
        `;

        // ── Body ───────────────────────────────────────────────────────────
        const body = document.createElement('div');
        body.className = 'cdlg-body';

        if (elementName) {
            const nameBox = document.createElement('div');
            nameBox.className = 'cdlg-element-name';
            nameBox.textContent = elementName;
            body.appendChild(nameBox);
        }

        const msg = document.createElement('p');
        msg.className = 'cdlg-message';
        msg.textContent = message;
        body.appendChild(msg);

        const warn = document.createElement('div');
        warn.className = 'cdlg-warning-row';
        warn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="cdlg-warning-text">This action cannot be undone.</span>
        `;
        body.appendChild(warn);

        // ── Footer ─────────────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.className = 'cdlg-footer';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'cdlg-btn cdlg-btn-cancel';
        btnCancel.textContent = cancelLabel;

        const btnDelete = document.createElement('button');
        btnDelete.className = 'cdlg-btn cdlg-btn-delete';
        btnDelete.textContent = confirmLabel;

        footer.appendChild(btnCancel);
        footer.appendChild(btnDelete);

        // ── Assemble ───────────────────────────────────────────────────────
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Focus the cancel button by default (safer UX).
        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('confirm-dialog-focus', () => btnCancel.focus());

        // ── Teardown helper ────────────────────────────────────────────────
        function close(result: boolean): void {
            overlay.style.animation = 'cdlg-fade 0.14s ease reverse forwards';
            setTimeout(() => overlay.remove(), 140);
            resolve(result);
        }

        // ── Event wiring ───────────────────────────────────────────────────
        btnDelete.addEventListener('click', () => close(true));
        btnCancel.addEventListener('click', () => close(false));

        // Click outside card → cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });

        // Escape → cancel
        function onKey(e: KeyboardEvent): void {
            if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false); }
            if (e.key === 'Enter')  { document.removeEventListener('keydown', onKey); close(true);  }
        }
        document.addEventListener('keydown', onKey);
    });
}

/** Minimal HTML-escape for interpolated strings. */
function _esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
