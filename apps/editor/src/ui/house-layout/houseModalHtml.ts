// House Layout — pure "Choose a house layout" modal HTML renderer
// (A.21.k / A.21.D21 modal slice). The house SIBLING of the apartment's
// `buildLayoutModalHtml`.
//
// Mirrors the apartment §11 modal STRUCTURE + BRAND: a card grid where each card
// is one whole-house variant. The difference vs. the apartment card: a house card
// shows a PER-STOREY strip (one mini plan thumbnail + a one-line room summary per
// storey, ground → upper(s)) plus the aggregate /100 score bar — so the user can
// preview every floor before picking. Reuses the apartment modal CSS classes
// (`alm-overlay/panel/header/grid/card/overall/select/footer/cancel`) so brand
// (white + #6600FF) + z-index (4000) match by construction, and adds a small set
// of `hlm-` classes for the per-storey strip (styled alongside the apartment
// modal CSS).
//
// Pure → unit-tests in plain Node (the apps/editor vitest env is 'node', no DOM).
// XSS: every interpolated runtime string is wrapped in the local `escHtml` guard;
// the SVG thumbnails are bound to `safe`-prefixed vars (produced by our own pure
// builder — `buildLayoutThumbnailSvg`).

import type { HouseCardModel } from './houseCardModel.js';
import type { ApartmentProgram, ScoringWeights, LayoutOption, RoomType } from '@pryzm/ai-host';
import { buildOccupancyLegendHtml } from '../apartment-layout/layoutModalHtml.js';

/** Local pure HTML escape (recognised by the xss-guards gate as a safe guard). */
function escHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * §MODAL-DYNAMIC (A.21.D22) — house program-edit form. The house SIBLING of the
 * apartment's `buildProgramEditFormHtml`. Renders an inline form at the top of the
 * "Choose a house layout" modal so the user can change the whole-house brief
 * (storeys/floors, bedroom + bathroom counts, master en-suite, design sliders)
 * and the cards re-render with a fresh deterministic generation. Input `name`s
 * match the fields the modal controller reads back verbatim:
 *   `storeys`               → storeyCount (1–3)
 *   `bedrooms`              → ApartmentProgram.bedrooms
 *   `bathrooms`             → ApartmentProgram.bathrooms
 *   `masterEnSuite`         → ApartmentProgram.masterEnSuite
 *   `livingRoom`            → ApartmentProgram.livingRoom (ground-floor living)
 *   `openPlanKitchenDining` → ApartmentProgram.openPlanKitchenDining
 *   `weight_naturalLight` / `weight_privacy` / `weight_kitchenWorkflow` /
 *   `weight_corridorEfficiency` → ScoringWeights design sliders (0–100 → 0–1).
 *
 * Brand: reuses the apartment modal's `alm-program*` CSS classes so white +
 * #6600FF + spacing match by construction. Pure → Node-testable.
 */
export interface HouseProgramFormState {
    readonly storeyCount: number;
    readonly program: ApartmentProgram;
    readonly weights: ScoringWeights;
}

/** Design-slider rows mapped to ScoringWeights axes. Slider value is 0–100 in
 *  the DOM; the controller divides by 100 to get the 0–1 weight. */
const WEIGHT_SLIDERS: ReadonlyArray<{ key: keyof ScoringWeights; label: string }> = [
    { key: 'naturalLight',        label: 'Daylight' },
    { key: 'privacy',             label: 'Privacy' },
    { key: 'kitchenWorkflow',     label: 'Kitchen' },
    { key: 'corridorEfficiency',  label: 'Compactness' },
];

/**
 * §MODAL-PROGRAM-EDIT (2026-06-10, founder #1 modal ask) — per-RoomType ABSOLUTE
 * size override (m²) for a house, mirroring the apartment modal's `§ROOM-AREAS`
 * row. Each input feeds `program.roomAreas[<type>]` (the C52 engine hook — the
 * bubble graph reads `roomAreas[r.type]` as the room's target area, clamped to the
 * type's architectural minimum). Input `name="area_t_<RoomType>"` so the modal
 * controller's form reader collects them by prefix without a side map. Blank =
 * engine default (auto). This is the founder's "increase/decrease the size of each
 * room" control as a discoverable stepper row (the per-INSTANCE graph-node editor
 * — §LIVE-MODAL.D — remains for fine-grained per-room overrides). */
