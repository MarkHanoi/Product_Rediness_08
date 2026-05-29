// Apartment Layout — §11 options modal DOM controller (SPEC §11, A5-modal).
//
// Thin DOM shell over the pure renderers (buildLayoutCardModel / thumbnail /
// modalHtml): mounts a transient overlay (direct document.body.appendChild —
// NOT PanelManager, which is for persistent panels), delegates clicks by
// data-index, and dismisses on Select / Cancel / overlay-click / Escape. All
// view logic lives in the pure, Node-tested builders; this file is DOM glue
// verified by the editor typecheck (apps/editor vitest env is 'node', so DOM
// isn't unit-tested here).
//
// §MODAL-DYNAMIC (2026-05-29) — adds an inline program-edit form: users can
// change room counts + program flags inline; the modal debounces (250 ms),
// calls `onProgramChange(newProgram)`, the controller re-generates, and the
// new options refresh the cards IN PLACE (modal stays open). `setBusy(true)`
// shows a "Regenerating…" overlay during the in-flight call.

import type { ScoredLayoutOption, ApartmentProgram } from '@pryzm/ai-host';
import { buildLayoutCardModel } from './layoutCardModel.js';
import { buildLayoutThumbnailSvg } from './layoutThumbnail.js';
import {
    buildLayoutModalHtml,
    buildLayoutCardGridHtml,
    buildOccupancyLegendHtml,
} from './layoutModalHtml.js';

export interface ApartmentLayoutModalCallbacks {
    /** User picked option `index` ("Use this layout"). */
    readonly onSelect: (index: number) => void;
    /** User cancelled (Cancel button / overlay click / Escape). */
    readonly onCancel: () => void;
    /** §MODAL-DYNAMIC: a program-edit form input changed. Debounced 250 ms.
     *  The controller should re-trigger generation and call `refresh()` with
     *  the new options when they arrive. Optional — when omitted the form is
     *  still rendered (read-only-ish, no callback fires). */
    readonly onProgramChange?: (program: ApartmentProgram) => void;
}

const DEBOUNCE_MS = 250;

export class ApartmentLayoutModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _onProgramChange: ((program: ApartmentProgram) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scored options as cards. Replaces any open instance. */
    show(
        options: readonly ScoredLayoutOption[],
        cb: ApartmentLayoutModalCallbacks,
        program?: ApartmentProgram,
    ): void {
        this.dismiss();

        const cards = options.map((o, i) => buildLayoutCardModel(o, i));
        const thumbs = options.map(o => buildLayoutThumbnailSvg(o, { background: '#ffffff' }));

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML = buildLayoutModalHtml(cards, thumbs, program, options);

        this._onProgramChange = cb.onProgramChange ?? null;

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

        // §MODAL-DYNAMIC form change wiring — `change` for checkboxes / blur,
        // `input` for typed numbers (fires as the user holds an up/down arrow).
        // Debounced so dragging a number input doesn't hammer the generator.
        if (this._onProgramChange) {
            const form = overlay.querySelector('form.alm-program') as HTMLFormElement | null;
            if (form) {
                const handler = (): void => this._scheduleProgramChange(form);
                form.addEventListener('input', handler);
                form.addEventListener('change', handler);
            }
        }

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
        console.log('[apartment-layout] modal mounted to <body> —', cards.length, 'card(s), overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)');
    }

    /**
     * §MODAL-DYNAMIC: replace the CARDS in place with a fresh set, without
     * dismissing the modal or touching the program-edit form. Called by the
     * controller after a re-generation completes. No-op when no modal is open.
     */
    refresh(options: readonly ScoredLayoutOption[]): void {
        if (!this._el) return;
        const grid = this._el.querySelector('[data-role="grid"]');
        if (!grid) return;
        const cards = options.map((o, i) => buildLayoutCardModel(o, i));
        const thumbs = options.map(o => buildLayoutThumbnailSvg(o, { background: '#ffffff' }));
        grid.innerHTML = buildLayoutCardGridHtml(cards, thumbs);
        // §MODAL-DYNAMIC part-3: refresh the legend too — toggling the program
        // (e.g. turning Living Room off) changes which occupancies are present.
        const legend = this._el.querySelector('[data-role="legend"]');
        if (legend) legend.innerHTML = buildOccupancyLegendHtml(options);
        this._setHint('');
        this.setBusy(false);
    }

    /**
     * §MODAL-DYNAMIC: visual signal that a regeneration is in flight. Adds
     * `alm-busy` to the panel + writes a hint into the form. The CSS layer
     * is expected to dim the card grid + show a spinner; the DOM hook is the
     * `alm-busy` class. No-op when no modal is open.
     */
    setBusy(busy: boolean): void {
        if (!this._el) return;
        const panel = this._el.querySelector('.alm-panel');
        if (panel) panel.classList.toggle('alm-busy', busy);
        this._setHint(busy ? 'Regenerating layouts…' : '');
    }

    /** Remove the overlay + listeners. Idempotent. */
    dismiss(): void {
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler, { capture: true } as EventListenerOptions);
            this._escHandler = null;
        }
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        this._onProgramChange = null;
        if (this._el) { this._el.remove(); this._el = null; }
    }

    // ── §MODAL-DYNAMIC internals ────────────────────────────────────────────

    private _scheduleProgramChange(form: HTMLFormElement): void {
        if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            const program = this._readProgramFromForm(form);
            this._setHint('Regenerating layouts…');
            this.setBusy(true);
            this._onProgramChange?.(program);
        }, DEBOUNCE_MS);
    }

    private _readProgramFromForm(form: HTMLFormElement): ApartmentProgram {
        const numByName = (name: string, def: number): number => {
            const el = form.elements.namedItem(name) as HTMLInputElement | null;
            if (!el) return def;
            const v = Number(el.value);
            return Number.isFinite(v) ? v : def;
        };
        const boolByName = (name: string): boolean => {
            const el = form.elements.namedItem(name) as HTMLInputElement | null;
            return !!el?.checked;
        };
        return {
            bedrooms: Math.max(0, Math.min(5, Math.round(numByName('bedrooms', 1)))),
            bathrooms: Math.max(1, Math.min(3, Math.round(numByName('bathrooms', 1)))),
            masterEnSuite: boolByName('masterEnSuite'),
            openPlanKitchenDining: boolByName('openPlanKitchenDining'),
            livingRoom: boolByName('livingRoom'),
            entranceHall: boolByName('entranceHall'),
        };
    }

    private _setHint(text: string): void {
        if (!this._el) return;
        const hint = this._el.querySelector('[data-role="program-hint"]');
        if (hint) hint.textContent = text || 'Edit any field — the layouts regenerate automatically.';
    }
}
