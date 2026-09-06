// §KR-PARCEL-KEYED-LEG (2026-09-06, lane KOREA-FROM-NOTHING) — South Korea's cadastral leg, pinned.
//
// ⛔ THE MOST IMPORTANT THING THIS FILE ESTABLISHES IS WHAT IT DOES *NOT* ESTABLISH.
// V-World would not answer ANY probe on 2026-09-06 (seven requests across three hosts, HTTP 502 or
// curl exit 52, with TCP+TLS succeeding each time), so this repo has NEVER SEEN a real
// `LP_PA_CBND_BUBUN` response. Every fixture below is therefore SYNTHETIC and is labelled so:
// [[fake-more-capable-than-real]] — a fake built from a service's published schema cannot falsify
// that schema, and it is precisely how `normaliseKrParcel` could be confidently wrong about property
// names. What these tests DO prove is the half that does not depend on the upstream at all: that the
// route never crashes, never fabricates a parcel, and keeps FOUR distinct facts apart. The first real
// HTTP 200 must be diffed against `normaliseKrParcel` before the forward leg is trusted.
//
// LAYERING: a server test (Node env, vitest.server.config.ts).
import { describe, it, expect } from 'vitest';
import {
    KR_PARCEL_PATH, KR_BBOX, KR_PARCEL_REASONS, KR_VWORLD_PARCEL_LAYER,
    isInKorea, krParcelRequestUrl, normaliseKrParcel, krParcelPreflight, fetchKrParcel,
} from '../jurisdiction/krParcelProxy.js';

/** ⚠ SYNTHETIC — built from V-World's PUBLISHED layer schema, never from a response we received. */
const SYNTHETIC_FEATURE = {
    type: 'Feature',
    properties: {
        pnu: '1111017700102110000', jibun: '사직동 211', addr: '서울특별시 종로구 사직동 211',
        jimok: '대', parea: '1234.5',
    },
    geometry: { type: 'Polygon', coordinates: [[[126.97, 37.57], [126.98, 37.57], [126.98, 37.58], [126.97, 37.57]]] },
};

describe('§KR-PARCEL-KEYED-LEG — the route exists and is addressed like its siblings', () => {
    it('mounts at /api/parcel/kr, the `:cc`-shaped path the router registers ahead of the catch-all', () => {
        expect(KR_PARCEL_PATH).toBe('/api/parcel/kr');
    });

    it('its bbox is the `southkorea` bake rectangle 1:1 — we attempt a parcel wherever we bake context', () => {
        // A drift here would mean serving Korean context for a point the parcel leg refuses as
        // "out of country", which reads to the user as a bug in the wrong place.
        expect([...KR_BBOX]).toEqual([124.5, 32.9, 131.95, 38.65]);
    });

    it('names the cadastral layer explicitly rather than a generic "parcels"', () => {
        expect(KR_VWORLD_PARCEL_LAYER).toBe('LP_PA_CBND_BUBUN');
    });
});

describe('§KR-PARCEL-KEYED-LEG — the point test', () => {
    it('accepts real Korean points across the whole country, islands included', () => {
        for (const [name, lon, lat] of [
            ['Seoul', 126.978, 37.5665], ['Busan', 129.0756, 35.1796], ['Jeju', 126.5312, 33.4996],
            ['Ulleungdo', 130.9057, 37.4844], ['Baengnyeongdo', 124.6303, 37.9656], ['Marado', 126.2683, 33.1163],
        ] as ReadonlyArray<readonly [string, number, number]>) {
            expect(isInKorea(lon, lat), name).toBe(true);
        }
    });

    it('rejects points outside, including the near neighbours it would be easy to swallow', () => {
        expect(isInKorea(139.7671, 35.6812)).toBe(false);   // Tokyo
        expect(isInKorea(129.3, 34.4)).toBe(true);          // ⚠ Tsushima IS inside the rectangle —
        // Japanese territory in a Korean box. This is NOT a bug in the box (a rectangle cannot
        // separate Busan at 129.08 E from Tsushima at 129.17 E) and it is why the handler returns
        // whatever the CADASTRE says rather than deciding nationality from geometry. Pinned so the
        // next reader meets it here rather than in production.
        expect(isInKorea(125.75, 39.03)).toBe(false);       // Pyongyang — north of 38.65
        expect(isInKorea(121.47, 31.23)).toBe(false);       // Shanghai
        expect(isInKorea(NaN, 37.5)).toBe(false);
    });
});

