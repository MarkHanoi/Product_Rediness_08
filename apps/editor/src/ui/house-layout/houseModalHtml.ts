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
import type { ApartmentProgram, ScoringWeights, LayoutOption, LayoutRoom, RoomType } from '@pryzm/ai-host';
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
    return (
        `<div class="hlm-pane hlm-pane--plans" aria-label="Plan views">${plans}</div>` +
        `<div class="hlm-pane hlm-pane--graphs" aria-label="Living graph canvas">${buildHouseMiroCanvasHtml(card, storeyGraphs)}</div>`
    );
}

/**
 * §3PANE IT-4 — the unified Miro/Mural CENTER canvas (SPEC-DYNAMIC-PROGRAM-CANVAS
 * §1.1 + R-D, founder 2026-06-11: "both [floor graphs] on the same canvas … like
 * mural/miro … zoom in and out … move the nodes … move a bedroom from first floor to
 * ground floor … connect spaces"). Both storeys' living graphs render as labelled
 * LANES inside ONE pan/zoom WORLD (`[data-role="miro-world"]`, transform applied by the
 * modal's `_wireMiroCanvas`), stacked Ground→top so dragging a node UP moves it toward
 * the ground floor. Each lane keeps `data-storey-index` (the SOURCE storey for a
 * cross-floor move) and the graph SVG's `.alm-graph-node[data-room-name]` nodes
 * (clickable → the C52 inline editor; draggable in IT-4b/c). Pure HTML; all
 * interaction is wired in `HouseLayoutModal`. Exported for the modal + tests.
 */
