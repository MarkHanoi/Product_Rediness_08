// Residential building (multi-family) — pure modal HTML builder (P3.3).
//
// Turns a `ResidentialCardModel` (+ pre-rendered per-apartment plan thumbnails)
// into the modal's inner HTML STRING. PURE: no DOM, no THREE — the SVG thumbnails
// are passed in as strings (rendered by `buildLayoutThumbnailSvg` in the modal
// controller, which is the one place allowed to touch the DOM-free SVG builder).
// Reuses the apartment modal's `alm-*` brand classes (white + #6600FF) so the
// overlay/panel/footer styling matches by construction (no new CSS injection).
//
// Per-floor card layout:
//   • Ground floor → "core + commercial shell" marker (no apartments).
//   • Upper floor  → one tile per apartment: a plan thumbnail + score + m² for a
//     placed apartment, or a HATCHED "no layout — over-programmed" box for a
//     rejected one. The central core (stair + lift) is shown as a labelled chip.
// Plus a building-totals header.

import type { ResidentialCardModel, FloorCardSummary, ApartmentCardSummary } from './residentialCardModel.js';
import { buildOccupancyLegendHtml } from '../apartment-layout/layoutModalHtml.js';
import type { LayoutOption } from '@pryzm/ai-host';

/** Minimal HTML-escape for any interpolated text. */
function esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** One apartment tile: a placed plan thumbnail OR a hatched rejection box. */
function buildApartmentTileHtml(a: ApartmentCardSummary, thumbSvg: string): string {
    if (a.status === 'rejected') {
        return `
          <div class="rb-apt rb-apt--rejected" title="${esc(a.rejectReason ?? 'no layout')}">
            <div class="rb-apt-hatch" aria-hidden="true"></div>
            <div class="rb-apt-foot">
              <span class="rb-apt-type">${esc(a.typology)}</span>
              <span class="rb-apt-reject">no layout — over-programmed</span>
            </div>
          </div>`;
    }
    return `
      <div class="rb-apt rb-apt--ok">
        <div class="rb-apt-thumb">${thumbSvg}</div>
        <div class="rb-apt-foot">
          <span class="rb-apt-type">${esc(a.typology)}</span>
          <span class="rb-apt-meta">${esc(a.roomSummary)} · ${a.targetAreaM2} m²</span>
          <span class="rb-apt-score">${a.score}<small>/100</small></span>
        </div>
      </div>`;
}

/** One floor card. `thumbs[i]` is the SVG for `floor.apartments[i]` (placed) or ''. */
function buildFloorCardHtml(floor: FloorCardSummary, thumbs: readonly string[]): string {
    const coreChip = `<span class="rb-core-chip" title="Central core: stair + lift">◉ Core (stair + lift)</span>`;
    if (floor.role === 'ground') {
        const shell = floor.commercialGroundFloor ? 'Commercial shell' : 'Lobby';
        return `
          <section class="rb-floor" data-level="${floor.levelIndex}">
            <header class="rb-floor-head">
              <span class="rb-floor-label">${esc(floor.label)}</span>
              <span class="rb-floor-sub">${coreChip} · ${esc(shell)} (no apartments)</span>
            </header>
            <div class="rb-ground">
              <div class="rb-ground-shell">${esc(shell)} around the central core</div>
            </div>
          </section>`;
    }
    const tiles = floor.apartments.map((a, i) => buildApartmentTileHtml(a, thumbs[i] ?? '')).join('');
    const counts = `${floor.placedCount} apartment${floor.placedCount === 1 ? '' : 's'}`
        + (floor.rejectedCount > 0 ? ` · <span class="rb-floor-reject">${floor.rejectedCount} rejected</span>` : '');
    return `
      <section class="rb-floor" data-level="${floor.levelIndex}">
        <header class="rb-floor-head">
          <span class="rb-floor-label">${esc(floor.label)}</span>
          <span class="rb-floor-sub">${coreChip} · public corridor · ${counts}</span>
        </header>
        <div class="rb-apts">${tiles || '<div class="rb-apts-empty">No apartments placed on this floor.</div>'}</div>
      </section>`;
}

/** Flatten every placed apartment's chosen layout across all floors into one
 *  `LayoutOption[]` so the SHARED `buildOccupancyLegendHtml` (the same helper the
 *  HOUSE + apartment modals use) can render ONE room-type colour legend keyed to the
 *  SAME `OCCUPANCY_FILL` source the per-apartment thumbnails are painted from — no
 *  colour drift. Pure. */
export function collectApartmentLayouts(card: ResidentialCardModel): LayoutOption[] {
    const out: LayoutOption[] = [];
    for (const floor of card.floors) {
        for (const a of floor.apartments) {
            if (a.status === 'ok' && a.apt.layout) out.push(a.apt.layout);
        }
    }
    return out;
}

