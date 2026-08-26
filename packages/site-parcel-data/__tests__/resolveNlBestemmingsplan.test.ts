// L-609 — `resolveNlBestemmingsplan`: the Amsterdam bestemmingsplan `ringRef` resolver +
// maatvoering reader.
//
// The compliance-critical seam turned pure: given a FIXTURE proxy response (NEVER a live call —
// every test injects `fetchImpl`), the parse is deterministic. These pin the resolver's honesty
// properties (see its header): never throws, does not project (returns WGS84), and — the crux —
// a maatvoering `waarde` becomes a structured number ONLY when it is a clean positive value, a
// `minimum` typering is NEVER read as a maximum, and a goothoogte is NEVER read as the height cap.

import { describe, it, expect } from 'vitest';
import {
    resolveNlBestemmingsplan,
    readMaatvoeringen,
    classifyMaatvoering,
    readMaatWaarde,
    ringFromGeoJson,
    NL_RING_REF,
    NL_RULE,
    NL_BESTEMMINGSPLAN_CERTIFIED,
    NL_STOREY_DERIVED_HEIGHT_CERTIFIED,
} from '../src/index.js';

// A representative bouwvlak polygon (GeoJSON, WGS84 [lon, lat], closing vertex repeated).
const RING: number[][] = [
    [4.9040, 52.3675],
    [4.9044, 52.3675],
    [4.9044, 52.3679],
    [4.9040, 52.3679],
    [4.9040, 52.3675], // GeoJSON closing vertex (== first) — dropped by the resolver.
];

const okBody = (opts: {
    maatvoeringen?: Array<{ naam: string; waarde: unknown }>;
    bestemming?: string;
    ring?: number[][];
    planId?: string;
    planNaam?: string;
}) => ({
    plan: { id: opts.planId ?? 'NL.IMRO.0363.testplan-va01', naam: opts.planNaam ?? 'Amsterdam Testplan' },
    bestemmingsvlak: opts.bestemming ? { naam: opts.bestemming } : null,
    bouwvlak: { geometrie: { type: 'Polygon', coordinates: [opts.ring ?? RING] } },
    maatvoeringen: opts.maatvoeringen ?? [],
});

// A representative bestemmingsvlak (zone) polygon — the §NL-SPARSE-FALLBACK footprint (WGS84).
const ZONE_RING: number[][] = [
    [4.9038, 52.3673],
    [4.9046, 52.3673],
    [4.9046, 52.3681],
    [4.9038, 52.3681],
    [4.9038, 52.3673],
];

/**
 * A body WITHOUT a bouwvlak but WITH the zone (bestemmingsvlak) footprint + a maatvoering — the
 * §NL-SPARSE-FALLBACK case (the common NL parcel: only enkelbestemming + maatvoering, no bouwvlak).
 */
const fallbackBody = (opts: {
    maatvoeringen?: Array<{ naam: string; waarde: unknown }>;
    bestemming?: string;
    zoneRing?: number[][];
    withZoneGeom?: boolean;
}) => ({
    plan: { id: 'NL.IMRO.0363.testplan-va01', naam: 'Amsterdam Testplan' },
    bestemmingsvlak: {
        naam: opts.bestemming ?? 'Wonen',
        geometrie:
            opts.withZoneGeom === false
                ? null
                : { type: 'Polygon', coordinates: [opts.zoneRing ?? ZONE_RING] },
    },
    bouwvlak: null, // ⚠ no precise bouwvlak — the sparse case
    maatvoeringen: opts.maatvoeringen ?? [],
});

/** The parcel query point (WGS84) — central Amsterdam. */
const PT = { lat: 52.3676, lon: 4.9041 };

/** A fetch stub that returns `body` as JSON with `ok: true`, and counts its calls. */
function fakeFetch(body: unknown): { fetchImpl: typeof fetch; calls: () => number } {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok: true, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => n };
}

describe('classifyMaatvoering — the SVBP2012 typering classifier (min-vs-max honesty gate)', () => {
    it('classifies the standard maximum typeringen', () => {
        expect(classifyMaatvoering('maximum bouwhoogte (m)')).toBe('max-bouwhoogte');
        expect(classifyMaatvoering('maximale bouwhoogte (m)')).toBe('max-bouwhoogte'); // both spellings
        expect(classifyMaatvoering('maximum goothoogte (m)')).toBe('max-goothoogte');
        expect(classifyMaatvoering('maximum aantal bouwlagen')).toBe('max-aantal-bouwlagen');
        expect(classifyMaatvoering('maximum bebouwingspercentage (%)')).toBe('max-bebouwingspercentage');
        expect(classifyMaatvoering('maximale bebouwingspercentage (%)')).toBe('max-bebouwingspercentage');
    });

    it('⚠ REFUSES a minimum typering — a floor is never read as a ceiling', () => {
        expect(classifyMaatvoering('minimale bouwhoogte (m)')).toBeNull();
        expect(classifyMaatvoering('minimum bouwhoogte (m)')).toBeNull();
        expect(classifyMaatvoering('minimum aantal bouwlagen')).toBeNull();
    });

    it('⚠ discriminates bouwhoogte from goothoogte (they are different fields)', () => {
        expect(classifyMaatvoering('maximum bouwhoogte (m)')).toBe('max-bouwhoogte');
        expect(classifyMaatvoering('maximum goothoogte (m)')).toBe('max-goothoogte');
    });

    it('classifies FSI / vloeroppervlakteindex as FAR, and refuses an unqualified/unknown naam', () => {
        expect(classifyMaatvoering('maximum FSI')).toBe('fsi');
        expect(classifyMaatvoering('maximale vloeroppervlakteindex')).toBe('fsi');
        expect(classifyMaatvoering('gevelrooilijn')).toBeNull();
        expect(classifyMaatvoering('bouwhoogte (m)')).toBeNull(); // no max/min qualifier → refused
        expect(classifyMaatvoering(42 as unknown)).toBeNull();
    });
});

