// SWITZERLAND / City of Zürich — the OPTIONAL runtime-classify FALLBACK for BZO regime resolution.
//
// WHAT THESE TESTS GUARD (the error contract, EXACTLY):
//   1. the static crosswalk is PRIMARY — a classified docid resolves with NO fetch;
//   2. a runtime miss fetches + classifies the doc, and resolves it;
//   3. a transient fetch failure RETRIES (2×) then refuses the DISTINCT `regime-fetch-failed`;
//   4. a fetched doc with NO clear marker HARD-refuses `regime-ambiguous` immediately (no retry);
//   5. the docid→regime verdict is CACHED (classify each doc once, reused across parcels);
//   6. multi-docid consensus / conflict behaves like the pure resolver.

import { describe, it, expect, vi } from 'vitest';
import { resolveZurichBzoRegimeWithFetch } from '../src/index.js';

/** A fake `Response` sufficient for the resolver (`ok`, `status`, `text()`). */
function fakeRes(status: number, body = ''): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
    } as unknown as Response;
}

const noSleep = async () => {};
const BZO2016_TEXT = 'Teilrevision Bau- und Zonenordnung «Harsplen». Stadtratsbeschluss STRB Nr. 859/2024.';
const NO_MARKER_TEXT = 'Beschluss Nr. 4307 vom 8. Juni 2005, Erholungszone E1 Juchhof.';

describe('resolveZurichBzoRegimeWithFetch — static crosswalk is primary (no network)', () => {
    it('a classified docid resolves from the static map WITHOUT calling fetch', async () => {
        const fetchImpl = vi.fn();
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=573' },
            { fetchImpl: fetchImpl as unknown as typeof fetch },
        );
        expect(res).toEqual({ ok: true, regime: 'bzo_91_99', source: 'static' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('an explicit plan-area tag resolves statically, no fetch', async () => {
        const fetchImpl = vi.fn();
        const res = await resolveZurichBzoRegimeWithFetch(
            { planArea: 'bzo_2016' },
            { fetchImpl: fetchImpl as unknown as typeof fetch },
        );
        expect(res).toEqual({ ok: true, regime: 'bzo_2016', source: 'static' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('resolveZurichBzoRegimeWithFetch — runtime classify fallback (on a crosswalk miss)', () => {
    it('fetches an UNMAPPED docid, classifies it, and resolves `runtime-classify`', async () => {
        const fetchImpl = vi.fn(async () => fakeRes(200, BZO2016_TEXT));
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99999' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: true, regime: 'bzo_2016', source: 'runtime-classify' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('a fetched doc with NO clear marker HARD-refuses `regime-ambiguous` (no retry)', async () => {
        const fetchImpl = vi.fn(async () => fakeRes(200, NO_MARKER_TEXT));
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99998' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: false, reason: 'regime-ambiguous' });
        expect(fetchImpl).toHaveBeenCalledTimes(1); // classified-null does NOT retry.
    });
});

describe('resolveZurichBzoRegimeWithFetch — transient fetch failure ⇒ retry then `regime-fetch-failed`', () => {
    it('retries on 5xx (2×) then refuses `regime-fetch-failed` (3 attempts total)', async () => {
        const fetchImpl = vi.fn(async () => fakeRes(503));
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99997' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: false, reason: 'regime-fetch-failed' });
        expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries.
    });

    it('retries on a thrown network error then refuses `regime-fetch-failed`', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('ETIMEDOUT');
        });
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99996' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 2, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: false, reason: 'regime-fetch-failed' });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('recovers when a transient failure is followed by a good response within the retry budget', async () => {
        let n = 0;
        const fetchImpl = vi.fn(async () => (++n < 2 ? fakeRes(429) : fakeRes(200, BZO2016_TEXT)));
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99995' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: true, regime: 'bzo_2016', source: 'runtime-classify' });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('a hard 404 refuses `regime-fetch-failed` WITHOUT retrying (not transient)', async () => {
        const fetchImpl = vi.fn(async () => fakeRes(404));
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99994' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: false, reason: 'regime-fetch-failed' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});

describe('resolveZurichBzoRegimeWithFetch — the doc→regime cache (classify once, reuse)', () => {
    it('classifies an unmapped docid once and reuses the cached verdict for a second parcel', async () => {
        const fetchImpl = vi.fn(async () => fakeRes(200, BZO2016_TEXT));
        const cache = new Map<string, 'bzo_91_99' | 'bzo_2016' | null>();
        const input = { rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=99993' };
        const first = await resolveZurichBzoRegimeWithFetch(input, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            cache,
            sleepImpl: noSleep,
        });
        const second = await resolveZurichBzoRegimeWithFetch(input, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            cache,
            sleepImpl: noSleep,
        });
        expect(first).toEqual({ ok: true, regime: 'bzo_2016', source: 'runtime-classify' });
        expect(second).toEqual({ ok: true, regime: 'bzo_2016', source: 'runtime-classify' });
        expect(fetchImpl).toHaveBeenCalledTimes(1); // second parcel served from cache.
        expect(cache.get('99993')).toBe('bzo_2016');
    });
});

describe('resolveZurichBzoRegimeWithFetch — multi-docid + no-fetch edge cases', () => {
    it('a mixed classified+unmapped URL fetches only the unmapped docid, then resolves on consensus', async () => {
        // docid 573 is statically bzo_91_99; the unmapped 99992 classifies bzo_91_99 too ⇒ consensus.
        const fetchImpl = vi.fn(async () =>
            fakeRes(200, 'Bau- und Zonenordnung 1999 (BZO 99), GRB Nr. 1815 und 1816 vom 24. November 1999.'),
        );
        const res = await resolveZurichBzoRegimeWithFetch(
            {
                rechtsvorschriftUrl:
                    'https://oerebdocs.zh.ch/getDoc?docid=573; https://oerebdocs.zh.ch/getDoc?docid=99992',
            },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: true, regime: 'bzo_91_99', source: 'runtime-classify' });
        expect(fetchImpl).toHaveBeenCalledTimes(1); // 573 came from the static map, not fetched.
    });

    it('a URL that names NO docid ⇒ `regime-ambiguous` without fetching (nothing to classify)', async () => {
        const fetchImpl = vi.fn();
        const res = await resolveZurichBzoRegimeWithFetch(
            { rechtsvorschriftUrl: 'https://example.org/no-docid-here' },
            { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: noSleep },
        );
        expect(res).toEqual({ ok: false, reason: 'regime-ambiguous' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
