// LANE E2b (Wave E2, REPORT §S item 5) — proofs for the Polish APP GML 2.0 parser.
//
// THE FIXTURE IS THE OFFICIAL MINISTRY ARTIFACT, byte-identical (sha256 pinned below):
//   https://www.gov.pl/attachment/8dd6086a-88ba-44fb-be68-d43d14a15e36
//   (the POG test GML linked from https://www.gov.pl/web/zagospodarowanieprzestrzenne/przykladowe-dane;
//   ministry export timestamp 2024-12-04; fetched 2026-09-01, 253,475 bytes).
// The XSD it is validated against in spirit sits next to it
// (`planowaniePrzestrzenne_2_0.xsd`, published 2023-11-22, fetched 2026-09-01).
//
// Expected values are pinned from TWO independent sources (probe-can-be-wrong-three-ways):
//   1. the E-wave lane audit's own probe of this file (lanes/netherlands-poland-lithuania-estonia.md
//      §PL-2: 28 strefy; symbol "SZ"; FAR 0.8; coverage 50.0; height 15.0 m; green 50.0), and
//   2. an independent python re-census on the downloaded bytes (2026-09-01): 36 posLists,
//      12,146 numeric tokens, all rings closed, 18/18/18/20 of the four numeric attributes
//      present across 28 strefy — i.e. the official sample itself exercises the UNSPECIFIED arm.
//
// Falsification discipline: every corruption is applied to an IN-MEMORY copy; after each, the
// pristine string must still parse (byte-identical restore is the fixture file itself — its
// sha256 is asserted first, so any on-disk drift fails the suite before anything else runs).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAppGml, APP_2_0_NAMESPACE } from '../src/parsers/appGml/index.js';
import type { AppGmlDocument, AppGmlParseOutcome } from '../src/parsers/appGml/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'fixtures/pl-app-gml-2-0/pog-official-sample-2024-12-04.gml');
const OFFICIAL_SHA256 = '173690566bf1fab5fbb448970efc007219848d06eb93ff5e7e35c70ea5090853';

const RAW_BYTES = readFileSync(FIXTURE_PATH);
const RAW = RAW_BYTES.toString('utf8');

function parsedOrFail(outcome: AppGmlParseOutcome): AppGmlDocument {
    if (outcome.status !== 'parsed') {
        throw new Error(`expected parsed, got ${outcome.status}: ${JSON.stringify(outcome)}`);
    }
    return outcome.document;
}

describe('fixture provenance', () => {
    it('is the byte-identical official ministry sample (sha256 pinned at download, 2026-09-01)', () => {
        expect(createHash('sha256').update(RAW_BYTES).digest('hex')).toBe(OFFICIAL_SHA256);
        expect(RAW_BYTES.length).toBe(253475);
    });
});

