// Residential building (multi-family) — pure modal HTML builder (P3.3).
//
// Turns a `ResidentialCardModel` (+ pre-rendered per-TYPE plan thumbnails) into the
// modal's inner HTML STRING. PURE: no DOM, no THREE — the SVG thumbnails are passed in
// as strings (rendered by `buildLayoutThumbnailSvg` in the modal controller, which is
// the one place allowed to touch the DOM-free SVG builder). Reuses the apartment
// modal's `alm-*` brand classes (white + #6600FF).
//
// §RESI-PREVIEW-DEDUPE-TYPES (founder 2026-06-24: "show only a plan view for each
// DIFFERENT apartment type — no need to show the same many times"). A typical building
// is the SAME T2 plan repeated 4×/floor × N floors = 20 identical drawings. Instead we
// collapse the placed apartments by a LAYOUT SIGNATURE (typology + room programme + the
// actual room arrangement) and render ONE card per DISTINCT unit type — its plan once,
// programme, area, score, and a COUNT ("×20 across 5 floors"). Genuinely-different
// layouts within a typology still each get their own card. Rejected (over-programmed)
// types are collapsed the same way into a single calm "doesn't fit" card.
//
// Card layout:
//   • Building totals header (apartments · m² · floors · core).
//   • A "Apartment types" GALLERY — one card per distinct unit type, with a count.
//   • A compact per-floor distribution context (which floors carry apartments).

import type { ResidentialCardModel, FloorCardSummary, ApartmentCardSummary } from './residentialCardModel.js';
import { buildOccupancyLegendHtml } from '../apartment-layout/layoutModalHtml.js';
import { buildResidentialPartialNoticeHtml } from './residentialError.js';
import type { LayoutOption } from '@pryzm/ai-host';

/** Minimal HTML-escape for any interpolated text. */
function esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** A distinct apartment TYPE (one or more identical-layout instances collapsed). */
export interface ApartmentTypeGroup {
    /** Stable signature key (typology + room arrangement + area). */
    readonly key: string;
    readonly typology: string;
    readonly status: 'ok' | 'rejected';
    /** A representative apartment card summary (its plan is the group's plan). */
    readonly rep: ApartmentCardSummary;
    /** How many apartments of this exact type exist across the whole building. */
    readonly count: number;
    /** Distinct floor labels that carry ≥1 instance of this type (in floor order). */
    readonly floorLabels: readonly string[];
}

/** A stable layout signature for a placed apartment: typology + room programme +
 *  the actual room arrangement (room type + rounded area, in order) + window count +
 *  rounded apartment area. Two apartments with the SAME signature render the SAME
 *  plan, so they collapse into one gallery card. Rejected apartments collapse by
 *  typology + reason (they have no plan). Pure + deterministic. */
function apartmentSignature(a: ApartmentCardSummary): string {
    if (a.status === 'rejected') return `R|${a.typology}|${a.rejectReason ?? 'nofit'}`;
    const layout = a.apt.layout;
    const rooms = (layout?.rooms ?? [])
        .map(r => `${(r.type || '').toLowerCase()}:${Math.round((r.area ?? 0))}`)
        .join(',');
    const windows = layout?.windows?.length ?? 0;
    return `K|${a.typology}|${Math.round(a.targetAreaM2)}|${a.roomCount}|${windows}|${rooms}`;
}

/**
 * Collapse every apartment in the building into DISTINCT type groups, preserving first-
 * seen order (floor-major, then position) so the gallery is deterministic. Each group
 * keeps a representative summary (for the plan) + a count + the set of floors it appears
 * on. Pure.
 */
export function groupApartmentTypes(card: ResidentialCardModel): ApartmentTypeGroup[] {
    const order: string[] = [];
    const byKey = new Map<string, { rep: ApartmentCardSummary; count: number; floors: string[] }>();
    for (const floor of card.floors) {
        for (const a of floor.apartments) {
            const key = apartmentSignature(a);
            let g = byKey.get(key);
            if (!g) {
                g = { rep: a, count: 0, floors: [] };
                byKey.set(key, g);
                order.push(key);
            }
            g.count++;
            if (!g.floors.includes(floor.label)) g.floors.push(floor.label);
        }
    }
    return order.map((key) => {
        const g = byKey.get(key)!;
        return {
            key,
            typology: g.rep.typology,
            status: g.rep.status,
            rep: g.rep,
            count: g.count,
            floorLabels: g.floors,
        };
    });
}

/** A short "×N across M floors" count chip for a type group. */
function countChip(g: ApartmentTypeGroup): string {
    const unitWord = g.count === 1 ? 'unit' : 'units';
    const fc = g.floorLabels.length;
    const span = fc > 1 ? ` across ${fc} floors` : '';
    return `<span class="rb-type-count">×${g.count} ${unitWord}${span}</span>`;
}

/** One DISTINCT-type gallery card: a representative plan + programme + area + score +
 *  a count of how many of this exact type the building has. Rejected types render a
 *  calm hatched "doesn't fit" card (still deduped to one). */
