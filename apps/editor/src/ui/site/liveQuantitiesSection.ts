// §PL-LIVE-QUANTITIES (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — the RENDERER for STR §25.7:
// room names · room net surface · brut per level · total · an adjustable cost per m² · the
// estimate that falls out of it.
//
// ⛔ PURE STRING BUILDERS. No DOM, no store, no arithmetic of its own. Every number comes from
// `buildLiveQuantitiesModel` (which itself only projects `collectIntendedAreas`) and every cost
// sentence comes from `estimateAtIndicativeRate`. The control next door (`parcelLawQuantities.ts`)
// attaches the handlers and owns the live subscription. C06 §13.3 — one producer, many renderers.
//
// ⛔ C08 §3.1 — every interpolated runtime string routes through the local `escHtml`. Room names
// and storey names are AUTHORED BY THE USER and reach this file unescaped; a room called
// `<img onerror=…>` is the reason this rule is not optional.
//
// ⭐ THE COST BLOCK IS RENDERED ON EVERY ARM, INCLUDING THE ONES THAT REFUSE. The L-1650 root
// cause 2 lesson is that a section which disappears when it has nothing to show teaches the user
// that PRYZM has nothing to say, when in fact it has something specific to say. The `no-rate`
// arm is an INSTRUCTION ("type a rate"), not an emptiness.

import { trace } from '@opentelemetry/api';
import type { IndicativeCostOutcome, IndicativeRate } from '@pryzm/core-app-model';
import type { LiveQuantitiesModel } from './liveQuantitiesModel';

const _tracer = trace.getTracer('pryzm.site.liveQuantitiesSection');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

export const LIVE_QUANTITIES_TESTID = 'live-quantities-section';
export const LIVE_QUANTITIES_TOTAL_TESTID = 'live-quantities-total';
export const LIVE_QUANTITIES_LEVELS_TESTID = 'live-quantities-levels';
export const LIVE_QUANTITIES_UNREADABLE_TESTID = 'live-quantities-unreadable';
export const LIVE_QUANTITIES_NONE_TESTID = 'live-quantities-none-declared';
export const LIVE_QUANTITIES_RATE_INPUT_TESTID = 'live-quantities-rate-input';
export const LIVE_QUANTITIES_CURRENCY_TESTID = 'live-quantities-currency';
export const LIVE_QUANTITIES_APPLY_BTN_TESTID = 'live-quantities-apply-btn';
export const LIVE_QUANTITIES_COST_TESTID = 'live-quantities-cost';
export const LIVE_QUANTITIES_COST_AMOUNT_TESTID = 'live-quantities-cost-amount';
export const LIVE_QUANTITIES_COST_STATEMENT_TESTID = 'live-quantities-cost-statement';
export const LIVE_QUANTITIES_STATUS_TESTID = 'live-quantities-status';
/** A room row carries its own testid prefix so a spec can assert BY NAME. */
export const LIVE_QUANTITIES_ROOM_ATTR = 'data-live-quantity-room';

/**
 * The currencies offered. ⛔ NOT DERIVED FROM `navigator.language` — C38 §1.2 forbids inferring
 * a currency from locale, and a select the user can see and change is the opposite of an
 * inference. The list is short and explicit; a place PRYZM does not list is a gap that should be
 * added here rather than papered over with a free-text field nobody validates.
 */
export const INDICATIVE_CURRENCIES: readonly string[] =
    Object.freeze(['EUR', 'GBP', 'USD', 'AED', 'CHF', 'SEK', 'DKK', 'NOK', 'PLN']);

/** The visible default. Explicit, changeable, and stated in the label — never a silent guess. */
export const DEFAULT_INDICATIVE_CURRENCY = 'EUR';

