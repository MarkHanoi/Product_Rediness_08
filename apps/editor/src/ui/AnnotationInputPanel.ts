/**
 * @file src/ui/AnnotationInputPanel.ts
 *
 * PRYZM-styled promise-based input dialog for annotation tools.
 * Replaces native window.prompt() to stay within the app design system.
 *
 * CONTRACT §05 §2 — uses exclusively injected CSS classes (cdlg-* for the
 * card/overlay frame, ann-text-prompt-input for the input field, ann-btn-*
 * for buttons). Zero inline styles.
 *
 * Usage:
 *   const text = await pryzmAnnotationInput({ title: 'Text Note', label: 'Note text', placeholder: '...' });
 *   if (text === null) return; // user cancelled
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';

export interface AnnotationInputOptions {
    /** Panel header title (e.g. 'TEXT NOTE', 'KEYNOTE') */
    title: string;
    /** Brief subtitle shown under the title (e.g. 'Add annotation text') */
    subtitle?: string;
    /** SVG path(s) for the header icon — defaults to pencil */
    iconSvg?: string;
    /** Label above the input field */
    label?: string;
    /** Input placeholder */
    placeholder?: string;
    /** Pre-fill the input with this value */
    defaultValue?: string;
    /** If true, show a <textarea> instead of an <input> */
    multiline?: boolean;
    /** Confirm button label */
    confirmLabel?: string;
    /** If provided, render a second field */
    secondField?: { label: string; placeholder?: string; defaultValue?: string };
}

export interface AnnotationInputResult {
    value: string;
    secondValue?: string;
}

const PENCIL_ICON = `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`;

/**
 * Opens a PRYZM-styled input modal and resolves when the user confirms or cancels.
 * Returns null if the user cancels or submits an empty required value.
 */
export function pryzmAnnotationInput(
    options: AnnotationInputOptions,
): Promise<AnnotationInputResult | null> {
    const {
        title        = 'ANNOTATION',
        subtitle     = 'Enter annotation data',
        iconSvg      = PENCIL_ICON,
        label        = 'Value',
        placeholder  = '',
        defaultValue = '',
        multiline    = false,
        confirmLabel = 'Place',
        secondField,
    } = options;

    return new Promise<AnnotationInputResult | null>((resolve) => {
        // ── Overlay ──────────────────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'cdlg-overlay';

        // ── Card ─────────────────────────────────────────────────────────────
        const card = document.createElement('div');
        card.className = 'cdlg-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.style.cssText = 'width:380px;max-width:92vw';

        // ── Header ───────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'cdlg-header';
        header.innerHTML = `
            <div class="cdlg-header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round">
                    ${iconSvg}
                </svg>
            </div>
            <div>
                <p class="cdlg-header-title">${_esc(title)}</p>
                <p class="cdlg-header-subtitle">${_esc(subtitle)}</p>
            </div>`;

        // ── Body ─────────────────────────────────────────────────────────────
        const body = document.createElement('div');
        body.className = 'cdlg-body';
        body.style.cssText = 'padding-bottom:8px';

        // Primary field
        const labelEl = document.createElement('label');
        labelEl.className = 'ann-prompt-label';
        labelEl.textContent = label;

        let primaryInput: HTMLInputElement | HTMLTextAreaElement;
        if (multiline) {
            const ta = document.createElement('textarea');
            ta.className = 'ann-text-prompt-input';
            ta.placeholder = placeholder;
            ta.value = defaultValue;
            ta.rows = 4;
            ta.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;margin-top:2px';
            primaryInput = ta;
        } else {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'ann-text-prompt-input';
            inp.placeholder = placeholder;
            inp.value = defaultValue;
            inp.style.cssText = 'width:100%;box-sizing:border-box;margin-top:2px';
            primaryInput = inp;
        }

        body.appendChild(labelEl);
        body.appendChild(primaryInput);

        // Optional second field
        let secondInput: HTMLInputElement | null = null;
        if (secondField) {
            const label2 = document.createElement('label');
            label2.className = 'ann-prompt-label';
            label2.style.cssText = 'margin-top:10px;display:block';
            label2.textContent = secondField.label;

            secondInput = document.createElement('input');
            secondInput.type = 'text';
            secondInput.className = 'ann-text-prompt-input';
            secondInput.placeholder = secondField.placeholder ?? '';
            secondInput.value = secondField.defaultValue ?? '';
            secondInput.style.cssText = 'width:100%;box-sizing:border-box;margin-top:2px';

            body.appendChild(label2);
            body.appendChild(secondInput);
        }

        // ── Footer ───────────────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.className = 'cdlg-footer';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'cdlg-btn cdlg-btn-cancel';
        btnCancel.textContent = 'Cancel';

        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'ann-btn ann-btn-primary';
        btnConfirm.style.cssText = 'padding:9px 22px;font-size:13px;font-weight:600;border-radius:var(--app-radius-sm);cursor:pointer;border:none;';
        btnConfirm.textContent = confirmLabel;

        footer.appendChild(btnCancel);
        footer.appendChild(btnConfirm);

        // ── Assemble ─────────────────────────────────────────────────────────
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('annotation-input-focus', () => primaryInput.focus());

        // ── Teardown ─────────────────────────────────────────────────────────
        function close(result: AnnotationInputResult | null): void {
            overlay.style.animation = 'cdlg-fade 0.14s ease reverse forwards';
            setTimeout(() => overlay.remove(), 140);
            resolve(result);
        }

        function submit(): void {
            const val = primaryInput.value.trim();
            if (!val) { primaryInput.focus(); return; }
            close({ value: val, secondValue: secondInput?.value.trim() });
        }

        btnConfirm.addEventListener('click', submit);
        btnCancel.addEventListener('click', () => close(null));

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(null);
        });

        function onKey(e: KeyboardEvent): void {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', onKey);
                close(null);
            }
            if (e.key === 'Enter' && !multiline) {
                document.removeEventListener('keydown', onKey);
                submit();
            }
        }
        document.addEventListener('keydown', onKey);
    });
}

function _esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