function buildTypeCardHtml(g: ApartmentTypeGroup, thumbSvg: string): string {
    const a = g.rep;
    if (a.status === 'rejected') {
        return `
          <div class="rb-apt rb-apt--rejected" title="${esc(a.rejectReason ?? 'no layout')}">
            <div class="rb-apt-hatch" aria-hidden="true"></div>
            <div class="rb-apt-foot">
              <span class="rb-apt-type">${esc(a.typology)}</span>
              <span class="rb-apt-reject">doesn't fit at this size</span>
              ${countChip(g)}
            </div>
          </div>`;
    }
    return `
      <div class="rb-apt rb-apt--ok">
        <div class="rb-apt-thumb">${thumbSvg}</div>
        <div class="rb-apt-head">
          <span class="rb-apt-type">${esc(a.typology)}</span>
          ${countChip(g)}
          <span class="rb-apt-score">${a.score}<small>/100</small></span>
        </div>
        <div class="rb-apt-foot">
          <span class="rb-apt-meta">${esc(a.roomSummary)} · ${a.targetAreaM2} m²</span>
        </div>
      </div>`;
}

/** One compact floor-distribution row — the per-floor STRUCTURE context (kept, but
 *  no longer repeating the same plan per floor). Ground = core + shell; upper = a
 *  one-line count. Pure. */
