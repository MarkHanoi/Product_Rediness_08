// LANE HEIGHTS-WHOLE-COUNTRY-B — LIVE end-to-end proof that a national height join reaches ground the
// CITY working set never could. No fixtures, no fakes, no synthetic geometry.
//
// THE METHOD, and why it is the honest one:
//   1. REAL footprints for a town that is NOT in the join's old city list come from the OSM Overpass
//      API — the SAME upstream bake clips from (bake.mjs downloads a Geofabrik .osm.pbf of the same
//      OSM data), so these are the very features a bake would hand the join, not a stand-in.
//   2. Every tag is stripped to `{ building: 'yes' }` — i.e. exactly the "assumed 9 m" state a user
//      sees on the map today outside the city boxes.
//   3. The REAL national join runs against the REAL live source, with `retainBboxes` = the NATIONAL
//      set, so nothing but the national wiring can produce a measured height.
//   4. It reports how many footprints came back carrying `pryzm:height_src` (or a `height` for the
//      register-sourced joins that are honestly `tagged`, e.g. SI GURS), and re-reads the output file
//      to prove every input record left exactly once.
//
// usage: node tools/context-bake/zz-proof-national-heights.mjs <country> <lon> <lat> [spanDeg]
//   e.g. node tools/context-bake/zz-proof-national-heights.mjs ee 25.594 58.363   (Viljandi)
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MEASURED_HEIGHT_SRC_TAG } from './heightSources.mjs';

const COUNTRY = (process.argv[2] ?? 'ee').toLowerCase();
const LON = Number(process.argv[3]);
const LAT = Number(process.argv[4]);
const SPAN = Number(process.argv[5] ?? 0.012);
if (!Number.isFinite(LON) || !Number.isFinite(LAT)) {
  console.error('usage: node zz-proof-national-heights.mjs <country> <lon> <lat> [spanDeg]');
  process.exit(2);
}
const BOX = [LON - SPAN / 2, LAT - SPAN / 2, LON + SPAN / 2, LAT + SPAN / 2];

// ── 1. REAL OSM footprints (Overpass) ────────────────────────────────────────────────────────────
const overpass = 'https://overpass-api.de/api/interpreter';
const q = `[out:json][timeout:90];way["building"](${BOX[1]},${BOX[0]},${BOX[3]},${BOX[2]});out geom;`;
const t0 = Date.now();
const rr = await fetch(overpass, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'PRYZM-context-bake proof (github.com/pryzm; contact via repo)' } });
const body = await rr.text();
console.log(`overpass: HTTP ${rr.status} ${rr.headers.get('content-type')} ${body.length} B ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (!rr.ok) process.exit(3);
const els = JSON.parse(body).elements ?? [];
const feats = els
  .filter((e) => Array.isArray(e.geometry) && e.geometry.length >= 4)
  .map((e, i) => ({
    type: 'Feature',
    properties: { id: `osm${e.id ?? i}`, building: 'yes' },   // stripped: no height, no levels → assumed 9 m
    geometry: { type: 'Polygon', coordinates: [e.geometry.map((p) => [p.lon, p.lat])] },
  }));
console.log(`stripped to ${feats.length} bare OSM footprints at [${BOX.map((v) => v.toFixed(4)).join(',')}]`);
if (!feats.length) { console.error('no OSM buildings in that box — pick another town'); process.exit(4); }

const dir = mkdtempSync(join(tmpdir(), 'pryzm-natl-'));
const inPath = join(dir, 'in.geojsonseq');
const outPath = join(dir, 'out.geojsonseq');
writeFileSync(inPath, feats.map((f) => JSON.stringify(f)).join('\n') + '\n');

// ── 2. The REAL national join ────────────────────────────────────────────────────────────────────
const JOINS = {
  ee: async () => {
    const { stampEeEtakHeightsOnGeojsonseq } = await import('./heights/eeHeightsStamp.mjs');
    const { EE_NATIONAL_BBOX, EE_NATIONAL_BBOXES } = await import('./heights/eeHeights.mjs');
    return stampEeEtakHeightsOnGeojsonseq(inPath, outPath, EE_NATIONAL_BBOX, {
      retainBboxes: EE_NATIONAL_BBOXES, swatheRows: 0, env: {},
    });
  },
  si: async () => {
    const { stampSiHeightsOnGeojsonseq } = await import('./heights/siHeightsStamp.mjs');
    const { SI_NATIONAL_BBOX, SI_NATIONAL_BBOXES } = await import('./heights/siHeights.mjs');
    return stampSiHeightsOnGeojsonseq(inPath, outPath, SI_NATIONAL_BBOX, {
      retainBboxes: SI_NATIONAL_BBOXES, swatheRows: 0, env: {},
    });
  },
  no: async () => {
    const { stampNoNdhHeightsOnGeojsonseq } = await import('./heights/noHeightsStamp.mjs');
    const { NO_NATIONAL_BBOX, NO_NATIONAL_BBOXES } = await import('./heights/noHeights.mjs');
    return stampNoNdhHeightsOnGeojsonseq(inPath, outPath, NO_NATIONAL_BBOX, {
      retainBboxes: NO_NATIONAL_BBOXES, swatheRows: 0, env: {},
    });
  },
};
const run = JOINS[COUNTRY];
if (!run) { console.error(`no national join wired here for "${COUNTRY}" (have: ${Object.keys(JOINS).join(', ')})`); process.exit(5); }

const t1 = Date.now();
const res = await run();
console.log(`\njoin wall-clock ${((Date.now() - t1) / 1000).toFixed(1)} s`);
console.log(JSON.stringify({
  status: res.status, reason: res.reason, footprintCount: res.footprintCount, measuredCount: res.measuredCount,
  coverage: res.coverage, heightStats: res.heightStats, tilesProcessed: res.tilesProcessed,
  tileErrors: res.tileErrors, voidTiles: res.voidTiles, requests: res.requests, splits: res.splits,
  populatedCells: res.populatedCells, sweep: res.sweep, errorSamples: res.errorSamples,
}, null, 2));
console.log(`\nnote: ${res.note ?? res.reason}`);

// ── 3. Every input record left exactly once, and the marker is real ──────────────────────────────
if (res.status === 'ok') {
  const after = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const marked = after.filter((f) => f.properties?.[MEASURED_HEIGHT_SRC_TAG]).length;
  const withHeight = after.filter((f) => Number.isFinite(f.properties?.height)).length;
  console.log(`\nrecords ${feats.length} -> ${after.length} (must be equal) · ${withHeight} carry a height · ${marked} carry ${MEASURED_HEIGHT_SRC_TAG}`);
  const sample = after.find((f) => Number.isFinite(f.properties?.height));
  if (sample) console.log(`sample stamped feature: ${JSON.stringify(sample.properties)}`);
}
rmSync(dir, { recursive: true, force: true });
