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
// ══════════════════════════════════════════════════════════════════════════════
// §COST-ONE-PLACE (lane COST-ONE-PLACE, 2026-09-07 · L-13145 · C115 §9 / §9.1)
// ⭐ WHAT THIS BLOCK IS NOW, AND WHY ITS NAME CHANGED
// ══════════════════════════════════════════════════════════════════════════════
// Founder, 2026-09-07: *"Indicative cost is still under point 2 — but there is a
// cost section specific for this: the information should be all well structured,
// well concatenated, no duplication and all in point 5."*
//
// He is reporting TWO defects and the second is the serious one:
//
//   1. **DUPLICATION.** Cost rendered in Stage 02 (Buildability, the card) AND in
//      Stage 06 (*"What does it cost?"*, the tab). C115 §2 gives every rendered
//      value exactly ONE canonical home; Stage 06 is cost's. This block therefore
//      no longer renders inside the card at all — `GISAreaLayout` leaves the §2.5
//      RELOCATION STAMP in its place (see {@link buildEnvelopeCostRelocationStamp})
//      and the markup this file builds is mounted by the Parcel Law tab's
//      question 5, BENEATH the proposed-design cost.
//
//   2. ⛔ **IT WAS KEYED TO THE WRONG NUMBER.** Its own derivation says
//      *"866.04 EUR/m² × 2657 m² (buildable-envelope study GFA — 380 m² inset
//      footprint × 7 derived storeys)"* — the THEORETICAL MAXIMUM. The founder's
//      brief is explicit that cost comes from *"the ACTUAL PROPOSED design, rather
//      than automatically on the maximum theoretical envelope"*, with the maximum
//      as an OPTIONAL second line: *"Then optionally: Maximum potential €5.04M"*.
//
// ⛔ SO THIS FIGURE IS RETAINED, RE-HOMED AND DEMOTED — NOT DELETED. `C115-79`
// read literally would unrender a published, cited, licensed figure, which
// `C115-01` forbids; `C115-138`/`C115-139` (§9.1, register row **PR-E-51**)
// resolve the collision in favour of preservation and set the four properties the
// second line must carry, all four of which are implemented here:
//
//   1. A DIFFERENT SUBJECT, SAID IN WORDS — hence the rename from *"Indicative
//      cost"* to *"Maximum potential"* plus {@link PERMITTED_MAXIMUM_SUBJECT_TEXT}.
//      ⚠ The rename is `C115-14`'s prescribed remedy (disambiguate by RENAMING,
//      never by deleting), and it is what stops TWO blocks called *"Indicative
//      cost"* standing in one question group — the founder's own complaint.
//   2. A DIFFERENT WEIGHT — the proposed-design cost is the ANSWER (13 px, PRYZM
//      purple, in question 5's own summary); this is CONTEXT (12 px, amber, inside
//      a fold). ⛔ `C115-37` binds the other way too: it is NOT hidden — the figure
//      is in the `<summary>`, readable with the fold shut.
//   3. ITS OWN PROVENANCE, UNCHANGED — every PR-F-10 field, the licence status and
//      note, and all 8 exclusions, behind *"Cost assumptions & source"* (`C115-80`,
//      `C115-84`, `C115-93`).
//   4. THE SAME REFUSALS — all four arms below survive verbatim (`C115-81`,
//      `C115-83`). A maximum PRYZM cannot price says so; it does not vanish.
//
// ⭐ AND THE HYPERLINK DEFECT IS FIXED IN THE SAME PASS — L-13130 / C115 **D-1** /
// PR-F-04. *"Verify at"* rendered a real `https://` PDF link as escaped PLAIN
// TEXT. `C115-24`: a URL MUST NOT render as plain text and a citation MUST NOT be
// truncated into an unusable link. `sourceToChase` is a URL FOLLOWED BY PROSE, so
// {@link buildSourceToChaseHtml} anchors the URL and keeps every word of the prose
// — both halves, neither truncated. The three-way fallback PR-F-03 protects is
// preserved: safe http(s) ⇒ anchor · non-URL ⇒ escaped plain text · empty ⇒ the
// field is not printed at all.
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
//   6. **IT IS AN ESTIMATE OF A PERMITTED CEILING, NOT A COST OF A DESIGN.** At
//      this stage nothing has been drawn. The figure answers *"what would building
//      out the permitted envelope cost, at the published regional rate?"* and the
//      copy says exactly that. It is not a quotation, not a price, not a permitted
//      cost — and, since §COST-ONE-PLACE, explicitly not the cost of the design
//      the reader is looking at.
//
// PURE STRING BUILDERS — no DOM, no store, no arithmetic of its own beyond the
// study-area construction. Every number and every sentence comes from the L2
// engine (`@pryzm/core-app-model`). P4 — no globals. P6 — renders only.
// P8 — the exported functions open OTel spans. C08 §3.1 — every interpolated
// runtime string routes through the local `escHtml`.
//
// ⛔ ONE DISCLOSURE PRIMITIVE, NOT A SIXTH (C115 §11 `C115-90`/`C115-91`). Every
// `<details>` this file emits carries a `data-testid` and reads its `open` state
// from `envelopeCardSections`' ONE session map via `envelopeCardFoldIsOpen`; the
// host re-attaches it with `wireEnvelopeCardFoldMemory` after each `innerHTML`
// swap. The untagged nested `<details>` this file used to emit is gone — C115 §11
// names it as one of the five rivals and PR-H-07 (**D-3**) as the reason: a fold
// with no `data-testid` is skipped by the memory and cannot remember anything.

