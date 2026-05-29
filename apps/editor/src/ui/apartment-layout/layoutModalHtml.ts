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
import type { ApartmentProgram, LayoutOption } from '@pryzm/ai-host';
import { OCCUPANCY_FILL, DEFAULT_OCCUPANCY_FILL } from './layoutThumbnail.js';

/** Display labels for the residential occupancy subset the legend shows. The
 *  bubble graph mints names like "Living Room" / "Bedroom 1" — those live on
 *  per-room labels in the thumbnail. The legend collapses them to one swatch
 *  per occupancy type using this short label. */
const OCCUPANCY_LABEL: Readonly<Record<string, string>> = {
    'bedroom':        'Bedroom',
    'living-room':    'Living Room',
    'kitchen':        'Kitchen',
    'bathroom':       'Bathroom',
    'dining-room':    'Dining',
    'utility-room':   'Utility',
    'corridor':       'Corridor',
    'entrance-lobby': 'Entrance Hall',
    'private-office': 'Study',
};

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

/**
 * §MODAL-DYNAMIC (2026-05-29) — program-edit form. Renders an inline form at
 * the top of the §11 modal so the user can change the program (bedroom +
 * bathroom counts, master en-suite, open-plan, etc.) and the cards re-render
 * with the new generation on-the-fly (modal controller handles the debounce +
 * re-trigger). Input names match the ApartmentProgram fields verbatim so the
 * controller can read them by `form.elements.namedItem(...)` without a map.
 */
export function buildProgramEditFormHtml(program: ApartmentProgram): string {
    const bedrooms = Math.max(0, Math.min(5, Math.round(program.bedrooms)));
    const bathrooms = Math.max(1, Math.min(3, Math.round(program.bathrooms)));
    const chk = (b: boolean): string => b ? ' checked' : '';
    return (
        '<form class="alm-program" autocomplete="off" data-role="program">' +
        '<div class="alm-program-row">' +
        `<label class="alm-program-num"><span>Bedrooms</span>` +
        `<input type="number" name="bedrooms" min="0" max="5" step="1" value="${bedrooms}"></label>` +
        `<label class="alm-program-num"><span>Bathrooms</span>` +
        `<input type="number" name="bathrooms" min="1" max="3" step="1" value="${bathrooms}"></label>` +
        '</div>' +
        '<div class="alm-program-row alm-program-checks">' +
        `<label class="alm-program-chk"><input type="checkbox" name="livingRoom"${chk(program.livingRoom)}> Living room</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="entranceHall"${chk(program.entranceHall)}> Entrance hall</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="openPlanKitchenDining"${chk(program.openPlanKitchenDining)}> Open-plan kitchen + dining</label>` +
        `<label class="alm-program-chk"><input type="checkbox" name="masterEnSuite"${chk(program.masterEnSuite)}> Master en-suite</label>` +
        '</div>' +
        '<div class="alm-program-hint" data-role="program-hint">Edit any field — the layouts regenerate automatically.</div>' +
        '</form>'
    );
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
 * §MODAL-DYNAMIC part-3 (2026-05-29) — occupancy legend.
 * Collects DISTINCT occupancy strings across every room in every option, and
 * renders one swatch + label per occupancy. Stable order (sorts by the
 * `OCCUPANCY_LABEL` key order, then alphabetically), so the legend doesn't
 * jitter as the user edits the program. Unknown occupancies are skipped (the
 * thumbnail also paints them the neutral slate fallback). Returns the inner
 * HTML for the legend container; the modal wraps it in `<div
 * class="alm-legend">`.
 */
export function buildOccupancyLegendHtml(options: readonly LayoutOption[]): string {
    const seen = new Set<string>();
    for (const opt of options) {
        for (const r of opt.rooms ?? []) {
            const occ = r.occupancy ?? '';
            if (occ) seen.add(occ);
        }
    }
    if (seen.size === 0) return '';
    const knownOrder: readonly string[] = [
        'living-room', 'kitchen', 'dining-room', 'entrance-lobby',
        'corridor', 'bedroom', 'bathroom', 'private-office', 'utility-room',
    ];
    const indexOf = (s: string): number => {
        const i = knownOrder.indexOf(s);
        return i === -1 ? knownOrder.length : i;
    };
    const ordered = [...seen].sort((a, b) => {
        const da = indexOf(a), db = indexOf(b);
        return da === db ? a.localeCompare(b) : da - db;
    });
    return ordered.map(occ => {
        const fill = OCCUPANCY_FILL[occ] ?? DEFAULT_OCCUPANCY_FILL;
        const label = OCCUPANCY_LABEL[occ] ?? occ;
        return (
            '<span class="alm-legend-item">' +
            `<span class="alm-legend-swatch" style="background:${fill}" aria-hidden="true"></span>` +
            `<span class="alm-legend-label">${escHtml(label)}</span>` +
            '</span>'
        );
    }).join('');
}

/** Card grid HTML — extracted so the modal can refresh JUST the cards in
 *  place (the program-edit form + outer panel chrome don't re-render on
 *  regeneration). */
export function buildLayoutCardGridHtml(
    cards: readonly LayoutCardModel[],
    thumbnails: readonly string[],
): string {
    if (cards.length === 0) {
        return '<div class="alm-empty">No valid layouts were generated. Try adjusting the program or constraints.</div>';
    }
    return cards.map((c, i) => cardHtml(c, thumbnails[i] ?? '')).join('');
}

/**
 * Build the modal's inner HTML. `thumbnails[i]` is the SVG string for
 * `cards[i]` (empty string when none). When `program` is supplied, the form
 * at the top renders with those values and the modal controller wires its
 * change events to a re-generation flow. Returns header + program-edit form
 * + card grid + footer with a Cancel button. Pure + deterministic.
 */
export function buildLayoutModalHtml(
    cards: readonly LayoutCardModel[],
    thumbnails: readonly string[] = [],
    program?: ApartmentProgram,
    options: readonly LayoutOption[] = [],
): string {
    const programForm = program ? buildProgramEditFormHtml(program) : '';
    const grid = buildLayoutCardGridHtml(cards, thumbnails);
    const headerCount = cards.length === 0
        ? ''
        : ` <small>${cards.length} option${cards.length === 1 ? '' : 's'}</small>`;
    const legendInner = buildOccupancyLegendHtml(options);
    const legend = legendInner
        ? `<div class="alm-legend" data-role="legend">${legendInner}</div>`
        : '';
    return (
        '<div class="alm-panel">' +
        `<div class="alm-header">Choose a layout${headerCount}</div>` +
        programForm +
        legend +
        `<div class="alm-grid" data-role="grid">${grid}</div>` +
        '<div class="alm-footer"><button type="button" class="alm-cancel">Cancel</button></div>' +
        '</div>'
    );
}
