// C57 §1.14 §CADASTRAL-AREA-IS-A-DECLARED-CAPABILITY — the AREA query, on all three servers.
//
// WHAT THESE BIND, AND WHY EACH ONE IS HERE
// -----------------------------------------
// The founder asked for a "show cadastral boundaries" toggle. The gap was never coverage — the
// shipped POINT lookup measures HTTP 200 in ES/FR/NL/DK — it was that no provider could be asked
// for more than ONE parcel. These specs pin the four things that can silently go wrong once it can:
//
//   1. THE POINT LEG MUST NOT MOVE. Both the Spain bbox builder and the FR/NL URL builders were
//      parameterised in place rather than cloned (C57 §1.14.4 — a second builder for the same
//      cadastre is the dominant defect shape in this repo). A parameterisation that shifts the
//      DEFAULT is indistinguishable from a clone that drifted, so the point URLs' cap and WINDOW
//      WIDTH are pinned — the width rather than a transcribed bbox literal, because
//      `2.3522 - 0.00035` is 2.3518499999999998 and a rounded expectation would fail on binary
//      floating point rather than on behaviour.
//   2. `unsupported` ≠ `unreachable` ≠ an empty `ok`. Three different facts, and rendering any two
//      of them the same way is the §CONTEXT-DATA-HONESTY defect at overlay scale: "this register
//      has no area service" and "there are no parcels here" would draw the same blank map.
//   3. `truncated` must be KNOWABLE, not guessed — hence the explicit count cap, and hence `>=`.
//   4. ONE WIRE GRAMMAR (§1.14.6): every body carries exactly one of ok · unsupported · unreachable.
//
// ⭐ AND A SCRAMBLE CONTROL (L-586). Every "it found N parcels" assertion below is paired with a
// SCRAMBLED fixture that must NOT produce them. Without that pair, a parser that returned a
// constant would pass the happy path, and the suite would be measuring nothing.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildParcelBboxUrl,
    areaHalfDegForRadius,
    makeCatastroParcelsAreaHandler,
    CATASTRO_AREA_COUNT_CAP,
    CATASTRO_PARCEL_AREA_PATH,
} from '../jurisdiction/parcelZoningProxy.js';
import {
    resolveEuParcelsInArea,
    euAreaHalfDegForRadius,
    EU_CADASTRE_SOURCES,
    __resetEuAreaCache,
} from '../jurisdiction/euCadastreProxy.js';
import {
    fetchDawaParcelsInArea,
    fetchDawaParcelAtPoint,
    dawaFeatureToParcel,
    DK_AREA_COUNT_CAP,
    DK_PARCEL_AREA_PATH,
    __resetDkAreaCache,
} from '../jurisdiction/dkMatrikelProxy.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** N structurally-real Catastro CadastralParcel features, each a distinct small square. */
function catastroCollection(n: number): string {
    let feats = '';
    for (let i = 0; i < n; i++) {
        const lat = 41.392 + i * 0.0006;
        const pts = `${lat} 2.1650 ${lat} 2.1655 ${lat + 0.0005} 2.1655 ${lat + 0.0005} 2.1650 ${lat} 2.1650`;
        feats += `
  <member><cp:CadastralParcel gml:id="ES.SDGC.CP.X${i}">
    <cp:areaValue uom="m2">${500 + i}</cp:areaValue>
    <cp:geometry><gml:Surface srsName="EPSG:4326"><gml:patches><gml:PolygonPatch>
      <gml:exterior><gml:LinearRing><gml:posList srsDimension="2">${pts}</gml:posList></gml:LinearRing></gml:exterior>
    </gml:PolygonPatch></gml:patches></gml:Surface></cp:geometry>
    <cp:nationalCadastralReference>0229${String(i).padStart(2, '0')}DF3802G</cp:nationalCadastralReference>
  </cp:CadastralParcel></member>`;
    }
    return `<?xml version="1.0"?><FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="urn:cp">${feats}</FeatureCollection>`;
}

/** FR IGN GeoJSON — n parcels in one FeatureCollection, the real property names. */
function frCollection(n: number): string {
    const features = Array.from({ length: n }, (_, i) => {
        const lat = 48.8564 + i * 0.0006;
        return {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[[2.352, lat], [2.3524, lat], [2.3524, lat + 0.0004], [2.352, lat + 0.0004], [2.352, lat]]],
            },
            properties: { idu: `7510400AE${String(i).padStart(4, '0')}`, numero: String(i), section: 'AE', nom_com: 'Paris', contenance: 1000 + i },
        };
    });
    return JSON.stringify({ type: 'FeatureCollection', features });
}