import { trace } from '@opentelemetry/api';
import type {
    BuildingCostEstimate,
    MeasuredBuiltArea,
    RegionalBuildingCostModel,
    ResolvedBuildingCostModels,
} from '@pryzm/core-app-model';
import type { BuildingChoice } from '../dataworkbench/buckets/buildingTypologyChoice';
import { envelopeCardFoldIsOpen } from './envelopeCardSections';

const _tracer = trace.getTracer('pryzm.site.envelopeCostSection');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/**
 * §L-402-XSS / PR-F-03 — only an absolute http(s) URL may become an `href`. A provider-supplied
 * `javascript:` or `data:` value would otherwise execute from an anchor. Returns `null` when the
 * value is not a safe absolute http(s) URL, and the caller then renders it as plain text — which
 * is the middle arm of the three-way fallback PR-F-03 requires to survive.
 *
 * ⚠ Deliberately the SAME rule as `GISAreaLayout.safeHttpUrl`. It is five lines and is declared
 * locally so this pure module owes no import edge to a 6,000-line layout closure; the spec asserts
 * the two agree on the arms that matter.
 */
function safeHttpUrl(value: unknown): string | null {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return null;
    try {
        const u = new URL(raw);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null;
    } catch { return null; }
}

export const ENVELOPE_COST_SECTION_TESTID = 'envelope-section-indicative-cost';
export const ENVELOPE_COST_GROUP_SELECT_TESTID = 'envelope-cost-group-select';
export const ENVELOPE_COST_CORRECTION_SELECT_TESTID = 'envelope-cost-correction-select';
export const ENVELOPE_COST_AMOUNT_TESTID = 'envelope-cost-amount';
/**
 * §COST-ONE-PLACE — the EVIDENCE disclosure, named exactly as the founder named it and as
 * `C115-93` requires (*"Cost assumptions & source"*). Tagged, therefore remembered.
 */
export const ENVELOPE_COST_ASSUMPTIONS_TESTID = 'envelope-cost-assumptions-source';
/**
 * §COST-ONE-PLACE — the exclusions fold. It used to be an UNTAGGED `<details>`, which C115 §11
 * counts among the five rival disclosure mechanisms and PR-H-07 (**D-3**) explains: the memory
 * keys on `data-testid`, so an untagged fold silently forgets. Tagging it is the fix.
 */
export const ENVELOPE_COST_NOT_COVERED_TESTID = 'envelope-cost-not-covered';
/** §COST-ONE-PLACE — the *"Verify at"* anchor, so a spec can assert it is a LINK, not text. */
export const ENVELOPE_COST_VERIFY_LINK_TESTID = 'envelope-cost-verify-link';
/**
 * §COST-ONE-PLACE — the attribute that says WHOSE cost this is. `'permitted-maximum'` on this
 * block; question 5's own figure is the proposed design's and carries no such marking, because it
 * is the answer rather than the context. Read by the spec that proves the two are not one value
 * rendered twice (C115 §2.3: two numbers answering two questions are NOT a duplication).
 */
export const ENVELOPE_COST_SUBJECT_ATTR = 'data-cost-subject';

/**
 * The caveat that MUST travel with an envelope-derived area. It is deliberately
 * blunt about the two separate distances between this number and the quantity a
 * cost module asks for: it is a STUDY of an unbuilt plot, and even as a study it
 * is not the ordinance's own `superfície construïda`.
 *
 * ⚠ Exported so the spec can assert the figure is never rendered without it.
 * ⛔ Register row PR-E-33 — verbatim, and this lane moved it without editing a word.
 */
