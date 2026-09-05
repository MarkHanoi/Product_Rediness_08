// §L-12942 / lane PT-BELVERDE-LOTS — is the FOOTPRINT-primary branch REACHABLE at Belverde?
//
// Deliverable B (`parcelCandidateChoice.ts`) leads the card with the OSM building outline when the
// cadastral answer is oversize AND a footprint exists under the click. In production that footprint
// comes from `footprintParcelProvider` → `fetchContextBuildings` → `readContextTileFeatures`, i.e.
// from the BAKED `buildings.pmtiles` on R2 — never from live Overpass (§CTX-PMTILES-READER, L-513b).
//
// So "an OSM footprint exists at Belverde" is a claim about a PMTiles archive, not about OSM. This
// probe reads the real archive over HTTP Range and answers it directly (memory: committed ≠
// reachable — prove it at the layer the user experiences).
//
// RUN:  node docs/04-reference/jurisdictions/pt/findings/belverde-footprint-tile-probe.mjs
// It writes `belverde-footprint-tile-probe.json` beside itself and prints a one-line verdict.
//
// No keys. Range GETs only. Nothing is written to the network.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = 'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08';
const { PMTiles } = await import(`file:///${ROOT}/node_modules/.pnpm/pmtiles@4.4.1/node_modules/pmtiles/dist/esm/index.js`);
const { VectorTile } = await import(`file:///${ROOT}/node_modules/.pnpm/@mapbox+vector-tile@3.0.0/node_modules/@mapbox/vector-tile/index.js`);
const Pbf = (await import(`file:///${ROOT}/node_modules/.pnpm/pbf@4.0.2/node_modules/pbf/index.js`)).default;

// The R2 public base the same-origin proxy forwards to (`server/context-delivery/contextTilesProxy.js`).
const R2 = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
// `CONTEXT_TILESET_VERSION` in `apps/editor/src/ui/geospatial/contextTiles.ts` — the cache-buster the
// client appends. Kept here so a re-bake that bumps the version shows up as a DIFFERENT probe.
const VERSION = 'L662a';
const LAYER = 'buildings';
const ZOOM = 16; // LAYER_ZOOM.buildings

/** The points. The lot point is the município's own lot-number vertex (lote 797, nº 36). */
const POINTS = [
    { name: 'belverde-lot (Seixal · lote 797 · nº 36)', lon: -9.15011, lat: 38.58370 },
    { name: 'brief-point (as written in the lane brief — Sesimbra, NOT Belverde)', lon: -9.144, lat: 38.572 },
    { name: 'control: Barcelona Eixample', lon: 2.16, lat: 41.39 },
];