/**
 * Build the modal's inner HTML. `floorThumbs[i]` is the array of per-apartment
 * thumbnail SVG strings for `card.floors[i]` (index-aligned with that floor's
 * `apartments`). Pure.
 *
 * Built on the HOUSE preview's approach: the apartment `alm-*` brand shell, a
 * per-floor strip (the house's per-storey card idiom, re-cast as a multi-family
 * per-floor card), occupancy-coloured plan thumbnails, a shared room-type colour
 * LEGEND (the house modal's founder feedback #2, reused here), a building-totals
 * header and a Build / Cancel footer.
 */
export function buildResidentialModalHtml(
    card: ResidentialCardModel,
    floorThumbs: readonly (readonly string[])[],
): string {
    const totals =
        `${card.totalApartments} apartment${card.totalApartments === 1 ? '' : 's'} across `
        + `${card.upperLevels} residential floor${card.upperLevels === 1 ? '' : 's'} · `
        + `${card.totalNetAreaM2} m² net · core ${esc(card.coreSize)}`
        + (card.totalRejected > 0 ? ` · <span class="rb-floor-reject">${card.totalRejected} over-programmed</span>` : '');
    const floorsHtml = card.floors
        .map((f, i) => buildFloorCardHtml(f, floorThumbs[i] ?? []))
        .join('');
    // Reuse the SHARED occupancy legend (house feedback #2) so the residential
    // preview reads like the house preview the founder knows. Empty when no placed
    // apartment carries occupancy-tagged rooms (then no legend row).
    const legendInner = buildOccupancyLegendHtml(collectApartmentLayouts(card));
    const legend = legendInner ? `<div class="alm-legend rb-legend" data-role="legend">${legendInner}</div>` : '';
    return `
      <div class="alm-panel" role="dialog" aria-label="Choose a residential building">
        <div class="alm-header">
          ${esc(card.title)}
          <small>${totals}</small>
        </div>
        ${legend}
        <div class="alm-grid rb-grid" data-role="rb-floors">
          ${floorsHtml}
        </div>
        <div class="alm-footer">
          <button type="button" class="alm-cancel">Cancel</button>
          <button type="button" class="alm-select rb-build" data-action="build">Build this building</button>
        </div>
      </div>`;
}

/** Scoped CSS for the residential preview tiles (the `alm-*` brand classes cover
 *  the overlay/panel/footer; these `rb-*` rules style the per-floor grid + the
 *  hatched rejection box). Injected once by the modal controller. */
export const RESIDENTIAL_MODAL_STYLES = `
.rb-grid { display: block; }
.rb-floor { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; background: #f8fafc; }
.rb-floor-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.rb-floor-label { font-weight: 650; font-size: 14px; color: #0f172a; }
.rb-floor-sub { font-size: 12px; color: #64748b; }
.rb-floor-reject { color: #b91c1c; font-weight: 600; }
.rb-core-chip { color: #6600FF; font-weight: 600; }
.rb-apts { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.rb-apts-empty, .rb-ground-shell { color: #64748b; font-size: 12px; padding: 16px; text-align: center; }
.rb-ground { border: 1px dashed #cbd5e1; border-radius: 8px; background: #ffffff; }
.rb-apt { border: 1px solid #eef2f7; border-radius: 8px; background: #ffffff; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.rb-apt--ok:hover { border-color: #6600FF; box-shadow: 0 4px 16px rgba(102,0,255,0.12); }
.rb-apt-thumb { height: 150px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.rb-apt-thumb svg { width: 100%; height: 100%; }
.rb-apt-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 11px; }
.rb-apt-type { font-weight: 700; color: #6600FF; }
.rb-apt-meta { color: #475569; flex: 1 1 auto; }
.rb-apt-score { font-weight: 700; color: #0f172a; }
.rb-apt-score small { font-size: 9px; font-weight: 500; color: #94a3b8; }
.rb-apt--rejected { border-color: #fecaca; background: #fff5f5; }
.rb-apt-hatch {
  height: 150px; border-radius: 6px;
  background-image: repeating-linear-gradient(45deg, #fca5a5 0, #fca5a5 6px, #fee2e2 6px, #fee2e2 12px);
  opacity: 0.7;
}
.rb-apt-reject { color: #b91c1c; font-size: 11px; }
/* §RESI-MODAL-LEGEND (Task 3) — the shared room-type colour legend (house parity).
   The .alm-legend-* swatch/label rules ship with the apartment modal CSS; these
   rb-scoped rules guarantee a clean inline row even if those aren't present. */
.rb-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; padding: 6px 2px 12px; }
.rb-legend .alm-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #475569; }
.rb-legend .alm-legend-swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(15,23,42,0.12); }
`;
