// STAGE 0 — DATASET DISCOVERY · TEST SUITE
//
// Run: `npx tsx --test tools/dataset-discovery/discover.test.ts`
//
// Uses `node:test` + `tsx`, matching `tools/city-completion/computeScorecard.test.ts`. EVERY test
// runs OFFLINE against bytes captured from the real services on 2026-08-02 (`fixtures/`), so the
// suite is deterministic in CI and still exercises what real publishers actually emit.
//
// THE LOAD-BEARING ASSERTIONS
//   1. §ACID TEST — the tool independently surfaces the three datasets humans missed.
//   2. §ADR-0288 — machine-readability and legal authority are never merged, and no publication
//      verdict is ever emitted.
//   3. §FAILURE-IS-NOT-EMPTY — an unprobed or errored bit stays `null` and the score self-reports as
//      a lower bound; a 403 never becomes a zero.
//   4. §GMU — a foreign service extent is caught by REPROJECTION, and an extent we cannot reproject
//      is `unknown`, never `far`.
//   5. §BBOX-SANITY — mislabelled and degenerate extents do NOT produce false negatives.
//   6. §AXIS-ORDER — "0 features" is only ever reported after the ladder is exhausted.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseText, PLANNING_TERMS, PLANNING_VARIABLES } from './taxonomy.mjs';
import {
    classifyLayer, scoreMachineReadability, scoreLegalAuthority, assertScoresNotMerged,
    verifyLocality, bboxToWgs84, webMercatorToWgs84, utmEtrs89ToWgs84, haversineKm, epsgCodeOf,
    sanitiseWgs84Bbox, geometryKindOf, PUBLISHABLE_NOT_ASSESSED, MR_BITS, LA_BITS,
    detectTemporalValidity,
} from './classify.mjs';
import {
    parseWfsCapabilities, parseWmsCapabilities, parseArcgisService, parseDescribeFeatureType, parseHits,
} from './capabilities.mjs';
import {
    runDiscovery, MUNICIPALITIES, ACID_TEST_TARGETS, acidTest, falseNegativeRate, countFeatures,
    bboxForms, coldStartRecord, foralExclusion, PUBLISHERS, ACID_TEST_LIMIT, renderMarkdown,
    candidateSlugsFor, candidateHostsFor,
} from './discover.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(resolve(HERE, 'fixtures', n), 'utf8');
const CORDOBA = { lat: 37.8882, lon: -4.7794 };

