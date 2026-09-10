// TEMP probe (lane C9) — record every range request the SHIPPED reader issues, with wave
// structure and latency, then recompute what ONE coalescing window would have produced.
import { readContextTileFeatures, __setContextTilesBaseUrl, clearContextTileArchives, coalesceRanges, type ContextTileLayer } from '../apps/editor/src/ui/geospatial/contextTiles';

__setContextTilesBaseUrl('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/');
const LAT = 41.3874, LON = 2.1686;
const GROUND = 0.01599892202659001;
const bbox = (h: number) => [LON - h, LAT - h, LON + h, LAT + h] as const;

interface Rec { layer: string; offset: number; length: number; t0: number; t1: number; ok: boolean }
const recs: Rec[] = [];
let current = 'boot';
const real = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const m = /[?&]r=(\d+)-(\d+)/.exec(url);
    const t0 = Date.now();
    try {
        const r = await real(input, init);
        const buf = await r.arrayBuffer();
        if (m) recs.push({ layer: current, offset: +m[1]!, length: +m[2]!, t0, t1: Date.now(), ok: true });
        return new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
    } catch (e) {
        if (m) recs.push({ layer: current, offset: +m[1]!, length: +m[2]!, t0, t1: Date.now(), ok: false });
        throw e;
    }
}) as any;

const LAYERS: ContextTileLayer[] = ['roads', 'buildings', 'parks', 'rail', 'trees'];
for (const layer of LAYERS) {
    current = layer;
    const t = Date.now();
    const r = await readContextTileFeatures(layer, bbox(GROUND), undefined, { fanOutCap: layer === 'buildings' ? 112 : 225 });
    const mine = recs.filter((x) => x.layer === layer);
    // cluster into waves by start time (a new wave starts >150ms after the previous wave's max t0)
    const sorted = [...mine].sort((a, b) => a.t0 - b.t0);
    const waves: Rec[][] = [];
    for (const rec of sorted) {
        const w = waves[waves.length - 1];
        if (!w || rec.t0 - w[0]!.t0 > 250) waves.push([rec]); else w.push(rec);
    }
    const bytes = mine.reduce((a, b) => a + b.length, 0);
    const lat = mine.map((x) => x.t1 - x.t0).sort((a, b) => a - b);
    console.log(`\n== ${layer} == status=${r.status} ${r.status === 'ok' ? r.features.length + ' feat / ' + r.tilesRead + ' tiles' : ''} wall=${Date.now() - t} ms`);
    console.log(`   ${mine.length} range request(s), ${(bytes / 1024).toFixed(0)} KiB, per-request latency min/med/max = ${lat[0]}/${lat[Math.floor(lat.length / 2)]}/${lat[lat.length - 1]} ms, failures=${mine.filter((x) => !x.ok).length}`);
    console.log(`   WAVES (${waves.length}): ` + waves.map((w, i) => `#${i + 1} n=${w.length} span=${((Math.max(...w.map((x) => x.t1)) - Math.min(...w.map((x) => x.t0)))).toFixed(0)}ms`).join('  '));
    // what ONE window would give: coalesce ALL the ranges this read asked for
    const all = mine.filter((x) => x.ok).map((x) => ({ offset: x.offset, length: x.length }));
    const oneWindow = coalesceRanges(all);
    const oneBytes = oneWindow.reduce((a, b) => a + b.length, 0);
    console.log(`   IF ALL RANGES WERE COALESCED IN ONE WINDOW: ${all.length} -> ${oneWindow.length} request(s), ${(bytes / 1024).toFixed(0)} -> ${(oneBytes / 1024).toFixed(0)} KiB`);
}
