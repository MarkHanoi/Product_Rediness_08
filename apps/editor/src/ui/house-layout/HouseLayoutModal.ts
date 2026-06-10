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

import type { ScoredHouseLayoutOption, ApartmentProgram, ScoringWeights, ScoredLayoutOption } from '@pryzm/ai-host';
import { resolveEntranceDoor } from '@pryzm/ai-host';
import { buildHouseCardModel, type HouseCardModel } from './houseCardModel.js';
import type { PerimeterSpan } from '../apartment-layout/layoutThumbnail.js';
import {
    buildHouseModalHtml,
    buildHousePanesHtml,
    buildHouseResultHtml,
    collectStoreyOptions,
    type HouseProgramFormState,
} from './houseModalHtml.js';
import { buildLayoutThumbnailSvg } from '../apartment-layout/layoutThumbnail.js';
import { buildLayoutBubbleGraphSvg } from '../apartment-layout/layoutBubbleGraph.js';
import { buildOccupancyLegendHtml } from '../apartment-layout/layoutModalHtml.js';
import { setRoomAreaOverride } from '../apartment-layout/activeRoomAreaOverrides.js';
import { setRoomTypeOverride, ROOM_TYPE_VALUES } from '../apartment-layout/activeRoomTypeOverrides.js';
import { setRoomFloorOverride } from '../apartment-layout/activeRoomFloorOverrides.js';

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
    perimeterRingMm?: ReadonlyArray<{ x: number; y: number }>,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let have = false;
    const acc = (x: number, y: number): void => {
        have = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    // §PREVIEW-PREDICTS-BUILD — the real footprint ring is the authoritative
    // extent: include it so the complete perimeter is never clipped by a fit to
    // only the (possibly inset) room polygons.
    if (perimeterRingMm) for (const p of perimeterRingMm) acc(p.x, p.y);
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

/** Rotate a world-XZ point by `+rad` about `pivot` (world metres). Mirrors the
 *  executor's `_rotateXZ` + the orchestrator's `rotatePt` so the preview's stair
 *  placement matches the build. Pure. */
function rotateXZWorld(
    p: { x: number; z: number },
    rad: number,
    pivot: { x: number; z: number },
): { x: number; z: number } {
    if (rad === 0) return p;
    const c = Math.cos(rad), s = Math.sin(rad);
    const dx = p.x - pivot.x, dz = p.z - pivot.z;
    return { x: pivot.x + dx * c - dz * s, z: pivot.z + dx * s + dz * c };
}

/**
 * §PREVIEW-PREDICTS-BUILD (2026-06-09, founder #3) — the WORLD-XZ AABB of a stair
 * core, in the mm PLAN frame the thumbnail draws in. Replicates the orchestrator's
 * keep-out derivation (houseOrchestrator §STAIR-KEEPOUT fallback): the reserved
 * `rectMm` (LAYOUT frame, mm) → world corners (÷1000 → rotate by `principalAxisRad`
 * about `pivot`) → shift by the inward `containOffsetWorld` (the same shift the
 * executor applies to the shipped body) → axis-aligned bbox → back to mm (×1000).
 * This is the region the room tiling avoids, so drawing it labels the otherwise
 * empty hole as the stair where the build places it. Pure + deterministic. */
function stairRectMmForLevel(
    result: ScoredHouseLayoutOption['result'],
    storeyIndex: number,
): ReadonlyArray<{ x: number; y: number }> | null {
    // A stair connects storey i→i+1; show it on BOTH the from- and to-storey plans
    // (the void appears on the upper, the run starts on the lower). The stair core
    // is identical (same rectMm/rotation) on every storey it passes through (§7),
    // so the FIRST stair touching this storey index is representative. Map by INDEX
    // (the option's own `levelId` is the graph-internal 'shell' placeholder, not the
    // storey level — so id-matching would never hit).
    const plates = result.storeys ?? [];
    const levelId = plates[storeyIndex]?.levelId;
    if (!levelId) return null;
    const stair = (result.stairs ?? []).find(s => s.fromLevelId === levelId || s.toLevelId === levelId);
    if (!stair) return null;
    const r = stair.rectMm;
    if (!r || !(r.w > 0) || !(r.h > 0)) return null;
    const rad = stair.principalAxisRad ?? 0;
    const pivot = stair.pivot ?? { x: 0, z: 0 };
    const off = stair.containOffsetWorld ?? { x: 0, z: 0 };
    const cornersM = [
        { x: r.x / 1000, z: r.y / 1000 },
        { x: (r.x + r.w) / 1000, z: r.y / 1000 },
        { x: (r.x + r.w) / 1000, z: (r.y + r.h) / 1000 },
        { x: r.x / 1000, z: (r.y + r.h) / 1000 },
    ].map(c => {
        const w = rotateXZWorld(c, rad, pivot);
        return { x: w.x + off.x, z: w.z + off.z };
    });
    const x0 = Math.min(...cornersM.map(c => c.x)), x1 = Math.max(...cornersM.map(c => c.x));
    const z0 = Math.min(...cornersM.map(c => c.z)), z1 = Math.max(...cornersM.map(c => c.z));
    // mm plan frame: plan-x = world-x×1000, plan-y = world-z×1000.
    return [
        { x: x0 * 1000, y: z0 * 1000 },
        { x: x1 * 1000, y: z0 * 1000 },
        { x: x1 * 1000, y: z1 * 1000 },
        { x: x0 * 1000, y: z1 * 1000 },
    ];
}

/**
 * §PREVIEW-PREDICTS-BUILD (2026-06-09, founder #6) — resolve the GROUND-floor
 * entrance door span for the preview, mirroring the executor's §A.21.D29 (which
 * runs `resolveEntranceDoor` on the GROUND storey only). The executor resolves it
 * against the drawn shell walls; here there are no element ids, so we synthesise
 * shell walls FROM the footprint ring (each edge = one wall, world-XZ metres) and
 * run the SAME pure `resolveEntranceDoor`. The result `{shellWallId, offsetM,
 * widthM}` is converted to a world-XZ `PerimeterSpan` along the chosen edge, which
 * the thumbnail draws as a purple leaf ON the hall-fronting shell wall — so the
 * preview shows the entrance on the hall, as the build will. Returns null when no
 * hall-fronting wall fits a door (matching the executor's "no entrance" branch).
 * Pure + deterministic. */
function entranceSpanForGround(
    option: ScoredLayoutOption,
    footprintWorld: ReadonlyArray<{ x: number; z: number }>,
): PerimeterSpan | null {
    try {
        if (footprintWorld.length < 3) return null;
        const shellWalls = footprintWorld.map((a, i) => {
            const b = footprintWorld[(i + 1) % footprintWorld.length]!;
            return { id: `fp-${i}`, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } };
        });
        const door = resolveEntranceDoor(option, shellWalls);
        if (!door) return null;
        const host = shellWalls.find(w => w.id === door.shellWallId);
        if (!host) return null;
        const dx = host.end.x - host.start.x, dz = host.end.z - host.start.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len;
        const a0 = Math.max(0, Math.min(door.offsetM, len));
        const a1 = Math.max(0, Math.min(door.offsetM + door.widthM, len));
        return {
            a: { x: host.start.x + ux * a0, z: host.start.z + uz * a0 },
            b: { x: host.start.x + ux * a1, z: host.start.z + uz * a1 },
        };
    } catch {
        return null;
    }
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
            // §LIVE-MODAL.D + §3PANE IT-3 SELECTION-SYNC (SPEC §5.8) — a click on a
            // living-graph node OR a plan room polygon (both carry `data-room-name`)
            // (a) HIGHLIGHTS that room across ALL panes (graph + every plan), and
            // (b) opens the inline area/type editor (the C52 edit surface).
            const roomEl = (target as Element).closest?.('.alm-graph-node, .alm-room-polygon') as Element | null;
            if (roomEl) {
                e.preventDefault();
                e.stopPropagation();
                const name = roomEl.getAttribute('data-room-name');
                if (name) {
                    this._highlightRoom(name);
                    // §3PANE IT-3c — the SOURCE storey of the clicked room (its pane's
                    // data-storey-index) + how many storeys exist, so the editor can
                    // offer a Floor move (`storey:<src>/<name>` → target).
                    const wrap = (roomEl as Element).closest('[data-storey-index]');
                    const srcStorey = wrap ? Number(wrap.getAttribute('data-storey-index')) : 0;
                    const storeyCount = this._el?.querySelectorAll('.hlm-pane--graphs .hlm-pane-storey').length ?? 1;
                    this._openGraphNodeEditor(roomEl, name, Number.isInteger(srcStorey) ? srcStorey : 0, storeyCount);
                }
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
                const handler = (e?: Event): void => {
                    // §3PANE IT-2 — live m² readout for a size slider (immediate, before
                    // the debounced regen). The slider's <output> mirrors its value.
                    const t = e?.target as HTMLInputElement | undefined;
                    if (t && typeof t.matches === 'function' && t.matches('input[data-area-slider]')) {
                        const out = form.querySelector(`output[data-readout-for="${t.name}"]`);
                        if (out) out.textContent = Number(t.value) > 0 ? `${t.value} m²` : 'auto';
                    }
                    this._scheduleProgramChange(form);
                };
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
        // §3PANE — refresh() rebuilds the LEFT plans + CENTER graphs (the regenerated
        // region) for the single best option; the RIGHT tools rail stays put.
        const thumbs = this._storeyThumbs(options);
        grid.innerHTML = buildHousePanesHtml(cards[0], thumbs[0] ?? [], graphs[0] ?? []);
        // A.21.D51 — refresh the room-type legend in lock-step with the cards
        // (editing floors/bedrooms can change which occupancies are present).
        const legend = this._el.querySelector('[data-role="legend"]');
        if (legend) legend.innerHTML = buildOccupancyLegendHtml(collectStoreyOptions(cards));
        // §3PANE IT-2 — refresh the RIGHT-rail result (score / storey count / Execute)
        // so changing the level count or a slider updates the summary live too.
        const result = this._el.querySelector('[data-role="result"]');
        if (result) result.outerHTML = buildHouseResultHtml(cards[0]);
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
        const cards = this._cards(options);
        return cards.map((card, ci) => {
            const result = options[ci]?.result;
            // §SHARED-FLOOR-BOUNDS (2026-06-09, founder feedback #1) — fit EVERY
            // storey of this variant to ONE shared bounding box (the union of all
            // storeys' room polygons / wall endpoints, in the same mm plan frame
            // the thumbnail draws in). Storeys share an identical exterior shell
            // footprint (StoreyPlate.footprint is "identical on every storey"), so
            // a shared fit makes the Ground-floor and upper-floor thumbnails render
            // at the SAME scale + extent — they no longer look like different-sized
            // footprints just because an upper storey has fewer/smaller rooms.
            // §PREVIEW-PREDICTS-BUILD — the real exterior footprint (world XZ
            // metres → mm plan frame: x×1000, y=z×1000) the executor builds. It is
            // identical on every storey (StoreyPlate.footprint), so any storey with
            // a footprint yields the shared ring. This is the COMPLETE shell — the
            // preview now draws THIS instead of the engine's partial/un-rectified
            // `isExternal` walls (fixes the "holes / short perimeter" + "shifted
            // middle" + apparent flip vs the build).
            const footprintWorld = result?.storeys?.find(s => s.footprint && s.footprint.length >= 3)?.footprint;
            const perimeterRingMm = footprintWorld
                ? footprintWorld.map(p => ({ x: p.x * 1000, y: p.z * 1000 }))
                : undefined;
            const boundsMm = unionStoreyBoundsMm(card, perimeterRingMm);
            // §LIVE-MODAL.C (R3) — "better visibility": render each storey plan at
            // a HERO size (was the renderer default 320×240) so the single best
            // card's plan is clearly legible.
            return card.storeys.map(s => {
                const stairRect = result ? stairRectMmForLevel(result, s.storeyIndex) : null;
                // §PREVIEW-PREDICTS-BUILD #6 — the entrance door is resolved by the
                // executor on the GROUND storey only; mirror that here so the preview
                // shows the entrance on the hall-fronting shell wall.
                const entranceSpan = (s.storeyIndex === 0 && footprintWorld)
                    ? entranceSpanForGround(s.option, footprintWorld)
                    : null;
                const thumbOpts = {
                    background: '#ffffff', width: 460, height: 320,
                    ...(boundsMm ? { boundsMm } : {}),
                    ...(perimeterRingMm ? { perimeterRingMm } : {}),
                    ...(stairRect ? { stairRectsMm: [stairRect] } : {}),
                    ...(entranceSpan ? { doorSpansWorld: [entranceSpan] } : {}),
                } as const;
                return buildLayoutThumbnailSvg(s.option, thumbOpts);
            });
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
    /** §3PANE IT-3 SELECTION-SYNC (SPEC §5.8) — highlight EVERY element that
     *  represents `roomName` across all panes (the graph node + each plan room
     *  polygon, both carrying `data-room-name`); clears any prior highlight first.
     *  Read-only (no program edit); the highlight clears on the next regen when the
     *  panes rebuild. */
    private _highlightRoom(roomName: string): void {
        if (!this._el) return;
        this._el.querySelectorAll('.hlm-selected').forEach(el => el.classList.remove('hlm-selected'));
        const sel = `[data-room-name="${roomName.replace(/["\\]/g, '\\$&')}"]`;
        try {
            this._el.querySelectorAll(sel).forEach(el => el.classList.add('hlm-selected'));
        } catch { /* an exotic name that breaks the attribute selector — skip */ }
    }

    private _openGraphNodeEditor(node: Element, roomName: string, srcStorey = 0, storeyCount = 1): void {
        if (!this._el) return;
        // Remove any open editor first.
        this._el.querySelector('.hlm-node-editor')?.remove();

        const editor = document.createElement('div');
        editor.className = 'hlm-node-editor';
        const typeOptions = ROOM_TYPE_VALUES
            .map(t => `<option value="${t}">${t}</option>`)
            .join('');
        // §3PANE IT-3c — a Floor move control (only when the house has >1 storey).
        // Choosing a different floor writes the cross-storey override
        // (`storey:<src>/<roomName>` → target) the engine re-allocates on.
        const floorField = storeyCount > 1
            ? `<label class="hlm-node-field"><span>Floor</span>` +
              `<select class="hlm-node-floor">` +
              Array.from({ length: storeyCount }, (_, i) =>
                  `<option value="${i}"${i === srcStorey ? ' selected' : ''}>${i === 0 ? 'Ground' : `Level ${i}`}</option>`,
              ).join('') +
              `</select></label>`
            : '';
        editor.innerHTML =
            `<div class="hlm-node-editor-title">${this._escAttr(roomName)}</div>` +
            `<label class="hlm-node-field"><span>Area m²</span>` +
            `<input type="number" class="hlm-node-area" min="1" max="200" step="0.5" placeholder="auto"></label>` +
            `<label class="hlm-node-field"><span>Type</span>` +
            `<select class="hlm-node-type"><option value="">(keep)</option>${typeOptions}</select></label>` +
            floorField +
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
            // §3PANE IT-3c — move the room to the chosen floor (when it changed).
            const floorEl = editor.querySelector('.hlm-node-floor') as HTMLSelectElement | null;
            if (floorEl) {
                const target = Number(floorEl.value);
                if (Number.isInteger(target) && target !== srcStorey) {
                    setRoomFloorOverride(`storey:${srcStorey}/${roomName}`, target);
                }
            }
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
     *  bedrooms 0–8, bathrooms 1–4 (matching the §MODAL-FILL input attributes +
     *  the engine's MAX_BEDROOMS_HOUSE_STOREY=8 ceiling); slider 0–100 → 0–1
     *  weights. §MODAL-PROGRAM-EDIT — the `area_t_<type>` inputs are collected into
     *  `program.roomAreas` (the C52 per-RoomType size hook); a blank input clears
     *  that type's override. */
    private _readFormState(form: HTMLFormElement): HouseProgramFormState {
        const numByName = (name: string, def: number): number => {
            const el = form.elements.namedItem(name) as HTMLInputElement | null;
            if (!el) return def;
            const v = Number(el.value);
            return Number.isFinite(v) ? v : def;
        };
        const boolByName = (name: string, def = false): boolean => {
            const el = form.elements.namedItem(name) as HTMLInputElement | null;
            return el ? !!el.checked : def;
        };
        const weightByName = (key: keyof ScoringWeights, def: number): number => {
            const el = form.elements.namedItem(`weight_${key}`) as HTMLInputElement | null;
            if (!el) return def;
            const v = Number(el.value);
            if (!Number.isFinite(v)) return def;
            return Math.max(0, Math.min(1, v / 100));
        };
        // §MODAL-PROGRAM-EDIT — collect every `area_t_<RoomType>` input that carries
        // a positive number into a `roomAreas` override map. Blank/zero/non-finite
        // values are omitted (revert that type to the engine default). Iterates the
        // form's named elements so it stays in lock-step with `AREA_FIELDS` without a
        // duplicated list.
        const roomAreas: Record<string, number> = {};
        for (const el of Array.from(form.elements)) {
            const input = el as HTMLInputElement;
            const name = input.name || '';
            if (!name.startsWith('area_t_')) continue;
            const v = Number(input.value);
            if (Number.isFinite(v) && v > 0) roomAreas[name.slice('area_t_'.length)] = v;
        }

        const program: ApartmentProgram = {
            bedrooms: Math.max(0, Math.min(8, Math.round(numByName('bedrooms', 1)))),
            bathrooms: Math.max(1, Math.min(4, Math.round(numByName('bathrooms', 1)))),
            masterEnSuite: boolByName('masterEnSuite'),
            openPlanKitchenDining: boolByName('openPlanKitchenDining'),
            livingRoom: boolByName('livingRoom'),
            // §MODAL-PROGRAM-EDIT — Kitchen toggle (defaults on; the engine treats
            // absent/true as "include a kitchen", false as "no kitchen").
            includeKitchen: boolByName('includeKitchen', true),
            entranceHall: false,
            ...(Object.keys(roomAreas).length > 0
                ? { roomAreas: roomAreas as ApartmentProgram['roomAreas'] }
                : {}),
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
