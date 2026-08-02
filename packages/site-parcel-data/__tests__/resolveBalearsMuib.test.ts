// ILLES BALEARS — the provider's REFUSAL VOCABULARY, exercised through the injected-fetch seam.
//
// Every case here is driven by a REAL payload shape: the zoning attributes are the ones the live
// MUIB point query returned for the control parcel (committed in `fixtures/`), and the fitxa is the
// real page. Only the FAILURE MODES are synthesised — because a failure mode you cannot reproduce is
// a failure mode you cannot claim to handle.
//
// ⭐ THE PROPERTY UNDER TEST THROUGHOUT: **a refusal is a discriminated VALUE, never a silent null**,
// and failure and absence never share one. `endpoint-unreachable` (the source did not answer) and
// `no-zoning-here` (the source answered, completely, with nothing) must be different values, because
// the first earns a retry and the second must never offer one.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    resolveBalearsMuib,
    balearsObsDeclaresNotCurrent,
    balearsIsInForce,
    balearsRefusalIsTransient,
    readBalearsZoningFeature,
    BALEARS_MISSING_CONSTRAINTS,
    BALEARS_DFIVIGEN_OPEN_ENDED,
} from '../src/providers/resolveBalearsMuib.js';
import {
    isInBalears,
    balearsCodiMuniFromIne,
    balearsIneFromCodiMuni,
} from '../src/providers/balearsBbox.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const FIXTURE = JSON.parse(
    readFileSync(resolve(HERE, 'fixtures', 'balears-manacor-7704702ED1870S.json'), 'utf8'),
) as {
    queryPoint: { lat: number; lon: number };
    muibAttributes: Record<string, unknown>;
};

