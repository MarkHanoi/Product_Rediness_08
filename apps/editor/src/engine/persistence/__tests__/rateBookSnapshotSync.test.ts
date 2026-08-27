// §RATES157 (L-12503) — the founder: *"yesterday I added many cost prices,
// today they are gone."* The rate book lived ONLY in this browser's
// localStorage; this suite pins the PURE reconcile/derive logic that now moves
// it into the project snapshot, in BOTH directions, without needing a live
// ProjectLoader (which needs a BimManager, CommandManager and scene — see
// `snapshotFamilyRoundTrip.spec.ts`'s header for why that bundle is expensive).
//
// The one invariant every case below defends: a POPULATED side (snapshot or
// browser cache) is NEVER overwritten by an EMPTY one. That is the exact shape
// of the founder's loss — an empty read silently winning over real data.

import { describe, it, expect } from 'vitest';
import { reconcileRateBookOnLoad, deriveSnapshotRates } from '../rateBookSnapshotSync';
import type { RateEntry } from '@pryzm/core-app-model';

const RATE_A: RateEntry = { lineCode: 'WA-01', rate: 42.5, unit: 'm2', source: 'BEDEC 2026' };
const RATE_B: RateEntry = { lineCode: 'DO-01', rate: 310, unit: 'ud', source: 'quotation #4' };

describe('§RATES157 reconcileRateBookOnLoad — LOAD direction', () => {
    it('fills an EMPTY cache from a POPULATED snapshot (fresh browser / collaborator open)', () => {
        const result = reconcileRateBookOnLoad(
            { currency: 'EUR', entries: [RATE_A, RATE_B] },
            null, // nothing cached in this browser yet
        );
        expect(result.action).toBe('write-cache');
        expect(result.cacheValue).toBeDefined();
        const written = JSON.parse(result.cacheValue!);
        expect(written.currency).toBe('EUR');
        expect(written.entries).toHaveLength(2);
    });

    it('§RATES157 RECOVERY — never lets an EMPTY snapshot clobber a POPULATED cache', () => {
        const cachedRaw = JSON.stringify({ currency: 'EUR', entries: [RATE_A] });
        // Snapshot predates this lane: no `rates` key at all.
        const resultAbsent = reconcileRateBookOnLoad(undefined, cachedRaw);
        expect(resultAbsent.action).toBe('keep-cache');
        expect(resultAbsent.cacheValue).toBeUndefined();

        // Snapshot HAS the key but it is an empty stub — same guarantee applies.
        const resultEmpty = reconcileRateBookOnLoad({ currency: 'EUR', entries: [] }, cachedRaw);
        expect(resultEmpty.action).toBe('keep-cache');
        expect(resultEmpty.cacheValue).toBeUndefined();
    });

    it('keeps the cache, never the snapshot, when BOTH are populated (cache may be newer)', () => {
        const cachedRaw = JSON.stringify({ currency: 'EUR', entries: [RATE_A, RATE_B] });
        const result = reconcileRateBookOnLoad({ currency: 'EUR', entries: [RATE_A] }, cachedRaw);
        expect(result.action).toBe('keep-cache');
        expect(result.cacheValue).toBeUndefined();
    });

    it('does nothing when neither side has a rate book', () => {
        const result = reconcileRateBookOnLoad(undefined, null);
        expect(result.action).toBe('nothing');
    });

    it('treats a corrupt cache entry as empty, not as populated', () => {
        const result = reconcileRateBookOnLoad(
            { currency: 'EUR', entries: [RATE_A] },
            '{not valid json',
        );
        expect(result.action).toBe('write-cache');
    });

    it('defaults currency to EUR when the snapshot omits it', () => {
        const result = reconcileRateBookOnLoad({ entries: [RATE_A] }, null);
        expect(result.action).toBe('write-cache');
        expect(JSON.parse(result.cacheValue!).currency).toBe('EUR');
    });
});

describe('§RATES157 deriveSnapshotRates — SAVE direction', () => {
    it('shapes a populated cache into a snapshot-ready rates block', () => {
        const raw = JSON.stringify({ currency: 'USD', entries: [RATE_A, RATE_B] });
        const derived = deriveSnapshotRates(raw);
        expect(derived).toEqual({ version: 1, currency: 'USD', entries: [RATE_A, RATE_B] });
    });

    it('omits the key entirely (C47 additive-optional) when the cache is empty or absent', () => {
        expect(deriveSnapshotRates(null)).toBeUndefined();
        expect(deriveSnapshotRates(JSON.stringify({ currency: 'EUR', entries: [] }))).toBeUndefined();
    });

    it('never throws on a corrupt cache — a bad rate cache must not fail the whole save', () => {
        expect(() => deriveSnapshotRates('{not valid json')).not.toThrow();
        expect(deriveSnapshotRates('{not valid json')).toBeUndefined();
    });

    it('round-trips through reconcileRateBookOnLoad: what SAVE derives, LOAD recognises as populated', () => {
        const raw = JSON.stringify({ currency: 'EUR', entries: [RATE_A] });
        const derived = deriveSnapshotRates(raw);
        const reconciled = reconcileRateBookOnLoad(derived, null);
        expect(reconciled.action).toBe('write-cache');
        expect(JSON.parse(reconciled.cacheValue!).entries).toHaveLength(1);
    });
});
