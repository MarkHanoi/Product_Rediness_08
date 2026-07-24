// SWITZERLAND — `resolveChZone` / `parseChGrundnutzungGml` + the honest envelope refusal.
//
// The compliance-critical seam turned pure: given a fixture WFS GML body (NEVER a live call — every
// test injects `fetchImpl`), the parse is deterministic. The GML fixture is the feature the deciding
// recon captured VERBATIM (SWITZERLAND-DATA-RECON-SPIKE.md §1.2): canton AI, typ_kommunal_code 1102,
// Wohnzone, hauptnutzung 11 / Wohnzonen, bemerkungen W2. These tests pin: the zone IS identified
// (structured), the envelope REFUSES (no fabricated number), the resolver NEVER throws, ambiguity is
// refused, and the FAR scaffold stays null until certified.

import { describe, it, expect } from 'vitest';
import {
    resolveChZone,
    parseChGrundnutzungGml,
    chZoningEnvelopeRefusal,
    chZoneCodeFor,
    resolveChFarFromCantonCatalogue,
    CH_FAR_CERTIFIED,
    CH_ZONING_FALLBACK_ZONE_CODE,
    buildRefusedEnvelope,
    isRefusedEnvelope,
} from '../src/index.js';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';

// ── The captured recon feature (verbatim shape, WFS 2.0 GML 3.2), canton AI ─────────────────────
const RECON_FEATURE = `
  <wfs:member>
    <ms:grundnutzung gml:id="grundnutzung.1">
      <ms:rechtsstatus>inKraft</ms:rechtsstatus>
      <ms:bemerkungen>W2</ms:bemerkungen>
      <ms:typ_kommunal_code>1102</ms:typ_kommunal_code>
      <ms:typ_kommunal_bezeichnung>Wohnzone</ms:typ_kommunal_bezeichnung>
      <ms:typ_kantonal_code>1102</ms:typ_kantonal_code>
      <ms:typ_kantonal_bezeichnung>Wohnzone</ms:typ_kantonal_bezeichnung>
      <ms:hauptnutzung_code>11</ms:hauptnutzung_code>
      <ms:hauptnutzung_bezeichnung>Wohnzonen</ms:hauptnutzung_bezeichnung>
      <ms:kanton>AI</ms:kanton>
      <ms:dokument>{"Dokumente":[{"Typ":null,"Titel":null,"Link":null}]}</ms:dokument>
    </ms:grundnutzung>
  </wfs:member>`;

const SECOND_FEATURE = `
  <wfs:member>
    <ms:grundnutzung gml:id="grundnutzung.2">
      <ms:rechtsstatus>inKraft</ms:rechtsstatus>
      <ms:typ_kommunal_code>1201</ms:typ_kommunal_code>
      <ms:typ_kommunal_bezeichnung>Gewerbe- und Industriezone</ms:typ_kommunal_bezeichnung>
      <ms:hauptnutzung_code>12</ms:hauptnutzung_code>
      <ms:hauptnutzung_bezeichnung>Arbeitszonen</ms:hauptnutzung_bezeichnung>
      <ms:kanton>AI</ms:kanton>
    </ms:grundnutzung>
  </wfs:member>`;

const gmlDoc = (members: string, n: number) =>
    `<?xml version="1.0" encoding="UTF-8"?>
     <wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml/3.2" numberReturned="${n}" numberMatched="${n}">
       ${members}
     </wfs:FeatureCollection>`;

const RECON_GML = gmlDoc(RECON_FEATURE, 1);
const EMPTY_GML = gmlDoc('', 0);
const AMBIGUOUS_GML = gmlDoc(RECON_FEATURE + SECOND_FEATURE, 2);

/** A fetch stub returning `{ gml }` as JSON with ok:true; counts calls. */
function fakeFetch(gml: string | null) {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok: true, json: async () => ({ gml }) };
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => n };
}

// A point inside Switzerland (Appenzell area) — passes the finite-coordinate guard.
const CH_LAT = 47.33;
const CH_LON = 9.41;

describe('parseChGrundnutzungGml — the pure GML parse', () => {
    it('extracts the recon feature fields verbatim (1102 / Wohnzone / W2 / AI / 11)', () => {
        const feats = parseChGrundnutzungGml(RECON_GML);
        expect(feats).toHaveLength(1);
        expect(feats[0]).toEqual({
            typKommunalCode: '1102',
            typKommunalBezeichnung: 'Wohnzone',
            hauptnutzungCode: '11',
            hauptnutzungBezeichnung: 'Wohnzonen',
            bemerkungen: 'W2',
            rechtsstatus: 'inKraft',
            kanton: 'AI',
            dokument: '{"Dokumente":[{"Typ":null,"Titel":null,"Link":null}]}',
        });
    });

    it('an empty collection parses to zero features', () => {
        expect(parseChGrundnutzungGml(EMPTY_GML)).toHaveLength(0);
    });

    it('two members parse to two features', () => {
        expect(parseChGrundnutzungGml(AMBIGUOUS_GML)).toHaveLength(2);
    });

    it('empty / non-string input is [] (never throws)', () => {
        expect(parseChGrundnutzungGml('')).toEqual([]);
        expect(parseChGrundnutzungGml(null)).toEqual([]);
        expect(parseChGrundnutzungGml(undefined)).toEqual([]);
    });
});

