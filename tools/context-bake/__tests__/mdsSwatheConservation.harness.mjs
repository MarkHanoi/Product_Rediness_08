// §MDS-NATIONAL-SWEEP (L-12946) — the RECORD-CONSERVATION harness for the swathe driver.
//
// WHY IT IS A SPAWNED SCRIPT AND NOT A SPEC. `heightSources.mjs` cannot be imported by vitest —
// vite's transform rejects it with a bare `SyntaxError: Invalid or unexpected token`, which is why
// every other spec here reads it as TEXT (mdsBboxCoversTerrainRegion.spec.ts records the
// verification). Node loads it happily, so the one thing text-reading CANNOT check — that the
// multi-pass file plumbing loses, duplicates or mutates nothing — is checked by running it for
// real, here, and asserted by mdsNational.spec.ts via execFileSync.
//
// NO NETWORK. `maxTiles: 0` stops the sweep before its first cell and `priorityBboxes: []` removes
// the uncapped phase, so not one WCS request is issued. That is exactly the interesting case: it is
// the maximally-truncated national run, and every footprint in the country must still come out the
// other side EXACTLY as it went in — original OSM tags, no fabricated height, none dropped, none
// duplicated. A run that silently ate footprints outside its budget would be a far worse defect
// than the one this lane fixes.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stampMdsHeightsOnGeojsonseq, MDS_NATIONAL_BBOX, MDS_NATIONAL_BBOXES, MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_SWATHE_ROWS, MEASURED_HEIGHT_SRC_TAG } from '../heightSources.mjs';

/** A tiny square building at (lon,lat) carrying whatever OSM tags it was mapped with. */
function bldg(id, lon, lat, props) {
  const d = 0.0002;
  return {
    type: 'Feature',
    properties: { id, building: 'yes', ...props },
    geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] },
  };
}

// Spread across the WHOLE country and across MANY swathes on purpose: two of the nine priority
// metros, the two founder-named gate cities, the far north (A Coruña / Bilbao latitudes), the far
// south (Algeciras), the far east (Menorca) and the far west (Galicia). Under the OLD nine-bbox
// working set, six of these eight could never have been stamped at all.
const FEATURES = [
  bldg('barcelona', 2.1620, 41.3900, { height: '31' }),
  bldg('madrid', -3.7038, 40.4168, { 'building:levels': '8' }),
  bldg('ciudadreal', -3.9271, 38.9861, {}),                       // founder's city — NO tag at all
  bldg('toledo', -4.0273, 39.8628, { 'building:levels': '3' }),
  bldg('acoruna', -8.4115, 43.3623, {}),
  bldg('algeciras', -5.4526, 36.1408, { height: '12.5' }),
  bldg('mahon', 4.2646, 39.8885, {}),
  bldg('vigo', -8.7207, 42.2406, { 'building:levels': '5' }),
];

const dir = mkdtempSync(join(tmpdir(), 'pryzm-mds-swathe-'));
const inPath = join(dir, 'in.geojsonseq');
const results = {};
try {
  writeFileSync(inPath, FEATURES.map((f) => JSON.stringify(f)).join('\n') + '\n');
  const before = readFileSync(inPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  for (const [mode, swatheRows] of [['national', MDS_SWATHE_ROWS], ['single-pass', 0]]) {
    const outPath = join(dir, `out-${mode}.geojsonseq`);
    const res = await stampMdsHeightsOnGeojsonseq(inPath, outPath, MDS_NATIONAL_BBOX, {
      retainBboxes: MDS_NATIONAL_BBOXES,
      priorityBboxes: [],
      tileSpanLonDeg: MDS_TILE_LON_DEG, tileSpanLatDeg: MDS_TILE_LAT_DEG,
      swatheRows,
      maxTiles: 0,      // ⇒ the sweep stops before its first cell: ZERO network requests.
      concurrency: 4,
    });
    const after = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const byId = new Map(after.map((f) => [f.properties.id, f]));
    results[mode] = {
      status: res.status,
      stopReason: res.nationalSweep?.stopReason ?? null,
      inCount: before.length,
      outCount: after.length,
      uniqueIds: byId.size,
      // §CONTEXT-DATA-HONESTY — an unsampled footprint keeps its ORIGINAL tags, verbatim.
      tagsPreserved: before.every((f) => JSON.stringify(byId.get(f.properties.id)?.properties) === JSON.stringify(f.properties)),
      fabricated: after.filter((f) => f.properties[MEASURED_HEIGHT_SRC_TAG] !== undefined).length,
      // …and is COUNTED, not merely absent from the measured tally.
      measuredCount: res.measuredCount,
      retainedFootprints: res.retainedFootprints,
      cellsStamped: res.nationalSweep?.cellsStamped ?? null,
      cellsSkipped: res.nationalSweep?.cellsSkipped ?? null,
      km2Skipped: Math.round(res.nationalSweep?.km2Skipped ?? 0),
      nextCursor: res.nationalSweep?.nextCursor ?? null,
      note: res.note,
    };
  }
  // The join logs its progress to stdout (that loudness is the point — see §LOUD-AND-ORDERED-
  // TRUNCATION), so the machine-readable half is fenced by a marker the spec slices on rather than
  // assuming stdout is pure JSON.
  process.stdout.write(`\n===MDS-HARNESS-JSON===\n${JSON.stringify(results, null, 2)}`);
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
