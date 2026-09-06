// ─────────────────────────────────────────────────────────────────────────────
// §CTX-READ-RETRY (L-12937) — a TRANSIENT baked-tile read failure must be retried before anything
// falls through to live Overpass, and an honest EMPTY must never be retried at all.
//
// THE INCIDENTS THIS PINS (founder, 2026-09-05: "I NEED CONSISTENCY"):
//   • Jouy-en-Josas — the console carried `§CTX-PMTILES-READER landuse/parks/rail/trees/water … from
//     baked tile(s)` lines and NO `roads` line, then
//     `§OVERPASS-CLIENT-FAILOVER — the proxy reported ALL upstream mirrors failed (429/timeout)`.
//     The founder saw NO ROADS.
//   • Amsterdam, the same day — landuse/parks/rail/tree tile reads failed while a bake was
//     PUBLISHING to R2, i.e. the reads were racing the upload (503 / rate-limit).
// One transient failure of a read against static CDN bytes fell straight through to the third party
// that L-513 proved cannot be made dependable — so a layer was missing on one load and present on
// the next. That INCONSISTENCY is the defect; the retry is the fix.
//
// WHAT THESE SPECS ARE ACTUALLY DEFENDING, and why the negative cases outnumber the positive one:
// a retry is only correct if it is opt-in BY EVIDENCE. Retrying an honest empty would re-ask the
// third party about "nothing is mapped here" (the L-467/L-469 failure-vs-empty conflation in a new
// coat); retrying a 404 would pay three round trips per load for an object that is not published;
// retrying an abort would fetch bytes for a request the user already replaced. So the classifier —
// not the loop — is the load-bearing part, and it is pinned kind by kind.
//
// Pure module: no network, no DOM, no pmtiles. Fake timers drive the back-off, so the suite spends
// no real wall time on a policy whose real delays are 400/1500/4000 ms.
// ─────────────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    BakedReadError,
    classifyBakedReadError,
    isRetryableBakedReadError,
    withBakedReadRetry,
    DEFAULT_BAKED_READ_ATTEMPTS,
    DEFAULT_BAKED_READ_DELAYS_MS,
    type BakedReadRetryEvent,
} from '../bakedReadRetry';
import {
    __setContextTilesBaseUrl,
    clearContextTileArchives,
    readContextTileFeatures,
    summariseTileFailures,
} from '../contextTiles';

/** The reader's own transport error text for an HTTP status — `RangeUrlFetchSource.fetchRange`. */
const httpError = (status: number): Error => new Error(`Bad response code: ${status}`);

