// §RESI-ORCH-COST (lane RESI-ORCHESTRATOR, 2026-09-03) — AN INDICATIVE COST AT
// THE ENVELOPE STAGE.
//
// ⭐ WHAT THIS CLOSES, AND WHY IT IS A WIRING JOB RATHER THAN A FEATURE.
// PRYZM already ships a real, cited, regional building-cost module
// (`ES_BARCELONA_ICIO_2026` — ten published groups, a basic module of 866,04
// €/m², published correction factors, a full `notCovered` list and a complete
// `RatePriceProvenance`) and a resolver that walks jurisdiction → region →
// country and REFUSES rather than substituting a neighbour's number. Both are
// exercised by exactly one caller: the 5D tab in the Data Workbench, whose area
// comes from `measuredBuiltArea(takeoff)`.
//
// That means the €/m² module is reachable ONLY ONCE SLABS HAVE BEEN MODELLED —
// which is precisely the stage at which an *indicative order of magnitude* has
// stopped being the question. The founder's spec puts cost at the ENVELOPE stage
// (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §15: *"approximate cost-per-m² … estimated
// GFA 220 m² × €X/m² … label clearly as an ESTIMATE, not a quotation"*). The two
// halves have simply never met. This module is the join.
//
// ⛔ THE HONESTY RULES THIS SECTION ENCODES — every one of them is inherited from
// a defect this repo has already paid for, not invented here:
//
//   1. **THE AREA IS A STUDY, AND IT SAYS SO IN THE ESTIMATOR'S OWN SENTENCE.**
//      `estimateBuildingCost` builds the statement that must travel with every
//      figure, out of the area's `basis` and `caveat`. So the envelope GFA enters
//      through `MeasuredBuiltArea` as the NAMED fourth proxy `'envelope-study-gfa'`
//      rather than through a second estimator — one producer of the number AND of
//      its provenance. A rival estimator here would drift from the 5D one, and
//      the two would state different costs for one building.
//
//   2. **NO GFA ⇒ NO FIGURE, AND THE SECTION SAYS WHY.** The card's GFA is
//      `footprint × storeys` and is deliberately `null` whenever the rule pack did
//      not derive a storey count (§ENVELOPE-SITE-DATA: *"an invented storey count
//      would look identical to a derived one"*). A cost built on an invented
//      storey count would inherit that invention and turn it into money. So the
//      no-GFA arm renders as words, never as a zero and never as a blank.
//
//   3. **NO TYPOLOGY ⇒ NO FIGURE.** Barcelona's own table spans a factor of nine.
//      `estimateBuildingCost` returns `null` — never a partial figure — without a
//      group, and this section asks rather than guessing. Same store as the 5D tab
//      (`buildingTypologyChoice.ts`), so the two surfaces cannot disagree.
//
//   4. **NO MODULE ⇒ THE RESOLVER'S OWN SENTENCE.** `resolveBuildingCostModels`
//      already distinguishes "no parcel pinned" from "two jurisdictions tie" from
//      "nothing covers here", and writes a different sentence for each. This
//      section prints that sentence verbatim instead of collapsing three facts
//      into one empty state (§CONTEXT-DATA-HONESTY).
//
//   5. **THE FOLD IS NEVER SILENTLY ABSENT** for a state that has something to
//      say — the L-1650 root cause 2 lesson — and its `<summary>` carries the
//      FACT, so a user who never unfolds cannot mistake a refusal for a figure.
//
//   6. **IT IS AN ESTIMATE OF A STUDY, NOT A COST OF A DESIGN.** At this stage
//      nothing has been drawn. The figure answers *"what would building out the
//      permitted envelope cost, at the published regional rate?"* and the copy
//      says exactly that. It is not a quotation, not a price, and not a permitted
//      cost.
//
// PURE STRING BUILDERS — no DOM, no store, no arithmetic of its own beyond the
// study-area construction. Every number and every sentence comes from the L2
// engine (`@pryzm/core-app-model`). `GISAreaLayout` stays the ONE producer of the
// card (C06 §13.3) and attaches the handlers. P4 — no globals. P6 — renders only.
// P8 — the exported functions open OTel spans. C08 §3.1 — every interpolated
// runtime string routes through the local `escHtml`.

