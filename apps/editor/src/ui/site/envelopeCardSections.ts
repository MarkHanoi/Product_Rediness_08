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