const AREA_FIELDS: ReadonlyArray<{ type: RoomType; label: string; max: number }> = [
    { type: 'living',   label: 'Living',  max: 60 },
    { type: 'kitchen',  label: 'Kitchen', max: 30 },
    { type: 'dining',   label: 'Dining',  max: 28 },
    { type: 'bedroom',  label: 'Bedroom', max: 30 },
    { type: 'master',   label: 'Master',  max: 40 },
    { type: 'bathroom', label: 'Bath',    max: 15 },
];

/** §3PANE IT-2 (SPEC §5.2) — per-RoomType size as a SLIDER (the founder's "increase
 *  size of room with a slider"). value 0 ⇒ auto (engine default); >0 ⇒
 *  `roomAreas[<type>]` (the C52 hook, clamped to the type minimum). Same
 *  `name="area_t_<type>"` so the form reader is unchanged; a live `<output>` shows the
 *  m² (or "auto"), updated by the modal's form-input listener. */
function areaInputsHtml(program: ApartmentProgram): string {
    const overrides = program.roomAreas ?? {};
    return AREA_FIELDS.map(f => {
        const cur = (overrides as Record<string, number>)[f.type];
        const num = (typeof cur === 'number' && Number.isFinite(cur) && cur > 0) ? cur : 0;
        const readout = num > 0 ? `${num} m²` : 'auto';
        return (
            `<label class="alm-program-size"><span class="alm-program-size-label">${escHtml(f.label)}</span>` +
            `<input type="range" name="area_t_${escHtml(f.type)}" min="0" max="${f.max}" step="0.5" value="${num}" data-area-slider>` +
            `<output class="alm-program-size-val" data-readout-for="area_t_${escHtml(f.type)}">${escHtml(readout)}</output></label>`
        );
    }).join('');
}

function weightSlidersHtml(weights: ScoringWeights): string {
    return WEIGHT_SLIDERS.map(s => {
        const raw = Number(weights[s.key]);
        const pct = Math.max(0, Math.min(100, Math.round((Number.isFinite(raw) ? raw : 0.5) * 100)));
        return (
            `<label class="alm-program-slider"><span>${escHtml(s.label)}</span>` +
            `<input type="range" name="weight_${s.key}" min="0" max="100" step="5" value="${pct}">` +
            `</label>`
        );
    }).join('');
}

export function buildHouseProgramEditFormHtml(state: HouseProgramFormState): string {
    const storeys = Math.max(1, Math.min(3, Math.round(state.storeyCount)));
    // §MODAL-FILL (2026-06-10) — the bedroom range tops out at 8 (the engine's
    // MAX_BEDROOMS_HOUSE_STOREY) so the seeded plate-filling count is representable
    // and the user can dial a generous whole-house programme up to what the plate
    // actually holds (was capped at 5, which silently truncated a large plate's
    // resolved count).
    const bedrooms = Math.max(0, Math.min(8, Math.round(state.program.bedrooms)));
    const bathrooms = Math.max(1, Math.min(4, Math.round(state.program.bathrooms)));
    const chk = (b: boolean): string => b ? ' checked' : '';
    const includeKitchen = state.program.includeKitchen !== false;
    return (
        '<form class="alm-program hlm-program" autocomplete="off" data-role="program">' +
        '<div class="alm-program-row">' +
        `<label class="alm-program-num"><span>Floors</span>` +
        `<input type="number" name="storeys" min="1" max="3" step="1" value="${storeys}"></label>` +
        `<label class="alm-program-num"><span>Bedrooms</span>` +
        `<input type="number" name="bedrooms" min="0" max="8" step="1" value="${bedrooms}"></label>` +
        `<label class="alm-program-num"><span>Bathrooms</span>` +
        `<input type="number" name="bathrooms" min="1" max="4" step="1" value="${bathrooms}"></label>` +
        '</div>' +
        '<div class="alm-program-row alm-program-checks">' +
        `<label class="alm-program-chk"><input type="checkbox" name="livingRoom"${chk(state.program.livingRoom)}> Living room</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="includeKitchen"${chk(includeKitchen)}> Kitchen</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="openPlanKitchenDining"${chk(state.program.openPlanKitchenDining)}> Open-plan kitchen + dining</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="masterEnSuite"${chk(state.program.masterEnSuite)}> Master en-suite</label>` +
        '</div>' +
        // §MODAL-PROGRAM-EDIT — per-room-type size (m²) row. Blank = auto. This is
        // the founder's "increase / decrease the space of each room" control.
        '<div class="alm-program-row alm-program-areas">' +
        areaInputsHtml(state.program) +
        '</div>' +
        '<div class="alm-program-row alm-program-sliders">' +
        weightSlidersHtml(state.weights) +
        '</div>' +
        '<div class="alm-program-hint" data-role="program-hint">Add rooms or set a room size (m²) — leave size blank for auto. The house layouts regenerate automatically.</div>' +
        '</form>'
    );
}