export const ENVELOPE_STUDY_AREA_CAVEAT =
    'it is a STUDY of what the ordinance would permit if this plot were built out in full — '
    + 'nothing has been drawn and nothing has been measured. It is not the ordinance’s own '
    + 'superfície construïda (measured to the outside of the envelope), and a real design '
    + 'almost never fills its envelope, so the true built area is normally SMALLER than this.';

/**
 * §COST-ONE-PLACE `C115-139` clause 1 — THE DIFFERENT SUBJECT, SAID IN WORDS.
 *
 * ⛔ Without this sentence the two figures in question 5 are two numbers with no stated
 * difference, and a reader takes the larger one for a correction of the smaller. They answer two
 * questions: *"what does my design cost?"* and *"what would the law's ceiling cost?"* — which is
 * exactly why C115 §2.3 classifies them as NOT a duplication and why both may stand.
 */
export const PERMITTED_MAXIMUM_SUBJECT_TEXT =
    'This prices the PERMITTED ENVELOPE, not the design above it. It is the ceiling the ordinance '
    + 'allows, costed at the published regional rate — a different question from “what does what I '
    + 'have drawn cost?”, and normally a larger number. Neither figure corrects the other.';

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
// §2.5 — THE RELOCATION STAMP THE CARD KEEPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §COST-ONE-PLACE — the attribute the card stamps where this block used to render.
 *
 * ⛔ IT IS THE SAME ATTRIBUTE NAME `parcelLawTab.ts` already uses
 * (`PARCEL_LAW_DUPLICATE_REMOVED_ATTR`), which is what `C115-17` means by *"the pattern already
 * exists and MUST be reused, not re-invented"*. It is declared here rather than imported because
 * `ui/site` owes no import edge to `ui/analysis`; the spec asserts the two literals are equal, so
 * a rename in either place fails a test instead of silently minting a second name.
 */
export const ENVELOPE_COST_RELOCATED_ATTR = 'data-duplicate-removed';
/** What the stamp says it moved to. One value, read by the spec. */
export const ENVELOPE_COST_RELOCATED_TO = 'parcel-law-question-5-cost';

/**
 * §COST-ONE-PLACE / `C115-17` — ⭐ WHAT THE CARD RENDERS WHERE THE COST FOLD USED TO BE.
 *
 * ⛔ A BLOCK THAT MOVED MUST NOT LOOK LIKE A BLOCK THAT WAS DELETED. `C115-17` makes the stamp
 * mandatory precisely so a reader — and a spec — can tell the two apart; L-13026 is the row this
 * repository opened the last time a panel section silently stopped appearing.
 *
 * ⚠ It is a REFERENCE in C115 §2.1's sense: it names the value and the stage that owns it, and it
 * computes nothing. ⛔ It is NOT `C115-138`'s forbidden use of a stamp: the figure is not being
 * seen off the surface, it is rendered in full one question below.
 */
export function buildEnvelopeCostRelocationStamp(): string {
    return `<div ${ENVELOPE_COST_RELOCATED_ATTR}="${ENVELOPE_COST_RELOCATED_TO}" `
        + `style="margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;font-size:9.5px;`
        + `line-height:1.55;color:#8a83a0;min-width:0;max-width:100%;">`
        + `<b style="color:#8a83a0;">Indicative cost moved.</b> Cost now has one home — `
        + `<b>“What does it cost?”</b> on the Parcel Law tab. Your own €/m² prices the design you `
        + `have drawn there, and the published-module estimate for the permitted maximum sits `
        + `beneath it with its source, licence and exclusions. Nothing was dropped.</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The fold
// ─────────────────────────────────────────────────────────────────────────────

const AMBER = '#8A6100';

const FOLD_STYLE =
    'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;'
    + 'min-width:0;max-width:100%;overflow-wrap:break-word;';
/**
 * ⚠ AMBER AND 10 px, NOT PURPLE AND 10.5 px — `C115-139` clause 2 / PR-E-51. Question 5's own
 * answer (the design's cost) is the purple figure; this is the ceiling beside it and must not be
 * typeset like it. It is still a `<summary>` carrying the number, so `C115-37` holds: de-weighted,
 * never hidden.
 */
const FOLD_SUMMARY_STYLE =
    `cursor:pointer;font-weight:700;font-size:10px;color:${AMBER};list-style:none;`;

/**
 * One `<details>`, keyed and remembered by the ONE primitive (C115 §11).
 *
 * ⛔ `open` is emitted ONLY from `envelopeCardFoldIsOpen` — the session map in
 * `envelopeCardSections.ts` that `wireEnvelopeCardFoldMemory` writes. No caller-supplied default,
 * because a second thing deciding one fold's state is how a panel acquires a sixth disclosure
 * mechanism (`C115-91`).
 */
function fold(
    testid: string,
    summaryStyle: string,
    safeSummary: string,
    safeBody: string,
    extraAttrs = '',
): string {
    const open = envelopeCardFoldIsOpen(testid) ? ' open' : '';
    return `<details data-testid="${escHtml(testid)}"${extraAttrs}${open} style="${FOLD_STYLE}">`
        + `<summary style="${summaryStyle}">${safeSummary}</summary>`
        + `<div style="font-size:11px;margin-top:4px;min-width:0;max-width:100%;">${safeBody}</div>`
        + `</details>`;
}

/** The OUTER second line: one `data-state` arm, one subject marking, one summary that answers. */
function secondLine(state: string, safeSummary: string, safeBody: string): string {
    return fold(
        ENVELOPE_COST_SECTION_TESTID,
        FOLD_SUMMARY_STYLE,
        safeSummary,
        `<div style="font-size:9.5px;line-height:1.6;color:#8a83a0;margin-bottom:7px;`
        + `white-space:normal;overflow-wrap:break-word;">${escHtml(PERMITTED_MAXIMUM_SUBJECT_TEXT)}</div>`
        + safeBody,
        ` data-state="${escHtml(state)}" ${ENVELOPE_COST_SUBJECT_ATTR}="permitted-maximum"`,
    );
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