function buildFloorRowHtml(floor: FloorCardSummary): string {
    if (floor.role === 'ground') {
        const shell = floor.commercialGroundFloor ? 'Commercial shell' : 'Lobby';
        return `
          <li class="rb-floor-row rb-floor-row--ground">
            <span class="rb-floor-row-label">${esc(floor.label)}</span>
            <span class="rb-floor-row-meta">${esc(shell)} around the central core · no apartments</span>
          </li>`;
    }
    const counts = `${floor.placedCount} apartment${floor.placedCount === 1 ? '' : 's'}`
        + (floor.rejectedCount > 0 ? ` · <span class="rb-floor-reject">${floor.rejectedCount} didn't fit</span>` : '');
    return `
      <li class="rb-floor-row">
        <span class="rb-floor-row-label">${esc(floor.label)}</span>
        <span class="rb-floor-row-meta">public corridor · ${counts}</span>
      </li>`;
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
 * Build the modal's inner HTML. `typeThumbs[i]` is the thumbnail SVG for the i-th
 * DISTINCT apartment-type group from `groupApartmentTypes(card)` (index-aligned).
 * Pure.
 *
 * §RESI-PREVIEW-DEDUPE-TYPES — the body is an "Apartment types" GALLERY: one card per
 * distinct unit (plan + programme + area + score + a count), NOT one card per instance.
 * The per-floor structure is preserved as a compact distribution list below the gallery,
 * plus the building-totals header, the shared room-type colour legend, and the footer.
 */
export function buildResidentialModalHtml(
    card: ResidentialCardModel,
    typeThumbs: readonly string[],
): string {
    const groups = groupApartmentTypes(card);
    const okGroups = groups.filter(g => g.status === 'ok');
    const distinctOk = okGroups.length;
    const totals =
        `${card.totalApartments} apartment${card.totalApartments === 1 ? '' : 's'} across `
        + `${card.upperLevels} residential floor${card.upperLevels === 1 ? '' : 's'} · `
        + `${card.totalNetAreaM2} m² net · core ${esc(card.coreSize)}`
        + (card.totalRejected > 0 ? ` · <span class="rb-floor-reject">${card.totalRejected} over-programmed</span>` : '');
    // The "Apartment types" gallery — one card per distinct type (deduped), index-aligned
    // with `typeThumbs`.
    const galleryHtml = groups.length > 0
        ? groups.map((g, i) => buildTypeCardHtml(g, typeThumbs[i] ?? '')).join('')
        : '<div class="rb-apts-empty">No apartments placed.</div>';
    const galleryHead = distinctOk > 0
        ? `${distinctOk} apartment type${distinctOk === 1 ? '' : 's'}`
        : 'Apartment types';
    // Compact per-floor distribution context (no repeated plans).
    const floorRows = card.floors.map(buildFloorRowHtml).join('');
    // Reuse the SHARED occupancy legend (house feedback #2) so the residential
    // preview reads like the house preview the founder knows. Empty when no placed
    // apartment carries occupancy-tagged rooms (then no legend row).
    const legendInner = buildOccupancyLegendHtml(collectApartmentLayouts(card));
    const legend = legendInner ? `<div class="alm-legend rb-legend" data-role="legend">${legendInner}</div>` : '';
    // PARTIAL success — building generated but some apartments were rejected
    // (over-programmed). Non-blocking informative banner (purple, NOT error red);
    // the preview/Build remain. Empty when nothing was rejected.
    const partialInner = buildResidentialPartialNoticeHtml(card.totalRejected, card.totalApartments + card.totalRejected);
    const partial = partialInner ? `<div class="alm-notice-region rb-partial-region" data-role="rb-partial">${partialInner}</div>` : '';
    return `
      <div class="alm-panel" role="dialog" aria-label="Choose a residential building">
        <div class="alm-header">
          ${esc(card.title)}
          <small>${totals}</small>
        </div>
        ${legend}
        ${partial}
        <div class="alm-grid rb-grid" data-role="rb-floors">
          <section class="rb-section rb-types-section">
            <header class="rb-section-head">
              <span class="rb-section-title">${galleryHead}</span>
              <span class="rb-section-sub">one plan per distinct unit</span>
            </header>
            <div class="rb-apts rb-types">${galleryHtml}</div>
          </section>
          <section class="rb-section rb-floors-section">
            <header class="rb-section-head">
              <span class="rb-section-title">Floor distribution</span>
              <span class="rb-section-sub"><span class="rb-core-chip" title="Central core: stair + lift">◉ Core (stair + lift)</span></span>
            </header>
            <ul class="rb-floor-list">${floorRows}</ul>
          </section>
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
/* §RESI-PREVIEW-PRODUCTION (2026-06-24) — brand-consistent (white + #6600FF, NO black):
   inks are deep indigo (#2a1a52 / #6b5f8c) not slate-black; the rejected state is a calm
   purple "no layout yet" not alarming red; cards have soft purple-tinted chrome. */
export const RESIDENTIAL_MODAL_STYLES = `
.rb-grid { display: block; }
/* §RESI-PREVIEW-DEDUPE-TYPES — sectioned body: an "Apartment types" gallery (one card
   per distinct unit) + a compact floor-distribution list. */
.rb-section {
  border: 1px solid rgba(102,0,255,0.14); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
}
.rb-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(102,0,255,0.10); }
.rb-section-title { font-weight: 700; font-size: 14px; color: #2a1a52; letter-spacing: 0.01em; }
.rb-section-sub { font-size: 12px; color: #6b5f8c; }
.rb-floor-reject { color: #7a5af0; font-weight: 600; }
.rb-core-chip { color: #6600FF; font-weight: 600; }
.rb-apts, .rb-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(208px, 1fr)); gap: 12px; }
.rb-apts-empty { color: #6b5f8c; font-size: 12px; padding: 18px; text-align: center; }
.rb-apt {
  border: 1px solid rgba(102,0,255,0.10); border-radius: 10px; background: #ffffff;
  padding: 9px; display: flex; flex-direction: column; gap: 7px;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.rb-apt--ok:hover { border-color: #6600FF; box-shadow: 0 6px 20px rgba(102,0,255,0.14); transform: translateY(-1px); }
.rb-apt-thumb { height: 150px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 7px; background: #ffffff; }
.rb-apt-thumb svg { width: 100%; height: 100%; }
.rb-apt-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 12px; }
.rb-apt-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 11px; }
.rb-apt-type { font-weight: 700; color: #6600FF; }
.rb-type-count {
  font-size: 10px; font-weight: 700; color: #6600FF;
  background: rgba(102,0,255,0.09); border-radius: 999px; padding: 1px 7px;
  flex: 1 1 auto;
}
.rb-apt-meta { color: #6b5f8c; flex: 1 1 auto; }
.rb-apt-score { font-weight: 700; color: #2a1a52; }
.rb-apt-score small { font-size: 9px; font-weight: 500; color: #9b8cc4; }
.rb-apt--rejected { border-color: rgba(102,0,255,0.14); background: #faf8ff; }
.rb-apt-hatch {
  height: 150px; border-radius: 7px;
  background-image: repeating-linear-gradient(45deg, rgba(102,0,255,0.16) 0, rgba(102,0,255,0.16) 5px, rgba(102,0,255,0.05) 5px, rgba(102,0,255,0.05) 11px);
}
.rb-apt-reject { color: #7a5af0; font-size: 11px; }
/* Floor-distribution list — compact rows, no repeated plans. */
.rb-floor-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rb-floor-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  font-size: 12px; padding: 6px 10px; border-radius: 8px;
  background: rgba(102,0,255,0.04); border: 1px solid rgba(102,0,255,0.08);
}
.rb-floor-row--ground { background: rgba(102,0,255,0.02); }
.rb-floor-row-label { font-weight: 700; color: #2a1a52; }
.rb-floor-row-meta { color: #6b5f8c; text-align: right; }
/* §RESI-MODAL-LEGEND (Task 3) — the shared room-type colour legend (house parity).
   The .alm-legend-* swatch/label rules ship with the apartment modal CSS; these
   rb-scoped rules guarantee a clean inline row even if those aren't present. */
.rb-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; padding: 6px 2px 12px; }
.rb-legend .alm-legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #6b5f8c; }
.rb-legend .alm-legend-swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(102,0,255,0.18); }
/* Partial-success banner region inside the preview (informative, non-blocking). */
.rb-partial-region:not(:empty) { padding: 0 20px; }
.rb-partial-region .rb-partial-notice { margin: 12px 0 0; }
/* Error / rejection modal — the .alm-panel chrome is full-viewport (90vh) for the
   thumbnail grid; an error has only a short message, so the error panel sizes to
   its content (compact, centred) while keeping the brand white + #6600FF shell. */
.rb-error-panel { width: min(560px, 92vw); height: auto; max-height: 90vh; }
.rb-error-region { padding: 16px 20px; }
.rb-error-region .rb-error-notice { margin: 0; }
`;
