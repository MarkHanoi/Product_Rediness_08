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
import type { ApartmentProgram, PerStoreyProgramOverride, ScoringWeights, LayoutOption, LayoutRoom, RoomType } from '@pryzm/ai-host';
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
    /** §PER-STOREY-PROGRAM (founder 2026-06-18) — the per-level tab overrides, indexed
     *  by storeyIndex. An entry is present only when ≥1 of that storey's controls was
     *  taken off "auto"; an all-undefined / absent array ⇒ the whole-house auto split is
     *  used unchanged (the byte-identical default). Threaded straight into
     *  `HouseLayoutOptions.perStoreyOverrides`. */
    readonly perStoreyPrograms?: ReadonlyArray<PerStoreyProgramOverride | undefined>;
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
// §PANEL-ALLROOMS (founder 2026-06-18) — a size row for EVERY room type a house can
// contain, not just the core 6. `storeyAreaInputsHtml` renders the full set; the
// §MODAL-PER-STOREY-REAL reconcile then HIDES the rows whose room type is absent on
// that storey, so each tab shows sliders for exactly the rooms it actually has (the
// founder's Study + Entrance Hall arrows). `stair` is omitted — it is a fixed-size
// circulation element, not a free-area room the user sizes.
const AREA_FIELDS: ReadonlyArray<{ type: RoomType; label: string; max: number }> = [
    { type: 'living',   label: 'Living',   max: 60 },
    { type: 'kitchen',  label: 'Kitchen',  max: 30 },
    { type: 'dining',   label: 'Dining',   max: 28 },
    { type: 'bedroom',  label: 'Bedroom',  max: 30 },
    { type: 'master',   label: 'Master',   max: 40 },
    { type: 'bathroom', label: 'Bath',     max: 15 },
    { type: 'ensuite',  label: 'En-suite', max: 12 },
    { type: 'wc',       label: 'WC',       max: 6 },
    { type: 'study',    label: 'Study',    max: 30 },
    { type: 'utility',  label: 'Utility',  max: 12 },
    { type: 'hall',     label: 'Hall',     max: 25 },
    { type: 'corridor', label: 'Corridor', max: 22 },
];

// §REMOVE-GLOBAL-SIZE (founder 2026-06-18) — the whole-house `areaInputsHtml` builder was
// removed: the global per-room SIZE row it rendered is now fully duplicated PER STOREY by
// `storeyAreaInputsHtml` inside the per-level tabs. `AREA_FIELDS` (the row schema) is kept —
// the per-storey builder reuses it.

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

// ─────────────────────────────────────────────────────────────────────────────
// §PER-STOREY-PROGRAM (founder 2026-06-18, "a slider per level of bathrooms and
// bedroom and all the rooms / with boolean — to decide what we want in each level —
// but dynamic"). Founder chose PER-LEVEL TABS, FULL CONTROLS: one tab per storey
// (Ground / First / Second…, driven by the Floors count), each tab showing that
// storey's OWN bed + bath counts, the four room booleans, and the per-room size
// sliders. Every control DEFAULTS to "auto" (a blank number / an unchecked tri-state
// box ⇒ NO override for that field ⇒ the engine's whole-house auto-split fills it),
// so with NOTHING overridden the behaviour is byte-identical to today.
//
// The control `name`s are NAMESPACED per storey so the form reader can collect them
// by prefix into `perStoreyPrograms[storeyIndex]`:
//   s{i}.bedrooms / s{i}.bathrooms              — number inputs (blank ⇒ auto)
//   s{i}.livingRoom / s{i}.includeKitchen /
//   s{i}.openPlanKitchenDining / s{i}.masterEnSuite — TRI-STATE selects (auto/on/off)
//   s{i}.area_t_<RoomType>                       — per-room size sliders (0 ⇒ auto)
// Booleans are TRI-STATE (auto/yes/no) rather than checkboxes so "leave it to the
// engine" is distinguishable from "force it off" — the founder's "decide what we want
// in each level" needs an explicit off as well as an explicit on. Switching tabs is
// PURE UI (no regenerate); editing a control regenerates (the §MODAL-DYNAMIC debounce).
// ─────────────────────────────────────────────────────────────────────────────