function fitxaHtml(): string {
    const rel = 'tools/balears-muib-probe/out/p-test-292430.html';
    const candidates = [resolve(HERE, '..', '..', '..', rel)];
    const m = HERE.replace(/\\/g, '/').match(/^(.*)\/\.claude\/worktrees\/[^/]+\//);
    if (m) candidates.push(resolve(m[1] as string, rel));
    for (const c of candidates) if (existsSync(c)) return readFileSync(c, 'utf8');
    throw new Error('BALEARS fitxa fixture missing — the provider tests cannot run on nothing.');
}
const HTML = fitxaHtml();
const PT = FIXTURE.queryPoint;
const ATTRS = FIXTURE.muibAttributes;

/** A fake `fetch` returning one JSON body. `ok:false` simulates the proxy's own 502. */
function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
    return (async () =>
        ({ ok, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

const okBody = (overrides: Record<string, unknown> = {}, html: string | null = HTML) => ({
    qualificacions: [{ attributes: { ...ATTRS, ...overrides } }],
    fitxa: html === null ? null : { identitat: 292430, url: ATTRS['URL'], html },
});

const ASOF = { asOf: '2026-08-02' };

describe('§BALEARS-ROUTING — the bbox and the CODIMUNI key', () => {
    it('routes the control point into the Balears and keeps the mainland out', () => {
        expect(isInBalears(PT.lat, PT.lon)).toBe(true);
        expect(isInBalears(40.4168, -3.7038)).toBe(false); // Madrid
        expect(isInBalears(41.3874, 2.1686)).toBe(false); // Barcelona
        expect(isInBalears(Number.NaN, PT.lon)).toBe(false);
    });

    it('⭐ CODIMUNI IS INE-5 WITH `07` STRIPPED — the key that returns 0 on a clean 200 if wrong', () => {
        expect(balearsCodiMuniFromIne('07033')).toBe('033'); // Manacor
        expect(balearsCodiMuniFromIne('07040')).toBe('040'); // Palma
        expect(balearsIneFromCodiMuni('033')).toBe('07033');
        // ⛔ A CODIAJ is a ZONE LABEL and must never compose into an INE code.
        expect(balearsIneFromCodiMuni('RE-NA')).toBeNull();
        // Out-of-province and malformed inputs refuse rather than guess.
        expect(balearsCodiMuniFromIne('28079')).toBeNull();
        expect(balearsCodiMuniFromIne('7033')).toBeNull();
    });
});

describe('§BALEARS-CURRENCY — 23.77 % of buildable land self-declares NOT CURRENT', () => {
    // ⚠ VERBATIM, live 2026-08-02. Pinned so a change in the publisher's wording is a RED TEST
    // rather than a silent re-opening of nearly a quarter of the islands' buildable land.
    const PALMA =
        "Palma NO està actualitzat al MUIB segons el darrer planejament aprovat i actualment el MUIB no mostra l'actual classificació del sòl. Consultau la informació proporcionada per l'Ajuntament";
    const ANDRATX =
        "Andratx NO està actualitzat al MUIB segons els darrer planejament aprovat. Consultau la informació proporcionada per l'Ajuntament";
    const EIVISSA =
        "Del municipi d'Eivissa el MUIB NO mostra l'actual normativa vigent. Consultau la informació proporcionada per l'Ajuntament";

    it('detects all three published disclaimers FROM THEIR TEXT, not from a name list', () => {
        for (const obs of [PALMA, ANDRATX, EIVISSA]) {
            expect(balearsObsDeclaresNotCurrent(obs), obs.slice(0, 30)).toBe(true);
        }
    });

    it('does NOT fire on an absent, empty or unrelated observation', () => {
        expect(balearsObsDeclaresNotCurrent(null)).toBe(false);
        expect(balearsObsDeclaresNotCurrent('')).toBe(false);
        expect(balearsObsDeclaresNotCurrent('Zona subjecta a estudi de detall.')).toBe(false);
    });

    it('⛔ REFUSES the parcel with the publisher’s own words, and does NOT draw', async () => {
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch(okBody({ OBS: PALMA })),
            ...ASOF,
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('plan-not-current');
        expect(r.detail).toContain('NO està actualitzat');
        // ⚠ DURABLE, not transient — it must never wear a retry affordance.
        expect(balearsRefusalIsTransient(r.reason)).toBe(false);
    });
});

describe('§BALEARS-VALIDITY — DFIVIGEN 99999999 is a SENTINEL, not a date', () => {
    it('treats the open-ended sentinel as in force', () => {
        expect(balearsIsInForce('22/12/2021', BALEARS_DFIVIGEN_OPEN_ENDED, '2026-08-02')).toBe(true);
    });

    it('drops a record whose real end date has passed', () => {
        expect(balearsIsInForce('01/01/2010', 20200101, '2026-08-02')).toBe(false);
    });

    it('drops a record not yet in force', () => {
        expect(balearsIsInForce('01/01/2030', BALEARS_DFIVIGEN_OPEN_ENDED, '2026-08-02')).toBe(false);
    });

    it('⚠ returns null — NOT false — when no interval can be tested (unknown ≠ out of force)', () => {
        expect(balearsIsInForce(null, null, '2026-08-02')).toBeNull();
    });

    it('refuses `only-superseded-records`, distinctly from “nothing here”', async () => {
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch(okBody({ DINIVIGEN: '01/01/2005', DFIVIGEN: 20150101 })),
            ...ASOF,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('only-superseded-records');
    });
});

describe('§BALEARS-REFUSALS — failure and absence are DIFFERENT VALUES', () => {
    it('out-of-balears for a mainland point (nothing is queried)', async () => {
        const r = await resolveBalearsMuib({ lat: 40.4168, lon: -3.7038 }, { fetchImpl: fakeFetch(okBody()) });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('out-of-balears');
    });

    it('⭐ `endpoint-unreachable` (did not answer) ≠ `no-zoning-here` (answered, empty)', async () => {
        const down = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch({ qualificacions: null, fitxa: null }),
            ...ASOF,
        });
        const empty = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch({ qualificacions: [], fitxa: null }),
            ...ASOF,
        });
        expect(down.ok).toBe(false);
        expect(empty.ok).toBe(false);
        if (down.ok || empty.ok) return;
        expect(down.reason).toBe('endpoint-unreachable');
        expect(empty.reason).toBe('no-zoning-here');
        expect(down.reason).not.toBe(empty.reason);
        // ⚠ Only the first is retryable. This is the whole §CONTEXT-DATA-HONESTY property.
        expect(balearsRefusalIsTransient(down.reason)).toBe(true);
        expect(balearsRefusalIsTransient(empty.reason)).toBe(false);
    });

    it('a proxy 502 is transient, never “nothing here”', async () => {
        const r = await resolveBalearsMuib(PT, { fetchImpl: fakeFetch(null, false, 502), ...ASOF });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('endpoint-unreachable');
    });

    it('refuses a real zone boundary rather than picking features[0]', async () => {
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch({
                qualificacions: [
                    { attributes: ATTRS },
                    { attributes: { ...ATTRS, CODIMUIB: 'EL_PB', NOM: 'Espai lliure públic' } },
                ],
                fitxa: { identitat: 292430, url: ATTRS['URL'], html: HTML },
            }),
            ...ASOF,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('ambiguous-zone');
            expect(r.detail).toContain('RE_NA');
        }
    });

    it('an IDENTICAL duplicate polygon is NOT ambiguous — it collapses to one answer', async () => {
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch({
                qualificacions: [{ attributes: ATTRS }, { attributes: { ...ATTRS } }],
                fitxa: { identitat: 292430, url: ATTRS['URL'], html: HTML },
            }),
            ...ASOF,
        });
        expect(r.ok).toBe(true);
    });

    it('refuses rústic — a zone fitxa does not govern that regime', async () => {
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch(okBody({ CODICLAS: 'SR' })),
            ...ASOF,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('not-buildable-class');
    });

    it('⛔ refuses a fitxa belonging to ANOTHER zone rather than quoting its numbers', async () => {
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch({
                qualificacions: [{ attributes: { ...ATTRS, IDENTITAT: 999999 } }],
                fitxa: { identitat: 999999, url: ATTRS['URL'], html: HTML },
            }),
            ...ASOF,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('fitxa-identity-mismatch');
    });

    it('an unfetchable fitxa is TRANSIENT, never “this zone publishes no rules”', async () => {
        const r = await resolveBalearsMuib(PT, { fetchImpl: fakeFetch(okBody({}, null)), ...ASOF });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('fitxa-unreachable');
            expect(balearsRefusalIsTransient(r.reason)).toBe(true);
        }
    });

    it('⛔ a PARSER failure refuses — it never wears the costume of a thin zone', async () => {
        // A code cell the parser SEES but cannot read (no `-->` value marker anywhere after it).
        const broken =
            '<html><body><table><tr><td>PARAMETRES D\'EDIFICACIÓ</td></tr>' +
            '<tr><td>NP: Nombre de plantes</td><td>3</td><td>plantes</td></tr>' +
            '</table></body></html>';
        const r = await resolveBalearsMuib(PT, {
            fetchImpl: fakeFetch(okBody({}, broken)),
            ...ASOF,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('fitxa-unparsable');
            expect(r.detail).toContain('NP');
        }
    });
});

