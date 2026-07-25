// SWITZERLAND / canton Zürich — `resolveZurichBzoZone` / `parseZurichBzoGml` + the honest envelope
// refusal.
//
// The seam turned pure: given a fixture WFS GML body (NEVER a live call — every test injects
// `fetchImpl`), the parse is deterministic. The GML fixture is the feature the Zürich probe captured
// VERBATIM (ZURICH-BZO-PROBE §2, City of Zürich BZO WFS `bzo_zone_v`): `typ` E1, `rechtsstatus`
// inKraft, `rechtsvorschrift_url` → oerebdocs.zh.ch/getDoc?docid=573. These tests pin: the zone IS
// identified (structured, municipal), the envelope REFUSES (no fabricated AZ/height), the resolver
// NEVER throws, ambiguity is refused, and the refusal NAMES the per-parcel BZO ordinance.

import { describe, it, expect } from 'vitest';
import {
    resolveZurichBzoZone,
    parseZurichBzoGml,
    zurichBzoEnvelopeRefusal,
    zurichBzoZoneCodeFor,
    zurichBzoZoneLabelFor,
    isInZurichCity,
    CH_ZURICH_BZO_FALLBACK_ZONE_CODE,
    buildRefusedEnvelope,
    isRefusedEnvelope,
} from '../src/index.js';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';

// ── The captured probe feature (verbatim shape, QGIS-Server WFS 1.1.0 GML), City of Zürich ──────
const PROBE_FEATURE = `
  <gml:featureMember>
    <qgs:bzo_zone_v gml:id="bzo_zone_v.1">
      <qgs:geometrie_gdo xsi:nil="true"/>
      <qgs:rechtsstatus>inKraft</qgs:rechtsstatus>
      <qgs:mutationsnummer xsi:nil="true"/>
      <qgs:typ>E1</qgs:typ>
      <qgs:plan_url></qgs:plan_url>
      <qgs:rechtsvorschrift_url>https://oerebdocs.zh.ch/getDoc?docid=573</qgs:rechtsvorschrift_url>
      <qgs:objectid>1</qgs:objectid>
    </qgs:bzo_zone_v>
  </gml:featureMember>`;

// A residential zone code (the `typ` encodes Vollgeschosse in the Roman suffix — a signal, not a
// number we may cite as a height): verbatim `typ` from the distinct-value probe, generic ordinance url.
const RESIDENTIAL_FEATURE = `
  <gml:featureMember>
    <qgs:bzo_zone_v gml:id="bzo_zone_v.2">
      <qgs:rechtsstatus>inKraft</qgs:rechtsstatus>
      <qgs:typ>W2bIII</qgs:typ>
      <qgs:rechtsvorschrift_url>https://oerebdocs.zh.ch/getDoc?docid=6808</qgs:rechtsvorschrift_url>
      <qgs:objectid>2</qgs:objectid>
    </qgs:bzo_zone_v>
  </gml:featureMember>`;

const gmlDoc = (members: string, n: number) =>
    `<?xml version="1.0" encoding="UTF-8"?>
     <wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:qgs="http://www.qgis.org/gml" xmlns:gml="http://www.opengis.net/gml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" numberReturned="${n}" numberMatched="${n}">
       ${members}
     </wfs:FeatureCollection>`;

const PROBE_GML = gmlDoc(PROBE_FEATURE, 1);
const EMPTY_GML = gmlDoc('', 0);
const AMBIGUOUS_GML = gmlDoc(PROBE_FEATURE + RESIDENTIAL_FEATURE, 2);

/** A fetch stub returning `{ gml }` as JSON with ok:true; counts calls. */
function fakeFetch(gml: string | null) {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok: true, json: async () => ({ gml }) };
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => n };
}

// The probe reference point — Zürich HB (47.377, 8.540); passes the finite-coordinate guard.
const ZH_LAT = 47.377;
const ZH_LON = 8.540;

describe('isInZurichCity — the reference-commune bbox gate', () => {
    it('accepts the probe reference point (Zürich HB)', () => {
        expect(isInZurichCity(ZH_LAT, ZH_LON)).toBe(true);
    });
    it('rejects a point elsewhere in Switzerland (Bern) and non-finite input', () => {
        expect(isInZurichCity(46.948, 7.447)).toBe(false);
        expect(isInZurichCity(Number.NaN, ZH_LON)).toBe(false);
    });
});

describe('parseZurichBzoGml — the pure GML parse', () => {
    it('extracts the probe feature fields verbatim (E1 / inKraft / docid=573)', () => {
        const feats = parseZurichBzoGml(PROBE_GML);
        expect(feats).toHaveLength(1);
        expect(feats[0]).toEqual({
            typ: 'E1',
            rechtsstatus: 'inKraft',
            rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=573',
            planUrl: null, // empty element → honest null
            mutationsnummer: null, // xsi:nil → honest null
            objectid: '1',
        });
    });

    it('an empty collection parses to zero features', () => {
        expect(parseZurichBzoGml(EMPTY_GML)).toHaveLength(0);
    });

    it('two members parse to two features', () => {
        expect(parseZurichBzoGml(AMBIGUOUS_GML)).toHaveLength(2);
    });

    it('empty / non-string input is [] (never throws)', () => {
        expect(parseZurichBzoGml('')).toEqual([]);
        expect(parseZurichBzoGml(null)).toEqual([]);
        expect(parseZurichBzoGml(undefined)).toEqual([]);
    });
});

