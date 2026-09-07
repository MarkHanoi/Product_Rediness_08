// §ENVELOPE-NOT-A-GATE (L-13041 · C58 §1.20 · founder ruling L-13032) — WHAT THE BUILDABLE-
// ENVELOPE CARD SAYS WHEN THERE IS NO ENVELOPE.
//
// Founder, verbatim (2026-09-06): *"having an envelope should not be the single pre-requisite to
// advance on going through the parcel law process — the user still should be able to."*
//
// ── THE DEFECT THIS MODULE EXISTS TO END ───────────────────────────────────────────────────
// `GISAreaLayout.refreshEnvelopePanel` used to end its no-envelope branch with
// `parentElement.removeChild(envelopePanel); envelopePanel = null; return;` — it REMOVED the
// card element. The design-stage strip's `Do this next: {stage} →` button is a FOLD OF THAT
// CARD, so a null envelope took the entire next-step affordance with it and the user could not
// advance. That is the founder's complaint, executed literally, one day after he ruled on it.
//
// ⛔ C58 §1.20 clause 4, WHICH IS THE WHOLE DESIGN OF THIS FILE: **a `null` envelope is a STATE
// TO RENDER, not a branch to skip.** The card stays, and it says WHAT IS MISSING and WHAT WOULD
// SUPPLY IT.
//
// ── ⛔ THE THREE NULLS ARE DISTINGUISHED AT THE READ, AND THERE ARE ACTUALLY SIX ────────────
// §1.20 clause 4 names three readers that today return the same falsy value — *"no envelope"*,
// *"not yet computed"*, and *"the runtime was null"* — and requires them to be told apart at the
// read, because collapsing them is exactly what L-13002 cost: `createMainLayout(props, null)`
// hands a NULL runtime BY DESIGN, so a reader of the bare captured prop answered "not ready" on
// every production session whatever had been committed.
//
// Measuring the code rather than transcribing the clause, the falsy case decomposes into SIX,
// because this subsystem already models the in-flight window (`envelopeResolutionState.ts`,
// §PARCEL-ALL-INFO) and already refuses to fold it into "nothing here":
//
//   runtime-unreachable   neither the captured runtime NOR `window.runtime` resolved
//                         → a statement about PRYZM, never about the land
//   no-parcel             no committed ≥3-point boundary — nothing to determine anything ABOUT
//   resolving             committed, a determination is IN FLIGHT inside its deadline
//   stalled               committed, the deadline blew and no answer ever landed
//   not-yet-computed      committed, idle, nothing computed this session and nothing stored
//   none-without-reason   a determination returned `status:'none'` and stated NO reason
//
// ⭐ THE SEVENTH CASE IS NOT HERE ON PURPOSE. *"The ordinance grants no private buildable
// envelope here"* is a REFUSAL — a POSITIVE, cited answer under C58 §1.13 — and it has its own
// card, which renders its citation and keeps every affordance. §1.20 clause 2 is explicit that
// gating the process on that answer *"converts C58's most carefully-built honest answer into a
// dead end"*. Nothing in this file may be used to render a refusal.
//
// ── WHAT STAYS AVAILABLE (§1.20 clause 3) ──────────────────────────────────────────────────
// Parcel identity, cadastral attributes, ownership, area, the room programme and the brief are
// envelope-INDEPENDENT and remain fully available. Only permitted volume, storeys against a
// permitted height and %-of-permitted are envelope-derived, and they STATE THAT DEPENDENCY
// rather than disabling their host. Every arm below prints that sentence, because a user looking
// at an absent envelope is precisely the user who needs to be told the rest still works.
//
// PURE STRING BUILDERS — no DOM, no store, no clock, no I/O; the same extraction pattern as
// `envelopeCardSections.ts`, so every arm of every state is pinned by a unit test instead of
// asserted in a comment. `GISAreaLayout` stays the ONE producer (C06 §13.3): it reads the state,
// calls this, and wires the controls.
//
// P4 — no globals. P6 — renders only; dispatches nothing. P8 — exported functions open spans.
// C08 §3.1 — every interpolated runtime string routes through the local `escHtml`.

import { trace } from '@opentelemetry/api';
import type { EnvelopeResolutionPhase } from './envelopeResolutionState';

const _tracer = trace.getTracer('pryzm.site.envelopeAbsenceCard');

/** Local HTML escaper — the guard this file declares for itself (C08 §3.1). */
function escHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
    ));
}