describe('round-trip of the official POG sample', () => {
    const doc = parsedOrFail(parseAppGml(RAW));

    it('parses the full official census — 28 strefy + 4 OUZ + 2 OZS + 1 OSD + 1 akt + 1 dokument', () => {
        expect(doc.strefyPlanistyczne.length).toBe(28); // lane audit §PL-2: "28 in sample"
        expect(doc.obszaryUzupelnieniaZabudowy.length).toBe(4);
        expect(doc.obszaryZabudowySrodmiejskiej.length).toBe(2);
        expect(doc.obszaryStandardowDostepnosci.length).toBe(1);
        expect(doc.akty.length).toBe(1);
        expect(doc.dokumentyFormalne.length).toBe(1);
        expect(doc.rysunki.length).toBe(0);
        expect(doc.unrecognizedMembers.length).toBe(0);
    });

    it('keeps the collection header as written (numberReturned="6" is the file’s own claim, not ours)', () => {
        expect(doc.collection.rootQName).toBe('wfs:FeatureCollection');
        expect(doc.collection.timeStamp).toBe('2024-12-04T10:03:35Z');
        // DISCOVERY (recorded, not "fixed"): the official file declares numberReturned="6" while
        // carrying 37 members. The parser transcribes; reconciliation is an adapter question.
        expect(doc.collection.numberReturned).toBe('6');
        expect(doc.collection.numberMatched).toBe('unknown');
    });

    it('extracts the Lane-4 target: zone-level POG envelope attributes of strefa 1SZ', () => {
        const s = doc.strefyPlanistyczne[0]!;
        expect(s.gmlId).toBe('PL.ZIPPZP.11111_321202-POG_1POG-1SZ_20241204T095812');
        expect(s.oznaczenie).toBe('1SZ');
        expect(s.symbol).toBe('SZ');
        expect(s.idIIP).toEqual({
            przestrzenNazw: 'PL.ZIPPZP.11111/321202-POG',
            lokalnyId: '1POG-1SZ',
            wersjaId: '20241204T095812',
        });
        // the four zone-level ceilings, per lane audit §PL-2 AND the raw file:
        expect(s.maksNadziemnaIntensywnoscZabudowy).toEqual({ kind: 'value', value: 0.8, raw: '0.8' }); // above-ground FAR
        expect(s.maksUdzialPowierzchniZabudowy).toEqual({ kind: 'value', value: 50.0, raw: '50.0' }); // % coverage
        expect(s.maksWysokoscZabudowy).toEqual({ kind: 'value', value: 15.0, uom: 'm', raw: '15.0' }); // height
        expect(s.minUdzialPowierzchniBiologicznieCzynnej).toEqual({ kind: 'value', value: 50.0, raw: '50.0' }); // % green
        // versioning fields — the §15 temporal-validity model is IN the national schema:
        expect(s.poczatekWersjiObiektu).toBe('2024-12-04T09:58:12Z');
        expect(s.obowiazujeOd).toBe('2024-12-04');
        expect(s.status.href).toBe('http://inspire.ec.europa.eu/codelist/ProcessStepGeneralValue/elaboration');
        expect(s.charakterUstalenia.href).toBe('https://inspire.ec.europa.eu/codelist/RegulationNatureValue/generallyBinding');
        expect(s.nazwa.href).toContain('RodzajStrefyPlanistycznejKod/strefaWielofunkcyjnaZZabudowaZagrodowa');
        expect(s.profilPodstawowy.length).toBe(7);
        expect(s.profilDodatkowy.length).toBe(3);
        expect(s.profilPodstawowy[0]!.title).toBe('teren zabudowy zagrodowej');
        expect(s.plan.href).toContain('AktPlanowaniaPrzestrzennego/PL.ZIPPZP.11111/321202-POG/1POG');
    });

    it('E4 control 9 — absent ceilings parse as UNSPECIFIED, never as zero/unlimited (the official sample exercises this arm)', () => {
        const farUnspecified = doc.strefyPlanistyczne.filter((s) => s.maksNadziemnaIntensywnoscZabudowy.kind === 'unspecified');
        const heightUnspecified = doc.strefyPlanistyczne.filter((s) => s.maksWysokoscZabudowy.kind === 'unspecified');
        const greenUnspecified = doc.strefyPlanistyczne.filter((s) => s.minUdzialPowierzchniBiologicznieCzynnej.kind === 'unspecified');
        // independent python census 2026-09-01: 18/18/18/20 of 28 strefy carry the four attributes
        expect(farUnspecified.length).toBe(10);
        expect(heightUnspecified.length).toBe(10);
        expect(greenUnspecified.length).toBe(8);
        for (const s of farUnspecified) {
            const v = s.maksNadziemnaIntensywnoscZabudowy;
            expect(v).toEqual({ kind: 'unspecified', meaning: 'attribute-absent-in-document' });
            // and there is no numeric reading of it at all:
            expect('value' in v).toBe(false);
        }
        // No strefa parsed a ceiling of 0 that the document does not state:
        for (const s of doc.strefyPlanistyczne) {
            if (s.maksNadziemnaIntensywnoscZabudowy.kind === 'value') {
                expect(s.maksNadziemnaIntensywnoscZabudowy.raw).not.toBe('');
            }
        }
    });

    it('parses geometry in the native CRS with closed rings, conserving every coordinate of the file', () => {
        // independent extraction: regex over the raw text (mirrors the python census: 36 lists, 12,146 tokens)
        let expectedTokens = 0;
        let listCount = 0;
        for (const m of RAW.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)) {
            listCount++;
            expectedTokens += (m[1] as string).trim().split(/\s+/).length;
        }
        expect(listCount).toBe(36);
        expect(expectedTokens).toBe(12146);

        let parsedTokens = 0;
        let rings = 0;
        const allGeoms = [
            ...doc.strefyPlanistyczne.map((f) => f.geometria),
            ...doc.obszaryUzupelnieniaZabudowy.map((f) => f.geometria),
            ...doc.obszaryZabudowySrodmiejskiej.map((f) => f.geometria),
            ...doc.obszaryStandardowDostepnosci.map((f) => f.geometria),
            ...doc.akty.map((f) => f.zasiegPrzestrzenny),
        ];
        for (const g of allGeoms) {
            for (const p of g.polygons) {
                expect(p.srsName).toBe('http://www.opengis.net/def/crs/EPSG/0/2176'); // PL-2000 zone 5, as written
                for (const ring of [p.exterior, ...p.interiors]) {
                    rings++;
                    parsedTokens += ring.positions.length * 2;
                    const first = ring.positions[0]!;
                    const last = ring.positions[ring.positions.length - 1]!;
                    expect(first).toEqual(last);
                }
            }
        }
        expect(rings).toBe(36);
        expect(parsedTokens).toBe(expectedTokens); // nothing dropped, nothing invented
    });

    it('parses the act header, its 28 wydzielenie references, and the formal document', () => {
        const akt = doc.akty[0]!;
        expect(akt.tytul).toBe('Plan ogólny gminy ABC');
        expect(akt.typPlanu.href).toContain('TypAktuPlanowaniaPrzestrzennegoKod/planOgolnyGminy');
        expect(akt.poziomHierarchii.href).toContain('LevelOfSpatialPlanValue/local');
        expect(akt.modyfikacja).toBe(false);
        expect(akt.obowiazujeOd).toBe('2024-12-04');
        expect(akt.wydzielenie.length).toBe(28); // one per strefa (independent python count of <app:wydzielenie>)
        expect(akt.zasiegPrzestrzenny.polygons.length).toBe(1);
        expect(akt.dokumentPrzystepujacy.length).toBe(1);

        const dok = doc.dokumentyFormalne[0]!;
        expect(dok.tytul).toContain('Uchwała nr 1');
        expect(dok.data).toEqual({ date: '2024-06-28', dateType: 'publication' });
        expect(dok.dataWejsciaWZycie).toBe('2024-06-28');
        expect(dok.idIIP.wersjaId).toBeNull(); // Identyfikator.wersjaId is minOccurs=0 and this feature omits it
        expect(dok.przystapienie.length).toBe(1);
    });

    it('parses the social-infrastructure standards area, optional distances staying unspecified', () => {
        const osd = doc.obszaryStandardowDostepnosci[0]!;
        expect(osd.symbol).toBe('OSD');
        expect(osd.wylaczenieZabudowyZagrodowej).toBe(false);
        expect(osd.odlegloscDoSzkolyPodstawowej).toEqual({ kind: 'value', value: 2000.0, uom: 'm', raw: '2000.0' });
        expect(osd.powierzchniaLacznaObszarowZieleniPublicznej).toEqual({ kind: 'value', value: 2.0, uom: 'ha', raw: '2.0' });
        expect(osd.odlegloscDoAmbulatoriumPOZ).toEqual({ kind: 'value', value: 2000.0, uom: 'm', raw: '2000.0' });
        expect(osd.odlegloscDoPrzedszkola.kind).toBe('unspecified');
        expect(osd.odlegloscDoApteki.kind).toBe('unspecified');
    });

    it('is deterministic — two parses of the same bytes are structurally identical', () => {
        const again = parsedOrFail(parseAppGml(RAW));
        expect(JSON.stringify(again)).toBe(JSON.stringify(doc));
    });

    it('emits no warnings on the official sample', () => {
        const outcome = parseAppGml(RAW);
        expect(outcome.status).toBe('parsed');
        if (outcome.status === 'parsed') expect(outcome.warnings).toEqual([]);
    });
});