/** One storey panel inside a house card. `safeThumb` is the per-storey plan SVG
 *  (produced by `buildLayoutThumbnailSvg`, provably safe); `safeGraph` is the
 *  per-storey living-graph SVG (`buildLayoutBubbleGraphSvg`). §LIVE-MODAL.B —
 *  each storey gets its OWN Plan/Graph toggle (a house card is a per-storey
 *  strip, so the graph is per storey, mirroring the per-storey plan). The toggle
 *  buttons reuse the apartment `.alm-view-toggle` CSS; the delegated click
 *  handler (HouseLayoutModal) toggles `.hlm-storey--graph` on the storey row.
 *  `storeyKey` is a stable per-row index so the handler scopes to ONE row. When
 *  `safeGraph` is empty (no graph for this storey) the toggle is omitted and the
 *  plan shows alone. */
function storeyHtml(
    label: string, safeThumb: string, safeGraph: string, roomSummary: string,
    areaM2: number, score: number, cardIndex: number, storeyKey: number,
): string {
    const hasGraph = safeGraph.length > 0;
    const toggle = hasGraph
        ? `<div class="alm-view-toggle hlm-storey-toggle" role="tablist" aria-label="Storey view">` +
          `<button type="button" class="alm-view-btn alm-view-btn--plan" data-action="toggle-graph" data-view="plan" data-index="${cardIndex}" data-storey="${storeyKey}" aria-pressed="true">Plan</button>` +
          `<button type="button" class="alm-view-btn alm-view-btn--graph" data-action="toggle-graph" data-view="graph" data-index="${cardIndex}" data-storey="${storeyKey}" aria-pressed="false">Graph</button>` +
          `</div>`
        : '';
    const graphView = hasGraph
        ? `<div class="hlm-storey-thumb hlm-storey-view hlm-storey-view--graph">${safeGraph}</div>`
        : '';
    return (
        `<div class="hlm-storey" data-storey="${storeyKey}">` +
        `<div class="hlm-storey-views">` +
        toggle +
        `<div class="hlm-storey-thumb hlm-storey-view hlm-storey-view--plan">${safeThumb}</div>` +
        graphView +
        `</div>` +
        `<div class="hlm-storey-meta">` +
        `<span class="hlm-storey-label">${escHtml(label)}</span>` +
        `<span class="hlm-storey-summary">${escHtml(roomSummary)}</span>` +
        `<span class="hlm-storey-stats">${areaM2} m² · score ${score}</span>` +
        `</div>` +
        '</div>'
    );
}

/** One whole-house card. `storeyThumbs[i]` / `storeyGraphs[i]` are the plan +
 *  living-graph SVGs for `card.storeys[i]`. */
function cardHtml(
    card: HouseCardModel,
    storeyThumbs: readonly string[],
    storeyGraphs: readonly string[] = [],
): string {
    const storeys = card.storeys
        .map((s, i) => storeyHtml(s.label, storeyThumbs[i] ?? '', storeyGraphs[i] ?? '', s.roomSummary, s.totalAreaM2, s.score, card.index, i))
        .join('');
    const roofLabel = card.roofKind.charAt(0).toUpperCase() + card.roofKind.slice(1);
    const stairText = card.stairCount > 0
        ? `${card.stairCount} stair${card.stairCount === 1 ? '' : 's'}`
        : 'single storey';
    return (
        `<div class="alm-card hlm-card" data-index="${card.index}">` +
        `<div class="alm-card-head"><span class="alm-title">${escHtml(card.title)}</span>` +
        `<span class="alm-overall" title="overall score">${card.overall}<small>/100</small></span></div>` +
        // Aggregate score bar (single bar — the per-storey scores live in the strip).
        `<div class="alm-bars"><div class="alm-bar">` +
        `<span class="alm-bar-label">Overall</span>` +
        `<span class="alm-bar-track"><span class="alm-bar-fill" style="width:${card.overall}%"></span></span>` +
        `<span class="alm-bar-pct">${card.overall}</span></div></div>` +
        `<div class="hlm-storeys">${storeys}</div>` +
        `<div class="alm-meta">${card.storeyCount} storey${card.storeyCount === 1 ? '' : 's'} · ${escHtml(stairText)} · ${escHtml(roofLabel)} roof</div>` +
        `<button type="button" class="alm-select" data-index="${card.index}">Use this layout</button>` +
        `</div>`
    );
}