/**
 * ⭐ L-13130 / C115 **D-1** / PR-F-04 / `C115-25` — THE *"VERIFY AT"* LINK, AS A LINK.
 *
 * `sourceToChase` is a URL **followed by prose** (the PDF, then the annex, the BOPB reference and
 * the re-read instruction). The old code escaped the whole string, so the founder's screenshot
 * shows a full `https://ajuntament.barcelona.cat/…` sitting there as dead text — the exact place
 * `C115-24` names and the exact thing his brief forbids (*"Do not replace hyperlinks with plain
 * text. Do not truncate citations into unusable links."*).
 *
 * ⛔ BOTH HALVES SURVIVE. The URL becomes an anchor; every word after it is kept as escaped text.
 * Truncating the prose to "make a clean link" would trade one defect for the other one the same
 * clause forbids.
 *
 * The three-way fallback PR-F-03 protects is preserved exactly:
 *   · a safe absolute http(s) leading token ⇒ an anchor plus the remaining prose;
 *   · anything else non-empty ⇒ escaped plain text, unchanged and unlinked;
 *   · empty/absent ⇒ `''`, and the caller omits the row rather than printing an empty label.
 */
export function buildSourceToChaseHtml(sourceToChase: unknown): string {
    const raw = typeof sourceToChase === 'string' ? sourceToChase.trim() : '';
    if (raw.length === 0) return '';
    const firstBreak = raw.search(/\s/);
    const head = firstBreak === -1 ? raw : raw.slice(0, firstBreak);
    const tail = firstBreak === -1 ? '' : raw.slice(firstBreak).trim();
    const href = safeHttpUrl(head);
    if (href === null) return escHtml(raw);
    return `<a data-testid="${ENVELOPE_COST_VERIFY_LINK_TESTID}" href="${escHtml(href)}" `
        + `target="_blank" rel="noopener noreferrer" `
        + `style="color:#6600FF;text-decoration:underline;overflow-wrap:anywhere;">${escHtml(head)}</a>`
        + (tail.length > 0 ? ` ${escHtml(tail)}` : '');
}

/**
 * The EVIDENCE layer — `C115-80` / `C115-84` / `C115-93`'s *"Cost assumptions & source"*.
 *
 * Everything in register row PR-F-10 is here and reachable: database · publisher · edition ·
 * priceDate · itemCode · the three-member licence status · the licence note citing the statute and
 * the open-data terms · the *"verify at"* reference as a real anchor · and the 8 exclusions, each
 * citing an article, in their own tagged fold with the COUNT in the summary (the count is the
 * assertion — §3.C).
 *
 * ⚠ THE TWO SELECTS ARE **NOT** IN HERE, DELIBERATELY. `C115-84` puts PR-F-10 — provenance —
 * behind this disclosure; the module and correction-factor controls are DETAILS, not evidence
 * (the founder's own Summary → Details → Evidence ordering), and `C115-82` requires the
 * assumption to be one the user can **see and change**. Burying the `no-typology` arm's ask two
 * folds deep would make the ONE control that removes the refusal the hardest thing to reach —
 * *"an obstacle, not a dropdown"* (C115 §11).
 */