describe('empty is an ANSWER, distinct from every failure (FetchOutcome discipline)', () => {
    it('a well-formed collection with zero members → status "empty", never "refused"', () => {
        const empty =
            '<?xml version="1.0" encoding="utf-8"?>' +
            '<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" timeStamp="2026-09-01T00:00:00Z" numberReturned="0" numberMatched="0"/>';
        const outcome = parseAppGml(empty);
        expect(outcome.status).toBe('empty');
        if (outcome.status === 'empty') {
            expect(outcome.reason).toBe('no-members');
            expect(outcome.collection.numberReturned).toBe('0');
        }
    });

    it('members that are all non-APP features → refused "no-app20-features" (wrong input, NOT "nothing here")', () => {
        const foreign =
            '<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0">' +
            '<wfs:member><x:Thing xmlns:x="urn:example:other" /></wfs:member>' +
            '</wfs:FeatureCollection>';
        const outcome = parseAppGml(foreign);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') expect(outcome.reason).toBe('no-app20-features');
    });

    it('an APP 1.x/other-version namespace does NOT pass as 2.0', () => {
        const downgraded = RAW.replaceAll(APP_2_0_NAMESPACE, 'https://www.gov.pl/static/zagospodarowanieprzestrzenne/schemas/app/1.0');
        const outcome = parseAppGml(downgraded);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') expect(outcome.reason).toBe('no-app20-features');
    });
});