/**
 * Build the card grid HTML — extracted so a future refresh can replace JUST the
 * cards. `storeyThumbnails[i]` is the per-storey plan SVG list for `cards[i]`;
 * `storeyGraphs[i]` is the parallel per-storey living-graph SVG list (§LIVE-MODAL.B,
 * optional — empty ⇒ no Plan/Graph toggle, plan only, the pre-LIVE-MODAL look).
 */
export function buildHouseCardGridHtml(
    cards: readonly HouseCardModel[],
    storeyThumbnails: readonly (readonly string[])[],
    storeyGraphs: readonly (readonly string[])[] = [],
): string {
    if (cards.length === 0) {
        return '<div class="alm-empty">No valid house layouts were generated. Try a larger plot or a simpler programme.</div>';
    }
    return cards.map((c, i) => cardHtml(c, storeyThumbnails[i] ?? [], storeyGraphs[i] ?? [])).join('');
}

/**
 * §3PANE (SPEC-DYNAMIC-PROGRAM-CANVAS §1.1, ADR-0069) — the THREE-PANE body for the
 * single best whole-house option: LEFT = a stacked PLAN view per storey · CENTER = a
 * stacked GRAPH (living graph) per storey · (the RIGHT tools rail is built separately
 * in `buildHouseModalHtml` and is NOT rebuilt on regen). This is the
 * `[data-role="grid"]` content the modal's `refresh()` re-renders in lock-step on every
 * live edit, so both the plans and the graphs flow with the program. No per-storey
 * Plan/Graph toggle (both panes are always visible). Pure.
 */
export function buildHousePanesHtml(
    card: HouseCardModel | undefined,
    storeyThumbs: readonly string[] = [],
    storeyGraphs: readonly string[] = [],
): string {
    if (!card || card.storeys.length === 0) {
        return '<div class="alm-empty">No valid house layouts were generated. Try a larger plot or a simpler programme.</div>';
    }
    const plans = card.storeys.map((s, i) =>
        `<div class="hlm-pane-storey" data-storey-index="${i}">` +
        `<div class="hlm-pane-storey-label">${escHtml(s.label)}</div>` +
        `<div class="hlm-pane-plan">${storeyThumbs[i] ?? ''}</div>` +
        `<div class="hlm-pane-storey-stats">${s.totalAreaM2} m² · score ${s.score}</div>` +
        `</div>`,
    ).join('');
    const graphs = card.storeys.map((s, i) =>
        `<div class="hlm-pane-storey" data-storey-index="${i}">` +
        `<div class="hlm-pane-storey-label">${escHtml(s.label)}</div>` +
        `<div class="hlm-pane-graph">${storeyGraphs[i] ?? '<div class="hlm-pane-graph-empty">—</div>'}</div>` +
        `</div>`,
    ).join('');
    return (
        `<div class="hlm-pane hlm-pane--plans" aria-label="Plan views">${plans}</div>` +
        `<div class="hlm-pane hlm-pane--graphs" aria-label="Graphs">${graphs}</div>`
    );
}

/** §3PANE RIGHT-rail result summary (score + storeys/stairs/roof) + the single
 *  terminal EXECUTE ("Use this layout"). Exported so the modal's `refresh()` rebuilds
 *  it in lock-step with the panes when a live edit changes the level count / score
 *  (IT-2). Empty when there is no best option. Pure. */