describe('resolveChZone — the identify-the-zone seam', () => {
    it('HAPPY PATH — identifies the zone from the recon GML (structured zone-ID)', async () => {
        const { fetchImpl } = fakeFetch(RECON_GML);
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.zone.typKommunalCode).toBe('1102');
            expect(res.zone.typKommunalBezeichnung).toBe('Wohnzone');
            expect(res.zone.bemerkungen).toBe('W2');
            expect(res.zone.hauptnutzungBezeichnung).toBe('Wohnzonen');
            expect(res.zone.kanton).toBe('AI');
        }
    });

    it('the identified zone carries NO density or height field (Outcome B — numbers absent)', async () => {
        const { fetchImpl } = fakeFetch(RECON_GML);
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            // The whole point: the zone object has no FAR/floors/height slot at all — not even a null.
            expect(res.zone).not.toHaveProperty('nutzungsziffer');
            expect(res.zone).not.toHaveProperty('maxHeight_m');
            expect(res.zone).not.toHaveProperty('maxFloors');
        }
    });

    it('non-finite coordinates refuse `out-of-switzerland` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(RECON_GML);
        const res = await resolveChZone(Number.NaN, CH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-switzerland');
        expect(calls()).toBe(0);
    });

    it('a proxy null-miss (`{ gml: null }`) → `no-zone-here`', async () => {
        const { fetchImpl } = fakeFetch(null);
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone-here');
    });

    it('an empty feature collection → `no-zone-here` (not a parse failure)', async () => {
        const { fetchImpl } = fakeFetch(EMPTY_GML);
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone-here');
    });

    it('TWO intersecting zones (a boundary) → `ambiguous-zone` (refuse, never guess)', async () => {
        const { fetchImpl } = fakeFetch(AMBIGUOUS_GML);
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('ambiguous-zone');
    });

    it('a body with no parseable feature (unexpected shape) → `unparsable-response`', async () => {
        const { fetchImpl } = fakeFetch('<html>proxy error page</html>');
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            resolveChZone(CH_LAT, CH_LON, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await resolveChZone(CH_LAT, CH_LON, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});

describe('chZoningEnvelopeRefusal + buildRefusedEnvelope — the envelope refuses honestly', () => {
    const zone = {
        typKommunalCode: '1102',
        typKommunalBezeichnung: 'Wohnzone',
        hauptnutzungCode: '11',
        hauptnutzungBezeichnung: 'Wohnzonen',
        bemerkungen: 'W2',
        rechtsstatus: 'inKraft',
        kanton: 'AI',
        dokument: null,
    };

    it('the refusal is a valid, cited, source-data-unavailable refusal (not legally grounded)', () => {
        const refusal = chZoningEnvelopeRefusal(zone);
        expect(() => EnvelopeRefusalSchema.parse(refusal)).not.toThrow();
        expect(refusal.code).toBe('source-data-unavailable');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.ordinanceRef).toContain('geodienste.ch');
        // The identified zone is LEGIBLE on the card (so the user sees their real zone).
        expect(refusal.knownFacts.join(' | ')).toContain('Wohnzone');
        expect(refusal.knownFacts.join(' | ')).toContain('AI');
    });

    it('the refused envelope has NO fabricated number and renders as a refusal', () => {
        // NB: refusal envelopes are TS literals consumed directly, never `.parse()`d (the L-574
        // status:'none'+refusal shape is deliberately outside the schema refine — see zoneRefusal.ts).
        const env = buildRefusedEnvelope(chZoneCodeFor(zone), chZoningEnvelopeRefusal(zone), 'none');
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(env.zoneCode).toBe('1102'); // the REAL zone code renders
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.insetPolygon).toHaveLength(0);
        expect(env.confidence).toBe('not-determined');
    });

    it('chZoneCodeFor falls back to the source tag only when no code/abbr exists', () => {
        expect(chZoneCodeFor(zone)).toBe('1102');
        expect(chZoneCodeFor({ ...zone, typKommunalCode: null })).toBe('W2');
        expect(chZoneCodeFor(null)).toBe(CH_ZONING_FALLBACK_ZONE_CODE);
    });
});

describe('resolveChFarFromCantonCatalogue — the FAR scaffold (default OFF)', () => {
    it('CH_FAR_CERTIFIED is false (no canton catalogue signed off yet)', () => {
        expect(CH_FAR_CERTIFIED).toBe(false);
    });

    it('returns `not-certified` for every input while the gate is closed (never a fabricated FAR)', () => {
        const res = resolveChFarFromCantonCatalogue('1102', 'AI');
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('not-certified');
    });
});
