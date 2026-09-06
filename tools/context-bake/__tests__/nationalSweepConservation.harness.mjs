// §NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the RECORD-CONSERVATION harness for the
// SHARED swathe runner (heights/nationalSweepRunner.mjs).
//
// WHY IT IS A SPAWNED SCRIPT AND NOT A SPEC. The stamps import `../heightSources.mjs`, which vitest
// cannot transform (`SyntaxError: Invalid or unexpected token` — mdsBboxCoversTerrainRegion.spec.ts
// records the verification). Node loads it happily, so the one thing a text-reading spec CANNOT check
// — that the multi-pass FILE PLUMBING loses, duplicates or mutates nothing — is checked by running it
// for real, here, and asserted by nationalSweep.spec.ts via execFileSync. Same device as
// mdsSwatheConservation.harness.mjs, one level up: that one proves Spain's own driver, this one proves
// the shared driver that NL / CZ / AT / FR now run through.
//
// NO NETWORK, AND THAT IS THE INTERESTING CASE. `maxTiles: 0` stops the sweep before its first cell and
// `priorityBboxes: []` removes the uncapped phase, so not one WFS request is issued. This is the
// MAXIMALLY-TRUNCATED national run, and every footprint in the country must still come out the other
// side EXACTLY as it went in — original OSM tags, no fabricated height, none dropped, none duplicated.
// A run that silently ate the footprints outside its budget would be a far worse defect than the one
// this lane fixes, because it would look like a bake that simply had fewer buildings.
//
// WHY THE **NL** STAMP DRIVES IT: it is the one of the four that needs no `geotiff` (3DBAG is vectors),
// so this harness runs on a plain checkout. CZ / AT / FR return `documented` before touching a file
// when the dep is absent, which would prove nothing. The RUNNER is shared and identical for all four.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stampNl3dbagNationalHeightsOnGeojsonseq, NL_SWATHE_ROWS } from '../heights/nl3dbagStamp.mjs';
import { NL_3DBAG_NATIONAL_BBOX, NL_3DBAG_NATIONAL_BBOXES } from '../heights/nationalSweep.mjs';
import { MEASURED_HEIGHT_SRC_TAG } from '../heightSources.mjs';

/** A tiny square building at (lon,lat) carrying whatever OSM tags it was mapped with. */
function bldg(id, lon, lat, props) {
  const d = 0.0002;
  return {
    type: 'Feature',
    properties: { id, building: 'yes', ...props },
    geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] },
  };
}

// Spread across the WHOLE country and across MANY swathes on purpose: two of the six priority cities,
// then five towns that under the OLD six-bbox working set could NEVER have been stamped by any number
// of re-bakes — Maastricht (the far south-east), Leeuwarden (the far north), Enschede (the far east),
// Middelburg (the far south-west) and Den Bosch. Each of the five was LIVE-PROBED on 2026-09-06 and
// 3DBAG answered with thousands of parts for all of them.
const FEATURES = [
  bldg('amsterdam', 4.8900, 52.3700, { height: '18' }),
  bldg('rotterdam', 4.4800, 51.9200, { 'building:levels': '9' }),
  bldg('maastricht', 5.6900, 50.8500, {}),                        // NO tag at all — the honest `assumed` case
  bldg('leeuwarden', 5.8000, 53.2000, { 'building:levels': '3' }),
  bldg('enschede', 6.9000, 52.2200, {}),
  bldg('middelburg', 3.6100, 51.5000, { height: '11.5' }),
  bldg('denbosch', 5.3600, 51.6900, {}),
  bldg('groningen', 6.5600, 53.2200, { 'building:levels': '5' }),
];

const dir = mkdtempSync(join(tmpdir(), 'pryzm-national-swathe-'));
const inPath = join(dir, 'in.geojsonseq');
const results = {};
try {
  writeFileSync(inPath, FEATURES.map((f) => JSON.stringify(f)).join('\n') + '\n');
  const before = readFileSync(inPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  for (const [mode, swatheRows] of [['national', NL_SWATHE_ROWS], ['single-pass', 0]]) {
    const outPath = join(dir, `out-${mode}.geojsonseq`);
    const res = await stampNl3dbagNationalHeightsOnGeojsonseq(inPath, outPath, NL_3DBAG_NATIONAL_BBOX, {
      retainBboxes: NL_3DBAG_NATIONAL_BBOXES,
      priorityBboxes: [],
      swatheRows,
      maxTiles: 0,      // ⇒ the sweep stops before its first cell: ZERO network requests.
      sweepBudgetMs: 0,
    });
    const after = readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const byId = new Map(after.map((f) => [f.properties.id, f]));
    results[mode] = {
      status: res.status,
      // CONSERVATION — the whole point.
      inCount: before.length,
      outCount: after.length,
      distinctIds: byId.size,
      // NOTHING FABRICATED — with the sweep truncated to zero cells nothing may carry the measured
      // marker, and every property bag must be byte-identical to the input's.
      markerCount: after.filter((f) => f.properties[MEASURED_HEIGHT_SRC_TAG]).length,
      unchanged: before.every((b) => JSON.stringify(byId.get(b.properties.id)?.properties) === JSON.stringify(b.properties)),
      // The sweep's own honesty report.
      stopReason: res.sweep?.stopReason ?? null,
      swathesTotal: res.sweep?.swathesTotal ?? null,
      cellsSkipped: res.sweep?.cellsSkipped ?? null,
      km2SkippedPositive: (res.sweep?.km2Skipped ?? 0) > 0,
      nextCursor: res.sweep?.nextCursor ?? null,
      measuredCount: res.measuredCount ?? null,
      retainedFootprints: res.retainedFootprints ?? null,
      noteMentionsResume: /RESUME with NL_SWEEP_CURSOR=/.test(res.note ?? ''),
      noteMentionsTruncated: /TRUNCATED/.test(res.note ?? ''),
    };
  }
  process.stdout.write(JSON.stringify(results, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