describe('readMaatWaarde — clean positive number, never a silent zero', () => {
    it('parses a clean number and a Dutch comma decimal', () => {
        expect(readMaatWaarde(30)).toBe(30);
        expect(readMaatWaarde('30')).toBe(30);
        expect(readMaatWaarde('12,5')).toBeCloseTo(12.5, 6);
    });
    it('withholds (null) for absent / blank / coded / non-positive — never 0', () => {
        expect(readMaatWaarde(null)).toBeNull();
        expect(readMaatWaarde('')).toBeNull();
        expect(readMaatWaarde('-')).toBeNull();
        expect(readMaatWaarde('n.v.t.')).toBeNull();
        expect(readMaatWaarde('0')).toBeNull(); // 0 is a transcription artefact, not a real cap
        expect(readMaatWaarde(-5)).toBeNull();
    });
});

describe('readMaatvoeringen — folds a list; %→ratio; first clean value wins', () => {
    it('reads height, storeys, coverage (→0..1), FAR; withholds absent', () => {
        const maat = readMaatvoeringen([
            { naam: 'maximum bouwhoogte (m)', waarde: '30' },
            { naam: 'maximum aantal bouwlagen', waarde: 9 },
            { naam: 'maximum bebouwingspercentage (%)', waarde: '50' },
            { naam: 'maximum goothoogte (m)', waarde: '18' },
        ]);
        expect(maat.maxBouwhoogte_m).toBe(30);
        expect(maat.maxAantalBouwlagen).toBe(9);
        expect(maat.maxBebouwingspercentage).toBeCloseTo(0.5, 6); // 50 % → 0.5 ratio
        expect(maat.maxGoothoogte_m).toBe(18);
        expect(maat.far).toBeNull();
    });
    it('a minimum bouwhoogte does NOT populate maxBouwhoogte_m', () => {
        const maat = readMaatvoeringen([{ naam: 'minimale bouwhoogte (m)', waarde: '6' }]);
        expect(maat.maxBouwhoogte_m).toBeNull();
    });
    it('a coded/compound waarde does not become a number (no silent zero)', () => {
        const maat = readMaatvoeringen([{ naam: 'maximum bouwhoogte (m)', waarde: '0 / 5' }]);
        expect(maat.maxBouwhoogte_m).toBeNull();
    });
});

describe('ringFromGeoJson — closes the ring, drops the closing vertex', () => {
    it('parses a Polygon and drops the duplicated closing vertex', () => {
        const ring = ringFromGeoJson({ type: 'Polygon', coordinates: [RING] });
        expect(ring).not.toBeNull();
        expect(ring).toHaveLength(4);
        expect(ring![0]).toEqual({ lat: 52.3675, lon: 4.9040 }); // WGS84, not projected
    });
    it('refuses a degenerate ring (< 3 vertices)', () => {
        expect(ringFromGeoJson({ type: 'Polygon', coordinates: [[[4.9, 52.3], [4.9, 52.3]]] })).toBeNull();
    });
});

