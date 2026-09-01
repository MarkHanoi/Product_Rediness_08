// LANE E6-PL — proofs for the Poland country adapter (`src/countryAdapters/pl/`).
//
// THE FIXTURES ARE THE STATE'S OWN BYTES, sha256-pinned:
//   • `fixtures/pl-app-gml-2-0/pog-official-sample-2024-12-04.gml` — the official ministry POG
//     test export (https://www.gov.pl/attachment/8dd6086a-88ba-44fb-be68-d43d14a15e36),
//     253,475 bytes, pinned by lane E2b and re-asserted here before anything else runs.
//   • `fixtures/pl-uldk-2026-09-01/*.txt` — the two 20-parcel-baseline ULDK responses, fetched
//     LIVE by this lane on 2026-09-01 (keyless, HTTP 200). Pinning the served bytes is what
//     makes the parcel leg reproducible without hitting GUGiK on every test run.
//
// Expectations are pinned from TWO INDEPENDENT SOURCES (§probe-can-be-wrong-three-ways):
//   1. the E-wave lane audit's probe of this file (§PL-2: 28 strefy, symbol "SZ", FAR 0.8,
//      coverage 50.0, height 15.0 m, green 50.0), and
//   2. an independent grep census of the fixture bytes run by this lane (2026-09-01):
//      `grep -o '<app:maks…' | wc -l` → 18 / 18 / 18 present and 20 for the green share across
//      28 strefy — i.e. 10 / 10 / 10 / 8 ABSENT. Those absences are the E4-control-9 surface.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PL_SOURCES } from '../src/sourceRegistry/pl.js';
import { parseAppGml, type AppStrefaPlanistyczna } from '../src/parsers/appGml/index.js';
import {
    PL_ACT_STATUS_IN_FORCE,
    PL_ADAPTER_SOURCES,
    PL_ADAPTER_STATUS_NOT_YET_LIVE,
    PL_APP_GML_SOURCE_ID,
    PL_CHAIN_GRADES,
    PL_POG_NOT_YET_LIVE_REASON,
    PL_RULE_VOCABULARY,
    PL_RU_ENDPOINT_DISCOVERY,
    PL_ULDK_SOURCE_ID,
    PL_VALUE_BASIS_SCHEME,
    buildUldkByIdUrl,
    buildUldkByXyUrl,
    defaultPlStrefaLocator,
    isInPoland,
    mapPlAppGmlDocument,
    mapPlStrefaToRules,
    parsePlPogDocument,
    parsePlSridPolygon,
    parsePlUldkRecord,
    plCrsFromSrsName,
    plUldkGet,
    resolvePlParcelById,
    resolvePlParcelChain,
    type PlPogRuleSet,
    type PlResolvedZone,
} from '../src/countryAdapters/pl/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GML_PATH = resolve(HERE, 'fixtures/pl-app-gml-2-0/pog-official-sample-2024-12-04.gml');
const GML_SHA256 = '173690566bf1fab5fbb448970efc007219848d06eb93ff5e7e35c70ea5090853';
const ULDK_WARSAW_PATH = resolve(HERE, 'fixtures/pl-uldk-2026-09-01/warszawa-146510_8.0309.24-35.txt');
const ULDK_KRAKOW_PATH = resolve(HERE, 'fixtures/pl-uldk-2026-09-01/krakow-126105_9.0001.311.txt');

const GML_BYTES = readFileSync(GML_PATH);
const GML = GML_BYTES.toString('utf8');
const ULDK_WARSAW = readFileSync(ULDK_WARSAW_PATH, 'utf8');
const ULDK_KRAKOW = readFileSync(ULDK_KRAKOW_PATH, 'utf8');

const FETCHED_AT = '2026-09-01';

