// §CTX-RANGE-COALESCE probe — are the byte ranges a bbox needs CONTIGUOUS in the archive?
// If they are, N range requests collapse into a handful of spans and the per-request latency
// term (the measured 197 ms) stops multiplying by the tile count.
import { PMTiles } from '../node_modules/.pnpm/pmtiles@4.4.1/node_modules/pmtiles/dist/esm/index.js';

const BASE = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
const V = 'L660a';
const LAT = 41.3874, LON = 2.1686;
const HALF = { buildings: 0.011, roads: 0.008, parks: 0.008, landuse: 0.072, water: 0.10 };
const CAP = 64;

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
    const c = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const r = (c * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const bbox = (lat, lon, h) => [lon - h, lat - h, lon + h, lat + h];
function tilesCovering(b, z) {
    const [w, s, e, n] = b;
    const out = [];
    for (let y = lat2y(n, z); y <= lat2y(s, z); y++) for (let x = lon2x(w, z); x <= lon2x(e, z); x++) out.push({ x, y });
    return out;
}

/** Records every (offset,length) the library asks for, so we can analyse the access pattern. */
class RecordingSource {
    constructor(url) { this.url = url; this.ranges = []; this.recording = false; }
    getKey() { return this.url; }
    async getBytes(offset, length, signal) {
        if (this.recording) this.ranges.push({ offset, length });
        const sep = this.url.includes('?') ? '&' : '?';
        const resp = await fetch(`${this.url}${sep}r=${offset}-${length}`, {
            signal, headers: { range: `bytes=${offset}-${offset + length - 1}` },
        });
        if (resp.status >= 300) throw new Error(`HTTP ${resp.status}`);
        const etag = resp.headers.get('ETag');
        return { data: await resp.arrayBuffer(), etag: etag && !etag.startsWith('W/') ? etag : undefined };
    }
}

function coalesce(ranges, maxGap) {
    const sorted = [...ranges].sort((a, b) => a.offset - b.offset);
    const groups = [];
    for (const r of sorted) {
        const last = groups[groups.length - 1];
        if (last && r.offset - (last.offset + last.length) <= maxGap) {
            last.length = Math.max(last.length, r.offset + r.length - last.offset);
            last.n++;
        } else groups.push({ offset: r.offset, length: r.length, n: 1 });
    }
    return groups;
}

console.log('=== §CTX-RANGE-COALESCE — is a bbox\'s tile data contiguous in the PMTiles archive? ===\n');
let totNow = 0, totCo = 0, totBytes = 0, totCoBytes = 0;
for (const layer of Object.keys(HALF)) {
    const url = `${BASE}${layer}.pmtiles?v=${V}`;
    const src = new RecordingSource(url);
    const p = new PMTiles(src);
    const hdr = await p.getHeader();
    const b = bbox(LAT, LON, HALF[layer]);
    let z = Math.min(16, hdr.maxZoom);
    while (z > hdr.minZoom && tilesCovering(b, z).length > CAP) z--;
    const tiles = tilesCovering(b, z);
    src.recording = true;
    await Promise.all(tiles.map(({ x, y }) => p.getZxy(z, x, y).catch(() => null)));
    src.recording = false;

    const rs = src.ranges;
    const payload = rs.reduce((a, r) => a + r.length, 0);
    const line = [];
    for (const gap of [0, 4096, 65536, 262144]) {
        const g = coalesce(rs, gap);
        const bytes = g.reduce((a, x) => a + x.length, 0);
        line.push(`gap${gap >= 1024 ? `${gap / 1024}K` : gap}: ${String(g.length).padStart(3)} req / ${(bytes / 1024).toFixed(0)} KiB`);
        if (gap === 65536) { totCo += g.length; totCoBytes += bytes; }
    }
    totNow += rs.length; totBytes += payload;
    console.log(`${layer.padEnd(10)} z${z} ${String(tiles.length).padStart(2)} tiles → TODAY ${String(rs.length).padStart(3)} range req / ${(payload / 1024).toFixed(0)} KiB`);
    console.log(`${''.padEnd(10)}   ${line.join('  |  ')}`);
}
console.log(`\nTOTAL today:      ${totNow} range requests, ${(totBytes / 1024).toFixed(0)} KiB payload`);
console.log(`TOTAL coalesced (64 KiB gap tolerance): ${totCo} range requests, ${(totCoBytes / 1024).toFixed(0)} KiB payload`);
console.log(`\nAt the MEASURED 197 ms per serialised request:`);
console.log(`   today      → ${(totNow * 0.197).toFixed(1)} s   (founder observed 26–27 s)`);
console.log(`   coalesced  → ${(totCo * 0.197).toFixed(1)} s`);
