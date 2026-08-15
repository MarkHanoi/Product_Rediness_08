// §ARCGIS-TRANSIENT-RETRY — `queryArcgisRestPointIntersect`/`queryArcgisRestEnvelopeIntersect`
// (`containers/arcgisRest.ts`) retry a bounded number of times on a TRANSIENT failure (transport
// exception, HTTP 5xx, HTTP 429) before resolving `{ ok: false }`, but must NEVER retry an ArcGIS
// semantic `error` body or a non-429 4xx — those are the service's own considered answer, not a
// hiccup, and retrying them would misrepresent a real response as noise.
//
// Motivation (2026-08-05): a single dropped Sevilla ArcGIS response used to surface all the way to
// the L5 dispatcher as `service-error` for a real parcel sitting in a real, already-packed,
// non-refused zone — a reliability gap, not a coverage gap. This file pins the fix's contract.

import { describe, it, expect, vi } from 'vitest';
import { queryArcgisRestPointIntersect, queryArcgisRestEnvelopeIntersect } from '../src/index.js';

const OK_BODY = {
    spatialReference: { wkid: 25830, latestWkid: 25830 },
    features: [{ attributes: { zona_orden: 'AD: Unifamiliar Adosada' }, geometry: {} }],
};

function fetchSequence(...responses: Array<'throw' | { status: number; body?: unknown }>): typeof fetch {
    let call = 0;
    return (async () => {
        const r = responses[Math.min(call, responses.length - 1)];
        call++;
        // noUncheckedIndexedAccess types this as possibly-undefined. The index is
        // in range for any NON-EMPTY responses list, so the only way here is a
        // fetchSequence() call with no responses at all — a test-authoring bug.
        // Throw loudly rather than assert it away: a stub that silently returns
        // undefined would make the test pass for the wrong reason.
        if (r === undefined) {
            throw new Error('fetchSequence: called with no responses configured');
        }
        if (r === 'throw') throw new Error('ECONNRESET');
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            json: async () => r.body ?? {},
        };
    }) as unknown as typeof fetch;
}

const baseOpts = { fetchImpl: undefined as unknown as typeof fetch, serviceBase: 'https://x/MapServer', layerId: 25, lat: 37.4, lon: -5.9 };

describe('§ARCGIS-TRANSIENT-RETRY — queryArcgisRestPointIntersect', () => {
    it('retries a thrown transport exception and succeeds on the second attempt', async () => {
        const fetchImpl = fetchSequence('throw', { status: 200, body: OK_BODY });
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl });
        expect(res.ok).toBe(true);
    });

    it('retries HTTP 503 and succeeds on the third attempt (the max)', async () => {
        const fetchImpl = fetchSequence(
            { status: 503 },
            { status: 503 },
            { status: 200, body: OK_BODY },
        );
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl });
        expect(res.ok).toBe(true);
    });

    it('retries HTTP 429 (rate-limited)', async () => {
        const fetchImpl = fetchSequence({ status: 429 }, { status: 200, body: OK_BODY });
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl });
        expect(res.ok).toBe(true);
    });

    it('gives up after the bounded max attempts on a persistently transient failure', async () => {
        const spy = vi.fn(fetchSequence('throw', 'throw', 'throw', 'throw', 'throw'));
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl: spy });
        expect(res.ok).toBe(false);
        expect(spy).toHaveBeenCalledTimes(3); // bounded — never an unbounded retry loop
    });

    it('never retries an ArcGIS semantic error body — it is a real answer, not a hiccup', async () => {
        const spy = vi.fn(
            fetchSequence({ status: 200, body: { error: { code: 400, message: 'Invalid query parameters.' } } }),
        );
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl: spy });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.detail).toContain('ArcGIS');
        expect(spy).toHaveBeenCalledTimes(1); // no retry spent on a non-transient answer
    });

    it('never retries a non-429 4xx — retrying a bad request cannot make it succeed', async () => {
        const spy = vi.fn(fetchSequence({ status: 404 }));
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl: spy });
        expect(res.ok).toBe(false);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('succeeds immediately with no retry when the first attempt is already ok', async () => {
        const spy = vi.fn(fetchSequence({ status: 200, body: OK_BODY }));
        const res = await queryArcgisRestPointIntersect({ ...baseOpts, fetchImpl: spy });
        expect(res.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('§ARCGIS-TRANSIENT-RETRY — queryArcgisRestEnvelopeIntersect (same policy)', () => {
    it('retries a transient 502 and succeeds', async () => {
        const fetchImpl = fetchSequence({ status: 502 }, { status: 200, body: OK_BODY });
        const res = await queryArcgisRestEnvelopeIntersect({ ...baseOpts, halfWidth: 0.002, fetchImpl });
        expect(res.ok).toBe(true);
    });

    it('never retries an ArcGIS semantic error body', async () => {
        const spy = vi.fn(
            fetchSequence({ status: 200, body: { error: { code: 400, message: 'bad where clause' } } }),
        );
        const res = await queryArcgisRestEnvelopeIntersect({ ...baseOpts, halfWidth: 0.002, fetchImpl: spy });
        expect(res.ok).toBe(false);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
