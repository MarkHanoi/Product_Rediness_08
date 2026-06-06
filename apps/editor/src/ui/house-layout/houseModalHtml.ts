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

/** Local pure HTML escape (recognised by the xss-guards gate as a safe guard). */
function escHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
 * for `cards[i]`. Returns header + card grid + footer (Cancel). Pure.
 */
export function buildHouseModalHtml(
    cards: readonly HouseCardModel[],
    storeyThumbnails: readonly (readonly string[])[] = [],
): string {
    const grid = buildHouseCardGridHtml(cards, storeyThumbnails);
    const headerCount = cards.length === 0
        ? ''
        : ` <small>${cards.length} option${cards.length === 1 ? '' : 's'}</small>`;
    return (
        '<div class="alm-panel">' +
        `<div class="alm-header">Choose a house layout${headerCount}</div>` +
        `<div class="alm-grid" data-role="grid">${grid}</div>` +
        '<div class="alm-footer"><button type="button" class="alm-cancel">Cancel</button></div>' +
        '</div>'
    );
}
