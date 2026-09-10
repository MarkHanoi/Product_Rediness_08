// TEMP probe (lane C9) — isolate the CPU half. Read cold, then read the SAME bbox again: the
// second read is 100% tileCache hits, so its `ms` is pure crop + build with zero network.
import { readContextTileFeatures, __setContextTilesBaseUrl, type ContextTileLayer } from '../apps/editor/src/ui/geospatial/contextTiles';
__setContextTilesBaseUrl('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/');
const LAT = 41.3874, LON = 2.1686, G = 0.01599892202659001;
const bbox = (h: number) => [LON - h, LAT - h, LON + h, LAT + h] as const;
const LAYERS: Array<[ContextTileLayer, number, number]> = [
    ['roads', G, 225], ['buildings', G, 112], ['parks', G, 225], ['rail', G, 225], ['trees', G, 225],
    ['landuse', 0.072, 64], ['water', 0.008, 64],
];
console.log('layer        cold_ms  warm_ms(crop only)  feat  tiles  vertices');
for (const [l, h, cap] of LAYERS) {
    const a = await readContextTileFeatures(l, bbox(h), undefined, { fanOutCap: cap });
    const t = Date.now();
    const b = await readContextTileFeatures(l, bbox(h), undefined, { fanOutCap: cap });
    const warm = Date.now() - t;
    if (a.status !== 'ok' || b.status !== 'ok') { console.log(l, a.status, b.status); continue; }
    let v = 0; for (const f of b.features) for (const r of f.rings) v += r.length;
    console.log(`${l.padEnd(11)} ${String(a.ms).padStart(6)}  ${String(warm).padStart(10)}        ${String(b.features.length).padStart(6)} ${String(b.tilesRead).padStart(5)}  ${String(v).padStart(9)}`);
}
