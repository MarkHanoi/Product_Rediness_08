/**
 * OFFLINE tests for the Murcia parcel probe.
 *
 * Every fixture is a VERBATIM live capture from ovc.catastro.meh.es on 2026-07-31,
 * so these assertions lock the REAL response shapes — including the two that would
 * otherwise be silently wrong:
 *
 *   1. `bu-ext2d:` is the namespace building parts actually arrive under, even
 *      though the capabilities advertise `bu:Building`.
 *   2. A vacant plot arrives as HTTP 200 + a well-formed EMPTY FeatureCollection,
 *      which must classify as `empty` (a real answer) and never as a failure.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    buildingsByRefcatUrl,
    classify,
    countFeatures,
    isCompleteXml,
    parcelByRefcatUrl,
    readOvcError,
    readOwsException,
    reverseGeocodeUrl,
} from '../catastro.js';
import {
    distanceM,
    ineMunicipalityCode,
    parseBuildingParts,
    parseParcelGml,
    parseReverseGeocode,
    pointInRing,
    ringAreaM2,
    unknown,
    verified,
} from '../parse.js';

const FIX = join(import.meta.dirname, 'fixtures');
const read = (f: string): string => readFileSync(join(FIX, f), 'utf8');

const PARCEL_935 = read('parcel-3481104XH6038S.gml');
const BU_EMPTY = read('buildingparts-3481104XH6038S-EMPTY.gml');
const BU_5PARTS = read('buildingparts-4460610XH6045N-5parts.gml');
const PARCEL_128 = read('parcel-4460610XH6045N.gml');

// ─────────────────────────────────────────────────────────────────────────────
describe('transport outcome discipline — failure ≠ absence', () => {
    it('classifies a vacant-plot response as `empty`, not as a failure', () => {
        const r = classify('u', 200, true, BU_EMPTY, 1);
        expect(r.outcome).toBe('empty');
        expect(countFeatures(BU_EMPTY)).toBe(0);
    });

    it('classifies a populated response as `ok`', () => {
        expect(classify('u', 200, true, BU_5PARTS, 1).outcome).toBe('ok');
    });

    it('classifies a non-2xx as `http-error` even with a body', () => {
        expect(classify('u', 403, false, '<html/>', 1).outcome).toBe('http-error');
    });

    it('catches a TRUNCATED HTTP 200 — the status code is not evidence', () => {
        // A Danish bulk endpoint returned 200 with a body cut mid-record on
        // 2026-07-31. Simulate exactly that: a real prefix, no closing root.
        const cut = PARCEL_935.slice(0, Math.floor(PARCEL_935.length * 0.6));
        expect(isCompleteXml(cut)).toBe(false);
        const r = classify('u', 200, true, cut, 1);
        expect(r.outcome).toBe('truncated');
        expect(r.httpStatus).toBe(200); // the 200 is preserved, and disbelieved
    });

    it('accepts a complete document as complete', () => {
        expect(isCompleteXml(PARCEL_935)).toBe(true);
        expect(isCompleteXml(BU_EMPTY)).toBe(true);
    });

    it('separates an OVC error envelope from an empty result', () => {
        const ovc = `<?xml version="1.0"?><consulta_coordenadas><control><cucoor>0</cucoor><cuerr>1</cuerr></control>` +
            `<lerr><err><cod>16</cod><des>PARA ESAS COORDENADAS NO HAY REFERENCIA DISPONIBLE</des></err></lerr></consulta_coordenadas>`;
        expect(readOvcError(ovc)).toContain('16');
        expect(classify('u', 200, true, ovc, 1).outcome).toBe('ovc-error');
    });

    it('separates an OWS exception from an empty result', () => {
        const ows = `<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">` +
            `<ows:Exception><ows:ExceptionText>NullReferenceException</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`;
        expect(readOwsException(ows)).toBe('NullReferenceException');
        expect(classify('u', 200, true, ows, 1).outcome).toBe('ows-exception');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parcel parsing — the founder parcel 3481104XH6038S', () => {
    const p = parseParcelGml(PARCEL_935);

    it('parses the refcat and the OFFICIAL area', () => {
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('3481104XH6038S');
        // 935 m² — the Catastro figure. The listing's 936 m² is the outlier.
        expect(p!.areaOfficialM2).toBe(935);
    });

    it('keeps the DERIVED area separate from the official one (C57 §2.1 / L-640)', () => {
        // They must not be the same field, and they must agree closely.
        expect(p!.areaDerivedM2).toBeGreaterThan(900);
        expect(p!.areaDerivedM2).toBeLessThan(970);
        const pct = (Math.abs(p!.areaOfficialM2! - p!.areaDerivedM2) / p!.areaOfficialM2!) * 100;
        expect(pct).toBeLessThan(1);
    });

    it('uses OGC lat,lon axis order — the parcel is in Murcia, not the Atlantic', () => {
        for (const v of p!.ring) {
            expect(v.lat).toBeGreaterThan(37.9);
            expect(v.lat).toBeLessThan(38.1);
            expect(v.lon).toBeGreaterThan(-1.3);
            expect(v.lon).toBeLessThan(-1.0);
        }
    });

    it('exposes the cadastral version rather than a transport timestamp', () => {
        expect(p!.beginLifespanVersion).toBe('2025-11-03T00:00:00');
    });

    it('returns null (not a fake ring) for an unparseable body', () => {
        expect(parseParcelGml('')).toBeNull();
        expect(parseParcelGml('<FeatureCollection/>')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('building parts — the ALTURAS input', () => {
    it('reads floors above ground from the `bu-ext2d:` namespace', () => {
        const parts = parseBuildingParts(BU_5PARTS);
        expect(parts.length).toBe(5);
        const above = parts.map((p) => p.floorsAboveGround);
        expect(above).toEqual([1, 4, 6, 4, 5]);
        expect(Math.max(...(above as number[]))).toBe(6);
    });

    it('reads floors BELOW ground separately', () => {
        const parts = parseBuildingParts(BU_5PARTS);
        expect(parts.map((p) => p.floorsBelowGround)).toEqual([1, 1, 1, 0, 1]);
    });

    it('returns [] for a genuinely vacant parcel', () => {
        expect(parseBuildingParts(BU_EMPTY)).toEqual([]);
    });

    it('never invents a floor count when the element is absent', () => {
        const parts = parseBuildingParts(
            '<bu-ext2d:BuildingPart><bu-ext2d:localId>x</bu-ext2d:localId></bu-ext2d:BuildingPart>',
        );
        expect(parts[0]!.floorsAboveGround).toBeNull(); // NOT 0 — unknown ≠ zero (L-616)
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('reverse geocode + municipality routing', () => {
    const XML = `<?xml version="1.0"?><consulta_coordenadas_distancias><coordenadas_distancias><coordd><lpcd>
    <pcd><pc><pc1>3481104</pc1><pc2>XH6038S</pc2></pc><dt><loine><cp>30</cp><cm>30</cm></loine></dt>
      <ldt>PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)</ldt><dis>0</dis></pcd>
    <pcd><pc><pc1>3481602</pc1><pc2>XH6038S</pc2></pc><dt><loine><cp>30</cp><cm>30</cm></loine></dt>
      <ldt>PL U.A. 5ª DEL P.P. CR-5  CT552 MURCIA (CHURRA) (MURCIA)</ldt><dis>15.53</dis></pcd>
    </lpcd></coordd></coordenadas_distancias></consulta_coordenadas_distancias>`;

    it('parses candidates nearest-first with their distances', () => {
        const c = parseReverseGeocode(XML);
        expect(c.length).toBe(2);
        expect(c[0]!.refcat).toBe('3481104XH6038S');
        expect(c[0]!.distanceM).toBe(0);
        expect(c[1]!.distanceM).toBe(15.53);
    });

    it('composes the INE code as province(2) + municipality(3) — Murcia = 30030', () => {
        const c = parseReverseGeocode(XML);
        // <cp>30</cp><cm>30</cm> → "30" + "030". NOT "3030".
        expect(ineMunicipalityCode(c[0]!)).toBe('30030');
    });

    it('returns null rather than guessing when the codes are absent', () => {
        expect(
            ineMunicipalityCode({
                refcat: 'x', address: null, distanceM: 0, provinceCode: null, municipalityCode: null,
            }),
        ).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('pin-vs-parcel — the claim a screening report gets wrong', () => {
    const p = parseParcelGml(PARCEL_935)!;
    const PIN = { lat: 38.0061, lon: -1.138028 };

    it('places the supplied pin INSIDE the resolved parcel ring', () => {
        // The competitor report claims "ninguna parcela catastral plausible junto
        // al pin". It is inside the ring, and this test says so permanently.
        expect(pointInRing(PIN, p.ring)).toBe(true);
    });

    it('measures the pin→reference-point distance in metres', () => {
        const d = distanceM(PIN, p.referencePoint!);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(10);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('a second, independent Murcia parcel (n = 2)', () => {
    it('resolves a BUILT parcel with a different official area', () => {
        const p = parseParcelGml(PARCEL_128)!;
        expect(p.refcat).toBe('4460610XH6045N');
        expect(p.areaOfficialM2).toBe(128);
        expect(parseBuildingParts(BU_5PARTS).length).toBe(5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('URL builders match the production proxy exactly', () => {
    it('keeps Catastro\'s non-standard STOREDQUERIE_ID spelling', () => {
        // server/parcelZoningProxy.js uses this exact spelling. "Fixing" it to the
        // OGC-correct STOREDQUERY_ID makes the service ignore the stored query.
        expect(parcelByRefcatUrl('X')).toContain('STOREDQUERIE_ID=GetParcel');
        expect(buildingsByRefcatUrl('X')).toContain('STOREDQUERIE_ID=GetBuildingPartByParcel');
    });

    it('sends lon as Coordenada_X and lat as Coordenada_Y', () => {
        const u = reverseGeocodeUrl(38.0061, -1.138028);
        expect(u).toContain('Coordenada_X=-1.138028');
        expect(u).toContain('Coordenada_Y=38.0061');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('the three-state evidence model', () => {
    it('never lets UNKNOWN carry a value', () => {
        const u = unknown<number>('no source publishes this');
        expect(u.state).toBe('UNKNOWN');
        expect(u.value).toBeNull(); // not 0, not a permissive default (L-616)
        expect(u.source).toBeNull();
    });

    it('requires a source and a date on VERIFIED', () => {
        const v = verified(935, 'INSPIRE cp:areaValue', '2026-07-31');
        expect(v.state).toBe('VERIFIED');
        expect(v.source).toBeTruthy();
        expect(v.observedAt).toBeTruthy();
    });
});

describe('ringAreaM2', () => {
    it('is zero for a degenerate ring', () => {
        expect(ringAreaM2([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }])).toBe(0);
    });
});
