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
import type { ApartmentProgram, ScoringWeights, LayoutOption } from '@pryzm/ai-host';
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
    const bedrooms = Math.max(0, Math.min(5, Math.round(state.program.bedrooms)));
    const bathrooms = Math.max(1, Math.min(3, Math.round(state.program.bathrooms)));
    const chk = (b: boolean): string => b ? ' checked' : '';
    return (
        '<form class="alm-program hlm-program" autocomplete="off" data-role="program">' +
        '<div class="alm-program-row">' +
        `<label class="alm-program-num"><span>Floors</span>` +
        `<input type="number" name="storeys" min="1" max="3" step="1" value="${storeys}"></label>` +
        `<label class="alm-program-num"><span>Bedrooms</span>` +
        `<input type="number" name="bedrooms" min="0" max="5" step="1" value="${bedrooms}"></label>` +
        `<label class="alm-program-num"><span>Bathrooms</span>` +
        `<input type="number" name="bathrooms" min="1" max="3" step="1" value="${bathrooms}"></label>` +
        '</div>' +
        '<div class="alm-program-row alm-program-checks">' +
        `<label class="alm-program-chk"><input type="checkbox" name="livingRoom"${chk(state.program.livingRoom)}> Living room</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="openPlanKitchenDining"${chk(state.program.openPlanKitchenDining)}> Open-plan kitchen + dining</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="masterEnSuite"${chk(state.program.masterEnSuite)}> Master en-suite</label>` +
        '</div>' +
        '<div class="alm-program-row alm-program-sliders">' +
        weightSlidersHtml(state.weights) +
        '</div>' +
        '<div class="alm-program-hint" data-role="program-hint">Edit any field — the house layouts regenerate automatically.</div>' +
        '</form>'
    );
}

/** One storey panel inside a house card. `safeThumb` is the per-storey plan SVG
 *  (produced by `buildLayoutThumbnailSvg`, provably safe). */
function storeyHtml(label: string, safeThumb: string, roomSummary: string, areaM2: number, score: number): string {
    return (
        '<div class="hlm-storey">' +
        `<div class="hlm-storey-thumb">${safeThumb}</div>` +
        `<div class="hlm-storey-meta">` +
        `<span class="hlm-storey-label">${escHtml(label)}</span>` +
        `<span class="hlm-storey-summary">${escHtml(roomSummary)}</span>` +
        `<span class="hlm-storey-stats">${areaM2} m² · score ${score}</span>` +
        `</div>` +
        '</div>'
    );
}

/** One whole-house card. `storeyThumbs[i]` is the SVG for `card.storeys[i]`. */
function cardHtml(card: HouseCardModel, storeyThumbs: readonly string[]): string {
    const storeys = card.storeys
        .map((s, i) => storeyHtml(s.label, storeyThumbs[i] ?? '', s.roomSummary, s.totalAreaM2, s.score))
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
 * cards. `storeyThumbnails[i]` is the per-storey SVG list for `cards[i]`.
 */
export function buildHouseCardGridHtml(
    cards: readonly HouseCardModel[],
    storeyThumbnails: readonly (readonly string[])[],
): string {
    if (cards.length === 0) {
        return '<div class="alm-empty">No valid house layouts were generated. Try a larger plot or a simpler programme.</div>';
    }
    return cards.map((c, i) => cardHtml(c, storeyThumbnails[i] ?? [])).join('');
}

/**
 * Build the modal's inner HTML. `storeyThumbnails[i]` is the per-storey SVG list
 * for `cards[i]`. When `formState` is supplied the §MODAL-DYNAMIC program-edit
 * form renders at the top of the panel and the modal controller wires its change
 * events to a live re-generation flow. Returns header + form + card grid +
 * footer (Cancel). Pure.
 */
export function buildHouseModalHtml(
    cards: readonly HouseCardModel[],
    storeyThumbnails: readonly (readonly string[])[] = [],
    formState?: HouseProgramFormState,
): string {
    const grid = buildHouseCardGridHtml(cards, storeyThumbnails);
    const headerCount = cards.length === 0
        ? ''
        : ` <small>${cards.length} option${cards.length === 1 ? '' : 's'}</small>`;
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
    return (
        '<div class="alm-panel">' +
        `<div class="alm-header">Choose a house layout${headerCount}</div>` +
        programForm +
        legend +
        `<div class="alm-grid" data-role="grid">${grid}</div>` +
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
