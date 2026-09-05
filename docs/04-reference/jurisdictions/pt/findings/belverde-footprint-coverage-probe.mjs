// §L-12942 / lane PT-BELVERDE-LOTS — HOW OFTEN does the footprint-primary branch actually fire at
// Belverde? A coverage measurement, not an anecdote.
//
// THE QUESTION. `parcelCandidateChoice.chooseParcelCandidate` leads the card with the OSM building
// outline when the cadastral answer is oversize AND a footprint is under the click. At Belverde the
// cadastral answer is ALWAYS oversize (one 766 ha prédio for the whole urbanisation), so the branch
// is decided entirely by "is there an OSM footprint under this click" — and in production that
// footprint comes from the BAKED `buildings.pmtiles` on R2, never from live Overpass
// (§CTX-PMTILES-READER, L-513b). So the branch's real hit-rate is a property of a PMTiles archive.
//
// THE METHOD. Ground truth = the Câmara Municipal do Seixal's own `Edificado` layer (municipal
// cartography: the building outlines, 1 482 in the 4x4 km box — see
// `belverde-lot-sources-2026-09-05.md` rows 3.2 / 3.8). Its polygon CENTROIDS are points that are
// inside a real building by construction. For each centroid we ask the baked tileset: does an OSM
// footprint contain this point? The share that say yes IS the hit-rate of the product branch at
// Belverde.
//
// Two independent sources, neither of them ours: the município says a building is there; the baked
// OSM tiles say whether we can draw it. Disagreement is the finding.
//
// RUN:  node docs/04-reference/jurisdictions/pt/findings/belverde-footprint-coverage-probe.mjs
// Writes `belverde-footprint-coverage-probe.json` beside itself. Keyless; Range GETs only.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = 'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08';
const { PMTiles } = await import(`file:///${ROOT}/node_modules/.pnpm/pmtiles@4.4.1/node_modules/pmtiles/dist/esm/index.js`);
const { VectorTile } = await import(`file:///${ROOT}/node_modules/.pnpm/@mapbox+vector-tile@3.0.0/node_modules/@mapbox/vector-tile/index.js`);
const Pbf = (await import(`file:///${ROOT}/node_modules/.pnpm/pbf@4.0.2/node_modules/pbf/index.js`)).default;

const R2 = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
const VERSION = 'L662a';        // CONTEXT_TILESET_VERSION, contextTiles.ts
const ZOOM = 16;                // LAYER_ZOOM.buildings
const SEIXAL = 'https://sig.cm-seixal.pt/arcgis/rest/services/INFORMACAO_BASE_2/MapServer/998/query';

/** Belverde's own statistical-lugar extent, from Seixal layer 1003 (row 3.12 of the source hunt). */
const BOXES = [
    { name: 'belverde-core (the founder\'s urbanisation)', xmin: -9.1560, ymin: 38.5790, xmax: -9.1440, ymax: 38.5890 },
    { name: 'control: Seixal centre', xmin: -9.1060, ymin: 38.6360, xmax: -9.0980, ymax: 38.6420 },
];