/** Human storey label (Ground / First / Second / Level N). */
function storeyLabel(i: number): string {
    if (i === 0) return 'Ground';
    if (i === 1) return 'First';
    if (i === 2) return 'Second';
    return `Level ${i}`;
}

/** A tri-state boolean select (auto / yes / no) for a per-storey room boolean. The
 *  empty value is "auto" (no override → the engine's whole-house default for that
 *  storey). `cur` is the current override value (undefined ⇒ auto). */
function triStateSelect(name: string, label: string, cur: boolean | undefined): string {
    const sel = (v: '' | 'on' | 'off'): string => {
        const isAuto = cur === undefined && v === '';
        const isOn = cur === true && v === 'on';
        const isOff = cur === false && v === 'off';
        return (isAuto || isOn || isOff) ? ' selected' : '';
    };
    return (
        `<label class="hlm-storey-ctl hlm-storey-bool"><span>${escHtml(label)}</span>` +
        `<select name="${escHtml(name)}" data-storey-bool>` +
        `<option value=""${sel('')}>Auto</option>` +
        `<option value="on"${sel('on')}>Yes</option>` +
        `<option value="off"${sel('off')}>No</option>` +
        `</select></label>`
    );
}

/** Per-storey per-RoomType size sliders (same hook as the whole-house `areaInputsHtml`,
 *  but namespaced `s{i}.area_t_<type>`). 0 ⇒ auto. `areas` is the storey override's
 *  current `roomAreas`. */