const fmt2 = (n: number): string => (Math.round(n * 100) / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const fmt0 = (n: number): string => Math.round(n).toLocaleString('en-GB');

function levelLabel(name: string | null, elevation: number | null, levelId: string): string {
    // ⛔ The id is the LAST resort and is labelled as one. A storey whose name the store does not
    // carry must not silently borrow the id and look like an authored name.
    const base = name ?? `Storey ${levelId}`;
    return elevation === null ? base : `${base} · ${fmt2(elevation)} m`;
}

/**
 * The quantities half: total, then one row per storey, then the rooms under each storey by name.
 *
 * ⛔ THE ROOM SUBTOTAL IS PRINTED BESIDE THE LEVEL FIGURE AND SAYS *"listed, not added"* in the
 * markup. That wording is load-bearing: a designer reading `180 m² · of which named rooms 142 m²`
 * learns something the two numbers alone do not say, and a reader who assumes the two add would
 * be reading a floor twice (C114 §9a).
 */
function quantitiesHtml(model: LiveQuantitiesModel): string {
    if (!model.readable) {
        return `<div data-testid="${LIVE_QUANTITIES_UNREADABLE_TESTID}" style="color:#8a5a00;`
            + `background:#fff6e8;border-radius:6px;padding:6px 8px;font-size:10px;line-height:1.5;">`
            + `${escHtml(model.text)}</div>`;
    }
    if (model.levels.length === 0) {
        return `<div data-testid="${LIVE_QUANTITIES_NONE_TESTID}" style="color:#6b6580;font-size:10px;`
            + `line-height:1.5;">No level envelope has been declared on this site yet, so there is no `
            + `area to report. This is a finding about the project, not a failure to read it — draw a `
            + `level envelope (or adopt a massing proposal) and these figures appear as you edit.</div>`;
    }

    const totalText = model.totalBrutM2 === null
        ? 'not declared'
        : `${fmt2(model.totalBrutM2)} m²`;

    const total = `<div data-testid="${LIVE_QUANTITIES_TOTAL_TESTID}" style="display:flex;`
        + `justify-content:space-between;gap:8px;align-items:baseline;padding:6px 8px;border-radius:6px;`
        + `background:#faf9fd;border:1px solid #efecf7;">`
        + `<span style="font-size:10px;color:#6b6580;">Total brut, all levels</span>`
        + `<span style="font:700 13px system-ui;color:#6600FF;">${escHtml(totalText)}</span></div>`
        + `<div style="margin-top:3px;font-size:9.5px;color:#8a83a0;line-height:1.45;">`
        + `Across ${model.levels.length} level${model.levels.length === 1 ? '' : 's'}`
        + (model.roomCount > 0
            ? ` · ${model.roomCount} room envelope${model.roomCount === 1 ? '' : 's'} totalling `
              + `${escHtml(fmt2(model.totalRoomsNetM2))} m² net — <strong>listed, not added</strong>`
            : ' · no room envelopes declared')
        + `.</div>`;

    const rows = model.levels.map((l) => {
        const rooms = l.rooms.length === 0
            ? `<div style="font-size:9.5px;color:#a09aae;padding:2px 0 0 10px;">no rooms declared on this level</div>`
            : l.rooms.map((r) => `<div ${LIVE_QUANTITIES_ROOM_ATTR}="${escHtml(r.name ?? '')}" `
                + `style="display:flex;justify-content:space-between;gap:8px;padding:1px 0 1px 10px;font-size:9.5px;color:#6b6580;">`
                + `<span>${escHtml(r.name ?? 'Unnamed room')}</span>`
                + `<span style="font-variant-numeric:tabular-nums;">${escHtml(fmt2(r.netAreaM2))} m² net</span></div>`).join('');
        const subtotal = l.rooms.length === 0 ? '' :
            `<div style="padding:2px 0 0 10px;font-size:9px;color:#a09aae;">of which named rooms `
            + `${escHtml(fmt2(l.roomsNetSubtotalM2))} m² — listed, not added</div>`;
        return `<div style="padding:5px 0;border-top:1px solid #f3f1f9;">`
            + `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">`
            + `<span style="font:600 10.5px system-ui;color:#2b2740;">${escHtml(levelLabel(l.name, l.elevation, l.levelId))}</span>`
            + `<span style="font:600 11px system-ui;color:#2b2740;font-variant-numeric:tabular-nums;">`
            + `${escHtml(fmt2(l.brutAreaM2))} m² brut</span></div>${rooms}${subtotal}</div>`;
    }).join('');

    return `${total}<div data-testid="${LIVE_QUANTITIES_LEVELS_TESTID}" style="margin-top:6px;">${rows}</div>`;
}

/** The rate entry. Prefilled from `current` so a set rate never looks unset after a repaint. */
function rateEntryHtml(current: IndicativeRate | null): string {
    const valueAttr = current ? ` value="${escHtml(current.amountPerM2)}"` : '';
    const chosen = current?.currency ?? DEFAULT_INDICATIVE_CURRENCY;
    const options = INDICATIVE_CURRENCIES.map((c) =>
        `<option value="${escHtml(c)}"${c === chosen ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
    return `<div style="margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;">
        <div style="font-weight:700;font-size:10.5px;color:#6600FF;">Cost per m² — your number</div>
        <div style="margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;">PRYZM ships a published, cited rate for one place only, so outside it the honest answer is a refusal. Type what YOU assume and PRYZM will multiply it by the area above. It will be labelled as your assumption, and the currency is yours to choose — PRYZM never guesses one from your locale.</div>
        <div style="display:flex;gap:6px;margin-top:6px;align-items:flex-end;">
          <div style="flex:1;min-width:0;">
            <label style="display:block;font-size:9px;color:#8a83a0;">Cost per m²</label>
            <input data-testid="${LIVE_QUANTITIES_RATE_INPUT_TESTID}" type="number" min="0" step="1"${valueAttr} placeholder="e.g. 1800" style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;" />
          </div>
          <div style="width:74px;flex:none;">
            <label style="display:block;font-size:9px;color:#8a83a0;">Currency</label>
            <select data-testid="${LIVE_QUANTITIES_CURRENCY_TESTID}" style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;background:#fff;">${options}</select>
          </div>
        </div>
        <button type="button" data-testid="${LIVE_QUANTITIES_APPLY_BTN_TESTID}" style="margin-top:6px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#faf9fd;color:#6600FF;">
          Apply this rate
        </button>
        <div data-testid="${LIVE_QUANTITIES_STATUS_TESTID}" style="min-height:13px;margin-top:4px;font-size:9.5px;color:#8a83a0;"></div>
      </div>`;
}

/** The estimate, or the producer's own refusal sentence — never a blank and never a zero. */
function costHtml(outcome: IndicativeCostOutcome): string {
    if (!outcome.ok) {
        return `<div data-testid="${LIVE_QUANTITIES_COST_TESTID}" data-arm="${escHtml(outcome.reason)}" `
            + `style="margin-top:6px;color:#6b6580;font-size:9.5px;line-height:1.5;">`
            + `${escHtml(outcome.text)}</div>`;
    }
    const e = outcome.estimate;
    return `<div data-testid="${LIVE_QUANTITIES_COST_TESTID}" data-arm="estimate" style="margin-top:6px;">`
        + `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;padding:6px 8px;`
        + `border-radius:6px;background:#f6f2ff;border:1px solid #e4dbff;">`
        + `<span style="font-size:10px;color:#6b6580;">Indicative cost — your rate</span>`
        + `<span data-testid="${LIVE_QUANTITIES_COST_AMOUNT_TESTID}" style="font:700 13px system-ui;color:#6600FF;">`
        + `${escHtml(fmt0(e.amount))} ${escHtml(e.currency)}</span></div>`
        + `<div data-testid="${LIVE_QUANTITIES_COST_STATEMENT_TESTID}" style="margin-top:4px;font-size:9px;`
        + `color:#8a83a0;line-height:1.5;">${escHtml(e.statement)}</div></div>`;
}

/**
 * The whole §25.7 section. Pure markup.
 *
 * @param model    the live quantities (from `buildLiveQuantitiesModel`)
 * @param rate     the rate currently in force, or `null`
 * @param outcome  the estimate or refusal (from `estimateAtIndicativeRate`) — passed in rather
 *                 than computed here, so this file holds no arithmetic and cannot drift from the
 *                 estimator's own answer
 */
export function buildLiveQuantitiesSection(
    model: LiveQuantitiesModel,
    rate: IndicativeRate | null,
    outcome: IndicativeCostOutcome,
): string {
    const span = _tracer.startSpan('pryzm.site.buildLiveQuantitiesSection');
    try {
        span.setAttribute('pryzm.liveQuantities.readable', model.readable);
        span.setAttribute('pryzm.liveQuantities.costArm', outcome.ok ? 'estimate' : outcome.reason);
        return `<div data-testid="${LIVE_QUANTITIES_TESTID}" style="margin-top:10px;padding-top:8px;`
            + `border-top:1px solid #efecf7;min-width:0;max-width:100%;">`
            + `<div style="font-weight:700;font-size:11px;color:#2b2740;">Live quantities &amp; indicative cost</div>`
            + `<div style="margin-top:2px;margin-bottom:6px;font-size:9.5px;color:#8a83a0;line-height:1.45;">`
            + `These figures come from the level and room envelopes on this site and update as you edit them. `
            + `They are a STUDY at the envelope stage — nothing has been modelled yet.</div>`
            + `${quantitiesHtml(model)}${rateEntryHtml(rate)}${costHtml(outcome)}</div>`;
    } finally {
        span.end();
    }
}
