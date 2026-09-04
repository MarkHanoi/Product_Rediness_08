// §GIS-ENVELOPE-FULL-SECTIONS (L-1650..L-1653) — the buildable-envelope card's rich sections
// as FIRST-CLASS, DEFAULT-COLLAPSED folds.
//
// Founder 2026-08-21: the GIS-hosted card (§GIS-ENVELOPE-REHOST, L-1362/L-1587) shows the
// headline numbers but the sections that were "fully wired" on the older surface — DESIGNED VS
// PERMITTED, "How these were measured", the full site & massing data, "Why these numbers?" —
// did not read as sections of the card. Three root causes (L-1650):
//
//   1. The full card nested the capacity comparison AND the full-site block behind ONE
//      "Site data & capacity" disclosure, the site block a SECOND <details> inside it.
//   2. "How these were measured" only rendered behind `measurement.caveats.length > 0`, and a
//      nothing-authored project legitimately has `caveats: []` — so in the founder's exact
//      repro the section was UNREACHABLE, not merely folded.
//   3. The card's measurement join swallowed exceptions as `''` — failure and emptiness
//      rendered as the same value (§CONTEXT-DATA-HONESTY).
//
// PURE STRING BUILDERS, the same extraction pattern that created `capacityPanelSection.ts`:
// the card in `GISAreaLayout.refreshEnvelopePanel` stays the ONE producer (C06 §13.3); these
// are its renderer, extracted so every arm of every state is pinned by unit tests instead of
// asserted in a comment. No DOM, no store, no arithmetic — every number and verdict comes from
// the L2 model (`buildCapacityComparison`) and the L5 measurement adapter.
//
// THE HONESTY CONTRACT (C58 §1.3/§1.4; §L-456 block in `refreshEnvelopePanel`):
//   · An unfoldable section is never silently absent for a state that HAS something to say —
//     the arm that cannot show data says WHY, in words, in the fold.
//   · A failed measurement, an empty model, and "nothing measurable on an authored model" are
//     THREE different arms with three distinct `data-state` values — never one blank.
//   · Nothing is fabricated: no zeros for unmeasured metrics, no verdict from a failed join.
//   · The <summary> line carries the FACT (§UX1-PROSE-ALTITUDE): a user who never unfolds must
//     not be able to mistake "Not enough to judge this design" for a clean check.
//
// P4 — no globals. P6 — renders only; dispatches nothing. P8 — exported functions open OTel
// spans. C08 §3.1 — every interpolated runtime string routes through the local `escHtml`.

import { trace } from '@opentelemetry/api';
import type { CapacityComparison, ContextDerivedStudyEnvelopeResult } from '@pryzm/site-parcel-data';
import { CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE } from '@pryzm/site-parcel-data';
import {
    buildCapacitySectionHtml,
    renderMeasurementCaveatLinesHtml,
    resolveCapacityVerdict,
} from './capacityPanelSection';
import type { DesignMeasurement } from './designMeasurement';
// §RESI-ORCH-PERLEVEL — the SAME user-facing sentence for each refusal code that the capacity rows
// print. A second wording table here would let one fold say "no floor slabs are authored" while the
// fold above it said something else about the identical fact.
import { UNMEASURED_REASON_TEXT } from './designMeasurement';
// §RESI-ORCH-DESIGN-STAGE — the strip renders a model decided next door. This file holds NO stage
// rule of its own: which stage is reached, and why an unreached one is not, are decisions a test
// can reach, and a DOM builder is where decisions go to become unassertable.
import type { DesignStageStatus } from './designStageModel';
import type { UserSuppliedStudyHeightRecord } from './userSuppliedStudyHeightState';

const _tracer = trace.getTracer('pryzm.site.envelopeCardSections');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// The fold shell — one shape for every section, sized for the narrow GIS rail
// ─────────────────────────────────────────────────────────────────────────────

// `min-width:0` + `max-width:100%` + `overflow-wrap` are the narrow-rail containment: the GIS
// panel is the narrowest host this card renders in (§GIS-ENVELOPE-REHOST), and a flex/grid
// child without `min-width:0` refuses to shrink below its content, which is exactly how a card
// blows a rail out sideways. No fixed pixel width anywhere in a fold.
const FOLD_STYLE =
    'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;'
    + 'min-width:0;max-width:100%;overflow-wrap:break-word;';
const FOLD_SUMMARY_STYLE =
    'cursor:pointer;font-weight:700;font-size:10.5px;color:#6600FF;list-style:none;';

/**
 * One default-collapsed fold. `safeSummary` / `safeBody` are already-escaped markup by this
 * file's `safe*` convention (§XSS-SINK-SCAN, C08 §3.1). Deliberately NEVER emits `open`:
 * default-collapsed is the card's contract with the narrow rail.
 */
function fold(testid: string, state: string, safeSummary: string, safeBody: string): string {
    return `<details data-testid="${escHtml(testid)}" data-state="${escHtml(state)}" style="${FOLD_STYLE}">`
        + `<summary style="${FOLD_SUMMARY_STYLE}">${safeSummary}</summary>`
        + `<div style="font-size:11px;margin-top:4px;min-width:0;max-width:100%;">${safeBody}</div>`
        + `</details>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section (a) — DESIGNED VS PERMITTED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Designed-vs-Permitted section as a first-class fold.
 *
 *  · Normal arm: wraps the ONE pure capacity renderer (`buildCapacitySectionHtml`) — never a
 *    second producer — with the verdict headline lifted into the <summary> so the collapsed
 *    card still states the finding.
 *  · `joinFailed` arm: the card's measurement join threw. That is a FAILURE to measure, not a
 *    finding of emptiness, and it must not render as an absent section (L-1650 root cause 3)
 *    — and must never soften into zeros or a pass.
 *  · `comparison === null` without failure: there is genuinely no envelope to compare against
 *    (the card itself does not render in that state) — absent section, the card's convention.
 */
export function buildDesignedVsPermittedFold(
    comparison: CapacityComparison | null,
    measurement: DesignMeasurement | null,
    opts: { readonly joinFailed: boolean },
): string {
    const span = _tracer.startSpan('pryzm.site.buildDesignedVsPermittedFold');
    try {
        if (opts.joinFailed) {
            span.setAttribute('pryzm.envelopeCard.capacityArm', 'join-failed');
            return fold(
                'envelope-section-designed-vs-permitted',
                'join-failed',
                'Designed vs permitted — could not be computed',
                `<div data-testid="capacity-join-failed" style="color:#8a5a00;background:#fff6e8;`
                + `border-radius:6px;padding:6px 8px;font-size:10px;line-height:1.5;">`
                + `<b>The designed-vs-permitted comparison could not be computed.</b> Measuring the `
                + `authored model failed in this session — a FAILURE to measure, not a finding that `
                + `nothing is designed, so it is deliberately not rendered as zeros, blanks or a `
                + `pass. Re-open the project or re-commit the parcel to retry; if this persists, `
                + `report it as a defect in the model read.</div>`,
            );
        }
        if (!comparison || comparison.rows.length === 0) {
            span.setAttribute('pryzm.envelopeCard.capacityArm', 'absent');
            return '';
        }
        const verdict = resolveCapacityVerdict(comparison);
        span.setAttribute('pryzm.envelopeCard.capacityArm', 'rendered');
        span.setAttribute('pryzm.envelopeCard.capacityTone', verdict.tone);
        return fold(
            'envelope-section-designed-vs-permitted',
            'rendered',
            `Designed vs permitted — ${escHtml(verdict.headline)}`,
            // The fold's summary is the heading, and "How these were measured" is PROMOTED to
            // its own fold (`buildHowMeasuredFold`) — so both are omitted here, not duplicated.
            buildCapacitySectionHtml(comparison, measurement, {
                omitTitle: true,
                omitMeasurementCaveats: true,
            }),
        );
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section (b) — HOW THESE WERE MEASURED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The "How these were measured" section as a first-class fold — including the arms the old
 * `caveats.length > 0` gate could never reach (L-1650 root cause 2). Four arms, four distinct
 * `data-state` values:
 *
 *  · `measured`         — real caveat lines, via the ONE shared caveat renderer.
 *  · `nothing-authored` — an empty model: nothing to explain, and the fold SAYS so.
 *  · `unmeasurable`     — an authored model none of whose metrics could be measured: a
 *                          different fact from an empty model, stated differently.
 *  · `measure-failed`   — the measurement itself failed: a failure, not an emptiness.
 */