/** `data-testid` on the absence card's body. Carries `data-state="<kind>"`. */
export const ENVELOPE_ABSENCE_TESTID = 'envelope-absence-state';
/** `data-testid` on the "solve it now" escape hatch. */
export const ENVELOPE_ABSENCE_SOLVE_BTN_TESTID = 'envelope-absence-solve-btn';
/** `data-testid` on the line where a failed solve explains itself. */
export const ENVELOPE_ABSENCE_STATUS_TESTID = 'envelope-absence-status';
/** The solve button's label. A verb that promises what actually happens. */
export const ENVELOPE_ABSENCE_SOLVE_LABEL = 'Solve the envelope for this parcel';

/**
 * WHY there is no envelope on this card, told apart AT THE READ (C58 §1.20 clause 4).
 *
 * ⛔ Closed union. A seventh cause must be added HERE, with its own chip, headline, missing-thing
 * and supplying-action — the type error at every `switch` is the feature, and is what stops a new
 * cause being silently absorbed into an existing sentence (the §CONTEXT-DATA-HONESTY conflation).
 */
export type EnvelopeAbsenceKind =
    | 'runtime-unreachable'
    | 'no-parcel'
    | 'resolving'
    | 'stalled'
    | 'not-yet-computed'
    | 'none-without-reason';

/** The evidence the classifier decides from. Every field is read by the caller, never guessed. */
export interface EnvelopeAbsenceInputs {
    /**
     * Did a runtime resolve AT ALL — `runtime ?? window.runtime`, never the captured prop alone?
     *
     * ⛔ THIS FIELD IS L-13002 IN ONE BOOLEAN. `createMainLayout(props, null)` hands GISAreaLayout
     * a null runtime BY DESIGN and the composed runtime lives at `window.runtime`; a caller that
     * passes `runtime !== null` here re-creates the exact defect §1.20 clause 4 names.
     */
    readonly runtimeReachable: boolean;
    /** A committed C19 parcel boundary of >= 3 vertices exists. */
    readonly hasCommittedParcel: boolean;
    /** `getEnvelopeResolutionPhase()` — the in-flight window this subsystem already models. */
    readonly resolutionPhase: EnvelopeResolutionPhase;
    /**
     * TRUE when a `BuildableEnvelope` object DID come back and carried `status: 'none'` with NO
     * `refusal` — i.e. the determination ran and returned nothing without saying why. Distinct
     * from "nothing ran": one is a gap in PRYZM's answer, the other is an answer never asked for.
     */
    readonly envelopeReturnedNoneWithoutReason: boolean;
}

/**
 * ⭐ THE DECISION. Deterministic, total, and ORDERED so no two causes can be reported as one.
 *
 * The ordering is the load-bearing part:
 *   1. An unreachable runtime is checked FIRST because every other input was read through it —
 *      answering "no parcel" from a store we could not open would be a finding about the user's
 *      project manufactured out of a gap in PRYZM's wiring.
 *   2. No committed parcel is checked BEFORE the phase, so a leftover in-flight record from a
 *      previous parcel cannot print "resolving" for a parcel that does not exist (the rule
 *      `resolveParcelEnvelopeSlotState` already established, copied rather than reinvented).
 *   3. `resolving` / `stalled` outrank the two settled arms: while an answer is genuinely coming,
 *      "nothing has been computed" is not merely stale, it is wrong.
 */
export function classifyEnvelopeAbsence(inputs: EnvelopeAbsenceInputs): EnvelopeAbsenceKind {
    const span = _tracer.startSpan('pryzm.site.classifyEnvelopeAbsence');
    try {
        const kind: EnvelopeAbsenceKind =
            !inputs.runtimeReachable ? 'runtime-unreachable'
            : !inputs.hasCommittedParcel ? 'no-parcel'
            : inputs.resolutionPhase === 'resolving' ? 'resolving'
            : inputs.resolutionPhase === 'stalled' ? 'stalled'
            : inputs.envelopeReturnedNoneWithoutReason ? 'none-without-reason'
            : 'not-yet-computed';
        span.setAttribute('pryzm.envelopeAbsence.kind', kind);
        return kind;
    } finally {
        span.end();
    }
}

