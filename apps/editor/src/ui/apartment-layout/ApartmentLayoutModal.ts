// Apartment Layout — §11 options modal DOM controller (SPEC §11, A5-modal).
//
// Thin DOM shell over the pure renderers (buildLayoutCardModel / thumbnail /
// modalHtml): mounts a transient overlay (direct document.body.appendChild — NOT
// PanelManager, which is for persistent panels), delegates clicks by data-index,
// and dismisses on Select / Cancel / overlay-click / Escape. All view logic is in
// the pure, Node-tested builders; this file is DOM glue verified by the editor
// typecheck (apps/editor vitest env is 'node', so DOM isn't unit-tested here).

import type { ScoredLayoutOption } from '@pryzm/ai-host';
import { buildLayoutCardModel } from './layoutCardModel.js';
import { buildLayoutThumbnailSvg } from './layoutThumbnail.js';
import { buildLayoutModalHtml } from './layoutModalHtml.js';

export interface ApartmentLayoutModalCallbacks {
    /** User picked option `index` ("Use this layout"). */
    readonly onSelect: (index: number) => void;
    /** User cancelled (Cancel button / overlay click / Escape). */
    readonly onCancel: () => void;
}

export class ApartmentLayoutModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scored options as cards. Replaces any open instance. */
    show(options: readonly ScoredLayoutOption[], cb: ApartmentLayoutModalCallbacks): void {
        this.dismiss();

        const cards = options.map((o, i) => buildLayoutCardModel(o, i));
        const thumbs = options.map(o => buildLayoutThumbnailSvg(o, { background: '#ffffff' }));

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML = buildLayoutModalHtml(cards, thumbs);

        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            // Backdrop click (outside the panel) → cancel.
            if (target === overlay) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('.alm-cancel')) { this.dismiss(); cb.onCancel(); return; }
            const sel = target.closest('.alm-select') as HTMLElement | null;
            if (sel) {
                const idx = Number(sel.getAttribute('data-index'));
                if (Number.isInteger(idx)) { this.dismiss(); cb.onSelect(idx); }
            }
        });

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
        console.log('[apartment-layout] modal mounted to <body> —', cards.length, 'card(s), overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)');
    }

    /** Remove the overlay + listeners. Idempotent. */
    dismiss(): void {
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler, { capture: true } as EventListenerOptions);
            this._escHandler = null;
        }
        if (this._el) { this._el.remove(); this._el = null; }
    }
}
