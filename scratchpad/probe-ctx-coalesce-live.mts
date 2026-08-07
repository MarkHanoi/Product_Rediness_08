// §CTX-RANGE-COALESCE — END-TO-END against the LIVE R2 tileset, through the REAL reader module.
// Counts actual fetch() calls and wall-clock per layer, so the claim is measured on the shipped
// code path and not on a re-implementation of it.
import { readContextTileFeatures, __setContextTilesBaseUrl } from '../apps/editor/src/ui/geospatial/contextTiles';

__setContextTilesBaseUrl('https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/');

const LAT = 41.3874, LON = 2.1686;
const HALF: Record<string, number> = { buildings: 0.011, roads: 0.008, parks: 0.008, landuse: 0.072, water: 0.10 };

let fetches = 0, wire = 0;
const real = globalThis.fetch;
globalThis.fetch = (async (...a: Parameters<typeof real>) => {
    fetches++;
    const r = await real(...a);
    const cl = Number(r.headers.get('content-length') ?? 0);
    wire += cl;
    return r;
}) as typeof real;

const bbox = (h: number) => [LON - h, LAT - h, LON + h, LAT + h] as const;

console.log('=== §CTX-RANGE-COALESCE live, one COLD 3D-Site open ===');
const t0 = Date.now();
const rows: string[] = [];
for (const layer of Object.keys(HALF)) {
    const f0 = fetches, t = Date.now();
    const r = await readContextTileFeatures(layer as never, bbox(HALF[layer]!));
    rows.push(
        `${layer.padEnd(10)} ${r.status.padEnd(11)} ` +
        `${r.status === 'ok' ? `${String(r.features.length).padStart(5)} feat / ${String(r.tilesRead).padStart(2)} tiles` : ''.padStart(20)} ` +
        `| ${String(fetches - f0).padStart(3)} fetch | ${String(Date.now() - t).padStart(5)} ms`,
    );
}
for (const r of rows) console.log(r);
console.log(`\nTOTAL ${fetches} fetch() calls, ${(wire / 1024).toFixed(0)} KiB, ${Date.now() - t0} ms`);
console.log(`BEFORE this change the same read issued 124 fetch() calls (measured, probe-ctx-coalesce.mjs).`);
console.log(`At the MEASURED 197 ms serialised per-request latency: 124 → ${(124 * 0.197).toFixed(1)} s ; ${fetches} → ${(fetches * 0.197).toFixed(1)} s`);
