// TEMP measurement probe (lane C9). Runs the SHIPPED reader against the LIVE R2 tileset.
// Mode A: layers strictly one at a time (isolates per-layer cost).
// Mode B: all layers at once, exactly as contextLayerWarm.ts fires them (reproduces contention).
import { readContextTileFeatures, __setContextTilesBaseUrl, clearContextTileArchives, type ContextTileLayer } from '../apps/editor/src/ui/geospatial/contextTiles';

__setContextTilesBaseUrl('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/');
const LAT = 41.3874, LON = 2.1686;
const GROUND = 0.01599892202659001, NEAR = 0.008, WIDE = 0.072, SEA = 0.10;
const PLAN: Array<[ContextTileLayer, number, number | undefined]> = [
    ['roads', GROUND, 225],
    ['water', NEAR, undefined],
    ['water', SEA, undefined],
    ['parks', GROUND, 225],
    ['landuse', WIDE, undefined],
    ['rail', GROUND, 225],
    ['trees', GROUND, 225],
    ['buildings', GROUND, 112],
];
const bbox = (h: number) => [LON - h, LAT - h, LON + h, LAT + h] as const;

interface Stat { n: number; bytes: number; ms: number }
const per = new Map<string, Stat>();
let current = 'boot';
const real = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
    const tag = current;
    const t = Date.now();
    const r = await real(input, init);
    const buf = await r.arrayBuffer();
    const s = per.get(tag) ?? { n: 0, bytes: 0, ms: 0 };
    s.n++; s.bytes += buf.byteLength; s.ms += Date.now() - t;
    per.set(tag, s);
    return new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
}) as any;

function label(l: string, h: number): string { return `${l}@${h.toFixed(3)}`; }

async function one(layer: ContextTileLayer, h: number, cap: number | undefined, tag: string) {
    current = tag;
    const t = Date.now();
    const r = await readContextTileFeatures(layer, bbox(h), undefined, cap === undefined ? {} : { fanOutCap: cap });
    const ms = Date.now() - t;
    const s = per.get(tag) ?? { n: 0, bytes: 0, ms: 0 };
    console.log(
        `${tag.padEnd(18)} ${r.status.padEnd(11)} ` +
        (r.status === 'ok' ? `${String(r.features.length).padStart(6)} feat / ${String(r.tilesRead).padStart(3)} tiles` : '(' + (r as any).reason?.slice(0, 40) + ')').padEnd(28) +
        ` | ${String(s.n).padStart(3)} fetch | ${(s.bytes / 1024).toFixed(0).padStart(7)} KiB | wall ${String(ms).padStart(6)} ms`,
    );
}

console.log('=== MODE A — one layer at a time, cold (no cross-layer contention) ===');
for (const [l, h, cap] of PLAN) { await one(l, h, cap, label(l, h)); }
let ta = 0, tb = 0;
for (const [, s] of per) { ta += s.n; tb += s.bytes; }
console.log(`MODE A TOTAL: ${ta} fetch(), ${(tb / 1024 / 1024).toFixed(2)} MiB\n`);

clearContextTileArchives();
__setContextTilesBaseUrl('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/');
per.clear();
console.log('=== MODE B — ALL layers fired at once, as contextLayerWarm.ts does ===');
const t0 = Date.now();
const results = await Promise.all(PLAN.map(async ([l, h, cap]) => {
    const t = Date.now();
    const r = await readContextTileFeatures(l, bbox(h), undefined, cap === undefined ? {} : { fanOutCap: cap });
    return [label(l, h), r, Date.now() - t] as const;
}));
for (const [tag, r, ms] of results) {
    console.log(`${tag.padEnd(18)} ${r.status.padEnd(11)} ` +
        (r.status === 'ok' ? `${String(r.features.length).padStart(6)} feat / ${String(r.tilesRead).padStart(3)} tiles` : '').padEnd(28) +
        ` | wall ${String(ms).padStart(6)} ms`);
}
console.log(`MODE B WALL (slowest layer): ${Date.now() - t0} ms`);
