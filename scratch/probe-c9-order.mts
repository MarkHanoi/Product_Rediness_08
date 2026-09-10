// TEMP probe (lane C9) — the exact request timeline for ONE layer: offset, size, start, end.
import { readContextTileFeatures, __setContextTilesBaseUrl, type ContextTileLayer } from '../apps/editor/src/ui/geospatial/contextTiles';
__setContextTilesBaseUrl('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/');
const LAT = 41.3874, LON = 2.1686, G = 0.01599892202659001;
const layer = (process.argv[2] ?? 'roads') as ContextTileLayer;
const cap = layer === 'buildings' ? 112 : 225;
const T0 = Date.now();
const real = globalThis.fetch;
const rows: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const m = /[?&]r=(\d+)-(\d+)/.exec(url);
    const s = Date.now() - T0;
    const r = await real(input, init);
    const b = await r.arrayBuffer();
    rows.push(`  t+${String(s).padStart(5)} → t+${String(Date.now() - T0).padStart(5)}  off=${(m ? +m[1]! : -1).toString().padStart(12)}  len=${(m ? +m[2]! : b.byteLength).toString().padStart(8)}`);
    return new Response(b, { status: r.status, headers: r.headers });
}) as any;
const r = await readContextTileFeatures(layer, [LON - G, LAT - G, LON + G, LAT + G], undefined, { fanOutCap: cap });
console.log(`${layer}: ${r.status} ${(r as any).features?.length} feat / ${(r as any).tilesRead} tiles, wall ${Date.now() - T0} ms, ${rows.length} requests`);
for (const x of rows) console.log(x);