/** The uppercase chip each arm wears in the card header. Never red — none of these is an error. */
export const ENVELOPE_ABSENCE_CHIP: Readonly<Record<EnvelopeAbsenceKind, { label: string; title: string }>> =
    Object.freeze({
        'runtime-unreachable': {
            label: 'Not read',
            title: 'PRYZM could not reach this project’s model from this panel. A gap in PRYZM, not a fact about your land.',
        },
        'no-parcel': {
            label: 'No parcel yet',
            title: 'No parcel boundary is committed, so there is nothing to determine an envelope against.',
        },
        resolving: {
            label: 'Resolving',
            title: 'A determination is running for this parcel and an answer is expected.',
        },
        stalled: {
            label: 'No answer',
            title: 'A determination was launched for this parcel and never landed.',
        },
        'not-yet-computed': {
            label: 'Not computed',
            title: 'No determination has been made for this parcel yet — PRYZM has not asked the ordinance about it.',
        },
        'none-without-reason': {
            label: 'No reason given',
            title: 'A determination returned nothing and did not state why. A gap in PRYZM’s answer, not a finding about your land.',
        },
    });

/** What each arm leads with — the missing thing, in the founder's own terms. */
const HEADLINE: Readonly<Record<EnvelopeAbsenceKind, string>> = Object.freeze({
    'runtime-unreachable':
        'PRYZM could not read this project’s model from this panel, so it cannot say anything about a buildable envelope.',
    'no-parcel':
        'No parcel is committed yet, so there is nothing for a buildable envelope to be determined against.',
    resolving:
        'The buildable envelope for this parcel is being determined right now.',
    stalled:
        'The buildable-envelope determination for this parcel was launched and never landed.',
    'not-yet-computed':
        'This parcel has a committed boundary, but no buildable determination has been made for it — not in this session, and none is stored.',
    'none-without-reason':
        'A determination ran for this parcel and returned nothing, without stating why.',
});

/** What is missing, said precisely — never a generic "not yet". */
const MISSING: Readonly<Record<EnvelopeAbsenceKind, string>> = Object.freeze({
    'runtime-unreachable':
        'What is missing is PRYZM’s own connection to the project model in this session — not data about your land. '
        + 'This says nothing whatsoever about whether the parcel is buildable, and no figure has been withheld from you.',
    'no-parcel':
        'What is missing is a committed parcel boundary. Every determination is made against a plot, and no plot has been '
        + 'committed to this project yet.',
    resolving:
        'The cadastral facts for this parcel are already final. The ordinance figures are still being fetched from the '
        + 'jurisdiction, and are deliberately not shown as zeros or dashes while they are unknown.',
    stalled:
        'What is missing is an answer. The determination chain did not complete, so nothing has been determined about what '
        + 'may be built here — and no figure is shown in place of one.',
    'not-yet-computed':
        'What is missing is the determination itself. ⚠ This is NOT a finding that no envelope applies: that answer is a '
        + 'cited REFUSAL under C58 §1.13, it is a positive result, and it renders as its own card.',
    'none-without-reason':
        'What is missing is the REASON. A result with no stated reason is a gap in PRYZM’s answer, not a finding about your '
        + 'land — an honest "nothing applies here" always arrives with its citation.',
});

/** What would supply it — the escape hatch every refusing arm owes the user (C82 §1.2 / L-942). */
const SUPPLY: Readonly<Record<EnvelopeAbsenceKind, string>> = Object.freeze({
    'runtime-unreachable':
        'Re-open the project, or reload the editor, and this panel will read the model again.',
    'no-parcel':
        'Select a cadastral parcel or draw a boundary on the 2D map, then commit it — the determination runs on commit.',
    resolving:
        'Nothing to do; the answer replaces this card when it lands. This normally takes a few seconds.',
    stalled:
        'Run it again against the same committed boundary with the button below. Nothing is redrawn and the boundary is not touched.',
    'not-yet-computed':
        'Solve it against the boundary already committed here with the button below — or, if you already know the height you '
        + 'want to study, type it in below and PRYZM will build a study massing from your number.',
    'none-without-reason':
        'Ask the source again with the button below. If it answers the same way, the study-height entry below still lets you '
        + 'carry on with a massing of your own.',
});

/**
 * ⛔ THE CLAUSE-3 SENTENCE, PRINTED ON EVERY ARM. The user looking at an absent envelope is
 * exactly the user who must be told that the rest of the parcel-law process is unaffected —
 * otherwise the card reports an absence and the user infers a dead end, which is the founder's
 * complaint restored by tone instead of by code.
 */
export const ENVELOPE_ABSENCE_NOT_A_GATE_TEXT =
    'This does not stop you. Parcel identity, cadastral attributes, ownership, area, the room programme and the brief do not '
    + 'depend on an envelope and are all still available. Only permitted volume, storeys against a permitted height and '
    + 'percentage-of-permitted are derived from it — those state their dependency, and nothing else is disabled.';