function storeyAreaInputsHtml(storeyIndex: number, areas: Partial<Record<RoomType, number>> | undefined): string {
    const overrides = areas ?? {};
    return AREA_FIELDS.map(f => {
        const cur = (overrides as Record<string, number>)[f.type];
        const num = (typeof cur === 'number' && Number.isFinite(cur) && cur > 0) ? cur : 0;
        const readout = num > 0 ? `${num} m²` : 'auto';
        const nm = `s${storeyIndex}.area_t_${f.type}`;
        return (
            `<label class="alm-program-size"><span class="alm-program-size-label">${escHtml(f.label)}</span>` +
            `<input type="range" name="${escHtml(nm)}" min="0" max="${f.max}" step="0.5" value="${num}" data-area-slider>` +
            `<output class="alm-program-size-val" data-readout-for="${escHtml(nm)}">${escHtml(readout)}</output></label>`
        );
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// §FORCE-CORRIDOR-DIRECT (founder 2026-06-18, "we should have the corridor (the spine)
// and the user should be able to select which rooms in each level connect directly with
// the corridor via door — the shortest path possible") — a per-storey list of room TYPES
// each with a "↔ Corridor" checkbox. CHECKED ⇒ that room type is added to the storey's
// `corridorDirectRoomTypes` override, which the engine honours by FORCING a direct corridor
// door on the shortest-path shared wall (BEFORE the generic reconcile). UNCHECKED (default)
// ⇒ the engine decides (today's behaviour). The control `name` is namespaced
// `s{i}.corridor_<RoomType>` so the form reader collects it per storey by prefix. Mirrors
// the design-canvas convention: it is a HINT to the engine, never a hard geometry edit —
// a checked room whose corridor door would breach a rule is silently skipped by the engine
// (the door pipeline's §DIAG-CORRIDOR-FORCE permission/cap gate).
// ─────────────────────────────────────────────────────────────────────────────

/** The room TYPES a storey can request a direct corridor door for (the "↔ Corridor"
 *  toggles). Circulation types (corridor/hall/stair) are excluded — they ARE the spine
 *  or are not user-facing rooms. */
const CORRIDOR_TOGGLE_FIELDS: ReadonlyArray<{ type: RoomType; label: string }> = [
    { type: 'living',   label: 'Living' },
    { type: 'kitchen',  label: 'Kitchen' },
    { type: 'dining',   label: 'Dining' },
    { type: 'bedroom',  label: 'Bedroom' },
    { type: 'master',   label: 'Master' },
    { type: 'bathroom', label: 'Bath' },
    { type: 'ensuite',  label: 'En-suite' },
    { type: 'study',    label: 'Study' },
];

/** Per-storey "↔ Corridor" toggle row — one checkbox per room TYPE. Checked when the
 *  storey override already lists that type in `corridorDirectRoomTypes`. Namespaced
 *  `s{i}.corridor_<type>`. */
function storeyCorridorTogglesHtml(storeyIndex: number, forced: readonly RoomType[] | undefined): string {
    const set = new Set(forced ?? []);
    const items = CORRIDOR_TOGGLE_FIELDS.map(f => {
        const nm = `s${storeyIndex}.corridor_${f.type}`;
        const checked = set.has(f.type) ? ' checked' : '';
        return (
            `<label class="alm-program-chk hlm-corridor-chk">` +
            `<input type="checkbox" name="${escHtml(nm)}" data-corridor-toggle${checked}> ${escHtml(f.label)}</label>`
        );
    }).join('');
    return (
        '<div class="hlm-corridor-toggles">' +
        '<div class="hlm-corridor-label">Direct corridor door <small>— check a room to put it on the spine</small></div>' +
        `<div class="alm-program-row alm-program-checks hlm-corridor-row">${items}</div>` +
        '</div>'
    );
}

/** One storey's tab BODY — its bed/bath number inputs, the four tri-state booleans,
 *  the per-room size sliders, and the per-room "↔ Corridor" toggles. A blank number /
 *  "Auto" select / 0 slider / unchecked toggle ⇒ no override for that field. `active`
 *  toggles `hlm-storey-tab--active`. */
function storeyTabBodyHtml(storeyIndex: number, ov: PerStoreyProgramOverride | undefined, active: boolean): string {
    const o = ov ?? {};
    const numVal = (v: number | undefined): string =>
        (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? String(Math.round(v)) : '';
    return (
        `<div class="hlm-storey-tab${active ? ' hlm-storey-tab--active' : ''}" data-storey-tab="${storeyIndex}" role="tabpanel"${active ? '' : ' hidden'}>` +
        '<div class="alm-program-row">' +
        `<label class="alm-program-num"><span>Bedrooms</span>` +
        `<input type="number" name="s${storeyIndex}.bedrooms" min="0" max="8" step="1" placeholder="auto" value="${numVal(o.bedrooms)}"></label>` +
        `<label class="alm-program-num"><span>Bathrooms</span>` +
        `<input type="number" name="s${storeyIndex}.bathrooms" min="0" max="4" step="1" placeholder="auto" value="${numVal(o.bathrooms)}"></label>` +
        '</div>' +
        '<div class="alm-program-row hlm-storey-bools">' +
        triStateSelect(`s${storeyIndex}.livingRoom`, 'Living', o.livingRoom) +
        triStateSelect(`s${storeyIndex}.includeKitchen`, 'Kitchen', o.includeKitchen) +
        triStateSelect(`s${storeyIndex}.openPlanKitchenDining`, 'Kitchen+Dining', o.openPlanKitchenDining) +
        triStateSelect(`s${storeyIndex}.masterEnSuite`, 'En-suite', o.masterEnSuite) +
        '</div>' +
        '<div class="alm-program-row alm-program-areas">' +
        storeyAreaInputsHtml(storeyIndex, o.roomAreas) +
        '</div>' +
        // §FORCE-CORRIDOR-DIRECT — the per-room "↔ Corridor" toggles for this storey.
        storeyCorridorTogglesHtml(storeyIndex, o.corridorDirectRoomTypes) +
        '</div>'
    );
}

/** §PER-STOREY-PROGRAM — the full tabbed per-level block: a tab STRIP (one tab per
 *  storey, mirroring `.alm-view-toggle`) + one tab BODY per storey. Rendered only for
 *  multi-storey houses (a 1-storey house is fully described by the whole-house
 *  controls above; a single redundant tab adds noise). `storeyCount` drives how many
 *  tabs appear; `perStoreyPrograms[i]` seeds each storey's current overrides. */
export function buildPerStoreyTabsHtml(
    storeyCount: number,
    perStoreyPrograms: ReadonlyArray<PerStoreyProgramOverride | undefined> = [],
): string {
    const n = Math.max(1, Math.min(3, Math.round(storeyCount)));
    if (n <= 1) return '';
    const tabs = Array.from({ length: n }, (_, i) =>
        `<button type="button" class="alm-view-btn hlm-storey-tab-btn${i === 0 ? ' hlm-storey-tab-btn--active' : ''}" ` +
        `data-action="storey-tab" data-storey-tab-index="${i}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}">${escHtml(storeyLabel(i))}</button>`,
    ).join('');
    const bodies = Array.from({ length: n }, (_, i) =>
        storeyTabBodyHtml(i, perStoreyPrograms[i], i === 0),
    ).join('');
    return (
        '<div class="hlm-storey-tabs" data-role="per-storey">' +
        '<div class="hlm-storey-tabs-label">Per-level rooms <small>— auto = whole-house split</small></div>' +
        `<div class="alm-view-toggle hlm-storey-tabstrip" role="tablist" aria-label="Per-level program">${tabs}</div>` +
        `<div class="hlm-storey-tab-bodies">${bodies}</div>` +
        '</div>'
    );
}

export function buildHouseProgramEditFormHtml(state: HouseProgramFormState): string {
    const storeys = Math.max(1, Math.min(3, Math.round(state.storeyCount)));
    return (
        '<form class="alm-program hlm-program" autocomplete="off" data-role="program">' +
        // §REMOVE-GLOBAL-PROGRAM (founder 2026-06-18, "the preview tool panel — we don't
        // need the top part since we have it in the per-floor interface") — the GLOBAL
        // whole-house Bedrooms/Bathrooms NUMBER inputs and the four GLOBAL room booleans
        // (Living room / Kitchen / Open-plan kitchen+dining / Master en-suite) were REMOVED:
        // they are fully duplicated PER STOREY inside the per-level tabs below, which are now
        // the single source of truth. Only the FLOORS input survives at the top (it drives the
        // tab count). The whole-house `ApartmentProgram` (bedrooms/bathrooms/booleans) is now
        // DERIVED from the per-level tab overrides by `parseHouseProgramFormState`: counts =
        // SUM of the explicit per-level counts (an auto level contributes nothing to the seed —
        // the engine's `enrichStoreyProgramToPlate` fills it to the plate); each boolean = ON
        // when ANY level sets it on; and an all-auto form falls back to the same sensible
        // whole-house default the engine used before this change (so a user who never opens a
        // tab gets the byte-identical house). A 1-STOREY house renders no tabs, so it always
        // uses that implicit fallback (1 bed / 1 bath / living + kitchen on).
        '<div class="alm-program-row">' +
        `<label class="alm-program-num"><span>Floors</span>` +
        `<input type="number" name="storeys" min="1" max="3" step="1" value="${storeys}"></label>` +
        '</div>' +
        // §PER-STOREY-PROGRAM — the tabbed per-level block (one tab per storey). Only
        // rendered for multi-storey houses; each control defaults to "auto". The per-level
        // tabs are now the ONLY place bed/bath counts + the room booleans are set.
        buildPerStoreyTabsHtml(storeys, state.perStoreyPrograms ?? []) +
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
/**
 * §DOOR-RESCUE-REACH / §CIRCULATION-GRAPH PART 9 (founder, ADR-0087) — the per-floor
 * "Circulation NN%" chip rendered beside the storey score. NN% = the share of HABITABLE rooms
 * on this floor reachable through a PATH OF DOORS from the entrance; 100% = MAXIMUM circulation
 * (the generator guarantee). Brand #6600FF at 100% (solid, white text), a softer violet below;
 * NO black. A "~" prefixes an approximate (pre-deploy) value. Pure string.
 */
function houseCirculationChipHtml(pct: number, exact: boolean): string {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const full = p >= 100;
    const bg = full ? '#6600FF' : '#EDE7FF';
    const fg = full ? '#ffffff' : '#5B21B6';
    const border = full ? '#6600FF' : '#C9B8FF';
    const approx = exact ? '' : '~';
    const title = full
        ? 'Circulation 100% — every habitable room on this floor is reachable through doors from the entrance (maximum circulation)'
        : `Circulation ${approx}${p}% — some habitable rooms on this floor are not yet reachable through a path of doors from the entrance`;
    return (
        `<span class="hlm-storey-circulation" title="${escHtml(title)}" ` +
        `style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:999px;` +
        `font-size:10px;font-weight:600;line-height:1.4;margin-left:6px;` +
        `background:${bg};color:${fg};border:1px solid ${border};">` +
        `Circulation ${approx}${p}%</span>`
    );
}

function storeyHtml(
    label: string, safeThumb: string, safeGraph: string, roomSummary: string,
    areaM2: number, score: number, cardIndex: number, storeyKey: number,
    circulationPct: number, circulationExact: boolean,
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
        `<span class="hlm-storey-stats">${areaM2} m² · score ${score}` +
        houseCirculationChipHtml(circulationPct, circulationExact) +
        `</span>` +
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
        .map((s, i) => storeyHtml(s.label, storeyThumbs[i] ?? '', storeyGraphs[i] ?? '', s.roomSummary, s.totalAreaM2, s.score, card.index, i, s.circulationPct, s.circulationExact))
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
        `<div class="hlm-pane-storey-stats">${s.totalAreaM2} m² · score ${s.score}` +
        houseCirculationChipHtml(s.circulationPct, s.circulationExact) +
        `</div>` +
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
 *  (IT-2). Empty when there is no best option. `noticeHtml` (A.21.D5 follow-up) is the
 *  pre-built reduced-programme notice (`buildReducedProgramNoticeHtml`) injected just
 *  ABOVE the score so the user sees WHY fewer rooms were built; '' ⇒ no notice. Pure. */
export function buildHouseResultHtml(best: HouseCardModel | undefined, noticeHtml = ''): string {
    if (!best) return '<div class="hlm-tools-result" data-role="result"></div>';
    const roofLabel = best.roofKind.charAt(0).toUpperCase() + best.roofKind.slice(1);
    const stairText = best.stairCount > 0
        ? `${best.stairCount} stair${best.stairCount === 1 ? '' : 's'}`
        : 'single storey';
    return (
        `<div class="hlm-tools-result" data-role="result">` +
        noticeHtml +
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
    // A.21.D5 follow-up — the pre-built reduced-programme notice HTML (or '' for
    // none). Rendered in the RIGHT-rail result block just above the score. Pure
    // pass-through so the controller owns the requested-vs-built shortfall logic.
    noticeHtml = '',
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
        buildHouseResultHtml(best, noticeHtml) +
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

/** Public circulation spaces a STAIR may legitimately open onto. A stair is
 *  "on circulation" only if it has a DOOR onto one of these — "connects floors"
 *  is the stair's dependency, NOT proof it is reachable (founder: a stair not
 *  reached from a public space is red/non-compliant). Mirrors `STAIR_ACCESS`
 *  in `layoutBubbleGraph.ts` so the inspector panel and the red-node flag agree. */
const STAIR_ACCESS_TYPES: ReadonlySet<string> = new Set([
    'corridor', 'hall', 'living', 'dining', 'kitchen',
]);

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

/** §CIRC-REACH — names of the rooms REACHABLE from the storey entrance over the
 *  DOOR graph (BFS). The entrance is the hall (ground) or, on a floor with no hall,
 *  the stair (you arrive from below). Returns `null` when there is no full door graph
 *  (pre-deploy build) or no entrance root — callers then skip the isolation check so
 *  nothing false-positives. Circulation is a GLOBAL property: a corridor/stair that
 *  cannot be reached from the front door is isolated, not a real spine (founder). */
function computeEntranceReach(storeyRooms: readonly LayoutRoom[]): Set<string> | null {
    if (storeyRooms.length === 0) return null;
    if (!storeyRooms.every(r => Array.isArray(r.doorAdjacentTo))) return null;
    const idxByName = new Map(storeyRooms.map((r, i) => [r.name, i] as const));
    const adj: number[][] = storeyRooms.map(() => []);
    storeyRooms.forEach((r, i) => {
        // §GR-10 (C75 §1.4) — no `?? []` here: the every()-guard above has
        // already REFUSED (returned null — reach undetermined) when any room's
        // door graph is unrecorded, so by this line every list is a present
        // array. A default would silently reintroduce the unknown→empty
        // collapse if the guard were ever weakened; the non-null assertion
        // makes that weakening a visible decision instead.
        for (const n of r.doorAdjacentTo!) {
            const j = idxByName.get(n);
            if (j != null && j !== i) { adj[i]!.push(j); adj[j]!.push(i); }
        }
    });
    let root = storeyRooms.findIndex(r => String(r.type ?? '').toLowerCase() === 'hall');
    if (root < 0) root = storeyRooms.findIndex(r => String(r.type ?? '').toLowerCase() === 'stair');
    if (root < 0) return null;
    const seen = new Set<number>([root]);
    const queue = [root];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj[cur] ?? []) if (!seen.has(nb)) { seen.add(nb); queue.push(nb); }
    }
    return new Set([...seen].map(i => storeyRooms[i]!.name));
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

    // CIRCULATION — a room's circulation status.
    //   A corridor/hall IS the spine; a stair IS vertical circulation. Such a room is
    //   intrinsically on-circulation regardless of who it abuts (founder: "the corridor
    //   is not on circulation — that should never be the case"). For everyone else, look
    //   for an adjacent corridor/hall to route through.
    const selfType = String(room.type ?? '');
    const selfIsSpine = CIRCULATION_TYPES.has(selfType);
    // §DOOR-GRAPH — circulation follows the DOOR graph (real access), not wall-adjacency:
    // a room is only "on circulation" if it has an actual DOOR onto a corridor/hall
    // (founder: "just because it's adjacent … there needs to be a door, otherwise it's not
    // compliant"). Fall back to wall-adjacency only when the engine build predates
    // `doorAdjacentTo` (older results), so nothing regresses pre-deploy.
    const doorAdj = Array.isArray(room.doorAdjacentTo)
        ? room.doorAdjacentTo.filter((n): n is string => typeof n === 'string' && n.length > 0 && n !== room.name)
        : adjacent;
    const circVia = doorAdj.find(n => CIRCULATION_TYPES.has(typeByName.get(n) ?? ''));
    // §CIRC-REACH — is this room reachable from the storey entrance over the door graph?
    // An isolated corridor/stair island is NOT a real spine (founder: "the corridor is the
    // spine but it's isolated — it needs to connect to the entrance hall, else how do you
    // access it?"). `null` reach = pre-deploy/no-root → skip (no false-positives). The
    // entrance root (hall on ground, stair on upper) is itself always reachable, so an
    // upper-floor stair-as-root is never "isolated" — it falls to its public-door check.
    const reachNames = computeEntranceReach(storeyRooms);
    const isIsolated = reachNames != null && !reachNames.has(room.name);
    let circulationHtml: string;
    if (selfType === 'hall') {
        // The entrance hall IS the root of circulation — always on-circulation.
        circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--on">On circulation ✓ <small>(entry hall)</small></span>`;
    } else if (isIsolated) {
        // Cut off from the entrance — supersedes "I am a corridor, so I'm the spine ✓".
        circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--off">Not on circulation ✗ <small>(isolated from the entrance)</small></span>`;
    } else if (selfIsSpine) {
        circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--on">On circulation ✓ <small>(the spine)</small></span>`;
    } else if (selfType === 'stair') {
        // §STAIR-PUBLIC-FLOW — a stair is on-circulation ONLY if it has a DOOR onto a
        // public circulation space (corridor/hall/living/dining/kitchen). "Connects
        // floors" is a dependency, not reachability — a stair with no public door is
        // non-compliant (red), and the panel must say so + WHERE a door is needed.
        const stairVia = doorAdj.find(n => STAIR_ACCESS_TYPES.has(typeByName.get(n) ?? ''));
        if (stairVia) {
            circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--on">On circulation ✓ <small>(door to ${escHtml(stairVia)})</small></span>`;
        } else {
            // Surface the public spaces the stair COULD open onto (its wall neighbours
            // of an access type) so the panel explains why it's red and where to fix it.
            const candidates = adjacent.filter(n => STAIR_ACCESS_TYPES.has(typeByName.get(n) ?? ''));
            const hint = candidates.length > 0
                ? `needs a door to ${escHtml(candidates.slice(0, 3).join(', '))}`
                : 'needs a door to a public space (corridor / living / dining / kitchen)';
            circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--off">Not on circulation ✗ <small>(${hint})</small></span>`;
        }
    } else if (circVia) {
        circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--on">On circulation ✓ <small>(door to ${escHtml(circVia)})</small></span>`;
    } else if (doorAdj.length > 0) {
        circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--off">Not on circulation ✗ <small>(door only into ${escHtml(doorAdj[0]!)})</small></span>`;
    } else {
        circulationHtml = `<span class="hlm-insp-circ hlm-insp-circ--off">Not on circulation ✗ <small>(no door — sealed)</small></span>`;
    }

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