import { trace } from '@opentelemetry/api';
import type {
    BuildingCostEstimate,
    MeasuredBuiltArea,
    RegionalBuildingCostModel,
    ResolvedBuildingCostModels,
} from '@pryzm/core-app-model';
import type { BuildingChoice } from '../dataworkbench/buckets/buildingTypologyChoice';

const _tracer = trace.getTracer('pryzm.site.envelopeCostSection');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

export const ENVELOPE_COST_SECTION_TESTID = 'envelope-section-indicative-cost';
export const ENVELOPE_COST_GROUP_SELECT_TESTID = 'envelope-cost-group-select';
export const ENVELOPE_COST_CORRECTION_SELECT_TESTID = 'envelope-cost-correction-select';
export const ENVELOPE_COST_AMOUNT_TESTID = 'envelope-cost-amount';

/**
 * The caveat that MUST travel with an envelope-derived area. It is deliberately
 * blunt about the two separate distances between this number and the quantity a
 * cost module asks for: it is a STUDY of an unbuilt plot, and even as a study it
 * is not the ordinance's own `superfície construïda`.
 *
 * ⚠ Exported so the spec can assert the figure is never rendered without it.
 */
export const ENVELOPE_STUDY_AREA_CAVEAT =
    'it is a STUDY of what the ordinance would permit if this plot were built out in full — '
    + 'nothing has been drawn and nothing has been measured. It is not the ordinance’s own '
    + 'superfície construïda (measured to the outside of the envelope), and a real design '
    + 'almost never fills its envelope, so the true built area is normally SMALLER than this.';

/**
 * Build the `MeasuredBuiltArea` the estimator multiplies, from the card's own
 * permitted-GFA figure.
 *
 * ⛔ Returns `null` for a null or non-positive GFA, and null is the correct
 * answer: the card's GFA is already `null` whenever the storey count was not
 * derived, and manufacturing an area here would re-introduce exactly the
 * invention that `null` exists to prevent.
 *
 * @param gfaM2      the card's `footprint × storeys` figure, or `null`
 * @param storeys    the DERIVED storey count the GFA was built from — printed in
 *                   the basis so the reader can check the multiplication
 * @param footprintM2 the inset footprint the GFA was built from
 */