/**
 * The absence card's BODY: chip context, what is missing, what would supply it, the clause-3
 * assurance, and — where it can honestly run — the solve escape hatch.
 *
 * The caller assembles this between the card header and the study-height entry / design-stage
 * strip / visibility toggle, exactly as `renderReducedEnvelopePanel` assembles the reduced arm.
 *
 * ⛔ THE SOLVE BUTTON IS LIVE, DISABLED-WITH-REASON, OR ABSENT — NEVER LIVE-AND-INERT. The
 * L-1187 honest-unavailability rule, copied from `buildLegacyDeterminationNoticeHtml` rather
 * than re-decided. It is ABSENT on `runtime-unreachable` and `resolving`: there is no model to
 * solve against in the first case, and in the second a second launch would make the running
 * chain's response the stale one that §STALE-ASYNC-ZONING (L-644) exists to prevent.
 *
 * @param kind                    from `classifyEnvelopeAbsence`
 * @param opts.solveAvailable     can `reapplyZoningForActiveSite` actually run here?
 * @param opts.solveUnavailableReason  why not, in words, when it cannot
 */
export function buildEnvelopeAbsenceBodyHtml(
    kind: EnvelopeAbsenceKind,
    opts: {
        readonly solveAvailable: boolean;
        readonly solveUnavailableReason?: string | null;
    },
): string {
    const span = _tracer.startSpan('pryzm.site.buildEnvelopeAbsenceBodyHtml');
    try {
        span.setAttribute('pryzm.envelopeAbsence.kind', kind);
        // ⛔ NOT offered on these two arms — see this function's header. Stated as a table rather
        // than an `if` chain at the call site so the reason travels with the decision.
        const offersSolve = kind !== 'runtime-unreachable' && kind !== 'resolving';
        span.setAttribute('pryzm.envelopeAbsence.offersSolve', offersSolve);

        let safeAction = '';
        if (offersSolve && opts.solveAvailable) {
            safeAction =
                '<button type="button" data-testid="' + ENVELOPE_ABSENCE_SOLVE_BTN_TESTID + '"'
                + ' title="Runs the buildability determination against the parcel boundary already committed to this'
                + ' project. Does not move, redraw or re-derive the boundary."'
                + ' style="margin-top:8px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;'
                + 'padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#ffffff;color:#6600FF;">'
                + escHtml(ENVELOPE_ABSENCE_SOLVE_LABEL) + '</button>';
        } else if (offersSolve) {
            const reason = opts.solveUnavailableReason
                ?? 'PRYZM cannot reach a site context for this project in this session, so the determination cannot be run from here.';
            safeAction =
                '<button type="button" disabled aria-disabled="true"'
                + ' data-testid="' + ENVELOPE_ABSENCE_SOLVE_BTN_TESTID + '"'
                + ' title="' + escHtml(reason) + '"'
                + ' style="margin-top:8px;width:100%;appearance:none;border:1px solid #d8d3e6;cursor:not-allowed;'
                + 'padding:6px 10px;border-radius:8px;font:600 11px system-ui;background:#f4f2f8;color:#8a83a0;">'
                + escHtml(ENVELOPE_ABSENCE_SOLVE_LABEL) + '</button>'
                + '<div style="margin-top:4px;font-size:9.5px;line-height:1.4;color:#6b6480;">' + escHtml(reason) + '</div>';
        }

        return '<div data-testid="' + ENVELOPE_ABSENCE_TESTID + '" data-state="' + escHtml(kind) + '"'
            + ' style="min-width:0;max-width:100%;overflow-wrap:break-word;">'
            + '<div style="font-weight:600;font-size:11.5px;color:#3d4a5c;line-height:1.4;">'
            + escHtml(HEADLINE[kind]) + '</div>'
            + '<div style="margin-top:6px;color:#6b6480;font-size:11px;line-height:1.5;">'
            + escHtml(MISSING[kind]) + '</div>'
            + '<div style="margin-top:6px;color:#6b6480;font-size:11px;line-height:1.5;"><b>What would supply it:</b> '
            + escHtml(SUPPLY[kind]) + '</div>'
            + safeAction
            + '<div data-testid="' + ENVELOPE_ABSENCE_STATUS_TESTID + '"'
            + ' style="min-height:12px;margin-top:4px;font-size:9.5px;line-height:1.4;color:#8a5a00;"></div>'
            + '<div style="margin-top:9px;padding:6px 8px;background:#f3eeff;border-radius:6px;color:#4b3a7a;'
            + 'font-size:10px;line-height:1.5;">' + escHtml(ENVELOPE_ABSENCE_NOT_A_GATE_TEXT) + '</div>'
            + '</div>';
    } finally {
        span.end();
    }
}