function evidenceHtml(model: RegionalBuildingCostModel): string {
    const p = model.provenance;
    const verify = buildSourceToChaseHtml(p.sourceToChase);
    const body =
        `<div style="font-size:9.5px;line-height:1.6;color:#8a83a0;white-space:normal;overflow-wrap:break-word;">
        <b>Source.</b> ${escHtml(p.database)} — ${escHtml(p.publisher)}, ${escHtml(p.edition)}. Prices at ${escHtml(p.priceDate)}${p.itemCode ? ` · ${escHtml(p.itemCode)}` : ''}.
        <br><b>Licence.</b> ${escHtml(String(p.licence).replace(/_/g, ' '))}${p.licenceNote ? ` — ${escHtml(p.licenceNote)}` : ''}`
        + (verify.length > 0 ? `<br><b>Verify at.</b> ${verify}` : '')
        + `</div>`
        + fold(
            ENVELOPE_COST_NOT_COVERED_TESTID,
            `font-size:9.5px;font-weight:700;color:${AMBER};cursor:pointer;list-style:none;`,
            `What this €/m² does NOT include (${model.notCovered.length})`,
            `<ul style="margin:5px 0 0;padding-left:15px;font-size:9.5px;line-height:1.6;color:#8a83a0;white-space:normal;overflow-wrap:break-word;">`
            + `${model.notCovered.map((n) => `<li>${escHtml(n)}</li>`).join('')}</ul>`,
        );
    return fold(
        ENVELOPE_COST_ASSUMPTIONS_TESTID,
        `cursor:pointer;font-weight:700;font-size:9.5px;color:${AMBER};list-style:none;`,
        `Cost assumptions &amp; source — ${escHtml(model.displayName)}`,
        body,
    );
}

/**
 * The permitted-maximum second line, in one of FOUR arms. Each arm carries a distinct
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
 * ⚠ FOUR ARMS, plus the caller's own `catch`. `C115-85`: this comment said **five** at mint and
 * two call sites repeated the stale number; the count is corrected here in the same PR that
 * touches the fold, which is what that clause asks for.
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
            return secondLine(
                'no-module',
                'Maximum potential — no published module for this location',
                `<div style="color:#8a83a0;line-height:1.6;white-space:normal;">${escHtml(resolved.statement)}</div>`
                + `<div style="margin-top:6px;color:#8a83a0;font-size:9.5px;line-height:1.6;">`
                + `PRYZM does <b>not</b> substitute a €/m² from a different municipality. A rate from the `
                + `wrong market is a wrong number, not an approximate one.</div>`,
            );
        }

        if (!area) {
            span.setAttribute('pryzm.envelopeCost.arm', 'no-gfa');
            return secondLine(
                'no-gfa',
                'Maximum potential — no permitted area to price yet',
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
            return secondLine(
                'no-typology',
                'Maximum potential — choose the building type',
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
                + evidenceHtml(model),
            );
        }

        span.setAttribute('pryzm.envelopeCost.arm', 'estimated');
        span.setAttribute('pryzm.envelopeCost.amount', estimate.amount);
        return secondLine(
            'estimated',
            `Maximum potential — ≈ ${escHtml(NUM0.format(estimate.amount))} ${escHtml(estimate.currency)} (estimate)`,
            // ⚠ 12 px, not 19 px (`C115-139` clause 2). The number is still stated in full, with
            // its currency, its derivation and the estimator's own statement — de-weighted, not
            // hidden (`C115-37`).
            `<div style="padding:9px 10px;border:1px dashed ${AMBER};border-radius:8px;background:rgba(138,97,0,.06);">`
            + `<div style="font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${AMBER};">`
            + `Estimate — not a quotation, not a price</div>`
            + `<div data-testid="${ENVELOPE_COST_AMOUNT_TESTID}" style="font-size:12px;font-weight:800;color:${AMBER};margin-top:2px;">`
            + `${escHtml(NUM0.format(estimate.amount))} ${escHtml(estimate.currency)}</div>`
            + `<div style="font-size:10px;color:#8a83a0;margin-top:2px;">`
            + `${escHtml(NUM2.format(estimate.effectiveRatePerAreaM2))} ${escHtml(estimate.currency)}/m² × `
            + `${escHtml(NUM0.format(estimate.area.areaM2))} m² study GFA</div>`
            + `<div style="margin-top:7px;font-size:9.5px;line-height:1.6;color:#4c4560;white-space:normal;overflow-wrap:break-word;">`
            + `${escHtml(estimate.statement)}</div>`
            + `</div>`
            + selectsHtml(model, choice)
            + evidenceHtml(model),
        );
    } finally {
        span.end();
    }
}