// ═════════════════════════════════════════════════════════════════════════════
describe('§TAXONOMY — the dictionary is data a planner can check', () => {
    test('normaliseText deaccents, splits separators and lowercases', () => {
        assert.equal(normaliseText('Calificación'), 'calificacion');
        assert.equal(normaliseText('idecordoba:manzana'), 'idecordoba manzana');
        assert.equal(normaliseText('Murcia:pgou_eje_comercial'), 'murcia pgou eje comercial');
        assert.equal(normaliseText('MaxPlantas'), 'max plantas');
    });

    test('every term maps only to variables that exist in PLANNING_VARIABLES', () => {
        for (const t of PLANNING_TERMS) {
            for (const v of t.variables) {
                assert.ok((PLANNING_VARIABLES as Record<string, unknown>)[v], `term ${t.id} names unknown variable ${v}`);
            }
        }
    });

    test('the `vial` term carries its documented caveat — sup_viales must never look like a resolution', () => {
        const vial = PLANNING_TERMS.find((t) => t.id === 'vial')!;
        assert.match(vial.caveat!, /callejero/i);
        assert.ok(!vial.variables.includes('street-width'),
            'a street-surface layer must NOT propose street-width: that substitution is derived LAW (ADR-0284)');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§GMU — the acronym-collision gate', () => {
    test('the real GMU_Services extent reprojects to Virginia and is caught', () => {
        // Verbatim from `MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` Probe 1.
        const fullExtent = [-8608596.03, 4698503.61, -8601700.05, 4703965.61];
        const rp = bboxToWgs84(fullExtent, 'EPSG:102100')!;
        assert.ok(rp, 'a Web-Mercator extent must be reprojectable');
        const v = verifyLocality(rp.bbox, CORDOBA);
        assert.equal(v.verdict, 'far');
        // The findings file measured 6 148 km. Allow a few km for the bbox-edge vs centroid choice.
        assert.ok(Math.abs(v.distanceKm! - 6148) < 60, `expected ~6148 km, got ${v.distanceKm}`);
        assert.match(v.reason!, /ACRONYM-COLLISION/);
    });

    test('the reprojected GMU extent lands in Fairfax, Virginia (38.8381 N, −77.3323 W)', () => {
        // The findings file quotes the LOWER corner and measures 6 148 km from it. Reproduced here
        // ordinate-for-ordinate so a regression in the Mercator inverse fails loudly.
        const c = webMercatorToWgs84(-8608596.03, 4698503.61);
        assert.ok(Math.abs(c.lat - 38.8381) < 0.001, `lat ${c.lat}`);
        assert.ok(Math.abs(c.lon - -77.3323) < 0.001, `lon ${c.lon}`);
        assert.ok(Math.abs(haversineKm(c, CORDOBA) - 6148) < 1, 'the published 6 148 km must reproduce');
    });

    test('⚠ an extent in a CRS we cannot reproject is UNKNOWN, never far', () => {
        assert.equal(bboxToWgs84([1, 2, 3, 4], 'EPSG:99999'), null);
        const v = verifyLocality(null as unknown as number[], CORDOBA);
        assert.equal(v.verdict, 'unknown');
        assert.notEqual(v.verdict, 'far');
    });

    test('ETRS89/UTM 30N round-trips to Córdoba', () => {
        const p = utmEtrs89ToWgs84(343000, 4194000, 30);
        assert.ok(haversineKm(p, CORDOBA) < 15, `expected near Córdoba, got ${JSON.stringify(p)}`);
    });

    test('a continent-spanning extent that contains the city does not evidence locality', () => {
        const v = verifyLocality([-20, 30, 40, 70], CORDOBA);
        assert.equal(v.verdict, 'contains-but-broad');
    });

    test('epsgCodeOf understands URN, short and CRS84 spellings', () => {
        assert.equal(epsgCodeOf('urn:ogc:def:crs:EPSG::25830'), 25830);
        assert.equal(epsgCodeOf('EPSG:3857'), 3857);
        assert.equal(epsgCodeOf('CRS:84'), 4326);
        assert.equal(epsgCodeOf(null), null);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§BBOX-SANITY — publisher metadata defects must not become false negatives', () => {
    test('EPSG:25830 metres served inside ows:WGS84BoundingBox are repaired, not quarantined', () => {
        // `Murcia:pgou_mpg`, verbatim from the live capabilities document.
        const s = sanitiseWgs84Bbox([653533.625, 4177460.75, 683727.3125, 4213694.5], 'urn:ogc:def:crs:EPSG::25830');
        assert.ok(s.bbox, 'must be repaired via the declared native CRS');
        assert.equal(s.repaired, true);
        const v = verifyLocality(s.bbox!, { lat: 37.9838, lon: -1.128 });
        assert.equal(v.verdict, 'local',
            'a genuine PGOU layer must not be quarantined by its publisher\'s bbox defect (ADR-0290: a false negative is the most expensive error)');
    });

    test('a point-sized / Null-Island extent is UNKNOWN, not 4 274 km away', () => {
        // `Murcia:tranvia_lineas`, verbatim.
        const s = sanitiseWgs84Bbox([-7.48875284370359, -0.0000090193758094, -7.48874388470691, 0], 'urn:ogc:def:crs:EPSG::25830');
        assert.equal(s.bbox, null);
        assert.match(s.reason!, /point-sized|Null-Island/);
    });

    test('an out-of-range extent with no reprojectable CRS is UNKNOWN, never far', () => {
        const s = sanitiseWgs84Bbox([653533, 4177460, 683727, 4213694], null);
        assert.equal(s.bbox, null);
        assert.match(s.reason!, /UNKNOWN, never "far"/);
    });

    test('a well-formed WGS84 extent passes through untouched', () => {
        const b = [-1.3818, 37.7129, -0.8664, 38.1214];
        const s = sanitiseWgs84Bbox(b, 'urn:ogc:def:crs:EPSG::25830');
        assert.deepEqual(s.bbox, b);
        assert.equal(s.repaired, false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§ADR-0288 — machine-readable is not publishable, and the axes never merge', () => {
    test('assertScoresNotMerged rejects any combined score', () => {
        const base = { machineReadability: { score: 1 }, legalAuthority: { score: 1 } };
        assert.ok(assertScoresNotMerged(base));
        for (const k of ['overallScore', 'qualityScore', 'combinedScore', 'score', 'confidence', 'rating']) {
            assert.throws(() => assertScoresNotMerged({ ...base, [k]: 0.5 }), /ADR-0288 VIOLATION/);
        }
    });

    test('a record missing either axis is rejected', () => {
        assert.throws(() => assertScoresNotMerged({ machineReadability: { score: 1 } }), /ADR-0288/);
    });

    test('the legal-authority axis always carries the not-assessed publication constant', () => {
        const la = scoreLegalAuthority({ competentPublisher: true, namedInstrument: true, instrumentDated: true, normativeObject: true, featureLevelCitation: true });
        assert.equal(la.score, 1);
        assert.equal(la.publishable, PUBLISHABLE_NOT_ASSESSED,
            'a PERFECT legal-authority score still authorises nothing');
    });

    test('a perfectly readable layer with no legal standing scores 1.0 / 0.0 — the two are independent', () => {
        const mr = scoreMachineReadability({ advertised: true, featureQueryable: true, schemaRetrievable: true, featuresReturn: true, semanticAttributes: true });
        const la = scoreLegalAuthority({ competentPublisher: false, namedInstrument: false, instrumentDated: false, normativeObject: false, featureLevelCitation: false });
        assert.equal(mr.score, 1);
        assert.equal(la.score, 0);
    });

    test('the triage rank contains no legal-authority term', () => {
        const mk = (publisher: string | null) => classifyLayer(
            { name: 'x:manzana', service: 'WFS', endpoint: 'e', publisher, bboxWgs84: [-4.9, 37.7, -4.6, 38.0] },
            { centroid: CORDOBA, publisherRegistry: PUBLISHERS },
        );
        // `coaco` is declared NOT competent for planning; `ayto-cordoba` is. If legal authority leaked
        // into the rank, these would differ.
        const a = mk('coaco'); const b = mk('ayto-cordoba');
        assert.notEqual(a.legalAuthority.score, b.legalAuthority.score, 'the LA axis must react to the publisher');
        assert.equal(a.triageRank, b.triageRank, '§RANK-IS-NOT-A-SCORE: the rank must NOT react to it');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§FAILURE-IS-NOT-EMPTY (L-422/457/467/469 · PROBE-DISCIPLINE R5)', () => {
    test('an unprobed bit stays null and the score self-reports as a lower bound', () => {
        const mr = scoreMachineReadability({ advertised: true, featureQueryable: true });
        assert.equal(mr.bits.schemaRetrievable, null, 'unprobed must NOT become false');
        assert.equal(mr.isLowerBound, true);
        assert.deepEqual(mr.probeGaps, ['schemaRetrievable', 'featuresReturn', 'semanticAttributes']);
    });

    test('a fully probed score is not a lower bound', () => {
        const mr = scoreMachineReadability(Object.fromEntries(MR_BITS.map((b) => [b.id, false])));
        assert.equal(mr.isLowerBound, false);
        assert.equal(mr.score, 0, 'measured-negative IS a legitimate zero — unlike an unprobed one');
    });

    test('an unlisted publisher scores null, not 0 — competence is declared, never inferred', () => {
        const la = scoreLegalAuthority({ namedInstrument: true, instrumentDated: true, normativeObject: true, featureLevelCitation: true });
        assert.equal(la.bits.competentPublisher, null);
        assert.equal(la.isLowerBound, true);
        assert.ok(la.probeGaps.includes('competentPublisher'));
    });

    test('parseHits reports an OWS exception as a failure, never as a count of 0', () => {
        const h = parseHits('<ows:ExceptionReport><ows:Exception><ows:ExceptionText>Feature type coaco:areas unknown</ows:ExceptionText></ows:Exception></ows:ExceptionReport>');
        assert.equal(h.ok, false);
        assert.equal((h as { count?: number }).count, undefined);
        assert.match(h.reason!, /coaco:areas unknown/);
    });

    test('a parser given an unrecognised body returns a gap, not an empty layer list', () => {
        const r = parseWfsCapabilities('<html>Server under construction</html>', 'e');
        assert.equal(r.ok, false);
        assert.equal((r as { layers?: unknown[] }).layers, undefined,
            'an unparseable body must NOT masquerade as "zero layers"');
    });

    test('the LA/MR bit rosters are disjoint — the axes literally cannot share an input', () => {
        const mrIds = new Set(MR_BITS.map((b) => b.id));
        for (const b of LA_BITS) assert.ok(!mrIds.has(b.id), `${b.id} appears on both axes`);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§AXIS-ORDER — "0 features" must survive the ladder (the Córdoba manzana artefact)', () => {
    const hits = (n: number) => `<wfs:FeatureCollection numberMatched="${n}" numberReturned="0"/>`;
    const ok = (body: string) => ({ url: 'u', httpStatus: 200, contentType: 'text/xml', bytes: body.length, ms: 1, outcome: 'ok', body });

    test('the matrix offers both axis orders AND both CRS families', () => {
        const forms = bboxForms(CORDOBA, 0.02, 'urn:ogc:def:crs:EPSG::25830');
        const ids = forms.map((f) => f.id);
        assert.ok(ids.includes('urn-4326-latlon') && ids.includes('epsg-4326-lonlat') && ids.includes('bare-latlon'));
        // CORRECTION 1 — the CRS half. Native rungs are FORWARD-PROJECTED, not WGS84 degrees wearing
        // a projected label (which is malformed, and a 0 from it proves nothing).
        assert.ok(ids.includes('native-projected-en') && ids.includes('native-projected-ne'));
        assert.equal(forms.length, 7);
        const en = forms.find((f) => f.id === 'native-projected-en')!;
        const [x, y] = en.bbox.split(',').map(Number);
        assert.ok(x > 300000 && x < 400000, `easting should be UTM30 metres near Córdoba, got ${x}`);
        assert.ok(y > 4100000 && y < 4300000, `northing should be UTM30 metres near Córdoba, got ${y}`);
    });

    test('a projected CRS with no known UTM zone still records that native was TRIED', () => {
        const ids = bboxForms(CORDOBA, 0.02, 'EPSG:99999').map((f) => f.id);
        assert.ok(ids.includes('native-crs-degrees'));
    });

    test('a layer that answers 0 in the first form but 20730 in a later one is reported as MEASURED', async () => {
        let call = 0;
        const probeImpl = async () => {
            call += 1;
            if (call === 1) return ok('<ows:ExceptionReport><ows:ExceptionText>boom</ows:ExceptionText></ows:ExceptionReport>'); // whole-layer fails
            if (call <= 3) return ok(hits(0));   // first ladder rungs: the axis-order artefact
            return ok(hits(20730));              // the rung that actually works
        };
        const r = await countFeatures('http://e/wfs', 'idecordoba:manzana', { centroid: CORDOBA, probes: [], probeImpl: probeImpl as never });
        assert.equal(r.status, 'measured');
        assert.equal(r.count, 20730);
        assert.ok(r.ladder.length >= 3, 'the whole ladder trace must ship in the report');
    });

    test('⚠ zero is reported ONLY when the WHOLE axis/CRS matrix answered 200 with 0', async () => {
        const probeImpl = async () => ok(hits(0));
        const r = await countFeatures('http://e/wfs', 'x', {
            centroid: CORDOBA, probes: [], nativeCrs: 'urn:ogc:def:crs:EPSG::25830', probeImpl: probeImpl as never,
        });
        assert.equal(r.status, 'zero-all-forms');
        assert.equal(r.count, 0);
        assert.equal(r.matrix.exercised, true);
    });

    test('⚠⚠ CORRECTION 1 — a whole-layer 0 no longer short-circuits; it must survive the matrix', async () => {
        let call = 0;
        const probeImpl = async () => {
            call += 1;
            if (call === 1) return ok(hits(0));      // whole layer says zero…
            return ok(hits(3));                       // …but a bbox rung finds features
        };
        const r = await countFeatures('http://e/wfs', 'x', {
            centroid: CORDOBA, probes: [], nativeCrs: 'urn:ogc:def:crs:EPSG::25830', probeImpl: probeImpl as never,
        });
        assert.equal(r.status, 'measured');
        assert.equal(r.count, 3);
        assert.ok(call > 1, 'the matrix must have been run despite the whole-layer zero');
    });

    test('⚠⚠ CORRECTION 1 — a zero whose CRS half never answered is UNKNOWN, not a negative', async () => {
        // Every WGS84 rung answers 0; every NATIVE rung errors. The CRS hypothesis is untested, so
        // this zero has not been proven and must not be emitted as one.
        const probeImpl = async (url: string) => (/25830/.test(decodeURIComponent(url))
            ? { url, httpStatus: null, contentType: null, bytes: 0, ms: 1, outcome: 'network-error', error: 'reset' }
            : ok(hits(0)));
        const r = await countFeatures('http://e/wfs', 'x', {
            centroid: CORDOBA, probes: [], nativeCrs: 'urn:ogc:def:crs:EPSG::25830', probeImpl: probeImpl as never,
        });
        assert.equal(r.status, 'unknown-mixed-ladder');
        assert.equal(r.count, null);
        assert.equal(r.matrix.exercised, false);
    });

    test('⚠⚠ CORRECTION 1 — a zero with no centroid cannot run the matrix and is UNKNOWN', async () => {
        const probeImpl = async () => ok(hits(0));
        const r = await countFeatures('http://e/wfs', 'x', { probes: [], probeImpl: probeImpl as never });
        assert.equal(r.status, 'unknown-matrix-unexercised');
        assert.equal(r.count, null);
    });

    test('⚠ a mixed ladder is UNKNOWN with a null count — never zero', async () => {
        let call = 0;
        const probeImpl = async () => {
            call += 1;
            if (call === 1) return ok('<ows:ExceptionReport><ows:ExceptionText>boom</ows:ExceptionText></ows:ExceptionReport>');
            if (call === 2) return ok(hits(0));
            return { url: 'u', httpStatus: null, contentType: null, bytes: 0, ms: 1, outcome: 'network-error', error: 'ECONNRESET' };
        };
        const r = await countFeatures('http://e/wfs', 'x', { centroid: CORDOBA, probes: [], probeImpl: probeImpl as never });
        assert.equal(r.status, 'unknown-mixed-ladder');
        assert.equal(r.count, null);
    });

    test('a total network failure is unknown-no-response, and asserts nothing about the data', async () => {
        const probeImpl = async () => ({ url: 'u', httpStatus: null, contentType: null, bytes: 0, ms: 1, outcome: 'network-error', error: 'DNS' });
        const r = await countFeatures('http://e/wfs', 'x', { centroid: CORDOBA, probes: [], probeImpl: probeImpl as never });
        assert.equal(r.status, 'unknown-no-response');
        assert.equal(r.count, null);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§PARSERS — against bytes captured from the real services (2026-08-02)', () => {
    test('Córdoba IDE WFS 2.0.0 → 105 feature types with WGS84 extents', () => {
        const r = parseWfsCapabilities(fx('ide-cordoba-wfs.xml'), 'e');
        assert.equal(r.ok, true);
        assert.equal(r.version, '2.0.0');
        assert.equal(r.layers.length, 105);
        const m = r.layers.find((l) => l.name === 'idecordoba:manzana')!;
        assert.ok(m, 'the block layer must be enumerated');
        assert.equal(m.defaultCrs, 'urn:ogc:def:crs:EPSG::25830');
        assert.equal(m.bboxWgs84!.length, 4);
    });

    test('COACo WFS → the 15-layer pilot', () => {
        const r = parseWfsCapabilities(fx('coaco-wfs.xml'), 'e');
        assert.equal(r.layers.length, 15);
        assert.ok(r.layers.some((l) => l.name === 'coaco:ordenanzas'));
    });

    test('Murcia WFS → 212 feature types including both acid-test targets', () => {
        const r = parseWfsCapabilities(fx('murcia-wfs.xml'), 'e');
        assert.equal(r.layers.length, 212);
        assert.ok(r.layers.some((l) => l.name === 'Murcia:pgou_alineaciones'));
        assert.ok(r.layers.some((l) => l.name === 'Murcia:pgou_eje_comercial'));
    });

    test('WMS 1.3.0 nesting does not swallow siblings, and unnamed containers are skipped', () => {
        const r = parseWmsCapabilities(fx('ide-cordoba-wms.xml'), 'e');
        assert.equal(r.ok, true);
        assert.equal(r.layers.length, 105);
        assert.ok(r.layers.every((l) => !!l.name), 'every emitted WMS layer must be requestable by name');
    });

    test('parseArcgisService carries fullExtent AND its CRS — never one without the other', () => {
        const j = JSON.stringify({
            currentVersion: 10.9, serviceDescription: '', layers: [{ id: 0, name: 'GMU_Services' }],
            spatialReference: { wkid: 102100, latestWkid: 3857 },
            fullExtent: { xmin: -8608596.03, ymin: 4698503.61, xmax: -8601700.05, ymax: 4703965.61, spatialReference: { wkid: 102100, latestWkid: 3857 } },
        });
        const r = parseArcgisService(j, 'e');
        assert.equal(r.ok, true);
        assert.equal(r.serviceCrs, 'EPSG:3857');
        assert.deepEqual(r.serviceBboxNative, [-8608596.03, 4698503.61, -8601700.05, 4703965.61]);
    });

    test('an ArcGIS error body is a failure, not an empty service', () => {
        const r = parseArcgisService('{"error":{"code":400,"message":"Invalid URL"}}', 'e');
        assert.equal(r.ok, false);
        assert.match(r.reason!, /400/);
    });

    test('parseDescribeFeatureType extracts typed attributes and the geometry type', () => {
        const xsd = `<xsd:schema><xsd:complexType name="manzanaType"><xsd:sequence>
            <xsd:element maxOccurs="1" minOccurs="0" name="codigo" nillable="true" type="xsd:string"/>
            <xsd:element maxOccurs="1" minOccurs="0" name="geom" nillable="true" type="gml:MultiSurfacePropertyType"/>
        </xsd:sequence></xsd:complexType></xsd:schema>`;
        const r = parseDescribeFeatureType(xsd);
        assert.equal(r.ok, true);
        assert.equal(r.attributes.length, 2);
        assert.equal(r.geometryType, 'gml:MultiSurfacePropertyType');
    });

    test('GML CamelCase compound types resolve to a geometry kind (no trailing \\b)', () => {
        assert.equal(geometryKindOf('gml:MultiSurfacePropertyType'), 'polygon');
        assert.equal(geometryKindOf('gml:SurfacePropertyType'), 'polygon');
        assert.equal(geometryKindOf('gml:MultiCurvePropertyType'), 'line');
        assert.equal(geometryKindOf('gml:PointPropertyType'), 'point');
        assert.equal(geometryKindOf(null), null);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§ACID TEST — the three datasets humans missed, from fixtures alone', () => {
    test('⭐ Córdoba: idecordoba:manzana surfaces in the top 20 of the whole inventory', async () => {
        const r = await runDiscovery(MUNICIPALITIES.cordoba, { offline: true, now: 'T' });
        const [manzana] = acidTest(r, ACID_TEST_TARGETS.cordoba);
        assert.equal(manzana.found, true);
        assert.ok(manzana.rank! <= 20, `expected top 20, got rank ${manzana.rank} of ${manzana.of}`);
        assert.ok(manzana.candidateVariables!.includes('block-ring'));
        assert.equal(manzana.reusableGeometry, true);
        // ⚠ THE WHOLE POINT: high reuse value, near-zero legal authority. The two axes disagreeing
        // on the same layer is the ADR-0288 separation doing its job.
        assert.ok(manzana.legalAuthority! < 0.5,
            'a block layer authorises nothing — if this ever scores high, the axes have been merged');
    });

    test('⭐ Murcia: pgou_alineaciones AND pgou_eje_comercial both surface in the top 20 of 289', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        const res = acidTest(r, ACID_TEST_TARGETS.murcia);
        for (const t of res) {
            assert.equal(t.found, true, `${t.layer} was not surfaced at all`);
            assert.ok(t.rank! <= 20, `${t.layer}: expected top 20, got rank ${t.rank} of ${t.of}`);
        }
        const alin = res.find((t) => t.layer === 'Murcia:pgou_alineaciones')!;
        assert.ok(alin.candidateVariables!.includes('street-width'));
        assert.ok(alin.candidateVariables!.includes('building-line'));
        const eje = res.find((t) => t.layer === 'Murcia:pgou_eje_comercial')!;
        assert.ok(eje.candidateVariables!.includes('axis-designation'));
    });

    test('the false-negative measurement refuses to be quoted as a population rate', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        const fn = falseNegativeRate(r, ACID_TEST_TARGETS.murcia);
        assert.equal(fn.hardMisses, 0);
        assert.match(fn.denominatorWarning, /NOT A POPULATION FALSE-NEGATIVE RATE/);
        assert.match(fn.denominator, /independently-confirmed/);
    });

    test('superseded editions are FLAGGED, never silently offered alongside the in-force layer', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        const old = r.records.find((x) => x.layer === 'Murcia:pgou_alineaciones_2001')!;
        const live = r.records.find((x) => x.layer === 'Murcia:pgou_alineaciones')!;
        assert.ok(old.flags.some((f) => f.id === 'superseded-edition-suspect'));
        assert.ok(!live.flags.some((f) => f.id === 'superseded-edition-suspect'));
    });

    test('the locality gate quarantines nothing in either city after bbox sanitisation', async () => {
        for (const city of ['cordoba', 'murcia'] as const) {
            const r = await runDiscovery(MUNICIPALITIES[city], { offline: true, now: 'T' });
            assert.equal(r.totals.localityFar, 0,
                `${city}: a false quarantine is a false negative, the most expensive error (ADR-0290)`);
        }
    });

    test('every emitted record carries both axes, a candidate-only disposition and no publication verdict', async () => {
        const r = await runDiscovery(MUNICIPALITIES.cordoba, { offline: true, now: 'T' });
        for (const rec of r.records) {
            assert.ok(assertScoresNotMerged(rec));
            assert.equal(rec.legalAuthority.publishable, PUBLISHABLE_NOT_ASSESSED);
            for (const v of rec.candidateVariables) assert.equal(v.status, 'candidate');
        }
    });

    test('discovery is deterministic over the same fixtures', async () => {
        const a = await runDiscovery(MUNICIPALITIES.cordoba, { offline: true, now: 'T' });
        const b = await runDiscovery(MUNICIPALITIES.cordoba, { offline: true, now: 'T' });
        assert.deepEqual(a.records.map((r) => [r.layer, r.triageRank]), b.records.map((r) => [r.layer, r.triageRank]));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§COLD-START — the Probe C record (founder Addendum 1)', () => {
    test('every headline fact is a tristate, and UNKNOWN is distinct from No', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        const cs = coldStartRecord(r, { populationBand: '250k-500k' });
        assert.equal(cs.publishedGisService.value, 'Yes');
        assert.ok(['Yes', 'No', 'Unknown'].includes(cs.digitalPgou.value));
        assert.equal(cs.publisher, 'municipal');
        assert.equal(cs.populationBand, '250k-500k');
        assert.ok(cs.cost.wallClockMinutes >= 0 && cs.cost.requests > 0);
        assert.ok(Array.isArray(cs.undecided));
        assert.match(cs.tierSignal.note, /NOT A DETERMINATION/);
    });

    test('⚠ every endpoint failing yields UNKNOWN — never "no service" (L-422/457/467/469)', async () => {
        const dead = {
            name: 'Nowhere', cc: 'es', ineCode: '99999', jurisdictionId: null,
            centroid: { lat: 40, lon: -3 },
            endpoints: [{ id: 'dead-wfs', service: 'WFS', publisher: null, url: 'https://does-not-resolve.invalid/geoserver/wfs' }],
        };
        // Offline mode with no fixture reproduces the "endpoint gave us nothing" shape without network.
        const r = await runDiscovery(dead, { offline: true, now: 'T', fixtureDir: resolve(HERE, 'fixtures') });
        const cs = coldStartRecord(r);
        assert.equal(cs.publishedGisService.value, 'Unknown');
        assert.notEqual(cs.publishedGisService.value, 'No');
        assert.equal(cs.digitalPgou.value, 'Unknown');
        assert.equal(cs.vectorOrScanned, 'Unknown');
        assert.equal(cs.publisher, 'Unknown');
        assert.equal(cs.tierSignal.value, 'undetermined',
            'an unknown may NEVER be counted as tier 3 — that is the false negative ADR-0290 forbids');
        assert.ok(cs.undecidedTotal > 0, 'the reason must be recorded, not just the verdict');
    });

    test('the tier signal is bounded and self-describes as a GIS-route-only ceiling', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        const cs = coldStartRecord(r);
        assert.ok(['tier-1-candidate', 'tier-3-candidate-via-gis', 'undetermined'].includes(cs.tierSignal.value));
        assert.ok(cs.knownLimitations.some((l: string) => /FALSE NEGATIVE/.test(l)),
            'the record must carry its own limitations to whoever aggregates it');
    });

    test('País Vasco and Navarra are excluded before any request is made', () => {
        for (const ine of ['01059', '20069', '48020', '31201']) {
            const x = foralExclusion({ cc: 'es', ineCode: ine });
            assert.equal(x.excluded, true, `${ine} must be excluded`);
            assert.equal(x.reason, 'foral-regime-out-of-scope');
        }
        assert.equal(foralExclusion({ cc: 'es', ineCode: '14021' }).excluded, false);
        assert.equal(foralExclusion({ cc: 'es', ineCode: '30030' }).excluded, false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§HOST-SWEEP — the cold-start path, and its false-negative surface', () => {
    test('INE article inversion is handled — «Vendrell, El» must try `elvendrell`', () => {
        const s = candidateSlugsFor('Vendrell, El');
        assert.ok(s.includes('elvendrell'), `got ${JSON.stringify(s)}`);
        assert.ok(candidateSlugsFor('Campana, La').includes('lacampana'));
        assert.ok(candidateSlugsFor('Casar, El').includes('elcasar'));
    });

    test('long official names also try the short form — «Jerez de la Frontera» → `jerez`', () => {
        assert.ok(candidateSlugsFor('Jerez de la Frontera').includes('jerez'));
        assert.ok(candidateSlugsFor('Puerto del Rosario').includes('puerto') === false
            || candidateSlugsFor('Puerto del Rosario').includes('puerto'));
        assert.ok(candidateSlugsFor('Paradinas de San Juan').includes('paradinas'));
    });

    test('a single-word name yields exactly one slug', () => {
        assert.deepEqual(candidateSlugsFor('Murcia'), ['murcia']);
        assert.deepEqual(candidateSlugsFor('Córdoba'), ['cordoba']);
    });

    test('the .org estate is covered — Castelldefels is not on .es', () => {
        assert.ok(candidateHostsFor('Castelldefels').includes('www.castelldefels.org'));
    });

    test('⭐ POSITIVE CONTROL — the known-good hosts are IN the candidate list', () => {
        // The sweep was verified live on 2026-08-02 to rediscover both of these from the name
        // alone. This test pins the necessary condition offline: if a refactor drops the `ide.` or
        // `geoserver.` convention, a 0/N cold-start result would silently become meaningless.
        assert.ok(candidateHostsFor('Córdoba').includes('ide.cordoba.es'));
        assert.ok(candidateHostsFor('Murcia').includes('geoserver.murcia.es'));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§TEMPORAL-VALIDITY — correction 2, the over-grant direction', () => {
    const attrs = (...names: string[]) => names.map((n) => ({ name: n, type: 'xsd:string' }));

    test('Murcia f_inicial/f_fin raise temporalFilteringRequired', () => {
        const t = detectTemporalValidity(attrs('calificacion', 'f_inicial', 'f_fin', 'the_geom'));
        assert.equal(t.detected, true);
        assert.deepEqual(t.endFields, ['f_fin']);
        assert.deepEqual(t.startFields, ['f_inicial']);
        assert.equal(t.temporalFilteringRequired, true);
        assert.match(t.note, /OVER-GRANTS|REPEALED/);
    });

    test('a START date alone cannot over-grant and does not raise the flag', () => {
        const t = detectTemporalValidity(attrs('f_inicial', 'uso'));
        assert.equal(t.temporalFilteringRequired, false);
    });

    test('⚠ an unprobed schema is UNKNOWN (null), never false — not probed ≠ not present', () => {
        const t = detectTemporalValidity(null);
        assert.equal(t.temporalFilteringRequired, null);
        assert.equal(t.probed, false);
        assert.match(t.note, /UNKNOWN, not absent/);
    });

    test('English and alternate Spanish validity idioms are detected too', () => {
        assert.equal(detectTemporalValidity(attrs('valid_to')).temporalFilteringRequired, true);
        assert.equal(detectTemporalValidity(attrs('fecha_baja')).temporalFilteringRequired, true);
        assert.equal(detectTemporalValidity(attrs('end_date')).temporalFilteringRequired, true);
        assert.equal(detectTemporalValidity(attrs('hasta')).temporalFilteringRequired, true);
    });

    test('an ambiguous date field is recorded but does NOT force the flag', () => {
        const t = detectTemporalValidity(attrs('fecha_aprobacion', 'clave'));
        assert.equal(t.temporalFilteringRequired, false);
        assert.ok(t.ambiguousFields!.includes('fecha_aprobacion'));
    });

    test('classifyLayer hoists the flag to the top level and raises a flag entry', () => {
        const r = classifyLayer(
            {
                name: 'Murcia:pgou_alineaciones', service: 'WFS', endpoint: 'e', publisher: 'ayto-murcia',
                bboxWgs84: [-1.38, 37.71, -0.86, 38.12],
                attributes: attrs('calificacion', 'f_inicial', 'f_fin'),
            },
            { centroid: { lat: 37.9838, lon: -1.128 }, publisherRegistry: PUBLISHERS },
        );
        assert.equal(r.temporalFilteringRequired, true);
        assert.ok(r.flags.some((f) => f.id === 'temporal-filtering-required'));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§PUBLISHER-IS-PLANNING-AUTHORITY — correction 3, a tristate not a caveat', () => {
    test('Córdoba answers `no` — its only zoning vector is a Colegio de Arquitectos', async () => {
        const r = await runDiscovery(MUNICIPALITIES.cordoba, { offline: true, now: 'T' });
        const cs = coldStartRecord(r);
        assert.equal(cs.publisherIsPlanningAuthority.value, 'no');
        assert.match(cs.publisherIsPlanningAuthority.evidence, /coaco/);
        assert.equal(cs.publisherIsPlanningAuthority.basis, 'declared');
    });

    test('Murcia answers `yes` — the Ayuntamiento publishes its own planning layers', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        const cs = coldStartRecord(r);
        assert.equal(cs.publisherIsPlanningAuthority.value, 'yes');
    });

    test('⚠ it is a TRISTATE — yes | no | unknown, never a boolean', async () => {
        for (const city of ['cordoba', 'murcia'] as const) {
            const cs = coldStartRecord(await runDiscovery(MUNICIPALITIES[city], { offline: true, now: 'T' }));
            assert.ok(['yes', 'no', 'unknown'].includes(cs.publisherIsPlanningAuthority.value));
            assert.notEqual(typeof cs.publisherIsPlanningAuthority.value, 'boolean');
            assert.ok(cs.publisherIsPlanningAuthority.evidence.length > 0);
        }
    });

    test('an unreachable city answers `unknown`, never `no`', async () => {
        const dead = {
            name: 'Nowhere', cc: 'es', ineCode: '99999', jurisdictionId: null,
            centroid: { lat: 40, lon: -3 },
            endpoints: [{ id: 'dead-wfs', service: 'WFS', publisher: null, url: 'https://x.invalid/wfs' }],
        };
        const cs = coldStartRecord(await runDiscovery(dead, { offline: true, now: 'T' }));
        assert.equal(cs.publisherIsPlanningAuthority.value, 'unknown');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§ACID-TEST-LIMIT — correction 4, stated in the report BODY', () => {
    test('the limit text says plainly that a top-20 rank is not recall', () => {
        assert.match(ACID_TEST_LIMIT, /NOT evidence of recall/);
        assert.match(ACID_TEST_LIMIT, /already-known/);
        assert.match(ACID_TEST_LIMIT, /Do not quote a top-20 rank as recall/);
    });

    test('it is rendered into the report body whenever an acid test runs', async () => {
        const r = await runDiscovery(MUNICIPALITIES.murcia, { offline: true, now: 'T' });
        (r as { acidTest?: unknown }).acidTest = acidTest(r, ACID_TEST_TARGETS.murcia);
        // Mirrors what the CLI emits.
        const body = `${renderMarkdown(r, 5)}\n## Acid test\n\n${ACID_TEST_LIMIT}\n`;
        assert.ok(body.includes('NOT evidence of recall'));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CANDIDATE-NOT-RESOLUTION — the sup_viales trap', () => {
    test('a callejero layer proposes street-SURFACE with its caveat, and never street-WIDTH', () => {
        const r = classifyLayer(
            { name: 'idecordoba:sup_viales', title: 'Superficie de viales', service: 'WFS', endpoint: 'e', publisher: 'ayto-cordoba', bboxWgs84: [-4.9, 37.7, -4.6, 38.0] },
            { centroid: CORDOBA, publisherRegistry: PUBLISHERS },
        );
        const vars = r.candidateVariables.map((v) => v.variable);
        assert.ok(vars.includes('street-surface'));
        assert.ok(!vars.includes('street-width'),
            'substituting the physical street surface for a legal alignment changes the criterion — derived LAW, forbidden (ADR-0284)');
        assert.ok(r.flags.some((f) => f.id === 'caveat:vial' && /callejero/.test(f.detail)));
    });

    test('an alineación layer DOES propose street-width, with the ADR-0285 test attached and unanswered', () => {
        const r = classifyLayer(
            { name: 'Murcia:pgou_alineaciones', service: 'WFS', endpoint: 'e', publisher: 'ayto-murcia', bboxWgs84: [-1.38, 37.71, -0.86, 38.12] },
            { centroid: { lat: 37.9838, lon: -1.128 }, publisherRegistry: PUBLISHERS },
        );
        const sw = r.candidateVariables.find((v) => v.variable === 'street-width')!;
        assert.ok(sw);
        assert.equal(sw.status, 'candidate');
        assert.match(sw.adr0285Test!.part1_criterionStatedByOrdinance, /HUMAN/);
        assert.match(sw.adr0285Test!.part2_methodUnprescribed, /HUMAN/);
    });

    test('every suggested integration names an exit criterion — "investigate further" is not an action', () => {
        const r = classifyLayer(
            { name: 'x:ordenanzas', service: 'WFS', endpoint: 'e', publisher: 'coaco', bboxWgs84: [-4.9, 37.7, -4.6, 38.0] },
            { centroid: CORDOBA, publisherRegistry: PUBLISHERS },
        );
        assert.ok(r.suggestedIntegration.length > 0);
        for (const s of r.suggestedIntegration) {
            assert.ok(s.exit && s.exit.length > 10, `no exit criterion on: ${s.action}`);
        }
    });
});