describe('§KR-PARCEL-KEYED-LEG — ⭐ four distinct facts, never collapsed', () => {
    it('bad coordinates → 400, not a null parcel', () => {
        expect(krParcelPreflight(NaN, 37.5, 'k')?.status).toBe(400);
        expect(krParcelPreflight(126.9, Infinity, 'k')?.status).toBe(400);
    });

    it('outside Korea → 200 { parcel: null, reason: out-of-country }, and we never call upstream', () => {
        const out = krParcelPreflight(139.7671, 35.6812, 'a-key')!;
        expect(out.status).toBe(200);
        expect(out.body!.parcel).toBeNull();
        expect(out.body!.reason).toBe(KR_PARCEL_REASONS.OUT_OF_COUNTRY);
        expect(out.body!.probeStatus).toBe('not-asked');
    });

    it('inside Korea with NO credential → a CITED refusal that names the door, not a silent null', () => {
        const out = krParcelPreflight(126.978, 37.5665, undefined)!;
        expect(out.status).toBe(200);
        expect(out.body!.parcel).toBeNull();
        expect(out.body!.reason).toBe(KR_PARCEL_REASONS.NO_CREDENTIAL);
        // C57 §1.9 — the user is owed the reason, not a blank. The citation must name the service.
        expect(out.body!.cite).toMatch(/V-World/);
        expect(out.body!.cite).toMatch(/LP_PA_CBND_BUBUN/);
        expect(out.body!.cite).toMatch(/인증키/);
    });

    it('inside Korea WITH a credential → preflight passes it through to the upstream call', () => {
        expect(krParcelPreflight(126.978, 37.5665, 'a-key')).toBeNull();
    });

    it('⛔ the four reasons are four DIFFERENT strings — collapsing any two is the L-422 family', () => {
        const vals = Object.values(KR_PARCEL_REASONS);
        expect(new Set(vals).size).toBe(vals.length);
        expect(vals).toHaveLength(4);
    });
});

describe('§KR-PARCEL-KEYED-LEG — the upstream request', () => {
    it('asks V-World for ONE parcel at the point, in WGS84, with geometry and attributes', () => {
        const url = new URL(krParcelRequestUrl(126.978, 37.5665, 'SECRET-KEY'));
        expect(url.searchParams.get('data')).toBe('LP_PA_CBND_BUBUN');
        expect(url.searchParams.get('request')).toBe('GetFeature');
        expect(url.searchParams.get('crs')).toBe('EPSG:4326');
        expect(url.searchParams.get('geometry')).toBe('true');
        expect(url.searchParams.get('size')).toBe('1');
        expect(url.searchParams.get('geomFilter')).toBe('POINT(126.978 37.5665)');
        expect(url.searchParams.get('key')).toBe('SECRET-KEY');
    });
});