/** DAWA jordstykker GeoJSON — n parcels, the real property names. */
function dawaCollection(n: number): string {
    const features = Array.from({ length: n }, (_, i) => {
        const lat = 55.6761 + i * 0.0006;
        return {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[[12.5683, lat], [12.5687, lat], [12.5687, lat + 0.0004], [12.5683, lat + 0.0004], [12.5683, lat]]],
            },
            properties: { matrikelnr: `${i + 1}a`, registreretareal: 800 + i, ejerlavnavn: 'København' },
        };
    });
    return JSON.stringify({ type: 'FeatureCollection', features });
}

/**
 * THE SCRAMBLE CONTROL (L-586), GML arm. Structurally intact, semantically destroyed: the
 * coordinate PAYLOAD becomes non-numeric noise and the identifier is stripped. A parser that is
 * really reading the fixture yields NOTHING from this; one that returns a constant, or that keys
 * on the envelope rather than the content, keeps "passing" — which is what this pair detects.
 */
function scrambleGml(fixture: string): string {
    return fixture
        .replace(/-?\d+\.\d+/g, 'NaN')
        .replace(/nationalCadastralReference>[^<]*</g, 'nationalCadastralReference><');
}

/**
 * The JSON arm of the same control. ⚠ It must stay VALID JSON: nulling the coordinates tests the
 * CANDIDATE PARSER, whereas emitting `NaN` would only prove that `JSON.parse` throws — a different
 * (and already-covered) code path, and a scramble control that exercises the wrong layer is worse
 * than none, because it reads as coverage it does not have.
 */
function scrambleJson(fixture: string): string {
    const body = JSON.parse(fixture) as { features: Array<Record<string, unknown>> };
    for (const f of body.features) {
        const g = f.geometry as { coordinates: unknown };
        g.coordinates = (g.coordinates as number[][][]).map((r) => r.map(() => [null, null]));
        const props = f.properties as Record<string, unknown>;
        if ('idu' in props) props.idu = '';
        if ('matrikelnr' in props) props.matrikelnr = '';
    }
    return JSON.stringify(body);
}

/** The east–west span (degrees) of the BBOX in a WFS GetFeature URL — `minLat,minLon,maxLat,maxLon`. */
function bboxWidth(url: string): number {
    const raw = /[?&]bbox=([^&]+)/i.exec(url)?.[1];
    if (!raw) throw new Error(`no bbox in ${url}`);
    const [, minLon, , maxLon] = decodeURIComponent(raw).split(',').map(Number);
    return maxLon! - minLon!;
}

const okRes = (body: string) => ({ ok: true, status: 200, text: async () => body }) as unknown as Response;
const fakeFetch = (body: string) => (async () => okRes(body)) as unknown as typeof fetch;

function fakeRes() {
    return {
        _code: 0, _body: null as unknown, _headers: {} as Record<string, string>,
        status(c: number) { this._code = c; return this; },
        json(b: unknown) { this._body = b; return this; },
        setHeader(k: string, v: string) { this._headers[k] = v; return this; },
    };
}

