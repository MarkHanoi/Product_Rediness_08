// Proves the NATIONAL SWEEP phase (not the priority phase) really fetches + stamps: priorityBboxes
// is EMPTY, so every measured height below came through the ordered, batched, budgeted sweep.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stampMdsHeightsOnGeojsonseq, fetchSpainBuildingHeights, MDS_NATIONAL_BBOX, MDS_NATIONAL_BBOXES, MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_SWATHE_ROWS, MEASURED_HEIGHT_SRC_TAG } from './heightSources.mjs';
const cat = await fetchSpainBuildingHeights([-3.935, 38.980, -3.918, 38.993], { maxTiles: 1, buildingCap: 400 });
console.log('footprints:', cat.footprintCount, 'status', cat.status);
const feats = cat.features.slice(0, 400).map((f, i) => ({ type: 'Feature', properties: { id: `f${i}`, building: 'yes' }, geometry: f.geometry }));
const dir = mkdtempSync(join(tmpdir(), 'pryzm-sweep-'));
const inP = join(dir, 'in.geojsonseq'), outP = join(dir, 'out.geojsonseq');
writeFileSync(inP, feats.map((f) => JSON.stringify(f)).join('\n') + '\n');
const t = Date.now();
const res = await stampMdsHeightsOnGeojsonseq(inP, outP, MDS_NATIONAL_BBOX, {
  retainBboxes: MDS_NATIONAL_BBOXES, priorityBboxes: [],   // ← sweep only
  tileSpanLonDeg: MDS_TILE_LON_DEG, tileSpanLatDeg: MDS_TILE_LAT_DEG,
  swatheRows: MDS_SWATHE_ROWS, maxTiles: 20000, budgetMs: 10 * 60_000, concurrency: 4,
});
console.log(`sweep wall-clock ${((Date.now() - t) / 1000).toFixed(1)}s`);
console.log(JSON.stringify({ status: res.status, measuredCount: res.measuredCount, footprintCount: res.footprintCount, tilesProcessed: res.tilesProcessed, priorityTiles: res.priorityTiles, sweep: res.nationalSweep }, null, 2));
const after = readFileSync(outP, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
console.log(`records ${feats.length} -> ${after.length}; measured markers ${after.filter((f) => f.properties[MEASURED_HEIGHT_SRC_TAG]).length}`);
rmSync(dir, { recursive: true, force: true });