/** A Range-GET pmtiles Source. Node 20 `fetch`; the bucket honours `Range` (206 verified by curl). */
class RangeSource {
    constructor(url) { this.url = url; this.bytes = 0; this.requests = 0; }
    getKey() { return this.url; }
    async getBytes(offset, length) {
        this.requests += 1;
        const res = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
        if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status} on range ${offset}-${offset + length - 1}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        this.bytes += buf.byteLength;
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Even-odd point-in-ring, lon/lat. Mirrors `pointInRingEvenOdd` in @pryzm/geometry-kernel. */
function pointInRing(ring, lon, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Shoelace area in m² (equirectangular about the ring's own centroid latitude). */
function ringAreaM2(ring) {
    const latRef = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const mPerDegLat = 111_320, mPerDegLon = 111_320 * Math.cos((latRef * Math.PI) / 180);
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += (ring[j][0] * mPerDegLon) * (ring[i][1] * mPerDegLat) - (ring[i][0] * mPerDegLon) * (ring[j][1] * mPerDegLat);
    }
    return Math.abs(a / 2);
}

const url = `${R2}${LAYER}.pmtiles?v=${VERSION}`;
const source = new RangeSource(url);
const pm = new PMTiles(source);
const out = { probedAt: new Date().toISOString(), url, version: VERSION, layer: LAYER, zoom: ZOOM, header: null, points: [] };

const header = await pm.getHeader();
out.header = {
    minZoom: header.minZoom, maxZoom: header.maxZoom, tileType: header.tileType,
    numAddressedTiles: header.numAddressedTiles, numTileEntries: header.numTileEntries,
    minLon: header.minLon, minLat: header.minLat, maxLon: header.maxLon, maxLat: header.maxLat,
};
console.log(`[tileset] ${url}`);
console.log(`[tileset] z${header.minZoom}-${header.maxZoom} · ${header.numAddressedTiles} addressed tiles · bounds ${header.minLon},${header.minLat} → ${header.maxLon},${header.maxLat}`);

const z = Math.min(ZOOM, header.maxZoom);
for (const p of POINTS) {
    const x = lon2x(p.lon, z), y = lat2y(p.lat, z);
    const row = { ...p, z, x, y, http: null, tileBytes: 0, layerNames: [], features: 0, containing: [], nearestM: null };
    try {
        const t = await pm.getZxy(z, x, y);
        if (!t || !t.data) {
            row.http = 'tile absent (204 — the archive holds no tile at this z/x/y)';
        } else {
            row.tileBytes = t.data.byteLength;
            const vt = new VectorTile(new Pbf(new Uint8Array(t.data)));
            row.layerNames = Object.keys(vt.layers);
            const vl = vt.layers[LAYER];
            row.features = vl ? vl.length : 0;
            let nearest = Infinity;
            for (let i = 0; vl && i < vl.length; i += 1) {
                const gj = vl.feature(i).toGeoJSON(x, y, z);
                const rings = gj.geometry.type === 'Polygon' ? [gj.geometry.coordinates[0]]
                    : gj.geometry.type === 'MultiPolygon' ? gj.geometry.coordinates.map((c) => c[0]) : [];
                for (const ring of rings) {
                    if (!ring || ring.length < 4) continue;
                    for (const v of ring) {
                        const dx = (v[0] - p.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180);
                        const dy = (v[1] - p.lat) * 111_320;
                        nearest = Math.min(nearest, Math.hypot(dx, dy));
                    }
                    if (pointInRing(ring, p.lon, p.lat)) {
                        row.containing.push({
                            osmId: gj.properties['@id'] ?? gj.properties.id ?? gj.id ?? null,
                            building: gj.properties.building ?? null,
                            height: gj.properties.height ?? null,
                            levels: gj.properties['building:levels'] ?? null,
                            vertices: ring.length,
                            areaM2: Math.round(ringAreaM2(ring)),
                        });
                    }
                }
            }
            row.nearestM = Number.isFinite(nearest) ? Math.round(nearest * 10) / 10 : null;
            row.http = 'tile present';
        }
    } catch (err) {
        row.http = `ERROR ${err.message}`;
    }
    out.points.push(row);
    console.log(
        `[${p.name}] z${z}/${x}/${y} · ${row.http} · ${row.tileBytes} B · layers [${row.layerNames.join(', ')}] · `
        + `${row.features} features · CONTAINING ${row.containing.length}`
        + (row.containing.length ? ` → ${row.containing.map((c) => `${c.osmId} ${c.areaM2} m² ${c.vertices} pts`).join(' | ')}` : '')
        + ` · nearest vertex ${row.nearestM} m`,
    );
}

out.rangeRequests = source.requests;
out.rangeBytes = source.bytes;
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'belverde-footprint-tile-probe.json'), JSON.stringify(out, null, 2));
const lot = out.points[0];
console.log(
    `\nVERDICT — footprint-primary branch at the Belverde lot: `
    + (lot.containing.length ? `REACHABLE (${lot.containing.length} outline(s) contain the click)` : `NOT reachable (0 outlines contain the click; card falls back to Draw-primary)`)
    + ` · ${source.requests} range requests, ${source.bytes} B`,
);
