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
//
// §MODAL-DYNAMIC (A.21.D22) — adds an inline program-edit form mirroring the
// apartment modal: the user can change floors/bedrooms/bathrooms + program flags
// + design sliders inline; the modal debounces (250 ms), reads the full form
// state, calls `onProgramChange(state)`, the controller re-runs the PURE
// `generateHouseLayoutOptions(...)` and refreshes the cards IN PLACE (the modal
// stays open). `setBusy(true)` shows a "Regenerating…" hint during the call.

import type { ScoredHouseLayoutOption, ApartmentProgram, ScoringWeights } from '@pryzm/ai-host';
import { buildHouseCardModel, type HouseCardModel } from './houseCardModel.js';
import {
    buildHouseModalHtml,
    buildHouseCardGridHtml,
    collectStoreyOptions,
    type HouseProgramFormState,
} from './houseModalHtml.js';
import { buildLayoutThumbnailSvg } from '../apartment-layout/layoutThumbnail.js';
import { buildOccupancyLegendHtml } from '../apartment-layout/layoutModalHtml.js';

export interface HouseLayoutModalCallbacks {
    /** User picked variant `index` ("Use this layout"). */
    readonly onSelect: (index: number) => void;
    /** User cancelled (Cancel button / overlay click / Escape). */
    readonly onCancel: () => void;
    /** §MODAL-DYNAMIC: a program-edit form input changed. Debounced 250 ms.
     *  The controller should re-run generation with the edited state and call
     *  `refresh()` with the new variants. Optional — when omitted the form is
     *  not rendered (static card grid, the pre-A.21.D22 behaviour). */
    readonly onProgramChange?: (state: HouseProgramFormState) => void;
}

const DEBOUNCE_MS = 250;

export class HouseLayoutModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _onProgramChange: ((state: HouseProgramFormState) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the scored house variants as cards. Replaces any open instance.
     *  When `formState` + `cb.onProgramChange` are both supplied, the inline
     *  program-edit form renders and live-regenerate is wired. */
    show(
        options: readonly ScoredHouseLayoutOption[],
        cb: HouseLayoutModalCallbacks,
        formState?: HouseProgramFormState,
    ): void {
        this.dismiss();

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        // Only render the form when a change handler exists — a form with no
        // wiring would mislead the user (edits would do nothing).
        const formForHtml = cb.onProgramChange ? formState : undefined;
        overlay.innerHTML = buildHouseModalHtml(
            this._cards(options),
            this._storeyThumbs(options),
            formForHtml,
        );

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
                return;
            }
        });

        // §MODAL-DYNAMIC form change wiring — `input` for typed numbers + range
        // sliders (fires live as the user drags), `change` for checkboxes.
        // Debounced so dragging a slider doesn't hammer the generator.
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
        console.log('[house-layout] modal mounted to <body> —', options.length, 'card(s), overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)');
    }

    /**
     * §MODAL-DYNAMIC: replace the CARDS in place with a fresh set, without
     * dismissing the modal or touching the program-edit form. Called by the
     * controller after a re-generation completes. No-op when no modal is open.
     */
    refresh(options: readonly ScoredHouseLayoutOption[]): void {
        if (!this._el) return;
        const grid = this._el.querySelector('[data-role="grid"]');
        if (!grid) return;
        const cards = this._cards(options);
        grid.innerHTML = buildHouseCardGridHtml(cards, this._storeyThumbs(options));
        // A.21.D51 — refresh the room-type legend in lock-step with the cards
        // (editing floors/bedrooms can change which occupancies are present).
        const legend = this._el.querySelector('[data-role="legend"]');
        if (legend) legend.innerHTML = buildOccupancyLegendHtml(collectStoreyOptions(cards));
        this._setHint('');
        this.setBusy(false);
    }

    /**
     * §MODAL-DYNAMIC: visual signal that a regeneration is in flight. Adds
     * `alm-busy` to the panel + writes a hint into the form. The CSS layer dims
     * the card grid; the DOM hook is the `alm-busy` class. No-op when closed.
     */
    setBusy(busy: boolean): void {
        if (!this._el) return;
        const panel = this._el.querySelector('.alm-panel');
        if (panel) panel.classList.toggle('alm-busy', busy);
        this._setHint(busy ? 'Regenerating house layouts…' : '');
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

    // ── view helpers ────────────────────────────────────────────────────────

    private _cards(options: readonly ScoredHouseLayoutOption[]): HouseCardModel[] {
        return options.map((o, i) => buildHouseCardModel(o, i));
    }

    private _storeyThumbs(options: readonly ScoredHouseLayoutOption[]): string[][] {
        const thumbOpts = { background: '#ffffff' } as const;
        return this._cards(options).map(card =>
            card.storeys.map(s => buildLayoutThumbnailSvg(s.option, thumbOpts)),
        );
    }

    // ── §MODAL-DYNAMIC internals ────────────────────────────────────────────

    private _scheduleProgramChange(form: HTMLFormElement): void {
        if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            const state = this._readFormState(form);
            this.setBusy(true);
            this._onProgramChange?.(state);
        }, DEBOUNCE_MS);
    }

    /** Parse the edited form into a `HouseProgramFormState`. Storeys clamp 1–3,
     *  bedrooms 0–5, bathrooms 1–3 (matching the input attributes + the engine's
     *  envelope expectations); slider 0–100 → 0–1 weights. */
    private _readFormState(form: HTMLFormElement): HouseProgramFormState {
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
        const weightByName = (key: keyof ScoringWeights, def: number): number => {
            const el = form.elements.namedItem(`weight_${key}`) as HTMLInputElement | null;
            if (!el) return def;
            const v = Number(el.value);
            if (!Number.isFinite(v)) return def;
            return Math.max(0, Math.min(1, v / 100));
        };

        const program: ApartmentProgram = {
            bedrooms: Math.max(0, Math.min(5, Math.round(numByName('bedrooms', 1)))),
            bathrooms: Math.max(1, Math.min(3, Math.round(numByName('bathrooms', 1)))),
            masterEnSuite: boolByName('masterEnSuite'),
            openPlanKitchenDining: boolByName('openPlanKitchenDining'),
            livingRoom: boolByName('livingRoom'),
            entranceHall: false,
        };
        const weights: ScoringWeights = {
            naturalLight: weightByName('naturalLight', 0.5),
            privacy: weightByName('privacy', 0.5),
            kitchenWorkflow: weightByName('kitchenWorkflow', 0.5),
            corridorEfficiency: weightByName('corridorEfficiency', 0.5),
        };
        return {
            storeyCount: Math.max(1, Math.min(3, Math.round(numByName('storeys', 1)))),
            program,
            weights,
        };
    }

    private _setHint(text: string): void {
        if (!this._el) return;
        const hint = this._el.querySelector('[data-role="program-hint"]');
        if (hint) hint.textContent = text || 'Edit any field — the house layouts regenerate automatically.';
    }
}