describe('resolveZurichBzoZone — the identify-the-zone seam', () => {
    it('HAPPY PATH — identifies the municipal BZO zone from the probe GML (structured zone-ID)', async () => {
        const { fetchImpl } = fakeFetch(PROBE_GML);
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.zone.typ).toBe('E1');
            expect(res.zone.rechtsstatus).toBe('inKraft');
            expect(res.zone.rechtsvorschriftUrl).toBe('https://oerebdocs.zh.ch/getDoc?docid=573');
        }
    });

    it('the identified zone carries NO density or height field (Outcome B — numbers absent)', async () => {
        const { fetchImpl } = fakeFetch(PROBE_GML);
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            // The whole point: the zone object has no AZ/floors/height slot at all — not even a null.
            expect(res.zone).not.toHaveProperty('ausnuetzungsziffer');
            expect(res.zone).not.toHaveProperty('vollgeschosse');
            expect(res.zone).not.toHaveProperty('gebaeudehoehe');
            expect(res.zone).not.toHaveProperty('maxHeight_m');
        }
    });

    it('non-finite coordinates refuse `out-of-zurich` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(PROBE_GML);
        const res = await resolveZurichBzoZone(Number.NaN, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-zurich');
        expect(calls()).toBe(0);
    });

    it('a proxy null-miss (`{ gml: null }`) → `no-zone-here`', async () => {
        const { fetchImpl } = fakeFetch(null);
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone-here');
    });

    it('an empty feature collection → `no-zone-here` (not a parse failure)', async () => {
        const { fetchImpl } = fakeFetch(EMPTY_GML);
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone-here');
    });

    it('TWO intersecting zones (a boundary) → `ambiguous-zone` (refuse, never guess)', async () => {
        const { fetchImpl } = fakeFetch(AMBIGUOUS_GML);
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ambiguous-zone');
    });

    it('a body with no parseable feature (unexpected shape) → `unparsable-response`', async () => {
        const { fetchImpl } = fakeFetch('<html>proxy error page</html>');
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await resolveZurichBzoZone(ZH_LAT, ZH_LON, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});

describe('zurichBzoEnvelopeRefusal + buildRefusedEnvelope — the envelope refuses honestly', () => {
    const zone = {
        typ: 'W2bIII',
        rechtsstatus: 'inKraft',
        rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=6808',
        planUrl: null,
        mutationsnummer: null,
        objectid: '2',
    };

    it('the refusal is a valid, cited, source-data-unavailable refusal (not legally grounded)', () => {
        const refusal = zurichBzoEnvelopeRefusal(zone);
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.code).toBe('source-data-unavailable');
        expect(refusal.legallyGrounded).toBe(false);
        // It cites the BZO ordinance + the data source, never a number.
        expect(refusal.ordinanceRef).toContain('BZO 700.100');
        expect(refusal.ordinanceRef).toContain('bzo_zone_v');
        // The identified zone AND its per-parcel ordinance link are LEGIBLE on the card.
        const facts = refusal.knownFacts.join(' | ');
        expect(facts).toContain('W2bIII');
        expect(facts).toContain('https://oerebdocs.zh.ch/getDoc?docid=6808');
        expect(facts).toContain('BFS-Nr 261');
    });

    it('the refused envelope has NO fabricated number and renders as a refusal', () => {
        const env = buildRefusedEnvelope(zurichBzoZoneCodeFor(zone), zurichBzoEnvelopeRefusal(zone), 'none');
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(env.zoneCode).toBe('W2bIII'); // the REAL municipal zone code renders
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.insetPolygon).toHaveLength(0);
        expect(env.confidence).toBe('not-determined');
    });

    it('zurichBzoZoneCodeFor / Label fall back to the source tag only when no typ exists', () => {
        expect(zurichBzoZoneCodeFor(zone)).toBe('W2bIII');
        expect(zurichBzoZoneLabelFor(zone)).toBe('BZO zone W2bIII');
        expect(zurichBzoZoneCodeFor(null)).toBe(CH_ZURICH_BZO_FALLBACK_ZONE_CODE);
        expect(zurichBzoZoneCodeFor({ ...zone, typ: null })).toBe(CH_ZURICH_BZO_FALLBACK_ZONE_CODE);
    });

    it('a null zone (WFS miss) still yields a valid, honest refusal', () => {
        const refusal = zurichBzoEnvelopeRefusal(null);
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.headline).toContain('City of Zürich');
    });
});
