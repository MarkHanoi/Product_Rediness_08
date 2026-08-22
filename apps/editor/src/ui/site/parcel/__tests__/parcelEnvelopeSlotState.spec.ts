/**
 * §PARCEL-ALL-INFO (L-6905..L-6909) — the five states of the Parcel panel's envelope slot.
 *
 * ⭐ WHAT THESE ARMS ARE FOR. `window.pryzmMountEnvelopeCard` returns a BOOLEAN, and `false`
 * has four different causes that call for four different user actions. The GIS panel's
 * existing empty state collapses three of them into one sentence — which, during the
 * founder's MEASURED 6–11 s window, is actively wrong: it says nothing has been determined
 * while a determination is running.
 *
 * A suite that only checked "some text appears" would pass over exactly that collapse. So
 * every arm here is a DISTINGUISHABILITY arm: no two causes may produce the same sentence,
 * and no arm may produce a figure.
 */

import { describe, it, expect } from 'vitest';

import {
    resolveParcelEnvelopeSlotState,
    parcelEnvelopeSlotText,
    parcelEnvelopeSlotOffersRecompute,
    parcelEnvelopeResolvingNoticeApplies,
    PARCEL_ENVELOPE_RESOLVING_OVER_CARD_TEXT,
    type ParcelEnvelopeSlotState,
} from '../parcelEnvelopeSlotState.js';

const ALL_STATES: readonly ParcelEnvelopeSlotState[] = [
    'card-present', 'no-boundary', 'resolving', 'stalled', 'settled-without-envelope',
];

describe('§PARCEL-ALL-INFO — the state decision', () => {
    it('a PRESENT card wins unconditionally, whatever the phase says', () => {
        // The card IS the answer when it is on screen. A "resolving" sentence replacing it
        // would hide the figures the founder asked to see, which is the opposite of the ask.
        for (const phase of ['idle', 'resolving', 'stalled'] as const) {
            expect(resolveParcelEnvelopeSlotState({
                cardPresent: true, hasCommittedBoundary: true, resolutionPhase: phase,
            })).toBe('card-present');
        }
    });

    it('NO BOUNDARY is decided before the phase — a leftover phase cannot describe a parcel that is gone', () => {
        expect(resolveParcelEnvelopeSlotState({
            cardPresent: false, hasCommittedBoundary: false, resolutionPhase: 'resolving',
        })).toBe('no-boundary');
        expect(resolveParcelEnvelopeSlotState({
            cardPresent: false, hasCommittedBoundary: false, resolutionPhase: 'stalled',
        })).toBe('no-boundary');
    });

    it('committed + in flight is RESOLVING — the state that did not exist', () => {
        expect(resolveParcelEnvelopeSlotState({
            cardPresent: false, hasCommittedBoundary: true, resolutionPhase: 'resolving',
        })).toBe('resolving');
    });

    it('committed + expired is STALLED, distinct from "the answer was none"', () => {
        // ⛔ These two are the pair most tempting to merge, and merging them is the
        // [[context-data-honesty-family]] defect: "we could not reach an answer" and "the
        // answer is that nothing applies" are opposite facts about the user's land.
        expect(resolveParcelEnvelopeSlotState({
            cardPresent: false, hasCommittedBoundary: true, resolutionPhase: 'stalled',
        })).toBe('stalled');
        expect(resolveParcelEnvelopeSlotState({
            cardPresent: false, hasCommittedBoundary: true, resolutionPhase: 'idle',
        })).toBe('settled-without-envelope');
    });
});