function ruleSetOrFail(gml: string = GML): PlPogRuleSet {
    const outcome = parsePlPogDocument(gml, FETCHED_AT);
    if (outcome.status !== 'found') {
        throw new Error(`expected found, got ${outcome.status}: ${JSON.stringify(outcome)}`);
    }
    return outcome.value;
}

/** A fake `fetch` that always answers with one body — every leg is testable offline. */
function fakeFetch(body: string, ok = true, status = 200): typeof fetch {
    return (async () =>
        ({ ok, status, text: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

/* ───────────────────────────── fixture provenance ─────────────────────── */

describe('fixture provenance', () => {
    it('is the byte-identical official ministry POG sample (sha256 pinned by lane E2b)', () => {
        expect(createHash('sha256').update(GML_BYTES).digest('hex')).toBe(GML_SHA256);
        expect(GML_BYTES.length).toBe(253475);
    });

    it('carries the two 20-parcel-baseline ULDK responses as served on 2026-09-01', () => {
        expect(ULDK_WARSAW.split('\n')[0]!.trim()).toBe('0');
        expect(ULDK_WARSAW).toContain('146510_8.0309.24/35');
        expect(ULDK_WARSAW).toContain('SRID=2180;POLYGON((');
        expect(ULDK_KRAKOW).toContain('126105_9.0001.311');
    });
});

/* ───────────────────────────── source rows ────────────────────────────── */

describe('source rows — one identity per source, and an honest live status', () => {
    it('reuses the thin registry rows by reference and adds exactly one adapter-owned row', () => {
        const registryIds = PL_SOURCES.map((r) => r.id);
        const adapterIds = PL_ADAPTER_SOURCES.map((r) => r.id);
        for (const id of registryIds) expect(adapterIds).toContain(id);
        expect(adapterIds.length).toBe(registryIds.length + 1);
        expect(new Set(adapterIds).size).toBe(adapterIds.length); // no id twice
        expect(registryIds).toContain(PL_ULDK_SOURCE_ID); // the anti-drift guard's subject
    });

    it('marks the POG channel NOT-YET-LIVE and says so in coverage, never implying a service', () => {
        const row = PL_ADAPTER_SOURCES.find((r) => r.id === PL_APP_GML_SOURCE_ID)!;
        expect(row.adapterStatus).toBe(PL_ADAPTER_STATUS_NOT_YET_LIVE);
        expect(row.coverage).toContain('OFFICIAL MINISTRY SAMPLE ONLY');
        expect(row.coverage).toContain('NOT national coverage');
        // The licence for THIS publisher was never read — an inferred colour would be a claim.
        expect(row.licence.colour).toBe('YELLOW');
        expect(row.licence.verifiedDate).toBeNull();
        expect(row.probes.length).toBeGreaterThanOrEqual(2);
    });

    it('records the endpoint-discovery NEGATIVE together with the control that refutes the 401', () => {
        expect(PL_RU_ENDPOINT_DISCOVERY.verdict).toContain('NOT-YET-SERVABLE');
        const joined = PL_RU_ENDPOINT_DISCOVERY.attempts.join('\n');
        expect(joined).toContain('KrajowaIntegracjaPlanowOgolnych');
        // Without this control the 401 reads as a discovered gated national POG service.
        expect(joined).toContain('REFUTED BY CONTROL');
        expect(joined).toContain('ZupelnieNieistniejacaUsluga123');
    });
});

/* ───────────────────── document → canonical rule set ──────────────────── */

describe('APP GML 2.0 POG document → canonical rules', () => {
    const rs = ruleSetOrFail();

    it('mints one Plan + its Version row from the act, with status MIRRORED verbatim', () => {
        expect(rs.plan).not.toBeNull();
        expect(rs.plan!.id).toBe('pl-plan-PL.ZIPPZP.11111_321202-POG_1POG_20241204T095812');
        expect(rs.plan!.kind).toBe('planOgolnyGminy'); // TypAktuPlanowaniaPrzestrzennegoKod tail
        expect(rs.plan!.status).toBe('elaboration'); // INSPIRE ProcessStepGeneralValue, verbatim
        // No adopting resolution is served, so no adoption/in-force date is invented.
        expect(rs.plan!.adoptedDate).toBeNull();
        expect(rs.plan!.inForceFrom).toBeNull();
        // The OBJECT-VERSION axis lands on Version, not on the rules' legal window.
        expect(rs.planVersion).toEqual({
            entityRef: rs.plan!.id,
            validFrom: '2024-12-04',
            validTo: null,
            supersededBy: null,
        });
    });

    it('mints 28 Zones and 174 rules — the lane-audit census, independently re-derived', () => {
        expect(rs.zones.length).toBe(28); // lane 4 §PL-2: "28 in sample"
        expect(rs.rules.length).toBe(174); // 28 × 6 + 6 zones that also carry a profilDodatkowy
        const byParam: Record<string, number> = {};
        for (const r of rs.rules) {
            byParam[r.provenance.parameter] = (byParam[r.provenance.parameter] ?? 0) + 1;
        }
        expect(byParam).toEqual({
            maxFloorAreaRatioAboveGround: 28,
            maxCoveragePercent: 28,
            maxHeight: 28,
            minGreenSharePercent: 28,
            zoneKindCode: 28,
            landUseProfilePrimary: 28,
            landUseProfileAdditional: 6,
        });
    });

    it('maps strefa 1SZ to the lane-audit values, in the document native CRS', () => {
        const z = rs.zones[0]!;
        expect(z.strefa.oznaczenie).toBe('1SZ');
        expect(z.zone).not.toBeNull();
        expect(z.zone!.id).toBe('pl-zone-PL.ZIPPZP.11111_321202-POG_1POG-1SZ_20241204T095812');
        expect(z.zone!.planId).toBe(rs.plan!.id);
        expect(z.zone!.typology).toEqual({ national: 'SZ', harmonised: null });
        // EPSG:2176 from `http://www.opengis.net/def/crs/EPSG/0/2176` — never defaulted.
        expect(z.zone!.geometry.crs).toBe('EPSG:2176');
        expect(z.zone!.geometry.kind).toBe('Polygon');
        const value = (p: string): unknown =>
            z.rules.find((r) => r.provenance.parameter === p)!.provenance.value;
        expect(value('maxFloorAreaRatioAboveGround')).toBe(0.8);
        expect(value('maxCoveragePercent')).toBe(50);
        expect(value('maxHeight')).toBe(15);
        expect(value('minGreenSharePercent')).toBe(50);
        expect(value('zoneKindCode')).toBe('strefaWielofunkcyjnaZZabudowaZagrodowa');
        expect(value('landUseProfilePrimary')).toBe(
            'KPT-MPZP-RZM; KPT-MPZP-RZP; KPT-MPZP-RA; KPT-MPZP-K; KPT-MPZP-ZP; KPT-MPZP-ZD; KPT-MPZP-I',
        );
        // the served uom, carried verbatim (gml:LengthType makes it mandatory in the document)
        expect(z.rules.find((r) => r.provenance.parameter === 'maxHeight')!.provenance.unit).toBe('m');
    });

    it('conserves the served ring: every zone geometry keeps the parser positions exactly', () => {
        const parsed = parseAppGml(GML);
        if (parsed.status !== 'parsed') throw new Error('fixture must parse');
        for (const [i, strefa] of parsed.document.strefyPlanistyczne.entries()) {
            const zone = rs.zones[i]!.zone;
            if (zone === null) continue;
            const coords = zone.geometry.coordinates as number[][][];
            expect(coords[0]!.length).toBe(strefa.geometria.polygons[0]!.exterior.positions.length);
            expect(coords[0]![0]).toEqual([...strefa.geometria.polygons[0]!.exterior.positions[0]!]);
        }
    });

    it('R1 REFERENT CONTRACT: every basis ref resolves to an entity minted by this same run', () => {
        const minted = new Set<string>([rs.plan!.id]);
        for (const z of rs.zones) if (z.zone !== null) minted.add(z.zone.id);
        let refs = 0;
        for (const rule of rs.rules) {
            for (const b of rule.applicability.basis) {
                refs += 1;
                expect(minted.has(b.ref)).toBe(true);
            }
            // at-least-one-leg is a schema refine, but assert the intent explicitly:
            expect(
                rule.applicability.basis.length > 0 ||
                    rule.applicability.geometry !== null ||
                    rule.applicability.condition !== null,
            ).toBe(true);
        }
        expect(refs).toBe(174); // every rule cites its zone — no dangling strings anywhere
    });

    it('R5: normativeForce is the RegulationNatureValue code, mirrored verbatim on every rule', () => {
        for (const r of rs.rules) expect(r.provenance.normativeForce).toBe('generallyBinding');
    });

    it('R2: every rule carries the statutory value basis the XSD itself cites', () => {
        for (const r of rs.rules) {
            expect(r.provenance.valueBasis?.scheme).toBe(PL_VALUE_BASIS_SCHEME);
            const entry = PL_RULE_VOCABULARY.find((e) => e.parameter === r.provenance.parameter)!;
            expect(r.provenance.valueBasis?.code).toBe(entry.statutoryBasis);
        }
        // the FAR row, verbatim from `planowaniePrzestrzenne_2_0.xsd`'s own <documentation>
        expect(
            PL_RULE_VOCABULARY.find((e) => e.parameter === 'maxFloorAreaRatioAboveGround')!
                .statutoryBasis,
        ).toBe('art. 13e ust. 2 pkt 2 oraz ust. 3 pkt 1 i 2');
    });

    it('states its own INCOMPLETENESS: the unmapped feature classes are counted, not dropped', () => {
        const census = Object.fromEntries(rs.unmapped.map((u) => [u.featureType, u.count]));
        expect(census).toEqual({
            'app:ObszarUzupelnieniaZabudowy': 4,
            'app:ObszarZabudowySrodmiejskiej': 2,
            'app:ObszarStandardowDostepnosciInfrastrukturySpolecznej': 1,
        });
        const srodmiejska = rs.unmapped.find(
            (u) => u.featureType === 'app:ObszarZabudowySrodmiejskiej',
        )!;
        expect(srodmiejska.reason).toContain('INCOMPLETE, not wrong');
    });

    it('records the official sample own header disagreement instead of obeying it', () => {
        expect(rs.caveats.join(' ')).toContain('numberReturned=6');
        expect(rs.caveats.join(' ')).toContain('37 members');
    });

    it('mints no Document where none is linkable, and says why', () => {
        expect(rs.documents).toEqual([]);
        expect(rs.planContext.caveats.join(' ')).toContain('no dokumentUchwalajacy');
        expect(rs.planContext.caveats.join(' ')).toContain('not a document link');
        for (const r of rs.rules) expect(r.provenance.source.document).toBeNull();
    });
});

/* ───────────────────── E4 control 9 — UNKNOWN is visible ──────────────── */

describe('E4 control 9 — the state own artifact exercises UNKNOWN, and it stays UNKNOWN', () => {
    const rs = ruleSetOrFail();

    it('emits a tier-6 rule for every absent ceiling: 10 / 10 / 10 / 8 of 28 (grep-verified)', () => {
        const t6: Record<string, number> = {};
        for (const r of rs.rules) {
            if (r.provenance.confidence.tier === 6) {
                t6[r.provenance.parameter] = (t6[r.provenance.parameter] ?? 0) + 1;
            }
        }
        // Independent grep census of the fixture bytes (2026-09-01): the four elements occur
        // 18 / 18 / 18 / 20 times across 28 strefy.
        expect(t6).toEqual({
            maxFloorAreaRatioAboveGround: 10,
            maxCoveragePercent: 10,
            maxHeight: 10,
            minGreenSharePercent: 8,
        });
    });

    it('never turns an absent ceiling into 0, Infinity or a missing row', () => {
        const ceilings = ['maxFloorAreaRatioAboveGround', 'maxCoveragePercent', 'maxHeight', 'minGreenSharePercent'];
        for (const z of rs.zones) {
            for (const p of ceilings) {
                const rule = z.rules.find((r) => r.provenance.parameter === p);
                expect(rule, `${z.strefa.oznaczenie} must carry a ${p} row`).toBeDefined();
                const v = rule!.provenance.value;
                expect(v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)).toBe(true);
                if (v === null) {
                    expect(rule!.provenance.confidence.tier).toBe(6);
                    expect(rule!.provenance.confidence.note).toContain('UNKNOWN, never 0');
                }
            }
        }
    });

    it('names the absent element in the tier-6 note (a bare null teaches nobody anything)', () => {
        const t6 = rs.rules.find((r) => r.provenance.confidence.tier === 6)!;
        expect(t6.provenance.confidence.note).toContain('maksNadziemnaIntensywnoscZabudowy');
        expect(t6.provenance.confidence.note).toContain('minOccurs=0');
    });
});

/* ──────────────────── R3 — validity basis, both branches ──────────────── */

describe('R3 — validityBasis says what the window is a claim ABOUT', () => {
    it('a DRAFT act (status elaboration) yields ingestion windows, never legal ones', () => {
        const rs = ruleSetOrFail();
        for (const r of rs.rules) {
            expect(r.provenance.validityBasis).toBe('ingestion');
            expect(r.provenance.valid_from).toBe(FETCHED_AT);
            expect(r.provenance.confidence.note).toContain('is not legalForce');
            // the served object-version date is PRESERVED, just not promoted to a legal claim
            expect(r.provenance.confidence.note).toContain('2024-12-04');
        }
    });

    it('the SAME document with the act in legalForce yields legal windows on the served dates', () => {
        // An in-memory edit of the ACT status only — `String.replace` with a string pattern
        // hits the FIRST occurrence, and the act is the first member of the collection; the 35
        // wydzielenia keep their own `elaboration` status, which is the point: the instrument's
        // status governs the legal window, not the drawn object's.
        const inForce = GML.replace(
            'ProcessStepGeneralValue/elaboration',
            `ProcessStepGeneralValue/${PL_ACT_STATUS_IN_FORCE}`,
        );
        expect(inForce).not.toBe(GML); // the edit must actually have applied
        expect(inForce.split('ProcessStepGeneralValue/elaboration').length - 1).toBe(35);
        const rs = ruleSetOrFail(inForce);
        expect(rs.plan!.status).toBe(PL_ACT_STATUS_IN_FORCE);
        for (const r of rs.rules) {
            expect(r.provenance.validityBasis).toBe('legal');
            expect(r.provenance.valid_from).toBe('2024-12-04'); // the strefa's own obowiazujeOd
            expect(r.provenance.valid_to).toBeNull();
        }
    });
});

/* ─────────────────────────── mapper refusals ──────────────────────────── */

describe('the mapper refuses by name rather than emitting a rule that applies nowhere', () => {
    it('throws when a strefa has neither usable geometry nor a resolvable plan', () => {
        const parsed = parseAppGml(GML);
        if (parsed.status !== 'parsed') throw new Error('fixture must parse');
        const stripped: AppStrefaPlanistyczna = {
            ...parsed.document.strefyPlanistyczne[0]!,
            geometria: { polygons: [] },
        };
        expect(() =>
            mapPlStrefaToRules(
                stripped,
                { akt: null, adoptingDocument: null, plan: null, planVersion: null, documents: [], caveats: [] },
                FETCHED_AT,
            ),
        ).toThrow(/NO usable geometry and NO resolvable plan identity/);
    });

    it('refuses a multi-act document instead of attaching zones to the wrong instrument', () => {
        const parsed = parseAppGml(GML);
        if (parsed.status !== 'parsed') throw new Error('fixture must parse');
        const twoActs = {
            ...parsed.document,
            akty: [parsed.document.akty[0]!, parsed.document.akty[0]!],
        };
        expect(() => mapPlAppGmlDocument(twoActs, FETCHED_AT)).toThrow(/2 akty planowania/);
    });

    it('bridges the parser three outcomes without collapsing any: empty ≠ refused ≠ parsed', () => {
        const refused = parsePlPogDocument('not xml at all', FETCHED_AT);
        expect(refused.status).toBe('transient');
        expect(refused.status === 'transient' && refused.reason).toContain('APP GML refused');
        const empty = parsePlPogDocument(
            '<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0"></wfs:FeatureCollection>',
            FETCHED_AT,
        );
        expect(empty.status).toBe('absent'); // the register answered and there is nothing here
    });

    it('a CRS it cannot read is never defaulted', () => {
        expect(plCrsFromSrsName('http://www.opengis.net/def/crs/EPSG/0/2176')).toBe('EPSG:2176');
        expect(plCrsFromSrsName('urn:ogc:def:crs:EPSG::2180')).toBe('EPSG:2180');
        expect(plCrsFromSrsName('EPSG:2180')).toBe('EPSG:2180');
        expect(plCrsFromSrsName('a local grid')).toBeNull();
        expect(plCrsFromSrsName(null)).toBeNull();
    });
});

/* ───────────────────── the ULDK parcel arm (live-pinned) ──────────────── */

describe('ULDK parcel arm — the status is the BODY, never the HTTP code', () => {
    it('parses the served Warszawa record: identity + a closed ring in native EPSG:2180', () => {
        const parcel = parsePlUldkRecord(ULDK_WARSAW.split('\n')[1]!)!;
        expect(parcel.id).toBe('146510_8.0309.24/35');
        expect(parcel.voivodeship).toBe('mazowieckie');
        expect(parcel.commune).toBe('Warszawa (miasto)');
        expect(parcel.region).toBe('5-03-09');
        expect(parcel.parcelNumber).toBe('24/35');
        expect(parcel.crs).toBe('EPSG:2180'); // measure HERE, never after reprojection
        expect(parcel.ring.length).toBe(125);
        expect(parcel.ring[0]).toEqual([636949.912510792, 487118.535496397]);
        expect(parcel.ring[parcel.ring.length - 1]).toEqual(parcel.ring[0]); // closed
        expect(parcel.source).toBe(PL_ULDK_SOURCE_ID);
    });

    it('parses the served Kraków record (the second baseline parcel)', () => {
        const parcel = parsePlUldkRecord(ULDK_KRAKOW.split('\n')[1]!)!;
        expect(parcel.id).toBe('126105_9.0001.311');
        expect(parcel.voivodeship).toBe('małopolskie');
        expect(parcel.ring.length).toBe(41);
    });

    it('classifies `-1 brak wyników` (HTTP 200!) as ABSENT — a durable "nothing here"', async () => {
        const outcome = await plUldkGet('u', 'label', {
            fetchImpl: fakeFetch('-1 brak wyników\nbłędny format odpowiedzi XML'),
        });
        expect(outcome.status).toBe('absent');
        expect(outcome.status === 'absent' && outcome.reason).toContain('brak');
    });

    it('classifies the bad-parameter body (HTTP 200!) as TRANSIENT — never as absence', async () => {
        const outcome = await plUldkGet('u', 'label', {
            fetchImpl: fakeFetch(
                'niepoprawny parametr NieMaTakiego, specyfikacja usługi jest dostępna pod adresem: https://uldk.gugik.gov.pl/opis.html',
            ),
        });
        // A misconfiguration reading as "no parcel here" is the conflation this classification
        // exists to prevent — the two shapes differ ONLY in the body.
        expect(outcome.status).toBe('transient');
        expect(outcome.status === 'transient' && outcome.reason).toContain('niepoprawny parametr');
    });

    it('classifies a status-0 answer with no record as TRANSIENT, not as an empty result', async () => {
        const outcome = await plUldkGet('u', 'label', { fetchImpl: fakeFetch('0\n') });
        expect(outcome.status).toBe('transient');
    });

    it('resolves a parcel end-to-end through the injected fetch', async () => {
        const outcome = await resolvePlParcelById('146510_8.0309.24/35', {
            fetchImpl: fakeFetch(ULDK_WARSAW),
        });
        expect(outcome.status).toBe('found');
        expect(outcome.status === 'found' && outcome.value.id).toBe('146510_8.0309.24/35');
    });

    it('puts LONGITUDE first in the xy parameter (the silent-absence axis trap)', () => {
        expect(buildUldkByXyUrl(52.2317, 21.0061)).toContain('xy=21.0061,52.2317,4326');
        expect(buildUldkByIdUrl('146510_8.0309.24/35')).toContain(
            'id=146510_8.0309.24%2F35',
        );
    });

    it('reads only a POLYGON it can actually read', () => {
        expect(parsePlSridPolygon('SRID=2180;POLYGON((0 0,1 0,1 1,0 0))')!.ring.length).toBe(4);
        expect(parsePlSridPolygon('MULTIPOLYGON(((0 0,1 0,1 1,0 0)))')).toBeNull();
        expect(parsePlSridPolygon('POLYGON((0 0,1 0))')).toBeNull(); // fewer than 4 positions
        expect(parsePlSridPolygon('')).toBeNull();
    });
});

/* ──────────────────────────────── the chain ───────────────────────────── */

describe('the parcel chain — every leg says which grade it is', () => {
    it('parcel DIRECT, POG leg TRANSIENT-by-name (not absent) when no document is supplied', async () => {
        const outcome = await resolvePlParcelChain(
            '146510_8.0309.24/35',
            { fetchImpl: fakeFetch(ULDK_WARSAW) },
            FETCHED_AT,
        );
        expect(outcome.status).toBe('found');
        const chain = outcome.status === 'found' ? outcome.value : null;
        expect(chain!.parcel.id).toBe('146510_8.0309.24/35');
        // "the service is not published yet" is NOT "there is no plan at this parcel"
        expect(chain!.pog.status).toBe('transient');
        expect(chain!.pog.status === 'transient' && chain!.pog.reason).toBe(PL_POG_NOT_YET_LIVE_REASON);
        expect(chain!.zoneAtParcel.status).toBe('transient');
    });

    it('the default zone-at-parcel locator REFUSES by name, naming both served CRSs', async () => {
        const rs = ruleSetOrFail();
        const parcel = parsePlUldkRecord(ULDK_WARSAW.split('\n')[1]!)!;
        const outcome = defaultPlStrefaLocator(parcel, rs);
        expect(outcome.status).toBe('transient'); // never `absent`
        const reason = outcome.status === 'transient' ? outcome.reason : '';
        expect(reason).toContain('EPSG:2180');
        expect(reason).toContain('EPSG:2176');
        expect(reason).toContain('NOT "no zone at this parcel"');
    });

    it('THE ESCAPE HATCH IS REAL: an injected locator + document runs the chain end-to-end', async () => {
        const byOznaczenie =
            (want: string) =>
            (
                _p: Parameters<typeof defaultPlStrefaLocator>[0],
                rs: PlPogRuleSet,
            ): ReturnType<typeof defaultPlStrefaLocator> => {
                const hit = rs.zones.find((z) => z.strefa.oznaczenie === want);
                return hit !== undefined
                    ? { status: 'found', value: hit }
                    : { status: 'absent', reason: `no-zone: ${want}` };
            };
        const outcome = await resolvePlParcelChain(
            '146510_8.0309.24/35',
            { fetchImpl: fakeFetch(ULDK_WARSAW), pogGml: GML, strefaLocator: byOznaczenie('1SZ') },
            FETCHED_AT,
        );
        expect(outcome.status).toBe('found');
        const chain = outcome.status === 'found' ? outcome.value : null;
        expect(chain!.pog.status).toBe('found');
        expect(chain!.zoneAtParcel.status).toBe('found');
        const zone = (chain!.zoneAtParcel as { status: 'found'; value: PlResolvedZone }).value;
        expect(zone.strefa.oznaczenie).toBe('1SZ');
        expect(zone.rules.length).toBe(7);
        expect(zone.zone!.planId).toBe(chain!.pog.status === 'found' ? chain!.pog.value.plan!.id : '');
    });

    it('a parcel that does not exist fails the chain as ABSENT, carrying no fabricated rules', async () => {
        const outcome = await resolvePlParcelChain(
            '999999_9.9999.999/999',
            { fetchImpl: fakeFetch('-1 brak wyników') },
            FETCHED_AT,
        );
        expect(outcome.status).toBe('absent');
    });
});

/* ───────────────────── the regime-flip grade baseline ─────────────────── */

describe('the PL regime flip (20-parcel rows 19–20) is pinned, not silent', () => {
    it('pins the PRE-FLIP grades so a later run shows an IMPROVEMENT, not a rewrite', () => {
        expect(PL_CHAIN_GRADES.measuredOn).toBe('2026-09-01');
        expect(PL_CHAIN_GRADES.P).toBe('DIRECT'); // ULDK, live + keyless, both parcels resolved
        expect(PL_CHAIN_GRADES.R).toBe('DIRECT-in-document / MISSING-per-parcel');
        expect(PL_CHAIN_GRADES.D).toBe('DIRECT');
        expect(PL_CHAIN_GRADES.V).toBe('MISSING');
        expect(PL_CHAIN_GRADES.DP).toContain('REFUSED');
        expect(PL_CHAIN_GRADES.DP).toContain('działka budowlana');
        expect(PL_CHAIN_GRADES.flipsWhen).toContain('2026-11-30');
        expect(PL_CHAIN_GRADES.flipPoint).toContain('fetchPlPogDocument');
    });

    it('routes only Polish points, and records that the DE overlap is unresolved', () => {
        expect(isInPoland(52.2317, 21.0061)).toBe(true); // Warszawa
        expect(isInPoland(50.0614, 19.9366)).toBe(true); // Kraków
        expect(isInPoland(59.437, 24.7536)).toBe(false); // Tallinn
        expect(isInPoland(52.52, 13.405)).toBe(false); // Berlin — west of the box
        // ⚠ the honest failure this box cannot resolve alone (see plJurisdiction.ts):
        expect(isInPoland(52.34, 14.55)).toBe(true); // Frankfurt (Oder) — GERMAN, inside the box
    });
});

/* ───────────── the scramble control (corpus-never-jittered doctrine) ───── */

describe('scramble control — the suite cannot pass on arbitrary input', () => {
    it('a corruption the mapper is NOT asked to refuse changes the OUTPUT visibly', () => {
        const scrambled = GML.replace('<app:oznaczenie>1SZ<', '<app:oznaczenie>9ZZ<');
        expect(scrambled).not.toBe(GML);
        const rs = ruleSetOrFail(scrambled);
        expect(rs.zones[0]!.strefa.oznaczenie).toBe('9ZZ');
        expect(rs.zones[0]!.rules[0]!.provenance.source.object_id).toContain('9ZZ');
        // and the pristine fixture still maps to the pinned value (restore is the file itself)
        expect(ruleSetOrFail().zones[0]!.strefa.oznaczenie).toBe('1SZ');
    });
});