beforeEach(() => { __resetEuAreaCache(); __resetDkAreaCache(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('C57 §1.14.4 — the AREA leg parameterises the POINT leg, it does not clone it', () => {
    it('leaves the manzana bbox URL byte-identical when no count is passed', () => {
        // ⛔ THE LOAD-BEARING ASSERTION. `count` was added for the area route; if it ever acquires
        // a default, the *manzana* route silently starts dropping siblings out of a block — and a
        // partial block ring produces a WRONG profunditat edificable (C57 §1.11/§1.12) with nothing
        // failing anywhere. The absence of `&count=` here IS the guarantee.
        const url = buildParcelBboxUrl(41.3925, 2.165);
        expect(url).not.toContain('count=');
        expect(url).toContain('typeNames=cp:CadastralParcel');
        expect(url).toContain('bbox=');
    });

    it('appends the cap only when one is asked for, and floors it', () => {
        expect(buildParcelBboxUrl(41.3925, 2.165, 0.002, 400)).toContain('&count=400');
        expect(buildParcelBboxUrl(41.3925, 2.165, 0.002, 12.7)).toContain('&count=12');
        // A nonsense cap is IGNORED rather than emitted — an upstream `count=0` would return an
        // empty collection that reads exactly like "no parcels here".
        expect(buildParcelBboxUrl(41.3925, 2.165, 0.002, 0)).not.toContain('count=');
        expect(buildParcelBboxUrl(41.3925, 2.165, 0.002, Number.NaN)).not.toContain('count=');
    });

    it('leaves the FR and NL POINT urls byte-identical (COUNT=20 at the shared ±38 m window)', () => {
        // The two builders took `(lat, lon)` and now take `(lat, lon, key, opts)`. Both new
        // arguments default, so a point lookup must emit exactly the URL it always has.
        // ⚠ The WIDTH, not a transcribed literal: `2.3522 - 0.00035` is 2.3518499999999998 in
        // binary floating point, and a hand-rounded expectation would fail on arithmetic rather
        // than on behaviour. What must not move is the ±38 m default window and the COUNT=20 cap.
        const fr = EU_CADASTRE_SOURCES.fr!.url(48.8566, 2.3522);
        expect(fr).toContain('&COUNT=20&');
        expect(bboxWidth(fr)).toBeCloseTo(0.0007, 9);
        const nl = EU_CADASTRE_SOURCES.nl!.url(52.373, 4.8925);
        expect(nl).toContain('&count=20&');
        expect(bboxWidth(nl)).toBeCloseTo(0.0007, 9);
    });

    it('widens the window and raises the cap only when the area leg asks', () => {
        const fr = EU_CADASTRE_SOURCES.fr!.url(48.8566, 2.3522, undefined, { halfDeg: 0.004, count: 400 });
        expect(fr).toContain('&COUNT=400&');
        expect(bboxWidth(fr)).toBeCloseTo(0.008, 9);
        const nl = EU_CADASTRE_SOURCES.nl!.url(52.373, 4.8925, undefined, { halfDeg: 0.004, count: 400 });
        expect(nl).toContain('&count=400&');
        expect(bboxWidth(nl)).toBeCloseTo(0.008, 9);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('C57 §1.14 — the box ENCLOSES the circle (the error direction is a superset)', () => {
    const METRES_PER_DEG_LAT = 111_320;

    it.each([
        ['Barcelona', 41.39],
        ['Copenhagen', 55.68],
        ['Tromsø', 69.65],
    ])('covers the full radius on the SHORT (east–west) axis at %s', (_name, lat) => {
        const radiusM = 300;
        for (const halfDeg of [areaHalfDegForRadius(lat, radiusM), euAreaHalfDegForRadius(lat, radiusM)]) {
            const eastWestM = halfDeg * METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
            expect(eastWestM).toBeGreaterThanOrEqual(radiusM - 1e-6);
        }
    });

    it('SCRAMBLE CONTROL — the naive latitude-only half-width UNDER-covers, which is why it is not used', () => {
        // If this ever stops being true the enclosure assertion above has become vacuous: it would
        // be passing for a formula that is wrong. Sizing off the LATITUDE metres-per-degree leaves
        // the east–west extent short by a factor of cos(lat) — 25 % at Copenhagen — so a user would
        // see neighbours on screen that the query never asked for.
        const lat = 55.68, radiusM = 300;
        const naiveHalfDeg = radiusM / METRES_PER_DEG_LAT;
        const naiveEastWestM = naiveHalfDeg * METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
        expect(naiveEastWestM).toBeLessThan(radiusM);
        expect(areaHalfDegForRadius(lat, radiusM)).toBeGreaterThan(naiveHalfDeg);
    });

    it('never divides by ~0 at the poles', () => {
        expect(Number.isFinite(areaHalfDegForRadius(89.9, 300))).toBe(true);
        expect(Number.isFinite(euAreaHalfDegForRadius(-89.9, 300))).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Spain — /api/catastro/parcel/area', () => {
    it('is the POINT route plus /area (C57 §1.14.6 — one path shape for the capability)', () => {
        expect(CATASTRO_PARCEL_AREA_PATH).toBe('/api/catastro/parcel/area');
    });

    it('answers ok with every parcel in the window, un-truncated', async () => {
        const handler = makeCatastroParcelsAreaHandler({ fetchImpl: fakeFetch(catastroCollection(7)) });
        const res = fakeRes();
        await handler({ query: { lat: '41.3925', lon: '2.165', radiusM: '200' } } as never, res as never);
        expect(res._code).toBe(200);
        const body = res._body as { outcome: string; parcels: unknown[]; truncated: boolean };
        expect(body.outcome).toBe('ok');
        expect(body.parcels).toHaveLength(7);
        expect(body.truncated).toBe(false);
        expect(res._headers['X-Catastro-Area-Outcome']).toBe('ok');
    });

    it('SCRAMBLE CONTROL — the same request over a scrambled collection yields ZERO parcels', async () => {
        // Same envelope, same feature count, same route: only the coordinates and identifiers are
        // destroyed. If this still returned 7, the assertion above would be measuring the fixture's
        // shape rather than the parser.
        const handler = makeCatastroParcelsAreaHandler({ fetchImpl: fakeFetch(scrambleGml(catastroCollection(7))) });
        const res = fakeRes();
        await handler({ query: { lat: '41.3925', lon: '2.165', radiusM: '200' } } as never, res as never);
        const body = res._body as { outcome: string; parcels: unknown[] };
        expect(body.outcome).toBe('ok');
        expect(body.parcels).toHaveLength(0);
    });

    it('reports truncated when the answer REACHES the cap (>=, not >)', async () => {
        // A response landing exactly ON the cap is indistinguishable from one the cap cut short,
        // and the honest reading of an indistinguishable pair under-claims completeness.
        const handler = makeCatastroParcelsAreaHandler({
            fetchImpl: fakeFetch(catastroCollection(CATASTRO_AREA_COUNT_CAP)),
        });
        const res = fakeRes();
        await handler({ query: { lat: '41.3925', lon: '2.165', radiusM: '200' } } as never, res as never);
        expect((res._body as { truncated: boolean }).truncated).toBe(true);
    });

    it('says UNSUPPORTED outside Spain — never an empty ok', async () => {
        // ⛔ The distinction the whole amendment exists for. An empty `ok` in Paris would assert
        // that the LAND holds no parcels; `unsupported` says Catastro's territory ends at the border.
        const handler = makeCatastroParcelsAreaHandler({ fetchImpl: fakeFetch(catastroCollection(3)) });
        const res = fakeRes();
        await handler({ query: { lat: '48.8566', lon: '2.3522', radiusM: '200' } } as never, res as never);
        const body = res._body as { outcome: string; reason: string };
        expect(body.outcome).toBe('unsupported');
        expect(body.reason).toMatch(/outside Spain/i);
    });

    it('says UNREACHABLE on an upstream failure, and refuses to cache it', async () => {
        const handler = makeCatastroParcelsAreaHandler({
            fetchImpl: (async () => ({ ok: false, status: 503 }) as unknown as Response) as unknown as typeof fetch,
        });
        const res = fakeRes();
        await handler({ query: { lat: '41.3925', lon: '2.165', radiusM: '200' } } as never, res as never);
        const body = res._body as { outcome: string; parcels: unknown[] };
        expect(body.outcome).toBe('unreachable');
        expect(body.parcels).toHaveLength(0);
        // A 7-day CDN entry would turn a 30-second wobble into a week of "no parcels here".
        expect(res._headers['Cache-Control']).toBe('no-store');
    });

    it('refuses a radius beyond the ceiling, and a malformed request, as unreachable + 400', async () => {
        const handler = makeCatastroParcelsAreaHandler({ fetchImpl: fakeFetch(catastroCollection(1)) });
        for (const query of [{ lat: '41.3925', lon: '2.165', radiusM: '9000' }, { lat: 'x', lon: '2.165' }]) {
            const res = fakeRes();
            await handler({ query } as never, res as never);
            expect(res._code).toBe(400);
            // §1.14.6 — the upstream was never asked, so the body says `unreachable`; the 400 is
            // what tells the caller it was our request that was wrong, not the register.
            expect((res._body as { outcome: string }).outcome).toBe('unreachable');
        }
    });

    it('serves a repeat request from cache without a second upstream hit', async () => {
        let calls = 0;
        const handler = makeCatastroParcelsAreaHandler({
            fetchImpl: (async () => { calls++; return okRes(catastroCollection(3)); }) as unknown as typeof fetch,
        });
        const q = { query: { lat: '41.3925', lon: '2.165', radiusM: '200' } } as never;
        await handler(q, fakeRes() as never);
        await handler(q, fakeRes() as never);
        expect(calls).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('EU — /api/parcel/:cc/area, opt-in per register', () => {
    it('answers ok for a leg that DECLARES areaQuery (FR)', async () => {
        const out = await resolveEuParcelsInArea('fr', 2.3522, 48.8566, 300, { fetchImpl: fakeFetch(frCollection(5)) });
        expect(out.outcome).toBe('ok');
        expect(out.parcels).toHaveLength(5);
        expect(out.truncated).toBe(false);
        expect(out.parcels[0]).toMatchObject({ source: 'ign-fr' });
        // §L-12912 — the two areas stay un-collapsed on EVERY member of an area answer, not just
        // on the single winner the point leg returns.
        expect(out.parcels[0]).toHaveProperty('areaOfficialM2', 1000);
        expect(out.parcels[0]).toHaveProperty('areaSigM2');
    });

    it('SCRAMBLE CONTROL — a scrambled FR collection yields ZERO parcels, not five', async () => {
        const out = await resolveEuParcelsInArea('fr', 2.3522, 48.8566, 300, { fetchImpl: fakeFetch(scrambleJson(frCollection(5))) });
        expect(out.outcome).toBe('ok');
        expect(out.parcels).toHaveLength(0);
    });

    it('answers ok for NL', async () => {
        const nl = JSON.stringify({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[[4.892, 52.3728], [4.893, 52.3728], [4.893, 52.3732], [4.892, 52.3732], [4.892, 52.3728]]] },
                properties: { AKRKadastraleGemeenteCodeWaarde: 'ASD04', sectie: 'F', perceelnummer: 6685, kadastraleGrootteWaarde: 9402, kadastraleGemeenteWaarde: 'Amsterdam' },
            }],
        });
        const out = await resolveEuParcelsInArea('nl', 4.8925, 52.373, 300, { fetchImpl: fakeFetch(nl) });
        expect(out.outcome).toBe('ok');
        expect(out.parcels).toHaveLength(1);
        expect(out.parcels[0]).toMatchObject({ refcat: 'ASD04 F 6685', source: 'pdok-nl' });
    });

    it('says UNSUPPORTED — with the register named — for a leg that declares no area query', async () => {
        // ⛔ THE SENTENCE THE TOGGLE NEEDS. Norway's leg is wired and healthy for POINT lookups; it
        // simply has not been parameterised for a window. Answering an empty `ok` here would tell
        // the user Norway has no parcels, which is a claim about the LAND made from a gap in our
        // own wiring. Every non-declaring leg must take this arm.
        let asked = false;
        const spy = (async () => { asked = true; return okRes('{}'); }) as unknown as typeof fetch;
        for (const cc of ['no', 'de-nrw', 'ch']) {
            const out = await resolveEuParcelsInArea(cc, 10.7522, 59.9139, 300, { fetchImpl: spy });
            expect(out.outcome).toBe('unsupported');
            expect(out.parcels).toHaveLength(0);
            expect(out.reason ?? '').toMatch(/one parcel at a time/i);
        }
        // …and it does so WITHOUT touching the upstream. An `unsupported` verdict is structural; a
        // request to find it out would be a hit on a shared public register for a known answer.
        expect(asked).toBe(false);
    });

    it('says UNSUPPORTED (404) for a cadastre PRYZM has not wired, and outside the register territory', async () => {
        const unknown = await resolveEuParcelsInArea('zz', 2.35, 48.85, 300, {});
        expect(unknown.outcome).toBe('unsupported');
        expect(unknown.httpStatus).toBe(404);
        // Paris coordinates against the Dutch register: durable, structural, about the SOURCE.
        const outside = await resolveEuParcelsInArea('nl', 2.3522, 48.8566, 300, { fetchImpl: fakeFetch(frCollection(5)) });
        expect(outside.outcome).toBe('unsupported');
        expect(outside.reason ?? '').toMatch(/no parcels at this location/i);
    });

    it('says UNREACHABLE when the register is asked and does not answer', async () => {
        const out = await resolveEuParcelsInArea('fr', 2.3522, 48.8566, 300, {
            fetchImpl: (async () => ({ ok: false, status: 500 }) as unknown as Response) as unknown as typeof fetch,
        });
        expect(out.outcome).toBe('unreachable');
        expect(out.parcels).toHaveLength(0);
    });

    it('shares ONE upstream request between concurrent callers for the same box', async () => {
        // [[context-one-read-per-bbox]] — two surfaces on one overlay flag ask for the same box in
        // the same tick. Without in-flight de-duplication that is two hits on a public register.
        let calls = 0;
        const slow = (async () => {
            calls++;
            await new Promise((r) => setTimeout(r, 5));
            return okRes(frCollection(2));
        }) as unknown as typeof fetch;
        const [a, b] = await Promise.all([
            resolveEuParcelsInArea('fr', 2.3522, 48.8566, 300, { fetchImpl: slow }),
            resolveEuParcelsInArea('fr', 2.3522, 48.8566, 300, { fetchImpl: slow }),
        ]);
        expect(calls).toBe(1);
        expect(a.parcels).toHaveLength(2);
        expect(b.parcels).toHaveLength(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Denmark — /api/parcel/dk/area on the keyless DAWA circle', () => {
    it('is the POINT route plus /area', () => {
        expect(DK_PARCEL_AREA_PATH).toBe('/api/parcel/dk/area');
    });

    it('answers ok with every jordstykke in the circle', async () => {
        const out = await fetchDawaParcelsInArea(12.5683, 55.6761, 150, { fetchImpl: fakeFetch(dawaCollection(34)) });
        expect(out.outcome).toBe('ok');
        expect(out.parcels).toHaveLength(34);
        expect(out.truncated).toBe(false);
        expect(out.parcels[0]).toMatchObject({ refcat: '1a', source: 'matrikel-dk' });
    });

    it('SCRAMBLE CONTROL — a scrambled DAWA collection yields ZERO parcels, not thirty-four', async () => {
        const out = await fetchDawaParcelsInArea(12.5683, 55.6761, 150, { fetchImpl: fakeFetch(scrambleJson(dawaCollection(34))) });
        expect(out.outcome).toBe('ok');
        expect(out.parcels).toHaveLength(0);
    });

    it('asks DAWA with the cirkel form, in lon,lat,radius order', async () => {
        // The axis order is the one thing that fails SILENTLY here: a lat,lon circle over Denmark
        // lands in the Indian Ocean and DAWA answers a perfectly valid empty FeatureCollection.
        let seen = '';
        const spy = (async (u: string) => { seen = String(u); return okRes(dawaCollection(1)); }) as unknown as typeof fetch;
        await fetchDawaParcelsInArea(12.5683, 55.6761, 150, { fetchImpl: spy });
        expect(decodeURIComponent(seen)).toContain('cirkel=12.5683,55.6761,150');
        expect(seen).toContain('format=geojson');
        expect(seen).toContain('srid=4326');
    });

    it('slices at the cap and says so', async () => {
        const out = await fetchDawaParcelsInArea(12.5683, 55.6761, 150, {
            fetchImpl: fakeFetch(dawaCollection(DK_AREA_COUNT_CAP + 5)),
        });
        expect(out.truncated).toBe(true);
        expect(out.parcels).toHaveLength(DK_AREA_COUNT_CAP);
    });

    it('says UNSUPPORTED outside Denmark and UNREACHABLE on a non-FeatureCollection body', async () => {
        const outside = await fetchDawaParcelsInArea(2.3522, 48.8566, 150, { fetchImpl: fakeFetch(dawaCollection(3)) });
        expect(outside.outcome).toBe('unsupported');
        // A 200 whose body is not a FeatureCollection is the SOURCE failing, not empty land.
        const junk = await fetchDawaParcelsInArea(12.5683, 55.6761, 150, { fetchImpl: fakeFetch('{"error":"nope"}') });
        expect(junk.outcome).toBe('unreachable');
    });

    it('POINT and AREA share ONE normaliser (C57 §1.14.4)', async () => {
        // The point leg used to hold its own copy of the ring/identity/area mapping. It now
        // DELEGATES to `dawaFeatureToParcel`, and the observable proof is that a point answer now
        // carries the §L-12912 split fields the area answer carries — one code path, one shape.
        const point = await fetchDawaParcelAtPoint(12.5683, 55.6761, { fetchImpl: fakeFetch(dawaCollection(1)) });
        const area = await fetchDawaParcelsInArea(12.5683, 55.6761, 150, { fetchImpl: fakeFetch(dawaCollection(1)) });
        expect(point).toMatchObject({ refcat: '1a', areaOfficialM2: 800 });
        expect(point).toHaveProperty('areaSigM2');
        expect(area.parcels[0]).toMatchObject({ refcat: '1a', areaOfficialM2: 800 });
        // A feature with geometry but no citable identifier is not a parcel we can serve.
        expect(dawaFeatureToParcel({ geometry: { type: 'Polygon', coordinates: [[[1, 1], [1, 2], [2, 2], [1, 1]]] }, properties: {} })).toBeNull();
        expect(dawaFeatureToParcel(null)).toBeNull();
    });
});