class RangeSource {
    constructor(url) { this.url = url; this.bytes = 0; this.requests = 0; }
    getKey() { return this.url; }
    async getBytes(offset, length) {
        this.requests += 1;
        const res = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
        if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const b = new Uint8Array(await res.arrayBuffer());
        this.bytes += b.byteLength;
        return { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
function pointInRing(ring, lon, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
function ringAreaM2(ring) {
    const latRef = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const kx = 111_320 * Math.cos((latRef * Math.PI) / 180), ky = 111_320;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
    }
    return Math.abs(a / 2);
}
/** Centroid of a polygon ring (area-weighted); falls back to the vertex mean for degenerate rings. */
function ringCentroid(ring) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(a) < 1e-12) {
        return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
    }
    return [cx / (3 * a), cy / (3 * a)];
}

const url = `${R2}buildings.pmtiles?v=${VERSION}`;
const source = new RangeSource(url);
const pm = new PMTiles(source);
const header = await pm.getHeader();
const z = Math.min(ZOOM, header.maxZoom);
console.log(`[tileset] ${url} · z${header.minZoom}-${header.maxZoom} · reading at z${z}`);

/** Decoded-tile cache: one z/x/y is read once and reused across every centroid it serves. */
const tileCache = new Map();
async function osmRingsForTile(x, y) {
    const k = `${x}/${y}`;
    if (tileCache.has(k)) return tileCache.get(k);
    let rings = [];
    try {
        const t = await pm.getZxy(z, x, y);
        if (t && t.data) {
            const vl = new VectorTile(new Pbf(new Uint8Array(t.data))).layers.buildings;
            for (let i = 0; vl && i < vl.length; i += 1) {
                const gj = vl.feature(i).toGeoJSON(x, y, z);
                const rr = gj.geometry.type === 'Polygon' ? [gj.geometry.coordinates[0]]
                    : gj.geometry.type === 'MultiPolygon' ? gj.geometry.coordinates.map((c) => c[0]) : [];
                for (const r of rr) if (r && r.length >= 4) rings.push(r);
            }
        }
    } catch (err) { console.warn(`  tile ${k} failed: ${err.message}`); }
    tileCache.set(k, rings);
    return rings;
}

const out = { probedAt: new Date().toISOString(), tileset: url, version: VERSION, zoom: z, boxes: [] };

for (const box of BOXES) {
    const q = `${SEIXAL}?geometry=${box.xmin},${box.ymin},${box.xmax},${box.ymax}`
        + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects'
        + '&outFields=EDIFICADO_ID&returnGeometry=true&outSR=4326&resultRecordCount=2000&f=json';
    const res = await fetch(q);
    const body = await res.text();
    const json = JSON.parse(body);
    const feats = json.features ?? [];
    const row = {
        name: box.name, box, seixalQuery: q, seixalHttp: res.status, seixalBytes: body.length,
        seixalBuildings: feats.length, exceededTransferLimit: json.exceededTransferLimit ?? false,
        tested: 0, osmHit: 0, osmMiss: 0, hitRatePct: null,
        missedAreaM2: { min: null, max: null, median: null }, samples: [],
    };
    console.log(`\n[${box.name}] Seixal Edificado: HTTP ${res.status} · ${body.length} B · ${feats.length} buildings`
        + (json.exceededTransferLimit ? ' (exceededTransferLimit)' : ''));

    const missedAreas = [];
    for (const f of feats) {
        const rings = f.geometry?.rings;
        if (!rings || !rings[0] || rings[0].length < 4) continue;
        const ring = rings[0];
        const [clon, clat] = ringCentroid(ring);
        if (!Number.isFinite(clon) || !Number.isFinite(clat)) continue;
        // Only test centroids that actually fall inside their own outline (concave buildings).
        if (!pointInRing(ring, clon, clat)) continue;
        const areaM2 = Math.round(ringAreaM2(ring));
        const osm = await osmRingsForTile(lon2x(clon, z), lat2y(clat, z));
        const hit = osm.some((r) => pointInRing(r, clon, clat));
        row.tested += 1;
        if (hit) row.osmHit += 1; else { row.osmMiss += 1; missedAreas.push(areaM2); }
        if (row.samples.length < 12) {
            row.samples.push({ edificadoId: f.attributes?.EDIFICADO_ID ?? null, lon: +clon.toFixed(6), lat: +clat.toFixed(6), areaM2, osmFootprint: hit });
        }
    }
    row.hitRatePct = row.tested ? Math.round((row.osmHit / row.tested) * 1000) / 10 : null;
    if (missedAreas.length) {
        missedAreas.sort((a, b) => a - b);
        row.missedAreaM2 = { min: missedAreas[0], max: missedAreas[missedAreas.length - 1], median: missedAreas[Math.floor(missedAreas.length / 2)] };
    }
    out.boxes.push(row);
    console.log(`[${box.name}] tested ${row.tested} municipal buildings · OSM footprint present ${row.osmHit} · absent ${row.osmMiss} · HIT RATE ${row.hitRatePct}%`
        + (missedAreas.length ? ` · missed areas min/med/max ${row.missedAreaM2.min}/${row.missedAreaM2.median}/${row.missedAreaM2.max} m²` : ''));
}

out.rangeRequests = source.requests;
out.rangeBytes = source.bytes;
out.tilesRead = tileCache.size;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'belverde-footprint-coverage-probe.json'), JSON.stringify(out, null, 2));
const b = out.boxes[0], c = out.boxes[1];
console.log(`\nVERDICT — at Belverde the footprint-primary branch fires for ${b.hitRatePct}% of the município's own buildings `
    + `(${b.osmHit}/${b.tested}); the Seixal-centre control reads ${c ? c.hitRatePct : 'n/a'}%. `
    + `${source.requests} range requests, ${source.bytes} B, ${tileCache.size} tiles.`);