export function buildHouseMiroCanvasHtml(
    card: HouseCardModel | undefined,
    storeyGraphs: readonly string[] = [],
): string {
    if (!card || card.storeys.length === 0) return '<div class="hlm-pane-graph-empty">—</div>';
    const lanes = card.storeys.map((s, i) =>
        `<div class="hlm-miro-lane" data-storey-index="${i}" data-storey-label="${escHtml(s.label)}">` +
        `<div class="hlm-miro-lane-label">${escHtml(s.label)}</div>` +
        `<div class="hlm-miro-lane-graph">${storeyGraphs[i] ?? '<div class="hlm-pane-graph-empty">—</div>'}</div>` +
        `</div>`,
    ).join('');
    return (
        '<div class="hlm-miro" data-role="miro">' +
        '<div class="hlm-miro-toolbar">' +
        '<span class="hlm-miro-hint">Drag a room across floors to move it · drag room → room to connect</span>' +
        '<span class="hlm-miro-zoom">' +
        '<button type="button" class="hlm-miro-btn" data-miro="out" aria-label="Zoom out">−</button>' +
        '<button type="button" class="hlm-miro-btn" data-miro="reset" aria-label="Reset view">Reset</button>' +
        '<button type="button" class="hlm-miro-btn" data-miro="in" aria-label="Zoom in">+</button>' +
        '</span>' +
        '</div>' +
        '<div class="hlm-miro-viewport" data-role="miro-viewport">' +
        `<div class="hlm-miro-world" data-role="miro-world">${lanes}</div>` +
        '</div>' +
        '</div>'
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

// ─────────────────────────────────────────────────────────────────────────────
// §54 LIVING-GRAPH NODE INSPECTOR (founder 2026-06-11) — each living-graph node is
// an individual CARD the user can INTERROGATE. Clicking a node opens the inline
// editor (Area/Type/Floor/Connect) PRECEDED by this read-only INSPECTOR section:
// INFORMATION · DEPENDENCIES · ADJACENCY · CIRCULATION (the living-graph
// relationships), so the canvas reads as "a more flowing and dynamic layout".
//
// All four sections are DERIVED editor-side from the storey's `LayoutRoom[]`:
//   • INFORMATION  — `room.name` / `room.type` (humanised) / `room.area`.
//   • ADJACENCY    — `room.adjacentTo` (room NAMES it shares an edge/door with).
//   • CIRCULATION  — does it touch a `corridor`/`hall` room on this storey? Looked
//                    up by mapping each `adjacentTo` name → that room's `type`.
//   • DEPENDENCIES — a one-line program ROLE derived ONLY from `type` (no ai-host
//                    rules import). Public/entry vs private/off-the-corridor.
// Pure → Node-testable (`buildNodeInspectorHtml`). The modal injects the returned
// markup ABOVE the existing edit controls in `_openGraphNodeEditor`.
// ─────────────────────────────────────────────────────────────────────────────

/** Human-readable label for a RoomType (e.g. `master` → "Master bedroom"). Falls
 *  back to a Title-cased version of the raw type. Pure. */
const ROOM_TYPE_LABEL: Readonly<Record<string, string>> = {
    master:   'Master bedroom',
    bedroom:  'Bedroom',
    living:   'Living room',
    kitchen:  'Kitchen',
    dining:   'Dining room',
    bathroom: 'Bathroom',
    ensuite:  'En-suite',
    wc:       'WC',
    hall:     'Hall',
    corridor: 'Corridor',
    study:    'Study',
    utility:  'Utility',
    stair:    'Stair',
};

function roomTypeLabel(type: string): string {
    if (ROOM_TYPE_LABEL[type]) return ROOM_TYPE_LABEL[type]!;
    const t = String(type ?? '').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Room';
}

/** Circulation room types — a room "on circulation" shares an edge/door with one
 *  of these on its storey. */
const CIRCULATION_TYPES: ReadonlySet<string> = new Set(['corridor', 'hall']);

/** Program ROLE one-liner, derived ONLY from the room type (no ai-host rules).
 *  Public/entry zone vs private (off-the-corridor) vs service/circulation. */
function roomDependencyRole(type: string): string {
    switch (type) {
        case 'hall':     return 'Public — entry zone';
        case 'corridor': return 'Circulation — serves other rooms';
        case 'living':
        case 'kitchen':
        case 'dining':   return 'Public — entry zone';
        case 'master':
        case 'bedroom':  return 'Private — off the corridor';
        case 'bathroom':
        case 'ensuite':
        case 'wc':       return 'Private — off the corridor';
        case 'study':    return 'Private — off the corridor';
        case 'utility':  return 'Service — off the circulation';
        case 'stair':    return 'Circulation — connects floors';
        default:         return 'Room';
    }
}

/**
 * §54 — pure builder for the living-graph node INSPECTOR card. `room` is the
 * clicked room's `LayoutRoom`; `storeyRooms` is that storey's full `LayoutRoom[]`
 * (used to resolve each `adjacentTo` NAME → its type for the circulation check).
 * Returns a `<div class="hlm-node-inspector">…</div>` block of four labelled
 * sections (INFORMATION · DEPENDENCIES · ADJACENCY · CIRCULATION). Every runtime
 * string is `escHtml`-guarded. Pure + Node-testable. Returns '' when `room` is
 * missing so the modal can fall back to the bare editor. */
export function buildNodeInspectorHtml(
    room: LayoutRoom | undefined,
    storeyRooms: readonly LayoutRoom[] = [],
): string {
    if (!room) return '';
    const typeByName = new Map<string, string>();
    for (const r of storeyRooms) {
        if (r && typeof r.name === 'string') typeByName.set(r.name, String(r.type ?? ''));
    }

    const typeLabel = roomTypeLabel(String(room.type ?? ''));
    const areaText = (typeof room.area === 'number' && Number.isFinite(room.area) && room.area > 0)
        ? `${Math.round(room.area)} m²`
        : 'auto';

    const adjacent = Array.isArray(room.adjacentTo)
        ? room.adjacentTo.filter((n): n is string => typeof n === 'string' && n.length > 0 && n !== room.name)
        : [];
    const adjacencyInner = adjacent.length > 0
        ? adjacent.map(n => `<span class="hlm-insp-chip">${escHtml(n)}</span>`).join('')
        : '<span class="hlm-insp-empty">No connected rooms</span>';

    // CIRCULATION — the first adjacent room whose type is a corridor/hall.
    const circVia = adjacent.find(n => CIRCULATION_TYPES.has(typeByName.get(n) ?? ''));
    const circulationHtml = circVia
        ? `<span class="hlm-insp-circ hlm-insp-circ--on">On circulation ✓ <small>(via ${escHtml(circVia)})</small></span>`
        : adjacent.length > 0
            ? `<span class="hlm-insp-circ hlm-insp-circ--off">Not on circulation ✗ <small>(served through ${escHtml(adjacent[0]!)})</small></span>`
            : `<span class="hlm-insp-circ hlm-insp-circ--off">Not on circulation ✗ <small>(sealed)</small></span>`;

    const role = roomDependencyRole(String(room.type ?? ''));

    return (
        '<div class="hlm-node-inspector" data-role="node-inspector">' +
        // INFORMATION
        '<div class="hlm-insp-section hlm-insp-info">' +
        '<span class="hlm-insp-label">Information</span>' +
        `<span class="hlm-insp-line"><b>${escHtml(room.name)}</b></span>` +
        `<span class="hlm-insp-meta">${escHtml(typeLabel)} · ${escHtml(areaText)}</span>` +
        '</div>' +
        // DEPENDENCIES
        '<div class="hlm-insp-section hlm-insp-deps">' +
        '<span class="hlm-insp-label">Dependencies</span>' +
        `<span class="hlm-insp-line">${escHtml(role)}</span>` +
        '</div>' +
        // ADJACENCY
        '<div class="hlm-insp-section hlm-insp-adj">' +
        '<span class="hlm-insp-label">Adjacency</span>' +
        `<span class="hlm-insp-chips">${adjacencyInner}</span>` +
        '</div>' +
        // CIRCULATION
        '<div class="hlm-insp-section hlm-insp-circulation">' +
        '<span class="hlm-insp-label">Circulation</span>' +
        circulationHtml +
        '</div>' +
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