describe('§BALEARS-HAPPY-PATH — the control parcel resolves with provenance', () => {
    it('resolves the zone, the plan, the INE code and the fitxa', async () => {
        const r = await resolveBalearsMuib(PT, { fetchImpl: fakeFetch(okBody()), ...ASOF });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const rec = r.record;
        expect(rec.feature.CODIMUIB).toBe('RE_NA');
        expect(rec.feature.CODIAJ).toBe('RE-NA');
        expect(rec.feature.MUNICIPI).toBe('MANACOR');
        expect(rec.feature.CODIPLA).toBe('2021_PG_MANACOR_033');
        expect(rec.ineCode).toBe('07033');
        expect(rec.fitxaUrl).toContain('identitat=292430');
        expect(rec.drawability.tier).toBe('COMPLETE');
    });

    it('⭐ carries the ARTICLE, because this fitxa cites one on the parameter itself', async () => {
        const r = await resolveBalearsMuib(PT, { fetchImpl: fakeFetch(okBody()), ...ASOF });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.record.articleRefs).toEqual(
            expect.arrayContaining(['Article 66', 'Article 56.3.j']),
        );
        expect(r.record.articleAbsent).toBe(false);
    });

    it('⛔ ADR-0293 — the OPEN TOP is in the DATA, non-empty, on every success', async () => {
        const r = await resolveBalearsMuib(PT, { fetchImpl: fakeFetch(okBody()), ...ASOF });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.record.missingConstraints.length).toBeGreaterThan(0);
        expect(r.record.missingConstraints).toBe(BALEARS_MISSING_CONSTRAINTS);
        const joined = r.record.missingConstraints.join(' ').toLowerCase();
        for (const family of ['heritage', 'flood', 'airport', 'coastal', 'environmental', 'pti']) {
            expect(joined, family).toContain(family);
        }
    });

    it('never throws, whatever the body — a malformed payload is a typed refusal', async () => {
        const bodies = [null, {}, { qualificacions: 'nonsense' }, { qualificacions: [42, null] }];
        for (const b of bodies) {
            const r = await resolveBalearsMuib(PT, { fetchImpl: fakeFetch(b), ...ASOF });
            expect(r.ok, JSON.stringify(b)).toBe(false);
        }
    });

    it('reads ArcGIS `attributes` and GeoJSON `properties` alike; a bare row with no identity is null', () => {
        expect(readBalearsZoningFeature({ attributes: ATTRS })?.CODIMUIB).toBe('RE_NA');
        expect(readBalearsZoningFeature({ properties: ATTRS })?.CODIMUIB).toBe('RE_NA');
        expect(readBalearsZoningFeature({ attributes: { OBJECTID: 1 } })).toBeNull();
        expect(readBalearsZoningFeature(null)).toBeNull();
    });
});
