/**
 * §PARCEL-ALL-INFO (L-6900..L-6906) — the RESOLVING phase.
 *
 * ⭐ WHAT THESE ARMS ARE FOR. The founder's measured window is 6–11 s wide, and the whole
 * risk of adding a "resolving" state is that it becomes a spinner nobody can stop — the
 * §L-716 shape ([[unsatisfiable-gate-decomposition-is-the-fix]]): a condition that can
 * never become false. So the assertions that matter are not "does it say resolving" —
 * they are "can it ever STOP saying resolving", by both routes, without a settle call.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
    beginEnvelopeResolution,
    noteEnvelopeResolutionSettled,
    resetEnvelopeResolutionState,
    getEnvelopeResolutionPhase,
    msUntilEnvelopeResolutionDeadline,
    describeEnvelopeResolutionState,
    ENVELOPE_RESOLUTION_DEADLINE_MS,
} from '../envelopeResolutionState.js';

/** A clock the test drives, so nothing here waits on real time. */
function clockAt(ms: number): () => number {
    return () => ms;
}

describe('§PARCEL-ALL-INFO — the three phases', () => {
    beforeEach(() => { resetEnvelopeResolutionState(); });

    it('is IDLE before anything is launched', () => {
        expect(getEnvelopeResolutionPhase(clockAt(0))).toBe('idle');
        expect(msUntilEnvelopeResolutionDeadline(clockAt(0))).toBeNull();
    });

    it('is RESOLVING immediately after a launch', () => {
        beginEnvelopeResolution(32, clockAt(1_000));
        expect(getEnvelopeResolutionPhase(clockAt(1_000))).toBe('resolving');
    });

    it('is still RESOLVING across the founder’s MEASURED 11441 ms', () => {
        // ⭐ THE REGRESSION THAT MATTERS. His Barcelona parcel took 11441 ms end-to-end
        // (6395 ms of it residual await on the manzana block fetch). A deadline set near
        // that number would flip a HEALTHY resolve to "stalled" and turn a working feature
        // into an apparent failure — the §L-553 trade this codebase already regretted once.
        beginEnvelopeResolution(32, clockAt(0));
        expect(getEnvelopeResolutionPhase(clockAt(11_441))).toBe('resolving');
    });

    it('becomes STALLED at the deadline, with NO settle call — the §L-716 arm', () => {
        // ⛔ THIS IS THE ARM THAT MAKES THE STATE HONEST. `applyZoning` forks into ~15
        // per-city chains whose guards and `catch` blocks do not all reach
        // `dispatchEnvelope`. If the phase depended on a settle arriving, a chain that
        // died would leave "resolving" on screen for the rest of the session.
        beginEnvelopeResolution(32, clockAt(0));
        expect(getEnvelopeResolutionPhase(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS - 1))).toBe('resolving');
        expect(getEnvelopeResolutionPhase(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS))).toBe('stalled');
        expect(getEnvelopeResolutionPhase(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS * 10))).toBe('stalled');
    });

    it('the deadline is comfortably above the measured worst case, not near it', () => {
        // Pins the RELATIONSHIP, not the literal: a future tune may move the constant, but
        // moving it below the measured resolve time is the mistake this arm exists to catch.
        expect(ENVELOPE_RESOLUTION_DEADLINE_MS).toBeGreaterThan(11_441 * 2);
    });

    it('a settle returns it to IDLE — and idle is NOT stalled', () => {
        beginEnvelopeResolution(32, clockAt(0));
        noteEnvelopeResolutionSettled();
        // The distinction is load-bearing: `idle` means "no question outstanding" and the
        // panel reads the store for whether an answer exists; `stalled` means "a question
        // was asked and never answered" and carries an escape hatch.
        expect(getEnvelopeResolutionPhase(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS * 5))).toBe('idle');
    });

    it('a SECOND launch supersedes the first rather than queueing behind it', () => {
        // §L-644 (§STALE-ASYNC-ZONING) already discards the older chain's late response, so
        // the phase must follow the NEWEST parcel. If it followed the oldest outstanding
        // request, selecting parcel B would inherit A's already-expired deadline and B would
        // render "stalled" the instant it was committed.
        beginEnvelopeResolution(32, clockAt(0));
        beginEnvelopeResolution(8, clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS + 5_000));
        expect(getEnvelopeResolutionPhase(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS + 5_000))).toBe('resolving');
        expect(describeEnvelopeResolutionState(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS + 5_000)))
            .toMatchObject({ boundaryVertexCount: 8 });
    });

    it('a BACKWARD clock reports resolving, never a fabricated stall', () => {
        // A system time change or a test clock reset yields a negative elapsed. Inventing a
        // stall from a clock artefact would report a failure that did not happen — the
        // [[context-data-honesty-family]] rule pointed at our own instrument.
        beginEnvelopeResolution(32, clockAt(10_000));
        expect(getEnvelopeResolutionPhase(clockAt(0))).toBe('resolving');
    });
});

describe('§PARCEL-ALL-INFO — the deadline countdown drives ONE timer, not a poll', () => {
    beforeEach(() => { resetEnvelopeResolutionState(); });

    it('reports the remaining ms while resolving and null when idle', () => {
        expect(msUntilEnvelopeResolutionDeadline(clockAt(0))).toBeNull();
        beginEnvelopeResolution(4, clockAt(0));
        expect(msUntilEnvelopeResolutionDeadline(clockAt(1_000)))
            .toBe(ENVELOPE_RESOLUTION_DEADLINE_MS - 1_000);
    });

    it('clamps to 0 rather than going negative — a setTimeout(-n) fires immediately anyway', () => {
        beginEnvelopeResolution(4, clockAt(0));
        expect(msUntilEnvelopeResolutionDeadline(clockAt(ENVELOPE_RESOLUTION_DEADLINE_MS + 9_999))).toBe(0);
    });
});

describe('§PARCEL-ALL-INFO — C13 project scope', () => {
    it('reset drops the record, so project A’s resolve cannot describe project B', () => {
        beginEnvelopeResolution(32, clockAt(0));
        resetEnvelopeResolutionState();
        expect(getEnvelopeResolutionPhase(clockAt(1_000))).toBe('idle');
        expect(describeEnvelopeResolutionState(clockAt(1_000)))
            .toMatchObject({ phase: 'idle', startedAtMs: null, boundaryVertexCount: null });
    });
});