describe('withBakedReadRetry (§CTX-READ-RETRY, L-12937)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('THE AMSTERDAM SHAPE: a 503 (read racing an R2 publish) is retried, and the second read wins', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(httpError(503))
            .mockResolvedValueOnce({ status: 'ok', features: ['a'] });

        const p = withBakedReadRetry(fn);
        await vi.runAllTimersAsync();

        await expect(p).resolves.toEqual({ status: 'ok', features: ['a'] });
        expect(fn).toHaveBeenCalledTimes(2);
        // The attempt number is passed through, so the caller can report what the answer cost.
        expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    });

    it('THE DOCTRINE: an honest EMPTY is a VALUE and is never retried', async () => {
        // `ok` with zero features is a REAL ANSWER ("nothing is mapped here"). Re-asking is the
        // §CONTEXT-DATA-HONESTY conflation (L-467/L-469) wearing a retry's clothes.
        const fn = vi.fn().mockResolvedValue({ status: 'ok', features: [], tilesRead: 25, tilesFailed: 0 });

        const p = withBakedReadRetry(fn);
        await vi.runAllTimersAsync();

        await expect(p).resolves.toMatchObject({ features: [] });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('a 404 is NOT PUBLISHED, not a hiccup — one attempt, rethrown unchanged', async () => {
        const err = httpError(404);
        const fn = vi.fn().mockRejectedValue(err);

        const caught = withBakedReadRetry(fn).catch((e: unknown) => e);
        await vi.runAllTimersAsync();

        expect(await caught).toBe(err);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('gives up after exactly 3 attempts and rethrows the LAST error', async () => {
        const first = httpError(502);
        const last = httpError(503);
        const fn = vi.fn()
            .mockRejectedValueOnce(first)
            .mockRejectedValueOnce(first)
            .mockRejectedValueOnce(last);

        const caught = withBakedReadRetry(fn).catch((e: unknown) => e);
        await vi.runAllTimersAsync();

        expect(await caught).toBe(last);
        expect(fn).toHaveBeenCalledTimes(DEFAULT_BAKED_READ_ATTEMPTS);
        expect(DEFAULT_BAKED_READ_ATTEMPTS).toBe(3);
    });

    it('onRetry is told the attempt, the total, the back-off and the error — once per retry', async () => {
        const events: BakedReadRetryEvent[] = [];
        const err = new Error('Failed to fetch');
        const fn = vi.fn().mockRejectedValue(err);

        const caught = withBakedReadRetry(fn, { onRetry: (e) => { events.push(e); } }).catch((e: unknown) => e);
        await vi.runAllTimersAsync();
        await caught;

        // Three attempts ⇒ TWO retries. The third failure is a give-up, not a retry.
        expect(events).toHaveLength(2);
        expect(events.map((e) => e.attempt)).toEqual([1, 2]);
        expect(events.every((e) => e.attempts === 3)).toBe(true);
        expect(events.map((e) => e.delayMs)).toEqual([DEFAULT_BAKED_READ_DELAYS_MS[0], DEFAULT_BAKED_READ_DELAYS_MS[1]]);
        expect(events.every((e) => e.error === err)).toBe(true);
    });

    it('the back-off really is the declared policy (400 ms, then 1500 ms of simulated time)', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(httpError(503))
            .mockRejectedValueOnce(httpError(503))
            .mockResolvedValueOnce('third time');
        const t0 = Date.now();

        const p = withBakedReadRetry(fn);
        await vi.runAllTimersAsync();

        await expect(p).resolves.toBe('third time');
        expect(Date.now() - t0).toBe(400 + 1500);
    });

    it('an ABORT during the back-off stops the retry — the caller already replaced this request', async () => {
        const ctrl = new AbortController();
        const fn = vi.fn().mockRejectedValue(httpError(503));

        const caught = withBakedReadRetry(fn, { signal: ctrl.signal }).catch((e: unknown) => e);
        // Let attempt 1 fail and enter the 400 ms back-off, then cancel mid-sleep.
        await vi.advanceTimersByTimeAsync(1);
        ctrl.abort();
        await vi.runAllTimersAsync();

        await caught;
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('a custom isRetryable overrides the classifier (the policy is injectable, not hard-coded)', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('something nobody classified'))
            .mockResolvedValueOnce('recovered');

        const p = withBakedReadRetry(fn, { isRetryable: () => true });
        await vi.runAllTimersAsync();

        await expect(p).resolves.toBe('recovered');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

/** [error message, expected kind, retryable] — typed as a tuple table so `it.each` hands the case
 *  its real parameter types under the root tsconfig's `strict` (a bare literal widens to a union). */
const CLASSIFIER_CASES: ReadonlyArray<readonly [string, string, boolean]> = [
    ['Bad response code: 500', 'http-5xx', true],
    ['Bad response code: 503', 'http-5xx', true],
    ['Bad response code: 429', 'http-429', true],
    ['Bad response code: 408', 'http-429', true],
    ['Bad response code: 403', 'http-4xx', false],
    ['Bad response code: 404', 'http-4xx', false],
    ['Bad response code: 416', 'http-4xx', false],
    ['Failed to fetch', 'network', true],
    ['NetworkError when attempting to fetch resource.', 'network', true],
    ['Load failed', 'network', true],
    ['Wrong magic number for PMTiles archive', 'decode', true],
    ['Server returned no content-length or a body exceeding the requested range — no HTTP byte serving.', 'decode', true],
    ['Archive is spec version 2 but this library only supports version 3', 'unknown', false],
    ['Compression method not supported', 'unknown', false],
    ['a shape nobody has seen before', 'unknown', false],
];

describe('classifyBakedReadError (§CTX-READ-RETRY, L-12937)', () => {
    it.each(CLASSIFIER_CASES)('%s → %s (retryable: %s)', (message, kind, retryable) => {
        const err = new Error(message);
        expect(classifyBakedReadError(err).kind).toBe(kind);
        expect(isRetryableBakedReadError(err)).toBe(retryable);
    });

    it('an AbortError is the caller cancelling (§L-579) — classified `abort`, never retried', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        expect(classifyBakedReadError(err).kind).toBe('abort');
        expect(isRetryableBakedReadError(err)).toBe(false);
    });

    it('a BakedReadError carries its own verdict through unchanged', () => {
        const err = new BakedReadError('all 25 tile read(s) failed', 'http-5xx', 503);
        expect(classifyBakedReadError(err)).toEqual({ kind: 'http-5xx', status: 503, message: 'all 25 tile read(s) failed' });
    });
});

describe('summariseTileFailures (§CTX-READ-RETRY, L-12937)', () => {
    it('no failures → nothing to retry', () => {
        expect(summariseTileFailures([])).toEqual({ kind: 'unknown', transient: false, message: '' });
    });

    it('all tiles 503 → transient, and the reason names the cause the console used to omit', () => {
        const s = summariseTileFailures(Array.from({ length: 25 }, () => ({ kind: 'http-5xx' as const, message: 'Bad response code: 503' })));
        expect(s).toEqual({ kind: 'http-5xx', transient: true, message: 'Bad response code: 503' });
    });

    it('all tiles 404 → NOT transient (the object is not published under this stamp)', () => {
        const s = summariseTileFailures([{ kind: 'http-4xx', message: 'Bad response code: 404' }]);
        expect(s.transient).toBe(false);
    });

    it('ONE retryable failure among many structural ones still earns a retry', () => {
        // Deliberate asymmetry: the retry re-reads only the tiles that failed against static CDN
        // bytes, while the alternative is live Overpass. Trying the cheap reliable source once
        // more is worth it even when the transient kind is the minority.
        const s = summariseTileFailures([
            { kind: 'unknown', message: 'x' },
            { kind: 'unknown', message: 'x' },
            { kind: 'decode', message: 'tile decode failed: unexpected end of buffer' },
        ]);
        expect(s.kind).toBe('decode');
        expect(s.transient).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE WIRING, not just the policy. §L-3 "committed ≠ reachable": a retry helper that nothing calls
// is indistinguishable from no retry at all, and the pure specs above cannot tell the difference.
// These drive the REAL `readContextTileFeatures` against a stubbed `fetch`, so they measure what
// the browser would do.
//
// ⭐ THE FETCH COUNT IS THE POINT. `pmtiles`' `SharedPromiseCache` stores the header PROMISE before
// it settles and never evicts a REJECTED one (pmtiles@4.4.1 src/index.ts:773-790), so a retry that
// reused the same `PMTiles` instance would await the SAME rejected promise and fail with NO HTTP
// REQUEST — a retry that looks like it ran and is incapable of succeeding. If §CTX-READ-RETRY-EVICT
// regresses, `fetch` stops being called on attempts 2 and 3 and this spec goes red.
// ─────────────────────────────────────────────────────────────────────────────
describe('readContextTileFeatures retry wiring (§CTX-READ-RETRY / §CTX-READ-RETRY-EVICT, L-12937)', () => {
    let warns: string[] = [];
    let errors: string[] = [];

    beforeEach(() => {
        vi.useFakeTimers();
        warns = [];
        errors = [];
        vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.join(' ')); });
        vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });
        vi.spyOn(console, 'log').mockImplementation(() => {});
        __setContextTilesBaseUrl('https://tiles.test.invalid/');
    });

    afterEach(() => {
        __setContextTilesBaseUrl(null);
        clearContextTileArchives();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('THE AMSTERDAM RACE: a 503 on every attempt retries 3 times, re-hits the network, then reports FAILED (not empty)', async () => {
        const fetchMock = vi.fn(async () => ({ status: 503, headers: { get: () => null } }));
        vi.stubGlobal('fetch', fetchMock);

        const p = readContextTileFeatures('roads', [2.16, 48.75, 2.17, 48.76]);
        await vi.runAllTimersAsync();
        const result = await p;

        expect(result.status).toBe('unavailable');
        if (result.status === 'unavailable') {
            expect(result.transient).toBe(true);
            expect(result.kind).toBe('http-5xx');
            expect(result.attempts).toBe(3);
        }
        // ⭐ Attempts 2 and 3 reached the NETWORK — the pmtiles rejected-promise cache was evicted.
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
        // The retry announced itself, per attempt, with the delay and the cause.
        expect(warns.filter((w) => /§CTX-READ-RETRY \(L-12937\) layer=roads attempt/.test(w))).toHaveLength(2);
        expect(warns.some((w) => /attempt 2\/3 in 400 ms after .*Bad response code: 503/.test(w))).toBe(true);
        expect(warns.some((w) => /attempt 3\/3 in 1500 ms after .*Bad response code: 503/.test(w))).toBe(true);
        // And the give-up line names FAILED as distinct from EMPTY, before any Overpass fallback.
        expect(errors.some((e) => /layer=roads FAILED after 3\/3 baked-read attempt/.test(e))).toBe(true);
        expect(errors.some((e) => /FAILED IS NOT EMPTY/.test(e))).toBe(true);
    });

    it('a 404 archive is NOT retried — one attempt, no back-off, no give-up line (it is simply not published)', async () => {
        const fetchMock = vi.fn(async () => ({ status: 404, headers: { get: () => null } }));
        vi.stubGlobal('fetch', fetchMock);

        const p = readContextTileFeatures('trees', [2.16, 48.75, 2.17, 48.76]);
        await vi.runAllTimersAsync();
        const result = await p;

        expect(result.status).toBe('unavailable');
        if (result.status === 'unavailable') {
            expect(result.transient).toBe(false);
            expect(result.attempts).toBe(1);
        }
        expect(warns.some((w) => /§CTX-READ-RETRY \(L-12937\) layer=trees attempt/.test(w))).toBe(false);
        expect(errors.some((e) => /FAILED after/.test(e))).toBe(false);
    });

    it('no tiles URL configured → `disabled`, with no attempt and no retry (the caller uses Overpass)', async () => {
        __setContextTilesBaseUrl('');
        const fetchMock = vi.fn(async () => ({ status: 200, headers: { get: () => null } }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await readContextTileFeatures('roads', [2.16, 48.75, 2.17, 48.76]);

        expect(result.status).toBe('disabled');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