describe('resolveNlBestemmingsplan — the resolver', () => {
    it('⭐ THE GATE IS OPEN, PARTIAL — §L-11841, 2026-08-26, SIG-NL1', () => {
        // Was SHUT 2026-08-02 (§UNSIGNED-GATE-DEFAULTS-SHUT) for exactly one reason: nobody had
        // recorded the call, not because the data was weak — `maximum bouwhoogte (m)` is
        // published-structured with a STATED unit and PRYZM transcribes no ordinance, the same
        // ADR-0283 Doctrine B argument under which Denmark is authorised ungated.
        //
        // §L-11840 traced the founder's "missing Amsterdam envelope" report to this exact gate;
        // the founder's recorded answer (SIG-NL1, `docs/04-reference/jurisdictions/nl/sources/
        // VERIFICATION.md`) opened it: "Authorize with the sparse-fallback path excluded."
        expect(NL_BESTEMMINGSPLAN_CERTIFIED).toBe(true);
        // The exclusion is its OWN flag, still shut — a height PRYZM would derive from a storey
        // count (no metre height published) is an engineering approximation, not the authority's
        // number, and was explicitly not part of what was signed.
        expect(NL_STOREY_DERIVED_HEIGHT_CERTIFIED).toBe(false);
    });

    it('the ringRef constant equals the pack rule handle (no vintage drift)', () => {
        expect(NL_RING_REF).toBe('nl-bestemmingsplan:bouwvlak-maatvoering/pdok-wms');
        expect(NL_RULE).toHaveProperty('ringRef', NL_RING_REF);
    });

    it('HAPPY PATH — closes the WGS84 bouwvlak ring + reads the maatvoering + bestemming', async () => {
        const { fetchImpl } = fakeFetch(
            okBody({
                bestemming: 'Wonen',
                maatvoeringen: [
                    { naam: 'maximum bouwhoogte (m)', waarde: '30' },
                    { naam: 'maximum bebouwingspercentage (%)', waarde: '50' },
                ],
            }),
        );
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.ringSource).toBe('bouwvlak'); // the PRECISE published footprint
            expect(res.ringLatLon).toHaveLength(4);
            expect(res.ringLatLon[0]).toEqual({ lat: 52.3675, lon: 4.9040 }); // WGS84, unprojected
            expect(res.maat.maxBouwhoogte_m).toBe(30);
            expect(res.maat.maxBebouwingspercentage).toBeCloseTo(0.5, 6);
            expect(res.bestemming).toBe('Wonen');
            expect(res.planId).toBe('NL.IMRO.0363.testplan-va01');
        }
    });

    it('§NL-SPARSE-FALLBACK — no bouwvlak, but zone footprint + a usable maatvoering → ok (ringSource=bestemmingsvlak)', async () => {
        const { fetchImpl } = fakeFetch(
            fallbackBody({
                bestemming: 'Wonen',
                maatvoeringen: [{ naam: 'maximum bouwhoogte (m)', waarde: '15' }],
            }),
        );
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.ringSource).toBe('bestemmingsvlak'); // the ZONE extent — an UPPER BOUND
            expect(res.ringLatLon).toHaveLength(4); // closing vertex dropped
            expect(res.maat.maxBouwhoogte_m).toBe(15);
            expect(res.bestemming).toBe('Wonen');
        }
    });

    it('§NL-SPARSE-FALLBACK — a storey count (no metres) is a usable maatvoering → ok', async () => {
        const { fetchImpl } = fakeFetch(
            fallbackBody({ maatvoeringen: [{ naam: 'maximum aantal bouwlagen', waarde: 4 }] }),
        );
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.ringSource).toBe('bestemmingsvlak');
            expect(res.maat.maxBouwhoogte_m).toBeNull(); // no metres — dispatcher derives from floors
            expect(res.maat.maxAantalBouwlagen).toBe(4);
        }
    });

    it('§NL-SPARSE-FALLBACK — zone footprint but NO usable maatvoering → `no-bouwvlak` (honest refusal)', async () => {
        const { fetchImpl } = fakeFetch(fallbackBody({ maatvoeringen: [] }));
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-bouwvlak');
    });

    it('§NL-SPARSE-FALLBACK — a usable maatvoering but NO zone footprint → `no-bouwvlak` (nothing to clip to)', async () => {
        const { fetchImpl } = fakeFetch(
            fallbackBody({
                withZoneGeom: false,
                maatvoeringen: [{ naam: 'maximum bouwhoogte (m)', waarde: '15' }],
            }),
        );
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-bouwvlak');
    });

    it('a bouwvlak with NO maatvoering still ships the ring (numbers withheld null)', async () => {
        const { fetchImpl } = fakeFetch(okBody({ bestemming: 'Gemengd', maatvoeringen: [] }));
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.ringLatLon).toHaveLength(4);
            expect(res.maat.maxBouwhoogte_m).toBeNull(); // honest withheld, never fabricated
        }
    });

    it('a mismatched ringRef refuses WITHOUT fetching (wrong vintage / plane)', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({}));
        const res = await resolveNlBestemmingsplan('nl-ams:something-else/v-9', PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ringref-mismatch');
        expect(calls()).toBe(0);
    });

    it('a missing point refuses WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(okBody({}));
        const res = await resolveNlBestemmingsplan(NL_RING_REF, null, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-point');
        expect(calls()).toBe(0);
    });

    it('no plan at the point → `no-plan`', async () => {
        const { fetchImpl } = fakeFetch({ plan: null });
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-plan');
    });

    it('a plan with no bouwvlak → `no-bouwvlak`', async () => {
        const { fetchImpl } = fakeFetch({ plan: { id: 'NL.IMRO.0363.x', naam: 'X' }, bouwvlak: null });
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-bouwvlak');
    });

    it('a degenerate bouwvlak geometry → `degenerate-geometry`', async () => {
        const { fetchImpl } = fakeFetch(okBody({ ring: [[4.9, 52.3], [4.9, 52.3]] }));
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('degenerate-geometry');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => {
                throw new Error('unexpected token');
            },
        })) as unknown as typeof fetch;
        const res = await resolveNlBestemmingsplan(NL_RING_REF, PT, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