describe('§KR-PARCEL-KEYED-LEG — normalisation refuses anything that is not a real parcel', () => {
    it('maps a (SYNTHETIC) feature onto the shared parcel contract', () => {
        const p = normaliseKrParcel(SYNTHETIC_FEATURE)!;
        expect(p.pnu).toBe('1111017700102110000');
        expect(p.jibun).toBe('사직동 211');
        expect(p.landCategory).toBe('대');
        expect(p.areaSqm).toBe(1234.5);
        expect(p.geometry.type).toBe('Polygon');
        expect(p.source).toBe('vworld-lp-pa-cbnd-bubun');
    });

    it('⛔ returns null — never a half-filled object — for anything that is not a polygon feature', () => {
        // A partially-filled parcel reads downstream as "a parcel with missing fields", which is the
        // one answer that is worse than "no parcel": it is a claim.
        expect(normaliseKrParcel(null)).toBeNull();
        expect(normaliseKrParcel({})).toBeNull();
        expect(normaliseKrParcel({ properties: SYNTHETIC_FEATURE.properties })).toBeNull();          // no geometry
        expect(normaliseKrParcel({ geometry: SYNTHETIC_FEATURE.geometry })).toBeNull();              // no properties
        expect(normaliseKrParcel({ properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } })).toBeNull();
    });

    it('a non-numeric area becomes null, not NaN and not 0', () => {
        const p = normaliseKrParcel({ ...SYNTHETIC_FEATURE, properties: { ...SYNTHETIC_FEATURE.properties, parea: '알 수 없음' } })!;
        expect(p.areaSqm).toBeNull();
    });
});

describe('§KR-PARCEL-KEYED-LEG — the forward leg never crashes and never lies', () => {
    const KEY = 'test-key';

    it('an upstream non-2xx is UPSTREAM_REFUSED with the status in probeStatus — never "no parcel"', async () => {
        const out = await fetchKrParcel(126.978, 37.5665, {
            apikey: KEY, fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }),
        });
        expect(out.status).toBe(200);
        expect(out.body.parcel).toBeNull();
        expect(out.body.reason).toBe(KR_PARCEL_REASONS.UPSTREAM_REFUSED);
        expect(out.body.probeStatus).toBe('http-502');   // ⭐ the 2026-09-06 real-world branch
    });

    it("V-World's own in-body error (a 200 with no featureCollection) is ALSO a refusal, not an empty", async () => {
        const out = await fetchKrParcel(126.978, 37.5665, {
            apikey: KEY,
            fetch: async () => ({ ok: true, status: 200, json: async () => ({ response: { status: 'ERROR' } }) }),
        });
        expect(out.body.parcel).toBeNull();
        expect(out.body.reason).toBe(KR_PARCEL_REASONS.UPSTREAM_REFUSED);
        expect(out.body.probeStatus).toBe('body-ERROR');
    });

    it('a thrown fetch (timeout / DNS / TLS) is a refusal carrying the error NAME', async () => {
        const out = await fetchKrParcel(126.978, 37.5665, {
            apikey: KEY, fetch: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
        });
        expect(out.body.parcel).toBeNull();
        expect(out.body.reason).toBe(KR_PARCEL_REASONS.UPSTREAM_REFUSED);
        expect(out.body.probeStatus).toBe('error-AbortError');
    });

    it('⭐ an ANSWERED query with zero features is NO_PARCEL_HERE — an honest EMPTY, distinct from all above', async () => {
        const out = await fetchKrParcel(126.978, 37.5665, {
            apikey: KEY,
            fetch: async () => ({ ok: true, status: 200, json: async () => ({ response: { result: { featureCollection: { features: [] } } } }) }),
        });
        expect(out.body.parcel).toBeNull();
        expect(out.body.reason).toBe(KR_PARCEL_REASONS.NO_PARCEL_HERE);
        expect(out.body.probeStatus).toBe('ok');
    });

    it('and a (SYNTHETIC) hit returns the parcel with reason null', async () => {
        const out = await fetchKrParcel(126.9781, 37.5666, {
            apikey: KEY,
            fetch: async () => ({ ok: true, status: 200, json: async () => ({ response: { result: { featureCollection: { features: [SYNTHETIC_FEATURE] } } } }) }),
        });
        expect(out.body.parcel!.pnu).toBe('1111017700102110000');
        expect(out.body.reason).toBeNull();
        expect(out.body.probeStatus).toBe('ok');
    });
});
