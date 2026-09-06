// §USAS-SWATHE (2026-09-06, lane USA-HEIGHTS-NATIONAL) — the RECORD-CONSERVATION harness for the US
// national swathe driver. Deliberately the same shape as mdsSwatheConservation.harness.mjs.
//
// WHY IT IS A SPAWNED SCRIPT AND NOT A SPEC. heights/usasNationalStamp.mjs imports heightSources.mjs,
// which vite's transform rejects with a bare `SyntaxError: Invalid or unexpected token` — which is why
// every spec here reads that file as TEXT. Node loads it happily, so the one thing text-reading CANNOT
// check — that the multi-pass file plumbing loses, duplicates or mutates nothing — is checked by
// running it for real, here, and asserted by usasNational.spec.ts via execFileSync.
//
// NO NETWORK. `maxTiles: 0` stops the sweep before its first cell, so not one HTTP request is issued.
// That is exactly the interesting case: the maximally-truncated national run. Every footprint in the
// country must still come out the other side EXACTLY as it went in — original OSM tags, no fabricated
// height, none dropped, none duplicated — and the run must SAY it was truncated, with a cursor.
//
// ⭐ THE CASE THIS EXISTS FOR. The swathe driver truncates `outPath`, then appends each band's retained
// footprints, then concatenates the final leftover pass-through file. Three writers, two temp files and
// an alternating buffer: if any of them is wrong, footprints silently vanish or double. A bake would
// still "succeed", the tileset would still be large and well-formed, and buildings would be missing —
// §SIZE-IS-NOT-PROVENANCE, one layer down.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MEASURED_HEIGHT_SRC_TAG } from '../heightSources.mjs';
import { stampUsasNationalHeightsOnGeojsonseq } from '../heights/usasNationalStamp.mjs';
import { US_NATIONAL_BBOXES, USAS_SWATHE_ROWS } from '../heights/usOpenHeights.mjs';

/** A tiny square building at (lon,lat) carrying whatever OSM tags it was mapped with. */
function bldg(id, lon, lat, props) {
  const d = 0.0002;
  return {
    type: 'Feature',
    properties: { id, building: 'yes', ...props },
    geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] },
  };
}

// Spread across the CONUS box and across MANY swathe bands on purpose — including the two CI gate
// suburbs, one city that has its OWN channel (Manhattan), one that has none (Chicago), the far corners,
// and the one place inside a wired state where the source measures NOTHING (Rochester NY).
const FEATURES = [
  bldg('manhattan', -73.9855, 40.7580, { height: '381' }),        // a CITY channel, not the national one
  bldg('oakpark', -87.7840, 41.8850, {}),                          // CI gate row — no tag at all
  bldg('pasadenatx', -95.2090, 29.6910, {}),                       // CI gate row
  bldg('rochester', -77.6109, 43.1566, { 'building:levels': '4' }), // measured ZERO at the source
  bldg('chicagoloop', -87.6300, 41.8800, {}),                      // no city channel exists
  bldg('seattle', -122.3321, 47.6062, { height: '184' }),
  bldg('keywest', -81.7800, 24.5551, {}),                          // far south, near the CONUS s edge
  bldg('caribou', -68.0117, 46.8606, { 'building:levels': '2' }),   // far north-east
];

const dir = mkdtempSync(join(tmpdir(), 'pryzm-usas-swathe-'));
const inPath = join(dir, 'in.geojsonseq');
const results = {};
try {
  writeFileSync(inPath, FEATURES.map((f) => JSON.stringify(f)).join('\n') + '\n');
  const before = readFileSync(inPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const CONUS = US_NATIONAL_BBOXES[0].bbox;

  for (const [mode, swatheRows] of [['national', USAS_SWATHE_ROWS], ['single-pass', 0]]) {
    const outPath = join(dir, `out-${mode}.geojsonseq`);
    const res = await stampUsasNationalHeightsOnGeojsonseq(inPath, outPath, CONUS, {
      retainBboxes: US_NATIONAL_BBOXES.map((b) => b.bbox),
      swatheRows,
      maxTiles: 0,      // ⇒ the sweep stops before its first cell: ZERO network requests.
      concurrency: 4,
    });
    const after = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const byId = new Map(after.map((f) => [f.properties.id, f]));
    results[mode] = {
      status: res.status,
      stopReason: res.sweep?.stopReason ?? null,
      inCount: before.length,
      outCount: after.length,
      uniqueIds: byId.size,
      // §CONTEXT-DATA-HONESTY — an unsampled footprint keeps its ORIGINAL tags, verbatim.
      tagsPreserved: before.every((f) => JSON.stringify(byId.get(f.properties.id)?.properties) === JSON.stringify(f.properties)),
      fabricated: after.filter((f) => f.properties[MEASURED_HEIGHT_SRC_TAG] !== undefined).length,
      // …and is COUNTED, not merely absent from the measured tally.
      measuredCount: res.measuredCount,
      estimatedCount: res.estimatedCount,
      retainedFootprints: res.retainedFootprints,
      requests: res.requests,
      swathesTotal: res.swathesTotal,
      swathesScanned: res.swathesScanned,
      cellsStamped: res.sweep?.cellsStamped ?? null,
      cellsSkipped: res.sweep?.cellsSkipped ?? null,
      km2Skipped: Math.round(res.sweep?.km2Skipped ?? 0),
      nextCursor: res.sweep?.nextCursor ?? null,
      truncationNoted: /TRUNCATED/.test(res.note ?? ''),
      resumeNoted: /USAS_SWEEP_CURSOR=/.test(res.note ?? ''),
    };
  }
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// The spec parses these two fenced blocks, so the shape is the contract.
console.log('```json');
console.log(JSON.stringify(results.national, null, 2));
console.log('```');
console.log('```json');
console.log(JSON.stringify(results['single-pass'], null, 2));
console.log('```');
