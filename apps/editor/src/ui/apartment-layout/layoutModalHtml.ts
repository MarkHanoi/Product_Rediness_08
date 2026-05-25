// Apartment Layout — pure modal HTML renderer (SPEC §11, A5-modal).
//
// Builds the §11 options-modal inner HTML as a STRING from the card view-models
// (A5-modal-core) + their SVG thumbnails. Pure → unit-tests in plain Node (the
// apps/editor vitest env is 'node', no DOM). The thin DOM controller
// (ApartmentLayoutModal) just sets this as innerHTML + wires clicks.
//
// XSS (C08 §3.1 / check-xss-guards): every interpolated runtime string is wrapped
// in the local `escHtml` (a recognised guard name); the SVG thumbnails are bound
// to `safe`-prefixed vars (provably safe — produced by our own pure builder, no
// user input beyond numeric coords). Numbers interpolate raw (auto-safe).

import type { LayoutCardModel } from './layoutCardModel.js';

/** Local pure HTML escape (no DOM, no import) — keeps this module Node-testable
 *  and is recognised by the xss-guards gate as a safe guard. */
function escHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function cardHtml(card: LayoutCardModel, safeThumb: string): string {
    const bars = card.bars.map(b =>
        `<div class="alm-bar"><span class="alm-bar-label">${escHtml(b.label)}</span>` +
        `<span class="alm-bar-track"><span class="alm-bar-fill" style="width:${b.pct}%"></span></span>` +
        `<span class="alm-bar-pct">${b.pct}</span></div>`,
    ).join('');

    const rooms = card.rooms.map(r =>
        `<li class="alm-room"><span class="alm-room-name">${escHtml(r.name)}</span>` +
        `<span class="alm-room-type">${escHtml(r.type)}</span>` +
        `<span class="alm-room-area">${r.area} m²</span></li>`,
    ).join('');

    return (
        `<div class="alm-card" data-index="${card.index}">` +
        `<div class="alm-thumb">${safeThumb}</div>` +
        `<div class="alm-card-head"><span class="alm-title">${escHtml(card.title)}</span>` +
        `<span class="alm-overall" title="overall score">${card.overall}<small>/100</small></span></div>` +
        `<div class="alm-bars">${bars}</div>` +
        `<div class="alm-meta">${card.roomCount} rooms · ${card.doorCount} doors · ${card.totalAreaM2} m²</div>` +
        `<ul class="alm-rooms">${rooms}</ul>` +
        `<button type="button" class="alm-select" data-index="${card.index}">Use this layout</button>` +
        `</div>`
    );
}

/**
 * Build the modal's inner HTML. `thumbnails[i]` is the SVG string for
 * `cards[i]` (empty string when none). Returns header + card grid + footer with
 * a Cancel button. Pure + deterministic.
 */
export function buildLayoutModalHtml(
    cards: readonly LayoutCardModel[],
    thumbnails: readonly string[] = [],
): string {
    if (cards.length === 0) {
        return (
            '<div class="alm-panel"><div class="alm-header">Apartment layout</div>' +
            '<div class="alm-empty">No valid layouts were generated. Try adjusting the program or constraints.</div>' +
            '<div class="alm-footer"><button type="button" class="alm-cancel">Close</button></div></div>'
        );
    }
    const grid = cards
        .map((c, i) => cardHtml(c, thumbnails[i] ?? ''))
        .join('');
    return (
        '<div class="alm-panel">' +
        `<div class="alm-header">Choose a layout <small>${cards.length} option${cards.length === 1 ? '' : 's'}</small></div>` +
        `<div class="alm-grid">${grid}</div>` +
        '<div class="alm-footer"><button type="button" class="alm-cancel">Cancel</button></div>' +
        '</div>'
    );
}
