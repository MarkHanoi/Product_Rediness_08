// §BYGGEFELT-PROXY (DK G3/G6 tier 1, stub S3) — /api/plandata/byggefelt same-origin keyless proxy.
//
// WHAT IS BEING PROVED:
//   §UA-IS-REAL          the route exists because `User-Agent` is a forbidden BROWSER header — so the
//                        server must send it, and the test pins that it does.
//   §NOT-A-FORWARDER     the route takes a BBOX, never a URL and never a CQL filter. Caller-supplied
//                        strings can never reach the upstream query.
//   §FAILURE-IS-NOT-ABSENCE  a 500, a timeout, a truncated 200 and zero features are FOUR different
//                        answers, and only one of them means "there is no byggefelt here".
//   §CRS-IS-NEVER-COERCED an unrecognised CRS is a 400, never a silent fall-back to the default —
//                        which would reinterpret the caller's coordinates in a frame they were not
//                        written in (metres read as degrees, or the reverse).
//   §PAGING-PASSES-THROUGH  `numberMatched` survives, so the client can tell a complete read from a
//                        partial one.

import { describe, expect, it } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
    PLANDATA_BYGGEFELT_PATH,
    BYGGEFELT_MAX_COUNT,
    makePlandataByggefeltHandler,
    buildByggefeltWfsUrl,
    parseByggefeltQuery,
} from '../plandataZoningProxy.js';

/** A Silkeborg-shaped byggefelt FeatureCollection (EPSG:25832), as GeoServer serves it. */
const BYGGEFELT_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'theme_pdk_byggefelt_vedtaget.1485483',
            properties: { id: 1485483, bygkunifelt: true, bygvejledende: false, komnr: 740 },
            geometry: {
                type: 'MultiPolygon',
                coordinates: [[[[531_454, 6_224_463], [531_493, 6_224_480], [531_459, 6_224_454], [531_454, 6_224_463]]]],
            },
        },
    ],
    numberMatched: 7,
    numberReturned: 1,
});

const DK_BBOX = { minx: 531_000, miny: 6_224_000, maxx: 532_000, maxy: 6_225_000 };
const qs = (o: Record<string, string | number>): string =>
    new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

/** Decode a URL for assertion. `URLSearchParams` encodes spaces as `+`, which decodeURIComponent
 *  leaves alone — so normalise them, or every CQL assertion silently misses. */
const readable = (url: string): string => decodeURIComponent(url).replace(/\+/g, ' ');

interface Recorded {
    url: string;
    headers: Record<string, string>;
}

/** Boot an express app around the handler with a scripted upstream. */
function bootstrap(script: () => { status: number; body: string } | { throws: string }) {
    const seen: Recorded[] = [];
    const fetchImpl = (async (url: unknown, init?: { headers?: Record<string, string> }) => {
        seen.push({ url: String(url), headers: init?.headers ?? {} });
        const step = script();
        if ('throws' in step) throw new Error(step.throws);
        return {
            ok: step.status >= 200 && step.status < 300,
            status: step.status,
            text: async () => step.body,
        };
    }) as unknown as typeof fetch;
    const app = express();
    app.get(PLANDATA_BYGGEFELT_PATH, makePlandataByggefeltHandler({ fetchImpl }));
    return { app, seen };
}