describe('§PARCEL-ALL-INFO — no two causes share a sentence', () => {
    it('every non-card state has its own, non-empty text', () => {
        const texts = ALL_STATES.filter((s) => s !== 'card-present').map(parcelEnvelopeSlotText);
        expect(new Set(texts).size).toBe(texts.length);
        for (const t of texts) expect(t.length).toBeGreaterThan(40);
    });

    it('card-present renders no sentence at all', () => {
        expect(parcelEnvelopeSlotText('card-present')).toBe('');
    });

    it('⛔ NO arm renders a figure, a zero, or a bare dash', () => {
        // C58 §1.16 / §L-616 — an unknown constraint drawn as a value is an overstatement on
        // real land, and these values are legally loaded (heights, setbacks and FAR cited to
        // PGM articles). "not measured" and "measured as none" are different statements.
        for (const s of ALL_STATES) {
            const t = parcelEnvelopeSlotText(s);
            expect(t).not.toMatch(/\b0(\.0+)?\s*(m|m²|%)\b/);
            expect(t).not.toMatch(/—\s*(m|m²|%)/);
        }
    });

    it('the RESOLVING sentence separates what is FINAL from what is not', () => {
        // The cadastral half above it is committed and final; only the ordinance half is
        // outstanding. Saying "loading" over the whole panel would understate what is known.
        const t = parcelEnvelopeSlotText('resolving');
        expect(t).toMatch(/cadastral facts above\s+are final/i);
        expect(t).toMatch(/not shown as zeros or dashes/i);
    });

    it('the STALLED sentence says a failure is NOT an answer', () => {
        const t = parcelEnvelopeSlotText('stalled');
        expect(t).toMatch(/did not complete/i);
        expect(t).toMatch(/not an answer/i);
    });

    it('the SETTLED-WITHOUT-ENVELOPE sentence says a refusal IS an answer', () => {
        // §L-553 — half of Barcelona's buildable land lands on a coverage-gap refusal. If it
        // reads as "broken" rather than "determined", a labelled correct answer has been
        // traded for an apparent product failure, which is strictly worse.
        const t = parcelEnvelopeSlotText('settled-without-envelope');
        expect(t).toMatch(/a determination, not a failure/i);
    });

    it('every non-card sentence carries a route out (C82 §1.2)', () => {
        expect(parcelEnvelopeSlotText('no-boundary')).toMatch(/Select a plot on the 2D map/i);
        expect(parcelEnvelopeSlotText('resolving')).toMatch(/takes a few seconds/i);
        expect(parcelEnvelopeSlotText('stalled')).toMatch(/Recompute below/i);
        expect(parcelEnvelopeSlotText('settled-without-envelope')).toMatch(/Recompute below/i);
    });
});

describe('§PARCEL-ALL-INFO — the escape hatch is offered where it helps and withheld where it harms', () => {
    it('offers recompute on STALLED and SETTLED-WITHOUT-ENVELOPE', () => {
        expect(parcelEnvelopeSlotOffersRecompute('stalled')).toBe(true);
        expect(parcelEnvelopeSlotOffersRecompute('settled-without-envelope')).toBe(true);
    });

    it('⛔ withholds it while RESOLVING — pressing it would manufacture the §L-644 race', () => {
        // A recompute during the window restarts a chain that is already running. Per
        // §STALE-ASYNC-ZONING (L-644) the older in-flight response then has to be discarded,
        // and that is the defect family whose symptom is "the purple volume sits on the
        // neighbouring plot". Offering the button there would invite the user to cause it.
        expect(parcelEnvelopeSlotOffersRecompute('resolving')).toBe(false);
    });

    it('withholds it with no boundary — there is nothing to recompute against', () => {
        expect(parcelEnvelopeSlotOffersRecompute('no-boundary')).toBe(false);
    });

    it('withholds it when the card is present', () => {
        expect(parcelEnvelopeSlotOffersRecompute('card-present')).toBe(false);
    });
});

describe('§PARCEL-ALL-INFO — the notice ABOVE a present card', () => {
    it('applies only while a card is present AND a better answer is in flight', () => {
        // ⭐ THE MEASUREMENT THAT FORCED THIS. `computeAndCacheEstimatedEnvelope` caches an
        // `estimated-ruleset` envelope on EVERY parcel commit, synchronously, BEFORE
        // `applyZoning` forks. So for the whole 6–11 s window the card is present and showing
        // the provisional fallback, not the cited determination still being fetched.
        expect(parcelEnvelopeResolvingNoticeApplies({ cardPresent: true, resolutionPhase: 'resolving' })).toBe(true);
    });

    it('does NOT apply to a settled estimated envelope', () => {
        // Outside every registered jurisdiction the estimated pack is the honest, badged
        // answer (C58 §1.6). Nothing better is coming for it, so a notice promising a
        // replacement would be false.
        expect(parcelEnvelopeResolvingNoticeApplies({ cardPresent: true, resolutionPhase: 'idle' })).toBe(false);
        expect(parcelEnvelopeResolvingNoticeApplies({ cardPresent: true, resolutionPhase: 'stalled' })).toBe(false);
    });

    it('does NOT apply when there is no card to sit above', () => {
        expect(parcelEnvelopeResolvingNoticeApplies({ cardPresent: false, resolutionPhase: 'resolving' })).toBe(false);
    });

    it('the notice points at the card’s own confidence badge rather than re-judging it', () => {
        // The card is the ONE surface entitled to characterise its own numbers; this notice
        // adds the one fact it cannot know (a better answer is on its way).
        expect(PARCEL_ENVELOPE_RESOLVING_OVER_CARD_TEXT).toMatch(/confidence badge/i);
        expect(PARCEL_ENVELOPE_RESOLVING_OVER_CARD_TEXT).toMatch(/provisional fallback/i);
    });
});
