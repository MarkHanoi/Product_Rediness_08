// STRUCTURAL-SEAM-4 (C57 §1.5 / C58 §1.13.8, §CONTEXT-DATA-HONESTY / L-422/457/467/469) — THE CI GATE.
//
// This suite is the merge-blocking invariant that a resolver may NEVER map a TRANSIENT fetch failure
// to a genuine-absence answer (or vice-versa). It drives the real explicit-area resolvers with an
// injected fetch and asserts the SHARED classification (`resolutionToFetchOutcome`) puts a failed
// fetch in `transient` and a clean-empty answer in `absent` — plus that the refusal builders wear the
// right code (`source-data-unavailable` = transient, `no-plan-at-point` = absent). If a future
// resolver clones the template and collapses the two, one of these fails.

import { describe, it, expect } from 'vitest';
import {
    resolveMadridNZ1Ring,
    resolveNlBestemmingsplan,
    MADRID_NZ1_RING_REF,
    NL_RING_REF,
    resolutionToFetchOutcome,
    isTransientFetchReason,
    TRANSIENT_FETCH_REASONS,
    retryWhileUnreachable,
    fetchFound,
    fetchAbsent,
    fetchTransient,
    isTransientOutcome,
    madridNZ1Refusal,
    madridNZ1AbsentRefusal,
    nlBestemmingsplanRefusal,
    nlNoPlanRefusal,
    dkPlandataNoPlanRefusal,
    dkPlandataUnreachableRefusal,
    type FetchOutcome,
} from '../src/index.js';

const PT = { lat: 40.4166, lon: -3.7038 };
const NL_PT = { lat: 52.0935, lon: 5.115 };

/** A fetch stub returning a NON-OK response (upstream 500) — the transient case. */
const failFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
/** A fetch stub returning 200 with an empty answer — the genuine-absence case. */
const emptyMadridFetch = (async () => ({ ok: true, json: async () => ({ features: [] }) })) as unknown as typeof fetch;
const emptyNlFetch = (async () => ({ ok: true, json: async () => ({ plan: null }) })) as unknown as typeof fetch;

describe('STRUCTURAL-SEAM-4 · the transient-reason table', () => {
    it('endpoint-unreachable (+ the network vocabulary) classify as TRANSIENT', () => {
        expect(isTransientFetchReason('endpoint-unreachable')).toBe(true);
        for (const r of TRANSIENT_FETCH_REASONS) expect(isTransientFetchReason(r)).toBe(true);
    });
    it('every GENUINE-ABSENCE reason classifies as NOT transient', () => {
        for (const r of ['no-plan', 'no-bouwvlak', 'no-feature', 'degenerate-geometry', 'no-point', 'ringref-mismatch']) {
            expect(isTransientFetchReason(r)).toBe(false);
        }
    });
});

describe('STRUCTURAL-SEAM-4 · the CI gate — a failed fetch is TRANSIENT, an empty answer is ABSENT', () => {
    it('Madrid: a non-OK upstream → transient (NEVER absent)', async () => {
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl: failFetch });
        const outcome = resolutionToFetchOutcome(res);
        expect(outcome.status).toBe('transient');
    });
    it('Madrid: a 200 empty answer → absent (NEVER transient)', async () => {
        const res = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, PT, { fetchImpl: emptyMadridFetch });
        const outcome = resolutionToFetchOutcome(res);
        expect(outcome.status).toBe('absent');
    });
    it('NL: a non-OK upstream → transient (NEVER absent)', async () => {
        const res = await resolveNlBestemmingsplan(NL_RING_REF, NL_PT, { fetchImpl: failFetch });
        const outcome = resolutionToFetchOutcome(res);
        expect(outcome.status).toBe('transient');
    });
    it('NL: a 200 answer with no plan → absent (NEVER transient)', async () => {
        const res = await resolveNlBestemmingsplan(NL_RING_REF, NL_PT, { fetchImpl: emptyNlFetch });
        const outcome = resolutionToFetchOutcome(res);
        expect(outcome.status).toBe('absent');
    });
});

describe('STRUCTURAL-SEAM-4 · refusal codes carry the transient-vs-absent truth', () => {
    it('transient refusals use source-data-unavailable', () => {
        expect(madridNZ1Refusal().code).toBe('source-data-unavailable');
        expect(nlBestemmingsplanRefusal().code).toBe('source-data-unavailable');
        expect(dkPlandataUnreachableRefusal().code).toBe('source-data-unavailable');
    });
    it('genuine-absence refusals use the distinct no-plan-at-point code', () => {
        expect(madridNZ1AbsentRefusal().code).toBe('no-plan-at-point');
        expect(nlNoPlanRefusal().code).toBe('no-plan-at-point');
        expect(dkPlandataNoPlanRefusal().code).toBe('no-plan-at-point');
    });
    it('an absent refusal offers no retry affordance (no "try again" in its detail)', () => {
        for (const r of [madridNZ1AbsentRefusal(), nlNoPlanRefusal(), dkPlandataNoPlanRefusal()]) {
            expect(r.detail.toLowerCase()).not.toContain('try again');
            expect(r.detail.toLowerCase()).toContain('will not change on a retry');
        }
    });
});

describe('STRUCTURAL-SEAM-4 · retryWhileUnreachable — bounded, transient-only', () => {
    const noSleep = { attempts: 3, baseDelayMs: 0, sleepImpl: async () => {} };

    it('retries a transient up to `attempts`, then surfaces the last transient', async () => {
        let n = 0;
        const out = await retryWhileUnreachable<number>(async () => {
            n++;
            return fetchTransient('endpoint-unreachable');
        }, noSleep);
        expect(n).toBe(3); // exactly `attempts` calls — bounded, never infinite
        expect(isTransientOutcome(out)).toBe(true);
    });

    it('self-heals: a transient that recovers on the 2nd attempt returns found, no more calls', async () => {
        let n = 0;
        const out = await retryWhileUnreachable<number>(async () => {
            n++;
            return n === 1 ? fetchTransient('endpoint-unreachable') : fetchFound(42);
        }, noSleep);
        expect(n).toBe(2);
        expect(out).toEqual({ status: 'found', value: 42 });
    });

    it('does NOT retry an absent (a durable answer) — returns immediately', async () => {
        let n = 0;
        const out: FetchOutcome<number> = await retryWhileUnreachable<number>(async () => {
            n++;
            return fetchAbsent('no-plan');
        }, noSleep);
        expect(n).toBe(1); // absent is not retried — re-asking would loop for ever
        expect(out.status).toBe('absent');
    });
});