async function listen(app: express.Express): Promise<{ server: Server; base: string }> {
    const server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    return { server, base: `http://127.0.0.1:${port}` };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parseByggefeltQuery — validation happens BEFORE a government round-trip', () => {
    it('accepts a well-formed Danish bbox', () => {
        const r = parseByggefeltQuery({ ...DK_BBOX });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.crs).toBe('EPSG:25832');
        expect(r.startIndex).toBe(0);
        expect(r.bindingOnly).toBe(false);
    });

    it('rejects a missing / non-finite bbox rather than forward it', () => {
        expect(parseByggefeltQuery({}).ok).toBe(false);
        expect(parseByggefeltQuery({ ...DK_BBOX, maxx: 'banana' }).ok).toBe(false);
    });

    it('rejects a zero/negative extent', () => {
        expect(parseByggefeltQuery({ ...DK_BBOX, maxx: DK_BBOX.minx }).ok).toBe(false);
    });

    it('§CRS-IS-NEVER-COERCED — an unrecognised CRS is an ERROR, not a silent default', () => {
        // ⚠ Coercing to EPSG:25832 would reinterpret the caller's numbers in a frame they were not
        // written in. Both frames are "plausible numbers", so the failure would be a building in the
        // wrong place rather than a visible error — the CRS-interlock failure mode, server-side.
        const r = parseByggefeltQuery({ ...DK_BBOX, crs: 'EPSG:3857' });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.error).toContain('EPSG:3857');
    });

    it('accepts EPSG:4326 with lon/lat bounds (the axis order VERIFIED live 2026-07-31)', () => {
        const r = parseByggefeltQuery({ minx: 9.52, miny: 56.17, maxx: 9.54, maxy: 56.18, crs: 'EPSG:4326' });
        expect(r.ok).toBe(true);
        expect(r.ok === true && r.crs).toBe('EPSG:4326');
    });

    it('rejects a bbox outside Denmark, and one that is absurdly large', () => {
        // An abuse guard, not a geofence: the limits are deliberately generous.
        expect(parseByggefeltQuery({ minx: 1, miny: 1, maxx: 2, maxy: 2 }).ok).toBe(false);
        expect(parseByggefeltQuery({ minx: 200_000, miny: 5_900_000, maxx: 900_000, maxy: 6_500_000 }).ok).toBe(false);
    });

    it('CLAMPS count rather than let one request ask for the whole country', () => {
        const r = parseByggefeltQuery({ ...DK_BBOX, count: 999_999 });
        expect(r.ok === true && r.count).toBe(BYGGEFELT_MAX_COUNT);
    });

    it('carries startIndex + binding through (the client owns the paging loop)', () => {
        const r = parseByggefeltQuery({ ...DK_BBOX, startIndex: 500, binding: '1' });
        expect(r.ok === true && r.startIndex).toBe(500);
        expect(r.ok === true && r.bindingOnly).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§NOT-A-FORWARDER — the upstream query is rebuilt from validated numbers', () => {
    it('builds a WFS URL with the bbox filter and no caller-supplied string', () => {
        const url = buildByggefeltWfsUrl({ minX: 1, minY: 2, maxX: 3, maxY: 4 }, 'EPSG:25832', 10, 0, false);
        expect(url).toContain('geoserver.plandata.dk');
        expect(url).toContain('theme_pdk_byggefelt_vedtaget');
        expect(readable(url)).toContain("BBOX(geometri,1,2,3,4,'EPSG:25832')");
    });

    it('adds the binding predicate as a FIXED string chosen by a boolean', () => {
        const on = readable(buildByggefeltWfsUrl({ minX: 1, minY: 2, maxX: 3, maxY: 4 }, 'EPSG:25832', 10, 0, true));
        const off = readable(buildByggefeltWfsUrl({ minX: 1, minY: 2, maxX: 3, maxY: 4 }, 'EPSG:25832', 10, 0, false));
        expect(on).toContain('bygkunifelt=true AND bygvejledende=false');
        expect(off).not.toContain('bygkunifelt');
    });

    it('⚠ a caller-supplied CQL_FILTER never reaches the upstream URL', async () => {
        const { app, seen } = bootstrap(() => ({ status: 200, body: BYGGEFELT_GEOJSON }));
        const { server, base } = await listen(app);
        try {
            await fetch(
                `${base}${PLANDATA_BYGGEFELT_PATH}?${qs({ ...DK_BBOX })}` +
                    `&CQL_FILTER=${encodeURIComponent("1=1 OR komnr='0'")}&typeNames=evil:layer`,
            );
            const upstream = readable(seen[0]!.url);
            expect(upstream).not.toContain('1=1');
            expect(upstream).not.toContain('evil:layer');
            expect(upstream).toContain('theme_pdk_byggefelt_vedtaget');
        } finally {
            server.close();
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('the route — four upstream outcomes, four responses', () => {
    it('§UA-IS-REAL — sends an identifying User-Agent the browser could never send', async () => {
        const { app, seen } = bootstrap(() => ({ status: 200, body: BYGGEFELT_GEOJSON }));
        const { server, base } = await listen(app);
        try {
            await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`);
            expect(seen[0]!.headers['User-Agent']).toMatch(/PRYZM/);
        } finally {
            server.close();
        }
    });

    it('returns the features and PASSES numberMatched THROUGH (§PAGING-PASSES-THROUGH)', async () => {
        const { app } = bootstrap(() => ({ status: 200, body: BYGGEFELT_GEOJSON }));
        const { server, base } = await listen(app);
        try {
            const res = await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`);
            expect(res.status).toBe(200);
            const body = (await res.json()) as { features: unknown[]; numberMatched: number };
            expect(body.features).toHaveLength(1);
            // ⚠ Dropping numberMatched would make every partial read look complete.
            expect(body.numberMatched).toBe(7);
        } finally {
            server.close();
        }
    });

    it('a CLEAN empty is 200 with zero features — a DURABLE "nothing here"', async () => {
        const { app } = bootstrap(() => ({
            status: 200,
            body: JSON.stringify({ type: 'FeatureCollection', features: [], numberMatched: 0, numberReturned: 0 }),
        }));
        const { server, base } = await listen(app);
        try {
            const res = await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`);
            expect(res.status).toBe(200);
            expect(((await res.json()) as { features: unknown[] }).features).toHaveLength(0);
        } finally {
            server.close();
        }
    });

    it('⚠ an upstream 500 is 502 — NEVER 200 with an empty collection', async () => {
        // A 200-empty here would be read downstream as "the register published no byggefelt at this
        // parcel": a durable, cacheable coverage fact manufactured out of one bad minute.
        const { app } = bootstrap(() => ({ status: 500, body: 'boom' }));
        const { server, base } = await listen(app);
        try {
            const res = await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`);
            expect(res.status).toBe(502);
            expect(((await res.json()) as { error: string }).error).toMatch(/NOT a statement/i);
        } finally {
            server.close();
        }
    });

    it('a network error is 502 too', async () => {
        const { app } = bootstrap(() => ({ throws: 'ECONNRESET' }));
        const { server, base } = await listen(app);
        try {
            expect((await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`)).status).toBe(502);
        } finally {
            server.close();
        }
    });

    it('⚠ a TRUNCATED 200 is 502 — the status code is not the answer, the PARSE is', async () => {
        // The verified DAWA trap in another costume: HTTP 200, transport-level success, body cut off
        // mid-field. Trusting the status here would hand the client half a FeatureCollection.
        const { app } = bootstrap(() => ({
            status: 200,
            body: BYGGEFELT_GEOJSON.slice(0, Math.floor(BYGGEFELT_GEOJSON.length / 2)),
        }));
        const { server, base } = await listen(app);
        try {
            const res = await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`);
            expect(res.status).toBe(502);
            expect(((await res.json()) as { error: string }).error).toMatch(/truncated|not valid JSON/i);
        } finally {
            server.close();
        }
    });

    it('a 200 that is valid JSON but NOT a FeatureCollection is 502, not an empty answer', async () => {
        const { app } = bootstrap(() => ({ status: 200, body: JSON.stringify({ error: 'nope' }) }));
        const { server, base } = await listen(app);
        try {
            expect((await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?${qs(DK_BBOX)}`)).status).toBe(502);
        } finally {
            server.close();
        }
    });

    it('a bad bbox is 400 and costs NO government round-trip', async () => {
        const { app, seen } = bootstrap(() => ({ status: 200, body: BYGGEFELT_GEOJSON }));
        const { server, base } = await listen(app);
        try {
            const res = await fetch(`${base}${PLANDATA_BYGGEFELT_PATH}?minx=1`);
            expect(res.status).toBe(400);
            expect(seen).toHaveLength(0);
        } finally {
            server.close();
        }
    });
});
