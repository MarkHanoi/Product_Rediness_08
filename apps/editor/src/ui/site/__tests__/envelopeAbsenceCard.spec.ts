// §ENVELOPE-NOT-A-GATE (L-13041 · C58 §1.20 · founder ruling L-13032) — the no-envelope card.
//
// ⛔ WHAT THESE TESTS EXIST TO STOP COMING BACK: `refreshEnvelopePanel` used to answer a null
// envelope with `removeChild(envelopePanel)`. The design-stage strip's "Do this next" button is a
// fold of that card, so the user's route forward disappeared with the envelope — the founder's
// ruling violated verbatim, one day after he made it.
//
// The two properties pinned here are the two §1.20 clauses that a re-write would break first:
//   · clause 4 — the SIX causes of a falsy envelope are told apart AT THE READ, and the
//     `runtime-unreachable` arm is checked FIRST so a store we could not open never produces a
//     finding about the user's project (the L-13002 shape);
//   · clause 3 — every arm prints that the rest of the parcel-law process is NOT gated.

import { describe, expect, it } from 'vitest';
import {
    buildEnvelopeAbsenceBodyHtml,
    classifyEnvelopeAbsence,
    ENVELOPE_ABSENCE_CHIP,
    ENVELOPE_ABSENCE_NOT_A_GATE_TEXT,
    ENVELOPE_ABSENCE_SOLVE_BTN_TESTID,
    ENVELOPE_ABSENCE_STATUS_TESTID,
    ENVELOPE_ABSENCE_TESTID,
    type EnvelopeAbsenceInputs,
    type EnvelopeAbsenceKind,
} from '../envelopeAbsenceCard';

const ALL_KINDS: readonly EnvelopeAbsenceKind[] = [
    'runtime-unreachable', 'no-parcel', 'resolving', 'stalled', 'not-yet-computed', 'none-without-reason',
];

/** A fully-determinable session: runtime up, parcel committed, nothing in flight, nothing computed. */
const SETTLED: EnvelopeAbsenceInputs = Object.freeze({
    runtimeReachable: true,
    hasCommittedParcel: true,
    resolutionPhase: 'idle',
    envelopeReturnedNoneWithoutReason: false,
});

describe('classifyEnvelopeAbsence — C58 §1.20 clause 4, the nulls told apart at the read', () => {
    it('answers `not-yet-computed` for a committed parcel with nothing computed', () => {
        expect(classifyEnvelopeAbsence(SETTLED)).toBe('not-yet-computed');
    });

    it('answers `none-without-reason` when a determination returned nothing and said why nothing', () => {
        expect(classifyEnvelopeAbsence({ ...SETTLED, envelopeReturnedNoneWithoutReason: true }))
            .toBe('none-without-reason');
    });

    it('answers `no-parcel` before any phase — a stale in-flight record cannot describe a parcel that is not there', () => {
        expect(classifyEnvelopeAbsence({
            ...SETTLED, hasCommittedParcel: false, resolutionPhase: 'resolving',
        })).toBe('no-parcel');
    });

    it('separates `resolving` from `stalled` from `not-yet-computed` — three answers, never one', () => {
        expect(classifyEnvelopeAbsence({ ...SETTLED, resolutionPhase: 'resolving' })).toBe('resolving');
        expect(classifyEnvelopeAbsence({ ...SETTLED, resolutionPhase: 'stalled' })).toBe('stalled');
        expect(classifyEnvelopeAbsence({ ...SETTLED, resolutionPhase: 'idle' })).toBe('not-yet-computed');
    });

    it('⛔ answers `runtime-unreachable` FIRST, whatever every other input says (the L-13002 shape)', () => {
        // Every other field is set to the value that would otherwise produce a FINDING about the
        // user's project. None of them may win: they were all read through a runtime we did not have.
        expect(classifyEnvelopeAbsence({
            runtimeReachable: false,
            hasCommittedParcel: false,
            resolutionPhase: 'stalled',
            envelopeReturnedNoneWithoutReason: true,
        })).toBe('runtime-unreachable');
    });
});

