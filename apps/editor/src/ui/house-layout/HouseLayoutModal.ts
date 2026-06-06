// House Layout — "Choose a house layout" modal DOM controller
// (A.21.k / A.21.D21 modal slice). The house SIBLING of `ApartmentLayoutModal`.
//
// Thin DOM shell over the pure renderers (buildHouseCardModel / buildHouseModalHtml
// + the apartment `buildLayoutThumbnailSvg` reused per-storey): mounts a transient
// overlay (direct document.body.appendChild — NOT PanelManager, which is for
// persistent panels), delegates clicks by data-index, and dismisses on Select /
// Cancel / overlay-click / Escape. All view logic lives in the pure, Node-tested
// builders; this file is DOM glue verified by the editor typecheck. Reuses the
// apartment modal's `alm-overlay` CSS class so brand (white + #6600FF) + z-index
// (4000) match by construction.

import type { ScoredHouseLayoutOption } from '@pryzm/ai-host';
import { buildHouseCardModel } from './houseCardModel.js';
import { buildHouseModalHtml } from './houseModalHtml.js';
import { buildLayoutThumbnailSvg } from '../apartment-layout/layoutThumbnail.js';

export interface HouseLayoutModalCallbacks {
    /** User picked variant `index` ("Use this layout"). */
    readonly onSelect: (index: number) => void;
    /** User cancelled (Cancel button / overlay click / Escape). */
    readonly onCancel: () => void;
}

export class HouseLayoutModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scored house variants as cards. Replaces any open instance. */
    show(options: readonly ScoredHouseLayoutOption[], cb: HouseLayoutModalCallbacks): void {
        this.dismiss();

        const thumbOpts = { background: '#ffffff' } as const;
        const cards = options.map((o, i) => buildHouseCardModel(o, i));
        // Per-storey thumbnails: one SVG per storey on each card.
        const storeyThumbs = cards.map(card =>
            card.storeys.map(s => buildLayoutThumbnailSvg(s.option, thumbOpts)),
        );

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML = buildHouseModalHtml(cards, storeyThumbs);

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
                return;
            }
        });

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
        console.log('[house-layout] modal mounted to <body> —', cards.length, 'card(s), overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)');
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
