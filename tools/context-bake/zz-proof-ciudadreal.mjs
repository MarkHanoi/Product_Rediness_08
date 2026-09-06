// LANE ES-WHOLE-COUNTRY-HEIGHTS — LIVE end-to-end proof at the founder's city (and Toledo).
// Real footprints from the Catastro INSPIRE WFS (already wired: fetchSpainBuildingHeights), stripped
// back to bare OSM-shaped features, then run through the REAL national join against the REAL
// mdsn_e025 raster. No fixtures, no fakes, no synthetic geometry.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stampMdsHeightsOnGeojsonseq, fetchSpainBuildingHeights,
  MDS_NATIONAL_BBOX, MDS_NATIONAL_BBOXES, MDS_PRIORITY_EXTRA,
  MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_SWATHE_ROWS, MEASURED_HEIGHT_SRC_TAG,
} from './heightSources.mjs';

const CITY = process.argv[2] ?? 'ciudadreal';
const row = MDS_PRIORITY_EXTRA.find((c) => c.city === CITY);
if (!row) { console.error(`no MDS_PRIORITY_EXTRA row for ${CITY}`); process.exit(2); }
const CORE = CITY === 'ciudadreal' ? [-3.935, 38.980, -3.918, 38.993] : [-4.035, 39.855, -4.018, 39.868];

// 1) REAL footprints for the city core (Catastro INSPIRE WFS — the same fetcher the repo ships).
const t0 = Date.now();
const cat = await fetchSpainBuildingHeights(CORE, { maxTiles: 2, buildingCap: 1500 });
console.log(`catastro+mds reference fetch: status=${cat.status} footprints=${cat.footprintCount ?? 0} measured=${cat.measuredCount ?? 0} t=${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  reference note: ${cat.note ?? cat.reason}`);
if (cat.status !== 'ok' || !cat.features?.length) process.exit(3);

// 2) Strip every height/provenance tag → an "OSM clip" that carries NOTHING but the polygon, i.e.
//    exactly the 9 m-assumed state the founder is looking at in Ciudad Real today.
const feats = cat.features.map((f, i) => ({
  type: 'Feature',
  properties: { id: `fp${i}`, building: 'yes' },
  geometry: f.geometry,
}));
console.log(`stripped to ${feats.length} bare footprints (0 height tags, 0 levels — all would render an assumed 9 m)`);

const dir = mkdtempSync(join(tmpdir(), 'pryzm-mds-proof-'));
const inPath = join(dir, 'in.geojsonseq');
const outPath = join(dir, 'out.geojsonseq');
writeFileSync(inPath, feats.map((f) => JSON.stringify(f)).join('\n') + '\n');

// 3) The REAL national join. National sweep OFF (maxTiles 0) so this proves the PRIORITY guarantee
//    alone — the thing the new CI gate rows depend on.
const t1 = Date.now();
const res = await stampMdsHeightsOnGeojsonseq(inPath, outPath, MDS_NATIONAL_BBOX, {
  retainBboxes: MDS_NATIONAL_BBOXES,
  priorityBboxes: [row.bbox],
  tileSpanLonDeg: MDS_TILE_LON_DEG, tileSpanLatDeg: MDS_TILE_LAT_DEG,
  swatheRows: MDS_SWATHE_ROWS,
  maxTiles: 0,
  concurrency: 4,
});
const secs = (Date.now() - t1) / 1000;
console.log(`\njoin wall-clock: ${secs.toFixed(1)} s for ${res.tilesProcessed} national tile(s) ⇒ ${(secs / Math.max(1, res.tilesProcessed)).toFixed(1)} s/tile`);
console.log(JSON.stringify({
  status: res.status, measuredCount: res.measuredCount, footprintCount: res.footprintCount,
  coverage: res.coverage, heightStats: res.heightStats, tilesProcessed: res.tilesProcessed,
  priorityTiles: res.priorityTiles, tileErrors: res.tileErrors, peakHeapUsedMB: res.peakHeapUsedMB,
}, null, 2));

const after = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const measured = after.filter((f) => f.properties[MEASURED_HEIGHT_SRC_TAG] === 'measured-lidar');
console.log(`\nAFTER — ${measured.length}/${after.length} footprints carry pryzm:height_src=measured-lidar`);
console.log('  sample heights:', measured.slice(0, 12).map((f) => `${f.properties.height}m`).join(' '));
const unmeasured = after.filter((f) => f.properties[MEASURED_HEIGHT_SRC_TAG] === undefined);
console.log(`  unmeasured kept their ORIGINAL tags: ${unmeasured.length} (any fabricated height? ${unmeasured.filter((f) => f.properties.height !== undefined).length})`);
rmSync(dir, { recursive: true, force: true });
