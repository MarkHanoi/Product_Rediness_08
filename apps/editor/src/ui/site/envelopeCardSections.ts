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
import type { CapacityComparison } from '@pryzm/site-parcel-data';
import {
    buildCapacitySectionHtml,
    renderMeasurementCaveatLinesHtml,
    resolveCapacityVerdict,
} from './capacityPanelSection';
import type { DesignMeasurement } from './designMeasurement';

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