export function buildHouseResultHtml(best: HouseCardModel | undefined): string {
    if (!best) return '<div class="hlm-tools-result" data-role="result"></div>';
    const roofLabel = best.roofKind.charAt(0).toUpperCase() + best.roofKind.slice(1);
    const stairText = best.stairCount > 0
        ? `${best.stairCount} stair${best.stairCount === 1 ? '' : 's'}`
        : 'single storey';
    return (
        `<div class="hlm-tools-result" data-role="result">` +
        `<div class="alm-card-head"><span class="alm-title">${escHtml(best.title)}</span>` +
        `<span class="alm-overall" title="overall score">${best.overall}<small>/100</small></span></div>` +
        `<div class="alm-bars"><div class="alm-bar">` +
        `<span class="alm-bar-label">Overall</span>` +
        `<span class="alm-bar-track"><span class="alm-bar-fill" style="width:${best.overall}%"></span></span>` +
        `<span class="alm-bar-pct">${best.overall}</span></div></div>` +
        `<div class="alm-meta">${best.storeyCount} storey${best.storeyCount === 1 ? '' : 's'} · ${escHtml(stairText)} · ${escHtml(roofLabel)} roof</div>` +
        `<button type="button" class="alm-select hlm-execute" data-index="${best.index}">Use this layout</button>` +
        `</div>`
    );
}

/**
 * Build the modal's inner HTML — the §3PANE workspace (SPEC-DYNAMIC-PROGRAM-CANVAS):
 * header + a three-column body { LEFT plans · CENTER graphs (= `[data-role="grid"]`,
 * the regenerated region) · RIGHT tools rail (program-edit form + legend + result +
 * "Use this layout") } + footer (Cancel). The single best whole-house option is shown
 * (`cards[0]`). When `formState` is supplied the §MODAL-DYNAMIC program-edit form
 * renders in the RIGHT rail and the controller wires its change events to the live
 * re-generation flow. Pure.
 */
export function buildHouseModalHtml(
    cards: readonly HouseCardModel[],
    storeyThumbnails: readonly (readonly string[])[] = [],
    formState?: HouseProgramFormState,
    storeyGraphs: readonly (readonly string[])[] = [],
): string {
    const best = cards[0];
    const panes = buildHousePanesHtml(best, storeyThumbnails[0] ?? [], storeyGraphs[0] ?? []);
    const programForm = formState ? buildHouseProgramEditFormHtml(formState) : '';
    // A.21.D51 — founder feedback #2: a room-type colour legend. The house cards'
    // per-storey thumbnails are painted by `buildLayoutThumbnailSvg`, which fills
    // each room polygon from the SHARED `OCCUPANCY_FILL` map. We collect every
    // storey option across every card as a flat `LayoutOption[]` and reuse the
    // apartment modal's `buildOccupancyLegendHtml` so the swatches are keyed to
    // the SAME colour source as the thumbnails (no drift). Rendered ONCE per modal
    // (not per card). Empty cards / no-occupancy options ⇒ no legend.
    const legendInner = buildOccupancyLegendHtml(collectStoreyOptions(cards));
    const legend = legendInner
        ? `<div class="alm-legend" data-role="legend">${legendInner}</div>`
        : '';
    const toolsRail =
        '<div class="hlm-tools-rail" data-role="tools">' +
        programForm +
        legend +
        buildHouseResultHtml(best) +
        '</div>';
    return (
        '<div class="alm-panel hlm-3pane-panel">' +
        // §3PANE (SPEC §1.1) — plan LEFT · graph CENTER · tools RIGHT.
        `<div class="alm-header">Design your house — live</div>` +
        '<div class="hlm-3pane">' +
        // LEFT plans + CENTER graphs live INSIDE the regenerated [data-role="grid"]
        // region (refresh() rebuilds it on every edit); RIGHT tools rail is static.
        `<div class="hlm-panes" data-role="grid">${panes}</div>` +
        toolsRail +
        '</div>' +
        '<div class="alm-footer"><button type="button" class="alm-cancel">Cancel</button></div>' +
        '</div>'
    );
}

/** Flatten every storey's chosen layout option across all house cards into one
 *  `LayoutOption[]` — the input `buildOccupancyLegendHtml` expects. The legend
 *  collapses these to one swatch per distinct room occupancy. Pure. Exported so
 *  the modal's `refresh()` can rebuild the legend in lock-step with the cards. */
export function collectStoreyOptions(cards: readonly HouseCardModel[]): LayoutOption[] {
    // StoreyCardSummary.option is a ScoredLayoutOption (extends LayoutOption), so
    // it's directly assignable — no cast needed.
    const out: LayoutOption[] = [];
    for (const card of cards) {
        for (const storey of card.storeys) {
            if (storey.option) out.push(storey.option);
        }
    }
    return out;
}