export function envelopeStudyBuiltArea(
    gfaM2: number | null | undefined,
    storeys: number | null | undefined,
    footprintM2: number | null | undefined,
): MeasuredBuiltArea | null {
    const span = _tracer.startSpan('pryzm.site.envelopeStudyBuiltArea');
    try {
        if (typeof gfaM2 !== 'number' || !Number.isFinite(gfaM2) || gfaM2 <= 0) {
            span.setAttribute('pryzm.envelopeCost.area', 'absent');
            return null;
        }
        const basis =
            typeof storeys === 'number' && storeys > 0
                && typeof footprintM2 === 'number' && footprintM2 > 0
                ? `buildable-envelope study GFA — ${Math.round(footprintM2)} m² inset footprint `
                  + `× ${storeys} derived storey${storeys === 1 ? '' : 's'}`
                : 'buildable-envelope study GFA';
        span.setAttribute('pryzm.envelopeCost.area', 'study-gfa');
        span.setAttribute('pryzm.envelopeCost.areaM2', gfaM2);
        return {
            areaM2: Math.round(gfaM2 * 100) / 100,
            proxy: 'envelope-study-gfa',
            basis,
            // No take-off line contributed — and saying so is the point. An empty
            // list here is a FACT (nothing was measured), not a missing read.
            lineCodes: [],
            caveat: ENVELOPE_STUDY_AREA_CAVEAT,
        };
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// The fold
// ─────────────────────────────────────────────────────────────────────────────

const AMBER = '#8A6100';

const FOLD_STYLE =
    'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;'
    + 'min-width:0;max-width:100%;overflow-wrap:break-word;';
const FOLD_SUMMARY_STYLE =
    'cursor:pointer;font-weight:700;font-size:10.5px;color:#6600FF;list-style:none;';

function fold(state: string, safeSummary: string, safeBody: string): string {
    return `<details data-testid="${ENVELOPE_COST_SECTION_TESTID}" data-state="${escHtml(state)}" style="${FOLD_STYLE}">`
        + `<summary style="${FOLD_SUMMARY_STYLE}">${safeSummary}</summary>`
        + `<div style="font-size:11px;margin-top:4px;min-width:0;max-width:100%;">${safeBody}</div>`
        + `</details>`;
}

const NUM2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** The typology + correction selects. Author-written markup; every interpolated
 *  runtime string escaped where it is built. */
function selectsHtml(model: RegionalBuildingCostModel, choice: BuildingChoice): string {
    const groups = model.groups.map((g) => (
        `<option value="${escHtml(g.groupId)}"${choice.groupId === g.groupId ? ' selected' : ''}>`
        + `${escHtml(g.groupId)} — ${escHtml(g.label)} · ${escHtml(NUM2.format(g.ratePerAreaM2))} `
        + `${escHtml(model.currency)}/m²</option>`
    )).join('');
    const corrections = model.corrections.map((c) => (
        `<option value="${escHtml(c.correctionId)}"${choice.correctionId === c.correctionId ? ' selected' : ''}>`
        + `${escHtml(c.label)} (× ${escHtml(String(c.factor))})</option>`
    )).join('');
    return `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
        <label style="font-size:9px;color:#8a83a0;display:flex;flex-direction:column;gap:3px;">
          Building type (published module)
          <select data-testid="${ENVELOPE_COST_GROUP_SELECT_TESTID}" aria-label="Building type for the indicative cost"
                  style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;background:#fff;">
            <option value=""${choice.groupId ? '' : ' selected'}>— not chosen —</option>
            ${groups}
          </select>
        </label>
        <label style="font-size:9px;color:#8a83a0;display:flex;flex-direction:column;gap:3px;">
          Correction factor (published)
          <select data-testid="${ENVELOPE_COST_CORRECTION_SELECT_TESTID}" aria-label="Published correction factor"
                  style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;background:#fff;">
            <option value=""${choice.correctionId ? '' : ' selected'}>New build — no correction</option>
            ${corrections}
          </select>
        </label>
      </div>`;
}

function provenanceHtml(model: RegionalBuildingCostModel): string {
    const p = model.provenance;
    return `<div style="margin-top:8px;padding-top:7px;border-top:1px solid #efecf7;font-size:9.5px;line-height:1.6;color:#8a83a0;white-space:normal;overflow-wrap:break-word;">
        <b>Source.</b> ${escHtml(p.database)} — ${escHtml(p.publisher)}, ${escHtml(p.edition)}. Prices at ${escHtml(p.priceDate)}${p.itemCode ? ` · ${escHtml(p.itemCode)}` : ''}.
        <br><b>Licence.</b> ${escHtml(String(p.licence).replace(/_/g, ' '))}${p.licenceNote ? ` — ${escHtml(p.licenceNote)}` : ''}
        <br><b>Verify at.</b> ${escHtml(p.sourceToChase)}
      </div>
      <details style="margin-top:7px;">
        <summary style="font-size:9.5px;font-weight:700;color:${AMBER};cursor:pointer;">What this €/m² does NOT include (${model.notCovered.length})</summary>
        <ul style="margin:5px 0 0;padding-left:15px;font-size:9.5px;line-height:1.6;color:#8a83a0;white-space:normal;overflow-wrap:break-word;">
          ${model.notCovered.map((n) => `<li>${escHtml(n)}</li>`).join('')}
        </ul>
      </details>`;
}

/**
 * The indicative-cost fold, in one of five arms. Each arm carries a distinct
 * `data-state`, and each says in words what it cannot show — an empty section
 * and a refused section are different facts and must never render alike.
 *
 *  · `no-module`   — no published cost module resolves for this location. Prints
 *                    the resolver's OWN sentence, which distinguishes "no parcel
 *                    pinned" from "two jurisdictions tie" from "nothing covers here".
 *  · `no-gfa`      — the card could not derive a permitted GFA (no storey count),
 *                    so there is no area to multiply and none is invented.
 *  · `no-typology` — a module and an area exist; the user has not said what kind
 *                    of building this is, and PRYZM will not pick.
 *  · `estimated`   — the figure, with the estimator's own mandatory statement.
 *
 * @param resolved the ladder result from `resolveBuildingCostModels(binding)`
 * @param area     from {@link envelopeStudyBuiltArea}; `null` ⇒ the `no-gfa` arm
 * @param choice   the shared per-project typology choice
 * @param estimate `estimateBuildingCost(model, choice.groupId, area, choice.correctionId)`
 */
export function buildIndicativeCostFold(
    resolved: ResolvedBuildingCostModels,
    area: MeasuredBuiltArea | null,
    choice: BuildingChoice,
    estimate: BuildingCostEstimate | null,
): string {
    const span = _tracer.startSpan('pryzm.site.buildIndicativeCostFold');
    try {
        const model = resolved.models[0];

        if (!model) {
            span.setAttribute('pryzm.envelopeCost.arm', 'no-module');
            return fold(
                'no-module',
                'Indicative cost — no published module for this location',
                `<div style="color:#8a83a0;line-height:1.6;white-space:normal;">${escHtml(resolved.statement)}</div>`
                + `<div style="margin-top:6px;color:#8a83a0;font-size:9.5px;line-height:1.6;">`
                + `PRYZM does <b>not</b> substitute a €/m² from a different municipality. A rate from the `
                + `wrong market is a wrong number, not an approximate one.</div>`,
            );
        }

        if (!area) {
            span.setAttribute('pryzm.envelopeCost.arm', 'no-gfa');
            return fold(
                'no-gfa',
                'Indicative cost — no buildable area to price yet',
                `<div style="color:#8a83a0;line-height:1.6;white-space:normal;">`
                + `A published cost module <b>does</b> cover this location `
                + `(${escHtml(model.displayName)}), but this card has no permitted <b>GFA</b> to `
                + `multiply — the rule pack did not derive a storey count, so the maximum buildable `
                + `area is deliberately blank rather than guessed. A cost built on a guessed storey `
                + `count would turn that guess into money.</div>`
                + `<div style="margin-top:6px;color:#8a83a0;font-size:9.5px;line-height:1.6;">`
                + `Type a study height above and the study massing appears; once a storey count is `
                + `derived for this zone, this figure appears by itself.</div>`,
            );
        }

        if (!estimate) {
            const cheapest = model.groups[model.groups.length - 1];
            const dearest = model.groups[0];
            span.setAttribute('pryzm.envelopeCost.arm', 'no-typology');
            return fold(
                'no-typology',
                'Indicative cost — choose the building type',
                selectsHtml(model, choice)
                + `<div style="font-size:10.5px;font-weight:800;color:${AMBER};">CHOOSE THE BUILDING TYPE</div>`
                + `<div style="margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.6;white-space:normal;">`
                + (cheapest && dearest
                    ? `The published table spans ${escHtml(NUM2.format(cheapest.ratePerAreaM2))} to `
                      + `${escHtml(NUM2.format(dearest.ratePerAreaM2))} ${escHtml(model.currency)}/m². `
                    : '')
                + `PRYZM does not know which line this project is on and <b>will not guess</b> — the wrong `
                + `group is a wrong number, not an approximate one. Pick one and the estimate appears `
                + `against the ${escHtml(NUM0.format(area.areaM2))} m² study GFA above.</div>`
                + provenanceHtml(model),
            );
        }

        span.setAttribute('pryzm.envelopeCost.arm', 'estimated');
        span.setAttribute('pryzm.envelopeCost.amount', estimate.amount);
        return fold(
            'estimated',
            `Indicative cost — ≈ ${escHtml(NUM0.format(estimate.amount))} ${escHtml(estimate.currency)} (estimate)`,
            selectsHtml(model, choice)
            + `<div style="padding:9px 10px;border:1px dashed ${AMBER};border-radius:8px;background:rgba(138,97,0,.06);">`
            + `<div style="font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${AMBER};">`
            + `Estimate — not a quotation, not a price</div>`
            + `<div data-testid="${ENVELOPE_COST_AMOUNT_TESTID}" style="font-size:19px;font-weight:800;color:${AMBER};margin-top:2px;">`
            + `${escHtml(NUM0.format(estimate.amount))} ${escHtml(estimate.currency)}</div>`
            + `<div style="font-size:10px;color:#8a83a0;margin-top:2px;">`
            + `${escHtml(NUM2.format(estimate.effectiveRatePerAreaM2))} ${escHtml(estimate.currency)}/m² × `
            + `${escHtml(NUM0.format(estimate.area.areaM2))} m² study GFA</div>`
            + `<div style="margin-top:7px;font-size:9.5px;line-height:1.6;color:#4c4560;white-space:normal;overflow-wrap:break-word;">`
            + `${escHtml(estimate.statement)}</div>`
            + `</div>`
            + provenanceHtml(model),
        );
    } finally {
        span.end();
    }
}