export function buildHowMeasuredFold(
    measurement: DesignMeasurement | null,
    opts: { readonly joinFailed: boolean },
): string {
    const span = _tracer.startSpan('pryzm.site.buildHowMeasuredFold');
    try {
        if (opts.joinFailed || measurement === null) {
            span.setAttribute('pryzm.envelopeCard.measuredArm', 'measure-failed');
            return fold(
                'envelope-section-how-measured',
                'measure-failed',
                'How these were measured — unavailable',
                `<div style="color:#8a5a00;background:#fff6e8;border-radius:6px;padding:6px 8px;`
                + `font-size:10px;line-height:1.5;">Measurement of the authored model <b>failed</b> `
                + `in this session, so there is no measurement method to explain. This is a failure, `
                + `not an empty model — the designed figures above read as not checked for the same `
                + `reason.</div>`,
            );
        }
        if (measurement.caveats.length === 0) {
            if (measurement.designedStoreyCount === 0) {
                span.setAttribute('pryzm.envelopeCard.measuredArm', 'nothing-authored');
                return fold(
                    'envelope-section-how-measured',
                    'nothing-authored',
                    'How these were measured — nothing authored yet',
                    `<div style="color:#8a83a0;font-size:10px;line-height:1.5;">Nothing has been `
                    + `authored on this site yet, so there are no measurements to explain. Every `
                    + `metric in “Designed vs permitted” reads NOT CHECKED with its own stated `
                    + `reason; nothing is inferred, and an unmeasured metric is never shown as 0.</div>`,
                );
            }
            span.setAttribute('pryzm.envelopeCard.measuredArm', 'unmeasurable');
            return fold(
                'envelope-section-how-measured',
                'unmeasurable',
                'How these were measured — no metric could be measured',
                `<div style="color:#8a83a0;font-size:10px;line-height:1.5;">The model holds authored `
                + `storeys, but none of the designed metrics could be measured from it, so there is `
                + `no measurement method to explain. Each metric in “Designed vs permitted” states `
                + `the reason it could not be measured — a stated refusal, never a guessed figure.</div>`,
            );
        }
        span.setAttribute('pryzm.envelopeCard.measuredArm', 'measured');
        span.setAttribute('pryzm.envelopeCard.caveatCount', measurement.caveats.length);
        return fold(
            'envelope-section-how-measured',
            'measured',
            'How these were measured',
            renderMeasurementCaveatLinesHtml(measurement.caveats),
        );
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// §RESI-ORCH-DESIGN-STAGE (STR §1/§19/§21) — WHERE AM I, AND WHAT CAN I DO?
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_STAGE_STRIP_TESTID = 'envelope-design-stage-strip';

/**
 * The design-stage strip: the five stages past the parcel hand-off, each showing whether it has
 * been reached and — when it has not — WHY NOT, in the user's own words.
 *
 * ⛔ EVERY STAGE CARRIES ITS REASON IN A `title`, INCLUDING THE UNREACHED ONES. This copies
 * `SiteEntryPanel`'s already-shipped rule — *"an unavailable action renders greyed WITH its reason
 * printed"* — rather than inventing a second convention. A greyed step with no explanation is the
 * same defect as a dead click: the user cannot tell "not yet" from "broken" from "not for you".
 *
 * ⛔ NOTHING HERE IS CLICKABLE, AND THAT IS DELIBERATE FOR NOW. The strip REPORTS a derived state;
 * it does not navigate. A step that looked like a button and did nothing would be exactly the dead
 * click §3's binding was written to remove — so until each stage has a destination wired, it reads
 * as a status, which is what it honestly is.
 *
 * Colours are the brand's: PRYZM violet for what is true, grey for what is not. No black, no red —
 * an unreached stage is not an error.
 */
export function buildDesignStageStripHtml(
    stages: readonly DesignStageStatus[],
): string {
    const span = _tracer.startSpan('pryzm.site.buildDesignStageStripHtml');
    try {
        if (stages.length === 0) return '';
        const current = stages.find((s) => s.state === 'current') ?? null;
        span.setAttribute('pryzm.designStage.stripCurrent', current?.stage ?? 'none');

        const pills = stages
            .map((s) => {
                const style =
                    s.state === 'current'
                        ? 'background:#6600FF;color:#ffffff;border:1px solid #6600FF;font-weight:700;'
                        : s.state === 'done'
                            ? 'background:#f3eeff;color:#6600FF;border:1px solid #d9ccff;font-weight:600;'
                            : s.state === 'available'
                                ? 'background:#ffffff;color:#6600FF;border:1px dashed #b9a6f2;font-weight:600;'
                                : 'background:#ffffff;color:#b3adc4;border:1px solid #ece9f4;font-weight:500;';
                const glyph = s.state === 'done' ? '✓ ' : s.state === 'current' ? '◉ ' : '';
                return `<span data-design-stage="${escHtml(s.stage)}" data-state="${escHtml(s.state)}" `
                    + `title="${escHtml(s.reason)}" `
                    + `style="${style}padding:2px 7px;border-radius:999px;font-size:9.5px;white-space:nowrap;cursor:help;">`
                    + `${glyph}${escHtml(s.label)}</span>`;
            })
            .join('');

        // ⛔ THE CAPTION NEVER SAYS "STAGE 1 OF 5". A stage is REACHED because its artefact exists,
        // not because four others were completed first — a project can hold a BIM model with no
        // declared programme, and a progress fraction would flatten that into a false ordering.
        const caption = current === null
            ? 'No design stage has been reached yet — the reason for each is on the label.'
            : `You are at <b>${escHtml(current.label)}</b> — ${escHtml(current.reason)}`;

        return `<div data-testid="${DESIGN_STAGE_STRIP_TESTID}" data-current="${escHtml(current?.stage ?? 'none')}" `
            + `style="margin-top:7px;padding-top:6px;border-top:1px solid #efecf7;min-width:0;max-width:100%;">`
            + `<div style="display:flex;flex-wrap:wrap;gap:4px;">${pills}</div>`
            + `<div style="margin-top:4px;font-size:9px;line-height:1.45;color:#8a83a0;">${caption}</div>`
            + `</div>`;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// §RESI-ORCH-PERLEVEL (STR §13/§14) — BUILT AREA, STOREY BY STOREY
// ─────────────────────────────────────────────────────────────────────────────

export const PER_LEVEL_SECTION_TESTID = 'envelope-section-per-level';

/**
 * The per-storey built-area fold.
 *
 * §14 asks the panel to show *"per-level GFA · room areas · cost · net vs gross"* continuously, and
 * §13 records that the per-storey plate sums were already being computed and thrown away. This is
 * the renderer for the half that now survives (`DesignMeasurement.perLevel`).
 *
 * ⛔ FOUR `data-state` ARMS, the same discipline as every fold above:
 *   · `measure-failed`   — the join threw. A FAILURE, never an empty model.
 *   · `nothing-authored` — no designed storey exists yet.
 *   · `partial`          — at least one storey measured AND at least one refused. This arm is the
 *                          reason the type carries a per-storey reason at all: the storey that
 *                          cannot be measured NAMES ITSELF, and the others still report.
 *   · `measured`         — every designed storey reported.
 *
 * ⛔ A STOREY WITH NO MEASURABLE PLATE PRINTS ITS REASON, NEVER 0 m² AND NEVER A BLANK CELL.
 * `designMeasurement.ts` measures `null` rather than `0` precisely so an unbuilt storey cannot
 * read as a compliant one; a renderer that turned that `null` back into "0 m²" — or into an empty
 * cell the eye reads as zero — would undo the discipline at the last step.
 *
 * ⚠ THE TOTAL IS NOT RE-SUMMED HERE. It comes from `measurement.design.grossFloorAreaM2`, the ONE
 * producer (C06 §13.3), and when that is `null` the fold says so instead of adding the rows up:
 * summing the visible rows would silently manufacture the very total the measurement refused.
 */
export function buildPerLevelBuiltAreaFold(
    measurement: DesignMeasurement | null,
    opts: { readonly joinFailed: boolean },
): string {
    const span = _tracer.startSpan('pryzm.site.buildPerLevelBuiltAreaFold');
    try {
        if (opts.joinFailed || measurement === null) {
            span.setAttribute('pryzm.envelopeCard.perLevelArm', 'measure-failed');
            return fold(
                PER_LEVEL_SECTION_TESTID,
                'measure-failed',
                'Built area by storey — unavailable',
                `<div style="color:#8a5a00;background:#fff6e8;border-radius:6px;padding:6px 8px;`
                + `font-size:10px;line-height:1.5;">Measurement of the authored model <b>failed</b> in `
                + `this session, so there are no per-storey figures. This is a failure, not an empty `
                + `model.</div>`,
            );
        }
        const rows = measurement.perLevel;
        if (rows.length === 0) {
            span.setAttribute('pryzm.envelopeCard.perLevelArm', 'nothing-authored');
            return fold(
                PER_LEVEL_SECTION_TESTID,
                'nothing-authored',
                'Built area by storey — nothing authored yet',
                `<div style="color:#8a83a0;font-size:10px;line-height:1.5;">No storey carries any `
                + `authored element yet, so there is no built area to break down. An unbuilt storey is `
                + `never shown as 0 m² — 0 against a ceiling would read as a pass.</div>`,
            );
        }
        const refusedCount = rows.filter((r) => r.grossAreaM2 === null).length;
        // THREE arms, not two: "some storeys measured" and "no storey could be measured" are
        // different findings and lead to different next actions.
        const state = refusedCount === 0
            ? 'measured'
            : refusedCount === rows.length
                ? 'none-measured'
                : 'partial';
        span.setAttribute('pryzm.envelopeCard.perLevelArm', state);
        span.setAttribute('pryzm.envelopeCard.perLevelRows', rows.length);

        // Highest storey first — the way a section drawing reads, and the way a user thinks about
        // "the top floor". The model orders lowest-first because elevation math needs it to.
        const ordered = [...rows].sort((a, b) => b.elevation - a.elevation);
        const body = ordered
            .map((r) => {
                const label = escHtml(r.name ?? `Storey at ${r.elevation.toFixed(2)} m`);
                const value = r.grossAreaM2 !== null
                    ? `<span style="font-weight:600;">${escHtml(r.grossAreaM2.toFixed(0))} m²</span>`
                    // ⛔ The refusal, in the user's words, in the cell where the number would have
                    // been. Not a dash: a dash is indistinguishable from a rendering bug.
                    : `<span data-unmeasured-reason="${escHtml(r.unmeasured ?? 'no-floor-plates')}" `
                      + `style="color:#8a5a00;font-weight:600;font-size:9.5px;">not measured</span>`;
                const why = r.grossAreaM2 === null && r.unmeasured !== null
                    ? `<div style="color:#8a5a00;font-size:9px;line-height:1.4;margin:1px 0 3px 0;">`
                      + `${escHtml(UNMEASURED_REASON_TEXT[r.unmeasured])}</div>`
                    : '';
                return `<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0;">`
                    + `<span style="color:#6b6480;">${label}`
                    + `<span style="color:#c3bdd6;"> · ${escHtml(r.elevation.toFixed(2))} m</span></span>`
                    + `<span style="text-align:right;">${value}</span></div>${why}`;
            })
            .join('');

        const total = measurement.design.grossFloorAreaM2;
        const totalRow = total !== null
            ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0 0 0;margin-top:3px;border-top:1px solid #efecf7;">`
              + `<span style="color:#6600FF;font-weight:700;">Total built area</span>`
              + `<span style="font-weight:700;">${escHtml(total.toFixed(0))} m²</span></div>`
            // ⛔ NEVER ADD THE ROWS UP HERE. The measurement refused this total for a stated reason;
            // re-deriving it from the rows that DID measure would manufacture the exact figure the
            // refusal withheld, and it would be wrong by whatever the refusal was about.
            : `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #efecf7;color:#8a5a00;font-size:9.5px;line-height:1.45;">`
              + `PRYZM is not reporting a TOTAL built area — ${escHtml(
                    measurement.unmeasured.grossFloorAreaM2 !== null
                        ? UNMEASURED_REASON_TEXT[measurement.unmeasured.grossFloorAreaM2]
                        : 'the total could not be measured.',
                )} The storeys above are the ones it could measure; they are not a substitute for the total.</div>`;

        const summary = refusedCount === 0
            ? 'Built area by storey'
            : `Built area by storey — ${refusedCount} of ${rows.length} not measured`;
        return fold(PER_LEVEL_SECTION_TESTID, state, escHtml(summary), body + totalRow);
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// §BCN-OV-CITATION (L-1656) — WHICH ARTICLE a `block-constructed` envelope cites
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The source caption for a `block-constructed` determination.
 *
 * ⚠ WHY THIS IS A BRANCH AND NOT A STRING. The card hard-coded *"Constructed per PGM Art. 242.2
 * from the real Catastro block"* for EVERY `block-constructed` envelope. That sentence is true
 * for the Art. 242.2 *profunditat edificable* construction and FALSE for the clau-18 OV arm
 * (L-1660..L-1663), which constructs from the published per-site volumetric ordering — a
 * different instrument, different articles. Printing 242.2 there is an L-583-class
 * MIS-CITATION: the wrong article attached to a real, correctly-solved determination, on the
 * one surface whose entire proposition is that it quotes the law correctly. A wrong citation is
 * worse than none — it is checkable, and it fails the check.
 *
 * The discriminator is the ENGINE'S OWN declaration, not a zone-code guess: the OV path emits
 * an `explicitArea.footprintBinding` derivation row (ZoningRulesEngine, §L-572 stamps
 * `block-constructed` off exactly that row) and no other path does. Reading the derivation
 * means a new city that constructs the same way inherits the correct caption automatically,
 * and a path that stops emitting the row stops claiming the citation — the citation and the
 * evidence move together, which is the property a hard-coded string cannot have.
 *
 * Pure: returns TEXT, not markup, so the caller keeps its own escaping/wrapping (C08 §3.1).
 */
export function resolveBlockConstructedSourceText(
    derivation: ReadonlyArray<{ readonly constraint: string }> | null | undefined,
): string {
    const span = _tracer.startSpan('pryzm.site.resolveBlockConstructedSourceText');
    try {
        const isPublishedSiteOrdering = Array.isArray(derivation)
            && derivation.some((d) => d?.constraint === 'explicitArea.footprintBinding');
        span.setAttribute('pryzm.envelopeCard.blockConstructedArm',
            isPublishedSiteOrdering ? 'published-site-ordering' : 'art-242-2');
        return isPublishedSiteOrdering
            ? 'Constructed from the published per-site volumetric ordering (AMB Refós OV_Trames; '
              + 'PGM Art. 306 + Art. 327.2) — real published inputs + accepted rule, not an '
              + 'official municipal certificate.'
            : 'Constructed per PGM Art. 242.2 from the real Catastro block — real inputs + '
              + 'accepted rule, not an official municipal certificate.';
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// §GIS-LEGACY-DETERMINATION-ESCAPE (L-1970..L-1974) — the REDUCED card's way OUT
// ─────────────────────────────────────────────────────────────────────────────
//
// Founder 2026-08-21, on production `071a7b2c`: *"I requested to have all the data of the
// selected parcel: many more data — why is it still not present on an OLD project?"*
//
// ⭐ THE FEATURE IS IN HIS BUILD. `a54a49fd` (L-1650..L-1656) is an ancestor of the SHA he is
// running. The rich sections — Designed vs permitted · How these were measured · Full site &
// massing data (which is where the "many more data ABOUT THE PARCEL" actually lives, §L-586:
// depth, perimeter, bounding box, per-storey massing, with sources) · Why these numbers? — all
// hang off the SOLVED determination. On a project saved BEFORE L-1654,
// `Parcel.buildableDetermination` is `null`, `getLastBuildableEnvelope()` is `null` after any
// reload, and `refreshEnvelopePanel` therefore takes the L-445 REDUCED arm, which renders the
// saved ring's max height and NOTHING else.
//
// The reduced card was already HONEST — L-1652 made it NAME every withheld section. It was
// UNACTIONABLE, which is a different defect and the one the founder actually hit: its only
// stated route forward was *"Re-commit the parcel"*, i.e. go to the 2D map and re-select the
// plot. That is a GEOMETRY-TOUCHING action offered as the fix for a PROVENANCE gap, and it is
// exactly the [[refusing-half-needs-its-escape-hatch]] / §L-942 shape — a refusing branch whose
// escape hatch is knowledge the user does not have.
//
// ⛔ AND THE SAFE ROUTE ALREADY EXISTED. §L-1587 built `pryzmRecomputeEnvelopeCard` →
// `reapplyZoningForActiveSite`, which re-solves against the ALREADY-COMMITTED boundary and
// never touches geometry (its own docstring says so, and says why re-calling
// `dispatchParcelBoundary` instead would silently re-rotate a hand-drawn ring). It was wired
// to ONE surface only: the sibling branch where there is no card at all. The branch that
// actually fires for the founder's projects — ring persisted, determination null — never got
// it. Two arms of one refusal, one escape hatch between them.
//
// Since L-1654, that recompute also PERSISTS the full `BuildableDeterminationRecord` through
// the same `site.updateZoning` write that persists the ring (P6). So one click does not merely
// repaint: it RETIRES this legacy arm for the project, permanently. That is why the button
// belongs here and not a schema migration — the determination is not recoverable data, it is
// RE-DERIVABLE data, and re-deriving it is a user-initiated, explicit act.
//
// ── THE HONESTY THIS BUILDER IS RESPONSIBLE FOR ─────────────────────────────────
//
//  1. **The original solve is GONE and cannot be recovered.** Its values, citations and
//     confidence were never written. Saying "restore" or "refresh" would imply otherwise.
//  2. **What the button produces is a NEW determination, dated TODAY, from TODAY's rule pack.**
//     L-1654's rule is that a stored snapshot must never be presented as freshly derived; the
//     INVERSE binds equally — a fresh re-solve must never be presented as the recovered
//     original. A rule pack that changed between the two dates would make them different
//     answers, and nothing on the card could tell them apart.
//  3. **It may legitimately REFUSE.** Re-solving can produce a cited refusal, and a refusal is
//     a determination (C63). The copy promises a determination, never a positive one.
//  4. **An unavailable route says WHY and renders DISABLED** — the L-1187 honest-unavailability
//     rule — rather than a live-looking button that does nothing.

/** `data-testid` on the reduced card's legacy notice. */
export const LEGACY_NOTICE_TESTID = 'envelope-legacy-notice';
/** `data-testid` on the escape-hatch button the notice carries. */
export const LEGACY_RECOMPUTE_BTN_TESTID = 'envelope-legacy-recompute-btn';
/** The button's label. A verb that promises what actually happens — solve, then store.
 *  Deliberately free of `&`: the label is escaped like every other interpolation (C08 §3.1),
 *  so an ampersand here would render as `&amp;` in the markup and make the constant and the
 *  DOM disagree for anything asserting on it. */
export const LEGACY_RECOMPUTE_LABEL = 'Solve and store the full determination';

/**
 * §GIS-LEGACY-DETERMINATION-ESCAPE (L-1971) — the REDUCED card's amber notice, with its
 * escape hatch. Pure string builder; the caller wires the button by its testid.
 *
 * Three `data-state` arms, deliberately distinct (C84 EI-1b — failure, emptiness and
 * "fetched under an older schema" must not present identically):
 *   · `legacy-recompute-available`   — the route resolves; the button is live.
 *   · `legacy-recompute-unavailable` — no site context / no committed boundary to re-solve
 *                                      against; button DISABLED, reason shown.
 *   · `legacy-recompute-failed`      — the user pressed it and the re-solve could not run.
 *
 * `escHtml` is applied to every interpolated runtime string; everything else is author-written
 * static markup (§XSS-SINK-SCAN, C08 §3.1).
 */
export function buildLegacyDeterminationNoticeHtml(opts: {
    readonly recomputeAvailable: boolean;
    readonly unavailableReason?: string | null;
    readonly failedReason?: string | null;
}): string {
    const span = _tracer.startSpan('pryzm.site.buildLegacyDeterminationNoticeHtml');
    try {
        const failed = typeof opts.failedReason === 'string' && opts.failedReason.length > 0;
        const state = failed
            ? 'legacy-recompute-failed'
            : (opts.recomputeAvailable ? 'legacy-recompute-available' : 'legacy-recompute-unavailable');
        span.setAttribute('pryzm.envelopeCard.legacyArm', state);

        // The action. Live, disabled-with-reason, or replaced by a stated failure — never a
        // live-looking control with no effect, and never silence.
        let safeAction: string;
        if (failed) {
            safeAction =
                '<div data-testid="' + LEGACY_RECOMPUTE_BTN_TESTID + '-failed" style="margin-top:7px;'
                + 'background:#fdecec;color:#8a1f1f;border-radius:6px;padding:5px 7px;font-size:9.5px;line-height:1.45;">'
                + '<b>The re-solve could not run.</b> ' + escHtml(opts.failedReason)
                + ' Nothing was changed — the saved envelope shape above is untouched, and no '
                + 'determination was stored.'
                + '</div>';
        } else if (opts.recomputeAvailable) {
            safeAction =
                '<button type="button" data-testid="' + LEGACY_RECOMPUTE_BTN_TESTID + '"'
                + ' title="Re-runs the buildability determination against the parcel boundary already'
                + ' committed to this project, then stores it. Does not move, redraw or re-derive the boundary."'
                + ' style="margin-top:7px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;'
                + 'padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#ffffff;color:#6600FF;">'
                + escHtml(LEGACY_RECOMPUTE_LABEL) + '</button>';
        } else {
            const reason = opts.unavailableReason
                ?? 'This project has no committed parcel boundary to re-solve against.';
            safeAction =
                '<button type="button" disabled aria-disabled="true"'
                + ' data-testid="' + LEGACY_RECOMPUTE_BTN_TESTID + '"'
                + ' title="' + escHtml(reason) + '"'
                + ' style="margin-top:7px;width:100%;appearance:none;border:1px solid #d8d3e6;cursor:not-allowed;'
                + 'padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#f4f2f8;color:#8a83a0;">'
                + escHtml(LEGACY_RECOMPUTE_LABEL) + '</button>'
                + '<div style="margin-top:4px;font-size:9.5px;line-height:1.4;color:#6b6480;">'
                + escHtml(reason) + '</div>';
        }

        return '<div data-testid="' + LEGACY_NOTICE_TESTID + '" data-state="' + state + '"'
            + ' style="margin-top:8px;color:#8a5a00;background:#fff6e5;border-radius:6px;'
            + 'padding:5px 7px;font-size:10px;line-height:1.5;min-width:0;max-width:100%;overflow-wrap:break-word;">'
            + 'Saved envelope <b>shape</b> only. This project was saved <b>before PRYZM stored full '
            + 'determinations</b>, so the values, citations and confidence of the original solve were '
            + 'never written down — they are <b>not recoverable</b>. Nothing was lost in this session, '
            + 'and nothing here is your doing.'
            + '<div style="margin-top:4px;">'
            + 'The <b>Designed-vs-permitted</b> check, <b>ordinance limits</b>, <b>massing potential</b>, '
            + 'the <b>per-storey table</b>, the <b>full site &amp; parcel data</b> and <b>&ldquo;Why these '
            + 'numbers?&rdquo;</b> all rest on that determination. They are deliberately not shown from the '
            + 'saved shape alone — rendering them from it would fabricate provenance.'
            + '</div>'
            + '<div style="margin-top:5px;">'
            + '<b>You can get them back for this project.</b> The button below re-solves against the '
            + 'parcel boundary <b>already committed here</b> — it does not move, redraw or re-derive '
            + 'the boundary — and stores the result, so the full card returns on every future load. '
            + '⚠ It produces a <b>new determination dated today, from today&rsquo;s rule pack</b>; it does '
            + 'not recover the original solve, and the two could differ. It may also return a cited '
            + '<b>refusal</b> — that is a determination too, and it will be stored and shown as one.'
            + '</div>'
            + safeAction
            + '</div>';
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// §OLDPROJ168 (L-12780..) — the "Stored determination" notice's OWN refresh escape hatch
// ─────────────────────────────────────────────────────────────────────────────
//
// Founder: an OLD project's envelope card read a STALE `source-data-unavailable` refusal
// (Aug 25) as if it were still true, and its ONLY stated route forward was "Re-commit the
// parcel" — a GEOMETRY-touching action prescribed for a PROVENANCE gap, exactly the
// [[refusing-half-needs-its-escape-hatch]] shape §GIS-LEGACY-DETERMINATION-ESCAPE already
// fixed for the "no determination at all" arm (above). This is the SAME fix for the other
// arm: a project that DOES carry a stored `BuildableDeterminationRecord` — full determination
// or cited refusal alike — but never re-asks the source on load (L-1654's own rule: "hydrate,
// never re-derive").
//
// ⚠ L-12440 is why this matters beyond tidiness: a stored `source-data-unavailable` can go
// STALE AND KNOWN-FALSE — the real answer for that exact parcel, queried live the same day,
// was the DURABLE `no-plan-at-point`. A transient-outage story told forever about a settled,
// correct refusal is worse than a missing feature (§CONTEXT-DATA-HONESTY): it is confidently
// wrong AND it prescribes a useless action ("try again" on an answer that cannot change).
//
// ⭐ DECISION (i) vs (ii): an EXPLICIT button, not an automatic re-derive on every load. An
// automatic re-derive would put a network call on the project-OPEN path (already a 179 s cold
// start) and would SILENTLY MUTATE a stored determination the user may be relying on. An
// explicit, honestly-worded button costs nothing until pressed and can never surprise.
//
// This is the ONE producer for the "Stored determination · [date]" line (C06 §13.3) — both the
// refusal-card template and the full-determination template in `GISAreaLayout.refreshEnvelopePanel`
// render it, and both wire the SAME button to the SAME `recomputeEnvelopeDetermination` the
// legacy notice above already uses: it re-solves against the boundary ALREADY COMMITTED to this
// project — never redrawing, never re-deriving project north — and PERSISTS whatever the source
// answers today, dated today (§GIS-ENVELOPE-DETERMINATION-PERSIST, L-1654), refusal included
// (C63 — a refusal is a correct answer, not a missing envelope). It never locally reinterprets
// the OLD determination; it only ever asks the source again.
export const STORED_DETERMINATION_TESTID = 'envelope-hydrated-at';
export const REFRESH_DETERMINATION_BTN_TESTID = 'envelope-refresh-determination-btn';
/** A verb that promises what actually happens — ask again, then store whatever comes back. */
export const REFRESH_DETERMINATION_LABEL = 'Re-check this parcel';

/**
 * The "Stored determination · [date]" notice, now carrying its own refresh escape hatch.
 * Three `data-state` arms (C84 EI-1b — distinct, never presented identically):
 *   · `refresh-available`   — the route resolves; the button is live.
 *   · `refresh-unavailable` — no site context / no committed boundary to re-check against;
 *                             button DISABLED, reason shown (L-1187 honest-unavailability).
 *   · `refresh-failed`      — the user pressed it and the re-check could not run.
 *
 * `escHtml` is applied to every interpolated runtime string; everything else is author-written
 * static markup (§XSS-SINK-SCAN, C08 §3.1).
 */
export function buildStoredDeterminationNoticeHtml(
    determinedAtIso: string,
    opts: {
        readonly refreshAvailable: boolean;
        readonly unavailableReason?: string | null;
        readonly failedReason?: string | null;
    },
): string {
    const span = _tracer.startSpan('pryzm.site.buildStoredDeterminationNoticeHtml');
    try {
        const d = new Date(determinedAtIso);
        const dateTxt = Number.isFinite(d.getTime())
            ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : determinedAtIso;
        const failed = typeof opts.failedReason === 'string' && opts.failedReason.length > 0;
        const state = failed
            ? 'refresh-failed'
            : (opts.refreshAvailable ? 'refresh-available' : 'refresh-unavailable');
        span.setAttribute('pryzm.envelopeCard.storedDeterminationArm', state);

        let safeAction: string;
        if (failed) {
            safeAction =
                `<div data-testid="${REFRESH_DETERMINATION_BTN_TESTID}-failed" style="margin-top:6px;`
                + `color:#8a1f1f;background:#fdecec;border-radius:6px;padding:5px 7px;font-size:9.5px;`
                + `line-height:1.45;"><b>The re-check could not run.</b> ${escHtml(opts.failedReason)} `
                + `Nothing was changed — the determination shown above is untouched.</div>`;
        } else if (opts.refreshAvailable) {
            safeAction =
                `<button type="button" data-testid="${REFRESH_DETERMINATION_BTN_TESTID}"`
                + ` title="Asks the planning source again for this parcel's boundary — already committed`
                + ` to this project — and stores whatever it answers, including a refusal. Does not move,`
                + ` redraw or re-derive the boundary."`
                + ` style="margin-top:6px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;`
                + `padding:5px 9px;border-radius:7px;font:600 10.5px system-ui;background:#ffffff;color:#6600FF;">`
                + `${escHtml(REFRESH_DETERMINATION_LABEL)}</button>`;
        } else {
            const reason = opts.unavailableReason
                ?? 'This project has no committed parcel boundary to re-check against.';
            safeAction =
                `<button type="button" disabled aria-disabled="true"`
                + ` data-testid="${REFRESH_DETERMINATION_BTN_TESTID}" title="${escHtml(reason)}"`
                + ` style="margin-top:6px;width:100%;appearance:none;border:1px solid #d8d3e6;cursor:not-allowed;`
                + `padding:5px 9px;border-radius:7px;font:600 10.5px system-ui;background:#f4f2f8;color:#8a83a0;">`
                + `${escHtml(REFRESH_DETERMINATION_LABEL)}</button>`;
        }

        return `<div data-testid="${STORED_DETERMINATION_TESTID}" data-state="${state}" style="margin-top:2px;`
            + `margin-bottom:6px;padding:5px 8px;border-radius:6px;background:#f3eeff;color:#6600FF;`
            + `font-size:10px;line-height:1.45;">`
            + `<b>Stored determination · ${escHtml(dateTxt)}.</b> Determined when the parcel was committed `
            + `and saved with this project — not automatically re-derived on load, so it may not reflect `
            + `PRYZM's current resolver.`
            + safeAction
            + `</div>`;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// §MANUALENV159 (L-12640) — Section (c): the CONTEXT-DERIVED / USER-SUPPLIED STUDY MASSING
// ─────────────────────────────────────────────────────────────────────────────
//
// The founder asked FOUR times why his Amsterdam demo parcel showed no envelope. §ENVAMS148
// built a massing study from real neighbour heights and SIG-NL2 opened its gate — but the
// resulting `ContextDerivedStudyEnvelope` (or its typed refusal) was only ever written to
// `contextDerivedStudyEnvelopeState.ts` "for a future rail panel to read". No rail panel read
// it. A refusal that cannot be distinguished from "nothing happened" is the exact
// §CONTEXT-DATA-HONESTY failure this repo exists to refuse — this section is that rail panel.
//
// TWO source arms produce the SAME `ContextDerivedStudyEnvelopeResult` shape
// (`heightBasis.method` discriminates `'median-neighbour-height'` vs `'user-supplied'` —
// see `@pryzm/schemas`'s `ContextDerivedStudyEnvelope`), so ONE renderer serves both — the
// C84 EI-9 reuse the founder's brief asked for, not a second card.

export const CONTEXT_STUDY_SECTION_TESTID = 'envelope-section-context-study';

/**
 * The context-derived / user-supplied study massing section — three arms, three distinct
 * `data-state` values (never a blank where there is something to say):
 *
 *  · `study === null`         — nothing was ever computed for this site (gate shut, jurisdiction
 *    not wired, or a fetch never landed). Absent section — mirrors `comparison === null` above.
 *  · `study.ok === false`     — a study was ATTEMPTED and REFUSED. Names how many neighbours were
 *    found, how many carried a REAL height, and the threshold — the exact numbers TASK A asked to
 *    surface, read off the card rather than a console timing line.
 *  · `study.ok === true`      — a study was built. Badge + wording DIFFER by `heightBasis.method`
 *    so a user-supplied height is never presented as measured or derived (§CONTEXT-DATA-HONESTY).
 *
 * Deliberately carries NO "Designed vs permitted" VERDICT and no ordinance citation — the
 * disclaimer on the object itself already states PRYZM cannot judge compliance against it; this
 * renderer adds no compliance claim the object does not already carry.
 *
 * §DVP170 (L-12820) — `measurement`, when given, adds ONE factual line: the authored design's
 * measured height next to the study's reference height. This is NOT a fourth `CapacityStatus`
 * arm and NEVER reuses `judge()`/the within-at-limit-over vocabulary — a study is not an
 * ordinance number (see `ContextDerivedStudyEnvelope`'s own header: "not a weaker
 * `estimated-ruleset` … it has no seat on that ladder at all"), so scoring it the same way would
 * launder a study into a compliance check by the back door. The line states both numbers, states
 * the basis in the SAME words the badge above it already uses (`Context-derived study` /
 * `Height supplied by you` — never re-derived, never re-worded), and says in the same breath that
 * this is not a compliance check. Absent when there is nothing designed to compare
 * (`measurement` is null, or its `heightM` is null — e.g. the topmost storey has no recorded
 * floor-to-floor height) — never rendered as "0 m designed".
 */
export function buildContextStudySectionHtml(
    study: ContextDerivedStudyEnvelopeResult | null,
    measurement: DesignMeasurement | null = null,
): string {
    const span = _tracer.startSpan('pryzm.site.buildContextStudySectionHtml');
    try {
        if (study === null) {
            span.setAttribute('pryzm.envelopeCard.studyArm', 'absent');
            return '';
        }
        if (!study.ok) {
            span.setAttribute('pryzm.envelopeCard.studyArm', `refused-${study.reason}`);
            const safeReason = study.reason === 'insufficient-neighbour-sample'
                ? `PRYZM looked for real neighbouring-building heights near this parcel and found `
                    + `<b>${escHtml(study.realSampleCount)}</b> with a real, measured or tagged height`
                    + (study.excludedAssumedCount > 0
                        ? ` (plus ${escHtml(study.excludedAssumedCount)} nearby whose only height was a `
                          + `fabricated placeholder — excluded, not counted as data)`
                        : '')
                    + `. A study needs at least <b>${escHtml(CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE)}</b> real `
                    + `samples to be a meaningful starting point, so PRYZM is not showing one here rather `
                    + `than averaging too few buildings into a false confidence.`
                : `PRYZM tried to build a study massing here, but the requested setback left no `
                    + `buildable area inside the parcel ring, so nothing could be drawn. Try a smaller `
                    + `setback.`;
            return fold(
                CONTEXT_STUDY_SECTION_TESTID,
                `refused-${study.reason}`,
                'Study massing — not enough data to build one',
                `<div data-testid="context-study-refused" style="color:#6b6480;background:#faf9fd;`
                + `border-radius:6px;padding:6px 8px;font-size:10px;line-height:1.5;">${safeReason}</div>`,
            );
        }
        const basis = study.study.heightBasis;
        const isUserSupplied = basis.method === 'user-supplied';
        span.setAttribute('pryzm.envelopeCard.studyArm', isUserSupplied ? 'rendered-user-supplied' : 'rendered-derived');
        const heightTxt = `${study.study.maxHeight_m.toFixed(1)} m`;
        const safeBasisLine = isUserSupplied
            ? `Height supplied by you`
              + (basis.method === 'user-supplied'
                  ? ` on ${escHtml(formatStudyDate(basis.sampledAtIso))}.`
                  : '.')
            : (basis.method === 'median-neighbour-height'
                ? `Median of <b>${escHtml(basis.sampledCount)}</b> nearby building${basis.sampledCount === 1 ? '' : 's'} `
                  + `with a real height, within ${escHtml(basis.radius_m)} m`
                  + (basis.excludedAssumedCount > 0
                      ? ` (${escHtml(basis.excludedAssumedCount)} more excluded as fabricated placeholders)`
                      : '')
                  + '.'
                : '');
        const safeBadge = isUserSupplied
            ? `<span data-testid="context-study-badge" style="display:inline-block;padding:2px 8px;`
              + `border-radius:999px;background:#fff6e8;color:#9a6414;font-weight:700;font-size:9.5px;`
              + `letter-spacing:.03em;text-transform:uppercase;margin-bottom:6px;">Height supplied by you</span>`
            : `<span data-testid="context-study-badge" style="display:inline-block;padding:2px 8px;`
              + `border-radius:999px;background:#f3eeff;color:#6600FF;font-weight:700;font-size:9.5px;`
              + `letter-spacing:.03em;text-transform:uppercase;margin-bottom:6px;">Context-derived study</span>`;
        // §DVP170 (L-12820) — the ONE factual line comparing what was AUTHORED to this study's
        // reference height. NEVER a `CapacityStatus` chip (within/at-limit/over/unknown/no-limit)
        // — those are reserved for a real `BuildableEnvelope` judged by `buildCapacityComparison`,
        // and reusing them here would dress a study in the same visual vocabulary as an ordinance
        // check. Neutral colour, no red/green/amber "verdict" tone; the basis label is the exact
        // text the badge above already renders, never re-derived. Absent (never "0 m designed")
        // when nothing on the authored model could be measured.
        const designedHeightM = measurement?.design.heightM ?? null;
        let safeDesignComparison = '';
        if (designedHeightM !== null) {
            const studyHeightM = study.study.maxHeight_m;
            const deltaM = studyHeightM - designedHeightM;
            const EPS = 0.05; // mirrors CAPACITY_AT_LIMIT_BAND_M2_OR_M — "equal" for a 5 cm band.
            const deltaTxt = Math.abs(deltaM) <= EPS
                ? 'exactly at this study reference'
                : deltaM > 0
                    ? `${escHtml(deltaM.toFixed(1))} m below this study reference`
                    : `${escHtml(Math.abs(deltaM).toFixed(1))} m above this study reference`;
            const safeBasisLabel = isUserSupplied ? 'Height supplied by you' : 'Context-derived study';
            safeDesignComparison = `<div data-testid="context-study-vs-designed" style="margin-top:8px;padding:6px 8px;`
                + `border-radius:6px;background:#faf9fd;border:1px dashed #d8d3e6;">`
                + `<div style="font-weight:700;font-size:10px;color:#3d4a5c;">Designed vs this study — reference only</div>`
                + `<div style="margin-top:2px;color:#3d4a5c;font-size:10.5px;line-height:1.5;">`
                + `Your design measures <b>${escHtml(designedHeightM.toFixed(1))} m</b> tall, `
                + `${deltaTxt} (<b>${escHtml(studyHeightM.toFixed(1))} m</b>, ${escHtml(safeBasisLabel)}).`
                + `</div>`
                + `<div style="margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.45;">`
                + `This is NOT a compliance check. Basis: ${escHtml(isUserSupplied ? 'user-supplied' : 'context-derived study')} `
                + `— indicative only; ${escHtml(isUserSupplied ? 'a height you typed' : 'a median of real neighbour heights')} `
                + `is not an ordinance limit, and PRYZM cannot judge compliance against it.`
                + `</div></div>`;
        }
        return fold(
            CONTEXT_STUDY_SECTION_TESTID,
            isUserSupplied ? 'rendered-user-supplied' : 'rendered-derived',
            `Study massing — ${escHtml(heightTxt)}${isUserSupplied ? ' (supplied by you)' : ''}`,
            `<div>${safeBadge}</div>`
            + `<div style="color:#3d4a5c;font-size:10.5px;line-height:1.5;">${safeBasisLine}</div>`
            + `<div style="margin-top:6px;color:#8a83a0;font-size:9.5px;line-height:1.5;">${escHtml(study.study.disclaimer)}</div>`
            + safeDesignComparison,
        );
    } finally {
        span.end();
    }
}

/** ISO datetime → a short human date, tolerant of a malformed string (never throws into the card). */
function formatStudyDate(iso: string): string {
    const d = new Date(iso);
    return Number.isFinite(d.getTime())
        ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : iso;
}

// ─────────────────────────────────────────────────────────────────────────────
// §MANUALENV159 (L-12640) — Section (d): the STUDY-HEIGHT ENTRY FORM
// ─────────────────────────────────────────────────────────────────────────────

export const STUDY_HEIGHT_INPUT_TESTID = 'envelope-study-height-input';
export const STUDY_HEIGHT_SETBACK_INPUT_TESTID = 'envelope-study-height-setback-input';
export const STUDY_HEIGHT_SAVE_BTN_TESTID = 'envelope-study-height-save-btn';
export const STUDY_HEIGHT_STATUS_TESTID = 'envelope-study-height-status';

/**
 * The "type a height for a study massing" input — the founder's own request, taken literally:
 * *"if you dont know add this: 24.5 meters on this parcel."* Prefills from `current` (the
 * project-persisted decision, if one exists) so re-opening the card shows what was last saved,
 * not a blank field that looks like nothing was ever typed.
 *
 * Pure markup only — `GISAreaLayout.ts`'s `wireStudyHeightEntry` attaches the click handler that
 * calls `applyUserSuppliedStudyHeight` and re-renders the card (C06 §13.3 — one producer).
 */
export function buildStudyHeightEntryHtml(
    current: UserSuppliedStudyHeightRecord | null,
): string {
    const span = _tracer.startSpan('pryzm.site.buildStudyHeightEntryHtml');
    try {
        span.setAttribute('pryzm.envelopeCard.studyEntryHasSaved', current !== null);
        const heightAttr = current ? ` value="${escHtml(current.heightM)}"` : '';
        const setbackAttr = ` value="${escHtml(current ? current.setbackM : 0)}"`;
        return `<div data-testid="envelope-study-height-entry" style="margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;">
             <div style="font-weight:700;font-size:10.5px;color:#6600FF;">Don't know the height? Type one for a study massing.</div>
             <div style="margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;">This is YOUR number, not a measurement — it will be labelled &ldquo;supplied by you&rdquo; and PRYZM still cannot judge compliance against it.</div>
             <div style="display:flex;gap:6px;margin-top:6px;align-items:flex-end;">
               <div style="flex:1;min-width:0;">
                 <label style="display:block;font-size:9px;color:#8a83a0;">Height (m)</label>
                 <input data-testid="${STUDY_HEIGHT_INPUT_TESTID}" type="number" min="1" max="250" step="0.1"${heightAttr} placeholder="e.g. 24.5" style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;" />
               </div>
               <div style="width:68px;flex:none;">
                 <label style="display:block;font-size:9px;color:#8a83a0;">Setback (m)</label>
                 <input data-testid="${STUDY_HEIGHT_SETBACK_INPUT_TESTID}" type="number" min="0" step="0.1"${setbackAttr} style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;" />
               </div>
             </div>
             <button type="button" data-testid="${STUDY_HEIGHT_SAVE_BTN_TESTID}" style="margin-top:6px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#faf9fd;color:#6600FF;">
               Build study from this height
             </button>
             <div data-testid="${STUDY_HEIGHT_STATUS_TESTID}" style="min-height:14px;margin-top:4px;font-size:9.5px;color:#8a83a0;"></div>
           </div>`;
    } finally {
        span.end();
    }
}


// ════════════════════════════════════════════════════════════════════════════════════════════
// §RESI-ORCH-TARGET-AREA (lane RESI-ORCH, 2026-09-04) — STR §5's target GROUND-FLOOR AREA entry.
//
// The §MANUALENV159 height entry above is this section's proven sibling and its deliberate
// opposite. That one appears on the REFUSAL card, because a typed height stands in for a
// measurement PRYZM could not find. This one appears ONLY on the full-determination card, because
// a target area is meaningless — and, worse, unrefusable — without a permitted footprint to
// measure it against. §5's whole ask is the refusal: *"refuse with BOTH numbers when it exceeds
// the permitted footprint."* You cannot state both numbers if you only have one.
// ════════════════════════════════════════════════════════════════════════════════════════════

export const TARGET_AREA_INPUT_TESTID = 'envelope-target-area-input';
export const TARGET_AREA_SOLVE_BTN_TESTID = 'envelope-target-area-solve-btn';
export const TARGET_AREA_CLEAR_BTN_TESTID = 'envelope-target-area-clear-btn';
export const TARGET_AREA_STATUS_TESTID = 'envelope-target-area-status';

/**
 * The target-area entry, plus the standing statement of whatever is currently proposed.
 *
 * ⛔ FOUR `data-state` ARMS, NEVER TWO — the same discipline the four folds above use, for the
 * same reason: a REFUSAL and an EMPTY field must not render as one another.
 *   · `empty`     — nothing asked yet;
 *   · `proposed`  — a plate is on the ground, and the line says what was ACHIEVED;
 *   · `refused`   — PRYZM said no, and the line carries the numbers it said no from;
 *   · `no-footprint` — unreachable: the card has no permitted footprint, so the control is not
 *                     offered at all. It renders as a stated reason, never as a live box that
 *                     will always refuse (a control that can only fail is a dead click with a
 *                     text cursor in it).
 *
 * @param permittedAreaM2  the card's ONE permitted-footprint number (`permittedStudyFigures`), so
 *                         the placeholder and the refusal cannot cite a different figure from the
 *                         row six lines above them (C06 §13.3).
 * @param statement        the last solver statement — proposal or refusal — or null.
 * @param refused          whether `statement` is a refusal. Passed rather than parsed: sniffing a
 *                         verdict out of prose is how a refusal comes to render as a success.
 * @param currentTargetM2  what the user last typed, so a re-render does not blank their entry.
 */
export function buildTargetAreaEntryHtml(
    permittedAreaM2: number | null,
    statement: string | null,
    refused: boolean,
    currentTargetM2: number | null,
): string {
    const span = _tracer.startSpan('pryzm.site.buildTargetAreaEntryHtml');
    try {
        const hasFootprint = permittedAreaM2 !== null && permittedAreaM2 > 0;
        span.setAttribute('pryzm.envelopeCard.targetAreaHasFootprint', hasFootprint);
        const state = !hasFootprint
            ? 'no-footprint'
            : statement === null
                ? 'empty'
                : refused
                    ? 'refused'
                    : 'proposed';
        span.setAttribute('pryzm.envelopeCard.targetAreaState', state);

        const head = `<div data-testid="envelope-target-area-entry" data-state="${state}" style="margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;">
             <div style="font-weight:700;font-size:10.5px;color:#6600FF;">Know the ground floor you want? Type the area.</div>`;

        if (!hasFootprint) {
            // The honest unreachable arm. Saying WHY beats offering a box that can only ever say no.
            return head
                + `<div style="margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;">PRYZM has not solved a buildable footprint for this parcel, so there is nothing to fit a target area inside. A target only means something measured against a permitted footprint.</div>
                 </div>`;
        }

        const valueAttr = currentTargetM2 !== null && Number.isFinite(currentTargetM2)
            ? ` value="${escHtml(currentTargetM2)}"`
            : '';
        // ⚠ The permitted figure is stated IN the control, not only in the refusal. A user who can
        // see the ceiling before they type is far less likely to need to be refused at all — which
        // is the difference between guiding a human and correcting one.
        const statusColour = refused ? '#8a5a00' : '#6b6480';
        const statusHtml = statement === null
            ? ''
            : `<div data-testid="${TARGET_AREA_STATUS_TESTID}" data-state="${refused ? 'refused' : 'proposed'}" style="margin-top:5px;font-size:9.5px;line-height:1.45;color:${statusColour};background:${refused ? '#fdf8ee' : '#faf9fd'};border-left:2px solid ${refused ? '#c9973a' : '#6600FF'};padding:4px 6px;border-radius:0 5px 5px 0;">${escHtml(statement)}</div>`;

        return head
            + `<div style="margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;">PRYZM will set a plate of that size inside the permitted footprint (${escHtml(permittedAreaM2.toFixed(0))} m²) and tell you what it actually achieved. A STUDY of what fits — not a permit.</div>
             <div style="display:flex;gap:6px;margin-top:6px;align-items:flex-end;">
               <div style="flex:1;min-width:0;">
                 <label style="display:block;font-size:9px;color:#8a83a0;">Ground-floor area (m²)</label>
                 <input data-testid="${TARGET_AREA_INPUT_TESTID}" type="number" min="1" step="1"${valueAttr} placeholder="e.g. 120" style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;font:600 11px system-ui;" />
               </div>
             </div>
             <div style="display:flex;gap:6px;margin-top:6px;">
               <button type="button" data-testid="${TARGET_AREA_SOLVE_BTN_TESTID}" style="flex:1;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#faf9fd;color:#6600FF;">
                 Fit this on the ground floor
               </button>
               <button type="button" data-testid="${TARGET_AREA_CLEAR_BTN_TESTID}" style="flex:none;appearance:none;border:1px solid #d8d3e6;cursor:pointer;padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#ffffff;color:#8a83a0;">
                 Clear
               </button>
             </div>
             ${statusHtml}
           </div>`;
    } finally {
        span.end();
    }
}
