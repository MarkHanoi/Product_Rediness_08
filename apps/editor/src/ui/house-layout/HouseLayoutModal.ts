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
import { buildLayoutBubbleGraphSvg } from '../apartment-layout/layoutBubbleGraph.js';
import { buildOccupancyLegendHtml } from '../apartment-layout/layoutModalHtml.js';
import { setRoomAreaOverride } from '../apartment-layout/activeRoomAreaOverrides.js';
import { setRoomTypeOverride, ROOM_TYPE_VALUES } from '../apartment-layout/activeRoomTypeOverrides.js';

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
    /** §LIVE-MODAL.D (R4 graph half): a living-graph node edit changed a room's
     *  AREA or TYPE override (written to the C52 stash). Debounced 250 ms (the
     *  SAME timer as the form change). The controller should re-run generation
     *  against the LATEST cached state (it reads the override stash inside
     *  `_computeVariants`) and call `refresh()`. Optional — when omitted the
     *  graph nodes render but are not editable. */
    readonly onGraphEdit?: () => void;
}

const DEBOUNCE_MS = 250;

/** §SHARED-FLOOR-BOUNDS (2026-06-09) — the union of every storey's room-polygon
 *  bounds (fallback: wall endpoints) across one house card, in the mm PLAN frame
 *  the thumbnail draws in (same frame as `buildLayoutThumbnailSvg`'s mapX/mapY).
 *  Returns null when no storey carries usable geometry → each thumbnail falls
 *  back to its own per-option fit (legacy behaviour). Pure. */
