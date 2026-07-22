// L-513b probe — does the BAKED Barcelona PMTiles actually decode, and do the OSM
// height tags survive tippecanoe? Ship the probe before the reader.
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const BASE = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';
const LAT = 41.3874, LON = 2.1686, Z = 16;

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

for (const layer of ['buildings', 'roads', 'water', 'parks']) {
    const p = new PMTiles(`${BASE}${layer}.pmtiles`);
    const hdr = await p.getHeader();
    console.log(`\n=== ${layer} === z${hdr.minZoom}-${hdr.maxZoom} ` +
        `bounds=[${hdr.minLon.toFixed(3)},${hdr.minLat.toFixed(3)},${hdr.maxLon.toFixed(3)},${hdr.maxLat.toFixed(3)}] ` +
        `tileCompression=${hdr.tileCompression} tileType=${hdr.tileType}`);
    const z = Math.min(Z, hdr.maxZoom);
    const x = lon2x(LON, z), y = lat2y(LAT, z);
    const t0 = Date.now();
    const r = await p.getZxy(z, x, y);
    const ms = Date.now() - t0;
    if (!r) { console.log(`  ✖ no tile at ${z}/${x}/${y}`); continue; }
    const vt = new VectorTile(new Pbf(r.data) as never);
    console.log(`  tile ${z}/${x}/${y}: ${r.data.byteLength} B in ${ms} ms; layers=${Object.keys(vt.layers).join(',')}`);
    for (const name of Object.keys(vt.layers)) {
        const L = vt.layers[name]!;
        console.log(`   layer "${name}" ${L.length} features, extent ${L.extent}`);
        const keys = new Map<string, number>();
        for (let i = 0; i < L.length; i++) {
            for (const k of Object.keys(L.feature(i).properties)) keys.set(k, (keys.get(k) ?? 0) + 1);
        }
        const top = [...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
        console.log(`   top tags: ${top.map(([k, n]) => `${k}(${n})`).join(' ')}`);
        const f0 = L.feature(0);
        console.log(`   f0 id=${f0.id} type=${f0.type} props=${JSON.stringify(f0.properties).slice(0, 260)}`);
        const g = f0.toGeoJSON(x, y, z);
        console.log(`   f0 geojson: ${g.geometry.type} first=${JSON.stringify((g.geometry as never as { coordinates: unknown[] }).coordinates).slice(0, 120)}`);
    }
}