describe('buildEnvelopeAbsenceBodyHtml — a state to render, not a branch to skip', () => {
    it('renders a body carrying its own kind as `data-state`, for every kind', () => {
        for (const kind of ALL_KINDS) {
            const html = buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: true });
            expect(html).toContain(`data-testid="${ENVELOPE_ABSENCE_TESTID}"`);
            expect(html).toContain(`data-state="${kind}"`);
            expect(html.length).toBeGreaterThan(200);
        }
    });

    it('⛔ prints the §1.20 clause-3 "this does not stop you" text on EVERY arm', () => {
        for (const kind of ALL_KINDS) {
            const html = buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: false, solveUnavailableReason: 'x' });
            // Escaped in the markup; assert on a distinctive unescaped fragment plus the export's identity.
            expect(ENVELOPE_ABSENCE_NOT_A_GATE_TEXT).toContain('This does not stop you');
            expect(html).toContain('This does not stop you');
            expect(html).toContain('the room programme and the brief do not');
        }
    });

    it('says WHAT WOULD SUPPLY IT on every arm — a refusal without its escape hatch is L-942', () => {
        for (const kind of ALL_KINDS) {
            expect(buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: true }))
                .toContain('What would supply it:');
        }
    });

    it('offers the solve button live when the route resolves', () => {
        const html = buildEnvelopeAbsenceBodyHtml('not-yet-computed', { solveAvailable: true });
        expect(html).toContain(`data-testid="${ENVELOPE_ABSENCE_SOLVE_BTN_TESTID}"`);
        expect(html).not.toContain('disabled aria-disabled');
    });

    it('renders the button DISABLED WITH ITS REASON rather than live-and-inert (L-1187)', () => {
        const reason = 'This project has no committed parcel boundary to re-solve against.';
        const html = buildEnvelopeAbsenceBodyHtml('no-parcel', { solveAvailable: false, solveUnavailableReason: reason });
        expect(html).toContain('disabled aria-disabled="true"');
        expect(html).toContain(reason);
    });

    it('⛔ offers NO solve button while resolving (a second launch manufactures the L-644 race) or with no runtime', () => {
        for (const kind of ['resolving', 'runtime-unreachable'] as const) {
            const html = buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: true });
            expect(html).not.toContain(`data-testid="${ENVELOPE_ABSENCE_SOLVE_BTN_TESTID}"`);
        }
    });

    it('always emits the status line, so a failed solve has somewhere to speak', () => {
        for (const kind of ALL_KINDS) {
            expect(buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: true }))
                .toContain(`data-testid="${ENVELOPE_ABSENCE_STATUS_TESTID}"`);
        }
    });

    it('⛔ renders NO number, dash or zero standing in for a value (C58 §1.16 / §L-616)', () => {
        for (const kind of ALL_KINDS) {
            const html = buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: true });
            // ⚠ THE TEST IS ABOUT A VALUE SLOT, NOT ABOUT PUNCTUATION. An em-dash inside a
            // sentence is prose; an em-dash that is an element's WHOLE content is a placeholder a
            // reader completes as "zero", which is the §L-616 overstatement. Assert the second and
            // not the first, or the honest copy has to be written badly to pass.
            expect(html).not.toMatch(/>\s*[—–-]\s*</);
            const prose = html.replace(/<[^>]*>/g, ' ');
            expect(prose).not.toMatch(/\d+(\.\d+)?\s*(m|m²|m2|%)\b/);
        }
    });

    it('gives every kind a distinct, non-empty chip — no two causes wear one label', () => {
        const labels = ALL_KINDS.map((k) => ENVELOPE_ABSENCE_CHIP[k].label);
        expect(new Set(labels).size).toBe(ALL_KINDS.length);
        for (const k of ALL_KINDS) {
            expect(ENVELOPE_ABSENCE_CHIP[k].label.length).toBeGreaterThan(0);
            expect(ENVELOPE_ABSENCE_CHIP[k].title.length).toBeGreaterThan(20);
        }
    });

    it('escapes the reason it is handed (C08 §3.1)', () => {
        const html = buildEnvelopeAbsenceBodyHtml('no-parcel', {
            solveAvailable: false,
            solveUnavailableReason: '<img src=x onerror="alert(1)">',
        });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('⛔ never ASSERTS a refusal — "no envelope applies" is a POSITIVE cited answer with its own card', () => {
        for (const kind of ALL_KINDS) {
            const prose = buildEnvelopeAbsenceBodyHtml(kind, { solveAvailable: true }).replace(/<[^>]*>/g, ' ');
            // The phrase MAY appear, and on `not-yet-computed` it does — but only inside the
            // sentence that DENIES it ("This is NOT a finding that no envelope applies"), which is
            // the §1.13 distinction this card exists to keep. Any other occurrence would be this
            // card usurping the refusal card's cited answer.
            for (const m of prose.matchAll(/no envelope applies/gi)) {
                expect(prose.slice(0, m.index)).toMatch(/NOT a finding that $/);
            }
            expect(prose).not.toMatch(/unbuildable/i);
            expect(prose).not.toMatch(/cannot be built/i);
        }
    });
});