describe('malformed-input refusals, each by name', () => {
    it('plain text → malformed-xml:not-xml', () => {
        const outcome = parseAppGml('the register is down, try later');
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') expect(outcome.reason).toBe('malformed-xml:not-xml');
    });

    it('truncated document → malformed-xml:unclosed-element', () => {
        const outcome = parseAppGml(RAW.slice(0, Math.floor(RAW.length * 0.6)));
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') expect(outcome.reason).toBe('malformed-xml:unclosed-element');
    });

    it('DOCTYPE → malformed-xml:doctype-not-allowed (no entity-expansion surface)', () => {
        const outcome = parseAppGml('<!DOCTYPE foo [<!ENTITY x "y">]><foo/>');
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') expect(outcome.reason).toBe('malformed-xml:doctype-not-allowed');
    });

    it('a non-collection root → not-a-feature-collection', () => {
        const outcome = parseAppGml('<foo/>');
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') {
            expect(outcome.reason).toBe('not-a-feature-collection');
            expect(outcome.detail).toContain('<foo>');
        }
    });
});

describe('FALSIFICATION — corrupt ONE element of the official sample; the parse fails NAMING THE PATH; the pristine string still parses', () => {
    const pristineOutcome = () => parsedOrFail(parseAppGml(RAW));

    it('deleting the mandatory <app:symbol> of one strefa → missing-required-element at that strefa', () => {
        const corrupted = RAW.replace('<app:symbol>SZ</app:symbol>', '');
        expect(corrupted).not.toBe(RAW); // the corruption really landed
        const outcome = parseAppGml(corrupted);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') {
            expect(outcome.reason).toBe('missing-required-element');
            expect(outcome.path).toContain('app:StrefaPlanistyczna');
            expect(outcome.detail).toContain('app:symbol');
        }
        expect(pristineOutcome().strefyPlanistyczne.length).toBe(28); // byte-identical restore parses
    });

    it('corrupting the FAR decimal "0.8" → invalid-decimal at the exact attribute path', () => {
        const corrupted = RAW.replace(
            '<app:maksNadziemnaIntensywnoscZabudowy>0.8</app:maksNadziemnaIntensywnoscZabudowy>',
            '<app:maksNadziemnaIntensywnoscZabudowy>0.8x</app:maksNadziemnaIntensywnoscZabudowy>',
        );
        expect(corrupted).not.toBe(RAW);
        const outcome = parseAppGml(corrupted);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') {
            expect(outcome.reason).toBe('invalid-decimal');
            expect(outcome.path).toContain('app:maksNadziemnaIntensywnoscZabudowy');
            expect(outcome.detail).toContain('0.8x');
        }
        expect(pristineOutcome().strefyPlanistyczne[0]!.maksNadziemnaIntensywnoscZabudowy).toEqual({ kind: 'value', value: 0.8, raw: '0.8' });
    });

    it('stripping the uom off a height → missing-uom (a height without a unit is not a value)', () => {
        const corrupted = RAW.replace('<app:maksWysokoscZabudowy uom="m">', '<app:maksWysokoscZabudowy>');
        expect(corrupted).not.toBe(RAW);
        const outcome = parseAppGml(corrupted);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') {
            expect(outcome.reason).toBe('missing-uom');
            expect(outcome.path).toContain('app:maksWysokoscZabudowy');
        }
        expect(pristineOutcome().strefyPlanistyczne[0]!.maksWysokoscZabudowy).toEqual({ kind: 'value', value: 15.0, uom: 'm', raw: '15.0' });
    });

    it('deleting one number from a posList → odd-coordinate-count at that geometry', () => {
        const m = /<gml:posList[^>]*>([^<]*)<\/gml:posList>/.exec(RAW)!;
        const tokens = (m[1] as string).trim().split(/\s+/);
        const corruptedList = tokens.slice(0, -1).join(' ');
        const corrupted = RAW.replace(m[1] as string, corruptedList);
        expect(corrupted).not.toBe(RAW);
        const outcome = parseAppGml(corrupted);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') {
            expect(outcome.reason).toBe('odd-coordinate-count');
            expect(outcome.path).toContain('gml:posList');
        }
        expect(pristineOutcome().strefyPlanistyczne.length).toBe(28);
    });

    it('shifting the ring’s first coordinate → ring-not-closed', () => {
        const m = /<gml:posList[^>]*>([^<]*)<\/gml:posList>/.exec(RAW)!;
        const tokens = (m[1] as string).trim().split(/\s+/);
        tokens[0] = `9${tokens[0]}`;
        const corrupted = RAW.replace(m[1] as string, tokens.join(' '));
        expect(corrupted).not.toBe(RAW);
        const outcome = parseAppGml(corrupted);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') expect(outcome.reason).toBe('ring-not-closed');
        expect(pristineOutcome().strefyPlanistyczne.length).toBe(28);
    });

    it('breaking one closing tag → malformed-xml:mismatched-close-tag with the element path', () => {
        const corrupted = RAW.replace('</app:StrefaPlanistyczna>', '</app:StrefaPlanistycznaX>');
        expect(corrupted).not.toBe(RAW);
        const outcome = parseAppGml(corrupted);
        expect(outcome.status).toBe('refused');
        if (outcome.status === 'refused') {
            expect(outcome.reason).toBe('malformed-xml:mismatched-close-tag');
            expect(outcome.path).toContain('app:StrefaPlanistyczna');
        }
        expect(pristineOutcome().strefyPlanistyczne.length).toBe(28);
    });

    it('SCRAMBLE CONTROL — a corruption the parser is NOT asked to catch still round-trips: swapping two strefa oznaczenie values parses fine but yields different content (the tests can tell the difference)', () => {
        // guards against a suite that would pass on ANY input (corpus-never-jittered doctrine)
        const corrupted = RAW.replace('<app:oznaczenie>1SZ</app:oznaczenie>', '<app:oznaczenie>ZZZ</app:oznaczenie>');
        expect(corrupted).not.toBe(RAW);
        const outcome = parseAppGml(corrupted);
        const doc = parsedOrFail(outcome);
        expect(doc.strefyPlanistyczne[0]!.oznaczenie).toBe('ZZZ');
        expect(pristineOutcome().strefyPlanistyczne[0]!.oznaczenie).toBe('1SZ');
    });
});
