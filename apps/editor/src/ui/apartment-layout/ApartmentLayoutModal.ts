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
import { buildLayoutThumbnailSvg, type PerimeterSpan } from './layoutThumbnail.js';
import { buildLayoutBubbleGraphSvg } from './layoutBubbleGraph.js';
import {
    buildLayoutModalHtml,
    buildLayoutCardGridHtml,
    buildOccupancyLegendHtml,
} from './layoutModalHtml.js';

/** §WINDOW-SYMBOLS (2026-05-29): the user-placed perimeter openings the
 *  thumbnail draws on top of the perimeter walls. Both are WORLD-XZ metres
 *  (the same shape D-TGL's `windowSpansWorld` / `doorSpansWorld` already
 *  use). Both fields are optional — when omitted the thumbnail still
 *  renders, just without the perimeter opening symbols. */
export interface PerimeterSpans {
    readonly windowSpansWorld?: ReadonlyArray<PerimeterSpan>;
    readonly doorSpansWorld?: ReadonlyArray<PerimeterSpan>;
}

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
    /** §WINDOW-SYMBOLS: spans live on the modal between `show()` and
     *  `refresh()` so the perimeter window/door symbols redraw consistently
     *  after a regenerate (the spans are fixed across re-runs — the user's
     *  shell + perimeter openings don't change when only the program does). */
    private _spans: PerimeterSpans = {};
    /** A.21.D5 follow-up — the current reduced-programme notice HTML, cached so a
     *  `refresh()` (regen) re-renders the recomputed notice. '' ⇒ no notice. */
    private _noticeHtml = '';

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scored options as cards. Replaces any open instance. `noticeHtml`
     *  (A.21.D5 follow-up) is the pre-built reduced-programme notice for the notice
     *  region between the legend and the cards; '' ⇒ none. */
    show(
        options: readonly ScoredLayoutOption[],
        cb: ApartmentLayoutModalCallbacks,
        program?: ApartmentProgram,
        spans?: PerimeterSpans,
        noticeHtml = '',
    ): void {
        this.dismiss();
        this._spans = spans ?? {};
        this._noticeHtml = noticeHtml;

        const thumbOpts = { background: '#ffffff', ...this._spans };
        const cards = options.map((o, i) => buildLayoutCardModel(o, i));
        const thumbs = options.map(o => buildLayoutThumbnailSvg(o, thumbOpts));
        // DEMO-2 — the Living Graph (bubble/adjacency diagram) per option. White
        // background matches the thumbnail so the Plan/Graph swap is seamless.
        const graphs = options.map(o => buildLayoutBubbleGraphSvg(o, { background: '#ffffff' }));

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML = buildLayoutModalHtml(cards, thumbs, program, options, graphs, this._noticeHtml);

        this._onProgramChange = cb.onProgramChange ?? null;

        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            // Backdrop click (outside the panel) → cancel.
            if (target === overlay) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('.alm-cancel')) { this.dismiss(); cb.onCancel(); return; }
            // A.21.D5 follow-up — dismiss the reduced-programme notice (cosmetic only;
            // never blocks "Use this layout"). Hide the banner node.
            if (target.closest('[data-action="dismiss-notice"]')) {
                e.preventDefault();
                e.stopPropagation();
                const notice = target.closest('[data-role="reduced-program-notice"]') as HTMLElement | null;
                if (notice) notice.style.display = 'none';
                return;
            }
            const sel = target.closest('.alm-select') as HTMLElement | null;
            if (sel) {
                const idx = Number(sel.getAttribute('data-index'));
                if (Number.isInteger(idx)) { this.dismiss(); cb.onSelect(idx); }
                return;
            }
            // §VALIDATION-DETAILS (2026-06-01) — clicking the validation pill
            // (or its caret child) toggles the per-card details panel showing
            // the full markdown report. Scoped to the parent card so multiple
            // cards can be expanded independently. STOP propagation to keep
            // an expand-click from also being interpreted as a select-click.
            const pill = target.closest('.alm-validation-pill') as HTMLElement | null;
            if (pill) {
                e.preventDefault();
                e.stopPropagation();
                const card = pill.closest('.alm-card') as HTMLElement | null;
                if (card) {
                    const expanded = card.classList.toggle('alm-card--expanded');
                    pill.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                }
                return;
            }
            // DEMO-2 — Plan / Graph per-card toggle. Scoped + stopPropagation so the
            // click never falls through to "Use this layout" (.alm-select).
            const viewBtn = target.closest('.alm-view-btn') as HTMLElement | null;
            if (viewBtn) {
                e.preventDefault();
                e.stopPropagation();
                const card = viewBtn.closest('.alm-card') as HTMLElement | null;
                if (card) {
                    const wantGraph = viewBtn.getAttribute('data-view') === 'graph';
                    card.classList.toggle('alm-card--graph', wantGraph);
                    card.querySelector('.alm-view-btn--plan')?.setAttribute('aria-pressed', wantGraph ? 'false' : 'true');
                    card.querySelector('.alm-view-btn--graph')?.setAttribute('aria-pressed', wantGraph ? 'true' : 'false');
                }
                return;
            }
            // §CLICK-FOCUS (2026-05-29) — clicking a room polygon in any
            // thumbnail focuses the matching per-instance area input in the
            // program-edit form, so the user can re-size that exact room.
            // `closest` on SVG-namespaced elements works in all modern browsers.
            const poly = (target as Element).closest?.('.alm-room-polygon') as Element | null;
            if (poly) {
                const name = poly.getAttribute('data-room-name');
                if (name) this._focusAreaInputForRoom(name);
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

        // §A11Y (2026-05-29) — keyboard activation for room polygons. The
        // polygons are `role="button"` `tabindex="0"`; Enter or Space on a
        // focused polygon triggers the same area-input focus that a click
        // does. Listener is scoped to the overlay so it doesn't leak.
        overlay.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const target = e.target as Element | null;
            const poly = target?.closest?.('.alm-room-polygon') as Element | null;
            if (!poly) return;
            const name = poly.getAttribute('data-room-name');
            if (!name) return;
            e.preventDefault();
            this._focusAreaInputForRoom(name);
        });

        document.body.appendChild(overlay);
        this._el = overlay;
        console.log('[apartment-layout] modal mounted to <body> —', cards.length, 'card(s), overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)');
    }

    /**
     * §MODAL-DYNAMIC: replace the CARDS in place with a fresh set, without
     * dismissing the modal or touching the program-edit form. Called by the
     * controller after a re-generation completes. No-op when no modal is open.
     */
    refresh(options: readonly ScoredLayoutOption[], noticeHtml?: string): void {
        if (!this._el) return;
        const grid = this._el.querySelector('[data-role="grid"]');
        if (!grid) return;
        const thumbOpts = { background: '#ffffff', ...this._spans };
        const cards = options.map((o, i) => buildLayoutCardModel(o, i));
        const thumbs = options.map(o => buildLayoutThumbnailSvg(o, thumbOpts));
        const graphs = options.map(o => buildLayoutBubbleGraphSvg(o, { background: '#ffffff' }));
        grid.innerHTML = buildLayoutCardGridHtml(cards, thumbs, graphs);
        // §MODAL-DYNAMIC part-3: refresh the legend too — toggling the program
        // (e.g. turning Living Room off) changes which occupancies are present.
        const legend = this._el.querySelector('[data-role="legend"]');
        if (legend) legend.innerHTML = buildOccupancyLegendHtml(options);
        // A.21.D5 follow-up — recompute the reduced-programme notice (a regen with a
        // smaller program may now fit fully → '' clears it). Keep the last when undefined.
        if (noticeHtml !== undefined) this._noticeHtml = noticeHtml;
        const noticeRegion = this._el.querySelector('[data-role="program-notice"]');
        if (noticeRegion) noticeRegion.innerHTML = this._noticeHtml;
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
        this._spans = {};
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
        // §ROOM-AREAS / §ROOM-AREAS-BY-NAME (2026-05-29) — collect area
        // inputs. The form uses two prefixes:
        //   `area_t_<RoomType>`  → per-TYPE override (every bedroom 14 m²)
        //   `area_n_<roomName>`  → per-INSTANCE override (Bedroom 1 = 14, etc.)
        // Blank / non-positive / non-finite values are OMITTED (engine falls
        // back to the next priority — name → type → weight-scaled default).
        const TYPE_PREFIX = 'area_t_';
        const NAME_PREFIX = 'area_n_';
        const roomAreas: Record<string, number> = {};
        const roomAreasByName: Record<string, number> = {};
        const inputs = form.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
        for (const inp of Array.from(inputs)) {
            const trimmed = inp.value.trim();
            if (trimmed === '') continue;
            const v = Number(trimmed);
            if (!Number.isFinite(v) || v <= 0) continue;
            if (inp.name.startsWith(TYPE_PREFIX)) {
                roomAreas[inp.name.slice(TYPE_PREFIX.length)] = v;
            } else if (inp.name.startsWith(NAME_PREFIX)) {
                roomAreasByName[inp.name.slice(NAME_PREFIX.length)] = v;
            }
        }
        const out: ApartmentProgram = {
            bedrooms: Math.max(0, Math.min(5, Math.round(numByName('bedrooms', 1)))),
            bathrooms: Math.max(1, Math.min(3, Math.round(numByName('bathrooms', 1)))),
            masterEnSuite: boolByName('masterEnSuite'),
            openPlanKitchenDining: boolByName('openPlanKitchenDining'),
            livingRoom: boolByName('livingRoom'),
            entranceHall: boolByName('entranceHall'),
        };
        if (Object.keys(roomAreas).length > 0) {
            (out as ApartmentProgram & { roomAreas?: Record<string, number> }).roomAreas = roomAreas;
        }
        if (Object.keys(roomAreasByName).length > 0) {
            (out as ApartmentProgram & { roomAreasByName?: Record<string, number> }).roomAreasByName = roomAreasByName;
        }
        return out;
    }

    private _setHint(text: string): void {
        if (!this._el) return;
        const hint = this._el.querySelector('[data-role="program-hint"]');
        if (hint) hint.textContent = text || 'Edit any field — the layouts regenerate automatically.';
    }

    /** §CLICK-FOCUS — find the `area_n_<name>` input in the program-edit form
     *  and focus + select it. Falls back to scrolling the form into view if
     *  the name has no per-instance input yet. */
    private _focusAreaInputForRoom(name: string): void {
        if (!this._el) return;
        const form = this._el.querySelector('form.alm-program') as HTMLFormElement | null;
        if (!form) return;
        const inp = form.elements.namedItem(`area_n_${name}`) as HTMLInputElement | null;
        if (inp) {
            inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            inp.focus();
            inp.select?.();
            return;
        }
        // No per-instance input for this name — just nudge the form into view.
        form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}