function unionStoreyBoundsMm(
    card: HouseCardModel,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let have = false;
    const acc = (x: number, y: number): void => {
        have = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    for (const s of card.storeys) {
        const opt = s.option;
        let storeyHasPoly = false;
        for (const r of opt.rooms ?? []) {
            if (!r.polygon || r.polygon.length < 3) continue;
            storeyHasPoly = true;
            for (const p of r.polygon) acc(p.x, p.y);
        }
        // Fall back to this storey's wall endpoints only when it has no polygons
        // (mirrors the thumbnail's own per-option bounds preference).
        if (!storeyHasPoly) {
            for (const w of opt.walls ?? []) { acc(w.start.x, w.start.y); acc(w.end.x, w.end.y); }
        }
    }
    if (!have || !(maxX > minX) || !(maxY > minY)) return null;
    return { minX, maxX, minY, maxY };
}

export class HouseLayoutModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _onProgramChange: ((state: HouseProgramFormState) => void) | null = null;
    private _onGraphEdit: (() => void) | null = null;

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
        // §LIVE-MODAL.B/D — render the per-storey living graphs ONLY when a graph
        // editor is wired (`onGraphEdit`), so the interactive nodes are never a
        // dead surface. Without it the modal stays plan-only (pre-LIVE-MODAL look).
        const graphs = cb.onGraphEdit ? this._storeyGraphs(options) : [];
        overlay.innerHTML = buildHouseModalHtml(
            this._cards(options),
            this._storeyThumbs(options),
            formForHtml,
            graphs,
        );

        this._onProgramChange = cb.onProgramChange ?? null;
        this._onGraphEdit = cb.onGraphEdit ?? null;

        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            // Backdrop click (outside the panel) → cancel.
            if (target === overlay) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('.alm-cancel')) { this.dismiss(); cb.onCancel(); return; }
            // §LIVE-MODAL.B — per-storey Plan/Graph toggle. Scoped to the storey
            // row + stopPropagation so it never falls through to "Use this layout".
            const viewBtn = target.closest('.alm-view-btn') as HTMLElement | null;
            if (viewBtn) {
                e.preventDefault();
                e.stopPropagation();
                const row = viewBtn.closest('.hlm-storey') as HTMLElement | null;
                if (row) {
                    const wantGraph = viewBtn.getAttribute('data-view') === 'graph';
                    row.classList.toggle('hlm-storey--graph', wantGraph);
                    row.querySelector('.alm-view-btn--plan')?.setAttribute('aria-pressed', wantGraph ? 'false' : 'true');
                    row.querySelector('.alm-view-btn--graph')?.setAttribute('aria-pressed', wantGraph ? 'true' : 'false');
                }
                return;
            }
            // §LIVE-MODAL.D — a click on a living-graph node opens the inline
            // area/type editor (the C52 edit surface). `closest` works on the
            // SVG-namespaced <circle>.
            const node = (target as Element).closest?.('.alm-graph-node') as Element | null;
            if (node) {
                e.preventDefault();
                e.stopPropagation();
                const name = node.getAttribute('data-room-name');
                if (name) this._openGraphNodeEditor(node, name);
                return;
            }
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
        // §LIVE-MODAL.B/D — re-render the per-storey graphs in lock-step with the
        // plans when graph editing is wired, so an edit's re-render keeps the
        // toggle + interactive nodes.
        const graphs = this._onGraphEdit ? this._storeyGraphs(options) : [];
        grid.innerHTML = buildHouseCardGridHtml(cards, this._storeyThumbs(options), graphs);
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
        this._onGraphEdit = null;
        if (this._el) { this._el.remove(); this._el = null; }
    }

    // ── view helpers ────────────────────────────────────────────────────────

    private _cards(options: readonly ScoredHouseLayoutOption[]): HouseCardModel[] {
        return options.map((o, i) => buildHouseCardModel(o, i));
    }

    private _storeyThumbs(options: readonly ScoredHouseLayoutOption[]): string[][] {
        return this._cards(options).map(card => {
            // §SHARED-FLOOR-BOUNDS (2026-06-09, founder feedback #1) — fit EVERY
            // storey of this variant to ONE shared bounding box (the union of all
            // storeys' room polygons / wall endpoints, in the same mm plan frame
            // the thumbnail draws in). Storeys share an identical exterior shell
            // footprint (StoreyPlate.footprint is "identical on every storey"), so
            // a shared fit makes the Ground-floor and upper-floor thumbnails render
            // at the SAME scale + extent — they no longer look like different-sized
            // footprints just because an upper storey has fewer/smaller rooms.
            const boundsMm = unionStoreyBoundsMm(card);
            // §LIVE-MODAL.C (R3) — "better visibility": render each storey plan at
            // a HERO size (was the renderer default 320×240) so the single best
            // card's plan is clearly legible. The perimeter SHELL RING + the
            // window/door span clamp (§PREVIEW-SHELL-FIDELITY) are already in
            // `buildLayoutThumbnailSvg` (applied from `LayoutWall.isExternal` /
            // the fitted bbox), so no extra flags are needed — the SVG scales to
            // fit the enlarged `.hlm-storey-thumb` CSS box.
            const thumbOpts = { background: '#ffffff', width: 460, height: 320, ...(boundsMm ? { boundsMm } : {}) } as const;
            return card.storeys.map(s => buildLayoutThumbnailSvg(s.option, thumbOpts));
        });
    }

    /** §LIVE-MODAL.B/D — per-storey living-graph SVGs, mirroring `_storeyThumbs`.
     *  One `buildLayoutBubbleGraphSvg` per storey with `interactive:true` so the
     *  nodes carry `data-room-name` + `.alm-graph-node` (clickable → the inline
     *  area/type editor → the C52 override stash → debounced re-generate). Sized
     *  to the same hero box as the plan. */
    private _storeyGraphs(options: readonly ScoredHouseLayoutOption[]): string[][] {
        return this._cards(options).map(card =>
            card.storeys.map(s => buildLayoutBubbleGraphSvg(s.option, {
                background: '#ffffff', width: 460, height: 320, interactive: true,
            })),
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

    /** §LIVE-MODAL.D — schedule the graph-edit re-generate on the SAME debounce
     *  timer the slider uses, so a rapid sequence of node edits (or a node edit
     *  during a slider drag) coalesces into ONE re-run. */
    private _scheduleGraphEdit(): void {
        if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this.setBusy(true);
            this._onGraphEdit?.();
        }, DEBOUNCE_MS);
    }

    /** §LIVE-MODAL.D — open a tiny inline popover anchored near the clicked graph
     *  node to edit its AREA (m²) + TYPE. On apply it writes the EXISTING C52
     *  per-room override stashes (`setRoomAreaOverride` / `setRoomTypeOverride`,
     *  A.26 / ADR-0061) — NO new stash, NO direct geometry mutation — then fires
     *  the SAME debounced re-generate as a slider (`_scheduleGraphEdit`). The
     *  popover is a plain HTML overlay child (not SVG) so the form controls are
     *  native. Re-opening replaces any prior popover. */
    private _openGraphNodeEditor(node: Element, roomName: string): void {
        if (!this._el) return;
        // Remove any open editor first.
        this._el.querySelector('.hlm-node-editor')?.remove();

        const editor = document.createElement('div');
        editor.className = 'hlm-node-editor';
        const typeOptions = ROOM_TYPE_VALUES
            .map(t => `<option value="${t}">${t}</option>`)
            .join('');
        editor.innerHTML =
            `<div class="hlm-node-editor-title">${this._escAttr(roomName)}</div>` +
            `<label class="hlm-node-field"><span>Area m²</span>` +
            `<input type="number" class="hlm-node-area" min="1" max="200" step="0.5" placeholder="auto"></label>` +
            `<label class="hlm-node-field"><span>Type</span>` +
            `<select class="hlm-node-type"><option value="">(keep)</option>${typeOptions}</select></label>` +
            `<div class="hlm-node-actions">` +
            `<button type="button" class="hlm-node-apply">Apply</button>` +
            `<button type="button" class="hlm-node-close">Cancel</button>` +
            `</div>`;

        // Anchor near the node in VIEWPORT coords (the panel is `overflow:hidden`,
        // so the editor lives on the overlay root with `position:fixed`).
        const nodeRect = (node as SVGGraphicsElement).getBoundingClientRect?.();
        if (nodeRect) {
            editor.style.position = 'fixed';
            editor.style.left = `${Math.max(8, Math.min(nodeRect.left, window.innerWidth - 170))}px`;
            editor.style.top = `${Math.max(8, Math.min(nodeRect.bottom + 4, window.innerHeight - 160))}px`;
        }
        this._el.appendChild(editor);

        const apply = (): void => {
            const areaEl = editor.querySelector('.hlm-node-area') as HTMLInputElement | null;
            const typeEl = editor.querySelector('.hlm-node-type') as HTMLSelectElement | null;
            const rawArea = Number(areaEl?.value);
            // Blank/zero clears the override (revert to engine default for that room).
            setRoomAreaOverride(roomName, Number.isFinite(rawArea) && rawArea > 0 ? rawArea : null);
            setRoomTypeOverride(roomName, typeEl?.value || null);
            editor.remove();
            this._scheduleGraphEdit();
        };
        editor.querySelector('.hlm-node-apply')?.addEventListener('click', apply);
        editor.querySelector('.hlm-node-close')?.addEventListener('click', () => editor.remove());
        (editor.querySelector('.hlm-node-area') as HTMLInputElement | null)?.focus();
    }

    private _escAttr(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
